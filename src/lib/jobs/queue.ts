import { randomUUID } from "node:crypto";
import { prisma, j, parseJson } from "../db";
import { logActivity } from "../domain/activity";

export type JobKind =
  | "MAINTAIN_PIPELINE"
  | "DISCOVER_CANDIDATES"
  | "PRESCREEN_CANDIDATE"
  | "RESEARCH_CANDIDATE"
  | "QUALIFY_CANDIDATE"
  | "DRAFT_OUTREACH"
  | "SEND_APPROVED_OUTBOX"
  | "SYNC_INBOX"
  | "PROCESS_INBOUND"
  | "SCHEDULE_FOLLOWUPS"
  | "SEND_APPROVED_REPLIES"
  | "ANALYZE_EXPERIMENT"
  | "CLUSTER_PAIN";

export type JobHandler = (payload: Record<string, unknown>, job: { id: string }) => Promise<unknown>;

const handlers = new Map<JobKind, JobHandler>();

export function registerHandler(kind: JobKind, handler: JobHandler): void {
  handlers.set(kind, handler);
}

export async function enqueue(args: {
  kind: JobKind;
  payload?: Record<string, unknown>;
  experimentId?: string | null;
  runAfter?: Date;
  maxAttempts?: number;
  /** Present means "at most one of these outstanding". Re-enqueue is a no-op. */
  idempotencyKey?: string;
}): Promise<string | null> {
  if (args.idempotencyKey) {
    const existing = await prisma.jobRun.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
    if (existing && ["PENDING", "RUNNING"].includes(existing.status)) return existing.id;
    if (existing) await prisma.jobRun.delete({ where: { id: existing.id } });
  }

  const data = {
    kind: args.kind,
    payload: j(args.payload ?? {}),
    experimentId: args.experimentId ?? null,
    runAfter: args.runAfter ?? new Date(),
    maxAttempts: args.maxAttempts ?? 3,
    idempotencyKey: args.idempotencyKey ?? null,
  };

  try {
    const job = await prisma.jobRun.create({ data });
    return job.id;
  } catch (err) {
    // The check above is not atomic. With four lanes, two can both find no
    // existing row and both try to create it; the loser gets a unique-constraint
    // violation, which then propagates up and kills the whole tick. Losing the
    // race is the correct outcome — the job exists — so treat it as a success
    // and hand back whoever won.
    if ((err as { code?: string }).code === "P2002" && args.idempotencyKey) {
      const winner = await prisma.jobRun.findUnique({
        where: { idempotencyKey: args.idempotencyKey },
        select: { id: true },
      });
      if (winner) return winner.id;
    }
    throw err;
  }
}

/**
 * Jobs that finish the work already paid for, and are claimed ahead of jobs
 * that start new work.
 *
 * Strict FIFO starved the pipeline: research calls run 40-100 seconds, so with
 * four lanes and thirty-eight research jobs queued, fifty-nine QUALIFY jobs —
 * each about a second and a cent, and the step that actually produces something
 * a human can review — waited roughly ten minutes behind them. Draining
 * downstream first also means a rejection frees stage budget sooner, so the
 * expensive upstream work is better targeted when it does run.
 */
const PRIORITY_KINDS: JobKind[] = [
  "SEND_APPROVED_OUTBOX",
  "SEND_APPROVED_REPLIES",
  "PROCESS_INBOUND",
  "SYNC_INBOX",
  "QUALIFY_CANDIDATE",
  "DRAFT_OUTREACH",
  "MAINTAIN_PIPELINE",
  // A cent, no search, and it stops a $0.24 research call — the cheapest
  // thing in the queue belongs near the front of it.
  "PRESCREEN_CANDIDATE",
];

/**
 * Claim exactly one job. The updateMany-guarded-by-status pattern is the
 * cheapest correct lock SQLite offers: two lanes race for the same row, one
 * updates a row that is still PENDING, the other updates zero rows and looks
 * again. Bounded rather than recursive — under contention an unbounded retry
 * is a stack, not a queue.
 */
async function claim(workerId: string): Promise<{ id: string; kind: JobKind; payload: string } | null> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const ready = { status: "PENDING", runAfter: { lte: new Date() } } as const;
    const order = [{ runAfter: "asc" }, { createdAt: "asc" }] as const;
    const select = { id: true, kind: true, payload: true } as const;

    const candidate =
      (await prisma.jobRun.findFirst({
        where: { ...ready, kind: { in: PRIORITY_KINDS } },
        orderBy: [...order],
        select,
      })) ??
      (await prisma.jobRun.findFirst({ where: ready, orderBy: [...order], select }));
    if (!candidate) return null;

    const claimed = await prisma.jobRun.updateMany({
      where: { id: candidate.id, status: "PENDING" },
      data: { status: "RUNNING", lockedAt: new Date(), lockedBy: workerId, startedAt: new Date() },
    });
    if (claimed.count > 0) return candidate as { id: string; kind: JobKind; payload: string };
  }
  return null;
}

const BACKOFF_MS = [30_000, 5 * 60_000, 30 * 60_000];

/**
 * A blip is not a verdict.
 *
 * A real reply from a municipal Chief of Operations — the exact evidence the
 * experiment exists to find — was permanently discarded because three
 * consecutive "Connection error" responses from the model API burned the whole
 * retry budget. The work was never wrong; the network was briefly down.
 *
 * So transient failures back off and keep trying instead of spending an
 * attempt. Anything that would fail identically on the tenth try — a bad
 * schema, a 400, a missing row — still fails fast on the third.
 */
const TRANSIENT = /connection error|fetch failed|socket hang up|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network|terminated|timeout|429|rate.?limit|50[0234]|overloaded|service unavailable/i;

export function isTransient(err: unknown): boolean {
  const e = err as { message?: string; status?: number; code?: string };
  if (typeof e?.status === "number" && (e.status === 429 || e.status >= 500)) return true;
  return TRANSIENT.test(`${e?.message ?? ""} ${e?.code ?? ""}`);
}

/** How long to wait after the nth transient failure, capped so it keeps trying. */
function transientBackoffMs(attempts: number): number {
  return Math.min(60_000 * 2 ** Math.min(attempts, 4), 15 * 60_000);
}

export async function runOne(workerId: string = randomUUID()): Promise<boolean> {
  const job = await claim(workerId);
  if (!job) return false;

  const handler = handlers.get(job.kind);
  if (!handler) {
    await prisma.jobRun.update({
      where: { id: job.id },
      data: { status: "FAILED", error: `no handler registered for ${job.kind}`, completedAt: new Date() },
    });
    return true;
  }

  try {
    const result = await handler(parseJson<Record<string, unknown>>(job.payload, {}), { id: job.id });
    await prisma.jobRun.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        completedAt: new Date(),
        attempts: { increment: 1 },
        result: result === undefined ? null : j(result),
        // A job that failed twice and then succeeded was keeping the old error
        // text, so SUCCEEDED rows read as broken and sent a peer session
        // hunting a bug that had already retried away.
        error: null,
      },
    });
  } catch (err) {
    const row = await prisma.jobRun.findUnique({ where: { id: job.id } });
    const message = String((err as Error)?.message ?? err).slice(0, 2000);
    const transient = isTransient(err);

    // A transient failure costs a delay, not an attempt.
    const attempts = transient ? (row?.attempts ?? 0) : (row?.attempts ?? 0) + 1;
    const exhausted = !transient && attempts >= (row?.maxAttempts ?? 3);
    const waitMs = transient
      ? transientBackoffMs((row?.transientFailures ?? 0) + 1)
      : (BACKOFF_MS[attempts - 1] ?? BACKOFF_MS.at(-1)!);

    await prisma.jobRun.update({
      where: { id: job.id },
      data: {
        status: exhausted ? "FAILED" : "PENDING",
        attempts,
        transientFailures: transient ? { increment: 1 } : undefined,
        error: message,
        lockedAt: null,
        lockedBy: null,
        completedAt: exhausted ? new Date() : null,
        runAfter: exhausted ? undefined : new Date(Date.now() + waitMs),
      },
    });

    if (exhausted) {
      await logActivity({
        experimentId: row?.experimentId ?? null,
        kind: "ERROR",
        message: `${job.kind} failed after ${attempts} attempts: ${message.slice(0, 200)}`,
      });
    }
  }
  return true;
}

/**
 * How many jobs may be in flight at once.
 *
 * The work is almost entirely waiting on the model — research calls measured
 * 76-142 seconds each — so a serial drain spends nearly all of its time idle:
 * six candidates through three calls each is half an hour of doing one thing at
 * a time. Lanes are safe because the claim above is atomic; what bounds this is
 * not correctness but the API rate limit and SQLite write contention, which is
 * why it is a small number and configurable rather than unbounded.
 */
export const JOB_CONCURRENCY = Number(process.env.JOB_CONCURRENCY ?? 4);

/** Drain the queue across parallel lanes. Returns how many jobs ran. */
export async function drain(
  max = 200,
  workerId: string = randomUUID(),
  concurrency: number = JOB_CONCURRENCY,
): Promise<number> {
  let ran = 0;

  // Each lane exits on its own the first time it finds nothing to claim, so an
  // empty queue costs one extra query per lane rather than a spin.
  const lane = async (laneId: string): Promise<void> => {
    while (ran < max) {
      const didWork = await runOne(laneId);
      if (!didWork) return;
      ran++;
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, (_, i) => lane(`${workerId}#${i}`)),
  );
  return ran;
}

export async function queueDepth(): Promise<{ pending: number; running: number; failed: number }> {
  const [pending, running, failed] = await Promise.all([
    prisma.jobRun.count({ where: { status: "PENDING" } }),
    prisma.jobRun.count({ where: { status: "RUNNING" } }),
    prisma.jobRun.count({ where: { status: "FAILED" } }),
  ]);
  return { pending, running, failed };
}

/** A worker that died mid-job leaves a RUNNING row nobody will ever finish. */
export async function reclaimStale(olderThanMs = 15 * 60_000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const res = await prisma.jobRun.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: cutoff } },
    data: { status: "PENDING", lockedAt: null, lockedBy: null },
  });
  return res.count;
}
