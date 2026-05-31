import asyncio
import json
import time
import asyncpg
from typing import Optional, Any
import re
from dataclasses import replace
try:
    import redis.asyncio as redis_asyncio  # type: ignore[import-untyped]
except Exception:  # pragma: no cover - optional dependency
    redis_asyncio = None
from interview.agent_utils import (
    _coerce_jsonish,
    _compact_optional,
    parse_dispatch_metadata,
    build_interview_turns,
    first_name_from_full_name,
)
from interview.agent_profile_context import (
    CandidateBandContext,
    build_merged_interview_brief,
    build_resume_brief,
    infer_candidate_band,
    refresh_candidate_band_context,
)
from interview.resume_context_parser import parse_resume_context
from interview.interview_phases import (
    build_greeting_text,
    build_warmup_directive,
    build_interview_directive,
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
    checkpoint_ai_signals,
    flush_pending_manual_billing,
    generate_interview_report,
    generate_interview_summary,
    get_interview_context,
    mark_interview_started,
    persist_answer_scores,
    persist_interview_billing_snapshot,
    persist_org_manual_billing_usage,
    persist_org_usage_metrics,
    persist_skill_ratings,
    persist_transcript,
    update_interview_status,
)
from interview.agent_scoring import (
    notify_sync_engine,
)
from pydantic import BaseModel, field_validator
from interview.agent_runtime_helpers import (
    _build_recent_context_block,
    _single_question_transform,
    _tts_acronym_transform,
    remove_system_messages,
    remove_system_messages_multi,
    sanitize_candidate_facing_text,
    tts_phonetic_processor,
)
from interview.agent_runtime_support import (
    INTERVIEW_TEMPERATURE,
    DEFAULT_VOICE_ID,
    EVAL_LLM_MODEL,
    INTERVIEW_LLM_MODEL,
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
    NOT_GIVEN,
    TurnHandlingOptions,
    llm,
)
from livekit.agents.metrics import AgentSessionUsage
from livekit.agents.voice import room_io
from livekit.agents.voice.turn import EndpointingOptions, InterruptionOptions
from interview.trust_engine import finalize_trust_state
from interview.session_state import init_trust_state
from interview.recruiter_summary import build_recruiter_summary
from interview.prompt_layers import (
    build_voice_layer_prompt,
    build_evaluation_layer_prompt,
    build_system_prompt,
)

FINAL_WINDOW_SECONDS = 45

# Custom-question normalisation constants  module-level so they are allocated once.
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

# Language codes for STT and TTS  keyed by DB language field value.
_LANGUAGE_CODES: dict[str, dict[str, str]] = {
    "English": {"stt": "en-US", "tts": "en"},
    "Hindi":   {"stt": "hi",    "tts": "hi"},
}

# TTS provider lookup tables  O(1) replacement for if/elif chains.
_TTS_DEFAULT_MODELS: dict[str, str] = {
    "SARVAM":     "bulbul:v3",
    "ELEVENLABS": "eleven_turbo_v2_5",
    "CARTESIA":   "cartesia/sonic-3",
}

# Compiled once  matches greeting echo fragments that leak back into STT after AI speaks.
_GREETING_ECHO_RE = re.compile(
    r"^\s*(?:hi|hello|hey|okay|ok|yeah|yes|yep|mmhmm|mhm|good morning|good afternoon)\s*$",
    re.IGNORECASE,
)

# STT noise-suppression helpers  compiled at import time.
_STT_WHITESPACE_RE = re.compile(r"\s+")
_STT_NON_ALPHA_RE = re.compile(r"[^a-zA-Z]")
_STT_VOWEL_RE = re.compile(r"[aeiou]")

# TTS sentence boundary  compiled once at module level (not per tts_node call).
_TTS_SENT_END_RE = re.compile(r'(?<=[.?!])\s+')



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
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._pending_eval_task: Optional[asyncio.Task] = None
        # Cleared when a user turn arrives, set after directive is injected.
        # llm_node waits on this before generating the real interview question.
        self._directive_ready: asyncio.Event = asyncio.Event()
        self._directive_ready.set()  # starts set â€” no blocking until first candidate answer

    @staticmethod
    def _latest_system_message_with_marker(
        chat_ctx: llm.ChatContext,
        marker: str,
    ) -> str:
        for msg in reversed(chat_ctx.messages()):
            if msg.role != "system":
                continue
            text = (msg.text_content or "").strip()
            if marker in text:
                return text
        return ""

    def _select_turn_temperature(self, chat_ctx: llm.ChatContext) -> tuple[float, str]:
        """Pick LLM temperature by turn role using lightweight prompt-state heuristics."""
        final_window_signal = self._latest_system_message_with_marker(
            chat_ctx, "[SYSTEM ALERT: FINAL WINDOW]"
        )
        if final_window_signal:
            return (INTERVIEW_TEMPERATURE, "greeting_rapport_closing")

        short_directive = self._latest_system_message_with_marker(
            chat_ctx, "[SHORT_RESPONSE_DIRECTIVE"
        )
        meta_directive = self._latest_system_message_with_marker(
            chat_ctx, "[META_QUESTION_DIRECTIVE"
        )
        if short_directive or meta_directive:
            return (INTERVIEW_TEMPERATURE, "greeting_rapport_closing")

        next_turn_directive = self._latest_system_message_with_marker(
            chat_ctx, "[NEXT_TURN_DIRECTIVE"
        )
        if next_turn_directive:
            return (INTERVIEW_TEMPERATURE, "interview_normal")

        warmup_directive = self._latest_system_message_with_marker(
            chat_ctx, "[WARMUP PHASE]"
        )
        if warmup_directive:
            return (INTERVIEW_TEMPERATURE, "greeting_rapport_closing")

        return (INTERVIEW_TEMPERATURE, "adaptive_listener_core")

    async def llm_node(self, chat_ctx, tools, model_settings):
        activity = self._get_activity_or_raise()
        assert activity.llm is not None, "llm_node called but no LLM node is available"
        assert isinstance(activity.llm, llm.LLM), (
            "llm_node should only be used with LLM (non-multimodal/realtime APIs) nodes"
        )

        # Wait ONLY for eval directive â€” bridge is optional and non-blocking.
        # _directive_ready is cleared on user turn arrival, set after PROBE/MOVE_ON injected.
        # Bridge plays in background independently â€” real question starts when eval is ready,
        # not when bridge finishes. LiveKit handles audio queuing naturally.
        # CRITICAL: always use self.chat_ctx â€” LiveKit passes a stale .copy() snapshot.
        #
        # Wait long enough for STT_BUFFER debounce + SYNC_GATE to complete before checking
        # the gate. Without this, llm_node fires before _directive_ready is cleared and before
        # the SYNC_GATE can apply MOVE_ON/PROBE directive from the eval worker.
        #
        # Timing breakdown (from logs):
        #   T+0ms   â€” candidate finishes speaking, LiveKit triggers llm_node
        #   T+0ms   â€” LLM_GATE check: _directive_ready is still SET (old PROBE) â†’ LLM fires early
        #   T+300ms â€” STT_BUFFER debounce fires, _directive_ready.clear()
        #   T+370ms â€” SYNC_GATE pre-check fetches eval result (~70ms after debounce)
        #   T+380ms â€” MOVE_ON/PROBE directive injected, _directive_ready.set()
        #
        # Fix: sleep 0.4s before checking gate â†’ LLM always waits for directive to be updated.
        # 0.4s is imperceptible to the user (< half a second after they finish speaking).
        await asyncio.sleep(0.4)
        timed_out = False
        try:
            await asyncio.wait_for(self._directive_ready.wait(), timeout=15.0)
            logger.info("[LLM_GATE] âœ… directive ready")
        except asyncio.TimeoutError:
            timed_out = True
            logger.warning("[LLM_GATE] â° timed out (15s) â€” generating anyway")

        effective_ctx = self.chat_ctx

        # MOVE_ON guard: if a MOVE_ON directive is present, strip ALL user+assistant
        # messages from context before the LLM generates. This prevents the candidate's
        # last answer (added by LiveKit pipeline AFTER our history wipe) from anchoring
        # the LLM back to the old topic. The MOVE_ON + TOPIC_LOCK system messages are
        # the only context the LLM needs to open a new topic question.
        _ctx_items = getattr(effective_ctx, "items", None)
        _has_moveon = any(
            "[NEXT_TURN_DIRECTIVE" in str(getattr(m, "content", ""))
            and "DECISION: MOVE_ON" in str(getattr(m, "content", ""))
            for m in (_ctx_items or [])
            if getattr(m, "role", "") == "system"
        )
        if _has_moveon and _ctx_items is not None:
            _before = len(_ctx_items)
            _ctx_items[:] = [m for m in list(_ctx_items) if getattr(m, "role", "") == "system"]
            _dropped = _before - len(_ctx_items)
            if _dropped:
                logger.info(
                    "[LLM_GATE] MOVE_ON detected â€” stripped %d user/assistant msg(s) "
                    "from ctx so LLM opens new topic cleanly",
                    _dropped,
                )

        _sys_count = sum(1 for m in getattr(effective_ctx, "items", []) if getattr(m, "role", "") == "system")
        logger.info(
            "[LLM_GATE] %s | sys_msgs=%d%s",
            "on-time" if not timed_out else "timeout",
            _sys_count,
            " [MOVE_ON-clean]" if _has_moveon else "",
        )

        tool_choice = model_settings.tool_choice if model_settings else NOT_GIVEN
        turn_temp, temp_role = self._select_turn_temperature(effective_ctx)
        logger.info("[TEMP] role=%s temperature=%.2f", temp_role, turn_temp)

        conn_options = activity.session.conn_options.llm_conn_options
        # Override LiveKit's default read timeout â€” httpcore.ReadTimeout fires mid-stream
        # when OpenAI takes >10s for a long response, causing _llm_inference_task errors.
        if (conn_options.timeout or 0) < 30.0:
            conn_options = replace(conn_options, timeout=30.0)
        async with activity.llm.chat(
            chat_ctx=effective_ctx,
            tools=tools,
            tool_choice=tool_choice,
            conn_options=conn_options,
            extra_kwargs={"temperature": turn_temp},
        ) as stream:
            async for chunk in stream:
                yield chunk

    async def tts_node(self, text, model_settings):
        activity = self._get_activity_or_raise()
        tts_engine = activity.tts
        if tts_engine is None:
            return

        conn_options = activity.session.conn_options.tts_conn_options
        if conn_options.retry_interval > 0.5:
            conn_options = replace(conn_options, retry_interval=0.5)
        # Override LiveKit's default 10s timeout â€” Sarvam WS can take up to 25s for
        # longer responses. At 10s it times out, retries, and causes ~18s silence gap.
        if (conn_options.timeout or 0) < 25.0:
            conn_options = replace(conn_options, timeout=25.0)

        async def _push_sentences(tts_stream) -> None:
            buf = ""
            n = 0
            async for chunk in text:
                buf += chunk
                while True:
                    m = _TTS_SENT_END_RE.search(buf)
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
                    push_task = asyncio.create_task(_push_sentences(stream))
                    try:
                        async for ev in stream:
                            yield ev.frame
                    finally:
                        await push_task
            else:
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
            logger.error(
                "[TTS] tts_node failed provider=%s model=%s error=%s",
                getattr(tts_engine, "provider", "unknown"),
                getattr(tts_engine, "model", "unknown"),
                e,
                exc_info=True,
            )
            raise


def prewarm(proc: JobProcess):
    import os as _os
    if _os.getenv("SKIP_PREWARM", "").strip().lower() in ("1", "true", "yes"):
        logger.info("Prewarm skipped (SKIP_PREWARM=1). All resources will initialize lazily.")
        proc.userdata["vad"] = None
        proc.userdata["turn_detector"] = None
        proc.userdata["default_stt"] = None
        proc.userdata["default_tts"] = None
        return
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


class _EvalSignalToggles(BaseModel):
    """Validated signal enable/disable flags. All default ON. Coerces any truthy DB value.
    Orgs can explicitly set a signal to false to disable it; absent = enabled."""
    ownership_ambiguity: bool = True
    example_evasion: bool = True
    latency_mismatch: bool = True
    resume_claim_mismatch: bool = True
    follow_up_collapse: bool = True
    complexity_latency_mismatch: bool = True
    depth_decay: bool = True

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
    Required fields raise ValidationError on construction  no manual require_db_value calls needed.
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
    resumeData: Any = None
    extractedDetails: Any = None
    interviewQuestions: Any = None
    proctoringSignals: Any = None
    interviewStatus: Optional[str] = None

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
    try:
        ctx_data = InterviewContext(**context_result)
    except Exception as _ctx_err:
        logger.error("Invalid interview context from DB: %s", _ctx_err)
        return

    # GUARD: Prevent re-entry if interview is already completed
    if ctx_data.interviewStatus and str(ctx_data.interviewStatus).strip().upper() in ("COMPLETED", "NO_SHOW", "ABANDONED"):
        logger.warning(
            f"[GUARD] Interview {app_id} is already {ctx_data.interviewStatus}. "
            f"Rejecting duplicate job dispatch. Exiting immediately."
        )
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
    # JD extraction produces criteria[].{name, priority} where priority=critical/high  must-have, medium  nice-to-have.
    # Legacy format used mustHaveSkills/niceToHaveSkills flat arrays  fall back to those if criteria absent.
    def _extract_jd_skill_lists(details: dict):
        criteria = details.get("criteria") or []
        if criteria:
            must = [c.get("name", "") for c in criteria if c.get("priority") in ("critical", "high") and c.get("name")]
            nice = [c.get("name", "") for c in criteria if c.get("priority") == "medium" and c.get("name")]
            return must, nice
        # Legacy fallback
        return (details.get("mustHaveSkills") or []), (details.get("niceToHaveSkills") or [])

    _jd_skills, _jd_nice = _extract_jd_skill_lists(extracted_details) if extracted_details else ([], [])
    logger.info(
        "[STARTUP] Fetched  resume=%s jd=%s custom_q=%d | candidate=%s | role=%s",
        "YES" if structured_resume else "NO",
        "YES" if extracted_details else "NO",
        len(_interview_questions) if _interview_questions else 0,
        candidate_name, job_title,
    )
    if _jd_skills or _jd_nice:
        logger.info("[STARTUP] JD keys  must_have=%s nice_to_have=%s", _jd_skills[:6], _jd_nice[:4])

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
        logger.info("[FLOW] Custom questions  none configured")
    interview_lang = ctx_data.language
    time_limit_mins = FIXED_INTERVIEW_DURATION_MINUTES
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
            logger.info("[SESSION] shutdown  elapsed=%ss", elapsed_sec)
        finally:
            try:
                reset_log_context(log_context_token)
            except ValueError:
                logger.debug("[SESSION] log context token already reset in a different async context")
    ctx.add_shutdown_callback(_log_shutdown)
    # Org-specific model settings.
    # Resolve voice  provider + model from registry.
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
    interview_llm_model: str = INTERVIEW_LLM_MODEL
    interview_llm_temperature: float = INTERVIEW_TEMPERATURE
    analysis_model = EVAL_LLM_MODEL

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
        *[str(p).strip().split(" - ")[0].strip() for p in resume_context.projects[:4] if str(p).strip()],
        *[str(w).strip().split(" - ")[0].strip() for w in resume_context.work_history[:3] if str(w).strip()],
    ]
    base_coverage_items = list(dict.fromkeys(base_coverage_items))
    from interview.agent_profile_context import _BAND_DEPTH_INSTRUCTIONS
    session_context = CandidateBandContext(
        candidate_band=candidate_band,
        resume_brief=resume_brief,
        coverage_items=base_coverage_items,
        depth_instruction=_BAND_DEPTH_INSTRUCTIONS.get(
            candidate_band,
            "Go as deep as needed per topic  move on when you have enough signal.",
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

    interview_directive_cached = build_interview_directive(
        band=session_context.candidate_band,
        resume_brief=session_context.resume_brief,
        custom_questions=_interview_questions or None,
    )

    #  Consolidated interview context (single log with all data in paragraphs) 
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
        "fresher": "probe HOW they think  real decisions, specifics, learning signals",
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
        f"INTERVIEW PLAN: 20 min covering resume ownership, JD skills, situational, behavioural. "
        f"Open with: '{_rb.anchor_item or 'their most recent work'}'. "
        f"Band={_band}: {_band_note}. "
        f"Must cover: resume projects, work history, JD must-have skills, at least 1 situational, at least 1 behavioural."
    )

    logger.info("[INTERVIEW_CONTEXT]\n%s", _context_block)
    voice_layer_prompt = build_voice_layer_prompt(
        candidate_name=candidate_first_name or candidate_name,
        job_title=job_title,
        time_limit_mins=time_limit_mins,
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
        candidate_band=session_context.candidate_band,
    )
    system_prompt = build_system_prompt(
        voice_layer_prompt=voice_layer_prompt,
        evaluation_layer_prompt=evaluation_layer_prompt,
    )
    chat_ctx = llm.ChatContext()
    chat_ctx.add_message(role="system", content=system_prompt)
    warmup_directive = build_warmup_directive()
    chat_ctx.add_message(role="system", content=warmup_directive)
    chat_ctx.add_message(role="system", content=interview_directive_cached)
    logger.info("[FLOW] System prompt ready  greeting  warmup  interview")
    ctx.proc.userdata["candidate_band_context"] = session_context

    vad_instance = ctx.proc.userdata.get("vad") or build_vad()
    stt_plugin = build_stt(language_code=lang_codes["stt"], model=org_deepgram_model)
    _tts_builder = {
        "SARVAM":     build_sarvam_tts,
        "ELEVENLABS": build_elevenlabs_tts,
        "CARTESIA":   build_cartesia_tts,
    }.get(org_tts_provider, build_cartesia_tts)
    logger.info(f"[TTS] Using %s  voice=%s model=%s", org_tts_provider, voice_id, org_tts_model)
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
    llm_plugin = build_llm(
        model=interview_llm_model,
        temperature=interview_llm_temperature,
    )
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
                # use a slightly longer min_delay so fillers like "umm" / "ohh" do not
                # prematurely end the user's turn.
                min_delay=0.8,
                max_delay=2.0,
                mode="dynamic",
            ),
            interruption=InterruptionOptions(
                enabled=True,
                # Adaptive mode uses ML to distinguish backchannels (hmm/yeah/okay)
                # from genuine interruptions  avoids cutting off thinking candidates.
                mode="adaptive",
                min_duration=2.5,
                # Lowered from 8 to 3 so barge-in triggers sooner while still giving
                # the detector a little speech to distinguish from backchannels.
                min_words=3,
                # Discard audio on interrupted turns â€” prevents the partial TTS chunk
                # from being resumed and replayed, which caused "Okay wait" to be
                # spoken twice when a false interruption was detected and then resumed.
                discard_audio_if_uninterruptible=True,
                resume_false_interruption=False,
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
    warmup_complete = False  # True when candidate gives substantive response (>8 words) past greeting
    # Interview state
    _final_no_new_question_guard = False
    _time_guard_active = False          # True when <= 20s remain â€” blocks eval + signals
    _candidate_turn_since_last_assistant = True
    environment_risk = 0     # browser-side proctoring signals
    integrity_risk = 0       # integrity-related proctoring signals
    depth_risk = 0           # surface answers / compression failures
    suspicion_score = 0      # composite risk score used only for mode switching
    current_interview_mode = "normal"  # normal / pressure / verification / deep
    proctoring_events: list = []       # timeline of risk signals for final report
    # Note: browser-side proctoring (face, tab, hardware) is recorded directly
    # to the DB via /api/interview/proctoring. The agent does NOT process these
    # signals  only behavioral/intelligence signals influence the agent.
    ready_event = asyncio.Event()
    launch_prereqs_signal_sent = False
    # Per-turn decision engine state
    _last_interviewer_question = ""   # most recent question Ishita asked
    _last_question_topic: Optional[str] = None  # _active_topic at the moment that question was asked
    answer_scores: list[dict] = []    # log of all answer quality scores for final DB save
    _active_topic: Optional[str] = None         # current topic anchor; rotate away on MOVE_ON
    _topic_states: dict[str, dict] = {}        # PART 3: TopicState serialized per topic for saturation tracking
    _topic_score_histories: dict[str, list] = {}  # per-topic quality score history for collapse/latency detection
    _last_depth_decay_turn: int = -999           # turn when depth_decay last fired; -999 = never
    _last_applied_eval_turn: int = 0             # monotonic guard against stale eval results
    _question_asked_at: float = 0.0
    _answer_received_at: float = 0.0
    _trust_state = init_trust_state()
    _custom_q_reminder_fired: bool = False
    _custom_q_final_reminder_fired: bool = False
    _covered_topic_keys: set[str] = set()        # all topics already covered across the interview
    _user_turn_chain: Optional[asyncio.Task[Any]] = None  # serialize user-turn processing
    _eval_turns_queued: set[int] = set()         # local per-session dedupe: queue each turn once
    _processed_user_turns: set[int] = set()      # turns whose STT was already flushed; drops late Deepgram finals
    _first_interview_question_asked: bool = False  # True after first post-warmup AI question fires
    # Running log of topics already covered  injected into every directive so the AI
    # never re-explores something already discussed.
    _discussed_log: list[str] = []
    # Cross-turn consistency engine state
    _ai_signal_flush_counter: int = 0       # counts new AI signal events since last checkpoint
    _ai_signal_flushed_count: int = 0       # total events already flushed (slice pointer)
    # Lock protecting all shared session state that is written by background tasks.
    _session_state_lock = asyncio.Lock()



    # Redis eval worker integration â€” Live-N: agent waits for THIS turn's result
    _eval_redis_client: Any = None
    if redis_asyncio is None:
        logger.warning("[REDIS_EVAL] redis package not installed  eval worker disabled, inline eval will be used")
    elif not REDIS_URL:
        logger.warning("[REDIS_EVAL] REDIS_URL not set  eval worker disabled, inline eval will be used")
    else:
        try:
            _eval_redis_client = redis_asyncio.from_url(REDIS_URL, decode_responses=False)
            async def _ping_redis():
                try:
                    await _eval_redis_client.ping()
                    logger.info("[REDIS_EVAL] Redis eval client connected and ping OK  %s", REDIS_URL)
                except Exception as _ping_err:
                    logger.warning("[REDIS_EVAL] Redis ping failed: %s  eval worker may not work", _ping_err)
            asyncio.create_task(_ping_redis())
        except Exception as _re:
            logger.warning("[REDIS_EVAL] Redis eval client init failed: %s  inline eval will be used", _re)
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
            and interview_directive_cached
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
        """Single builder for proctoring_data dict  eliminates duplicate construction."""
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
        }
        return data
    def _normalize_topic_key(text: str) -> str:
        return re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).strip()

    def _remaining_total_seconds_now() -> float:
        if not session_start_time:
            return float(time_limit_mins * 60)
        return max(0.0, float(time_limit_mins * 60) - (time.time() - session_start_time))

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
    # STT Fragment buffer: collects partial results until final comes
    _stt_fragment_buffer: dict[int, list[str]] = {}  # turn -> [fragment1, fragment2, ...]
    _stt_completion_timers: dict[int, asyncio.Task | None] = {}  # turn -> debounce task
    # Incomplete answers: wait 4s max â€” Deepgram usually sends all chunks within 2s of silence.
    _STT_INCOMPLETE_DEBOUNCE_SECONDS = 4.0
    # Complete answers (both warmup and interview): 0.3s is enough for nova-3 finals.
    _STT_SHORT_COMPLETE_DEBOUNCE_SECONDS = 0.3
    # Warmup incomplete: 1.0s â€” warmup answers are brief, no need to wait 4s.
    _STT_WARMUP_INCOMPLETE_DEBOUNCE_SECONDS = 1.0

    def _is_sentence_complete(text: str) -> bool:
        """
        Check if text is a complete utterance.

        Since interim_results=False (disabled), Deepgram only sends FINAL results.
        Any result from Deepgram IS already complete, so we just check for minimum length.
        Punctuation requirement removed since spoken responses rarely end with punctuation.
        """
        stripped = text.strip()
        if not stripped:
            return False
        # Minimum 2 words to be meaningful (lowered since these are final results)
        word_count = len([w for w in stripped.split() if w])
        return word_count >= 2

    async def _process_user_conversation_item(
        event,
        content: str,
        role: str,
        turn_snapshot: int,
    ) -> None:
        nonlocal suspicion_score, proctoring_events, _last_interviewer_question, \
            current_interview_mode, answer_scores, \
            _trust_state, greeting_delivered_at, \
            _ai_signal_flush_counter, _ai_signal_flushed_count, \
            warmup_complete, _last_depth_decay_turn, \
            _active_topic, _covered_topic_keys, _topic_states, \
            integrity_risk, depth_risk, \
            _last_applied_eval_turn, _discussed_log, _topic_score_histories
        try:
            if not content or role != "user":
                return
            # Block all STT processing until greeting is fully delivered
            if greeting_delivered_at is None:
                logger.debug("[GREETING_BLOCK] Candidate spoke before greeting finished")
                return
            # --- STT text cleanup / noise suppression ---
            content = _clean_stt_text(content)
            if not content:
                return

            # NOTE: content here is already consolidated (multiple fragments merged)
            # This is done in on_conversation_item_added with 400ms buffering delay
            # before this function is called
            # During the first few seconds after Ishita's opening greeting, short
            # echo-like fragments ("hi", "hello", "okay") are often the AI's own
            # voice leaking back into STT rather than a real candidate turn.
            # Suppress only tiny, greeting-like fragments here so we keep the
            # first transcript anchored to the interviewer greeting.
            # FIX: Don't suppress warmup responses (turn 2) - they're intentional candidate responses
            is_warmup_response = not warmup_complete and turn_snapshot >= 2
            if not is_warmup_response and first_agent_turn_committed_at is not None:
                since_first_ai_turn = time.monotonic() - first_agent_turn_committed_at
                if since_first_ai_turn <= greeting_echo_suppression_secs:
                    # Turn 1 = greeting response. Allow it through ONCE (captured in transcript),
                    # but block any replay of the same content â€” LiveKit re-sends the same STT
                    # fragment each time a new agent turn starts, causing the greeting loop.
                    # Turn 1 content is already recorded; replays at 0:23, 0:27 are STT replays.
                    if turn_snapshot == 1 and turn_count in _processed_user_turns:
                        logger.debug(
                            f"[TRANSCRIPT] Suppressing greeting replay (turn already processed): '{content[:60]}'"
                        )
                        return
                    # For non-turn-1: suppress short echo fragments
                    if _GREETING_ECHO_RE.match(content) or len(content.split()) <= 2:
                        logger.debug(
                            f"[TRANSCRIPT] Suppressing early greeting echo fragment: '{content[:60]}'"
                        )
                        return
            if is_warmup_response:
                logger.debug(f"[WARMUP] Warmup response (turn={turn_snapshot}): '{content[:60]}' - NOT suppressed")
            # Check if this is a greeting response (turn 1)
            is_greeting_response = turn_snapshot == 1
            if is_greeting_response:
                logger.debug(f"[GREETING] Greeting response (turn=1): '{content[:60]}' - will be captured")
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
            # Ignore tiny STT fragments (except greeting responses - those can be short)
            word_count = len([w for w in content.strip().split() if w])
            if word_count <= 2 and not is_greeting_response and turn_snapshot != 3:
                logger.debug(
                    f"[TRANSCRIPT] Ignoring probable STT fragment ({word_count} words): '{content[:60]}'"
                )
                return

            # Commit candidate text immediately so transcript persistence and eval context
            # use the same canonical source of truth as Interview.interviewTranscript.
            append_transcript_line("Candidate", content)
            lines_snap_eval = list(transcript_lines)
            question_snap = _last_interviewer_question
            answer_snap = content
            try:
                turns_snapshot = build_interview_turns(lines_snap_eval)
                if turns_snapshot:
                    latest_turn = turns_snapshot[-1] or {}
                    latest_q = str(latest_turn.get("question") or "").strip()
                    latest_a = str(latest_turn.get("answer") or "").strip()
                    if latest_q:
                        question_snap = latest_q
                    if latest_a:
                        answer_snap = latest_a
            except Exception as _turn_parse_err:
                logger.debug("[TRANSCRIPT] build_interview_turns failed for turn=%d: %s", turn_snapshot, _turn_parse_err)
            spawn_background_task(
                persist_transcript(app_id, lines_snap_eval, session_start_time, partial=True),
                f"transcript_save_turn_{turn_snapshot}",
            )
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
            # Inject structured recent Q&A context for callbacks and follow-up context.
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
            # Greeting = turn 1, warmup question = turn 2, interview starts at turn 3.

            # Warmup turns (before warmup_complete) are recorded as zero-scored placeholders
            # so they never pollute the technical or communication score averages.
            is_warmup_turn = not warmup_complete and _last_interviewer_question and turn_snapshot > 1
            if is_warmup_turn:
                async with _session_state_lock:
                    answer_scores.append({
                        "question": _last_interviewer_question,
                        "answer": answer_snap,
                        "clarity": 0, "depth": 0, "fluency": 0, "confidence": 0,
                        "overall": 0.0, "signals": [], "concerns": [],
                        "is_warmup": True,
                    })
                logger.info("[WARMUP] Warmup turn detected - will be included in transcript (turn=%d)", turn_snapshot)

            # Mark warmup as complete after recording warmup response
            if not warmup_complete and turn_snapshot >= 2:
                warmup_complete = True
                logger.info("[WARMUP]  warmup_complete=True at turn=%d (fallback setter)", turn_snapshot)

            # Start eval only after warmup has fully finished.
            # Warmup = turns 1-2, interview starts at turn 3, so first worker job is turn 3.
            _gate_reason = (
                "PASS" if (warmup_complete and turn_snapshot > 2 and question_snap)
                else f"BLOCK(warmup={warmup_complete},turn={turn_snapshot}>2={turn_snapshot>2},question={'Y' if question_snap else 'EMPTY'},redis={'Y' if _eval_redis_client else 'NONE'})"
            )
            logger.info("[EVAL_GATE] turn=%d â†’ %s", turn_snapshot, _gate_reason)
            if warmup_complete and turn_snapshot > 2 and question_snap and _first_interview_question_asked:
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
                    lines=lines_snap_eval,
                    turn=turn_snapshot,
                    score_history=score_history_snap,
                    turns_since_decay=turns_since_decay_snap,
                    response_latency=response_latency_snap,
                ) -> dict:
                    # Guard against partial assistant fragments ("Got", "Okay so...") being
                    # captured as the "question". Those fragments can cause noisy eval routing.
                    resolved_question = (question or "").strip()
                    if len(resolved_question) < 16:
                        _greeting_skip = re.compile(
                            r"(?:really glad|how are you|hope the day|ready to jump|let's get into it|"
                            r"hi \w+|hello \w+|been a packed day|happy to have)",
                            re.IGNORECASE,
                        )
                        for _line in reversed(lines):
                            _txt = str(_line or "").strip()
                            if not _txt:
                                continue
                            if _txt.lower().startswith("interviewer:"):
                                _txt = _txt.split(":", 1)[1].strip()
                            if len(_txt) >= 24 and not _greeting_skip.search(_txt):
                                resolved_question = _txt
                                break

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
                    # JD skills first (must-haves from JD), then resume skills as fallback.
                    # This ensures JD-required topics (e.g. LangChain, RAG, Agentic Systems)
                    # enter the topic cycling machinery, not just the brief as passive context.
                    _jd_skill_names = [str(s).strip() for s in (_jd_skills or []) if str(s).strip()]
                    _resume_skill_names = [str(s).strip() for s in list(rb.skills or []) if str(s).strip()]
                    seen_st: set[str] = set()
                    unique_skills: list[str] = []
                    for s in (_jd_skill_names + _resume_skill_names):
                        key = s.lower()
                        if key and key not in seen_st:
                            seen_st.add(key)
                            unique_skills.append(s)
                    # PART 3: Include TopicState for saturation tracking (serialize to dict)
                    # _topic_states stores plain dicts (returned by eval worker via JSON).
                    # Guard against calling .to_dict() on a dict that was already serialized.
                    # scoring_topic = the topic Ishita was asking about when she asked
                    # the question the candidate is now answering. This is captured at
                    # question-delivery time (_last_question_topic) so it never flips
                    # when MOVE_ON updates _active_topic mid-session.
                    # active_topic = current routing topic (may already be the new one).
                    _scoring_topic = _last_question_topic or _active_topic
                    _ts_obj = _topic_states.get(_scoring_topic) if _scoring_topic else None
                    if _ts_obj is None:
                        active_topic_state = None
                    elif isinstance(_ts_obj, dict):
                        active_topic_state = _ts_obj  # already serialized
                    else:
                        active_topic_state = _ts_obj.to_dict()

                    _topic_key_now = re.sub(r"[^a-z0-9]+", " ", (_scoring_topic or "").lower()).strip()
                    _topic_score_history_snap = list(_topic_score_histories.get(_topic_key_now, []))

                    return {
                        "app_id": app_id,
                        "turn": turn,
                        "answer": answer,
                        "question": resolved_question,
                        "transcript_lines": lines[-12:],
                        "score_history": score_history,
                        "topic_score_history": _topic_score_history_snap,
                        "turns_since_decay": turns_since_decay,
                        "response_latency_sec": response_latency,
                        "signal_toggles": dict(evaluation_signal_toggles),
                        "org_id": org_id,
                        "llm_model": analysis_model,
                        "active_topic": _scoring_topic,       # topic the answer is ABOUT
                        "active_topic_state": active_topic_state,
                        "routing_topic": _active_topic or "",  # current agent state (may differ)
                        "covered_topic_keys": list(_covered_topic_keys),
                        "discussed_log": list(_discussed_log[-8:]),
                        # Band-aware topic pool caps:
                        # fresher: more topics (breadth) â†’ wider pool
                        # senior: fewer topics (depth) â†’ narrower pool, each probed longer
                        "resume_topics": unique_resume[:{"fresher": 10, "mid": 8, "experienced": 6, "senior": 4}.get(session_context.candidate_band, 8)],
                        "skill_topics": unique_skills[:{"fresher": 12, "mid": 10, "experienced": 7, "senior": 5}.get(session_context.candidate_band, 10)],
                        "anchor_item": str(getattr(rb, "anchor_item", "") or ""),
                        "job_title": job_title,
                        "remaining_seconds": float(_remaining_total_seconds_now()),
                        "trust_state": dict(_trust_state),
                        "current_interview_mode": current_interview_mode,
                        "band": session_context.candidate_band,
                        # The actual question Ishita asked this turn â€” used by the worker
                        # to detect if the AI already pivoted to a new topic (e.g. due to
                        # a previous MOVE_ON directive) so worker and agent stay aligned.
                        "ai_question_this_turn": (_last_interviewer_question or "").strip(),
                    }


                async def _push_payload_to_redis(payload: dict) -> None:
                    nonlocal _eval_turns_queued
                    if _eval_redis_client is None:
                        logger.warning("[REDIS_EVAL] _eval_redis_client is None - eval payload for turn=%d not pushed (eval worker disabled)", payload.get("turn", 0))
                        return
                    payload_turn = int(payload.get("turn", 0) or 0)
                    payload_app_id = str(payload.get("app_id", app_id) or app_id)
                    payload_key = f"interview:{payload_app_id}:eval_payload:{payload_turn}"
                    queue_gate_key = f"interview:{payload_app_id}:eval_enqueued:{payload_turn}"
                    queue_token = {
                        "app_id": payload_app_id,
                        "turn": payload_turn,
                        "enqueued_at": time.time(),
                    }
                    try:
                        await _eval_redis_client.setex(
                            payload_key,
                            600,
                            json.dumps(payload).encode(),
                        )
                        if payload_turn in _eval_turns_queued:
                            logger.info(
                                "[REDIS_EVAL] Updated pending payload turn=%d (already queued in-session)",
                                payload_turn,
                            )
                            return
                        is_first_enqueue = await _eval_redis_client.set(
                            queue_gate_key,
                            b"1",
                            ex=600,
                            nx=True,
                        )
                        if is_first_enqueue:
                            await _eval_redis_client.rpush(
                                "interview:eval_queue",
                                json.dumps(queue_token).encode(),
                            )
                            logger.info(
                                "[REDIS_EVAL] Pushed payload turn=%d to worker queue",
                                payload_turn,
                            )
                            _eval_turns_queued.add(payload_turn)
                        else:
                            logger.info(
                                "[REDIS_EVAL] Updated pending payload turn=%d (already queued)",
                                payload_turn,
                            )
                    except Exception as _re:
                        logger.warning("[REDIS_EVAL] Failed to push payload: %s", _re)

                #             LIVE-N GATE
                # Push payload first â†’ worker starts immediately.
                # Then wait for THIS turn's routing result (Phase 1, ~200ms).
                # LLM gate opens the moment routing result arrives.
                # Scoring result (Phase 2, ~700ms) applied async after Ishita speaks.
                from interview.eval_models import EvalKeys

                # Time guard â€” no new questions in final 20s
                if _time_guard_active:
                    logger.info("[TIME_GUARD] turn=%d skipped", turn_snapshot)
                    agent._directive_ready.set()
                    return

                # All turns >= 4: push payload â†’ wait for THIS turn's routing
                async with _session_state_lock:
                    payload = _build_eval_payload()
                logger.info(
                    "[LIVE_N] turn=%d | pushing payload | topic=%r score=%.1f",
                    turn_snapshot,
                    payload.get("active_topic", "?"),
                    (payload.get("active_topic_state") or {}).get("saturation_score", 0.0),
                )
                await _push_payload_to_redis(payload)

                # Turn 3: strip warmup context AFTER payload is pushed (not before),
                # so the 2-word filter cannot leave chat_ctx in a stripped state
                # with no directive at all.
                if turn_snapshot == 3:
                    logger.info("[LIVE_N] turn=3 | clearing warmup context after payload push")
                    remove_system_messages_multi(chat_ctx, (
                        "[NEXT_TURN_DIRECTIVE", "[TOPIC_LOCK",
                        "[RECENT_CONTEXT", "[WARMUP PHASE]",
                    ))

                if _eval_redis_client is None:
                    logger.warning("[LIVE_N] no Redis â€” releasing LLM gate without directive turn=%d", turn_snapshot)
                    agent._directive_ready.set()
                    return

                # Wait for Phase 1 routing result for THIS turn
                _routing_key   = EvalKeys.routing_result(app_id, turn_snapshot)
                _routing_ready = EvalKeys.routing_ready(app_id, turn_snapshot)
                _SAFETY_TIMEOUT = 10.0  # only fires if worker crashes or Redis dies
                _t_start       = asyncio.get_running_loop().time()

                _routing_raw: Optional[bytes] = None

                # Pre-check: result may already be there (worker very fast)
                try:
                    _routing_raw = await asyncio.wait_for(
                        _eval_redis_client.getdel(_routing_key), timeout=0.15,
                    )
                    if _routing_raw:
                        logger.info(
                            "[LIVE_N] âœ… turn=%d | routing pre-check HIT (%.0fms)",
                            turn_snapshot,
                            (asyncio.get_running_loop().time() - _t_start) * 1000,
                        )
                except Exception:
                    pass

                if not _routing_raw:
                    # Concurrent pubsub + adaptive poll.
                    # Pubsub is the primary wake-up path; poll is the backup if the signal is missed.
                    _poll_found: list[bytes] = []
                    _pubsub_hit = False

                    async def _route_poll() -> None:
                        interval = 0.10
                        deadline = _t_start + _SAFETY_TIMEOUT
                        while asyncio.get_running_loop().time() < deadline:
                            await asyncio.sleep(interval)
                            interval = min(interval * 1.5, 0.35)
                            try:
                                result = await asyncio.wait_for(
                                    _eval_redis_client.getdel(_routing_key),
                                    timeout=0.2,
                                )
                                if result:
                                    _poll_found.append(result)
                                    return
                            except Exception:
                                pass

                    async def _route_pubsub() -> None:
                        try:
                            ps = _eval_redis_client.pubsub()
                            await ps.subscribe(_routing_ready)
                            try:
                                deadline = _t_start + _SAFETY_TIMEOUT
                                while asyncio.get_running_loop().time() < deadline:
                                    remaining_wait = max(
                                        0.05,
                                        deadline - asyncio.get_running_loop().time(),
                                    )
                                    msg = await asyncio.wait_for(
                                        ps.get_message(
                                            ignore_subscribe_messages=True,
                                            timeout=remaining_wait,
                                        ),
                                        timeout=remaining_wait + 0.1,
                                    )
                                    if msg is not None:
                                        return
                            finally:
                                try:
                                    await ps.unsubscribe(_routing_ready)
                                    await ps.aclose()
                                except Exception:
                                    pass
                        except Exception as pubsub_err:
                            logger.debug(
                                "[LIVE_N] turn=%d | pubsub failed: %s",
                                turn_snapshot,
                                pubsub_err,
                            )

                    poll_task = asyncio.create_task(_route_poll())
                    pubsub_task = asyncio.create_task(_route_pubsub())
                    try:
                        done, pending = await asyncio.wait(
                            {poll_task, pubsub_task},
                            timeout=_SAFETY_TIMEOUT,
                            return_when=asyncio.FIRST_COMPLETED,
                        )
                        _pubsub_hit = pubsub_task in done
                    finally:
                        for task in (poll_task, pubsub_task):
                            if not task.done():
                                task.cancel()
                                try:
                                    await task
                                except (asyncio.CancelledError, Exception):
                                    pass

                    if _poll_found:
                        _routing_raw = _poll_found[0]
                        logger.info(
                            "[LIVE_N] ✅ turn=%d | routing via poll (%.2fs)",
                            turn_snapshot,
                            asyncio.get_running_loop().time() - _t_start,
                        )
                    else:
                        # pubsub fired (or both timed out) — fetch the result now.
                        try:
                            _routing_raw = await asyncio.wait_for(
                                _eval_redis_client.getdel(_routing_key),
                                timeout=0.3,
                            )
                        except Exception:
                            _routing_raw = None
                        if _routing_raw and _pubsub_hit:
                            logger.info(
                                "[LIVE_N] ✅ turn=%d | routing via pubsub (%.2fs)",
                                turn_snapshot,
                                asyncio.get_running_loop().time() - _t_start,
                            )

                # Apply routing result or fall back to safe PROBE
                if _routing_raw:
                    try:
                        _rd = json.loads(_routing_raw)
                        _action_str  = str(_rd.get("action", "PROBE")).upper()
                        _directive   = str(_rd.get("directive", ""))
                        _new_topic   = _rd.get("new_active_topic")
                        _new_covered = list(_rd.get("new_covered_topic_keys") or [])
                        _new_ts      = _rd.get("new_active_topic_state")
                        _new_mode    = str(_rd.get("new_current_interview_mode") or current_interview_mode)
                        _sig_evts    = list(_rd.get("signal_events") or [])
                        _qr          = _rd.get("quality_record")
                        _ri          = int(_rd.get("risk_integrity_delta", 0))
                        _rdelta      = int(_rd.get("risk_depth_delta", 0))
                        _dle         = _rd.get("discussed_log_entry")

                        async with _session_state_lock:
                            old_topic = _active_topic
                            if _new_topic is not None:
                                _active_topic = _new_topic
                            if _new_covered:
                                _covered_topic_keys.clear()
                                _covered_topic_keys.update(_new_covered)
                            if _new_ts and _active_topic:
                                _topic_states[_active_topic] = _new_ts
                            current_interview_mode = _new_mode
                            # Signals â†’ risk deltas
                            for _ev in _sig_evts:
                                _delta = float(_ev.get("score_delta", 0.0) or 0.0)
                                _legacy = int(round(max(0.0, -_delta) * 100))
                                if _legacy:
                                    if _ev.get("signal_layer") == "hard_integrity":
                                        integrity_risk = min(100, integrity_risk + _legacy)
                                    else:
                                        depth_risk = min(100, depth_risk + _legacy)
                            # Risk deltas from eval pipeline
                            if _ri or _rdelta:
                                integrity_risk = min(100, integrity_risk + _ri)
                                depth_risk     = min(100, depth_risk + _rdelta)
                            refresh_composite_risk()
                            # Discussed log
                            if _dle:
                                _discussed_log.append(_dle)
                            # Quality record â†’ answer_scores + topic score history
                            if _qr:
                                answer_scores.append(_qr)
                                _stk = re.sub(r"[^a-z0-9]+", " ",
                                              str(_qr.get("topic") or _active_topic or "").lower()).strip()
                                if _stk and not _qr.get("is_timeout"):
                                    _topic_score_histories.setdefault(_stk, []).append(
                                        float(_qr.get("overall", 0))
                                    )
                                spawn_background_task(
                                    persist_answer_scores(app_id, list(answer_scores)),
                                    f"scores_turn_{turn_snapshot}",
                                )

                        _last_applied_eval_turn = max(_last_applied_eval_turn, turn_snapshot)

                        if old_topic != _active_topic:
                            logger.info(
                                "[LIVE_N] âœ… MOVE_ON turn=%d | %r â†’ %r",
                                turn_snapshot, old_topic, _active_topic,
                            )
                            _ctx_items = getattr(chat_ctx, "items", None)
                            if _ctx_items is not None:
                                _before = len(_ctx_items)
                                _ctx_items[:] = [m for m in list(_ctx_items) if getattr(m, "role", "") == "system"]
                                logger.info("[LIVE_N] MOVE_ON history wipe: dropped %d msg(s)", _before - len(_ctx_items))

                        remove_system_messages_multi(chat_ctx, (
                            "[NEXT_TURN_DIRECTIVE", "[TOPIC_LOCK", "[RECENT_CONTEXT",
                        ))
                        chat_ctx.add_message(role="system", content=_directive)

                        if _action_str == "MOVE_ON" and _active_topic:
                            remove_system_messages(chat_ctx, "[RECENT_CONTEXT")
                            chat_ctx.add_message(role="system", content=(
                                f"[TOPIC_LOCK - CRITICAL INSTRUCTION]\n"
                                f"PREVIOUS TOPIC IS CLOSED. DO NOT REFERENCE IT.\n"
                                f"IGNORE anything the candidate said at the end of the previous topic.\n"
                                f"NEW ACTIVE TOPIC: {_active_topic}\n"
                                f"YOUR ONLY JOB: Ask ONE question about '{_active_topic}'. "
                                f"Start with a brief acknowledgement, then ask what they personally "
                                f"built or owned in '{_active_topic}'."
                            ))

                        logger.info(
                            "[LIVE_N] âœ… turn=%d action=%s topic=%r (%.2fs total)",
                            turn_snapshot, _action_str, _active_topic,
                            asyncio.get_running_loop().time() - _t_start,
                        )
                    except Exception as _ae:
                        logger.warning("[LIVE_N] turn=%d | apply routing failed: %s â€” using stale ctx", turn_snapshot, _ae)
                else:
                    logger.warning(
                        "[LIVE_N] â° turn=%d | routing timeout (%.1fs) â€” releasing LLM with existing directives",
                        turn_snapshot, asyncio.get_running_loop().time() - _t_start,
                    )
                    remove_system_messages_multi(chat_ctx, ("[RECENT_CONTEXT",))

                agent._directive_ready.set()

        except Exception as e:
            logger.error("[EVAL] _process_user_conversation_item failed turn=%d: %s", turn_snapshot, e, exc_info=True)
            agent._directive_ready.set()

    #  TRANSCRIPT EVENT HANDLER
    # Registered on session "conversation_item_added"  fires for BOTH Ishita
    # (assistant) and Candidate (user) turns. Handles:
    #    Transcript persistence for both speakers
    #    turn_count / question tracking for assistant turns
    #    Warmup gate management
    #    Dispatching user turns to the eval/decision engine
    # 
    @session.on("conversation_item_added")
    def on_conversation_item_added(event) -> None:
        nonlocal turn_count, _last_interviewer_question, _question_asked_at, \
            _candidate_turn_since_last_assistant, warmup_complete, \
            _answer_received_at, _user_turn_chain, _first_interview_question_asked
        try:
            item = event.item
            role = getattr(item, "role", None)
            content = (item.text_content or "").strip()
            if not role:
                return

            #  ASSISTANT TURN
            if role == "assistant":
                if not _candidate_turn_since_last_assistant:
                    # Hard block â€” LLM fired twice in a row without a candidate reply.
                    # This happens when STT echoes Ishita's greeting back as a candidate
                    # fragment, triggering a second LLM generation before the first one
                    # finished. During warmup this creates the greeting-repeat loop seen
                    # in transcript (AI 0:23, 0:27, 0:32 all saying warmup phrases).
                    logger.warning("[TURN_GUARD] Blocking consecutive assistant turn (no candidate reply since last AI)")
                    return
                if not llm_spoke_event.is_set():
                    llm_spoke_event.set()
                clean_content = sanitize_candidate_facing_text(content)
                if not clean_content or clean_content == "<wait for response>":
                    return
                # Save Ishita's line to transcript
                append_transcript_line("Interviewer", clean_content)
                # Track last question for eval engine â€” only for real interview turns.
                # Greeting (turn 1 AI) and warmup (turn 2 AI) must never overwrite this
                # because their text ("How are you doing?", "All good on your end?") would
                # pollute eval context if the candidate gives a slow answer on turn 3+.
                _is_interview_turn = warmup_complete or turn_count > 2
                if _is_interview_turn:
                    # Prefer ?-terminated sentence; fall back to last sentence of 20+ chars.
                    # Final fallback: use entire clean_content so question_snap is never empty.
                    _q_text = clean_content.strip()
                    q_match = re.search(r'([^.!?]+\?)\s*$', _q_text)
                    if q_match:
                        _last_interviewer_question = q_match.group(1).strip()
                    else:
                        _fallback_q = re.search(r'(?:(?<=[.!?])\s+|^)([^.!?]{20,}[.!?]?)\s*$', _q_text)
                        if _fallback_q:
                            _last_interviewer_question = _fallback_q.group(1).strip()
                        else:
                            _last_interviewer_question = _q_text[:200]
                    _last_question_topic = _active_topic  # topic Ishita was on when she asked this
                    logger.debug("[QUESTION_TRACK] turn=%d last_q=%r topic=%r", turn_count, _last_interviewer_question[:60], _last_question_topic)
                    # First interview question just fired â€” seal the opening move so the LLM
                    # cannot re-ask it. The base system prompt says "Open by asking about X"
                    # which conflicts with PROBE directives on subsequent turns. This message
                    # overrides that instruction once the opener has been delivered.
                    if not _first_interview_question_asked:
                        _first_interview_question_asked = True
                        remove_system_messages(chat_ctx, "[PHASE_STATUS]")
                        chat_ctx.add_message(
                            role="system",
                            content=(
                                "[PHASE_STATUS â€” DO NOT SAY ALOUD]\n"
                                "GREETING: DONE. WARMUP: DONE. OPENING QUESTION: DONE.\n"
                                f"You already asked: \"{_last_interviewer_question[:120]}\"\n"
                                "DO NOT repeat this opening question. DO NOT re-introduce yourself or re-greet.\n"
                                "CURRENT PHASE: INTERVIEW IN PROGRESS â€” follow [NEXT_TURN_DIRECTIVE] exactly."
                            ),
                        )
                        logger.info("[PHASE_STATUS] Opening question sealed: %r", _last_interviewer_question[:80])
                        # Pre-clear the LLM gate NOW â€” Ishita just delivered the first interview
                        # question. The next event will be Vamsi answering (Turn 3 candidate turn).
                        # Without this pre-clear, llm_node fires the moment Turn 3 STT arrives
                        # (gate was still SET from warmup), generating BEFORE Vamsi's answer is
                        # in chat_ctx, causing Ishita to repeat the same opening question.
                        # Clearing here ensures the gate is already closed when Turn 3 fires,
                        # so the sync gate fast-path (which sets it) runs after the answer lands.
                        agent._directive_ready.clear()
                        logger.info("[LLM_GATE] Pre-cleared after opening question delivery (Turn 3 guard)")
                else:
                    logger.debug("[QUESTION_TRACK] turn=%d skipped (greeting/warmup phase)", turn_count)
                # Track custom question coverage
                if _custom_questions:
                    _q_lower = clean_content.lower()
                    _asked_words = _expand_custom_q_tokens(re.sub(r"[^a-z0-9\s]", " ", _q_lower))
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
                            logger.info("[FLOW] Custom Q %d/%d covered: '%s'", _cqi + 1, len(_custom_questions), _cq.raw[:80])
                # Increment turn count and track timing
                _question_asked_at = time.perf_counter()
                _candidate_turn_since_last_assistant = False
                turn_count += 1
                logger.info("âœ… TURN %d | phase=%s", turn_count, "interview" if warmup_complete else "warmup")
                # Note: Transcript and answer_scores are now persisted after EVERY eval turn (async).
                # See _process_user_conversation_item() for per-turn async persistence.
                # This periodic save is kept as a safety net for orphaned records in edge cases.
                # Normally turned off by default to avoid redundant DB writes.
            #  USER TURN
            elif role == "user":
                _answer_received_at = time.perf_counter()
                _candidate_turn_since_last_assistant = True
                # Warmup gate: block STT until greeting delivered
                if greeting_delivered_at is None:
                    logger.info("[GATE] Candidate spoke before greeting  blocked")
                    return
                # Warmup completion: candidate answers warmup question (turn 2+).
                # turn 1 = greeting, turn 2 = warmup question  candidate reply here = warmup done.
                if not warmup_complete and turn_count >= 2:
                    warmup_complete = True
                    remove_system_messages(chat_ctx, "[WARMUP PHASE]")
                    remove_system_messages(chat_ctx, "[PHASE_STATUS]")
                    chat_ctx.add_message(
                        role="system",
                        content=(
                            "[PHASE_STATUS â€” DO NOT SAY ALOUD]\n"
                            "GREETING: DONE. WARMUP: DONE.\n"
                            "DO NOT greet again, re-introduce yourself, ask 'how are you doing', or repeat the readiness check.\n"
                            "CURRENT PHASE: INTERVIEW â€” ask your first interview question now."
                        ),
                    )
                    logger.info("[WARMUP]  WARMUP COMPLETE at turn=%d  INTERVIEW PHASE ACTIVE", turn_count)

                # STT Fragment Buffering: accumulate all fragments for this turn, process only once
                # Drop late Deepgram finals for turns already flushed to the eval pipeline.
                if turn_count in _processed_user_turns:
                    logger.debug("[STT_BUFFER] turn=%d already processed â€” dropping late fragment '%s'", turn_count, content[:60])
                    return
                # Only block llm_node for interview turns (turn > 2).
                # Warmup turns (1-2) skip eval entirely â€” _directive_ready is never re-set
                # by the eval gate for those turns, so clearing it here caused a 15s hang
                # waiting for a set() that would never come.
                if turn_count > 2:
                    agent._directive_ready.clear()
                else:
                    logger.debug("[STT_BUFFER] turn=%d warmup â€” skipping _directive_ready.clear()", turn_count)

                # Buffer the fragment
                if turn_count not in _stt_fragment_buffer:
                    _stt_fragment_buffer[turn_count] = []
                    _stt_completion_timers[turn_count] = None

                _stt_fragment_buffer[turn_count].append(content)
                consolidated_so_far = " ".join(f.strip() for f in _stt_fragment_buffer[turn_count] if f.strip())
                logger.debug(
                    f"[STT_BUFFER] turn={turn_count} fragment #{len(_stt_fragment_buffer[turn_count])}: '{content[:50]}...' "
                    f"(consolidated: '{consolidated_so_far[:60]}...')"
                )

                # Check if sentence is complete (ends with . ! ? and has enough content)
                is_complete = _is_sentence_complete(consolidated_so_far)

                # Helper to trigger processing
                async def _trigger_processing(_turn=turn_count, _event=event, _reason=""):
                    nonlocal _processed_user_turns
                    # Cancel any pending timeout for this turn
                    _timer_task = _stt_completion_timers.get(_turn)
                    _current_task = asyncio.current_task()
                    if _timer_task and _timer_task is not _current_task:
                        _timer_task.cancel()
                    _stt_completion_timers[_turn] = None

                    # Serialize after previous turn completes
                    prev_chain = _user_turn_chain
                    if prev_chain:
                        try:
                            await prev_chain
                        except Exception:
                            pass

                    # Get consolidated content from buffer
                    all_fragments = _stt_fragment_buffer.pop(_turn, [])
                    _stt_completion_timers.pop(_turn, None)
                    _processed_user_turns.add(_turn)
                    consolidated_content = " ".join(f.strip() for f in all_fragments if f.strip())

                    if consolidated_content:
                        logger.info(
                            f"[STT_CONSOLIDATED] turn={_turn} - {len(all_fragments)} fragments  "
                            f"complete utterance ({_reason}): '{consolidated_content[:80]}...'"
                        )
                        # Process with consolidated, complete content (not fragments)
                        await _process_user_conversation_item(_event, consolidated_content, "user", _turn)
                    else:
                        logger.debug(f"[STT_BUFFER] turn={_turn} - no content after consolidation")

                # Warmup turns (1-2) use the SHORTEST debounce â€” they skip eval entirely
                # so there is no reason to wait. Interview turns (3+) use 0.3s complete /
                # 4.0s incomplete to let Deepgram consolidate multi-chunk answers.
                if turn_count <= 2:
                    debounce_seconds = (
                        _STT_SHORT_COMPLETE_DEBOUNCE_SECONDS   # 0.3s â€” same as interview complete
                        if is_complete
                        else _STT_WARMUP_INCOMPLETE_DEBOUNCE_SECONDS  # 1.0s â€” short, warmup answers are brief
                    )
                else:
                    debounce_seconds = (
                        _STT_SHORT_COMPLETE_DEBOUNCE_SECONDS   # 0.3s for complete interview answers
                        if is_complete
                        else _STT_INCOMPLETE_DEBOUNCE_SECONDS  # 4.0s for incomplete (stragglers)
                    )

                async def _timeout_handler(_turn=turn_count, _event=event, _delay=debounce_seconds):
                    nonlocal _user_turn_chain
                    try:
                        await asyncio.sleep(_delay)
                        if _turn not in _stt_fragment_buffer or not _stt_fragment_buffer[_turn]:
                            return
                        _reason = "sentence_complete" if is_complete else "debounce_timeout"

                        # Eval pipeline runs in background (may wait for prev turn via prev_chain).
                        _eval_chain = spawn_background_task(
                            _trigger_processing(_turn=_turn, _event=_event, _reason=_reason),
                            f"user_turn_{_turn}",
                        )
                        agent._pending_eval_task = _eval_chain
                        _user_turn_chain = _eval_chain

                    except asyncio.CancelledError:
                        logger.debug(f"[STT_BUFFER] turn={_turn} - debounce cancelled")
                    except Exception as e:
                        logger.warning(f"[STT_BUFFER] turn={_turn} - debounce error: {e}")

                # Always debounce â€” Deepgram splits long answers into multiple final chunks,
                # so we wait for silence before flushing regardless of word count.
                # Turns 1-2 use a short debounce; turns 3+ use _STT_SHORT_COMPLETE_DEBOUNCE_SECONDS
                # for complete sentences so all fragments consolidate before eval sees the answer.
                _word_count = len([w for w in consolidated_so_far.split() if w])
                if _stt_completion_timers.get(turn_count):
                    _stt_completion_timers[turn_count].cancel()
                _stt_completion_timers[turn_count] = asyncio.create_task(_timeout_handler(turn_count, event))
                logger.debug(
                    "[STT_BUFFER] turn=%d - debounce %.2fs (is_complete=%s, words=%d)",
                    turn_count,
                    debounce_seconds,
                    is_complete,
                    _word_count,
                )
        except Exception as _e:
            logger.warning("[TRANSCRIPT] on_conversation_item_added error: %s", _e)

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
    # Extended to 15s: greeting TTS takes ~6s, candidate answers at ~7-10s, and
    # LiveKit/STT replays the same fragment when each new agent turn starts.
    # Short window (6s) only caught 2-word echoes; 15s blocks replays through warmup.
    greeting_echo_suppression_secs = 15.0
    greeting_delivered_at: float | None = None  # Track when greeting finishes
    def reset_inactivity_clock(start_waiting: bool, preserve_nudge_flags: bool = False) -> None:
        nonlocal awaiting_candidate_response, awaiting_candidate_since, \
            inactivity_nudge_sent_for_current_prompt, _nudge_count, _last_nudge_at
        awaiting_candidate_response = start_waiting
        awaiting_candidate_since = time.monotonic() if start_waiting else None
        if not preserve_nudge_flags:
            inactivity_nudge_sent_for_current_prompt = False
            _nudge_count = 0
            _last_nudge_at = 0.0
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
        logger.info(
            "[FLOW] Session started  candidate=%s role=%s band=%s tts=%s llm=%s boot=%dms",
            candidate_name, job_title, session_context.candidate_band,
            org_tts_provider, interview_llm_model,
            int((time.perf_counter() - entry_started_at) * 1000),
        )
        # Mark as started in DB while greeting starts immediately.
        spawn_background_task(mark_interview_started(app_id), "mark_interview_started")
        #  TIMER FIX: Start the 20-minute clock the moment greeting audio begins.
        # Greeting + warmup + interview all count against the same 20-minute budget.
        # This timestamp is used by session_loop_start (main loop) and session_start_time
        # (transcript timestamps + remaining-time calculations).
        _interview_timer_start = time.monotonic()
        session_start_time = time.time()
        try:
            logger.info("[FLOW] Greeting started  20-min interview timer begins NOW")
            # Only deliver scripted welcome if the LLM hasn't already spoken
            # (prevents double-greeting when candidate says hello first)
            if llm_spoke_event.is_set():
                logger.info(
                    "[FLOW] LLM spoke first  skipping scripted greeting"
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
                        # session.say() bypasses the LLM pipeline and does NOT fire
                        # conversation_item_added, so we must append the greeting manually.
                        append_transcript_line("Interviewer", welcome_text)
                        logger.info("[TRANSCRIPT] Greeting appended to transcript (session.say bypass)")
                        logger.info("[FLOW]  GREETING DONE  WARMUP ACTIVE (waiting for warmup Q&A before interview)")
                        # Inject phase marker so LLM knows greeting is done and must not repeat it
                        remove_system_messages(chat_ctx, "[PHASE_STATUS]")
                        chat_ctx.add_message(
                            role="system",
                            content=(
                                "[PHASE_STATUS â€” DO NOT SAY ALOUD]\n"
                                "GREETING: DONE. You have already said hello and introduced yourself.\n"
                                "DO NOT greet again, re-introduce yourself, or ask 'how are you doing' again.\n"
                                "CURRENT PHASE: WARMUP â€” ask one short readiness check, then begin interview."
                            ),
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
    # Inactivity timing:
    #   10s silence  -> soft nudge (up to 3, rotating, 10s apart)
    #   40s silence  -> termination warning
    #   50s silence  -> end call
    INACTIVITY_NUDGE_SECS = 20       # first nudge after 20s silence â€” 10s was too quick, interrupted thinking
    INACTIVITY_NUDGE_INTERVAL = 20   # repeat every 20s
    INACTIVITY_NUDGE_MAX = 2         # max 2 nudges before warning
    INACTIVITY_WARNING_SECS = 40     # termination warning at 40s
    INACTIVITY_END_SECS = 50         # end call at 50s
    TIME_GUARD_SECS = 20             # final 20s: block eval/signals, fire goodbye
    final_timeout_announced = False
    _nudge_count = 0                 # how many soft nudges already sent this turn
    _last_nudge_at: float = 0.0      # monotonic time of last nudge sent

    _name = candidate_first_name or candidate_name
    _SOFT_NUDGES = [
        f"Take your time, {_name}.",
        f"No rush â€” think out loud if that helps.",
    ]

    async def _deliver_nudge(text: str) -> None:
        await session.say(text, allow_interruptions=True)
        # Scripted speech doesn't fire agent_speech_committed, manually restart clock.
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
    # Use the greeting-begin timestamp so `remaining` counts from when greeting started,
    # NOT from when the greeting audio finished. This makes the 20-min window exact.
    session_loop_start = _interview_timer_start
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
            logger.info("[TIMER] remaining=%.0fs turn=%d", remaining, turn_count)
            _last_timer_log = _now
        # Custom question coverage reminder  fires at 75% of total interview time if any
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
                            f"[CUSTOM Q REMINDER  DO NOT SAY ALOUD]\n"
                            f"The recruiter REQUIRES these questions to be asked before the interview ends. "
                            f"You have not asked them yet. Ask each one naturally within the next few turns  "
                            f"weave them into the conversation, do not announce them as special questions:\n"
                            f"{chr(10).join(_unasked_cqs)}"
                        ),
                    )
                    logger.info(
                        "[FLOW] Custom Q 75%% reminder fired  %d unasked: %s",
                        len(_unasked_cqs),
                        [cq.raw[:80] for cq in _custom_questions if not cq.asked][:3],
                    )
                else:
                    logger.info("[FLOW] Custom Q 75%% checkpoint  all custom questions already asked")
                _custom_q_reminder_fired = True
        # Final-window custom question reminder  fires when <60s remain if any still unasked.
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
                        f"[CUSTOM Q REMINDER  DO NOT SAY ALOUD]\n"
                        f"URGENT  less than 60 seconds remain. These recruiter-required questions have NOT been asked yet. "
                        f"Ask them immediately. Keep each one brief and natural:\n"
                        f"{chr(10).join(_unasked_cqs_final)}"
                    ),
                )
                logger.info(
                    "[FLOW] Custom Q final-window reminder fired  %d still unasked",
                    len(_unasked_cqs_final),
                )
            else:
                logger.info("[FLOW] Custom Q final-window checkpoint  all custom questions covered")
            _custom_q_final_reminder_fired = True
        if (
            remaining <= FINAL_WINDOW_SECONDS
            and not _final_no_new_question_guard
            and not is_agent_speaking
        ):
            _final_no_new_question_guard = True
            chat_ctx.add_message(
                role="system",
                content=(
                    f"[SYSTEM ALERT: FINAL WINDOW] Less than {FINAL_WINDOW_SECONDS} seconds remain. "
                    "Do not ask any new questions. Briefly wrap up and close naturally."
                ),
            )
            logger.info(
                "[TIMER] Final window active  remaining=%.1fs",
                remaining,
            )
        # --- Final 20 seconds: time guard ---
        # Activate the guard flag so eval dispatch and signal processing are blocked.
        if remaining <= TIME_GUARD_SECS and not _time_guard_active:
            _time_guard_active = True
            logger.info("[TIME_GUARD] Activated at remaining=%.1fs â€” eval/signals blocked", remaining)

        if remaining <= TIME_GUARD_SECS and not final_timeout_announced:
            final_timeout_announced = True
            _goodbye = (
                f"Thank you so much for your time today, {candidate_first_name or candidate_name}. "
                "That wraps up our interview. All the very best!"
            )
            try:
                # Scenario 1: agent is mid-speech â€” interrupt it immediately then say goodbye
                if is_agent_speaking:
                    logger.info("[TIME_GUARD] Agent speaking â€” interrupting and delivering goodbye")
                    session.interrupt()
                    await asyncio.sleep(0.3)   # brief gap so interrupt flushes before next say()
                    await session.say(_goodbye, allow_interruptions=False)

                # Scenario 2: candidate is speaking â€” politely cut in
                elif is_candidate_speaking:
                    logger.info("[TIME_GUARD] Candidate speaking â€” interrupting and delivering goodbye")
                    session.interrupt()
                    await asyncio.sleep(0.2)
                    await session.say(_goodbye, allow_interruptions=False)

                # Scenario 3: silence â€” just say goodbye cleanly
                else:
                    logger.info("[TIME_GUARD] Silence â€” delivering goodbye")
                    await session.say(_goodbye, allow_interruptions=False)

            except Exception as e:
                logger.warning("[TIME_GUARD] Goodbye delivery failed: %s", e)
            break
        inactivity_elapsed = (
            (time.monotonic() - awaiting_candidate_since)
            if awaiting_candidate_response and awaiting_candidate_since is not None
            else 0.0
        )
        _silence_active = (
            not is_agent_speaking
            and not is_candidate_speaking
            and awaiting_candidate_response
            and inactivity_elapsed >= INACTIVITY_NUDGE_SECS
        )
        # -- Soft nudges: fire every INACTIVITY_NUDGE_INTERVAL seconds, up to INACTIVITY_NUDGE_MAX times --
        if (
            _silence_active
            and _nudge_count < INACTIVITY_NUDGE_MAX
            and inactivity_elapsed < INACTIVITY_WARNING_SECS
            and (time.monotonic() - _last_nudge_at) >= INACTIVITY_NUDGE_INTERVAL
        ):
            try:
                nudge_text = _SOFT_NUDGES[_nudge_count % len(_SOFT_NUDGES)]
                spawn_background_task(_deliver_nudge(nudge_text), f"inactivity_nudge_{_nudge_count}")
                _nudge_count += 1
                _last_nudge_at = time.monotonic()
                logger.info("[NUDGE] Soft nudge #%d sent at %.0fs silence", _nudge_count, inactivity_elapsed)
            except Exception as e:
                logger.warning(f"[NUDGE] Failed to deliver soft nudge: {e}")
        # -- Termination warning after INACTIVITY_WARNING_SECS --
        if (
            _silence_active
            and not inactivity_nudge_sent_for_current_prompt
            and inactivity_elapsed >= INACTIVITY_WARNING_SECS
        ):
            try:
                warning_text = (
                    f"Hey {_name}, I haven't heard from you in a bit. "
                    f"I'll have to wrap up the call in {INACTIVITY_END_SECS - INACTIVITY_WARNING_SECS} seconds if I don't hear back."
                )
                spawn_background_task(_deliver_nudge(warning_text), "inactivity_warning")
                inactivity_nudge_sent_for_current_prompt = True
                logger.info("[NUDGE] Termination warning sent at %.0fs silence", inactivity_elapsed)
            except Exception as e:
                logger.warning(f"[NUDGE] Failed to deliver warning: {e}")
        # -- End call after INACTIVITY_END_SECS --
        if (
            _silence_active
            and inactivity_nudge_sent_for_current_prompt
            and inactivity_elapsed >= INACTIVITY_END_SECS
        ):
            logger.info("[NUDGE] Ending interview due to inactivity (%ds)", int(inactivity_elapsed))
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
    # Ã¢ Final definitive save - Phase 5 includes proctoring report + answer scores
    proctoring_data = _build_proctoring_data(
        "time_expired" if time_expired else "interview_finished"
    )
    # Finalize Trust Engine and build recruiter summary before persisting
    _trust_state = finalize_trust_state(_trust_state)
    recruiter_summary = build_recruiter_summary(
        trust_state=_trust_state,
        answer_scores=answer_scores,
        total_turns=turn_count,
        candidate_name=candidate_name,
        job_title=job_title,
        proctoring_profile=proctoring_data,
    )
    logger.info(
        f"[TRUST] Final  score={_trust_state['trust_score']} "
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

    # CRITICAL: Mark as COMPLETED immediately after first save to prevent re-dispatch
    # This must happen before any async work (summary, report, billing) that could fail
    if finished_task.done():
        try:
            _agent_dur = (time.time() - session_start_time) if session_start_time else None
            await update_interview_status(app_id, duration_seconds=_agent_dur)
            logger.info("[EARLY_STATUS_UPDATE] Marked COMPLETED to prevent duplicate job dispatch")
        except Exception as e:
            logger.error(f"[EARLY_STATUS_UPDATE] Failed to mark COMPLETED: {e}")

    # Calculate and persist skill ratings (async)
    async def _persist_skill_ratings_async():
        try:
            # Build skill ratings from answer_scores grouped by topic
            skill_ratings_by_topic = {}

            for score_record in answer_scores:
                topic = score_record.get("topic", "general")
                if topic not in skill_ratings_by_topic:
                    skill_ratings_by_topic[topic] = []
                skill_ratings_by_topic[topic].append(score_record)

            # Build final skill_ratings dict
            skill_ratings = {}
            for topic, scores in skill_ratings_by_topic.items():
                if not scores:
                    continue
                avg_overall = sum(s.get("overall", 5) for s in scores) / len(scores)
                avg_clarity = sum(s.get("clarity", 5) for s in scores) / len(scores)
                avg_depth = sum(s.get("depth", 5) for s in scores) / len(scores)

                # Calculate percentage (out of 10 max)
                percentage = min(100, (avg_overall / 10.0) * 100)

                # Get saturation info from first record (should be same for all records on same topic)
                sat_score = scores[0].get("topic_saturation_score", 0.0)
                sat_threshold = scores[0].get("topic_saturation_threshold", 0.0)
                sat_pct = (sat_score / sat_threshold * 100) if sat_threshold > 0 else 0

                skill_ratings[topic] = {
                    "score": round(avg_overall, 2),
                    "percentage": round(percentage, 0),
                    "clarity": round(avg_clarity, 2),
                    "depth": round(avg_depth, 2),
                    "max_score": 10.0,
                    "max_percentage": 100,
                    "answered": True,
                    "answer_count": len(scores),
                    "saturation_score": round(sat_score, 1),
                    "saturation_threshold": round(sat_threshold, 1),
                    "saturation_percentage": round(sat_pct, 0),
                    "quality_records": [
                        {
                            "turn": s.get("turn", 0),
                            "question": s.get("question", "")[:100],
                            "overall": s.get("overall", 5),
                            "clarity": s.get("clarity", 5),
                            "depth": s.get("depth", 5),
                            "signals": s.get("signals", []),
                        }
                        for s in scores
                    ],
                }

            if skill_ratings:
                await persist_skill_ratings(app_id, skill_ratings)
                logger.info(
                    "[SKILL_RATINGS] Persisted ratings for %d skills (avg_score=%.1f, avg_pct=%.0f%%)",
                    len(skill_ratings),
                    sum(r["score"] for r in skill_ratings.values()) / len(skill_ratings),
                    sum(r["percentage"] for r in skill_ratings.values()) / len(skill_ratings),
                )
            else:
                logger.info("[SKILL_RATINGS] No skill ratings to persist")
        except Exception as e:
            logger.warning("[SKILL_RATINGS] Failed to persist skill ratings: %s", e)

    spawn_background_task(_persist_skill_ratings_async(), "final_skill_ratings")
    logger.info("[PERSIST] Transcript and scores saved (answer_scores has %d turns)", len(answer_scores))

    # IMPORTANT: Wait briefly for any pending answer_scores to be added from background eval tasks
    # This ensures the report generator has all available scores
    await asyncio.sleep(0.5)
    logger.info("[REPORT_PREP] answer_scores final count: %d turns", len(answer_scores))

    await persist_org_usage_metrics(
        org_id,
        latest_session_usage or session.usage,
        tts_provider=org_tts_provider,
        tts_model=org_tts_model,
        stt_provider="DEEPGRAM",
        stt_model=org_deepgram_model,
    )
    # Ã°Å¸Â¤- AI Scorecard (NEW)
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
        # IMPORTANT: Re-fetch latest answer_scores from DB to ensure we have all evaluated turns
        try:
            final_scores = list(answer_scores)
            logger.info("[REPORT] Generating with answer_scores=%d turns from memory", len(final_scores))
            await asyncio.wait_for(
                generate_interview_report(
                    app_id,
                    transcript_lines,
                    final_scores,
                    job_title,
                    proctoring_data=proctoring_data,
                    org_id=org_id,
                    llm_model=analysis_model,
                ),
                timeout=120,
            )
        except asyncio.TimeoutError:
            logger.warning(f"[REPORT] Timed out for {app_id}; skipped after 120s")
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
        # Ã¢Å¡Â¡ Trigger Pinecone Sync immediately (status already updated in EARLY_STATUS_UPDATE)
        notify_sync_engine(app_id, turn=turn_count, action="session_end")
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

