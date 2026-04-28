"""Compatibility wrapper for the split agent runtime."""

import asyncio
import os
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from agent_profile_context import (
    build_interview_turns,
    build_term_alias_hints,
    detect_role_category,
    detect_role_subtype,
    first_name_from_full_name,
    infer_candidate_band,
    parse_resume_context,
)
from agent_providers import (
    build_cartesia_tts,
    build_google_analysis_client,
    build_google_realtime_llm,
    build_google_tts,
    build_llm,
    build_sarvam_llm,
    build_sarvam_stt,
    build_sarvam_tts,
    build_stt,
    build_tts,
    build_vad,
)
from agent_runtime import entrypoint, prewarm
from agent_runtime_helpers import (
    _build_recent_context_block,
    _sanitize_claim_value,
    _single_question_transform,
    append_transcript_line,
    build_language_codes,
    refresh_composite_risk,
    remove_system_messages,
    require_db_value,
    report_proctoring_realtime,
    select_org_runtime_models,
    signal_client_interview_terminated,
    signal_client_proctoring_violation,
)
from agent_runtime_support import (
    AGENT_NAME,
    compose_mode_risk_score,
    compose_risk_score,
    logger,
)
from agent_scoring import (
    check_contradiction,
    evaluate_answer_and_decide,
    extract_claims,
    notify_sync_engine,
    score_answer_quality,
)
from agent_utils import (
    _as_list,
    _cartesia_plugin_model,
    _coerce_jsonish,
    _compact_optional,
    _compact_text,
    _deep_get,
    _extract_text_items,
    _first_text,
    _format_compact_section,
    _join_items,
    _normalize_cartesia_model,
    _safe_float,
    parse_dispatch_metadata,
    safe_parse,
    truncate_to_tokens,
)
from livekit.agents import WorkerOptions, cli


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            agent_name=AGENT_NAME,
            num_idle_processes=max(1, int(os.getenv("LIVEKIT_IDLE_PROCESSES", "8"))),
        )
    )
