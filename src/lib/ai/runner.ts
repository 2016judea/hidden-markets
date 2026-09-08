import { prisma, j } from "../db";
import { getLLMFor, InvalidModelOutput, type Citation } from "../llm";
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
  constructor(
    message: string,
    readonly runId: string,
  ) {
    super(message);
    this.name = "AITaskFailed";
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
        effort: module.effort,
        maxTokens: module.maxTokens,
      });

      complaints = module.validate?.(result.value, input) ?? [];
      if (complaints.length > 0) {
        lastError = new Error(`validation: ${complaints.join("; ")}`);
        await prisma.aITaskRun.update({
          where: { id: run.id },
          data: { retryCount: attempt + 1 },
        });
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
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cacheReadTokens: result.usage.cacheReadTokens ?? 0,
          cacheWriteTokens: result.usage.cacheWriteTokens ?? 0,
          costUsd: result.usage.costUsd,
          webSearches: result.usage.webSearches,
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
      await prisma.aITaskRun.update({
        where: { id: run.id },
        data: { retryCount: attempt + 1, error: String((err as Error).message ?? err).slice(0, 2000) },
      });
      // A schema failure is worth one more try. Anything else — a 401, a
      // network drop — will not be fixed by asking the model again.
      if (!invalid) break;
      complaints = ["Your output did not match the required schema."];
    }
  }

  const completedAt = new Date();
  const message = String((lastError as Error)?.message ?? lastError ?? "unknown failure");
  await prisma.aITaskRun.update({
    where: { id: run.id },
    data: {
      status: lastError instanceof InvalidModelOutput ? "INVALID_OUTPUT" : "FAILED",
      error: message.slice(0, 2000),
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    },
  });

  throw new AITaskFailed(`${module.taskType} failed: ${message}`, run.id);
}
