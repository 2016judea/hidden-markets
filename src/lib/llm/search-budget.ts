import { prisma } from "../db";

/**
 * A ceiling on billed Google Search queries per calendar month.
 *
 * Grounding is billed per SEARCH QUERY at $0.014, the first 5,000 a month are
 * free, and one research call issues six to sixteen of them. Between
 * 2026-09-07 and 2026-09-10 this app issued 10,796 — $84.21 of search on top
 * of an exhausted free tier — because a job whose error was always transient
 * retried forever and re-grounded every time. Nothing in the process could see
 * the running total, so nothing could refuse.
 *
 * The default is deliberately close to the free tier: 6,000 queries is about a
 * thousand research calls, and the worst case beyond free is $14. Raise
 * SEARCH_MONTHLY_CAP when a month genuinely needs more; that is a decision
 * about money, which is Aidan's to make and not a default's.
 */
export const SEARCH_MONTHLY_CAP = Number(process.env.SEARCH_MONTHLY_CAP ?? 6_000);

/** Which provider's searches this cap governs — Google bills these. */
const COUNTED_PROVIDER = "gemini";

export class SearchBudgetExceeded extends Error {
  /**
   * Never retry this one. The retry classifiers match on message text, and a
   * used-count that happens to contain "502" would otherwise read as a server
   * error and get backed off and tried again — which is the opposite of what a
   * spend cap is for.
   */
  readonly permanent = true;

  /**
   * And it is not a broken job either. Refusing costs nothing — no request is
   * made — so a job that trips the cap waits instead of spending an attempt.
   * Otherwise a cap set a little too low would quietly dead-letter every
   * candidate in the pipeline, which is a far worse outcome than a pause.
   */
  readonly deferrable = true;
  readonly retryAfterMs = 6 * 3_600_000;

  constructor(
    readonly used: number,
    readonly cap: number,
  ) {
    super(
      `search budget exhausted: ${used} billed search queries this month against a cap of ${cap}. ` +
        `Raise SEARCH_MONTHLY_CAP to spend more, or wait for the month to roll.`,
    );
    this.name = "SearchBudgetExceeded";
  }
}

function monthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${now.getUTCMonth()}`;
}

function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * The count is read from the audit table and then held for a minute, because
 * four lanes each asking SQLite for a SUM before every call is a lot of writes'
 * worth of contention for a number that moves slowly. Searches this process
 * issues are added locally in the meantime, so a burst cannot overshoot by a
 * whole TTL's worth of spend.
 */
let cache: { month: string; count: number; readAt: number } | null = null;
const TTL_MS = 60_000;

export function resetSearchBudgetCache(): void {
  cache = null;
}

export async function billedSearchesThisMonth(now = new Date()): Promise<number> {
  const month = monthKey(now);
  if (cache && cache.month === month && now.getTime() - cache.readAt < TTL_MS) return cache.count;

  const agg = await prisma.aITaskRun.aggregate({
    _sum: { webSearches: true },
    where: { modelProvider: COUNTED_PROVIDER, startedAt: { gte: monthStart(now) } },
  });
  cache = { month, count: agg._sum.webSearches ?? 0, readAt: now.getTime() };
  return cache.count;
}

/** Count searches this process just issued, so the cap sees them before the TTL. */
export function noteSearches(n: number): void {
  if (cache && n > 0) cache.count += n;
}

/**
 * Refuse to search rather than search. Throws before any request is made, so a
 * call that trips the cap costs nothing at all.
 */
export async function assertSearchBudget(): Promise<void> {
  if (!Number.isFinite(SEARCH_MONTHLY_CAP) || SEARCH_MONTHLY_CAP <= 0) return;
  const used = await billedSearchesThisMonth();
  if (used >= SEARCH_MONTHLY_CAP) throw new SearchBudgetExceeded(used, SEARCH_MONTHLY_CAP);
}
