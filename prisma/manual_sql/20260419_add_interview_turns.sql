-- Store per-question interview turns as JSON for durable session analysis.
ALTER TABLE "Interview"
  ADD COLUMN IF NOT EXISTS "interviewTurns" JSONB NOT NULL DEFAULT '[]'::jsonb;
