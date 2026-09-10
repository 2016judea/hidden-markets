import type { z } from "zod";
import type { Effort } from "../llm";
import type { AITaskType } from "../domain/constants";

/**
 * A cognitive function, declared rather than coded. Everything the runner needs
 * to execute, validate, log and audit one unit of AI judgement lives in one of
 * these objects — which is what makes "why did the system do that" answerable
 * by reading a single file.
 */
export type PromptModule<I, O> = {
  taskType: AITaskType;
  /** Bump on every material edit to `system` or `build`. Stored on the run. */
  version: string;
  resultName: string;
  resultDescription: string;
  schema: z.ZodType<O>;
  system: string;
  build: (input: I) => string;
  webSearch?: { maxUses: number };
  effort?: Effort;
  maxTokens?: number;
  /** See StructuredRequest.strict — set false when the schema is large. */
  strict?: boolean;
  /**
   * Deterministic checks run AFTER schema validation. Returning a non-empty
   * array fails the run — the model gets one retry with the problems quoted
   * back at it. This is where "did it invent an email address" is caught.
   */
  validate?: (output: O, input: I) => string[];
  /** Pulled onto the AITaskRun row so low-confidence work is queryable. */
  confidence?: (output: O) => number | null;
};
