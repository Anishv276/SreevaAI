-- Consolidate recording metadata into Interview.recording.
-- This backfills existing split recording columns into one JSONB column, then
-- removes the split columns so Interview.recording is the only recording store.

ALTER TABLE "Interview"
ADD COLUMN IF NOT EXISTS "recording" JSONB DEFAULT '{}'::jsonb;

UPDATE "Interview"
SET "recording" = jsonb_strip_nulls(jsonb_build_object(
  'name', CONCAT(COALESCE(a."fullName", 'Candidate'), ' - ', COALESCE(d."title", d."role", 'Interview')),
  'status', "Interview"."recordingStatus",
  'mimeType', "Interview"."recordingMimeType",
  'url', "Interview"."interviewRecordingUrl",
  'recordedAt', "Interview"."interviewRecordedAt",
  'startedAt', "Interview"."recordingStartedAt",
  'completedAt', "Interview"."recordingCompletedAt",
  'durationSec', "Interview"."recordingDurationSec",
  'manifest', COALESCE("Interview"."recordingManifest", '{}'::jsonb),
  'retention', jsonb_build_object(
    'days', "Interview"."recordingRetentionDays",
    'dueAt', "Interview"."recordingRetentionDueAt",
    'cleanupStatus', "Interview"."recordingCleanupStatus",
    'cleanupAttempts', "Interview"."recordingCleanupAttempts",
    'cleanupLastError', "Interview"."recordingCleanupLastError",
    'deletedAt', "Interview"."recordingDeletedAt"
  )
))
FROM "Application" a
JOIN "Drive" d ON d.id = a."driveId"
WHERE "Interview"."applicationId" = a.id
  AND (
    "Interview"."interviewRecordingUrl" IS NOT NULL
    OR "Interview"."recordingManifest" IS NOT NULL
    OR "Interview"."recordingStatus" IS NOT NULL
    OR "Interview"."recordingRetentionDueAt" IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS "Interview_recording_retention_due_idx"
ON "Interview" ((recording->'retention'->>'dueAt'))
WHERE recording IS NOT NULL
  AND recording->>'url' IS NOT NULL
  AND COALESCE(recording->'retention'->>'deletedAt', '') = '';

DROP INDEX IF EXISTS "Interview_recordingRetentionDueAt_idx";

ALTER TABLE "Interview"
  DROP COLUMN IF EXISTS "interviewRecordingUrl",
  DROP COLUMN IF EXISTS "interviewRecordedAt",
  DROP COLUMN IF EXISTS "recordingStatus",
  DROP COLUMN IF EXISTS "recordingMimeType",
  DROP COLUMN IF EXISTS "recordingStartedAt",
  DROP COLUMN IF EXISTS "recordingCompletedAt",
  DROP COLUMN IF EXISTS "recordingDurationSec",
  DROP COLUMN IF EXISTS "recordingRetentionDays",
  DROP COLUMN IF EXISTS "recordingRetentionDueAt",
  DROP COLUMN IF EXISTS "recordingCleanupStatus",
  DROP COLUMN IF EXISTS "recordingCleanupAttempts",
  DROP COLUMN IF EXISTS "recordingCleanupLastError",
  DROP COLUMN IF EXISTS "recordingDeletedAt",
  DROP COLUMN IF EXISTS "recordingManifest";
