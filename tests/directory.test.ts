import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { prisma, parseJson } from "@/lib/db";
import { setLLM, MockLLMProvider } from "@/lib/llm";
import { setDirectory, type DirectoryProvider, type DirectoryQuery, type DirectorySearchResult } from "@/lib/directory";
import { drain, enqueue, registerHandlers } from "@/lib/jobs";

/**
 * Run exactly one discovery job. A successful sweep nudges the scheduler, and
 * that MAINTAIN job is older than the next DISCOVER, so a bare drain(1) claims
 * the nudge instead of the thing under test.
 */
async function discoverOnce(experimentId: string, count = 8): Promise<void> {
  await prisma.jobRun.deleteMany({ where: { status: "PENDING" } });
  await enqueue({ kind: "DISCOVER_CANDIDATES", payload: { experimentId, count }, experimentId });
  await drain(1, "test", 1);
}

/** Returns a full page every time, and counts how often it was actually paid. */
class CountingDirectory implements DirectoryProvider {
  readonly name = "mock-directory";
  calls = 0;
  constructor(private pageSize = 30) {}
  async search(query: DirectoryQuery): Promise<DirectorySearchResult> {
    this.calls++;
    const records = Array.from({ length: this.pageSize }, (_, i) => ({
      externalId: `${query.location}-${query.term}-${i}`,
      name: `${query.term} ${i} of ${query.location}`,
      website: `https://example-${query.location.replace(/\W/g, "")}-${i}.test`,
      phone: "555-0100",
      address: "1 Test St",
      city: query.location.split(",")[0],
      state: query.location.split(",")[1]?.trim() ?? null,
      primaryType: query.term,
      operational: true,
      sourceUrl: "https://maps.example/x",
    }));
    return { records, calls: 1, costUsd: 0.032 };
  }
}

describe("directory discovery", () => {
  let experimentId: string;
  const directory = new CountingDirectory(30);

  beforeAll(async () => {
    setLLM(new MockLLMProvider());
    setDirectory(directory);
    registerHandlers();

    for (const del of [
      prisma.directorySweep.deleteMany(),
      prisma.outboxDraft.deleteMany(),
      prisma.prospect.deleteMany(),
      prisma.evidenceItem.deleteMany(),
      prisma.prospectCandidate.deleteMany(),
      prisma.organization.deleteMany(),
      prisma.jobRun.deleteMany(),
      prisma.activityEvent.deleteMany(),
      prisma.aITaskRun.deleteMany(),
      prisma.marketExperiment.deleteMany(),
    ]) await del;

    const exp = await prisma.marketExperiment.create({
      data: {
        slug: "test-directory",
        name: "Directory test",
        hypothesis: "h",
        buyerPersona: "b",
        likelyProblem: "p",
        offer: "o",
        status: "ACTIVE",
        prospectTarget: 8,
        contactedTarget: 25,
        directoryQueries: JSON.stringify(["widget shop"]),
        directoryLocations: JSON.stringify(["Testville, MN", "Otherton, WI"]),
      },
    });
    experimentId = exp.id;
  });

  it("creates candidates from the directory without spending a model call", async () => {
    // Only the discovery job — research would need LLM stubs we have not set.
    await discoverOnce(experimentId);

    const candidates = await prisma.prospectCandidate.findMany({ where: { experimentId } });
    expect(candidates).toHaveLength(8);
    expect(candidates[0].website).toContain("https://");
    expect(candidates[0].phone).toBe("555-0100");
    expect(candidates[0].city).toBe("Testville");

    // The claim on a directory candidate must not overstate what we know.
    expect(candidates[0].relevanceReason).toBe('Listed as "widget shop" in Testville, MN.');
    expect(candidates[0].likelyProblemFit).toBeNull();

    expect(await prisma.aITaskRun.count()).toBe(0);
    expect(directory.calls).toBe(1);
    // Nothing is screened yet — the cheap gate has not run.
    expect(candidates.every((c) => c.prescreenVerdict === null)).toBe(true);
  });

  it("keeps the rest of a paid page and drains it before buying another", async () => {
    const sweep = await prisma.directorySweep.findFirstOrThrow({ where: { experimentId } });
    expect(sweep.found).toBe(30);
    expect(sweep.created).toBe(8);
    expect(parseJson<unknown[]>(sweep.leftover, [])).toHaveLength(22);

    await discoverOnce(experimentId);

    // Same page, no second purchase.
    expect(directory.calls).toBe(1);
    expect(await prisma.prospectCandidate.count({ where: { experimentId } })).toBe(16);

    const after = await prisma.directorySweep.findFirstOrThrow({ where: { experimentId } });
    expect(parseJson<unknown[]>(after.leftover, [])).toHaveLength(14);
    expect(after.costUsd).toBe(0.032);
  });

  it("moves to the next location only once the paid page is used up", async () => {
    // 30 listed, drawn 8 at a time: two draws already taken, two more empty the
    // page, and only then is a second location worth paying for.
    for (let i = 0; i < 3; i++) await discoverOnce(experimentId);
    expect(directory.calls).toBe(2);
    const locations = await prisma.directorySweep.findMany({ where: { experimentId }, orderBy: { createdAt: "asc" } });
    expect(locations.map((l) => l.location)).toEqual(["Testville, MN", "Otherton, WI"]);
  });
});
