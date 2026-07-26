-- Replaces the interviewBrief bucket (feature='interview', usage->'brief') with
-- a questionBank bucket. Question-bank generation is billed as its own
-- job-scoped entity ledger row (feature='questionBank', event_id='questionBank:{jobId}'),
-- mirroring jdExtraction's shape -- NOT part of the 'interview' feature blob the
-- old brief bucket lived under. See billing.py's QuestionBankLedger.

CREATE OR REPLACE FUNCTION refresh_org_usage_summary(p_org_id TEXT) RETURNS void AS $$
DECLARE
  v_jd DOUBLE PRECISION;
  v_resume_ext DOUBLE PRECISION;
  v_resume_report DOUBLE PRECISION;
  v_eval DOUBLE PRECISION;
  v_question_bank DOUBLE PRECISION;
  v_gen DOUBLE PRECISION;
  v_report DOUBLE PRECISION;
  v_tts DOUBLE PRECISION;
  v_stt DOUBLE PRECISION;
  v_total DOUBLE PRECISION;
  v_org_name TEXT;
BEGIN
  IF p_org_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN feature = 'jdExtraction'
      THEN (SELECT SUM((m->>'costUsd')::float8) FROM jsonb_array_elements(usage->'jdExtraction'->'llm') m) END), 0),
    COALESCE(SUM(CASE WHEN feature = 'resumeExtraction'
      THEN (SELECT SUM((m->>'costUsd')::float8) FROM jsonb_array_elements(usage->'resumeExtraction'->'llm') m) END), 0),
    COALESCE(SUM(CASE WHEN feature = 'resumeExtraction'
      THEN (SELECT SUM((m->>'costUsd')::float8) FROM jsonb_array_elements(usage->'resumeReport'->'llm') m) END), 0),
    COALESCE(SUM(CASE WHEN feature = 'interview'
      THEN (SELECT SUM((m->>'costUsd')::float8) FROM jsonb_array_elements(usage->'eval'->'llm') m) END), 0),
    COALESCE(SUM(CASE WHEN feature = 'questionBank'
      THEN (SELECT SUM((m->>'costUsd')::float8) FROM jsonb_array_elements(usage->'questionBank'->'llm') m) END), 0),
    COALESCE(SUM(CASE WHEN feature = 'interview'
      THEN (SELECT SUM((m->>'costUsd')::float8) FROM jsonb_array_elements(usage->'llmGeneration'->'llm') m) END), 0),
    COALESCE(SUM(CASE WHEN feature = 'interview'
      THEN (SELECT SUM((m->>'costUsd')::float8) FROM jsonb_array_elements(usage->'report'->'llm') m) END), 0),
    COALESCE(SUM(CASE WHEN feature = 'interview'
      THEN (usage->'tts'->>'costUsd')::float8 END), 0),
    COALESCE(SUM(CASE WHEN feature = 'interview'
      THEN (usage->'stt'->>'costUsd')::float8 END), 0)
  INTO v_jd, v_resume_ext, v_resume_report, v_eval, v_question_bank, v_gen, v_report, v_tts, v_stt
  FROM "UsageEvent"
  WHERE "organizationId" = p_org_id AND "isTest" = false;

  v_total := v_jd + v_resume_ext + v_resume_report + v_eval + v_question_bank + v_gen + v_report + v_tts + v_stt;

  SELECT name INTO v_org_name FROM "OrganizationDetails" WHERE id = p_org_id;
  IF v_org_name IS NULL THEN
    RETURN; -- org deleted/unknown -- nothing to summarize
  END IF;

  INSERT INTO "OrgUsageSummary"
    ("orgId","orgName","jdExtractionCostUsd","resumeExtractionCostUsd","resumeReportCostUsd",
     "interviewLlmCostUsd","interviewEvalCostUsd","questionBankCostUsd","interviewGenerationCostUsd",
     "interviewTtsCostUsd","interviewSttCostUsd","interviewReportCostUsd","totalCostUsd","lastComputedAt")
  VALUES
    (p_org_id, v_org_name, round(v_jd::numeric,8), round(v_resume_ext::numeric,8), round(v_resume_report::numeric,8),
     round(v_eval::numeric,8), round(v_eval::numeric,8), round(v_question_bank::numeric,8), round(v_gen::numeric,8),
     round(v_tts::numeric,8), round(v_stt::numeric,8), round(v_report::numeric,8), round(v_total::numeric,8), NOW())
  ON CONFLICT ("orgId") DO UPDATE SET
    "orgName" = v_org_name,
    "jdExtractionCostUsd" = round(v_jd::numeric,8),
    "resumeExtractionCostUsd" = round(v_resume_ext::numeric,8),
    "resumeReportCostUsd" = round(v_resume_report::numeric,8),
    "interviewLlmCostUsd" = round(v_eval::numeric,8),
    "interviewEvalCostUsd" = round(v_eval::numeric,8),
    "questionBankCostUsd" = round(v_question_bank::numeric,8),
    "interviewGenerationCostUsd" = round(v_gen::numeric,8),
    "interviewTtsCostUsd" = round(v_tts::numeric,8),
    "interviewSttCostUsd" = round(v_stt::numeric,8),
    "interviewReportCostUsd" = round(v_report::numeric,8),
    "totalCostUsd" = round(v_total::numeric,8),
    "lastComputedAt" = NOW();
END;
$$ LANGUAGE plpgsql;
