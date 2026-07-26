-- Repurposes the org-level "Interview Brief" model picker (dead since brief
-- generation was deleted) into the model used for question-bank generation
-- (Call A/B/C in lib/question-bank/*, run by worker.ts's question-generation
-- worker) -- previously that worker fell back to llmJdExtraction with no
-- dedicated config of its own.
ALTER TABLE "OrganizationDetails"
  RENAME COLUMN "llmInterviewBrief" TO "llmQuestionBank";

ALTER TABLE "OrganizationDetails"
  ALTER COLUMN "llmQuestionBank" SET DEFAULT 'gpt-5.4-mini';
