/**
 * npx tsx scripts/import-legistar.ts [path/to/records.jsonl] [experiment-slug]
 *
 * Defaults to the sibling obsolete-parts repo and the municipal experiment.
 */
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { importLegistarRecords } from "../src/lib/ingest/legistar";
import { registerHandlers } from "../src/lib/jobs";
import { prisma } from "../src/lib/db";

const DEFAULT_PATH = path.join(
  os.homedir(),
  "Desktop/workspace/the-google-of-obsolete-infrastructure-parts/data/records.jsonl",
);

async function main() {
  registerHandlers();
  const filePath = process.argv[2] ?? DEFAULT_PATH;
  const slug = process.argv[3] ?? "municipal-obsolete-parts";

  if (!fs.existsSync(filePath)) {
    console.error(`No records file at ${filePath}`);
    process.exit(1);
  }

  const result = await importLegistarRecords({ experimentSlug: slug, filePath });
  console.log(
    `${result.created} agencies imported into "${slug}" ` +
      `(${result.skipped} skipped, ${result.evidence} sourced evidence items, ` +
      `${result.obsolescenceRecords} obsolescence filings across ${result.agencies} agencies).`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
