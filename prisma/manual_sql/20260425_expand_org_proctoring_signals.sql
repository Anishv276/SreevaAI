-- Ensure the proctoringSignals default includes all managed signal toggles.
ALTER TABLE "Organization"
  ALTER COLUMN "proctoringSignals"
  SET DEFAULT '{"tab_switch":true,"camera_disabled":true,"microphone_disabled":true,"connection_lost":true,"duplicate_ip":true,"face_absence":true,"multiple_faces":true,"identity_mismatch":true,"ownership_ambiguity":true,"example_evasion":true,"latency_mismatch":true,"resume_claim_mismatch":true,"ownership_clarified":true,"example_given":true,"strong_under_pressure":true,"follow_up_collapse":true,"contradiction":true,"contradiction_resolved":true}'::jsonb;

-- Backfill missing keys on existing rows without overriding existing values.
UPDATE "Organization"
SET "proctoringSignals" = jsonb_set(COALESCE("proctoringSignals", '{}'::jsonb), '{tab_switch}', COALESCE("proctoringSignals"->'tab_switch', 'true'::jsonb), true)
WHERE "proctoringSignals" IS NULL OR NOT ("proctoringSignals" ? 'tab_switch');

UPDATE "Organization"
SET "proctoringSignals" = jsonb_set(COALESCE("proctoringSignals", '{}'::jsonb), '{duplicate_ip}', COALESCE("proctoringSignals"->'duplicate_ip', 'true'::jsonb), true)
WHERE "proctoringSignals" IS NULL OR NOT ("proctoringSignals" ? 'duplicate_ip');

UPDATE "Organization"
SET "proctoringSignals" = jsonb_set(COALESCE("proctoringSignals", '{}'::jsonb), '{camera_disabled}', COALESCE("proctoringSignals"->'camera_disabled', 'true'::jsonb), true)
WHERE "proctoringSignals" IS NULL OR NOT ("proctoringSignals" ? 'camera_disabled');

UPDATE "Organization"
SET "proctoringSignals" = jsonb_set(COALESCE("proctoringSignals", '{}'::jsonb), '{microphone_disabled}', COALESCE("proctoringSignals"->'microphone_disabled', 'true'::jsonb), true)
WHERE "proctoringSignals" IS NULL OR NOT ("proctoringSignals" ? 'microphone_disabled');

UPDATE "Organization"
SET "proctoringSignals" = jsonb_set(COALESCE("proctoringSignals", '{}'::jsonb), '{connection_lost}', COALESCE("proctoringSignals"->'connection_lost', 'true'::jsonb), true)
WHERE "proctoringSignals" IS NULL OR NOT ("proctoringSignals" ? 'connection_lost');

UPDATE "Organization"
SET "proctoringSignals" = jsonb_set(COALESCE("proctoringSignals", '{}'::jsonb), '{face_absence}', COALESCE("proctoringSignals"->'face_absence', 'true'::jsonb), true)
WHERE "proctoringSignals" IS NULL OR NOT ("proctoringSignals" ? 'face_absence');

UPDATE "Organization"
SET "proctoringSignals" = jsonb_set(COALESCE("proctoringSignals", '{}'::jsonb), '{multiple_faces}', COALESCE("proctoringSignals"->'multiple_faces', 'true'::jsonb), true)
WHERE "proctoringSignals" IS NULL OR NOT ("proctoringSignals" ? 'multiple_faces');

UPDATE "Organization"
SET "proctoringSignals" = jsonb_set(COALESCE("proctoringSignals", '{}'::jsonb), '{identity_mismatch}', COALESCE("proctoringSignals"->'identity_mismatch', 'true'::jsonb), true)
WHERE "proctoringSignals" IS NULL OR NOT ("proctoringSignals" ? 'identity_mismatch');

UPDATE "Organization"
SET "proctoringSignals" = jsonb_set(COALESCE("proctoringSignals", '{}'::jsonb), '{ownership_ambiguity}', COALESCE("proctoringSignals"->'ownership_ambiguity', 'true'::jsonb), true)
WHERE "proctoringSignals" IS NULL OR NOT ("proctoringSignals" ? 'ownership_ambiguity');

UPDATE "Organization"
SET "proctoringSignals" = jsonb_set(COALESCE("proctoringSignals", '{}'::jsonb), '{example_evasion}', COALESCE("proctoringSignals"->'example_evasion', 'true'::jsonb), true)
WHERE "proctoringSignals" IS NULL OR NOT ("proctoringSignals" ? 'example_evasion');

UPDATE "Organization"
SET "proctoringSignals" = jsonb_set(COALESCE("proctoringSignals", '{}'::jsonb), '{latency_mismatch}', COALESCE("proctoringSignals"->'latency_mismatch', 'true'::jsonb), true)
WHERE "proctoringSignals" IS NULL OR NOT ("proctoringSignals" ? 'latency_mismatch');

UPDATE "Organization"
SET "proctoringSignals" = jsonb_set(COALESCE("proctoringSignals", '{}'::jsonb), '{resume_claim_mismatch}', COALESCE("proctoringSignals"->'resume_claim_mismatch', 'true'::jsonb), true)
WHERE "proctoringSignals" IS NULL OR NOT ("proctoringSignals" ? 'resume_claim_mismatch');

UPDATE "Organization"
SET "proctoringSignals" = jsonb_set(COALESCE("proctoringSignals", '{}'::jsonb), '{ownership_clarified}', COALESCE("proctoringSignals"->'ownership_clarified', 'true'::jsonb), true)
WHERE "proctoringSignals" IS NULL OR NOT ("proctoringSignals" ? 'ownership_clarified');

UPDATE "Organization"
SET "proctoringSignals" = jsonb_set(COALESCE("proctoringSignals", '{}'::jsonb), '{example_given}', COALESCE("proctoringSignals"->'example_given', 'true'::jsonb), true)
WHERE "proctoringSignals" IS NULL OR NOT ("proctoringSignals" ? 'example_given');

UPDATE "Organization"
SET "proctoringSignals" = jsonb_set(COALESCE("proctoringSignals", '{}'::jsonb), '{strong_under_pressure}', COALESCE("proctoringSignals"->'strong_under_pressure', 'true'::jsonb), true)
WHERE "proctoringSignals" IS NULL OR NOT ("proctoringSignals" ? 'strong_under_pressure');

UPDATE "Organization"
SET "proctoringSignals" = jsonb_set(COALESCE("proctoringSignals", '{}'::jsonb), '{follow_up_collapse}', COALESCE("proctoringSignals"->'follow_up_collapse', 'true'::jsonb), true)
WHERE "proctoringSignals" IS NULL OR NOT ("proctoringSignals" ? 'follow_up_collapse');

UPDATE "Organization"
SET "proctoringSignals" = jsonb_set(COALESCE("proctoringSignals", '{}'::jsonb), '{contradiction}', COALESCE("proctoringSignals"->'contradiction', 'true'::jsonb), true)
WHERE "proctoringSignals" IS NULL OR NOT ("proctoringSignals" ? 'contradiction');

UPDATE "Organization"
SET "proctoringSignals" = jsonb_set(COALESCE("proctoringSignals", '{}'::jsonb), '{contradiction_resolved}', COALESCE("proctoringSignals"->'contradiction_resolved', 'true'::jsonb), true)
WHERE "proctoringSignals" IS NULL OR NOT ("proctoringSignals" ? 'contradiction_resolved');

UPDATE "Organization"
