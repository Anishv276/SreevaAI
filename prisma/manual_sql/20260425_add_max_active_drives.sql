-- Add org-level drive creation cap.
-- 0 means unlimited.
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "maxActiveDrives" INTEGER NOT NULL DEFAULT 0;
