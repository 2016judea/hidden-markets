import { prisma, parseJson } from "./db";
import { scoreExperiment } from "./domain/scoring";
import { crossMarketProblems } from "./domain/graph";

export async function commandCenter() {
  const [
    pendingDrafts,
    pendingReplies,
    openTransactions,
    experiments,
    recentSignals,
    clusters,
    activity,
    escalated,
    needsReviewSignals,
  ] = await Promise.all([
    prisma.outboxDraft.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.replyReview.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.transactionOpportunity.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      include: { prospect: true, experiment: { select: { name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.marketExperiment.findMany({
      where: { status: { in: ["ACTIVE", "PAUSED"] } },
      select: { id: true, slug: true, name: true, stage: true, status: true },
    }),
    prisma.painSignal.findMany({
      where: { status: { in: ["CONFIRMED", "AUTO_CONFIRMED"] } },
      include: { experiment: { select: { name: true, slug: true } }, prospect: { select: { organizationName: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.painCluster.findMany({ orderBy: [{ crossMarket: "desc" }, { signalCount: "desc" }], take: 6 }),
    prisma.activityEvent.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.replyReview.count({ where: { status: "ESCALATED" } }),
    prisma.painSignal.count({ where: { status: "NEEDS_REVIEW" } }),
  ]);

  const scored = await Promise.all(
    experiments.map(async (e) => ({ ...e, score: await scoreExperiment(e.id) })),
  );
  scored.sort((a, b) => b.score.total - a.score.total);

  const memos = await prisma.marketMemo.findMany({
    where: { experimentId: { in: experiments.map((e) => e.id) } },
    orderBy: { createdAt: "desc" },
  });
  const latestMemoByExperiment = new Map<string, (typeof memos)[number]>();
  for (const m of memos) if (!latestMemoByExperiment.has(m.experimentId)) latestMemoByExperiment.set(m.experimentId, m);

  const surprises = [...latestMemoByExperiment.values()].flatMap((m) =>
    parseJson<string[]>(m.surprises, []).map((s) => ({
      text: s,
      experimentId: m.experimentId,
    })),
  );

  return {
    pendingDrafts,
    pendingReplies,
    openTransactions,
    escalated,
    needsReviewSignals,
    experiments: scored,
    recentSignals,
    clusters,
    activity,
    surprises,
    memos: latestMemoByExperiment,
    crossMarket: await crossMarketProblems(),
  };
}

export async function outboxQueue(experimentId?: string) {
  return prisma.outboxDraft.findMany({
    where: { status: "PENDING_REVIEW", ...(experimentId ? { experimentId } : {}) },
    include: {
      experiment: { select: { name: true, slug: true, hypothesis: true, trustLevel: true } },
      prospect: {
        include: { candidate: { include: { evidence: true } } },
      },
    },
    orderBy: [{ riskLevel: "asc" }, { createdAt: "asc" }],
  });
}

export async function replyQueue(experimentId?: string) {
  return prisma.replyReview.findMany({
    where: { status: { in: ["PENDING_REVIEW", "ESCALATED"] }, ...(experimentId ? { experimentId } : {}) },
    include: {
      experiment: { select: { name: true, slug: true, hypothesis: true } },
      inboundMessage: true,
      thread: {
        include: {
          prospect: true,
          messages: { orderBy: { createdAt: "asc" } },
        },
      },
    },
    orderBy: [{ status: "desc" }, { createdAt: "asc" }],
  });
}

export async function painSignalsForReview(reviewIds: string[]) {
  const messageIds = await prisma.replyReview.findMany({
    where: { id: { in: reviewIds } },
    select: { id: true, inboundMessageId: true },
  });
  const signals = await prisma.painSignal.findMany({
    where: { emailMessageId: { in: messageIds.map((m) => m.inboundMessageId) } },
  });
  const byMessage = new Map(messageIds.map((m) => [m.inboundMessageId, m.id]));
  const out = new Map<string, typeof signals>();
  for (const s of signals) {
    const reviewId = s.emailMessageId ? byMessage.get(s.emailMessageId) : null;
    if (!reviewId) continue;
    out.set(reviewId, [...(out.get(reviewId) ?? []), s]);
  }
  return out;
}

export async function experimentDetail(slug: string) {
  const experiment = await prisma.marketExperiment.findUnique({ where: { slug } });
  if (!experiment) return null;

  const [memo, candidates, prospects, signals, opportunities, activity, jobs, runs] = await Promise.all([
    prisma.marketMemo.findFirst({ where: { experimentId: experiment.id }, orderBy: { createdAt: "desc" } }),
    prisma.prospectCandidate.findMany({
      where: { experimentId: experiment.id },
      orderBy: [{ qualificationScore: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.prospect.findMany({
      where: { experimentId: experiment.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.painSignal.findMany({
      where: { experimentId: experiment.id },
      include: { prospect: { select: { organizationName: true, contactName: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.transactionOpportunity.findMany({
      where: { experimentId: experiment.id },
      include: { prospect: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.activityEvent.findMany({
      where: { experimentId: experiment.id },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.jobRun.findMany({
      where: { experimentId: experiment.id, status: { in: ["PENDING", "RUNNING", "FAILED"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.aITaskRun.findMany({
      where: { experimentId: experiment.id },
      orderBy: { startedAt: "desc" },
      take: 30,
    }),
  ]);

  return {
    experiment,
    memo,
    candidates,
    prospects,
    signals,
    opportunities,
    activity,
    jobs,
    runs,
    score: await scoreExperiment(experiment.id),
  };
}

export async function insights() {
  const [clusters, signals, cross, memos, corrections, runStats] = await Promise.all([
    prisma.painCluster.findMany({
      include: { members: { include: { painSignal: { include: { experiment: { select: { name: true } } } } } } },
      orderBy: [{ crossMarket: "desc" }, { signalCount: "desc" }],
    }),
    prisma.painSignal.findMany({
      where: { status: { in: ["CONFIRMED", "AUTO_CONFIRMED"] } },
      include: { experiment: { select: { name: true } }, prospect: { select: { organizationName: true, orgType: true } } },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    crossMarketProblems(),
    prisma.marketMemo.findMany({
      orderBy: { createdAt: "desc" },
      include: { experiment: { select: { name: true, slug: true, stage: true } } },
      take: 30,
    }),
    prisma.humanCorrection.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.aITaskRun.groupBy({
      by: ["taskType", "status"],
      _count: { _all: true },
      _sum: { costUsd: true },
    }),
  ]);

  const latestMemos = new Map<string, (typeof memos)[number]>();
  for (const m of memos) if (!latestMemos.has(m.experimentId)) latestMemos.set(m.experimentId, m);

  return { clusters, signals, cross, memos: [...latestMemos.values()], corrections, runStats };
}
