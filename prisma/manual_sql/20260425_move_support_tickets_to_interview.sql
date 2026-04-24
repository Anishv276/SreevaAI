-- Move support tickets to interview ownership and remove organization ownership.
-- Run this after the SupportTicket model no longer uses orgId.

ALTER TABLE "SupportTicket"
  DROP CONSTRAINT IF EXISTS "SupportTicket_orgId_fkey";

ALTER TABLE "SupportTicket"
  DROP COLUMN IF EXISTS "orgId";

CREATE INDEX IF NOT EXISTS "SupportTicket_interviewId_createdAt_idx"
  ON "SupportTicket" ("interviewId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SupportTicket_interviewId_fkey'
  ) THEN
    ALTER TABLE "SupportTicket"
      ADD CONSTRAINT "SupportTicket_interviewId_fkey"
      FOREIGN KEY ("interviewId") REFERENCES "Interview"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
