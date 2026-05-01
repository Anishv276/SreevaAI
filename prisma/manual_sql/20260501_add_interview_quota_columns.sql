ALTER TABLE "Organization"
ADD COLUMN IF NOT EXISTS "interviewQuotaTotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "interviewQuotaUsed" INTEGER NOT NULL DEFAULT 0;

UPDATE "Organization" o
SET
  "interviewQuotaTotal" = GREATEST(0, ROUND(COALESCE(o."creditsTotal", 0))::INT),
  "interviewQuotaUsed" = COALESCE(used.interviews_used, 0)
FROM (
  SELECT
    d."orgId" AS org_id,
    COUNT(i.id)::INT AS interviews_used
  FROM "Interview" i
  JOIN "Application" a ON a.id = i."applicationId"
  JOIN "Drive" d ON d.id = a."driveId"
  WHERE i.status = 'COMPLETED'
  GROUP BY d."orgId"
) used
WHERE used.org_id = o.id;

