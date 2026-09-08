import { z } from "zod";
import type { PromptModule } from "../types";
import { HOUSE_RULES, briefText, type ExperimentBrief } from "./shared";

export type AnalyzeInput = {
  brief: ExperimentBrief;
  stage: string;
  counts: {
    contacted: number;
    replied: number;
    qualifiedPain: number;
    commercial: number;
    negative: number;
    bounced: number;
    transactionOpportunities: number;
  };
  painSignals: Array<{ category: string; summary: string; verbatim: string; urgency: string }>;
  /** Observed reply rates per feature, computed from the database, not judged. */
  observedTargeting: Array<{ feature: string; value: string; contacted: number; qualifiedPain: number }>;
  negativeQuotes: string[];
  previousMemoLearning: string | null;
};

export const AnalyzeOutputSchema = z.object({
  learning: z.string().min(40),
  strongestEvidence: z.array(z.string()).max(6),
  weakestAssumptions: z.array(z.string()).max(6),
  emergingBuyerProfile: z.string().nullable(),
  commonProblems: z.array(z.string()).max(8),
  commercialEvidence: z.array(z.string()).max(6),
  surprises: z.array(z.string()).max(5),
  recommendedNext: z.string().min(20),
  stageRecommendation: z.enum(["HOLD", "PROMOTE", "TERMINATE"]),
  stageRationale: z.string().min(20),
});
export type AnalyzeOutput = z.infer<typeof AnalyzeOutputSchema>;

export const analyzeExperiment: PromptModule<AnalyzeInput, AnalyzeOutput> = {
  taskType: "ANALYZE_EXPERIMENT",
  version: "1.0.0",
  resultName: "emit_memo",
  resultDescription: "Write the living memo for this market.",
  schema: AnalyzeOutputSchema,
  effort: "high",
  maxTokens: 12000,
  system: `${HOUSE_RULES}

Write the standing memo on what one market is telling us. The operator reads
this to decide where to spend the next month.

Rules that make this memo worth reading:
- Sample size governs everything. With 8 contacts you have an anecdote. Say so.
  Never report a percentage of a denominator under 20 without naming the
  denominator in the same sentence.
- \`weakestAssumptions\` is the section that earns the memo. Name what the
  experiment assumed and has NOT shown. Silence in a market is evidence, and
  the most common honest finding is that the pain we posited is not there.
- \`surprises\` means something you did not expect from the hypothesis. If
  nothing surprised you, return an empty array rather than padding it.
- Quote people. A verbatim line from a superintendent is worth more than any
  characterisation of it.
- TERMINATE is a real recommendation and you should be willing to make it. A
  market that has produced no pain signal after a full stage is a finding, and
  the operator's cost of continuing is high.
- PROMOTE only when the evidence would survive someone hostile reading it.`,
  build: (input) => {
    const c = input.counts;
    const rate = (n: number) => (c.contacted > 0 ? `${((n / c.contacted) * 100).toFixed(1)}%` : "n/a");
    return [
      briefText(input.brief),
      `\nCURRENT STAGE: ${input.stage}`,
      "",
      "OBSERVED:",
      `- Contacted: ${c.contacted}`,
      `- Replied: ${c.replied} (${rate(c.replied)})`,
      `- Qualified pain: ${c.qualifiedPain} (${rate(c.qualifiedPain)})`,
      `- Commercial signals: ${c.commercial}`,
      `- Explicit no: ${c.negative}`,
      `- Bounced: ${c.bounced}`,
      `- Transaction opportunities: ${c.transactionOpportunities}`,
      "",
      input.observedTargeting.length
        ? "BY FEATURE (contacted -> qualified pain):\n" +
          input.observedTargeting
            .map((t) => `- ${t.feature}=${t.value}: ${t.contacted} contacted, ${t.qualifiedPain} with pain`)
            .join("\n")
        : "BY FEATURE: not enough data yet.",
      "",
      input.painSignals.length
        ? "PAIN SIGNALS:\n" +
          input.painSignals
            .map((p) => `- [${p.category} / ${p.urgency}] ${p.summary}\n  "${p.verbatim}"`)
            .join("\n")
        : "PAIN SIGNALS: none recorded.",
      "",
      input.negativeQuotes.length
        ? "WHAT THE NOES SAID:\n" + input.negativeQuotes.map((q) => `- "${q}"`).join("\n")
        : "",
      input.previousMemoLearning ? `\nPREVIOUS MEMO SAID:\n${input.previousMemoLearning}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  },
  validate: (out, input) => {
    const problems: string[] = [];
    // A recommendation to spend more of the operator's month needs a real
    // denominator behind it, not three replies that felt encouraging.
    if (out.stageRecommendation === "PROMOTE" && input.counts.qualifiedPain === 0) {
      problems.push("You recommended PROMOTE with zero qualified pain signals. Justify or change the recommendation.");
    }
    if (input.counts.contacted < 5 && out.stageRecommendation !== "HOLD") {
      problems.push(
        `Only ${input.counts.contacted} contacts have been made. The only defensible recommendation is HOLD.`,
      );
    }
    return problems;
  },
};
