import { z } from "zod";
import type { PromptModule } from "../types";
import { HOUSE_RULES, emailProblems } from "./shared";

export type ContactInput = {
  organizationName: string;
  website: string | null;
  contactName: string | null;
  title: string | null;
  currentEmail: string | null;
  currentConfidence: string | null;
};

export const ContactOutputSchema = z.object({
  email: z.string().nullable(),
  emailConfidence: z.enum(["VERIFIED", "INFERRED", "GUESSED", "UNKNOWN"]),
  emailBasis: z.string().nullable(),
  phone: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  /** Set when a better-suited person turned up while looking for the address. */
  betterContactName: z.string().nullable(),
  betterContactTitle: z.string().nullable(),
  notes: z.string(),
});
export type ContactOutput = z.infer<typeof ContactOutputSchema>;

/**
 * Deliberately separate from identifyDecisionMakers. Finding who to talk to and
 * finding how to reach them fail in different ways and are worth retrying
 * independently — re-running discovery because an address was missing wastes
 * the research that was already correct.
 */
export const extractVerifiedContactInfo: PromptModule<ContactInput, ContactOutput> = {
  taskType: "FIND_CONTACT",
  version: "1.0.0",
  resultName: "emit_contact",
  resultDescription: "Return the best publicly available business contact details for this person.",
  schema: ContactOutputSchema,
  webSearch: { maxUses: 5 },
  effort: "medium",
  maxTokens: 8000,
  system: `${HOUSE_RULES}

Find a published, business contact address for one named person. Public agency
staff directories, meeting minutes, permit and licence filings, and press
releases are the usual places an address is actually printed.

Only business contact details. Never a personal address, never a home phone,
never anything behind a login or scraped from a private source.

The confidence values mean exactly what they say — see below — and you must not
inflate them:
- VERIFIED: you saw this address published, and you can cite the page.
- INFERRED: you confirmed the organization's address pattern from at least two
  published addresses, and you have this person's real name.
- GUESSED: a pattern guess without that confirmation.
- UNKNOWN: return null.

If while searching you find someone who clearly owns this problem more than the
person named, put them in \`betterContactName\`/\`betterContactTitle\`. Do not
silently substitute them.`,
  build: (input) =>
    [
      `ORGANIZATION: ${input.organizationName}`,
      input.website ? `Website: ${input.website}` : "",
      `PERSON: ${input.contactName ?? "(name not yet known)"}${input.title ? ` — ${input.title}` : ""}`,
      input.currentEmail
        ? `We currently have "${input.currentEmail}" at confidence ${input.currentConfidence}. Confirm, correct, or improve it.`
        : "We have no address for this person.",
    ]
      .filter(Boolean)
      .join("\n"),
  validate: (out) => {
    const problems = emailProblems(out.email, out.emailConfidence);
    if (out.emailConfidence === "VERIFIED" && !out.sourceUrl) {
      problems.push("VERIFIED requires the URL of the page the address was published on.");
    }
    if (out.emailConfidence === "INFERRED" && !out.emailBasis) {
      problems.push("INFERRED requires the address pattern you inferred from.");
    }
    return problems;
  },
  confidence: (out) =>
    ({ VERIFIED: 0.95, INFERRED: 0.6, GUESSED: 0.3, UNKNOWN: 0 })[out.emailConfidence] ?? null,
};
