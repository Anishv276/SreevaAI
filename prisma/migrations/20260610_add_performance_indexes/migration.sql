CREATE INDEX IF NOT EXISTS "Organization_status_idx" ON "Organization" ("status");
CREATE INDEX IF NOT EXISTS "Organization_createdAt_idx" ON "Organization" ("createdAt" DESC);

CREATE INDEX IF NOT EXISTS "SupportTicket_applicationId_idx" ON "SupportTicket" ("applicationId");

CREATE INDEX IF NOT EXISTS "Drive_orgId_createdAt_idx" ON "Drive" ("orgId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Application_driveId_aiScore_updatedAt_idx" ON "Application" ("driveId", "aiScore" DESC, "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "Interview_status_completedAt_idx" ON "Interview" ("status", "completedAt" DESC);
CREATE INDEX IF NOT EXISTS "Interview_status_updatedAt_idx" ON "Interview" ("status", "updatedAt" DESC);
