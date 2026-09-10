-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_JobRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "experimentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "runAfter" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "transientFailures" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" DATETIME,
    "lockedBy" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "error" TEXT,
    "result" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobRun_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "MarketExperiment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_JobRun" ("attempts", "completedAt", "createdAt", "error", "experimentId", "id", "idempotencyKey", "kind", "lockedAt", "lockedBy", "maxAttempts", "payload", "result", "runAfter", "startedAt", "status") SELECT "attempts", "completedAt", "createdAt", "error", "experimentId", "id", "idempotencyKey", "kind", "lockedAt", "lockedBy", "maxAttempts", "payload", "result", "runAfter", "startedAt", "status" FROM "JobRun";
DROP TABLE "JobRun";
ALTER TABLE "new_JobRun" RENAME TO "JobRun";
CREATE UNIQUE INDEX "JobRun_idempotencyKey_key" ON "JobRun"("idempotencyKey");
CREATE INDEX "JobRun_status_runAfter_idx" ON "JobRun"("status", "runAfter");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
