-- Add JSON metrics column to Organization table for billing/usage snapshots
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "usageMetrics" JSONB NOT NULL DEFAULT '{}'::jsonb;
