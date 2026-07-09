-- Interview status machine rework:
-- 1. Add interviewStartedAt (real "greeting spoken" timestamp, separate from
--    the launching-phase `startedAt`).
-- 2. Drop linkStatus -- gating now uses Interview.status alone
--    (PENDING/SCHEDULED/IN_PROGRESS/COMPLETED/FAILED).

ALTER TABLE "Interview" ADD COLUMN "interviewStartedAt" TIMESTAMP(3);

ALTER TABLE "Interview" DROP COLUMN "linkStatus";
