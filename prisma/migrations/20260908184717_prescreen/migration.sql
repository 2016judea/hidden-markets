-- AlterTable
ALTER TABLE "Prospect" ADD COLUMN "prescreenReason" TEXT;
ALTER TABLE "Prospect" ADD COLUMN "prescreenVerdict" TEXT;

-- AlterTable
ALTER TABLE "ProspectCandidate" ADD COLUMN "prescreenReason" TEXT;
ALTER TABLE "ProspectCandidate" ADD COLUMN "prescreenVerdict" TEXT;
