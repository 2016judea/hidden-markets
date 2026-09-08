import { env } from "../env";
import { AnthropicProvider } from "./anthropic";
import { MockLLMProvider } from "./mock";
import type { LLMProvider } from "./provider";

let cached: LLMProvider | null = null;

export function getLLM(): LLMProvider {
  if (cached) return cached;
  if (env.LLM_PROVIDER === "mock" || !env.ANTHROPIC_API_KEY) {
    cached = new MockLLMProvider();
  } else {
    cached = new AnthropicProvider(env.ANTHROPIC_API_KEY, env.LLM_MODEL);
  }
  return cached;
}

/** Tests and the seed script swap the provider through here. */
export function setLLM(provider: LLMProvider | null): void {
  cached = provider;
}

export * from "./provider";
export { MockLLMProvider } from "./mock";
export { AnthropicProvider } from "./anthropic";
