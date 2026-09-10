import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  InvalidModelOutput,
  attachSpend,
  type Citation,
  type LLMProvider,
  type LLMResult,
  type StructuredRequest,
  type TextRequest,
} from "./provider";
import { env } from "../env";

/** $ per 1M tokens. Update when Anthropic's pricing page changes. */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/**
 * Server-side web search. Every research call goes through this, which is why
 * provenance is free: the API hands back the URL and the exact sentence it
 * read, and we persist both rather than asking the model to remember them.
 */
const WEB_SEARCH_TOOL_TYPE = "web_search_20260209";

/**
 * Cache reads bill at ~10% of the input rate and cache writes at ~125%, so a
 * prefix reused across a batch of candidates pays for itself on the second
 * call. Reported separately on the run so the saving is visible rather than
 * assumed.
 */
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

/**
 * Server-side web search is billed per use, on top of the tokens the results
 * cost to read. Leaving it out understated every research task measured before
 * 2026-09-08 — a 24-search discovery call was reported at $0.48 when it was
 * nearer $0.72, and half the bill was invisible. On a search-heavy task this
 * term dominates, which is precisely why enumeration moved to a directory.
 */
const SEARCH_COST_PER_USE = 0.01;

function costOf(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
  webSearches = 0,
): number | null {
  const p = PRICING[model];
  if (!p) return null;
  const input =
    inputTokens * p.input +
    cacheReadTokens * p.input * CACHE_READ_MULTIPLIER +
    cacheWriteTokens * p.input * CACHE_WRITE_MULTIPLIER;
  return (input + outputTokens * p.output) / 1_000_000 + webSearches * SEARCH_COST_PER_USE;
}

/**
 * Keywords Anthropic's strict-mode schema validator rejects outright — it
 * returns a 400 rather than ignoring them (measured 2026-09-07:
 * "For 'array' type, property 'maxItems' is not supported").
 *
 * Dropping them from the WIRE schema costs nothing, because Zod still parses
 * the response against the full schema on the way back: a model that returns
 * eleven items where the Zod schema says max ten fails validation and gets its
 * one retry, exactly as if the API had enforced it.
 */
const UNSUPPORTED_KEYWORDS = [
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "pattern",
  "format",
  "uniqueItems",
  "default",
  "$schema",
] as const;

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize);
  if (!node || typeof node !== "object") return node;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if ((UNSUPPORTED_KEYWORDS as readonly string[]).includes(k)) continue;
    out[k] = sanitize(v);
  }
  // Strict mode requires this on every object, not only the root, and requires
  // every declared property to be listed in `required`.
  if (out.type === "object" && out.properties) {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties as Record<string, unknown>);
  }
  return out;
}

export function toJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { target: "draft-7", io: "output" });
  return sanitize(raw) as Record<string, unknown>;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly defaultModel: string;
  private client: Anthropic;

  constructor(apiKey: string, defaultModel = env.LLM_MODEL) {
    // An unbounded call inside a background worker is a bug: it holds the job
    // lock and leaves an AITaskRun stuck in RUNNING with no error to read.
    // Research calls with web search legitimately run minutes (measured: 124s
    // for three organizations, 8+ for twenty-five), so the ceiling is generous
    // — but it is a ceiling, and a call that hits it fails, logs, and retries.
    this.client = new Anthropic({
      apiKey,
      timeout: Number(process.env.LLM_TIMEOUT_MS ?? 6 * 60_000),
      maxRetries: 1,
    });
    this.defaultModel = defaultModel;
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<LLMResult<T>> {
    const model = req.model ?? this.defaultModel;
    const inputSchema = toJsonSchema(req.schema as z.ZodType<unknown>);

    const emitTool: Anthropic.Tool = {
      name: req.resultName,
      description: req.resultDescription,
      input_schema: inputSchema as Anthropic.Tool["input_schema"],
      strict: req.strict !== false,
    };

    const tools: Anthropic.ToolUnion[] = [emitTool];
    if (req.webSearch) {
      tools.unshift({
        type: WEB_SEARCH_TOOL_TYPE,
        name: "web_search",
        max_uses: req.webSearch.maxUses,
        ...(req.webSearch.allowedDomains ? { allowed_domains: req.webSearch.allowedDomains } : {}),
      } as unknown as Anthropic.ToolUnion);
    }

    const messages: Anthropic.MessageParam[] = [{ role: "user", content: req.prompt }];
    const citations: Citation[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let cacheWriteTokens = 0;
    let webSearches = 0;
    let toolInput: unknown = null;

    // A failed call is not a free call: server-side web search is billed per
    // use the moment it runs, so whatever accrued before a throw is carried on
    // the throw and lands on the audit row instead of reading as free.
    const usage = () => ({
      inputTokens,
      outputTokens,
      webSearches,
      cacheReadTokens,
      cacheWriteTokens,
      costUsd: costOf(model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, webSearches),
    });

    try {
      // Two turns at most. Turn one lets the model search if it needs to; if it
      // finished researching without emitting, turn two forces the emit tool.
      // A third turn would mean the schema is wrong, not that the model is slow.
      for (let turn = 0; turn < 2 && toolInput === null; turn++) {
        const forceEmit = turn === 1 || !req.webSearch;
        const stream = await this.client.messages.stream({
          model,
          max_tokens: req.maxTokens ?? 16000,
          // The system prompt is byte-identical for every candidate in an
          // experiment and is re-sent on every call. Caching covers the whole
          // prefix — tools render before system — so the tool schema rides along
          // free. Cache reads are ~10% of input price; the volatile per-candidate
          // text lives in `messages`, after the breakpoint, so it never
          // invalidates the cached prefix.
          system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
          messages,
          tools,
          tool_choice: forceEmit
            ? { type: "tool", name: req.resultName }
            : { type: "auto" },
          output_config: { effort: req.effort ?? "medium" },
        });
        const response = await stream.finalMessage();

        inputTokens += response.usage.input_tokens ?? 0;
        outputTokens += response.usage.output_tokens ?? 0;
        cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
        cacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0;

        for (const block of response.content) {
          if (block.type === "tool_use" && block.name === req.resultName) {
            toolInput = block.input;
          }
          if ((block as { type: string }).type === "server_tool_use") webSearches += 1;
          if ((block as { type: string }).type === "web_search_tool_result") {
            const content = (block as { content?: unknown }).content;
            // A server-tool ERROR comes back as an object, a success as a list.
            // Indexing without this check is the classic silent failure.
            if (Array.isArray(content)) {
              for (const r of content as Array<Record<string, string>>) {
                if (r.url) {
                  citations.push({
                    url: r.url,
                    title: r.title,
                    retrievedAt: new Date().toISOString(),
                  });
                }
              }
            }
          }
          if (block.type === "text") {
            const blockCitations = (block.citations ?? []) as unknown as Array<Record<string, string>>;
            for (const c of blockCitations) {
              if (c.url) {
                citations.push({
                  url: c.url,
                  title: c.title,
                  quote: c.cited_text,
                  retrievedAt: new Date().toISOString(),
                });
              }
            }
          }
        }

        if (toolInput === null) {
          messages.push({ role: "assistant", content: response.content });
          messages.push({
            role: "user",
            content: `Now call ${req.resultName} with everything you established. Do not search again.`,
          });
        }
      }

      if (toolInput === null) {
        throw new InvalidModelOutput(`${req.resultName}: model never called the result tool`, null);
      }

      const parsed = req.schema.safeParse(toolInput);
      if (!parsed.success) {
        throw new InvalidModelOutput(
          `${req.resultName}: output failed schema validation`,
          { issues: parsed.error.issues, received: toolInput },
        );
      }

      return {
        value: parsed.data,
        citations: dedupeCitations(citations),
        usage: {
          inputTokens,
          outputTokens,
          webSearches,
          cacheReadTokens,
          cacheWriteTokens,
          costUsd: costOf(model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, webSearches),
        },
        modelProvider: this.name,
        modelName: model,
        raw: toolInput,
      };
    } catch (err) {
      throw attachSpend(err, { usage: usage() });
    }
  }

  async generateText(req: TextRequest): Promise<LLMResult<string>> {
    const model = req.model ?? this.defaultModel;
    const stream = await this.client.messages.stream({
      model,
      max_tokens: req.maxTokens ?? 4000,
      ...(req.system ? { system: req.system } : {}),
      messages: [{ role: "user", content: req.prompt }],
      output_config: { effort: req.effort ?? "low" },
    });
    const response = await stream.finalMessage();
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    const inputTokens = response.usage.input_tokens ?? 0;
    const outputTokens = response.usage.output_tokens ?? 0;
    return {
      value: text,
      citations: [],
      usage: { inputTokens, outputTokens, webSearches: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: costOf(model, inputTokens, outputTokens) },
      modelProvider: this.name,
      modelName: model,
    };
  }

  async classify<T extends string>(args: {
    system?: string;
    prompt: string;
    labels: readonly T[];
    multi?: boolean;
    model?: string;
  }): Promise<LLMResult<T[]>> {
    const schema = z.object({
      labels: z.array(z.enum(args.labels as unknown as [T, ...T[]])).min(1),
    });
    const r = await this.generateStructured({
      system: args.system ?? "You are a precise classifier. Choose only from the given labels.",
      prompt: args.prompt,
      schema,
      resultName: "emit_labels",
      resultDescription: args.multi
        ? "Return every label that applies."
        : "Return exactly one label.",
      effort: "low",
      maxTokens: 1000,
      model: args.model,
    });
    return { ...r, value: r.value.labels as T[] };
  }

  async summarize(args: {
    text: string;
    instruction: string;
    maxWords?: number;
    model?: string;
  }): Promise<LLMResult<string>> {
    return this.generateText({
      system: "You summarize faithfully. You never add a fact that is not in the source.",
      prompt: `${args.instruction}\n\nKeep it under ${args.maxWords ?? 120} words.\n\n---\n${args.text}`,
      effort: "low",
      maxTokens: 1500,
      model: args.model,
    });
  }
}

function dedupeCitations(list: Citation[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const c of list) {
    const key = `${c.url}::${c.quote ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
