-- Reshape UsageEvent from an append-only per-call ledger into an entity-level
-- ledger: ONE upserted row per (organizationId, feature, entity) with a `usage`
-- JSONB breakdown and a running `costUsd` total.
--
-- SAFE MIGRATION: the old table is RENAMED to "usage_event_legacy" rather than
-- dropped, so no production data is lost. Run
--   npx tsx --env-file=.env scripts/migrate-usage-event-to-entity-model.ts
-- AFTER applying this migration to fold the legacy per-call rows into the new
-- entity rows, then drop "usage_event_legacy" manually once verified.

-- 1. Snapshot the old table (keeps every existing per-call row).
ALTER TABLE "UsageEvent" RENAME TO "usage_event_legacy";

-- Drop the FK + indexes carried over by the rename so the new table can reclaim
-- their names. (Index names are Postgres-generated from the original table name.)
ALTER TABLE "usage_event_legacy" DROP CONSTRAINT IF EXISTS "UsageEvent_organizationId_fkey";
ALTER TABLE "usage_event_legacy" DROP CONSTRAINT IF EXISTS "UsageEvent_pkey";
DROP INDEX IF EXISTS "UsageEvent_eventId_key";
DROP INDEX IF EXISTS "UsageEvent_organizationId_feature_createdAt_idx";
DROP INDEX IF EXISTS "UsageEvent_organizationId_createdAt_idx";
DROP INDEX IF EXISTS "UsageEvent_applicationId_idx";

-- 2. Create the new entity-level table.
CREATE TABLE "UsageEvent" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "feature"        TEXT NOT NULL,
    "jobId"          TEXT,
    "applicationId"  TEXT,
    "interviewId"    TEXT,
    "jobTitle"       TEXT,
    "candidateName"  TEXT,
    "isTest"         BOOLEAN NOT NULL DEFAULT false,
    "usage"          JSONB NOT NULL DEFAULT '{}',
    "costUsd"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "eventId"        TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UsageEvent_eventId_key" ON "UsageEvent"("eventId");
CREATE INDEX "UsageEvent_organizationId_feature_createdAt_idx" ON "UsageEvent"("organizationId", "feature", "createdAt" DESC);
CREATE INDEX "UsageEvent_organizationId_createdAt_idx" ON "UsageEvent"("organizationId", "createdAt" DESC);
CREATE INDEX "UsageEvent_applicationId_idx" ON "UsageEvent"("applicationId");

ALTER TABLE "UsageEvent"
    ADD CONSTRAINT "UsageEvent_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "OrganizationDetails"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
