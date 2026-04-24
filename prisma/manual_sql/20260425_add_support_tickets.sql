-- Store interview support requests for super-admin review.
CREATE TABLE IF NOT EXISTS "SupportTicket" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NULL,
  "interviewId" TEXT NULL,
  "applicationId" TEXT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "issueAbout" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "resolvedAt" TIMESTAMP(3) NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "SupportTicket_status_createdAt_idx"
  ON "SupportTicket" ("status", "createdAt");

CREATE INDEX IF NOT EXISTS "SupportTicket_orgId_createdAt_idx"
  ON "SupportTicket" ("orgId", "createdAt");
