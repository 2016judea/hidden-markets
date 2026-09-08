-- CreateTable
CREATE TABLE "DirectorySweep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "experimentId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "found" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "DirectorySweep_experimentId_idx" ON "DirectorySweep"("experimentId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectorySweep_experimentId_term_location_key" ON "DirectorySweep"("experimentId", "term", "location");
