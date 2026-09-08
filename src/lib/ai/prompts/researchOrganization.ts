import { z } from "zod";
import type { PromptModule } from "../types";
import {
  EvidenceSchema,
  HOUSE_RULES,
  briefText,
  type ExperimentBrief,
} from "./shared";

export type ResearchInput = {
  brief: ExperimentBrief;
  organizationName: string;
  website: string | null;
  city: string | null;
  state: string | null;
};

export const ResearchOutputSchema = z.object({
  confirmedRealOrganization: z.boolean(),
  organizationType: z.string().nullable(),
  website: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  sizeBucket: z.enum(["MICRO", "SMALL", "MID", "LARGE", "UNKNOWN"]),
  summary: z.string(),
  relevanceReason: z.string(),
  /** Does the hypothesised problem plausibly exist here, and on what basis. */
  likelyProblemFit: z.string(),
  problemSignals: z.array(EvidenceSchema).max(6),
  facts: z.array(EvidenceSchema).max(10),
  disqualifying: z.string().nullable(),
});
export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;

export const researchOrganization: PromptModule<ResearchInput, ResearchOutput> = {
  taskType: "RESEARCH_ORGANIZATION",
  version: "1.0.0",
  resultName: "emit_research",
  resultDescription: "Return what you established about this organization, with sources.",
  schema: ResearchOutputSchema,
  webSearch: { maxUses: 6 },
  effort: "medium",
  maxTokens: 12000,
  system: `${HOUSE_RULES}

Research one organization and decide whether it belongs in this experiment.

Look for evidence that the hypothesised problem exists HERE specifically —
equipment they operate, a capital or replacement plan, a procurement record, a
public complaint, a regulatory filing, an age of infrastructure. Absence of
evidence is a legitimate answer; say so in \`likelyProblemFit\` rather than
manufacturing a reason.

Set \`disqualifying\` when you find a concrete reason this organization should be
dropped — it does not exist, it closed, it is the wrong sector, it falls under
the experiment's exclusions, or it is obviously a supplier rather than a buyer.
Be willing to disqualify. A rejected candidate costs nothing; a bad email costs
the operator's credibility.`,
  build: (input) =>
    [
      briefText(input.brief),
      "",
      "RESEARCH THIS ORGANIZATION:",
      `Name: ${input.organizationName}`,
      input.website ? `Website: ${input.website}` : "",
      input.city || input.state ? `Location: ${[input.city, input.state].filter(Boolean).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  validate: (out) => {
    const problems: string[] = [];
    for (const s of out.problemSignals) {
      if (!s.sourceUrl) problems.push(`Problem signal "${s.claim.slice(0, 50)}…" has no source URL.`);
    }
    if (out.confirmedRealOrganization && out.facts.every((f) => !f.sourceUrl) && out.facts.length > 0) {
      problems.push("No fact carries a source URL. Cite what you read or return no facts.");
    }
    return problems;
  },
};
