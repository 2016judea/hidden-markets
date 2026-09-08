import { z } from "zod";
import type { PromptModule } from "../types";
import {
  HOUSE_RULES,
  bannedPhraseProblems,
  briefText,
  type ExperimentBrief,
  type PersonalizationFact,
} from "./shared";

export type DraftInput = {
  brief: ExperimentBrief;
  kind: "INITIAL" | "FOLLOWUP" | "REFERRAL_INTRO";
  sequenceIndex: number;
  organizationName: string;
  contactName: string | null;
  title: string | null;
  city: string | null;
  state: string | null;
  personalizationFacts: PersonalizationFact[];
  problemSignals: Array<{ claim: string; sourceUrl: string | null }>;
  operatorName: string;
  /** For a follow-up: what we already sent, so it does not repeat itself. */
  previousMessages: Array<{ subject: string; body: string; sentAt: string }>;
  /** For a referral intro: who sent us and what they actually said. */
  referral: { fromName: string; fromTitle: string | null; quote: string } | null;
};

export const DraftOutputSchema = z.object({
  subject: z.string().min(3).max(120),
  body: z.string().min(40),
  altSubject: z.string().nullable(),
  altBody: z.string().nullable(),
  rationale: z.string().min(10),
  personalizationUsed: z.array(z.string()),
  hypothesisTested: z.string().min(5),
  confidence: z.number().min(0).max(1),
  /** True when the draft promises anything we have not verified we can do. */
  containsCommitment: z.boolean(),
});
export type DraftOutput = z.infer<typeof DraftOutputSchema>;

const SHARED_STYLE = `
What a good email here does: it makes one narrow, concrete, answerable
observation or question about how they currently handle a specific thing, and it
is easy to reply to in one line.

What it does not do: book a demo, describe us, describe a product, use the word
"solution", open with a compliment, or ask for 15 minutes.

Shape:
- Subject: lowercase or sentence case, six words or fewer, no colon-separated
  marketing construction, reads like a colleague wrote it.
- Body: 60-110 words. Three short paragraphs at most.
- Say plainly who we are in one clause, without a pitch.
- Ask one question about their CURRENT behaviour. "What do you do when X" beats
  "do you have a problem with X", because the first gets an answer and the
  second gets a yes or a no.
- Sign with the operator's first name only.

You are trying to find out what is true, not to convert anyone. An email that
gets a two-line honest answer is a complete success.`.trim();

export const draftOutboundEmail: PromptModule<DraftInput, DraftOutput> = {
  taskType: "DRAFT_OUTREACH",
  version: "1.0.0",
  resultName: "emit_draft",
  resultDescription: "Return the email to send, plus why you wrote it that way.",
  schema: DraftOutputSchema,
  effort: "medium",
  maxTokens: 6000,
  system: `${HOUSE_RULES}

You draft one cold email that a human will read before it sends.

${SHARED_STYLE}

Personalization: use a supplied fact ONLY if it makes the email obviously more
relevant to this reader. Many good emails use none — an unpersonalized email
that asks a sharp question beats a personalized one that asks a vague one. Never
personalize from a fact you were not given. List in \`personalizationUsed\`
exactly the facts you used, verbatim, and nothing else.

Set \`containsCommitment\` true if your draft states or implies a price, a
delivery date, a warranty, a technical compatibility claim, or an agreement to
buy or supply. Those need a human, so flag them honestly rather than softening
the wording to slip past.`,
  build: (input) => {
    const parts = [
      briefText(input.brief),
      "",
      `RECIPIENT: ${input.contactName ?? "(name unknown — write it so it reads correctly without one)"}`,
      input.title ? `Their role: ${input.title}` : "",
      `Their organization: ${input.organizationName}${
        [input.city, input.state].filter(Boolean).length
          ? ` (${[input.city, input.state].filter(Boolean).join(", ")})`
          : ""
      }`,
      `Sign as: ${input.operatorName}`,
      "",
    ];

    if (input.personalizationFacts.length) {
      parts.push(
        "FACTS YOU MAY USE (only these, only if they help):",
        ...input.personalizationFacts.map((f) => `- ${f.fact} [${f.sourceUrl ?? "unsourced — do not use"}]`),
        "",
      );
    }
    if (input.problemSignals.length) {
      parts.push(
        "EVIDENCE THE PROBLEM MAY EXIST HERE:",
        ...input.problemSignals.map((s) => `- ${s.claim}`),
        "",
      );
    }

    if (input.kind === "REFERRAL_INTRO" && input.referral) {
      parts.push(
        "THIS IS A REFERRAL. It actually happened, so you may reference it.",
        `${input.referral.fromName}${input.referral.fromTitle ? ` (${input.referral.fromTitle})` : ""} wrote to us:`,
        `"${input.referral.quote}"`,
        "Open by naming who sent you, in one clause. Do not overstate the warmth of it — they passed us on, they did not vouch for us.",
        "",
      );
    }

    if (input.kind === "FOLLOWUP") {
      parts.push(
        `THIS IS FOLLOW-UP #${input.sequenceIndex}. They did not reply to:`,
        ...input.previousMessages.map((m) => `--- sent ${m.sentAt}\nSubject: ${m.subject}\n${m.body}`),
        "",
        "Write a SHORT follow-up — under 60 words. No manufactured urgency, no",
        "'just bumping this', no guilt. Either ask the question a different and",
        "simpler way, or offer them the easy out of saying it is not their area",
        "(which is itself a useful answer, and often produces a referral).",
        "",
      );
    }

    return parts.filter(Boolean).join("\n");
  },
  validate: (out, input) => {
    const problems = [
      ...bannedPhraseProblems(out.subject),
      ...bannedPhraseProblems(out.body),
    ];
    const allowed = new Set(input.personalizationFacts.map((f) => f.fact));
    for (const used of out.personalizationUsed) {
      if (!allowed.has(used)) {
        problems.push(`"${used.slice(0, 60)}…" is listed as personalization but was not supplied to you.`);
      }
    }
    const words = out.body.split(/\s+/).length;
    if (input.kind === "FOLLOWUP" && words > 90) {
      problems.push(`Follow-up is ${words} words. Cut it under 60.`);
    }
    if (words > 170) problems.push(`Body is ${words} words. Cut it under 110.`);
    if (/\{\{|\[\[|<name>|\[NAME\]|XXX/i.test(out.body)) {
      problems.push("The body contains an unfilled template placeholder.");
    }
    if (input.kind === "REFERRAL_INTRO" && input.referral) {
      const first = input.referral.fromName.split(/\s+/)[0];
      if (first && !out.body.includes(first)) {
        problems.push(`A referral email must name ${input.referral.fromName}, who made the referral.`);
      }
    }
    return problems;
  },
  confidence: (out) => out.confidence,
};
