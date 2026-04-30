-- Invitation scheduling support for delayed interview delivery
-- Run this against the target Postgres database if you are not using Prisma migrate.

ALTER TABLE "Drive"
  ADD COLUMN IF NOT EXISTS "screeningCriteria" TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "inviteScheduleDays" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Interview"
  ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "inviteSentAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Interview_scheduledAt_idx" ON "Interview"("scheduledAt");
CREATE INDEX IF NOT EXISTS "Interview_inviteSentAt_idx" ON "Interview"("inviteSentAt");
