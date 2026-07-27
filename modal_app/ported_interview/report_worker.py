"""
interview/report_worker.py
============================
Background worker entry point for the post-interview report tail: report
pipeline (LLM eval/skills/behavioral/answer-integrity), summary/verdict,
billing usage persistence, and (for test sessions) the debug PDF + Slack
upload.

Why this exists: agent_runtime.py used to run this tail inline inside the
LiveKit agent job, taking up to ~300s. On LiveKit Cloud the agent job process
is recycled shortly after the room closes, risking a mid-flight kill of the
report. This script runs the exact same calls (report_pipeline/debug_report/
billing, unchanged) as a short-lived process spawned by the durable Node
worker instead, so the agent job can close in seconds.

Usage (called by worker.ts via stdin):
    python interview/report_worker.py
    (JSON payload piped via stdin -- see PayloadReportJob shape below)

Exit codes:
    0 -- success (report and/or summary may still have individually logged
         failures -- those are non-fatal here, matching agent_runtime.py's
         original try/except-per-step behavior)
    1 -- fatal error (bad payload, uncaught exception) -- job will be marked
         failed by BullMQ
"""
from __future__ import annotations

import asyncio
import json
import logging
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Optional

# Ensure the repository root is importable when called from worker.ts
_repo_root = Path(__file__).resolve().parents[1]
if str(_repo_root) not in sys.path:
    sys.path.insert(0, str(_repo_root))

from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stderr)],
)
logger = logging.getLogger("report-worker")

from interview.debug_report import generate_and_send_debug_report
from billing.billing import (
    flush_billing as flush_pending_manual_billing,
    record_manual_usage as persist_org_manual_billing_usage,
)


def _namespace_topic_pool(topic_pool: Optional[list]) -> list:
    """build_debug_pdf() reads topic items via getattr(t, "title"/"topic_type"/...) --
    same reasoning as _namespace_usage above."""
    return [SimpleNamespace(**item) for item in (topic_pool or [])]


async def _run(payload: dict) -> None:
    app_id = payload["appId"]
    org_id = payload.get("orgId")
    job_title = payload.get("jobTitle", "")
    candidate_name = payload.get("candidateName", "")
    is_test = bool(payload.get("isTest"))
    skip_report = bool(payload.get("skipReport"))
    transcript_lines = payload.get("transcriptLines") or []
    answer_scores = payload.get("answerScores") or []
    topic_records = payload.get("topicRecords") or []

    # Routes report/summary generation to the sales-specific eval rubric for
    # conversational interviews; falls back to tech for anything unrecognized.
    interview_type = payload.get("interviewType") if payload.get("interviewType") == "conversational" else "tech"
    if interview_type == "conversational":
        from interview.conversational.report import generate_interview_report, generate_interview_summary
    else:
        from interview.tech.report import generate_interview_report, generate_interview_summary
    logger.info("[REPORT] interview_type=%s app_id=%s", interview_type, app_id)

    # Slack debug PDF goes FIRST for test sessions so it lands immediately, before
    # the ~300s report/summary/billing tail below even starts. Independent of
    # everything else -- its own try/except contains any failure locally.
    if is_test:
        logger.info("[DEBUG_REPORT] Test session — sending debug PDF to Slack before report generation...")
        debug_report = payload.get("debugReport") or {}
        try:
            await generate_and_send_debug_report(
                app_id=app_id,
                candidate_name=candidate_name,
                job_title=job_title,
                answer_scores=list(answer_scores),
                topic_pool=_namespace_topic_pool(debug_report.get("topicPool")),
                covered_topics=debug_report.get("coveredTopics"),
                topic_records=list(topic_records),
                interview_type=interview_type,
            )
        except Exception as pdf_err:
            logger.error("[DEBUG_REPORT] Outer exception sending debug PDF: %s", pdf_err, exc_info=True)

    # skipReport ("Enable Report Eval" off on the /test page) skips ONLY the
    # report/summary LLM generation below -- the debug PDF above and the
    # eval/llmGeneration billing flush below both still run unconditionally.
    # Eval/llmGeneration usage was already captured live during the interview
    # (agent_runtime.py's _eval_llm_usages_accumulated/_llmgen_llm_usages) and
    # this worker is the only place that ever flushes it to the DB, so gating
    # the whole worker run on skipReport (the old behavior) silently discarded
    # billing data that had nothing to do with the report itself.
    if skip_report:
        logger.info("[REPORT] Skipped report/summary generation (skipReport=True) for %s", app_id)
    else:
        scores_context = None
        logger.info("[REPORT] Generating with answer_scores=%d turns", len(answer_scores))
        try:
            scores_context = await generate_interview_report(
                app_id,
                transcript_lines,
                answer_scores,
                job_title,
                llmInterviewReport=payload.get("llmInterviewReport", ""),
                proctoring_data=payload.get("proctoringData") or {},
                org_id=org_id,
                jd_json=payload.get("jdJson"),
                resume_json=payload.get("resumeJson"),
                topic_records=list(topic_records),
                candidate_name=candidate_name,
                answer_integrity_enabled=bool(payload.get("answerIntegrityEnabled")),
                is_test=is_test,
            )
            logger.info("[REPORT] Completed. scores_context keys=%s",
                        list(scores_context.keys()) if scores_context else None)
        except Exception as e:
            logger.error(f"[REPORT] Failed for {app_id}: {e}")

        try:
            await generate_interview_summary(
                app_id,
                transcript_lines,
                job_title,
                llmInterviewReport=payload.get("llmInterviewReport", ""),
                org_id=org_id,
                scores_context=scores_context,
                candidate_name=candidate_name,
                is_test=is_test,
            )
        except Exception as e:
            logger.error(f"[SUMMARY] Failed for {app_id}: {e}")

    usage = payload.get("usage") or {}
    eval_usages = usage.get("evalUsages") or []
    llmgen_usages = usage.get("llmgenUsages") or []

    # Real and test sessions take the SAME path: eval/llmgen LLM usage is
    # upserted into the interview:{app} UsageEvent row (via PendingBuffer ->
    # flush), just flagged isTest so test spend is distinguishable but never
    # written to a separate table/blob. The session's TTS/STT are recorded from
    # agent_runtime.py's save_org_usage_metrics call (same is_test flag).
    _ctx_base = {"applicationId": app_id, "jobTitle": job_title, "candidateName": candidate_name, "isTest": is_test}
    for u in eval_usages:
        u["context"] = {**_ctx_base, "ledgerFeature": "interviewEval", "eventId": f"interview:{app_id}:eval"}
        await persist_org_manual_billing_usage(org_id, "interview", u)
    for u in llmgen_usages:
        u["context"] = {**_ctx_base, "eventId": f"interview:{app_id}:llmgen"}
        await persist_org_manual_billing_usage(org_id, "interviewLLMGeneration", u)
    try:
        await flush_pending_manual_billing(org_id)
    except Exception as e:
        logger.error(f"[USAGE] flush_pending_manual_billing failed for {app_id}: {e}")


def main() -> None:
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except Exception as e:
        print(f"ERROR: invalid JSON payload on stdin: {e}", file=sys.stderr)
        sys.exit(1)

    app_id = payload.get("appId", "").strip()
    if not app_id:
        print("ERROR: appId is empty", file=sys.stderr)
        sys.exit(1)

    logger.info("[START] appId=%s", app_id)
    try:
        asyncio.run(_run(payload))
    except Exception as e:
        logger.error("[FATAL] %s", e, exc_info=True)
        sys.exit(1)

    # Minimal JSON on stdout so the Node worker can log confirmation (Python's
    # own logging goes to stderr, streamed live into the worker terminal).
    print(json.dumps({"success": True, "appId": app_id}))
    logger.info("[DONE] appId=%s", app_id)


if __name__ == "__main__":
    main()
