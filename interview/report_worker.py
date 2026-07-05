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

Usage (called by worker.ts via stdin, mirrors generate_brief.py's contract):
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
from typing import Any, Optional

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

from interview.agent_persistence import (
    DatabasePool,
    generate_interview_report,
    generate_interview_summary,
)
from interview.debug_report import generate_and_send_debug_report
from billing.billing import (
    flush_billing as flush_pending_manual_billing,
    record_manual_usage as persist_org_manual_billing_usage,
    save_interview_billing as persist_interview_billing_snapshot,
)


def _namespace_usage(session_usage: Optional[dict]) -> Any:
    """Reconstruct a LiveKit-usage-like object from the JSON payload.

    UsageSummarizer.from_session() (billing/billing.py) reads this via
    getattr(session_usage, "model_usage") then per-item getattr(item, "type"/
    "provider"/"model"/...) -- a plain dict would break those getattr calls,
    so wrap it (and each nested model_usage item) in SimpleNamespace instead.
    """
    if not session_usage:
        return None
    model_usage = [SimpleNamespace(**item) for item in (session_usage.get("modelUsage") or [])]
    rest = {k: v for k, v in session_usage.items() if k != "modelUsage"}
    return SimpleNamespace(model_usage=model_usage, **rest)


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
    transcript_lines = payload.get("transcriptLines") or []
    answer_scores = payload.get("answerScores") or []
    topic_records = payload.get("topicRecords") or []

    scores_context = None
    logger.info("[REPORT] Generating with answer_scores=%d turns", len(answer_scores))
    try:
        async with asyncio.timeout(300):
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
    except asyncio.TimeoutError:
        logger.warning(f"[REPORT] Timed out for {app_id} after 5 min")
    except Exception as e:
        logger.error(f"[REPORT] Failed for {app_id}: {e}")

    try:
        async with asyncio.timeout(60):
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
    except asyncio.TimeoutError:
        logger.warning(f"[SUMMARY] Timed out for {app_id} after 60s")
    except Exception as e:
        logger.error(f"[SUMMARY] Failed for {app_id}: {e}")

    usage = payload.get("usage") or {}
    eval_usages = usage.get("evalUsages") or []
    brief_usages = usage.get("briefUsages") or []
    llmgen_usages = usage.get("llmgenUsages") or []
    for u in eval_usages:
        await persist_org_manual_billing_usage(org_id, "interview", u)
    for u in brief_usages:
        await persist_org_manual_billing_usage(org_id, "interviewBrief", u)
    for u in llmgen_usages:
        await persist_org_manual_billing_usage(org_id, "interviewLLMGeneration", u)

    billing = payload.get("billing") or {}
    try:
        await persist_interview_billing_snapshot(
            app_id,
            _namespace_usage(billing.get("sessionUsage")),
            org_id=org_id,
            candidate_name=candidate_name,
            job_title=job_title,
            duration_seconds=billing.get("durationSeconds"),
            tts_provider=billing.get("ttsProvider"),
            tts_model=billing.get("ttsModel"),
            stt_provider=billing.get("sttProvider", "DEEPGRAM"),
            stt_model=billing.get("sttModel"),
            plugin_tts_characters=billing.get("ttsCharacters", 0),
            plugin_tts_audio_seconds=billing.get("ttsAudioSeconds", 0.0),
            plugin_stt_audio_seconds=billing.get("sttAudioSeconds", 0.0),
        )
    except Exception as e:
        logger.error(f"[USAGE] Failed to persist interview billing snapshot for {app_id}: {e}")
    try:
        await flush_pending_manual_billing(org_id)
    except Exception as e:
        logger.error(f"[USAGE] flush_pending_manual_billing failed for {app_id}: {e}")

    if is_test:
        try:
            pool = await DatabasePool.get()
            billable_tts_characters = billing.get("ttsCharacters", 0) or 0
            plugin_stt_audio_seconds = billing.get("sttAudioSeconds", 0.0) or 0.0
            usage_ns = _namespace_usage(billing.get("sessionUsage"))
            llm_in = getattr(usage_ns, "input_tokens", 0) or 0
            llm_out = getattr(usage_ns, "output_tokens", 0) or 0
            # rough cost estimate (GPT-4o pricing, update if model changes)
            llm_cost = round((llm_in * 2.5 + llm_out * 10) / 1_000_000, 6)
            tts_cost = round(billable_tts_characters * 0.000015, 6)
            stt_cost = round(plugin_stt_audio_seconds * 0.0043 / 60, 6)
            async with pool.acquire() as conn:
                # ponytail: reuse testBillingMetrics presence as the "already processed"
                # guard for a stalled-job requeue -- avoids a second Slack PDF post.
                already_done = await conn.fetchval(
                    """SELECT "testBillingMetrics" IS NOT NULL FROM "Interview"
                       WHERE "applicationId" = $1""",
                    app_id,
                )
                await conn.execute(
                    """UPDATE "Interview" SET "testBillingMetrics" = $1::jsonb, "updatedAt" = NOW()
                       WHERE "applicationId" = $2""",
                    json.dumps({
                        "skipReport": False,
                        "llmCost": llm_cost,
                        "ttsCost": tts_cost,
                        "sttCost": stt_cost,
                        "llmInputTokens": int(llm_in),
                        "llmOutputTokens": int(llm_out),
                        "ttsChars": int(billable_tts_characters),
                        "sttSeconds": round(float(plugin_stt_audio_seconds), 1),
                        "ttsProvider": billing.get("ttsProvider"),
                        "sttProvider": "deepgram",
                        "llmProvider": "openai",
                        "evaluationRuns": len(eval_usages),
                        "briefGenerations": len(brief_usages),
                        "llmGenerations": len(llmgen_usages),
                        "evalInputTokens": sum(u.get("inputTokens", 0) for u in eval_usages),
                        "evalOutputTokens": sum(u.get("outputTokens", 0) for u in eval_usages),
                        "briefInputTokens": sum(u.get("inputTokens", 0) for u in brief_usages),
                        "briefOutputTokens": sum(u.get("outputTokens", 0) for u in brief_usages),
                        "llmgenInputTokens": sum(u.get("inputTokens", 0) for u in llmgen_usages),
                        "llmgenOutputTokens": sum(u.get("outputTokens", 0) for u in llmgen_usages),
                    }),
                    app_id,
                )
            logger.info("[TEST_BILLING] Saved metrics for %s | llm=$%.4f tts=$%.4f stt=$%.4f",
                        app_id, llm_cost, tts_cost, stt_cost)
        except Exception as tb_err:
            already_done = False
            logger.warning("[TEST_BILLING] Failed to save metrics: %s", tb_err)

        if already_done:
            logger.info(
                "[DEBUG_REPORT] Skipping — testBillingMetrics already set for %s, "
                "likely a stalled-job retry", app_id,
            )
        else:
            logger.info("[DEBUG_REPORT] Test session complete — generating and sending debug PDF to Slack...")
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
                )
            except Exception as pdf_err:
                logger.error("[DEBUG_REPORT] Outer exception sending debug PDF: %s", pdf_err, exc_info=True)


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
