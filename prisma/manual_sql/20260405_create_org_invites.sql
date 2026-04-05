-- Team invitation support (non-destructive)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "orgRole" TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'User_orgRole_check'
    ) THEN
        ALTER TABLE "User"
        ADD CONSTRAINT "User_orgRole_check"
        CHECK ("orgRole" IS NULL OR "orgRole" IN ('ADMIN', 'HR', 'TEAM'));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "OrgInvite" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "orgId" TEXT NOT NULL REFERENCES "Organization"(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    "orgRole" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'PENDING',
    "invitedByUserId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
    "acceptedUserId" TEXT REFERENCES "User"(id) ON DELETE SET NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'OrgInvite_orgRole_check'
    ) THEN
        ALTER TABLE "OrgInvite"
        ADD CONSTRAINT "OrgInvite_orgRole_check"
        CHECK ("orgRole" IN ('ADMIN', 'HR', 'TEAM'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'OrgInvite_status_check'
    ) THEN
        ALTER TABLE "OrgInvite"
        ADD CONSTRAINT "OrgInvite_status_check"
        CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "OrgInvite_orgId_status_idx"
ON "OrgInvite" ("orgId", status);

CREATE INDEX IF NOT EXISTS "OrgInvite_email_idx"
ON "OrgInvite" (LOWER(email));

CREATE UNIQUE INDEX IF NOT EXISTS "OrgInvite_one_pending_per_org_email"
ON "OrgInvite" ("orgId", LOWER(email))
WHERE status = 'PENDING';
