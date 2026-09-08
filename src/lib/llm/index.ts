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
 * than preference. The tasks that search the web dominate the bill; the one
 * that searches nothing costs a cent.
 *
 * Measured 2026-09-08, identifyDecisionMakers over three funeral homes each,
 * with search billed on BOTH sides (it had been missing from the Anthropic
 * figures, which understated them by about half):
 *
 *              cost/run   time    searches   verified addresses
 *   gemini      $0.091     39s       16              2
 *   anthropic   $0.229    148s       41              0
 *
 * Gemini at 0.40x the cost and 3.8x the speed, and it was the one that found
 * usable addresses. The cause is over-searching: Anthropic ran 41 queries to
 * Gemini's 16 for the same six named people, and at $0.01 a query that is 60%
 * of its bill spent on no better an answer.
 *
 * Judgement stays on Anthropic — drafting a cold email, classifying a reply,
 * deciding whether a market is worth another month. Those barely search, so
 * they barely cost anything, and there is no reason to trade reasoning for a
 * saving that is not there.
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
