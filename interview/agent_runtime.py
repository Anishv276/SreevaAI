import sys
import asyncio
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
import json
import time
import asyncpg
from typing import Optional, Any
import re
from openai import AsyncOpenAI
try:
    import redis.asyncio as redis_asyncio  # type: ignore[import-untyped]
except Exception:  # pragma: no cover - optional dependency
    redis_asyncio = None
from interview.agent_utils import (
    _coerce_jsonish,
    _compact_optional,
    parse_dispatch_metadata,
)
from interview.agent_profile_context import (
    CandidateBandContext,
    build_merged_interview_brief,
    build_stage_seeds,
    build_resume_brief,
    first_name_from_full_name,
    infer_candidate_band,
    parse_resume_context,
    refresh_candidate_band_context,
)
from interview.interview_phases import (
    STAGE_CONFIGS,
    build_greeting_text,
    build_warmup_directive,
    build_stage_1_resume_directive,
    build_stage_2_skill_directive,
    build_stage_3_situational_directive,
    build_stage_4_behavioral_directive,
)
from interview.agent_providers import (
    build_cartesia_tts,
    build_elevenlabs_tts,
    build_llm,
    build_sarvam_tts,
    build_stt,
    build_vad,
)
from interview.agent_persistence import (
    _create_db_pool,
)
from interview.agent_runtime_helpers import (
    _build_recent_context_block,
    _sanitize_claim_value,
    _single_question_transform,
    _tts_acronym_transform,
    remove_system_messages,
    sanitize_candidate_facing_text,
)
from interview.agent_runtime_support import (
    DEFAULT_VOICE_ID,
    LLM_MODEL,
    VOICE_REGISTRY,
    FIXED_INTERVIEW_DURATION_MINUTES,
    REDIS_URL,
    STT_MODEL,
    _DB_POOL_INIT_TASK,
    compose_risk_score,
    logger,
    reset_log_context,
    set_log_context,
)
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    JobProcess,
    TurnHandlingOptions,
    llm,
)
from livekit.agents.metrics import AgentSessionUsage
from livekit.agents.voice import room_io
from livekit.agents.voice.turn import EndpointingOptions, InterruptionOptions
from interview.turn_evaluator import run_turn_evaluation
from interview.trust_engine import apply_turn_decision, apply_contradiction_resolved, finalize_trust_state
from interview.contradiction_state import init_contradiction_state, advance_contradiction_state, summarize_contradiction_state
from interview.session_state import init_trust_state
from interview.recruiter_summary import build_recruiter_summary
from interview.prompt_layers import (
    build_voice_layer_prompt,
    build_evaluation_layer_prompt,
    build_system_prompt,
)
from interview.turn_decision import classify_short_utterance
from interview.probe_strategy import build_short_utterance_directive

_LOCAL_STAGE_DIRECTIVE_CACHE: dict[str, dict[str, str]] = {}

GREETING_FIXED_SECONDS = 60
WARMUP_FIXED_SECONDS = 120
NO_NEW_QUESTION_CUTOFF_SECONDS = 15
# Stage time split out of the ~17 min available after greeting + warmup:
# Resume 25% (~4.5 min), Skill 30% (~5 min), Situational 25% (~4.5 min), Behavioral 20% (~3.5 min)
BEHAVIORAL_RESERVED_SECONDS = 210   # 3.5 min — real behavioral stage, not just a 15s guard
STAGE_PERCENT_SPLIT: dict[str, float] = {
    "skill": 0.30,
    "situational": 0.25,
}


class InterviewAgent(Agent):
    async def tts_node(self, text, model_settings):
        # Buffer the entire text stream into one string before sending to TTS.
        # All TTS engines (Sarvam, Cartesia, Google) split text into sentence
        # chunks internally. The first word of each chunk has no phoneme context,
        # causing consonant-cluster words (build, through, quite, strength) to be
        # synthesized letter-by-letter. Sending one complete string gives the TTS
        # engine full context for every word.
        full_text = ""
        async for chunk in text:
            full_text += chunk

        if not full_text.strip():
            return

        activity = self._get_activity_or_raise()
        tts_engine = activity.tts
        if tts_engine is None:
            return

        conn_options = activity.session.conn_options.tts_conn_options

        if tts_engine.capabilities.streaming:
            async with tts_engine.stream(conn_options=conn_options) as stream:
                stream.push_text(full_text)
                stream.end_input()
                async for ev in stream:
                    yield ev.frame
        else:
            async with tts_engine.synthesize(full_text, conn_options=conn_options) as stream:
                async for ev in stream:
                    yield ev.frame


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
        proc.userdata["default_tts"] = build_cartesia_tts()
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
from interview.agent_persistence import (
    checkpoint_ai_signals,
    flush_pending_manual_billing,
    generate_interview_report,
    generate_interview_summary,
    get_interview_context,
    mark_interview_started,
    persist_answer_scores,
    persist_interview_billing_snapshot,
    persist_org_usage_metrics,
    persist_transcript,
    update_interview_status,
)
from interview.agent_scoring import (
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
        from interview.agent_runtime_helpers import append_transcript_line as _atl
        elapsed = int(max(0, time.time() - session_start_time)) if session_start_time else 0
        _atl(transcript_lines, f"{speaker}[{elapsed}]", text)
    # Room name is available before connecting - derive app_id early so we can
    # fire the DB fetch in parallel with the room connect handshake.
    app_id = ctx.room.name.replace("interview_", "")
    dispatch_metadata = parse_dispatch_metadata(getattr(ctx.job, "metadata", ""))
    session_log_context: dict[str, Any] = {
        "session_id": app_id,
        "app_id": app_id,
        "room_name": ctx.room.name,
    }
    redis_client = None
    stage_cache_key = f"interview:{app_id}:stage_directives"

    async def _init_redis_client() -> None:
        nonlocal redis_client
        if redis_client is not None:
            return
        if not REDIS_URL or redis_asyncio is None:
            return
        try:
            redis_client = redis_asyncio.from_url(REDIS_URL, decode_responses=True)
            await redis_client.ping()
        except Exception as e:
            redis_client = None
            logger.warning(f"[STAGE_CACHE] Redis unavailable, using in-memory cache: {e}")

    async def _cache_stage_directive(stage_key: str, content: str) -> None:
        if not content:
            return
        try:
            if redis_client is not None:
                await redis_client.hset(stage_cache_key, stage_key, content)
                await redis_client.expire(stage_cache_key, max(900, int(time_limit_mins * 120)))

                return
        except Exception as e:
            logger.warning(f"[STAGE_CACHE] Redis write failed for {stage_key}: {e}")
        _LOCAL_STAGE_DIRECTIVE_CACHE.setdefault(app_id, {})[stage_key] = content


    async def _read_stage_directive(stage_key: str) -> Optional[str]:
        try:
            if redis_client is not None:
                cached = await redis_client.hget(stage_cache_key, stage_key)
                if cached:
                    return str(cached)
        except Exception as e:
            logger.warning(f"[STAGE_CACHE] Redis read failed for {stage_key}: {e}")
        local_cached = _LOCAL_STAGE_DIRECTIVE_CACHE.get(app_id, {}).get(stage_key)

        return local_cached
    if dispatch_metadata:
        session_log_context.update({
            "dispatch_application_id": dispatch_metadata.get("applicationId", app_id),
            "dispatch_candidate_name": dispatch_metadata.get("candidateName"),
            "dispatch_role_label": dispatch_metadata.get("roleLabel"),
            "dispatch_time_limit_mins": dispatch_metadata.get("timeLimitMins"),
            "dispatch_room_name": dispatch_metadata.get("roomName", ctx.room.name),
        })
    ctx.log_context_fields = session_log_context
    log_context_token = set_log_context(session_log_context)
    logger.info(
        "[SESSION] interview context loaded",
        extra={
            "emit_full_context": True,
            "event": "session_start",
        },
    )
    # Proctoring helpers are provided by agent_runtime_helpers and called with explicit
    # app_id / ctx arguments where needed. The local closures that were here had zero
    # call sites and have been removed.
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
    extracted_details = _coerce_jsonish(context.get("extractedDetails") or "{}")
    structured_resume = _coerce_jsonish(context.get("resumeData") or "{}")
    _raw_interview_questions = context.get("interviewQuestions")
    _interview_questions: list = []
    if _raw_interview_questions:
        try:
            _parsed = json.loads(_raw_interview_questions) if isinstance(_raw_interview_questions, str) else _raw_interview_questions
            _interview_questions = _parsed if isinstance(_parsed, list) else []
        except Exception:
            _interview_questions = []
    logger.info("[1/6] RESUME FETCH — resumeData present=%s keys=%s",
        bool(structured_resume),
        list(structured_resume.keys()) if isinstance(structured_resume, dict) else "empty",
    )
    logger.info("[2/6] JD FETCH — extractedDetails present=%s keys=%s",
        bool(extracted_details),
        list(extracted_details.keys()) if isinstance(extracted_details, dict) else "empty",
    )
    if _interview_questions:
        logger.info("[2.5/6] CUSTOM QUESTIONS — count=%d questions=%s",
            len(_interview_questions),
            [str(q)[:120] for q in _interview_questions],
        )
    else:
        logger.info("[2.5/6] CUSTOM QUESTIONS — none configured for this drive")
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

    interview_lang = require_db_value("language")
    time_limit_mins = FIXED_INTERVIEW_DURATION_MINUTES
    # Keep follow-up loops tight so stage transitions happen reliably.
    follow_up_depth = 2
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
    # Stage budgets are initialized once and then dynamically rebalanced after each stage.
    _initialize_stage_budgets_called = False
    started_at = time.perf_counter()
    async def _log_shutdown(_reason: str = "") -> None:
        elapsed_sec = round(time.perf_counter() - started_at, 1)
        try:
            logger.info("[SESSION] shutdown — elapsed=%ss", elapsed_sec)
        finally:
            reset_log_context(log_context_token)
    ctx.add_shutdown_callback(_log_shutdown)
    # Org-specific model settings.
    # Resolve voice → provider + model from registry.
    voice_id = str(require_db_value("voiceId", default=DEFAULT_VOICE_ID, required=False) or DEFAULT_VOICE_ID)
    voice_entry = VOICE_REGISTRY.get(voice_id)
    if voice_entry:
        org_tts_provider = voice_entry["provider"]
        org_tts_model = voice_entry["model"]
    else:
        db_provider = str(context.get("voiceProvider") or "").strip().upper()
        db_model = str(context.get("voiceModel") or "").strip()
        if db_provider in {"CARTESIA", "SARVAM", "ELEVENLABS"}:
            org_tts_provider = db_provider
            if db_model:
                org_tts_model = db_model
            elif db_provider == "SARVAM":
                org_tts_model = "bulbul:v3"
            elif db_provider == "ELEVENLABS":
                org_tts_model = "eleven_turbo_v2_5"
            else:
                org_tts_model = "cartesia/sonic-3"
        else:
            fallback_voice = VOICE_REGISTRY[DEFAULT_VOICE_ID]
            org_tts_provider = fallback_voice["provider"]
            org_tts_model = fallback_voice["model"]
    org_deepgram_model: str = str(require_db_value("deepgramModel", default=STT_MODEL, required=False) or STT_MODEL)
    org_llm_model: str = str(require_db_value("llmModel", default=LLM_MODEL, required=False) or LLM_MODEL)
    org_llm_temperature: float = float(require_db_value("llmTemperature", default=0.7, required=False) or 0.7)
    analysis_client = AsyncOpenAI()
    analysis_model = org_llm_model

    # Language Mapping for STT and TTS
    LANGUAGE_MAPPING = {
        "English": {"stt": "en-US", "tts": "en"},
        "Hindi": {"stt": "hi", "tts": "hi"},
    }
    lang_codes = LANGUAGE_MAPPING.get(interview_lang)
    if not lang_codes:
        raise RuntimeError(f"Unsupported interview language in DB: {interview_lang}")

    resume_context = parse_resume_context(
        structured_resume,
        "",
    )
    candidate_band = infer_candidate_band(resume_context, "")
    logger.info("[3/6] BAND CHECKED — band=%s", candidate_band)
    resume_brief = build_resume_brief(candidate_band, resume_context)
    base_coverage_items = [
        *[str(s).strip() for s in resume_context.skills[:6] if str(s).strip()],
        *[str(p).strip() for p in resume_context.projects[:4] if str(p).strip()],
        *[str(w).strip() for w in resume_context.work_history[:3] if str(w).strip()],
    ]
    # Keep deterministic order while de-duplicating.
    base_coverage_items = list(dict.fromkeys(base_coverage_items))
    session_context = CandidateBandContext(
        candidate_band=candidate_band,
        resume_brief=resume_brief,
        coverage_items=base_coverage_items,
        depth_instruction=(
            "Balance breadth and depth. Two follow-ups per key topic. Probe for reasoning but stay warm."
        ),
    )
    session_context.merged_brief_block = build_merged_interview_brief(
        candidate_name=candidate_first_name or candidate_name,
        job_title=job_title,
        candidate_band=candidate_band,
        resume_context=resume_context,
        jd_details=extracted_details,
        resume_brief=resume_brief,
        custom_questions=_interview_questions or None,
    )
    refresh_candidate_band_context(session_context)
    logger.info(
        "[4/6] BRIEF CREATED — band=%s anchor=%s anchor_type=%s skills=%s projects=%d work=%d",
        session_context.candidate_band,
        str(session_context.resume_brief.anchor_item or "NOT STATED")[:80],
        session_context.resume_brief.anchor_type or "none",
        session_context.resume_brief.skills[:4],
        len(session_context.resume_brief.projects),
        len(session_context.resume_brief.work_history or session_context.resume_brief.internships),
    )
    logger.info("[4/6] MERGED BRIEF —\n%s", session_context.merged_brief_block or "(empty)")
    await _init_redis_client()
    stage1_directive_cached = build_stage_1_resume_directive(
        band=session_context.candidate_band,
        resume_brief=session_context.resume_brief,
        custom_questions=_interview_questions or None,
    )
    # Stages 2-4 are built dynamically at injection time so they reflect what was
    # actually covered in prior stages. Only stage 1 is cached — it has no prior context.
    await _cache_stage_directive("stage1", stage1_directive_cached)
    logger.info("[5/6] STAGE 1 CACHED — %dbytes", len(stage1_directive_cached))
    logger.info("[STAGE 1 CONTENT]\n%s", stage1_directive_cached)
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
    )
    system_prompt = build_system_prompt(
        voice_layer_prompt=voice_layer_prompt,
        evaluation_layer_prompt=evaluation_layer_prompt,
    )
    chat_ctx = llm.ChatContext()
    chat_ctx.add_message(role="system", content=system_prompt)
    warmup_directive = build_warmup_directive()
    chat_ctx.add_message(role="system", content=warmup_directive)
    logger.info("[6/6] WARMUP INJECTED — stage 1 fires after 1 candidate response")
    ctx.proc.userdata["candidate_band_context"] = session_context

    vad_instance = ctx.proc.userdata.get("vad") or build_vad()
    stt_plugin = build_stt(language_code=lang_codes["stt"], model=org_deepgram_model)
    if org_tts_provider == "SARVAM":
        logger.info(f"[TTS] Using Sarvam — voice={voice_id} model={org_tts_model}")
        tts_plugin = build_sarvam_tts(
            language=lang_codes["tts"],
            model=org_tts_model,
            voice_id=voice_id,
        )
    elif org_tts_provider == "ELEVENLABS":
        logger.info(f"[TTS] Using ElevenLabs — voice={voice_id} model={org_tts_model}")
        tts_plugin = build_elevenlabs_tts(
            language=lang_codes["tts"],
            model=org_tts_model,
            voice_id=voice_id,
        )
    else:
        logger.info(f"[TTS] Using Cartesia — voice={voice_id} model={org_tts_model}")
        tts_plugin = build_cartesia_tts(
            language=lang_codes["tts"],
            model=org_tts_model,
            voice_id=voice_id,
        )
    llm_plugin = build_llm(model=org_llm_model, temperature=org_llm_temperature)
    turn_detector = ctx.proc.userdata.get("turn_detector")
    session_kwargs = {
        "vad": vad_instance,
        "stt": stt_plugin,
        "llm": llm_plugin,
        "tts": tts_plugin,
        "turn_handling": TurnHandlingOptions(
            turn_detection=turn_detector,
            endpointing=EndpointingOptions(
                min_delay=1.5,
                max_delay=3.0,
                mode="dynamic",
            ),
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
        "tts_text_transforms": [
            "filter_emoji",
            _tts_acronym_transform,
            _single_question_transform,
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
    agent = InterviewAgent(instructions=system_prompt, chat_ctx=chat_ctx)
    participant: Optional[Any] = None
    disconnect_event = asyncio.Event()
    interview_finished_event = asyncio.Event()
    interview_marked_finished = False
    turn_count = 0           # counts assistant turns for state injection cadence
    last_injection_turn = 0  # tracks which turn last received a state injection
    warmup_responses_received = 0  # counts candidate responses; warmup ends after 1
    warmup_complete = False  # True after the 1st candidate response
    # Stage interview tracker
    _current_stage_index: int = 0        # 0=Resume 1=Skill 2=Situational 3=Behavioral
    _stage_start_time: float = 0.0       # monotonic timestamp when current stage started
    _stage_bridge_pending: bool = False  # True when bridge directive has been injected
    _stage_budgets_secs: dict[int, int] = {}
    _final_no_new_question_guard = False
    _candidate_turn_since_last_assistant = True
    _consecutive_low_signal_move_on = 0
    _stage_transition_events: list[dict[str, Any]] = []
    environment_risk = 0     # browser-side proctoring signals
    integrity_risk = 0       # integrity-related proctoring signals
    depth_risk = 0           # surface answers / compression failures
    suspicion_score = 0      # composite risk score used only for mode switching
    current_interview_mode = "normal"  # normal / pressure / verification / deep
    proctoring_events: list = []       # timeline of risk signals for final report
    # Note: browser-side proctoring (face, tab, hardware) is recorded directly
    # to the DB via /api/interview/proctoring. The agent does NOT process these
    # signals — only behavioral/intelligence signals influence the agent.
    ready_event = asyncio.Event()
    ready_signal_received_at: Optional[float] = None
    # Per-turn decision engine state
    _last_interviewer_question = ""   # most recent question Ishita asked
    _topic_follow_up_count = 0        # consecutive follow-ups on same topic
    _oai_eval_client = analysis_client  # reused client for per-turn evaluations
    answer_scores: list[dict] = []    # log of all answer quality scores for final DB save
    _topic_depth_history: list[float] = []  # depth scores per answer on current topic (reset on MOVE_ON)
    _last_action_was_move_on: bool = False  # True after AI pivoted to new topic; resets follow-up counter next turn
    _collapse_stage: int = 0               # 0=none, 1=first probe issued, 2+=repeated collapse (hard flag)
    _last_depth_decay_turn: int = -999     # turn number when depth_decay last fired; -999 = never
    _depth_decay_ever_fired: bool = False  # True once depth_decay has fired at least once
    _question_asked_at: float = 0.0        # perf_counter() when Ishita finished speaking
    _answer_received_at: float = 0.0       # perf_counter() when candidate answer arrived
    _trust_state = init_trust_state()  # session-level trust engine state
    _contradiction_state = init_contradiction_state()  # explicit contradiction lifecycle state
    _active_eval_task: Optional[asyncio.Task[Any]] = None  # track active eval to prevent stale injects
    # Running log of topics already covered — injected into every directive so the AI
    # never re-explores something already discussed, across all stages.
    _discussed_log: list[str] = []
    # Cross-turn consistency engine state
    _claim_index: dict[str, list[dict]] = {}  # claims indexed by type for contradiction checks
    _contradictions_found: list[dict] = [] # all detected contradictions for final report
    _ai_signal_flush_counter: int = 0       # counts new AI signal events since last checkpoint
    _ai_signal_flushed_count: int = 0       # total events already flushed (slice pointer)
    # Lock protecting all shared session state that is written by background tasks.
    _session_state_lock = asyncio.Lock()
    def refresh_composite_risk() -> int:
        nonlocal suspicion_score
        suspicion_score = compose_risk_score(integrity_risk, depth_risk)
        return suspicion_score
    def _stage_index_by_name(name: str) -> Optional[int]:
        target = (name or "").strip().lower()
        for cfg in STAGE_CONFIGS:
            if cfg.name == target:
                return cfg.index
        return None
    _resume_stage_idx = _stage_index_by_name("resume")
    _skill_stage_idx = _stage_index_by_name("skill")
    _situational_stage_idx = _stage_index_by_name("situational")
    _behavioral_stage_idx = _stage_index_by_name("behavioral")
    _percent_stage_indices = [
        idx for idx in (
            _skill_stage_idx,
            _situational_stage_idx,
        )
        if idx is not None
    ]
    _stage_weight_by_index = {
        _skill_stage_idx: STAGE_PERCENT_SPLIT["skill"],
        _situational_stage_idx: STAGE_PERCENT_SPLIT["situational"],
    }
    def _allocate_stage_budgets(remaining_seconds: float, stage_indices: list[int]) -> dict[int, int]:
        if remaining_seconds <= 0 or not stage_indices:
            return {idx: 0 for idx in stage_indices}
        total_weight = sum(float(_stage_weight_by_index.get(idx, 0.0)) for idx in stage_indices)
        if total_weight <= 0:
            equal_share = max(0, int(remaining_seconds // len(stage_indices)))
            return {idx: equal_share for idx in stage_indices}
        budgets: dict[int, int] = {}
        assigned = 0
        for pos, idx in enumerate(stage_indices):
            weight = float(_stage_weight_by_index.get(idx, 0.0))
            if pos == len(stage_indices) - 1:
                budget = max(0, int(round(remaining_seconds - assigned)))
            else:
                budget = max(0, int(round(remaining_seconds * (weight / total_weight))))
                assigned += budget
            budgets[idx] = budget
        return budgets
    def _remaining_total_seconds_now() -> float:
        if session_start_time is None:
            return float(time_limit_mins * 60)
        elapsed = max(0.0, time.time() - session_start_time)
        return max(0.0, float(time_limit_mins * 60) - elapsed)
    def _initialize_stage_budgets() -> None:
        nonlocal _stage_budgets_secs
        total_seconds_local = float(time_limit_mins * 60)
        distributed_seconds = max(
            0.0,
            total_seconds_local - GREETING_FIXED_SECONDS - WARMUP_FIXED_SECONDS,
        )
        logger.info(
            "┌─ STAGE BUDGET INIT ─────────────────────────────────────────\n"
            "│  total=%ds  greeting=%ds  warmup=%ds  available_for_stages=%ds",
            int(total_seconds_local), GREETING_FIXED_SECONDS, WARMUP_FIXED_SECONDS, int(distributed_seconds),
        )
        _stage_budgets_secs = {cfg.index: 0 for cfg in STAGE_CONFIGS}
        remaining_for_stages = float(distributed_seconds)
        resume_budget_seconds = 0
        if _resume_stage_idx is not None:
            # Cap resume at 240s (4 min) to leave room for stages 3+4
            if remaining_for_stages >= 240:
                resume_budget_seconds = 240
            else:
                resume_budget_seconds = int(max(0.0, remaining_for_stages))
            _stage_budgets_secs[_resume_stage_idx] = resume_budget_seconds
            remaining_for_stages = max(0.0, remaining_for_stages - resume_budget_seconds)
            logger.info("│  Stage 1 Resume:      %ds (%dm)", resume_budget_seconds, resume_budget_seconds // 60)

        skill_budget_seconds = 0
        if _skill_stage_idx is not None:
            # Cap skill at 240s (4 min) to leave room for stages 3+4
            if remaining_for_stages >= 240:
                skill_budget_seconds = 240
            else:
                skill_budget_seconds = int(max(0.0, remaining_for_stages))
            _stage_budgets_secs[_skill_stage_idx] = skill_budget_seconds
            remaining_for_stages = max(0.0, remaining_for_stages - skill_budget_seconds)
            logger.info("│  Stage 2 Skill:       %ds (%dm)", skill_budget_seconds, skill_budget_seconds // 60)

        situational_budget_seconds = 0
        if _situational_stage_idx is not None:
            # Cap situational at 270s (4.5 min), leave BEHAVIORAL_RESERVED_SECONDS for behavioral
            available_for_situational = max(0.0, remaining_for_stages - BEHAVIORAL_RESERVED_SECONDS)
            if available_for_situational >= 270:
                situational_budget_seconds = 270
            else:
                situational_budget_seconds = int(available_for_situational)
            _stage_budgets_secs[_situational_stage_idx] = situational_budget_seconds
            remaining_for_stages = max(0.0, remaining_for_stages - situational_budget_seconds)
            logger.info("│  Stage 3 Situational: %ds (%dm)", situational_budget_seconds, situational_budget_seconds // 60)

        if _behavioral_stage_idx is not None:
            behavioral_budget = min(BEHAVIORAL_RESERVED_SECONDS, int(max(0.0, remaining_for_stages)))
            _stage_budgets_secs[_behavioral_stage_idx] = behavioral_budget
            logger.info("│  Stage 4 Behavioral:  %ds (%dm)", behavioral_budget, behavioral_budget // 60)

        stage_starts_at = GREETING_FIXED_SECONDS + WARMUP_FIXED_SECONDS
        logger.info(
            "│  Expected timeline: Greeting 0:00 → Warmup 1:00 → Stage1 3:00 → "
            "Stage2 %d:00 → Stage3 %d:00 → Stage4 %d:00\n"
            "└─────────────────────────────────────────────────────────────",
            (stage_starts_at + resume_budget_seconds) // 60,
            (stage_starts_at + resume_budget_seconds + skill_budget_seconds) // 60,
            (stage_starts_at + resume_budget_seconds + skill_budget_seconds + situational_budget_seconds) // 60,
        )

    def _rebalance_remaining_stage_budgets() -> None:
        nonlocal _stage_budgets_secs
        remaining_seconds = _remaining_total_seconds_now()
        remaining_indices = [
            idx
            for idx in _percent_stage_indices
            if idx > _current_stage_index and idx != _behavioral_stage_idx
        ]
        if not remaining_indices:
            return
        rebalanced = _allocate_stage_budgets(remaining_seconds, remaining_indices)
        for idx, secs in rebalanced.items():
            _stage_budgets_secs[idx] = secs

    def _build_stage_directive_by_index(stage_idx: int) -> Optional[str]:
        # All stages built fresh at injection time — read actual transcript
        # to know what was covered in prior stages so nothing repeats.
        rb = session_context.resume_brief

        # Collect every word Ishita and the candidate said (lowercased for matching)
        all_transcript_text = " ".join(
            l.split(":", 1)[-1].strip().lower()
            for l in transcript_lines
        )

        def _covered_keywords(sources: list[str]) -> list[str]:
            # Match on first meaningful word chunk of each item (before " - ")
            # Also try individual words for short skill names like "n8n", "python"
            found = []
            for item in sources:
                short = str(item).split(" - ")[0].strip()
                kw = short.lower()
                if not kw:
                    continue
                # Match if the keyword appears as a whole word in transcript
                import re as _re
                pattern = _re.compile(r'\b' + _re.escape(kw) + r'\b')
                if pattern.search(all_transcript_text):
                    found.append(short)
            return found

        def _get_list(attr: str) -> list[str]:
            if isinstance(rb, dict):
                return list(rb.get(attr, []) or [])
            return list(getattr(rb, attr, None) or [])

        all_skills = _get_list("skills")
        all_projects = _get_list("projects")
        all_work = _get_list("work_history")

        # Build fresh stage seeds at injection time so they reflect actual coverage
        def _fresh_seeds() -> str:
            covered_so_far = _covered_keywords(all_projects + all_work)
            return build_stage_seeds(
                candidate_name=candidate_first_name or candidate_name,
                job_title=job_title,
                candidate_band=session_context.candidate_band,
                resume_context=resume_context,
                jd_details=extracted_details,
                covered_topics=covered_so_far,
            )

        if stage_idx == 1:
            covered_in_s1 = _covered_keywords(all_skills + all_projects)
            logger.info(
                "[STAGE 2 BUILD] covered_in_stage1=%s | fresh_skills will be derived",
                covered_in_s1,
            )
            return build_stage_2_skill_directive(
                band=session_context.candidate_band,
                resume_brief=rb,
                context_brief=session_context.merged_brief_block,
                covered_in_stage1=covered_in_s1,
                custom_questions=_interview_questions or None,
            )

        if stage_idx == 2:
            all_covered = _covered_keywords(all_skills + all_projects + all_work)
            seeds = _fresh_seeds()
            logger.info(
                "[STAGE 3 BUILD] covered_so_far=%s",
                all_covered,
            )
            return build_stage_3_situational_directive(
                band=session_context.candidate_band,
                context_brief=seeds,
                covered_topics=all_covered,
                custom_questions=_interview_questions or None,
            )

        if stage_idx == 3:
            all_covered = _covered_keywords(all_skills + all_projects + all_work)
            seeds = _fresh_seeds()
            logger.info(
                "[STAGE 4 BUILD] covered_so_far=%s",
                all_covered,
            )
            return build_stage_4_behavioral_directive(
                band=session_context.candidate_band,
                context_brief=seeds,
                covered_topics=all_covered,
                custom_questions=_interview_questions or None,
            )

        return None
    def _topics_for_stage(stage_idx: int) -> list[str]:
        stage_name = ""
        if 0 <= stage_idx < len(STAGE_CONFIGS):
            stage_name = STAGE_CONFIGS[stage_idx].name
        rb = session_context.resume_brief if isinstance(session_context.resume_brief, dict) else {}
        topics: list[str] = []
        if stage_name == "resume":
            for key in ("projects", "work_history", "internships", "education", "anchor_item"):
                raw = rb.get(key)
                if isinstance(raw, list):
                    topics.extend(str(v).strip() for v in raw if str(v).strip())
                elif raw:
                    topics.append(str(raw).strip())
        elif stage_name == "skill":
            raw = rb.get("skills")
            if isinstance(raw, list):
                topics.extend(str(v).strip() for v in raw if str(v).strip())
        elif stage_name == "situational":
            for line in (session_context.merged_brief_block or "").splitlines():
                line = line.strip()
                if line.startswith("JD must-haves:") or line.startswith("Key projects/work:"):
                    rhs = line.split(":", 1)[1].strip() if ":" in line else ""
                    if rhs:
                        topics.extend([part.strip() for part in rhs.split(",") if part.strip()])
        elif stage_name == "behavioral":
            for line in (session_context.merged_brief_block or "").splitlines():
                line = line.strip()
                if line.startswith("Screening strengths:") or line.startswith("Screening gaps:"):
                    rhs = line.split(":", 1)[1].strip() if ":" in line else ""
                    if rhs:
                        topics.extend([part.strip() for part in rhs.split(",") if part.strip()])
        if not topics:
            topics = list(session_context.coverage_items)
        return list(dict.fromkeys([t for t in topics if t]))[:6]
    def _advance_stage(reason: str, now_mono: float) -> bool:
        nonlocal _current_stage_index, _stage_start_time, _stage_bridge_pending
        stage_budget = max(0, int(_stage_budgets_secs.get(_current_stage_index, 0)))
        time_in_stage = max(0.0, now_mono - _stage_start_time)

        # Guard checks — log each one so we know exactly why advance was blocked
        if not warmup_complete:
            logger.info("[STAGE_ADVANCE] ✗ BLOCKED — warmup not complete (reason=%s)", reason)
            return False
        if _current_stage_index >= len(STAGE_CONFIGS) - 1:
            logger.info("[STAGE_ADVANCE] ✗ BLOCKED — already at last stage %d (reason=%s)", _current_stage_index + 1, reason)
            return False
        if _stage_start_time <= 0:
            logger.info("[STAGE_ADVANCE] ✗ BLOCKED — stage start time not set (reason=%s)", reason)
            return False
        if _stage_bridge_pending:
            logger.info("[STAGE_ADVANCE] ✗ BLOCKED — bridge already pending, skipping duplicate advance (reason=%s)", reason)
            return False

        _stage_bridge_pending = True
        next_stage_index = _current_stage_index + 1
        remaining_now = _remaining_total_seconds_now()

        if (
            _behavioral_stage_idx is not None
            and next_stage_index == _behavioral_stage_idx
            and remaining_now <= NO_NEW_QUESTION_CUTOFF_SECONDS
        ):
            logger.info(
                "[STAGE_ADVANCE] ✗ BLOCKED — behavioral stage skipped, only %.1fs remain (need >%ds) (reason=%s)",
                remaining_now, NO_NEW_QUESTION_CUTOFF_SECONDS, reason,
            )
            _stage_bridge_pending = False
            return False

        stage_cfg = STAGE_CONFIGS[_current_stage_index]
        next_stage = STAGE_CONFIGS[next_stage_index]

        logger.info(
            "┌─ STAGE TRANSITION ──────────────────────────────────────────\n"
            "│  FROM: Stage %d (%s)  →  TO: Stage %d (%s)\n"
            "│  time_in_stage=%ds  budget=%ds  remaining_total=%.0fs\n"
            "│  reason=%s",
            _current_stage_index + 1, stage_cfg.label,
            next_stage_index + 1, next_stage.label,
            int(time_in_stage), stage_budget, remaining_now, reason,
        )

        remove_system_messages(chat_ctx, f"[STAGE {_current_stage_index + 1}:")
        stage_directive = _build_stage_directive_by_index(next_stage_index)
        session_context.stage_history.append(
            {
                "stage": _current_stage_index,
                "name": stage_cfg.label,
                "seconds": int(time_in_stage),
                "budget_seconds": stage_budget,
                "transition_reason": reason,
            }
        )
        _stage_transition_events.append(
            {
                "from_stage": stage_cfg.label,
                "to_stage": next_stage.label,
                "from_index": _current_stage_index,
                "to_index": next_stage_index,
                "time_in_stage_seconds": int(time_in_stage),
                "budget_seconds": stage_budget,
                "transition_reason": reason,
                "at_turn": turn_count,
                "timestamp": int(time.time() * 1000),
            }
        )
        _current_stage_index = next_stage_index
        _stage_start_time = now_mono
        _stage_bridge_pending = False

        if stage_directive:
            chat_ctx.add_message(role="system", content=stage_directive)
            logger.info(
                "│  ✓ DIRECTIVE INJECTED into chat context (%d chars)\n"
                "│  Preview: %s\n"
                "└─────────────────────────────────────────────────────────────",
                len(stage_directive), stage_directive[:120].replace("\n", " "),
            )
        else:
            logger.warning(
                "│  ✗ NO DIRECTIVE BUILT for stage %d (%s) — stage will fire but AI has no guidance\n"
                "└─────────────────────────────────────────────────────────────",
                next_stage_index + 1, next_stage.label,
            )

        _rebalance_remaining_stage_budgets()
        new_budgets = {STAGE_CONFIGS[i].label: _stage_budgets_secs.get(i, 0) for i in range(len(STAGE_CONFIGS))}
        logger.info("[STAGE_ADVANCE] ✓ Now on Stage %d (%s) | rebalanced budgets: %s", _current_stage_index + 1, next_stage.label, new_budgets)
        return True
    def _advance_stage_if_due(now_mono: float) -> bool:
        if not warmup_complete or _current_stage_index >= len(STAGE_CONFIGS) - 1 or _stage_start_time <= 0:
            return False
        stage_budget = max(0, int(_stage_budgets_secs.get(_current_stage_index, 0)))
        time_in_stage = max(0.0, now_mono - _stage_start_time)
        remaining_in_stage = stage_budget - time_in_stage
        stage_label = STAGE_CONFIGS[_current_stage_index].label if _current_stage_index < len(STAGE_CONFIGS) else "?"
        logger.info(
            "[STAGE_TIMER] Stage %d (%s) | elapsed=%ds / budget=%ds | countdown=%.0fs%s",
            _current_stage_index + 1, stage_label, int(time_in_stage), stage_budget, remaining_in_stage,
            " ← OVERDUE" if remaining_in_stage < 0 else "",
        )
        if time_in_stage < stage_budget:
            return False
        # Budget expired — wait until candidate finishes speaking before injecting
        if is_candidate_speaking:
            logger.info("[STAGE_TIMER] Budget expired but candidate is speaking — waiting")
            return False
        if (
            _behavioral_stage_idx is not None
            and _current_stage_index + 1 == _behavioral_stage_idx
            and _remaining_total_seconds_now() <= NO_NEW_QUESTION_CUTOFF_SECONDS
        ):
            logger.info(
                "[STAGE] Skipping behavioral stage due to late-session cutoff (remaining=%.1fs)",
                _remaining_total_seconds_now(),
            )
            return False
        return _advance_stage("time_cap", now_mono)
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
            ready_signal_received_at
        try:
            raw_data = None
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
            # All browser-side proctoring signals (tab_switch, face_absence,
            # multiple_faces, camera_disabled, microphone_disabled) are stored
            # directly to the DB via /api/interview/proctoring by the frontend.
            # The agent is NOT involved in processing these signals.
        except Exception as e:
            logger.debug(f"Ignored malformed data packet: {e}")
            return
    # Pre-start all background processing while user is on hardware check.
    await session.start(
        agent=agent,
        room=ctx.room,
        room_options=room_io.RoomOptions(
            close_on_disconnect=False,
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
            _topic_depth_history, _trust_state, _contradiction_state, _active_eval_task, greeting_delivered_at, \
            _ai_signal_flush_counter, _ai_signal_flushed_count
        try:
            if not content or role != "user":
                return
            # Block all STT processing until greeting is fully delivered
            if greeting_delivered_at is None:
                logger.info("[GREETING_BLOCK] Candidate spoke before greeting finished  -  ignoring until greeting delivered")
                return
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
            # Candidate meta-question handling:
            # if they ask "why these questions / what stage", answer briefly and continue.
            meta_q = content.lower()
            if any(
                marker in meta_q
                for marker in (
                    "what stage",
                    "which stage",
                    "why are you asking",
                    "what are you trying to collect",
                    "what information you are trying",
                )
            ):
                remove_system_messages(chat_ctx, "[META_QUESTION_DIRECTIVE]")
                chat_ctx.add_message(
                    role="system",
                    content=(
                        "[META_QUESTION_DIRECTIVE - DO NOT SAY ALOUD]\n"
                        f"Candidate asked why/stage. Respond in one short sentence: "
                        f"you are mapping fit for the {job_title} role. Then ask exactly one concise "
                        "question from the current stage objective. Do not keep explaining."
                    ),
                )
            # Inject structured recent Q&A context for callbacks and contradiction detection.
            if _last_interviewer_question and turn_snapshot > 1:
                recent_context = _build_recent_context_block(
                    transcript_lines, _last_interviewer_question, n_exchanges=1
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
                        "clarity": 0, "depth": 0, "fluency": 0, "confidence": 0,
                        "overall": 0.0, "signals": [], "concerns": [],
                        "is_warmup": True,
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
                        _last_depth_decay_turn, _depth_decay_ever_fired, _consecutive_low_signal_move_on, _last_action_was_move_on
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
                            uncovered_topics = _topics_for_stage(_current_stage_index)[:3]
                            current_stage_name = (
                                STAGE_CONFIGS[_current_stage_index].name
                                if 0 <= _current_stage_index < len(STAGE_CONFIGS)
                                else ""
                            )
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
                                    current_stage=current_stage_name,
                                ),
                                timeout=3.5,
                            )
                        except asyncio.TimeoutError:
                            logger.warning(
                                "[EVAL] run_turn_evaluation timed out (>3.5s) turn=%d — using smart fallback",
                                turn,
                            )
                            # Smart fallback: respect the follow-up cap even when the LLM is slow.
                            # If already at max follow-ups, force a MOVE_ON so Ishita pivots naturally.
                            # Otherwise, issue a stage-aware PROBE so the conversation keeps flowing.
                            _fallback_stage_label = (
                                STAGE_CONFIGS[_current_stage_index].label
                                if 0 <= _current_stage_index < len(STAGE_CONFIGS)
                                else "CURRENT"
                            )
                            if follow_ups >= follow_up_depth:
                                _fallback_action = "MOVE_ON"
                                _fallback_next = (
                                    "Follow-up cap reached. Bridge naturally to the next topic "
                                    f"within the {_fallback_stage_label} stage. Do not announce a stage change."
                                )
                            else:
                                _fallback_action = "PROBE"
                                _fallback_next = (
                                    f"Ask one specific follow-up question that stays strictly within "
                                    f"the {_fallback_stage_label} stage intent. Make it personal and concrete."
                                )
                            td = {
                                "decision": {
                                    "action": _fallback_action,
                                    "mode": "normal",
                                    "next_goal": _fallback_next,
                                },
                                "quality": {"clarity": 5.0, "depth": 5.0, "specificity": 5.0, "grounding": 5.0},
                                "signal_events": [],
                            }
                            directive = (
                                f"[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                                f"DECISION: {_fallback_action}\n"
                                f"NEXT MOVE: {_fallback_next}"
                            )
                        action = td["decision"]["action"]
                        # Guard: evaluator cannot MOVE_ON on the very first answer to a new topic.
                        # follow_ups == 0 means we haven't asked a single follow-up yet — force PROBE.
                        if action == "MOVE_ON" and follow_ups == 0:
                            action = "PROBE"
                            td["decision"]["action"] = "PROBE"
                            logger.info("[FOLLOWUP] Evaluator returned MOVE_ON on first answer — overriding to PROBE (follow_up_count=0)")
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
                        if quality_avg < 3.5:
                            _consecutive_low_signal_move_on += 1
                        else:
                            _consecutive_low_signal_move_on = 0
                        if (
                            _consecutive_low_signal_move_on >= 3
                            and warmup_complete
                            and _stage_start_time > 0
                            and _current_stage_index < len(STAGE_CONFIGS) - 1
                        ):
                            stage_budget = max(0, int(_stage_budgets_secs.get(_current_stage_index, 0)))
                            time_in_stage = max(0.0, time.monotonic() - _stage_start_time)
                            if time_in_stage >= max(60, int(stage_budget * 0.4)):
                                _advance_stage("low_signal_move_on", time.monotonic())
                                _consecutive_low_signal_move_on = 0
                        # All I/O is done. Acquire lock before mutating any shared session state.
                        # This keeps background turn processing from interleaving shared counters.
                        async with _session_state_lock:
                            # Log quality score for DB persistence
                            quality_record = {
                                "clarity": td["quality"]["clarity"],
                                "depth": td["quality"]["depth"],
                                "fluency": td["quality"].get("fluency", 0),
                                "confidence": td["quality"].get("confidence", 0),
                                "overall": quality_avg,
                                "signals": [event["signal_name"] for event in signal_events if event.get("signal_name")],
                                "concerns": [event["signal_name"] for event in signal_events if event.get("score_delta", 0.0) < 0],
                            }
                            answer_scores.append(quality_record)
                            # Update depth history and follow-up counter
                            # If last turn was MOVE_ON (topic pivot), reset counter so the new
                            # topic starts fresh regardless of what the evaluator returns.
                            if _last_action_was_move_on:
                                _topic_follow_up_count = 0
                                _topic_depth_history = []
                                _collapse_stage = 0
                                _last_action_was_move_on = False
                                logger.info("[FOLLOWUP] New topic detected — counter reset to 0")
                            _topic_depth_history.append(td["quality"]["depth"])
                            collapse_fired = any(
                                ev.get("signal_name") == "follow_up_collapse"
                                for ev in signal_events
                            )
                            stage_label_now = STAGE_CONFIGS[_current_stage_index].label if _current_stage_index < len(STAGE_CONFIGS) else "?"
                            logger.info(
                                "[TURN] Stage=%d(%s) | evaluator=%s | quality=%.1f | follow_ups=%d/%d | depth_history=%s",
                                _current_stage_index + 1, stage_label_now, action, quality_avg,
                                _topic_follow_up_count, follow_up_depth,
                                [round(x, 1) for x in _topic_depth_history[-4:]],
                            )
                            if action in ("PROBE", "VERIFY"):
                                _topic_follow_up_count += 1
                                # Quality-based exhaustion: move on when topic is genuinely exhausted.
                                # A topic is exhausted when:
                                #   (a) hard cap hit (absolute safety net), OR
                                #   (b) 2+ follow-ups AND last 2 answers were both low quality (< 4.0)
                                #       meaning candidate has nothing more to give on this thread
                                last_two_low = (
                                    len(_topic_depth_history) >= 2
                                    and _topic_depth_history[-1] < 4.0
                                    and _topic_depth_history[-2] < 4.0
                                )
                                hard_cap_hit = _topic_follow_up_count >= follow_up_depth
                                if hard_cap_hit or (last_two_low and _topic_follow_up_count >= 2):
                                    reason_note = "cap" if hard_cap_hit else "quality exhausted"
                                    action = "MOVE_ON"
                                    # Fix 2: if cap hit + low quality, force stage advance immediately
                                    # (don't wait for time budget to expire)
                                    stage_advance_forced = False
                                    if hard_cap_hit and quality_avg < 4.0 and _current_stage_index < len(STAGE_CONFIGS) - 1:
                                        stage_advance_forced = _advance_stage("followup_cap_low_quality", time.monotonic())
                                        if stage_advance_forced:
                                            logger.info("[FOLLOWUP] Cap + low quality — forcing stage advance to stage %d", _current_stage_index + 1)
                                    # Fix 3: inject next stage name + specific opening topic in MOVE_ON directive
                                    next_stage_idx = _current_stage_index + 1
                                    if not stage_advance_forced and next_stage_idx < len(STAGE_CONFIGS):
                                        next_stage_label = STAGE_CONFIGS[next_stage_idx].label
                                        next_topic_hint = (uncovered_topics[0] if uncovered_topics else f"a key skill for the {job_title} role")
                                        next_goal = (
                                            f"This thread is exhausted. Acknowledge briefly and move on. "
                                            f"If enough time remains in this stage, ask about {next_topic_hint}. "
                                            f"If this stage is nearly done, bridge naturally into the {next_stage_label} stage."
                                        )
                                    else:
                                        next_goal = "This thread is exhausted. Acknowledge briefly and move to the next topic — no announcement."
                                    td["decision"]["action"] = "MOVE_ON"
                                    td["decision"]["next_goal"] = next_goal
                                    directive = (
                                        f"[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                                        f"DECISION: MOVE_ON\n"
                                        f"NEXT MOVE: {next_goal}"
                                    )
                                    logger.info("[FOLLOWUP] Moving on (%s, follow_ups=%d) — topic exhausted", reason_note, _topic_follow_up_count)
                                    _topic_follow_up_count = 0
                                    _topic_depth_history = []
                                    _collapse_stage = 0
                                    _last_action_was_move_on = True
                                else:
                                    logger.info("[FOLLOWUP] Follow-up %d — continuing PROBE (quality=%.1f)", _topic_follow_up_count, quality_avg)
                                    if collapse_fired:
                                        _collapse_stage += 1
                                    elif _collapse_stage > 0 and not collapse_fired:
                                        _collapse_stage = max(0, _collapse_stage - 1)
                            else:
                                _topic_follow_up_count = 0
                                _topic_depth_history = []
                                _collapse_stage = 0
                                _last_action_was_move_on = True
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
                            _now_elapsed = round(time.time() - session_start_time, 1) if session_start_time else 0.0
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
                                    "elapsed_sec": _now_elapsed,
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
                                        "elapsed_sec": _now_elapsed,
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
                            # Checkpoint: flush newly appended AI signals to DB every 5 events
                            # so signals survive an agent crash between turns.
                            new_total = len(proctoring_events)
                            _ai_signal_flush_counter += new_total - _ai_signal_flushed_count
                            if _ai_signal_flush_counter >= 5:
                                flush_slice = proctoring_events[_ai_signal_flushed_count:]
                                _ai_signal_flushed_count = new_total
                                _ai_signal_flush_counter = 0
                                spawn_background_task(
                                    checkpoint_ai_signals(app_id, flush_slice),
                                    f"ai_signal_checkpoint_turn_{turn_snapshot}",
                                )
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
                        # On MOVE_ON, log what was just discussed so all future turns remember it.
                        if action == "MOVE_ON" and question and answer:
                            topic_line = question.split("?")[0].strip()[:80]
                            answer_gist = " ".join(answer.split()[:20])
                            _discussed_log.append(f"- {topic_line}: {answer_gist}")
                        # Build the "already covered" block — injected into every directive.
                        if _discussed_log:
                            covered_block = (
                                "\n[INTERVIEW MEMORY — DO NOT RE-ASK THESE, reference naturally if relevant]\n"
                                + "\n".join(_discussed_log[-8:])
                                + "\n"
                            )
                            directive = directive + covered_block
                        # Remove previous directive to keep context clean
                        remove_system_messages(chat_ctx, "[NEXT_TURN_DIRECTIVE")
                        # On MOVE_ON, also clear RECENT_CONTEXT so the LLM doesn't
                        # keep referencing the old topic and re-probe it next turn.
                        if action == "MOVE_ON":
                            remove_system_messages(chat_ctx, "[RECENT_CONTEXT")
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
            _last_interviewer_question, _topic_follow_up_count, _topic_depth_history, _last_action_was_move_on, \
            _question_asked_at, _answer_received_at, warmup_responses_received, warmup_complete, llm_spoke_event, _stage_start_time, _candidate_turn_since_last_assistant
        try:
            item = event.item
            role = getattr(item, "role", None)
            content = item.text_content
            if role == "assistant":
                # Read topic signal from raw LLM output BEFORE sanitization strips it.
                raw_content = content or ""
                _topic_tag = None
                for _raw_line in raw_content.splitlines():
                    _stripped = _raw_line.strip()
                    if _stripped.startswith("[TOPIC:NEW"):
                        _topic_tag = "NEW"
                        break
                    elif _stripped.startswith("[TOPIC:FOLLOWUP"):
                        _topic_tag = "FOLLOWUP"
                        break
                if _topic_tag == "NEW":
                    # Only reset if the system evaluator also agreed this was a MOVE_ON.
                    # If the evaluator said PROBE, the AI is mislabeling a sub-topic pivot
                    # as a new topic — dampen the reset to prevent infinite loops within one job.
                    if _last_action_was_move_on:
                        _topic_follow_up_count = 0
                        _topic_depth_history = []
                        _last_action_was_move_on = False
                        logger.info("[TOPIC_SIGNAL] Ishita signaled NEW TOPIC + evaluator confirmed MOVE_ON — counter reset")
                    else:
                        logger.info("[TOPIC_SIGNAL] Ishita signaled NEW TOPIC but evaluator said PROBE — treating as FOLLOWUP, counter stays at %d", _topic_follow_up_count)
                elif _topic_tag == "FOLLOWUP":
                    logger.info("[TOPIC_SIGNAL] Ishita signaled FOLLOWUP — counter stays at %d", _topic_follow_up_count)
                else:
                    logger.debug("[TOPIC_SIGNAL] No topic tag in assistant response — counter unchanged (%d)", _topic_follow_up_count)
                content = sanitize_candidate_facing_text(content)
            if not role:
                return
            # For user turns: allow empty content — warmup check must fire regardless.
            if role != "user" and not content:
                return
            if role == "assistant":
                if not _candidate_turn_since_last_assistant:
                    # Prevent interviewer chaining multiple questions before candidate speaks.
                    logger.warning("[TURN_GUARD] Suppressing consecutive assistant turn without candidate reply")
                    return
                if not llm_spoke_event.is_set():
                    llm_spoke_event.set()
            if role == "user":
                _answer_received_at = time.perf_counter()
                _candidate_turn_since_last_assistant = True
                # ── Phase 1 → Phase 2: warmup ends after 1 candidate response ──────
                if not warmup_complete:
                    warmup_responses_received += 1
                    logger.info("[WARMUP] ✓ DONE — candidate responded, injecting Stage 1")
                    if warmup_responses_received >= 1:
                        warmup_complete = True
                        remove_system_messages(chat_ctx, "[WARMUP PHASE]")
                        stage1_directive = stage1_directive_cached or build_stage_1_resume_directive(
                            band=session_context.candidate_band,
                            resume_brief=session_context.resume_brief,
                        )
                        chat_ctx.add_message(role="system", content=stage1_directive)
                        _stage_start_time = time.monotonic()
                        stage1_budget = _stage_budgets_secs.get(0, 0)
                        logger.info(
                            "┌─ STAGE 1 INJECTED (Resume) ─────────────────────────────────\n"
                            "│  budget=%ds (%dm) | directive_len=%d chars\n"
                            "│  Preview: %s\n"
                            "└─────────────────────────────────────────────────────────────",
                            stage1_budget, stage1_budget // 60, len(stage1_directive),
                            stage1_directive[:120].replace("\n", " "),
                        )
                # Append candidate response to transcript before background processing
                candidate_text = content.replace("<wait for response>", "").strip()
                if candidate_text:
                    append_transcript_line("Candidate", candidate_text)
                    logger.info(f"[TRANSCRIPT] Candidate: {candidate_text[:60]}...")
                turn_snapshot = turn_count
                spawn_background_task(
                    _process_user_conversation_item(event, content, role, turn_snapshot),
                    f"process_user_turn_{turn_snapshot}",
                )
                return
            speaker = "Interviewer" if role == "assistant" else "Candidate"
            # Strip the <wait for response> marker from transcript (it's an internal signal, not dialogue)
            if role == "assistant":
                clean_content = sanitize_candidate_facing_text(content)
            else:
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
            if role == "assistant":
                _question_asked_at = time.perf_counter()
                _candidate_turn_since_last_assistant = False
                turn_count += 1
            # ── Stage advance check on every turn (assistant or candidate) ──────
            if warmup_complete:
                _advance_stage_if_due(time.monotonic())
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
    llm_spoke_event = asyncio.Event()
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
                "role_category": session_context.candidate_band,
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
                "stage_history": session_context.stage_history,
                "stage_transition_events": _stage_transition_events,
                "total_stages_covered": _current_stage_index + 1,
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
        if not _initialize_stage_budgets_called:
            _initialize_stage_budgets()
            _initialize_stage_budgets_called = True
        logger.info(
            "━━━ SESSION START ━━━ app_id=%s | candidate=%s | role=%s | band=%s | org=%s | lang=%s | tts=%s | stt=%s | llm=%s",
            app_id, candidate_name, job_title,
            session_context.candidate_band,
            context.get("orgName", ""),
            interview_lang,
            org_tts_provider,
            "DEEPGRAM",
            org_llm_model,
        )
        ai_name = context.get("aiName") or "Ishita"
        welcome_text = build_greeting_text(
            candidate_first_name or candidate_name,
            ai_name,
            job_title,
        )
        # Mark as started in DB while greeting starts immediately.
        spawn_background_task(mark_interview_started(app_id), "mark_interview_started")
        try:
            startup_latency_ms = int((time.perf_counter() - entry_started_at) * 1000)
            logger.info("[GREETING] ▶ STARTED — boot=%dms", startup_latency_ms)
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
                        logger.info("[GREETING] ✓ COMPLETED")
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
    # Fixed inactivity timing so the candidate always gets the same experience.
    # 50s silence -> warning, 60s silence -> end call.
    INACTIVITY_WARNING_SECS = 50
    INACTIVITY_END_SECS = 60
    FINAL_THANKS_TRIGGER_SECS = 15
    final_timeout_announced = False
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
    _last_periodic_stage_check = time.monotonic()
    while True:
        elapsed = time.monotonic() - session_loop_start
        remaining = total_seconds - elapsed
        if finished_task.done() or disconnected_task.done():
            break
        if remaining <= 0:
            break
        # ── Periodic stage advance: fires every 10s unconditionally ──────────
        # The event-driven check fires on assistant turns only, which may be
        # infrequent or missing with some TTS/STT providers. This guarantees
        # stage budgets are enforced even during continuous conversation.
        _now = time.monotonic()
        if warmup_complete and _now - _last_periodic_stage_check >= 10.0:
            _advance_stage_if_due(_now)
            _last_periodic_stage_check = _now
        if (
            remaining <= NO_NEW_QUESTION_CUTOFF_SECONDS
            and not _final_no_new_question_guard
            and not is_agent_speaking
        ):
            _final_no_new_question_guard = True
            chat_ctx.add_message(
                role="system",
                content=(
                    "[SYSTEM ALERT: FINAL WINDOW] Less than 25 seconds remain. "
                    "Do not ask any new questions. Briefly wrap up and close naturally."
                ),
            )
            logger.info(
                "[TIMING] Activated final no-new-question guard (remaining=%.1fs)",
                remaining,
            )
        # --- Final 15 seconds: thank you and close ---
        if remaining <= FINAL_THANKS_TRIGGER_SECS:
            if not final_timeout_announced:
                final_timeout_announced = True
                try:
                    await session.say(
                        f"Thank you for your time today, {candidate_first_name or candidate_name}. That's all from my side. All the best.",
                        allow_interruptions=True,
                    )
                except Exception as e:
                    logger.warning(f"[TIMING] Final timeout announcement failed: {e}")
            break
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
            1 for line in transcript_lines if re.match(r"^Candidate(\[\d+\])?:", line)
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
        "role_category": session_context.candidate_band,
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
        "stage_history": session_context.stage_history,
        "stage_transition_events": _stage_transition_events,
        "total_stages_covered": _current_stage_index + 1,
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
    )
    # Save answer quality scores
    await persist_answer_scores(app_id, answer_scores)
    await persist_org_usage_metrics(
        org_id,
        latest_session_usage or session.usage,
        tts_provider=org_tts_provider,
        tts_model=org_tts_model,
        stt_provider="DEEPGRAM",
        stt_model=org_deepgram_model,
    )
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
                        "role_category": session_context.candidate_band,
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
    try:
        await persist_interview_billing_snapshot(
            app_id,
            latest_session_usage or session.usage,
            org_id=org_id,
            candidate_name=candidate_name,
            job_title=job_title,
            duration_seconds=(time.time() - session_start_time) if session_start_time else None,
            tts_provider=org_tts_provider,
            tts_model=org_tts_model,
            stt_provider="DEEPGRAM",
            stt_model=org_deepgram_model,
        )
    except Exception as e:
        logger.error(f"[USAGE] Failed to persist interview billing snapshot for {app_id}: {e}")
    await flush_pending_manual_billing(org_id)
    # Sync with dashboard: Application COMPLETED
    if finished_task.done():
        _agent_dur = (time.time() - session_start_time) if session_start_time else None
        await update_interview_status(app_id, duration_seconds=_agent_dur)
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
