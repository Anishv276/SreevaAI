-- Migration: Convert Drive.id and Application.driveId from UUID to TEXT
-- Existing UUID values are preserved verbatim as text strings (no data loss)
-- OrgInvite stays as UUID — not changed

BEGIN;

-- 1. Drop FK: Application.driveId → Drive.id
ALTER TABLE "Application"
  DROP CONSTRAINT IF EXISTS "Application_driveId_fkey";

-- 2. Cast Application.driveId UUID → TEXT
ALTER TABLE "Application"
  ALTER COLUMN "driveId" TYPE TEXT USING "driveId"::TEXT;

-- 3. Cast Drive.id UUID → TEXT
ALTER TABLE "Drive"
  ALTER COLUMN id TYPE TEXT USING id::TEXT;

-- 4. Drop DB-level default on Drive.id (app will supply readable ID)
ALTER TABLE "Drive"
  ALTER COLUMN id DROP DEFAULT;

-- 5. Re-add FK constraint
ALTER TABLE "Application"
  ADD CONSTRAINT "Application_driveId_fkey"
  FOREIGN KEY ("driveId") REFERENCES "Drive"(id) ON DELETE CASCADE;

COMMIT;
