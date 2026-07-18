-- OrgUsageSummary previously only refreshed when application code explicitly
-- called refreshOrgUsageSummary()/_refresh_org_usage_summary() after a ledger
-- write. Any UsageEvent row touched a different way (manual DB delete/edit,
-- an admin script, a future backfill) left the summary silently stale with no
-- way to notice short of re-running the recompute by hand.
--
-- This trigger fires on every UsageEvent INSERT/UPDATE/DELETE, at the DB
-- level, so no caller can ever forget to keep the summary in sync. Mirrors the
-- same per-sub-feature cost sums as lib/usage-metrics.ts#computeOrgUsageBreakdown
-- and billing.py#_refresh_org_usage_summary -- keep the three in step if the
-- usage JSON shape ever changes.

CREATE OR REPLACE FUNCTION refresh_org_usage_summary(p_org_id TEXT) RETURNS void AS $$
DECLARE
  v_jd DOUBLE PRECISION;
  v_resume_ext DOUBLE PRECISION;
  v_resume_report DOUBLE PRECISION;
  v_eval DOUBLE PRECISION;
  v_brief DOUBLE PRECISION;
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
    COALESCE(SUM(CASE WHEN feature = 'interview'
      THEN (SELECT SUM((m->>'costUsd')::float8) FROM jsonb_array_elements(usage->'brief'->'llm') m) END), 0),
    COALESCE(SUM(CASE WHEN feature = 'interview'
      THEN (SELECT SUM((m->>'costUsd')::float8) FROM jsonb_array_elements(usage->'llmGeneration'->'llm') m) END), 0),
    COALESCE(SUM(CASE WHEN feature = 'interview'
      THEN (SELECT SUM((m->>'costUsd')::float8) FROM jsonb_array_elements(usage->'report'->'llm') m) END), 0),
    COALESCE(SUM(CASE WHEN feature = 'interview'
      THEN (usage->'tts'->>'costUsd')::float8 END), 0),
    COALESCE(SUM(CASE WHEN feature = 'interview'
      THEN (usage->'stt'->>'costUsd')::float8 END), 0)
  INTO v_jd, v_resume_ext, v_resume_report, v_eval, v_brief, v_gen, v_report, v_tts, v_stt
  FROM "UsageEvent"
  WHERE "organizationId" = p_org_id AND "isTest" = false;

  v_total := v_jd + v_resume_ext + v_resume_report + v_eval + v_brief + v_gen + v_report + v_tts + v_stt;

  SELECT name INTO v_org_name FROM "OrganizationDetails" WHERE id = p_org_id;
  IF v_org_name IS NULL THEN
    RETURN; -- org deleted/unknown -- nothing to summarize
  END IF;

  INSERT INTO "OrgUsageSummary"
    ("orgId","orgName","jdExtractionCostUsd","resumeExtractionCostUsd","resumeReportCostUsd",
     "interviewLlmCostUsd","interviewEvalCostUsd","interviewBriefCostUsd","interviewGenerationCostUsd",
     "interviewTtsCostUsd","interviewSttCostUsd","interviewReportCostUsd","totalCostUsd","lastComputedAt")
  VALUES
    (p_org_id, v_org_name, round(v_jd::numeric,8), round(v_resume_ext::numeric,8), round(v_resume_report::numeric,8),
     round(v_eval::numeric,8), round(v_eval::numeric,8), round(v_brief::numeric,8), round(v_gen::numeric,8),
     round(v_tts::numeric,8), round(v_stt::numeric,8), round(v_report::numeric,8), round(v_total::numeric,8), NOW())
  ON CONFLICT ("orgId") DO UPDATE SET
    "orgName" = v_org_name,
    "jdExtractionCostUsd" = round(v_jd::numeric,8),
    "resumeExtractionCostUsd" = round(v_resume_ext::numeric,8),
    "resumeReportCostUsd" = round(v_resume_report::numeric,8),
    "interviewLlmCostUsd" = round(v_eval::numeric,8),
    "interviewEvalCostUsd" = round(v_eval::numeric,8),
    "interviewBriefCostUsd" = round(v_brief::numeric,8),
    "interviewGenerationCostUsd" = round(v_gen::numeric,8),
    "interviewTtsCostUsd" = round(v_tts::numeric,8),
    "interviewSttCostUsd" = round(v_stt::numeric,8),
    "interviewReportCostUsd" = round(v_report::numeric,8),
    "totalCostUsd" = round(v_total::numeric,8),
    "lastComputedAt" = NOW();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION usage_event_summary_sync() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_org_usage_summary(OLD."organizationId");
    RETURN OLD;
  ELSE
    PERFORM refresh_org_usage_summary(NEW."organizationId");
    IF TG_OP = 'UPDATE' AND OLD."organizationId" IS DISTINCT FROM NEW."organizationId" THEN
      PERFORM refresh_org_usage_summary(OLD."organizationId");
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS usage_event_summary_sync ON "UsageEvent";
CREATE TRIGGER usage_event_summary_sync
AFTER INSERT OR UPDATE OR DELETE ON "UsageEvent"
FOR EACH ROW EXECUTE FUNCTION usage_event_summary_sync();
