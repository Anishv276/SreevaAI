-- Manual migration: rename Drive -> Job everywhere in the DB.
-- NOT auto-applied. This DB has no prior `prisma migrate` history (it was
-- set up via db push/introspection), so `prisma migrate dev` wanted to
-- reset the entire public schema before applying anything -- too
-- destructive to run unattended. Review this file, back up the DB, then
-- run it by hand (e.g. `psql $DATABASE_URL -f this_file.sql`) or via
-- `prisma db execute --file this_file.sql`.
--
-- Uses ALTER ... RENAME, which preserves data (no drop/recreate).

BEGIN;

-- Table + PK/relations
ALTER TABLE "Drive" RENAME TO "Job";

-- Organization.maxActiveDrives -> maxActiveJobs
ALTER TABLE "Organization" RENAME COLUMN "maxActiveDrives" TO "maxActiveJobs";

-- Application.driveId -> jobId (column, FK constraint, indexes)
ALTER TABLE "Application" RENAME COLUMN "driveId" TO "jobId";

-- Rename constraints/indexes that reference the old names, if they exist
-- under Prisma's default naming convention. Inspect actual names first
-- with \d "Application" and \d "Job" in psql -- these are best-effort
-- guesses at Prisma's default naming and may need adjusting.
ALTER TABLE "Application" RENAME CONSTRAINT "Application_driveId_fkey" TO "Application_jobId_fkey";
ALTER TABLE "Job" RENAME CONSTRAINT "Drive_creatorId_fkey" TO "Job_creatorId_fkey";
ALTER TABLE "Job" RENAME CONSTRAINT "Drive_orgId_fkey" TO "Job_orgId_fkey";
ALTER TABLE "Job" RENAME CONSTRAINT "Drive_pkey" TO "Job_pkey";

ALTER INDEX "Drive_orgId_idx" RENAME TO "Job_orgId_idx";
ALTER INDEX "Drive_orgId_createdAt_idx" RENAME TO "Job_orgId_createdAt_idx";
ALTER INDEX "Application_driveId_resumeStatus_updatedAt_idx" RENAME TO "Application_jobId_resumeStatus_updatedAt_idx";
ALTER INDEX "Application_driveId_aiScore_updatedAt_idx" RENAME TO "Application_jobId_aiScore_updatedAt_idx";

COMMIT;
