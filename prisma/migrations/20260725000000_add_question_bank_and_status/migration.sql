-- AlterTable
ALTER TABLE "Job"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "failureReason" TEXT,
  ADD COLUMN "extractedSkills" JSONB,
  ADD COLUMN "questionBank" JSONB,
  ADD COLUMN "questionBankVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "mustHaveSkills" JSONB;

-- AlterTable
ALTER TABLE "Interview"
  ADD COLUMN "jdQuestionBankVersionUsed" INTEGER,
  ADD COLUMN "jdQuestionBankSnapshot" JSONB;
