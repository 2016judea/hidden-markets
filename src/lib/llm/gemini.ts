import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import {
  InvalidModelOutput,
  attachSpend,
  type Citation,
  type LLMProvider,
  type LLMResult,
  type LLMUsage,
  type StructuredRequest,
  type TextRequest,
} from "./provider";
import { toJsonSchema } from "./anthropic";
import { assertSearchBudget, noteSearches } from "./search-budget";

/**
 * $ per 1M tokens, read off ai.google.dev/gemini-api/docs/pricing 2026-09-08.
 * An unlisted model costs `null`, which reads as "unknown" on the run rather
 * than as a confident wrong number.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  "gemini-3.5-flash": { input: 1.5, output: 9 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
};

/**
 * Grounding is billed per SEARCH QUERY, not per request, and one request can
 * issue several. At $14/1,000 it is dearer than Anthropic's $10/1,000 — so on
 * a search-heavy task Gemini is only cheaper on the token half, and only
 * decisively so on Flash-Lite. Counting it here is the difference between
 * knowing that and assuming the opposite.
 */
const SEARCH_COST_PER_QUERY = 0.014;

/**
 * How many times phase two may be re-asked for one paid grounding. Two,
 * because the structuring step searches nothing — this is the cheap retry, and
 * it exists so the expensive one does not have to happen.
 */
const STRUCTURE_ATTEMPTS = 2;

/**
 * The first 5,000 search queries each month are free across all Gemini 3.x
 * models. That is the real reason to route research here at this stage: at
 * roughly nine queries a research call it covers about 550 calls a month, which
 * is more than a scout stage needs. This process cannot see the monthly total,
 * so the recorded cost is the pessimistic one — every query billed.
 */
function costOf(
  model: string,
  inputTokens: number,
  outputTokens: number,
  searchQueries = 0,
): number | null {
  const p = PRICING[model];
  if (!p) return null;
  return (
    (inputTokens * p.input + outputTokens * p.output) / 1_000_000 +
    searchQueries * SEARCH_COST_PER_QUERY
  );
}

/**
 * Gemini with Google Search grounding, for the tasks whose whole cost is
 * looking things up.
 *
 * Measured on Anthropic 2026-09-07: the four web-searching tasks cost $0.12 to
 * $0.41 a call while the one task that does not search cost $0.01. The expense
 * is search results arriving as enormous input blobs, plus per-search billing.
 * Flash is an order of magnitude cheaper per token and grounds against Google
 * directly, which is the right trade for "find this person's published email",
 * and the wrong trade for judgement — so routing is per task type, not global.
 *
 * The two-phase shape is forced by the API: Gemini rejects a request that asks
 * for both `googleSearch` and a `responseSchema`. So phase one grounds and
 * writes prose with citations, phase two turns that prose into the schema with
 * no tools attached. Ungrounded calls skip phase one entirely.
 */
export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  readonly defaultModel: string;
  private client: GoogleGenAI;

  constructor(apiKey: string, defaultModel = "gemini-3.5-flash") {
    if (!apiKey) throw new Error("GeminiProvider needs GEMINI_API_KEY.");
    // Two things the SDK does not do on its own:
    //
    // A TIMEOUT. There was none, so a request that never came back held a job
    // lane until the worker was killed — and "fetch failed" was the commonest
    // error of the 2,251 failures logged after 2026-09-07. Four minutes is
    // generous against the 39-142 seconds a grounded research call measured,
    // and deliberately UNDER undici's own 300-second headers timeout: past
    // that, Node's fetch tears the socket down itself and the only thing the
    // log gets is "fetch failed", which is unreadable and looks like a network
    // outage. Below it, a slow call fails with a message that says so.
    //
    // FEWER INTERNAL RETRIES. The default is five attempts on 408/429/5xx. A
    // 5xx that arrives AFTER grounding has already run means the searches were
    // billed, so five attempts is five bills for one answer. One retry.
    this.client = new GoogleGenAI({
      apiKey,
      httpOptions: {
        timeout: Number(process.env.GEMINI_TIMEOUT_MS ?? 4 * 60_000),
        retryOptions: { attempts: 2 },
      },
    });
    this.defaultModel = defaultModel;
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<LLMResult<T>> {
    const model = req.model ?? this.defaultModel;
    const citations: Citation[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let webSearches = 0;
    let grounded = req.groundedContext ?? "";
    let structuringRetried = false;

    const usage = (): LLMUsage => ({
      inputTokens,
      outputTokens,
      webSearches,
      costUsd: costOf(model, inputTokens, outputTokens, webSearches),
    });

    try {
      // Phase one, the billed half. Skipped entirely when the caller already
      // holds grounded prose from a previous attempt — a retry must never
      // re-buy searches it has already paid for.
      if (req.webSearch && !grounded) {
        await assertSearchBudget();
        const res = await this.client.models.generateContent({
          model,
          contents: `${req.system}\n\n---\n\n${req.prompt}\n\nResearch this thoroughly using search, then write down everything you established and the URL you read it on. Do not answer from memory.`,
          config: { tools: [{ googleSearch: {} }] },
        });
        grounded = res.text ?? "";
        inputTokens += res.usageMetadata?.promptTokenCount ?? 0;
        outputTokens += res.usageMetadata?.candidatesTokenCount ?? 0;

        const meta = res.candidates?.[0]?.groundingMetadata;
        const issued = meta?.webSearchQueries?.length ?? 0;
        webSearches += issued;
        noteSearches(issued);
        for (const chunk of meta?.groundingChunks ?? []) {
          const uri = chunk.web?.uri;
          if (uri) {
            citations.push({ url: uri, title: chunk.web?.title, retrievedAt: new Date().toISOString() });
          }
        }
      }

      // Phase two: no tools, so responseSchema is allowed and the output is
      // guaranteed to parse. Everything it may assert is in `grounded` above.
      //
      // Retried HERE rather than by the caller, because this half searches
      // nothing: a rejected structuring costs a few thousand tokens, while the
      // same rejection sent back up to runAITask re-ran phase one and bought
      // the searches again.
      let lastInvalid: InvalidModelOutput | null = null;
      for (let attempt = 0; attempt < STRUCTURE_ATTEMPTS; attempt++) {
        const complaint =
          attempt === 0
            ? ""
            : `\n\nYour previous answer was rejected: ${lastInvalid?.message ?? "it did not match the required structure"}. Return a corrected answer in the required structure, using only what the research established.`;

        const res = await this.client.models.generateContent({
          model,
          contents: this.structuringPrompt(req, grounded) + complaint,
          config: {
            responseMimeType: "application/json",
            responseJsonSchema: toJsonSchema(req.schema as z.ZodType<unknown>),
          },
        });
        inputTokens += res.usageMetadata?.promptTokenCount ?? 0;
        outputTokens += res.usageMetadata?.candidatesTokenCount ?? 0;

        let raw: unknown;
        try {
          raw = JSON.parse(res.text ?? "");
        } catch {
          lastInvalid = new InvalidModelOutput(
            `${req.resultName}: Gemini returned unparseable JSON`,
            res.text,
          );
          structuringRetried = attempt > 0;
          continue;
        }

        const parsed = req.schema.safeParse(raw);
        if (!parsed.success) {
          lastInvalid = new InvalidModelOutput(`${req.resultName}: output failed schema validation`, {
            issues: parsed.error.issues,
            received: raw,
          });
          structuringRetried = attempt > 0;
          continue;
        }

        return {
          value: parsed.data,
          citations: dedupe(citations),
          usage: usage(),
          modelProvider: this.name,
          modelName: model,
          raw,
          grounded: grounded || undefined,
        };
      }

      structuringRetried = true;
      throw lastInvalid ?? new InvalidModelOutput(`${req.resultName}: no output`, null);
    } catch (err) {
      // The money already spent travels with the failure, so the audit row can
      // record it and the grounded prose can be reused instead of re-bought.
      throw attachSpend(err, {
        usage: usage(),
        grounded: grounded || undefined,
        retriedInternally: structuringRetried,
      });
    }
  }

  private structuringPrompt<T>(req: StructuredRequest<T>, grounded: string): string {
    return grounded
      ? `${req.system}\n\n---\n\nTASK:\n${req.prompt}\n\n---\n\nWHAT YOUR RESEARCH FOUND:\n${grounded}\n\nReturn this as the required structure. Use only what the research above established — if it did not establish a field, that field is null.`
      : `${req.system}\n\n---\n\n${req.prompt}`;
  }

  async generateText(req: TextRequest): Promise<LLMResult<string>> {
    const model = req.model ?? this.defaultModel;
    const res = await this.client.models.generateContent({
      model,
      contents: req.system ? `${req.system}\n\n---\n\n${req.prompt}` : req.prompt,
    });
    const inputTokens = res.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = res.usageMetadata?.candidatesTokenCount ?? 0;
    return {
      value: res.text ?? "",
      citations: [],
      usage: { inputTokens, outputTokens, webSearches: 0, costUsd: costOf(model, inputTokens, outputTokens) },
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
    const schema = z.object({ labels: z.array(z.enum(args.labels as unknown as [T, ...T[]])).min(1) });
    const r = await this.generateStructured({
      system: args.system ?? "You are a precise classifier. Choose only from the given labels.",
      prompt: args.prompt,
      schema,
      resultName: "emit_labels",
      resultDescription: "Return every label that applies.",
      model: args.model,
    });
    return { ...r, value: r.value.labels as T[] };
  }

  async summarize(args: { text: string; instruction: string; maxWords?: number; model?: string }): Promise<LLMResult<string>> {
    return this.generateText({
      system: "You summarize faithfully. You never add a fact that is not in the source.",
      prompt: `${args.instruction}\n\nKeep it under ${args.maxWords ?? 120} words.\n\n---\n${args.text}`,
      model: args.model,
    });
  }
}

function dedupe(list: Citation[]): Citation[] {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
}
