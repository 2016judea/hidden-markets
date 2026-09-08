import { z } from "zod";
import type { PromptModule } from "../types";
import { HOUSE_RULES, PersonalizationFactSchema, briefText, personalizationProblems, type ExperimentBrief } from "./shared";

export type QualifyInput = {
  brief: ExperimentBrief;
  organizationName: string;
  organizationType: string | null;
  city: string | null;
  state: string | null;
  contactName: string | null;
  title: string | null;
  emailConfidence: string | null;
  researchSummary: string;
  relevanceReason: string;
  likelyProblemFit: string;
  problemSignals: Array<{ claim: string; sourceUrl: string | null }>;
  /** What replies have actually taught us. Empty on the first batch. */
  observedPatterns: string[];
};

/**
 * Six named components, each 0-100 with its own reason. The total is their
 * weighted mean, computed in TypeScript — the model never returns the score
 * itself, because a single number it chose is exactly the opaque ranking the
 * brief rules out.
 */
const ComponentSchema = z.object({
  score: z.number().min(0).max(100),
  reason: z.string().min(5),
});

export const QualifyOutputSchema = z.object({
  buyerFit: ComponentSchema,
  problemLikelihood: ComponentSchema,
  contactAuthority: ComponentSchema,
  organizationFit: ComponentSchema,
  evidenceQuality: ComponentSchema,
  verdict: z.enum(["QUALIFIED", "WEAK", "REJECT"]),
  verdictReason: z.string().min(10),
  personalizationFacts: z.array(PersonalizationFactSchema).max(3),
  confidence: z.number().min(0).max(1),
});
export type QualifyOutput = z.infer<typeof QualifyOutputSchema>;

export const QUALIFY_WEIGHTS = {
  buyerFit: 0.25,
  problemLikelihood: 0.3,
  contactAuthority: 0.2,
  organizationFit: 0.1,
  evidenceQuality: 0.15,
} as const;

/** Email confidence is a deterministic penalty, not something a model judges. */
export const EMAIL_CONFIDENCE_PENALTY: Record<string, number> = {
  VERIFIED: 0,
  INFERRED: 8,
  GUESSED: 20,
  UNKNOWN: 35,
};

export function computeQualificationScore(
  out: QualifyOutput,
  emailConfidence: string | null,
): { total: number; breakdown: Record<string, unknown> } {
  const parts = {
    buyerFit: out.buyerFit,
    problemLikelihood: out.problemLikelihood,
    contactAuthority: out.contactAuthority,
    organizationFit: out.organizationFit,
    evidenceQuality: out.evidenceQuality,
  };
  let weighted = 0;
  for (const [k, w] of Object.entries(QUALIFY_WEIGHTS)) {
    weighted += parts[k as keyof typeof parts].score * w;
  }
  const penalty = EMAIL_CONFIDENCE_PENALTY[emailConfidence ?? "UNKNOWN"] ?? 35;
  const total = Math.max(0, Math.min(100, Math.round(weighted - penalty)));
  return {
    total,
    breakdown: {
      components: Object.fromEntries(
        Object.entries(parts).map(([k, v]) => [
          k,
          { score: v.score, weight: QUALIFY_WEIGHTS[k as keyof typeof QUALIFY_WEIGHTS], reason: v.reason },
        ]),
      ),
      weightedSubtotal: Math.round(weighted),
      emailConfidence: emailConfidence ?? "UNKNOWN",
      emailConfidencePenalty: penalty,
      total,
    },
  };
}

export const qualifyProspect: PromptModule<QualifyInput, QualifyOutput> = {
  taskType: "QUALIFY_PROSPECT",
  version: "1.0.0",
  resultName: "emit_qualification",
  resultDescription: "Score this candidate on each named dimension and give a verdict.",
  schema: QualifyOutputSchema,
  effort: "low",
  maxTokens: 6000,
  system: `${HOUSE_RULES}

Score one candidate on five dimensions. Each score needs a one-sentence reason
that a person could disagree with. Do not return an overall score — the
application computes it from your components, so that anyone can see which part
of the judgement carried the weight.

The dimensions:
- buyerFit: does this organization type buy the kind of thing we are testing?
- problemLikelihood: is there evidence the problem exists at this specific place?
- contactAuthority: would THIS person deal with it, or would they forward it?
- organizationFit: size, geography, sector against the experiment's targeting.
- evidenceQuality: how much of the above rests on something we actually read?

Verdicts: QUALIFIED means worth an email. WEAK means we could email but should
not while better candidates exist. REJECT means never — wrong sector, excluded,
not a buyer, defunct.

Personalization facts are optional and usually should be empty. Include one only
when it is specific, sourced, and would make the email obviously relevant to
this reader. A fact you can't source is worse than no fact.`,
  build: (input) =>
    [
      briefText(input.brief),
      "",
      "CANDIDATE:",
      `Organization: ${input.organizationName}${input.organizationType ? ` (${input.organizationType})` : ""}`,
      `Location: ${[input.city, input.state].filter(Boolean).join(", ") || "unknown"}`,
      `Person: ${input.contactName ?? "unknown"}${input.title ? ` — ${input.title}` : ""}`,
      `Email confidence: ${input.emailConfidence ?? "UNKNOWN"}`,
      "",
      `What research found: ${input.researchSummary}`,
      `Why it looked relevant: ${input.relevanceReason}`,
      `Problem fit: ${input.likelyProblemFit}`,
      input.problemSignals.length
        ? `Problem signals:\n${input.problemSignals.map((s) => `- ${s.claim}${s.sourceUrl ? ` [${s.sourceUrl}]` : " [UNSOURCED]"}`).join("\n")}`
        : "Problem signals: none found.",
      input.observedPatterns.length
        ? `\nWHAT THIS EXPERIMENT HAS ACTUALLY OBSERVED SO FAR:\n${input.observedPatterns.map((p) => `- ${p}`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  validate: (out) => personalizationProblems(out.personalizationFacts),
  confidence: (out) => out.confidence,
};
