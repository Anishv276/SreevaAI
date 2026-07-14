-- AlterTable: subscription display fields on OrganizationDetails (all nullable — safe on existing data)
ALTER TABLE "OrganizationDetails" ADD COLUMN     "planPriceUsd" DOUBLE PRECISION;
ALTER TABLE "OrganizationDetails" ADD COLUMN     "billingCycle" TEXT;
ALTER TABLE "OrganizationDetails" ADD COLUMN     "nextBillingDate" TIMESTAMP(3);

-- Backfill plan fields to match the values the billing API previously synthesized on the fly
-- (see app/api/super-admin/billing/route.ts). Only fills rows that are still NULL.
UPDATE "OrganizationDetails" SET
    "planPriceUsd"    = CASE WHEN lower("billingPlan") LIKE '%scale%' THEN 699 ELSE 0 END,
    "billingCycle"    = 'Monthly',
    "nextBillingDate" = date_trunc('month', now()) + interval '1 month'
WHERE "planPriceUsd" IS NULL;

-- CreateTable: append-only per-event billing ledger
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "model" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 1,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "ttsCharacters" INTEGER NOT NULL DEFAULT 0,
    "sttAudioSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "jobId" TEXT,
    "applicationId" TEXT,
    "interviewId" TEXT,
    "jobTitle" TEXT,
    "candidateName" TEXT,
    "label" TEXT,
    "eventId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'live',
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsageEvent_eventId_key" ON "UsageEvent"("eventId");

-- CreateIndex
CREATE INDEX "UsageEvent_organizationId_feature_createdAt_idx" ON "UsageEvent"("organizationId", "feature", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "UsageEvent_organizationId_createdAt_idx" ON "UsageEvent"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "UsageEvent_applicationId_idx" ON "UsageEvent"("applicationId");

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "OrganizationDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
