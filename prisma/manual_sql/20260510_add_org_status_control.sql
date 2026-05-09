ALTER TABLE "Organization"
ADD COLUMN IF NOT EXISTS "statusControl" TEXT NOT NULL DEFAULT 'QUOTA';

UPDATE "Organization"
SET "statusControl" = CASE
  WHEN UPPER(COALESCE("status", 'ACTIVE')) = 'SUSPENDED'
       AND (COALESCE("interviewQuotaTotal", 0) - COALESCE("interviewQuotaUsed", 0)) > 0
    THEN 'MANUAL'
  WHEN UPPER(COALESCE("status", 'ACTIVE')) = 'CLOSED'
    THEN 'MANUAL'
  ELSE 'QUOTA'
END;
