/**
 * Live check against the real Anthropic API. Costs a few cents and proves the
 * plumbing the mocks cannot: the JSON schema is accepted, forced tool use
 * returns valid arguments, and server-side web search hands back citations.
 *
 *   npx tsx scripts/smoke.ts
 */
import { AnthropicProvider } from "../src/lib/llm/anthropic";
import { setLLM } from "../src/lib/llm";
import { discoverOrganizations, identifyDecisionMakers } from "../src/lib/ai/functions";
import { prisma } from "../src/lib/db";

async function main() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  setLLM(new AnthropicProvider(key, process.env.LLM_MODEL ?? "claude-opus-5"));

  const exp = await prisma.marketExperiment.findFirstOrThrow({
    where: { slug: "municipal-obsolete-parts" },
  });
  const brief = {
    id: exp.id,
    name: exp.name,
    hypothesis: exp.hypothesis,
    buyerPersona: exp.buyerPersona,
    likelyProblem: exp.likelyProblem,
    offer: exp.offer,
    targetTitles: JSON.parse(exp.targetTitles),
    targetOrgTypes: JSON.parse(exp.targetOrgTypes),
    targetGeography: "Minnesota",
    exclusionCriteria: JSON.parse(exp.exclusionCriteria),
    qualificationCriteria: JSON.parse(exp.qualificationCriteria),
    researchStrategy: exp.researchStrategy,
    safetyNotes: exp.safetyNotes,
  };

  console.log("→ discoverOrganizations (web search on)…");
  const d = await discoverOrganizations(
    { brief, count: 3, knownOrganizations: [], targetingGuidance: null },
    { experimentId: exp.id },
  );
  for (const o of d.output.organizations) {
    console.log(`   • ${o.name} — ${o.city ?? "?"}, ${o.state ?? "?"} | evidence: ${o.problemEvidence ? "yes" : "none"}`);
    if (o.sourceUrl) console.log(`     ${o.sourceUrl}`);
  }
  console.log(`   citations: ${d.citations.length}, run ${d.runId}`);

  const first = d.output.organizations[0];
  if (first) {
    console.log(`\n→ identifyDecisionMakers for ${first.name}…`);
    const p = await identifyDecisionMakers(
      {
        brief,
        organizationName: first.name,
        website: first.website,
        organizationSummary: first.whyRelevant,
      },
      { experimentId: exp.id },
    );
    for (const person of p.output.people) {
      console.log(
        `   • ${person.name ?? "(unnamed)"} — ${person.title} | ${person.email ?? "no address"} [${person.emailConfidence}]`,
      );
      if (person.sourceUrl) console.log(`     ${person.sourceUrl}`);
    }
  }

  const runs = await prisma.aITaskRun.findMany({
    where: { experimentId: exp.id },
    orderBy: { startedAt: "desc" },
    take: 4,
  });
  console.log("\nAudit rows:");
  for (const r of runs) {
    console.log(
      `   ${r.taskType} ${r.status} prompt=${r.promptVersion} tokens=${r.inputTokens}/${r.outputTokens} searches=${r.webSearches} cost=$${(r.costUsd ?? 0).toFixed(4)} ${r.durationMs}ms retries=${r.retryCount}`,
    );
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FAILED:", e);
  await prisma.$disconnect();
  process.exit(1);
});
