import { z } from "zod";
import type { PromptModule } from "../types";
import { HOUSE_RULES, briefText, type ExperimentBrief } from "./shared";

export type DiscoverInput = {
  brief: ExperimentBrief;
  count: number;
  /** Names already in the pipeline. The model must not return these again. */
  knownOrganizations: string[];
  /** Plain-language summary of what has actually worked so far, or null on the
   *  first batch. Deliberately a sentence, not a score, so it is auditable. */
  targetingGuidance: string | null;
};

const OrgSchema = z.object({
  name: z.string().min(2),
  website: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  organizationType: z.string(),
  sizeHint: z.string().nullable(),
  whyRelevant: z.string().min(10),
  problemEvidence: z.string().nullable(),
  sourceUrl: z.string().nullable(),
});

export const DiscoverOutputSchema = z.object({
  organizations: z.array(OrgSchema).max(40),
  searchNotes: z.string(),
  exhausted: z.boolean(),
});
export type DiscoverOutput = z.infer<typeof DiscoverOutputSchema>;

export const discoverOrganizations: PromptModule<DiscoverInput, DiscoverOutput> = {
  taskType: "DISCOVER_ORGANIZATIONS",
  version: "1.0.0",
  resultName: "emit_organizations",
  resultDescription: "Return the organizations you found and could verify exist.",
  schema: DiscoverOutputSchema,
  // Sized against DISCOVERY_BATCH (8 organizations), with room for a directory
  // page plus a verification query each. Measured 2026-09-07: a cap of 8 on a
  // 25-organization request was exhausted after two successful queries, and the
  // model then spent seven minutes retrying "Server tool use limit exceeded"
  // before returning six thinly-researched names. The cap must exceed what the
  // ask plausibly needs, or the call degrades into an expensive retry loop.
  webSearch: { maxUses: 20 },
  effort: "medium",
  maxTokens: 16000,
  system: `${HOUSE_RULES}

Your job is to find real organizations that match an experiment's buyer profile.

Search the web. Return only organizations you actually found a page for. A
directory listing, a member roster, a government facility index, an association
list, a licensing register — these are all good sources and usually better than
a general search.

Set \`exhausted\` to true if you genuinely could not find more organizations of
this type in this geography. That is a useful finding, not a failure: it tells
the operator the market may be smaller than the experiment assumes.

Set \`problemEvidence\` only when a source says something suggesting the
hypothesised problem exists at that specific organization — an ageing asset, a
capital plan, a procurement notice, a complaint. Leave it null otherwise. Most
organizations will have null here and that is correct.`,
  build: (input) =>
    [
      briefText(input.brief),
      "",
      `Find up to ${input.count} organizations that fit this experiment.`,
      input.knownOrganizations.length
        ? `ALREADY IN OUR PIPELINE — do not return any of these:\n${input.knownOrganizations
            .slice(0, 200)
            .map((n) => `- ${n}`)
            .join("\n")}`
        : "",
      input.targetingGuidance
        ? `WHAT WE HAVE OBSERVED SO FAR (bias your search accordingly):\n${input.targetingGuidance}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  validate: (out, input) => {
    const problems: string[] = [];
    const known = new Set(input.knownOrganizations.map((n) => n.toLowerCase().trim()));
    for (const o of out.organizations) {
      if (known.has(o.name.toLowerCase().trim())) {
        problems.push(`"${o.name}" is already in the pipeline and was explicitly excluded.`);
      }
      if (o.problemEvidence && !o.sourceUrl) {
        problems.push(`"${o.name}" asserts problem evidence with no source URL.`);
      }
    }
    return problems;
  },
};
