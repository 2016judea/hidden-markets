import { z } from "zod";
import { parseJson } from "../../db";

/** The house style, prepended to every system prompt. */
export const HOUSE_RULES = `
You work for a small research operation that is trying to find out whether an
obscure market has a painful, expensive, recurring problem in it. You are not
selling anything yet. You are finding out what is true.

Non-negotiable:
- Never invent a fact, a name, an email address, a price, or a date. A null is
  always better than a plausible guess. You will be checked.
- Every material claim must be traceable to something you actually read. If you
  did not read it, do not assert it.
- Distinguish what a source states from what you inferred. Say which is which.
- Never write flattery, and never claim familiarity you do not have. No "I've
  been following your work", no "I was impressed by".
- Plain words. No startup vocabulary, no "solutions", no "leverage", no
  "reach out to touch base". Write the way a competent person writes to a
  stranger whose time is short.
`.trim();

export type ExperimentBrief = {
  id: string;
  name: string;
  hypothesis: string;
  buyerPersona: string;
  likelyProblem: string;
  offer: string;
  targetTitles: string[];
  targetOrgTypes: string[];
  targetGeography: string;
  exclusionCriteria: string[];
  qualificationCriteria: string[];
  researchStrategy: string;
  safetyNotes: string;
};

/** Renders the experiment the same way for every function, so a change to how
 *  an experiment is described cannot silently diverge between functions. */
export function briefText(b: ExperimentBrief): string {
  return [
    `EXPERIMENT: ${b.name}`,
    `HYPOTHESIS: ${b.hypothesis}`,
    `BUYER: ${b.buyerPersona}`,
    `SUSPECTED PROBLEM: ${b.likelyProblem}`,
    `WHAT WE CAN ACTUALLY OFFER: ${b.offer}`,
    `TARGET ORGANISATION TYPES: ${b.targetOrgTypes.join(", ") || "unspecified"}`,
    `TARGET ROLES: ${b.targetTitles.join(", ") || "unspecified"}`,
    `GEOGRAPHY: ${b.targetGeography}`,
    b.exclusionCriteria.length ? `DO NOT TARGET: ${b.exclusionCriteria.join("; ")}` : "",
    b.qualificationCriteria.length
      ? `A GOOD PROSPECT LOOKS LIKE: ${b.qualificationCriteria.join("; ")}`
      : "",
    b.researchStrategy ? `RESEARCH STRATEGY: ${b.researchStrategy}` : "",
    b.safetyNotes ? `SAFETY / REGULATORY: ${b.safetyNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function toBrief(row: {
  id: string;
  name: string;
  hypothesis: string;
  buyerPersona: string;
  likelyProblem: string;
  offer: string;
  targetTitles: string;
  targetOrgTypes: string;
  targetGeography: string;
  exclusionCriteria: string;
  qualificationCriteria: string;
  researchStrategy: string;
  safetyNotes: string;
}): ExperimentBrief {
  return {
    id: row.id,
    name: row.name,
    hypothesis: row.hypothesis,
    buyerPersona: row.buyerPersona,
    likelyProblem: row.likelyProblem,
    offer: row.offer,
    targetTitles: parseJson<string[]>(row.targetTitles, []),
    targetOrgTypes: parseJson<string[]>(row.targetOrgTypes, []),
    targetGeography: row.targetGeography,
    exclusionCriteria: parseJson<string[]>(row.exclusionCriteria, []),
    qualificationCriteria: parseJson<string[]>(row.qualificationCriteria, []),
    researchStrategy: row.researchStrategy,
    safetyNotes: row.safetyNotes,
  };
}

/** One sourced claim. The shape that makes an assertion auditable. */
export const EvidenceSchema = z.object({
  claim: z.string().min(3),
  sourceUrl: z.string().nullable(),
  quote: z.string().nullable(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;

/** Addresses that are real but are not a person, and are wasted sends. */
const ROLE_ADDRESS = /^(info|contact|sales|support|hello|admin|webmaster|office|enquiries|inquiries)@/i;

export function emailProblems(email: string | null, confidence: string | null): string[] {
  if (!email) return [];
  const out: string[] = [];
  if (!EMAIL_RE.test(email)) out.push(`"${email}" is not a valid email address.`);
  if (/example\.(com|org|net)$/i.test(email)) out.push(`"${email}" is a placeholder domain.`);
  if (ROLE_ADDRESS.test(email) && confidence === "VERIFIED") {
    out.push(`"${email}" is a generic role address; it cannot be VERIFIED as a named person's address.`);
  }
  return out;
}

/** A personalization fact is only usable if it points at something readable. */
export const PersonalizationFactSchema = z.object({
  fact: z.string().min(5),
  sourceUrl: z.string().nullable(),
  quote: z.string().nullable(),
  whyItMatters: z.string(),
});
export type PersonalizationFact = z.infer<typeof PersonalizationFactSchema>;

export function personalizationProblems(facts: PersonalizationFact[]): string[] {
  const out: string[] = [];
  for (const f of facts) {
    if (!f.sourceUrl) out.push(`Personalization fact "${f.fact.slice(0, 60)}…" has no source URL. Drop it or source it.`);
    if (/impressed|incredible|amazing|great work|admire|love what|passion/i.test(f.fact)) {
      out.push(`"${f.fact.slice(0, 60)}…" is flattery, not a fact.`);
    }
  }
  return out;
}

/** Language a first email must never contain. Checked, not merely requested. */
export const BANNED_EMAIL_PHRASES = [
  "i've been following",
  "i have been following",
  "your incredible",
  "impressed by your",
  "i was impressed",
  "touch base",
  "circle back",
  "quick win",
  "game-chang",
  "revolutionary",
  "synergy",
  "leverage our",
  "hope this email finds you well",
  "i hope this finds you well",
  "at your earliest convenience",
  "act now",
  "limited time",
  "don't miss out",
];

export function bannedPhraseProblems(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_EMAIL_PHRASES.filter((p) => lower.includes(p)).map(
    (p) => `The draft contains "${p}", which is on the banned list. Rewrite that sentence plainly.`,
  );
}

/** A number with a confidence, so an extraction never reads as more certain than it is. */
export function confidenceField<T extends z.ZodTypeAny>(inner: T) {
  return z.object({ value: inner.nullable(), confidence: z.number().min(0).max(1) });
}
