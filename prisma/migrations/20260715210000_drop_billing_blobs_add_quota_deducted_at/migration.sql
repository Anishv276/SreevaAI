-- Drop the three legacy JSON blob billing columns now that UsageEvent is the
-- SOLE source of truth for all cost totals (real + test). Add a dedicated
-- Interview.quotaDeductedAt column so interview-quota deduction's atomic
-- idempotency claim no longer piggybacks on the (now removed) cost snapshot blob.
--
-- Historical note: org-level totals that lived ONLY in
-- OrganizationDetails.platformUsageMetrics (and predate the UsageEvent ledger)
-- are NOT recovered by the entity-ledger backfill
-- (scripts/migrate-usage-event-to-entity-model.ts only reads usage_event_legacy).
-- Dropping this column therefore discards any blob-only historical cost. This is
-- accepted per the migration spec; per-item ledger detail is preserved.

-- 1. New atomic idempotency column for interview-quota deduction.
ALTER TABLE "Interview" ADD COLUMN "quotaDeductedAt" TIMESTAMP(3);

-- 2. Carry the existing idempotency claim over: any interview already billed
--    (billingSnapshotAtCompletion->'billedAt' set) is marked deducted so the
--    switch to the new column can't re-deduct quota for already-billed interviews.
UPDATE "Interview"
SET "quotaDeductedAt" = to_timestamp(("billingSnapshotAtCompletion"->>'billedAt')::bigint)
WHERE "billingSnapshotAtCompletion" IS NOT NULL
  AND "billingSnapshotAtCompletion"->'billedAt' IS NOT NULL;

-- 3. Drop the three legacy JSON blob columns.
ALTER TABLE "OrganizationDetails" DROP COLUMN "platformUsageMetrics";
ALTER TABLE "Interview" DROP COLUMN "billingSnapshotAtCompletion";
ALTER TABLE "Interview" DROP COLUMN "testSessionBillingMetrics";
