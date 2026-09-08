import type {
  LLMProvider,
  LLMResult,
  StructuredRequest,
  TextRequest,
} from "./provider";

type Handler = (req: StructuredRequest<unknown>) => unknown;

/**
 * Deterministic stand-in. Tests register a handler per result-tool name, so a
 * test that forgets to stub a call fails loudly instead of silently exercising
 * a different path than production takes.
 */
export class MockLLMProvider implements LLMProvider {
  readonly name = "mock";
  readonly defaultModel = "mock-model";
  private handlers = new Map<string, Handler>();
  private textHandler: ((req: TextRequest) => string) | null = null;
  readonly calls: Array<{ resultName: string; prompt: string }> = [];

  on(resultName: string, handler: Handler): this {
    this.handlers.set(resultName, handler);
    return this;
  }

  onText(handler: (req: TextRequest) => string): this {
    this.textHandler = handler;
    return this;
  }

  private wrap<T>(value: T): LLMResult<T> {
    return {
      value,
      citations: [],
      usage: { inputTokens: 0, outputTokens: 0, webSearches: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 },
      modelProvider: this.name,
      modelName: this.defaultModel,
    };
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<LLMResult<T>> {
    this.calls.push({ resultName: req.resultName, prompt: req.prompt });
    const handler = this.handlers.get(req.resultName);
    if (!handler) {
      throw new Error(
        `MockLLMProvider: no handler registered for "${req.resultName}". ` +
          `Register one with .on("${req.resultName}", () => ({...})).`,
      );
    }
    const raw = handler(req as StructuredRequest<unknown>);
    // The mock validates too. A stub that drifts from the schema is a bug in
    // the test, and we want to find it here rather than in production.
    return this.wrap(req.schema.parse(raw));
  }

  async generateText(req: TextRequest): Promise<LLMResult<string>> {
    return this.wrap(this.textHandler ? this.textHandler(req) : "");
  }

  async classify<T extends string>(args: {
    prompt: string;
    labels: readonly T[];
  }): Promise<LLMResult<T[]>> {
    const handler = this.handlers.get("emit_labels");
    const value = handler
      ? (handler({ prompt: args.prompt } as StructuredRequest<unknown>) as { labels: T[] }).labels
      : [args.labels[0]];
    return this.wrap(value);
  }

  async summarize(args: { text: string }): Promise<LLMResult<string>> {
    return this.wrap(this.textHandler ? this.textHandler({ prompt: args.text }) : "");
  }
}
