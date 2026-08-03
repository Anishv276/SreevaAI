-- AlterTable
ALTER TABLE "DemoTemplate" ADD COLUMN "jdExtractedDetails" JSONB;
ALTER TABLE "DemoTemplate" ADD COLUMN "questionBankSnapshot" JSONB;
ALTER TABLE "DemoTemplate" ADD COLUMN "voiceId" TEXT;
ALTER TABLE "DemoTemplate" ADD COLUMN "interviewType" TEXT NOT NULL DEFAULT 'tech';
ALTER TABLE "DemoTemplate" ADD COLUMN "level" INTEGER NOT NULL DEFAULT 2;
