import { randomUUID } from "node:crypto";
import { prisma, j, parseJson } from "../db";
import { logActivity } from "../domain/activity";

export type JobKind =
  | "MAINTAIN_PIPELINE"
  | "DISCOVER_CANDIDATES"
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
  const job = await prisma.jobRun.create({
    data: {
      kind: args.kind,
      payload: j(args.payload ?? {}),
      experimentId: args.experimentId ?? null,
      runAfter: args.runAfter ?? new Date(),
      maxAttempts: args.maxAttempts ?? 3,
      idempotencyKey: args.idempotencyKey ?? null,
    },
  });
  return job.id;
}

/**
 * Claim exactly one job. The updateMany-guarded-by-status pattern is the
 * cheapest correct lock SQLite offers: two workers race, one updates a row that
 * is still PENDING, the other updates zero rows and moves on.
 */
async function claim(workerId: string): Promise<{ id: string; kind: JobKind; payload: string } | null> {
  const candidate = await prisma.jobRun.findFirst({
    where: { status: "PENDING", runAfter: { lte: new Date() } },
    orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }],
    select: { id: true, kind: true, payload: true },
  });
  if (!candidate) return null;

  const claimed = await prisma.jobRun.updateMany({
    where: { id: candidate.id, status: "PENDING" },
    data: { status: "RUNNING", lockedAt: new Date(), lockedBy: workerId, startedAt: new Date() },
  });
  if (claimed.count === 0) return claim(workerId);
  return candidate as { id: string; kind: JobKind; payload: string };
}

const BACKOFF_MS = [30_000, 5 * 60_000, 30 * 60_000];

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
      },
    });
  } catch (err) {
    const row = await prisma.jobRun.findUnique({ where: { id: job.id } });
    const attempts = (row?.attempts ?? 0) + 1;
    const exhausted = attempts >= (row?.maxAttempts ?? 3);
    const message = String((err as Error)?.message ?? err).slice(0, 2000);

    await prisma.jobRun.update({
      where: { id: job.id },
      data: {
        status: exhausted ? "FAILED" : "PENDING",
        attempts,
        error: message,
        lockedAt: null,
        lockedBy: null,
        completedAt: exhausted ? new Date() : null,
        runAfter: exhausted
          ? undefined
          : new Date(Date.now() + (BACKOFF_MS[attempts - 1] ?? BACKOFF_MS.at(-1)!)),
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

/** Drain the queue. Returns how many jobs ran. */
export async function drain(max = 200, workerId: string = randomUUID()): Promise<number> {
  let n = 0;
  while (n < max && (await runOne(workerId))) n++;
  return n;
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
