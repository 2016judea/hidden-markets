import { env } from "../env";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { MockLLMProvider } from "./mock";
import type { LLMProvider } from "./provider";
import type { AITaskType } from "../domain/constants";

/**
 * Which provider does which job.
 *
 * The split is lookup versus judgement, and it comes from measurement rather
 * than preference. On 2026-09-07 the four tasks that search the web cost $0.12
 * to $0.41 a call while qualification, which searches nothing, cost $0.01 — the
 * money is in reading pages, not in thinking. Gemini Flash grounds against
 * Google at roughly a tenth of the token price, which is the right trade for
 * "find this person's published address" and the wrong one for "decide whether
 * to email a stranger", so the drafting, classification, extraction and
 * analysis tasks stay where the reasoning is best.
 *
 * DISCOVER_ORGANIZATIONS is on the list but rarely runs now: enumeration goes
 * through the directory provider first and only falls back to a model for
 * buyer types no directory lists.
 */
const RESEARCH_TASKS: AITaskType[] = [
  "DISCOVER_ORGANIZATIONS",
  "RESEARCH_ORGANIZATION",
  "IDENTIFY_DECISION_MAKERS",
  "FIND_CONTACT",
];

let anthropic: LLMProvider | null = null;
let gemini: LLMProvider | null = null;
let override: LLMProvider | null = null;

function anthropicProvider(): LLMProvider {
  if (!anthropic) {
    anthropic =
      env.ANTHROPIC_API_KEY && env.LLM_PROVIDER !== "mock"
        ? new AnthropicProvider(env.ANTHROPIC_API_KEY, env.LLM_MODEL)
        : new MockLLMProvider();
  }
  return anthropic;
}

function geminiProvider(): LLMProvider | null {
  if (gemini) return gemini;
  if (!env.GEMINI_API_KEY || env.LLM_PROVIDER === "mock") return null;
  gemini = new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL);
  return gemini;
}

/** The provider for one task. Falls back to Anthropic whenever Gemini is off. */
export function getLLMFor(taskType?: AITaskType): LLMProvider {
  if (override) return override;
  if (
    taskType &&
    env.RESEARCH_PROVIDER === "gemini" &&
    RESEARCH_TASKS.includes(taskType)
  ) {
    return geminiProvider() ?? anthropicProvider();
  }
  return anthropicProvider();
}

export function getLLM(): LLMProvider {
  return getLLMFor();
}

/** Tests and scripts pin every task to one provider through here. */
export function setLLM(provider: LLMProvider | null): void {
  override = provider;
  if (provider === null) {
    anthropic = null;
    gemini = null;
  }
}

export * from "./provider";
export { MockLLMProvider } from "./mock";
export { AnthropicProvider } from "./anthropic";
export { GeminiProvider } from "./gemini";
