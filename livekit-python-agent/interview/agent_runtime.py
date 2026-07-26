import asyncio
import collections
import json
import os
import time
from typing import Optional, Any
import re
from dataclasses import replace
from interview.agent_utils import (
    _coerce_jsonish,
    _compact_optional,
    parse_dispatch_metadata,
    first_name_from_full_name,
)
from interview.tech.phases import (
    build_greeting_text,
    build_interview_directive,
)
from interview.tech.brief import (
    TopicItem,
)
from interview.tech.question_bank_adapter import build_brief_from_question_bank
from interview.agent_runtime_utils import token_limit_kwarg
from interview.live_trap_score import LiveTrapScore
from interview.agent_providers import (
    build_elevenlabs_tts,
    build_llm,
    build_sarvam_tts,
    build_stt,
)
from interview.agent_persistence import (
    get_interview_context,
    mark_interview_failed,
    mark_interview_started,
    persist_answer_scores,
    persist_latency_signals,
    persist_trap_event,
    persist_session_fingerprint,
    persist_transcript,
    update_interview_status,
    is_demo_app_id,
    get_demo_interview_context,
    mark_demo_session_started,
    mark_demo_session_failed,
    persist_demo_transcript_completed,
)
from interview.slack_error_logger import (
    log_livekit_error,
    log_llm_error,
    log_stt_error,
    log_tts_error,
    log_worker_error,
)
from billing.billing import (
    save_org_usage_metrics as persist_org_usage_metrics,
    save_demo_session_usage,
)
from openai import AsyncOpenAI
from pydantic import BaseModel, field_validator
import urllib.request
import urllib.error
import urllib.parse
from dataclasses import dataclass, field
from enum import Enum

# --- Test Event Logger (for /test page debugging) ------------------------------
# Derived from APP_URL/NEXT_PUBLIC_APP_URL (same domain the rest of the app uses:
# localhost in .env, https://www.sreevaai.com in .envprod) so there's one place
# that sets the domain. Explicit TEST_EVENT_LOG_URL still wins if set.
_TEST_EVENT_LOG_URL = os.environ.get("TEST_EVENT_LOG_URL", "").strip()
if not _TEST_EVENT_LOG_URL:
    _app_url = (os.environ.get("APP_URL") or os.environ.get("NEXT_PUBLIC_APP_URL") or "").strip().rstrip("/")
    if _app_url:
        _TEST_EVENT_LOG_URL = f"{_app_url}/api/test/events"

async def log_test_event(app_id: str, event_type: str, message: str, data: dict | None = None) -> None:
    """Send event to /api/test/events for live debugging on /test page.
    No-op unless a URL could be resolved (TEST_EVENT_LOG_URL or APP_URL) -- prod
    agents don't run a local Next.js app, so this used to fire (and fail) on
    every interview event before this was made configurable.
    """
    if not app_id or not _TEST_EVENT_LOG_URL:
        return
    try:
        import aiohttp
        payload = {
            "applicationId": app_id,
            "event": event_type,
            "message": message,
            "data": data or {}
        }
        # Try async HTTP first, fall back to sync if aiohttp not available
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    _TEST_EVENT_LOG_URL,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=60)
                ) as resp:
                    pass
        except (ImportError, ModuleNotFoundError):
            # Fallback to sync HTTP
            payload_json = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                _TEST_EVENT_LOG_URL,
                data=payload_json,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            urllib.request.urlopen(req, timeout=60)
    except Exception as e:
        logger.debug("[TEST_EVENT_LOG] Failed to log event: %s", e)


def _usage_to_dict(usage: Any) -> Optional[dict]:
    """Flatten a LiveKit AgentSessionUsage into a JSON-safe dict for the
    interview-report job payload. report_worker.py rebuilds a getattr-friendly
    SimpleNamespace from this before handing it to UsageSummarizer.from_session()."""
    if not usage:
        return None
    model_usage = []
    for item in getattr(usage, "model_usage", []) or []:
        model_usage.append({
            "type": getattr(item, "type", ""),
            "provider": getattr(item, "provider", ""),
            "model": getattr(item, "model", ""),
            "inputTokens": getattr(item, "input_tokens", 0),
            "outputTokens": getattr(item, "output_tokens", 0),
        })
    return {
        "modelUsage": model_usage,
        "input_tokens": getattr(usage, "input_tokens", 0),
        "output_tokens": getattr(usage, "output_tokens", 0),
    }


# --- Interview Report Handoff (agent job -> durable Node/BullMQ worker) --------
_REPORT_ENQUEUE_URL = (
    os.environ.get("APP_URL", "http://localhost:3000").rstrip("/")
    + "/api/internal/interview-report"
)
_INTERNAL_API_SECRET = os.environ.get("INTERNAL_API_SECRET", "")

async def _enqueue_report_job(app_id: str, payload: dict) -> None:
    """Hand the report/summary/billing/debug-PDF tail off to the interview-report
    BullMQ queue via an internal Next.js route, instead of running it inline in
    this (LiveKit-Cloud-recycled) agent job. This single HTTP hop is also the
    only transport for this session's eval/brief/llmgen usage (the payload's
    "usage" key) -- report_worker.py is what actually bills it. A silently
    dropped enqueue therefore means BOTH the report AND this session's
    non-session-level billing are lost, so this retries a few times before
    giving up, and alerts on final failure instead of just logging it."""
    body = json.dumps(payload, default=str).encode("utf-8")
    headers = {"Content-Type": "application/json", "x-internal-secret": _INTERNAL_API_SECRET}
    attempts = 3
    last_error: str = ""
    for attempt in range(1, attempts + 1):
        try:
            try:
                import aiohttp
                async with aiohttp.ClientSession() as http_session:
                    async with http_session.post(
                        _REPORT_ENQUEUE_URL, data=body, headers=headers,
                        timeout=aiohttp.ClientTimeout(total=5),
                    ) as resp:
                        if resp.status >= 300:
                            last_error = f"HTTP {resp.status}"
                        else:
                            logger.info("[REPORT] Enqueued interview-report job for %s", app_id)
                            return
            except (ImportError, ModuleNotFoundError):
                req = urllib.request.Request(_REPORT_ENQUEUE_URL, data=body, headers=headers, method="POST")
                urllib.request.urlopen(req, timeout=5)
                logger.info("[REPORT] Enqueued interview-report job for %s", app_id)
                return
        except Exception as e:
            last_error = str(e)
        if attempt < attempts:
            logger.warning(
                "[REPORT] Enqueue attempt %d/%d failed for %s: %s -- retrying",
                attempt, attempts, app_id, last_error,
            )
            await asyncio.sleep(1.5 * attempt)
    logger.error("[REPORT] Enqueue failed for %s after %d attempts: %s", app_id, attempts, last_error)
    try:
        await log_worker_error(
            error=last_error,
            reason=f"interview-report enqueue failed after {attempts} attempts -- report AND eval/brief/llmgen billing lost for this session",
            context={"appId": app_id},
        )
    except Exception:
        pass  # alerting must never mask the original failure


class CoverageSource(str, Enum):
    EXPLICIT  = "explicit"    # agent explicitly moved on after probing
    AUTO_SKILL = "auto_skill" # skill inferred from a project's [tech] brackets
    CUSTOM_Q  = "custom_q"    # recruiter-supplied custom question was answered

@dataclass
class CoverageRecord:
    short_key:      str
    display_title:  str
    source:         CoverageSource
    gist:           str = ""          # first ~25 words of candidate answer; "" for auto
    via_topic:      str = ""          # parent topic title when source == AUTO_SKILL
    questions_asked: list[str] = field(default_factory=list)  # every question Ishitha asked on this topic

class CoveredTopics:
    """Single source of truth for all covered topics.

    Stores rich CoverageRecord per key so directives can tell the LLM
    *how* and *where* a topic was covered -- enabling acknowledgements like
    "yes, we covered Python during the DataFlow project discussion."

    Normalizes every key on every operation so string mismatch can never
    cause a topic to be re-asked.
    """
    def __init__(self) -> None:
        self._store: dict[str, CoverageRecord] = {}

    @staticmethod
    def _norm(key: str) -> str:
        short = (key or "").split(" - ")[0].strip()
        return re.sub(r"[^a-z0-9]+", " ", short.lower()).strip()

    # ------------------------------------------------------------------
    # Write API
    # ------------------------------------------------------------------
    def add(self, topic: str) -> None:
        """Backward-compat thin add — no context (used by legacy callers)."""
        k = self._norm(topic)
        if k and k not in self._store:
            self._store[k] = CoverageRecord(
                short_key=k,
                display_title=topic.split(" - ")[0].strip(),
                source=CoverageSource.EXPLICIT,
            )

    def record(
        self,
        topic: str,
        *,
        source: CoverageSource,
        gist: str = "",
        via_topic: str = "",
        questions_asked: Optional[list[str]] = None,
    ) -> None:
        """Rich add — always prefer this over add()."""
        k = self._norm(topic)
        if not k:
            return
        self._store[k] = CoverageRecord(
            short_key=k,
            display_title=topic.split(" - ")[0].strip(),
            source=source,
            gist=gist[:120].strip(),
            via_topic=via_topic,
            questions_asked=[q.strip() for q in (questions_asked or []) if q and q.strip()],
        )

    # ------------------------------------------------------------------
    # Read API
    # ------------------------------------------------------------------
    def __contains__(self, topic: object) -> bool:
        return self._norm(str(topic or "")) in self._store

    def __len__(self) -> int:
        return len(self._store)

    def __iter__(self):
        return iter(self._store)

    def keys(self) -> set[str]:
        return set(self._store.keys())

    def coverage_rows(self) -> list[dict]:
        """Plain-dict snapshot of every covered topic, for debug/report rendering."""
        return [
            {
                "display_title": rec.display_title,
                "source": rec.source.value,
                "gist": rec.gist,
                "via_topic": rec.via_topic,
                "questions_asked": list(rec.questions_asked),
            }
            for rec in self._store.values()
        ]



# Module-level singleton -- reuses the HTTP/2 connection pool and TLS session
# across all eval, directive, and brief calls for every interview session.
# Creating AsyncOpenAI() per-session causes a cold TLS handshake on the first
# call of each session, adding 50–200ms. One shared client eliminates that.
# max_retries=1 (SDK default is 2): eval/directive calls already sit inside their
# own asyncio.wait_for timeout, so a silent SDK-level retry-with-backoff on a
# transient error just burns the timeout budget on a second attempt instead of
# failing fast into our own recovery path. One retry still absorbs a real blip;
# it no longer eats most of an 8-11s budget doing it invisibly.
_SHARED_OPENAI_CLIENT: AsyncOpenAI = AsyncOpenAI(max_retries=1)
from interview.agent_runtime_helpers import (
    _build_recent_context_block,
    append_transcript_line,
    make_tts_sanitize_transform,
    _elevenlabs_normalize_transform,
    _sarvam_normalize_transform,
    polish_candidate_facing_text,
    remove_system_messages,
    remove_system_messages_multi,
)
from interview.agent_runtime_support import (
    INTERVIEW_TEMPERATURE,
    FIXED_INTERVIEW_DURATION_MINUTES,
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
from livekit.agents.voice.turn import InterruptionOptions
from interview.tech.prompts import (
    build_voice_layer_prompt,
    build_evaluation_layer_prompt,
    build_system_prompt,
)
CLOSING_TRIGGER_SECS = 10   # begin the closing goodbye at exactly T-10s (19:50 of a 20:00 interview).
# Custom-question normalisation constants  module-level so they are allocated once.
_CUSTOM_Q_PREFIXES: tuple[str, ...] = (
    "ask him about",
    "ask her about",
    "ask them about",
    "ask about",
    "please ask about",
    "question:",
)
# ponytail: English-only. Re-add a language table if multi-language support returns.
_STT_LANGUAGE_CODE = "en-US"
_TTS_LANGUAGE_CODE = "en"
# ponytail: _TTS_DEFAULT_MODELS deleted -- all model values come from org DB row now
# STT noise-suppression helpers  compiled at import time.
_STT_WHITESPACE_RE = re.compile(r"\s+")
_STT_NON_ALPHA_RE = re.compile(r"[^a-zA-Z]")
_STT_VOWEL_RE = re.compile(r"[aeiou]")
# TTS sentence boundary  compiled once at module level (not per tts_node call).
_TTS_SENT_END_RE = re.compile(r'(?<=[.?!…])\s+|(?<=—)\s+')
# Push to TTS if no sentence boundary found after this many chars. Raised from 200 --
# at 200, any sentence over ~30-35 words got force-split mid-sentence at an arbitrary
# character (not a clause boundary), and each split half became its own Sarvam
# synthesis segment with its own prosody -- audible as disjointed, word-by-word
# delivery specifically on longer sentences. 400 lets most real sentences (even
# fairly long interviewer ones) push as one continuous unit.
_TTS_MAX_BUFFER_CHARS = 400
def _normalize_custom_question_text(raw: str) -> str:
    text = re.sub(r"\s+", " ", (raw or "").strip().lower())
    for p in _CUSTOM_Q_PREFIXES:
        if text.startswith(p):
            text = text[len(p):].strip()
            break
    return re.sub(r"[^a-z0-9\s]", " ", text).strip()
def _expand_custom_q_tokens(text: str) -> set[str]:
    """Expand tokens from a question string for fuzzy custom-question coverage matching."""
    return {t for t in text.split() if len(t) >= 4}
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
def _topic_short_title(topic: str) -> str:
    """Extract short title from full topic string (before ' - ')."""
    return (topic or "").split(" - ")[0].strip()
def _topic_short_key_for_ordering(topic: str) -> str:
    """Normalized key for deduplication and lookup (lowercase, no special chars)."""
    short = _topic_short_title(topic)
    return re.sub(r"[^a-z0-9]+", " ", short.lower()).strip()

def _build_cross_ref_rule(source_tag: str) -> str:
    """Cross-reference rule for a MOVE_ON directive, keyed on the topic TAG.
    Tells Ishitha how to treat a topic the candidate may already have touched.
    Shared by both the pre-fired and the synchronous MOVE_ON paths so they stay
    identical — the pre-fired path previously passed "" and lost this guidance.
    """
    if source_tag == "RESUME_TOPIC":
        return (
            "\n[CROSS-REFERENCE RULE -- resume topic, candidate did this]\n"
            "If the candidate cites a project already in INTERVIEW MEMORY, treat it as KNOWN "
            "CONTEXT -- do NOT re-introduce it and do NOT re-ask what they built or their role.\n"
            "Probe DEPTH on the new topic: a decision they made, what broke, or a tradeoff.\n"
            "NEVER ask a question whose answer is already in INTERVIEW MEMORY."
        )
    if source_tag == "JD_TOPIC":
        return (
            "\n[CROSS-REFERENCE RULE -- JD requirement, NOT claimed on resume]\n"
            "The candidate has NOT claimed this on their resume. Open by asking about exposure,\n"
            "not by assuming experience. Based on their answer:\n"
            "  - If they say they have NOT used it: acknowledge briefly, do NOT push or quiz theory.\n"
            "  - If they say they HAVE used it: stay APPLIED -- ask what they actually did with it,\n"
            "    not internals or trivia. They made no expertise claim."
        )
    # ROLE_TOPIC (and any unknown tag)
    return (
        "\n[CROSS-REFERENCE RULE -- role-depth check, not on resume or JD]\n"
        "We have no information about their experience here. Ask about understanding or\n"
        "approach -- never assume they have done it. If they have no exposure, accept it\n"
        "and move on. Do NOT frame it as if it were on their resume."
    )

@dataclass(frozen=True)
class _CandidateIntent:
    """Classification of what the candidate's last turn actually was.

    Single source of truth for filler/reaction selection -- previously this
    classification logic was duplicated (with diverging pattern lists) between
    the probe-directive path and the move-on-directive path, which is how
    phrasings like "I'm asking is this a small question?" fell through one
    classifier's clarification check but not the other's (move-on had no
    clarification check at all).
    """
    is_connection_check: bool
    is_clarification_ask: bool
    is_no_recall: bool
    is_hedge: bool
    hint: str  # ready-to-use guidance string for the LLM prompt


def _classify_candidate_intent(
    prev_answer: str, prev_question: str = "", *, for_move_on: bool = False,
) -> _CandidateIntent:
    """Classify the candidate's last turn.

    prev_question grounds the classification in what was actually asked --
    without it, a short reply like "what?" or "is this a...?" is judged purely
    by its own wording, and the resulting hint has no question to re-ask or
    reference, so the LLM's "re-ask the SAME question" instruction was pointing
    at nothing concrete. Passing prev_question lets the hint quote the actual
    question back, and lets short bare replies ("what?", "sorry?") only count
    as a clarification ask when there WAS a real question to be confused about
    (not during warmup chit-chat where prev_question is empty).

    for_move_on=True: the topic is already decided to change (a MOVE_ON is in
    progress) -- prev_answer/prev_question are used ONLY to pick the best
    filler/reaction, never to alter the transition itself. The default
    (for_move_on=False, used by the within-topic probe path) still tells the
    LLM to stay on the same question when the candidate was confused, since
    there the topic genuinely isn't moving.
    """
    from interview.tech.probe import _ALLOWED_FILLERS  # single source of truth -- see probe.py

    prev_lower = (prev_answer or "").lower().strip()
    prev_q_stripped = (prev_question or "").strip()
    _fillers_note = ", ".join(f"'{w}'" for w in _ALLOWED_FILLERS)

    is_connection_check = any(
        p in prev_lower for p in ("can you hear", "are you there", "hello?", "you there?")
    )
    # Clarification/confusion signals -- expanded from the original list after a
    # live transcript showed real candidate phrasings slipping through:
    # "I'm asking is this a small question?", "is this a dumb/smart question",
    # "which project", "what question", "not clear", "confused".
    is_clarification_ask = is_connection_check or any(
        p in prev_lower
        for p in (
            "are you asking", "you're asking", "i'm asking", "im asking",
            "do you mean", "what do you mean", "which project", "which one",
            "which question", "what project", "what question",
            "can you clarify", "can you repeat", "can you refresh",
            "is this a", "is that a",  # "is this a small/dumb/smart question?"
            "not clear", "confus", "don't understand", "dont understand",
            "didn't get", "didnt get", "come again",
        )
    )
    # Bare one/two-word confusion replies ("what?", "sorry?", "huh?") only count
    # as clarification if there was an actual question to be confused about --
    # otherwise a short warmup pleasantry ("what's up") would misfire.
    if not is_clarification_ask and prev_q_stripped and len(prev_lower.split()) <= 3:
        is_clarification_ask = any(
            prev_lower == p or prev_lower.startswith(p)
            for p in ("what?", "what", "sorry?", "sorry", "huh?", "huh", "pardon?", "pardon")
        )
    is_no_recall = (not prev_lower) or any(
        p in prev_lower
        for p in ("i don't know", "i dont know", "i forgot", "i don't remember",
                   "i dont remember", "not sure", "can't recall", "cant recall",
                   "don't remember", "no idea")
    )
    is_hedge = any(
        p in prev_lower for p in ("i think", "probably", "maybe", "i believe", "kind of", "sort of")
    )

    _q_ref = f" (\"{prev_q_stripped[:120]}\")" if prev_q_stripped else ""

    if is_connection_check:
        if for_move_on:
            hint = (
                "CONNECTION CHECK: They asked if you can hear them, not answered the question"
                f"{_q_ref}. Briefly confirm you can hear them before moving on -- "
                "e.g. 'Yes, I can hear you' / 'Loud and clear' -- then transition into the new topic."
            )
        else:
            hint = (
                "CONNECTION CHECK: They asked if you can hear them, not answered the question. "
                "Briefly confirm you can hear them, then re-ask the SAME question you just asked"
                f"{_q_ref} (don't move to a new topic or skip it as if it were answered)."
            )
    elif is_clarification_ask:
        if for_move_on:
            hint = (
                f"CLARIFICATION DETECTED: They were confused or asking what you meant{_q_ref} -- "
                f"they never actually answered it. Acknowledge that briefly -- pick ONE that fits "
                f"from this exact list: {_fillers_note} -- then move into the new topic. "
                "Do not imply their confusion was an answer or that the old question got resolved."
            )
        else:
            hint = (
                "CLARIFICATION DETECTED: They are confused or asking what you meant -- they did NOT "
                "answer the question and did NOT ask to move on. You MUST re-explain or rephrase the "
                f"SAME question you just asked{_q_ref}, more simply, anchoring the topic name "
                "explicitly. Do NOT ask a new question. Do NOT change topics. Do NOT treat this as "
                "an answer."
            )
    elif is_no_recall:
        hint = (
            f"FILLER: they couldn't recall — pick ONE that fits from this exact list: {_fillers_note}. "
            "Don't reuse recent turns' wording."
        )
    elif len(prev_lower.split()) <= 8:
        hint = (
            f"FILLER: short answer, acknowledge briefly — pick ONE that fits from this exact list: "
            f"{_fillers_note}. Don't reuse recent turns' wording."
        )
    elif is_hedge:
        hint = (
            f"FILLER: they hedged, don't praise it — pick ONE that fits from this exact list: "
            f"{_fillers_note}. Don't reuse recent turns' wording."
        )
    else:
        hint = (
            f"FILLER: substantive answer — pick ONE that fits from this exact list: {_fillers_note}. "
            "Don't reuse recent turns' wording."
        )

    return _CandidateIntent(
        is_connection_check=is_connection_check,
        is_clarification_ask=is_clarification_ask,
        is_no_recall=is_no_recall,
        is_hedge=is_hedge,
        hint=hint,
    )


# ---------------------------------------------------------------------------
# PROBLEM 3 fix: real cross-interview RECENT_QUESTION_PATTERNS state.
#
# QUESTION_GENERATION_SYSTEM (interview/tech/probe.py) has always claimed a
# global scaffold-collision check, but no caller ever built or passed real
# recent_question_patterns/declined_facts state -- get_probe_context() silently
# used its "(none yet)" default on every single turn. The functions below build
# that real state: a rolling opener+construction log, a permanent "no-jargon
# teach-back" one-shot flag, and rendering helpers for the two prompt blocks.
# ---------------------------------------------------------------------------
_NO_JARGON_TEACHBACK_RE = re.compile(
    r"\b(no jargon|without (?:using )?jargon|explain(?:ing)? .{0,40}to someone (?:who|that)|"
    r"in plain english|like i'?m five|like i'?m new|to a complete beginner|"
    r"never touched (?:it|this|that))\b",
    re.I,
)


def _classify_question_construction(question_text: str, signal: str | None) -> str:
    """Cheap, deterministic scaffold fingerprint for a spoken question -- used
    to detect repeated CONSTRUCTIONS (not just repeated literal openers). This
    is the missing half of the "global RECENT_QUESTION_PATTERNS collision
    check" QUESTION_GENERATION_SYSTEM's docstring claims exists: previously
    nothing computed a scaffold at all, so the LLM-facing collision check had
    no real data to compare against.

    Returns a short label, e.g. "no_jargon_teachback", "first_thing_check",
    "what_would_you_check", "generic". Not exhaustive -- good enough to catch
    the exact repeat-offender constructions seen in production transcripts.
    """
    q = (question_text or "").strip().lower()
    if not q:
        return "empty"
    if _NO_JARGON_TEACHBACK_RE.search(q):
        return "no_jargon_teachback"
    if re.search(r"\bfirst thing you\W+d (check|do|look at)\b", q):
        return "first_thing_check"
    if re.search(r"\bwhat would you check\b", q):
        return "what_would_you_check"
    if re.search(r"\bwhat('?s| is) the first\b", q):
        return "whats_the_first"
    if re.search(r"\bwalk me through\b", q):
        return "walk_me_through"
    if re.search(r"\bwhat (broke|breaks|goes wrong)\b", q):
        return "failure_case"
    if re.search(r"\bwhy (this|that|.+) over\b", q):
        return "why_this_over"
    return "generic"


def _extract_question_opener(question_text: str, n_words: int = 4) -> str:
    words = (question_text or "").strip().split()
    return " ".join(words[:n_words]).lower()


def is_no_jargon_teachback(question_text: str) -> bool:
    """True if this question is the 'explain it with no jargon / to someone who's
    never touched it' teach-back construction -- Problem 3's overused fallback."""
    return bool(_NO_JARGON_TEACHBACK_RE.search((question_text or "").lower()))


def record_question_pattern(
    patterns_log: "collections.deque",
    question_text: str,
    signal: str | None,
) -> None:
    """Append this turn's opener+construction fingerprint to the running
    RECENT_QUESTION_PATTERNS log. Call once per spoken question, at the same
    point _asked_questions_log is appended to."""
    if not (question_text or "").strip():
        return
    patterns_log.append({
        "opener": _extract_question_opener(question_text),
        "construction": _classify_question_construction(question_text, signal),
        "signal": signal or "",
    })


def render_recent_question_patterns(patterns_log: "collections.deque") -> str:
    """Render the running pattern log into the string get_probe_context()
    injects into QUESTION_GENERATION_SYSTEM's RECENT_QUESTION_PATTERNS block."""
    if not patterns_log:
        return "(none yet)"
    lines = [
        f'  - opener: "{p["opener"]}..."  scaffold: {p["construction"]}  (fired by: {p["signal"] or "none"})'
        for p in patterns_log
    ]
    return "\n".join(lines)


def render_declined_facts(declined_facts_log: list[str]) -> str:
    if not declined_facts_log:
        return "(none yet)"
    return "\n".join(f"  - {f}" for f in declined_facts_log)


# ---------------------------------------------------------------------------
# PROBLEM 4 fix: hard post-generation validator for spoken question turns.
#
# QUESTION_GENERATION_SYSTEM has always specified a 25-word / one-'?' / two-
# sentence cap in prompt text only -- there was no code-level check, so the
# transcript's violations (2+ sentences of setup, stacked "X? ... Y?" turns)
# went out unchecked. This validator runs against the actual generated text,
# not the directive that steered it, and is applied in llm_node() below on
# ordinary PROBE turns (the free-form spoken-question path) before anything
# reaches TTS.
# ---------------------------------------------------------------------------
_CODE_FENCE_RE = re.compile(r"```(?:\w+)?\n?.*?```", re.S)


_CODE_CARD_TYPE_TAGS = ("code_trace", "snippet_eval", "query_trace")
_LANG_FENCE_TAGS = ("python", "sql", "sh", "bash", "js", "javascript")


_LANG_ANNOTATION_RE = re.compile(r"^LANG:\s*([\w+.#-]+)\s*$", re.IGNORECASE)


def extract_code_card(text: str) -> tuple[str, str, str, str] | None:
    """If `text` contains a fenced code block, splits it into (spoken_text, code,
    question_type, language). spoken_text is everything outside the fence,
    whitespace-collapsed -- this is what TTS actually says. Returns None if
    there's no fence (the common case -- most questions are spoken-only). Only
    the FIRST fence is used; a question should only ever carry one card.

    question_type is read from the fence's language tag (e.g. ```code_trace) per the
    QUESTION_GENERATION_SYSTEM contract -- falls back to "code_trace" for an ordinary
    language tag (```python) or no tag, so scoring still gets code-question calibration
    even if the LLM used a plain language tag instead of the type tag.

    language (for syntax highlighting on the frontend) is read from an optional
    "LANG: <language>" annotation line immediately after the type-tag fence line
    (see question_bank_adapter.py, which embeds this for stored anchor
    questions where the real language is already known). Falls back to a
    plain-language tag if one was used instead of the type tag, else "".
    """
    m = _CODE_FENCE_RE.search(text or "")
    if not m:
        return None
    code = m.group(0).strip("`").strip()
    lines = code.split("\n")
    first_line = lines[0].strip().lower() if lines else ""
    language = ""
    if first_line in _CODE_CARD_TYPE_TAGS:
        question_type = first_line
        code = "\n".join(lines[1:])
        lang_match = _LANG_ANNOTATION_RE.match(lines[1].strip()) if len(lines) > 1 else None
        if lang_match:
            language = lang_match.group(1).strip().lower()
            code = "\n".join(lines[2:])
    else:
        question_type = "code_trace"
        if first_line in _LANG_FENCE_TAGS:
            language = first_line
            code = "\n".join(lines[1:])
    spoken = (text[: m.start()] + " " + text[m.end():]).strip()
    spoken = re.sub(r"\s+", " ", spoken)
    return spoken, code.strip(), question_type, language


def validate_spoken_question(text: str, *, max_words: int = 30) -> list[str]:
    """Returns a list of violation reasons (empty list = passes). Pure/sync so
    it's trivially unit-testable without any LLM or audio dependency."""
    violations: list[str] = []
    stripped = (text or "").strip()
    if not stripped or stripped == "NO_FOLLOW_UP_NEEDED":
        return violations  # sentinel / empty outputs are a valid non-question turn

    # Code-card questions: validate only the SPOKEN part (the lead-in), never the
    # fenced code -- code legitimately contains newlines/words/no '?' that would
    # otherwise fail every check below for the wrong reason.
    _card = extract_code_card(stripped)
    if _card is not None:
        stripped = _card[0]
        if not stripped:
            return violations

    word_count = len(stripped.split())
    if word_count > max_words:
        violations.append(f"word_count={word_count} exceeds max_words={max_words}")

    q_count = stripped.count("?")
    if q_count != 1:
        violations.append(f"question_mark_count={q_count} (must be exactly 1)")

    # Compound "and"/"or" joining two distinct asks. Two shapes to catch:
    #  (a) content stacked AFTER the (first) '?' -- "X? And what about Y?"
    #  (b) a second interrogative clause joined by and/or BEFORE the only '?' --
    #      "What would you consider the biggest risk, and what's the first
    #      thing you'd check?" -- only one '?' total, so (a) alone misses it.
    # A plain "and" inside a single non-interrogative clause ("errors climbed
    # and latency spiked") is NOT a compound ask -- only flag when the segment
    # after and/or itself starts a new question-shaped clause (a wh-word or
    # auxiliary-inversion opener).
    _WH_OPENER_RE = re.compile(
        r"^(what|who|when|where|why|how|which|do|does|did|is|are|was|were|"
        r"can|could|would|will|should|have|has)\b",
        re.I,
    )
    first_q_idx = stripped.find("?")
    if first_q_idx != -1 and first_q_idx < len(stripped) - 1:
        tail = stripped[first_q_idx + 1:]
        if re.search(r"\b(and|or)\b", tail, re.I):
            violations.append("compound question: content stacked after the first '?'")
    if not any("compound question" in v for v in violations):
        for m in re.finditer(r"\b(?:and|or)\b\s+(.+)", stripped, re.I):
            candidate_clause = m.group(1).strip()
            if _WH_OPENER_RE.match(candidate_clause):
                violations.append(
                    "compound question: second interrogative clause joined by and/or "
                    f"before the question mark ({candidate_clause[:40]!r}...)"
                )
                break

    return violations


_STRICT_REGEN_SUFFIX = (
    "\n\n[REGENERATION -- YOUR LAST OUTPUT VIOLATED THE HARD LENGTH/FORMAT CAP]\n"
    "Your previous attempt broke one of these HARD rules: (1) reaction+question together "
    "must be <= 30 words total, (2) EXACTLY ONE '?' in the entire output, (3) never stack a "
    "second question after the first with 'and'/'or'. Rewrite as ONE short reaction beat plus "
    "ONE single question, under 30 words, with exactly one '?'. Keep any concrete case/input the "
    "question needs, but cut all other setup/context -- ask the sharpest single thing directly."
)


def _build_probe_directive(
    *,
    signal: Optional[str],
    signal_reason: Optional[str],
    level: int,
    active_topic: str,
    topic_item: Optional[Any],
    prev_question: str,
    prev_answer: str,
    topic_follow_ups: int,
    topic_denied: bool,
    coverage_memory: str,
    asked_questions_log: list[str],
    topic_transcript: list[str],
    signals_history: list[str] | None = None,
    probe_rotation_index: int = 0,
    interview_type: str = "tech",
    recent_question_patterns: str = "(none yet)",
    declined_facts: str = "(none yet)",
    cross_cutting_signal: Optional[str] = None,
    topic_score_history: Optional[list] = None,
) -> str:
    """
    Builds the probe directive synchronously — no LLM call.
    All inputs come from the eval result + topic brief already in memory.
    The interview LLM (Ishitha) reads this and generates her own question.

    Eliminates the middle directive LLM call, collapsing 3 calls/turn → 2.

    cross_cutting_signal: Part B's optional cross-cutting signal (verbal_disfluency/
    buzzword_without_substance/self_correction_recovery/internal_contradiction/
    pure_denial) fired alongside the primary stage signal this turn, if any.

    interview_type: routes to interview.tech.probe or interview.conversational.probe
    for the signal-specific probe directive (different signal sets per module).
    """
    if interview_type == "conversational":
        from interview.conversational.probe import get_probe_context
    else:
        from interview.tech.probe import get_probe_context

    # probe_focus is now one descriptive paragraph per topic (not a rotating
    # list of sub-concepts) -- pass it straight through as probing guidance.
    _focus_text: str = (topic_item.probe_focus or "") if topic_item else ""

    if topic_item is not None:
        parts = [f"TOPIC: {topic_item.title}"]
        if topic_item.full_description:
            parts.append(f"WHAT THIS IS: {topic_item.full_description}")
        if topic_item.tech_stack:
            parts.append(f"TECH STACK: {', '.join(topic_item.tech_stack)}")
        if _focus_text:
            parts.append(f"WHAT TO PROBE FOR: {_focus_text}")
        if topic_item.probe_avoid:
            parts.append(f"SKIP: {', '.join(topic_item.probe_avoid)}")
        _topic_ctx = "\n".join(parts)
    else:
        _topic_ctx = f"TOPIC: {active_topic}"

    # Last N lines of the conversation thread
    _thread = "\n".join(topic_transcript[-8:]) if topic_transcript else (
        f"Interviewer: {prev_question}\nCandidate: {prev_answer}"
    )

    _asked = "\n".join(f"  - {q}" for q in asked_questions_log[-6:])

    # Full probe context from probe_strategy -- what fired, what to do, what to skip
    _probe_ctx = get_probe_context(
        signal=signal,
        signal_reason=signal_reason,
        level=level,
        topic_follow_ups=topic_follow_ups,
        topic_denied=topic_denied,
        prev_answer=prev_answer,
        signals_history=signals_history or [],
        active_topic=active_topic,
        prev_question=prev_question,
        recent_question_patterns=recent_question_patterns,
        declined_facts=declined_facts,
        cross_cutting_signal=cross_cutting_signal,
        topic_score_history=topic_score_history,
    )

    # Filler guidance -- classify prev answer intent so Ishitha's reaction is connected.
    # Shared classifier (also used by _generate_move_on_directive) so clarification/
    # confusion detection doesn't drift between the two directive-building paths.
    _intent = _classify_candidate_intent(prev_answer, prev_question)
    _is_connection_check = _intent.is_connection_check
    _is_clarification_ask = _intent.is_clarification_ask
    _filler_hint = _intent.hint

    # Short display label for the HARD STOP line -- prefer structured topic title,
    # fall back to the first segment of the full active_topic context string.
    _topic_short = (
        topic_item.title if topic_item
        else (active_topic.split(" — ")[0].split(" - ")[0].split("|")[0].strip()[:60])
    )

    parts_out = [
        f"[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]",
        f"",
        f"ACTIVE TOPIC LOCK: {active_topic}",
        f"You are ON this topic ONLY. Every question you ask must be about this topic and nothing else.",
        f"If you ask about any other topic, you are breaking the interview protocol.",
        f"",
        f"TOPIC BRIEF:",
        _topic_ctx,
        f"",
        f"WHAT THE CANDIDATE JUST SAID:",
        _thread,
        f"",
        f"WHAT TO PROBE:",
        _probe_ctx,
        f"",
        _filler_hint,
        f"",
    ]
    if _asked:
        parts_out += [
            "DO NOT ask these again (already covered on this topic):",
            _asked,
            "",
        ]
    if coverage_memory:
        parts_out.append(coverage_memory)

    if _is_clarification_ask:
        # Single, unambiguous clarification instruction -- takes priority over
        # (and replaces) the generic "ask your follow-up question" instruction below.
        # Previously both instructions were emitted together, with the generic
        # "ask your follow-up question" line landing first and stronger, so the
        # LLM would ask a brand-new question instead of clarifying -- confirmed
        # from a live transcript where "You're asking about which project?" was
        # answered by pivoting to an entirely different topic instead of
        # clarifying which project was meant.
        parts_out += [
            f"THEY ASKED FOR CLARIFICATION, NOT AN ANSWER: Re-explain or rephrase the SAME "
            f"question you just asked, MORE SIMPLY, and mention '{_topic_short}' upfront so "
            f"they know exactly which topic/project you mean. Do NOT ask a new question. "
            f"Do NOT move to a different topic or sub-concept this turn.",
            "One question mark. Never two questions in one turn.",
            "",
        ]
    else:
        parts_out += [
            "NOW: React to what they said (one short phrase), then ask your follow-up question.",
            "One question mark. Never two questions in one turn.",
            "The question can have 1-3 sentences of natural setup before the actual question — that's fine.",
            "Grounded in what they just told you. Never 'Can you' or 'Could you'. Never 'Great!' or 'Awesome!'.",
            "",
        ]
    parts_out += [""]

    directive = "\n".join(parts_out)
    import logging as _logging
    _logging.getLogger("interview-agent").info(
        "[PROBE_DIRECTIVE] built (no LLM) | topic=%r signal=%s | %d chars",
        active_topic[:60], signal or "none", len(directive),
    )
    _logging.getLogger("interview-agent").info("[PROBE_DIRECTIVE_FULL]\n%s", directive)
    return directive


async def _generate_move_on_directive(
    *,
    old_topic_title: str,
    new_topic: str,
    new_topic_title: str,
    source: str,
    level: int,
    memory_block: str,
    cross_ref_rule: str,
    client: Any,
    llm_model: str,
    usage_sink: Optional[Any] = None,
    topic_item: Optional[Any] = None,
    prev_answer: str = "",  # candidate's last answer — used to derive the right opening filler
    prev_question: str = "",  # question that answer was responding to — grounds clarification detection
    app_id: str = "",
    candidate_name: str = "",
    is_skill_only: bool = False,  # tech interviews: topics are skills, never projects/work
) -> str:
    """
    Ask GPT-4.1-mini to generate a full MOVE_ON directive including the opening
    question for the new topic. Returns the complete directive string ready for
    injection into chat_ctx.
    The directive tells Ishitha:
    - What topic she is leaving (closed)
    - What the new topic is + full context
    - What angle to open on (from the analyst brief)
    - How to transition naturally (no "Next up:", no verbatim script)
    - What NOT to say
    Falls back to the rule-based verbatim directive on any failure.
    """
    import logging as _logging
    _log = _logging.getLogger("interview-agent")
    # Build brief context: prefer structured TopicItem data from InterviewBrief,
    # fall back to text-scanning the llm_brief string.
    _brief_context = ""
    if topic_item is not None:
        parts = [f"TOPIC: {topic_item.title}"]
        if topic_item.full_description:
            parts.append(f"CONTEXT: {topic_item.full_description}")
        if topic_item.tech_stack:
            parts.append(f"TECH STACK: {', '.join(topic_item.tech_stack)}")
        if topic_item.probe_focus:
            parts.append(f"PROBE FOCUS (build the opening question around this): {topic_item.probe_focus}")
        if topic_item.probe_avoid:
            parts.append(f"PROBE AVOID: {', '.join(topic_item.probe_avoid)}")
        _brief_context = "\n".join(parts)
    # Attribution guard: a STANDALONE / personal project must NEVER be tied to an
    # employer. The candidate's resume lists the project as standalone (the topic
    # string carries a [standalone] marker), so the brief's nearby company names
    # (their employers) are NOT where this project was built. Without this guard the
    # MOVE_ON LLM -- which we tell to "name the company" -- fuses the project with a
    # nearby employer and asks "...at <Company>" about a personal project (the exact
    # "Social Rises" bug).
    _is_standalone = "[standalone]" in (new_topic or "").lower()
    _attribution_guard = ""
    if _is_standalone and not is_skill_only:
        _attribution_guard = (
            "\nATTRIBUTION GUARD -- CRITICAL:\n"
            "This topic is a STANDALONE / personal project. It is NOT linked to any company.\n"
            "NEVER attach an employer or company name to it. NEVER say '...at <Company>'.\n"
            "Even if the analyst brief mentions a company nearby, do NOT assume this project\n"
            "was built there. Ask about the project on its own terms.\n"
        )
    # Tag-based framing -- the tag tells us exactly what the candidate knows and how to open.
    # This is the single most important framing rule: wrong tag = wrong question type.
    #
    # RESUME_TOPIC : candidate did this -- we know it. Ask about what they built, owned, or decided.
    #                NEVER ask if they did it. NEVER ask why they worked somewhere. They worked there.
    # JD_TOPIC     : role requires this but candidate has NOT claimed it on their resume.
    #                Ask neutrally -- curious about exposure. Do NOT assume they know it.
    # ROLE_TOPIC   : comes from expert domain knowledge, NOT resume or JD.
    #                Candidate has no known experience here. Ask a concept/approach question.
    #                NEVER ask "what was your experience with X" -- they may have none.
    _topic_type_hint = (topic_item.topic_type if topic_item else "") or ""
    _probe_focus_str = (topic_item.probe_focus or "") if topic_item else ""

    if is_skill_only:
        # Skill-only tech interview: every topic is a skill/concept, never a project or
        # work-history item. Questions must be answerable cold -- never referencing the
        # candidate's resume, projects, or "a time when you used X".
        _level_skill = {
            1: "Open with a small TRACE or DECIDE question -- a concrete case they must reason through, "
               "not a syntax/definition recall. Basic but it must have a real answer, not 'it depends'.",
            2: "Open with a mechanics or performance-triage question -- trace how it works on a concrete "
               "case, or what to check FIRST when something is slow.",
            3: "Open with an applied tradeoff question grounded in a realistic constraint -- a real choice to justify.",
            4: "Open with a tradeoff or systemic-scenario question -- no single correct answer, force reasoning.",
        }.get(level, "Open with a concrete cold-reasoning question testing real understanding, never recall.")
        _skill_source_note = {
            "RESUME_TOPIC": "On resume AND required by the JD -- a common skill for this role.",
            "JD_TOPIC": "Required by the JD, not claimed on resume -- ask cold-reasoning anyway; accept no exposure gracefully.",
            "ROLE_TOPIC": "Expert-knowledge check -- not on resume or JD.",
        }.get(source, "A skill relevant to this role.")
        _angle_guide = (
            f"SOURCE: {source} -- {_skill_source_note}\n"
            f"This is a SKILL-ONLY technical interview. NEVER reference the candidate's resume, "
            f"projects, work history, or employer -- not even to 'ground' the question. Every question "
            f"must be a cold-reasoning prompt about the skill itself, answerable by anyone who genuinely "
            f"knows it.\n\n"
            f"HOW TO BUILD THE QUESTION -- combine these, don't pick just one:\n"
            f"  SKILL: {topic_item.title if topic_item else new_topic_title} -- name it naturally.\n"
            f"  CONTEXT: {(topic_item.full_description if topic_item else '') or '(none)'} -- use it to ground "
            f"a concrete distinction, mechanism, or scenario.\n"
            f"  TECH STACK: {', '.join(topic_item.tech_stack) if (topic_item and topic_item.tech_stack) else '(none)'}\n"
            f"  PROBE FOCUS (MANDATORY angle): {_probe_focus_str or 'a fundamentals or mechanics angle for this skill'}\n\n"
            f"DEPTH TARGET (LEVEL {level}): {_level_skill}\n"
            f"FORBIDDEN: 'tell me about a project where', 'your resume', 'a time when you', 'have you used', "
            f"any company/project name, any 'what did you build/own' framing."
        )
    elif source in ("RESUME_TOPIC", "resume_project", "resume_skill"):
        _standalone_note = (
            "NOTE: This is a standalone personal project — not built at any employer. "
            "Never attach a company name to it.\n"
        ) if _is_standalone else ""
        _type_context = {
            "project": "a project they personally built",
            "work":    "a role or job they held",
            "skill":   "a skill they listed on their resume",
        }.get(_topic_type_hint, "something from their resume")
        _level_depth = {
            1: "Surface-level is fine — a concrete detail, not a scaling or architecture answer.",
            2: "Push for what was specifically their own call, not team language.",
            3: "Skip setup. Go straight to a tradeoff, design decision, or what broke.",
            4: "Probe strategic judgment — what it changed, what the stakes were, what they'd do differently.",
        }.get(level, "Ask at a depth appropriate to their level.")
        _angle_guide = (
            f"SOURCE: RESUME_TOPIC — {_type_context}.\n"
            f"{_standalone_note}"
            f"The candidate HAS done this. We know it from their resume. We are not checking if they did it — "
            f"never ask generic ownership questions like 'what did you build' or 'what did you personally own'.\n\n"
            f"HOW TO BUILD THE QUESTION — combine all four of these, don't pick just one:\n"
            f"  TITLE: {topic_item.title if topic_item else new_topic_title} — name it naturally so they know what you mean.\n"
            f"  DESCRIPTION: {(topic_item.full_description if topic_item else '') or '(none)'} — pull ONE concrete "
            f"detail from this (a mechanism, a number, a specific step) to ground the question.\n"
            f"  TECH STACK: {', '.join(topic_item.tech_stack) if (topic_item and topic_item.tech_stack) else '(none)'} "
            f"— use a specific tool/technology by name if it sharpens the question.\n"
            f"  PROBE FOCUS (MANDATORY angle — the question must dig into ONE of these, not generic ownership): "
            f"{_probe_focus_str or 'a specific decision or mechanism from the description'}\n\n"
            f"DEPTH TARGET (LEVEL {level}): {_level_depth}\n"
            f"FORBIDDEN: 'do you have experience', 'why did you work there', 'what drew you to X', "
            f"'tell me about your background', 'what did you build/own/do' with no specific angle attached."
        )
    elif source in ("JD_TOPIC", "jd_skill"):
        _level_jd = {
            1: "Ask gently — they may be new to this. Check for any exposure, even self-taught or exploratory.",
            2: "Ask about real usage in a project — not theory, not self-description.",
            3: "Ask about production depth — constraints, tradeoffs, real consequences.",
            4: "Ask about strategic calls — where they've had to make judgment calls around it.",
        }.get(level, "Ask about their exposure neutrally — the role needs it, they haven't claimed it.")
        _angle_guide = (
            f"SOURCE: JD_TOPIC — this is required by the job description.\n"
            f"The candidate has NOT claimed this on their resume. We do not know if they've used it.\n"
            f"Make it clear to the candidate WHY you're asking — the role needs this — "
            f"then ask ONE question that checks exposure without assuming they have any.\n\n"
            f"HOW TO BUILD THE QUESTION — combine all four of these, don't pick just one:\n"
            f"  TITLE: {topic_item.title if topic_item else new_topic_title} — name it naturally.\n"
            f"  DESCRIPTION: {(topic_item.full_description if topic_item else '') or '(none)'} — use it to explain "
            f"why this matters for the role, in one short phrase.\n"
            f"  TECH STACK: {', '.join(topic_item.tech_stack) if (topic_item and topic_item.tech_stack) else '(none)'} "
            f"— name the specific tool/technology rather than speaking generically.\n"
            f"  PROBE FOCUS (MANDATORY angle): {_probe_focus_str or 'their exposure or approach to this'}\n\n"
            f"DEPTH TARGET (LEVEL {level}): {_level_jd}\n"
            f"FORBIDDEN: 'you listed', 'on your resume', 'walk me through your experience with' (assumes experience), "
            f"grilling them if they say they haven't used it."
        )
    elif source in ("ROLE_TOPIC", "role_topic"):
        _role_desc = (topic_item.full_description if topic_item else "") or ""
        _level_role = {
            1: "Ask about the concept — do they understand what it means and why it matters?",
            2: "Ask about any real exposure or how they'd approach it if given the problem.",
            3: "Ask about a concrete decision or tradeoff in this space — real stakes, not theory.",
            4: "Ask about systemic or organizational thinking — how does it play out at team/org scale?",
        }.get(level, "Ask how they think about or would approach this — they may have zero prior experience.")
        _angle_guide = (
            f"SOURCE: ROLE_TOPIC — this comes from expert domain knowledge of the role.\n"
            f"It is NOT on the candidate's resume and NOT in the job description. "
            f"We have no idea if they've worked with this.\n"
            f"Ask ONE question that checks their thinking or approach, not their experience history.\n\n"
            f"HOW TO BUILD THE QUESTION — combine all four of these, don't pick just one:\n"
            f"  TITLE: {topic_item.title if topic_item else new_topic_title} — name it naturally.\n"
            f"  DESCRIPTION: {_role_desc or '(none)'} — use it to explain in one short phrase why this matters "
            f"for the role before asking.\n"
            f"  TECH STACK: {', '.join(topic_item.tech_stack) if (topic_item and topic_item.tech_stack) else '(none)'}\n"
            f"  PROBE FOCUS (MANDATORY angle): "
            f"{_probe_focus_str or 'their understanding, reasoning, how they would approach it'}\n\n"
            f"DEPTH TARGET (LEVEL {level}): {_level_role}\n"
            f"FORBIDDEN: 'what was your experience with X' (assumes experience), 'why did you work with X', "
            f"'what do you know about X?' (generic), framing it as if it's on their resume."
        )
    else:
        _angle_guide = (
            f"Open with a specific, grounded question about {new_topic_title} based on the brief context above. "
            f"Do NOT ask why they worked somewhere or what drew them to a company."
        )
    if is_skill_only:
        _open_examples = (
            "HOW GOOD INTERVIEWERS OPEN A NEW SKILL TOPIC:\n"
            "They don't say 'Next question' or 'Moving on'. They build the skill name INTO a cold-reasoning "
            "question naturally -- never referencing the candidate's resume, projects, or work history.\n"
            "  Common skill: 'You've listed Kafka -- where does partitioning actually help versus hurt?'\n"
            "  JD-required skill: 'This role leans on Kubernetes a lot -- how would you think about scaling pods under load?'\n"
            "  Role-depth topic: 'One thing that matters a lot in this kind of role is observability -- how do you think about it?'\n"
            "Notice: the skill name is in the question, but the question is answerable purely from knowing the "
            "skill -- never 'have you used X' or 'tell me about a project using X'.\n\n"

            "━━━ PROBE FOCUS RULE (MANDATORY, every MOVE_ON) ━━━\n"
            "The angle guidance below always includes a PROBE FOCUS list. Your OPENING ANGLE "
            "must be built around ONE of those items -- a fundamentals, mechanics, performance, or "
            "robustness angle, never a generic 'do you know X'.\n\n"

            "━━━ SOURCE TAG RULES (skill-only) ━━━\n"
            "  RESUME_TOPIC → Common skill: on resume AND required by JD. Ask a cold-reasoning question "
            "about the skill itself.\n"
            "                 Never: 'tell me about a project where', 'what did you build with X'\n\n"
            "  JD_TOPIC     → Required by JD, not on resume. Ask the same kind of cold-reasoning question; "
            "accept no exposure gracefully.\n"
            "                 Never: assume prior usage, 'walk me through your experience with X'\n\n"
            "  ROLE_TOPIC   → Expert domain check. Ask about understanding or approach in the abstract.\n"
            "                 Never: 'what was your experience with X', frame it as if it's on their resume\n\n"
        )
    else:
        _open_examples = (
            "HOW GOOD INTERVIEWERS OPEN A NEW TOPIC:\n"
            "They don't say 'Next question' or 'Moving on'. They build the topic name INTO the question naturally.\n"
            "  RESUME project: 'You built the multi-channel lead qualifier — what was the trickiest part to get right?'\n"
            "  RESUME work role: 'At DataFlow you were building pipelines — what did you personally own end to end?'\n"
            "  RESUME skill: 'You've worked with Kafka — where did you actually use it and at what scale?'\n"
            "  JD requirement: 'This role deals with Kubernetes a lot — what's your experience with it so far?'\n"
            "  ROLE topic: 'One thing that matters a lot in this kind of role is observability — how do you think about it?'\n"
            "Notice: the topic name is in the question. The candidate immediately knows the context.\n\n"

            "━━━ PROBE FOCUS RULE (MANDATORY, every MOVE_ON) ━━━\n"
            "The angle guidance below always includes a PROBE FOCUS list. Your OPENING ANGLE "
            "must be built around ONE of those items — never a generic ownership question "
            "('what did you build', 'what did you personally do') when a more specific angle is given.\n\n"

            "━━━ SOURCE TAG RULES ━━━\n"
            "  RESUME_TOPIC → Candidate did this. We know it. Never ask if they did it.\n"
            "                 Ask about depth: what they built, what was their call, what broke, what they'd change.\n"
            "                 Never: 'why did you work there', 'do you have experience', 'what drew you to X'\n\n"
            "  JD_TOPIC     → Role requires it. Candidate hasn't claimed it. We don't know if they've used it.\n"
            "                 Ask neutrally — frame it as a role requirement, not a resume claim.\n"
            "                 Never: assume experience, 'walk me through your experience with X'\n\n"
            "  ROLE_TOPIC   → Expert domain check. Not on resume, not in JD. They may have zero experience.\n"
            "                 Ask about their thinking or approach — not their history with it.\n"
            "                 Never: 'what was your experience with X', frame it as if it's on their resume\n\n"
        )
    _system = (
        "You are writing an internal directive for an AI interviewer named Ishitha. "
        "This directive is NEVER spoken aloud — it is a private instruction she reads and acts on silently.\n\n"
        "Your job: write the [NEXT_TURN_DIRECTIVE] block for a MOVE_ON moment. "
        "You will be given the new topic, its source tag, the analyst brief, and the candidate's last answer. "
        "From all of this, tell Ishitha exactly what she should find out and how to open — not what to say.\n\n"

        "━━━ THE CORE PRINCIPLE ━━━\n"
        "Ishitha is on a live voice call. The candidate cannot see a screen. "
        "They have no idea what topic is coming next. "
        "Your directive must ensure Ishitha's first question gives the candidate enough context to answer. "
        "A question with no context — 'What was your biggest challenge?' — is unanswerable without knowing what it refers to.\n\n"

        "━━━ THIS IS A TECHNICAL INTERVIEW — MAKE THE OPENER TECHNICAL, NOT A QUIZ ━━━\n"
        "The opening question sets the level of the whole topic. A weak opener produces weak answers and "
        "you learn nothing. Steer Ishitha's OPENING ANGLE toward a question that makes the candidate REASON, "
        "not one that has a one-word recall answer. Two rules:\n"
        "  1. NO trivia / syntax / definition openers. Banned opener shapes: 'what's the syntax for X', "
        "     'what is X', 'what's the difference between X and Y', 'define X'. These test memorized docs, not "
        "     understanding, and a weak candidate just says 'it depends'. A real interviewer never opens a topic "
        "     by asking someone to recite syntax.\n"
        "  2. OPEN WITH A 'DO', NOT A 'DESCRIBE'. The opener should force the candidate to work something out. "
        "     Good opener shapes (pick the one that fits the skill + level):\n"
        "       - TRACE: give one small concrete input/case and ask what happens — 'if you append to a list "
        "         that another variable also points to, what does that other variable see?'\n"
        "       - DECIDE: a realistic situation with a real constraint where they must choose and justify — "
        "         'you're storing 10k user records you look up by id constantly — list or dict, and why?'\n"
        "       - DIAGNOSE: something is wrong/slow, what do they check FIRST (not a checklist).\n"
        "     The candidate's actual answer will then drive the follow-ups; the opener just has to create a real "
        "     claim to probe, not a yes/no or a recited fact.\n"
        "  3. ONE concept, spoken in under 30 words, ONE question mark. Do NOT stack a paragraph of NLP/theory "
        "     setup before the question (the giant multi-clause 'could you explain X, and Y, and how Z' opener is "
        "     banned — it's unanswerable by voice and signals nothing). If the skill needs context, give ONE "
        "     short clause, then ask ONE concrete thing.\n\n"

        + _open_examples +

        "━━━ DIRECTIVE STRUCTURE ━━━\n"
        "Write in plain text, no markdown:\n"
        "DECISION: MOVE_ON\n"
        "TOPIC YOU ARE LEAVING: <old topic> — CLOSED. Do not reference it again.\n"
        "NEW ACTIVE TOPIC: <new topic>  [TAG: <source>]\n"
        "WHAT WE KNOW: 2-3 bullet points about the new topic from the analyst brief\n"
        "OPENING ANGLE: The specific thing worth probing first — what question to open with conceptually, "
        "and what context Ishitha must give the candidate so they understand what's being asked\n"
        "WHAT TO FIND OUT: one sentence on what a good answer to this topic would reveal\n"
        "FORBIDDEN: 2-3 specific things Ishitha must NOT say or do on this topic\n\n"

        "Do NOT write the actual question. Ishitha generates it herself from your guidance.\n"
        "Do NOT write 'Suggested question:' or any scripted line she would copy verbatim.\n"
        "ONE question only — Ishitha must ask one thing and then listen. "
        "No compound questions, no 'and also', no multi-part asks. "
        "Keep OPENING ANGLE guidance short — Ishitha's actual spoken question must land under "
        "30 words total, so don't ask her to build multi-sentence context before the question.\n\n"
        "Output plain text only. No markdown. No code blocks."
    )
    _user = (
        f"LEVEL: {level}\n"
        f"LEAVING TOPIC: {old_topic_title}\n"
        f"NEW TOPIC: {new_topic_title}\n"
        f"NEW TOPIC FULL CONTEXT: {new_topic}\n"
        f"SOURCE: {source}\n\n"
        f"CANDIDATE'S LAST ANSWER: {prev_answer or '(not available)'}\n\n"
        f"ANALYST BRIEF CONTEXT FOR NEW TOPIC:\n{_brief_context or '(not available)'}\n\n"
        f"ANGLE GUIDANCE: {_angle_guide}\n"
        f"{_attribution_guard}\n"
        f"Write the directive now."
    )
    try:
        chunks: list[str] = []
        _usage = None
        async with asyncio.timeout(8.0):
            stream = await client.chat.completions.create(
                model=llm_model,
                messages=[
                    {"role": "system", "content": _system},
                    {"role": "user", "content": _user},
                ],
                temperature=0.3,
                **token_limit_kwarg(llm_model, 550),
                stream=True,
                stream_options={"include_usage": True},
                store=True,
                metadata={"call_type": "move_on_directive", "level": level, "source": source},
            )
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    chunks.append(chunk.choices[0].delta.content)
                if getattr(chunk, "usage", None):
                    _usage = chunk.usage
        if usage_sink and _usage:
            from billing.billing import extract_usage as _extract_usage  # noqa: PLC0415
            billing_usage = _extract_usage(_usage, llm_model)
            if billing_usage["inputTokens"] or billing_usage["outputTokens"] or billing_usage["cachedInputTokens"]:
                usage_sink(billing_usage)
        generated = "".join(chunks).strip()
        if not generated:
            raise ValueError("empty response")
        # Sanity check: directive must not contain a scripted question for Ishitha to copy
        if "SUGGESTED OPENING QUESTION" in generated.upper():
            # Strip it -- Ishitha generates her own from topic context
            generated = re.sub(
                r"SUGGESTED OPENING QUESTION.*$", "", generated, flags=re.I | re.DOTALL
            ).strip()
        # Build filler instruction from the actual prev answer + prev question so the
        # LLM picks a reaction that matches what the candidate really said -- not a
        # generic list it ignores. Uses the same shared classifier as the probe-directive
        # path. for_move_on=True: prev_answer/prev_question are used ONLY to pick the
        # best filler wording -- the topic transition itself is never altered here
        # (previously "clarification detected" was a separate branch that changed what
        # instruction the LLM got about moving on at all; now every case flows through
        # one instruction and the topic always moves the same way).
        _prev_trimmed = (prev_answer or "").strip()[:300]
        _prev_q_trimmed = (prev_question or "").strip()[:200]
        _intent = _classify_candidate_intent(_prev_trimmed, _prev_q_trimmed, for_move_on=True)
        if _prev_trimmed:
            # Describe the situation (not a phrase to say) so the model composes its own reaction
            _prev_lc = _prev_trimmed.lower()
            if not _prev_lc or any(p in _prev_lc for p in ("i don't know", "i forgot", "i don't remember", "not sure", "can't recall")):
                _intent_hint = "They couldn't recall or said they don't know."
            elif len(_prev_lc.split()) <= 8:
                _intent_hint = "Very short answer, possibly surface-level."
            elif any(p in _prev_lc for p in ("i think", "probably", "maybe", "i believe", "kind of", "sort of")):
                _intent_hint = "They hedged or were vague — acknowledge without validating."
            else:
                _intent_hint = "Substantive answer."
            _filler_instruction = (
                f"\n\nOPENING REACTION — compose fresh, do not pick from a phrase bank:\n"
                f"THEIR LAST ANSWER: \"{_prev_trimmed}\"\n"
                f"SITUATION: {_intent_hint}\n"
                "Feel out how this actually landed for you (surprised, unimpressed, amused, unsure, relieved) "
                "and react to that, in your own short words (1-6 words), not a category label.\n"
                "Default to NO filler — a filler is the exception, not the norm. Only add one (umm, hmm, uhh, "
                "ohh, haha) when this specific answer genuinely surprised you, needs a beat to process, or the "
                "moment calls for warmth. Roughly 1 in 3 turns should have a filler at most — never two turns in a row.\n"
                "If a filler fits, it belongs at a real planning boundary — turn-initial (most common), at a "
                "clause break, or right before a specific word you're retrieving — e.g. 'Hmm, okay, so —' or "
                "'Right, so — uhh — what happened next?' NEVER mid-phrase inside an already-fused expression "
                "like 'pretty good' or 'makes sense' — real speakers don't split a decided phrase.\n"
                "Never reuse a filler word or reaction phrasing you've used in the last 2-3 turns of this interview.\n"
                "The reaction and the new question must feel like one connected turn — "
                "not a reaction to silence followed by an unrelated question.\n"
                "NEVER say 'Great!', 'Awesome!', 'Fantastic!', 'Amazing!', or any hollow praise.\n"
                "NEVER say 'Thanks for sharing' or any 'thanks for [verb]ing' phrase.\n"
                f"NEVER reference the old topic '{old_topic_title}' — it is closed.\n"
                "DO NOT wrap up, say goodbye, or add any closing phrase.\n"
            )
        else:
            _filler_instruction = (
                "\n\nOPENING REACTION: One short natural lead-in (3-8 words). "
                "NEVER say 'Great!', 'Awesome!', 'Fantastic!', or hollow praise. "
                "NEVER say 'Thanks for sharing'.\n"
            )
        directive = (
            "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
            + generated
            + _filler_instruction
            + memory_block
            + cross_ref_rule
        )
        _log.info(
            "[MOVE_ON_LLM] Generated directive for new_topic=%r | %d chars",
            new_topic_title, len(directive),
        )
        return directive
    except Exception as exc:
        _log.warning("[MOVE_ON_LLM] LLM generation failed (%s) -- falling back to rule-based directive", exc)
        try:
            await log_llm_error(
                app_id=app_id or None,
                candidate_name=candidate_name or None,
                provider="openai",
                error=str(exc),
                reason="Move-on directive LLM generation failed — using fallback",
            )
        except Exception:
            pass
        return ""
class InterviewAgent(Agent):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._waiting_for_eval: bool = False
        # Turn number the currently in-flight eval belongs to (set alongside
        # _waiting_for_eval = True). llm_node's gate release is guaranteed via a
        # try/finally in _process_user_conversation_item keyed on this turn number,
        # so a directive is always applied (or the gate released) for the exact
        # turn it was opened for -- see that function's finally block.
        self._pending_eval_turn: Optional[int] = None
        self._tts_text_characters: int = 0
        # Cleared when a user turn arrives, set after directive is injected.
        # llm_node waits on this before generating the real interview question.
        self._directive_ready: asyncio.Event = asyncio.Event()
        self._directive_ready.set()  # starts set -- no blocking until first candidate answer
        # ONE-SHOT flag set when a MOVE_ON opener is queued but not yet spoken.
        # On the very next eval cycle, we skip eval (so the queued opener can fire
        # cleanly without being overwritten by a stale PROBE) and clear the flag.
        # After that single skip, normal eval resumes.
        self._move_on_opener_pending: bool = False
        self._completed_user_turn_handler = None
        # Step 5 hard stop: once the session-end sequence has started (time
        # limit reached, candidate disconnected, or the interview was marked
        # finished), llm_node must never generate another question -- this is
        # a blocking bug, not cosmetic, if a race lets one slip through after
        # the goodbye has already been queued/spoken. Set via
        # set_session_end_event() once the outer runtime creates its
        # disconnect/finished events (they don't exist yet at agent
        # construction time).
        self._session_end_event: Optional[asyncio.Event] = None
        # Code-card overlay: room isn't available at construction time (created
        # later in entrypoint), set via set_room() once it exists -- same pattern
        # as set_session_end_event(). code_card_active is read by the inactivity
        # gate below to suspend nudges while a card is on screen.
        self._room = None
        self.code_card_active: bool = False
        # Type of the most recently published code card ("code_trace"/"snippet_eval"/
        # "query_trace"), read by _build_eval_payload() to score the candidate's next
        # answer with code-question calibration. Cleared once that answer is scored.
        self.last_code_card_question_type: str = ""
        # Bumped every time a card is published; a pending timeout task checks its own
        # stamp before clearing code_card_active, so a stale timeout from an earlier
        # card can never clobber a newer one (or a state the candidate already answered
        # and dismissed themselves). See _clear_code_card_after_timeout below.
        self._code_card_generation: int = 0
        # Render-ack handshake: llm_node waits briefly on _code_card_ack_event
        # after publishing a card, so a client that can't render (audio-only,
        # degraded connection, stale build) is detected and the question falls
        # back to verbal-only instead of describing/reading code aloud. Set on
        # the "code_card_ack" data-channel packet handler in entrypoint().
        self._code_card_ack_event: Optional[asyncio.Event] = None
        self._code_card_ack_id: Optional[str] = None
        # Set via set_code_card_timeout_speaker() once the entrypoint's _deliver_nudge
        # closure exists -- lets _clear_code_card_after_timeout speak a nudge through
        # the same session.say() path as the regular inactivity nudges, instead of
        # duplicating TTS/state-tracking logic here.
        self._speak_nudge: Any = None
        # ── Live Trap Score ──────────────────────────────────────────────────
        # Completely separate from the post-interview IntegrityEngine in report.py.
        # Uses a strike-pattern system: single accidental events are absorbed;
        # only repeated/sustained violations add to this score. Counts UP from 0;
        # when score >= TRAP_THRESHOLD (100) a trap question should fire. The score
        # stays PINNED at threshold (does not auto-reset) until agent.consume_trap()
        # is called, which only happens once a trap question is actually generated
        # and about to be asked -- so a failed generation or a turn where no trap
        # check ran (e.g. MOVE_ON/WRAP_UP) never silently wastes the strike.
        self._live_trap_score: LiveTrapScore = LiveTrapScore()
        # Set to a dict when a trap question has been asked and we're waiting on
        # the candidate's answer to it: {"question", "false_premise", "resume_directive"}.
        # Cleared once classified -- see the pending_trap_question handling at the top
        # of _process_user_conversation_item, and trap_question.classify_trap_answer.
        self.pending_trap_question: Optional[dict] = None
        # Whether the current pending trap question has already been rephrased once
        # (tracked separately from pending_trap_question so it's an explicit agent
        # field, not a mutation of the dict that's also stored under that name).
        self.trap_rephrased_once: bool = False
    # ── Live Trap Score API ─────────────────────────────────────────────────
    def handle_proctoring_event(self, event_type: str, severity: str = "medium") -> bool:
        """
        Called whenever a proctoring event is received (DataChannel or API).
        Returns True if this event just pushed the score to/past the trap
        threshold. The score stays PINNED at the threshold (does not reset)
        until consume_trap() is called -- only do that once a trap question
        has actually been generated and is about to be asked, otherwise a
        failed generation or a non-PROBE turn would silently waste the strike.
        """
        result = self._live_trap_score.record_event(
            event_type=event_type,
            severity=severity,
        )
        return result.trap_triggered

    def consume_trap(self) -> None:
        """Call only once a trap question has actually been generated and is
        about to be asked -- resets the live score so the cycle can repeat."""
        self._live_trap_score.consume_trap()

    @property
    def live_trap_score(self) -> int:
        """Current live suspicion score (0 = clean, >=100 = trap should fire)."""
        return self._live_trap_score.score

    def set_session_end_event(self, event: asyncio.Event) -> None:
        self._session_end_event = event
    def set_room(self, room) -> None:
        self._room = room
    def set_code_card_timeout_speaker(self, speak_nudge) -> None:
        self._speak_nudge = speak_nudge
    async def _clear_code_card_after_timeout(self, timer_secs: int, generation: int) -> None:
        """Backend mirror of the frontend's local countdown -- if the candidate never
        speaks while a card is up, this fires once the card's own timer would have run
        out, clears code_card_active so inactivity nudges resume, and speaks a short
        nudge so the candidate isn't left looking at a blank screen wondering what
        happened. The generation check means this is a no-op if the candidate already
        answered (dismissal path already cleared code_card_active) or a newer card was
        shown in the meantime."""
        await asyncio.sleep(timer_secs)
        if self.code_card_active and self._code_card_generation == generation:
            self.code_card_active = False
            logger.info("[CODE_CARD] timed out with no answer -- inactivity nudges resumed")
            if self._room is not None:
                try:
                    await self._room.local_participant.publish_data(
                        json.dumps({"type": "code_card_dismiss"}).encode("utf-8"), reliable=True,
                    )
                except Exception:
                    pass
            if self._speak_nudge is not None:
                try:
                    await self._speak_nudge("Looks like time's up on that one -- let's move on.")
                except Exception as e:
                    logger.warning("[CODE_CARD] timeout nudge failed: %s", e)
    def _record_tts_text(self, text: str) -> None:
        if text:
            self._tts_text_characters += len(text)
    async def on_user_turn_completed(self, turn_ctx, new_message) -> None:
        """LiveKit calls this after end-of-turn, before generating the reply."""
        handler = self._completed_user_turn_handler
        if handler is not None:
            await handler(turn_ctx, new_message)
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
        # Step 5 hard stop: once the session-end sequence has been signaled
        # (time limit reached, candidate disconnected, or interview marked
        # finished), no further question may be generated -- a race between
        # LiveKit's own teardown and an in-flight user turn must never
        # produce one more spoken question after the goodbye has fired. This
        # is a blocking check, not a best-effort one: it runs before anything
        # else in this method, including the eval-directive wait below.
        if self._session_end_event is not None and self._session_end_event.is_set():
            logger.warning("[LLM_GATE] session already ended -- refusing to generate a new question")
            return
        activity = self._get_activity_or_raise()
        assert activity.llm is not None, "llm_node called but no LLM node is available"
        assert isinstance(activity.llm, llm.LLM), (
            "llm_node should only be used with LLM (non-multimodal/realtime APIs) nodes"
        )
        # LiveKit calls llm_node as soon as a user item lands. During the real
        # interview we block only while the previous question is awaiting eval.
        # Prompt-text inference is too brittle here; the runtime owns this flag.
        #
        # No timeout here: _process_user_conversation_item (agent_runtime.py) now
        # guarantees this event is released via a try/finally covering every one of
        # its return paths, so the wait is bounded by eval's own real completion,
        # not by a manufactured ceiling. A timeout here was previously masking a
        # real bug (an early `return` that skipped the gate release) rather than
        # protecting against genuine LLM slowness -- see the finally block there.
        _must_wait_for_eval = self._waiting_for_eval
        if _must_wait_for_eval:
            self._directive_ready.clear()
            logger.debug("[LLM_GATE] waiting for eval directive")
        await self._directive_ready.wait()
        logger.info("[LLM_GATE] directive ready")
        # Generate from the agent's LIVE mutable context (self._chat_ctx) -- this is the
        # same object the eval task injects NEXT_TURN_DIRECTIVE / TOPIC_LOCK into, and the
        # object LiveKit itself copies from when building a reply. self.chat_ctx (the public
        # property) is a READ-ONLY wrapper whose .items raises on mutation, so we must use
        # _chat_ctx directly for both the MOVE_ON strip below and the generation call.
        effective_ctx = self._chat_ctx
        # MOVE_ON guard: if a MOVE_ON directive is present, strip ALL user+assistant
        # messages from context before the LLM generates. This prevents the candidate's
        # last answer (added by LiveKit pipeline AFTER our history wipe) from anchoring
        # the LLM back to the old topic. The MOVE_ON + TOPIC_LOCK system messages are
        # the only context the LLM needs to open a new topic question.
        _ctx_items = getattr(effective_ctx, "items", None)
        _has_next_turn_directive = any(
            "[NEXT_TURN_DIRECTIVE" in str(getattr(m, "content", ""))
            for m in (_ctx_items or [])
            if getattr(m, "role", "") == "system"
        )
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
                    "[LLM_GATE] MOVE_ON detected -- stripped %d user/assistant msg(s) "
                    "from ctx so LLM opens new topic cleanly",
                    _dropped,
                )
        _sys_count = sum(1 for m in getattr(effective_ctx, "items", []) if getattr(m, "role", "") == "system")
        logger.info(
            "[LLM_GATE] sys_msgs=%d%s",
            _sys_count,
            " [MOVE_ON-clean]" if _has_moveon else "",
        )
        tool_choice = model_settings.tool_choice if model_settings else NOT_GIVEN
        turn_temp, temp_role = self._select_turn_temperature(effective_ctx)
        logger.info("[TEMP] role=%s temperature=%.2f", temp_role, turn_temp)
        conn_options = activity.session.conn_options.llm_conn_options
        # Override LiveKit's default read timeout -- httpcore.ReadTimeout fires mid-stream
        # when OpenAI takes >10s for a long response, causing _llm_inference_task errors.
        if (conn_options.timeout or 0) < 30.0:
            conn_options = replace(conn_options, timeout=30.0)

        # PROBLEM 4 fix: ordinary PROBE turns (a plain [NEXT_TURN_DIRECTIVE without
        # DECISION: MOVE_ON) are free-form spoken questions generated live by this
        # LLM -- QUESTION_GENERATION_SYSTEM's 25-word/one-'?'/no-compound cap was
        # prompt-text only, never checked in code, which is exactly what the
        # transcript's violations show. For this turn shape ONLY, buffer the full
        # text (losing token-level streaming for this one turn) so it can be
        # validated and regenerated once before anything reaches TTS. Greeting/
        # warmup/MOVE_ON turns are unaffected -- MOVE_ON already goes through
        # _generate_move_on_directive's own LLM call and this node just speaks a
        # directive built from it, not a fresh free-form question.
        _is_probe_turn = _has_next_turn_directive and not _has_moveon
        if not _is_probe_turn:
            async with activity.llm.chat(
                chat_ctx=effective_ctx,
                tools=tools,
                tool_choice=tool_choice,
                conn_options=conn_options,
                extra_kwargs={"temperature": turn_temp},
            ) as stream:
                async for chunk in stream:
                    yield chunk
            return

        async def _generate_full_text(extra_system: str = "") -> tuple[str, list]:
            _ctx = effective_ctx
            if extra_system:
                _ctx = effective_ctx.copy()
                _ctx.add_message(role="system", content=extra_system)
            _pieces: list[str] = []
            _raw_chunks: list = []
            async with activity.llm.chat(
                chat_ctx=_ctx,
                tools=tools,
                tool_choice=tool_choice,
                conn_options=conn_options,
                extra_kwargs={"temperature": turn_temp},
            ) as stream:
                async for chunk in stream:
                    _raw_chunks.append(chunk)
                    delta = getattr(chunk, "delta", None)
                    if delta is not None and delta.content:
                        _pieces.append(delta.content)
            return "".join(_pieces).strip(), _raw_chunks

        full_text, raw_chunks = await _generate_full_text()
        if full_text and full_text != "NO_FOLLOW_UP_NEEDED":
            violations = validate_spoken_question(full_text)
            if violations:
                logger.warning(
                    "[VALIDATOR] PROBE question failed post-generation check: %s | text=%r",
                    "; ".join(violations), full_text[:200],
                )
                full_text, raw_chunks = await _generate_full_text(_STRICT_REGEN_SUFFIX)
                if full_text and full_text != "NO_FOLLOW_UP_NEEDED":
                    _revalidation = validate_spoken_question(full_text)
                    if _revalidation:
                        logger.warning(
                            "[VALIDATOR] regeneration STILL failed check: %s | text=%r -- speaking it anyway "
                            "(hard-cutting further would risk silence; logged for audit)",
                            "; ".join(_revalidation), full_text[:200],
                        )
                    else:
                        logger.info("[VALIDATOR] regeneration passed on retry")
        if full_text == "NO_FOLLOW_UP_NEEDED":
            # The sentinel means "the candidate's last answer already closed
            # the gap -- do not ask a follow-up," not literal text to speak.
            # Yielding raw_chunks here was sending the sentinel straight to
            # TTS, so the agent said "NO_FOLLOW_UP_NEEDED" out loud. Yield
            # nothing: this turn is silent, matching a real interviewer just
            # moving on without a spoken filler.
            logger.info("[LLM_GATE] NO_FOLLOW_UP_NEEDED -- suppressing turn, nothing will be spoken")
            return

        # Code-card overlay: the question-generation prompt is allowed to emit a
        # fenced ```code block``` for a TRACE/OUTPUT question ("what does this
        # return?"). Detect it here, publish it to the frontend over the data
        # channel, and replace raw_chunks with a synthetic one carrying ONLY the
        # spoken lead-in -- TTS must never speak the code itself. Rebuilding as
        # one clean chunk (rather than patching the streamed raw_chunks in place)
        # sidesteps the fence markers being split across arbitrary chunk
        # boundaries, which streamed token-by-token text makes unreliable to
        # detect chunk-by-chunk.
        _card = extract_code_card(full_text) if full_text else None
        if _card is not None:
            spoken_text, code, _card_question_type, _card_language = _card
            if code and self._room is not None:
                _complexity_secs = max(20, min(90, 20 + 4 * code.count("\n")))
                _card_id = f"card_{self._code_card_generation + 1}_{int(time.time() * 1000)}"
                try:
                    await self._room.local_participant.publish_data(
                        json.dumps({
                            "type": "code_card",
                            "card_id": _card_id,
                            "prompt": spoken_text,
                            "code": code,
                            # Real programming/query language for syntax highlighting
                            # (e.g. "python", "sql") -- falls back to the question-type
                            # tag ("code_trace"/"query_trace") if no language annotation
                            # was present, so the frontend always gets a non-empty hint.
                            "language": _card_language or _card_question_type,
                            "timer_secs": _complexity_secs,
                        }).encode("utf-8"),
                        reliable=True,
                    )
                    # Wait briefly for the frontend to ack that it actually rendered the
                    # card (see the "code_card_ack" data-channel handler near
                    # self._code_card_ack_event) before committing to the spoken lead-in.
                    # A client that can't render (audio-only, degraded connection, a
                    # build that doesn't wire the listener) never acks -- on timeout we
                    # fall back to a plain verbal question instead of describing a
                    # snippet the candidate can't see. Per spec: never read code aloud
                    # as that fallback -- speak a generic verbal substitute instead.
                    self._code_card_ack_event = asyncio.Event()
                    self._code_card_ack_id = _card_id
                    _acked = False
                    try:
                        await asyncio.wait_for(self._code_card_ack_event.wait(), timeout=3.0)
                        _acked = True
                    except asyncio.TimeoutError:
                        pass
                    if not _acked:
                        logger.warning(
                            "[CODE_CARD] no render ack from client within 3s (card_id=%s) -- "
                            "falling back to a verbal-only question, code never read aloud",
                            _card_id,
                        )
                        await self._room.local_participant.publish_data(
                            json.dumps({"type": "code_card_dismiss", "card_id": _card_id}).encode("utf-8"),
                            reliable=True,
                        )
                        _no_ack_fallback_text = (
                            "Let's skip that one since I can't confirm you're seeing the snippet -- "
                            "let's move to the next question instead."
                        )
                        yield llm.ChatChunk(id="code-card-no-ack-fallback", delta=llm.ChoiceDelta(role="assistant", content=_no_ack_fallback_text))
                        return
                    self.code_card_active = True
                    # Read back by _build_eval_payload() so the candidate's answer to
                    # THIS card is scored with code-question calibration instead of
                    # defaulting to generic "mechanism" -- see eval.py QuestionRecord.
                    self.last_code_card_question_type = _card_question_type
                    logger.info(
                        "[CODE_CARD] published + acked | type=%s | timer=%ds | code_lines=%d",
                        _card_question_type, _complexity_secs, code.count("\n") + 1,
                    )
                    # The frontend auto-hides the card locally after timer_secs but never
                    # tells the backend -- without this, a candidate who never speaks at
                    # all leaves code_card_active=True forever, which permanently disables
                    # inactivity nudges (see the gate at "and not agent.code_card_active"
                    # below) for the rest of the interview. Mirror the same timeout here so
                    # a silent candidate still gets the normal nudge/recovery flow.
                    self._code_card_generation += 1
                    asyncio.create_task(
                        self._clear_code_card_after_timeout(_complexity_secs, self._code_card_generation)
                    )
                except Exception as _card_err:
                    logger.warning("[CODE_CARD] publish failed: %s -- speaking full text as fallback", _card_err)
                    spoken_text = full_text
            elif not code:
                # Fence matched but no code survived stripping (e.g. an empty
                # ``` ``` block) -- fall back to speaking the raw text rather
                # than silently dropping content.
                spoken_text = full_text
            if spoken_text:
                yield llm.ChatChunk(id="code-card-spoken", delta=llm.ChoiceDelta(role="assistant", content=spoken_text))
            return

        for chunk in raw_chunks:
            yield chunk
    async def tts_node(self, text, model_settings):
        activity = self._get_activity_or_raise()
        tts_engine = activity.tts
        if tts_engine is None:
            return
        conn_options = activity.session.conn_options.tts_conn_options
        if conn_options.retry_interval > 0.5:
            conn_options = replace(conn_options, retry_interval=0.5)
        # Override LiveKit's default 10s timeout -- Sarvam WS can take up to 25s for
        # longer responses. At 10s it times out, retries, and causes ~18s silence gap.
        if (conn_options.timeout or 0) < 25.0:
            conn_options = replace(conn_options, timeout=25.0)
        async def _push_sentences(tts_stream) -> None:
            n = 0
            is_elevenlabs = type(tts_engine).__module__.startswith("livekit.plugins.elevenlabs")
            is_sarvam = type(tts_engine).__module__.startswith("livekit.plugins.sarvam")

            if is_sarvam:
                # SARVAM: accumulate the ENTIRE agent turn, then push once.
                #
                # Root cause of "I'm doing... [gap] ...well... [gap] ...how are you":
                # Each push_text() call = one independent synthesis unit with its own
                # prosody arc. The old loop pushed one sentence at a time, so every
                # clause got synthesized separately with a reset-prosody gap between them.
                #
                # Fix: collect ALL cleaned chunks from the upstream transform stream into
                # a single string, then push once. Sarvam receives the full text as one
                # segment → synthesizes it as one continuous utterance with natural
                # prosody from start to finish — identical to how session.say() works
                # (which is why greeting/warmup always sounded perfect).
                #
                # Sarvam's own SentenceTokenizer and min_buffer_size/max_chunk_length
                # still apply server-side: it handles commas, !, ?, and all other
                # punctuation naturally without any client-side splitting.
                full = ""
                async for chunk in text:
                    full += chunk
                if full.strip():
                    pushed = full.strip()
                    self._record_tts_text(pushed)
                    tts_stream.push_text(pushed)
                    n = 1
                tts_stream.end_input()
                logger.info("[TTS] Sarvam single-segment push: %d chars", len(full.strip()))
                return

            # ElevenLabs: push each cleaned chunk directly as it arrives.
            # ElevenLabs handles its own sentence segmentation server-side.
            if is_elevenlabs:
                async for chunk in text:
                    self._record_tts_text(chunk)
                    tts_stream.push_text(chunk)
                    n += 1
                tts_stream.end_input()
                logger.info("[TTS] ElevenLabs streamed %d chunk(s)", n)
                return

            # Cartesia / other providers: sentence-boundary buffer.
            # These providers do NOT do their own server-side tokenization, so
            # we segment manually before pushing.
            buf = ""
            async for chunk in text:
                buf += chunk
                while True:
                    m = _TTS_SENT_END_RE.search(buf)
                    if m:
                        sentence = buf[:m.start() + 1].strip()
                        buf = buf[m.end():]
                        if sentence:
                            pushed_text = sentence + " "
                            self._record_tts_text(pushed_text)
                            tts_stream.push_text(pushed_text)
                            n += 1
                    elif len(buf) >= _TTS_MAX_BUFFER_CHARS:
                        pushed_text = buf.strip() + " "
                        buf = ""
                        self._record_tts_text(pushed_text)
                        tts_stream.push_text(pushed_text)
                        n += 1
                    else:
                        break
            if buf.strip():
                pushed_text = buf.strip()
                self._record_tts_text(pushed_text)
                tts_stream.push_text(pushed_text)
                n += 1
            tts_stream.end_input()
            logger.info("[TTS] Streamed %d chunk(s) via WebSocket", n)
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
                self._record_tts_text(full_text)
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
        proc.userdata["default_stt"] = None
        proc.userdata["default_tts"] = None
        proc.userdata["vad"] = None
        return
    logger.info("Prewarming worker process...")
    # Pre-instantiate default STT/TTS plugins so their internal HTTP sessions
    # and model configs are warm before the first job arrives.
    try:
        proc.userdata["default_stt"] = build_stt()
        logger.info("Default STT prewarmed.")
    except Exception as e:
        logger.warning(f"Failed to prewarm default STT: {e}")
    try:
        proc.userdata["default_tts"] = build_sarvam_tts()
        logger.info("Default TTS prewarmed.")
    except Exception as e:
        logger.warning(f"Failed to prewarm default TTS: {e}")
    # Silero VAD: runs alongside Flux's STT-based end-of-turn detection. Flux still
    # owns turn_detection="stt" end-of-turn decisions -- VAD adds a raw-audio-energy
    # speech-presence signal that doesn't depend on STT producing a transcript first.
    # This makes is_candidate_speaking (the inactivity-nudge ladder's speech signal)
    # robust to STT lag on quiet/mumbled speech or unusual accents, and speeds up
    # barge-in detection when a candidate interrupts the AI mid-question. Free,
    # local, CPU-only (Apache-2.0, onnxruntime) -- no per-call cost either way.
    try:
        from livekit.plugins import silero
        # Tuned vs. library defaults (min_speech_duration=0.05, min_silence_duration=0.55,
        # activation_threshold=0.5) for noisy candidate environments (fans, keyboards,
        # other voices in the room): a higher activation_threshold makes VAD require a
        # stronger, more human-like signal before flagging speech, and a longer
        # min_speech_duration filters out short noise blips (clicks, coughs) from ever
        # starting a speech chunk. min_silence_duration is left near-default since Flux's
        # turn_detection="stt" (not VAD) owns end-of-turn timing.
        proc.userdata["vad"] = silero.VAD.load(
            min_speech_duration=0.1,
            min_silence_duration=0.5,
            activation_threshold=0.65,
        )
        logger.info("Silero VAD prewarmed.")
    except Exception as e:
        # Prewarm runs in a spawned subprocess and can fail there for reasons that
        # don't repro in the job's own process (e.g. Windows dev: onnxruntime/Silero
        # plugin registration erroring with "must be registered on the main thread"
        # under spawn-based multiprocessing). Leave it unset here; _load_vad_lazy()
        # retries once per job, in the entrypoint's own process/thread context.
        logger.warning(f"Failed to prewarm Silero VAD: {e}")
        proc.userdata["vad"] = None
    # DB pool initializes lazily on first job -- asyncpg requires an async context
    # which is not available in the sync prewarm() function.
    logger.info("DB pool will initialize lazily on first job.")
def _load_vad_lazy():
    """Retry Silero VAD load in the job's own process/thread when prewarm's
    subprocess-time load failed (see prewarm() above). Returns None if this
    also fails -- AgentSession then falls back to its own implicit default VAD."""
    try:
        from livekit.plugins import silero
        vad = silero.VAD.load(
            min_speech_duration=0.1,
            min_silence_duration=0.5,
            activation_threshold=0.65,
        )
        logger.info("Silero VAD loaded lazily (prewarm had failed).")
        return vad
    except Exception as e:
        logger.warning(f"Lazy Silero VAD load also failed, using AgentSession default: {e}")
        return None
class _EvalSignalToggles(BaseModel):
    """Toggle flags for plan-gated proctoring/integrity signals.
    Defaults to False when absent from the DB row.
    """
    # Plan-gated behavioral signals
    latency_mismatch: bool = False
    answer_integrity: bool = False
    # Gates BOTH the background linguistic/teleprompter analyzer AND the
    # live-trap-score question feature as a single unit -- off means neither runs.
    live_integrity_monitoring: bool = False
    # Plan-gated environmental signals (Python awareness mirrors frontend gating)
    tab_switch: bool = False
    fullscreen_exit: bool = False
    window_focus_loss: bool = False
    camera_disabled: bool = False
    microphone_disabled: bool = False
    connection_lost: bool = False
    face_absence: bool = False
    multiple_faces: bool = False
    identity_mismatch: bool = False
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
    """Parse DB proctoringSignals JSON into a toggle dict for plan-gated signals."""
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
    jobId: Optional[str] = None
    jobTitle: str
    interviewType: Optional[str] = "tech"
    level: Optional[int] = None
    language: str
    orgId: Optional[str] = None
    orgName: Optional[str] = None
    aiName: Optional[str] = "Ishitha"
    voiceId: Optional[str] = None
    # AI model config from org row
    sttModel: Optional[str] = None
    ttsProvider: Optional[str] = None
    ttsModel: Optional[str] = None
    ttsSpeed: Optional[float] = None
    llmInterviewLive: Optional[str] = None
    llmInterviewEval: Optional[str] = None
    llmInterviewReport: Optional[str] = None
    resumeData: Any = None
    extractedDetails: Any = None
    screeningCriteria: Any = None
    proctoringSignals: Any = None
    interviewStatus: Optional[str] = None
    questionBankSnapshot: Any = None  # Frozen Job.questionBank / DemoTemplate.questionBankSnapshot JSON -- every interview type, incl. test and demo sessions
    questionBankVersionUsed: Optional[int] = None
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
    # Room name is available before connecting - derive app_id early so we can
    # fire the DB fetch in parallel with the room connect handshake.
    app_id = ctx.room.name.replace("interview_", "")
    dispatch_metadata = parse_dispatch_metadata(getattr(ctx.job, "metadata", ""))
    _is_test_session: bool = bool(dispatch_metadata.get("isTest", False))
    _skip_report: bool = bool(dispatch_metadata.get("skipReport", False))
    _is_demo_session: bool = bool(dispatch_metadata.get("isDemo", False)) or is_demo_app_id(app_id)
    global _TEST_EVENT_LOG_URL
    if _is_test_session:
        logger.info("[TEST_SESSION] Running in TEST mode | skipReport=%s", _skip_report)
        # /api/test/events requires the same DB-stored test key the /test page
        # used to get dispatched here -- without it every log_test_event POST
        # gets a silent 403 and the UI shows no pipeline logs.
        _test_event_key = dispatch_metadata.get("testEventKey")
        if _TEST_EVENT_LOG_URL and _test_event_key:
            _TEST_EVENT_LOG_URL = f"{_TEST_EVENT_LOG_URL}?key={urllib.parse.quote(_test_event_key)}"
    else:
        # Demo and regular interview sessions have no /test page consuming these
        # events and no key to authenticate with -- clear the URL so
        # log_test_event() no-ops instead of POSTing and getting a 403 on every
        # eval/probe/turn event for the session's whole duration.
        _TEST_EVENT_LOG_URL = ""
    session_log_context: dict[str, Any] = {
        "session_id": app_id,
        "app_id": app_id,
        "room_name": ctx.room.name,
        "is_test": _is_test_session,
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
    _context_coro = (
        get_demo_interview_context(app_id, dispatch_metadata)
        if _is_demo_session
        else get_interview_context(app_id)
    )
    try:
        context_result, connect_result = await asyncio.gather(
            _context_coro,
            connect_with_retry(),
            return_exceptions=True,
        )
    except Exception as e:
        logger.error(f"Startup gather failed: {e}")
        return
    if isinstance(connect_result, Exception):
        raise connect_result
    # Room is now connected -- define the failure helper here so it can use ctx.room.
    # Any failure AFTER this point must call _fail_interview() so:
    #   1. DB is marked FAILED (Job candidates page shows FAILED, not stuck IN_PROGRESS)
    #   2. Frontend receives an error event and shows the support message to the candidate
    async def _fail_interview(reason: str) -> None:
        logger.error(f"[INTERVIEW_FAIL] app_id={app_id} reason={reason}")
        if _is_demo_session:
            await mark_demo_session_failed(app_id, reason=reason)
        else:
            await mark_interview_failed(app_id, reason=reason)
        try:
            payload = json.dumps({
                "type": "interview_failed",
                "message": "We're sorry — a technical issue occurred. Please contact our support team to reschedule your interview.",
                "reason": reason,
            }).encode("utf-8")
            await ctx.room.local_participant.publish_data(payload, reliable=True)
        except Exception as _sig_err:
            logger.warning(f"[INTERVIEW_FAIL] Could not send failure signal to frontend: {_sig_err}")
    if isinstance(context_result, Exception):
        logger.error(f"Failed to load interview context from DB: {context_result}")
        await _fail_interview("context_load_failed")
        return
    if not isinstance(context_result, dict):
        logger.error(f"Invalid DB context payload type: {type(context_result)}")
        await _fail_interview("context_invalid_type")
        return
    try:
        ctx_data = InterviewContext(**context_result)
    except Exception as _ctx_err:
        logger.error("Invalid interview context from DB: %s", _ctx_err)
        await _fail_interview("context_parse_failed")
        return
    # GUARD: Prevent re-entry if interview is already completed
    if ctx_data.interviewStatus and ctx_data.interviewStatus.strip().upper() in ("COMPLETED", "NO_SHOW", "FAILED"):
        logger.warning(
            f"[GUARD] Interview {app_id} is already {ctx_data.interviewStatus}. "
            f"Rejecting duplicate job dispatch. Exiting immediately."
        )
        return
    evaluation_signal_toggles = _extract_evaluation_signal_toggles(ctx_data.proctoringSignals)
    extracted_details = _coerce_jsonish(ctx_data.extractedDetails or "{}")
    if not extracted_details:
        extracted_details = _coerce_jsonish(ctx_data.screeningCriteria or "{}")
    structured_resume = _coerce_jsonish(ctx_data.resumeData or "{}")
    # Extract basic context info early for logging
    candidate_name = ctx_data.fullName
    candidate_first_name = first_name_from_full_name(candidate_name)
    job_title = ctx_data.jobTitle
    # Routes which interview module (interview.tech.* vs interview.conversational.*)
    # supplies brief/eval/scoring/prompts for this session. Falls back to "tech" for
    # any unrecognized or missing value.
    interview_type = ctx_data.interviewType if ctx_data.interviewType == "conversational" else "tech"
    logger.info(f"[INTERVIEW] interview_type={interview_type} job_title={job_title!r}")
    # No interview type calls generate_interview_brief() anymore -- every
    # InterviewBrief is built synchronously from the stored, frozen question
    # bank snapshot (see build_brief_from_question_bank() below). Only the
    # delivery-style modules (phases/prompts) still differ by type.
    if interview_type == "conversational":
        from interview.conversational.phases import build_greeting_text, build_interview_directive
        from interview.conversational.prompts import (
            build_voice_layer_prompt,
            build_evaluation_layer_prompt,
            build_system_prompt,
        )
    else:
        from interview.tech.phases import build_greeting_text, build_interview_directive
        from interview.tech.prompts import (
            build_voice_layer_prompt,
            build_evaluation_layer_prompt,
            build_system_prompt,
        )
    # Consolidated startup fetch log
    # JD extraction produces criteria[].{name, priority} where priority=critical/high  must-have, medium  nice-to-have.
    # Legacy format used mustHaveSkills/niceToHaveSkills flat arrays  fall back to those if criteria absent.
    def _extract_jd_skill_lists(details: dict):
        def _names_from(raw: Any) -> list[str]:
            items = raw if isinstance(raw, list) else ([raw] if raw else [])
            names: list[str] = []
            for item in items:
                if isinstance(item, dict):
                    name = item.get("name") or item.get("skill") or item.get("title") or item.get("value")
                else:
                    name = item
                text = str(name or "").strip()
                if text:
                    names.append(text)
            return names
        criteria = details.get("criteria") or []
        if criteria:
            must = [
                str(c.get("name", "")).strip()
                for c in criteria
                if isinstance(c, dict)
                and c.get("priority") in ("critical", "high")
                and str(c.get("name", "")).strip()
            ]
            nice = [
                str(c.get("name", "")).strip()
                for c in criteria
                if isinstance(c, dict)
                and c.get("priority") == "medium"
                and str(c.get("name", "")).strip()
            ]
            return must, nice
        skills = details.get("skills") if isinstance(details.get("skills"), dict) else {}
        must = (
            _names_from(skills.get("must_have"))
            or _names_from(skills.get("mustHave"))
            or _names_from(details.get("mustHaveSkills"))
            or _names_from(details.get("requirements"))
            or _names_from(details.get("keywords"))
        )
        nice = (
            _names_from(skills.get("nice_to_have"))
            or _names_from(skills.get("good_to_have"))
            or _names_from(details.get("niceToHaveSkills"))
        )
        return must, nice
    _jd_skills, _jd_nice = _extract_jd_skill_lists(extracted_details) if extracted_details else ([], [])
    _stored_bank_raw = ctx_data.questionBankSnapshot
    _stored_bank_dict: dict | None = _coerce_jsonish(_stored_bank_raw) if _stored_bank_raw else None
    _interview_questions: list[str] = []
    if _stored_bank_dict:
        _raw_custom = _stored_bank_dict.get("customQuestions") or _stored_bank_dict.get("custom_questions")
        if isinstance(_raw_custom, list):
            for _item in _raw_custom:
                _q_text = str(_item.get("question") if isinstance(_item, dict) else _item).strip()
                if _q_text and _q_text not in _interview_questions:
                    _interview_questions.append(_q_text)
        if isinstance(_stored_bank_dict.get("questions"), list):
            for _q_item in _stored_bank_dict["questions"]:
                if isinstance(_q_item, dict) and (_q_item.get("source") == "custom" or _q_item.get("is_custom") or _q_item.get("isCustom")):
                    _q_text = str(_q_item.get("question") or _q_item.get("title") or "").strip()
                    if _q_text and _q_text not in _interview_questions:
                        _interview_questions.append(_q_text)
    _custom_questions: list[CustomQuestion] = [
        CustomQuestion(raw=str(_raw_q).strip(), normalized=_normalize_custom_question_text(_raw_q))
        for _raw_q in _interview_questions
        if _normalize_custom_question_text(_raw_q)
    ]
    time_limit_mins = FIXED_INTERVIEW_DURATION_MINUTES
    if _is_demo_session:
        _demo_kill_switch_secs = dispatch_metadata.get("killSwitchSecs")
        _demo_time_limit_mins = dispatch_metadata.get("timeLimitMins")
        if _demo_kill_switch_secs:
            time_limit_mins = round(float(_demo_kill_switch_secs) / 60)
        elif _demo_time_limit_mins:
            time_limit_mins = round(float(_demo_time_limit_mins))
    org_id = ctx_data.orgId
    session_log_context.update(
        {
            "org_id": org_id,
            "org_name": _compact_optional(ctx_data.orgName),
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
    # All AI model config comes directly from the org DB row (set via Super Admin → AI Models).
    # All values come from org DB (set via Super Admin → AI Models). Schema defaults ensure non-null.
    org_tts_provider: str = (ctx_data.ttsProvider or "").strip().upper()
    org_tts_model: str   = (ctx_data.ttsModel or "").strip()
    org_tts_speed: float | None = ctx_data.ttsSpeed
    voice_id: str        = (ctx_data.voiceId or "").strip()
    # Cartesia was removed. Any orphaned CARTESIA row (or a missing voice) falls
    # back to Sarvam priya so the interview never crashes on a stale provider.
    if org_tts_provider == "CARTESIA" or not voice_id:
        logger.warning(
            "[TTS] provider=%r voice=%r -> falling back to Sarvam priya",
            org_tts_provider, voice_id,
        )
        org_tts_provider = "SARVAM"
        org_tts_model = "bulbul:v3"
        voice_id = "priya"
    interview_llm_model: str         = str(ctx_data.llmInterviewLive).strip()
    interview_llm_temperature: float = INTERVIEW_TEMPERATURE
    analysis_model: str              = str(ctx_data.llmInterviewEval).strip()
    _eval_llm_usages_accumulated: list[dict] = []
    _llmgen_llm_usages: list[dict] = []

    # Level seed. Admin-selected on the Job row at JD creation time (fixed
    # per job, never recomputed per candidate), for BOTH tech and
    # conversational interviews -- never inferred from resume.
    _level_seed = int(ctx_data.level) if ctx_data.level in (1, 2, 3, 4) else 2
    logger.info("[LEVEL] admin level=%s", _level_seed)

    # Question-bank-driven brief: same flow for every interview -- tech, conversational,
    # test sessions, and demo sessions alike. All are generated ahead of time (the
    # Create Job wizard for real jobs, the demo template wizard for demos), then
    # passed in as questionBankSnapshot. No LLM brief call, ever; a missing snapshot
    # is a hard failure rather than a silent fallback to live generation.
    if not _stored_bank_dict:
        raise RuntimeError(
            f"No question_bank snapshot found for this interview (application context "
            f"missing jdQuestionBankSnapshot) -- candidate={candidate_first_name or candidate_name!r} "
            f"role={job_title!r}. Session cannot start."
        )
    logger.info(
        "[QUESTION_BANK] Building brief from stored snapshot | candidate=%s role=%s version=%s",
        candidate_first_name or candidate_name, job_title, ctx_data.questionBankVersionUsed,
    )
    _interview_brief = build_brief_from_question_bank(
        _stored_bank_dict,
        level=_level_seed,
        must_have_skills=_jd_skills,
    )
    logger.info(
        "[QUESTION_BANK] ✓ Built | level=%s | anchor=%r | topics=%d",
        _interview_brief.level,
        _interview_brief.anchor_topic.title,
        len(_interview_brief.topic_pool),
    )
    # Level is fixed and admin-selected -- the brief always echoes back _level_seed.
    candidate_level = _interview_brief.level
    logger.info("[FLOW] Level=%s | candidate=%s | role=%s", candidate_level, candidate_name, job_title)
    # Convenience views directly from InterviewBrief -- no wrapper objects needed.
    # Tech interviews are skill-only: topic_type is never "project"/"work" there,
    # only conversational briefs still produce those topic types.
    _brief_skills    = [t.title for t in _interview_brief.topic_pool if t.topic_type == "skill"]
    _brief_projects  = [t.title for t in _interview_brief.topic_pool if t.topic_type == "project"]
    _brief_work      = [t.title for t in _interview_brief.topic_pool if t.topic_type == "work"]
    _anchor_title    = _interview_brief.anchor_topic.title
    _anchor_topic_item = _interview_brief.anchor_topic
    _anchor_full = (
        f"{_anchor_topic_item.title} - {_anchor_topic_item.full_description}"
        + (f" | Tech: {', '.join(_anchor_topic_item.tech_stack)}" if _anchor_topic_item.tech_stack else "")
    )
    _anchor_type     = _interview_brief.anchor_topic.topic_type
    # Coverage items for TTS phonetic processor
    base_coverage_items = list(dict.fromkeys([
        *_brief_skills[:6],
        *[t.title for t in _interview_brief.topic_pool if t.topic_type in ("project", "work")][:4],
    ]))
    # Full keyword set for phonetic registration: all topic titles + every tech_stack entry + JD skills
    _tts_keywords: list[str] = list(dict.fromkeys([
        *[t.title for t in _interview_brief.topic_pool],
        *[tech for t in _interview_brief.topic_pool for tech in (t.tech_stack or [])],
        *(_jd_skills or []),
        *(_jd_nice or []),
    ]))
    logger.info(
        "[QUESTION_BANK] Loaded from snapshot | level=%s | anchor=%r | topics=%d",
        _interview_brief.level,
        _interview_brief.anchor_topic.title,
        len(_interview_brief.topic_pool),
    )
    logger.info("[QUESTION_BANK] strategy: %s", _interview_brief.interview_strategy[:120])
    if _interview_brief.red_flags:
        logger.info("[BRIEF] red_flags: %s", " | ".join(_interview_brief.red_flags))
    for _i, _t in enumerate(_interview_brief.topic_pool):
        logger.info(
            "[QUESTION_BANK] topic[%d] %-10s %r  probe=%s",
            _i, _t.topic_type, _t.title,
            _t.probe_focus or "-",
        )
    # Compact text block for eval layer prompt
    interview_directive_cached = build_interview_directive(
        level=candidate_level,
        resume_brief=None,
        jd_skills=_jd_skills or [],
        custom_questions=_interview_questions or None,
        interview_brief=_interview_brief,
    )
    # Consolidated interview context log
    _projects_str = " | ".join(_brief_projects[:4]) or "none"
    _work_str     = " | ".join(_brief_work[:5]) or "none"
    _skills_str   = ", ".join(_brief_skills[:6])
    _jd_must      = ", ".join([str(s) for s in (_jd_skills or [])][:6]) or "none"
    _jd_nice_str  = ", ".join([str(s) for s in (_jd_nice or [])][:4]) or "none"
    _coverage_str = ", ".join(base_coverage_items[:8]) or "auto"
    _level        = candidate_level or 2
    _level_note = {
        1: "probe HOW they think  real decisions, specifics, learning signals",
        2: "probe individual ownership, measurable impact, decision trade-offs",
        3: "probe end-to-end ownership, architecture depth, scale constraints",
        4: "probe strategic/systemic judgment, org-level impact, high-stakes tradeoffs",
    }.get(_level, "probe ownership, depth, and specifics")
    _fetch_summary_block = (
        f"CANDIDATE: {candidate_name or 'unknown'} | ROLE: {job_title} | LEVEL: {_level} | TIME: {time_limit_mins}m\n"
        f"\n"
        f"FETCH SUMMARY:\n"
        f"  Resume: {'fetched' if structured_resume else 'MISSING'} | JD: {'fetched' if extracted_details else 'MISSING'} | Custom Q: {len(_interview_questions) if _interview_questions else 0}\n"
        f"  JD Must-Have Skills: {_jd_must}\n"
        f"  JD Nice-To-Have: {_jd_nice_str}\n"
        f"  Coverage Targets: {_coverage_str}\n"
        f"\n"
    )
    if interview_type == "tech":
        _context_block = (
            _fetch_summary_block
            + f"SKILL BRIEF:\n"
            f"  Anchor: {_anchor_full[:120]} (type: {_anchor_type})\n"
            f"  Skills: {_skills_str}\n"
            f"\n"
            f"INTERVIEW PLAN: 20 min, skill-only. Open with: '{_anchor_title}'. "
            f"Level={_level}: {_level_note}. "
            f"Must cover: common resume/JD skills, JD-required skills, expert role topics -- no project/work references."
        )
    else:
        _context_block = (
            _fetch_summary_block
            + f"RESUME BRIEF:\n"
            f"  Anchor: {_anchor_full[:120]} (type: {_anchor_type})\n"
            f"  Skills: {_skills_str}\n"
            f"  Projects: {_projects_str}\n"
            f"  Work History: {_work_str}\n"
            f"\n"
            f"INTERVIEW PLAN: 20 min covering resume ownership, JD skills, situational, behavioural. "
            f"Open with: '{_anchor_title}'. "
            f"Level={_level}: {_level_note}. "
            f"Must cover: resume projects, work history, JD must-have skills, at least 1 situational, at least 1 behavioural."
        )
    logger.info("[INTERVIEW_CONTEXT]\n%s", _context_block)
    voice_layer_prompt = build_voice_layer_prompt(
        candidate_name=candidate_first_name or candidate_name,
        job_title=job_title,
        time_limit_mins=time_limit_mins,
        ai_name=_compact_optional(ctx_data.aiName),
        org_name=_compact_optional(ctx_data.orgName),
    )
    evaluation_layer_prompt = build_evaluation_layer_prompt(
        candidate_name=candidate_first_name or candidate_name,
        job_title=job_title,
        interview_brief=_interview_brief,
        level=candidate_level,
    )
    system_prompt = build_system_prompt(
        voice_layer_prompt=voice_layer_prompt,
        evaluation_layer_prompt=evaluation_layer_prompt,
    )
    chat_ctx = llm.ChatContext()
    chat_ctx.add_message(role="system", content=system_prompt)
    # interview_directive_cached (anchor topic, resume/JD content) is intentionally
    # NOT added here. Adding it before warmup completes gives the LLM interview
    # question material to draw on during greeting/warmup, which lets it jump
    # straight to a resume-specific question instead of waiting for the candidate's
    # warmup answer. It is injected once warmup_complete is set (see
    # _handle_completed_user_turn_locked's "completing_warmup" branch below).
    logger.info("[FLOW] System prompt ready  greeting  interview")
    logger.debug("[SYSTEM_PROMPT] Full system prompt:\n%s", system_prompt)
    logger.debug("[INTERVIEW_DIRECTIVE] Content:\n%s", interview_directive_cached)
    ctx.proc.userdata["level"] = candidate_level
    def _build_flux_session_keyterms() -> list[str]:
        """Build one static Flux keyterm list for this interview session."""
        raw_topics = [
            *_brief_skills,
            *(_jd_skills or []),
            *_brief_projects,
            *_brief_work,
            job_title or "",
            (ctx_data.orgName or ""),
        ]
        stopwords = {
            "and", "are", "for", "from", "into", "that", "the", "this", "with",
            "using", "used", "built", "worked", "project", "role", "company",
        }
        terms: list[str] = []
        seen: set[str] = set()
        def _add(term: str) -> None:
            cleaned = re.sub(r"\s+", " ", (term or "").strip(" -:;,.()[]{}"))
            if len(cleaned) < 2 or len(cleaned) > 60:
                return
            key = cleaned.casefold()
            if key in seen:
                return
            seen.add(key)
            terms.append(cleaned)
        for raw in raw_topics:
            text = (raw or "").strip()
            if not text:
                continue
            _add(_topic_short_title(text))
            for bracket in re.findall(r"\[([^\]]+)\]", text):
                for token in re.split(r"[,;/|]", bracket):
                    _add(token)
            for token in re.findall(r"\b[A-Za-z][A-Za-z0-9.+#-]{2,}\b", text):
                token_lc = token.lower()
                if token_lc not in stopwords and (
                    any(ch.isdigit() for ch in token)
                    or any(ch in token for ch in (".", "+", "#", "-"))
                    or token in _brief_skills
                    or token in (_jd_skills or [])
                ):
                    _add(token)
        return terms[:97]  # provider prepends 3 base terms and caps at 100.
    # Flux owns end-of-turn decisions via native EOT events (turn_detection="stt");
    # VAD is used separately for speech-presence/barge-in signal quality -- see
    # vad_plugin wiring near session_kwargs below.
    flux_session_keyterms = _build_flux_session_keyterms()
    logger.info("[STT_FLUX] static session keyterms prepared: %d extra terms", len(flux_session_keyterms))
    try:
        stt_plugin = build_stt(language_code=_STT_LANGUAGE_CODE, keyterms=flux_session_keyterms, model_override=ctx_data.sttModel)
    except Exception as _stt_build_err:
        try:
            await log_stt_error(
                candidate_name=candidate_name,
                org_name=_compact_optional(ctx_data.orgName),
                provider="deepgram",
                error=str(_stt_build_err),
                reason="STT plugin initialization failed",
                context={"app_id": app_id},
            )
        except Exception:
            pass
        raise
    _TTS_BUILDERS = {
        "SARVAM":     build_sarvam_tts,
        "ELEVENLABS": build_elevenlabs_tts,
    }
    if org_tts_provider not in _TTS_BUILDERS:
        raise ValueError(f"Unknown org ttsProvider {org_tts_provider!r} (expected one of {sorted(_TTS_BUILDERS)})")
    _tts_builder = _TTS_BUILDERS[org_tts_provider]
    logger.info(f"[TTS] Using %s  voice=%s model=%s", org_tts_provider, voice_id, org_tts_model)
    # For Sarvam v3: build a per-session pronunciation dict that combines the
    # shared base dict (infra/framework terms) with auto-generated pronunciations
    # for this candidate's specific resume/JD keywords. Zero human maintenance -- 
    # any tech term on any future resume is handled automatically.
    _sarvam_dict_id: str | None = None
    _elevenlabs_pronunciation_locators: list | None = None
    if org_tts_provider == "ELEVENLABS":
        # ElevenLabs pronunciation dictionary locators (analogous to Sarvam's dict_id).
        # ELEVENLABS_PRONUNCIATION_DICT_ID can be set to a pre-created dictionary ID
        # from the ElevenLabs API. When absent, apply_text_normalization='auto' handles
        # standard normalization and the agent runs without custom pronunciations.
        _el_dict_id = os.environ.get("ELEVENLABS_PRONUNCIATION_DICT_ID", "").strip()
        if _el_dict_id:
            from livekit.plugins.elevenlabs import PronunciationDictionaryLocator
            _elevenlabs_pronunciation_locators = [
                PronunciationDictionaryLocator(
                    pronunciation_dictionary_id=_el_dict_id,
                    version_id=os.environ.get("ELEVENLABS_PRONUNCIATION_DICT_VERSION", "").strip(),
                )
            ]
            logger.info("[ELEVENLABS_TTS] pronunciation dict: id=%s", _el_dict_id)
    if org_tts_provider == "SARVAM":
        from interview.sarvam_pronunciation_dict import (
            get_or_create_base_dict_id as _get_base_dict_id,
            get_session_dict_id as _get_session_dict_id,
        )
        _sarvam_api_key = os.environ.get("SARVAM_API_KEY", "")
        if _sarvam_api_key:
            _base_dict_id = await _get_base_dict_id(_sarvam_api_key, mode=interview_type)
            _sarvam_dict_id = await _get_session_dict_id(
                _sarvam_api_key,
                _tts_keywords,
                base_dict_id=_base_dict_id,
                mode=interview_type,
            )
        # No LLM normalization transform for Sarvam: it duplicated
        # _sarvam_normalize_transform's regex pass over the same _KNOWN_ACRONYMS
        # list, but did so via a live OpenAI call sitting in the middle of the TTS
        # text stream -- one more network dependency in the audio path, for zero
        # coverage gain on any acronym the regex already handles. dict_id (above)
        # covers resume/JD-specific terms; the regex covers the curated list.
        # Removed while isolating causes of TTS stumbling.
    try:
        tts_plugin = _tts_builder(
            language=_TTS_LANGUAGE_CODE,
            model=org_tts_model,
            voice_id=voice_id,
            **({"speed": org_tts_speed} if org_tts_speed else {}),  # type: ignore[arg-type]
            **({"dict_id": _sarvam_dict_id} if _sarvam_dict_id else {}),  # type: ignore[arg-type]
            **({"pronunciation_dict_locators": _elevenlabs_pronunciation_locators} if _elevenlabs_pronunciation_locators else {}),  # type: ignore[arg-type]
        )
    except Exception as _tts_build_err:
        try:
            await log_tts_error(
                candidate_name=candidate_name,
                org_name=_compact_optional(ctx_data.orgName),
                provider=org_tts_provider,
                error=str(_tts_build_err),
                reason="TTS plugin initialization failed",
                context={"app_id": app_id},
            )
        except Exception:
            pass
        raise
    plugin_tts_characters = 0
    plugin_tts_audio_seconds = 0.0
    plugin_stt_audio_seconds = 0.0
    def _metric_number(metrics, *names: str) -> float:
        for name in names:
            value = getattr(metrics, name, None)
            if value is None and isinstance(metrics, dict):
                value = metrics.get(name)
            try:
                number = float(value or 0)
            except (TypeError, ValueError):
                number = 0.0
            if number > 0:
                return number
        return 0.0
    def _on_tts_metrics_collected(metrics) -> None:
        nonlocal plugin_tts_characters, plugin_tts_audio_seconds
        chars = int(_metric_number(metrics, "characters_count", "charactersCount", "chars", "characters"))
        audio_seconds = _metric_number(metrics, "audio_duration", "audioDuration", "duration", "duration_seconds")
        if chars > 0:
            plugin_tts_characters += chars
        if audio_seconds > 0:
            plugin_tts_audio_seconds += audio_seconds
    def _on_stt_metrics_collected(metrics) -> None:
        nonlocal plugin_stt_audio_seconds
        audio_seconds = _metric_number(metrics, "audio_duration", "audioDuration", "duration", "duration_seconds")
        if audio_seconds > 0:
            plugin_stt_audio_seconds += audio_seconds
    for _plugin, _handler, _label in (
        (tts_plugin, _on_tts_metrics_collected, "TTS"),
        (stt_plugin, _on_stt_metrics_collected, "STT"),
    ):
        try:
            on_method = getattr(_plugin, "on", None)
            if callable(on_method):
                on_method("metrics_collected", _handler)
        except Exception as e:
            logger.warning("[USAGE] Failed to attach %s metrics hook: %s", _label, e)
    async def _warm_greeting_tts(plugin) -> None:
        warmup_method = getattr(plugin, "warmup", None)
        if callable(warmup_method):
            try:
                import inspect as _inspect
                result = warmup_method()
                if _inspect.isawaitable(result):
                    await result
                logger.info("[FLOW] TTS warmup done")
            except Exception as e:
                logger.warning("[FLOW] TTS warmup failed (non-fatal): %s", e)
    warm_greeting_task = spawn_background_task(_warm_greeting_tts(tts_plugin), "warm_greeting_tts")
    llm_plugin = build_llm(
        model=interview_llm_model,
        temperature=interview_llm_temperature,
    )
    # Every turn on this plugin is triggered by a directive (probe or MOVE_ON) --
    # there is no generic/undirected conversation turn -- so its full per-turn
    # usage belongs to interviewLLMGeneration, not the opaque session-total bucket.
    def _on_llm_metrics_collected(metrics) -> None:
        prompt_tokens = int(_metric_number(metrics, "prompt_tokens"))
        completion_tokens = int(_metric_number(metrics, "completion_tokens"))
        cached_tokens = int(_metric_number(metrics, "prompt_cached_tokens"))
        if prompt_tokens or completion_tokens:
            _llmgen_llm_usages.append({
                "model": interview_llm_model,
                "inputTokens": prompt_tokens,
                "outputTokens": completion_tokens,
                "cachedInputTokens": cached_tokens,
            })
    try:
        on_method = getattr(llm_plugin, "on", None)
        if callable(on_method):
            on_method("metrics_collected", _on_llm_metrics_collected)
    except Exception as e:
        logger.warning("[USAGE] Failed to attach LLM metrics hook: %s", e)
    # Flux provides native end-of-turn detection via EOT events -- no separate semantic
    # turn detector needed. turn_detection="stt" tells LiveKit to use Flux's EOT events.
    logger.info("[FLUX_EOT] Flux native end-of-turn active (engine=%s)", getattr(stt_plugin, "_hr_stt_engine", "flux"))
    ai_name = ctx_data.aiName or "Ishitha"
    welcome_text = build_greeting_text(candidate_first_name or candidate_name, ai_name)
    logger.info("[FLOW] Greeting precomputed during launching phase")
    # Silero VAD (prewarmed in prewarm() above) alongside Flux's turn_detection="stt" --
    # Flux still owns end-of-turn decisions; VAD adds a raw-audio speech-presence signal
    # that doesn't depend on STT producing a transcript first, per LiveKit's documented
    # reference pairing for the Flux plugin. Note: AgentSession silently defaults to its
    # own local inference.VAD(model="silero") whenever `vad` is omitted entirely, so a
    # local Silero-backed VAD was actually always running even when this kwarg was
    # previously left out -- this just switches to the explicit, tunable plugin
    # instance (matching LiveKit's documented config knobs) instead of the SDK's
    # implicit, un-configurable default, and makes the load cost visible in prewarm().
    vad_plugin = ctx.proc.userdata.get("vad") or _load_vad_lazy()
    session_kwargs = {
        "stt": stt_plugin,
        "llm": llm_plugin,
        "tts": tts_plugin,
        "vad": vad_plugin,
        "turn_handling": TurnHandlingOptions(
            preemptive_generation={"enabled": False},
            # Flux STT jobs turn boundaries -- no separate endpointing detector needed.
            turn_detection="stt",
            interruption=InterruptionOptions(
                enabled=True,
                min_duration=0.5,
                min_words=1,
                discard_audio_if_uninterruptible=True,
                resume_false_interruption=False,
                false_interruption_timeout=3.0,
                backchannel_boundary=(1.0, 3.5),
            ),
        ),
        "use_tts_aligned_transcript": False,
        # Provider-aware text normalization:
        # - ElevenLabs: apply_text_normalization='auto' handles it server-side -- skip
        # - Sarvam: dict_id + enable_preprocessing always-on -- skip (caused letter-reading bug)
        "tts_text_transforms": [
            "filter_emoji",
            *([_elevenlabs_normalize_transform] if org_tts_provider == "ELEVENLABS" else []),
            # Sarvam path: regex normalizer only -- dict_id handles resume/JD-specific
            # terms server-side; no LLM call in the audio path (see comment above).
            *([_sarvam_normalize_transform] if org_tts_provider == "SARVAM" else []),
            make_tts_sanitize_transform(org_tts_provider),
        ],
        "aec_warmup_duration": 0.5,
    }
    latest_session_usage: Optional[AgentSessionUsage] = None
    session = AgentSession(**session_kwargs)  # type: ignore[arg-type]
    @session.on("session_usage_updated")
    def on_session_usage_updated(event) -> None:
        nonlocal latest_session_usage
        latest_session_usage = event.usage
        # Intentionally keep usage collection silent to avoid terminal spam.
    from livekit.agents import function_tool
    from livekit.agents.beta.tools import EndCallTool

    # -- Candidate meta-intent tools ------------------------------------------
    # Replace regex pattern-matching with LLM-jobn tool calls.
    # The LLM decides when to call these based on semantic understanding of what
    # the candidate said -- not string matching on their exact words.

    @function_tool
    async def candidate_asked_to_repeat() -> str:
        """
        Call this when the candidate asks you to repeat, clarify, or rephrase the question.
        Examples of when to call:
          - "Can you repeat that?"
          - "I didn't catch what you said"
          - "Sorry, say that again"
          - "What was the question?"
          - "Could you rephrase that?"
        Do NOT call this if they are answering the question (even poorly).
        Only call when they are explicitly asking for a repetition or clarification.
        """
        last_q = (_last_interviewer_question or "").strip()
        directive = (
            "[META_QUESTION_DIRECTIVE - DO NOT SAY ALOUD]\n"
            "The candidate asked you to repeat or simplify the question.\n"
            f"Repeat this question in simpler, shorter words: \"{last_q}\"\n"
            "Do not score their request. Ask only the repeated question. Keep it under 15 words."
        )
        remove_system_messages_multi(chat_ctx, (
            "[META_QUESTION_DIRECTIVE", "[NEXT_TURN_DIRECTIVE", "[TOPIC_LOCK", "[RECENT_CONTEXT",
        ))
        chat_ctx.add_message(role="system", content=directive)
        logger.info("[META_TOOL] candidate_asked_to_repeat fired")
        return "Repeat the question now in simpler words. Do not add anything else."

    @function_tool
    async def candidate_asked_to_skip() -> str:
        """
        Call this when the candidate explicitly asks to skip or change the current question.
        Examples of when to call:
          - "Can we move to a different question?"
          - "I'd like to skip this"
          - "Can you ask me something else?"
          - "Let's move on"
          - "I don't want to answer this one"
        Do NOT call this if they are saying "I don't know" but still trying to answer.
        Only call when they are clearly asking to move away from the current question entirely.
        """
        nonlocal _active_topic
        async with _session_state_lock:
            _mark_topic_covered(_active_topic, answer_gist="candidate requested skip")
            _next = _next_uncovered_topic(exclude=_active_topic)
            if _next:
                _active_topic = _next
        directive = (
            "[META_QUESTION_DIRECTIVE - DO NOT SAY ALOUD]\n"
            "The candidate asked to skip this question. Respect it — no explanation needed.\n"
            "Say one short natural acknowledgement ('Sure, no problem.' / 'Of course.') "
            f"then ask ONE question about: {_topic_short_title(_active_topic or 'the next topic')}.\n"
            f"FULL CONTEXT: {_active_topic}\n"
            "Do not mention the skipped topic again."
        )
        remove_system_messages_multi(chat_ctx, (
            "[META_QUESTION_DIRECTIVE", "[NEXT_TURN_DIRECTIVE", "[TOPIC_LOCK", "[RECENT_CONTEXT",
        ))
        chat_ctx.add_message(role="system", content=directive)
        logger.info("[META_TOOL] candidate_asked_to_skip fired | new topic=%r", _active_topic)
        return "Acknowledge briefly and ask about the next topic."

    @function_tool
    async def candidate_asked_about_company() -> str:
        """
        Call this when the candidate asks about the company — what it does, what it is,
        or wants general company information before continuing.
        Examples:
          - "What does this company do?"
          - "Tell me about the company"
          - "What is this organisation?"
          - "Which company is this for?"
        """
        org = _compact_optional(ctx_data.orgName) or "the company"
        role = job_title or "this role"
        directive = (
            "[META_QUESTION_DIRECTIVE - DO NOT SAY ALOUD]\n"
            "The candidate asked about the company. Answer briefly like a real interviewer would, "
            "then continue the interview.\n"
            f"Say one short sentence: '{org} is the company, and today we're assessing fit for the {role} role.'\n"
            "Then immediately ask ONE interview question — continue from where you left off."
        )
        remove_system_messages_multi(chat_ctx, (
            "[META_QUESTION_DIRECTIVE", "[NEXT_TURN_DIRECTIVE", "[TOPIC_LOCK", "[RECENT_CONTEXT",
        ))
        chat_ctx.add_message(role="system", content=directive)
        logger.info("[META_TOOL] candidate_asked_about_company fired")
        return "Answer their company question briefly, then continue the interview."

    @function_tool
    async def candidate_asked_about_role() -> str:
        """
        Call this when the candidate asks what the role involves, what GTM means,
        or wants clarification about the job itself before answering.
        Examples:
          - "What does the role involve?"
          - "What is GTM?"
          - "Can you explain what you mean by that?"
          - "What kind of work is this?"
        Do NOT call this for general knowledge questions about industry topics.
        Only call when they are asking about THIS specific role or interview context.
        """
        role = job_title or "this role"
        directive = (
            "[META_QUESTION_DIRECTIVE - DO NOT SAY ALOUD]\n"
            "The candidate asked about the role. Give a brief one-sentence answer, then continue.\n"
            f"Describe the {role} in one short sentence covering what it involves day-to-day.\n"
            "Then ask ONE interview question — continue from where you left off."
        )
        remove_system_messages_multi(chat_ctx, (
            "[META_QUESTION_DIRECTIVE", "[NEXT_TURN_DIRECTIVE", "[TOPIC_LOCK", "[RECENT_CONTEXT",
        ))
        chat_ctx.add_message(role="system", content=directive)
        logger.info("[META_TOOL] candidate_asked_about_role fired")
        return "Answer their role question briefly, then continue the interview."

    @function_tool
    async def candidate_asking_about_process() -> str:
        """
        Call this when the candidate asks questions about the interview itself —
        why certain questions are being asked, what stage they are at, how long it takes,
        or what information you are collecting.
        Examples:
          - "Why are you asking this?"
          - "What stage are we at?"
          - "How much longer will this take?"
          - "What are you trying to find out?"
        """
        role = job_title or "this role"
        directive = (
            "[META_QUESTION_DIRECTIVE - DO NOT SAY ALOUD]\n"
            "The candidate asked about the interview process. Answer in one sentence, then continue.\n"
            f"Say: 'I'm just trying to get a clear picture of your experience and how you think — "
            f"it helps us assess fit for the {role} role.'\n"
            "Then ask ONE interview question — continue from where you left off."
        )
        remove_system_messages_multi(chat_ctx, (
            "[META_QUESTION_DIRECTIVE", "[NEXT_TURN_DIRECTIVE", "[TOPIC_LOCK", "[RECENT_CONTEXT",
        ))
        chat_ctx.add_message(role="system", content=directive)
        logger.info("[META_TOOL] candidate_asking_about_process fired")
        return "Answer their process question in one sentence, then continue."

    async def _on_natural_end_call(_ev) -> None:
        # The LLM decided the interview is naturally over and said its goodbye.
        # Route this through the EXACT same signal/flag sequence as the other
        # three exit paths (time_expired, inactivity_timeout, finish-button) --
        # set interview_finished_event and ask the FRONTEND to leave the room,
        # rather than letting EndCallTool's own delete_room path force-close the
        # LiveKit room itself. Deleting the room fires ctx.room's "disconnected"
        # handler immediately, which starts the SDK's hardcoded 15s force-cancel
        # countdown on the entrypoint -- nowhere near enough time for
        # persist_transcript/generate_interview_report/billing to finish, so a
        # candidate who closes the tab right after the goodbye was killing the
        # report+billing pipeline mid-flight. Signaling the frontend instead
        # keeps this backend's own room connection alive for as long as the
        # frontend takes to react, giving the persist->report->billing sequence
        # its normal, uninterrupted runway -- identical to how time_expired and
        # the finish-interview button already work.
        nonlocal interview_marked_finished
        try:
            await _send_termination_signal("natural_conclusion")
        except Exception as e:
            logger.warning(f"[END_CALL] Failed to send termination signal: {e}")
        interview_marked_finished = True
        interview_finished_event.set()
        disconnect_event.set()

    _end_call_tool = EndCallTool(
        extra_description=(
            "End the interview when you have naturally concluded — after saying goodbye, "
            "thanking the candidate, or wishing them well. "
            "Do NOT end mid-interview while topics are still being discussed. "
            "Only end when you have explicitly wrapped up and the conversation is complete."
        ),
        delete_room=False,
        on_tool_called=_on_natural_end_call,
        end_instructions=(
            "The interview is now complete. Say a warm, natural goodbye to the candidate — "
            "something like 'It was great speaking with you, we'll be in touch soon!' "
            "Keep it brief, genuine, and positive. Do not repeat anything from the interview."
        ),
    )

    _interview_tools = [
        candidate_asked_to_repeat,
        candidate_asked_to_skip,
        candidate_asked_about_company,
        candidate_asked_about_role,
        candidate_asking_about_process,
        *_end_call_tool.tools,
    ]
    agent = InterviewAgent(instructions=system_prompt, chat_ctx=chat_ctx, tools=_interview_tools)
    agent.set_room(ctx.room)
    # CRITICAL: Agent.__init__ does `self._chat_ctx = chat_ctx.copy(...)`, creating a
    # SEPARATE ChatContext (new items list) from the local `chat_ctx` above. LiveKit
    # generates every reply from `agent._chat_ctx` (see AgentActivity: it does
    # `self._agent.chat_ctx.copy()` before calling llm_node). If we keep injecting
    # NEXT_TURN_DIRECTIVE / TOPIC_LOCK / MOVE_ON into the local `chat_ctx`, those
    # messages land in an ORPHANED object the LLM never reads -- which is exactly why
    # MOVE_ON decisions were computed correctly but never reached the question the LLM
    # asked. Re-bind `chat_ctx` to the live context so all downstream injections
    # (closure + on_conversation_item_added handler) target what LiveKit actually
    # generates from. NOTE: this stays valid because this agent never calls
    # update_chat_ctx()/update_tools()/update_instructions() (the only paths that would
    # reassign agent._chat_ctx). If that ever changes, switch to resolving
    # agent._chat_ctx at each injection site instead of aliasing here.
    chat_ctx = agent._chat_ctx
    participant: Optional[Any] = None
    disconnect_event = asyncio.Event()
    interview_finished_event = asyncio.Event()
    # Step 5 hard stop: every session-end path (time-expired, finished,
    # disconnect) sets disconnect_event -- give llm_node a direct handle so it
    # can refuse to generate once any of them has fired, instead of relying
    # on LiveKit's own teardown timing to race a new question out of it.
    agent.set_session_end_event(disconnect_event)
    interview_marked_finished = False
    turn_count = 0
    warmup_complete = False  # True after candidate confirms the short readiness check
    _user_turn_lock = asyncio.Lock()  # serializes _handle_completed_user_turn -- prevents
    # two rapid LiveKit end-of-turn detections (e.g. candidate pauses mid-answer) from
    # firing eval/probe/warmup logic twice for what is really one answer
    _last_evaluated_turn_snapshot = -1  # dedupes a repeat end-of-turn for the same turn_count
    _pending_turn_text: dict[int, str] = {}  # turn_snapshot -> merged candidate text across repeat EOTs for that turn
    _turns_moved_on: set[int] = set()  # turn_snapshots whose eval already committed MOVE_ON (topic switch + directive) -- a merge re-run for these turns cannot safely redo that
    # Interview state
    _closing_triggered = False           # True when <= 20s remain -- blocks eval + signals
    _candidate_turn_since_last_assistant = True
    proctoring_events: list = []       # timeline of risk signals for final report
    # Note: browser-side proctoring (face, tab, hardware) is recorded directly
    # to the DB via /api/interview/proctoring. The agent does NOT process these
    # signals  only behavioral/intelligence signals influence the agent.
    ready_event = asyncio.Event()
    launch_prereqs_signal_sent = False
    # Per-turn decision engine state
    _last_interviewer_question = ""   # most recent question Ishitha asked
    _last_question_topic: Optional[str] = None  # short title of current topic (for eval scoring)
    answer_scores: list[dict] = []    # log of all answer quality scores for final DB save
    _active_topic: Optional[str] = None  # full context string for LLM; initialized after topic pools built
    _topic_states: dict[str, dict] = {}        # TopicState serialized per topic for saturation tracking
    _topic_score_histories: dict[str, list] = {}   # per-topic overall score history (for latency detection)
    _topic_depth_histories: dict[str, list] = {}   # H2 fix: per-topic depth scores for follow_up_collapse
    # Cross-interview question-construction tracker (RECENT_QUESTION_PATTERNS /
    # DECLINED_FACTS). QUESTION_GENERATION_SYSTEM has always claimed this collision
    # check exists, but no caller ever built or threaded real state into
    # get_probe_context()'s recent_question_patterns/declined_facts params -- they
    # silently defaulted to the literal string "(none yet)" every single turn.
    # This is the actual running state, appended to at the same point questions are
    # recorded into _asked_questions_log (see turn-completion block below).
    _recent_question_patterns: collections.deque = collections.deque(maxlen=8)  # each: {"opener":str,"construction":str,"signal":str}
    _declined_facts_log: list[str] = []  # facts the candidate explicitly could not produce (persists all interview)
    _teach_back_used: bool = False  # the no-jargon teach-back construction (used for mechanism_shallow/definition_partial etc.) -- at most ONCE per interview, not once per topic (see PROBLEM 3 fix)
    _last_depth_decay_turn: int = -999           # turn when depth_decay last fired; -999 = never
    _last_applied_eval_turn: int = 0             # monotonic guard against stale eval results
    _question_asked_at: float = 0.0
    # Wall-clock (epoch ms) twin of _question_asked_at -- perf_counter() is
    # monotonic-from-process-start and can't be compared against browser-side
    # proctoring event timestamps (Date.now()). This one can, so the report
    # pipeline can say "tab_switch happened during the Python question."
    _question_asked_at_wall_ms: int = 0
    # Set to True the instant a question's text is committed; consumed (and cleared)
    # by on_agent_state_changed when TTS playback actually finishes, which is the
    # real "AI stopped talking" instant that starts the reaction-time clock.
    _question_pending_timestamp: bool = False
    _answer_received_at: float = 0.0
    _candidate_started_speaking_at: float = 0.0  # true reaction-time endpoint (VAD speech-start, not EOT)
    # Rolling filler-ratio baseline for THIS candidate, used by the linguistic
    # analyzer to compare an answer against the candidate's own norm instead of
    # a fixed bar. Filled from each turn's heuristics after eval, capped small
    # since only the candidate's typical range matters, not full history.
    _filler_ratio_history: collections.deque = collections.deque(maxlen=6)
    _custom_q_reminder_fired: bool = False
    _covered_topic_keys = CoveredTopics()  # single source of truth — normalized lowercase keys
    _asked_questions_log: collections.deque = collections.deque(maxlen=6)  # EC-3: deque(maxlen) makes append atomic — no pop() race

    _first_interview_question_asked: bool = False  # True after first post-warmup AI question fires
    _interview_has_started: bool = False  # True when warmup ends and interview directive is injected
    # Per-topic ground-truth records built at MOVE_ON time -- replaces end-of-session
    # LLM transcript re-reading for skill extraction. Each entry is appended when the
    # agent closes a topic so eval scores, probe count, exit reason, and candidate
    # answers are captured while the context is live, not inferred afterward.
    _topic_records: list[dict] = []
    # Running buffer of candidate answers for the CURRENT active topic (reset on MOVE_ON)
    _current_topic_answers: list[str] = []
    # Running buffer of QUESTIONS Ishitha asked on the CURRENT active topic (reset on MOVE_ON).
    # Snapshotted into CoverageRecord.questions_asked when the topic is closed, so they become
    # GLOBAL forbidden questions -- preventing the same concept being re-asked under a later topic.
    _current_topic_questions: list[str] = []
    # Index into transcript_lines where the CURRENT topic began. Reset on MOVE_ON so that
    # probe directives only see the current topic's Q&A thread, not old-topic conversations.
    _topic_start_line_idx: int = 0
    # Lock protecting all shared session state that is written by background tasks.
    _session_state_lock = asyncio.Lock()
    # -- Agent-side topic tracker ----------------------------------------------
    # The agent owns topic selection -- eval only scores the current topic.
    # resume_topics and skill_topics are built once from the InterviewBrief
    # and reused every turn in the inline eval payload and topic selection.
    def _build_topic_pool() -> list[str]:
        """
        Build unified topic pool from InterviewBrief.
        Every topic from the brief enters the pool — RESUME_TOPIC, JD_TOPIC, ROLE_TOPIC.
        Anchor always first. Each entry: "Title - Description [tech1, tech2] |TAG=RESUME_TOPIC"
        The |TAG= suffix lets directive builders know how to frame the question without
        a separate lookup into the brief every time.
        Covered topics are removed from this list on MOVE_ON so len(_topic_pool) always
        reflects how many topics remain to be asked.
        """
        def _item_to_full_str(item: "TopicItem") -> str:
            desc = item.full_description.strip()
            tech = ", ".join(item.tech_stack) if item.tech_stack else ""
            base = f"{item.title} - {desc}" if desc else item.title
            if tech:
                base = f"{base} [{tech}]"
            return f"{base} |TAG={item.tag}|TYPE={item.topic_type}"

        seen: set[str] = set()
        pool: list[str] = []
        anchor_key = _topic_short_key_for_ordering(_interview_brief.anchor_topic.title)

        # Anchor always first
        for item in _interview_brief.topic_pool:
            k = _topic_short_key_for_ordering(item.title)
            if k == anchor_key and k not in seen:
                pool.append(_item_to_full_str(item))
                seen.add(k)
                break

        # All other topics in brief order (LLM already sorted by relevance)
        for item in _interview_brief.topic_pool:
            k = _topic_short_key_for_ordering(item.title)
            if k and k not in seen:
                pool.append(_item_to_full_str(item))
                seen.add(k)

        return pool

    # Unified topic pool -- shrinks as topics are covered.
    # _topic_pool is the single source of truth for what remains.
    _topic_pool: list[str] = _build_topic_pool()



    # Initialize _active_topic with the anchor from the brief
    def _init_active_topic() -> Optional[str]:
        if _topic_pool:
            return _topic_pool[0]
        td = _interview_brief.anchor_topic
        tech = ", ".join(td.tech_stack) if td.tech_stack else ""
        if tech:
            return f"{td.title} - {td.full_description} [{tech}]"
        return f"{td.title} - {td.full_description}" if td.full_description else td.title

    _active_topic = _init_active_topic()
    logger.info(
        "[ANCHOR] First topic set | %r  (pool_size=%d)",
        (_active_topic or "")[:80], len(_topic_pool),
    )

    def _topic_short_key(topic: str) -> str:
        return _topic_short_key_for_ordering(topic)

    def _next_uncovered_topic(exclude: Optional[str] = None) -> Optional[str]:
        """Return the next uncovered topic from the unified pool.
        Single source of truth: _covered_topic_keys.
        Covered = completed, denied, skipped, or probed-to-saturation — all the same.
        """
        excluded_key = _topic_short_key(exclude or "")
        # Full titles of topics already covered (exclude AUTO_SKILL -- those are
        # inferred sub-skills, not standalone topics, and would over-match).
        _covered_full_titles = [
            rec.display_title
            for rec in _covered_topic_keys._store.values()
            if rec.source != CoverageSource.AUTO_SKILL
        ]
        for t in _topic_pool:
            k = _topic_short_key(t)
            if not k or k == excluded_key or k in _covered_topic_keys:
                continue
            # Semantic overlap guard: skip a topic whose concept was already discussed
            # inside a prior topic (e.g. "LangGraph" skill when LangGraph was covered
            # inside "Internship"). Uses the existing _topics_overlap heuristic.
            if any(_topics_overlap(t, covered) for covered in _covered_full_titles):
                _covered_topic_keys.add(t)  # auto-mark so it never resurfaces
                _topic_pool[:] = [x for x in _topic_pool if _topic_short_key(x) != k]
                logger.info(
                    "[DEDUP] topic %r auto-removed — concept overlaps an already-covered topic", k
                )
                continue
            return t
        return None

    def _mark_topic_covered(
        topic: Optional[str],
        *,
        answer_gist: str = "",
        questions_asked: Optional[list[str]] = None,
    ) -> None:
        """Single entry point for all topic completion — covered, denied, skipped, all go here.

        questions_asked: the questions Ishitha asked on THIS topic. They are stored on the
        stored in CoveredTopics._store for report rendering only.
        """
        if not topic:
            return
        k = _topic_short_key(topic)
        if not k:
            return
        _covered_topic_keys.record(
            topic,
            source=CoverageSource.EXPLICIT,
            gist=" ".join(answer_gist.split()[:25]),
            questions_asked=questions_asked,
        )
        # Physically remove from pool so len(_topic_pool) reflects remaining work
        # and the pool never re-surfaces a finished topic even if _covered_topic_keys lookup fails.
        _topic_pool[:] = [t for t in _topic_pool if _topic_short_key(t) != k]
        logger.info("[COVERED] topic done: %r  (pool_remaining=%d covered=%d)", k, len(_topic_pool), len(_covered_topic_keys))

    # Stopwords that carry no identity -- ignored when measuring topic overlap.
    _OVERLAP_STOPWORDS = frozenset({
        # Generic English
        "the", "a", "an", "and", "or", "of", "for", "to", "in", "on", "at", "with",
        "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
        "do", "does", "did", "will", "would", "could", "should", "may", "might",
        "this", "that", "these", "those", "my", "our", "their", "its",
        # Job/resume generic words
        "system", "project", "app", "application", "platform", "tool", "pipeline",
        "using", "based", "developer", "engineer", "intern", "internship", "role",
        "team", "work", "company", "ltd", "pvt", "inc", "technologies", "solutions",
        "services", "private", "limited", "built", "build", "building",
        # Domain-generic GTM/marketing words -- too common to identify a unique topic
        "automation", "automated", "automate", "outreach", "campaign", "campaigns",
        "marketing", "growth", "gtm", "lead", "leads", "outbound", "inbound",
        "workflow", "workflows", "data", "management", "strategy", "systems",
        "analytics", "reporting", "process", "processes", "integration", "platform",
        # Domain-generic tech words
        "api", "web", "code", "software", "digital", "online", "cloud",
    })
    def _topic_signature(topic: str) -> set[str]:
        """Significant lowercase word tokens of a topic (title + description, minus
        bracketed tech tags and stopwords). Used to detect when a work-history role
        and a project are really the SAME thing described twice."""
        s = (topic or "").lower()
        s = re.sub(r"\[[^\]]*\]", " ", s)          # drop [tech] / [standalone] tags
        s = re.sub(r"\([^)]*\)", " ", s)            # drop (duration) etc.
        toks = re.findall(r"[a-z0-9]+", s)
        return {t for t in toks if len(t) >= 3 and t not in _OVERLAP_STOPWORDS}
    def _topics_overlap(a: str, b: str) -> bool:
        """True when two topics clearly describe the same work.
        Only fires on genuine duplicates — never silently skips a distinct topic.
        Two tests (either sufficient):
          1) Symmetric Jaccard (inter/union) >= 0.5 — both topics share most tokens.
          2) Title containment >= 3 tokens at 70% — a short title is inside the other's
             full description. Catches "Sensex Project" inside "Python Developer - Sensex".
        """
        sa, sb = _topic_signature(a), _topic_signature(b)
        if not sa or not sb:
            return False
        inter = sa & sb
        if not inter:
            return False
        # Test 1: symmetric Jaccard (inter / union) >= 0.5.
        # Previously used min-set Jaccard which caused large description topics
        # to absorb every small skill topic (2 shared / 3 total = 0.67 → false match).
        # Union-based Jaccard only fires when topics are genuinely near-identical.
        union = sa | sb
        if union and len(inter) / len(union) >= 0.5:
            return True
        # Test 2: title containment -- catches "Sensex Project" inside
        # "Python Developer - Sensex Project". Raised to >= 3 tokens to avoid
        # false positives from short 2-word skill titles like "n8n automation".
        ta = _topic_signature(_topic_short_title(a))
        tb = _topic_signature(_topic_short_title(b))
        for title, other_full in ((ta, sb), (tb, sa)):
            if len(title) >= 3:
                shared = title & other_full
                if len(shared) >= 3 and len(shared) / len(title) >= 0.7:
                    return True
        # Role/project duplicates can share only one distinctive token after
        # stopword cleanup, e.g. "Sensex Analysis Project" vs
        # "Python Developer - Sensex Project - Seneca Global IT Services".
        # Treat this as overlap only when one side is a role/work-history item
        # and the other is a project/system item, keeping the rule conservative.
        distinctive_shared = {tok for tok in inter if len(tok) >= 5}
        if distinctive_shared:
            la, lb = (a or "").lower(), (b or "").lower()
            role_words = ("developer", "intern", "engineer", "strategist", "analyst")
            project_words = ("project", "system", "pipeline", "automation")
            a_role = any(w in la for w in role_words)
            b_role = any(w in lb for w in role_words)
            a_project = any(w in la for w in project_words)
            b_project = any(w in lb for w in project_words)
            if (a_role and b_project) or (b_role and a_project):
                return True
        return False
    # Inline eval: reuse shared module-level client -- no cold TLS handshake per session.
    _eval_openai_client: AsyncOpenAI = _SHARED_OPENAI_CLIENT
    # Accumulated manual interview LLM usage records. Applied to the billing
    # snapshot and org usage at session end so eval/brief/directive calls are tracked.
    async def _publish_launch_prereqs_ready() -> None:
        """Notify frontend that launch prerequisites are complete."""
        nonlocal launch_prereqs_signal_sent
        if launch_prereqs_signal_sent or disconnect_event.is_set():
            return
        prefetch_ready = bool(interview_directive_cached)
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
    def _build_proctoring_data(exit_reason: str) -> dict:
        """Single builder for proctoring_data dict  eliminates duplicate construction."""
        data: dict = {
            "role_category": candidate_level,
            "level": candidate_level,
            "total_turns": turn_count,
            "exit_reason": exit_reason,
            "events": proctoring_events,
        }
        return data
    def _normalize_topic_key(text: str) -> str:
        return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()
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
            p_type = payload.get("type")
            if p_type == "interview_finished":
                logger.info("Candidate marked interview as finished")
                interview_marked_finished = True
                interview_finished_event.set()
                disconnect_event.set()  # Resolve hang
            elif payload.get("type") == "code_card_ack":
                # Client confirms it actually rendered the card just published --
                # see llm_node's _code_card_ack_event wait. Only resolve the wait
                # if this ack matches the card currently pending (a stale ack for
                # an already-dismissed/older card must not fire a newer wait).
                _acked_card_id = payload.get("card_id")
                _ack_event = agent._code_card_ack_event
                if _ack_event is not None and _acked_card_id == agent._code_card_ack_id:
                    _ack_event.set()
            # Browser-side proctoring signals are stored to DB, but also evaluated real-time here.
            elif p_type == "proctoring_event" or payload.get("eventType"):
                event_type = payload.get("eventType")
                severity = payload.get("severity", "medium")
                if event_type and evaluation_signal_toggles.get("live_integrity_monitoring"):
                    trap_fired = agent.handle_proctoring_event(event_type, severity)
                    logger.info(
                        "[PROCTORING_SIGNAL] Received real-time signal=%s severity=%s | current_live_score=%d",
                        event_type, severity, agent.live_trap_score,
                    )
                    if trap_fired:
                        logger.warning(
                            "[TRAP_ACTIVATED] Live trap score reached %d -- next turn will ask a trap question.",
                            agent.live_trap_score,
                        )
        except Exception as e:
            logger.debug(f"Ignored malformed data packet: {e}")
            return
    # Pre-start all background processing while user is on hardware check.
    try:
        await session.start(
            agent=agent,
            room=ctx.room,
            room_options=room_io.RoomOptions(
                close_on_disconnect=False,
            ),
        )
    except Exception as _session_start_err:
        logger.error(f"[INTERVIEW_FAIL] session.start() failed for {app_id}: {_session_start_err}")
        try:
            await log_livekit_error(
                app_id=app_id,
                candidate_name=candidate_name,
                org_name=_compact_optional(ctx_data.orgName),
                error=str(_session_start_err),
                phase="session_start",
            )
        except Exception:
            pass
        await _fail_interview("session_start_failed")
        raise
    # --- Real-time Transcript Streaming is handled by LiveKit automatically ---
    async def _apply_eval_result(
        result: dict[str, Any],
        *,
        result_turn: int,
        is_merge_rerun: bool = False,
    ) -> bool:
        """Persist eval state mutations. Agent already owns topic/directive decisions."""
        nonlocal answer_scores, _last_applied_eval_turn, \
            _topic_score_histories, _last_depth_decay_turn, \
            _eval_llm_usages_accumulated
        quality_record = result.get("quality_record")
        signal_events = result.get("signal_events") or []
        if signal_events:
            proctoring_events.extend(signal_events)
        async with _session_state_lock:
            # EC-5: stale-turn guard MUST be inside the lock. Without this, two concurrent
            # evals for the same turn both pass the check before either updates the counter,
            # then both append to answer_scores and _topic_score_histories -- duplicate scores.
            #
            # is_merge_rerun is the ONE exception: a repeat Flux end-of-turn merged the
            # candidate's full answer and re-ran eval on it (see _pending_turn_text in
            # _handle_completed_user_turn_locked). That re-run's result_turn intentionally
            # equals _last_applied_eval_turn -- it must REPLACE the first (partial-fragment)
            # score below, not be silently dropped, or the report/debug-PDF would keep
            # scoring the truncated answer even though the merge fix captured the full one.
            _is_stale = result_turn <= _last_applied_eval_turn
            if _is_stale and not (is_merge_rerun and result_turn == _last_applied_eval_turn):
                logger.debug(
                    "[EVAL] skipping stale eval result turn=%d last_applied=%d",
                    result_turn, _last_applied_eval_turn,
                )
                return False
            eval_usages = result.get("eval_llm_usages") or []
            if eval_usages:
                _eval_llm_usages_accumulated.extend(eval_usages)
            if quality_record:
                topic_key = re.sub(
                    r"[^a-z0-9]+", " ",
                    str(quality_record.get("topic") or _active_topic or "").lower(),
                ).strip()
                if is_merge_rerun and answer_scores and answer_scores[-1].get("turn") == result_turn:
                    # Replace the partial-fragment entry from the first eval instead of
                    # appending a second one for the same turn.
                    answer_scores[-1] = quality_record
                    if topic_key and not quality_record.get("is_timeout") and _topic_score_histories.get(topic_key):
                        _topic_score_histories[topic_key][-1] = float(quality_record.get("overall", 0) or 0)
                        _topic_depth_histories[topic_key][-1] = float(quality_record.get("depth", 0) or 0)
                else:
                    answer_scores.append(quality_record)
                    if topic_key and not quality_record.get("is_timeout"):
                        _topic_score_histories.setdefault(topic_key, []).append(
                            float(quality_record.get("overall", 0) or 0)
                        )
                        # H2 fix: separate depth history so follow_up_collapse
                        # compares current depth vs prior depth, not prior overall.
                        _topic_depth_histories.setdefault(topic_key, []).append(
                            float(quality_record.get("depth", 0) or 0)
                        )
                spawn_background_task(
                    persist_answer_scores(app_id, list(answer_scores)),
                    f"scores_turn_{result_turn}",
                )
            _last_applied_eval_turn = max(_last_applied_eval_turn, result_turn)
        return True
    async def _try_inject_trap_question(
        directive: str,
        turn_snapshot: int,
        transcript_lines_snap: list[str],
        *,
        topic_lock_msg: str = "",
        was_move_on: bool = False,
    ) -> tuple[str, str, bool]:
        """If live_integrity_monitoring is on and the score has hit threshold,
        replace `directive` with a generated trap question and stash the
        original directive (+ topic_lock_msg, for a MOVE_ON) on
        agent.pending_trap_question so the turn after the trap resolves can
        resume exactly what was already decided here -- see consume_trap()'s
        docstring in live_trap_score.py for why the score only resets on
        success. Returns (directive, topic_lock_msg, trap_generated).
        """
        if not (evaluation_signal_toggles.get("live_integrity_monitoring") and agent.live_trap_score >= 100):
            return directive, topic_lock_msg, False
        from interview.trap_question import generate_trap_question
        trap_result = await generate_trap_question(
            transcript_lines=transcript_lines_snap,
            resume=structured_resume,
            jd_skills=_jd_skills,
        )
        if not trap_result:
            logger.warning(
                "[TRAP_QUESTION] Generation failed at score=%d -- score stays pinned, will retry on the next eligible turn.",
                agent.live_trap_score,
            )
            return directive, topic_lock_msg, False
        agent.pending_trap_question = {
            "question": trap_result.question,
            "false_premise": trap_result.false_premise,
            "resume_directive": directive,
            "resume_topic_lock": topic_lock_msg,
            "was_move_on": was_move_on,
        }
        agent.trap_rephrased_once = False
        trap_directive = (
            f"[TRAP QUESTION — ASK THIS INSTEAD OF THE ABOVE (score={agent.live_trap_score})]\n"
            f'"{trap_result.question}"\n'
            "Ask ONLY this question next, in place of any other planned question. Light "
            "rephrasing for natural delivery is fine, but keep the false premise intact. "
            "If the candidate pushes back and says that's not what they said, acknowledge "
            "it and rephrase the question once to confirm what they actually meant -- then "
            "wait for their answer. Do not ask any other question this turn.\n"
        )
        logger.warning(
            "[TRAP_ACTIVATED] Live trap score reached %d at turn %d -- asking trap question instead.",
            agent.live_trap_score, turn_snapshot,
        )
        agent.consume_trap()
        return trap_directive, "", True
    async def _process_user_conversation_item(
        content: str,
        role: str,
        turn_snapshot: int,
        is_final_eot: bool = False,  # ponytail: True only when called from _handle_completed_user_turn (real EOT)
        is_merge_rerun: bool = False,  # True when this call is re-scoring merged text after a repeat Flux EOT
    ) -> None:
        nonlocal proctoring_events, _last_interviewer_question, \
            answer_scores, \
            greeting_delivered_at, \
            warmup_complete, _last_depth_decay_turn, \
            _active_topic, _covered_topic_keys, _topic_states, \
            _last_applied_eval_turn, _topic_score_histories, \
            _asked_questions_log, \
            _last_question_topic, _topic_records, _current_topic_answers, \
            _current_topic_questions, _topic_start_line_idx, \
            _turns_moved_on
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
            # Code card: candidate answered (real speech reached this point), so dismiss
            # it and let inactivity nudges resume normally on their next turn.
            if agent.code_card_active:
                agent.code_card_active = False
                try:
                    await ctx.room.local_participant.publish_data(
                        json.dumps({"type": "code_card_dismiss"}).encode("utf-8"), reliable=True,
                    )
                except Exception:
                    pass
            # Turn 2 = warmup response. It's always intentional candidate speech -- skip noise filters.
            is_warmup_response = not warmup_complete and turn_snapshot >= 2
            if is_warmup_response:
                logger.debug(f"[WARMUP] Warmup response (turn={turn_snapshot}): '{content[:60]}' - skipping noise filters")
            else:
                # Flux handles endpointing and turn completion natively -- only filter
                # genuine STT hallucinations (high word count, near-zero unique tokens).
                words = content.strip().split()
                # Always pass through clarification questions regardless of length.
                _is_question = content.strip().endswith("?")
                if not _is_question:
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
            # Commit candidate text immediately so transcript persistence and eval context
            # use the same canonical source of truth as Interview.interviewTranscript.
            _append_with_elapsed("Candidate", content)
            # Test event: response received
            spawn_background_task(
                log_test_event(app_id, "response_received", f"Candidate: {content[:60]}..." if len(content) > 60 else f"Candidate: {content}"),
                "test_event_response_received"
            )
            # Accumulate candidate answers for the current topic -- used at MOVE_ON
            # to build grounded skill records instead of re-reading the transcript later.
            # EC-4: append under the lock so it cannot interleave with the MOVE_ON block
            # that reads then resets _current_topic_answers in the same lock acquisition.
            if warmup_complete and content.strip():
                async with _session_state_lock:
                    # A merged repeat-EOT re-run (see _pending_turn_text) re-processes this
                    # turn with the FULL text -- drop the earlier partial-fragment entry so
                    # it isn't counted twice alongside the complete answer.
                    if is_final_eot and _current_topic_answers and content.strip().startswith(_current_topic_answers[-1]):
                        _current_topic_answers[-1] = content.strip()
                    else:
                        _current_topic_answers.append(content.strip())
            lines_snap_eval = list(transcript_lines)
            question_snap = _last_interviewer_question
            answer_snap = content
            spawn_background_task(
                persist_transcript(app_id, lines_snap_eval, session_start_time, partial=True),
                f"transcript_save_turn_{turn_snapshot}",
            )
            # This turn is the candidate's answer to a trap question asked last turn.
            # If they just asked to repeat/rephrase, re-ask once (don't classify yet,
            # don't clear pending_trap_question). Otherwise classify inline, persist the
            # result, inject the bridge-back directive, and skip normal probe/eval for
            # this turn entirely (the real answer already got evaluated in the earlier
            # turn where the trap fired -- see the live_trap_score check further below).
            if is_final_eot and agent.pending_trap_question:
                _trap_pending = agent.pending_trap_question
                _repeat_re = re.compile(
                    r"\b(repeat|rephrase|say (that |it )?again|come again|what was that|didn'?t (catch|hear|understand))\b",
                    re.IGNORECASE,
                )
                if _repeat_re.search(answer_snap) and not agent.trap_rephrased_once:
                    agent.trap_rephrased_once = True
                    _directive = (
                        "[TRAP QUESTION — CANDIDATE ASKED YOU TO REPEAT/REPHRASE]\n"
                        f'Original question: "{_trap_pending.get("question", "")}"\n'
                        "Rephrase this same question once, keeping the same false premise intact, "
                        "then wait for their actual answer. Do not ask anything else this turn.\n"
                    )
                    remove_system_messages_multi(chat_ctx, ("[NEXT_TURN_DIRECTIVE", "[TOPIC_LOCK", "[RECENT_CONTEXT", "[TRAP QUESTION"))
                    chat_ctx.add_message(role="system", content=_directive)
                    logger.info("[TRAP_QUESTION] Turn %d: candidate asked to repeat, rephrasing once.", turn_snapshot)
                    return
                agent.pending_trap_question = None
                agent.trap_rephrased_once = False
                from interview.trap_question import classify_trap_answer
                result = await classify_trap_answer(
                    false_premise=_trap_pending.get("false_premise", ""),
                    candidate_answer=answer_snap,
                )
                logger.warning(
                    "[TRAP_QUESTION] Turn %d classified: caught=%s reason=%s",
                    turn_snapshot, result.caught_the_trap, result.reason,
                )
                spawn_background_task(
                    persist_trap_event(app_id, {
                        # Only "trap_question" (failed) counts against the integrity
                        # score in report.py's IntegrityEngine -- a caught trap is
                        # recorded for transparency but shouldn't be penalized.
                        "eventType": "trap_question" if not result.caught_the_trap else "trap_question_passed",
                        "turn": turn_snapshot,
                        "question": _trap_pending.get("question", ""),
                        "false_premise": _trap_pending.get("false_premise", ""),
                        "candidate_answer": answer_snap,
                        "caught_the_trap": result.caught_the_trap,
                        "reason": result.reason,
                    }),
                    f"trap_event_persist_{turn_snapshot}",
                )
                # Resume exactly what the eval had already queued up before the trap
                # interrupted -- reusing the same PROBE-vs-MOVE_ON phrasing distinction
                # the rest of the codebase already uses (see _classify_candidate_intent's
                # for_move_on hint text above), instead of one generic bridge-back line.
                _resume_directive = _trap_pending.get("resume_directive", "")
                _resume_topic_lock = _trap_pending.get("resume_topic_lock", "")
                _was_move_on = bool(_trap_pending.get("was_move_on"))
                if _resume_directive and _was_move_on:
                    _bridge_directive = (
                        "[TRAP QUESTION RESOLVED — PROCEED TO THE NEW TOPIC]\n"
                        "Briefly acknowledge the candidate's answer to the check-in question, then transition "
                        "into the new topic below as originally planned -- e.g. \"alright, let's move on to...\" "
                        "or \"switching gears, let's talk about...\". This is a fresh topic, not a return to the "
                        "previous one.\n\n" + _resume_directive
                    )
                    if _resume_topic_lock:
                        remove_system_messages_multi(chat_ctx, ("[NEXT_TURN_DIRECTIVE", "[TOPIC_LOCK", "[RECENT_CONTEXT", "[TRAP QUESTION"))
                        chat_ctx.add_message(role="system", content=_bridge_directive)
                        chat_ctx.add_message(role="system", content=_resume_topic_lock)
                        return
                elif _resume_directive:
                    _bridge_directive = (
                        "[TRAP QUESTION RESOLVED — RETURN TO PREVIOUS DISCUSSION]\n"
                        "Briefly acknowledge the candidate's answer to the check-in question, then explicitly "
                        "bridge back with something like \"coming back to what we were discussing...\" and ask "
                        "the question below -- do NOT treat this as a new topic.\n\n" + _resume_directive
                    )
                else:
                    _bridge_directive = (
                        "[TRAP QUESTION RESOLVED]\nBriefly acknowledge the candidate's answer, then continue "
                        "the interview normally with your next question.\n"
                    )
                remove_system_messages_multi(chat_ctx, ("[NEXT_TURN_DIRECTIVE", "[TOPIC_LOCK", "[RECENT_CONTEXT", "[TRAP QUESTION"))
                chat_ctx.add_message(role="system", content=_bridge_directive)
                return
            # Inject structured recent Q&A context for callbacks and follow-up context.
            if bool(_last_interviewer_question) and turn_snapshot > 1:
                # Limit the lookback to the current topic to prevent leaking previous topics
                _n_exchanges = min(3, len(_current_topic_answers))
                recent_context = _build_recent_context_block(
                    transcript_lines, _last_interviewer_question, n_exchanges=_n_exchanges
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
            # and injects a NEXT_TURN_DIRECTIVE before Ishitha generates her next response.
            # Decision: PROBE (which mode) or MOVE_ON - fully signal-driven, no fixed depth.
            # Greeting = turn 1, warmup question = turn 2, interview starts at turn 3.
            # Warmup turns (before warmup_complete) are recorded as zero-scored placeholders
            # so they never pollute the technical or communication score averages.
            is_warmup_turn: bool = not warmup_complete and bool(_last_interviewer_question) and turn_snapshot > 1
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
            # ponytail: Deepgram Flux sends partial transcripts as separate chunks.
            # We ONLY eval at true end-of-turn (is_final_eot=True from _handle_completed_user_turn).
            # Skip eval on intermediate chunks to avoid double-scoring and hallucination.
            if not is_final_eot:
                logger.info("[EVAL_GUARD] turn=%d skipped eval -- not EOT (is_final_eot=%s, content=%r)", turn_snapshot, is_final_eot, (content or "")[:40])
                return

            # --- Background Async Linguistic Teleprompter Analyzer ---
            # Gated by the super-admin "live_integrity_monitoring" toggle -- off means
            # this never runs, so no linguistic events and no trap questions can fire.
            if (
                evaluation_signal_toggles.get("live_integrity_monitoring")
                and warmup_complete and content.strip() and len(content.strip().split()) >= 15
            ):
                _ling_turn = turn_snapshot
                _ling_answer = content.strip()
                _ling_question = _last_interviewer_question or ""
                # Same reaction-time calculation used by the main evaluator below --
                # question TTS finished -> candidate started speaking (VAD speech-start),
                # falling back to EOT receipt time if speech-start never fired.
                _ling_latency_end = (
                    _candidate_started_speaking_at
                    if _candidate_started_speaking_at > _question_asked_at
                    else _answer_received_at
                )
                _ling_latency: Optional[float] = (
                    round(_ling_latency_end - _question_asked_at, 3)
                    if _question_asked_at > 0 and _ling_latency_end > _question_asked_at
                    else None
                )
                # Candidate's own filler-ratio baseline from prior turns (excludes this
                # one) -- None until they have at least one prior scored turn.
                _ling_baseline: Optional[float] = (
                    round(sum(_filler_ratio_history) / len(_filler_ratio_history), 3)
                    if _filler_ratio_history else None
                )

                async def _run_ling_eval_bg(
                    t_snap=_ling_turn,
                    a_snap=_ling_answer,
                    q_snap=_ling_question,
                    latency_snap=_ling_latency,
                    baseline_snap=_ling_baseline,
                ) -> None:
                    try:
                        from interview.linguistic_analyzer import LinguisticAnalyzer
                        analyzer = LinguisticAnalyzer(_SHARED_OPENAI_CLIENT)
                        res = await analyzer.analyze_async(
                            candidate_text=a_snap,
                            question_text=q_snap,
                            response_latency_sec=latency_snap,
                            baseline_filler_ratio=baseline_snap,
                        )
                        # Feed this turn's own filler ratio into the rolling baseline
                        # for future turns, regardless of whether it was suspicious.
                        _filler_ratio_history.append(
                            LinguisticAnalyzer.extract_heuristics(a_snap)["filler_ratio"]
                        )
                        if res.is_suspicious:
                            logger.warning(
                                "[LINGUISTIC_ANALYZER] Turn %d flagged teleprompter speech: score=%d confidence=%s signals=%s reason=%s",
                                t_snap, res.score, res.confidence, res.signals, res.reason,
                            )
                            trap_fired = agent.handle_proctoring_event(
                                event_type="robotic_speech",
                                severity="medium",
                            )
                            spawn_background_task(
                                log_test_event(
                                    app_id,
                                    "linguistic_teleprompter_flagged",
                                    f"Turn {t_snap} Teleprompter Speech (score={res.score}): {res.reason}",
                                    data={
                                        "score": res.score,
                                        "signals": res.signals,
                                        "reason": res.reason,
                                        "live_trap_score": agent.live_trap_score,
                                    },
                                ),
                                f"test_event_ling_flag_{t_snap}",
                            )
                            if trap_fired:
                                logger.warning(
                                    "[TRAP_ACTIVATED] Live trap score reached %d via linguistic analysis.",
                                    agent.live_trap_score,
                                )
                        else:
                            logger.debug(
                                "[LINGUISTIC_ANALYZER] Turn %d clean: score=%d",
                                t_snap, res.score,
                            )
                    except Exception as _ling_err:
                        logger.debug("[LINGUISTIC_ANALYZER] Error evaluating turn %d: %s", t_snap, _ling_err)

                spawn_background_task(
                    _run_ling_eval_bg(),
                    f"linguistic_eval_turn_{turn_snapshot}",
                )


            # Eval runs after interview has started (warmup complete + directive injected).
            # This allows the first interview question to be evaluated immediately after delivery.
            # _interview_has_started is set when warmup ends and the interview directive is injected.
            _can_eval_turn = bool(
                _interview_has_started
                and turn_snapshot > 2
                and question_snap
            )
            if is_merge_rerun and turn_snapshot in _turns_moved_on:
                # The FIRST (partial-fragment) eval for this turn already committed
                # MOVE_ON -- topic switched, directive injected, possibly already
                # spoken to the candidate. Re-scoring the merged full text can't safely
                # undo that live conversational step, so skip the re-eval entirely here
                # rather than mutate state for a decision that's already been acted on.
                _can_eval_turn = False
                logger.info(
                    "[EVAL_GATE] turn=%d merge re-run skipped -- MOVE_ON already committed", turn_snapshot,
                )
            _gate_reason = (
                "PASS" if _can_eval_turn
                else (
                    f"BLOCK(interview_started={_interview_has_started},turn={turn_snapshot}>2={turn_snapshot>2},"
                    f"question={'Y' if question_snap else 'EMPTY'})"  # type: ignore[str-bytes-safe]
                )
            )
            logger.info("[EVAL_GATE] turn=%d -> %s", turn_snapshot, _gate_reason)
            if _can_eval_turn:
                turns_since_decay_snap = (
                    (turn_snapshot - _last_depth_decay_turn)
                    if _last_depth_decay_turn >= 0
                    else 999
                )
                # Reaction time = question delivered -> candidate started speaking (VAD speech-start),
                # NOT question delivered -> candidate finished speaking. The latter (old behavior)
                # included the entire duration of their spoken answer, inflating latency for anyone
                # who gave a long answer instantly. Falls back to end-of-turn timestamp if the
                # speech-start event never fired (e.g. STT-only path with no VAD state).
                _latency_end = (
                    _candidate_started_speaking_at
                    if _candidate_started_speaking_at > _question_asked_at
                    else _answer_received_at
                )
                response_latency_snap: Optional[float] = (
                    round(_latency_end - _question_asked_at, 3)
                    if _question_asked_at > 0 and _latency_end > _question_asked_at
                    else None
                )
                question_asked_at_wall_ms_snap = _question_asked_at_wall_ms
                # ---------------------------------------------------------------
                # Build eval payload for the inline pipeline (run_eval_and_build_directive).
                # Scoring, signal detection, saturation, and directive generation all run
                # directly in the agent -- no Redis, no worker, no polling.
                # ---------------------------------------------------------------
                def _build_eval_payload(
                    answer=answer_snap,
                    question=question_snap,
                    lines=lines_snap_eval,
                    turn=turn_snapshot,
                    turns_since_decay=turns_since_decay_snap,
                    response_latency=response_latency_snap,
                    question_asked_at_wall_ms=question_asked_at_wall_ms_snap,
                ) -> dict:
                    resolved_question = (question or "").strip()
                    if len(resolved_question) < 16:
                        _greeting_skip = re.compile(
                            r"(?:really glad|how are you|hope the day|ready to jump|let's get into it|"
                            r"hi \w+|hello \w+|been a packed day|happy to have)",
                            re.IGNORECASE,
                        )
                        for _line in reversed(lines):
                            _txt = (_line or "").strip()
                            if not _txt:
                                continue
                            if _txt.lower().startswith("interviewer:"):
                                _txt = _txt.split(":", 1)[1].strip()
                            if len(_txt) >= 24 and not _greeting_skip.search(_txt):
                                resolved_question = _txt
                                break
                    # Resolve active TopicItem from brief -- gives eval accurate probe_focus
                    # and tag instead of deriving from raw string heuristics.
                    _scoring_topic_full = _active_topic or ""
                    _scoring_topic = _scoring_topic_full.split(" - ")[0].strip() if _scoring_topic_full else None
                    _scoring_topic_key = _normalize_topic_key(_scoring_topic or "")
                    # Look up the matching TopicItem so probe_focus/tag come from the brief
                    _active_brief_item = next(
                        (t for t in _interview_brief.topic_pool
                         if _topic_short_key_for_ordering(t.title) == _topic_short_key(_scoring_topic_full)),
                        None,
                    )
                    _ts_obj = _topic_states.get(_scoring_topic_key) if _scoring_topic_key else None
                    active_topic_state = (
                        _ts_obj if isinstance(_ts_obj, dict) else
                        _ts_obj.to_dict() if _ts_obj is not None else None
                    )
                    _topic_key_now = _scoring_topic_key
                    _topic_score_history_snap = list(_topic_score_histories.get(_topic_key_now, []))
                    _topic_depth_history_snap = list(_topic_depth_histories.get(_topic_key_now, []))
                    return {
                        "app_id": app_id,
                        "turn": turn,
                        "answer": answer,
                        "question": resolved_question,
                        # The candidate is answering the code card just shown (if any) --
                        # tells eval to use code-question scoring calibration instead of
                        # defaulting to generic "mechanism". See last_code_card_question_type.
                        "question_type": agent.last_code_card_question_type,
                        "transcript_lines": lines[-6:],
                        "topic_score_history": _topic_score_history_snap,
                        "topic_depth_history": _topic_depth_history_snap,
                        "turns_since_decay": turns_since_decay,
                        "response_latency_sec": response_latency,
                        "question_asked_at_wall_ms": question_asked_at_wall_ms,
                        "signal_toggles": dict(evaluation_signal_toggles),
                        "org_id": org_id,
                        "llm_model": analysis_model,
                        # Agent tells eval exactly which topic to score -- no topic selection in eval
                        "active_topic": _scoring_topic,
                        "active_topic_state": active_topic_state,
                        "anchor_item": _anchor_title,
                        # Brief-derived topic metadata for accurate scoring calibration
                        "topic_tag": _active_brief_item.tag if _active_brief_item else "RESUME_TOPIC",
                        "topic_probe_focus": _active_brief_item.probe_focus if _active_brief_item else "",
                        "topic_why_relevant": _active_brief_item.why_relevant if _active_brief_item else "",

                        "job_title": job_title,
                        "remaining_seconds": _remaining_total_seconds_now(),
                        "level": candidate_level,
                        "ai_question_this_turn": (_last_interviewer_question or "").strip(),
                    }
                # -- INLINE EVAL -----------------------------------------------
                # Agent calls eval to SCORE the answer on the current topic.
                # Agent then decides: PROBE (stay, build probe directive) or
                # MOVE_ON (pick next topic, build move-on directive).
                # Eval never picks topics or builds directives.
                if interview_type == "conversational":
                    from interview.conversational.eval import run_eval_and_build_directive
                else:
                    from interview.tech.eval import run_eval_and_build_directive
                # Time guard -- no new questions in final 20s
                if _closing_triggered:
                    logger.info("[CLOSING] eval skipped at turn=%d -- closing in progress", turn_snapshot)
                    agent._directive_ready.set()
                    return
                # MOVE_ON race guard (EDGE CASE ONLY):
                # Normally _move_on_opener_pending is cleared the moment the opener
                # question is delivered (see QUESTION_TRACK), so by the time the
                # candidate answers it is already False and their answer is scored.
                # This block only fires in the rare race where the candidate's answer
                # arrives BEFORE the opener question was tracked -- in that case the
                # answer really is still about the PREVIOUS topic, so skip eval once.
                if agent._move_on_opener_pending:
                    logger.info(
                        "[EVAL] turn=%d skipped -- opener not yet delivered (race); "
                        "skipping one eval so the opener fires before scoring",
                        turn_snapshot,
                    )
                    agent._move_on_opener_pending = False
                    agent._waiting_for_eval = False
                    agent._directive_ready.set()
                    return
                # Turn 3: strip warmup context so directive is first interview message
                if turn_snapshot == 3:
                    logger.info("[EVAL] turn=3 | clearing warmup context")
                    remove_system_messages_multi(chat_ctx, (
                        "[NEXT_TURN_DIRECTIVE", "[TOPIC_LOCK",
                        "[RECENT_CONTEXT", "[WARMUP PHASE]",
                    ))
                async with _session_state_lock:
                    payload = _build_eval_payload()
                    # Snapshot consumed -- clear so a later non-code turn doesn't
                    # inherit this card's type by mistake.
                    agent.last_code_card_question_type = ""
                _scoring_topic_log = payload.get("active_topic", "?")
                _sat_before_log = (payload.get("active_topic_state") or {}).get("saturation_score", 0.0)
                logger.info(
                    "[EVAL] > turn=%d STARTED | topic=%r | sat_before=%.1f | answer_words=%d",
                    turn_snapshot, _scoring_topic_log, _sat_before_log,
                    len((payload.get("answer") or "").split()),
                )
                logger.debug("[EVAL] turn=%d | answer=%r", turn_snapshot, (payload.get("answer") or "")[:120])
                # Test event: eval started
                spawn_background_task(
                    log_test_event(app_id, "eval_start", f"Evaluating answer on topic: {_scoring_topic_log}"),
                    "test_event_eval_start"
                )
                # EVAL IS THE SINGLE SOURCE OF TRUTH.
                # run_eval_and_build_directive NEVER returns None and NEVER raises:
                # recovery (slow/failed LLM) is owned inside eval, which always returns
                # a real, topic-advancing result with a serialized topic_state_dict.
                # The agent therefore has NO fallback path -- it trusts eval's return.
                _eval_result_inline: dict = await run_eval_and_build_directive(payload, _eval_openai_client)
                # -- Unpack eval result ----------------------------------------
                _eval_signal        = _eval_result_inline.get("signal")         # str | None
                _eval_cross_cutting = _eval_result_inline.get("cross_cutting_signal")  # str | None
                _eval_signal_reason = _eval_result_inline.get("signal_reason")  # str | None
                _saturation   = _eval_result_inline.get("saturation") or {}
                # H5 fix: read rotation index from TopicState and advance it so
                # consecutive PROBE turns on the same topic cycle through different
                # goal angles instead of random-picking each time.
                # Item 3 gate: only actually advance when eval says the current
                # sub-concept's gap resolved or 2 consecutive failed probes on it
                # already happened -- see should_rotate_subconcept below.
                _new_topic_state_dict_pre = _saturation.get("topic_state_dict") if _eval_result_inline.get("saturation") else None
                _rotation_idx = int((_new_topic_state_dict_pre or {}).get("probe_rotation_index", 0) or 0)
                _should_rotate_subconcept = bool(_saturation.get("should_rotate_subconcept", True))
                _qr           = _eval_result_inline.get("quality_record") or {}
                _signals      = [_eval_signal] if _eval_signal else []

                # Signal detection logging for debug/test visibility
                if _eval_signal:
                    logger.info(
                        "[SIGNAL] turn=%d | fired=%r | reason=%r",
                        turn_snapshot, _eval_signal, _eval_signal_reason or ""
                    )
                    spawn_background_task(
                        log_test_event(
                            app_id, 
                            "signal_fired", 
                            f"Signal: {_eval_signal}", 
                            {"reason": _eval_signal_reason or "No reason provided"}
                        ),
                        "test_event_signal"
                    )
                else:
                    logger.debug("[SIGNAL] turn=%d | none fired", turn_snapshot)
                _sat_after    = _saturation.get("score", 0.0)
                _sat_thresh   = _saturation.get("threshold", 0.0)
                _is_saturated = _saturation.get("is_saturated", False)
                _weak_exit    = _saturation.get("weak_exit", False)
                _dry_topic    = _saturation.get("dry_topic", False)
                # eval_pipeline.run_eval_and_build_directive already computes the correct,
                # priority-ordered decision: forced response signals (pure_denial ->
                # MOVE_ON, clarification_request/rephrase_request -> REPHRASE, off_topic ->
                # REDIRECT, with 2x-clarification escalation to MOVE_ON) override
                # saturation math entirely; only once no forced signal fired does it fall
                # through to dry_topic/weak_exit/saturated/PROBE. Recomputing a bare
                # saturation-only MOVE_ON/PROBE split here (as before) discarded that
                # forced-signal priority, so e.g. a first-time clarification_request could
                # coincidentally read as MOVE_ON from saturation alone, or a pure_denial
                # could get stuck in PROBE if saturation checkpoints hadn't been hit yet.
                # REPHRASE/REDIRECT/ACCEPT_REPHRASE all mean "stay on this topic, ask
                # again differently" -- only agent_runtime's own PROBE/MOVE_ON branches
                # exist downstream, and probe_strategy.get_probe_context already has
                # dedicated guidance for each of these signals, so they collapse to PROBE.
                _eval_action = _eval_result_inline.get("action") or "PROBE"
                _action = "MOVE_ON" if _eval_action == "MOVE_ON" else "PROBE"
                spawn_background_task(
                    log_test_event(app_id, "eval_done", f"Eval complete | action={_eval_action}"),
                    "test_event_eval_done"
                )
                logger.info(
                    "[AGENT] turn=%d | decision_logic: sat=%.1f/%.1f saturated=%s weak=%s dry=%s "
                    "-> agent_action=%s",
                    turn_snapshot, _sat_after, _sat_thresh, _is_saturated, _weak_exit, _dry_topic,
                    _action
                )
                # Test events: log decision
                if _action == "MOVE_ON":
                    _reason = "Unknown"
                    if (_eval_signal or "").endswith("_absent") or _eval_cross_cutting == "pure_denial":
                        _reason = "denial-tier signal (topic_floor_reached)"
                    elif _is_saturated:
                        _reason = "topic saturated"
                    elif _weak_exit:
                        _reason = "weak exit (low depth/denial)"
                    elif _dry_topic:
                        _reason = "dry topic (no substantive answers)"
                    elif _eval_action == "MOVE_ON":
                        _reason = "evaluator forced move_on"

                    spawn_background_task(
                        log_test_event(
                            app_id, 
                            "move_on", 
                            f"Moving to next topic | sat={_sat_after:.1f}/{_sat_thresh:.1f}",
                            {"reason": _reason}
                        ),
                        "test_event_move_on"
                    )
                else:
                    spawn_background_task(
                        log_test_event(app_id, "probe", f"Probing further | sat={_sat_after:.1f}/{_sat_thresh:.1f}"),
                        "test_event_probe"
                    )
                # Log scores
                logger.info(
                    "[TURN_RESULT] turn=%-2d | topic=%-35s | "
                    "clarity=%.0f depth=%.0f spec=%.0f ground=%.0f overall=%.1f | "
                    "sat=%.1f→%.1f/%.1f (%d%%) | action=%-7s | signals=[%s]",
                    turn_snapshot,
                    (_scoring_topic_log or "?")[:35],
                    _qr.get("clarity", 0), _qr.get("depth", 0),
                    _qr.get("specificity", 0), _qr.get("grounding", 0), _qr.get("overall", 0),
                    _sat_before_log, _sat_after, _sat_thresh,
                    int(100 * min(1.0, _sat_after / _sat_thresh)) if _sat_thresh else 0,
                    _action,
                    ", ".join(_signals) if _signals else "none",
                )
                # -- Update topic saturation state in agent --------------------
                _new_topic_state_dict = _saturation.get("topic_state_dict")
                if _new_topic_state_dict and _scoring_topic_log and _scoring_topic_log != "?":
                    async with _session_state_lock:
                        _topic_states[_normalize_topic_key(_scoring_topic_log)] = _new_topic_state_dict
                # -- Persist state mutations (scores, trust, risk, log) --------
                await _apply_eval_result(
                    _eval_result_inline, result_turn=turn_snapshot, is_merge_rerun=is_merge_rerun,
                )
                # -- Agent decides: PROBE or MOVE_ON ---------------------------
                if _action == "MOVE_ON":
                    _turns_moved_on.add(turn_snapshot)
                    # -- Agent picks the next topic ----------------------------
                    _old_topic = _active_topic
                    # Determine exit reason from saturation flags BEFORE marking,
                    # so we capture the true reason (not masked by post-mark checks)
                    _exit_reason = (
                        "weak_exit"  if _weak_exit
                        else "saturated"  if _is_saturated
                        else "dry_topic"
                    )
                    # Snapshot the questions asked on the topic we are leaving BEFORE the
                    # per-topic buffer is reset below, so they are recorded as GLOBAL
                    # forbidden questions and never re-asked under a later topic.
                    _closing_topic_questions = list(_current_topic_questions)
                    _mark_topic_covered(
                        _old_topic,
                        answer_gist=(payload.get("answer") or ""),
                        questions_asked=_closing_topic_questions,
                    )
                    # -- Ground-truth topic record ------------------------------
                    # EC-1/EC-2/EC-4/EC-5: ALL shared state reads and writes for
                    # this topic record must happen under one lock acquisition so
                    # that a concurrent MOVE_ON (different session on same process)
                    # or a concurrent candidate answer append cannot interleave:
                    #   _topic_states        -- read (EC-1)
                    #   _topic_score_histories / _topic_depth_histories -- read (EC-5)
                    #   _current_topic_answers -- read then reset (EC-4)
                    #   _topic_records       -- append (EC-2)
                    # The entire block is one atomic snapshot-and-commit.
                    try:
                        async with _session_state_lock:
                            _old_key = _topic_short_key(_old_topic or "")
                            _old_ts  = _topic_states.get(_normalize_topic_key(_old_key)) or {}
                            # Extract tech skills from [bracket] in topic string
                            _tech_brackets = re.findall(r"\[([^\]]+)\]", _old_topic or "")
                            _tech_skills: list[str] = []
                            for _chunk in _tech_brackets:
                                for _tok in re.split(r"[;,]", _chunk):
                                    _tok = _tok.strip()
                                    if _tok:
                                        _tech_skills.append(_tok)
                            # Compute avg scores across all turns on this topic
                            _topic_normed_key = re.sub(r"[^a-z0-9]+", " ", _old_key.lower()).strip()
                            _overall_hist = _topic_score_histories.get(_topic_normed_key, [])
                            _depth_hist   = _topic_depth_histories.get(_topic_normed_key, [])
                            _avg_overall  = round(sum(_overall_hist) / len(_overall_hist), 2) if _overall_hist else 0.0
                            _avg_depth    = round(sum(_depth_hist)   / len(_depth_hist),   2) if _depth_hist   else 0.0
                            # Current turn's scores
                            _cur_clarity     = float(_qr.get("clarity",     0) or 0)
                            _cur_depth       = float(_qr.get("depth",       0) or 0)
                            _cur_specificity = float(_qr.get("specificity", 0) or 0)
                            _cur_grounding   = float(_qr.get("grounding",   0) or 0)
                            _cur_overall     = float(_qr.get("overall",     0) or 0)
                            # Probe count = follow_up_turns from TopicState
                            _probe_count = int(_old_ts.get("follow_up_turns", 0) or 0)
                            _topic_record = {
                                "topic":        _old_topic or "",
                                "topic_key":    _old_key,
                                "topic_type":   next((t.topic_type for t in _interview_brief.topic_pool if _topic_short_key_for_ordering(t.title) == _old_key), "project"),
                                "exit_reason":  _exit_reason,
                                "probe_count":  _probe_count,
                                "scores": {
                                    "avg_overall":   _avg_overall,
                                    "avg_depth":     _avg_depth,
                                    "last_clarity":     _cur_clarity,
                                    "last_depth":       _cur_depth,
                                    "last_specificity": _cur_specificity,
                                    "last_grounding":   _cur_grounding,
                                    "last_overall":     _cur_overall,
                                },
                                "saturation_score": float(_old_ts.get("saturation_score", 0.0) or 0.0),
                                # EC-4: snapshot answers then reset atomically under the lock so
                                # a candidate answer arriving during MOVE_ON is never silently lost.
                                "candidate_answers": list(_current_topic_answers[-6:]),
                                "tech_skills": _tech_skills,
                                "denied": _old_key in _covered_topic_keys,
                            }
                            _topic_records.append(_topic_record)
                            # EC-4: reset happens inside the same lock acquisition as the
                            # snapshot above -- any answer appended after this point belongs
                            # to the next topic and will not be incorrectly included here.
                            _current_topic_answers = []
                            # Reset per-topic question buffer too -- already snapshotted into
                            # the CoverageRecord via _closing_topic_questions above.
                            _current_topic_questions = []
                            # MOVE_ON: clear the short-term asked-questions deque so that
                            # old-topic questions NEVER appear in the new topic's probe
                            # directive. Global forbidden questions are already preserved
                            # in CoveredTopics.get_memory_block() (coverage_memory), so
                            # nothing is lost -- they still show up as FORBIDDEN in every
                            # subsequent directive. This is the primary fix for the bug
                            # where Ishitha kept asking old-topic questions after MOVE_ON.
                            _asked_questions_log.clear()
                            logger.info(
                                "[TOPIC_RECORD] turn=%d | recorded topic=%r exit=%s probes=%d avg_overall=%.1f answers=%d q_forbidden=%d",
                                turn_snapshot, _old_key, _exit_reason, _probe_count, _avg_overall, len(_topic_records),
                                len(_closing_topic_questions),
                            )
                    except Exception as _tr_err:
                        logger.warning("[TOPIC_RECORD] Failed to record topic: %s", _tr_err)
                    _next_topic = _next_uncovered_topic(exclude=_old_topic)
                    # _prev_a is needed by the non-prefired MOVE_ON directive path; initialize
                    # here so it's always defined regardless of which branch runs below.
                    _prev_a = (payload.get("answer") or "").strip()
                    # Pre-fire MOVE_ON directive generation in parallel -- by the time
                    # we reach the await below it will already be done (or nearly so),
                    # eliminating the 5s serial wait after the eval completes.
                    _move_on_directive_task: Optional[asyncio.Task] = None
                    _pre_next_key: str = ""  # initialized before the conditional so it's always defined
                    if _next_topic is not None:
                        _pre_next_key = _topic_short_key(_next_topic).lower()
                        _pre_next_item = next(
                            (t for t in _interview_brief.topic_pool
                             if _topic_short_key_for_ordering(t.title).lower() == _pre_next_key),
                            None,
                        )
                        _pre_next_src = (
                            _pre_next_item.tag if _pre_next_item else "RESUME_TOPIC"
                        )
                        _pre_old_title = _topic_short_title(_old_topic or "")
                        _pre_cross_ref = _build_cross_ref_rule(_pre_next_src)
                        _move_on_directive_task = asyncio.ensure_future(
                            _generate_move_on_directive(
                                old_topic_title=_pre_old_title,
                                new_topic=_next_topic,
                                new_topic_title=_topic_short_title(_next_topic),
                                source=_pre_next_src,
                                level=candidate_level,
                                memory_block="",
                                cross_ref_rule=_pre_cross_ref,
                                client=_eval_openai_client,
                                llm_model=interview_llm_model,
                                usage_sink=_llmgen_llm_usages.append,
                                topic_item=_pre_next_item,
                                prev_answer=(payload.get("answer") or ""),
                                prev_question=_last_interviewer_question,
                                app_id=app_id,
                                candidate_name=candidate_name,
                                is_skill_only=(interview_type == "tech"),
                            )
                        )
                    # When all topics are covered, go straight to WRAP_UP.
                    if _next_topic is None:
                        async with _session_state_lock:
                            _active_topic = "general conversation"
                        _last_question_topic = "general"
                        logger.info(
                            "[AGENT] turn=%d | all topics covered (remaining=%.0fs) -- wrap-up",
                            turn_snapshot, _remaining_total_seconds_now(),
                        )
                        _covered_list = "\n".join(
                            f"  - {k}" for k in sorted(_covered_topic_keys.keys())
                        ) or "  (none)"
                        _directive = (
                            "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                            "DECISION: WRAP_UP\n"
                            "All planned interview topics have been covered. The interview is complete.\n"
                            "[COVERED TOPICS -- DO NOT RE-OPEN ANY OF THESE]\n"
                            f"{_covered_list}\n"
                            "Wrap up the interview naturally and warmly. "
                            "Say something like 'That covers everything I wanted to go through — it was great speaking with you!' "
                            "or 'I think I have a good picture now, thanks so much for your time.' "
                            "Keep it brief and genuine. Then call the end_call tool to close the session.\n"
                            "HARD RULES:\n"
                            "- Do NOT re-open any covered topic.\n"
                            "- Do NOT keep asking questions — the interview is done.\n"
                            "- Call end_call after your closing line."
                        )
                        remove_system_messages_multi(chat_ctx, ("[NEXT_TURN_DIRECTIVE", "[TOPIC_LOCK", "[RECENT_CONTEXT"))
                        chat_ctx.add_message(role="system", content=_directive)
                        logger.info("[AGENT] turn=%d | WRAP_UP directive injected", turn_snapshot)
                        logger.info("[EVAL] turn=%d | releasing LLM gate -- Ishitha will speak now", turn_snapshot)
                        agent._waiting_for_eval = False
                        agent._directive_ready.set()
                        return
                    async with _session_state_lock:
                        _active_topic = _next_topic
                        # Reset the transcript window so probe directives for the new
                        # topic only see this topic's Q&A, not old-topic conversation.
                        _topic_start_line_idx = len(transcript_lines)
                    _next_brief_item = next(
                        (t for t in _interview_brief.topic_pool
                         if _topic_short_key_for_ordering(t.title).lower() == _topic_short_key(_active_topic or "").lower()),
                        None,
                    )
                    logger.info(
                        "[MOVE_ON] turn=%d | %r  ->  %r  (type=%s probe=%s)",
                        turn_snapshot,
                        _topic_short_key(_old_topic or ""),
                        _topic_short_key(_active_topic or ""),
                        _next_brief_item.topic_type if _next_brief_item else "?",
                        ",".join((_next_brief_item.probe_focus or [])[:3]) if _next_brief_item else "-",
                    )
                    logger.info(
                        "[MOVE_ON] covered so far: %s",
                        " | ".join(sorted(_covered_topic_keys.keys())) if _covered_topic_keys else "(none)",
                    )
                    # Derive tag from brief TopicItem for correct question framing
                    _topic_key_lc = _topic_short_key(_active_topic or "").lower()
                    _src = _next_brief_item.tag if _next_brief_item else "RESUME_TOPIC"
                    # Build MOVE_ON directive -- LLM generates it, not agent verbatim script
                    _old_topic_title = _topic_short_title(_old_topic or "")
                    _new_topic_title = _topic_short_title(_active_topic or "")
                    # Cross-reference rule -- keyed on the topic TAG (RESUME_TOPIC /
                    # JD_TOPIC / ROLE_TOPIC). This is the ONLY place that handles how to
                    # treat a topic the candidate may already have touched. The source
                    # framing itself ("we require X" vs "you built X") lives in the
                    # directive's _angle_guide and Ishitha's system prompt -- not here.
                    _topic_type = _next_brief_item.topic_type if _next_brief_item else ""
                    _cross_ref_rule = _build_cross_ref_rule(_src)
                    # Use the pre-fired directive task if it matches the active topic,
                    # otherwise fall back to a fresh call (topic changed mid-flight).
                    _new_topic_key_lc = _topic_short_key(_active_topic or "").lower()
                    _new_topic_item = next(
                        (
                            item for item in _interview_brief.topic_pool
                            if _topic_short_key_for_ordering(item.title).lower() == _new_topic_key_lc
                        ),
                        None,
                    )
                    if (
                        _move_on_directive_task is not None
                        and _pre_next_key == _new_topic_key_lc
                    ):
                        # Task was pre-fired in parallel with eval -- await and validate
                        _prefired_result = await _move_on_directive_task
                        if _prefired_result:
                            _directive = _prefired_result
                            logger.info("[MOVE_ON_LLM] Used pre-fired directive (parallel) for %r", _new_topic_key_lc)
                        else:
                            # Pre-fired task returned empty -- use rule-based fallback directly.
                            # Do NOT attempt a second LLM call; the fallback below handles it.
                            logger.warning("[MOVE_ON_LLM] Pre-fired directive empty for %r — using rule-based fallback", _new_topic_key_lc)
                            _directive = ""
                    else:
                        # Topic changed or no pre-fired task -- generate now
                        if _move_on_directive_task is not None:
                            _move_on_directive_task.cancel()
                        _directive = await _generate_move_on_directive(
                            old_topic_title=_old_topic_title,
                            new_topic=_active_topic or "",
                            new_topic_title=_new_topic_title,
                            source=_src,
                            level=candidate_level,
                            memory_block="",
                            cross_ref_rule=_cross_ref_rule,
                            client=_eval_openai_client,
                            llm_model=analysis_model,
                            usage_sink=_eval_llm_usages_accumulated.append,
                            topic_item=_new_topic_item,
                            prev_answer=_prev_a,
                            prev_question=_last_interviewer_question,
                            app_id=app_id,
                            candidate_name=candidate_name,
                            is_skill_only=(interview_type == "tech"),
                        )
                    # If LLM directive generation failed, use a minimal instruction
                    # that lets the LLM generate a natural question from the TOPIC_LOCK context.
                    # No rule-based template -- LLM jobs the opener.
                    if not _directive:
                        _full_ctx = _active_topic or _new_topic_title
                        if _new_topic_item and _new_topic_item.full_description:
                            _probe_hints = "; ".join((_new_topic_item.probe_focus or [])[:3])
                            _full_ctx = (
                                f"{_new_topic_item.title} — {_new_topic_item.full_description}"
                                + (f" | probe: {_probe_hints}" if _probe_hints else "")
                            )
                        _directive = (
                            "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                            "DECISION: MOVE_ON\n"
                            f"TOPIC YOU ARE LEAVING: {_old_topic_title} -- CLOSED. Do NOT reference it.\n"
                            f"NEW ACTIVE TOPIC: {_new_topic_title}\n"
                            f"FULL CONTEXT: {_full_ctx}\n"
                            f"TOPIC SOURCE: {_src}\n"
                            "Ask ONE specific, natural question to open this topic. "
                            "Use the FULL CONTEXT above to make it concrete and grounded. "
                            "One short acknowledgement first, then the question. "
                            "NEVER say 'Thanks for sharing'. ONE question only."
                            f"{_cross_ref_rule}"
                        )
                    # CRITICAL: Update _last_question_topic NOW (before LLM fires) so eval sees the NEW topic
                    # (_last_question_topic is declared nonlocal at the top of this handler)
                    _last_question_topic = _topic_short_title(_active_topic or "")
                    # Standalone projects must never be attributed to an employer --
                    # add an explicit line to the TOPIC_LOCK (the last system message
                    # the LLM reads before opening) so it cannot say "...at <Company>".
                    _lock_attribution = (
                        "\nThis is a STANDALONE / personal project -- do NOT attach any company or "
                        "employer name to it. NEVER say '...at <Company>' about it.\n"
                        if "[standalone]" in (_active_topic or "").lower() else ""
                    )
                    # SOURCE RULE -- the one short line that tells Ishitha HOW to frame the
                    # opener based on the topic tag. Keyed on the real tag values.
                    # This is what makes "we require so-and-so skill" (JD) differ from
                    # "what did you build" (resume) and "how do you think about X" (role).
                    _is_skill_only_lock = interview_type == "tech"
                    if _src == "JD_TOPIC":
                        _source_lock = (
                            "\nSOURCE: JD REQUIREMENT. The candidate has NOT claimed this on their resume.\n"
                            + ("Ask a cold-reasoning question about the skill itself; accept no exposure gracefully. "
                               "NEVER frame it as 'tell me about a project using X'.\n" if _is_skill_only_lock else
                               "Frame it as 'this role requires X' and ask about their exposure. "
                               "NEVER say 'you mentioned', 'you listed', or 'your resume says'. "
                               "NEVER assume they have used it.\n")
                        )
                    elif _src == "ROLE_TOPIC":
                        _source_lock = (
                            "\nSOURCE: ROLE-DEPTH CHECK. Not on the resume, not in the JD.\n"
                            "Ask about their understanding or approach -- 'how do you think about X' -- "
                            "NEVER 'what was your experience with X'. They may have none.\n"
                        )
                    else:  # RESUME_TOPIC
                        _source_lock = (
                            "\nSOURCE: COMMON SKILL (on resume AND required by JD).\n"
                            "Ask a cold-reasoning question about the skill itself -- fundamentals, mechanics, "
                            "performance, or robustness. NEVER 'tell me about a project where you used X'.\n"
                        ) if _is_skill_only_lock else (
                            "\nSOURCE: RESUME. The candidate has direct experience here.\n"
                            "Ask about what they built, decided, or what broke. NEVER ask 'do you have "
                            "experience with X' or 'why did you work there' -- they did.\n"
                        )
                    _topic_lock_msg = (
                        "[TOPIC_LOCK - CRITICAL INSTRUCTION]\n"
                        "PREVIOUS TOPIC IS CLOSED. DO NOT REFERENCE IT.\n"
                        f"NEW ACTIVE TOPIC: {_new_topic_title}\n"
                        f"FULL CONTEXT: {_active_topic}\n"
                        f"{_lock_attribution}"
                        f"{_source_lock}"
                        "Generate ONE fresh, specific question to open this topic, using the SOURCE framing above "
                        "and the FULL CONTEXT. Do NOT copy any wording from the directive -- create your own. "
                        "Do NOT say 'Tell me about X -- what did you work on there?' -- be more specific. "
                        "Do not mention tools, projects, or details from the previous topic."
                    )
                    _directive, _topic_lock_msg, _trap_generated = await _try_inject_trap_question(
                        _directive, turn_snapshot, lines_snap_eval,
                        topic_lock_msg=_topic_lock_msg, was_move_on=True,
                    )
                    remove_system_messages_multi(chat_ctx, ("[NEXT_TURN_DIRECTIVE", "[TOPIC_LOCK", "[RECENT_CONTEXT"))
                    chat_ctx.add_message(role="system", content=_directive)
                    if _topic_lock_msg:
                        chat_ctx.add_message(role="system", content=_topic_lock_msg)
                    # One-shot guard: tell the next eval cycle to skip itself so
                    # the queued MOVE_ON opener (or trap question) can be spoken first,
                    # before any PROBE directive overwrites it.
                    agent._move_on_opener_pending = True
                    _qr["directive_text"] = _directive  # ponytail: debug report needs the literal injected text
                    if _trap_generated:
                        logger.info("[AGENT] turn=%d | MOVE_ON deferred -- trap question injected instead", turn_snapshot)
                    else:
                        logger.info("[AGENT] turn=%d | MOVE_ON directive injected (LLM) | new_topic=%r", turn_snapshot, _active_topic)
                        logger.info("[MOVE_ON_DIRECTIVE] turn=%d:\n%s", turn_snapshot, _directive)
                else:
                    # -- PROBE -- LLM-jobn directive using TopicItem brief context --
                    _prev_q = (payload.get("question") or "").strip()
                    _prev_a = (payload.get("answer") or "").strip()
                    _topic_follow_ups = int((_new_topic_state_dict or {}).get("follow_up_turns", 0) or 0)
                    _depth_topic_key_lc = _topic_short_key(_active_topic or "").lower()
                    # Fetch TopicItem for the active topic from the brief
                    _probe_brief_item = next(
                        (t for t in _interview_brief.topic_pool
                         if _topic_short_key_for_ordering(t.title).lower() == _depth_topic_key_lc),
                        None,
                    )
                    # Build the conversation thread for this topic from the live
                    # transcript. Scope to only lines since the current topic began
                    # (_topic_start_line_idx) so old-topic Q&A never bleeds into the
                    # probe context after a MOVE_ON. Take at most 8 lines.
                    _topic_thread_lines = (
                        lines_snap_eval[_topic_start_line_idx:][-8:]
                        if lines_snap_eval else []
                    )
                    _signals_history_this_topic = list(
                        (_new_topic_state_dict or {}).get("signals_fired", []) or []
                    )
                    _directive = _build_probe_directive(
                        signal=_eval_signal,
                        signal_reason=_eval_signal_reason,
                        level=int(payload.get("level") or candidate_level or 2),
                        active_topic=_active_topic or "",
                        topic_item=_probe_brief_item,
                        prev_question=_prev_q,
                        prev_answer=_prev_a,
                        topic_follow_ups=_topic_follow_ups,
                        topic_denied=_topic_short_key(_active_topic or "").lower() in _covered_topic_keys,
                        coverage_memory="",
                        asked_questions_log=list(_asked_questions_log),
                        topic_transcript=_topic_thread_lines,
                        signals_history=_signals_history_this_topic,
                        probe_rotation_index=_rotation_idx,
                        interview_type=interview_type,
                        recent_question_patterns=render_recent_question_patterns(_recent_question_patterns),
                        declined_facts=render_declined_facts(_declined_facts_log),
                        cross_cutting_signal=_eval_cross_cutting,
                        topic_score_history=list(_topic_score_histories.get(
                            re.sub(r"[^a-z0-9]+", " ", (_active_topic or "").lower()).strip(), []
                        )),
                    )
                    if _teach_back_used:
                        # PROBLEM 3 hard cap: the no-jargon teach-back construction may
                        # fire AT MOST ONCE across the entire interview, not once per
                        # topic. The stage signals' own per-signal pivot (e.g.
                        # mechanism_shallow's directive in probe.py) only knows about
                        # repeats on THE SAME concept -- this catches the cross-topic
                        # reuse the transcript showed (used for list mutability, then
                        # again for embeddings, attention, retrievers).
                        _directive += (
                            "\n\nNO-JARGON TEACH-BACK -- ALREADY USED (HARD BAN):\n"
                            "The 'explain it with no jargon / to someone who's never touched it' "
                            "construction has already been used once this interview. Do NOT use it "
                            "again in any form, regardless of topic. If the probe directive above "
                            "suggests it, pivot instead to a failure-case, mechanism-collapse, or "
                            "applied-scenario question that tests the same gap.\n"
                        )
                    _directive, _, _trap_generated = await _try_inject_trap_question(
                        _directive, turn_snapshot, lines_snap_eval,
                    )
                    remove_system_messages_multi(chat_ctx, ("[NEXT_TURN_DIRECTIVE", "[TOPIC_LOCK", "[RECENT_CONTEXT"))
                    chat_ctx.add_message(role="system", content=_directive)
                    _qr["directive_text"] = _directive  # ponytail: debug report needs the literal injected text
                    if _scoring_topic_log and _scoring_topic_log != "?":
                        _ts_for_rotation = _topic_states.get(_normalize_topic_key(_scoring_topic_log))
                        if isinstance(_ts_for_rotation, dict):
                            # Item 3: only advance the rotation index when the current
                            # sub-concept's gap actually resolved, or 2 consecutive
                            # failed probes on it already happened (should_rotate_
                            # subconcept, computed in eval.py from this turn's signal).
                            # Otherwise hold so the NEXT probe stays on the SAME
                            # sub-concept instead of pivoting to an unrelated one.
                            if _should_rotate_subconcept:
                                _ts_for_rotation["probe_rotation_index"] = _rotation_idx + 1
                    _sub_concepts_all = list((_probe_brief_item.probe_focus or [])) if _probe_brief_item else []
                    _sub_concept_this_turn = (
                        _sub_concepts_all[_rotation_idx % len(_sub_concepts_all)]
                        if _sub_concepts_all else "-"
                    )
                    logger.info(
                        "[PROBE] turn=%d | signal=%s | topic=%r | sat=%.1f/%.1f | sub_concept=%r (idx=%d of %d) | brief_avoid=%s",
                        turn_snapshot, _eval_signal or "none", _scoring_topic_log,
                        _sat_after, _sat_thresh,
                        _sub_concept_this_turn, _rotation_idx, len(_sub_concepts_all),
                        ",".join((_probe_brief_item.probe_avoid or [])[:2]) if _probe_brief_item else "-",
                    )
                    logger.debug("[PROBE_DIRECTIVE] turn=%d:\n%s", turn_snapshot, _directive)
                logger.info("[EVAL] turn=%d | releasing LLM gate -- Ishitha will speak now", turn_snapshot)
                agent._waiting_for_eval = False
                agent._directive_ready.set()
        except Exception as e:
            logger.error("[EVAL] _process_user_conversation_item failed turn=%d: %s", turn_snapshot, e, exc_info=True)
        finally:
            # Guarantees the gate is released for this turn no matter which of the
            # early `return`s above was taken (STT-noise discard, not-EOT skip, etc.).
            # Those returns don't go through the normal-completion or exception release
            # above, and previously left llm_node's gate closed with nothing to open it
            # except its own timeout -- i.e. the source of the "silent for 10-15s" bug.
            # This makes the gate release unconditional and turn-scoped instead.
            if agent._waiting_for_eval and agent._pending_eval_turn == turn_snapshot:
                agent._waiting_for_eval = False
                agent._directive_ready.set()
    _FIXED_WARMUP_TEXT = (
        "Right, so this'll be a fairly casual conversation — I'll be asking you a few questions "
        "about the role. Are you all set to begin?"
        if _is_demo_session else
        "Right, so this'll be a fairly casual conversation — I'll be asking you a few questions "
        "based on your resume and the role. Are you all set to begin?"
    )
    async def _handle_completed_user_turn(_turn_ctx, new_message) -> None:
        # Interview already ended (time limit or inactivity timeout) -- the closing
        # line was already spoken and termination signaled. Speech that arrives late
        # (e.g. the candidate replies right as/after the goodbye plays) must not be
        # evaluated or trigger a new question; the session is shutting down.
        if interview_marked_finished or disconnect_event.is_set():
            logger.info("[USER_TURN] ignored -- interview already marked finished")
            return
        # Flux's native end-of-turn detection (eot_threshold/eot_timeout_ms, see
        # agent_runtime_utils.AgentConfig) owns turn boundaries. A candidate's mid-thought
        # pause is Flux's problem to wait out at the STT layer, not something to patch
        # around here with an application-level debounce/merge buffer -- that just adds
        # latency to every turn and still fails on pauses longer than the buffer window.
        async with _user_turn_lock:
            await _handle_completed_user_turn_locked(_turn_ctx, new_message)
    async def _handle_completed_user_turn_locked(_turn_ctx, new_message) -> None:
        nonlocal _answer_received_at, _candidate_turn_since_last_assistant, \
            warmup_complete, _interview_has_started, _last_evaluated_turn_snapshot, \
            is_agent_speaking, first_agent_turn_committed_at
        content = (getattr(new_message, "text_content", "") or "").strip()
        if not content:
            logger.debug("[USER_TURN] completed turn had no text; releasing gate without reply directive")
            agent._waiting_for_eval = False
            agent._directive_ready.set()
            return
        _answer_received_at = time.perf_counter()
        _candidate_turn_since_last_assistant = True
        if greeting_delivered_at is None:
            logger.info("[GATE] Candidate spoke before greeting  blocked")
            return
        turn_snapshot = turn_count
        _is_merge_pass = False
        if turn_snapshot == _last_evaluated_turn_snapshot:
            # LiveKit/Flux fired a second end-of-turn for the same candidate turn (e.g.
            # a pause mid-answer was detected as EOT, then more speech followed before
            # Ishitha replied). turn_count only advances on assistant turns.
            #
            # During real interview questions (turn_snapshot > 2, warmup already done),
            # eval only fires once per turn -- previously this repeat fragment was
            # dropped outright, so eval only ever scored the FIRST (often short,
            # cut-off) fragment. Merge it into the buffered text and re-run eval on
            # the complete answer instead of silently losing the rest of it.
            #
            # During warmup/turn-1 (fixed scripted replies, session.say() side effects,
            # gate/directive bookkeeping), re-running that logic on every repeat EOT
            # would double-speak/double-inject -- keep the original drop-and-return
            # there; a short warmup answer is inconsequential compared to double TTS.
            if warmup_complete and turn_snapshot > 2:
                _prior = _pending_turn_text.get(turn_snapshot, "")
                merged = f"{_prior} {content}".strip() if _prior and not content.startswith(_prior) else content
                _pending_turn_text[turn_snapshot] = merged
                logger.info(
                    "[USER_TURN] repeat end-of-turn for turn=%d merged (text=%r)",
                    turn_snapshot, merged[:80],
                )
                content = merged
                _is_merge_pass = True
            else:
                logger.info(
                    "[USER_TURN] duplicate end-of-turn for turn=%d ignored (text=%r)",
                    turn_snapshot, content[:80],
                )
                agent._waiting_for_eval = False
                agent._directive_ready.set()
                return
        else:
            _pending_turn_text[turn_snapshot] = content
        _last_evaluated_turn_snapshot = turn_snapshot
        # Turn 1 = candidate's reply to the greeting. Deliver fixed warmup via session.say()
        # so the LLM never generates this line (it was producing unpredictable filler).
        if turn_snapshot == 1 and not warmup_complete:
            agent._waiting_for_eval = True
            agent._pending_eval_turn = turn_snapshot
            agent._directive_ready.clear()
            await _process_user_conversation_item(content, "user", turn_snapshot, is_final_eot=True)
            _append_with_elapsed("Candidate", content)
            # If the candidate reciprocated the "how are you doing?" greeting (asked
            # Ishitha back), a bare scripted warmup line ignoring that reads as rude.
            # Prepend a short fixed reciprocal reply -- still scripted (no LLM filler
            # variance), just acknowledges the question was heard.
            _content_lc_greet = content.lower()
            _asked_back = bool(re.search(r"\b(and you|how about you|you\?|how are you|and yourself)\b", _content_lc_greet))
            _warmup_text_to_say = (
                ("I'm doing well, thanks for asking! " + _FIXED_WARMUP_TEXT)
                if _asked_back else _FIXED_WARMUP_TEXT
            )
            try:
                # Same retry pattern as the greeting (session_loop_start above) --
                # Sarvam's WS can drop the very first synthesis call right after
                # the greeting's own WS just closed, with session.say() returning
                # cleanly despite no audio reaching the candidate.
                for _w_attempt in range(3):
                    try:
                        is_agent_speaking = False
                        await session.say(_warmup_text_to_say, allow_interruptions=False)
                        if not is_agent_speaking and first_agent_turn_committed_at is None:
                            raise RuntimeError("session.say() returned with no audible speech detected")
                        break
                    except Exception as _w_retry_err:
                        if _w_attempt == 2:
                            raise
                        logger.warning(
                            "[WARMUP] session.say() attempt %d failed, retrying: %s",
                            _w_attempt + 1, _w_retry_err,
                        )
                        await asyncio.sleep(0.5)
                _append_with_elapsed("Interviewer", _warmup_text_to_say)
                logger.info("[WARMUP] Fixed warmup delivered via session.say()")
            except Exception as _w_err:
                logger.warning("[WARMUP] session.say() warmup failed after retries: %s", _w_err)
                # session.say() never delivered the assistant message, so
                # on_conversation_item_added's turn_count==2 branch will never fire to
                # close the gate for us -- release it here so the LLM isn't stuck
                # waiting the full 11s timeout for nothing.
                agent._waiting_for_eval = False
                agent._directive_ready.set()
            finally:
                # Do NOT touch agent._waiting_for_eval / _directive_ready here.
                # await session.say() above synchronously jobs on_conversation_item_added
                # for the assistant message before returning, which (since turn_count
                # reaches 2, not warmup_complete) is the authoritative gate-closer for
                # "wait for the candidate's warmup answer" (see the turn_count==2 branch
                # below). Unconditionally releasing the gate here raced with and undid
                # that close, letting the LLM generate a real interview question before
                # the candidate ever answered the warmup prompt.
                remove_system_messages(chat_ctx, "[PHASE_STATUS]")
                chat_ctx.add_message(
                    role="system",
                    content=(
                        "[PHASE_STATUS -- DO NOT SAY ALOUD]\n"
                        "GREETING: DONE. WARMUP QUESTION: ALREADY ASKED — do not repeat it.\n"
                        "Wait silently for candidate's answer. DO NOT say anything until [NEXT_TURN_DIRECTIVE] arrives."
                    ),
                )
            return
        # Dynamic warmup (Option B): LLM decides readiness, not a fixed turn count.
        # Warmup ends when the candidate signals they are ready to begin.
        # We detect this by checking their response for readiness markers.
        # This fires from turn 2 onward -- greeting (turn 1) is never a readiness signal.
        # Close the gate immediately so llm_node cannot race ahead and generate the
        # next turn before we've decided completing_warmup and injected the directive.
        if not warmup_complete:
            agent._waiting_for_eval = True
            agent._pending_eval_turn = turn_snapshot
            agent._directive_ready.clear()
        _warmup_readiness_markers = (
            "yes", "yeah", "yep", "ready", "let's go", "lets go", "go ahead",
            "sure", "ok", "okay", "absolutely", "of course", "let's begin",
            "lets begin", "start", "begin", "fire away", "go on", "alright",
        )
        _content_lc = content.strip().lower()
        # Match markers as whole words/phrases, not substrings
        _candidate_signals_ready = (
            turn_snapshot >= 2
            and not warmup_complete
            and any(re.search(r'\b' + m + r'\b', _content_lc) for m in _warmup_readiness_markers)
        )
        # ponytail: candidate already got one re-prompt (turn>=3) and gave another
        # substantive reply (not silence/noise) without an explicit marker word --
        # e.g. "I'm doing great, how about you?" -- treat that as implicit readiness
        # instead of re-prompting forever. The AI's own question ("are you set to
        # begin?") makes any real answer an implicit yes.
        _candidate_gave_substantive_reply = (
            turn_snapshot >= 3
            and not warmup_complete
            and len(_content_lc.split()) >= 3
        )
        completing_warmup = _candidate_signals_ready or _candidate_gave_substantive_reply
        logger.debug(
            "[USER_TURN] completed turn=%d words=%d text=%r signals_ready=%s",
            turn_snapshot,
            len(content.split()),
            content[:100],
            completing_warmup,
        )
        await _process_user_conversation_item(
            content, "user", turn_snapshot, is_final_eot=True, is_merge_rerun=_is_merge_pass,
        )
        if completing_warmup:
            warmup_complete = True
            _first_interview_question_asked = False
            _interview_has_started = True
            logger.info("[WARMUP] warmup_complete=True at turn=%d (candidate signalled readiness)", turn_snapshot)
            remove_system_messages(chat_ctx, "[WARMUP PHASE]")
            remove_system_messages(chat_ctx, "[PHASE_STATUS]")
            # Fix #1: Inject the first interview question directive immediately -- no intermediate acknowledgement.
            # The LLM will open with the anchor topic on the next turn.
            chat_ctx.add_message(role="system", content=interview_directive_cached)
            logger.info("[WARMUP] First interview directive injected at turn=%d | ready to ask anchor topic", turn_snapshot)
            agent._waiting_for_eval = False
            agent._directive_ready.set()
        elif turn_snapshot == 2 and len(_content_lc.split()) <= 2:
            # Candidate's first reply to warmup was near-empty ("Hello?", "What?") --
            # this is the signature of warmup audio never having played (see
            # session.say() delivery-check above), not a real answer. Replay the
            # fixed warmup line directly instead of burning a turn on an LLM
            # re-prompt, which is what previously made "turn 3" land as a second
            # warmup exchange instead of the first real interview question.
            logger.info("[WARMUP] turn=%d near-empty reply (%r) -- replaying fixed warmup line", turn_snapshot, content[:40])
            try:
                is_agent_speaking = False
                await session.say(_FIXED_WARMUP_TEXT, allow_interruptions=False)
            except Exception as _replay_err:
                logger.warning("[WARMUP] warmup replay failed: %s", _replay_err)
            _append_with_elapsed("Interviewer", _FIXED_WARMUP_TEXT)
            remove_system_messages(chat_ctx, "[PHASE_STATUS]")
            chat_ctx.add_message(
                role="system",
                content=(
                    "[PHASE_STATUS -- DO NOT SAY ALOUD]\n"
                    "GREETING: DONE. WARMUP QUESTION: ALREADY ASKED — do not repeat it.\n"
                    "Wait silently for candidate's answer. DO NOT say anything until [NEXT_TURN_DIRECTIVE] arrives."
                ),
            )
            agent._waiting_for_eval = False
            agent._directive_ready.set()
        elif not warmup_complete:
            # Candidate answered the warmup question but didn't signal readiness yet
            # (e.g. "I'm doing great" instead of "yes"/"ready"). Ishitha should ask a
            # natural follow-up / re-confirm readiness rather than staying silent --
            # release the gate we closed above so the LLM can respond to what they said.
            remove_system_messages(chat_ctx, "[PHASE_STATUS]")
            chat_ctx.add_message(
                role="system",
                content=(
                    "[PHASE_STATUS -- DO NOT SAY ALOUD]\n"
                    "GREETING: DONE. WARMUP QUESTION: ALREADY ASKED.\n"
                    "The candidate replied but did not clearly confirm they're ready to begin.\n"
                    "React briefly and naturally to what they said, then ask if they're ready to start.\n"
                    "Do NOT re-introduce yourself or repeat the full warmup question verbatim."
                ),
            )
            logger.info("[WARMUP] Candidate answered but did not signal readiness at turn=%d — re-prompting", turn_snapshot)
            agent._waiting_for_eval = False
            agent._directive_ready.set()
    agent._completed_user_turn_handler = _handle_completed_user_turn
    #  TRANSCRIPT EVENT HANDLER
    # Registered on session "conversation_item_added"  fires for BOTH Ishitha
    # (assistant) and Candidate (user) turns. Handles:
    #    Transcript persistence for both speakers
    #    turn_count / question tracking for assistant turns
    #    Warmup gate management
    # User-turn evaluation is handled by InterviewAgent.on_user_turn_completed.
    # 
    @session.on("conversation_item_added")
    def on_conversation_item_added(event) -> None:
        nonlocal turn_count, _last_interviewer_question, _question_pending_timestamp, \
            _candidate_turn_since_last_assistant, warmup_complete, \
            _answer_received_at, _first_interview_question_asked, \
            _last_question_topic, _teach_back_used
        try:
            item = event.item
            role = getattr(item, "role", None)
            content = (item.text_content or "").strip()
            if not role:
                return
            #  ASSISTANT TURN
            if role == "assistant":
                if not _candidate_turn_since_last_assistant:
                    # Hard block -- LLM fired twice in a row without a candidate reply.
                    # This happens when STT echoes Ishitha's greeting back as a candidate
                    # fragment, triggering a second LLM generation before the first one
                    # finished. During warmup this creates the greeting-repeat loop seen
                    # in transcript (AI 0:23, 0:27, 0:32 all saying warmup phrases).
                    logger.warning("[TURN_GUARD] Blocking consecutive assistant turn (no candidate reply since last AI)")
                    return
                if not llm_spoke_event.is_set():
                    llm_spoke_event.set()
                clean_content = polish_candidate_facing_text(content)
                if not clean_content or clean_content == "<wait for response>":
                    return
                # Track last question for eval engine -- only for real interview turns.
                # Nudge messages (session.say() scripted inactivity prompts) must never
                # count as interview questions -- they don't contain a question for the
                # candidate, they are just "Take your time" filler. Detect them by the
                # inactivity_nudge_speaking flag set by _deliver_nudge().
                if inactivity_nudge_speaking:
                    logger.debug("[TURN_GUARD] Skipping nudge message — not an interview turn")
                    return
                # Greeting and warmup-confirmation assistant messages must never overwrite
                # this because their text ("How are you doing?", "Are you all set to begin?")
                # would pollute eval context. warmup_complete alone is the right gate: it's
                # already True by the time this handler runs for the first interview
                # question (set synchronously in _handle_completed_user_turn_locked before
                # the LLM generates that question), so it correctly excludes greeting/warmup
                # messages without an extra turn_count check. The previous `turn_count > 2`
                # check used the pre-increment value (turn_count is bumped further below)
                # and was off by one, so the very first interview question was never tracked
                # as _last_interviewer_question -- silently skipping turn 3's scoring.
                _is_interview_turn = warmup_complete
                # Save Ishitha's line to transcript
                _append_with_elapsed("Interviewer", clean_content)
                if _is_interview_turn:
                    # Fix #2: Reset nudge flags when a new question is asked.
                    # This ensures nudges can fire independently for each question, not just the first.
                    nonlocal inactivity_nudge_sent_for_current_prompt, inactivity_warning_sent_for_current_prompt, inactivity_end_sent_for_current_prompt, awaiting_candidate_since
                    inactivity_nudge_sent_for_current_prompt = False
                    inactivity_warning_sent_for_current_prompt = False
                    inactivity_end_sent_for_current_prompt = False
                    awaiting_candidate_since = time.monotonic()
                    logger.debug("[NUDGE] Nudge flags reset for new question at turn=%d", turn_count)
                    # Store the FULL interviewer turn verbatim -- no sentence extraction,
                    # no length cap -- so the debug report shows the complete question.
                    _last_interviewer_question = clean_content.strip()
                    # H4 fix: validate the LLM actually asked about the expected topic
                    # before committing _last_question_topic. If it clearly switched to
                    # another known topic, or is asking a closing question, score under
                    # "general" so saturation for the wrong topic is not corrupted.
                    _expected_topic_title = _topic_short_title(_active_topic or "")
                    _q_lower_check = _last_interviewer_question.lower()
                    _expected_key = re.sub(r"[^a-z0-9]+", " ", _expected_topic_title.lower()).strip()
                    # TOPIC_GUARD: confirm the question is actually ABOUT the active topic
                    # before scoring the answer against it. Follow-ups can omit the title
                    # ("you mentioned...", "how did you..."), and project questions often
                    # mention skills/tools used in that project. Treat those as still on
                    # the project unless the question names a different resume topic.
                    _expected_brief_item = next((t for t in _interview_brief.topic_pool if _topic_short_key_for_ordering(t.title) == _topic_short_key(_active_topic or "")), None)
                    _expected_is_skill = _expected_brief_item is not None and _expected_brief_item.tag != 'RESUME_TOPIC'
                    _closing_question = bool(re.search(
                        r"\b(before we wrap up|wrap up|before we finish|anything else|anything you wish|most proud|final question)\b",
                        _q_lower_check,
                    ))
                    _expected_tokens = {
                        t for t in _expected_key.split()
                        if len(t) >= 3 and t not in _OVERLAP_STOPWORDS
                    }
                    # Normalize the question the same way for token matching
                    # (strips hyphens/punctuation so "multi-channel" → "multi channel")
                    _q_normalized = re.sub(r"[^a-z0-9]+", " ", _q_lower_check)
                    _q_mentions_expected = bool(_expected_tokens) and any(
                        t in _q_normalized for t in _expected_tokens
                    )
                    # Does the question clearly name a DIFFERENT pooled topic?
                    _drifted_to_other = False
                    for _other in _topic_pool:
                        _other_key = _topic_short_key(_other)
                        _other_brief = next((t for t in _interview_brief.topic_pool if _topic_short_key_for_ordering(t.title) == _other_key), None)
                        _other_is_skill = _other_brief is not None and _other_brief.tag != 'RESUME_TOPIC'
                        if _other_is_skill and not _expected_is_skill:
                            # Tool/skill names are allowed inside project questions.
                            # They should not steal ownership from the active project.
                            continue
                        _ok = re.sub(r"[^a-z0-9]+", " ", _topic_short_title(_other).lower()).strip()
                        if not _ok or _ok == _expected_key:
                            continue
                        _other_tokens = {
                            t for t in _ok.split()
                            if len(t) >= 4 and t not in _OVERLAP_STOPWORDS
                        }
                        if _other_tokens and all(t in _q_normalized for t in _other_tokens):
                            _drifted_to_other = True
                            break
                    # Follow-up: no explicit topic name, no other topic named, but the
                    # wording clearly continues the prior answer. This catches long
                    # questions like "you mentioned collecting data..." that were being
                    # mislabeled as general.
                    _looks_like_context_followup = (
                        not _q_mentions_expected
                        and not _drifted_to_other
                        and any(marker in _q_normalized for marker in (
                            "you mentioned", "you said", "when you say", "when you mentioned",
                            "how did you", "what did you", "what was", "walk me through",
                            "tell me more", "can you share", "approximately", "if you were to",
                            "what kind of", "what were the", "what were you",
                            "what exactly", "tell me about", "can you explain",
                        ))
                    )
                    # Pronoun follow-up: short question, no explicit topic name, no other
                    # topic named -- treat as still-on-topic.
                    _looks_like_pronoun_followup = (
                        not _q_mentions_expected
                        and not _drifted_to_other
                        and len(_q_normalized.split()) <= 18
                    )
                    _topic_confirmed = (
                        not _closing_question
                        and (not _expected_key                  # nothing to check yet
                        or not _first_interview_question_asked  # opening question, always accept
                        or (_q_mentions_expected and not _drifted_to_other)
                        or _looks_like_context_followup
                        or _looks_like_pronoun_followup
                        )
                    )
                    if _topic_confirmed and not _drifted_to_other:
                        _last_question_topic = _expected_topic_title
                    else:
                        # LLM went off-script (named a different topic, or drifted) --
                        # score under a neutral label so the wrong topic's saturation is
                        # not corrupted. Log so it's visible in traces.
                        _last_question_topic = "general"
                        logger.warning(
                            "[TOPIC_GUARD] question drifted off expected topic %r "
                            "(drifted_to_other=%s) -- scoring as 'general' (question=%r)",
                            _expected_topic_title, _drifted_to_other,
                            _last_interviewer_question[:80],
                        )
                    logger.debug("[QUESTION_TRACK] turn=%d last_q=%r topic=%r", turn_count, _last_interviewer_question[:60], _last_question_topic)
                    # MOVE_ON / secondary opener has now been DELIVERED (the assistant's
                    # new-topic question was just tracked here). Clear the one-shot skip
                    # flag NOW so the candidate's ANSWER to this opener is scored normally
                    # instead of being discarded. (Previously the flag was consumed when
                    # the next user answer arrived, which threw away the opener's answer --
                    # e.g. the Zapier "No, I didn't use it" reply was lost.)
                    if agent._move_on_opener_pending:
                        agent._move_on_opener_pending = False
                        logger.info(
                            "[MOVE_ON] opener delivered (turn=%d) -- cleared opener_pending; next answer will be scored",
                            turn_count,
                        )
                    # Track asked questions for duplicate prevention (keep last 6).
                    # EC-3: _asked_questions_log is now a deque(maxlen=6) so append
                    # is a single atomic operation -- no separate pop() needed, no
                    # IndexError possible, no lock required in this sync callback.
                    if _last_interviewer_question and _first_interview_question_asked:
                        _asked_questions_log.append(_last_interviewer_question[:120])
                        # Per-topic question buffer -- snapshotted into CoverageRecord on MOVE_ON
                        # so each question becomes a GLOBAL forbidden question (Fix: cross-topic
                        # duplicate-question prevention). Skip secondary/soft "general" phases.
                        if _last_question_topic not in ("general", "general conversation", None, ""):
                            _current_topic_questions.append(_last_interviewer_question[:120])
                        # PROBLEM 3 fix: record the real opener+construction fingerprint so
                        # RECENT_QUESTION_PATTERNS is no longer permanently "(none yet)", and
                        # latch the one-shot no-jargon-teachback flag the moment it's actually
                        # spoken (not just requested by a directive that might get rephrased).
                        # No signal is threaded in here -- this callback (on_conversation_item_added)
                        # runs independently of _process_user_conversation_item's local _eval_signal,
                        # and the construction classifier doesn't need it to do its job.
                        record_question_pattern(_recent_question_patterns, _last_interviewer_question, None)
                        if is_no_jargon_teachback(_last_interviewer_question):
                            _teach_back_used = True
                    # First interview question just fired -- seal the opening move so the LLM
                    # cannot re-ask it. The base system prompt says "Open by asking about X"
                    # which conflicts with PROBE directives on subsequent turns. This message
                    # overrides that instruction once the opener has been delivered.
                    if not _first_interview_question_asked:
                        _first_interview_question_asked = True
                        remove_system_messages(chat_ctx, "[PHASE_STATUS]")
                        chat_ctx.add_message(
                            role="system",
                            content=(
                                "[PHASE_STATUS -- DO NOT SAY ALOUD]\n"
                                "GREETING: DONE. WARMUP: DONE. OPENING QUESTION: DONE.\n"
                                f"You already asked: \"{_last_interviewer_question[:120]}\"\n"
                                "DO NOT repeat this opening question. DO NOT re-introduce yourself or re-greet.\n"
                                "CURRENT PHASE: INTERVIEW IN PROGRESS -- follow [NEXT_TURN_DIRECTIVE] exactly."
                            ),
                        )
                        logger.info("[PHASE_STATUS] Opening question sealed: %r", _last_interviewer_question[:80])
                        # Pre-clear the LLM gate NOW -- Ishitha just delivered the first interview
                        # question. The next event will be Vamsi answering (Turn 3 candidate turn).
                        # Without this pre-clear, llm_node fires the moment Turn 3 STT arrives
                        # (gate was still SET from warmup), generating BEFORE Vamsi's answer is
                        # in chat_ctx, causing Ishitha to repeat the same opening question.
                        # Clearing here ensures the gate is already closed when Turn 3 fires,
                        # so the sync gate fast-path (which sets it) runs after the answer lands.
                        agent._waiting_for_eval = True
                        agent._pending_eval_turn = turn_count + 1
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
                            _covered_topic_keys.record(
                                _cq.raw[:80],
                                source=CoverageSource.CUSTOM_Q,
                            )
                            logger.info("[FLOW] Custom Q %d/%d covered: '%s'", _cqi + 1, len(_custom_questions), _cq.raw[:80])
                # Increment turn count. Reaction-time clock starts when the AI actually
                # finishes speaking (agent_state_changed -> "listening"), not here --
                # this point is only when the question TEXT is committed, before TTS
                # has played it out. See on_agent_state_changed below.
                _question_pending_timestamp = True
                _candidate_turn_since_last_assistant = False
                turn_count += 1
                if not warmup_complete and turn_count == 2:
                    # Ishitha just said "Are you ready to begin?" -- gate the LLM so it
                    # waits for the candidate's answer. The warmup completion handler
                    # will inject the warmup-done directive and release the gate.
                    agent._waiting_for_eval = True
                    agent._pending_eval_turn = turn_count
                    agent._directive_ready.clear()
                    # Update PHASE_STATUS so if LLM fires again before candidate replies
                    # it knows the warmup question is ALREADY spoken -- don't repeat it.
                    remove_system_messages(chat_ctx, "[PHASE_STATUS]")
                    chat_ctx.add_message(
                        role="system",
                        content=(
                            "[PHASE_STATUS -- DO NOT SAY ALOUD]\n"
                            "GREETING: DONE. WARMUP QUESTION: ALREADY ASKED — do not repeat it.\n"
                            "You already asked if they are ready. Wait silently for their answer.\n"
                            "DO NOT say anything until [NEXT_TURN_DIRECTIVE] arrives."
                        ),
                    )
                    logger.info("[LLM_GATE] Gated after warmup readiness check — waiting for candidate answer")
                elif _is_interview_turn:
                    agent._waiting_for_eval = True
                    agent._pending_eval_turn = turn_count
                    agent._directive_ready.clear()
                    logger.info("[LLM_GATE] Pre-cleared after interview question delivery")
                reset_inactivity_clock(start_waiting=True)
                logger.debug(
                    "[NUDGE] Inactivity countdown armed after assistant prompt delivery"
                )
                logger.info("TURN %d | phase=%s", turn_count, "interview" if warmup_complete else "warmup")
                # Note: Transcript and answer_scores are now persisted after EVERY eval turn (async).
                # See _process_user_conversation_item() for per-turn async persistence.
                # This periodic save is kept as a safety net for orphaned records in edge cases.
                # Normally turned off by default to avoid redundant DB writes.
            #  USER TURN
            elif role == "user":
                # User items can be emitted for finalized STT chunks before the
                # completed user turn is stable. Evaluation runs only from
                # InterviewAgent.on_user_turn_completed so late fragments are not
                # dropped or scored prematurely.
                reset_inactivity_clock(start_waiting=False)
                logger.debug("[NUDGE] Candidate speech observed; inactivity countdown cleared")
                logger.debug("[USER_TURN] fragment observed; waiting for completed-turn hook")
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
    inactivity_warning_sent_for_current_prompt = False
    inactivity_end_sent_for_current_prompt = False
    inactivity_nudge_speaking = False
    first_agent_turn_committed_at: float | None = None
    llm_spoke_event = asyncio.Event()
    greeting_delivered_at: float | None = None
    def reset_inactivity_clock(start_waiting: bool, preserve_nudge_flags: bool = False) -> None:
        nonlocal awaiting_candidate_response, awaiting_candidate_since, \
            inactivity_nudge_sent_for_current_prompt, \
            inactivity_warning_sent_for_current_prompt, inactivity_end_sent_for_current_prompt
        awaiting_candidate_response = start_waiting
        if start_waiting:
            if preserve_nudge_flags and awaiting_candidate_since is not None:
                pass
            else:
                awaiting_candidate_since = time.monotonic()
        else:
            awaiting_candidate_since = None
        if not preserve_nudge_flags:
            inactivity_nudge_sent_for_current_prompt = False
            inactivity_warning_sent_for_current_prompt = False
            inactivity_end_sent_for_current_prompt = False
        if start_waiting:
            logger.debug("[NUDGE] Inactivity clock started (awaiting candidate response)")
        else:
            logger.debug("[NUDGE] Inactivity clock cleared")
    @session.on("user_state_changed")
    def on_user_state_changed(event):
        nonlocal is_candidate_speaking, _candidate_started_speaking_at
        if event.new_state == "speaking":
            is_candidate_speaking = True
            # First speech-start after a question is the true reaction-time endpoint --
            # response_latency_sec must measure "time to start answering", not "time to
            # finish answering" (which is what end-of-turn timestamps give you).
            if _question_asked_at > 0 and _candidate_started_speaking_at < _question_asked_at:
                _candidate_started_speaking_at = time.perf_counter()
        elif event.new_state == "listening":
            is_candidate_speaking = False
            # Restart the inactivity clock from 0 every time the candidate stops speaking.
            # This ensures they get a full 10 seconds of silence before a nudge fires.
            if awaiting_candidate_response:
                reset_inactivity_clock(start_waiting=True, preserve_nudge_flags=False)
    _last_speaking_turn_was_nudge = False
    @session.on("agent_state_changed")
    def on_agent_state_changed(event):
        nonlocal is_agent_speaking, first_agent_turn_committed_at, _last_speaking_turn_was_nudge, \
            _question_asked_at, _question_asked_at_wall_ms, _question_pending_timestamp
        if event.new_state == "speaking":
            is_agent_speaking = True
            if inactivity_nudge_speaking:
                _last_speaking_turn_was_nudge = True
                logger.debug("[NUDGE] Scripted inactivity prompt speaking; preserving countdown")
            else:
                _last_speaking_turn_was_nudge = False
                reset_inactivity_clock(start_waiting=False)
                logger.debug("[NUDGE] AI started speaking; old inactivity countdown cleared")
        elif event.new_state == "listening":
            is_agent_speaking = False
            if first_agent_turn_committed_at is None:
                first_agent_turn_committed_at = time.monotonic()
            # Reaction-time clock starts HERE -- the instant TTS playback of the
            # question actually finishes, not when the question text was committed.
            # Skip scripted nudges; only real questions start the clock.
            if _question_pending_timestamp and not _last_speaking_turn_was_nudge:
                _question_asked_at = time.perf_counter()
                _question_asked_at_wall_ms = int(time.time() * 1000)
                _question_pending_timestamp = False
            # Start inactivity countdown immediately when AI finishes speaking.
            # If the turn that just ended was a nudge, preserve the sent-flags so
            # the schedule escalates (12s -> 20s -> 30s -> 40s) instead of the same
            # nudge re-firing every ~12s forever.
            reset_inactivity_clock(start_waiting=True, preserve_nudge_flags=_last_speaking_turn_was_nudge)
            logger.debug("[NUDGE] AI finished speaking; inactivity countdown started")
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
            f"[TIMEOUT] No candidate joined room for app {app_id} within 300s. Exiting without recording NO_SHOW to allow candidate to retry hardware check."
        )
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
            "[FLOW] Session started  candidate=%s role=%s level=%s tts=%s llm=%s boot=%dms",
            candidate_name, job_title, candidate_level,
            org_tts_provider, interview_llm_model,
            int((time.perf_counter() - entry_started_at) * 1000),
        )
        # Mark as started in DB while greeting starts immediately.
        if _is_demo_session:
            spawn_background_task(mark_demo_session_started(app_id), "mark_demo_session_started")
        else:
            spawn_background_task(mark_interview_started(app_id), "mark_interview_started")
        #  TIMER FIX: Start the 20-minute clock the moment greeting audio begins.
        # Greeting + warmup + interview all count against the same 20-minute budget.
        # This timestamp is used by session_loop_start (main loop) and session_start_time
        # (transcript timestamps + remaining-time calculations).
        _interview_timer_start = time.monotonic()
        session_start_time = time.time()
        # Local wrapper to add elapsed time to transcript lines
        def _append_with_elapsed(speaker: str, text: str) -> None:
            elapsed = int(max(0, time.time() - session_start_time)) if session_start_time else 0
            append_transcript_line(transcript_lines, f"{speaker}[{elapsed}]", text)
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
                        is_agent_speaking = False
                        await session.say(welcome_text, allow_interruptions=False)
                        # session.say() can return cleanly while the TTS WS silently
                        # produced no audible audio -- confirm playback actually started
                        # before treating this attempt as a success.
                        if not is_agent_speaking and first_agent_turn_committed_at is None:
                            raise RuntimeError("session.say() returned with no audible speech detected")
                        greeting_delivered = True
                        greeting_delivered_at = time.time()
                        # session.say() bypasses the LLM pipeline and does NOT fire
                        # conversation_item_added, so we must append the greeting manually.
                        _append_with_elapsed("Interviewer", welcome_text)
                        logger.info("[TRANSCRIPT] Greeting appended to transcript (session.say bypass)")
                        logger.info("[FLOW]  GREETING DONE  WARMUP ACTIVE (waiting for warmup Q&A before interview)")
                        # Inject phase marker so LLM knows greeting is done and must not repeat it
                        remove_system_messages(chat_ctx, "[PHASE_STATUS]")
                        chat_ctx.add_message(
                            role="system",
                            content=(
                                "[PHASE_STATUS -- DO NOT SAY ALOUD]\n"
                                "GREETING: DONE. You have already said hello and introduced yourself.\n"
                                "DO NOT greet again or re-introduce yourself.\n"
                                "WARMUP QUESTION WILL BE DELIVERED AUTOMATICALLY — do not generate it."
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
                                "no audible speech detected",
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
            try:
                await log_tts_error(
                    candidate_name=candidate_name,
                    org_name=_compact_optional(ctx_data.orgName),
                    provider=org_tts_provider,
                    error=str(e),
                    reason="Greeting delivery failed after retries",
                    context={"app_id": app_id},
                )
            except Exception:
                pass
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
    #   12s silence -> soft nudge
    #   20s silence -> warning
    #   30s silence -> final goodbye line spoken
    #   40s silence -> call actually ends (10s grace after the goodbye line)
    INACTIVITY_NUDGE_SECS = 12
    INACTIVITY_WARNING_SECS = 20
    INACTIVITY_GOODBYE_SECS = 30
    INACTIVITY_END_SECS = 40
    _name = candidate_first_name or candidate_name
    _SOFT_NUDGE_TEXT = f"Take your time, {_name}. I'm here when you're ready."
    _INACTIVITY_WARNING_TEXT = (
        f"Are you still there, {_name}? I'll go ahead and wrap up shortly if I don't hear from you."
    )
    _INACTIVITY_END_TEXT = (
        f"I'll go ahead and end the session here. "
        f"It was great speaking with you, {_name}. All the best!"
    )
    async def _deliver_nudge(text: str) -> None:
        # Scripted speech should not behave like a new interview question. Preserve
        # the original silence timer across the nudge audio so the 12/20/30/40s
        # thresholds are measured from the candidate's first chance to answer.
        # Also preserve the "already sent" flags across the nudge's own
        # agent_state_changed speaking->listening transition (below), otherwise
        # each nudge wipes its own sent-flag and re-fires forever every ~12s
        # instead of escalating to the 20s warning / 30s goodbye / 40s end.
        nonlocal awaiting_candidate_response, awaiting_candidate_since, inactivity_nudge_speaking
        inactivity_nudge_speaking = True
        try:
            await session.say(text, allow_interruptions=True)
        finally:
            inactivity_nudge_speaking = False
        awaiting_candidate_response = True
        if awaiting_candidate_since is None:
            awaiting_candidate_since = time.monotonic()
    agent.set_code_card_timeout_speaker(_deliver_nudge)
    async def _send_termination_signal(reason: str):
        try:
            payload = json.dumps({"type": "interview_terminated", "reason": reason}).encode("utf-8")
            await ctx.room.local_participant.publish_data(payload, reliable=True)
            logger.info(f"[NUDGE] Sent termination signal to frontend (reason={reason})")
        except Exception as e:
            logger.warning(f"Failed to send termination signal: {e}")
    _goodbye_speak_secs = 0.0
    time_limit_reached_event = asyncio.Event()
    async def _closing_trigger_at_exact_deadline(fire_in: float) -> None:
        # Scheduled once, independent of the poll loop below -- fires at exactly
        # T-CLOSING_TRIGGER_SECS (19:50 of a 20:00 interview) with no poll-interval slack.
        await asyncio.sleep(fire_in)
        if not _closing_triggered:
            await _speak_time_limit_goodbye(float(CLOSING_TRIGGER_SECS))
            time_limit_reached_event.set()
    async def _speak_time_limit_goodbye(remaining: float) -> None:
        # Deterministic "we're out of time" close. Set _closing_triggered FIRST so
        # concurrent eval turns stop injecting new questions (see the guard at the
        # top of the eval path) even if the say() below is slow or interrupted.
        # Called from two places:
        #   1. From _closing_trigger_at_exact_deadline, an asyncio.sleep()-scheduled
        #      task that fires at exactly T-CLOSING_TRIGGER_SECS (19:50 of a 20:00
        #      interview) -- independent of the main loop's poll interval, so there's
        #      no polling-granularity slack in when this starts.
        #   2. As a post-loop fallback if the scheduled task above never ran (e.g. the
        #      loop broke early via finish/disconnect racing the deadline) -- this
        #      guarantees the candidate always hears a closing line at the time limit.
        nonlocal _closing_triggered, _goodbye_speak_secs
        if _closing_triggered:
            return
        _closing_triggered = True
        logger.info("[CLOSING] Triggered at remaining=%.1fs", remaining)
        _name = candidate_first_name or candidate_name
        # Kept to one short sentence + sign-off so worst-case TTS speaking time stays
        # bounded and predictable -- see _goodbye_speak_secs measurement below.
        _goodbye_candidate = f"Sorry to interrupt, {_name} — we're at time, so I'll wrap up here. Thanks so much, we'll be in touch soon!"
        _goodbye_silence = f"We're at time, {_name}, so I'll wrap up here. Thanks so much, we'll be in touch soon!"
        _say_start = time.monotonic()
        try:
            if is_candidate_speaking or is_agent_speaking:
                session.interrupt()
                await asyncio.sleep(0.3)
                await session.say(_goodbye_candidate, allow_interruptions=False)
            else:
                await session.say(_goodbye_silence, allow_interruptions=False)
        except Exception as e:
            logger.warning("[CLOSING] Goodbye delivery failed: %s", e)
        finally:
            _goodbye_speak_secs = time.monotonic() - _say_start
    # Use the greeting-begin timestamp so `remaining` counts from when greeting started,
    # NOT from when the greeting audio finished. This makes the 20-min window exact.
    session_loop_start = _interview_timer_start
    _last_timer_log = time.monotonic()
    _closing_deadline_fire_in = max(0.0, total_seconds - CLOSING_TRIGGER_SECS - (time.monotonic() - session_loop_start))
    closing_trigger_task = asyncio.create_task(_closing_trigger_at_exact_deadline(_closing_deadline_fire_in))
    while True:
        elapsed = time.monotonic() - session_loop_start
        remaining = total_seconds - elapsed
        if finished_task.done() or disconnected_task.done() or time_limit_reached_event.is_set():
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
        inactivity_elapsed = (
            (time.monotonic() - awaiting_candidate_since)
            if awaiting_candidate_response and awaiting_candidate_since is not None
            else 0.0
        )
        # agent._waiting_for_eval is closed in two different situations that must be
        # told apart:
        #   1. A question was just delivered and the candidate hasn't answered yet
        #      (pre-closed defensively so llm_node can't race ahead -- see
        #      "[LLM_GATE] Pre-cleared after interview question delivery"). Here
        #      _candidate_turn_since_last_assistant is False (no reply since the AI
        #      last spoke) -- nudges MUST still fire on real candidate silence, or the
        #      "inactivity never fires" bug comes back.
        #   2. The candidate JUST answered and eval/probe-directive generation is
        #      genuinely in flight (_candidate_turn_since_last_assistant is True, set
        #      the moment their turn was processed). Here is_agent_speaking is still
        #      False (TTS hasn't started -- the LLM is still generating the reply
        #      text), so without this check a nudge can fire in that processing gap
        #      even though the candidate did answer and a reply is on its way.
        # Only situation 2 should block nudges.
        _eval_in_flight_after_reply = agent._waiting_for_eval and _candidate_turn_since_last_assistant
        _silence_active = (
            not is_agent_speaking
            and not is_candidate_speaking
            and awaiting_candidate_response
            and inactivity_elapsed >= INACTIVITY_NUDGE_SECS
            and not _eval_in_flight_after_reply
            and not agent.code_card_active  # code card has its own on-screen timer; no inactivity nudge while it's up
        )
        # Log timing every 5 seconds so we can verify nudge schedule
        if int(inactivity_elapsed) % 5 == 0 and inactivity_elapsed >= 5:
            logger.debug(f"[NUDGE_TIMING] elapsed={inactivity_elapsed:.1f}s silent={_silence_active} agent_speaking={is_agent_speaking} candidate_speaking={is_candidate_speaking}")
        # 12s silence -> soft nudge (fires once per prompt)
        if _silence_active and inactivity_elapsed >= INACTIVITY_NUDGE_SECS and inactivity_elapsed < INACTIVITY_WARNING_SECS and not inactivity_nudge_sent_for_current_prompt:
            try:
                logger.info("[NUDGE_FIRE] 12s nudge at %.1fs elapsed", inactivity_elapsed)
                spawn_background_task(_deliver_nudge(_SOFT_NUDGE_TEXT), "inactivity_nudge")
                inactivity_nudge_sent_for_current_prompt = True
                logger.info("[NUDGE] Soft nudge sent at %.1fs silence", inactivity_elapsed)
            except Exception as e:
                logger.warning(f"[NUDGE] Failed to deliver soft nudge: {e}")
        # 20s silence -> warning (fires once per prompt)
        if _silence_active and inactivity_elapsed >= INACTIVITY_WARNING_SECS and inactivity_elapsed < INACTIVITY_GOODBYE_SECS and not inactivity_warning_sent_for_current_prompt:
            try:
                logger.info("[NUDGE_FIRE] 20s warning at %.1fs elapsed", inactivity_elapsed)
                spawn_background_task(_deliver_nudge(_INACTIVITY_WARNING_TEXT), "inactivity_warning")
                inactivity_warning_sent_for_current_prompt = True
                logger.info("[NUDGE] Warning sent at %.1fs silence", inactivity_elapsed)
            except Exception as e:
                logger.warning(f"[NUDGE] Failed to deliver warning: {e}")
        # 30s silence -> final goodbye line spoken (fires once per prompt)
        if _silence_active and inactivity_elapsed >= INACTIVITY_GOODBYE_SECS and inactivity_elapsed < INACTIVITY_END_SECS and not inactivity_end_sent_for_current_prompt:
            try:
                logger.info("[NUDGE_FIRE] 30s goodbye at %.1fs elapsed", inactivity_elapsed)
                spawn_background_task(_deliver_nudge(_INACTIVITY_END_TEXT), "inactivity_goodbye")
                inactivity_end_sent_for_current_prompt = True
                logger.info("[NUDGE] Goodbye line sent at %.1fs silence", inactivity_elapsed)
            except Exception as e:
                logger.warning(f"[NUDGE] Failed to deliver goodbye line: {e}")
        # 40s silence -> call actually ends (10s grace after the goodbye line)
        if not is_agent_speaking and not is_candidate_speaking and inactivity_elapsed >= INACTIVITY_END_SECS and inactivity_end_sent_for_current_prompt:
            logger.info("[NUDGE_FIRE] 40s END at %.1fs elapsed", inactivity_elapsed)
            logger.info("[NUDGE] Ending interview due to inactivity (%.1fs)", inactivity_elapsed)
            await _send_termination_signal("inactivity_timeout")
            interview_marked_finished = True
            interview_finished_event.set()
            disconnect_event.set()
            break
        await asyncio.sleep(1)
    # Check if we exited because of finish/disconnect or because time ran out
    time_expired = (
        time_limit_reached_event.is_set()
        or (not finished_task.done() and not disconnected_task.done())
    )
    if time_expired:
        # FALLBACK: normally the goodbye was already spoken at T-CLOSING_TRIGGER_SECS
        # inside the loop. But if the loop exited via `remaining<=0` without the
        # trigger firing (a slow final iteration could carry `remaining` straight
        # past the window), _closing_triggered is still False and the interview
        # would otherwise end SILENTLY. Speak it now so the candidate always hears
        # the "we're out of time" close before the disconnect.
        if not _closing_triggered:
            logger.warning("[CLOSING] Trigger was skipped inside loop -- speaking goodbye now (fallback)")
            await _speak_time_limit_goodbye(0.0)
        logger.info(
            f"[CLOSING] Session ended at time limit ({time_limit_mins}m), "
            f"goodbye took {_goodbye_speak_secs:.1f}s"
        )
        # session.say(..., allow_interruptions=False) above already blocks until the
        # goodbye finishes speaking -- no need to guess/sleep for TTS duration here.
        # Small fixed buffer only for audio buffer flush / network flight time.
        await asyncio.sleep(0.5)
        await _send_termination_signal("time_expired")
        interview_marked_finished = True
        interview_finished_event.set()
        disconnect_event.set()
    # Cancel pending tasks
    for task in [finished_task, disconnected_task, closing_trigger_task]:
        if not task.done():
            task.cancel()
    # --- Grace Period: Wait for final STT results to arrive (Deepgram/LiveKit tail) ---
    logger.info(
        f"Interview ended (finished={finished_task.done()}, time_expired={time_expired}). Waiting 2s for final transcripts..."
    )
    spawn_background_task(
        log_test_event(app_id, "session_ended", "Session ended"),
        "test_event_session_ended"
    )
    await asyncio.sleep(2)
    # â Final definitive save - Phase 5 includes proctoring report + answer scores
    proctoring_data = _build_proctoring_data(
        "time_expired" if time_expired else "interview_finished"
    )
    logger.info("[PERSIST] Saving final transcript (%d lines) and scores (%d turns)", len(transcript_lines), len(answer_scores))
    if _is_demo_session:
        await persist_demo_transcript_completed(app_id, transcript_lines)
    else:
        await persist_transcript(
            app_id,
            transcript_lines,
            session_start_time,
            proctoring_data=proctoring_data,
            final_status="COMPLETED",
        )
    await persist_latency_signals(app_id, answer_scores)
    await persist_session_fingerprint(app_id)
    if not answer_scores:
        logger.warning(
            "[SCORE] Interview %s finished with zero scored turns -- "
            "Question Analysis will be empty in the report.", app_id
        )
    try:
        await persist_answer_scores(app_id, answer_scores)
    except Exception as e:
        # A failed final score write must not abort completion (billing, report
        # generation, COMPLETED status) -- the interview genuinely happened.
        logger.error("[SCORE] Final answer-score persist failed for %s: %s", app_id, e)
    # CRITICAL: Mark as COMPLETED immediately after first save to prevent re-dispatch
    # This must happen before any async work (summary, report, billing) that could fail
    if finished_task.done():
        try:
            _agent_dur = (time.time() - session_start_time) if session_start_time else None
            # Sessions that ran out the fixed time budget always bill/show exactly
            # time_limit_mins, regardless of goodbye TTS timing shaving a few
            # seconds off the raw elapsed wall-clock. Early ends (candidate
            # finished, inactivity timeout) keep their real, shorter duration.
            if time_expired:
                _agent_dur = float(time_limit_mins * 60)
            if not _is_demo_session:
                await update_interview_status(app_id, duration_seconds=_agent_dur)
                logger.info("[EARLY_STATUS_UPDATE] Marked COMPLETED to prevent duplicate job dispatch")
        except Exception as e:
            logger.error(f"[EARLY_STATUS_UPDATE] Failed to mark COMPLETED: {e}")
    logger.info("[PERSIST] Transcript and scores saved (answer_scores has %d turns)", len(answer_scores))
    # IMPORTANT: Wait briefly for any pending answer_scores to be added from background eval tasks
    # This ensures the report generator has all available scores
    await asyncio.sleep(0.5)
    logger.info("[REPORT_PREP] answer_scores final count: %d turns", len(answer_scores))
    billable_tts_characters = max(
        int(plugin_tts_characters or 0),
        int(getattr(agent, "_tts_text_characters", 0) or 0),
    )
    if billable_tts_characters and billable_tts_characters != plugin_tts_characters:
        logger.info(
            "[USAGE] Using TTS text fallback for billing chars provider_metrics=%d text_chars=%d",
            plugin_tts_characters,
            billable_tts_characters,
        )
    if not _is_demo_session:
        await persist_org_usage_metrics(
            org_id,
            latest_session_usage or session.usage,
            tts_provider=org_tts_provider,
            tts_model=org_tts_model,
            stt_provider="DEEPGRAM",
            stt_model=str(ctx_data.sttModel),
            plugin_tts_characters=billable_tts_characters,
            plugin_tts_audio_seconds=plugin_tts_audio_seconds,
            plugin_stt_audio_seconds=plugin_stt_audio_seconds,
            # Per-event ledger attribution for interviewSession STT/TTS rows.
            app_id=app_id,
            job_id=ctx_data.jobId,
            candidate_name=candidate_name,
            job_title=job_title,
            is_test=_is_test_session,
        )
    else:
        # DEMO: no OrganizationDetails row to bill against (persist_org_usage_metrics
        # requires org_id) -- write to DemoSession.usageJson instead. Live-conversation
        # LLM usage comes straight from the LiveKit session's own model_usage
        # buckets (same source UsageSummarizer reads for real sessions); eval/
        # llmgen usage was already accumulated in-memory throughout the session
        # by the usage_sink=..._llm_usages.append callbacks above -- just never
        # flushed to DB before now because this whole branch used to be skipped.
        _demo_session_id = app_id[len("demo_"):]  # matches agent_persistence.py's demo_* stripping
        _demo_session_usage = latest_session_usage or session.usage
        _demo_live_usages: list[dict] = []
        for _item in (getattr(_demo_session_usage, "model_usage", []) or []):
            if getattr(_item, "type", "") != "llm_usage":
                continue
            _demo_live_usages.append({
                "model": str(getattr(_item, "model", "") or "").strip(),
                "inputTokens": int(getattr(_item, "input_tokens", 0) or 0),
                "outputTokens": int(getattr(_item, "output_tokens", 0) or 0),
                "cachedInputTokens": int(getattr(_item, "input_cached_tokens", 0) or 0),
            })
        await save_demo_session_usage(
            _demo_session_id,
            live_usages=_demo_live_usages,
            eval_usages=list(_eval_llm_usages_accumulated),
            llmgen_usages=list(_llmgen_llm_usages),
            tts_provider=org_tts_provider,
            tts_model=org_tts_model,
            tts_characters=billable_tts_characters,
            stt_provider="DEEPGRAM",
            stt_model=str(ctx_data.sttModel),
            stt_audio_seconds=plugin_stt_audio_seconds,
        )
    # AI Scorecard + billing snapshot + debug PDF -- handed off to the durable
    # Node/BullMQ worker (interview-report queue -> report_worker.py) instead of
    # running inline here. LiveKit Cloud recycles this job process shortly after
    # the room closes, which risked killing the ~300s report pipeline mid-flight;
    # the Node worker is always-on and can retry/observe failures via BullMQ.
    # Demo sessions are throwaway (~5min, no org/billing) -- no report is generated.
    if session_start_time and not _is_demo_session:
        if _is_test_session and _skip_report:
            # ponytail: test session with report disabled -- skip all LLM report/summary calls
            logger.info("[REPORT] Skipped (test session with skipReport=True) for %s", app_id)
        else:
            _usage_snap = latest_session_usage or session.usage
            _report_payload = {
                "appId": app_id,
                "orgId": org_id,
                "jobTitle": job_title,
                "interviewType": interview_type,
                "candidateName": candidate_name,
                "llmInterviewReport": str(ctx_data.llmInterviewReport).strip(),
                "isTest": _is_test_session,
                "answerIntegrityEnabled": bool(evaluation_signal_toggles.get("answer_integrity")),
                "transcriptLines": list(transcript_lines),
                "answerScores": list(answer_scores),
                "proctoringData": dict(proctoring_data) if proctoring_data else {},
                "jdJson": _coerce_jsonish(extracted_details) if extracted_details else None,
                "resumeJson": structured_resume if isinstance(structured_resume, dict) else None,
                "topicRecords": list(_topic_records),
                "usage": {
                    "evalUsages": list(_eval_llm_usages_accumulated),
                    "llmgenUsages": list(_llmgen_llm_usages),
                },
                "billing": {
                    "sessionUsage": _usage_to_dict(_usage_snap),
                    "durationSeconds": (time.time() - session_start_time) if session_start_time else None,
                    "ttsProvider": org_tts_provider,
                    "ttsModel": org_tts_model,
                    "sttProvider": "DEEPGRAM",
                    "sttModel": str(ctx_data.sttModel),
                    "ttsCharacters": billable_tts_characters,
                    "ttsAudioSeconds": plugin_tts_audio_seconds,
                    "sttAudioSeconds": plugin_stt_audio_seconds,
                },
                "debugReport": {
                    "topicPool": [t.model_dump() for t in _interview_brief.topic_pool],
                    "coveredTopics": _covered_topic_keys.coverage_rows(),
                },
            }
            await _enqueue_report_job(app_id, _report_payload)
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
async def _entrypoint_guarded(ctx: JobContext) -> None:
    """Thin guard wrapper around entrypoint.
    Any uncaught exception from the session body reaches here — we mark the
    interview FAILED in DB and send the support message to the frontend before
    re-raising so the LiveKit job runner still sees the failure.
    """
    app_id: str = ""
    try:
        # Pull app_id early so the except block can reference it even if entrypoint
        # crashes before assigning it internally.
        metadata = getattr(ctx.job, "metadata", "") or ""
        try:
            _meta = json.loads(metadata) if metadata.strip().startswith("{") else {}
        except Exception:
            _meta = {}
        app_id = _meta.get("app_id") or _meta.get("appId") or ""
        await entrypoint(ctx)
    except Exception as _crash:
        logger.error(f"[INTERVIEW_FAIL] Uncaught crash in entrypoint app_id={app_id}: {_crash}", exc_info=True)
        try:
            await log_livekit_error(
                app_id=app_id,
                candidate_name=None,
                org_name=None,
                error=str(_crash),
                phase="entrypoint_guard",
            )
        except Exception:
            pass
        if app_id:
            try:
                await mark_interview_failed(app_id, reason="uncaught_crash")
            except Exception:
                pass
            try:
                _payload = json.dumps({
                    "type": "interview_failed",
                    "message": "We're sorry — a technical issue occurred. Please contact our support team to reschedule your interview.",
                    "reason": "uncaught_crash",
                }).encode("utf-8")
                await ctx.room.local_participant.publish_data(_payload, reliable=True)
            except Exception:
                pass
        raise
