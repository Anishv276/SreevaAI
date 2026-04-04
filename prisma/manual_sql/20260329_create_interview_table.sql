-- Create dedicated Interview table
CREATE TABLE IF NOT EXISTS "Interview" (
  "id" TEXT PRIMARY KEY,
  "applicationId" TEXT NOT NULL UNIQUE,
  "accessToken" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "interviewRecordingUrl" TEXT,
  "interviewTranscript" TEXT,
  "interviewRecordedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Interview_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- Backfill existing interview-related data from Assessment
INSERT INTO "Interview" (
  "id",
  "applicationId",
  "accessToken",
  "expiresAt",
  "status",
  "startedAt",
  "completedAt",
  "interviewRecordingUrl",
  "interviewTranscript",
  "interviewRecordedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  a."id",
  a."applicationId",
  a."accessToken",
  a."expiresAt",
  COALESCE(a."status", 'PENDING'),
  a."startedAt",
  a."completedAt",
  a."interviewRecordingUrl",
  a."interviewTranscript",
  a."interviewRecordedAt",
  COALESCE(a."createdAt", CURRENT_TIMESTAMP),
  COALESCE(a."updatedAt", CURRENT_TIMESTAMP)
FROM "Assessment" a
ON CONFLICT ("applicationId") DO UPDATE
SET
  "accessToken" = EXCLUDED."accessToken",
  "expiresAt" = EXCLUDED."expiresAt",
  "status" = EXCLUDED."status",
  "startedAt" = EXCLUDED."startedAt",
  "completedAt" = EXCLUDED."completedAt",
  "interviewRecordingUrl" = EXCLUDED."interviewRecordingUrl",
  "interviewTranscript" = EXCLUDED."interviewTranscript",
  "interviewRecordedAt" = EXCLUDED."interviewRecordedAt",
  "updatedAt" = EXCLUDED."updatedAt";
