-- Migration: Add dedicated creditsTotal and creditsUsed columns to Organization.
-- Float (DOUBLE PRECISION) to support decimal credits (0.2 per minute).
-- Completely separate from usageMetrics (internal API cost tracking).

-- Step 1: Add the two new columns
ALTER TABLE "Organization"
    ADD COLUMN IF NOT EXISTS "creditsTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "creditsUsed"  DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Step 2: Remove the "credits" key wrongly added to usageMetrics previously.
-- Skips NULL rows and orgs that never got the bad key.
UPDATE "Organization"
SET "usageMetrics" = ("usageMetrics"::jsonb) - 'credits'
WHERE "usageMetrics" IS NOT NULL
  AND ("usageMetrics"::jsonb) ? 'credits';
