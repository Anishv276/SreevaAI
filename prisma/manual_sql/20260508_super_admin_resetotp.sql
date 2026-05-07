-- Switch super-admin recovery from VerificationToken to SuperAdmin.resetOtp
-- Run this after deploying the Prisma schema change.

BEGIN;

ALTER TABLE "SuperAdmin"
  ADD COLUMN IF NOT EXISTS "resetOtp" TEXT,
  ADD COLUMN IF NOT EXISTS "resetOtpExpires" TIMESTAMP(3);

DROP TABLE IF EXISTS "VerificationToken" CASCADE;

COMMIT;
