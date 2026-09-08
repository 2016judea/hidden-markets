import { z } from "zod";
import type { PromptModule } from "../types";
import { HOUSE_RULES, briefText, type ExperimentBrief } from "./shared";
import { TRANSACTION_KINDS } from "../../domain/constants";

export type ExtractInput = {
  brief: ExperimentBrief;
  reply: { fromAddress: string; subject: string; body: string };
  organizationName: string;
};

/** Every extracted value carries its own confidence. One number for the whole
 *  extraction would hide the case where the manufacturer is certain and the
 *  quantity is a guess — which is exactly the case that matters commercially. */
const Field = z.object({ value: z.string().nullable(), confidence: z.number().min(0).max(1) });

const SignalSchema = z.object({
  category: z.string().min(3),
  summary: z.string().min(10),
  verbatim: z.string().min(5),
  requestedItem: Field,
  manufacturer: Field,
  model: Field,
  partNumber: Field,
  quantity: Field,
  currentSupplier: Field,
  currentPrice: Field,
  estimatedSpend: Field,
  deadline: Field,
  urgency: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"]),
  frequency: z.enum(["ONE_OFF", "OCCASIONAL", "RECURRING", "CONSTANT", "UNKNOWN"]),
  durationSoFar: Field,
  currentWorkaround: Field,
  dissatisfaction: Field,
  commercialSignal: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export const ExtractOutputSchema = z.object({
  signals: z.array(SignalSchema).max(4),
  transactionOpportunities: z
    .array(
      z.object({
        kind: z.enum(TRANSACTION_KINDS),
        trigger: z.string().min(3),
        summary: z.string().min(10),
        estimatedValue: z.string().nullable(),
        urgency: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"]),
      }),
    )
    .max(3),
  nothingToExtract: z.boolean(),
});
export type ExtractOutput = z.infer<typeof ExtractOutputSchema>;

export const extractPainSignals: PromptModule<ExtractInput, ExtractOutput> = {
  taskType: "EXTRACT_PAIN_SIGNAL",
  version: "1.0.0",
  resultName: "emit_signals",
  resultDescription: "Extract structured pain signals and any transaction opportunity from this reply.",
  schema: ExtractOutputSchema,
  effort: "low",
  maxTokens: 8000,
  system: `${HOUSE_RULES}

Turn one reply into structured records. You are a transcriber with judgement,
not an interpreter — if they did not say it, its value is null and its
confidence is 0.

\`verbatim\` must be an exact quote from their message. Not a paraphrase. It is
the field that lets the operator check everything else you wrote.

Confidence per field:
- 0.9-1.0: they stated it outright.
- 0.6-0.8: they stated it imprecisely, or it follows necessarily from what they
  said ("it's been six weeks" -> durationSoFar).
- 0.3-0.5: you are reading between the lines. Say so in the summary.
- Below 0.3: return null instead.

\`transactionOpportunities\` fire on a commercial ask, not on interest. "How
much?", "can you find one?", "we need it by Friday", "send me pricing", "can we
purchase through you?", "we have 14 of these sitting unused" — those are
transactions. "That's an interesting idea" is not.

If the reply contains no problem and no ask, set \`nothingToExtract\` true and
return empty arrays. That is a normal outcome.`,
  build: (input) =>
    [
      briefText(input.brief),
      "",
      `FROM: ${input.reply.fromAddress} at ${input.organizationName}`,
      `SUBJECT: ${input.reply.subject}`,
      "",
      input.reply.body.slice(0, 8000),
    ].join("\n"),
  validate: (out, input) => {
    const problems: string[] = [];
    const haystack = input.reply.body.replace(/\s+/g, " ").toLowerCase();
    for (const s of out.signals) {
      const quote = s.verbatim.replace(/\s+/g, " ").toLowerCase();
      // The quote is the anchor for every other field. If it isn't really in
      // the message, nothing else in the record can be trusted either.
      if (quote.length > 12 && !haystack.includes(quote.slice(0, Math.min(60, quote.length)))) {
        problems.push(`verbatim "${s.verbatim.slice(0, 50)}…" does not appear in the reply. Quote it exactly.`);
      }
    }
    if (out.nothingToExtract && (out.signals.length || out.transactionOpportunities.length)) {
      problems.push("nothingToExtract is true but you returned records.");
    }
    return problems;
  },
  confidence: (out) =>
    out.signals.length ? Math.max(...out.signals.map((s) => s.confidence)) : null,
};
