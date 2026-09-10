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
  /**
   * The prose a grounded phase produced, if there was one. Billed already, so
   * a caller that wants another go at the STRUCTURE hands this back in as
   * `groundedContext` rather than paying for the searches a second time.
   */
  grounded?: string;
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
  /**
   * Research prose from a previous attempt that has ALREADY been paid for.
   * Present means "do not search again" — the provider skips its grounding
   * phase and structures this instead. Retrying a whole grounded call to fix a
   * schema or validator complaint re-ran the searches at roughly $0.08 a go,
   * which is where half of a $131 Google bill went between 2026-09-07 and
   * 2026-09-10.
   */
  groundedContext?: string;
  effort?: Effort;
  maxTokens?: number;
  model?: string;
  /**
   * Ask the API to guarantee schema-valid arguments. Default true, but it
   * compiles a grammar from the schema and a large one is rejected outright:
   * "The compiled grammar is too large". Turning it off costs nothing real —
   * Zod still validates every response and a violation gets the same retry —
   * so a module with a big schema simply opts out.
   */
  strict?: boolean;
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

/**
 * What a call had already been billed for when it threw.
 *
 * A failed call is not a free call. Google bills a grounding search the moment
 * it runs, so a request that grounds and then dies in its second phase has
 * spent real money — and until 2026-09-10 the FAILED row recorded a null cost
 * and a null search count, which is why the app's own ledger said $99.90 for a
 * period Google billed $131.80. Anything that throws out of a provider carries
 * its spend here so the audit row can be honest about it.
 */
export type LLMSpend = {
  usage: LLMUsage;
  /** Grounded prose worth handing back rather than re-buying. */
  grounded?: string;
  /**
   * The provider already re-tried the un-billed half of this call by itself.
   * A caller that retries the WHOLE call now would only re-buy the searches,
   * so it should not.
   */
  retriedInternally?: boolean;
};

// A symbol, so the spend rides on the error without showing up in a JSON
// serialisation of it or colliding with a field some SDK already sets.
const SPEND = Symbol.for("hidden-markets.llm.spend");

export function attachSpend<E>(err: E, spend: LLMSpend): E {
  if (err && typeof err === "object") {
    Object.defineProperty(err, SPEND, { value: spend, enumerable: false, configurable: true });
  }
  return err;
}

export function spendOf(err: unknown): LLMSpend | null {
  if (!err || typeof err !== "object") return null;
  return ((err as Record<symbol, unknown>)[SPEND] as LLMSpend | undefined) ?? null;
}
