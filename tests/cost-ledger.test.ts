import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { prisma } from "@/lib/db";
import { setLLM } from "@/lib/llm";
import {
  InvalidModelOutput,
  attachSpend,
  type LLMProvider,
  type LLMResult,
  type StructuredRequest,
} from "@/lib/llm/provider";
import { runAITask } from "@/lib/ai/runner";
import { enqueue, retryDeadLetter } from "@/lib/jobs/queue";
import type { PromptModule } from "@/lib/ai/types";
import { z } from "zod";

/** A stand-in for a grounded research module, so the test does not move when a prompt does. */
const grounding: PromptModule<{ name: string }, { ok: boolean }> = {
  taskType: "RESEARCH_ORGANIZATION",
  version: "test",
  resultName: "emit_research",
  resultDescription: "Return what you established.",
  schema: z.object({ ok: z.boolean() }),
  system: "Research one organization.",
  build: (input) => `Research ${input.name}`,
  webSearch: { maxUses: 6 },
};

/**
 * What half of a $131.80 Google bill bought: a research call grounded, was
 * billed for six searches, then failed — and the audit row recorded a null cost
 * and a null search count, so nothing downstream could see the money leaving.
 */
type Recorder = { calls: StructuredRequest<unknown>[] };

function provider(
  recorder: Recorder,
  behave: (req: StructuredRequest<unknown>, call: number) => LLMResult<unknown>,
): LLMProvider {
  return {
    name: "gemini",
    defaultModel: "gemini-3.5-flash",
    async generateStructured<T>(req: StructuredRequest<T>): Promise<LLMResult<T>> {
      recorder.calls.push(req as StructuredRequest<unknown>);
      return behave(req as StructuredRequest<unknown>, recorder.calls.length) as LLMResult<T>;
    },
    generateText: async () => {
      throw new Error("not used");
    },
    classify: async () => {
      throw new Error("not used");
    },
    summarize: async () => {
      throw new Error("not used");
    },
  };
}

const spentUsage = { inputTokens: 4000, outputTokens: 900, webSearches: 6, costUsd: 0.09 };

describe("the ledger tells the truth about a failure", () => {
  beforeEach(() => setLLM(null));

  it("records the searches and the cost a FAILED run was billed for", async () => {
    const recorder: Recorder = { calls: [] };
    setLLM(
      provider(recorder, () => {
        throw attachSpend(new InvalidModelOutput("emit_research: output failed schema validation", null), {
          usage: spentUsage,
          grounded: "Everything the searches established.",
          retriedInternally: true,
        });
      }),
    );

    await expect(runAITask(grounding, { name: "Mesa Water" })).rejects.toThrow();

    const run = await prisma.aITaskRun.findFirst({ orderBy: { startedAt: "desc" } });
    expect(run?.status).toBe("INVALID_OUTPUT");
    expect(run?.webSearches).toBe(6);
    expect(run?.costUsd).toBeCloseTo(0.09, 5);
    // And it did not buy the same six searches again to be told the same thing.
    expect(recorder.calls.length).toBe(1);
    setLLM(null);
  });

  it("hands grounded prose back on a retry instead of re-searching", async () => {
    const recorder: Recorder = { calls: [] };
    setLLM(
      provider(recorder, (req, call) => {
        if (call === 1) {
          throw attachSpend(new Error("fetch failed"), {
            usage: spentUsage,
            grounded: "The research, already paid for.",
          });
        }
        // Second attempt: no searching, because the prose came back in.
        expect(req.groundedContext).toBe("The research, already paid for.");
        throw attachSpend(new Error("fetch failed"), {
          usage: { inputTokens: 100, outputTokens: 50, webSearches: 0, costUsd: 0.001 },
        });
      }),
    );

    await expect(runAITask(grounding, { name: "Mesa Water" })).rejects.toThrow();

    const run = await prisma.aITaskRun.findFirst({ orderBy: { startedAt: "desc" } });
    expect(recorder.calls.length).toBe(2);
    expect(recorder.calls[1]?.groundedContext).toBe("The research, already paid for.");
    // Both attempts' spend, on one row: six searches, not twelve.
    expect(run?.webSearches).toBe(6);
    expect(run?.costUsd).toBeCloseTo(0.091, 5);
    setLLM(null);
  });
});

describe("a dead letter stays dead", () => {
  const dead = async (kind: string, key: string) => {
    await prisma.jobRun.deleteMany({ where: { idempotencyKey: key } });
    await prisma.jobRun.create({
      data: {
        kind,
        idempotencyKey: key,
        status: "FAILED",
        attempts: 3,
        error: "fetch failed [gave up: 8 transient failures, ceiling 8]",
      },
    });
  };

  it("refuses to re-enqueue per-entity work that already gave up", async () => {
    // The loop: MAINTAIN_PIPELINE re-enqueues every candidate still DISCOVERED,
    // and the failed research job rolls its candidate back to DISCOVERED. The
    // delete-and-recreate handed the same work a fresh budget every minute, at
    // six billed searches a go.
    await dead("RESEARCH_CANDIDATE", "research:test-candidate");
    expect(
      await enqueue({
        kind: "RESEARCH_CANDIDATE",
        payload: { candidateId: "test-candidate" },
        idempotencyKey: "research:test-candidate",
      }),
    ).toBeNull();
    const row = await prisma.jobRun.findUnique({ where: { idempotencyKey: "research:test-candidate" } });
    expect(row?.status).toBe("FAILED");
    expect(row?.error).toContain("gave up");
  });

  it("still lets the heartbeat beat", async () => {
    // A pipeline tick costs nothing and the whole system stalls without it, so
    // a dead letter must not block one.
    await dead("MAINTAIN_PIPELINE", "maintain:test-experiment");
    expect(await enqueue({ kind: "MAINTAIN_PIPELINE", idempotencyKey: "maintain:test-experiment" })).toBeTruthy();
    const row = await prisma.jobRun.findUnique({ where: { idempotencyKey: "maintain:test-experiment" } });
    expect(row?.status).toBe("PENDING");
    expect(row?.attempts).toBe(0);
  });

  it("lets a human say try again", async () => {
    await dead("RESEARCH_CANDIDATE", "research:retry-me");
    expect(await retryDeadLetter("research:retry-me")).toBe(true);
    expect(
      await enqueue({ kind: "RESEARCH_CANDIDATE", idempotencyKey: "research:retry-me" }),
    ).toBeTruthy();
  });
});
