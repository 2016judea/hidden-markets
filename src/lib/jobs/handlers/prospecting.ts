import { prisma, j, parseJson } from "../../db";
import * as ai from "../../ai/functions";
import { toBrief, type PersonalizationFact } from "../../ai/prompts/shared";
import { computeQualificationScore } from "../../ai/prompts/qualifyProspect";
import { candidateDedupeKey, normalizeDomain, normalizeOrgName } from "../../domain/dedupe";
import { assertCandidateTransition } from "../../domain/stateMachine";
import { logActivity } from "../../domain/activity";
import { featuresOf } from "../../domain/targeting";
import { getTargetingGuidance, getObservedPatterns } from "../../domain/targeting";
import { isSuppressed } from "../../domain/suppression";
import { THRESHOLDS, STAGE_TARGETS, type ExperimentStage } from "../../domain/constants";
import { enqueue } from "../queue";
import { env } from "../../env";

/**
 * How many organizations one discovery call may look for.
 *
 * Small on purpose. A call returns nothing until it is completely finished, so
 * batch size is latency to the FIRST reviewable draft, not just throughput:
 * asking for 25 ran 6.5 minutes with an empty Outbox the whole time, while a
 * 3-result call settled in 124 seconds. Eight keeps a call near two minutes and
 * lets research, qualification and drafting start on batch one while batch two
 * is still searching. maintainPipeline re-runs after each batch, so the target
 * is still reached — it just arrives in pieces the operator can work through.
 */
const DISCOVERY_BATCH = 8;

/**
 * Ask the scheduler to re-evaluate. Handlers call this when they have changed
 * something, rather than enqueuing whatever they think comes next — the shape
 * of the pipeline stays in maintainPipeline, and a stage change is picked up
 * immediately instead of waiting for the worker's next sweep.
 */
async function nudge(experimentId: string): Promise<void> {
  await enqueue({ kind: "MAINTAIN_PIPELINE", payload: { experimentId }, experimentId });
}

/**
 * The scheduler. Every "what should happen next" decision in the prospecting
 * half of the system is made here, in ordinary TypeScript, by counting rows.
 * Nothing downstream enqueues its own successor except through this function,
 * so the pipeline's shape is readable in one place.
 */
export async function maintainPipeline(payload: Record<string, unknown>): Promise<unknown> {
  const experimentId = String(payload.experimentId);
  const exp = await prisma.marketExperiment.findUnique({ where: { id: experimentId } });
  if (!exp || exp.status !== "ACTIVE") return { skipped: `status=${exp?.status ?? "missing"}` };

  // 1. Move anything already in the pipeline to its next stage.
  const [discovered, researched, qualified, undrafted] = await Promise.all([
    prisma.prospectCandidate.findMany({
      where: { experimentId, status: "DISCOVERED" },
      select: { id: true },
      take: 25,
    }),
    prisma.prospectCandidate.findMany({
      where: { experimentId, status: "RESEARCHED" },
      select: { id: true },
      take: 25,
    }),
    prisma.prospectCandidate.findMany({
      where: { experimentId, status: "QUALIFIED" },
      select: { id: true },
      take: 25,
    }),
    prisma.prospect.findMany({
      where: { experimentId, status: "READY", outbox: { none: {} } },
      select: { id: true },
      take: 25,
    }),
  ]);

  for (const c of discovered) {
    await enqueue({
      kind: "RESEARCH_CANDIDATE",
      payload: { candidateId: c.id },
      experimentId,
      idempotencyKey: `research:${c.id}`,
    });
  }
  for (const c of researched) {
    await enqueue({
      kind: "QUALIFY_CANDIDATE",
      payload: { candidateId: c.id },
      experimentId,
      idempotencyKey: `qualify:${c.id}`,
    });
  }
  for (const c of qualified) {
    await promoteCandidate(c.id);
  }
  for (const p of undrafted) {
    await enqueue({
      kind: "DRAFT_OUTREACH",
      payload: { prospectId: p.id, kind: "INITIAL", sequenceIndex: 0 },
      experimentId,
      idempotencyKey: `draft:${p.id}:0`,
    });
  }

  // 2. Decide whether to go and find more people.
  //
  // The stage cap is the brake that stops a running experiment from quietly
  // becoming a bigger one. Contacts already spent count against it, so an
  // experiment cannot exceed its stage's contact budget by topping up.
  const stageCap = STAGE_TARGETS[exp.stage as ExperimentStage] ?? exp.contactedTarget;
  const [contacted, inFlight] = await Promise.all([
    prisma.prospect.count({ where: { experimentId, firstContactedAt: { not: null } } }),
    prisma.prospectCandidate.count({
      where: { experimentId, status: { in: ["DISCOVERED", "RESEARCHING", "RESEARCHED", "QUALIFYING", "QUALIFIED"] } },
    }),
  ]);
  const uncontacted = await prisma.prospect.count({
    where: { experimentId, firstContactedAt: null },
  });

  const available = inFlight + uncontacted;
  const roomInStage = Math.max(0, stageCap - contacted - available);
  const deficit = Math.min(Math.max(0, exp.prospectTarget - available), roomInStage);

  if (deficit > 0) {
    await enqueue({
      kind: "DISCOVER_CANDIDATES",
      payload: { experimentId, count: Math.min(deficit, DISCOVERY_BATCH) },
      experimentId,
      // Discovery is expensive and slow; one outstanding run per experiment.
      idempotencyKey: `discover:${experimentId}`,
    });
  }

  return { contacted, available, deficit, stageCap, promoted: qualified.length };
}

export async function discoverCandidates(payload: Record<string, unknown>): Promise<unknown> {
  const experimentId = String(payload.experimentId);
  const count = Math.min(Number(payload.count ?? DISCOVERY_BATCH), DISCOVERY_BATCH);
  const exp = await prisma.marketExperiment.findUniqueOrThrow({ where: { id: experimentId } });

  const known = await prisma.prospectCandidate.findMany({
    where: { experimentId },
    select: { organizationName: true },
    take: 400,
  });
  const guidance = await getTargetingGuidance(experimentId);

  const { output, runId } = await ai.discoverOrganizations(
    {
      brief: toBrief(exp),
      count,
      knownOrganizations: known.map((k) => k.organizationName),
      targetingGuidance: guidance,
    },
    { experimentId },
  );

  const existingKeys = new Set(known.map((k) => normalizeOrgName(k.organizationName)));
  let created = 0;
  let skipped = 0;

  for (const org of output.organizations) {
    const norm = normalizeOrgName(org.name);
    if (existingKeys.has(norm)) {
      skipped++;
      continue;
    }
    existingKeys.add(norm);

    const domain = normalizeDomain(org.website);
    const organization = domain
      ? await prisma.organization.upsert({
          where: { domain },
          create: {
            name: org.name,
            domain,
            website: org.website,
            orgType: org.organizationType,
            city: org.city,
            state: org.state,
          },
          update: {},
        })
      : await prisma.organization.create({
          data: {
            name: org.name,
            website: org.website,
            orgType: org.organizationType,
            city: org.city,
            state: org.state,
          },
        });

    if (organization.suppressed) {
      skipped++;
      continue;
    }

    const dedupeKey = candidateDedupeKey({ organizationName: org.name });
    const existing = await prisma.prospectCandidate.findUnique({
      where: { experimentId_dedupeKey: { experimentId, dedupeKey } },
    });
    if (existing) {
      skipped++;
      continue;
    }

    await prisma.prospectCandidate.create({
      data: {
        experimentId,
        organizationId: organization.id,
        organizationName: org.name,
        website: org.website,
        city: org.city,
        state: org.state,
        orgType: org.organizationType,
        relevanceReason: org.whyRelevant,
        likelyProblemFit: org.problemEvidence,
        sourceUrls: j([org.sourceUrl].filter(Boolean)),
        dedupeKey,
        status: "DISCOVERED",
        evidence: org.problemEvidence
          ? {
              create: [
                {
                  claim: org.problemEvidence,
                  sourceUrl: org.sourceUrl,
                  kind: "PROBLEM_SIGNAL",
                  aiTaskRunId: runId,
                },
              ],
            }
          : undefined,
      },
    });
    created++;
  }

  await logActivity({
    experimentId,
    kind: "DISCOVERY",
    actor: "AI",
    message: `Found ${created} new organizations matching target criteria${skipped ? ` (${skipped} were already known)` : ""}.`,
    detail: { searchNotes: output.searchNotes, exhausted: output.exhausted, runId },
  });

  // The model reports its own degraded runs in searchNotes, but nobody reads a
  // JSON detail blob. A run that could not actually search produced names, not
  // research, and the operator needs to know that before trusting the batch.
  if (/tool use limit|limit exceeded|could not (search|complete)|search access|cut off/i.test(output.searchNotes)) {
    await logActivity({
      experimentId,
      kind: "ERROR",
      actor: "AI",
      message: `Discovery ran degraded — it reported a search limit and could not complete its research strategy. Treat these ${created} organizations as unverified. Its words: "${output.searchNotes.slice(0, 220)}"`,
    });
  }

  if (output.exhausted && created === 0) {
    await logActivity({
      experimentId,
      kind: "DISCOVERY",
      actor: "AI",
      message: "Discovery reports this pool is exhausted — the addressable market may be smaller than the experiment assumes.",
    });
  }

  await nudge(experimentId);
  return { created, skipped, exhausted: output.exhausted };
}

export async function researchCandidate(payload: Record<string, unknown>): Promise<unknown> {
  const candidateId = String(payload.candidateId);
  const candidate = await prisma.prospectCandidate.findUniqueOrThrow({
    where: { id: candidateId },
    include: { experiment: true },
  });
  if (candidate.status !== "DISCOVERED") return { skipped: candidate.status };

  assertCandidateTransition("DISCOVERED", "RESEARCHING");
  await prisma.prospectCandidate.update({ where: { id: candidateId }, data: { status: "RESEARCHING" } });

  const brief = toBrief(candidate.experiment);
  const ctx = { experimentId: candidate.experimentId, candidateId };

  const { output: research, runId: researchRunId, citations } = await ai.researchOrganization(
    {
      brief,
      organizationName: candidate.organizationName,
      website: candidate.website,
      city: candidate.city,
      state: candidate.state,
    },
    ctx,
  );

  if (!research.confirmedRealOrganization || research.disqualifying) {
    await reject(
      candidateId,
      research.disqualifying ?? "Could not confirm this organization exists.",
      "AI",
      candidate.experimentId,
      candidate.organizationName,
    );
    await nudge(candidate.experimentId);
    return { rejected: true, reason: research.disqualifying };
  }

  // Persist evidence before anything downstream reads it, so a claim on the
  // candidate can always be traced to the page it came from.
  await prisma.evidenceItem.createMany({
    data: [
      ...research.facts.map((f) => ({
        candidateId,
        claim: f.claim,
        sourceUrl: f.sourceUrl,
        quote: f.quote,
        kind: "FACT",
        aiTaskRunId: researchRunId,
      })),
      ...research.problemSignals.map((f) => ({
        candidateId,
        claim: f.claim,
        sourceUrl: f.sourceUrl,
        quote: f.quote,
        kind: "PROBLEM_SIGNAL",
        aiTaskRunId: researchRunId,
      })),
    ],
  });

  const { output: people } = await ai.identifyDecisionMakers(
    {
      brief,
      organizationName: candidate.organizationName,
      website: research.website ?? candidate.website,
      organizationSummary: research.summary,
    },
    ctx,
  );

  // Best person = matches a target title first, then whoever we can actually
  // reach. A perfect-title contact with no address is worth less than a
  // near-miss title we can email, and the qualifier is told which we picked.
  const rank = { VERIFIED: 3, INFERRED: 2, GUESSED: 1, UNKNOWN: 0 } as Record<string, number>;
  const best = [...people.people].sort((a, b) => {
    if (a.matchesTargetTitle !== b.matchesTargetTitle) return a.matchesTargetTitle ? -1 : 1;
    return (rank[b.emailConfidence] ?? 0) - (rank[a.emailConfidence] ?? 0);
  })[0];

  let email = best?.email ?? null;
  let emailConfidence = best?.emailConfidence ?? "UNKNOWN";
  let emailBasis = best?.emailBasis ?? null;
  let phone = best?.phone ?? null;
  let contactName = best?.name ?? null;
  let title = best?.title ?? null;

  if (best && (!email || emailConfidence === "GUESSED" || emailConfidence === "UNKNOWN")) {
    try {
      const { output: contact } = await ai.extractVerifiedContactInfo(
        {
          organizationName: candidate.organizationName,
          website: research.website ?? candidate.website,
          contactName,
          title,
          currentEmail: email,
          currentConfidence: emailConfidence,
        },
        ctx,
      );
      if (contact.email && (rank[contact.emailConfidence] ?? 0) >= (rank[emailConfidence] ?? 0)) {
        email = contact.email;
        emailConfidence = contact.emailConfidence;
        emailBasis = contact.emailBasis;
        phone = contact.phone ?? phone;
      }
      if (contact.betterContactName && !contactName) {
        contactName = contact.betterContactName;
        title = contact.betterContactTitle ?? title;
      }
    } catch {
      // A failed contact hunt is not a failed research pass. The candidate
      // keeps whatever it had and the qualifier scores it down for it.
    }
  }

  if (email) {
    const supp = await isSuppressed(email);
    if (supp.suppressed) {
      await reject(candidateId, `Address is suppressed (${supp.reason}).`, "AI", candidate.experimentId, candidate.organizationName);
      await nudge(candidate.experimentId);
    return { rejected: true, reason: "suppressed" };
    }
  }

  const dedupeKey = candidateDedupeKey({
    email,
    organizationName: candidate.organizationName,
    contactName,
    title,
  });
  const clash = await prisma.prospectCandidate.findFirst({
    where: { experimentId: candidate.experimentId, dedupeKey, id: { not: candidateId } },
  });
  if (clash) {
    await reject(candidateId, "Duplicate of an existing candidate.", "AI", candidate.experimentId, candidate.organizationName);
    await nudge(candidate.experimentId);
    return { rejected: true, reason: "duplicate" };
  }

  assertCandidateTransition("RESEARCHING", "RESEARCHED");
  await prisma.prospectCandidate.update({
    where: { id: candidateId },
    data: {
      status: "RESEARCHED",
      dedupeKey,
      contactName,
      title,
      email,
      phone,
      emailConfidence,
      emailInferenceNote: emailBasis,
      website: research.website ?? candidate.website,
      city: research.city ?? candidate.city,
      state: research.state ?? candidate.state,
      orgType: research.organizationType ?? candidate.orgType,
      researchNotes: research.summary,
      relevanceReason: research.relevanceReason,
      likelyProblemFit: research.likelyProblemFit,
      sourceUrls: j([
        ...parseJson<string[]>(candidate.sourceUrls, []),
        ...citations.map((c) => c.url),
      ].filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 20)),
      organization: research.organizationType
        ? {
            update: {
              orgType: research.organizationType,
              sizeBucket: research.sizeBucket === "UNKNOWN" ? null : research.sizeBucket,
              researchSummary: research.summary,
              city: research.city ?? undefined,
              state: research.state ?? undefined,
            },
          }
        : undefined,
    },
  });

  await nudge(candidate.experimentId);
  return { contactFound: Boolean(email), emailConfidence };
}

export async function qualifyCandidate(payload: Record<string, unknown>): Promise<unknown> {
  const candidateId = String(payload.candidateId);
  const candidate = await prisma.prospectCandidate.findUniqueOrThrow({
    where: { id: candidateId },
    include: { experiment: true, evidence: true },
  });
  if (candidate.status !== "RESEARCHED") return { skipped: candidate.status };

  assertCandidateTransition("RESEARCHED", "QUALIFYING");
  await prisma.prospectCandidate.update({ where: { id: candidateId }, data: { status: "QUALIFYING" } });

  const { output, runId } = await ai.qualifyProspect(
    {
      brief: toBrief(candidate.experiment),
      organizationName: candidate.organizationName,
      organizationType: candidate.orgType,
      city: candidate.city,
      state: candidate.state,
      contactName: candidate.contactName,
      title: candidate.title,
      emailConfidence: candidate.emailConfidence,
      researchSummary: candidate.researchNotes ?? "",
      relevanceReason: candidate.relevanceReason ?? "",
      likelyProblemFit: candidate.likelyProblemFit ?? "",
      problemSignals: candidate.evidence
        .filter((e) => e.kind === "PROBLEM_SIGNAL")
        .map((e) => ({ claim: e.claim, sourceUrl: e.sourceUrl })),
      observedPatterns: await getObservedPatterns(candidate.experimentId),
    },
    { experimentId: candidate.experimentId, candidateId },
  );

  const { total, breakdown } = computeQualificationScore(output, candidate.emailConfidence);
  const floor = candidate.experiment.minQualificationScore ?? THRESHOLDS.qualificationFloor;
  const passes = output.verdict === "QUALIFIED" && total >= floor && Boolean(candidate.email);

  if (!passes) {
    const reason =
      output.verdict === "REJECT"
        ? output.verdictReason
        : !candidate.email
          ? "No usable email address was found."
          : `Scored ${total}, below this experiment's floor of ${floor}. ${output.verdictReason}`;
    await prisma.prospectCandidate.update({
      where: { id: candidateId },
      data: { qualificationScore: total, scoreBreakdown: j(breakdown), confidenceScore: output.confidence },
    });
    await reject(candidateId, reason, "AI", candidate.experimentId, candidate.organizationName, "QUALIFYING");
    await nudge(candidate.experimentId);
    return { rejected: true, score: total };
  }

  assertCandidateTransition("QUALIFYING", "QUALIFIED");
  await prisma.prospectCandidate.update({
    where: { id: candidateId },
    data: {
      status: "QUALIFIED",
      qualificationScore: total,
      scoreBreakdown: j(breakdown),
      confidenceScore: output.confidence,
      personalizationFacts: j(output.personalizationFacts),
    },
  });
  await logActivity({
    experimentId: candidate.experimentId,
    kind: "QUALIFICATION",
    actor: "AI",
    message: `Qualified ${candidate.contactName ?? candidate.title ?? "a contact"} at ${candidate.organizationName} (${total}/100).`,
    detail: { runId, verdict: output.verdict },
  });

  await promoteCandidate(candidateId);
  return { qualified: true, score: total };
}

/** QUALIFIED -> a Prospect. The only place a Prospect is ever created. */
export async function promoteCandidate(candidateId: string): Promise<string | null> {
  const candidate = await prisma.prospectCandidate.findUniqueOrThrow({
    where: { id: candidateId },
    include: { evidence: true, organization: true },
  });
  if (candidate.status !== "QUALIFIED" || !candidate.email) return null;

  const existing = await prisma.prospect.findUnique({
    where: { experimentId_email: { experimentId: candidate.experimentId, email: candidate.email } },
  });
  if (existing) {
    await prisma.prospectCandidate.update({
      where: { id: candidateId },
      data: { status: "REJECTED", rejectionReason: "Already a prospect in this experiment.", rejectedBy: "AI" },
    });
    return existing.id;
  }

  assertCandidateTransition("QUALIFIED", "READY_FOR_OUTREACH");
  const prospect = await prisma.prospect.create({
    data: {
      experimentId: candidate.experimentId,
      candidateId: candidate.id,
      organizationId: candidate.organizationId,
      organizationName: candidate.organizationName,
      contactName: candidate.contactName,
      title: candidate.title,
      email: candidate.email,
      phone: candidate.phone,
      city: candidate.city,
      state: candidate.state,
      orgType: candidate.orgType,
      qualificationScore: candidate.qualificationScore,
      scoreBreakdown: candidate.scoreBreakdown,
      personalizationFacts: candidate.personalizationFacts,
      status: "READY",
      // Frozen now. Recomputing these later would silently rewrite history
      // every time an organization record was enriched.
      featureSnapshot: j(
        featuresOf({
          title: candidate.title,
          orgType: candidate.orgType,
          state: candidate.state,
          sizeBucket: candidate.organization?.sizeBucket,
          hasProblemEvidence: candidate.evidence.some((e) => e.kind === "PROBLEM_SIGNAL"),
        }),
      ),
    },
  });

  assertCandidateTransition("READY_FOR_OUTREACH", "PROMOTED");
  await prisma.prospectCandidate.update({ where: { id: candidateId }, data: { status: "PROMOTED" } });

  const kind = candidate.referredByProspectId ? "REFERRAL_INTRO" : "INITIAL";
  await enqueue({
    kind: "DRAFT_OUTREACH",
    payload: { prospectId: prospect.id, kind, sequenceIndex: 0 },
    experimentId: candidate.experimentId,
    idempotencyKey: `draft:${prospect.id}:0`,
  });
  return prospect.id;
}

export async function draftOutreach(payload: Record<string, unknown>): Promise<unknown> {
  const prospectId = String(payload.prospectId);
  const kind = String(payload.kind ?? "INITIAL") as "INITIAL" | "FOLLOWUP" | "REFERRAL_INTRO";
  const sequenceIndex = Number(payload.sequenceIndex ?? 0);

  const prospect = await prisma.prospect.findUniqueOrThrow({
    where: { id: prospectId },
    include: {
      experiment: true,
      candidate: { include: { evidence: true } },
      threads: { include: { messages: { orderBy: { createdAt: "asc" } } } },
      referredBy: true,
    },
  });

  if (prospect.status === "NOT_INTERESTED" || prospect.status === "UNSUBSCRIBED" ||
      prospect.status === "DO_NOT_CONTACT" || prospect.status === "BOUNCED") {
    return { skipped: prospect.status };
  }

  const duplicate = await prisma.outboxDraft.findFirst({
    where: { prospectId, sequenceIndex, status: { in: ["PENDING_REVIEW", "APPROVED", "SENDING", "SENT"] } },
  });
  if (duplicate) return { skipped: "draft already exists" };

  const referralRow = prospect.referredBy[0] ?? null;
  const referralSource = referralRow
    ? await prisma.prospect.findUnique({ where: { id: referralRow.sourceProspectId } })
    : null;

  const previousMessages = prospect.threads
    .flatMap((t) => t.messages)
    .filter((m) => m.direction === "OUTBOUND")
    .map((m) => ({
      subject: m.subject,
      body: m.bodyText,
      sentAt: (m.sentAt ?? m.createdAt).toISOString().slice(0, 10),
    }));

  const { output, runId } = await ai.draftOutboundEmail(
    {
      brief: toBrief(prospect.experiment),
      kind,
      sequenceIndex,
      organizationName: prospect.organizationName,
      contactName: prospect.contactName,
      title: prospect.title,
      city: prospect.city,
      state: prospect.state,
      personalizationFacts: parseJson<PersonalizationFact[]>(prospect.personalizationFacts, []),
      problemSignals: (prospect.candidate?.evidence ?? [])
        .filter((e) => e.kind === "PROBLEM_SIGNAL")
        .map((e) => ({ claim: e.claim, sourceUrl: e.sourceUrl })),
      operatorName: env.OPERATOR_NAME,
      previousMessages,
      referral:
        referralRow && referralSource
          ? {
              fromName: referralSource.contactName ?? referralSource.organizationName,
              fromTitle: referralSource.title,
              quote: referralRow.quotedText,
            }
          : null,
    },
    { experimentId: prospect.experimentId, prospectId },
  );

  // Risk drives what the reviewer sees first and what bulk-approve will skip.
  const riskLevel =
    output.containsCommitment || (prospect.candidate?.emailConfidence ?? "UNKNOWN") === "GUESSED"
      ? "HIGH"
      : output.confidence >= 0.75 &&
          (prospect.candidate?.emailConfidence ?? "UNKNOWN") === "VERIFIED" &&
          kind !== "REFERRAL_INTRO"
        ? "LOW"
        : "NORMAL";

  await prisma.outboxDraft.create({
    data: {
      experimentId: prospect.experimentId,
      prospectId,
      threadId: prospect.threads[0]?.id ?? null,
      kind,
      sequenceIndex,
      subject: output.subject,
      body: output.body,
      aiSubject: output.subject,
      aiBody: output.body,
      altSubject: output.altSubject,
      altBody: output.altBody,
      rationale: output.rationale,
      hypothesisTested: output.hypothesisTested,
      personalizationUsed: j(output.personalizationUsed),
      evidenceRefs: j((prospect.candidate?.evidence ?? []).map((e) => e.id)),
      confidence: output.confidence,
      riskLevel,
      generatedByRunId: runId,
      status: "PENDING_REVIEW",
    },
  });

  return { drafted: true, riskLevel };
}

async function reject(
  candidateId: string,
  reason: string,
  by: "AI" | "HUMAN",
  experimentId: string,
  organizationName: string,
  from: "DISCOVERED" | "RESEARCHING" | "RESEARCHED" | "QUALIFYING" | "QUALIFIED" = "RESEARCHING",
): Promise<void> {
  assertCandidateTransition(from, "REJECTED");
  await prisma.prospectCandidate.update({
    where: { id: candidateId },
    data: { status: "REJECTED", rejectionReason: reason, rejectedBy: by },
  });
  await logActivity({
    experimentId,
    kind: "REJECTION",
    actor: by,
    message: `Rejected ${organizationName}: ${reason}`,
  });
}
