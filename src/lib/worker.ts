import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { drain, enqueue, registerHandlers, reclaimStale } from "./jobs";
import { logActivity } from "./domain/activity";

/**
 * The background worker. A separate process from the web app on purpose: it is
 * the thing that will one day run somewhere else, and keeping it out of the
 * request path from day one is cheaper than extracting it later.
 *
 *   npm run worker
 */
const WORKER_ID = `worker-${randomUUID().slice(0, 8)}`;
const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 15_000);
const INBOX_EVERY_MS = Number(process.env.INBOX_POLL_MS ?? 120_000);
const MAINTAIN_EVERY_MS = Number(process.env.MAINTAIN_POLL_MS ?? 300_000);
const CLUSTER_EVERY_MS = Number(process.env.CLUSTER_POLL_MS ?? 3_600_000);

let lastInbox = 0;
let lastMaintain = 0;
let lastCluster = 0;
let stopping = false;

async function tick(): Promise<void> {
  const now = Date.now();
  await reclaimStale();

  if (now - lastInbox > INBOX_EVERY_MS) {
    lastInbox = now;
    await enqueue({ kind: "SYNC_INBOX", idempotencyKey: "sync-inbox" });
    await enqueue({ kind: "SEND_APPROVED_REPLIES", idempotencyKey: "send-replies" });
  }

  // The outbox is drained every tick. A draft a human approved should leave
  // within seconds, not on the next poll cycle.
  await enqueue({ kind: "SEND_APPROVED_OUTBOX", idempotencyKey: "send-outbox" });

  if (now - lastMaintain > MAINTAIN_EVERY_MS) {
    lastMaintain = now;
    const active = await prisma.marketExperiment.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });
    for (const e of active) {
      await enqueue({
        kind: "MAINTAIN_PIPELINE",
        payload: { experimentId: e.id },
        experimentId: e.id,
        idempotencyKey: `maintain:${e.id}`,
      });
    }
  }

  if (now - lastCluster > CLUSTER_EVERY_MS) {
    lastCluster = now;
    await enqueue({ kind: "CLUSTER_PAIN", idempotencyKey: "cluster-pain" });
  }

  const ran = await drain(50, WORKER_ID);
  if (ran > 0) console.log(`[${new Date().toISOString()}] ${WORKER_ID} ran ${ran} job(s)`);
}

async function main(): Promise<void> {
  registerHandlers();
  console.log(`${WORKER_ID} started. Tick ${TICK_MS}ms.`);
  await logActivity({ kind: "SYSTEM", message: `Worker ${WORKER_ID} started.` });

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      stopping = true;
      console.log(`\n${WORKER_ID} stopping…`);
    });
  }

  while (!stopping) {
    try {
      await tick();
    } catch (err) {
      console.error("tick failed:", err);
    }
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
  await prisma.$disconnect();
  process.exit(0);
}

main();
