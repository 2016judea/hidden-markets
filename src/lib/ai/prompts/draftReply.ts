import { z } from "zod";
import type { PromptModule } from "../types";
import { HOUSE_RULES, bannedPhraseProblems, briefText, type ExperimentBrief } from "./shared";

export type DraftReplyInput = {
  brief: ExperimentBrief;
  thread: Array<{ direction: "OUTBOUND" | "INBOUND"; subject: string; body: string; at: string }>;
  reply: { fromAddress: string; subject: string; body: string };
  classifications: string[];
  interpretation: string;
  extractedSummary: string;
  contactName: string | null;
  organizationName: string;
  operatorName: string;
  /** Literally what we are able to do today. The model may promise nothing else. */
  capabilities: string[];
};

export const DraftReplyOutputSchema = z.object({
  subject: z.string().min(3),
  body: z.string().min(20),
  rationale: z.string().min(10),
  /** What we are hoping this reply gets them to tell us. */
  informationSought: z.array(z.string()).max(4),
  containsCommitment: z.boolean(),
  shouldEscalate: z.boolean(),
  escalationReason: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});
export type DraftReplyOutput = z.infer<typeof DraftReplyOutputSchema>;

export const draftReply: PromptModule<DraftReplyInput, DraftReplyOutput> = {
  taskType: "DRAFT_REPLY",
  version: "1.0.0",
  resultName: "emit_reply",
  resultDescription: "Draft the reply for the operator to review.",
  schema: DraftReplyOutputSchema,
  effort: "medium",
  maxTokens: 6000,
  system: `${HOUSE_RULES}

Draft a reply to someone who took the trouble to answer a cold email. A human
reads it before it sends, but write it as if it will go exactly as you leave it.

The hard boundary: you may promise ONLY what is in the capabilities list you are
given. You may not quote a price, agree a delivery date, state that a part is
compatible, accept an order, or offer a warranty. If the reply needs one of
those, write the part you can honestly write, set \`shouldEscalate\` true, and
say why. Do not hedge your way around it with vague language — the operator
needs to see clearly that a decision is theirs to make.

What a good reply does: thanks them in about four words, answers what they
asked, and asks for the specific next piece of information that would let us
actually help — a model number, a photo of the nameplate, a date, a quantity.
Concrete asks get concrete answers.

Length: under 90 words unless they asked something that genuinely needs more.
Sign with the operator's first name.`,
  build: (input) =>
    [
      briefText(input.brief),
      "",
      `WHAT WE CAN ACTUALLY DO TODAY (you may promise nothing outside this list):`,
      ...input.capabilities.map((c) => `- ${c}`),
      "",
      "THREAD:",
      ...input.thread.map((m) => `[${m.direction} ${m.at}] ${m.subject}\n${m.body.slice(0, 1500)}`),
      "",
      "THEIR LATEST MESSAGE:",
      input.reply.body.slice(0, 6000),
      "",
      `CLASSIFIED AS: ${input.classifications.join(", ")}`,
      `INTERPRETATION: ${input.interpretation}`,
      `EXTRACTED: ${input.extractedSummary}`,
      "",
      `Reply to ${input.contactName ?? "them"} at ${input.organizationName}. Sign as ${input.operatorName}.`,
    ].join("\n"),
  validate: (out) => {
    const problems = bannedPhraseProblems(out.body);
    // A price or a promise in the body must be declared, so the Outbox can
    // colour it red. A model that writes "$400" and reports no commitment is
    // the exact failure this flag exists to catch.
    const looksCommercial =
      /\$\s?\d|\b\d+\s?(usd|dollars)\b|\bwe (can|will) (ship|deliver|supply|guarantee)\b|\bcompatible with\b|\bwarrant(y|ed)\b/i.test(
        out.body,
      );
    if (looksCommercial && !out.containsCommitment) {
      problems.push(
        "The body states a price, a delivery promise, a compatibility claim or a warranty but containsCommitment is false.",
      );
    }
    if (out.shouldEscalate && !out.escalationReason) {
      problems.push("shouldEscalate is true with no reason given.");
    }
    return problems;
  },
  confidence: (out) => out.confidence,
};
