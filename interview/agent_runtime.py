import sys
import asyncio
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
    tts_phonetic_processor,
)
from interview.agent_runtime_support import (
    DEFAULT_VOICE_ID,
    LLM_MODEL,
    VOICE_REGISTRY,
    FIXED_INTERVIEW_DURATION_MINUTES,
    REDIS_URL,
    STT_MODEL,
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

GREETING_FIXED_SECONDS = 60
WARMUP_FIXED_SECONDS = 120
NO_NEW_QUESTION_CUTOFF_SECONDS = 15
# Stage 1 (RESUME) = 10 min. Stage 2 (SKILL) = remainder until final 15s.
STAGE1_BUDGET_SECONDS = 600  # 10 min

# Custom-question normalisation constants — module-level so they are allocated once.
_CUSTOM_Q_PREFIXES: tuple[str, ...] = (
    "ask him about",
    "ask her about",
    "ask them about",
    "ask about",
    "please ask about",
    "question:",
)
_CUSTOM_Q_TOKEN_SYNONYMS: dict[str, set[str]] = {
    "education": {"education", "educational", "study", "studied", "degree", "college", "university", "school", "background", "academics", "academic"},
    "experience": {"experience", "worked", "work", "role", "roles", "internship", "intern"},
}

# Language codes for STT and TTS — keyed by DB language field value.
_LANGUAGE_CODES: dict[str, dict[str, str]] = {
    "English": {"stt": "en-US", "tts": "en"},
    "Hindi":   {"stt": "hi",    "tts": "hi"},
}

# TTS provider lookup tables — O(1) replacement for if/elif chains.
_TTS_DEFAULT_MODELS: dict[str, str] = {
    "SARVAM":     "bulbul:v3",
    "ELEVENLABS": "eleven_turbo_v2_5",
    "CARTESIA":   "cartesia/sonic-3",
}

# Compiled once — matches greeting echo fragments that leak back into STT after AI speaks.
_GREETING_ECHO_RE = re.compile(
    r"^\s*(?:hi|hello|hey|okay|ok|yeah|yes|yep|mmhmm|mhm|good morning|good afternoon)\s*$",
    re.IGNORECASE,
)

# STT noise-suppression helpers — compiled at import time.
_STT_WHITESPACE_RE = re.compile(r"\s+")
_STT_NON_ALPHA_RE = re.compile(r"[^a-zA-Z]")
_STT_VOWEL_RE = re.compile(r"[aeiou]")


def _find_covered_keywords(sources: list[str], transcript_text: str) -> list[str]:
    """Return items from *sources* whose first segment appears in *transcript_text* (word-boundary match)."""
    found: list[str] = []
    for item in sources:
        short = str(item).split(" - ")[0].strip()
        kw = short.lower()
        if not kw:
            continue
        if re.search(r'\b' + re.escape(kw) + r'\b', transcript_text):
            found.append(short)
    return found


# Inactivity nudge strategy map — (compiled pattern, message list with {name} placeholder).
# Evaluated top-to-bottom; first match wins. Generic fallback is the last entry (pattern=None).
_NUDGE_STRATEGIES: list[tuple[Optional[re.Pattern], list[str]]] = [
    (
        re.compile(r"\b(how|why|explain|walk me through|describe|what happened|tell me about)\b", re.I),
        [
            "Take your time, {name} — I want to hear the full picture.",
            "No rush — think it through and share whenever you're ready.",
            "If it helps, start with a specific example and work from there.",
        ],
    ),
    (
        re.compile(r"\b(feel|think|would you|looking back|what would you|in hindsight)\b", re.I),
        [
            "No rush — happy to wait while you think that through.",
            "Take a moment, {name}. There is no right answer here.",
        ],
    ),
    (
        re.compile(r"\b(example|specific|moment|situation|time when|instance)\b", re.I),
        [
            "Pick whichever example comes to mind first — the specifics matter more than finding the perfect one.",
            "You can also answer with just one concrete example if that is easier, {name}.",
        ],
    ),
    (
        None,  # generic fallback
        [
            "If you're thinking aloud, feel free to keep going — that helps me follow your reasoning.",
            "Just checking in, {name} — whenever you're ready.",
            "If you went quiet mid-thought, you can continue right from there.",
        ],
    ),
]


# Compiled once — quota detection for situational and behavioral questions.
_SITUATIONAL_RE = re.compile(
    r"what would you do|what if|how would you handle|if it suddenly|if that|imagine|suppose|what breaks",
    re.IGNORECASE,
)
_BEHAVIORAL_RE = re.compile(
    r"tell me about a time|tell me about a moment|walk me through a time|"
    r"when something went wrong|a time when|give me an example of when|describe a time",
    re.IGNORECASE,
)

# Stage-1 priority guard: do not ask education/background/custom too early.
_BACKGROUND_EARLY_RE = re.compile(
    r"\b(educat|university|college|school|academic|background|"
    r"tell me about yourself|introduce yourself)\b",
    re.IGNORECASE,
)


def _normalize_custom_question_text(raw: str) -> str:
    text = re.sub(r"\s+", " ", str(raw or "").strip().lower())
    for p in _CUSTOM_Q_PREFIXES:
        if text.startswith(p):
            text = text[len(p):].strip()
            break
    return re.sub(r"[^a-z0-9\s]", " ", text).strip()


def _expand_custom_q_tokens(text: str) -> set[str]:
    tokens = {t for t in text.split() if len(t) >= 4}
    expanded = set(tokens)
    for t in list(tokens):
        for root, family in _CUSTOM_Q_TOKEN_SYNONYMS.items():
            if t in family:
                expanded |= family
                expanded.add(root)
    return expanded


def _clean_stt_text(raw_text: str) -> str:
    """Remove STT noise/hallucination artifacts from a candidate transcript turn."""
    text = _STT_WHITESPACE_RE.sub(" ", (raw_text or "").strip())
    if not text:
        return ""
    if text.lower().strip(" .!?") == "candidate response unavailable":
        return ""
    cleaned_tokens: list[str] = []
    for token in text.split():
        alpha = _STT_NON_ALPHA_RE.sub("", token).lower()
        # Drop very short consonant-only fragments (filler noise).
        if alpha and len(alpha) <= 2 and not _STT_VOWEL_RE.search(alpha):
            continue
        # Collapse immediate duplicates ("name name", "a a a").
        if cleaned_tokens and cleaned_tokens[-1].lower() == token.lower():
            continue
        cleaned_tokens.append(token)
    return _STT_WHITESPACE_RE.sub(" ", " ".join(cleaned_tokens)).strip()


class InterviewAgent(Agent):
    async def tts_node(self, text, model_settings):
        activity = self._get_activity_or_raise()
        tts_engine = activity.tts
        if tts_engine is None:
            return

        conn_options = activity.session.conn_options.tts_conn_options

        # Sentence-boundary splitter: push complete sentences to TTS as the LLM
        # generates them, CONCURRENTLY with reading audio frames back.
        # Works for Sarvam, Cartesia, and ElevenLabs — all implement the same
        # SynthesizeStream base with push_text() / end_input().
        # Benefit: candidate hears first audio after ~1 sentence (~400ms LLM time)
        # instead of waiting for the full response (~1.5s). ~1s latency reduction.
        # Sending complete sentences (not word-by-word) preserves phoneme context
        # so TTS won't mispronounce consonant clusters.
        _SENT_END = re.compile(r'(?<=[.?!])\s+')

        async def _push_sentences(tts_stream) -> None:
            buf = ""
            n = 0
            async for chunk in text:
                buf += chunk
                while True:
                    m = _SENT_END.search(buf)
                    if not m:
                        break
                    sentence = buf[:m.start() + 1].strip()
                    buf = buf[m.end():]
                    if sentence:
                        tts_stream.push_text(sentence + " ")
                        n += 1
            if buf.strip():
                tts_stream.push_text(buf.strip())
                n += 1
            tts_stream.end_input()
            logger.info("[TTS] Streamed %d sentence(s) via WebSocket", n)

        try:
            if tts_engine.capabilities.streaming:
                async with tts_engine.stream(conn_options=conn_options) as stream:
                    # Push text and read audio frames concurrently.
                    # push_task sends sentences as the LLM generates them;
                    # the stream yields audio frames as each sentence is synthesized.
                    push_task = asyncio.create_task(_push_sentences(stream))
                    try:
                        async for ev in stream:
                            yield ev.frame
                    finally:
                        await push_task
            else:
                # Non-streaming provider: buffer full text, then synthesize once.
                full_text = ""
                async for chunk in text:
                    full_text += chunk
                if not full_text.strip():
                    return
                async with tts_engine.synthesize(full_text, conn_options=conn_options) as stream:
                    async for ev in stream:
                        yield ev.frame

        except asyncio.CancelledError:
            raise
        except Exception as e:
            err_text = str(e).lower()
            if any(s in err_text for s in ("chanclosed", "channel", "api connection", "tts stream failed", "closing transport")):
                logger.warning("[TTS] Stream interrupted/closed during generation; skipping this utterance cleanly: %s", str(e)[:220])
                return
            raise


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
from pydantic import BaseModel, field_validator


class _EvalSignalToggles(BaseModel):
    """Validated signal enable/disable flags. All default OFF. Coerces any truthy DB value."""
    ownership_ambiguity: bool = False
    example_evasion: bool = False
    latency_mismatch: bool = False
    resume_claim_mismatch: bool = False
    follow_up_collapse: bool = False
    contradiction: bool = False
    complexity_latency_mismatch: bool = False
    depth_decay: bool = False

    @field_validator("*", mode="before")
    @classmethod
    def _coerce(cls, v: Any) -> bool:
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            return v.strip().lower() in ("true", "1", "yes", "on")
        if isinstance(v, (int, float)):
            return bool(v)
        return False


def _extract_evaluation_signal_toggles(raw_signals: Any) -> dict[str, bool]:
    """Parse DB proctoringSignals JSON into a validated bool dict. All keys default OFF."""
    parsed: dict[str, Any] = {}
    if isinstance(raw_signals, dict):
        parsed = raw_signals
    elif isinstance(raw_signals, str):
        try:
            maybe = json.loads(raw_signals)
            if isinstance(maybe, dict):
                parsed = maybe
        except Exception:
            pass
    return _EvalSignalToggles(**parsed).model_dump()


class InterviewContext(BaseModel):
    """Typed, validated view of the DB row returned by get_interview_context().
    Required fields raise ValidationError on construction — no manual require_db_value calls needed.
    """
    fullName: str
    jobTitle: str
    language: str
    orgId: Optional[str] = None
    orgName: Optional[str] = None
    orgLocation: Optional[str] = None
    driveLocation: Optional[str] = None
    aiName: Optional[str] = "Ishita"
    voiceId: Optional[str] = None
    voiceProvider: Optional[str] = None
    voiceModel: Optional[str] = None
    deepgramModel: Optional[str] = None
    llmModel: Optional[str] = None
    llmTemperature: Optional[float] = 0.7
    resumeData: Any = None
    extractedDetails: Any = None
    interviewQuestions: Any = None
    proctoringSignals: Any = None

    @field_validator("fullName", "jobTitle", "language", mode="before")
    @classmethod
    def _require_nonempty(cls, v: Any) -> str:
        s = str(v).strip() if v is not None else ""
        if not s:
            raise ValueError("Required field is empty")
        return s


class CustomQuestion(BaseModel):
    """Single custom question with its coverage state. Replaces the fragile parallel-list pattern."""
    raw: str
    normalized: str
    asked: bool = False


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
    # Run DB fetch and room connect in parallel to minimize startup latency.
    try:
        context_result, connect_result = await asyncio.gather(
            get_interview_context(app_id),
            connect_with_retry(),
            return_exceptions=True,
        )
    except Exception as e:
        logger.error(f"Startup gather failed: {e}")
        return
    if isinstance(connect_result, Exception):
        raise connect_result
    if isinstance(context_result, Exception):
        logger.error(f"Failed to load interview context from DB: {context_result}")
        return
    if not isinstance(context_result, dict):
        logger.error(f"Invalid DB context payload type: {type(context_result)}")
        return
    context: dict[str, Any] = context_result
    try:
        ctx_data = InterviewContext(**context)
    except Exception as _ctx_err:
        logger.error("Invalid interview context from DB: %s", _ctx_err)
        return
    evaluation_signal_toggles = _extract_evaluation_signal_toggles(ctx_data.proctoringSignals)
    extracted_details = _coerce_jsonish(ctx_data.extractedDetails or "{}")
    structured_resume = _coerce_jsonish(ctx_data.resumeData or "{}")
    _raw_interview_questions = ctx_data.interviewQuestions
    _interview_questions: list = []
    if _raw_interview_questions:
        try:
            _parsed = json.loads(_raw_interview_questions) if isinstance(_raw_interview_questions, str) else _raw_interview_questions
            _interview_questions = _parsed if isinstance(_parsed, list) else []
        except Exception:
            _interview_questions = []

    # Extract basic context info early for logging
    candidate_name = ctx_data.fullName
    candidate_first_name = first_name_from_full_name(candidate_name)
    job_title = ctx_data.jobTitle

    # Consolidated startup fetch log
    _jd_skills = (extracted_details.get("mustHaveSkills") or []) if extracted_details else []
    _jd_nice = (extracted_details.get("niceToHaveSkills") or []) if extracted_details else []
    logger.info(
        "[STARTUP] Fetched — resume=%s jd=%s custom_q=%d | candidate=%s | role=%s",
        "YES" if structured_resume else "NO",
        "YES" if extracted_details else "NO",
        len(_interview_questions) if _interview_questions else 0,
        candidate_name, job_title,
    )
    if _jd_skills or _jd_nice:
        logger.info("[STARTUP] JD keys — must_have=%s nice_to_have=%s", _jd_skills[:6], _jd_nice[:4])

    if _interview_questions:
        logger.info("[STARTUP] Custom questions: %d loaded", len(_interview_questions))
        for i, q in enumerate(_interview_questions, 1):
            logger.info("[STARTUP]   Q%d: %s", i, str(q)[:100])
    else:
        logger.info("[STARTUP] Custom questions: NONE configured")

    _custom_questions: list[CustomQuestion] = [
        CustomQuestion(raw=str(_raw_q).strip(), normalized=_normalize_custom_question_text(_raw_q))
        for _raw_q in _interview_questions
        if _normalize_custom_question_text(_raw_q)
    ]
    if not _custom_questions:
        logger.info("[FLOW] Custom questions — none configured")
    interview_lang = ctx_data.language
    time_limit_mins = FIXED_INTERVIEW_DURATION_MINUTES
    follow_up_depth = 2
    org_id = ctx_data.orgId
    session_log_context.update(
        {
            "org_id": org_id,
            "org_name": _compact_optional(ctx_data.orgName),
            "org_location": _compact_optional(ctx_data.orgLocation),
            "drive_location": _compact_optional(ctx_data.driveLocation),
            "candidate": candidate_name,
            "candidate_first_name": candidate_first_name,
            "job_title": job_title,
            "time_limit_mins": time_limit_mins,
        }
    )
    started_at = time.perf_counter()
    async def _log_shutdown(_reason: str = "") -> None:
        elapsed_sec = round(time.perf_counter() - started_at, 1)
        try:
            logger.info("[SESSION] shutdown — elapsed=%ss", elapsed_sec)
        finally:
            try:
                reset_log_context(log_context_token)
            except ValueError:
                logger.debug("[SESSION] log context token already reset in a different async context")
    ctx.add_shutdown_callback(_log_shutdown)
    # Org-specific model settings.
    # Resolve voice → provider + model from registry.
    voice_id = str(ctx_data.voiceId or DEFAULT_VOICE_ID)
    voice_entry = VOICE_REGISTRY.get(voice_id)
    if voice_entry:
        org_tts_provider = voice_entry["provider"]
        org_tts_model = voice_entry["model"]
    else:
        db_provider = str(ctx_data.voiceProvider or "").strip().upper()
        db_model = str(ctx_data.voiceModel or "").strip()
        if db_provider in _TTS_DEFAULT_MODELS:
            org_tts_provider = db_provider
            org_tts_model = db_model or _TTS_DEFAULT_MODELS[db_provider]
        else:
            fallback_voice = VOICE_REGISTRY[DEFAULT_VOICE_ID]
            org_tts_provider = fallback_voice["provider"]
            org_tts_model = fallback_voice["model"]
    org_deepgram_model: str = str(ctx_data.deepgramModel or STT_MODEL)
    org_llm_model: str = str(ctx_data.llmModel or LLM_MODEL)
    org_llm_temperature: float = float(ctx_data.llmTemperature or 0.7)
    analysis_client = AsyncOpenAI()
    analysis_model = org_llm_model

    lang_codes = _LANGUAGE_CODES.get(interview_lang)
    if not lang_codes:
        raise RuntimeError(f"Unsupported interview language in DB: {interview_lang}")

    resume_context = parse_resume_context(
        structured_resume,
        "",
    )
    candidate_band = infer_candidate_band(resume_context, "")
    logger.info("[FLOW] Band=%s | candidate=%s | role=%s", candidate_band, candidate_name, job_title)
    resume_brief = build_resume_brief(candidate_band, resume_context)
    base_coverage_items = [
        *[str(s).strip() for s in resume_context.skills[:6] if str(s).strip()],
        *[str(p).strip() for p in resume_context.projects[:4] if str(p).strip()],
        *[str(w).strip() for w in resume_context.work_history[:3] if str(w).strip()],
    ]
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
    # Inject dynamic skills/tools from resume and JD into the phonetic transformer
    tts_phonetic_processor.add_tools(session_context.coverage_items)

    stage1_directive_cached = build_stage_1_resume_directive(
        band=session_context.candidate_band,
        resume_brief=session_context.resume_brief,
        custom_questions=_interview_questions or None,
    )

    # ── Consolidated interview context (single log with all data in paragraphs) ──
    _rb = session_context.resume_brief

    # Build consolidated context message
    _projects_str = " | ".join([str(p).split(" - ")[0].strip() for p in (_rb.projects or [])][:4]) or "none"
    _work_str = " | ".join([str(w).split(" - ")[0].strip() for w in (_rb.work_history or [])][:3]) or "none"
    _internships_str = " | ".join([str(x).split(" - ")[0].strip() for x in (_rb.internships or [])][:2]) or "none"
    _education_str = " | ".join([str(e).split(" - ")[0].strip() for e in (_rb.education or [])][:2]) or "none"
    _skills_str = ", ".join([str(s).strip() for s in (_rb.skills or [])][:6])

    _jd_must = ", ".join([str(s) for s in (_jd_skills or [])][:6]) or "none"
    _jd_nice_str = ", ".join([str(s) for s in (_jd_nice or [])][:4]) or "none"
    _coverage_str = ", ".join(base_coverage_items[:8]) or "auto"
    _band = session_context.candidate_band or "unknown"
    _band_note = {
        "fresher": "probe HOW they think — real decisions, specifics, learning signals",
        "mid": "probe individual ownership, measurable impact, decision trade-offs",
        "experienced": "probe end-to-end ownership, architecture depth, scale constraints",
    }.get(_band, "probe ownership, depth, and specifics")

    _context_block = (
        f"CANDIDATE: {candidate_name or 'unknown'} | ROLE: {job_title} | BAND: {_band} | TIME: {time_limit_mins}m\n"
        f"\n"
        f"FETCH SUMMARY:\n"
        f"  Resume: {'fetched' if structured_resume else 'MISSING'} | JD: {'fetched' if extracted_details else 'MISSING'} | Custom Q: {len(_interview_questions) if _interview_questions else 0}\n"
        f"  JD Must-Have Skills: {_jd_must}\n"
        f"  JD Nice-To-Have: {_jd_nice_str}\n"
        f"  Coverage Targets: {_coverage_str}\n"
        f"\n"
        f"RESUME BRIEF:\n"
        f"  Anchor: {_rb.anchor_item or 'none'} (type: {_rb.anchor_type or 'unknown'})\n"
        f"  Skills: {_skills_str}\n"
        f"  Projects: {_projects_str}\n"
        f"  Work History: {_work_str}\n"
        f"  Internships: {_internships_str}\n"
        f"  Education: {_education_str}\n"
        f"\n"
        f"STAGE 1 (RESUME - 10 min): Understand what they personally built and owned. "
        f"Open with: '{_rb.anchor_item or 'their most recent work'}'. "
        f"Band={_band}: {_band_note}. "
        f"Must cover: resume ownership topics, at least 1 situational, at least 1 behavioral.\n"
        f"\n"
        f"STAGE 2 (SKILL - 7 min): Probe depth on role-critical skills. "
        f"Skills: {' | '.join([str(s).strip() for s in (_rb.skills or [])][:5]) or 'auto'}. "
        f"Must ask situational + behavioral naturally. Already covered in Stage 1: go deeper."
    )

    logger.info("[INTERVIEW_CONTEXT]\n%s", _context_block)
    voice_layer_prompt = build_voice_layer_prompt(
        candidate_name=candidate_first_name or candidate_name,
        job_title=job_title,
        time_limit_mins=time_limit_mins,
        depth_instruction=session_context.depth_instruction,
        candidate_band=session_context.candidate_band,
        ai_name=_compact_optional(ctx_data.aiName),
        org_name=_compact_optional(ctx_data.orgName),
        org_location=_compact_optional(ctx_data.orgLocation),
        drive_location=_compact_optional(ctx_data.driveLocation),
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
    logger.info("[FLOW] System prompt ready — greeting → warmup → Stage 1")
    ctx.proc.userdata["candidate_band_context"] = session_context

    vad_instance = ctx.proc.userdata.get("vad") or build_vad()
    stt_plugin = build_stt(language_code=lang_codes["stt"], model=org_deepgram_model)
    _tts_builder = {
        "SARVAM":     build_sarvam_tts,
        "ELEVENLABS": build_elevenlabs_tts,
        "CARTESIA":   build_cartesia_tts,
    }.get(org_tts_provider, build_cartesia_tts)
    logger.info(f"[TTS] Using %s — voice=%s model=%s", org_tts_provider, voice_id, org_tts_model)
    tts_plugin = _tts_builder(
        language=lang_codes["tts"],
        model=org_tts_model,
        voice_id=voice_id,
    )
    async def _warm_greeting_tts(plugin) -> None:
        warmup_method = getattr(plugin, "warmup", None)
        if callable(warmup_method):
            try:
                result = warmup_method()
                if asyncio.iscoroutine(result):
                    await result
                logger.info("[FLOW] TTS warmup done")
            except Exception as e:
                logger.warning(f"[FLOW] TTS warmup failed (non-fatal): {e}")
    warm_greeting_task = spawn_background_task(_warm_greeting_tts(tts_plugin), "warm_greeting_tts")
    llm_plugin = build_llm(model=org_llm_model, temperature=org_llm_temperature)
    turn_detector = ctx.proc.userdata.get("turn_detector")
    ai_name = ctx_data.aiName or "Ishita"
    welcome_text = build_greeting_text(
        candidate_first_name or candidate_name,
        ai_name,
        job_title,
    )
    logger.info("[FLOW] Greeting precomputed during launching phase")
    session_kwargs = {
        "vad": vad_instance,
        "stt": stt_plugin,
        "llm": llm_plugin,
        "tts": tts_plugin,
        "turn_handling": TurnHandlingOptions(
            # LiveKit 1.5.5 expects a mapping here (not bool). Keep speculative
            # generation disabled with explicit options for compatibility.
            preemptive_generation={"enabled": False},
            turn_detection=turn_detector,
            endpointing=EndpointingOptions(
                # Faster endpointing for warmup (short casual answers); interview turns
                # use a longer max_delay to avoid cutting off longer answers mid-sentence.
                min_delay=0.5,
                max_delay=2.0,
                mode="dynamic",
            ),
            interruption=InterruptionOptions(
                enabled=True,
                # Adaptive mode uses ML to distinguish backchannels (hmm/yeah/okay)
                # from genuine interruptions — avoids cutting off thinking candidates.
                mode="adaptive",
                min_duration=1.5,
                min_words=4,
                discard_audio_if_uninterruptible=False,
                resume_false_interruption=True,
                false_interruption_timeout=3.0,
                # Suppress interruption detection at turn boundaries so candidate
                # backchannels right after agent finishes don't trigger a new turn.
                backchannel_boundary=(1.0, 3.5),
            ),
        ),
        "use_tts_aligned_transcript": False,
        "tts_text_transforms": [
            "filter_emoji",
            _tts_acronym_transform,
            _single_question_transform,
        ],
        "aec_warmup_duration": 0.5,
    }
    latest_session_usage: Optional[AgentSessionUsage] = None
    session = AgentSession(**session_kwargs)
    @session.on("session_usage_updated")
    def on_session_usage_updated(event) -> None:
        nonlocal latest_session_usage
        latest_session_usage = event.usage
        # Intentionally keep usage collection silent to avoid terminal spam.
    agent = InterviewAgent(instructions=system_prompt, chat_ctx=chat_ctx)
    participant: Optional[Any] = None
    disconnect_event = asyncio.Event()
    interview_finished_event = asyncio.Event()
    interview_marked_finished = False
    turn_count = 0
    warmup_responses_received = 0  # counts candidate responses during warmup window
    warmup_required_responses = 2  # greeting reply + explicit warmup reply -> then Stage 1
    warmup_complete = False  # True after required warmup responses are received
    # Stage interview tracker
    _current_stage_index: int = 0
    _stage_start_time: float = 0.0
    _stage_bridge_pending: bool = False
    _stage_budgets_secs: dict[int, int] = {}
    # Per-stage quota tracking: whether the mandatory situational + behavioral questions
    # have been asked. Reset when stage advances.
    _stage_situational_asked: bool = False
    _stage_behavioral_asked: bool = False
    _stage_quota_reminder_fired: bool = False  # True after mid-stage reminder injected
    _final_no_new_question_guard = False
    _candidate_turn_since_last_assistant = True
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
    launch_prereqs_signal_sent = False
    # Per-turn decision engine state
    _last_interviewer_question = ""   # most recent question Ishita asked
    _topic_follow_up_count = 0        # consecutive follow-ups on same topic
    _oai_eval_client = analysis_client  # reused client for per-turn evaluations
    answer_scores: list[dict] = []    # log of all answer quality scores for final DB save
    _topic_depth_history: list[float] = []  # depth scores per answer on current topic (reset on MOVE_ON)
    _active_resume_topic: Optional[str] = None  # current resume anchor we should rotate away from on MOVE_ON
    _active_skill_topic: Optional[str] = None  # current skill thread we should rotate away from on MOVE_ON
    _last_action_was_move_on: bool = False  # True after AI pivoted to new topic; resets follow-up counter next turn
    _collapse_stage: int = 0               # 0=none, 1=first probe issued, 2+=repeated collapse (hard flag)
    _last_depth_decay_turn: int = -999     # turn number when depth_decay last fired; -999 = never
    _question_asked_at: float = 0.0        # perf_counter() when Ishita finished speaking
    _answer_received_at: float = 0.0       # perf_counter() when candidate answer arrived
    _trust_state = init_trust_state()  # session-level trust engine state
    _contradiction_state = init_contradiction_state()  # explicit contradiction lifecycle state
    _custom_q_reminder_fired: bool = False
    _custom_q_final_reminder_fired: bool = False
    _resume_topic_questions_asked: int = 0  # stage-1 resume ownership questions asked so far
    _covered_resume_topic_keys: set[str] = set()
    _covered_skill_topic_keys: set[str] = set()
    _user_turn_chain: Optional[asyncio.Task[Any]] = None  # serialize user-turn processing
    _expected_topic_kind: Optional[str] = None  # runtime source of truth: "NEW" | "FOLLOWUP"
    _enforce_move_on_until_new: bool = False
    _last_redis_push_turn: int = -1  # dedup guard: prevents pushing same turn twice to Redis
    _forced_next_topic_hint: Optional[str] = None
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
    # Redis eval worker integration — pre-computed directive from previous turn
    _eval_redis_client = None
    if redis_asyncio is not None and REDIS_URL:
        try:
            _eval_redis_client = redis_asyncio.from_url(REDIS_URL, decode_responses=False)
            logger.info("[REDIS_EVAL] Redis eval client connected to %s", REDIS_URL)
        except Exception as _re:
            logger.warning("[REDIS_EVAL] Redis eval client init failed: %s — inline eval will be used", _re)
            _eval_redis_client = None
    def refresh_composite_risk() -> int:
        nonlocal suspicion_score
        suspicion_score = compose_risk_score(integrity_risk, depth_risk)
        return suspicion_score

    async def _publish_launch_prereqs_ready() -> None:
        """Notify frontend that launch prerequisites are complete."""
        nonlocal launch_prereqs_signal_sent
        if launch_prereqs_signal_sent or disconnect_event.is_set():
            return
        prefetch_ready = bool(
            session_context.merged_brief_block
            and stage1_directive_cached
            and session_context.resume_brief
        )
        greeting_ready = bool((welcome_text or "").strip())
        tts_warm_ready = True
        try:
            await warm_greeting_task
        except Exception as warm_err:
            # Warmup failure should not deadlock launch; greeting can still be spoken.
            tts_warm_ready = False
            logger.warning("[FLOW] Greeting TTS warmup failed before launch-ready signal: %s", warm_err)
        ready = prefetch_ready and greeting_ready and tts_warm_ready
        if not ready:
            logger.warning(
                "[FLOW] Launch prerequisites not ready yet (prefetch=%s greeting=%s tts_warm=%s)",
                prefetch_ready,
                greeting_ready,
                tts_warm_ready,
            )
            return
        payload = json.dumps(
            {
                "type": "launch_prereqs_ready",
                "ready": True,
                "prefetch_ready": prefetch_ready,
                "greeting_ready": greeting_ready,
                "tts_warm_ready": tts_warm_ready,
            }
        ).encode("utf-8")
        try:
            await ctx.room.local_participant.publish_data(payload, reliable=True)
            launch_prereqs_signal_sent = True
            logger.info("[FLOW] launch_prereqs_ready signal sent to frontend")
        except Exception as send_err:
            logger.warning("[FLOW] Failed to publish launch_prereqs_ready: %s", send_err)

    def _build_proctoring_data(exit_reason: str, *, full: bool = True) -> dict:
        """Single builder for proctoring_data dict — eliminates duplicate construction."""
        data: dict = {
            "role_category": session_context.candidate_band,
            "candidate_band": session_context.candidate_band,
            "total_turns": turn_count,
            "suspicion_score": suspicion_score,
            "environment_risk": environment_risk,
            "integrity_risk": integrity_risk,
            "depth_risk": depth_risk,
            "composite_risk": suspicion_score,
            "current_mode": current_interview_mode,
            "exit_reason": exit_reason,
            "events": proctoring_events,
            "contradiction_state": summarize_contradiction_state(_contradiction_state),
            "stage_history": session_context.stage_history,
            "stage_transition_events": _stage_transition_events,
            "total_stages_covered": _current_stage_index + 1,
        }
        if full:
            data["contradictions"] = _contradictions_found
            data["claim_index"] = _claim_index
        return data
    def _remaining_total_seconds_now() -> float:
        if session_start_time is None:
            return float(time_limit_mins * 60)
        elapsed = max(0.0, time.time() - session_start_time)
        return max(0.0, float(time_limit_mins * 60) - elapsed)

    def _initialize_stage_budgets() -> None:
        nonlocal _stage_budgets_secs
        _stage_budgets_secs = {
            0: STAGE1_BUDGET_SECONDS,
            1: max(0, int(time_limit_mins * 60) - GREETING_FIXED_SECONDS - WARMUP_FIXED_SECONDS - STAGE1_BUDGET_SECONDS - NO_NEW_QUESTION_CUTOFF_SECONDS),
        }
        logger.info(
            "[TIMER] Stage budgets — Stage1=%ds Stage2=%ds total=%ds",
            _stage_budgets_secs[0], _stage_budgets_secs[1], int(time_limit_mins * 60),
        )

    async def _advance_stage_if_due_async(now_mono: float) -> None:
        """Async stage advancement with lock protection to prevent concurrent transitions."""
        nonlocal _current_stage_index, _stage_start_time, _active_skill_topic, _stage_situational_asked, \
            _stage_behavioral_asked, _stage_quota_reminder_fired, _stage_bridge_pending
        async with _session_state_lock:
            if _current_stage_index >= len(STAGE_CONFIGS) - 1:
                return
            if _stage_start_time <= 0:
                return
            if _stage_bridge_pending:
                return
            stage_cfg = STAGE_CONFIGS[_current_stage_index]
            time_in_stage = max(0.0, now_mono - _stage_start_time)
            stage_budget = max(0, int(_stage_budgets_secs.get(_current_stage_index, 0)))
            if time_in_stage < stage_budget:
                return
            # Transition to next stage
            _stage_bridge_pending = True
            next_stage_index = _current_stage_index + 1
            next_stage = STAGE_CONFIGS[next_stage_index]
            logger.info(
                "[STAGE] Transition %s -> %s | elapsed=%ds budget=%ds reason=timeout",
                stage_cfg.label, next_stage.label, int(time_in_stage), stage_budget,
            )
            remove_system_messages(chat_ctx, f"[STAGE {_current_stage_index + 1}:")
            stage_directive = _build_stage_2_directive()
            session_context.stage_history.append({
                "stage": _current_stage_index,
                "name": stage_cfg.label,
                "seconds": int(time_in_stage),
                "budget_seconds": stage_budget,
                "transition_reason": "timeout",
            })
            _stage_transition_events.append({
                "from_stage": stage_cfg.label,
                "to_stage": next_stage.label,
                "from_index": _current_stage_index,
                "to_index": next_stage_index,
                "time_in_stage_seconds": int(time_in_stage),
                "budget_seconds": stage_budget,
                "transition_reason": "timeout",
                "at_turn": turn_count,
                "timestamp": int(time.time() * 1000),
            })
            _current_stage_index = next_stage_index
            _stage_start_time = now_mono
            _stage_bridge_pending = False
            _stage_situational_asked = False
            _stage_behavioral_asked = False
            _stage_quota_reminder_fired = False
            if _current_stage_index == 1:
                _active_skill_topic = _next_uncovered_skill_topic()
                _covered_s1 = ", ".join(list(_covered_resume_topic_keys)[:5]) if _covered_resume_topic_keys else "none yet"
                rb = session_context.resume_brief
                _all_skills = ", ".join([str(s).strip() for s in (rb.skills or [])][:8])
                logger.info(
                    "[INTERVIEW_CONTEXT] === STAGE 2 TRANSITION === Time: %dm budget remaining. "
                    "Opening skill: %s. All skills to explore: %s. Topics covered in Stage 1: %s. "
                    "Goal: probe depth on real usage, tradeoffs, ownership. "
                    "Still need: at least 1 situational + 1 behavioral question.",
                    _stage_budgets_secs.get(1, 0) // 60, _active_skill_topic or "auto-select",
                    _all_skills, _covered_s1
                )
            if stage_directive:
                chat_ctx.add_message(role="system", content=stage_directive)
                logger.info("[STAGE] Stage %d directive injected (%d chars)", _current_stage_index + 1, len(stage_directive))

    def _build_stage_2_directive() -> Optional[str]:
        rb = session_context.resume_brief
        transcript_text = " ".join(l.split(":", 1)[-1].strip().lower() for l in transcript_lines)
        covered_in_s1 = _find_covered_keywords(rb.skills + rb.projects, transcript_text)
        logger.info("[STAGE] Stage 2 build - covered in Stage 1: %s", covered_in_s1)
        directive = build_stage_2_skill_directive(
            band=session_context.candidate_band,
            resume_brief=rb,
            context_brief=session_context.merged_brief_block,
            covered_in_stage1=covered_in_s1,
            custom_questions=_pending_custom_questions() or None,
        )
        if directive:
            # Log stage 2 context in simple paragraph format
            rb = session_context.resume_brief
            _s2_skills = " | ".join([str(s).strip() for s in (rb.skills or [])][:6])
            logger.info(
                "[INTERVIEW_CONTEXT] STAGE 2 (SKILL): Probe depth on skills for %s role. "
                "Skills to explore: %s. For %s: ask real usage, tradeoffs, ownership. "
                "Must ask situational + behavioral naturally. Already covered in Stage 1: go DEEPER.",
                job_title, _s2_skills, session_context.candidate_band
            )
        return directive

    def _resume_topic_candidates() -> list[str]:
        rb = session_context.resume_brief
        # rb is always a ResumeBrief (Pydantic) — list fields always present, never None
        projects = list(rb.projects)
        work = list(rb.work_history)
        internships = list(rb.internships)
        topics: list[str] = []
        for raw in (projects + work + internships):
            txt = str(raw).strip()
            if not txt:
                continue
            topics.append(txt.split(" - ")[0].strip())
        # Deduplicate while preserving order
        unique: list[str] = []
        seen = set()
        for t in topics:
            key = t.lower()
            if key and key not in seen:
                seen.add(key)
                unique.append(t)
        return unique[:8]

    def _normalize_topic_key(text: str) -> str:
        return re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).strip()

    def _next_uncovered_resume_topic(*, exclude_topic: str | None = None) -> Optional[str]:
        topics = _resume_topic_candidates()
        if not topics:
            return None
        covered_text = " ".join(_discussed_log).lower()
        excluded_key = _normalize_topic_key(exclude_topic or "")
        for t in topics:
            topic_key = _normalize_topic_key(t)
            if not topic_key:
                continue
            if excluded_key and topic_key == excluded_key:
                continue
            if topic_key in _covered_resume_topic_keys:
                continue
            if topic_key not in covered_text:
                return t
        return None

    def _skill_topic_candidates() -> list[str]:
        rb = session_context.resume_brief
        topics: list[str] = []
        for raw in list(rb.skills):
            txt = str(raw).strip()
            if not txt:
                continue
            topics.append(txt)
        unique: list[str] = []
        seen = set()
        for t in topics:
            key = _normalize_topic_key(t)
            if key and key not in seen:
                seen.add(key)
                unique.append(t)
        return unique[:10]

    def _next_uncovered_skill_topic(*, exclude_topic: str | None = None) -> Optional[str]:
        topics = _skill_topic_candidates()
        if not topics:
            return None
        covered_text = " ".join(_discussed_log).lower()
        excluded_key = _normalize_topic_key(exclude_topic or "")
        for t in topics:
            topic_key = _normalize_topic_key(t)
            if not topic_key:
                continue
            if excluded_key and topic_key == excluded_key:
                continue
            if topic_key in _covered_skill_topic_keys:
                continue
            if topic_key not in covered_text:
                return t
        return None

    def _fallback_next_topic(*, stage_index: int, exclude_topic: str | None = None) -> str:
        """Pick a concrete next topic hint for MOVE_ON paths.

        Prefer uncovered topics, then a different listed topic, and only then a
        stage-appropriate generic bridge. This keeps the interviewer from
        falling back to a vague repeat of the same thread.
        """
        excluded_key = _normalize_topic_key(exclude_topic or "")
        if stage_index == 0:
            next_topic = _next_uncovered_resume_topic(exclude_topic=exclude_topic)
            if next_topic:
                return next_topic
            for topic in _resume_topic_candidates():
                topic_key = _normalize_topic_key(topic)
                if topic_key and topic_key != excluded_key:
                    return topic
            if _resume_topic_questions_asked >= 2:
                return "their education or training path"
            return "another resume project"

        if stage_index == 1:
            next_topic = _next_uncovered_skill_topic(exclude_topic=exclude_topic)
            if next_topic:
                return next_topic
            for topic in _skill_topic_candidates():
                topic_key = _normalize_topic_key(topic)
                if topic_key and topic_key != excluded_key:
                    return topic
            return f"a concrete example using one of the {job_title} role skills"

        return "the next relevant topic"

    def _pending_custom_questions() -> list[str]:
        return [cq.raw for cq in _custom_questions if not cq.asked]

    def _is_question_already_covered(question_text: str) -> bool:
        q = (question_text or "").strip().lower()
        if not q or not _discussed_log:
            return False
        q_words = _expand_custom_q_tokens(re.sub(r"[^a-z0-9\\s]", " ", q))
        if not q_words:
            return False
        for line in _discussed_log[-12:]:
            line_words = _expand_custom_q_tokens(re.sub(r"[^a-z0-9\\s]", " ", line.lower()))
            if not line_words:
                continue
            overlap = len(q_words & line_words) / max(1, len(q_words))
            if overlap >= 0.55:
                return True
        return False

    def _recent_discussion_anchor() -> str:
        if not _discussed_log:
            return "earlier in our discussion"
        latest = str(_discussed_log[-1]).lstrip("- ").strip()
        if ":" in latest:
            latest = latest.split(":", 1)[0].strip()
        latest = latest[:80].strip()
        if not latest:
            return "earlier in our discussion"
        return f"during our discussion on {latest}"

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
            # Grace period after readiness to tolerate transient reconnects.
            async def _candidate_disconnect_grace() -> None:
                await asyncio.sleep(5)
                if participant and participant.identity in ctx.room.remote_participants:
                    logger.info("Candidate reconnected within 5s grace window")
                    return
                disconnect_event.set()

            asyncio.create_task(_candidate_disconnect_grace())
    @ctx.room.on("participant_connected")
    def on_participant_connected(connected_participant):
        if participant and connected_participant.identity == participant.identity:
            if ready_event.is_set() or interview_marked_finished:
                logger.info("Candidate participant connected/reconnected")
    @ctx.room.on("data_received")
    def on_data_received(*event_args):
        nonlocal \
            interview_marked_finished
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
            if payload.get("type") == "interview_finished":
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
            _topic_depth_history, _trust_state, _contradiction_state, greeting_delivered_at, \
            _ai_signal_flush_counter, _ai_signal_flushed_count, _enforce_move_on_until_new, _forced_next_topic_hint, \
            _last_redis_push_turn
        try:
            if not content or role != "user":
                return
            # Block all STT processing until greeting is fully delivered
            if greeting_delivered_at is None:
                logger.info("[GREETING_BLOCK] Candidate spoke before greeting finished  -  ignoring until greeting delivered")
                return
            # --- STT text cleanup / noise suppression ---
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
                    if _GREETING_ECHO_RE.match(content) or len(content.split()) <= 2:
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
            # Ignore tiny STT fragments.
            word_count = len([w for w in content.strip().split() if w])
            if word_count <= 2:
                logger.debug(
                    f"[TRANSCRIPT] Ignoring probable STT fragment ({word_count} words): '{content[:60]}'"
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
            # Intentionally no short-answer classification branch.
            # Candidate replies should flow through normal evaluation without
            # special short-answer directives or follow-up-freeze behavior.
            # --- Per-Turn Answer Evaluator (Decision Engine) ---
            # Fires on every candidate response. Evaluates answer quality in real-time
            # and injects a NEXT_TURN_DIRECTIVE before Ishita generates her next response.
            # Decision: PROBE (which mode) or MOVE_ON - fully signal-driven, no fixed depth.
            # Warmup turns (before warmup_complete) are recorded as zero-scored placeholders
            # so they never pollute the technical or communication score averages.
            if not warmup_complete and _last_interviewer_question and turn_snapshot > 1:
                async with _session_state_lock:
                    answer_scores.append({
                        "question": _last_interviewer_question,
                        "answer": content,
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
                # ---------------------------------------------------------------
                # Redis eval worker: build payload for the worker, which will
                # compute the directive for the NEXT turn while Ishita speaks.
                # The result from the PREVIOUS turn's eval is read and applied NOW
                # so the directive is injected before LLM generation starts.
                # ---------------------------------------------------------------
                def _build_eval_payload(
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
                ) -> dict:
                    rb = session_context.resume_brief
                    resume_topics = [
                        str(raw).strip().split(" - ")[0].strip()
                        for raw in (list(rb.projects) + list(rb.work_history) + list(rb.internships))
                        if str(raw).strip()
                    ]
                    # Deduplicate while preserving order
                    seen_rt: set[str] = set()
                    unique_resume: list[str] = []
                    for t in resume_topics:
                        key = t.lower()
                        if key and key not in seen_rt:
                            seen_rt.add(key)
                            unique_resume.append(t)
                    skill_topics = [str(s).strip() for s in list(rb.skills or []) if str(s).strip()]
                    seen_st: set[str] = set()
                    unique_skills: list[str] = []
                    for s in skill_topics:
                        key = s.lower()
                        if key and key not in seen_st:
                            seen_st.add(key)
                            unique_skills.append(s)
                    return {
                        "app_id": app_id,
                        "turn": turn,
                        "answer": answer,
                        "question": question,
                        "follow_up_count": follow_ups,
                        "transcript_lines": lines[-12:],
                        "depth_history": depth_hist,
                        "collapse_stage": collapse_stage,
                        "score_history": score_history,
                        "turns_since_decay": turns_since_decay,
                        "response_latency_sec": response_latency,
                        "stage_index": _current_stage_index,
                        "follow_up_depth": follow_up_depth,
                        "signal_toggles": dict(evaluation_signal_toggles),
                        "org_id": org_id,
                        "llm_model": analysis_model,
                        "active_resume_topic": _active_resume_topic,
                        "active_skill_topic": _active_skill_topic,
                        "covered_resume_topic_keys": list(_covered_resume_topic_keys),
                        "covered_skill_topic_keys": list(_covered_skill_topic_keys),
                        "discussed_log": list(_discussed_log[-8:]),
                        "enforce_move_on_until_new": _enforce_move_on_until_new,
                        "forced_next_topic_hint": _forced_next_topic_hint,
                        "last_action_was_move_on": _last_action_was_move_on,
                        "resume_topics": unique_resume[:8],
                        "skill_topics": unique_skills[:10],
                        "job_title": job_title,
                        "remaining_seconds": float(_remaining_total_seconds_now()),
                        "resume_topic_questions_asked": _resume_topic_questions_asked,
                        "claim_index": {k: list(v) for k, v in _claim_index.items()},
                        "contradiction_state": dict(_contradiction_state),
                        "trust_state": dict(_trust_state),
                        "current_interview_mode": current_interview_mode,
                        "no_new_question_cutoff_seconds": NO_NEW_QUESTION_CUTOFF_SECONDS,
                        # ── Candidate brief (for worker logging) ──────────────────────
                        "candidate_name": candidate_name,
                        "band": session_context.candidate_band or "unknown",
                        "anchor_full": str(getattr(rb, "anchor_item", "") or ""),
                        "projects_full": [str(p) for p in list(rb.projects or [])],
                        "work_history_full": [str(w) for w in list(rb.work_history or [])],
                        "internships_full": [str(i) for i in list(rb.internships or [])],
                        "education_full": [str(e) for e in list(rb.education or [])],
                        "time_limit_mins": getattr(session_context, "timeLimitMins", 20),
                    }


                async def _push_payload_to_redis(payload: dict) -> None:
                    if _eval_redis_client is None:
                        return
                    try:
                        await _eval_redis_client.lpush(
                            "interview:eval_queue",
                            json.dumps(payload).encode(),
                        )
                        logger.info(
                            "[REDIS_EVAL] Pushed payload turn=%d to worker queue",
                            payload.get("turn", 0),
                        )
                    except Exception as _re:
                        logger.warning("[REDIS_EVAL] Failed to push payload: %s", _re)

                async def _read_and_apply_eval_result(turn_for_log: int) -> bool:
                    """Read pre-computed result from Redis and apply all mutations + inject directive.
                    Returns True if result was found and applied, False if no result available."""
                    nonlocal \
                        _active_resume_topic, _active_skill_topic, \
                        _covered_resume_topic_keys, _covered_skill_topic_keys, \
                        _topic_follow_up_count, _topic_depth_history, \
                        _collapse_stage, _last_action_was_move_on, \
                        _enforce_move_on_until_new, _forced_next_topic_hint, \
                        _expected_topic_kind, _trust_state, _contradiction_state, \
                        _claim_index, current_interview_mode, \
                        integrity_risk, depth_risk, suspicion_score, \
                        _ai_signal_flush_counter, _ai_signal_flushed_count

                    if _eval_redis_client is None:
                        return False
                    result_key = f"interview:{app_id}:eval_result"
                    try:
                        raw = await asyncio.wait_for(
                            _eval_redis_client.getdel(result_key),
                            timeout=0.5,
                        )
                    except asyncio.TimeoutError:
                        logger.warning("[REDIS_EVAL] getdel timed out for turn=%d", turn_for_log)
                        return False
                    except Exception as _re:
                        logger.warning("[REDIS_EVAL] getdel failed turn=%d: %s", turn_for_log, _re)
                        return False
                    if raw is None:
                        logger.info("[REDIS_EVAL] No pre-computed result for turn=%d — will run inline", turn_for_log)
                        return False
                    try:
                        result = json.loads(raw)
                    except Exception as _re:
                        logger.warning("[REDIS_EVAL] Failed to decode result turn=%d: %s", turn_for_log, _re)
                        return False
                    logger.info(
                        "[REDIS_EVAL] Applying pre-computed result turn=%d action=%s",
                        result.get("turn", 0), result.get("action", "?"),
                    )
                    # Apply all mutations atomically under lock
                    # (variables already declared as nonlocal in _process_user_conversation_item scope)
                    async with _session_state_lock:
                        _active_resume_topic = result.get("new_active_resume_topic", _active_resume_topic)
                        _active_skill_topic = result.get("new_active_skill_topic", _active_skill_topic)
                        _covered_resume_topic_keys = set(result.get("new_covered_resume_topic_keys") or [])
                        _covered_skill_topic_keys = set(result.get("new_covered_skill_topic_keys") or [])
                        _topic_follow_up_count = result.get("new_topic_follow_up_count", _topic_follow_up_count)
                        _topic_depth_history = result.get("new_topic_depth_history", _topic_depth_history)
                        _collapse_stage = result.get("new_collapse_stage", _collapse_stage)
                        _last_action_was_move_on = result.get("new_last_action_was_move_on", _last_action_was_move_on)
                        _enforce_move_on_until_new = result.get("new_enforce_move_on_until_new", _enforce_move_on_until_new)
                        _forced_next_topic_hint = result.get("new_forced_next_topic_hint", _forced_next_topic_hint)
                        _expected_topic_kind = result.get("new_expected_topic_kind", _expected_topic_kind)
                        _trust_state = result.get("new_trust_state") or _trust_state
                        _contradiction_state = result.get("new_contradiction_state") or _contradiction_state
                        _claim_index = {k: list(v) for k, v in (result.get("new_claim_index") or {}).items()}
                        current_interview_mode = result.get("new_current_interview_mode", current_interview_mode)
                        # Apply risk deltas
                        integrity_risk = min(100, integrity_risk + int(result.get("risk_integrity_delta", 0)))
                        depth_risk = min(100, depth_risk + int(result.get("risk_depth_delta", 0)))
                        if result.get("risk_integrity_delta", 0) or result.get("risk_depth_delta", 0):
                            refresh_composite_risk()
                        # Append discussed log entry
                        discussed_log_entry = result.get("discussed_log_entry")
                        if discussed_log_entry:
                            _discussed_log.append(discussed_log_entry)
                        # Append quality record
                        quality_record = result.get("quality_record")
                        if quality_record:
                            answer_scores.append(quality_record)
                        # Append signal events to proctoring_events
                        signal_events = result.get("signal_events") or []
                        _now_elapsed = round(time.time() - session_start_time, 1) if session_start_time else 0.0
                        res_turn = result.get("turn", turn_for_log)
                        for event in signal_events:
                            proctoring_events.append({
                                "event": event["signal_name"],
                                "signal_name": event["signal_name"],
                                "signal_layer": event.get("signal_layer", ""),
                                "risk_bucket": "integrity" if event.get("signal_layer") == "hard_integrity" else "depth",
                                "confidence": event.get("confidence", 0.5),
                                "evidence": event.get("evidence", ""),
                                "trust_bucket_affected": event.get("trust_bucket_affected", ""),
                                "score_delta": float(event.get("score_delta", 0.0) or 0.0),
                                "probe_mode": event.get("probe_mode", ""),
                                "recoverable": event.get("recoverable", True),
                                "recruiter_visible": event.get("recruiter_visible", False),
                                "turn": res_turn,
                                "elapsed_sec": _now_elapsed,
                                "score_after": suspicion_score,
                            })
                            logger.info(
                                "[SIGNAL] %s layer=%s confidence=%.2f trust_delta=%+.2f visible=%s turn=%d",
                                event["signal_name"], event.get("signal_layer", "?"),
                                event.get("confidence", 0.5), float(event.get("score_delta", 0.0) or 0.0),
                                event.get("recruiter_visible", False), res_turn,
                            )
                        # Contradiction state event
                        cs_event = result.get("contradiction_state_event")
                        if cs_event:
                            _c_status = cs_event.get("status", "")
                            _c_signal_name = "contradiction_resolved" if _c_status == "candidate_clarified" else "contradiction"
                            proctoring_events.append({
                                "event": cs_event.get("event", ""),
                                "signal_name": _c_signal_name,
                                "signal_layer": "hard_integrity",
                                "source": cs_event.get("source", ""),
                                "status": _c_status,
                                "turn": cs_event.get("turn", res_turn),
                                "surfaced_turn": cs_event.get("surfaced_turn", 0),
                                "repeat_count": cs_event.get("repeat_count", 0),
                                "probe_type": cs_event.get("probe_type", ""),
                                "recovery_path": cs_event.get("recovery_path", ""),
                                "recruiter_note": cs_event.get("recruiter_note", ""),
                                "trust_delta": cs_event.get("trust_delta", 0.0),
                                "score_delta": cs_event.get("trust_delta", 0.0),
                                "score_after": suspicion_score,
                                "confidence": 0.9,
                                "recruiter_visible": True,
                                "evidence": cs_event.get("evidence", ""),
                                "contradiction_type": cs_event.get("contradiction_type", ""),
                                "elapsed_sec": _now_elapsed,
                            })
                        # Signal checkpoint
                        new_total = len(proctoring_events)
                        _ai_signal_flush_counter += new_total - _ai_signal_flushed_count
                        if _ai_signal_flush_counter >= 5:
                            flush_slice = proctoring_events[_ai_signal_flushed_count:]
                            _ai_signal_flushed_count = new_total
                            _ai_signal_flush_counter = 0
                            spawn_background_task(
                                checkpoint_ai_signals(app_id, flush_slice),
                                f"ai_signal_checkpoint_turn_{res_turn}",
                            )
                        td = result.get("td") or {}
                        action = result.get("action", "MOVE_ON")
                        quality_record = quality_record or {}
                        quality_avg = float(quality_record.get("overall", 5.0))
                        _active_topic_now = (_active_resume_topic if _current_stage_index == 0 else _active_skill_topic) or "?"
                        stage_label_now = STAGE_CONFIGS[_current_stage_index].label if _current_stage_index < len(STAGE_CONFIGS) else "?"
                        logger.info(
                            "[EVAL] turn=%d stage=%s action=%s quality=%.1f followups=%d/%d topic='%s' covered=%d enforce_move_on=%s (worker)",
                            res_turn, stage_label_now, action, quality_avg,
                            _topic_follow_up_count, follow_up_depth,
                            _active_topic_now[:40],
                            len(_covered_resume_topic_keys) + len(_covered_skill_topic_keys),
                            _enforce_move_on_until_new,
                        )
                        if action == "MOVE_ON":
                            _old_active = (_active_resume_topic if _current_stage_index == 0 else _active_skill_topic) or "?"
                            logger.info(
                                "[MOVE_ON] FROM='%s' → TO='%s' | covered_resume=%s",
                                _old_active[:50],
                                (_active_resume_topic if _current_stage_index == 0 else _active_skill_topic or "TBD")[:50],
                                list(_covered_resume_topic_keys)[:5],
                            )
                        # Inject directive
                        directive = result.get("directive", "")
                        logger.info("[DIRECTIVE] → %s", directive[:300].replace("\n", " | "))
                        remove_system_messages(chat_ctx, "[NEXT_TURN_DIRECTIVE")
                        if action == "MOVE_ON":
                            remove_system_messages(chat_ctx, "[RECENT_CONTEXT")
                        chat_ctx.add_message(role="system", content=directive)
                        logger.info(
                            "[ROUTER] action=%s mode=%s turn=%d topic=%s follow_ups=%d (worker)",
                            td.get("decision", {}).get("action", action),
                            td.get("decision", {}).get("mode", "normal"),
                            res_turn,
                            ((_active_resume_topic if _current_stage_index == 0 else _active_skill_topic) or "?")[:40],
                            _topic_follow_up_count,
                        )
                    return True

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
                        _last_depth_decay_turn, _last_action_was_move_on, \
                        _active_resume_topic, _active_skill_topic, \
                        _ai_signal_flush_counter, _ai_signal_flushed_count, _resume_topic_questions_asked, \
                        _covered_resume_topic_keys, _covered_skill_topic_keys, _expected_topic_kind, \
                        _enforce_move_on_until_new, _forced_next_topic_hint
                    try:
                        old_active_resume = _active_resume_topic
                        old_active_skill = _active_skill_topic
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
                            uncovered_topics: list[str] = []
                            if _current_stage_index == 0:
                                nxt = _next_uncovered_resume_topic(exclude_topic=_active_resume_topic)
                                if nxt:
                                    uncovered_topics = [nxt]
                            elif _current_stage_index == 1:
                                nxt = _next_uncovered_skill_topic(exclude_topic=_active_skill_topic)
                                if nxt:
                                    uncovered_topics = [nxt]
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
                                _exclude = _active_resume_topic if _current_stage_index == 0 else _active_skill_topic
                                _fallback_next = _fallback_next_topic(
                                    stage_index=_current_stage_index,
                                    exclude_topic=_exclude,
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
                            # Build minimal fallback directive. The [TOPIC_TAG_RULE] and [STRICT_MOVE_ON_RULE]
                            # are added later in the normal post-processing flow (lines 1875+) so we don't
                            # duplicate them.
                            directive = (
                                f"[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                                f"DECISION: {_fallback_action}\n"
                                f"NEXT MOVE: {_fallback_next}"
                            )
                        action = td["decision"]["action"]
                        signal_events = td.get("signal_events", [])
                        disturbance_signal_names = {
                            "ownership_ambiguity",
                            "example_evasion",
                            "contradiction",
                        }
                        disturbance_hits = [
                            ev.get("signal_name")
                            for ev in signal_events
                            if ev.get("signal_name") in disturbance_signal_names
                        ]
                        contradiction_hit = "contradiction" in disturbance_hits
                        ownership_or_example_hit = any(
                            sig in disturbance_hits for sig in ("ownership_ambiguity", "example_evasion")
                        )
                        freeze_followup_increment = False
                        depth_signal = "SURFACE"
                        quality_avg = (
                            td["quality"]["clarity"] + td["quality"]["depth"] +
                            td["quality"]["specificity"] + td["quality"]["grounding"]
                        ) / 4.0
                        # Follow-up policy (strict, both stages):
                        # - default cap: 2 follow-ups
                        # - ownership/example clarification gets +1 allowance
                        # - contradiction clarification freezes follow-up increment
                        topic_follow_up_cap = follow_up_depth
                        if disturbance_hits:
                            action = "VERIFY"
                            td["decision"]["action"] = "VERIFY"
                            td["decision"]["mode"] = "clarification"
                            if contradiction_hit:
                                # Only contradiction can freeze follow-up progression.
                                td["decision"]["next_goal"] = (
                                    "One clarification question only. Resolve the contradiction anchored to their "
                                    "previous statement. Do not advance topic and do not consume a new follow-up slot."
                                )
                                directive = (
                                    "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                                    "DECISION: VERIFY (CLARIFICATION)\n"
                                    f"SIGNALS TRIGGERED: {', '.join(str(x) for x in disturbance_hits if x)}\n"
                                    "NEXT MOVE: Ask one concise contradiction-clarification question. "
                                    "Keep follow-up count unchanged this turn. After answer, continue from current follow-up stage.\n"
                                    "QUESTION STYLE: Human, calm, curious, specific."
                                )
                                freeze_followup_increment = True
                                logger.info(
                                    "[DISTURBANCE] Signals triggered (%s) — freezing follow-up increment for contradiction turn",
                                    ", ".join(str(x) for x in disturbance_hits if x),
                                )
                            elif ownership_or_example_hit:
                                # Ownership/example issues should clarify, but still progress.
                                # Deterministic rule: allow exactly one extra clarifier slot (cap=3)
                                # for this thread, then force move-on by cap exhaustion.
                                topic_follow_up_cap = follow_up_depth + 1
                                td["decision"]["next_goal"] = (
                                    "Ask one concise clarification question to make the answer concrete and personal. "
                                    "If still vague after this clarification flow, move on to the next topic."
                                )
                                directive = (
                                    "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                                    "DECISION: VERIFY (CLARIFICATION)\n"
                                    f"SIGNALS TRIGGERED: {', '.join(str(x) for x in disturbance_hits if x)}\n"
                                    "NEXT MOVE: Ask one concise clarification question focused on one concrete example "
                                    "and what they personally owned. Continue follow-up progression (do not freeze). "
                                    "If this is already follow-up 2+, this turn is the final clarifier before move-on.\n"
                                    "QUESTION STYLE: Human, calm, curious, specific."
                                )
                                logger.info(
                                    "[DISTURBANCE] Signals triggered (%s) — clarification without freeze (cap=%d)",
                                    ", ".join(str(x) for x in disturbance_hits if x),
                                    topic_follow_up_cap,
                                )
                        # Stage 1 resume flow: once we get one solid answer + one follow-up,
                        # pivot to a fresh resume topic to keep breadth and avoid repetitive probing.
                        if (
                            _current_stage_index == 0
                            and action in ("PROBE", "VERIFY")
                            and quality_avg >= 6.0
                            and follow_ups >= 1
                            and not disturbance_hits
                        ):
                            # Mark current topic as covered BEFORE picking next so we never return to it.
                            if old_active_resume:
                                _covered_resume_topic_keys.add(_normalize_topic_key(old_active_resume))
                            next_resume_topic = _fallback_next_topic(
                                stage_index=0,
                                exclude_topic=_active_resume_topic,
                            )
                            if next_resume_topic != "another resume project":
                                _active_resume_topic = next_resume_topic
                            action = "MOVE_ON"
                            td["decision"]["action"] = "MOVE_ON"
                            td["decision"]["next_goal"] = (
                                f"Acknowledge briefly, close the current project thread, and pivot to this next resume topic: "
                                f"{next_resume_topic}. Ask one fresh question about what they personally built, owned, or decided there. "
                                "Do not ask another follow-up on the previous project."
                            )
                            directive = (
                                "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                                "DECISION: MOVE_ON\n"
                                f"NEXT MOVE: {td['decision']['next_goal']}"
                            )
                            logger.info(
                                "[RESUME_FLOW] Stage 1 satisfied on current thread (quality=%.1f, follow_ups=%d). "
                                "Pivoting to next resume topic: %s",
                                quality_avg, follow_ups, next_resume_topic,
                            )
                        if (
                            action in ("PROBE", "VERIFY")
                            and _is_question_already_covered(question)
                        ):
                            if _current_stage_index == 0:
                                next_topic_hint = _fallback_next_topic(
                                    stage_index=0,
                                    exclude_topic=_active_resume_topic,
                                )
                                if next_topic_hint:
                                    _active_resume_topic = next_topic_hint
                            else:
                                next_topic_hint = _fallback_next_topic(
                                    stage_index=1,
                                    exclude_topic=_active_skill_topic,
                                )
                                if next_topic_hint:
                                    _active_skill_topic = next_topic_hint
                            anchor = _recent_discussion_anchor()
                            action = "MOVE_ON"
                            td["decision"]["action"] = "MOVE_ON"
                            td["decision"]["next_goal"] = (
                                f"This topic is already covered {anchor}. Acknowledge professionally, close that thread, then pivot to "
                                f"{next_topic_hint}. Ask a new question on that next topic, not a follow-up on the old one."
                            )
                            directive = (
                                "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                                "DECISION: MOVE_ON\n"
                                f"NEXT MOVE: This was already covered {anchor}. Say a short acknowledgement like "
                                f"'Thanks, I think we already covered this {anchor}' and ask one fresh question on {next_topic_hint}."
                            )
                            logger.info("[DEDUPE] Current question already covered — forcing MOVE_ON")
                        if quality_avg >= 7.0:
                            depth_signal = "DEEP"
                        elif quality_avg >= 4.5:
                            depth_signal = "SPECIFIC"
                        # Stage transitions are strictly time-driven via _advance_stage_if_due_async().
                        # Low-quality streaks can still trigger topic pivots via the evaluator, but must not advance stage.
                        # All I/O is done. Acquire lock before mutating any shared session state.
                        # This keeps background turn processing from interleaving shared counters.
                        async with _session_state_lock:
                            # Log quality score for DB persistence
                            quality_record = {
                                "question": question_snap,
                                "answer": answer_snap,
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
                                logger.info("[FOLLOWUP] New topic - counter reset")
                            # SAFEGUARD: If counter is already at cap before this evaluation, force MOVE_ON
                            # This prevents infinite loops if counter doesn't increment properly
                            if _topic_follow_up_count >= follow_up_depth:
                                action = "MOVE_ON"
                                logger.info("[FOLLOWUP] SAFEGUARD: Counter at cap (%d) before eval, forcing MOVE_ON", _topic_follow_up_count)
                            _topic_depth_history.append(td["quality"]["depth"])
                            collapse_fired = any(
                                ev.get("signal_name") == "follow_up_collapse"
                                for ev in signal_events
                            )
                            stage_label_now = STAGE_CONFIGS[_current_stage_index].label if _current_stage_index < len(STAGE_CONFIGS) else "?"
                            _active_topic_now = (_active_resume_topic if _current_stage_index == 0 else _active_skill_topic) or "?"
                            logger.info(
                                "[EVAL] turn=%d stage=%s action=%s quality=%.1f followups=%d/%d topic='%s' covered=%d enforce_move_on=%s",
                                turn, stage_label_now, action, quality_avg,
                                _topic_follow_up_count, follow_up_depth,
                                _active_topic_now[:40],
                                len(_covered_resume_topic_keys) + len(_covered_skill_topic_keys),
                                _enforce_move_on_until_new,
                            )
                            if action in ("PROBE", "VERIFY"):
                                if freeze_followup_increment:
                                    logger.info(
                                        "[FOLLOWUP] Contradiction clarification - counter frozen at %d",
                                        _topic_follow_up_count,
                                    )
                                else:
                                    _topic_follow_up_count += 1
                                    logger.info(
                                        "[FOLLOWUP] Incrementing follow-up count → %d/%d (action=%s mode=%s)",
                                        _topic_follow_up_count, follow_up_depth, action, td["decision"].get("mode", "?"),
                                    )
                                if not freeze_followup_increment:
                                    # Cap-based exhaustion (strict) + optional early quality exhaustion.
                                    last_two_low = (
                                        len(_topic_depth_history) >= 2
                                        and _topic_depth_history[-1] < 4.0
                                        and _topic_depth_history[-2] < 4.0
                                    )
                                    # After incrementing, check if we're at or past cap
                                    hard_cap_hit = _topic_follow_up_count >= topic_follow_up_cap
                                    if hard_cap_hit or (last_two_low and _topic_follow_up_count >= 2):
                                        reason_note = "cap" if hard_cap_hit else "quality exhausted"
                                        action = "MOVE_ON"
                                        # Stage transitions are strictly time-driven; MOVE_ON only pivots topic.
                                        next_stage_idx = _current_stage_index + 1
                                        if next_stage_idx < len(STAGE_CONFIGS):
                                            next_stage_label = STAGE_CONFIGS[next_stage_idx].label
                                            if _current_stage_index == 0:
                                                next_topic_hint = _fallback_next_topic(
                                                    stage_index=0,
                                                    exclude_topic=_active_resume_topic,
                                                )
                                                if next_topic_hint:
                                                    _active_resume_topic = next_topic_hint
                                            else:
                                                next_topic_hint = _fallback_next_topic(
                                                    stage_index=1,
                                                    exclude_topic=_active_skill_topic,
                                                )
                                                if next_topic_hint:
                                                    _active_skill_topic = next_topic_hint
                                            next_goal = (
                                                f"This thread is exhausted. Acknowledge briefly, close the current thread, and move on. "
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
                                        logger.info("[FOLLOWUP] Moving on - reason=%s follow_ups=%d/%d", reason_note, _topic_follow_up_count, topic_follow_up_cap)
                                        logger.info("[TOPIC] Moving to next topic = %s", next_topic_hint or "TBD")
                                        _topic_follow_up_count = 0
                                        _topic_depth_history = []
                                        _collapse_stage = 0
                                        _last_action_was_move_on = True
                                    else:
                                        logger.info("[FOLLOWUP] Probing #%d quality=%.1f", _topic_follow_up_count, quality_avg)
                                        if collapse_fired:
                                            _collapse_stage += 1
                                        elif _collapse_stage > 0 and not collapse_fired:
                                            _collapse_stage = max(0, _collapse_stage - 1)
                            else:
                                # action=MOVE_ON from run_turn_evaluation directly — compute specific next topic.
                                _topic_follow_up_count = 0
                                _topic_depth_history = []
                                _collapse_stage = 0
                                _last_action_was_move_on = True
                                if _current_stage_index == 0:
                                    if old_active_resume:
                                        _covered_resume_topic_keys.add(_normalize_topic_key(old_active_resume))
                                    _inline_next = _fallback_next_topic(stage_index=0, exclude_topic=_active_resume_topic)
                                    if _inline_next:
                                        _active_resume_topic = _inline_next
                                else:
                                    if old_active_skill:
                                        _covered_skill_topic_keys.add(_normalize_topic_key(old_active_skill))
                                    _inline_next = _fallback_next_topic(stage_index=1, exclude_topic=_active_skill_topic)
                                    if _inline_next:
                                        _active_skill_topic = _inline_next
                                _inline_goal = (
                                    f"Acknowledge briefly and pivot to: {_inline_next}. "
                                    "Ask one focused question about what they personally built or owned there. "
                                    "Do NOT follow up on the previous topic."
                                )
                                td["decision"]["next_goal"] = _inline_goal
                                directive = (
                                    "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                                    "DECISION: MOVE_ON\n"
                                    f"NEXT MOVE: {_inline_goal}"
                                )
                                logger.info("[MOVE_ON] Evaluator-driven → next_topic=%s turn=%d", _inline_next, turn)
                            if _last_action_was_move_on:
                                if _current_stage_index == 0 and old_active_resume:
                                    _covered_resume_topic_keys.add(_normalize_topic_key(old_active_resume))
                                if _current_stage_index == 1 and old_active_skill:
                                    _covered_skill_topic_keys.add(_normalize_topic_key(old_active_skill))
                            # Update depth_decay cooldown state
                            if any(ev.get("signal_name") == "depth_decay" for ev in signal_events):
                                _last_depth_decay_turn = turn
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
                                    quality_avg=quality_avg,
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
                        # If a previous MOVE_ON was not honoured (drift guard active),
                        # override any PROBE/VERIFY to MOVE_ON so the directive is fully
                        # a pivot, not a mixed "probe but also move on" message.
                        if _enforce_move_on_until_new and action in ("PROBE", "VERIFY"):
                            action = "MOVE_ON"
                            td["decision"]["action"] = "MOVE_ON"
                            forced_hint = (_forced_next_topic_hint or "").strip()
                            td["decision"]["next_goal"] = (
                                "Previous topic was exhausted. Move to a completely different topic now. "
                                + (f"Ask about: {forced_hint}." if forced_hint else "Pick the next uncovered resume/skill topic.")
                            )
                            directive = (
                                "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                                "DECISION: MOVE_ON (ENFORCED)\n"
                                f"NEXT MOVE: {td['decision']['next_goal']}"
                            )
                            logger.info("[TOPIC] Drift override - enforcing MOVE_ON (was %s)", action)
                        if action == "MOVE_ON":
                            _old_active = (_active_resume_topic if _current_stage_index == 0 else _active_skill_topic) or "?"
                            logger.info(
                                "[MOVE_ON] FROM='%s' → TO='%s' | covered_resume=%s",
                                _old_active[:50],
                                (_active_resume_topic if _current_stage_index == 0 else _active_skill_topic or "TBD")[:50],
                                list(_covered_resume_topic_keys)[:5],
                            )
                            _enforce_move_on_until_new = True
                            # Extract just the topic name from next_goal, not the full instruction text.
                            # next_goal is a long sentence; we want only the specific topic hint for STRICT_MOVE_ON_RULE.
                            _next_goal_text = (td.get("decision", {}).get("next_goal") or "").strip()
                            # Pull the short topic name: look for "pivot to: X" or "ask about: X" or first sentence fragment
                            _topic_match = re.search(r"(?:pivot to|ask about|topic:|next topic:)\s*([^.!\n]{3,60})", _next_goal_text, re.IGNORECASE)
                            if _topic_match:
                                _forced_next_topic_hint = _topic_match.group(1).strip()
                            elif _current_stage_index == 0:
                                _forced_next_topic_hint = (_active_resume_topic or "").split(" - ")[0][:60].strip() or None
                            else:
                                _forced_next_topic_hint = (_active_skill_topic or "").split(" - ")[0][:60].strip() or None
                        expected_topic_tag = "NEW" if (action == "MOVE_ON" or _enforce_move_on_until_new) else "FOLLOWUP"
                        _expected_topic_kind = expected_topic_tag
                        directive = (
                            directive
                            + "\n[TOPIC_TAG_RULE - DO NOT SAY ALOUD]\n"
                            + f"Start your next response with exactly [TOPIC:{expected_topic_tag}] on its own line. "
                            + "Then write your natural interviewer response."
                        )
                        if action == "MOVE_ON" or _enforce_move_on_until_new:
                            forced_topic = (_forced_next_topic_hint or "").strip()
                            directive = (
                                directive
                                + "\n[STRICT_MOVE_ON_RULE - DO NOT SAY ALOUD]\n"
                                + "You MUST pivot to a different topic in your very next question. "
                                + "Do NOT ask another follow-up on the same topic."
                                + (f"\nTarget next topic: {forced_topic}" if forced_topic else "")
                            )
                        # Stage boundary guard — only inject when we're close to the end or
                        # in final seconds so we don't bloat context every turn.
                        if _remaining_total_seconds_now() <= NO_NEW_QUESTION_CUTOFF_SECONDS + 30:
                            directive = (
                                directive
                                + "\n[NO_EARLY_CLOSING_GUARD — DO NOT SAY ALOUD]\n"
                                + "Do NOT end the interview, do NOT say goodbye/thanks-for-your-time/next-steps yet. "
                                + "Continue with the next interview question naturally."
                            )
                        # Stage 1 priority guard — only inject during the first 2 resume questions
                        # to prevent the LLM from asking custom/background before resume topics.
                        if _current_stage_index == 0 and _resume_topic_questions_asked < 2:
                            directive = (
                                directive
                                + "\n[STAGE_1_PRIORITY_GUARD — DO NOT SAY ALOUD]\n"
                                + "You are still in early Stage 1. Ask resume ownership/project questions only. "
                                + "Do NOT ask educational background, generic introduction, or recruiter custom questions yet. "
                                + "You may ask those only after at least 2 resume-topic questions have already been asked."
                            )
                        # Log the directive being injected (first 300 chars) for debugging
                        logger.info("[DIRECTIVE] → %s", directive[:300].replace("\n", " | "))
                        # Remove previous directive to keep context clean
                        remove_system_messages(chat_ctx, "[NEXT_TURN_DIRECTIVE")
                        # On MOVE_ON, also clear RECENT_CONTEXT so the LLM doesn't
                        # keep referencing the old topic and re-probe it next turn.
                        if action == "MOVE_ON":
                            remove_system_messages(chat_ctx, "[RECENT_CONTEXT")
                        logger.info(
                            "[ROUTER] action=%s mode=%s turn=%d topic=%s follow_ups=%d",
                            td["decision"]["action"], td["decision"].get("mode", "normal"),
                            turn,
                            ((_active_resume_topic if _current_stage_index == 0 else _active_skill_topic) or "?")[:40],
                            _topic_follow_up_count,
                        )
                        chat_ctx.add_message(role="system", content=directive)
                    except Exception as e:
                        logger.warning(f"[EVAL] Evaluator injection failed turn={turn_snapshot}: {e}", exc_info=True)
                # Redis eval worker flow:
                # 1. DEDUP GUARD FIRST — Deepgram fires 2 transcripts per turn. The guard must
                #    wrap the ENTIRE eval block, not just the push, otherwise the 2nd transcript
                #    runs a 4s inline eval even when the turn was already processed.
                # 2. Apply pre-computed result from worker (~10ms Redis GET) — or inline fallback.
                # 3. Push payload to worker AFTER mutations applied so state is current.
                if _last_redis_push_turn == turn_snapshot:
                    logger.info("[REDIS_EVAL] Duplicate STT transcript for turn=%d — skipping eval", turn_snapshot)
                else:
                    _last_redis_push_turn = turn_snapshot
                    result_applied = await _read_and_apply_eval_result(turn_snapshot)
                    if not result_applied:
                        logger.info("[REDIS_EVAL] No worker result — running inline eval turn=%d", turn_snapshot)
                        await _evaluate_and_inject()
                    # Build payload AFTER mutations so enforce_move_on, active_topic etc. are current.
                    _payload = _build_eval_payload()
                    spawn_background_task(
                        _push_payload_to_redis(_payload),
                        f"redis_eval_push_turn_{turn_snapshot}",
                    )


        except Exception as e:
            logger.debug(f"[TRANSCRIPT] User item processing failed: {e}")
    @session.on("conversation_item_added")
    def on_conversation_item_added(event) -> None:
        nonlocal session_start_time, turn_count, \
            _last_interviewer_question, _topic_follow_up_count, _topic_depth_history, _last_action_was_move_on, \
            _question_asked_at, _answer_received_at, warmup_responses_received, warmup_complete, llm_spoke_event, _stage_start_time, _candidate_turn_since_last_assistant, \
            _stage_situational_asked, _stage_behavioral_asked, \
            _custom_q_reminder_fired, _custom_q_final_reminder_fired, _resume_topic_questions_asked, _user_turn_chain, _expected_topic_kind, _enforce_move_on_until_new, _forced_next_topic_hint, \
            _active_resume_topic
        try:
            item = event.item
            role = getattr(item, "role", None)
            content = item.text_content
            if role == "assistant":
                # Read model-emitted topic tag from raw output (telemetry only).
                raw_content = content or ""
                emitted_topic_tag = None
                for _raw_line in raw_content.splitlines():
                    _stripped = _raw_line.strip()
                    tag_match = re.search(r"\[TOPIC\s*:\s*(NEW|FOLLOWUP)", _stripped, re.IGNORECASE)
                    if tag_match:
                        emitted_topic_tag = tag_match.group(1).upper()
                        break
                # Apply/consume topic expectation only on substantive assistant turns.
                # LiveKit can emit assistant items with empty/control content before the
                # real question text; consuming expectation there causes follow-up drift.
                _assistant_text = (raw_content or "").strip()
                _is_substantive_assistant_turn = bool(_assistant_text) and _assistant_text != "<wait for response>"
                if _is_substantive_assistant_turn:
                    # Check drift FIRST before resetting counters, so we know if the AI complied.
                    _drift_detected = (
                        _expected_topic_kind == "NEW"
                        and emitted_topic_tag is not None
                        and emitted_topic_tag != "NEW"
                    )
                    if _expected_topic_kind and emitted_topic_tag and emitted_topic_tag != _expected_topic_kind:
                        logger.warning("[TOPIC_DRIFT] expected=%s emitted=%s", _expected_topic_kind, emitted_topic_tag)
                        if _drift_detected:
                            # AI ignored MOVE_ON — keep MOVE_ON state alive, inject hard directive.
                            _enforce_move_on_until_new = True
                            _topic_follow_up_count = 0
                            _topic_depth_history = []
                            _last_action_was_move_on = True
                            remove_system_messages(chat_ctx, "[RECENT_CONTEXT")
                            remove_system_messages(chat_ctx, "[NEXT_TURN_DIRECTIVE")
                            _forced_hint = (_forced_next_topic_hint or "").strip()
                            chat_ctx.add_message(role="system", content=(
                                "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                                "DECISION: MOVE_ON (RUNTIME GUARD)\n"
                                "NEXT MOVE: You must ask about a different topic in your very next question. "
                                "Do not ask another follow-up on the previous thread."
                                + (f"\nTarget next topic: {_forced_hint}" if _forced_hint else "")
                                + "\n[TOPIC_TAG_RULE - DO NOT SAY ALOUD]\n"
                                "Start your next response with exactly [TOPIC:NEW] on its own line."
                            ))
                            logger.warning("[TOPIC_DRIFT] Applied runtime guard to force next turn pivot")
                    elif _expected_topic_kind and not emitted_topic_tag:
                        logger.warning("[TOPIC_DRIFT] expected=%s emitted=NONE", _expected_topic_kind)
                        if _expected_topic_kind == "NEW":
                            _enforce_move_on_until_new = True
                    elif emitted_topic_tag == "NEW":
                        # AI complied — clear drift guard and reset counters for fresh topic.
                        _enforce_move_on_until_new = False
                        _enforce_hint_snapshot = _forced_next_topic_hint
                        _forced_next_topic_hint = None
                        _topic_follow_up_count = 0
                        _topic_depth_history = []
                        _last_action_was_move_on = False
                        _active_now = (_active_resume_topic if _current_stage_index == 0 else _active_skill_topic) or "?"
                        logger.info(
                            "[TOPIC] NEW confirmed — active_topic='%s' | expected_next='%s' | content_preview='%s'",
                            _active_now[:50],
                            (_enforce_hint_snapshot or "none")[:50],
                            _assistant_text[:80],
                        )
                    elif _expected_topic_kind == "NEW" and not _drift_detected:
                        # Expected NEW, got NEW (covered above) or no tag — reset counters.
                        _topic_follow_up_count = 0
                        _topic_depth_history = []
                        _last_action_was_move_on = False
                        logger.info("[TOPIC] New topic confirmed — counter reset")
                    elif _expected_topic_kind == "FOLLOWUP":
                        logger.debug("[TOPIC] expected=FOLLOWUP -> counter stays at %d", _topic_follow_up_count)
                    else:
                        logger.debug("[TOPIC] no expected topic kind set -> state unchanged (%d)", _topic_follow_up_count)

                    # Consume expectation after substantive assistant turn only.
                    _expected_topic_kind = None
                else:
                    logger.debug(
                        "[TOPIC] assistant control/empty turn -> deferring expectation consume (expected=%s)",
                        _expected_topic_kind or "NONE",
                    )
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
                # ── Phase 1 → Phase 2: keep warmup as an explicit exchange
                # before Stage 1 begins.
                # INTERVIEW PHASE GATE: candidate speech is fully blocked until greeting
                # audio has finished playing. warmup_responses_received will never
                # increment while greeting_delivered_at is None.
                if not warmup_complete and greeting_delivered_at is None:
                    logger.info("[GATE] Candidate spoke during greeting — BLOCKED (interview phase not open yet)")
                    return
                if not warmup_complete:
                    warmup_responses_received += 1
                    logger.info(
                        "[FLOW] Warmup response %d/%d received",
                        warmup_responses_received,
                        warmup_required_responses,
                    )
                    if warmup_responses_received >= warmup_required_responses:
                        logger.info("[FLOW] Warmup complete ✓ — ENTERING STAGE 1")
                        warmup_complete = True
                        remove_system_messages(chat_ctx, "[WARMUP PHASE]")
                        stage1_directive = stage1_directive_cached or build_stage_1_resume_directive(
                            band=session_context.candidate_band,
                            resume_brief=session_context.resume_brief,
                        )
                        chat_ctx.add_message(role="system", content=stage1_directive)
                        chat_ctx.add_message(
                            role="system",
                            content=(
                                "[STAGE_1_PRIORITY_GUARD — DO NOT SAY ALOUD]\n"
                                "Your FIRST question must be about the resume anchor project. "
                                "Do NOT ask educational background, generic introduction, or recruiter custom questions first. "
                                "Start by asking what they personally built or owned in the anchor project listed above."
                            ),
                        )
                        _active_resume_topic = (
                            str(getattr(session_context.resume_brief, "anchor_item", "") or "").split(" - ", 1)[0].strip()
                            or (_resume_topic_candidates()[0] if _resume_topic_candidates() else None)
                        )
                        _stage_start_time = time.monotonic()
                        stage1_budget = _stage_budgets_secs.get(0, 0)
                        logger.info("[STAGE1] ========== STAGE 1 RESUME PHASE STARTED ==========")
                        logger.info("[STAGE1] Budget: %d seconds (%.1f min)", stage1_budget, stage1_budget/60)
                        logger.info("[STAGE1] Opening topic (anchor): %s", _active_resume_topic or "auto-select")
                        logger.info("[STAGE1] Max follow-ups per topic: 2 (default)")
                        logger.info("[STAGE1] Skills to explore: %s", session_context.resume_brief.skills[:3] if session_context.resume_brief.skills else "auto")
                        logger.info("[STAGE1] Start interviewing now - ask about: '%s'", _active_resume_topic or "their background")
                        logger.info("[STAGE1] All resume topic candidates: %s", _resume_topic_candidates())
                        # Pre-seed Redis with a correct Stage 1 bootstrap directive.
                        # At the first real answer (follow_up_count=0 on the anchor), PROBE is always
                        # correct — we can't know quality yet, but we know we should probe the anchor
                        # before moving on. Pure Redis SETEX (~50ms, no LLM call). By the time the
                        # candidate finishes their first real answer, this is already in Redis and the
                        # fast path fires instead of the 2s inline eval.
                        _bootstrap_anchor = _active_resume_topic or "the anchor project"
                        _bootstrap_directive = (
                            f"[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                            f"DECISION: PROBE\n"
                            f"NEXT MOVE: Dig deeper into {_bootstrap_anchor}. Ask one specific question about "
                            f"what they personally built, decided, or owned. Focus on their role, the problem "
                            f"they solved, and the outcome. Do NOT move on yet.\n"
                            f"[TOPIC_TAG_RULE - DO NOT SAY ALOUD]\n"
                            f"Start your next response with exactly [TOPIC:FOLLOWUP] on its own line."
                        )
                        _bootstrap_result = {
                            "turn": turn_count + 1,
                            "action": "PROBE",
                            "directive": _bootstrap_directive,
                            "new_active_resume_topic": _bootstrap_anchor,
                            "new_active_skill_topic": None,
                            "new_covered_resume_topic_keys": [],
                            "new_covered_skill_topic_keys": [],
                            "new_topic_follow_up_count": 1,
                            "new_topic_depth_history": [],
                            "new_collapse_stage": 0,
                            "new_last_action_was_move_on": False,
                            "new_enforce_move_on_until_new": False,
                            "new_forced_next_topic_hint": None,
                            "new_expected_topic_kind": "FOLLOWUP",
                            "new_trust_state": None,
                            "new_contradiction_state": None,
                            "new_claim_index": None,
                            "new_current_interview_mode": current_interview_mode,
                            "risk_integrity_delta": 0,
                            "risk_depth_delta": 0,
                            "discussed_log_entry": None,
                            "quality_record": None,
                            "signal_events": [],
                            "contradiction_state_event": None,
                            "td": {"decision": {"action": "PROBE", "mode": "normal", "next_goal": f"Probe {_bootstrap_anchor}"}, "quality": {}},
                        }
                        async def _preseed_redis_bootstrap(result=_bootstrap_result, anchor=_bootstrap_anchor):
                            if _eval_redis_client is None:
                                return
                            try:
                                result_key = f"interview:{app_id}:eval_result"
                                await _eval_redis_client.setex(result_key, 1800, json.dumps(result).encode())
                                logger.info("[REDIS_EVAL] Bootstrap PROBE pre-seeded for first real answer — topic='%s'", anchor)
                            except Exception as _be:
                                logger.warning("[REDIS_EVAL] Bootstrap pre-seed failed: %s", _be)
                        spawn_background_task(_preseed_redis_bootstrap(), "redis_bootstrap_stage1")
                # Append candidate response to transcript before background processing
                candidate_text = content.replace("<wait for response>", "").strip()
                if candidate_text:
                    append_transcript_line("Candidate", candidate_text)
                    logger.info(f"[TRANSCRIPT] Candidate: {candidate_text[:60]}...")
                turn_snapshot = turn_count
                prev_chain = _user_turn_chain
                async def _run_user_turn_serialized():
                    if prev_chain:
                        try:
                            await prev_chain
                        except Exception:
                            # Previous turn failure should not block next turn processing
                            pass
                    await _process_user_conversation_item(event, content, role, turn_snapshot)
                _user_turn_chain = spawn_background_task(
                    _run_user_turn_serialized(),
                    f"process_user_turn_serial_{turn_snapshot}",
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
                if _current_stage_index == 0 and _last_interviewer_question:
                    _q_l = _last_interviewer_question.lower()
                    _is_background = bool(_BACKGROUND_EARLY_RE.search(_q_l))
                    _is_custom_like = False
                    if _custom_questions:
                        _asked_words_q = _expand_custom_q_tokens(re.sub(r"[^a-z0-9\\s]", " ", _q_l))
                        for _cq_for_count in _custom_questions:
                            _cq_words_for_count = _expand_custom_q_tokens(_cq_for_count.normalized)
                            if _cq_words_for_count and len(_cq_words_for_count.intersection(_asked_words_q)) >= 2:
                                _is_custom_like = True
                                break
                    if not _is_background and not _is_custom_like:
                        _resume_topic_questions_asked += 1
                        logger.info(
                            "[STAGE1] Resume-topic question count: %d",
                            _resume_topic_questions_asked,
                        )
                # Detect whether this assistant turn contained a situational or behavioral question
                # so we know if the mandatory quota has been fulfilled for the current stage.
                if _SITUATIONAL_RE.search(clean_content):
                    if not _stage_situational_asked:
                        logger.info("[QUOTA] Situational question detected in assistant turn — quota fulfilled for this stage")
                    _stage_situational_asked = True
                if _BEHAVIORAL_RE.search(clean_content):
                    if not _stage_behavioral_asked:
                        logger.info("[QUOTA] Behavioral question detected in assistant turn — quota fulfilled for this stage")
                    _stage_behavioral_asked = True
                # Detect which custom questions were asked in this assistant turn.
                # Match by checking if the key words of each custom question appear in the output.
                if _custom_questions:
                    _q_lower = clean_content.lower()
                    _asked_words = _expand_custom_q_tokens(re.sub(r"[^a-z0-9\\s]", " ", _q_lower))
                    for _cqi, _cq in enumerate(_custom_questions):
                        if _cq.asked:
                            continue
                        _cq_words = _expand_custom_q_tokens(_cq.normalized)
                        if not _cq_words:
                            continue
                        ratio = len(_cq_words & _asked_words) / max(1, len(_cq_words))
                        if _cq.normalized in _q_lower or ratio >= 0.34:
                            _cq.asked = True
                            _discussed_log.append(f"- custom question covered: {_cq.raw[:80]}")
                            logger.info(
                                "[FLOW] Custom question %d/%d marked covered: '%s'",
                                _cqi + 1, len(_custom_questions), _cq.raw[:100],
                            )
                    _unasked_count = sum(1 for cq in _custom_questions if not cq.asked)
                    logger.debug(
                        "[CUSTOM_Q] Coverage after this turn: %d/%d asked, %d remaining",
                        len(_custom_questions) - _unasked_count, len(_custom_questions), _unasked_count,
                    )
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
                _now_mono = time.monotonic()
                spawn_background_task(
                    _advance_stage_if_due_async(_now_mono),
                    "advance_stage_check",
                )
            # --- Periodic auto-save every 5 turns to prevent data loss ---
            if len(transcript_lines) > 0:
                start_t = session_start_time
                lines_snapshot = list(transcript_lines)
                app_id_snap = app_id
                async def _periodic_save():
                    try:
                        await persist_transcript(app_id_snap, lines_snapshot, start_t)
                        logger.info(
                            f"[PERSIST] Transcript auto-saved at {len(lines_snapshot)} lines"
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
            proctoring_data = _build_proctoring_data("no_show_timeout", full=False)
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
    # Launch gate: candidate stays on launching screen until backend says
    # prefetch + greeting prerequisites are ready, then greeting starts.
    # _interview_timer_start is set the moment greeting audio begins so the
    # 20-minute window covers greeting + warmup + interview together.
    _interview_timer_start: float = time.monotonic()  # safe fallback; overwritten below
    if not disconnect_event.is_set():
        await _publish_launch_prereqs_ready()
        ready_event.set()
    if ready_event.is_set() and not disconnect_event.is_set():
        _initialize_stage_budgets()
        logger.info(
            "[FLOW] Session started — candidate=%s role=%s band=%s tts=%s llm=%s boot=%dms",
            candidate_name, job_title, session_context.candidate_band,
            org_tts_provider, org_llm_model,
            int((time.perf_counter() - entry_started_at) * 1000),
        )
        # Mark as started in DB while greeting starts immediately.
        spawn_background_task(mark_interview_started(app_id), "mark_interview_started")
        # ── TIMER FIX: Start the 20-minute clock the moment greeting audio begins.
        # Greeting + warmup + interview all count against the same 20-minute budget.
        # This timestamp is used by session_loop_start (main loop) and session_start_time
        # (transcript timestamps + remaining-time calculations).
        _interview_timer_start = time.monotonic()
        session_start_time = time.time()
        try:
            logger.info("[FLOW] Greeting started — 20-min interview timer begins NOW")
            # Only deliver scripted welcome if the LLM hasn't already spoken
            # (prevents double-greeting when candidate says hello first)
            if llm_spoke_event.is_set():
                logger.info(
                    "[FLOW] LLM spoke first — skipping scripted greeting"
                )
                greeting_delivered_at = time.time()
            else:
                # Retry loop: Sarvam TTS WebSocket can fail on the very first
                # synthesis call if the connection was recycled during startup.
                # We retry up to 3 times with a short backoff before giving up.
                greeting_delivered = False
                for _attempt in range(3):
                    try:
                        # allow_interruptions=False for greeting prevents 'break voice' from echo bleed
                        await session.say(welcome_text, allow_interruptions=False)
                        greeting_delivered = True
                        greeting_delivered_at = time.time()
                        # session_start_time already set above at greeting-begin — do NOT overwrite here
                        logger.info("[FLOW] Greeting completed — warmup phase begins")
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
                logger.info("[FLOW] STT unblocked after greeting")
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
        """Return a context-aware inactivity nudge using the module-level strategy map."""
        name = candidate_first_name or candidate_name
        q = _last_interviewer_question or ""
        for pattern, messages in _NUDGE_STRATEGIES:
            if pattern is None or pattern.search(q):
                return messages[inactivity_nudge_count % len(messages)].format(name=name)
        return ""  # unreachable — last strategy always has pattern=None
    # Use the greeting-begin timestamp so `remaining` counts from when greeting started,
    # NOT from when the greeting audio finished. This makes the 20-min window exact.
    session_loop_start = _interview_timer_start
    _last_periodic_stage_check = time.monotonic()
    _last_timer_log = time.monotonic()
    while True:
        elapsed = time.monotonic() - session_loop_start
        remaining = total_seconds - elapsed
        if finished_task.done() or disconnected_task.done():
            break
        if remaining <= 0:
            break
        _now = time.monotonic()
        # Log remaining time every 60s so it's visible in terminal
        if _now - _last_timer_log >= 60.0:
            stage_label = STAGE_CONFIGS[_current_stage_index].label if _current_stage_index < len(STAGE_CONFIGS) else "?"
            logger.info("[TIMER] remaining=%.0fs stage=%s(%d) turn=%d", remaining, stage_label, _current_stage_index + 1, turn_count)
            _last_timer_log = _now
        # Periodic stage advance every 10s
        if warmup_complete and _now - _last_periodic_stage_check >= 10.0:
            await _advance_stage_if_due_async(_now)
            _last_periodic_stage_check = _now
        # Mid-stage quota reminder: fires once at 50% of the current stage budget
        # if the mandatory situational or behavioral question hasn't been asked yet.
        if (
            warmup_complete
            and not _stage_quota_reminder_fired
            and _stage_start_time > 0
            and not is_agent_speaking
        ):
            _stage_budget = _stage_budgets_secs.get(_current_stage_index, 0)
            _time_in_stage = _now - _stage_start_time
            if _stage_budget > 0 and _time_in_stage >= _stage_budget * 0.5:
                _missing = []
                if not _stage_situational_asked:
                    _missing.append("situational")
                if not _stage_behavioral_asked:
                    _missing.append("behavioral")
                if _missing:
                    _quota_msg = ", ".join(_missing)
                    remove_system_messages(chat_ctx, "[QUOTA REMINDER]")
                    chat_ctx.add_message(
                        role="system",
                        content=(
                            f"[QUOTA REMINDER — DO NOT SAY ALOUD]\n"
                            f"You are halfway through this stage and have not yet asked the mandatory "
                            f"{_quota_msg} question(s). You MUST ask {'them' if len(_missing) > 1 else 'it'} "
                            f"before this stage ends. Weave it in naturally on your next 1-2 turns — "
                            f"do not announce it or break the conversational flow."
                        ),
                    )
                    logger.info("[FLOW] Quota reminder — missing: %s", _quota_msg)
                _stage_quota_reminder_fired = True
        # Custom question coverage reminder — fires at 75% of total interview time if any
        # custom questions are still unasked. This is a hard nudge: they MUST be asked.
        if (
            warmup_complete
            and _custom_questions
            and not _custom_q_reminder_fired
            and not is_agent_speaking
        ):
            _total_secs = float(time_limit_mins * 60)
            _elapsed = _total_secs - remaining
            if _elapsed >= _total_secs * 0.75:
                _unasked_cqs = [f"{i+1}. {cq.raw}" for i, cq in enumerate(_custom_questions) if not cq.asked]
                if _unasked_cqs:
                    remove_system_messages(chat_ctx, "[CUSTOM Q REMINDER]")
                    chat_ctx.add_message(
                        role="system",
                        content=(
                            f"[CUSTOM Q REMINDER — DO NOT SAY ALOUD]\n"
                            f"The recruiter REQUIRES these questions to be asked before the interview ends. "
                            f"You have not asked them yet. Ask each one naturally within the next few turns — "
                            f"weave them into the conversation, do not announce them as special questions:\n"
                            f"{chr(10).join(_unasked_cqs)}"
                        ),
                    )
                    logger.info(
                        "[FLOW] Custom Q 75%% reminder fired — %d unasked: %s",
                        len(_unasked_cqs),
                        [cq.raw[:80] for cq in _custom_questions if not cq.asked][:3],
                    )
                else:
                    logger.info("[FLOW] Custom Q 75%% checkpoint — all custom questions already asked")
                _custom_q_reminder_fired = True
        # Final-window custom question reminder — fires when <60s remain if any still unasked.
        # At this point it's urgent: ask NOW, not gradually.
        if (
            warmup_complete
            and _custom_questions
            and not _custom_q_final_reminder_fired
            and not is_agent_speaking
            and remaining <= 60.0
        ):
            _unasked_cqs_final = [f"{i+1}. {cq.raw}" for i, cq in enumerate(_custom_questions) if not cq.asked]
            if _unasked_cqs_final:
                remove_system_messages(chat_ctx, "[CUSTOM Q REMINDER]")
                chat_ctx.add_message(
                    role="system",
                    content=(
                        f"[CUSTOM Q REMINDER — DO NOT SAY ALOUD]\n"
                        f"URGENT — less than 60 seconds remain. These recruiter-required questions have NOT been asked yet. "
                        f"Ask them immediately. Keep each one brief and natural:\n"
                        f"{chr(10).join(_unasked_cqs_final)}"
                    ),
                )
                logger.info(
                    "[FLOW] Custom Q final-window reminder fired — %d still unasked",
                    len(_unasked_cqs_final),
                )
            else:
                logger.info("[FLOW] Custom Q final-window checkpoint — all custom questions covered")
            _custom_q_final_reminder_fired = True
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
                "[TIMER] Final window active — remaining=%.1fs",
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
                "Thank you for your time today. I'm ending the session now, and I wish you all the best."
            )
        else:
            goodbye_text = (
                f"That concludes our interview, {candidate_first_name or candidate_name}. "
                "Thank you for joining today. I'm ending the session now, and I wish you all the best."
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
    proctoring_data = _build_proctoring_data(
        "time_expired" if time_expired else "interview_finished"
    )
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
        f"[TRUST] Final — score={_trust_state['trust_score']} "
        f"integrity={_trust_state['integrity_band']} "
        f"quality={_trust_state['quality_band']} "
        f"trend={_trust_state['trend']} "
        f"recommendation={recruiter_summary['recommendation']}"
    )
    logger.info("[PERSIST] Saving final transcript (%d lines) and scores (%d turns)", len(transcript_lines), len(answer_scores))
    await persist_transcript(
        app_id,
        transcript_lines,
        session_start_time,
        proctoring_data=proctoring_data,
        final_status="COMPLETED",
    )
    await persist_answer_scores(app_id, answer_scores)
    logger.info("[PERSIST] Transcript and scores saved")
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
                    proctoring_data=proctoring_data,
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
