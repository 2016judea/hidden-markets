import { z } from "zod";
import type { PromptModule } from "../types";
import { HOUSE_RULES, briefText, emailProblems, type ExperimentBrief } from "./shared";

export type DecisionMakerInput = {
  brief: ExperimentBrief;
  organizationName: string;
  website: string | null;
  organizationSummary: string;
};

const PersonSchema = z.object({
  name: z.string().nullable(),
  title: z.string(),
  email: z.string().nullable(),
  emailConfidence: z.enum(["VERIFIED", "INFERRED", "GUESSED", "UNKNOWN"]),
  emailBasis: z.string().nullable(),
  phone: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  buyingRelevance: z.string(),
  matchesTargetTitle: z.boolean(),
});

export const DecisionMakerOutputSchema = z.object({
  people: z.array(PersonSchema).max(6),
  notes: z.string(),
});
export type DecisionMakerOutput = z.infer<typeof DecisionMakerOutputSchema>;

export const identifyDecisionMakers: PromptModule<DecisionMakerInput, DecisionMakerOutput> = {
  taskType: "IDENTIFY_DECISION_MAKERS",
  version: "1.0.0",
  resultName: "emit_people",
  resultDescription: "Return the people at this organization who would own this problem.",
  schema: DecisionMakerOutputSchema,
  webSearch: { maxUses: 6 },
  effort: "medium",
  maxTokens: 10000,
  system: `${HOUSE_RULES}

Find the person at this organization who would personally deal with the problem
in the hypothesis. Public sector staff directories, council minutes, permit
filings, conference speaker lists and association rosters are all fair game.

Email confidence is the most important field on this form and it has exactly
four honest values:

- VERIFIED — you saw this exact address published on a page you can cite.
- INFERRED — you did not see the address, but you saw the organization's
  pattern (e.g. two published addresses both first.last@domain) AND you have the
  person's real name. Say the pattern in \`emailBasis\`.
- GUESSED — you are pattern-matching without confirmation of the pattern.
- UNKNOWN — leave \`email\` null.

Never upgrade your own confidence. An INFERRED address labelled VERIFIED is the
single worst thing you can do here, because it removes the human's ability to
apply their own judgement to it.

Prefer one right person to four plausible ones. A generic info@ address is a
last resort, and is never VERIFIED for a named individual.`,
  build: (input) =>
    [
      briefText(input.brief),
      "",
      `ORGANIZATION: ${input.organizationName}`,
      input.website ? `Website: ${input.website}` : "",
      `What we know: ${input.organizationSummary}`,
      "",
      `Find whoever holds one of these roles or its local equivalent: ${input.brief.targetTitles.join(", ")}.`,
    ]
      .filter(Boolean)
      .join("\n"),
  validate: (out) => {
    const problems: string[] = [];
    for (const p of out.people) {
      problems.push(...emailProblems(p.email, p.emailConfidence));
      if (p.emailConfidence === "VERIFIED" && !p.sourceUrl) {
        problems.push(`${p.name ?? p.title}: an address cannot be VERIFIED without a source URL.`);
      }
      if (p.emailConfidence === "INFERRED" && !p.emailBasis) {
        problems.push(`${p.name ?? p.title}: an INFERRED address must state the pattern it was inferred from.`);
      }
      if (p.email && p.emailConfidence === "UNKNOWN") {
        problems.push(`${p.name ?? p.title}: you gave an address but marked confidence UNKNOWN. Pick one.`);
      }
    }
    return problems;
  },
};
