-- Add Google voice configuration columns for organizations and drives.
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "googleModel" TEXT DEFAULT 'gemini-3.1-flash-tts-preview',
  ADD COLUMN IF NOT EXISTS "googleVoiceName" TEXT DEFAULT 'Puck';

ALTER TABLE "Drive"
  ADD COLUMN IF NOT EXISTS "googleModel" TEXT DEFAULT 'gemini-3.1-flash-tts-preview',
  ADD COLUMN IF NOT EXISTS "googleVoiceName" TEXT DEFAULT 'Puck';
