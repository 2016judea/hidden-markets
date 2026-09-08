import { beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { prisma, parseJson } from "@/lib/db";
import { MockLLMProvider, setLLM } from "@/lib/llm";
import { MockEmailProvider, setEmailProvider } from "@/lib/email";
import { drain, registerHandlers, enqueue } from "@/lib/jobs";
import { approveOutboxDraft, approveReply, startExperiment } from "@/lib/actions";

const INBOX = path.join(process.cwd(), ".mailbox", "inbox");

/**
 * The MVP milestone, end to end, with no network: open an experiment, let the
 * system find and qualify a prospect, draft an email, approve it, send it,
 * receive a reply, and have the reply classified, extracted and drafted — with
 * the two human gates actually gating.
 */
const llm = new MockLLMProvider()
  .on("emit_prescreen", () => ({
    verdict: "KEEP",
    reason: "A municipal wastewater facility, which is exactly the target type.",
    confidence: 0.9,
  }))
  .on("emit_organizations", () => ({
    organizations: [
      {
        name: "Mesa Water Reclamation District",
        website: "https://mesawater.example.gov",
        city: "Mesa",
        state: "AZ",
        organizationType: "Municipal wastewater facility",
        sizeHint: "MID",
        whyRelevant: "Operates its own treatment plant with 1980s-era lift stations.",
        problemEvidence: "The 2025 capital plan lists replacement of three aging lift-station pumps.",
        sourceUrl: "https://mesawater.example.gov/capital-plan",
      },
    ],
    searchNotes: "Found via a state permitted-facility list.",
    exhausted: false,
  }))
  .on("emit_research", () => ({
    confirmedRealOrganization: true,
    organizationType: "Municipal wastewater facility",
    website: "https://mesawater.example.gov",
    city: "Mesa",
    state: "AZ",
    sizeBucket: "MID",
    summary: "A municipal district operating one treatment plant and eleven lift stations.",
    relevanceReason: "They own and maintain the equipment themselves.",
    likelyProblemFit: "The capital plan names ageing pumps, which is direct evidence of the hypothesis.",
    problemSignals: [
      {
        claim: "2025 capital plan schedules replacement of three lift-station pumps.",
        sourceUrl: "https://mesawater.example.gov/capital-plan",
        quote: "Replace three (3) lift station pumps, est. 1987 installation.",
      },
    ],
    facts: [
      { claim: "Serves roughly 40,000 connections.", sourceUrl: "https://mesawater.example.gov/about", quote: null },
    ],
    disqualifying: null,
  }))
  .on("emit_people", () => ({
    people: [
      {
        name: "Dana Ruiz",
        title: "Wastewater Superintendent",
        email: "d.ruiz@mesawater.example.gov",
        emailConfidence: "VERIFIED",
        emailBasis: null,
        phone: null,
        sourceUrl: "https://mesawater.example.gov/staff",
        buyingRelevance: "Owns plant maintenance and signs off on parts purchases.",
        matchesTargetTitle: true,
      },
    ],
    notes: "Published on the district's staff page.",
  }))
  .on("emit_qualification", () => ({
    buyerFit: { score: 92, reason: "A municipal plant that buys its own parts." },
    problemLikelihood: { score: 85, reason: "Capital plan names ageing pumps." },
    contactAuthority: { score: 90, reason: "The superintendent owns maintenance." },
    organizationFit: { score: 80, reason: "Right size, right sector, in geography." },
    evidenceQuality: { score: 75, reason: "Two sourced claims, both from the district's own site." },
    verdict: "QUALIFIED",
    verdictReason: "Direct evidence of ageing equipment and a named decision-maker.",
    personalizationFacts: [
      {
        fact: "The 2025 capital plan schedules replacement of three lift-station pumps.",
        sourceUrl: "https://mesawater.example.gov/capital-plan",
        quote: "Replace three (3) lift station pumps",
        whyItMatters: "It shows we read something specific about their plant.",
      },
    ],
    confidence: 0.85,
  }))
  .on("emit_draft", () => ({
    subject: "obsolete pump parts",
    body:
      "I'm looking into how treatment plants source parts for equipment the manufacturer has stopped supporting.\n\n" +
      "Your 2025 capital plan schedules replacement of three lift-station pumps. Before a replacement gets funded, what do you actually do when a part on one of those fails and the OEM says it's unsupported?\n\n" +
      "Aidan",
    altSubject: null,
    altBody: null,
    rationale: "Asks about current behaviour rather than pitching, and anchors on a sourced fact.",
    personalizationUsed: ["The 2025 capital plan schedules replacement of three lift-station pumps."],
    hypothesisTested: "Plants cannot source discontinued components and run on workarounds.",
    confidence: 0.82,
    containsCommitment: false,
  }))
  .on("emit_classification", () => ({
    classifications: ["POSITIVE", "HAS_ACTIVE_PROBLEM"],
    interpretation: "A strong commercial signal: they have an active sourcing problem and have implicitly asked for help.",
    referral: null,
    isHumanWritten: true,
    wantsNoFurtherContact: false,
    suggestedProspectStatus: "ENGAGED",
    confidence: 0.9,
  }))
  .on("emit_signals", () => ({
    signals: [
      {
        category: "Obsolete infrastructure component",
        summary: "Cannot source a discontinued Allen-Bradley control board for a lift station; OEM has dropped support.",
        verbatim: "We've actually been trying to find an obsolete Allen-Bradley control board",
        requestedItem: { value: "Control board", confidence: 0.95 },
        manufacturer: { value: "Allen-Bradley", confidence: 0.95 },
        model: { value: null, confidence: 0 },
        partNumber: { value: null, confidence: 0 },
        quantity: { value: null, confidence: 0 },
        currentSupplier: { value: null, confidence: 0 },
        currentPrice: { value: null, confidence: 0 },
        estimatedSpend: { value: null, confidence: 0 },
        deadline: { value: null, confidence: 0 },
        urgency: "HIGH",
        frequency: "UNKNOWN",
        durationSoFar: { value: "about six weeks", confidence: 0.9 },
        currentWorkaround: { value: null, confidence: 0 },
        dissatisfaction: { value: "OEM no longer supports the component", confidence: 0.9 },
        commercialSignal: null,
        confidence: 0.92,
      },
    ],
    transactionOpportunities: [],
    nothingToExtract: false,
  }))
  .on("emit_reply", () => ({
    subject: "Re: obsolete pump parts",
    body:
      "Thanks — that's exactly the kind of request I'm investigating.\n\n" +
      "If you can send me the full model number, the part number if it's on the board, and ideally a photo of the nameplate, I'll see what I can turn up. Is there a date you need it by?\n\n" +
      "Aidan",
    rationale: "Asks for the three things that make the part findable, and promises nothing.",
    informationSought: ["model number", "part number", "nameplate photo", "needed-by date"],
    containsCommitment: false,
    shouldEscalate: false,
    escalationReason: null,
    confidence: 0.85,
  }))
  .on("emit_memo", () => ({
    learning: "One contact, one strong signal. That is an anecdote, not a rate — but it is exactly the anecdote the hypothesis predicted.",
    strongestEvidence: ["A superintendent has been hunting one discontinued board for six weeks."],
    weakestAssumptions: ["Nothing yet shows they would pay rather than wait for a capital replacement."],
    emergingBuyerProfile: "Wastewater superintendents at mid-size municipal districts.",
    commonProblems: ["Discontinued industrial control electronics"],
    commercialEvidence: [],
    surprises: [],
    recommendedNext: "Keep contacting superintendents specifically before widening to purchasing managers.",
    stageRecommendation: "HOLD",
    stageRationale: "One contact is far too few to promote on.",
  }));

describe("the whole loop", () => {
  let experimentId: string;

  beforeAll(async () => {
    setLLM(llm);
    registerHandlers();

    // Fresh state, in dependency order.
    for (const del of [
      prisma.painClusterMember.deleteMany(),
      prisma.painCluster.deleteMany(),
      prisma.transactionOpportunity.deleteMany(),
      prisma.painSignal.deleteMany(),
      prisma.replyReview.deleteMany(),
      prisma.outboxDraft.deleteMany(),
      prisma.emailMessage.deleteMany(),
      prisma.emailThread.deleteMany(),
      prisma.prospectReferral.deleteMany(),
      prisma.prospect.deleteMany(),
      prisma.evidenceItem.deleteMany(),
      prisma.prospectCandidate.deleteMany(),
      prisma.organization.deleteMany(),
      prisma.aITaskRun.deleteMany(),
      prisma.jobRun.deleteMany(),
      prisma.activityEvent.deleteMany(),
      prisma.targetingStat.deleteMany(),
      prisma.marketMemo.deleteMany(),
      prisma.suppression.deleteMany(),
      prisma.humanCorrection.deleteMany(),
      prisma.graphEdge.deleteMany(),
      prisma.graphNode.deleteMany(),
      prisma.marketExperiment.deleteMany(),
    ]) await del;

    fs.rmSync(path.join(process.cwd(), ".mailbox"), { recursive: true, force: true });
    fs.mkdirSync(INBOX, { recursive: true });
    setEmailProvider(new MockEmailProvider());

    const exp = await prisma.marketExperiment.create({
      data: {
        slug: "test-municipal",
        name: "Municipalities — obsolete infrastructure parts",
        hypothesis: "Plants cannot source discontinued components and run on workarounds.",
        buyerPersona: "Wastewater superintendent",
        likelyProblem: "A discontinued controller fails and the OEM says it is unsupported.",
        offer: "We investigate a sourcing problem and report what we find.",
        targetTitles: JSON.stringify(["Wastewater Superintendent", "Maintenance Manager"]),
        targetOrgTypes: JSON.stringify(["Municipal wastewater facility"]),
        prospectTarget: 1,
        contactedTarget: 1,
      },
    });
    experimentId = exp.id;
  });

  it("finds, researches, qualifies and drafts — and stops at the human gate", async () => {
    await startExperiment(experimentId);
    await drain(60);

    const candidate = await prisma.prospectCandidate.findFirstOrThrow({ where: { experimentId } });
    expect(candidate.status).toBe("PROMOTED");
    expect(candidate.email).toBe("d.ruiz@mesawater.example.gov");
    expect(candidate.qualificationScore).toBeGreaterThanOrEqual(60);

    // Provenance survived the pipeline.
    const evidence = await prisma.evidenceItem.findMany({ where: { candidateId: candidate.id } });
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence.every((e) => e.sourceUrl)).toBe(true);

    const prospect = await prisma.prospect.findFirstOrThrow({ where: { experimentId } });
    expect(prospect.status).toBe("READY");
    expect(prospect.firstContactedAt).toBeNull();

    const draft = await prisma.outboxDraft.findFirstOrThrow({ where: { experimentId } });
    expect(draft.status).toBe("PENDING_REVIEW");
    expect(draft.approvedBy).toBeNull();

    // THE GATE: the queue has been fully drained and nothing was sent.
    expect(await prisma.emailMessage.count()).toBe(0);
  });

  it("sends only after a human approves, and then schedules follow-ups", async () => {
    const draft = await prisma.outboxDraft.findFirstOrThrow({ where: { experimentId } });
    await approveOutboxDraft(draft.id);
    await drain(60);

    const sent = await prisma.outboxDraft.findUniqueOrThrow({ where: { id: draft.id } });
    expect(sent.status).toBe("SENT");
    expect(sent.approvedBy).toBe("Aidan Jude");

    const message = await prisma.emailMessage.findFirstOrThrow();
    expect(message.direction).toBe("OUTBOUND");
    expect(message.toAddress).toBe("d.ruiz@mesawater.example.gov");

    const prospect = await prisma.prospect.findFirstOrThrow({ where: { experimentId } });
    expect(prospect.status).toBe("CONTACTED");
    expect(prospect.firstContactedAt).not.toBeNull();

    // The denominator was counted once, against the frozen feature snapshot.
    const stat = await prisma.targetingStat.findFirstOrThrow({
      where: { experimentId, feature: "TITLE", value: "SUPERINTENDENT" },
    });
    expect(stat.contacted).toBe(1);

    const followups = await prisma.jobRun.findMany({
      where: { kind: "DRAFT_OUTREACH", status: "PENDING" },
    });
    expect(followups).toHaveLength(2);
    expect(followups.every((f) => f.runAfter > new Date())).toBe(true);
  });

  it("classifies an inbound reply, extracts the signal, cancels follow-ups and drafts a response", async () => {
    const outbound = await prisma.emailMessage.findFirstOrThrow({ where: { direction: "OUTBOUND" } });
    fs.writeFileSync(
      path.join(INBOX, "reply.json"),
      JSON.stringify({
        providerMessageId: "inbound-1",
        rfcMessageId: "<their-1@mesawater.example.gov>",
        inReplyTo: outbound.rfcMessageId,
        from: "d.ruiz@mesawater.example.gov",
        to: "aidan@brickandmortar.dev",
        subject: "Re: obsolete pump parts",
        bodyText:
          "We've actually been trying to find an obsolete Allen-Bradley control board for one of our lift stations for about six weeks. OEM says they don't support it anymore.",
        receivedAt: new Date().toISOString(),
      }),
    );

    await enqueue({ kind: "SYNC_INBOX" });
    await drain(60);

    const inbound = await prisma.emailMessage.findFirstOrThrow({ where: { direction: "INBOUND" } });
    expect(inbound.threadId).toBe(outbound.threadId); // threaded off In-Reply-To

    const review = await prisma.replyReview.findFirstOrThrow();
    expect(review.status).toBe("PENDING_REVIEW");
    expect(parseJson<string[]>(review.classifications, [])).toContain("HAS_ACTIVE_PROBLEM");
    expect(review.draftBody).toContain("model number");
    expect(review.sentAt).toBeNull();

    // High confidence, no commercial ask -> confirms itself, and lands in the graph.
    const signal = await prisma.painSignal.findFirstOrThrow();
    expect(signal.status).toBe("AUTO_CONFIRMED");
    expect(signal.manufacturer).toBe("Allen-Bradley");
    expect(signal.verbatim).toContain("Allen-Bradley control board");
    expect(await prisma.graphNode.count({ where: { type: "MANUFACTURER" } })).toBe(1);

    // Someone who replied is never chased.
    expect(await prisma.jobRun.count({ where: { kind: "DRAFT_OUTREACH", status: "PENDING" } })).toBe(0);
    expect(
      await prisma.outboxDraft.count({ where: { kind: "FOLLOWUP", status: { in: ["PENDING_REVIEW", "APPROVED"] } } }),
    ).toBe(0);

    const prospect = await prisma.prospect.findFirstOrThrow({ where: { experimentId } });
    expect(prospect.status).toBe("ENGAGED");
    expect(prospect.repliedAt).not.toBeNull();

    // Still nothing sent back without a person.
    expect(await prisma.emailMessage.count({ where: { direction: "OUTBOUND" } })).toBe(1);
  });

  it("sends the reply in-thread once approved, and writes the memo", async () => {
    const review = await prisma.replyReview.findFirstOrThrow();
    await approveReply(review.id);
    await drain(60);

    const after = await prisma.replyReview.findUniqueOrThrow({ where: { id: review.id } });
    expect(after.status).toBe("SENT");

    const replies = await prisma.emailMessage.findMany({
      where: { direction: "OUTBOUND" },
      orderBy: { createdAt: "asc" },
    });
    expect(replies).toHaveLength(2);
    const inbound = await prisma.emailMessage.findFirstOrThrow({ where: { direction: "INBOUND" } });
    expect(replies[1].inReplyTo).toBe(inbound.rfcMessageId);

    // The memo is debounced by a minute in production so a burst of replies
    // does not write five of them; drive it directly rather than sleep.
    await enqueue({ kind: "ANALYZE_EXPERIMENT", payload: { experimentId }, experimentId });
    await drain(10);

    const memo = await prisma.marketMemo.findFirstOrThrow({ where: { experimentId } });
    expect(memo.stageRecommendation).toBe("HOLD");
  });

  it("will not cold-email a second person at a company already approached", async () => {
    const contacted = await prisma.prospect.findFirstOrThrow({ where: { experimentId } });
    const second = await prisma.prospect.create({
      data: {
        experimentId,
        organizationId: contacted.organizationId,
        organizationName: contacted.organizationName,
        contactName: "Someone Else",
        title: "Purchasing",
        email: "purchasing@mesawater.example.gov",
        status: "READY",
      },
    });

    await enqueue({
      kind: "DRAFT_OUTREACH",
      payload: { prospectId: second.id, kind: "INITIAL", sequenceIndex: 0 },
      experimentId,
      idempotencyKey: `draft-dupe:${second.id}`,
    });
    await drain(10);

    expect(await prisma.outboxDraft.count({ where: { prospectId: second.id } })).toBe(0);
    const after = await prisma.prospect.findUniqueOrThrow({ where: { id: second.id } });
    expect(after.status).toBe("DO_NOT_CONTACT");
  });

  it("hands a candidate back instead of stranding it when research fails", async () => {
    // The failure that cost sixty-one candidates: RESEARCHING is set, the call
    // throws, the retry sees a non-DISCOVERED candidate, returns "skipped", and
    // the job is marked SUCCEEDED over a candidate nothing will ever touch.
    const candidate = await prisma.prospectCandidate.create({
      data: {
        experimentId,
        organizationName: "Stranding Test Water District",
        dedupeKey: "org:stranding test water district|unknown",
        status: "DISCOVERED",
      },
    });

    const failing = new MockLLMProvider(); // no handlers -> every call throws
    setLLM(failing);
    await enqueue({
      kind: "RESEARCH_CANDIDATE",
      payload: { candidateId: candidate.id },
      experimentId,
      idempotencyKey: `research-fail:${candidate.id}`,
    });
    await drain(10);
    setLLM(llm);

    const after = await prisma.prospectCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
    expect(after.status).toBe("DISCOVERED");

    const job = await prisma.jobRun.findFirstOrThrow({
      where: { idempotencyKey: `research-fail:${candidate.id}` },
    });
    expect(job.status).not.toBe("SUCCEEDED");
  });

  it("logged an auditable run for every judgement it made", async () => {
    const runs = await prisma.aITaskRun.findMany({ where: { experimentId, status: "SUCCEEDED" } });
    const types = new Set(runs.map((r) => r.taskType));
    for (const t of [
      "DISCOVER_ORGANIZATIONS",
      "RESEARCH_ORGANIZATION",
      "IDENTIFY_DECISION_MAKERS",
      "QUALIFY_PROSPECT",
      "DRAFT_OUTREACH",
      "CLASSIFY_REPLY",
      "EXTRACT_PAIN_SIGNAL",
      "DRAFT_REPLY",
      "ANALYZE_EXPERIMENT",
    ]) {
      expect(types.has(t)).toBe(true);
    }
    expect(runs.every((r) => r.status === "SUCCEEDED")).toBe(true);
    expect(runs.every((r) => r.promptVersion.includes("@"))).toBe(true);
    expect(runs.every((r) => r.inputJson.length > 0 && r.outputJson)).toBe(true);
  });
});
