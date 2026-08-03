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


from billing.billing import (
    flush_billing as flush_pending_manual_billing,
    record_manual_usage as persist_org_manual_billing_usage,
    save_org_usage_metrics,
    deduct_interview_quota,
)


def _namespace_topic_pool(topic_pool: Optional[list]) -> list:
    """build_debug_pdf() reads topic items via getattr(t, "title"/"topic_type"/...) --
    same reasoning as _namespace_usage above."""
    return [SimpleNamespace(**item) for item in (topic_pool or [])]


def _namespace_usage(session_usage: Optional[dict]) -> Optional[SimpleNamespace]:
    """Rebuild a getattr-friendly object from _usage_to_dict()'s JSON-safe dict
    (agent_runtime.py) so UsageSummarizer.from_session() -- which reads
    session_usage.model_usage[].type/provider/model/input_tokens/output_tokens
    via getattr -- can consume it."""
    if not session_usage:
        return None
    model_usage = [
        SimpleNamespace(
            type=item.get("type", ""),
            provider=item.get("provider", ""),
            model=item.get("model", ""),
            input_tokens=item.get("inputTokens", 0),
            output_tokens=item.get("outputTokens", 0),
        )
        for item in (session_usage.get("modelUsage") or [])
    ]
    return SimpleNamespace(
        model_usage=model_usage,
        input_tokens=session_usage.get("input_tokens", 0),
        output_tokens=session_usage.get("output_tokens", 0),
    )


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

    # Slack debug PDF generation has been moved to this Modal worker so the LiveKit
    # agent can shut down immediately without blocking on Slack uploads.
    if is_test:
        try:
            logger.info("[DEBUG_REPORT] Generating debug PDF...")
            debug_report_data = payload.get("debugReport") or {}
            
            if interview_type == "conversational":
                from interview.conversational.debug import generate_and_send_debug_report
                await generate_and_send_debug_report(
                    app_id=app_id,
                    candidate_name=candidate_name,
                    job_title=job_title,
                    answer_scores=list(answer_scores),
                    topic_pool=debug_report_data.get("topicPool") or [],
                    covered_topics=debug_report_data.get("coveredTopics") or [],
                    topic_records=list(topic_records),
                )
            else:
                from interview.tech.debug import generate_and_send_debug_report
                await generate_and_send_debug_report(
                    app_id=app_id,
                    candidate_name=candidate_name,
                    job_title=job_title,
                    answer_scores=list(answer_scores),
                    topic_pool=debug_report_data.get("topicPool") or [],
                    covered_topics=debug_report_data.get("coveredTopics") or [],
                    topic_records=list(topic_records),
                    interview_type=interview_type,
                )
        except Exception as e:
            logger.error(f"[DEBUG_REPORT] Failed: {e}")
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
    
    # Run the final session billing flush and quota deduction
    billing_data = payload.get("billing") or {}
    session_usage = billing_data.get("sessionUsage")
    if org_id and session_usage and not app_id.startswith("demo_"):
        try:
            logger.info("[BILLING] Running final session billing for %s", app_id)
            await save_org_usage_metrics(
                org_id,
                _namespace_usage(session_usage),
                tts_provider=billing_data.get("ttsProvider"),
                tts_model=billing_data.get("ttsModel"),
                stt_provider=billing_data.get("sttProvider"),
                stt_model=billing_data.get("sttModel"),
                plugin_tts_characters=billing_data.get("ttsCharacters") or 0,
                plugin_tts_audio_seconds=billing_data.get("ttsAudioSeconds") or 0.0,
                plugin_stt_audio_seconds=billing_data.get("sttAudioSeconds") or 0.0,
                app_id=app_id,
                candidate_name=candidate_name,
                job_title=job_title,
                is_test=is_test,
            )
            await deduct_interview_quota(app_id, billing_data.get("durationSeconds"))
        except Exception as e:
            logger.error(f"[BILLING] Final session billing failed: {e}")


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
