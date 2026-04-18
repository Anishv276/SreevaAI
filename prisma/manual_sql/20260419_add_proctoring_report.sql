-- Add proctoringReport column to Interview table
-- Agent.py writes interview-side proctoring audit data here
ALTER TABLE "Interview"
  ADD COLUMN IF NOT EXISTS "proctoringReport" JSONB NOT NULL DEFAULT '{}'::jsonb;
