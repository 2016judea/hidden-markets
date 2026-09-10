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

/**
 * Jobs whose whole point is to run again next tick — the heartbeat. None of
 * them searches, all of them are cheap, and the pipeline stops without them, so
 * a dead letter never blocks one of these. Everything else is per-entity work
 * that spends money, and there a dead letter is a decision.
 */
const RECURRING_KINDS: JobKind[] = [
  "MAINTAIN_PIPELINE",
  "SYNC_INBOX",
  "SEND_APPROVED_OUTBOX",
  "SEND_APPROVED_REPLIES",
  "SCHEDULE_FOLLOWUPS",
  "ANALYZE_EXPERIMENT",
  "CLUSTER_PAIN",
];

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

    // A dead letter stays dead.
    //
    // This delete is what made every attempt budget in this file cosmetic.
    // MAINTAIN_PIPELINE re-enqueues each candidate that is still DISCOVERED,
    // and a research job that fails rolls its candidate back to DISCOVERED —
    // so the FAILED row was deleted a minute later and the same work started
    // again with attempts back at zero. Between 2026-09-07 and 2026-09-10 that
    // researched 432 organizations 1,313 times, one of them forty times, at
    // roughly six billed Google searches each: about half of a $131.80 bill,
    // with not one FAILED job row left behind to show it.
    //
    // So a failed per-entity job keeps its key. The row stays, with the bound
    // it hit written on it, and `retryDeadLetter` is how a human says try
    // again. The heartbeat kinds above are exempt: they are meant to re-run.
    if (existing?.status === "FAILED" && !RECURRING_KINDS.includes(args.kind)) return null;

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
  const e = err as { message?: string; status?: number; code?: string; permanent?: boolean };
  // An error that says it will never improve is believed over the text match.
  // A spend cap whose message carries a number like 6502 in it would otherwise
  // trip the 5xx pattern and be retried past the cap.
  if (e?.permanent === true) return false;
  if (typeof e?.status === "number" && (e.status === 429 || e.status >= 500)) return true;
  return TRANSIENT.test(`${e?.message ?? ""} ${e?.code ?? ""}`);
}

/** How long to wait after the nth transient failure, capped so it keeps trying. */
function transientBackoffMs(attempts: number): number {
  return Math.min(60_000 * 2 ** Math.min(attempts, 4), 15 * 60_000);
}

/**
 * ...but a blip that never ends is a bill.
 *
 * The rule above was written with no ceiling on it: a transient failure did not
 * spend an attempt, and `exhausted` was hard-coded to false whenever the error
 * was transient, so a job whose error was ALWAYS transient retried forever with
 * the backoff pinned at fifteen minutes. Between 2026-09-07 and 2026-09-10, 429
 * organizations produced 1,333 RESEARCH_ORGANIZATION runs — single orgs
 * re-researched up to forty times — and every attempt re-ran Google grounding
 * at roughly six billed searches, about $0.08. Half of a $131.80 Google bill
 * bought nothing.
 *
 * So a blip still costs a delay rather than an attempt, and the intent survives:
 * a real reply is not thrown away over three bad seconds of network. But the
 * delays are counted, and they run out. Eight of them spans about seventy-five
 * minutes of backoff, which is a long outage; past that, or past a day since the
 * job was created, the job dead-letters like any other exhausted job and says
 * which bound it hit.
 */
export const MAX_TRANSIENT_FAILURES = Number(process.env.JOB_MAX_TRANSIENT_FAILURES ?? 8);
export const JOB_DEADLINE_MS = Number(process.env.JOB_DEADLINE_HOURS ?? 24) * 3_600_000;

/**
 * Whether this failure is the last one. Pure, so the bounds are testable
 * without a database and without waiting a day.
 */
export function deadLetterReason(f: {
  transient: boolean;
  attempts: number;
  maxAttempts: number;
  transientFailures: number;
  ageMs: number;
}): string | null {
  if (!f.transient && f.attempts >= f.maxAttempts) return `${f.attempts} attempts`;
  if (f.transientFailures >= MAX_TRANSIENT_FAILURES) {
    return `${f.transientFailures} transient failures, ceiling ${MAX_TRANSIENT_FAILURES}`;
  }
  if (f.ageMs >= JOB_DEADLINE_MS) {
    return `open ${(f.ageMs / 3_600_000).toFixed(1)}h, past the ${(JOB_DEADLINE_MS / 3_600_000).toFixed(0)}h deadline`;
  }
  return null;
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

    // Not a failure at all: a spend cap refused before any request was made, so
    // nothing was tried and nothing was billed. Wait, and keep the budgets
    // intact — a cap set slightly too low must pause the pipeline, never
    // dead-letter it.
    const deferral = err as { deferrable?: boolean; retryAfterMs?: number };
    if (deferral?.deferrable === true) {
      await prisma.jobRun.update({
        where: { id: job.id },
        data: {
          status: "PENDING",
          error: message,
          lockedAt: null,
          lockedBy: null,
          completedAt: null,
          runAfter: new Date(Date.now() + (deferral.retryAfterMs ?? 6 * 3_600_000)),
        },
      });
      return true;
    }

    // A transient failure costs a delay, not an attempt — but the delays are
    // counted, and they run out.
    const attempts = transient ? (row?.attempts ?? 0) : (row?.attempts ?? 0) + 1;
    const transientFailures = (row?.transientFailures ?? 0) + (transient ? 1 : 0);
    const reason = deadLetterReason({
      transient,
      attempts,
      maxAttempts: row?.maxAttempts ?? 3,
      transientFailures,
      ageMs: Date.now() - (row?.createdAt?.getTime() ?? Date.now()),
    });
    const exhausted = reason !== null;
    const waitMs = transient
      ? transientBackoffMs(transientFailures)
      : (BACKOFF_MS[attempts - 1] ?? BACKOFF_MS.at(-1)!);

    await prisma.jobRun.update({
      where: { id: job.id },
      data: {
        status: exhausted ? "FAILED" : "PENDING",
        attempts,
        transientFailures,
        // The bound that stopped it, on the row, because "fetch failed" for the
        // fortieth time reads exactly like "fetch failed" for the first.
        error: exhausted ? `${message} [gave up: ${reason}]`.slice(0, 2000) : message,
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
        message: `${job.kind} gave up (${reason}): ${message.slice(0, 200)}`,
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

/**
 * Clear a dead letter so its work may be attempted again. Deliberate, by hand
 * or by an action — which is the point: the thing that used to do this
 * automatically, every minute, is what spent the money.
 */
export async function retryDeadLetter(idempotencyKey: string): Promise<boolean> {
  const res = await prisma.jobRun.deleteMany({ where: { idempotencyKey, status: "FAILED" } });
  return res.count > 0;
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
