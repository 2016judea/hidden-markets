import { prisma, j } from "../db";
import { getLLMFor, InvalidModelOutput, spendOf, type Citation, type LLMUsage } from "../llm";
import type { PromptModule } from "./types";

export type TaskContext = {
  experimentId?: string | null;
  prospectId?: string | null;
  candidateId?: string | null;
  emailMessageId?: string | null;
};

export type TaskResult<O> = {
  output: O;
  runId: string;
  citations: Citation[];
  confidence: number | null;
};

export class AITaskFailed extends Error {
  /** Wait and try again rather than spend an attempt — see SearchBudgetExceeded. */
  readonly deferrable?: boolean;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    readonly runId: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "AITaskFailed";
    const c = cause as { deferrable?: boolean; retryAfterMs?: number } | undefined;
    // The queue classifies what it is handed, so a flag that stops here is a
    // flag that does nothing.
    if (c?.deferrable) {
      this.deferrable = true;
      this.retryAfterMs = c.retryAfterMs;
    }
  }
}

const MAX_ATTEMPTS = 2;

/**
 * The single path every AI call in this system takes.
 *
 * It exists so that no cognitive function can be written that skips the audit
 * row, the schema check, or the deterministic validator. A function that wants
 * to be exempt has to bypass this file, and nothing does.
 */
export async function runAITask<I, O>(
  module: PromptModule<I, O>,
  input: I,
  context: TaskContext = {},
): Promise<TaskResult<O>> {
  const llm = getLLMFor(module.taskType);
  const startedAt = new Date();

  const run = await prisma.aITaskRun.create({
    data: {
      taskType: module.taskType,
      experimentId: context.experimentId ?? null,
      prospectId: context.prospectId ?? null,
      candidateId: context.candidateId ?? null,
      emailMessageId: context.emailMessageId ?? null,
      inputJson: j(input),
      modelProvider: llm.name,
      modelName: llm.defaultModel,
      promptVersion: `${module.taskType}@${module.version}`,
      status: "RUNNING",
      startedAt,
    },
  });

  let lastError: unknown = null;
  let complaints: string[] = [];

  /**
   * Everything this task has been billed for, across every attempt.
   *
   * Before 2026-09-10 only the winning attempt's usage was written, and a
   * failure wrote none at all: 2,251 FAILED rows carried a null cost and a null
   * search count for grounding Google had already charged for. The ledger said
   * $99.90 where the bill said $131.80, and the difference was invisible
   * exactly where it mattered.
   */
  const spent = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 0 };
  let spentUsd: number | null = null;
  /** Grounded prose already paid for. Handed back so a retry never re-searches. */
  let groundedContext: string | undefined;

  const bank = (usage: LLMUsage): void => {
    spent.inputTokens += usage.inputTokens;
    spent.outputTokens += usage.outputTokens;
    spent.cacheReadTokens += usage.cacheReadTokens ?? 0;
    spent.cacheWriteTokens += usage.cacheWriteTokens ?? 0;
    spent.webSearches += usage.webSearches;
    if (usage.costUsd != null) spentUsd = (spentUsd ?? 0) + usage.costUsd;
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const prompt =
        complaints.length === 0
          ? module.build(input)
          : `${module.build(input)}\n\nYour previous answer was rejected:\n` +
            complaints.map((c) => `- ${c}`).join("\n") +
            `\n\nReturn a corrected answer. If you cannot satisfy a requirement with real information, leave that field null rather than inventing a value.`;

      const result = await llm.generateStructured({
        system: module.system,
        prompt,
        schema: module.schema,
        resultName: module.resultName,
        resultDescription: module.resultDescription,
        webSearch: module.webSearch,
        groundedContext,
        effort: module.effort,
        maxTokens: module.maxTokens,
        strict: module.strict,
      });

      bank(result.usage);
      complaints = module.validate?.(result.value, input) ?? [];
      if (complaints.length > 0) {
        lastError = new Error(`validation: ${complaints.join("; ")}`);
        await prisma.aITaskRun.update({
          where: { id: run.id },
          data: { retryCount: attempt + 1 },
        });
        // Another go at the ANSWER must not be another go at the SEARCHING.
        // Keep the research this attempt already paid for; if the provider
        // cannot hand any back and the attempt did search, stop here rather
        // than buy the same queries twice for one validator complaint.
        groundedContext = result.grounded ?? groundedContext;
        if (!groundedContext && result.usage.webSearches > 0) break;
        continue;
      }

      const confidence = module.confidence?.(result.value) ?? null;
      const completedAt = new Date();
      await prisma.aITaskRun.update({
        where: { id: run.id },
        data: {
          outputJson: j(result.value),
          status: "SUCCEEDED",
          confidence,
          retryCount: attempt,
          inputTokens: spent.inputTokens,
          outputTokens: spent.outputTokens,
          cacheReadTokens: spent.cacheReadTokens,
          cacheWriteTokens: spent.cacheWriteTokens,
          costUsd: spentUsd,
          webSearches: spent.webSearches,
          modelName: result.modelName,
          modelProvider: result.modelProvider,
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
        },
      });

      return { output: result.value, runId: run.id, citations: result.citations, confidence };
    } catch (err) {
      lastError = err;
      const invalid = err instanceof InvalidModelOutput;
      // A call that threw may still have been billed — grounding is charged the
      // moment it runs, whatever happens afterwards.
      const spend = spendOf(err);
      if (spend) {
        bank(spend.usage);
        groundedContext = spend.grounded ?? groundedContext;
      }
      await prisma.aITaskRun.update({
        where: { id: run.id },
        data: { retryCount: attempt + 1, error: String((err as Error).message ?? err).slice(0, 2000) },
      });
      // A schema failure is worth another try with the problem quoted back. So
      // is a transient network failure — "fetch failed" and "terminated" were
      // the two commonest errors in the first production run, and neither says
      // anything about the request. A 401 or a 400 will never improve.
      const message = String((err as Error)?.message ?? err);
      const transient =
        (err as { permanent?: boolean })?.permanent !== true &&
        /fetch failed|terminated|ECONNRESET|ETIMEDOUT|socket hang up|network|502|503|504|overloaded|rate.?limit/i.test(
          message,
        );
      if (!invalid && !transient) break;
      // The provider already re-asked for the structure without re-searching,
      // so a second whole call would only re-buy the grounding to be told the
      // same thing. And if it could hand nothing back after paying for
      // searches, retrying the lot is the leak this file was fixed for.
      if (invalid && spend?.retriedInternally) break;
      if (!groundedContext && (spend?.usage.webSearches ?? 0) > 0) break;
      complaints = invalid ? ["Your output did not match the required schema."] : [];
      if (transient) await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }

  const completedAt = new Date();
  const message = String((lastError as Error)?.message ?? lastError ?? "unknown failure");
  await prisma.aITaskRun.update({
    where: { id: run.id },
    data: {
      status: lastError instanceof InvalidModelOutput ? "INVALID_OUTPUT" : "FAILED",
      error: message.slice(0, 2000),
      // What the failure cost. A null here used to read as "free".
      inputTokens: spent.inputTokens,
      outputTokens: spent.outputTokens,
      cacheReadTokens: spent.cacheReadTokens,
      cacheWriteTokens: spent.cacheWriteTokens,
      costUsd: spentUsd,
      webSearches: spent.webSearches,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    },
  });

  throw new AITaskFailed(`${module.taskType} failed: ${message}`, run.id, lastError);
}
