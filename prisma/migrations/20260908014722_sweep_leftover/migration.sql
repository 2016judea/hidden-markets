-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DirectorySweep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "experimentId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "found" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "leftover" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_DirectorySweep" ("costUsd", "created", "createdAt", "experimentId", "found", "id", "location", "provider", "term") SELECT "costUsd", "created", "createdAt", "experimentId", "found", "id", "location", "provider", "term" FROM "DirectorySweep";
DROP TABLE "DirectorySweep";
ALTER TABLE "new_DirectorySweep" RENAME TO "DirectorySweep";
CREATE INDEX "DirectorySweep_experimentId_idx" ON "DirectorySweep"("experimentId");
CREATE UNIQUE INDEX "DirectorySweep_experimentId_term_location_key" ON "DirectorySweep"("experimentId", "term", "location");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
