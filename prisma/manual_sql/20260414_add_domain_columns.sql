-- Add domain-related columns to Organization table
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "customDomain"      TEXT,
  ADD COLUMN IF NOT EXISTS "resendDomainId"    TEXT,
  ADD COLUMN IF NOT EXISTS "isDomainVerified"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "customSenderEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "customSenderName"  TEXT;
