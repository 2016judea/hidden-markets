import { z } from "zod";
import type { PromptModule } from "../types";
import { HOUSE_RULES, briefText, type ExperimentBrief } from "./shared";

export type PrescreenInput = {
  brief: ExperimentBrief;
  /** Only what a directory listing gives. No research has been paid for yet. */
  organizationName: string;
  orgType: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  listedAs: string | null;
};

export const PrescreenOutputSchema = z.object({
  verdict: z.enum(["KEEP", "DROP"]),
  reason: z.string().min(10),
  /** How sure, so a borderline DROP can be treated as a KEEP if we choose. */
  confidence: z.number().min(0).max(1),
});
export type PrescreenOutput = z.infer<typeof PrescreenOutputSchema>;

/**
 * The cheapest possible gate, and the highest-leverage one.
 *
 * Measured 2026-09-08 on the first real run: 262 research passes produced 14
 * drafts. Of 218 rejections, 76 came AFTER paying for both research and a
 * decision-maker hunt — about $0.24 each — and a further 126 during research.
 * Most were obvious from the listing alone: an electrical contractor in an
 * experiment that excludes contractors, a consumer toy retailer, a Harbor
 * Freight, a national chain in an independents-only experiment.
 *
 * This runs on the directory row before a penny of research, searches nothing,
 * and costs about a cent. It is deliberately timid: it may only DROP on
 * something legible in the listing, because a wrong DROP is invisible — the
 * candidate simply never gets looked at again.
 */
export const prescreenCandidate: PromptModule<PrescreenInput, PrescreenOutput> = {
  taskType: "PRESCREEN_CANDIDATE",
  version: "1.0.0",
  resultName: "emit_prescreen",
  resultDescription: "Decide from the listing alone whether this is worth researching.",
  schema: PrescreenOutputSchema,
  effort: "low",
  maxTokens: 1500,
  system: `${HOUSE_RULES}

You are the cheap gate in front of an expensive one. All you have is a business
directory listing: a name, a category, a town, maybe a website. Research has not
happened and will cost real money, so your only job is to catch the candidates
that are obviously wrong before anyone pays for them.

DROP only on something legible in the listing itself:
- The category is plainly a different industry to the experiment's.
- The name plainly identifies a national chain or franchise where the experiment
  wants independents (or the reverse).
- The listing plainly matches one of the experiment's stated exclusions.
- It is plainly a consumer retailer, a personal service or a private residence
  where the experiment wants a business buyer.

KEEP everything else, including everything you are merely unsure about. You are
not judging whether the hypothesis holds here — that is what the research is
for, and it has evidence you do not. A wrong DROP is invisible: nobody ever
looks at that candidate again, and the experiment quietly loses a real buyer
without anybody knowing. A wrong KEEP costs about twenty-four cents.

When in doubt, KEEP. Being timid here is correct.`,
  build: (input) =>
    [
      briefText(input.brief),
      "",
      "THE LISTING, WHICH IS ALL YOU HAVE:",
      `Name: ${input.organizationName}`,
      input.listedAs ? `Listed as: ${input.listedAs}` : "",
      input.orgType ? `Directory category: ${input.orgType}` : "",
      `Location: ${[input.city, input.state].filter(Boolean).join(", ") || "not stated"}`,
      input.website ? `Website: ${input.website}` : "Website: none listed",
    ]
      .filter(Boolean)
      .join("\n"),
  validate: (out) => {
    // A DROP the model is not sure about is not a DROP. Forcing it to say so
    // keeps the timidity honest rather than aspirational.
    if (out.verdict === "DROP" && out.confidence < 0.7) {
      return [
        `You returned DROP at confidence ${out.confidence}. A drop is permanent and unreviewed, so it needs 0.7 or better. If you are not that sure, return KEEP.`,
      ];
    }
    return [];
  },
  confidence: (out) => out.confidence,
};
