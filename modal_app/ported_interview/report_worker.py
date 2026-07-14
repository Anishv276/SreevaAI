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
    CostCalculator,
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
            )
        except Exception as pdf_err:
            logger.error("[DEBUG_REPORT] Outer exception sending debug PDF: %s", pdf_err, exc_info=True)

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
    brief_usages = usage.get("briefUsages") or []
    llmgen_usages = usage.get("llmgenUsages") or []
    billing = payload.get("billing") or {}

    # Test sessions must NEVER write to Organization.usageMetrics or
    # Interview.billingSnapshot -- those represent real org spend. Everything
    # for a test session (eval, brief, llmgen, TTS, STT) is computed with the
    # same CostCalculator rate tables as production and written only to
    # Interview.testBillingMetrics below.
    if not is_test:
        for u in eval_usages:
            await persist_org_manual_billing_usage(org_id, "interview", u)
        for u in brief_usages:
            await persist_org_manual_billing_usage(org_id, "interviewBrief", u)
        for u in llmgen_usages:
            await persist_org_manual_billing_usage(org_id, "interviewLLMGeneration", u)

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
            billable_tts_characters = int(billing.get("ttsCharacters", 0) or 0)
            plugin_stt_audio_seconds = float(billing.get("sttAudioSeconds", 0.0) or 0.0)
            usage_ns = _namespace_usage(billing.get("sessionUsage"))
            tts_provider = str(billing.get("ttsProvider") or "").strip()
            tts_model = str(billing.get("ttsModel") or "").strip()
            stt_provider = str(billing.get("sttProvider") or "DEEPGRAM").strip()
            stt_model = str(billing.get("sttModel") or "").strip()

            # LLM tokens/cost come from FOUR sources: the live realtime session
            # usage (sessionUsage, e.g. move-on/question turns billed via the
            # LLM plugin) + eval + brief + llmgen usages. Each is costed with
            # its OWN model's real rate via CostCalculator -- no hardcoded
            # single-model guess, so this matches production exactly.
            def _cost_and_tokens(model: str, input_t: int, cached_t: int, output_t: int) -> tuple[float, int, int]:
                if not model or (not input_t and not output_t):
                    return 0.0, input_t or 0, output_t or 0
                try:
                    cost = CostCalculator.openai(model, input_t, cached_t, output_t)
                except ValueError:
                    cost = 0.0
                return cost, input_t or 0, output_t or 0

            # Session usage carries one entry per (type, provider, model) in
            # model_usage -- sum cost per LLM entry individually since a
            # session can in principle span more than one model.
            session_cost, _session_in, _session_out = 0.0, 0, 0
            for _item in (getattr(usage_ns, "model_usage", None) or []):
                if getattr(_item, "type", "") != "llm":
                    continue
                _c, _i, _o = _cost_and_tokens(
                    str(getattr(_item, "model", "") or ""),
                    int(getattr(_item, "input_tokens", 0) or 0),
                    int(getattr(_item, "input_cached_tokens", 0) or 0),
                    int(getattr(_item, "output_tokens", 0) or 0),
                )
                session_cost += _c
                _session_in += _i
                _session_out += _o

            def _sum_usage_cost(usages: list[dict]) -> tuple[float, int, int]:
                total_cost, total_in, total_out = 0.0, 0, 0
                for u in usages:
                    c, i, o = _cost_and_tokens(
                        str(u.get("model", "") or ""),
                        int(u.get("inputTokens", 0) or 0),
                        int(u.get("cachedInputTokens", 0) or 0),
                        int(u.get("outputTokens", 0) or 0),
                    )
                    total_cost += c
                    total_in += i
                    total_out += o
                return total_cost, total_in, total_out

            eval_cost, eval_in, eval_out = _sum_usage_cost(eval_usages)
            brief_cost, brief_in, brief_out = _sum_usage_cost(brief_usages)
            llmgen_cost, llmgen_in, llmgen_out = _sum_usage_cost(llmgen_usages)

            llm_cost = round(session_cost + eval_cost + brief_cost + llmgen_cost, 6)
            llm_in = _session_in + eval_in + brief_in + llmgen_in
            llm_out = _session_out + eval_out + brief_out + llmgen_out

            try:
                tts_cost = round(
                    CostCalculator.tts(tts_provider, tts_model, billable_tts_characters), 6
                ) if billable_tts_characters and tts_provider and tts_model else 0.0
            except ValueError:
                tts_cost = 0.0
            try:
                stt_cost = round(
                    CostCalculator.stt(stt_provider, stt_model, plugin_stt_audio_seconds), 6
                ) if plugin_stt_audio_seconds and stt_model else 0.0
            except ValueError:
                stt_cost = 0.0

            # eval_usages now has one entry per real LLM call (agent_scoring.py's
            # evaluate_answer returns a list: scoring + signal + any fallback
            # classification calls), so len() already equals real API calls made.
            evaluation_runs = len(eval_usages)

            async with pool.acquire() as conn:
                await conn.execute(
                    """UPDATE "Interview" SET "testSessionBillingMetrics" = $1::jsonb, "interviewUpdatedAt" = NOW()
                       WHERE "applicationId" = $2""",
                    json.dumps({
                        "skipReport": False,
                        "costSource": "exact",
                        "llmCost": llm_cost,
                        "ttsCost": tts_cost,
                        "sttCost": stt_cost,
                        "llmInputTokens": llm_in,
                        "llmOutputTokens": llm_out,
                        "ttsChars": billable_tts_characters,
                        "sttSeconds": round(plugin_stt_audio_seconds, 1),
                        "ttsProvider": tts_provider or None,
                        "ttsModel": tts_model or None,
                        "sttProvider": stt_provider.lower(),
                        "sttModel": stt_model or None,
                        "llmProvider": "openai",
                        "evaluationRuns": evaluation_runs,
                        "briefGenerations": len(brief_usages),
                        "llmGenerations": len(llmgen_usages),
                        "evalInputTokens": eval_in,
                        "evalOutputTokens": eval_out,
                        "evalCostUsd": round(eval_cost, 6),
                        "briefInputTokens": brief_in,
                        "briefOutputTokens": brief_out,
                        "briefCostUsd": round(brief_cost, 6),
                        "llmgenInputTokens": llmgen_in,
                        "llmgenOutputTokens": llmgen_out,
                        "llmgenCostUsd": round(llmgen_cost, 6),
                        "sessionLlmCostUsd": round(session_cost, 6),
                    }),
                    app_id,
                )
            logger.info("[TEST_BILLING] Saved metrics for %s | llm=$%.4f tts=$%.4f stt=$%.4f",
                        app_id, llm_cost, tts_cost, stt_cost)
        except Exception as tb_err:
            logger.warning("[TEST_BILLING] Failed to save metrics: %s", tb_err)


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
