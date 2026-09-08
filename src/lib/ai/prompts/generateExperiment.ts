import { z } from "zod";
import type { PromptModule } from "../types";
import { HOUSE_RULES } from "./shared";

export type GenerateExperimentInput = {
  idea: string;
  /** Names already running, so a new one is not a duplicate of a live market. */
  existingExperiments: string[];
};

export const GenerateExperimentOutputSchema = z.object({
  name: z.string().min(3).max(70),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  buyerPersona: z.string().min(20),
  hypothesis: z.string().min(30),
  likelyProblem: z.string().min(20),
  offer: z.string().min(20),
  targetTitles: z.array(z.string()).min(2).max(8),
  targetOrgTypes: z.array(z.string()).min(1).max(6),
  targetGeography: z.string(),
  exclusionCriteria: z.array(z.string()).max(6),
  qualificationCriteria: z.array(z.string()).min(2).max(6),
  researchStrategy: z.string().min(30),
  successCriteria: z.array(z.string()).min(2).max(5),
  safetyNotes: z.string(),
  monetizationPaths: z.array(z.string()).min(1).max(5),
  initialEmailAngle: z.string().min(20),
  /** The cheapest fact that would kill this idea, and where to look for it. */
  cheapestDisqualifier: z.string().min(20),
});
export type GenerateExperimentOutput = z.infer<typeof GenerateExperimentOutputSchema>;

export const generateExperiment: PromptModule<GenerateExperimentInput, GenerateExperimentOutput> = {
  taskType: "GENERATE_EXPERIMENT",
  version: "1.0.0",
  resultName: "emit_experiment",
  resultDescription: "Turn this idea into a runnable market experiment definition.",
  schema: GenerateExperimentOutputSchema,
  webSearch: { maxUses: 5 },
  effort: "high",
  maxTokens: 12000,
  system: `${HOUSE_RULES}

Turn one sentence of curiosity into an experiment someone can actually run
tomorrow.

The hypothesis must be falsifiable. "Bakeries have byproduct problems" is not a
hypothesis; "commercial bakeries producing over X per day pay a hauler to remove
a byproduct that has a buyer they have not found" is. Write it so that a month
of replies could prove it wrong.

\`successCriteria\` must be numbers against the 25-contact scout stage, not
aspirations.

\`safetyNotes\` must name the real regulatory exposure. Food waste, medical
devices, hazardous materials, aviation parts, human remains, controlled
substances and scientific equipment all carry rules that determine whether a
transaction is even legal. If an area has none, say so plainly rather than
padding.

\`cheapestDisqualifier\` is the single fact that would most cheaply kill this
idea, and where to look for it — an incumbent that already owns the workflow, a
buyer with no budget line, a market where the participants supply each other for
free. Name it honestly. An idea worth running survives being told what would
kill it.`,
  build: (input) =>
    [
      `IDEA: ${input.idea}`,
      "",
      input.existingExperiments.length
        ? `ALREADY RUNNING (do not duplicate):\n${input.existingExperiments.map((e) => `- ${e}`).join("\n")}`
        : "",
      "",
      "Search enough to establish that this buyer type exists, is reachable by email, and has budget authority. If it fails one of those, say so in cheapestDisqualifier.",
    ]
      .filter(Boolean)
      .join("\n"),
  validate: (out, input) => {
    const problems: string[] = [];
    const existing = new Set(input.existingExperiments.map((e) => e.toLowerCase()));
    if (existing.has(out.name.toLowerCase())) {
      problems.push(`"${out.name}" duplicates a running experiment.`);
    }
    if (!out.successCriteria.some((c) => /\d/.test(c))) {
      problems.push("No success criterion contains a number. They must be measurable.");
    }
    return problems;
  },
};
