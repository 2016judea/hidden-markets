import { prisma } from "../db";

export type ScoreComponent = {
  name: string;
  label: string;
  raw: string;
  points: number;
  maxPoints: number;
  detail: string;
};

export type OpportunityScore = {
  total: number;
  confidence: "ANECDOTE" | "WEAK" | "MODERATE" | "STRONG";
  components: ScoreComponent[];
  headline: string;
};

/**
 * Observed evidence only. There is no prior, no hand-set "promise" score and no
 * model call — the brief asks for subjective pre-test scores to become less
 * important over time, and the cleanest way to guarantee that is never to
 * record one.
 *
 * The score is out of 100 and every point is attributable to a named component
 * with the count behind it, so a high score can always be interrogated.
 */
export async function scoreExperiment(experimentId: string): Promise<OpportunityScore> {
  const [contacted, replied, prospects, signals, opportunities, negative, bounced] = await Promise.all([
    prisma.prospect.count({ where: { experimentId, firstContactedAt: { not: null } } }),
    prisma.prospect.count({ where: { experimentId, repliedAt: { not: null } } }),
    prisma.prospect.findMany({ where: { experimentId }, select: { status: true } }),
    prisma.painSignal.findMany({
      where: { experimentId, status: { in: ["CONFIRMED", "AUTO_CONFIRMED"] } },
      select: { urgency: true, frequency: true, requestedItem: true, estimatedSpend: true },
    }),
    prisma.transactionOpportunity.count({ where: { experimentId } }),
    prisma.prospect.count({ where: { experimentId, status: "NOT_INTERESTED" } }),
    prisma.prospect.count({ where: { experimentId, status: "BOUNCED" } }),
  ]);

  const painCount = signals.length;
  const painRate = contacted > 0 ? painCount / contacted : 0;
  const replyRate = contacted > 0 ? replied / contacted : 0;
  const commercialRate = contacted > 0 ? opportunities / contacted : 0;
  const specificRequests = signals.filter((s) => s.requestedItem).length;
  const recurring = signals.filter((s) => s.frequency === "RECURRING" || s.frequency === "CONSTANT").length;
  const urgent = signals.filter((s) => s.urgency === "HIGH" || s.urgency === "CRITICAL").length;
  const engaged = prospects.filter((p) => p.status === "ENGAGED" || p.status === "TRANSACTION").length;
  const bounceRate = contacted > 0 ? bounced / contacted : 0;

  const cap = (v: number, max: number) => Math.min(max, Math.round(v));

  const components: ScoreComponent[] = [
    {
      name: "qualifiedPainRate",
      label: "Qualified pain rate",
      raw: contacted ? `${painCount}/${contacted} (${(painRate * 100).toFixed(1)}%)` : "no contacts yet",
      points: cap(painRate * 100 * 1.5, 30),
      maxPoints: 30,
      detail: "Share of contacted prospects who described a real, current problem.",
    },
    {
      name: "commercialSignalRate",
      label: "Commercial signal rate",
      raw: contacted ? `${opportunities}/${contacted} (${(commercialRate * 100).toFixed(1)}%)` : "—",
      points: cap(commercialRate * 100 * 3, 20),
      maxPoints: 20,
      detail: "Asked a price, asked us to source something, or named a deadline.",
    },
    {
      name: "specificRequests",
      label: "Specific sourcing requests",
      raw: `${specificRequests}`,
      points: cap(specificRequests * 3, 12),
      maxPoints: 12,
      detail: "A named item beats a described frustration — it is the thing you can actually go and find.",
    },
    {
      name: "recurrence",
      label: "Recurrence",
      raw: `${recurring} of ${painCount} recurring`,
      points: cap(painCount ? (recurring / painCount) * 12 : 0, 12),
      maxPoints: 12,
      detail: "A one-off is a favour. A recurring problem is a business.",
    },
    {
      name: "urgency",
      label: "Urgency",
      raw: `${urgent} of ${painCount} high or critical`,
      points: cap(painCount ? (urgent / painCount) * 8 : 0, 8),
      maxPoints: 8,
      detail: "Urgent problems get budget approved; mild ones get deferred forever.",
    },
    {
      name: "accessibility",
      label: "Buyer accessibility",
      raw: contacted ? `${(replyRate * 100).toFixed(1)}% reply, ${(bounceRate * 100).toFixed(1)}% bounce` : "—",
      points: cap(replyRate * 100 - bounceRate * 50, 10),
      maxPoints: 10,
      detail: "Can we actually reach this buyer by email at all?",
    },
    {
      name: "transactionEvidence",
      label: "Transaction evidence",
      raw: `${engaged} engaged or transacting`,
      points: cap(engaged * 4, 8),
      maxPoints: 8,
      detail: "The only evidence that outranks everything above it.",
    },
  ];

  const total = components.reduce((s, c) => s + c.points, 0);

  const confidence =
    contacted >= 100 ? "STRONG" : contacted >= 40 ? "MODERATE" : contacted >= 15 ? "WEAK" : "ANECDOTE";

  const headline =
    contacted === 0
      ? "Nothing sent yet — no evidence either way."
      : painCount === 0
        ? `${contacted} contacted, ${replied} replied, no pain signal yet.`
        : `${painCount} pain signals from ${contacted} contacts (${(painRate * 100).toFixed(1)}%), ${opportunities} commercial.`;

  return { total: Math.round(total), confidence, components, headline };
}

/** Negative is a finding too: how loudly has this market said no? */
export async function experimentCounts(experimentId: string) {
  const [contacted, replied, qualifiedPain, commercial, negative, bounced, transactionOpportunities] =
    await Promise.all([
      prisma.prospect.count({ where: { experimentId, firstContactedAt: { not: null } } }),
      prisma.prospect.count({ where: { experimentId, repliedAt: { not: null } } }),
      prisma.painSignal.count({ where: { experimentId, status: { in: ["CONFIRMED", "AUTO_CONFIRMED"] } } }),
      prisma.transactionOpportunity.count({ where: { experimentId } }),
      prisma.prospect.count({ where: { experimentId, status: "NOT_INTERESTED" } }),
      prisma.prospect.count({ where: { experimentId, status: "BOUNCED" } }),
      prisma.transactionOpportunity.count({ where: { experimentId } }),
    ]);
  return { contacted, replied, qualifiedPain, commercial, negative, bounced, transactionOpportunities };
}
