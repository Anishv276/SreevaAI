-- Add org-level team member cap.
-- 0 means unlimited.
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "maxTeamMembers" INTEGER NOT NULL DEFAULT 0;
