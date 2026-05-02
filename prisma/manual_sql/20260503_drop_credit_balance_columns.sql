-- Drop the old organization credit balance columns.
-- Credits are now derived from completed interview duration, so we no longer
-- store allocated/used credit balance on Organization.

ALTER TABLE "Organization"
  DROP COLUMN IF EXISTS "creditsTotal",
  DROP COLUMN IF EXISTS "creditsUsed";
