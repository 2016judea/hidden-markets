import { prisma, parseJson } from "../db";
import { THRESHOLDS } from "./constants";

export type Features = Record<string, string>;

/**
 * Title text is unbounded ("Supt. of Water Reclamation", "WWTP Superintendent",
 * "Superintendent - Wastewater"). Learning per raw string learns nothing, so we
 * bucket deterministically. The bucket list is visible and editable; a title
 * that matches nothing keeps its own normalized text, which is how a new
 * important role announces itself in the stats rather than hiding in OTHER.
 */
const TITLE_BUCKETS: Array<[string, RegExp]> = [
  ["SUPERINTENDENT", /superintend|\bsupt\b/i], // municipal directories abbreviate it constantly
  ["MAINTENANCE", /maintenance|mechanic|millwright|\bmaint\b/i],
  ["OPERATIONS", /\boperations?\b|\bops\b|plant manager/i],
  ["FACILITIES", /facilit|building|grounds/i],
  ["ENGINEERING", /engineer/i],
  ["PURCHASING", /purchas|procure|buyer|contract|sourcing/i],
  ["DIRECTOR", /director|commissioner|administrator|\bdir\b/i],
  ["EXECUTIVE", /\bceo\b|\bcoo\b|\bcfo\b|owner|president|principal/i],
  ["TECHNICAL", /technician|technical|controls|instrument/i],
  ["CURATOR", /curator|collections|archivist|registrar/i],
];

export function titleBucket(title: string | null | undefined): string {
  if (!title) return "UNKNOWN";
  for (const [bucket, re] of TITLE_BUCKETS) if (re.test(title)) return bucket;
  return title.toUpperCase().replace(/[^A-Z ]/g, "").trim().slice(0, 24) || "UNKNOWN";
}

/** Frozen onto the prospect at contact time. See Prospect.featureSnapshot. */
export function featuresOf(p: {
  title?: string | null;
  orgType?: string | null;
  state?: string | null;
  sizeBucket?: string | null;
  hasProblemEvidence?: boolean;
}): Features {
  return {
    TITLE: titleBucket(p.title),
    ORG_TYPE: (p.orgType ?? "UNKNOWN").toUpperCase(),
    STATE: (p.state ?? "UNKNOWN").toUpperCase(),
    SIZE_BUCKET: (p.sizeBucket ?? "UNKNOWN").toUpperCase(),
    HAS_PROBLEM_EVIDENCE: p.hasProblemEvidence ? "YES" : "NO",
  };
}

type Outcome = "contacted" | "replied" | "qualifiedPain" | "commercial" | "negative" | "bounced";

/** Counts only. Nothing here is a model's opinion — every number is a thing
 *  that happened, which is what makes the targeting explanation defensible. */
export async function recordOutcome(
  experimentId: string,
  features: Features,
  outcome: Outcome,
): Promise<void> {
  for (const [feature, value] of Object.entries(features)) {
    await prisma.targetingStat.upsert({
      where: { experimentId_feature_value: { experimentId, feature, value } },
      create: { experimentId, feature, value, [outcome]: 1 },
      update: { [outcome]: { increment: 1 } },
    });
  }
}

export async function recordOutcomeForProspect(
  prospect: { experimentId: string; featureSnapshot: string },
  outcome: Outcome,
): Promise<void> {
  const features = parseJson<Features>(prospect.featureSnapshot, {});
  if (Object.keys(features).length === 0) return;
  await recordOutcome(prospect.experimentId, features, outcome);
}

export type TargetingInsight = {
  feature: string;
  value: string;
  contacted: number;
  qualifiedPain: number;
  rate: number;
  baselineRate: number;
  direction: "ABOVE" | "BELOW";
};

/**
 * Which observed feature values beat the experiment's own baseline, with the
 * sample sizes attached. Values under the minimum sample are excluded rather
 * than reported weakly, because a 1-of-1 hit rate of 100% is the most
 * persuasive wrong number this system could produce.
 */
export async function getTargetingInsights(experimentId: string): Promise<TargetingInsight[]> {
  const stats = await prisma.targetingStat.findMany({ where: { experimentId } });
  const totals = stats
    .filter((s) => s.feature === "TITLE")
    .reduce(
      (acc, s) => ({ contacted: acc.contacted + s.contacted, pain: acc.pain + s.qualifiedPain }),
      { contacted: 0, pain: 0 },
    );
  if (totals.contacted === 0) return [];
  const baseline = totals.pain / totals.contacted;

  return stats
    .filter((s) => s.contacted >= THRESHOLDS.targetingMinSample)
    .map((s) => {
      const rate = s.qualifiedPain / s.contacted;
      return {
        feature: s.feature,
        value: s.value,
        contacted: s.contacted,
        qualifiedPain: s.qualifiedPain,
        rate,
        baselineRate: baseline,
        direction: (rate >= baseline ? "ABOVE" : "BELOW") as "ABOVE" | "BELOW",
      };
    })
    .sort((a, b) => b.rate - a.rate);
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** The sentence handed to discovery. Says what moved and on what evidence. */
export async function getTargetingGuidance(experimentId: string): Promise<string | null> {
  const insights = await getTargetingInsights(experimentId);
  if (insights.length === 0) return null;

  const strong = insights.filter((i) => i.direction === "ABOVE" && i.qualifiedPain > 0);
  const weak = insights.filter((i) => i.direction === "BELOW");
  if (strong.length === 0 && weak.length === 0) return null;

  const lines: string[] = [];
  for (const i of strong.slice(0, 5)) {
    lines.push(
      `${i.feature} = ${i.value}: ${i.qualifiedPain} of ${i.contacted} contacted reported real pain (${pct(i.rate)}, vs ${pct(i.baselineRate)} overall). Favour these.`,
    );
  }
  for (const i of weak.slice(0, 3)) {
    lines.push(
      `${i.feature} = ${i.value}: ${i.qualifiedPain} of ${i.contacted} (${pct(i.rate)}, below the ${pct(i.baselineRate)} baseline). De-prioritise these.`,
    );
  }
  return lines.join("\n");
}

/** Same evidence, phrased for the qualifier rather than for discovery. */
export async function getObservedPatterns(experimentId: string): Promise<string[]> {
  const insights = await getTargetingInsights(experimentId);
  return insights
    .slice(0, 8)
    .map(
      (i) =>
        `${i.feature}=${i.value}: ${pct(i.rate)} qualified-pain rate over ${i.contacted} contacts (baseline ${pct(i.baselineRate)}).`,
    );
}
