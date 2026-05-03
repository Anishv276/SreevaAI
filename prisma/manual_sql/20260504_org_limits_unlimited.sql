-- Convert organization limits from integer sentinels to literal Unlimited strings.
-- Existing legacy 0 values are migrated to 'Unlimited'.

ALTER TABLE "Organization"
  ALTER COLUMN "maxActiveDrives" DROP DEFAULT,
  ALTER COLUMN "maxActiveDrives" TYPE TEXT
    USING CASE
      WHEN "maxActiveDrives" IS NULL OR "maxActiveDrives" = 0 THEN 'Unlimited'
      ELSE "maxActiveDrives"::TEXT
    END,
  ALTER COLUMN "maxActiveDrives" SET DEFAULT 'Unlimited',
  ALTER COLUMN "maxTeamMembers" DROP DEFAULT,
  ALTER COLUMN "maxTeamMembers" TYPE TEXT
    USING CASE
      WHEN "maxTeamMembers" IS NULL OR "maxTeamMembers" = 0 THEN 'Unlimited'
      ELSE "maxTeamMembers"::TEXT
    END,
  ALTER COLUMN "maxTeamMembers" SET DEFAULT 'Unlimited';
