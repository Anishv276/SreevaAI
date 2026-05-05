import base64
import os
import sys
import asyncio
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
import random
import json
import time
import asyncpg
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Optional, Any
import uuid
import re
import traceback
from openai import AsyncOpenAI
from agent_utils import (
    _as_list,
    _cartesia_plugin_model,
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
)
from agent_profile_context import (
    CandidateBandContext,
    ResumeContext,
    _build_context_vars_block,
    _ensure_resume_context,
    build_candidate_context_ready_message,
    build_candidate_summary,
    build_coverage_checklist,
    build_jd_summary,
    build_live_prompt_context,
    build_role_layer,
    build_screening_summary,
    detect_role_category,
    detect_role_subtype,
    extract_brief_section,
    extract_smart_opening_question,
    parse_question_bank,
    extract_critical_skills,
    _extract_jd_must_haves,
    build_question_bank_injection,
    first_name_from_full_name,
    infer_candidate_band,
    parse_resume_context,
    refresh_candidate_band_context,
    build_term_alias_hints,
)
from interview_phases import (
    build_phase_1_greeting_text,
    build_phase_1_warmup_directive,
    build_phase_2_opening_context,
    build_phase_3_bridge_directive,
    build_phase_4_skills_directive,
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
from agent_persistence import (
    _create_db_pool,
    get_db_pool,
)
from agent_runtime_helpers import (
    _build_recent_context_block,
    _sanitize_claim_value,
    _single_question_transform,
    remove_system_messages,
)
from agent_runtime_support import (
    AGENT_NAME,
    APP_BASE_URL,
    CARTESIA_MODEL,
    CARTESIA_VOICE_ID,
    DATABASE_URL,
    DEFAULT_GOOGLE_TTS_MODEL,
    DEFAULT_GOOGLE_VOICE_NAME,
    GOOGLE_ANALYSIS_MODEL,
    GOOGLE_REALTIME_MODEL,
    LLM_MODEL,
    FIXED_INTERVIEW_DURATION_MINUTES,
    PROCTORING_WEIGHTS,
    STT_MODEL,
    _DB_POOL,
    _DB_POOL_INIT_TASK,
    _LOG_CONTEXT_FIELDS,
    _TOOL_ALIAS_CATALOG,
    compose_mode_risk_score,
    compose_risk_score,
    logger,
)
from livekit.agents import (
    Agent,
    AgentSession,
    APIConnectOptions,
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    DEFAULT_API_CONNECT_OPTIONS,
    JobContext,
    JobProcess,
    inference,
    TurnHandlingOptions,
    WorkerOptions,
    cli,
    llm,
    text_transforms,
    tts as lk_tts,
)
from livekit.agents.metrics import AgentSessionUsage
from livekit.agents.voice.events import ConversationItemAddedEvent
from livekit.agents.voice import room_io
from livekit.agents.voice.turn import EndpointingOptions, InterruptionOptions
from livekit.plugins import cartesia, openai, deepgram, silero, sarvam
try:
    from livekit.plugins import ai_coustics
except ImportError:  # pragma: no cover - optional plugin
    ai_coustics = None
from turn_evaluator import run_turn_evaluation
from trust_engine import apply_turn_decision, apply_proctoring_event, apply_contradiction_resolved, finalize_trust_state
from contradiction_state import init_contradiction_state, advance_contradiction_state, summarize_contradiction_state
from session_state import init_trust_state
from recruiter_summary import build_recruiter_summary
from prompt_layers import (
    build_voice_layer_prompt,
    build_evaluation_layer_prompt,
    build_system_prompt,
)
from turn_decision import classify_short_utterance
from probe_strategy import build_short_utterance_directive
def prewarm(proc: JobProcess):
    logger.info("Prewarming worker process...")
    # Load VAD model (ONNX) - heaviest startup cost, must be synchronous
    proc.userdata["vad"] = build_vad()
    logger.info("VAD model prewarmed.")
    # Turn detector requires session context in some runtime modes.
    # Keep startup noise low and initialize it lazily in-session if needed.
    proc.userdata["turn_detector"] = None
    # Pre-instantiate default STT/TTS plugins so their internal HTTP sessions
    # and model configs are warm before the first job arrives.
    try:
        proc.userdata["default_stt"] = build_stt()
        logger.info("Default STT prewarmed.")
    except Exception as e:
        logger.warning(f"Failed to prewarm default STT: {e}")
    try:
        proc.userdata["default_tts"] = build_tts()
        logger.info("Default TTS prewarmed.")
    except Exception as e:
        logger.warning(f"Failed to prewarm default TTS: {e}")
    try:
        loop = asyncio.get_running_loop()
        db_pool_task = loop.create_task(_create_db_pool())
        proc.userdata["db_pool_init_task"] = db_pool_task
        def _store_db_pool(task: asyncio.Task[asyncpg.Pool]) -> None:
            try:
                proc.userdata["db_pool"] = task.result()
            except Exception as task_err:
                logger.warning(f"Database pool warmup failed: {task_err}")
        db_pool_task.add_done_callback(_store_db_pool)
        global _DB_POOL_INIT_TASK
        _DB_POOL_INIT_TASK = db_pool_task
        logger.info("Database pool warmup scheduled.")
    except RuntimeError:
        logger.info("No running event loop in prewarm; DB pool will initialize lazily.")
from agent_persistence import (
    _extract_openai_completion_usage,
    flush_pending_manual_billing,
    generate_interview_report,
    generate_interview_state_summary,
    generate_interview_summary,
    get_db_pool,
    get_interview_context,
    mark_interview_started,
    persist_answer_scores,
    persist_org_manual_billing_usage,
    persist_org_usage_metrics,
    persist_transcript,
    update_interview_status,
)
from agent_scoring import (
    check_contradiction,
    evaluate_answer_and_decide,
    extract_claims,
    notify_sync_engine,
    score_answer_quality,
)
_EVALUATION_SIGNAL_KEYS = {
    "ownership_ambiguity",
    "example_evasion",
    "latency_mismatch",
    "resume_claim_mismatch",
    "ownership_clarified",
    "example_given",
    "strong_under_pressure",
    "follow_up_collapse",
    "contradiction",
    "contradiction_resolved",
}
def _toggle_bool(value: Any, default: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in ("true", "1", "yes", "on"):
            return True
        if normalized in ("false", "0", "no", "off"):
            return False
    if isinstance(value, (int, float)):
        return bool(value)
    return default
def _extract_evaluation_signal_toggles(raw_signals: Any) -> dict[str, bool]:
    parsed: dict[str, Any] | None = None
    if isinstance(raw_signals, dict):
        parsed = raw_signals
    elif isinstance(raw_signals, str):
        try:
            maybe_obj = json.loads(raw_signals)
            if isinstance(maybe_obj, dict):
                parsed = maybe_obj
        except Exception:
            parsed = None
    if parsed is None:
        # No signals configured at all (null DB value)  -  default everything OFF
        return {key: False for key in _EVALUATION_SIGNAL_KEYS}
    # Signals object exists  -  missing keys default OFF (explicit disable is respected)
    return {
        key: _toggle_bool(parsed.get(key), False)
        for key in _EVALUATION_SIGNAL_KEYS
    }
async def generate_candidate_brief(
    candidate_name: str,
    job_title: str,
    candidate_band: str,
    jd_block: str,
    resume_block: str,
    ai_report_block: str,
    questions_list: str,
    time_limit_mins: int,
    critical_skills: list[str],
    client,
    org_id: Optional[str] = None,
    llm_model: str = LLM_MODEL,
) -> str:
    """
    Pre-interview: generate a personalized interview plan from the candidate's actual
    resume, the JD, and the AI screening report. This becomes Ishita's private briefing -
    telling her exactly what to ask, in what order, tailored to this specific person.
    Returns a formatted brief string to inject into the system prompt.
    Falls back to empty string on failure (interview still works, just less personalized).
    """
    if resume_block == "No resume data provided." and ai_report_block == "No prior screening data.":
        return ""  # No data to work with - skip
    band = (candidate_band or "").strip().lower()
    _band_phase1 = {
        "fresher": (
            "PHASE 1  -  BACKGROUND (exactly 5 questions, FRESHER band):\n"
            "Q1 [OPENING]: Most specific question about their strongest academic project or internship  -  what they personally built, not what the team did.\n"
            "Q2 [PROJECT-DEPTH]: Dig into one project from the resume  -  what was their exact contribution, what broke, what would they change.\n"
            "Q3 [JD-RESPONSIBILITY]: A key JD responsibility  -  ask if they have done anything similar, even in a college or internship context.\n"
            "Q4 [GAP]: A JD requirement not evident in resume  -  ask how they would approach it, probe their reasoning not just knowledge.\n"
            "Q5 [LEARNING]: A question about how fast they ramp on something new  -  a real example, not a generic answer."
        ),
        "mid": (
            "PHASE 1  -  BACKGROUND (exactly 5 questions, MID-LEVEL band):\n"
            "Q1 [OPENING]: Most specific question about a feature or system they owned end-to-end  -  not what the team built.\n"
            "Q2 [OWNERSHIP]: A decision they made alone  -  what options they considered, what they chose and why.\n"
            "Q3 [JD-RESPONSIBILITY]: A core JD responsibility  -  ask for a concrete example from their past work.\n"
            "Q4 [GAP]: A JD requirement missing or thin in the resume  -  ask for the closest thing they have done.\n"
            "Q5 [IMPACT]: What changed because of their work  -  numbers, user impact, or business outcome."
        ),
        "experienced": (
            "PHASE 1  -  BACKGROUND (exactly 5 questions, EXPERIENCED band):\n"
            "Q1 [OPENING]: Most specific question about a system they owned at scale  -  size, complexity, real constraints.\n"
            "Q2 [PRODUCTION]: An incident or failure they owned  -  what happened, how they diagnosed it, what they changed.\n"
            "Q3 [JD-RESPONSIBILITY]: A core JD responsibility  -  ask for the hardest version of that problem they have faced.\n"
            "Q4 [GAP]: A JD requirement not clearly shown in resume  -  ask for closest analogue and probe depth.\n"
            "Q5 [TRADEOFF]: A significant technical tradeoff they drove  -  what the options were, who disagreed, what they decided."
        ),
        "senior": (
            "PHASE 1  -  BACKGROUND (exactly 5 questions, SENIOR band):\n"
            "Q1 [OPENING]: Most specific question about a system or team direction they set  -  not participated in, but shaped.\n"
            "Q2 [ARCHITECTURE]: An architecture decision they led  -  what constraints they were working under, what they rejected and why.\n"
            "Q3 [JD-RESPONSIBILITY]: A core JD responsibility at senior scope  -  ask how they would approach it and for a past parallel.\n"
            "Q4 [GAP]: A JD requirement not clearly shown in resume  -  probe strategic judgment, not just experience.\n"
            "Q5 [INFLUENCE]: A situation where they drove alignment across teams without direct authority  -  what the resistance was, how they handled it."
        ),
    }
    _band_phase3 = {
        "fresher": (
            "PHASE 3  -  SKILLS (7-8 questions, FRESHER band):\n"
            "Focus: core fundamentals from JD, tools they listed, reasoning ability, learning gaps.\n"
            "Q-A [SKILL]: Hands-on question about the primary technical skill in the JD  -  not definition, but how they used it.\n"
            "Q-B [SKILL]: Second key skill from JD  -  same approach, ask for a real use case.\n"
            "Q-C [SKILL]: A tool or technology on their resume  -  what specifically did they do with it.\n"
            "Q-D [FUNDAMENTALS]: A core CS concept directly relevant to the JD role  -  test understanding, not memorization.\n"
            "Q-E [STRENGTH]: Ask them what they are strongest at technically  -  then immediately probe with a harder question on that topic.\n"
            "Q-F [WEAKNESS]: Ask where they feel least confident  -  probe whether their self-assessment is accurate.\n"
            "Q-G [WATCHOUT]: A thin or suspicious area on the resume  -  probe gently for real depth.\n"
            "Q-H [CUSTOM]: One question from the mandatory coverage list."
        ),
        "mid": (
            "PHASE 3  -  SKILLS (7-8 questions, MID-LEVEL band):\n"
            "Focus: implementation depth, JD skills, measurable outcomes, collaboration under pressure.\n"
            "Q-A [SKILL]: Primary JD skill  -  ask about the hardest problem they solved using it.\n"
            "Q-B [SKILL]: Second JD skill  -  same approach.\n"
            "Q-C [SKILL]: A tool on resume  -  what they built with it, what limitations they hit.\n"
            "Q-D [METRICS]: How they measured success on a past project  -  what the number was and what drove it.\n"
            "Q-E [STRENGTH]: Their strongest technical area  -  then probe with a real edge case or failure on that topic.\n"
            "Q-F [WEAKNESS]: An area they are actively trying to improve  -  ask what they have done about it.\n"
            "Q-G [WATCHOUT]: A contradiction or thin claim in the resume  -  probe for specifics.\n"
            "Q-H [CUSTOM]: One question from the mandatory coverage list."
        ),
        "experienced": (
            "PHASE 3  -  SKILLS (7-8 questions, EXPERIENCED band):\n"
            "Focus: technical depth on JD stack, production judgment, cross-functional influence.\n"
            "Q-A [SKILL]: Primary JD skill at scale  -  what broke, what they optimized, what they would do differently.\n"
            "Q-B [SKILL]: Second JD skill  -  same approach, push for production-level specifics.\n"
            "Q-C [SKILL]: A tool or platform on resume  -  deepest thing they did with it.\n"
            "Q-D [DEPTH]: A nuanced technical question in the JD domain  -  test whether they have genuine depth.\n"
            "Q-E [STRENGTH]: Their strongest technical domain  -  immediately probe with a failure or edge case in that domain.\n"
            "Q-F [WEAKNESS]: A domain or skill they avoid or find hard  -  probe whether they know why.\n"
            "Q-G [WATCHOUT]: A gap between what the resume implies and what they likely did  -  probe ownership.\n"
            "Q-H [CUSTOM]: One question from the mandatory coverage list."
        ),
        "senior": (
            "PHASE 3  -  SKILLS (7-8 questions, SENIOR band):\n"
            "Focus: architecture judgment, strategic depth, mentoring, hiring bar, ambiguity.\n"
            "Q-A [SKILL]: Primary JD skill at senior scope  -  what architectural decisions involved it.\n"
            "Q-B [SKILL]: Second JD skill  -  how they set standards or best practices around it for a team.\n"
            "Q-C [DESIGN]: A system design judgment call  -  build vs buy, adopt vs build, or similar.\n"
            "Q-D [MENTORING]: How they raised the technical bar of someone on their team  -  concrete example.\n"
            "Q-E [STRENGTH]: Their strongest technical domain  -  probe with a strategic or cross-team failure in that domain.\n"
            "Q-F [WEAKNESS]: A gap in their senior scope  -  a type of problem they have not led before.\n"
            "Q-G [WATCHOUT]: A claim in the resume that implies senior ownership but may be participation  -  probe for real accountability.\n"
            "Q-H [CUSTOM]: One question from the mandatory coverage list."
        ),
    }
    phase1_block = _band_phase1.get(band, _band_phase1["mid"])
    phase3_block = _band_phase3.get(band, _band_phase3["mid"])
    try:
        completion = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=0.2,
                max_tokens=1800,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are preparing two artifacts for an AI interviewer named Ishita. Output both sections exactly as specified.\n\n"
                            "ARTIFACT 1  -  BRIEF:\n"
                            "A compact style card. Exactly 5 fields, one line each. No extras.\n"
                            "Band: <band label>\n"
                            "Tone: <one line  -  e.g. warm but precise, peer-level, supportive but rigorous>\n"
                            "Depth: <one line  -  what level of specificity to expect>\n"
                            "Probe pressure: <one line  -  when and how hard to follow up>\n"
                            "Opener style: <one line  -  how to start the first real question>\n\n"
                            "ARTIFACT 2  -  QUESTION BANK:\n"
                            "These phases are internal to this question bank only. They do not map to the live runtime phases.\n"
                            "Each question must follow this exact format:\n"
                            "Q{N}. [{TAG}] <question text>\n"
                            "Strong: <one sentence  -  what a good answer sounds like>\n"
                            "Weak: <one sentence  -  what a shallow answer sounds like>\n"
                            "Probes: \"<follow-up 1>\", \"<follow-up 2>\"\n\n"
                            "Tags: OPENING, JD-RESPONSIBILITY, GAP:<slug>, PROJECT-DEPTH, EXPERIENCE, TRADEOFF, OWNERSHIP, IMPACT, LEARNING, INFLUENCE, ARCHITECTURE, SKILL:<slug>, FUNDAMENTALS, METRICS, DEPTH, STRENGTH, WEAKNESS, WATCHOUT, CUSTOM, MENTORING, DESIGN.\n"
                            "Q1 must always use tag [OPENING].\n"
                            "Include at least 1 [GAP:...] question in question-bank Phase 1.\n"
                            "All mandatory coverage items must appear as [CUSTOM] questions in question-bank Phase 3.\n\n"
                            f"{phase1_block}\n\n"
                            "PHASE 2  -  (reserved)\n"
                            "Do not generate any questions for Phase 2. Write only the header above.\n\n"
                            f"{phase3_block}"
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"CANDIDATE: {candidate_name}\n"
                            f"ROLE: {job_title}\n"
                            f"BAND: {band}\n"
                            f"TIME: {time_limit_mins} minutes\n\n"
                            f"CRITICAL SKILLS TO PROBE IN PHASE 3 (use these as SKILL tags  -  e.g. [SKILL:python]):\n"
                            + ("\n".join(f"- {s}" for s in critical_skills) if critical_skills else "- Use top skills from resume and JD") + "\n\n"
                            f"JOB DESCRIPTION / REQUIREMENTS:\n{jd_block}\n\n"
                            f"CANDIDATE RESUME:\n{resume_block}\n\n"
                            f"AI SCREENING REPORT:\n{ai_report_block}\n\n"
                            f"MANDATORY AREAS TO COVER (embed as CUSTOM questions in Phase 3):\n{questions_list}"
                        ),
                    },
                ],
            ),
            timeout=12.0,
        )
        await persist_org_manual_billing_usage(
            org_id, "interview", _extract_openai_completion_usage(completion)
        )
        brief = completion.choices[0].message.content or ""
        return brief.strip()
    except Exception as e:
        logger.warning(f"[BRIEF] Candidate brief generation failed: {e}")
        return ""
async def entrypoint(ctx: JobContext):
    entry_started_at = time.perf_counter()
    logger.info(f"Connecting to room {ctx.room.name}")
    # PRE-START CHECK: Do not join if another agent is already here
    for p in ctx.room.remote_participants.values():
        is_agent = (
            p.identity.startswith("AW_")
            or "agent" in p.identity.lower()
            or "agent" in (p.name or "").lower()
        )
        if is_agent:
            logger.warning(
                f"Another agent ({p.identity}) is already in the room. Self-destructing."
            )
            return
    # --- Fix 1: Session State ---
    transcript_lines: list[str] = []
    session_start_time: Optional[float] = None
    background_tasks: set[asyncio.Task[Any]] = set()
    def spawn_background_task(coro, label: str) -> asyncio.Task[Any]:
        task = asyncio.create_task(coro)
        background_tasks.add(task)
        def _on_done(done_task: asyncio.Task[Any]) -> None:
            background_tasks.discard(done_task)
            if done_task.cancelled():
                return
            try:
                err = done_task.exception()
            except Exception:
                return
            if err:
                logger.warning(f"[TASK] Background task '{label}' failed: {err}")
        task.add_done_callback(_on_done)
        return task
    def append_transcript_line(speaker: str, text: str) -> None:
        from agent_runtime_helpers import append_transcript_line as _atl
        _atl(transcript_lines, speaker, text)
    # Room name is available before connecting - derive app_id early so we can
    # fire the DB fetch in parallel with the room connect handshake.
    app_id = ctx.room.name.replace("interview_", "")
    dispatch_metadata = parse_dispatch_metadata(getattr(ctx.job, "metadata", ""))
    session_log_context: dict[str, Any] = {
        "app_id": app_id,
        "room_name": ctx.room.name,
    }
    if dispatch_metadata:
        session_log_context.update({
            "dispatch_application_id": dispatch_metadata.get("applicationId", app_id),
            "dispatch_candidate_name": dispatch_metadata.get("candidateName"),
            "dispatch_role_label": dispatch_metadata.get("roleLabel"),
            "dispatch_time_limit_mins": dispatch_metadata.get("timeLimitMins"),
            "dispatch_room_name": dispatch_metadata.get("roomName", ctx.room.name),
        })
    ctx.log_context_fields = session_log_context
    _LOG_CONTEXT_FIELDS.set(session_log_context)
    # --- Real-time Proctoring Sync Helpers ---
    async def _report_proctoring_realtime(evt_type: str, reason: str, score_delta: int, sev: str = "medium"):
        """Persist a single violation to the DB in real-time."""
        if not DATABASE_URL: return
        try:
            pool = await get_db_pool()
            async with pool.acquire() as conn:
                # Append the new event to the existing proctoringReport.events JSONB array
                await conn.execute(
                    """
                    UPDATE "Interview"
                    SET "proctoringReport" = jsonb_set(
                        COALESCE("proctoringReport", '{"events": []}'::jsonb),
                        '{events}',
                        COALESCE("proctoringReport"->'events', '[]'::jsonb) || $1::jsonb
                    ),
                    "updatedAt" = NOW()
                    WHERE "applicationId" = $2
                    """,
                    json.dumps({
                        "eventType": evt_type,
                        "reason": reason,
                        "timestamp": int(time.time() * 1000),
                        "severity": sev,
                        "score_delta": score_delta
                    }),
                    app_id
                )
        except Exception as e:
            logger.warning(f"[PROCTOR] Real-time persistence failed: {e}")
    async def _signal_client_proctoring_violation(evt_type: str, reason: str, sev: str = "medium"):
        """Send a data packet back to the candidate UI to trigger a toast."""
        if not ctx.room.local_participant: return
        try:
            payload = json.dumps({
                "type": "proctoring_violation",
                "eventType": evt_type,
                "reason": reason,
                "severity": sev,
                "timestamp": int(time.time() * 1000)
            }).encode("utf-8")
            await ctx.room.local_participant.publish_data(payload, reliable=True)
        except Exception as e:
            logger.warning(f"[PROCTOR] Client signaling failed: {e}")
    async def _signal_client_interview_terminated(reason: str) -> None:
        """Tell the candidate UI to exit the live room and open the feedback screen."""
        if not ctx.room.local_participant:
            return
        try:
            payload = json.dumps({
                "type": "interview_terminated",
                "reason": reason,
                "timestamp": int(time.time() * 1000),
            }).encode("utf-8")
            await ctx.room.local_participant.publish_data(payload, reliable=True)
            logger.info(f"[INTERVIEW_END] termination signal sent: {reason}")
        except Exception as e:
            logger.warning(f"[INTERVIEW_END] Client termination signal failed: {e}")
    # Parallelize network-bound work: room connect + DB fetch run concurrently.
    async def connect_with_retry():
        for attempt in range(3):
            try:
                await ctx.connect()
                return None
            except Exception as e:
                if attempt == 2:
                    return e
                logger.warning(f"Connection attempt {attempt + 1} failed: {e}. Retrying in 2s...")
                await asyncio.sleep(2)
        return RuntimeError("Failed to connect after 3 attempts")
    try:
        context_result = await get_interview_context(app_id)
    except Exception as e:
        logger.error(f"Failed to load interview context from DB: {e}")
        return
    if not isinstance(context_result, dict):
        logger.error(f"Invalid DB context payload type: {type(context_result)}")
        return
    context: dict[str, Any] = context_result
    connect_result = await connect_with_retry()
    if isinstance(connect_result, Exception):
        raise connect_result
    evaluation_signal_toggles = _extract_evaluation_signal_toggles(
        context.get("proctoringSignals")
    )
    # Read Room Metadata Context (available after connect)
    room_meta = {}
    try:
        if ctx.room.metadata:
            room_meta = json.loads(ctx.room.metadata)
    except Exception as e:
        logger.error(f"Failed to parse room metadata: {e}")
    extracted_details = room_meta.get("extractedDetails", "{}")
    structured_resume = room_meta.get("structuredResume", "{}")
    ai_report = room_meta.get("aiReport", "{}")
    def require_db_value(key: str, default: Any = None, required: bool = True):
        value = context.get(key)
        if value is None:
            if not required:
                return default
            raise RuntimeError(f"Missing required DB field: {key}")
        if isinstance(value, str) and not value.strip():
            if not required:
                return default
            raise RuntimeError(f"Missing required DB field: {key}")
        return value
    candidate_name = require_db_value("fullName")
    candidate_first_name = first_name_from_full_name(candidate_name)
    job_title = require_db_value("jobTitle")
    job_details = require_db_value("jd")
    interview_lang = require_db_value("language")
    time_limit_mins = FIXED_INTERVIEW_DURATION_MINUTES
    follow_up_depth = 2
    questions_raw = context.get("questions")
    custom_questions: list[Any] = (
        questions_raw if isinstance(questions_raw, list) else []
    )
    org_id = context.get("orgId")
    session_log_context.update(
        {
            "org_id": org_id,
            "org_name": _compact_optional(context.get("orgName")),
            "org_location": _compact_optional(context.get("orgLocation")),
            "drive_location": _compact_optional(context.get("driveLocation")),
            "candidate": candidate_name,
            "candidate_first_name": candidate_first_name,
            "job_title": job_title,
            "time_limit_mins": time_limit_mins,
        }
    )
    ctx.log_context_fields = session_log_context
    _LOG_CONTEXT_FIELDS.set(session_log_context)
    started_at = time.perf_counter()
    async def _log_shutdown(reason: str = "") -> None:
        elapsed_sec = round(time.perf_counter() - started_at, 1)
        logger.info(
            json.dumps(
                {
                    "event": "job_shutdown",
                    "reason": reason or "unknown",
                    "app_id": app_id,
                    "room_name": ctx.room.name,
                    "candidate": candidate_name,
                    "job_title": job_title,
                    "org_id": org_id,
                    "elapsed_sec": elapsed_sec,
                },
                sort_keys=True,
            )
        )
    ctx.add_shutdown_callback(_log_shutdown)
    # Org-specific model settings.
    org_tts_provider = str(require_db_value("ttsProvider")).upper()
    org_cartesia_model: Optional[str] = None
    org_cartesia_voice: Optional[str] = None
    org_sarvam_model: Optional[str] = None
    org_sarvam_voice: Optional[str] = None
    org_google_model: Optional[str] = None
    org_google_voice_name: Optional[str] = None
    org_deepgram_model: Optional[str] = None
    org_sarvam_stt_model: Optional[str] = None
    org_llm_model: Optional[str] = None
    org_llm_temperature: float = 0.4
    org_stt_provider: str = "GOOGLE" if org_tts_provider == "GOOGLE" else ""
    org_llm_provider: str = "GOOGLE" if org_tts_provider == "GOOGLE" else ""
    if org_tts_provider == "GOOGLE":
        org_google_model = str(require_db_value("googleModel", default=DEFAULT_GOOGLE_TTS_MODEL, required=False) or DEFAULT_GOOGLE_TTS_MODEL)
        org_google_voice_name = str(require_db_value("googleVoiceName", default=DEFAULT_GOOGLE_VOICE_NAME, required=False) or DEFAULT_GOOGLE_VOICE_NAME)
        analysis_client = build_google_analysis_client()
        analysis_model = GOOGLE_ANALYSIS_MODEL
        logger.info(
            "[GOOGLE_MODE] Active Google-only runtime selected; DB STT/LLM providers will be ignored"
        )
    else:
        org_stt_provider = str(require_db_value("sttProvider")).upper()
        org_llm_provider = str(require_db_value("llmProvider")).upper()
        org_llm_model = require_db_value("llmModel")
        org_llm_temperature = float(require_db_value("llmTemperature"))
        if org_tts_provider == "CARTESIA":
            # cartesiaModel may be null at org level when drive overrides ttsProvider to CARTESIA
            org_cartesia_model = str(require_db_value("cartesiaModel", default=CARTESIA_MODEL, required=False) or CARTESIA_MODEL)
            org_cartesia_voice = str(require_db_value("cartesiaVoiceId", default=CARTESIA_VOICE_ID, required=False) or CARTESIA_VOICE_ID)
        elif org_tts_provider == "SARVAM":
            org_sarvam_model = str(require_db_value("sarvamModel", default="bulbul:v2", required=False) or "bulbul:v2")
            org_sarvam_voice = str(require_db_value("sarvamVoice", default="anushka", required=False) or "anushka")
        else:
            raise RuntimeError(f"Unsupported DB ttsProvider: {org_tts_provider}")
        if org_stt_provider == "DEEPGRAM":
            org_deepgram_model = str(require_db_value("deepgramModel"))
        elif org_stt_provider == "SARVAM":
            org_sarvam_stt_model = str(require_db_value("sarvamSttModel"))
        else:
            raise RuntimeError(f"Unsupported DB sttProvider: {org_stt_provider}")
        if org_llm_provider not in {"OPENAI", "SARVAM"}:
            raise RuntimeError(f"Unsupported DB llmProvider: {org_llm_provider}")
        analysis_client = AsyncOpenAI()
        analysis_model = org_llm_model if org_llm_provider == "OPENAI" else LLM_MODEL
    if org_tts_provider == "GOOGLE":
        logger.info(
            "Org models -> GOOGLE runtime model=%s voice=%s analysis=%s",
            org_google_model,
            org_google_voice_name,
            analysis_model,
        )
    else:
        tts_model_for_log = org_sarvam_model if org_tts_provider == "SARVAM" else org_cartesia_model
        tts_voice_for_log = org_sarvam_voice if org_tts_provider == "SARVAM" else org_cartesia_voice
        stt_model_for_log = org_sarvam_stt_model if org_stt_provider == "SARVAM" else org_deepgram_model
        logger.info(
            "Org models -> STT=%s TTS=%s voice=%s LLM=%s (%s)",
            stt_model_for_log,
            tts_model_for_log,
            tts_voice_for_log,
            org_llm_model,
            org_llm_provider,
        )
    # Keep custom question text only; we will combine it with a mandatory
    # candidate-band checklist after parsing resume context.
    custom_questions_list = "\n".join([f"- {q}" for q in custom_questions])
    # Language Mapping for STT and TTS
    LANGUAGE_MAPPING = {
        "English": {"stt": "en-US", "tts": "en"},
        "Hindi": {"stt": "hi", "tts": "hi"},
    }
    lang_codes = LANGUAGE_MAPPING.get(interview_lang)
    if not lang_codes:
        raise RuntimeError(f"Unsupported interview language in DB: {interview_lang}")
    logger.info(
        f"Preparing interview with {candidate_name} for {job_title} in {interview_lang}"
    )
    resume_block = safe_parse(structured_resume, "No resume data provided.")
    ai_report_block = safe_parse(ai_report, "No prior screening data.")
    resume_context = parse_resume_context(structured_resume, resume_block)
    jd_block = build_jd_summary(extracted_details, job_details or "General professional role.")
    session_context = CandidateBandContext(
        candidate_band=infer_candidate_band(resume_context, resume_block),
        role_category=detect_role_category(job_title),
        role_subtype="",
        coverage_items=[],
        depth_instruction=(
            "Balance breadth and depth. Two follow-ups per key topic. Probe for reasoning but stay warm."
        ),
    )
    session_context.role_subtype = detect_role_subtype(job_title, session_context.role_category)
    session_context.resume_context = resume_context  # store for phase-level access
    session_context.coverage_items = build_coverage_checklist(session_context.candidate_band)
    session_context.short_coverage_block = "\n".join(
        f"- {item}" for item in session_context.coverage_items[:5]
    )
    if custom_questions_list:
        session_context.questions_list = f"{session_context.short_coverage_block}\n{custom_questions_list}"
    else:
        session_context.questions_list = session_context.short_coverage_block

    jd_must_haves = _extract_jd_must_haves(extracted_details, job_details or "")
    critical_skills = extract_critical_skills(jd_must_haves, resume_context.skills)
    session_context.critical_skills = critical_skills

    # Generate personalized candidate brief in the background.
    # We wait only briefly so first greeting is not blocked by this network call.
    candidate_brief_task = spawn_background_task(
        generate_candidate_brief(
            candidate_name=candidate_first_name or candidate_name,
            job_title=job_title,
            candidate_band=session_context.candidate_band,
            jd_block=jd_block,
            resume_block=resume_block,
            ai_report_block=ai_report_block,
            questions_list=session_context.questions_list,
            time_limit_mins=time_limit_mins,
            critical_skills=critical_skills,
            client=analysis_client,
            org_id=org_id,
            llm_model=analysis_model,
        ),
        "candidate_brief_generation",
    )
    logger.info(
        "[BRIEF] Candidate brief generation started in background; greeting will not wait for it"
    )
    session_context.candidate_summary_block = build_candidate_summary(resume_context)
    session_context.jd_summary_block = jd_block
    session_context.screening_summary_block = build_screening_summary(ai_report, ai_report_block)
    session_context.role_layer = build_role_layer(
        session_context.role_category, session_context.role_subtype, session_context.candidate_band
    )
    refresh_candidate_band_context(session_context)
    voice_layer_prompt = build_voice_layer_prompt(
        candidate_name=candidate_first_name or candidate_name,
        job_title=job_title,
        time_limit_mins=time_limit_mins,
        depth_instruction=session_context.depth_instruction,
        candidate_band=session_context.candidate_band,
        ai_name=_compact_optional(context.get("aiName")),
        org_name=_compact_optional(context.get("orgName")),
        org_location=_compact_optional(context.get("orgLocation")),
        drive_location=_compact_optional(context.get("driveLocation")),
    )
    evaluation_layer_prompt = build_evaluation_layer_prompt(
        live_prompt_context=session_context.live_prompt_context,
        candidate_name=candidate_first_name or candidate_name,
        job_title=job_title,
        time_limit_mins=time_limit_mins,
        depth_instruction=session_context.depth_instruction,
        candidate_band=session_context.candidate_band,
        ai_name=_compact_optional(context.get("aiName")),
        org_name=_compact_optional(context.get("orgName")),
        org_location=_compact_optional(context.get("orgLocation")),
        drive_location=_compact_optional(context.get("driveLocation")),
    )
    system_prompt = build_system_prompt(
        voice_layer_prompt=voice_layer_prompt,
        evaluation_layer_prompt=evaluation_layer_prompt,
    )
    chat_ctx = llm.ChatContext()
    chat_ctx.add_message(role="system", content=system_prompt)
    # Runtime Phase 1 = greeting + 4-turn warmup.
    # The question bank is a separate artifact that is injected later.
    phase_1_context = build_phase_1_warmup_directive()
    chat_ctx.add_message(role="system", content=phase_1_context)
    logger.info("[RUNTIME PHASE 1] Warmup directive injected (will transition to runtime Phase 2 after 2 candidate responses)")
    ctx.proc.userdata["candidate_band_context"] = session_context
    async def attach_brief_when_ready():
        if session_context.full_brief_injected:
            return
        try:
            delayed_brief = await candidate_brief_task
        except Exception as brief_err:
            logger.warning(
                "[BRIEF] Deferred brief generation failed  -  interview proceeding without personalization. error=%s",
                brief_err,
            )
            return
        if not delayed_brief:
            logger.warning("[BRIEF] Brief returned empty  -  interview proceeding without personalization")
            return
        if delayed_brief == session_context.candidate_brief_block:
            logger.info("[BRIEF] Brief unchanged from initial block  -  no update needed")
            return
        session_context.candidate_brief_block = delayed_brief
        session_context.smart_opening_question = extract_smart_opening_question(delayed_brief)
        session_context.question_bank = parse_question_bank(delayed_brief)
        refresh_candidate_band_context(session_context)
        injection = build_question_bank_injection(delayed_brief, session_context.question_bank, session_context.critical_skills)
        remove_system_messages(chat_ctx, "[CANDIDATE CONTEXT READY]")
        remove_system_messages(chat_ctx, "[INTERVIEW BRIEF + QUESTION BANK]")
        chat_ctx.add_message(role="system", content=injection)
        # If we're still in runtime Phase 2, refresh the opening context with the now-available
        # smart_opening_question so the LLM uses the brief's first question instead of the weak anchor.
        if runtime_phase == 2 and session_context.smart_opening_question:
            rc = session_context.resume_context
            updated_phase_2 = build_phase_2_opening_context(
                candidate_band=session_context.candidate_band,
                projects=rc.projects if rc else [],
                work_history=rc.work_history if rc else [],
                education=rc.education if rc else [],
                skills=rc.skills if rc else [],
                jd_summary_block=session_context.jd_summary_block,
                smart_opening_question=session_context.smart_opening_question,
                coverage_items=session_context.coverage_items,
            )
            remove_system_messages(chat_ctx, "[RUNTIME PHASE 2:")
            chat_ctx.add_message(role="system", content=updated_phase_2)
            logger.info("[BRIEF] Phase 2 opening context refreshed with smart_opening_question from brief")
        session_context.full_brief_injected = True
        logger.info(
            f"[BRIEF] Deferred brief+question bank attached ({len(injection)} chars, "
            f"p1={len(session_context.question_bank.phase1)}q p3_filtered={len(session_context.question_bank.get_phase3_filtered(session_context.critical_skills))}q)"
        )
    # attach_brief_when_ready() is triggered after runtime Phase 1 completes.
    # Do NOT spawn it here - it fires from on_conversation_item_added when warmup_complete=True.
    logger.info(
        "[SESSION] brief_available=%s opening_question=%s band=%s role=%s",
        bool(session_context.candidate_brief_block),
        bool(session_context.smart_opening_question),
        session_context.candidate_band,
        session_context.role_category,
    )
    vad_instance = ctx.proc.userdata.get("vad") or build_vad()
    google_mode = org_tts_provider == "GOOGLE"
    if google_mode:
        voice_to_use = org_google_voice_name or DEFAULT_GOOGLE_VOICE_NAME
        logger.info(
            f"[TTS] Using Google Gemini realtime runtime  -  voice={voice_to_use}"
        )
        llm_plugin = build_google_realtime_llm(
            model=str(org_google_model or DEFAULT_GOOGLE_TTS_MODEL),
            voice_name=voice_to_use,
            language=lang_codes["stt"],
        )
        turn_detector = "realtime_llm"
        session_kwargs = {
            "vad": vad_instance,
            "llm": llm_plugin,
            "turn_handling": TurnHandlingOptions(
                turn_detection=turn_detector,
                interruption=InterruptionOptions(
                    enabled=True,
                    mode="adaptive",
                    min_duration=1.5,
                    min_words=4,
                    discard_audio_if_uninterruptible=False,
                    resume_false_interruption=True,
                    false_interruption_timeout=3.0,
                ),
            ),
            "use_tts_aligned_transcript": False,
            "aec_warmup_duration": 2.5,
        }
    else:
        if org_stt_provider == "SARVAM":
            if org_sarvam_stt_model is None:
                raise RuntimeError("DB config missing sarvamSttModel for SARVAM")
            stt_plugin = build_sarvam_stt(
                language=lang_codes["stt"], model=org_sarvam_stt_model
            )
        else:
            if org_deepgram_model is None:
                raise RuntimeError("DB config missing deepgramModel for DEEPGRAM")
            stt_plugin = build_stt(
                language_code=lang_codes["stt"], model=org_deepgram_model
            )
        if org_tts_provider == "SARVAM":
            if org_sarvam_model is None or org_sarvam_voice is None:
                raise RuntimeError("DB config missing sarvamModel/sarvamVoice for SARVAM")
            sarvam_tts = build_sarvam_tts(
                language=lang_codes["tts"],
                model=org_sarvam_model,
                voice_id=org_sarvam_voice,
            )
            # Keep a Cartesia fallback ready so a Sarvam websocket hiccup does not
            # tear down the whole interview session.
            if org_cartesia_model is not None and org_cartesia_voice is not None:
                cartesia_tts = build_cartesia_tts(
                    language=lang_codes["tts"],
                    model=org_cartesia_model,
                    voice_id=org_cartesia_voice,
                )
                tts_plugin = lk_tts.FallbackAdapter(
                    [sarvam_tts, cartesia_tts], max_retry_per_tts=1
                )
            else:
                tts_plugin = sarvam_tts
        else:
            if org_cartesia_model is None or org_cartesia_voice is None:
                raise RuntimeError(
                    "DB config missing cartesiaModel/cartesiaVoiceId for CARTESIA"
                )
            logger.info(f"[TTS] Using Cartesia  -  model={org_cartesia_model} voice={org_cartesia_voice}")
            tts_plugin = build_tts(
                language=lang_codes["tts"],
                model=org_cartesia_model,
                voice_id=org_cartesia_voice,
            )
        if org_llm_provider == "SARVAM":
            llm_plugin = build_sarvam_llm(model=str(org_llm_model))
        else:
            llm_plugin = build_llm(model=str(org_llm_model), temperature=org_llm_temperature)
        turn_detector = ctx.proc.userdata.get("turn_detector")
        session_kwargs = {
            "vad": vad_instance,
            "stt": stt_plugin,
            "llm": llm_plugin,
            "tts": tts_plugin,
            "turn_handling": TurnHandlingOptions(
                turn_detection=turn_detector,
                endpointing=EndpointingOptions(
                    # Slightly longer endpointing to avoid cutting candidates mid-thought.
                    min_delay=1.5,
                    max_delay=3.0,
                    mode="dynamic",
                ),
                interruption=InterruptionOptions(
                    enabled=True,
                    mode="adaptive",
                    # Sensitivity tuning: ignore short noises/backchannels.
                    # Only stop if candidate speaks for > 1.5s and > 4 words.
                    min_duration=1.5,
                    min_words=4,
                    # Keep buffered speech during AEC warmup to avoid dropping input.
                    discard_audio_if_uninterruptible=False,
                    resume_false_interruption=True,
                    false_interruption_timeout=3.0,
                ),
            ),
            "use_tts_aligned_transcript": True,
            "tts_text_transforms": [
                "filter_emoji",
                "filter_markdown",
                _single_question_transform,
                text_transforms.replace({
                    "HR": "H R",
                    "SaaS": "sass",
                    "API": "A P I",
                    "SQL": "sequel",
                    "URL": "U R L",
                    "UI": "U I",
                    "UX": "U X",
                    "DevOps": "dev ops",
                    "LiveKit": "Live Kit",
                }),
            ],
            "aec_warmup_duration": 2.5,
        }
    latest_session_usage: Optional[AgentSessionUsage] = None
    session = AgentSession(**session_kwargs)
    @session.on("session_usage_updated")
    def on_session_usage_updated(event) -> None:
        nonlocal latest_session_usage
        latest_session_usage = event.usage
        logger.debug(
            f"[USAGE] Session usage updated (model buckets={len(event.usage.model_usage)})"
        )
    agent = Agent(instructions=system_prompt, chat_ctx=chat_ctx)
    participant: Optional[Any] = None
    disconnect_event = asyncio.Event()
    interview_finished_event = asyncio.Event()
    interview_marked_finished = False
    turn_count = 0           # counts assistant turns for state injection cadence
    last_injection_turn = 0  # tracks which turn last received a state injection
    warmup_responses_received = 0  # counts candidate responses during 2-turn warmup
    warmup_complete = False  # True after 2nd candidate response received
    # ── Time-based phase boundaries ──────────────────────────────────────────
    # Phase 2 (QB Phase 1 background questions) starts at 35% of total time.
    # Phase 3 (bridge)  starts implicitly between Phase 2 and Phase 4.
    # Phase 4 (QB Phase 3 skills) starts at 70% of total time.
    # Transitions are "safe": the flag is set by the timer loop, but the actual
    # system-prompt swap only fires after the candidate finishes their current
    # answer (i.e. on the next role=="user" event in on_conversation_item_added).
    PHASE2_START_RATIO = 0.35   # 7 min in a 20-min interview
    PHASE4_START_RATIO = 0.70   # 14 min in a 20-min interview
    runtime_phase = 1           # 1=warmup  2=background  3=bridge  4=skills
    _phase3_pending = False     # timer fired; waiting for turn boundary
    _phase4_pending = False     # timer fired; waiting for turn boundary
    llm_spoke_event = asyncio.Event()  # Signals when LLM gives first response
    environment_risk = 0     # browser-side proctoring signals
    integrity_risk = 0       # integrity-related proctoring signals
    depth_risk = 0           # surface answers / compression failures
    suspicion_score = 0      # composite risk score used only for mode switching
    current_interview_mode = "normal"  # normal / pressure / verification / deep
    proctoring_events: list = []       # timeline of risk signals for final report
    _face_absent_streak = 0            # repeated absence is stronger than a single blip
    ready_event = asyncio.Event()
    ready_signal_received_at: Optional[float] = None
    # Per-turn decision engine state
    _last_interviewer_question = ""   # most recent question Ishita asked
    _topic_follow_up_count = 0        # consecutive follow-ups on same topic
    _oai_eval_client = analysis_client  # reused client for per-turn evaluations
    answer_scores: list[dict] = []    # log of all answer quality scores for final DB save
    _topic_depth_history: list[float] = []  # depth scores per answer on current topic (reset on MOVE_ON)
    _collapse_stage: int = 0               # 0=none, 1=first probe issued, 2+=repeated collapse (hard flag)
    _last_depth_decay_turn: int = -999     # turn number when depth_decay last fired; -999 = never
    _depth_decay_ever_fired: bool = False  # True once depth_decay has fired at least once
    _question_asked_at: float = 0.0        # perf_counter() when Ishita finished speaking
    _answer_received_at: float = 0.0       # perf_counter() when candidate answer arrived
    _trust_state = init_trust_state()  # session-level trust engine state
    _contradiction_state = init_contradiction_state()  # explicit contradiction lifecycle state
    _active_eval_task: Optional[asyncio.Task[Any]] = None  # track active eval to prevent stale injects
    # Cross-turn consistency engine state
    _claim_index: dict[str, list[dict]] = {}  # claims indexed by type for contradiction checks
    _contradictions_found: list[dict] = [] # all detected contradictions for final report
    # Lock protecting all shared session state that is written by background tasks.
    # Both _evaluate_and_inject() and _inject_state() modify the same variables;
    # this lock ensures they never interleave at async await points.
    _session_state_lock = asyncio.Lock()
    def refresh_composite_risk() -> int:
        nonlocal suspicion_score
        suspicion_score = compose_risk_score(integrity_risk, depth_risk)
        return suspicion_score
    @ctx.room.on("disconnected")
    def on_disconnected(reason):
        disconnect_event.set()
    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(disconnected_participant):
        if participant and disconnected_participant.identity == participant.identity:
            if not ready_event.is_set() and not interview_marked_finished:
                # Ignore transient reconnects before candidate explicitly starts.
                logger.debug(
                    "Candidate disconnected before ready; waiting for reconnect"
                )
                return
            logger.info("Candidate participant disconnected")
            if interview_marked_finished:
                # Candidate explicitly finished the interview; shutdown immediately.
                disconnect_event.set()
                return
            # No grace period after readiness: disconnect immediately.
            disconnect_event.set()
    @ctx.room.on("participant_connected")
    def on_participant_connected(connected_participant):
        if participant and connected_participant.identity == participant.identity:
            if ready_event.is_set() or interview_marked_finished:
                logger.info("Candidate participant connected/reconnected")
    @ctx.room.on("data_received")
    def on_data_received(*event_args):
        nonlocal \
            interview_marked_finished, \
            ready_signal_received_at, \
            environment_risk, \
            integrity_risk, \
            depth_risk, \
            suspicion_score, \
            proctoring_events, \
            _trust_state, \
            runtime_phase, \
            _phase3_pending, \
            _phase4_pending
        try:
            raw_data = None
            # Helper functions moved to entrypoint scope to prevent NameError
            if not event_args:
                return
            # Compatibility across LiveKit Python event shapes:
            # - bytes payload directly
            # - object with .data bytes field
            # - tuple with payload in any position
            for arg in event_args:
                if isinstance(arg, (bytes, bytearray)):
                    raw_data = bytes(arg)
                    break
                if isinstance(arg, memoryview):
                    raw_data = arg.tobytes()
                    break
                maybe = getattr(arg, "data", None)
                if isinstance(maybe, (bytes, bytearray)):
                    raw_data = bytes(maybe)
                    break
                if isinstance(maybe, memoryview):
                    raw_data = maybe.tobytes()
                    break
            if raw_data is None:
                logger.debug(
                    "data_received had no bytes payload",
                    extra={"arg_types": [type(a).__name__ for a in event_args]},
                )
                return
            payload = json.loads(raw_data.decode("utf-8"))
            if payload.get("type") == "user_ready":
                if not ready_event.is_set():
                    ready_signal_received_at = time.perf_counter()
                    logger.info(
                        f"Candidate is ready signal received (attempt={payload.get('attempt')})"
                    )
                ready_event.set()
            elif payload.get("type") == "interview_finished":
                logger.info("Candidate marked interview as finished")
                interview_marked_finished = True
                interview_finished_event.set()
                disconnect_event.set()  # Resolve hang
            elif payload.get("type") == "proctor_event":
                # Phase 5: Browser-side proctoring signals (tab switch, face absent, etc.)
                if not any(evaluation_signal_toggles.values()):
                    logger.debug(
                        "[PROCTOR] Browser proctor event ignored because plan disables proctoring signals"
                    )
                    return
                event_name = payload.get("event")
                event_weight = PROCTORING_WEIGHTS.get(event_name, 0)
                if event_name == "face_absent":
                    _face_absent_streak += 1
                    if _face_absent_streak < 2:
                        event_weight = 0
                elif event_name != "face_absent":
                    _face_absent_streak = 0
                if event_weight > 0:
                    environment_risk = min(100, environment_risk + event_weight)
                    refresh_composite_risk()
                    _evt = {
                        "event": event_name,
                        "timestamp": time.time(),
                        "risk_bucket": "environment",
                        "score_delta": event_weight,
                        "score_after": suspicion_score,
                    }
                    proctoring_events.append(_evt)
                    _trust_state = apply_proctoring_event(_trust_state, _evt)
                    logger.info(
                        f"[PROCTOR] {event_name} from browser. score={suspicion_score}"
                    )
            elif payload.get("type") == "phase_transition":
                # Frontend timer signals when to move to the next runtime phase.
                # We only SET the pending flag here; the actual system-prompt swap
                # happens in on_conversation_item_added at the next turn boundary
                # (after the candidate finishes their current answer), so no
                # question is ever cut off mid-flight.
                target = payload.get("target_phase")
                if target == 3 and runtime_phase == 2 and not _phase3_pending:
                    _phase3_pending = True
                    logger.info(
                        "[PHASE] Frontend signalled phase_transition->3 "
                        "(will execute at next turn boundary, current runtime_phase=%d)",
                        runtime_phase,
                    )
                elif target == 4 and runtime_phase in (2, 3) and not _phase4_pending:
                    _phase4_pending = True
                    logger.info(
                        "[PHASE] Frontend signalled phase_transition->4 "
                        "(will execute at next turn boundary, current runtime_phase=%d)",
                        runtime_phase,
                    )
                else:
                    logger.debug(
                        "[PHASE] phase_transition signal target=%s ignored "
                        "(current runtime_phase=%d phase3_pending=%s phase4_pending=%s)",
                        target, runtime_phase, _phase3_pending, _phase4_pending,
                    )
        except Exception as e:
            logger.debug(f"Ignored malformed data packet: {e}")
            return
    # Pre-start all background processing while user is on hardware check.
    audio_input_options = {}
    if ai_coustics is not None:
        audio_input_options["noise_cancellation"] = ai_coustics.audio_enhancement(
            model=ai_coustics.EnhancerModel.QUAIL_VF_L
        )
    await session.start(
        agent=agent,
        room=ctx.room,
        room_options=room_io.RoomOptions(
            close_on_disconnect=False,
            audio_input=room_io.AudioInputOptions(**audio_input_options),
        ),
    )
    # --- Real-time Transcript Streaming is handled by LiveKit automatically ---
    async def _process_user_conversation_item(
        event,
        content: str,
        role: str,
        turn_snapshot: int,
    ) -> None:
        nonlocal suspicion_score, proctoring_events, _last_interviewer_question, \
            _topic_follow_up_count, current_interview_mode, answer_scores, \
            _claim_index, _contradictions_found, \
            _topic_depth_history, _trust_state, _contradiction_state, _active_eval_task, greeting_delivered_at
        try:
            if not content or role != "user":
                return
            # Block all STT processing until greeting is fully delivered
            if greeting_delivered_at is None:
                logger.info("[GREETING_BLOCK] Candidate spoke before greeting finished  -  ignoring until greeting delivered")
                return
            async def _inject_candidate_context_before_first_question() -> None:
                if session_context.full_brief_injected:
                    session_context.initial_context_injected = True
                    return
                if session_context.initial_context_injected:
                    return
                session_context.initial_context_injected = True
                brief_text = session_context.candidate_brief_block.strip()
                if not brief_text:
                    if candidate_brief_task.done():
                        try:
                            brief_text = (candidate_brief_task.result() or "").strip()
                        except Exception:
                            brief_text = ""
                    if not brief_text:
                        try:
                            brief_text = (
                                await asyncio.wait_for(
                                    asyncio.shield(candidate_brief_task),
                                    timeout=1.5,
                                )
                                or ""
                            ).strip()
                        except asyncio.TimeoutError:
                            brief_text = ""
                        except Exception as brief_err:
                            logger.warning(
                                f"[BRIEF] First-question brief wait failed: {brief_err}"
                            )
                            brief_text = ""
                if brief_text:
                    session_context.candidate_brief_block = brief_text
                    session_context.smart_opening_question = extract_smart_opening_question(brief_text)
                    session_context.question_bank = parse_question_bank(brief_text)
                    refresh_candidate_band_context(session_context)
                    injection = build_question_bank_injection(brief_text, session_context.question_bank, session_context.critical_skills)
                    remove_system_messages(chat_ctx, "[CANDIDATE CONTEXT READY]")
                    remove_system_messages(chat_ctx, "[INTERVIEW BRIEF + QUESTION BANK]")
                    chat_ctx.add_message(role="system", content=injection)
                    session_context.full_brief_injected = True
                    logger.info(
                        "[BRIEF] Brief+question bank injected before first question (%d chars) p1=%dq p3_filtered=%dq opening_question=%s",
                        len(injection), len(session_context.question_bank.phase1),
                        len(session_context.question_bank.get_phase3_filtered(session_context.critical_skills)),
                        bool(session_context.smart_opening_question),
                    )
                    return
                remove_system_messages(chat_ctx, "[CANDIDATE CONTEXT READY]")
                chat_ctx.add_message(
                    role="system",
                    content=build_candidate_context_ready_message(
                        context=session_context,
                        smart_opening_question=session_context.smart_opening_question,
                    ),
                )
                logger.info(
                    "[BRIEF] Lightweight candidate context injected brief_used=False opening_question=%s",
                    bool(session_context.smart_opening_question),
                )
            # --- STT text cleanup / noise suppression ---
            def _clean_stt_text(raw_text: str) -> str:
                text = re.sub(r"\s+", " ", (raw_text or "").strip())
                if not text:
                    return ""
                if text.lower().strip(" .!?") == "candidate response unavailable":
                    return ""
                tokens = [t for t in text.split(" ") if t]
                cleaned_tokens: list[str] = []
                for token in tokens:
                    alpha = re.sub(r"[^a-zA-Z]", "", token).lower()
                    # RELAXED: Only drop very short consonant-only fragments if they look like filler.
                    # "thr" or "qu" might be part of "through" or "quite" being evolving.
                    if alpha and len(alpha) <= 2 and not re.search(r"[aeiou]", alpha):
                        continue
                    if cleaned_tokens and cleaned_tokens[-1].lower() == token.lower():
                        # Collapse immediate duplicates like "name name", "a a a".
                        continue
                    cleaned_tokens.append(token)
                return re.sub(r"\s+", " ", " ".join(cleaned_tokens)).strip()
            content = _clean_stt_text(content)
            if not content:
                return
            # During the first few seconds after Ishita's opening greeting, short
            # echo-like fragments ("hi", "hello", "okay") are often the AI's own
            # voice leaking back into STT rather than a real candidate turn.
            # Suppress only tiny, greeting-like fragments here so we keep the
            # first transcript anchored to the interviewer greeting.
            if first_agent_turn_committed_at is not None:
                since_first_ai_turn = time.monotonic() - first_agent_turn_committed_at
                if since_first_ai_turn <= greeting_echo_suppression_secs:
                    echo_like = re.compile(
                        r"^\s*(?:hi|hello|hey|okay|ok|yeah|yes|yep|mmhmm|mhm|good morning|good afternoon)\s*$",
                        re.IGNORECASE,
                    )
                    if echo_like.match(content) or len(content.split()) <= 2:
                        logger.debug(
                            f"[TRANSCRIPT] Suppressing early greeting echo fragment: '{content[:60]}'"
                        )
                        return
            # --- STT Spam / Hallucination Filter ---
            # Sarvam (and some Deepgram models) hallucinate the same word repeatedly
            # when they detect silence or background noise. Discard these before they
            # pollute the transcript or distort the LLM context.
            words = content.strip().split()
            if len(words) >= 10:
                unique_words = set(w.lower().strip(".,!?") for w in words)
                if len(unique_words) <= 3:
                    logger.warning(
                        f"[TRANSCRIPT] Discarding hallucinated STT spam ({len(words)} words, "
                        f"{len(unique_words)} unique): '{content[:60]}...'"
                    )
                    return
            if len(words) >= 4:
                unique_words = set(w.lower().strip(".,!?") for w in words)
                if len(unique_words) <= max(1, int(len(words) * 0.35)):
                    logger.warning(
                        f"[TRANSCRIPT] Discarding low-diversity STT noise ({len(words)} words, "
                        f"{len(unique_words)} unique): '{content[:60]}...'"
                    )
                    return
            # Ignore tiny fragments unless they match an explicit short-answer pattern.
            # This cuts down on STT hallucinations, echo bleed, and half-words like
            # "bu", "thr", or "qu" being treated as real candidate turns.
            short_classification = classify_short_utterance(content)
            word_count = len([w for w in content.strip().split() if w])
            if short_classification is None and word_count <= 2:
                logger.debug(
                    f"[TRANSCRIPT] Ignoring probable STT fragment ({word_count} words): '{content[:60]}'"
                )
                return
            # Pure acknowledgments and answer_starts  -  don't log to transcript or trigger LLM.
            # Acknowledgment: "ok/yeah/sure"  -  pure filler, discard silently.
            # Answer_start: "so basically/well/um"  -  candidate mid-thought, don't interrupt.
            if short_classification and short_classification["response_class"] in ("acknowledgment", "answer_start"):
                if not session_context.initial_context_injected:
                    await _inject_candidate_context_before_first_question()
                short_directive = build_short_utterance_directive(
                    "acknowledgment",
                    short_classification["evidence"],
                )
                remove_system_messages(chat_ctx, "[SHORT_RESPONSE_DIRECTIVE")
                chat_ctx.add_message(role="system", content=short_directive)
                logger.debug(
                    f"[SHORT_REPLY] dropping acknowledgment filler: '{content[:60]}'"
                )
                return
            speaker = "Candidate"
            append_transcript_line(speaker, content)
            logger.info(f"[TRANSCRIPT] {speaker}: {content[:60]}...")
            if not session_context.initial_context_injected:
                _ctx_inject_t = time.perf_counter()
                await _inject_candidate_context_before_first_question()
                logger.info("[INIT] context_injection_ms=%.0f", (time.perf_counter() - _ctx_inject_t) * 1000)
            # Inject structured recent Q&A context for callbacks and contradiction detection.
            if _last_interviewer_question and turn_snapshot > 1:
                recent_context = _build_recent_context_block(
                    transcript_lines, _last_interviewer_question, n_exchanges=3
                )
                if recent_context:
                    remove_system_messages(chat_ctx, "[RECENT_CONTEXT]")
                    chat_ctx.add_message(
                        role="system",
                        content=f"[RECENT_CONTEXT  -  DO NOT READ ALOUD]\n{recent_context}",
                    )
            if short_classification:
                short_class = short_classification["response_class"]
                short_directive = build_short_utterance_directive(
                    short_class,
                    short_classification["evidence"],
                )
                remove_system_messages(chat_ctx, "[SHORT_RESPONSE_DIRECTIVE")
                chat_ctx.add_message(role="system", content=short_directive)
                logger.info(
                    f"[SHORT_REPLY] class={short_class} words={short_classification['token_count']} "
                    f"text='{short_classification['evidence'][:60]}'"
                )
                return
            # --- Per-Turn Answer Evaluator (Decision Engine) ---
            # Fires on every candidate response. Evaluates answer quality in real-time
            # and injects a NEXT_TURN_DIRECTIVE before Ishita generates her next response.
            # Decision: PROBE (which mode) or MOVE_ON - fully signal-driven, no fixed depth.
            # Warmup turns (before warmup_complete) are recorded as zero-scored placeholders
            # so they never pollute the technical or communication score averages.
            if not warmup_complete and _last_interviewer_question and turn_snapshot > 1:
                async with _session_state_lock:
                    answer_scores.append({
                        "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0,
                        "fluency": 0, "grammar": 0, "confidence": 0,
                        "overall": 0.0, "signals": [], "concerns": [],
                        "is_warmup": True,
                        "turn": turn_snapshot,
                        "question": _last_interviewer_question,
                    })
            if warmup_complete and _last_interviewer_question and turn_snapshot > 1:
                answer_snap = content
                question_snap = _last_interviewer_question
                follow_up_snap = _topic_follow_up_count
                lines_snap_eval = list(transcript_lines)
                depth_snap = list(_topic_depth_history)
                collapse_stage_snap = _collapse_stage
                score_history_snap = list(_trust_state.get("score_history", []))
                turns_since_decay_snap = (
                    (turn_snapshot - _last_depth_decay_turn)
                    if _last_depth_decay_turn >= 0
                    else 999
                )
                response_latency_snap: Optional[float] = (
                    round(_answer_received_at - _question_asked_at, 3)
                    if _question_asked_at > 0 and _answer_received_at > _question_asked_at
                    else None
                )
                async def _evaluate_and_inject(
                    answer=answer_snap,
                    question=question_snap,
                    follow_ups=follow_up_snap,
                    lines=lines_snap_eval,
                    turn=turn_snapshot,
                    depth_hist=depth_snap,
                    collapse_stage=collapse_stage_snap,
                    score_history=score_history_snap,
                    turns_since_decay=turns_since_decay_snap,
                    response_latency=response_latency_snap,
                ):
                    nonlocal _topic_follow_up_count, environment_risk, integrity_risk, depth_risk, suspicion_score, current_interview_mode, \
                        answer_scores, _claim_index, _contradictions_found, \
                        _topic_depth_history, _trust_state, _contradiction_state, _collapse_stage, \
                        _last_depth_decay_turn, _depth_decay_ever_fired
                    try:
                        # Step 1: Extract claims and check consistency (before quality eval)
                        # Only runs when contradiction signal is enabled  -  adds 1 LLM call/turn
                        _contradiction_enabled = bool(evaluation_signal_toggles.get("contradiction", False))
                        if _contradiction_enabled:
                            new_claims = await extract_claims(
                                candidate_answer=answer,
                                turn=turn,
                                client=_oai_eval_client,
                                org_id=org_id,
                                llm_model=analysis_model,
                            )
                        else:
                            new_claims = []
                        contradiction_alert: Optional[dict] = None
                        for claim in new_claims:
                            claim_type = str(claim.get("type", "") or "").strip()
                            if not claim_type:
                                continue
                            contradiction = check_contradiction(claim, _claim_index)
                            if contradiction and not contradiction_alert:
                                contradiction_alert = contradiction
                                _contradictions_found.append(contradiction)
                                logger.warning(
                                    f"[CONSISTENCY] Contradiction: {contradiction['type']} "
                                    f"turn {contradiction['old_turn']} ({contradiction['old_value']!r}) "
                                    f"vs turn {turn} ({contradiction['new_value']!r})"
                                )
                            _claim_index.setdefault(claim_type, []).append(claim)
                        # Step 2: Run TurnDecision pipeline (quality + signals + routing)
                        # Hard timeout: if evaluation LLM is slow the next candidate answer
                        # arrives before directive is injected  -  Ishita answers with no context.
                        try:
                            # Build uncovered topics list for directive bridging (Phase 3)
                            uncovered_topics = session_context.coverage_items[:3]  # Top 3 uncovered areas
                            td, directive = await asyncio.wait_for(
                                run_turn_evaluation(
                                    candidate_answer=answer,
                                    last_question=question,
                                    topic_follow_up_count=follow_ups,
                                    transcript_lines=lines,
                                    depth_history=depth_hist,
                                    contradiction_detected=contradiction_alert is not None,
                                    client=_oai_eval_client,
                                    org_id=org_id,
                                    llm_model=analysis_model,
                                    score_answer_quality_fn=score_answer_quality,
                                    evaluate_answer_and_decide_fn=evaluate_answer_and_decide,
                                    signal_toggles=evaluation_signal_toggles,
                                    max_follow_ups=follow_up_depth,
                                    uncovered_topics=uncovered_topics,
                                    collapse_stage=collapse_stage,
                                    session_score_history=score_history,
                                    turns_since_last_decay=turns_since_decay,
                                    response_latency_sec=response_latency,
                                ),
                                timeout=6.0,
                            )
                        except asyncio.TimeoutError:
                            logger.warning(
                                "[EVAL] run_turn_evaluation timed out (>6s) turn=%d  -  using safe fallback evaluation",
                                turn,
                            )
                            td = {
                                "decision": {"action": "PROBE"},
                                "quality": {"clarity": 5.0, "depth": 5.0, "specificity": 5.0, "grounding": 5.0},
                                "signal_events": [],
                            }
                            directive = "\nContinue with standard conversational depth."
                        action = td["decision"]["action"]
                        signal_events = td.get("signal_events", [])
                        depth_signal = "SURFACE"
                        quality_avg = (
                            td["quality"]["clarity"] + td["quality"]["depth"] +
                            td["quality"]["specificity"] + td["quality"]["grounding"]
                        ) / 4.0
                        if quality_avg >= 7.0:
                            depth_signal = "DEEP"
                        elif quality_avg >= 4.5:
                            depth_signal = "SPECIFIC"
                        # All I/O is done. Acquire lock before mutating any shared session state.
                        # This prevents _inject_state() (fires every 3 turns) from interleaving
                        # with this function at async await points and corrupting shared counters.
                        async with _session_state_lock:
                            # Log quality score for DB persistence
                            quality_record = {
                                "clarity": td["quality"]["clarity"],
                                "depth": td["quality"]["depth"],
                                "specificity": td["quality"]["specificity"],
                                "grounding": td["quality"]["grounding"],
                                "overall": quality_avg,
                                "signals": [event["signal_name"] for event in signal_events if event.get("signal_name")],
                                "concerns": [event["signal_name"] for event in signal_events if event.get("score_delta", 0.0) < 0],
                                "turn": turn,
                                "question": question,
                            }
                            answer_scores.append(quality_record)
                            # Update depth history and follow-up counter
                            _topic_depth_history.append(td["quality"]["depth"])
                            collapse_fired = any(
                                ev.get("signal_name") == "follow_up_collapse"
                                for ev in signal_events
                            )
                            if action in ("PROBE", "VERIFY"):
                                _topic_follow_up_count += 1
                                if collapse_fired:
                                    # Probe issued for collapse  -  advance stage so next turn escalates
                                    _collapse_stage += 1
                                elif _collapse_stage > 0 and not collapse_fired:
                                    # No collapse this follow-up  -  candidate recovered, reduce stage
                                    _collapse_stage = max(0, _collapse_stage - 1)
                            else:
                                _topic_follow_up_count = 0
                                _topic_depth_history = []
                                _collapse_stage = 0
                            # Update depth_decay cooldown state
                            if any(ev.get("signal_name") == "depth_decay" for ev in signal_events):
                                _last_depth_decay_turn = turn
                                _depth_decay_ever_fired = True
                            # Update the canonical TrustState only. Trust deltas are folded into the
                            # single structured engine so we do not maintain a second trust line.
                            _trust_state = apply_turn_decision(
                                _trust_state,
                                td,
                                behavioral_toggles=evaluation_signal_toggles,
                            )
                            # Record the signal contract in one place and keep the legacy risk meter aligned.
                            for event in signal_events:
                                event_delta = float(event.get("score_delta", 0.0) or 0.0)
                                legacy_delta = int(round(max(0.0, -event_delta) * 100))
                                signal_layer = str(event.get("signal_layer", "") or "")
                                if legacy_delta:
                                    if signal_layer == "hard_integrity":
                                        integrity_risk = min(100, integrity_risk + legacy_delta)
                                    else:
                                        depth_risk = min(100, depth_risk + legacy_delta)
                                    refresh_composite_risk()
                                proctoring_events.append({
                                    "event": event["signal_name"],
                                    "signal_name": event["signal_name"],
                                    "signal_layer": event["signal_layer"],
                                    "risk_bucket": "integrity" if signal_layer == "hard_integrity" else "depth",
                                    "confidence": event["confidence"],
                                    "evidence": event["evidence"],
                                    "trust_bucket_affected": event["trust_bucket_affected"],
                                    "score_delta": event_delta,
                                    "probe_mode": event["probe_mode"],
                                    "recoverable": event["recoverable"],
                                    "recruiter_visible": event["recruiter_visible"],
                                    "turn": turn,
                                    "score_after": suspicion_score,
                                })
                                logger.info(
                                    f"[SIGNAL] {event['signal_name']} layer={event['signal_layer']} "
                                    f"confidence={event['confidence']:.2f} trust_delta={event_delta:+.2f} "
                                    f"visible={event['recruiter_visible']} turn={turn}"
                                )
                            # Contradiction recovery: if last turn surfaced a contradiction and
                            # this turn the candidate moved on cleanly with decent quality,
                            # treat it as resolved and restore hard_integrity.
                            quality_avg_for_recovery = (
                                td["quality"]["clarity"] + td["quality"]["depth"] +
                                td["quality"]["specificity"] + td["quality"]["grounding"]
                            ) / 4.0
                            contradiction_enabled = bool(evaluation_signal_toggles.get("contradiction", False))
                            contradiction_resolved_enabled = bool(
                                evaluation_signal_toggles.get("contradiction_resolved", False)
                            )
                            if contradiction_enabled:
                                _contradiction_state, contradiction_state_event = advance_contradiction_state(
                                    _contradiction_state,
                                    contradiction_alert,
                                    turn=turn,
                                    action=action,
                                    quality_avg=quality_avg_for_recovery,
                                )
                                if contradiction_state_event:
                                    _c_status = contradiction_state_event["status"]
                                    _c_signal_name = (
                                        "contradiction_resolved"
                                        if _c_status == "candidate_clarified"
                                        else "contradiction"
                                    )
                                    _c_confidence = (
                                        0.90 if _c_status == "repeated"
                                        else 0.80 if _c_status == "candidate_clarified"
                                        else 0.95
                                    )
                                    proctoring_events.append({
                                        "event": contradiction_state_event["event"],
                                        "signal_name": _c_signal_name,
                                        "signal_layer": "hard_integrity",
                                        "source": contradiction_state_event["source"],
                                        "status": _c_status,
                                        "turn": contradiction_state_event["turn"],
                                        "surfaced_turn": contradiction_state_event["surfaced_turn"],
                                        "repeat_count": contradiction_state_event["repeat_count"],
                                        "probe_type": contradiction_state_event["probe_type"],
                                        "recovery_path": contradiction_state_event["recovery_path"],
                                        "recruiter_note": contradiction_state_event["recruiter_note"],
                                        "trust_delta": contradiction_state_event["trust_delta"],
                                        "score_delta": contradiction_state_event["trust_delta"],
                                        "score_after": suspicion_score,
                                        "confidence": _c_confidence,
                                        "recruiter_visible": True,
                                        "evidence": contradiction_state_event.get("evidence", ""),
                                        "contradiction_type": contradiction_state_event.get("contradiction_type", ""),
                                    })
                                    logger.info(
                                        f"[CONTRADICTION] status={contradiction_state_event['status']} "
                                        f"source={contradiction_state_event['source']} turn={turn} "
                                        f"trust_delta={contradiction_state_event['trust_delta']:+.2f}"
                                    )
                                    if contradiction_state_event["status"] == "candidate_clarified" and contradiction_resolved_enabled:
                                        _trust_state = apply_contradiction_resolved(_trust_state)
                                        logger.info("[TRUST] Contradiction resolved by candidate - hard_integrity restored")
                            # Feed depth signal into suspicion scoring
                            if depth_signal == "SURFACE":
                                depth_risk = min(100, depth_risk + 3)
                                refresh_composite_risk()
                            elif depth_signal == "DEEP" and current_interview_mode == "normal":
                                current_interview_mode = "deep"
                        # Append contradiction context to directive if needed
                        contradiction_summary = summarize_contradiction_state(_contradiction_state)
                        evidence = contradiction_summary["evidence"]
                        old_t = evidence.get("oldTurn", 0)
                        old_v = _sanitize_claim_value(evidence.get("oldValue", ""))
                        new_v = _sanitize_claim_value(evidence.get("newValue", ""))
                        claim_t = re.sub(r"[^\w\s]", "", contradiction_summary["contradictionType"].replace("_", " ")).strip() or "contradiction"
                        if contradiction_summary["active"] and bool(evaluation_signal_toggles.get("contradiction", False)):
                            directive = (
                                f"[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                                f"DECISION: CONTRADICTION {contradiction_summary['status'].upper()}\n"
                                f"INCONSISTENCY DETECTED: {claim_t}\n"
                                f"  Earlier (turn {old_t}): '{old_v}'\n"
                                f"  Just now (turn {turn}): '{new_v}'\n"
                                f"ACTION: Surface this with genuine confusion - not accusation."
                                f"Say something like: 'wait, I want to make sure I understood this right - "
                                f"earlier it sounded like {old_v}, but just now it sounds more like {new_v}. "
                                f"Help me connect those two.' "
                                f"If they clarify convincingly, accept it and move on. "
                                f"If they stall or contradict again, note it internally and continue."
                            )
                        # Remove previous directive to keep context clean
                        messages = chat_ctx.messages() if callable(getattr(chat_ctx, "messages", None)) else chat_ctx.messages
                        for old_msg in list(messages):
                            if getattr(old_msg, "role", "") == "system" and "[NEXT_TURN_DIRECTIVE" in (getattr(old_msg, "content", "") or ""):
                                try:
                                    messages.remove(old_msg)
                                except (ValueError, AttributeError):
                                    pass
                        logger.info(
                            "[DIRECTIVE] action=%s mode=%s turn=%d collapse_stage=%d",
                            td["decision"]["action"], td["decision"]["mode"],
                            turn, _collapse_stage,
                        )
                        chat_ctx.add_message(role="system", content=directive)
                    except Exception as e:
                        logger.warning(f"[EVAL] Evaluator injection failed turn={turn_snapshot}: {e}", exc_info=True)
                # Cancel any stale eval task before spawning new one
                if _active_eval_task and not _active_eval_task.done():
                    _active_eval_task.cancel()
                _active_eval_task = spawn_background_task(_evaluate_and_inject(), f"eval_turn_{turn_snapshot}")
        except Exception as e:
            logger.debug(f"[TRANSCRIPT] User item processing failed: {e}")
    @session.on("conversation_item_added")
    def on_conversation_item_added(event) -> None:
        nonlocal session_start_time, turn_count, last_injection_turn, \
            _last_interviewer_question, _topic_follow_up_count, \
            _question_asked_at, _answer_received_at, warmup_responses_received, warmup_complete, llm_spoke_event, \
            runtime_phase, _phase3_pending, _phase4_pending
        try:
            item = event.item
            role = getattr(item, "role", None)
            content = item.text_content
            if not content or not role:
                return
            if role == "assistant":
                if not llm_spoke_event.is_set():
                    llm_spoke_event.set()
                    logger.info("[GREETING_GUARD] LLM spoke for first time  -  greeting will skip if not already delivered")
            if role == "user":
                _answer_received_at = time.perf_counter()
                # ── Phase 1 → Phase 2: warmup complete after 2 candidate responses ──────
                if not warmup_complete:
                    warmup_responses_received += 1
                    if warmup_responses_received >= 2:
                        warmup_complete = True
                        runtime_phase = 2
                        # End runtime Phase 1, inject runtime Phase 2 opening context
                        remove_system_messages(chat_ctx, "[RUNTIME PHASE 1: WARMUP")
                        rc = session_context.resume_context
                        phase_2_context = build_phase_2_opening_context(
                            candidate_band=session_context.candidate_band,
                            projects=rc.projects if rc else [],
                            work_history=rc.work_history if rc else [],
                            education=rc.education if rc else [],
                            skills=rc.skills if rc else [],
                            jd_summary_block=session_context.jd_summary_block,
                            smart_opening_question=session_context.smart_opening_question,
                            coverage_items=session_context.coverage_items,
                        )
                        chat_ctx.add_message(role="system", content=phase_2_context)
                        logger.info(
                            "[PHASE 2] Opening context injected band=%s",
                            session_context.candidate_band,
                        )
                        spawn_background_task(attach_brief_when_ready(), "attach_brief_on_warmup_complete")
                # ── Phase 2/3 → Phase 3 bridge: frontend signalled ~35% elapsed ─────────
                # Only fires after warmup is complete and current answer is done.
                elif _phase3_pending and runtime_phase == 2:
                    _phase3_pending = False
                    runtime_phase = 3
                    remove_system_messages(chat_ctx, "[RUNTIME PHASE 2:")
                    bridge = build_phase_3_bridge_directive(
                        candidate_band=session_context.candidate_band,
                        coverage_items=session_context.coverage_items,
                    )
                    chat_ctx.add_message(role="system", content=bridge)
                    logger.info("[PHASE 3] Bridge directive injected  -  transitioning from background to skills")
                # ── Phase 3 → Phase 4 skills: frontend signalled ~70% elapsed ───────────
                # Only fires after current answer is done, regardless of which phase we're in.
                elif _phase4_pending and runtime_phase in (2, 3):
                    _phase4_pending = False
                    runtime_phase = 4
                    remove_system_messages(chat_ctx, "[RUNTIME PHASE 2:")
                    remove_system_messages(chat_ctx, "[RUNTIME PHASE 3:")
                    skills_directive = build_phase_4_skills_directive()
                    chat_ctx.add_message(role="system", content=skills_directive)
                    logger.info("[PHASE 4] Skills directive injected  -  QB Phase 3 critical skills now active")
                turn_snapshot = turn_count
                spawn_background_task(
                    _process_user_conversation_item(event, content, role, turn_snapshot),
                    f"process_user_turn_{turn_snapshot}",
                )
                return
            speaker = "Interviewer" if role == "assistant" else "Candidate"
            # Strip the <wait for response> marker from transcript (it's an internal signal, not dialogue)
            clean_content = content.replace("<wait for response>", "").strip()
            append_transcript_line(speaker, clean_content)
            logger.info(f"[TRANSCRIPT] {speaker}: {clean_content[:60]}...")
            # --- Track last Ishita question (for per-turn evaluator) ---
            if role == "assistant":
                # Extract the last sentence ending in "?" as the question
                q_match = re.search(r'([^.!?]+\?)\s*$', clean_content.strip())
                if q_match:
                    _last_interviewer_question = q_match.group(1).strip()
            # --- Per-Turn Answer Evaluator (Decision Engine) ---
            # Fires on every candidate response. Evaluates answer quality in real-time
            # and injects a NEXT_TURN_DIRECTIVE before Ishita generates her next response.
            # Decision: PROBE (which mode) or MOVE_ON - fully signal-driven, no fixed depth.
            # --- Dynamic Interview State Injection (every 3 assistant turns) ---
            # Every 3 turns, a lightweight LLM call generates a coverage + pace summary
            # and injects it as a system message so Ishita knows what she's covered, what's
            # thin/untouched, and whether she needs to move on immediately.
            if role == "assistant":
                _question_asked_at = time.perf_counter()
                turn_count += 1
                if turn_count % 3 == 0 and turn_count != last_injection_turn:
                    last_injection_turn = turn_count
                    lines_snap = list(transcript_lines)
                    current_turn = turn_count
                    q_list_snap = session_context.questions_list
                    # Estimate total expected turns from time limit (avg ~2 turns/min)
                    expected_total = max(time_limit_mins * 2, 10)
                    # Compute wall-clock seconds remaining at snapshot time
                    _elapsed = time.time() - session_start_time if session_start_time else 0
                    _secs_remaining = max(0.0, time_limit_mins * 60 - _elapsed)
                    mode_snap = current_interview_mode
                    async def _inject_state(
                        snap=lines_snap, q_list=q_list_snap, t=current_turn, exp=expected_total,
                        mode=mode_snap, secs_rem=_secs_remaining
                    ):
                        nonlocal environment_risk, integrity_risk, depth_risk, suspicion_score, current_interview_mode
                        try:
                            state = await generate_interview_state_summary(
                                snap,
                                q_list,
                                candidate_name,
                                job_title,
                                _oai_eval_client,
                                org_id=org_id,
                                turn_count=t,
                                total_turns_expected=exp,
                                seconds_remaining=secs_rem,
                                llm_model=analysis_model,
                            )
                            if state:
                                # All I/O done  -  acquire lock before writing shared state.
                                async with _session_state_lock:
                                    # --- Parse proctoring signals from state text ---
                                    if "CONTRADICTION DETECTED" in state:
                                        proctoring_events.append({
                                            "event": "contradiction_detected",
                                            "turn": t,
                                            "score_delta": 0,
                                            "score_after": suspicion_score,
                                            "note": "state summary surfaced a contradiction; trust handled in formal state machine",
                                        })
                                        logger.info(f"[PROCTOR] contradiction_detected turn={t} (formal state handles trust)")
                                    depth_match = re.search(r"ANSWER_DEPTH:\s*\[(SURFACE|SPECIFIC|DEEP)\]", state)
                                    if depth_match:
                                        depth_level = depth_match.group(1)
                                        if depth_level == "SURFACE":
                                            depth_risk = min(100, depth_risk + 5)
                                            refresh_composite_risk()
                                            proctoring_events.append({
                                                "event": "answer_surface",
                                                "turn": t,
                                                "risk_bucket": "depth",
                                                "score_delta": 5,
                                                "score_after": suspicion_score,
                                            })
                                        logger.info(f"[PROCTOR] answer_depth={depth_level} turn={t} score={suspicion_score}")
                                    if "MOVE ON NOW" in state:
                                        proctoring_events.append({
                                            "event": "stuck_alert",
                                            "turn": t,
                                            "score_delta": 0,
                                            "score_after": suspicion_score,
                                        })
                                        logger.info(f"[PROCTOR] stuck_alert turn={t}")
                                    if "PACE CRITICAL" in state:
                                        proctoring_events.append({
                                            "event": "pace_critical",
                                            "turn": t,
                                            "score_delta": 0,
                                            "score_after": suspicion_score,
                                        })
                                        logger.info(f"[PROCTOR] pace_critical turn={t}")
                                    if "TIME CRITICAL" in state or secs_rem <= 300:
                                        proctoring_events.append({
                                            "event": "time_critical_rapid_fire",
                                            "turn": t,
                                            "seconds_remaining": secs_rem,
                                            "score_delta": 0,
                                            "score_after": suspicion_score,
                                        })
                                        logger.info(f"[PROCTOR] time_critical_rapid_fire turn={t} secs_rem={secs_rem:.0f}")
                                    # --- Determine interview mode from proctoring risk only ---
                                    mode_risk_score = compose_mode_risk_score(
                                        integrity_risk,
                                        depth_risk,
                                    )
                                    if integrity_risk >= 15 or mode_risk_score >= 28:
                                        new_mode = "verification"
                                    elif mode_risk_score >= 16 or depth_risk >= 18:
                                        new_mode = "pressure"
                                    else:
                                        new_mode = mode  # keep existing (could be "deep" from genuine depth)
                                    if new_mode != current_interview_mode:
                                        logger.info(
                                            f"[PROCTOR] mode_change {current_interview_mode}->{new_mode} "
                                            f"proctoring_score={mode_risk_score} "
                                            f"env={environment_risk} integrity={integrity_risk} depth={depth_risk} turn={t}"
                                        )
                                        current_interview_mode = new_mode
                                        proctoring_events.append({
                                            "event": "mode_change",
                                            "turn": t,
                                            "from": mode,
                                            "to": new_mode,
                                            "score": mode_risk_score,
                                        })
                                    # --- Remove old state injections - keep only the latest 2 ---
                                    messages = chat_ctx.messages() if callable(getattr(chat_ctx, "messages", None)) else chat_ctx.messages
                                    state_msgs = [
                                        m
                                        for m in messages
                                        if getattr(m, "role", "") == "system"
                                        and "[INTERVIEW STATE UPDATE" in (
                                            getattr(m, "content", "") or ""
                                        )
                                    ]
                                    if len(state_msgs) >= 2:
                                        for old_msg in state_msgs[:-1]:
                                            try:
                                                messages.remove(old_msg)
                                            except (ValueError, AttributeError):
                                                pass
                                    mins_left = int(secs_rem // 60)
                                    secs_left = int(secs_rem % 60)
                                    time_flag = (
                                        f"TIME CRITICAL  -  {mins_left}m {secs_left}s remaining. RAPID FIRE MODE ACTIVE."
                                        if secs_rem <= 300
                                        else f"TIME REMAINING: {mins_left}m {secs_left}s"
                                    )
                                    injection_text = (
                                        f"[INTERVIEW STATE UPDATE - Turn {t}]\n"
                                        f"ISHITA_MODE: {current_interview_mode.upper()}\n"
                                        f"COMPOSITE_RISK: {suspicion_score}\n"
                                        f"{time_flag}\n"
                                        f"{state}\n"
                                        "Use this to guide your next 3-4 exchanges. "
                                        "Do not reference this note aloud."
                                    )
                                    chat_ctx.add_message(
                                        role="system", content=injection_text
                                    )
                                    logger.info(
                                        f"[STATE_INJECT] Injected state at turn {t} "
                                        f"mode={current_interview_mode} composite_risk={suspicion_score}: "
                                        f"{state[:80]}..."
                                    )
                        except Exception as e:
                            logger.warning(
                                f"[STATE_INJECT] Injection failed at turn {t}: {e}"
                            )
                    spawn_background_task(_inject_state(), f"inject_state_turn_{current_turn}")
            # --- Periodic auto-save every 5 turns to prevent data loss ---
            if len(transcript_lines) > 0:
                start_t = session_start_time
                lines_snapshot = list(transcript_lines)
                app_id_snap = app_id
                async def _periodic_save():
                    try:
                        await persist_transcript(app_id_snap, lines_snapshot, start_t)
                        logger.info(
                            f"[TRANSCRIPT] Turn auto-save at {len(lines_snapshot)} lines"
                        )
                    except Exception as save_err:
                        logger.warning(f"[TRANSCRIPT] Periodic save failed: {save_err}")
                spawn_background_task(
                    _periodic_save(),
                    f"periodic_save_{len(lines_snapshot)}_lines",
                )
        except Exception as e:
            logger.warning(f"[TRANSCRIPT] Event parse error: {e}")
    # --- Thinking Filler Logic ---
    # NOTE: session.say() fillers are intentionally disabled.
    # When filler audio and the LLM TTS reply fire at near-simultaneous times
    # (~700ms window), they create two competing audio streams which causes
    # voice breakup / choppy audio on the candidate's side.
    # The LLM pipeline already has low enough latency that fillers add more
    # harm (audio conflict) than benefit (perceived naturalness).
    is_agent_speaking = False
    is_candidate_speaking = False
    awaiting_candidate_response = False
    awaiting_candidate_since: float | None = None
    inactivity_nudge_sent_for_current_prompt = False
    first_agent_turn_committed_at: float | None = None
    greeting_echo_suppression_secs = 6.0
    greeting_delivered_at: float | None = None  # Track when greeting finishes
    def reset_inactivity_clock(start_waiting: bool, preserve_nudge_flags: bool = False) -> None:
        nonlocal awaiting_candidate_response, awaiting_candidate_since, \
            inactivity_nudge_sent_for_current_prompt
        awaiting_candidate_response = start_waiting
        awaiting_candidate_since = time.monotonic() if start_waiting else None
        if not preserve_nudge_flags:
            inactivity_nudge_sent_for_current_prompt = False
        if start_waiting:
            logger.debug("[NUDGE] Inactivity clock started (awaiting candidate response)")
        else:
            logger.debug("[NUDGE] Inactivity clock cleared")
    @session.on("user_state_changed")
    def on_user_state_changed(event):
        nonlocal is_candidate_speaking
        if event.new_state == "speaking":
            is_candidate_speaking = True
            reset_inactivity_clock(start_waiting=False)
        elif event.new_state == "listening":
            is_candidate_speaking = False
    @session.on("agent_state_changed")
    def on_agent_state_changed(event):
        nonlocal is_agent_speaking, first_agent_turn_committed_at
        if event.new_state == "speaking":
            is_agent_speaking = True
            reset_inactivity_clock(start_waiting=False)
        elif event.new_state == "listening":
            is_agent_speaking = False
            if first_agent_turn_committed_at is None:
                first_agent_turn_committed_at = time.monotonic()
            reset_inactivity_clock(start_waiting=True, preserve_nudge_flags=True)
            logger.debug("[NUDGE] AI finished speaking; starting inactivity countdown")
    # Wait for participant to join so we have their identity for tracking.
    # Keep waiting during hardware check and handle room-disconnect gracefully.
    async def wait_for_human_participant(max_wait_seconds: int = 600):
        deadline = time.monotonic() + max_wait_seconds
        while time.monotonic() < deadline:
            if disconnect_event.is_set():
                return None
            try:
                return await asyncio.wait_for(ctx.wait_for_participant(), timeout=20)
            except asyncio.TimeoutError:
                continue
            except RuntimeError as e:
                msg = str(e).lower()
                if "room disconnected" in msg:
                    logger.warning(
                        "Room disconnected while waiting for participant; ending job cleanly"
                    )
                    disconnect_event.set()
                    return None
                logger.warning(f"Transient participant wait runtime error: {e}")
                await asyncio.sleep(0.2)
            except Exception as e:
                logger.warning(f"Transient participant wait error: {e}")
                await asyncio.sleep(0.2)
        logger.warning(f"Did not find a human participant within {max_wait_seconds}s")
        return None
    # FIX: Increased to 300s (5 mins) to allow for hardware checks.
    # If nobody joins in 5 minutes, free the process slot.
    participant = await wait_for_human_participant(max_wait_seconds=300)
    if not participant:
        logger.warning(
            f"[TIMEOUT] No candidate joined room for app {app_id} within 300s. Recording NO_SHOW."
        )
        # Phase 5: Mark interview as NO_SHOW in database
        try:
            proctoring_data = {
                "role_category": session_context.role_category,
                "candidate_band": session_context.candidate_band,
                "total_turns": turn_count,
                "suspicion_score": suspicion_score,
                "environment_risk": environment_risk,
                "integrity_risk": integrity_risk,
                "depth_risk": depth_risk,
                "composite_risk": suspicion_score,
                "current_mode": current_interview_mode,
                "exit_reason": "no_show_timeout",
                "events": proctoring_events,
                "contradiction_state": summarize_contradiction_state(_contradiction_state),
            }
            await persist_transcript(
                app_id,
                [],
                session_start_time,
                proctoring_data=proctoring_data,
                final_status="NO_SHOW",
            )
        except Exception as e:
            logger.error(f"[TRANSCRIPT] Failed to record NO_SHOW status: {e}")
        disconnect_event.set()
        try:
            await session.aclose()
        except Exception:
            pass
        return
    # PREWARM: Remove the wait for 'user_ready' signal. 
    # Greet the candidate as soon as they are physically in the room.
    if not disconnect_event.is_set():
        ready_signal_received_at = time.perf_counter()
        ready_event.set()
        logger.info(f"Pre-warming greeting for app {app_id} immediately after participant join")
    async def _warm_greeting_tts(plugin) -> None:
        warmup_method = getattr(plugin, "warmup", None)
        if callable(warmup_method):
            try:
                result = warmup_method()
                if asyncio.iscoroutine(result):
                    await result
                logger.info("[GREETING] TTS warmup completed before greeting")
            except Exception as e:
                logger.warning(f"[GREETING] TTS warmup failed before greeting: {e}")
    await _warm_greeting_tts(tts_plugin)
    if ready_event.is_set() and not disconnect_event.is_set():
        session_start_time = time.time()
        logger.info(
            "[SESSION_START] app_id=%s candidate=%s role=%s band=%s",
            app_id, candidate_name, job_title,
            getattr(session_context, "candidate_band", "unknown"),
        )
        ai_name = context.get("aiName") or "Ishita"
        welcome_text = build_phase_1_greeting_text(
            candidate_first_name or candidate_name,
            ai_name,
            job_title,
        )
        # Mark as started in DB while greeting starts immediately.
        spawn_background_task(mark_interview_started(app_id), "mark_interview_started")
        try:
            startup_latency_ms = int((time.perf_counter() - entry_started_at) * 1000)
            if ready_signal_received_at is not None:
                ready_to_greeting_ms = int(
                    (time.perf_counter() - ready_signal_received_at) * 1000
                )
                logger.info(
                    f"[GREETING] Starting welcome (boot={startup_latency_ms}ms, ready_to_greeting={ready_to_greeting_ms}ms)"
                )
            else:
                logger.info(
                    f"[GREETING] Starting welcome (boot={startup_latency_ms}ms)"
                )
            # Only deliver scripted welcome if the LLM hasn't already spoken
            # (prevents double-greeting when candidate says hello first)
            if llm_spoke_event.is_set():
                logger.info(
                    "[GREETING] LLM already responded to candidate - skipping scripted welcome to avoid double-greeting"
                )
                greeting_delivered_at = time.time()
            else:
                # Retry loop: Sarvam TTS WebSocket can fail on the very first
                # synthesis call if the connection was recycled during startup.
                # We retry up to 3 times with a short backoff before giving up.
                greeting_delivered = False
                for _attempt in range(3):
                    try:
                        # Small delay after AEC warmup to ensure clear start
                        await asyncio.sleep(0.5)
                        # allow_interruptions=False for greeting prevents 'break voice' from echo bleed
                        await session.say(welcome_text, allow_interruptions=False)
                        greeting_delivered = True
                        greeting_delivered_at = time.time()  # Mark when greeting completed
                        logger.info(
                            f"[GREETING] Welcome message delivered (attempt {_attempt + 1})"
                        )
                        break
                    except Exception as _tts_err:
                        err_str = str(_tts_err).lower()
                        is_transport_err = any(
                            pat in err_str
                            for pat in (
                                "closing transport",
                                "connection error",
                                "apiconnectionerror",
                                "send task failed",
                            )
                        )
                        if is_transport_err and _attempt < 2:
                            logger.warning(
                                f"[GREETING] TTS transport error on attempt {_attempt + 1}, "
                                f"retrying in 1s: {_tts_err}"
                            )
                            await asyncio.sleep(1.0)
                        else:
                            raise
                if not greeting_delivered:
                    logger.error("[GREETING] All TTS retry attempts failed for greeting")
        except Exception as e:
            logger.error(f"[GREETING] Failed to deliver greeting: {e}")
        finally:
            if greeting_delivered_at is None and not disconnect_event.is_set():
                # Fail open so the interview never deadlocks waiting on greeting state.
                greeting_delivered_at = time.time()
                logger.info("[GREETING] Greeting flow completed - STT unblocked")
    # CRITICAL: Start inactivity clock after greeting finishes (or is skipped).
    # session.say() is a scripted call - it does NOT fire agent_speech_committed, so the
    # normal "AI finished speaking" hook may not run for this scripted audio.
    reset_inactivity_clock(start_waiting=True)
    logger.debug("[NUDGE] Inactivity clock started after greeting delivery")
    # Wait for either explicit finish signal OR disconnect OR hard timeout,
    # while also firing timed mid-session nudges (candidate-questions prompt, final goodbye).
    finished_task = asyncio.create_task(interview_finished_event.wait())
    disconnected_task = asyncio.create_task(disconnect_event.wait())
    total_seconds = time_limit_mins * 60
    # Timed intervention flags
    candidate_questions_asked = False
    wrap_up_signal_sent = False
    # Fixed inactivity timing so the candidate always gets the same experience.
    # 50s silence -> warning, 60s silence -> end call.
    INACTIVITY_WARNING_SECS = 50
    INACTIVITY_END_SECS = 60
    CANDIDATE_Q_TRIGGER_SECS = max(10, min(120, int(total_seconds * 0.2)))
    FINAL_THANKS_TRIGGER_SECS = 10
    MIN_CANDIDATE_LINES_FOR_WRAPUP = 3
    inactivity_nudge_count = 0
    async def _deliver_nudge(text: str) -> None:
        await session.say(text, allow_interruptions=True)
        # Scripted speech doesn't fire agent_speech_committed, manually restart clock.
        # Preserve the warning flag so it doesn't fire again for this prompt.
        nonlocal awaiting_candidate_response, awaiting_candidate_since
        awaiting_candidate_response = True
        awaiting_candidate_since = time.monotonic()
    async def _send_termination_signal(reason: str):
        try:
            import json
            payload = json.dumps({"type": "interview_terminated", "reason": reason}).encode("utf-8")
            await ctx.room.local_participant.publish_data(payload, reliable=True)
            logger.info(f"[NUDGE] Sent termination signal to frontend (reason={reason})")
        except Exception as e:
            logger.warning(f"Failed to send termination signal: {e}")
    def _pick_nudge() -> str:
        """Return a context-aware inactivity nudge based on the type of question asked."""
        name = candidate_first_name or candidate_name
        q = (_last_interviewer_question or "").lower()
        # Technical/explanatory questions  -  candidate may need thinking time
        if any(w in q for w in ("how", "why", "explain", "walk me through", "describe", "what happened", "tell me about")):
            technical_nudges = [
                f"Take your time, {name}  -  I want to hear the full picture.",
                "No rush  -  think it through and share whenever you're ready.",
                "If it helps, start with a specific example and work from there.",
            ]
            return technical_nudges[inactivity_nudge_count % len(technical_nudges)]
        # Reflective questions  -  candidate may be searching for the right words
        if any(w in q for w in ("feel", "think", "would you", "looking back", "what would you", "in hindsight")):
            reflective_nudges = [
                "No rush  -  happy to wait while you think that through.",
                f"Take a moment, {name}. There is no right answer here.",
            ]
            return reflective_nudges[inactivity_nudge_count % len(reflective_nudges)]
        # Example / story requests  -  candidate may be picking which story to tell
        if any(w in q for w in ("example", "specific", "moment", "situation", "time when", "instance")):
            example_nudges = [
                "Pick whichever example comes to mind first  -  the specifics matter more than finding the perfect one.",
                f"You can also answer with just one concrete example if that is easier, {name}.",
            ]
            return example_nudges[inactivity_nudge_count % len(example_nudges)]
        # Generic fallback nudges
        generic_nudges = [
            f"If you're thinking aloud, feel free to keep going  -  that helps me follow your reasoning.",
            f"Just checking in, {name}  -  whenever you're ready.",
            "If you went quiet mid-thought, you can continue right from there.",
        ]
        return generic_nudges[inactivity_nudge_count % len(generic_nudges)]
    session_loop_start = time.monotonic()
    while True:
        elapsed = time.monotonic() - session_loop_start
        remaining = total_seconds - elapsed
        if finished_task.done() or disconnected_task.done():
            break
        if remaining <= 0:
            break
        # --- 2-3 min remaining: wrap-up / candidate questions nudge ---
        # Fire when close to the end. Tailor text based on how much the candidate said.
        candidate_line_count = sum(
            1 for line in transcript_lines if line.startswith("Candidate:")
        )
        if (
            not candidate_questions_asked
            and remaining <= CANDIDATE_Q_TRIGGER_SECS
        ):
            candidate_questions_asked = True
            if not wrap_up_signal_sent:
                wrap_up_signal_sent = True
                chat_ctx.add_message(
                    role="system",
                    content="[SYSTEM ALERT: TIME LOW] The interview is approaching the time limit. Please conclude the current topic and transition to closing. Do not start new technical questions."
                )
            if candidate_line_count >= MIN_CANDIDATE_LINES_FOR_WRAPUP:
                # Normal wrapup - we had a real conversation
                candidate_q_text = (
                    f"We are coming up on time, {candidate_first_name or candidate_name}. "
                    "Before we wrap up - is there anything you want to make sure you have said, "
                    "or anything you want to ask me about the role?"
                )
            else:
                # Short/thin session - do not pretend we covered a lot
                candidate_q_text = (
                    f"We are nearly at time, {candidate_first_name or candidate_name}. "
                    "Is there anything you would like to add, or anything you want to ask me?"
                )
            try:
                await session.say(candidate_q_text)
                logger.info(
                    f"[TIMING] Candidate-questions nudge delivered (candidate_lines={candidate_line_count})"
                )
            except Exception as e:
                logger.warning(
                    f"[TIMING] Failed to deliver candidate-questions nudge: {e}"
                )
        # --- Final 10 seconds: warm thank-you ---
        if remaining <= FINAL_THANKS_TRIGGER_SECS:
            break
        # --- Strict Inactivity Handling ---
        # Suppressed after wrap-up nudge to avoid piling on messages near end.
        # 1. 30s: Initial warm nudge
        # 2. 60s: Termination warning
        # 3. 70s: Final exit
        if candidate_questions_asked:
            await asyncio.sleep(1)
            continue
        inactivity_elapsed = (
            (time.monotonic() - awaiting_candidate_since)
            if awaiting_candidate_response and awaiting_candidate_since is not None
            else 0.0
        )
        # -- Stage 1: Warning --
        # Extra guard: don't fire if agent just finished speaking within last 5s
        # (covers the LLM "thinking/typing" window before TTS starts)
        agent_just_spoke = (
            awaiting_candidate_since is not None
            and (time.monotonic() - awaiting_candidate_since) < 5.0
        )
        if (
            not is_agent_speaking
            and not is_candidate_speaking
            and awaiting_candidate_response
            and not inactivity_nudge_sent_for_current_prompt
            and not agent_just_spoke
            and inactivity_elapsed >= INACTIVITY_WARNING_SECS
        ):
            try:
                warning_text = (
                    f"I haven't heard from you in a while, {candidate_first_name or candidate_name}. "
                    f"If you're still there, please say something, otherwise I will have to end the call in {INACTIVITY_END_SECS - INACTIVITY_WARNING_SECS} seconds."
                )
                spawn_background_task(_deliver_nudge(warning_text), "inactivity_warning")
                inactivity_nudge_sent_for_current_prompt = True
                logger.info(f"[NUDGE] {INACTIVITY_WARNING_SECS:.0f}s termination warning delivered")
            except Exception as e:
                logger.warning(f"[NUDGE] Failed to deliver warning: {e}")
        # -- Stage 2: Final Termination --
        if (
            not is_agent_speaking
            and not is_candidate_speaking
            and awaiting_candidate_response
            and inactivity_nudge_sent_for_current_prompt
            and inactivity_elapsed >= INACTIVITY_END_SECS
        ):
            logger.info(
                f"[NUDGE] Ending interview due to final inactivity timeout ({int(inactivity_elapsed)}s)"
            )
            await _send_termination_signal("inactivity_timeout")
            interview_marked_finished = True
            interview_finished_event.set()
            disconnect_event.set()
            break
        await asyncio.sleep(1)
    # Check if we exited because of finish/disconnect or because time ran out
    time_expired = not finished_task.done() and not disconnected_task.done()
    if time_expired:
        # Tailor the goodbye to how much content was actually exchanged.
        # Avoid "we covered a lot" if the candidate barely spoke.
        candidate_turns_final = sum(
            1 for line in transcript_lines if line.startswith("Candidate:")
        )
        if candidate_turns_final >= 4:
            goodbye_text = (
                f"That concludes our interview, {candidate_first_name or candidate_name}. "
                "Thank you for your time today. I -™m ending the session now, and I wish you all the best."
            )
        else:
            goodbye_text = (
                f"That concludes our interview, {candidate_first_name or candidate_name}. "
                "Thank you for joining today. I -™m ending the session now, and I wish you all the best."
            )
        try:
            await session.say(goodbye_text)
            await asyncio.sleep(3.0)  # wait for TTS to fully play before disconnecting
        except Exception:
            pass
        # FORCE DISCONNECT ROOM
        logger.info(f"Session hard-terminated due to time limit ({time_limit_mins}m)")
        await _send_termination_signal("time_expired")
        interview_marked_finished = True
        interview_finished_event.set()
        disconnect_event.set()
    # Cancel pending tasks
    for task in [finished_task, disconnected_task]:
        if not task.done():
            task.cancel()
    # --- Grace Period: Wait for final STT results to arrive (Deepgram/LiveKit tail) ---
    logger.info(
        f"Interview ended (finished={finished_task.done()}, time_expired={time_expired}). Waiting 2s for final transcripts..."
    )
    await asyncio.sleep(2)
    # âœ… Final definitive save - Phase 5 includes proctoring report + answer scores
    proctoring_data = {
        "role_category": session_context.role_category,
        "candidate_band": session_context.candidate_band,
        "total_turns": turn_count,
        "suspicion_score": suspicion_score,
        "environment_risk": environment_risk,
        "integrity_risk": integrity_risk,
        "depth_risk": depth_risk,
        "composite_risk": suspicion_score,
        "current_mode": current_interview_mode,
        "exit_reason": "time_expired" if time_expired else "interview_finished",
        "events": proctoring_events,
        "contradictions": _contradictions_found,
        "claim_index": _claim_index,
        "contradiction_state": summarize_contradiction_state(_contradiction_state),
    }
    # Finalize Trust Engine and build recruiter summary before persisting
    _trust_state = finalize_trust_state(_trust_state)
    recruiter_summary = build_recruiter_summary(
        trust_state=_trust_state,
        answer_scores=answer_scores,
        contradictions_found=_contradictions_found,
        total_turns=turn_count,
        candidate_name=candidate_name,
        job_title=job_title,
        contradiction_state=_contradiction_state,
        proctoring_profile=proctoring_data,
    )
    logger.info(
        f"[TRUST] final score={_trust_state['trust_score']} "
        f"integrity={_trust_state['integrity_band']} "
        f"quality={_trust_state['quality_band']} "
        f"trend={_trust_state['trend']} "
        f"recommendation={recruiter_summary['recommendation']}"
    )
    await persist_transcript(
        app_id,
        transcript_lines,
        session_start_time,
        proctoring_data=proctoring_data,
        final_status="COMPLETED",
        recruiter_summary=recruiter_summary,
    )
    # Save answer quality scores
    await persist_answer_scores(app_id, answer_scores)
    selected_tts_model = (
        str(org_google_model or DEFAULT_GOOGLE_TTS_MODEL)
        if org_tts_provider == "GOOGLE"
        else org_sarvam_model
        if org_tts_provider == "SARVAM"
        else org_cartesia_model
    )
    selected_stt_model = (
        str(org_google_model or DEFAULT_GOOGLE_TTS_MODEL)
        if org_tts_provider == "GOOGLE"
        else org_sarvam_stt_model if org_stt_provider == "SARVAM" else org_deepgram_model
    )
    await persist_org_usage_metrics(
        org_id,
        latest_session_usage or session.usage,
        tts_provider=org_tts_provider,
        tts_model=selected_tts_model,
        stt_provider=org_stt_provider,
        stt_model=selected_stt_model,
    )
    await flush_pending_manual_billing(org_id)
    # ðŸ¤- AI Scorecard (NEW)
    if session_start_time:
        try:
            await asyncio.wait_for(
                generate_interview_summary(
                    app_id,
                    transcript_lines,
                    job_title,
                    org_id=org_id,
                    llm_model=analysis_model,
                ),
                timeout=8,
            )
        except asyncio.TimeoutError:
            logger.warning(f"[SUMMARY] Timed out for {app_id}; skipped after 8s")
        except Exception as e:
            logger.error(f"[SUMMARY] Failed post-interview for {app_id}: {e}")
        # Generate structured interview report (scores, skills, strengths)
        try:
            await asyncio.wait_for(
                generate_interview_report(
                    app_id,
                    transcript_lines,
                    answer_scores,
                    job_title,
                    proctoring_data={
                        "role_category": session_context.role_category,
                        "candidate_band": session_context.candidate_band,
                        "suspicion_score": suspicion_score,
                        "current_mode": current_interview_mode,
                        "events": proctoring_events,
                        "contradictions": _contradictions_found,
                        "claim_index": _claim_index,
                        "contradiction_state": _contradiction_state,
                    },
                    org_id=org_id,
                    llm_model=analysis_model,
                ),
                timeout=10,
            )
        except asyncio.TimeoutError:
            logger.warning(f"[REPORT] Timed out for {app_id}; skipped after 10s")
        except Exception as e:
            logger.error(f"[REPORT] Failed post-interview for {app_id}: {e}")
    # Sync with dashboard: Application COMPLETED
    if finished_task.done():
        await update_interview_status(app_id)
        # âš¡ Trigger Pinecone Sync immediately
        await notify_sync_engine(app_id)
    # Cancel any leftover fire-and-forget work so job teardown is instant.
    if background_tasks:
        logger.debug(f"[SHUTDOWN] Cancelling {len(background_tasks)} background task(s)")
        for bg_task in list(background_tasks):
            if not bg_task.done():
                bg_task.cancel()
        await asyncio.gather(*list(background_tasks), return_exceptions=True)
        background_tasks.clear()
    # Allow session to close
    logger.info("Final save complete. Closing job process.")
    try:
        session.shutdown(drain=True)
    except Exception:
        try:
            session.shutdown(drain=False)
        except Exception:
            pass
if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            agent_name=AGENT_NAME,
            num_idle_processes=max(1, int(os.getenv("LIVEKIT_IDLE_PROCESSES", "8"))),
        )
    )

