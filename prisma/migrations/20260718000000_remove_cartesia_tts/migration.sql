-- Cartesia TTS removed. Only Sarvam and ElevenLabs remain.
-- The 8 built-in Cartesia voice IDs lived only in code, so they may be referenced
-- on Org/Job rows WITHOUT a matching AIVoice row. List them explicitly.
-- (Jacqueline, Arushi, Katie, Brooke, Ronald, Sarah, Jessica, Barista.)

-- 1. Migrate any org still on Cartesia -- by provider OR by a built-in Cartesia
--    default voice id -- to the Sarvam provider (voice falls back to priya at runtime).
UPDATE "OrganizationDetails"
SET "ttsProvider" = 'SARVAM',
    "ttsModel"    = 'bulbul:v3'
WHERE UPPER("ttsProvider") = 'CARTESIA'
   OR "defaultVoiceId" IN (
     '9626c31c-bec5-4cca-baa8-f8ba9e84c8bc','95d51f79-c397-46f9-b49a-23763d3eaa2d',
     'f786b574-daa5-4673-aa0c-cbe3e8534c02','e07c00bc-4134-4eae-9ea4-1a55fb45746b',
     '5ee9feff-1265-424a-9d7f-8e4d431a12c7','694f9389-aac1-45b6-b726-9d9369183238',
     '638385f3-3333-4f5d-85a2-3f820c64b732','248be1fc-3d27-4452-9457-3705bf68bf8f'
   );

-- 2. Null out any Cartesia voice still referenced on jobs -- both stored AIVoice
--    rows and the built-in UUIDs. Runtime falls back to Sarvam priya.
UPDATE "Job" j
SET "aiInterviewerVoiceId" = NULL
FROM "AIVoice" v
WHERE j."aiInterviewerVoiceId" = v."id"
  AND UPPER(v."voiceProvider") = 'CARTESIA';

UPDATE "Job"
SET "aiInterviewerVoiceId" = NULL
WHERE "aiInterviewerVoiceId" IN (
  '9626c31c-bec5-4cca-baa8-f8ba9e84c8bc','95d51f79-c397-46f9-b49a-23763d3eaa2d',
  'f786b574-daa5-4673-aa0c-cbe3e8534c02','e07c00bc-4134-4eae-9ea4-1a55fb45746b',
  '5ee9feff-1265-424a-9d7f-8e4d431a12c7','694f9389-aac1-45b6-b726-9d9369183238',
  '638385f3-3333-4f5d-85a2-3f820c64b732','248be1fc-3d27-4452-9457-3705bf68bf8f'
);

-- 3. Remove Cartesia voices from allowedVoiceIds arrays on every org.
UPDATE "OrganizationDetails"
SET "allowedVoiceIds" = ARRAY(
  SELECT v FROM unnest("allowedVoiceIds") AS v
  WHERE v NOT IN (
    '9626c31c-bec5-4cca-baa8-f8ba9e84c8bc','95d51f79-c397-46f9-b49a-23763d3eaa2d',
    'f786b574-daa5-4673-aa0c-cbe3e8534c02','e07c00bc-4134-4eae-9ea4-1a55fb45746b',
    '5ee9feff-1265-424a-9d7f-8e4d431a12c7','694f9389-aac1-45b6-b726-9d9369183238',
    '638385f3-3333-4f5d-85a2-3f820c64b732','248be1fc-3d27-4452-9457-3705bf68bf8f'
  )
);

-- 4. Drop stored Cartesia rows from the registry (custom + any built-ins persisted).
DELETE FROM "AIVoice" WHERE UPPER("voiceProvider") = 'CARTESIA';

-- 5. Drop the org-level default voice entirely. Voice is now chosen per job from
--    the org's allowed list; the runtime falls back to Sarvam priya when unset.
ALTER TABLE "OrganizationDetails" DROP COLUMN "defaultVoiceId";
ALTER TABLE "Job" ALTER COLUMN "aiInterviewerVoiceId" DROP DEFAULT;
