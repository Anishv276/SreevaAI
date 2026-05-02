BEGIN;

ALTER TABLE "Organization"
ADD COLUMN IF NOT EXISTS "creditsUsed" DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE "Organization" o
SET "creditsUsed" = COALESCE(usage.used, 0)
FROM (
  SELECT
    d."orgId",
    ROUND(
      COALESCE(
        SUM(
          GREATEST(
            COALESCE(i."interviewDuration", i."recordingDurationSec", 0),
            0
          )
        )::numeric / 60,
        2
      )
    )::double precision AS used
  FROM "Interview" i
  JOIN "Application" a ON a.id = i."applicationId"
  JOIN "Drive" d ON d.id = a."driveId"
  WHERE i."completedAt" IS NOT NULL
  GROUP BY d."orgId"
) usage
WHERE o.id = usage."orgId";

COMMIT;
