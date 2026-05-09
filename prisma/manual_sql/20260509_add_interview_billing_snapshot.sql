ALTER TABLE "Interview"
  ADD COLUMN IF NOT EXISTS "billingSnapshot" JSONB NOT NULL DEFAULT '{}'::jsonb;
