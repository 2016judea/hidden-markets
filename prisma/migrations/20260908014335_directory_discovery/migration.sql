-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MarketExperiment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "buyerPersona" TEXT NOT NULL,
    "likelyProblem" TEXT NOT NULL,
    "offer" TEXT NOT NULL,
    "targetTitles" TEXT NOT NULL DEFAULT '[]',
    "targetOrgTypes" TEXT NOT NULL DEFAULT '[]',
    "exclusionCriteria" TEXT NOT NULL DEFAULT '[]',
    "targetGeography" TEXT NOT NULL DEFAULT 'United States',
    "researchStrategy" TEXT NOT NULL DEFAULT '',
    "qualificationCriteria" TEXT NOT NULL DEFAULT '[]',
    "directoryQueries" TEXT NOT NULL DEFAULT '[]',
    "directoryLocations" TEXT NOT NULL DEFAULT '[]',
    "successCriteria" TEXT NOT NULL DEFAULT '[]',
    "safetyNotes" TEXT NOT NULL DEFAULT '',
    "monetizationPaths" TEXT NOT NULL DEFAULT '[]',
    "stage" TEXT NOT NULL DEFAULT 'SCOUT',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "trustLevel" TEXT NOT NULL DEFAULT 'REVIEW_ALL',
    "prospectTarget" INTEGER NOT NULL DEFAULT 25,
    "contactedTarget" INTEGER NOT NULL DEFAULT 25,
    "minQualificationScore" INTEGER NOT NULL DEFAULT 60,
    "generatedByRunId" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_MarketExperiment" ("approvedAt", "buyerPersona", "contactedTarget", "createdAt", "exclusionCriteria", "generatedByRunId", "hypothesis", "id", "likelyProblem", "minQualificationScore", "monetizationPaths", "name", "offer", "prospectTarget", "qualificationCriteria", "researchStrategy", "safetyNotes", "slug", "stage", "status", "successCriteria", "targetGeography", "targetOrgTypes", "targetTitles", "trustLevel", "updatedAt") SELECT "approvedAt", "buyerPersona", "contactedTarget", "createdAt", "exclusionCriteria", "generatedByRunId", "hypothesis", "id", "likelyProblem", "minQualificationScore", "monetizationPaths", "name", "offer", "prospectTarget", "qualificationCriteria", "researchStrategy", "safetyNotes", "slug", "stage", "status", "successCriteria", "targetGeography", "targetOrgTypes", "targetTitles", "trustLevel", "updatedAt" FROM "MarketExperiment";
DROP TABLE "MarketExperiment";
ALTER TABLE "new_MarketExperiment" RENAME TO "MarketExperiment";
CREATE UNIQUE INDEX "MarketExperiment_slug_key" ON "MarketExperiment"("slug");
CREATE INDEX "MarketExperiment_status_stage_idx" ON "MarketExperiment"("status", "stage");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
