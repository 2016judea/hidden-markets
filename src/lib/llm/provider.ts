import type { z } from "zod";

export type Citation = {
  url: string;
  title?: string;
  quote?: string;
  retrievedAt: string;
};

export type LLMUsage = {
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  /** Prefix served from cache — billed at a fraction of the input rate. */
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd: number | null;
};

export type LLMResult<T> = {
  value: T;
  citations: Citation[];
  usage: LLMUsage;
  modelProvider: string;
  modelName: string;
  raw?: unknown;
};

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type StructuredRequest<T> = {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Tool name the model calls to hand back its answer. Shows up in logs. */
  resultName: string;
  resultDescription: string;
  /** Turn on Anthropic's server-side web search for this call. */
  webSearch?: { maxUses: number; allowedDomains?: string[] };
  effort?: Effort;
  maxTokens?: number;
  model?: string;
};

export type TextRequest = {
  system?: string;
  prompt: string;
  effort?: Effort;
  maxTokens?: number;
  model?: string;
};

/**
 * The only surface the rest of the app is allowed to know about. Nothing
 * outside src/lib/llm/ imports the Anthropic SDK, so swapping vendors is a
 * new file in this directory and a line in index.ts.
 */
export interface LLMProvider {
  readonly name: string;
  readonly defaultModel: string;

  generateStructured<T>(req: StructuredRequest<T>): Promise<LLMResult<T>>;
  generateText(req: TextRequest): Promise<LLMResult<string>>;

  /** Sugar over generateStructured for the single-label case. */
  classify<T extends string>(args: {
    system?: string;
    prompt: string;
    labels: readonly T[];
    multi?: boolean;
    model?: string;
  }): Promise<LLMResult<T[]>>;

  summarize(args: { text: string; instruction: string; maxWords?: number; model?: string }): Promise<LLMResult<string>>;
}

/** Raised when the model produced something the schema rejected, twice. */
export class InvalidModelOutput extends Error {
  constructor(
    message: string,
    readonly detail: unknown,
  ) {
    super(message);
    this.name = "InvalidModelOutput";
  }
}
