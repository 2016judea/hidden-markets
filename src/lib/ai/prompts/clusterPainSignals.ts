import { z } from "zod";
import type { PromptModule } from "../types";
import { HOUSE_RULES } from "./shared";

export type ClusterInput = {
  signals: Array<{
    id: string;
    experimentName: string;
    category: string;
    summary: string;
    manufacturer: string | null;
    requestedItem: string | null;
    urgency: string;
  }>;
};

export const ClusterOutputSchema = z.object({
  clusters: z
    .array(
      z.object({
        label: z.string().min(3).max(60),
        description: z.string().min(20),
        signalIds: z.array(z.string()).min(2),
        industries: z.array(z.string()).max(8),
        estimatedValue: z.enum(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]),
        rationale: z.string().min(20),
      }),
    )
    .max(10),
  crossMarketFindings: z
    .array(
      z.object({
        finding: z.string().min(20),
        experiments: z.array(z.string()).min(2),
        whyItMatters: z.string().min(20),
      }),
    )
    .max(5),
});
export type ClusterOutput = z.infer<typeof ClusterOutputSchema>;

export const clusterPainSignals: PromptModule<ClusterInput, ClusterOutput> = {
  taskType: "CLUSTER_PAIN",
  version: "1.0.0",
  resultName: "emit_clusters",
  resultDescription: "Group these pain signals by the problem they share.",
  schema: ClusterOutputSchema,
  effort: "high",
  maxTokens: 12000,
  system: `${HOUSE_RULES}

Group pain signals by the problem they share, not by the industry they came
from. This is the most valuable thing you do, because the winning business is
more often a problem shape than a buyer list: a municipality, a ski resort, an
airport and a laboratory all failing to source an obsolete control board is not
four markets, it is one market that nobody has named yet.

Rules:
- A cluster needs at least two signals. Do not create a cluster of one.
- Set \`crossMarketFindings\` when a cluster spans two or more experiments and
  the span is the interesting part. Say plainly what the real market might be,
  and be willing to say that it is not what any of the experiments assumed.
- \`estimatedValue\` is a judgement about the money in the problem — how often it
  recurs, how urgent it is when it happens, how much the buyer would plausibly
  pay. Return UNKNOWN when the signals do not support a guess. UNKNOWN is a
  perfectly good answer and much better than an invented one.
- Only use the signal IDs you were given.`,
  build: (input) =>
    [
      "PAIN SIGNALS:",
      ...input.signals.map(
        (s) =>
          `- [${s.id}] (${s.experimentName}) ${s.category}: ${s.summary}` +
          (s.manufacturer ? ` | manufacturer: ${s.manufacturer}` : "") +
          (s.requestedItem ? ` | item: ${s.requestedItem}` : "") +
          ` | urgency: ${s.urgency}`,
      ),
    ].join("\n"),
  validate: (out, input) => {
    const known = new Set(input.signals.map((s) => s.id));
    const problems: string[] = [];
    for (const c of out.clusters) {
      for (const id of c.signalIds) {
        if (!known.has(id)) problems.push(`Cluster "${c.label}" references unknown signal id ${id}.`);
      }
      if (new Set(c.signalIds).size < 2) {
        problems.push(`Cluster "${c.label}" has fewer than two distinct signals.`);
      }
    }
    return problems;
  },
};
