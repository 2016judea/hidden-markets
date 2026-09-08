/**
 * npx tsx scripts/start-experiment.ts <experiment-slug>
 *
 * The headless equivalent of pressing "Start experiment" in the app: flips the
 * experiment to ACTIVE and enqueues the first MAINTAIN_PIPELINE. The worker
 * (npm run worker) does the rest. Sends still stop at the human gate.
 */
import { enqueue, registerHandlers } from "../src/lib/jobs";
import { logActivity } from "../src/lib/domain/activity";
import { prisma } from "../src/lib/db";

async function main() {
  registerHandlers();
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: npx tsx scripts/start-experiment.ts <experiment-slug>");
    process.exit(1);
  }

  const experiment = await prisma.marketExperiment.findUnique({ where: { slug } });
  if (!experiment) {
    console.error(`No experiment with slug "${slug}"`);
    process.exit(1);
  }
  if (experiment.status === "ACTIVE") {
    console.log(`"${slug}" is already ACTIVE.`);
    await prisma.$disconnect();
    return;
  }

  await prisma.marketExperiment.update({
    where: { id: experiment.id },
    data: { status: "ACTIVE", approvedAt: new Date() },
  });
  await enqueue({
    kind: "MAINTAIN_PIPELINE",
    payload: { experimentId: experiment.id },
    experimentId: experiment.id,
    idempotencyKey: `maintain:${experiment.id}`,
  });
  await logActivity({
    experimentId: experiment.id,
    kind: "SYSTEM",
    actor: "HUMAN",
    message: "Experiment started.",
  });

  console.log(`Started "${experiment.name}" (${slug}). Run \`npm run worker\`.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
