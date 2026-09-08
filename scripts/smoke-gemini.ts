/**
 * Runs the same research task through both providers and prints what each
 * actually cost and returned. The point is not that one wins — it is that the
 * comparison is measured rather than assumed.
 *
 *   npx tsx scripts/smoke-gemini.ts
 */
import { AnthropicProvider } from "../src/lib/llm/anthropic";
import { GeminiProvider } from "../src/lib/llm/gemini";
import { identifyDecisionMakers } from "../src/lib/ai/prompts/identifyDecisionMakers";
import type { LLMProvider } from "../src/lib/llm/provider";

const BRIEF = {
  id: "x",
  name: "Funeral homes — rush memorial production",
  hypothesis: "Independent funeral homes need memorial print produced in under 48 hours.",
  buyerPersona: "Owner or funeral director at an independent funeral home.",
  likelyProblem: "Families finalise photos late and the local printer cannot turn it around.",
  offer: "We are researching how rush memorial print actually gets done.",
  targetTitles: ["Owner", "Funeral Director", "General Manager"],
  targetOrgTypes: ["Funeral home"],
  targetGeography: "United States",
  exclusionCriteria: [],
  qualificationCriteria: [],
  researchStrategy: "State funeral director association directories and state licensing boards.",
  safetyNotes: "",
};

const ORGS = [
  {
    brief: BRIEF,
    organizationName: "Washburn-McReavy Funeral Chapels",
    website: "https://www.washburn-mcreavy.com/",
    organizationSummary: "A long-established independent funeral home group in Minneapolis, Minnesota.",
  },
  {
    brief: BRIEF,
    organizationName: "Billman-Hunt Funeral Chapel",
    website: "https://www.billmanhunt.com/",
    organizationSummary: "An independent funeral chapel in Northeast Minneapolis, Minnesota.",
  },
  {
    brief: BRIEF,
    organizationName: "Estes Funeral Chapel & Cremation Services",
    website: "http://www.estesfuneralchapel.com/",
    organizationSummary: "An independent, family-owned funeral chapel in Minneapolis, Minnesota.",
  },
];

type Trial = { cost: number | null; seconds: number; searches: number; verified: number; named: number };

async function run(label: string, provider: LLMProvider, INPUT: (typeof ORGS)[number]): Promise<Trial> {
  const started = Date.now();
  try {
    const r = await provider.generateStructured({
      system: identifyDecisionMakers.system,
      prompt: identifyDecisionMakers.build(INPUT),
      schema: identifyDecisionMakers.schema,
      resultName: identifyDecisionMakers.resultName,
      resultDescription: identifyDecisionMakers.resultDescription,
      webSearch: identifyDecisionMakers.webSearch,
      effort: identifyDecisionMakers.effort,
      maxTokens: identifyDecisionMakers.maxTokens,
    });
    const problems = identifyDecisionMakers.validate?.(r.value, INPUT) ?? [];
    console.log(`\n── ${label} (${r.modelName}) ─────────────────────────`);
    console.log(
      `  ${((Date.now() - started) / 1000).toFixed(0)}s | in ${r.usage.inputTokens.toLocaleString()} / out ${r.usage.outputTokens.toLocaleString()}` +
        ` | ${r.usage.webSearches} searches | ${r.usage.costUsd === null ? "cost unknown" : "$" + r.usage.costUsd.toFixed(3)}`,
    );
    console.log(`  citations: ${r.citations.length} | validator: ${problems.length ? problems.join("; ") : "clean"}`);
    for (const p of r.value.people.slice(0, 3)) {
      console.log(`  • ${p.name ?? "(unnamed)"} — ${p.title} | ${p.email ?? "no address"} [${p.emailConfidence}]`);
      if (p.sourceUrl) console.log(`    ${p.sourceUrl}`);
    }
    return {
      cost: r.usage.costUsd,
      seconds: (Date.now() - started) / 1000,
      searches: r.usage.webSearches,
      verified: r.value.people.filter((p) => p.emailConfidence === "VERIFIED").length,
      named: r.value.people.filter((p) => p.name).length,
    };
  } catch (e) {
    console.log(`\n── ${label} FAILED after ${((Date.now() - started) / 1000).toFixed(0)}s`);
    console.log(`  ${String((e as Error).message).slice(0, 500)}`);
    return { cost: null, seconds: (Date.now() - started) / 1000, searches: 0, verified: 0, named: 0 };
  }
}

function summarise(label: string, trials: Trial[]) {
  const costs = trials.map((t) => t.cost).filter((c): c is number => c !== null);
  const total = costs.reduce((a, b) => a + b, 0);
  console.log(
    `${label.padEnd(10)} ${trials.length} runs | $${total.toFixed(3)} total, $${(total / Math.max(1, costs.length)).toFixed(3)} mean` +
      ` | ${(trials.reduce((a, t) => a + t.seconds, 0) / trials.length).toFixed(0)}s mean` +
      ` | ${trials.reduce((a, t) => a + t.searches, 0)} searches` +
      ` | ${trials.reduce((a, t) => a + t.verified, 0)} verified addresses` +
      ` | ${trials.reduce((a, t) => a + t.named, 0)} named people`,
  );
  return total / Math.max(1, costs.length);
}

async function main() {
  const gemini = new GeminiProvider(process.env.GEMINI_API_KEY!, process.env.GEMINI_MODEL);
  const anthropic = new AnthropicProvider(process.env.ANTHROPIC_API_KEY!, process.env.LLM_MODEL);

  const gemTrials: Trial[] = [];
  const antTrials: Trial[] = [];
  for (const org of ORGS) {
    gemTrials.push(await run(`gemini · ${org.organizationName}`, gemini, org));
    antTrials.push(await run(`anthropic · ${org.organizationName}`, anthropic, org));
  }

  console.log("\n══ summary ═══════════════════════════════════════════");
  const g = summarise("gemini", gemTrials);
  const a = summarise("anthropic", antTrials);
  if (a > 0) console.log(`\nGemini costs ${(g / a).toFixed(2)}x Anthropic on this task, over ${ORGS.length} organizations each.`);
}

main();
