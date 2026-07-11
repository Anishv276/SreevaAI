-- Interview status rework: PENDING -> SCHEDULED -> LAUNCHING -> PROGRESS -> COMPLETED,
-- with NO_SHOW / FAILED as terminal off-ramps. Drops inviteLinkStatus entirely --
-- its "second device blocked" behavior is now expressed purely via interviewStatus.

-- 1. Backfill existing rows to the new value set before dropping the old column.

-- Rows that had booked a slot but never started are now SCHEDULED (previously
-- stayed PENDING forever after booking -- this was the original bug being fixed).
UPDATE "Interview"
SET "interviewStatus" = 'SCHEDULED'
WHERE "interviewStatus" = 'PENDING'
  AND "interviewScheduledAt" IS NOT NULL
  AND "interviewStartedAt" IS NULL;

-- Rows that were IN_PROGRESS but never actually got a live agent join
-- (interviewStartedAt set, no completion) become PROGRESS -- best-effort mapping,
-- since IN_PROGRESS previously covered both the "entering" and "live" moments.
UPDATE "Interview"
SET "interviewStatus" = 'PROGRESS'
WHERE "interviewStatus" = 'IN_PROGRESS';

-- Rows whose invite link had already expired due to slot no-show (booked, slot
-- passed, never started) are now NO_SHOW.
UPDATE "Interview"
SET "interviewStatus" = 'NO_SHOW'
WHERE "interviewStatus" = 'SCHEDULED'
  AND "inviteLinkStatus" = 'EXPIRED'
  AND "interviewStartedAt" IS NULL;

-- Drop legacy ABANDONED value if present -- folds into FAILED (safest default,
-- since we can't retroactively know whether the candidate ever launched).
UPDATE "Interview"
SET "interviewStatus" = 'FAILED'
WHERE "interviewStatus" = 'ABANDONED';

-- 2. Drop the inviteLinkStatus column -- superseded by interviewStatus.
ALTER TABLE "Interview" DROP COLUMN IF EXISTS "inviteLinkStatus";
