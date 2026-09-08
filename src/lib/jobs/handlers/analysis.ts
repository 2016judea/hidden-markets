import { prisma, j } from "../../db";
import * as ai from "../../ai/functions";
import { toBrief } from "../../ai/prompts/shared";
import { experimentCounts } from "../../domain/scoring";
import { getTargetingInsights } from "../../domain/targeting";
import { logActivity } from "../../domain/activity";

export async function analyzeExperiment(payload: Record<string, unknown>): Promise<unknown> {
  const experimentId = String(payload.experimentId);
  const exp = await prisma.marketExperiment.findUniqueOrThrow({ where: { id: experimentId } });
  const counts = await experimentCounts(experimentId);

  // A memo written over nothing is worse than no memo: it reads authoritative
  // and says nothing. Wait until there is something to be wrong about.
  if (counts.contacted === 0 && counts.replied === 0) {
    return { skipped: "no evidence yet" };
  }

  const [signals, negatives, previous, insights] = await Promise.all([
    prisma.painSignal.findMany({
      where: { experimentId, status: { in: ["CONFIRMED", "AUTO_CONFIRMED"] } },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.replyReview.findMany({
      where: { experimentId, classifications: { contains: "NEGATIVE" } },
      include: { inboundMessage: { select: { bodyText: true } } },
      take: 10,
    }),
    prisma.marketMemo.findFirst({ where: { experimentId }, orderBy: { createdAt: "desc" } }),
    getTargetingInsights(experimentId),
  ]);

  const { output, runId } = await ai.analyzeExperiment(
    {
      brief: toBrief(exp),
      stage: exp.stage,
      counts,
      painSignals: signals.map((s) => ({
        category: s.category,
        summary: s.summary,
        verbatim: s.verbatim ?? "",
        urgency: s.urgency ?? "UNKNOWN",
      })),
      observedTargeting: insights.map((i) => ({
        feature: i.feature,
        value: i.value,
        contacted: i.contacted,
        qualifiedPain: i.qualifiedPain,
      })),
      negativeQuotes: negatives.map((n) => n.inboundMessage.bodyText.slice(0, 240)),
      previousMemoLearning: previous?.learning ?? null,
    },
    { experimentId },
  );

  await prisma.marketMemo.create({
    data: {
      experimentId,
      learning: output.learning,
      strongestEvidence: j(output.strongestEvidence),
      weakestAssumptions: j(output.weakestAssumptions),
      emergingBuyerProfile: output.emergingBuyerProfile,
      commonProblems: j(output.commonProblems),
      commercialEvidence: j(output.commercialEvidence),
      surprises: j(output.surprises),
      recommendedNext: output.recommendedNext,
      stageRecommendation: output.stageRecommendation,
      stageRationale: output.stageRationale,
      evidenceCounts: j(counts),
      generatedByRunId: runId,
    },
  });

  // A stage change is a material change to the experiment, so the memo only
  // ever recommends it. The transition itself needs a person.
  if (output.stageRecommendation !== "HOLD") {
    await logActivity({
      experimentId,
      kind: "SYSTEM",
      actor: "AI",
      message: `Memo recommends ${output.stageRecommendation} for ${exp.name}: ${output.stageRationale.slice(0, 200)}`,
    });
  }

  return { stageRecommendation: output.stageRecommendation, surprises: output.surprises.length };
}

export async function clusterPain(): Promise<unknown> {
  const signals = await prisma.painSignal.findMany({
    where: { status: { in: ["CONFIRMED", "AUTO_CONFIRMED"] } },
    include: { experiment: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  if (signals.length < 4) return { skipped: `only ${signals.length} confirmed signals` };

  const { output, runId } = await ai.clusterPainSignals({
    signals: signals.map((s) => ({
      id: s.id,
      experimentName: s.experiment.name,
      category: s.category,
      summary: s.summary,
      manufacturer: s.manufacturer,
      requestedItem: s.requestedItem,
      urgency: s.urgency ?? "UNKNOWN",
    })),
  });

  const byId = new Map(signals.map((s) => [s.id, s]));

  // Clusters are rebuilt wholesale rather than merged. The membership of a
  // cluster is a judgement over the whole corpus, and patching it incrementally
  // would leave stale groupings that nothing ever revisits.
  await prisma.painClusterMember.deleteMany({});
  await prisma.painCluster.deleteMany({});

  for (const c of output.clusters) {
    const experimentNames = [...new Set(c.signalIds.map((id) => byId.get(id)?.experiment.name).filter(Boolean))];
    const cluster = await prisma.painCluster.create({
      data: {
        label: c.label,
        description: c.description,
        crossMarket: experimentNames.length > 1,
        experimentIds: j([...new Set(c.signalIds.map((id) => byId.get(id)?.experimentId).filter(Boolean))]),
        industries: j(c.industries),
        estimatedValue: c.estimatedValue,
        rationale: c.rationale,
        signalCount: c.signalIds.length,
        generatedByRunId: runId,
      },
    });
    await prisma.painClusterMember.createMany({
      data: c.signalIds.map((painSignalId) => ({ clusterId: cluster.id, painSignalId })),
    });
    if (experimentNames.length > 1) {
      await logActivity({
        kind: "CLUSTER",
        actor: "AI",
        message: `"${c.label}" is emerging across ${experimentNames.length} experiments: ${experimentNames.join(", ")}.`,
        detail: { signalCount: c.signalIds.length, estimatedValue: c.estimatedValue },
      });
    }
  }

  for (const f of output.crossMarketFindings) {
    await logActivity({
      kind: "CLUSTER",
      actor: "AI",
      message: f.finding,
      detail: { experiments: f.experiments, whyItMatters: f.whyItMatters },
    });
  }

  return { clusters: output.clusters.length, crossMarket: output.crossMarketFindings.length };
}
