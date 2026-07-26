-- Demo templates now generate a question bank (DemoTemplate.questionBankSnapshot)
-- via the same Call A/B/C pipeline as real jobs, instead of an LLM-generated
-- interview brief. briefJson is no longer written or read anywhere.
ALTER TABLE "DemoTemplate"
  DROP COLUMN "briefJson";
