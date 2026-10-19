import { prisma, j, parseJson } from "../../db";
import * as ai from "../../ai/functions";
import { toBrief, type PersonalizationFact } from "../../ai/prompts/shared";
import { computeQualificationScore } from "../../ai/prompts/qualifyProspect";
import { candidateDedupeKey, normalizeDomain, normalizeOrgName } from "../../domain/dedupe";
import { assertCandidateTransition, canContact, hasAnswered } from "../../domain/stateMachine";
import { logActivity } from "../../domain/activity";
import { featuresOf } from "../../domain/targeting";
import { getTargetingGuidance, getObservedPatterns } from "../../domain/targeting";
import { isSuppressed } from "../../domain/suppression";
import { THRESHOLDS, STAGE_TARGETS, type ExperimentStage } from "../../domain/constants";
import { enqueue } from "../queue";
import { env } from "../../env";
import { getDirectory, type DirectoryRecord } from "../../directory";
import { DEFAULT_METROS } from "../../domain/metros";

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

  // How much of this stage's contact budget is still unspent. Everything below
  // is capped by it, because research is the expensive step: 18 imported
  // candidates against a 25-contact stage with 20 already contacted must not
  // become 18 research calls. Discovery is cheap now; the model is not.
  const [contactedSoFar, uncontactedSoFar] = await Promise.all([
    prisma.prospect.count({ where: { experimentId, firstContactedAt: { not: null } } }),
    prisma.prospect.count({ where: { experimentId, firstContactedAt: null } }),
  ]);
  const stageCapEarly = STAGE_TARGETS[exp.stage as ExperimentStage] ?? exp.contactedTarget;
  const budget = Math.max(0, stageCapEarly - contactedSoFar - uncontactedSoFar);

  // 1. Move anything already in the pipeline to its next stage.
  const [unscreened, discovered, researched, qualified, undrafted] = await Promise.all([
    // The cheap gate first, and generously — it costs a cent and its whole
    // purpose is to stop the expensive step, so there is no reason to ration it.
    prisma.prospectCandidate.findMany({
      where: { experimentId, status: "DISCOVERED", prescreenVerdict: null },
      select: { id: true },
      take: 60,
    }),
    prisma.prospectCandidate.findMany({
      where: { experimentId, status: "DISCOVERED", prescreenVerdict: "KEEP" },
      select: { id: true },
      // Over-research a little so rejections do not starve the funnel, but
      // never research an unbounded backlog.
      take: Math.min(25, budget + 5),
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

  for (const c of unscreened) {
    await enqueue({
      kind: "PRESCREEN_CANDIDATE",
      payload: { candidateId: c.id },
      experimentId,
      idempotencyKey: `prescreen:${c.id}`,
    });
  }
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
  const stageCap = stageCapEarly;
  const contacted = contactedSoFar;
  const inFlight = await prisma.prospectCandidate.count({
    where: { experimentId, status: { in: ["DISCOVERED", "RESEARCHING", "RESEARCHED", "QUALIFYING", "QUALIFIED"] } },
  });
  const available = inFlight + uncontactedSoFar;
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

  return { contacted, available, deficit, stageCap, budget, promoted: qualified.length };
}

export async function discoverCandidates(payload: Record<string, unknown>): Promise<unknown> {
  const experimentId = String(payload.experimentId);
  const count = Math.min(Number(payload.count ?? DISCOVERY_BATCH), DISCOVERY_BATCH);
  const exp = await prisma.marketExperiment.findUniqueOrThrow({ where: { id: experimentId } });

  // Enumeration first, if this buyer type is something a directory can list.
  // It costs about a tenth of a cent per organization against seven cents from
  // the model, and it returns a website and a phone number the model does not
  // reliably find. The model still does every judgement downstream.
  const terms = parseJson<string[]>(exp.directoryQueries, []);
  if (terms.length > 0 && getDirectory()) {
    const swept = await sweepDirectory(exp, terms, count);
    if (swept.created > 0 || swept.exhausted) {
      await nudge(experimentId);
      return swept;
    }
    // Nothing usable came back — fall through to the model rather than stall.
  }

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

export async function prescreenCandidateJob(payload: Record<string, unknown>): Promise<unknown> {
  const candidateId = String(payload.candidateId);
  const candidate = await prisma.prospectCandidate.findUniqueOrThrow({
    where: { id: candidateId },
    include: { experiment: true },
  });
  if (candidate.status !== "DISCOVERED" || candidate.prescreenVerdict) {
    return { skipped: candidate.prescreenVerdict ?? candidate.status };
  }

  const { output, runId } = await ai.prescreenCandidate(
    {
      brief: toBrief(candidate.experiment),
      organizationName: candidate.organizationName,
      orgType: candidate.orgType,
      city: candidate.city,
      state: candidate.state,
      website: candidate.website,
      listedAs: candidate.relevanceReason,
    },
    { experimentId: candidate.experimentId, candidateId },
  );

  await prisma.prospectCandidate.update({
    where: { id: candidateId },
    data: { prescreenVerdict: output.verdict, prescreenReason: output.reason },
  });

  if (output.verdict === "DROP") {
    await reject(
      candidateId,
      `Dropped before research: ${output.reason}`,
      "AI",
      candidate.experimentId,
      candidate.organizationName,
      "DISCOVERED",
    );
  }

  await nudge(candidate.experimentId);
  return { verdict: output.verdict, runId };
}

export async function researchCandidate(payload: Record<string, unknown>): Promise<unknown> {
  const candidateId = String(payload.candidateId);
  const candidate = await loadCandidateForResearch(candidateId);
  if (candidate.status !== "DISCOVERED") return { skipped: candidate.status };

  assertCandidateTransition("DISCOVERED", "RESEARCHING");
  await prisma.prospectCandidate.update({ where: { id: candidateId }, data: { status: "RESEARCHING" } });

  // RESEARCHING is a claim, not a resting place. If anything below throws, the
  // job retries, sees a candidate that is no longer DISCOVERED, returns
  // "skipped" — and the job is then marked SUCCEEDED over a candidate stranded
  // forever. Sixty-one were stranded exactly this way. Roll the claim back so
  // the retry has something to do.
  try {
    return await researchCandidateInner(candidateId, candidate);
  } catch (err) {
    await prisma.prospectCandidate.updateMany({
      where: { id: candidateId, status: "RESEARCHING" },
      data: { status: "DISCOVERED" },
    });
    throw err;
  }
}

async function researchCandidateInner(
  candidateId: string,
  candidate: Awaited<ReturnType<typeof loadCandidateForResearch>>,
): Promise<unknown> {
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

  // Stored in lower case from here on: the mailbox lowercases every sender, and
  // an address kept as published ("KLee@Beaumontca.gov") never matched its own
  // replies. Existing rows are matched case-insensitively on the inbound side.
  let email = best?.email?.trim().toLowerCase() ?? null;
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
        email = contact.email.trim().toLowerCase();
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

/** Shared so the wrapper above and the inner body agree on the shape. */
async function loadCandidateForResearch(candidateId: string) {
  return prisma.prospectCandidate.findUniqueOrThrow({
    where: { id: candidateId },
    include: { experiment: true },
  });
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

  // Same rollback as research: QUALIFYING is a claim held only while a call is
  // in flight.
  try {
    return await qualifyCandidateInner(candidateId, candidate);
  } catch (err) {
    await prisma.prospectCandidate.updateMany({
      where: { id: candidateId, status: "QUALIFYING" },
      data: { status: "RESEARCHED" },
    });
    throw err;
  }
}

async function qualifyCandidateInner(
  candidateId: string,
  candidate: Awaited<ReturnType<typeof loadCandidateForQualify>>,
): Promise<unknown> {

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

  if (!canContact(prospect.status)) return { skipped: prospect.status };

  // A follow-up is a chase, and someone who has answered is not chased — the
  // reply cancels the scheduled jobs, but a job already claimed, or re-created
  // by an out-of-office, reaches this point anyway.
  if (kind === "FOLLOWUP" && hasAnswered(prospect)) return { skipped: "they already replied" };

  // A paused experiment holds its follow-ups rather than drafting or dropping
  // them. Pausing used to delete the scheduled jobs outright, and nothing
  // re-creates them on resume — they are only ever scheduled at the first send
  // — so an hour's pause silently lost every day-4 and day-10 email.
  if (prospect.experiment.status === "PAUSED") {
    throw Object.assign(new Error(`experiment is paused; ${kind.toLowerCase()} draft held`), {
      deferrable: true,
      retryAfterMs: 6 * 3_600_000,
    });
  }
  if (prospect.experiment.status === "TERMINATED") return { skipped: "experiment terminated" };

  const duplicate = await prisma.outboxDraft.findFirst({
    where: { prospectId, sequenceIndex, status: { in: ["PENDING_REVIEW", "APPROVED", "SENDING", "SENT"] } },
  });
  if (duplicate) return { skipped: "draft already exists" };

  // ONE COLD EMAIL PER ORGANIZATION.
  //
  // Deduplication is keyed on the address, which is right for "is this the same
  // person" and useless for "have we already approached this company". H&H
  // Buying & Selling collected two prospect rows — sales@ contacted by hand on
  // 2026-09-07, and Purchasing@ drafted the next day by this pipeline. Both
  // would have gone out from the same person, two days apart, each apparently
  // unaware of the other. To a two-person firm that reads as a mailing list,
  // and the reply is the entire product here.
  //
  // A follow-up or a referral intro is exempt: the first is the same thread, and
  // the second was explicitly invited by someone inside the company.
  if (kind === "INITIAL") {
    const orgMatch = prospect.organizationId
      ? { organizationId: prospect.organizationId }
      : { organizationName: prospect.organizationName };
    const alreadyApproached = await prisma.prospect.findFirst({
      where: {
        ...orgMatch,
        id: { not: prospectId },
        firstContactedAt: { not: null },
      },
      select: { email: true, contactName: true, firstContactedAt: true },
    });
    if (alreadyApproached) {
      await prisma.prospect.update({
        where: { id: prospectId },
        data: { status: "DO_NOT_CONTACT" },
      });
      await logActivity({
        experimentId: prospect.experimentId,
        kind: "REJECTION",
        message:
          `Did not draft to ${prospect.email} — ${prospect.organizationName} was already approached at ` +
          `${alreadyApproached.email} on ${alreadyApproached.firstContactedAt?.toISOString().slice(0, 10)}. ` +
          `One cold email per organization.`,
      });
      return { skipped: "organization already approached", at: alreadyApproached.email };
    }
  }

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

/**
 * One term x location page, turned into candidates. Picks the next unswept pair
 * so repeated runs walk outward through the metro list instead of re-buying the
 * same first page.
 */
async function sweepDirectory(
  exp: { id: string; targetGeography: string; directoryLocations: string; name: string },
  terms: string[],
  wanted: number,
): Promise<{ source: string; created: number; skipped: number; costUsd: number; exhausted: boolean }> {
  const directory = getDirectory()!;
  const locations = (() => {
    const named = parseJson<string[]>(exp.directoryLocations, []);
    return named.length > 0 ? named : DEFAULT_METROS;
  })();

  const done = await prisma.directorySweep.findMany({
    where: { experimentId: exp.id },
    select: { term: true, location: true },
  });
  const seen = new Set(done.map((d) => `${d.term}|${d.location}`));

  // A page already bought comes first. A 60-result page against a batch of 8
  // otherwise means paying for the same 52 listings again on the next run.
  const pending = await prisma.directorySweep.findFirst({
    where: { experimentId: exp.id, NOT: { leftover: "[]" } },
    orderBy: { createdAt: "asc" },
  });

  let next: { term: string; location: string };
  let result: { records: DirectoryRecord[]; calls: number; costUsd: number };
  let fromLeftover = false;

  if (pending) {
    next = { term: pending.term, location: pending.location };
    result = { records: parseJson<DirectoryRecord[]>(pending.leftover, []), calls: 0, costUsd: 0 };
    fromLeftover = true;
  } else {
    const pick = (() => {
      for (const location of locations) {
        for (const term of terms) {
          if (!seen.has(`${term}|${location}`)) return { term, location };
        }
      }
      return null;
    })();
    if (!pick) {
      return { source: directory.name, created: 0, skipped: 0, costUsd: 0, exhausted: true };
    }
    next = pick;
    result = await directory.search({ term: pick.term, location: pick.location, limit: 60 });
  }

  const known = await prisma.prospectCandidate.findMany({
    where: { experimentId: exp.id },
    select: { organizationName: true },
  });
  const knownNames = new Set(known.map((k) => normalizeOrgName(k.organizationName)));

  let created = 0;
  let skipped = 0;
  const unused: DirectoryRecord[] = [];

  for (const record of result.records) {
    if (created >= wanted) {
      unused.push(record);
      continue;
    }
    const norm = normalizeOrgName(record.name);
    if (!record.name || knownNames.has(norm)) {
      skipped++;
      continue;
    }
    knownNames.add(norm);

    const domain = normalizeDomain(record.website);
    const organization = domain
      ? await prisma.organization.upsert({
          where: { domain },
          create: {
            name: record.name, domain, website: record.website,
            orgType: record.primaryType, city: record.city, state: record.state,
          },
          update: {},
        })
      : await prisma.organization.create({
          data: {
            name: record.name, website: record.website,
            orgType: record.primaryType, city: record.city, state: record.state,
          },
        });
    if (organization.suppressed) {
      skipped++;
      continue;
    }

    const dedupeKey = candidateDedupeKey({ organizationName: record.name });
    if (
      await prisma.prospectCandidate.findUnique({
        where: { experimentId_dedupeKey: { experimentId: exp.id, dedupeKey } },
      })
    ) {
      skipped++;
      continue;
    }

    await prisma.prospectCandidate.create({
      data: {
        experimentId: exp.id,
        organizationId: organization.id,
        organizationName: record.name,
        website: record.website,
        phone: record.phone,
        city: record.city,
        state: record.state,
        orgType: record.primaryType,
        dedupeKey,
        status: "DISCOVERED",
        // Deliberately flat. A directory says this business exists and what it
        // is called; it says nothing about whether the hypothesis holds here,
        // and researchOrganization has not run yet. Claiming more would put an
        // unearned reason in front of the reviewer.
        relevanceReason: `Listed as "${next.term}" in ${next.location}.`,
        sourceUrls: j([record.sourceUrl].filter(Boolean)),
      },
    });
    created++;
  }

  if (fromLeftover && pending) {
    await prisma.directorySweep.update({
      where: { id: pending.id },
      data: { created: { increment: created }, leftover: j(unused) },
    });
  } else {
    await prisma.directorySweep.create({
      data: {
        experimentId: exp.id, term: next.term, location: next.location,
        provider: directory.name, found: result.records.length, created,
        costUsd: result.costUsd, leftover: j(unused),
      },
    });
  }

  await logActivity({
    experimentId: exp.id,
    kind: "DISCOVERY",
    message:
      `Found ${created} new "${next.term}" in ${next.location} from ${directory.name} ` +
      `(${result.records.length} ${fromLeftover ? "held over" : "listed"}, ${skipped} already known, ${unused.length} kept for next time)` +
      `${fromLeftover ? " at no further cost." : ` for $${result.costUsd.toFixed(3)}.`}`,
    detail: { term: next.term, location: next.location, calls: result.calls, fromLeftover },
  });

  return { source: directory.name, created, skipped, costUsd: result.costUsd, exhausted: false };
}

async function loadCandidateForQualify(candidateId: string) {
  return prisma.prospectCandidate.findUniqueOrThrow({
    where: { id: candidateId },
    include: { experiment: true, evidence: true },
  });
}

/**
 * Anything stranded in a transient state with no job outstanding goes back one
 * step. The rollbacks above stop new strandings; this clears the ones a crashed
 * or killed worker leaves behind, which no rollback can catch.
 */
export async function reapStrandedCandidates(olderThanMs = 20 * 60_000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const [researching, qualifying] = await Promise.all([
    prisma.prospectCandidate.updateMany({
      where: { status: "RESEARCHING", updatedAt: { lt: cutoff } },
      data: { status: "DISCOVERED" },
    }),
    prisma.prospectCandidate.updateMany({
      where: { status: "QUALIFYING", updatedAt: { lt: cutoff } },
      data: { status: "RESEARCHED" },
    }),
  ]);
  return researching.count + qualifying.count;
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
