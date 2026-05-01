-- Drop the legacy Drive interview duration column.
-- Run this after confirming no code path depends on Drive.interviewTime.

ALTER TABLE "Drive" DROP COLUMN IF EXISTS "interviewTime";
