import { z } from "zod";
import type { PromptModule } from "../types";
import { HOUSE_RULES, briefText, type ExperimentBrief } from "./shared";
import { REPLY_CLASSIFICATIONS } from "../../domain/constants";

export type ClassifyInput = {
  brief: ExperimentBrief;
  thread: Array<{ direction: "OUTBOUND" | "INBOUND"; subject: string; body: string; at: string }>;
  reply: { fromAddress: string; subject: string; body: string };
};

export const ClassifyOutputSchema = z.object({
  classifications: z.array(z.enum(REPLY_CLASSIFICATIONS)).min(1).max(5),
  interpretation: z.string().min(15),
  /** A person's name and, when present, their contact details. */
  referral: z
    .object({
      name: z.string().nullable(),
      title: z.string().nullable(),
      email: z.string().nullable(),
      quote: z.string(),
    })
    .nullable(),
  isHumanWritten: z.boolean(),
  wantsNoFurtherContact: z.boolean(),
  suggestedProspectStatus: z.enum([
    "REPLIED",
    "ENGAGED",
    "NOT_INTERESTED",
    "UNSUBSCRIBED",
    "DO_NOT_CONTACT",
    "TRANSACTION",
  ]),
  confidence: z.number().min(0).max(1),
});
export type ClassifyOutput = z.infer<typeof ClassifyOutputSchema>;

export const classifyInboundReply: PromptModule<ClassifyInput, ClassifyOutput> = {
  taskType: "CLASSIFY_REPLY",
  version: "1.0.0",
  resultName: "emit_classification",
  resultDescription: "Classify this reply and say what it means for the experiment.",
  schema: ClassifyOutputSchema,
  effort: "low",
  maxTokens: 4000,
  system: `${HOUSE_RULES}

Read one inbound reply in the context of the thread it belongs to and label it.

Labels may overlap and usually do — "I'm not the right person, but yes we've had
that exact issue, talk to Dave" is REFERRAL and HAS_ACTIVE_PROBLEM and probably
POSITIVE. Apply every label that is true.

Be strict about HAS_ACTIVE_PROBLEM. It means they described a real, current,
specific difficulty — not that they were polite about the topic. Vague interest
is POSITIVE, not HAS_ACTIVE_PROBLEM. Getting this wrong corrupts the one number
the whole operation is steering by.

WANTS_PRICE and WANTS_CALL mean they asked, explicitly or near enough.

\`wantsNoFurtherContact\` is true for any clear signal to stop — "remove me",
"not interested", "please don't contact me again", or a curt no. Err toward
true. Continuing to email someone who has said no is the one mistake here that
cannot be undone.

\`interpretation\` is one or two sentences for the operator, in plain language,
saying what this reply actually means for the experiment.`,
  build: (input) =>
    [
      briefText(input.brief),
      "",
      "THREAD SO FAR:",
      ...input.thread.map(
        (m) => `[${m.direction} ${m.at}] ${m.subject}\n${m.body.slice(0, 2000)}`,
      ),
      "",
      "THE REPLY TO CLASSIFY:",
      `From: ${input.reply.fromAddress}`,
      `Subject: ${input.reply.subject}`,
      input.reply.body.slice(0, 6000),
    ].join("\n"),
  validate: (out) => {
    const problems: string[] = [];
    if (out.classifications.includes("REFERRAL") && !out.referral) {
      problems.push("You labelled this a REFERRAL but returned no referral details. Quote who they named.");
    }
    if (out.referral && !out.classifications.includes("REFERRAL")) {
      problems.push("You returned referral details without the REFERRAL label.");
    }
    if (out.classifications.includes("UNSUBSCRIBE") && !out.wantsNoFurtherContact) {
      problems.push("UNSUBSCRIBE must set wantsNoFurtherContact true.");
    }
    return problems;
  },
  confidence: (out) => out.confidence,
};
