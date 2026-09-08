import { PrismaClient } from "../src/generated/prisma";
import { SEED_EXPERIMENTS } from "./experiments";

const prisma = new PrismaClient();
const j = (v: unknown) => JSON.stringify(v);

async function main() {
  let created = 0;
  let updated = 0;

  for (const e of SEED_EXPERIMENTS) {
    const data = {
      name: e.name,
      hypothesis: e.hypothesis,
      buyerPersona: e.buyerPersona,
      likelyProblem: e.likelyProblem,
      offer: e.offer,
      targetTitles: j(e.targetTitles),
      targetOrgTypes: j(e.targetOrgTypes),
      exclusionCriteria: j(e.exclusionCriteria),
      targetGeography: e.targetGeography,
      researchStrategy: e.researchStrategy,
      qualificationCriteria: j(e.qualificationCriteria),
      successCriteria: j(e.successCriteria),
      safetyNotes: e.safetyNotes,
      monetizationPaths: j(e.monetizationPaths),
      directoryQueries: j(e.directoryQueries),
    };

    const existing = await prisma.marketExperiment.findUnique({ where: { slug: e.slug } });
    if (existing) {
      // Never touch stage, status, trust level or targets — those are the
      // operator's, and a re-seed must not restart or re-open an experiment.
      await prisma.marketExperiment.update({ where: { slug: e.slug }, data });
      updated++;
    } else {
      await prisma.marketExperiment.create({
        data: { slug: e.slug, ...data, stage: "SCOUT", status: "DRAFT", trustLevel: "REVIEW_ALL", prospectTarget: 25, contactedTarget: 25 },
      });
      created++;
    }
  }

  console.log(`Seeded ${SEED_EXPERIMENTS.length} experiments: ${created} created, ${updated} updated.`);
  console.log("All start as DRAFT. Open one and press Start Experiment to let the pipeline begin.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
