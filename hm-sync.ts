import { registerHandlers, enqueue, drain } from "./src/lib/jobs";
import { prisma, parseJson } from "./src/lib/db";

async function main() {
  registerHandlers();
  await enqueue({ kind: "SYNC_INBOX", idempotencyKey: `manual-sync-${Date.now()}` });
  const n = await drain(40, "manual", 2);
  console.log("ran", n, "jobs");
  console.log("inbound now:", await prisma.emailMessage.count({ where: { direction: "INBOUND" } }));
  const rr = await prisma.replyReview.findMany({ include: { inboundMessage: true } });
  for (const r of rr) {
    console.log("REPLY REVIEW:", r.status, "|", r.inboundMessage.fromAddress, "|", parseJson<string[]>(r.classifications, []).join(","));
    console.log("   ", (r.interpretation ?? "").slice(0, 160));
  }
  const last = await prisma.jobRun.findFirst({ where: { kind: "SYNC_INBOX", status: "SUCCEEDED" }, orderBy: { completedAt: "desc" } });
  console.log("sync result:", last?.result);
  await prisma.$disconnect();
}
main();
