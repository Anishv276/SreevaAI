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
from interview.interview_phases import (
    build_greeting_text,
    build_interview_directive,
)
from interview.interview_brief import (
    InterviewBrief,
    TopicItem,
    generate_interview_brief,
)
from interview.band_classifier import classify_band
from interview.agent_providers import (
    build_cartesia_tts,
    build_elevenlabs_tts,
    build_llm,
    build_sarvam_tts,
    build_stt,
)
from interview.agent_persistence import (
    generate_interview_report,
    generate_interview_summary,
    get_interview_context,
    mark_interview_failed,
    mark_interview_started,
    persist_answer_scores,
    persist_transcript,
    update_interview_status,
)
from interview.slack_error_logger import (
    log_livekit_error,
    log_llm_error,
    log_stt_error,
    log_tts_error,
)
from billing.billing import (
    flush_billing as flush_pending_manual_billing,
    record_manual_usage as persist_org_manual_billing_usage,
    save_interview_billing as persist_interview_billing_snapshot,
    save_org_usage_metrics as persist_org_usage_metrics,
)
from openai import AsyncOpenAI
from pydantic import BaseModel, field_validator
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from enum import Enum

# ─── Test Event Logger (for /test page debugging) ──────────────────────────────
async def log_test_event(app_id: str, event_type: str, message: str, data: dict = None) -> None:
    """Send event to /api/test/events for live debugging on /test page."""
    # Always log for test sessions (check if app_id looks like a test app)
    if not app_id:
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
                    "http://localhost:3000/api/test/events",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=1)
                ) as resp:
                    pass
        except (ImportError, ModuleNotFoundError):
            # Fallback to sync HTTP
            payload_json = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                "http://localhost:3000/api/test/events",
                data=payload_json,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            urllib.request.urlopen(req, timeout=1)
    except Exception as e:
        logger.debug("[TEST_EVENT_LOG] Failed to log event: %s", e)

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
    questions_asked: list[str] = field(default_factory=list)  # every question Ishita asked on this topic

class CoveredTopics:
    """Single source of truth for all covered topics.

    Stores rich CoverageRecord per key so directives can tell the LLM
    *how* and *where* a topic was covered — enabling acknowledgements like
    "yes, we covered Python during the DataFlow project discussion."

    Normalizes every key on every operation so string mismatch can never
    cause a topic to be re-asked.
    """
    def __init__(self) -> None:
        self._store: dict[str, CoverageRecord] = {}

    @staticmethod
    def _norm(key: str) -> str:
        short = str(key or "").split(" - ")[0].strip()
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

    def get_memory_block(self) -> str:
        """Coverage memory always empty — removed from all directives."""
        return ""

# Module-level singleton — reuses the HTTP/2 connection pool and TLS session
# across all eval, directive, and brief calls for every interview session.
# Creating AsyncOpenAI() per-session causes a cold TLS handshake on the first
# call of each session, adding 50–200ms. One shared client eliminates that.
_SHARED_OPENAI_CLIENT: AsyncOpenAI = AsyncOpenAI()
from interview.agent_runtime_helpers import (
    _build_recent_context_block,
    append_transcript_line,
    make_tts_sanitize_transform,
    _tts_acronym_transform,
    _elevenlabs_normalize_transform,
    _sarvam_normalize_transform,
    make_sarvam_llm_rewrite_transform,
    polish_candidate_facing_text,
    remove_system_messages,
    remove_system_messages_multi,
    tts_phonetic_processor,
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
from interview.prompt_layers import (
    build_voice_layer_prompt,
    build_evaluation_layer_prompt,
    build_system_prompt,
)
CLOSING_TRIGGER_SECS = 20   # fire goodbye at T-20s so interview ends exactly at time limit
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
# ponytail: _TTS_DEFAULT_MODELS deleted — all model values come from org DB row now
# Compiled once  matches greeting echo fragments that leak back into STT after AI speaks.
_GREETING_ECHO_RE = re.compile(
    r"^\s*(?:hi|hello|hey|okay|ok|yeah|yes|yep|mmhmm|mhm|good morning|good afternoon)\s*$",
    re.IGNORECASE,
)
_ACK_ONLY_ASSISTANT_RE = re.compile(
    r"^\s*(?:okay|ok|got it|sure|right|yeah|yes|thanks|thank you|makes sense|that makes sense)[,.\s]*$",
    re.IGNORECASE,
)
_MEANINGFUL_SHORT_ANSWERS = {
    "no",
    "yes",
    "yeah",
    "yep",
    "ok",
    "okay",
    "sure",
    "right",
    "nothing", "none", "pass", "skip", "na", "n/a",
}
# STT noise-suppression helpers  compiled at import time.
_STT_WHITESPACE_RE = re.compile(r"\s+")
_STT_NON_ALPHA_RE = re.compile(r"[^a-zA-Z]")
_STT_VOWEL_RE = re.compile(r"[aeiou]")
# TTS sentence boundary  compiled once at module level (not per tts_node call).
_TTS_SENT_END_RE = re.compile(r'(?<=[.?!…])\s+|(?<=—)\s+')
_TTS_MAX_BUFFER_CHARS = 200  # push to TTS if no sentence boundary found after this many chars
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
def _is_ack_only_assistant_fragment(text: str) -> bool:
    """True for interrupted assistant acknowledgements that are not a question."""
    clean = _STT_WHITESPACE_RE.sub(" ", (text or "").strip())
    if not clean or "?" in clean:
        return False
    return bool(_ACK_ONLY_ASSISTANT_RE.fullmatch(clean)) or len(clean.split()) <= 2
def _normalized_short_answer(text: str) -> str:
    return re.sub(r"[^a-z0-9/]+", "", (text or "").strip().lower())
def _is_tiny_fragment(text: str) -> bool:
    words = [w for w in (text or "").strip().split() if w]
    return len(words) <= 3 and _normalized_short_answer(text) not in _MEANINGFUL_SHORT_ANSWERS
def _topic_short_title(topic: str) -> str:
    """Extract short title from full topic string (before ' - ')."""
    return (topic or "").split(" - ")[0].strip()
def _topic_short_key_for_ordering(topic: str) -> str:
    """Normalized key for deduplication and lookup (lowercase, no special chars)."""
    short = _topic_short_title(topic)
    return re.sub(r"[^a-z0-9]+", " ", short.lower()).strip()

def _build_cross_ref_rule(source_tag: str) -> str:
    """Cross-reference rule for a MOVE_ON directive, keyed on the topic TAG.
    Tells Ishita how to treat a topic the candidate may already have touched.
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

def _sanitize_topic_title_for_speech(title: str) -> str:
    """Clean a topic title for spoken delivery.
    - Strip trailing parenthetical fragments and acronym tails like
      "(MLSC), GRIET" so the agent says "Tech Lead" not "Tech Lead microsoft
      Learn Student Club (MLSC), GRIET".
    - Collapse internal whitespace.
    """
    if not title:
        return ""
    # Drop everything after the first comma (work-history rows like
    # "Tech Lead - microsoft Learn Student Club (MLSC), GRIET" pollute speech)
    cleaned = title.split(",", 1)[0]
    # Remove any parenthetical chunks.
    cleaned = re.sub(r"\s*\([^)]*\)\s*", " ", cleaned)
    # Collapse whitespace.
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned
def _build_probe_directive(
    *,
    signal: Optional[str],
    signal_reason: Optional[str],
    band: str,
    active_topic: str,
    topic_item: Optional[Any],
    prev_question: str,
    prev_answer: str,
    topic_follow_ups: int,
    topic_denied: bool,
    coverage_memory: str,
    asked_questions_log: list[str],
    topic_transcript: list[str],
) -> str:
    """
    Builds the probe directive synchronously — no LLM call.
    All inputs come from the eval result + topic brief already in memory.
    The interview LLM (Ishita) reads this and generates her own question.

    Eliminates the middle directive LLM call, collapsing 3 calls/turn → 2.
    """
    from interview.probe_strategy import get_probe_context

    # Topic brief block
    if topic_item is not None:
        parts = [f"TOPIC: {topic_item.title}"]
        if topic_item.full_description:
            parts.append(f"WHAT THIS IS: {topic_item.full_description}")
        if topic_item.probe_focus:
            parts.append(f"INTERESTING ANGLES: {', '.join(topic_item.probe_focus)}")
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

    # Full probe context from probe_strategy — what fired, what to do, what to skip
    _probe_ctx = get_probe_context(
        signal=signal,
        signal_reason=signal_reason,
        band=band,
        topic_follow_ups=topic_follow_ups,
        topic_denied=topic_denied,
        prev_answer=prev_answer,
    )

    # Filler guidance — classify prev answer intent so Ishita's reaction is connected
    _prev_lower = (prev_answer or "").lower().strip()
    _is_clarification_ask = any(p in _prev_lower for p in ("are you asking", "you're asking", "do you mean", "what do you mean", "which", "can you clarify"))

    if _is_clarification_ask:
        _filler_hint = "CLARIFICATION DETECTED: They didn't understand your question. Rephrase it MORE SIMPLY and anchor the topic name explicitly."
    elif not _prev_lower or any(p in _prev_lower for p in ("i don't know", "i forgot", "i don't remember", "not sure", "can't recall")):
        _filler_hint = "FILLER: 'No worries.' or 'Fair enough.' — they couldn't recall."
    elif len(_prev_lower.split()) <= 8:
        _filler_hint = "FILLER: 'Hmm, okay.' or 'Right.' — short answer, acknowledge briefly."
    elif any(p in _prev_lower for p in ("i think", "probably", "maybe", "i believe", "kind of", "sort of")):
        _filler_hint = "FILLER: 'Hmm, okay.' or 'Mm.' — they hedged, don't praise it."
    else:
        _filler_hint = "FILLER: 'Ah, makes sense.' or 'Right.' or 'Okay.' — substantive answer."

    # Short display label for the HARD STOP line — prefer structured topic title,
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

    parts_out += [
        "NOW: React to what they said (one short phrase), then ask your follow-up question.",
        "One question mark. Never two questions in one turn.",
        "The question can have 1-3 sentences of natural setup before the actual question — that's fine.",
        "Grounded in what they just told you. Never 'Can you' or 'Could you'. Never 'Great!' or 'Awesome!'.",
        "",
    ]
    if _is_clarification_ask:
        parts_out += [
            f"THEY ASKED FOR CLARIFICATION: Ask SIMPLER, mention '{_topic_short}' upfront.",
        ]
    parts_out += [""]

    parts_out += [
        f"ANCHOR REQUIREMENT — CRITICAL:",
        f"Your question MUST START with or INCLUDE the topic name '{_topic_short}' word-for-word.",
        f"Pattern: 'With {_topic_short}, [your question]' or 'In {_topic_short}, [your question]'",
        f"",
        f"EXAMPLES using the probe focus above:",
        f"  ✓ 'With {_topic_short}, what was your specific role or the part you personally built?'",
        f"  ✓ 'In {_topic_short}, what was the trickiest part to get working?'",
        f"  ✗ WRONG: 'What did you build?' (no topic name - candidate won't know what you're asking)",
        f"",
        f"HARD STOP: If your question doesn't mention '{_topic_short}', you're breaking protocol.",
    ]

    directive = "\n".join(parts_out)
    import logging as _logging
    _logging.getLogger("interview-agent").info(
        "[PROBE_DIRECTIVE] built (no LLM) | topic=%r signal=%s | %d chars",
        active_topic[:60], signal or "none", len(directive),
    )
    return directive


async def _generate_move_on_directive(
    *,
    old_topic_title: str,
    new_topic: str,
    new_topic_title: str,
    source: str,
    band: str,
    memory_block: str,
    cross_ref_rule: str,
    client: Any,
    llm_model: str = "gpt-4.1-mini",
    usage_sink: Optional[Any] = None,
    topic_item: Optional[Any] = None,
    prev_answer: str = "",  # candidate's last answer — used to derive the right opening filler
    app_id: str = "",
    candidate_name: str = "",
) -> str:
    """
    Ask GPT-4.1-mini to generate a full MOVE_ON directive including the opening
    question for the new topic. Returns the complete directive string ready for
    injection into chat_ctx.
    The directive tells Ishita:
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
        if topic_item.why_relevant:
            parts.append(f"WHY RELEVANT: {topic_item.why_relevant}")
        if topic_item.probe_focus:
            parts.append(f"PROBE FOCUS: {', '.join(topic_item.probe_focus)}")
        if topic_item.probe_avoid:
            parts.append(f"PROBE AVOID: {', '.join(topic_item.probe_avoid)}")
        if topic_item.impact:
            parts.append(f"IMPACT: {topic_item.impact}")
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
    if _is_standalone:
        _attribution_guard = (
            "\nATTRIBUTION GUARD -- CRITICAL:\n"
            "This topic is a STANDALONE / personal project. It is NOT linked to any company.\n"
            "NEVER attach an employer or company name to it. NEVER say '...at <Company>'.\n"
            "Even if the analyst brief mentions a company nearby, do NOT assume this project\n"
            "was built there. Ask about the project on its own terms.\n"
        )
    # Tag-based framing — the tag tells us exactly what the candidate knows and how to open.
    # This is the single most important framing rule: wrong tag = wrong question type.
    #
    # RESUME_TOPIC : candidate did this — we know it. Ask about what they built, owned, or decided.
    #                NEVER ask if they did it. NEVER ask why they worked somewhere. They worked there.
    # JD_TOPIC     : role requires this but candidate has NOT claimed it on their resume.
    #                Ask neutrally — curious about exposure. Do NOT assume they know it.
    # ROLE_TOPIC   : comes from expert domain knowledge, NOT resume or JD.
    #                Candidate has no known experience here. Ask a concept/approach question.
    #                NEVER ask "what was your experience with X" — they may have none.
    _topic_type_hint = (topic_item.topic_type if topic_item else "") or ""
    _probe_focus_str = "; ".join(topic_item.probe_focus[:3]) if (topic_item and topic_item.probe_focus) else ""

    if source in ("RESUME_TOPIC", "resume_project", "resume_skill"):
        _standalone_note = (
            "NOTE: This is a standalone personal project — not built at any employer. "
            "Never attach a company name to it.\n"
        ) if _is_standalone else ""
        _type_context = {
            "project": "a project they personally built",
            "work":    "a role or job they held",
            "skill":   "a skill they listed on their resume",
        }.get(_topic_type_hint, "something from their resume")
        _band_depth = {
            "fresher":    "Establish what they personally built and what their specific role was. Surface-level is fine.",
            "mid":        "Push past team language — ask what was specifically their own call or ownership.",
            "experienced":"Skip setup. Go straight to a tradeoff, design decision, or what broke.",
            "senior":     "Probe strategic judgment — what it changed, what the stakes were, what they'd do differently.",
        }.get(band, "Ask what they personally owned and what decisions were theirs.")
        _angle_guide = (
            f"SOURCE: RESUME_TOPIC — {_type_context}.\n"
            f"{_standalone_note}"
            f"The candidate HAS done this. We know it from their resume. We are not checking if they did it.\n"
            f"Your job: set clear context for the candidate so they know exactly which project/role/skill "
            f"is being discussed, then ask ONE question that goes into depth.\n\n"
            f"CONTEXT-SETTING PRINCIPLE:\n"
            f"The candidate is on a voice call. They need to know what you're asking about before they can answer. "
            f"Reference the topic naturally in the question itself — not with a formulaic opener, "
            f"but by building the topic name into a real question. "
            f"For a project: ask about something specific to that project. "
            f"For a work role: ask about something specific to that company or role. "
            f"For a skill: ask about a real scenario where they used it.\n\n"
            f"DEPTH TARGET ({band.upper()}): {_band_depth}\n"
            f"FORBIDDEN: 'do you have experience', 'why did you work there', 'what drew you to X', "
            f"'tell me about your background' — these are generic and give the candidate no context."
        )
    elif source in ("JD_TOPIC", "jd_skill"):
        _band_jd = {
            "fresher":    "Ask gently — they may be new to this. Check for any exposure, even self-taught or exploratory.",
            "mid":        "Ask about real usage in a project — not theory, not self-description.",
            "experienced":"Ask about production depth — constraints, tradeoffs, real consequences.",
            "senior":     "Ask about strategic calls — where they've had to make judgment calls around it.",
        }.get(band, "Ask about their exposure neutrally — the role needs it, they haven't claimed it.")
        _angle_guide = (
            f"SOURCE: JD_TOPIC — this is required by the job description.\n"
            f"The candidate has NOT claimed this on their resume. We do not know if they've used it.\n"
            f"Your job: make it clear to the candidate WHY you're asking — tell them the role needs this — "
            f"then ask ONE question that checks their exposure without assuming they have any.\n\n"
            f"CONTEXT-SETTING PRINCIPLE:\n"
            f"The candidate needs to understand the question's origin: this is a role requirement, not a resume claim. "
            f"Make that clear naturally in the question — e.g. frame it as 'this role involves a lot of X' "
            f"before asking what their exposure is. Don't just ask 'have you used X?' with no context.\n\n"
            f"DEPTH TARGET ({band.upper()}): {_band_jd}\n"
            f"FORBIDDEN: 'you listed', 'on your resume', 'walk me through your experience with' (assumes experience), "
            f"grilling them if they say they haven't used it."
        )
    elif source in ("ROLE_TOPIC", "role_topic"):
        _role_desc = (topic_item.full_description if topic_item else "") or ""
        _band_role = {
            "fresher":    "Ask about the concept — do they understand what it means and why it matters?",
            "mid":        "Ask about any real exposure or how they'd approach it if given the problem.",
            "experienced":"Ask about a concrete decision or tradeoff in this space — real stakes, not theory.",
            "senior":     "Ask about systemic or organizational thinking — how does it play out at team/org scale?",
        }.get(band, "Ask how they think about or would approach this — they may have zero prior experience.")
        _angle_guide = (
            f"SOURCE: ROLE_TOPIC — this comes from expert domain knowledge of the role.\n"
            f"It is NOT on the candidate's resume and NOT in the job description. "
            f"We have no idea if they've worked with this.\n"
            f"Your job: introduce the topic clearly so the candidate understands what's being asked — "
            f"then ask ONE question that checks their thinking or approach, not their experience history.\n\n"
            f"CONTEXT-SETTING PRINCIPLE:\n"
            f"The candidate has no anchor for this question. Give them one — explain in one short phrase "
            f"why this matters for the role before asking. Something like 'for a role like this, X matters a lot' "
            f"or 'one thing that comes up a lot in this work is X'. Then ask your question.\n\n"
            f"DEPTH TARGET ({band.upper()}): {_band_role}\n"
            f"CONTEXT FROM BRIEF: {_role_desc}\n"
            f"PROBE ANGLES: {_probe_focus_str or 'their understanding, reasoning, how they would approach it'}\n"
            f"FORBIDDEN: 'what was your experience with X' (assumes experience), 'why did you work with X', "
            f"'what do you know about X?' (generic), framing it as if it's on their resume."
        )
    else:
        _angle_guide = (
            f"Open with a specific, grounded question about {new_topic_title} based on the brief context above. "
            f"Do NOT ask why they worked somewhere or what drew them to a company."
        )
    _system = (
        "You are writing an internal directive for an AI interviewer named Ishita. "
        "This directive is NEVER spoken aloud — it is a private instruction she reads and acts on silently.\n\n"
        "Your job: write the [NEXT_TURN_DIRECTIVE] block for a MOVE_ON moment. "
        "You will be given the new topic, its source tag, the analyst brief, and the candidate's last answer. "
        "From all of this, tell Ishita exactly what she should find out and how to open — not what to say.\n\n"

        "━━━ THE CORE PRINCIPLE ━━━\n"
        "Ishita is on a live voice call. The candidate cannot see a screen. "
        "They have no idea what topic is coming next. "
        "Your directive must ensure Ishita's first question gives the candidate enough context to answer. "
        "A question with no context — 'What was your biggest challenge?' — is unanswerable without knowing what it refers to.\n\n"

        "HOW GOOD INTERVIEWERS OPEN A NEW TOPIC:\n"
        "They don't say 'Next question' or 'Moving on'. They build the topic name INTO the question naturally.\n"
        "  RESUME project: 'You built the multi-channel lead qualifier — what was the trickiest part to get right?'\n"
        "  RESUME work role: 'At DataFlow you were building pipelines — what did you personally own end to end?'\n"
        "  RESUME skill: 'You've worked with Kafka — where did you actually use it and at what scale?'\n"
        "  JD requirement: 'This role deals with Kubernetes a lot — what's your experience with it so far?'\n"
        "  ROLE topic: 'One thing that matters a lot in this kind of role is observability — how do you think about it?'\n"
        "Notice: the topic name is in the question. The candidate immediately knows the context.\n\n"

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

        "━━━ DIRECTIVE STRUCTURE ━━━\n"
        "Write in plain text, no markdown:\n"
        "DECISION: MOVE_ON\n"
        "TOPIC YOU ARE LEAVING: <old topic> — CLOSED. Do not reference it again.\n"
        "NEW ACTIVE TOPIC: <new topic>  [TAG: <source>]\n"
        "WHAT WE KNOW: 2-3 bullet points about the new topic from the analyst brief\n"
        "OPENING ANGLE: The specific thing worth probing first — what question to open with conceptually, "
        "and what context Ishita must give the candidate so they understand what's being asked\n"
        "WHAT TO FIND OUT: one sentence on what a good answer to this topic would reveal\n"
        "FORBIDDEN: 2-3 specific things Ishita must NOT say or do on this topic\n\n"

        "Do NOT write the actual question. Ishita generates it herself from your guidance.\n"
        "Do NOT write 'Suggested question:' or any scripted line she would copy verbatim.\n"
        "ONE question only — Ishita must ask one thing and then listen. "
        "No compound questions, no 'and also', no multi-part asks.\n\n"
        "Output plain text only. No markdown. No code blocks."
    )
    _user = (
        f"BAND: {band.upper()}\n"
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
                max_tokens=550,
                stream=True,
                stream_options={"include_usage": True},
                store=True,
                metadata={"call_type": "move_on_directive", "band": band, "source": source},
                prediction={"type": "content", "content": (
                    "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                    "DECISION: MOVE_ON\n"
                    f"TOPIC YOU ARE LEAVING: {old_topic_title} -- CLOSED.\n"
                )},
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
        # Sanity check: directive must not contain a scripted question for Ishita to copy
        if "SUGGESTED OPENING QUESTION" in generated.upper():
            # Strip it — Ishita generates her own from topic context
            generated = re.sub(
                r"SUGGESTED OPENING QUESTION.*$", "", generated, flags=re.I | re.DOTALL
            ).strip()
        # Build filler instruction from the actual prev answer so the LLM
        # picks a reaction that matches what the candidate really said —
        # not a generic list it ignores.
        _prev_trimmed = (prev_answer or "").strip()[:300]
        if _prev_trimmed:
            # Classify the candidate's answer intent so the filler is contextually correct
            _prev_lc = _prev_trimmed.lower()
            if not _prev_lc or any(p in _prev_lc for p in ("i don't know", "i forgot", "i don't remember", "not sure", "can't recall")):
                _intent_hint = "They couldn't recall or said they don't know → use 'No worries.' or 'Fair enough.'"
            elif len(_prev_lc.split()) <= 8:
                _intent_hint = "Very short answer, possibly surface-level → use 'Hmm, okay.' or 'Right.'"
            elif any(p in _prev_lc for p in ("i think", "probably", "maybe", "i believe", "kind of", "sort of")):
                _intent_hint = "They hedged or were vague → use 'Hmm, okay.' or 'Mm.' to acknowledge without validating"
            else:
                _intent_hint = "Substantive answer → use 'Ah, makes sense.' or 'Right.' or 'Okay.'"
            _filler_instruction = (
                f"\n\nOPENING REACTION — must respond to what the candidate actually said:\n"
                f"THEIR LAST ANSWER: \"{_prev_trimmed}\"\n"
                f"ANSWER INTENT: {_intent_hint}\n"
                "Pick ONE micro-reaction (3-8 words) that matches the intent above.\n"
                "The reaction and the new question must feel like one connected turn — "
                "not a reaction to silence followed by an unrelated question.\n"
                "NEVER say 'Great!', 'Awesome!', 'Fantastic!', 'Amazing!', or any hollow praise.\n"
                "NEVER say 'Thanks for sharing' or any 'thanks for [verb]ing' phrase.\n"
                "NEVER use the same reaction as the previous turn.\n"
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
        self._pending_eval_task: Optional[asyncio.Task] = None
        self._waiting_for_eval: bool = False
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
        activity = self._get_activity_or_raise()
        assert activity.llm is not None, "llm_node called but no LLM node is available"
        assert isinstance(activity.llm, llm.LLM), (
            "llm_node should only be used with LLM (non-multimodal/realtime APIs) nodes"
        )
        # LiveKit calls llm_node as soon as a user item lands. During the real
        # interview we block only while the previous question is awaiting eval.
        # Prompt-text inference is too brittle here; the runtime owns this flag.
        _must_wait_for_eval = bool(self._waiting_for_eval)
        if _must_wait_for_eval:
            self._directive_ready.clear()
            logger.debug("[LLM_GATE] waiting for eval directive")
        timed_out = False
        try:
            # Timeout ladder (strictly increasing so the inner call always finishes
            # or self-recovers before any outer guard fires):
            #   inner LLM call (agent_scoring)      = 8s
            #   eval wrapper (run_eval_and_build..)  = 10s
            #   THIS LLM gate                        = 11s
            # Strictly increasing ladder: inner always resolves before outer fires.
            # Eval owns its own recovery so this gate firing = genuine asyncio stall.
            await asyncio.wait_for(self._directive_ready.wait(), timeout=11.0)
            logger.info("[LLM_GATE] directive ready")
        except asyncio.TimeoutError:
            timed_out = True
            pending_state = "none"
            if self._pending_eval_task is not None:
                pending_state = "done" if self._pending_eval_task.done() else "pending"
            logger.critical("[LLM_GATE] CRITICAL: timed out (11s) -- eval_task=%s (likely stalled); escalating", pending_state)
            if _must_wait_for_eval:
                self._waiting_for_eval = False
                # Use the mutable _chat_ctx -- self.chat_ctx is a read-only view.
                remove_system_messages_multi(
                    self._chat_ctx,
                    ("[NEXT_TURN_DIRECTIVE", "[RECENT_CONTEXT"),
                )
                # Check if the last candidate message was a clarification question.
                _last_user_msg = ""
                for _item in reversed(list(getattr(self._chat_ctx, "items", []))):
                    if getattr(_item, "role", None) == "user":
                        _last_user_msg = str(getattr(_item, "content", "") or "").strip()
                        break
                _is_clarification = _last_user_msg.endswith("?") or any(
                    w in _last_user_msg.lower()
                    for w in ("which one", "what do you mean", "can you clarify", "which", "what do you")
                )
                if _is_clarification:
                    _timeout_instruction = (
                        "The candidate asked a clarification question. Apologise briefly and re-ask "
                        "the question in simpler, more concrete terms. Do NOT say 'Take your time'."
                    )
                else:
                    _timeout_instruction = (
                        "The evaluation directive was not ready in time. Do NOT ask a topical follow-up, "
                        "do NOT move topics, and do NOT use stale context. Say only: "
                        "\"Take your time -- I'm listening.\""
                    )
                self._chat_ctx.add_message(
                    role="system",
                    content=(
                        "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                        "DECISION: RECOVER_GATE_TIMEOUT\n"
                        + _timeout_instruction
                    ),
                )
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
            "[LLM_GATE] %s | sys_msgs=%d%s",
            "on-time" if not timed_out else "timeout",
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
        # Override LiveKit's default 10s timeout -- Sarvam WS can take up to 25s for
        # longer responses. At 10s it times out, retries, and causes ~18s silence gap.
        if (conn_options.timeout or 0) < 25.0:
            conn_options = replace(conn_options, timeout=25.0)
        async def _push_sentences(tts_stream) -> None:
            buf = ""
            n = 0
            is_elevenlabs = type(tts_engine).__module__.startswith("livekit.plugins.elevenlabs")
            async for chunk in text:
                buf += chunk
                if is_elevenlabs:
                    # Buffer by sentence for ElevenLabs — pushing raw tokens causes it to
                    # synthesize mid-word (e.g. "Multi" before "Channel") producing garbled
                    # audio. Fall through to the same sentence-buffer logic used for Sarvam.
                    pass
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
        proc.userdata["default_tts"] = build_cartesia_tts()
        logger.info("Default TTS prewarmed.")
    except Exception as e:
        logger.warning(f"Failed to prewarm default TTS: {e}")
    # DB pool initializes lazily on first job — asyncpg requires an async context
    # which is not available in the sync prewarm() function.
    logger.info("DB pool will initialize lazily on first job.")
class _EvalSignalToggles(BaseModel):
    """Toggle flags for plan-gated signals only.
    Always-on signals (ownership_ambiguity, ownership_clarified, example_evasion,
    example_given, weak_technical_hedge, follow_up_collapse, strong_under_pressure,
    depth_decay) are NOT listed here — they have no toggle and always run.
    Plan-gated signals default to False when absent from the DB row.
    """
    # Plan-gated behavioral signals
    latency_mismatch: bool = False
    complexity_latency_mismatch: bool = False
    # Plan-gated environmental signals (Python awareness mirrors frontend gating)
    tab_switch: bool = False
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
    """Parse DB proctoringSignals JSON into a toggle dict for plan-gated signals only.
    Returns only the 9 plan-gated signal flags. Always-on signals are not in
    this dict — they are never toggled and run unconditionally in the evaluator.
    """
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
    aiName: Optional[str] = "Ishita"
    voiceId: Optional[str] = None
    # AI model config from org row
    sttModel: Optional[str] = None
    ttsProvider: Optional[str] = None
    ttsModel: Optional[str] = None
    llmInterviewLive: Optional[str] = None
    llmInterviewEval: Optional[str] = None
    llmInterviewBrief: Optional[str] = None
    llmInterviewReport: Optional[str] = None
    resumeData: Any = None
    extractedDetails: Any = None
    screeningCriteria: Any = None
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
    # Room name is available before connecting - derive app_id early so we can
    # fire the DB fetch in parallel with the room connect handshake.
    app_id = ctx.room.name.replace("interview_", "")
    dispatch_metadata = parse_dispatch_metadata(getattr(ctx.job, "metadata", ""))
    _is_test_session: bool = bool(dispatch_metadata.get("isTest", False))
    _skip_report: bool = bool(dispatch_metadata.get("skipReport", False))
    if _is_test_session:
        logger.info("[TEST_SESSION] Running in TEST mode | skipReport=%s", _skip_report)
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
    # Room is now connected — define the failure helper here so it can use ctx.room.
    # Any failure AFTER this point must call _fail_interview() so:
    #   1. DB is marked FAILED (Drive candidates page shows FAILED, not stuck IN_PROGRESS)
    #   2. Frontend receives an error event and shows the support message to the candidate
    async def _fail_interview(reason: str) -> None:
        logger.error(f"[INTERVIEW_FAIL] app_id={app_id} reason={reason}")
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
    if ctx_data.interviewStatus and str(ctx_data.interviewStatus).strip().upper() in ("COMPLETED", "NO_SHOW", "ABANDONED", "FAILED"):
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
    org_tts_provider: str = str(ctx_data.ttsProvider).strip().upper()
    org_tts_model: str   = str(ctx_data.ttsModel).strip()
    voice_id: str        = str(ctx_data.voiceId).strip()
    interview_llm_model: str         = str(ctx_data.llmInterviewLive).strip()
    interview_llm_temperature: float = INTERVIEW_TEMPERATURE
    analysis_model: str              = str(ctx_data.llmInterviewEval).strip()
    lang_codes = _LANGUAGE_CODES.get(interview_lang)
    if not lang_codes:
        raise RuntimeError(f"Unsupported interview language in DB: {interview_lang}")
    _eval_llm_usages_accumulated: list[dict] = []
    _brief_llm_usages: list[dict] = []
    _llmgen_llm_usages: list[dict] = []
    logger.info(
        "[BRIEF] Generating interview brief | candidate=%s role=%s",
        candidate_first_name or candidate_name, job_title,
    )
    _brief_openai_client: AsyncOpenAI = _SHARED_OPENAI_CLIENT

    # ── Band seed: resume-only classification (seniority_level + total_years) ──
    # Logic lives in interview/band_classifier.py — fully tested, no title heuristics.
    _band_seed, _total_years, _seniority = classify_band(structured_resume)
    logger.info(
        "[BAND] seed=%s | total_years=%.1f | seniority=%s",
        _band_seed, _total_years, _seniority or "unknown",
    )
    _interview_brief: InterviewBrief = await generate_interview_brief(
        candidate_name=candidate_first_name or candidate_name,
        job_title=job_title,
        candidate_band=_band_seed,
        resume_json=structured_resume if isinstance(structured_resume, dict) else {},
        jd_data=extracted_details or {},
        custom_questions=_interview_questions or [],
        openai_client=_brief_openai_client,
        llm_model=str(ctx_data.llmInterviewBrief).strip(),
        usage_sink=_brief_llm_usages.append,
    )
    # Use the LLM's band assessment — more accurate than mechanical inference
    candidate_band = _interview_brief.candidate_band
    logger.info("[FLOW] Band=%s | candidate=%s | role=%s", candidate_band, candidate_name, job_title)
    # Convenience views directly from InterviewBrief — no wrapper objects needed
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
        "[BRIEF] ✓ Generated | band=%s | anchor=%r | topics=%d",
        _interview_brief.candidate_band,
        _interview_brief.anchor_topic.title,
        len(_interview_brief.topic_pool),
    )
    logger.info("[BRIEF] strategy: %s", _interview_brief.interview_strategy[:120])
    if _interview_brief.red_flags:
        logger.info("[BRIEF] red_flags: %s", " | ".join(_interview_brief.red_flags))
    for _i, _t in enumerate(_interview_brief.topic_pool):
        logger.info(
            "[BRIEF] topic[%d] %-10s score=%.2f  %r  probe=%s",
            _i, _t.topic_type, _t.relevance_score, _t.title,
            ",".join(_t.probe_focus[:3]) or "-",
        )
    # Compact text block for eval layer prompt
    # Register all session keywords with the phonetic processor
    tts_phonetic_processor.add_keywords(_tts_keywords)
    logger.info("[TTS_PHONETIC] Registered %d keywords for this session", len(_tts_keywords))
    interview_directive_cached = build_interview_directive(
        band=candidate_band,
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
    _band         = candidate_band or "unknown"
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
        f"  Anchor: {_anchor_full[:120]} (type: {_anchor_type})\n"
        f"  Skills: {_skills_str}\n"
        f"  Projects: {_projects_str}\n"
        f"  Work History: {_work_str}\n"
        f"\n"
        f"INTERVIEW PLAN: 20 min covering resume ownership, JD skills, situational, behavioural. "
        f"Open with: '{_anchor_title}'. "
        f"Band={_band}: {_band_note}. "
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
        candidate_band=candidate_band,
        interview_brief=_interview_brief,
    )
    system_prompt = build_system_prompt(
        voice_layer_prompt=voice_layer_prompt,
        evaluation_layer_prompt=evaluation_layer_prompt,
    )
    chat_ctx = llm.ChatContext()
    chat_ctx.add_message(role="system", content=system_prompt)
    chat_ctx.add_message(role="system", content=interview_directive_cached)
    logger.info("[FLOW] System prompt ready  greeting  interview")
    logger.debug("[SYSTEM_PROMPT] Full system prompt:\n%s", system_prompt)
    logger.debug("[INTERVIEW_DIRECTIVE] Content:\n%s", interview_directive_cached)
    ctx.proc.userdata["candidate_band"] = candidate_band
    def _build_flux_session_keyterms() -> list[str]:
        """Build one static Flux keyterm list for this interview session."""
        raw_topics = [
            *_brief_skills,
            *(_jd_skills or []),
            *_brief_projects,
            *_brief_work,
            str(job_title or ""),
            str(ctx_data.orgName or ""),
        ]
        stopwords = {
            "and", "are", "for", "from", "into", "that", "the", "this", "with",
            "using", "used", "built", "worked", "project", "role", "company",
        }
        terms: list[str] = []
        seen: set[str] = set()
        def _add(term: str) -> None:
            cleaned = re.sub(r"\s+", " ", str(term or "").strip(" -:;,.()[]{}"))
            if len(cleaned) < 2 or len(cleaned) > 60:
                return
            key = cleaned.casefold()
            if key in seen:
                return
            seen.add(key)
            terms.append(cleaned)
        for raw in raw_topics:
            text = str(raw or "").strip()
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
    # VAD removed: Flux STT native EOT drives all turn boundaries (turn_detection="stt").
    # Silero ONNX model is no longer needed — saves ~200ms prewarm startup time.
    flux_session_keyterms = _build_flux_session_keyterms()
    logger.info("[STT_FLUX] static session keyterms prepared: %d extra terms", len(flux_session_keyterms))
    try:
        stt_plugin = build_stt(language_code=lang_codes["stt"], keyterms=flux_session_keyterms, model_override=ctx_data.sttModel)
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
    _tts_builder = {
        "SARVAM":     build_sarvam_tts,
        "ELEVENLABS": build_elevenlabs_tts,
        "CARTESIA":   build_cartesia_tts,
    }.get(org_tts_provider, build_cartesia_tts)
    logger.info(f"[TTS] Using %s  voice=%s model=%s", org_tts_provider, voice_id, org_tts_model)
    # For Sarvam v3: build a per-session pronunciation dict that combines the
    # shared base dict (infra/framework terms) with auto-generated pronunciations
    # for this candidate's specific resume/JD keywords. Zero human maintenance —
    # any tech term on any future resume is handled automatically.
    _sarvam_dict_id: str | None = None
    _sarvam_llm_rewrite_transform = None
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
            _base_dict_id = await _get_base_dict_id(_sarvam_api_key)
            _sarvam_dict_id = await _get_session_dict_id(
                _sarvam_api_key,
                _tts_keywords,
                base_dict_id=_base_dict_id,
            )
        # LLM rewrite transform: rewrites tech acronyms/terms to be TTS-friendly.
        # Uses the shared OpenAI client (no extra connection cost) with gpt-4.1-nano.
        # Sentence-buffered so latency impact is one nano call per sentence (~50ms).
        _sarvam_llm_rewrite_transform = make_sarvam_llm_rewrite_transform(
            _SHARED_OPENAI_CLIENT,
            model=analysis_model,
        )
    try:
        tts_plugin = _tts_builder(
            language=lang_codes["tts"],
            model=org_tts_model,
            voice_id=voice_id,
            **({"dict_id": _sarvam_dict_id} if _sarvam_dict_id else {}),
            **({"pronunciation_dict_locators": _elevenlabs_pronunciation_locators} if _elevenlabs_pronunciation_locators else {}),
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
    # Flux provides native end-of-turn detection via EOT events — no separate semantic
    # turn detector needed. turn_detection="stt" tells LiveKit to use Flux's EOT events.
    logger.info("[TURN_DETECTOR] Flux native EOT active (engine=%s)", getattr(stt_plugin, "_hr_stt_engine", "flux"))
    ai_name = ctx_data.aiName or "Ishita"
    welcome_text = build_greeting_text(candidate_first_name or candidate_name, ai_name)
    logger.info("[FLOW] Greeting precomputed during launching phase")
    session_kwargs = {
        "stt": stt_plugin,
        "llm": llm_plugin,
        "tts": tts_plugin,
        "turn_handling": TurnHandlingOptions(
            preemptive_generation={"enabled": False},
            # Flux STT drives turn boundaries — no separate endpointing detector needed.
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
        "use_tts_aligned_transcript": org_tts_provider == "ELEVENLABS",
        # Client-side acronym transform:
        # - Cartesia: needs it (no server-side normalization)
        # - ElevenLabs: apply_text_normalization='auto' handles it server-side — skip
        # - Sarvam: dict_id + enable_preprocessing always-on — skip (caused letter-reading bug)
        "tts_text_transforms": [
            "filter_emoji",
            *([_tts_acronym_transform] if org_tts_provider == "CARTESIA" else []),
            *([_elevenlabs_normalize_transform] if org_tts_provider == "ELEVENLABS" else []),
            # Sarvam path: regex normalizer first, then LLM rewriter for ambiguous terms.
            *([_sarvam_normalize_transform] if org_tts_provider == "SARVAM" else []),
            *([_sarvam_llm_rewrite_transform] if _sarvam_llm_rewrite_transform else []),
            make_tts_sanitize_transform(org_tts_provider),
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
    from livekit.agents import function_tool
    from livekit.agents.beta.tools import EndCallTool

    # ── Candidate meta-intent tools ──────────────────────────────────────────
    # Replace regex pattern-matching with LLM-driven tool calls.
    # The LLM decides when to call these based on semantic understanding of what
    # the candidate said — not string matching on their exact words.

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

    _end_call_tool = EndCallTool(
        extra_description=(
            "End the interview when you have naturally concluded — after saying goodbye, "
            "thanking the candidate, or wishing them well. "
            "Do NOT end mid-interview while topics are still being discussed. "
            "Only end when you have explicitly wrapped up and the conversation is complete."
        ),
        delete_room=True,
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
    interview_marked_finished = False
    turn_count = 0
    warmup_complete = False  # True after candidate confirms the short readiness check
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
    _last_interviewer_question = ""   # most recent question Ishita asked
    _last_question_topic: Optional[str] = None  # short title of current topic (for eval scoring)
    answer_scores: list[dict] = []    # log of all answer quality scores for final DB save
    _active_topic: Optional[str] = None  # full context string for LLM; initialized after topic pools built
    _topic_states: dict[str, dict] = {}        # TopicState serialized per topic for saturation tracking
    _topic_score_histories: dict[str, list] = {}   # per-topic overall score history (for latency detection)
    _topic_depth_histories: dict[str, list] = {}   # H2 fix: per-topic depth scores for follow_up_collapse
    _last_depth_decay_turn: int = -999           # turn when depth_decay last fired; -999 = never
    _last_applied_eval_turn: int = 0             # monotonic guard against stale eval results
    _question_asked_at: float = 0.0
    _answer_received_at: float = 0.0
    _candidate_started_speaking_at: float = 0.0  # true reaction-time endpoint (VAD speech-start, not EOT)
    _custom_q_reminder_fired: bool = False
    _covered_topic_keys = CoveredTopics()  # single source of truth — normalized lowercase keys
    _asked_questions_log: collections.deque = collections.deque(maxlen=6)  # EC-3: deque(maxlen) makes append atomic — no pop() race

    _first_interview_question_asked: bool = False  # True after first post-warmup AI question fires
    _awaiting_first_interview_question: bool = False  # warmup confirmed; next assistant turn must open interview
    # Per-topic ground-truth records built at MOVE_ON time — replaces end-of-session
    # LLM transcript re-reading for skill extraction. Each entry is appended when the
    # agent closes a topic so eval scores, probe count, exit reason, and candidate
    # answers are captured while the context is live, not inferred afterward.
    _topic_records: list[dict] = []
    # Running buffer of candidate answers for the CURRENT active topic (reset on MOVE_ON)
    _current_topic_answers: list[str] = []
    # Running buffer of QUESTIONS Ishita asked on the CURRENT active topic (reset on MOVE_ON).
    # Snapshotted into CoverageRecord.questions_asked when the topic is closed, so they become
    # GLOBAL forbidden questions — preventing the same concept being re-asked under a later topic.
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

    # Unified topic pool — shrinks as topics are covered.
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
        # Full titles of topics already covered (exclude AUTO_SKILL — those are
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

        questions_asked: the questions Ishita asked on THIS topic. They are stored on the
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
        # Domain-generic GTM/marketing words — too common to identify a unique topic
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
        # Test 2: title containment — catches "Sensex Project" inside
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
    # Inline eval: reuse shared module-level client — no cold TLS handshake per session.
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
            "role_category": candidate_band,
            "candidate_band": candidate_band,
            "total_turns": turn_count,
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
            # then both append to answer_scores and _topic_score_histories — duplicate scores.
            if result_turn <= _last_applied_eval_turn:
                logger.debug(
                    "[EVAL] skipping stale eval result turn=%d last_applied=%d",
                    result_turn, _last_applied_eval_turn,
                )
                return False
            eval_usages = result.get("eval_llm_usages") or []
            if eval_usages:
                _eval_llm_usages_accumulated.extend(eval_usages)
            if quality_record:
                answer_scores.append(quality_record)
                topic_key = re.sub(
                    r"[^a-z0-9]+", " ",
                    str(quality_record.get("topic") or _active_topic or "").lower(),
                ).strip()
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
    async def _process_user_conversation_item(
        content: str,
        role: str,
        turn_snapshot: int,
        is_final_eot: bool = False,  # ponytail: True only when called from _handle_completed_user_turn (real EOT)
    ) -> None:
        nonlocal proctoring_events, _last_interviewer_question, \
            answer_scores, \
            greeting_delivered_at, \
            warmup_complete, _last_depth_decay_turn, \
            _active_topic, _covered_topic_keys, _topic_states, \
            _last_applied_eval_turn, _topic_score_histories, \
            _awaiting_first_interview_question, \
            _asked_questions_log, \
            _last_question_topic, _topic_records, _current_topic_answers, \
            _current_topic_questions, _topic_start_line_idx
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
            # Turn 2 = warmup response. It's always intentional candidate speech — skip noise filters.
            is_warmup_response = not warmup_complete and turn_snapshot >= 2
            if is_warmup_response:
                logger.debug(f"[WARMUP] Warmup response (turn={turn_snapshot}): '{content[:60]}' - skipping noise filters")
            else:
                # Flux handles endpointing and turn completion natively — only filter
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
            # Accumulate candidate answers for the current topic — used at MOVE_ON
            # to build grounded skill records instead of re-reading the transcript later.
            # EC-4: append under the lock so it cannot interleave with the MOVE_ON block
            # that reads then resets _current_topic_answers in the same lock acquisition.
            if warmup_complete and content.strip():
                async with _session_state_lock:
                    _current_topic_answers.append(content.strip())
            lines_snap_eval = list(transcript_lines)
            question_snap = _last_interviewer_question
            answer_snap = content
            spawn_background_task(
                persist_transcript(app_id, lines_snap_eval, session_start_time, partial=True),
                f"transcript_save_turn_{turn_snapshot}",
            )
            # Inject structured recent Q&A context for callbacks and follow-up context.
            if _last_interviewer_question and turn_snapshot > 1:
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
            # ponytail: Deepgram Flux sends partial transcripts as separate chunks.
            # We ONLY eval at true end-of-turn (is_final_eot=True from _handle_completed_user_turn).
            # Skip eval on intermediate chunks to avoid double-scoring and hallucination.
            if not is_final_eot:
                logger.info("[EVAL_GUARD] turn=%d skipped eval -- not EOT (is_final_eot=%s, content=%r)", turn_snapshot, is_final_eot, (content or "")[:40])
                return

            # warmup_complete is set by _handle_completed_user_turn when candidate
            # signals readiness. Start eval only after warmup has fully finished.
            # Warmup = turns 1-2, interview starts at turn 3, so first eval fires at turn 3.
            _can_eval_turn = bool(
                warmup_complete
                and turn_snapshot > 2
                and question_snap
                and _first_interview_question_asked
            )
            _gate_reason = (
                "PASS" if _can_eval_turn
                else (
                    f"BLOCK(warmup={warmup_complete},turn={turn_snapshot}>2={turn_snapshot>2},"
                    f"question={'Y' if question_snap else 'EMPTY'},opener={_first_interview_question_asked})"
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
                ) -> dict:
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
                    # Resolve active TopicItem from brief — gives eval accurate probe_focus,
                    # tag, and importance instead of deriving from raw string heuristics.
                    _scoring_topic_full = _active_topic or ""
                    _scoring_topic = _scoring_topic_full.split(" - ")[0].strip() if _scoring_topic_full else None
                    _scoring_topic_key = _normalize_topic_key(_scoring_topic or "")
                    # Look up the matching TopicItem so importance comes from the brief
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
                        "transcript_lines": lines[-6:],
                        "topic_score_history": _topic_score_history_snap,
                        "topic_depth_history": _topic_depth_history_snap,
                        "turns_since_decay": turns_since_decay,
                        "response_latency_sec": response_latency,
                        "signal_toggles": dict(evaluation_signal_toggles),
                        "org_id": org_id,
                        "llm_model": analysis_model,
                        # Agent tells eval exactly which topic to score -- no topic selection in eval
                        "active_topic": _scoring_topic,
                        "active_topic_state": active_topic_state,
                        "anchor_item": _anchor_title,
                        # Brief-derived topic metadata for accurate scoring calibration
                        "topic_tag": _active_brief_item.tag if _active_brief_item else "RESUME_TOPIC",
                        "topic_probe_focus": _active_brief_item.probe_focus if _active_brief_item else [],
                        "topic_why_relevant": _active_brief_item.why_relevant if _active_brief_item else "",

                        "job_title": job_title,
                        "remaining_seconds": float(_remaining_total_seconds_now()),
                        "band": candidate_band,
                        "ai_question_this_turn": (_last_interviewer_question or "").strip(),
                    }
                # -- INLINE EVAL -----------------------------------------------
                # Agent calls eval to SCORE the answer on the current topic.
                # Agent then decides: PROBE (stay, build probe directive) or
                # MOVE_ON (pick next topic, build move-on directive).
                # Eval never picks topics or builds directives.
                from interview.eval_pipeline import run_eval_and_build_directive
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
                # Test event: eval done
                spawn_background_task(
                    log_test_event(app_id, "eval_done", f"Eval complete | action={_eval_result_inline.get('action', 'PROBE')}"),
                    "test_event_eval_done"
                )
                # -- Unpack eval result ----------------------------------------
                _eval_signal        = _eval_result_inline.get("signal")         # str | None
                _eval_signal_reason = _eval_result_inline.get("signal_reason")  # str | None
                _saturation   = _eval_result_inline.get("saturation") or {}
                # H5 fix: read rotation index from TopicState and advance it so
                # consecutive PROBE turns on the same topic cycle through different
                # goal angles instead of random-picking each time.
                _new_topic_state_dict_pre = _saturation.get("topic_state_dict") if _eval_result_inline.get("saturation") else None
                _rotation_idx = int((_new_topic_state_dict_pre or {}).get("probe_rotation_index", 0) or 0)
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
                # Move-on is decided purely by saturation/weak_exit/dry_topic —
                # the LLM judge's action is no longer consulted (it kept buffering without context).
                # weak_exit itself now includes the turn-3/turn-5 saturation checkpoints.
                _action = "MOVE_ON" if (_weak_exit or _is_saturated or _dry_topic) else "PROBE"
                logger.info(
                    "[AGENT] turn=%d | decision_logic: sat=%.1f/%.1f saturated=%s weak=%s dry=%s "
                    "-> agent_action=%s",
                    turn_snapshot, _sat_after, _sat_thresh, _is_saturated, _weak_exit, _dry_topic,
                    _action
                )
                # Test events: log decision
                if _action == "MOVE_ON":
                    spawn_background_task(
                        log_test_event(app_id, "move_on", f"Moving to next topic | sat={_sat_after:.1f}/{_sat_thresh:.1f}"),
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
                await _apply_eval_result(_eval_result_inline, result_turn=turn_snapshot)
                # -- Agent decides: PROBE or MOVE_ON ---------------------------
                if _action == "MOVE_ON":
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
                    # ── Ground-truth topic record ──────────────────────────────
                    # EC-1/EC-2/EC-4/EC-5: ALL shared state reads and writes for
                    # this topic record must happen under one lock acquisition so
                    # that a concurrent MOVE_ON (different session on same process)
                    # or a concurrent candidate answer append cannot interleave:
                    #   _topic_states        — read (EC-1)
                    #   _topic_score_histories / _topic_depth_histories — read (EC-5)
                    #   _current_topic_answers — read then reset (EC-4)
                    #   _topic_records       — append (EC-2)
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
                            # snapshot above — any answer appended after this point belongs
                            # to the next topic and will not be incorrectly included here.
                            _current_topic_answers = []
                            # Reset per-topic question buffer too — already snapshotted into
                            # the CoverageRecord via _closing_topic_questions above.
                            _current_topic_questions = []
                            # MOVE_ON: clear the short-term asked-questions deque so that
                            # old-topic questions NEVER appear in the new topic's probe
                            # directive. Global forbidden questions are already preserved
                            # in CoveredTopics.get_memory_block() (coverage_memory), so
                            # nothing is lost — they still show up as FORBIDDEN in every
                            # subsequent directive. This is the primary fix for the bug
                            # where Ishita kept asking old-topic questions after MOVE_ON.
                            _asked_questions_log.clear()
                            logger.info(
                                "[TOPIC_RECORD] turn=%d | recorded topic=%r exit=%s probes=%d avg_overall=%.1f answers=%d q_forbidden=%d",
                                turn_snapshot, _old_key, _exit_reason, _probe_count, _avg_overall, len(_topic_records),
                                len(_closing_topic_questions),
                            )
                    except Exception as _tr_err:
                        logger.warning("[TOPIC_RECORD] Failed to record topic: %s", _tr_err)
                    _next_topic = _next_uncovered_topic(exclude=_old_topic)
                    # Pre-fire MOVE_ON directive generation in parallel — by the time
                    # we reach the await below it will already be done (or nearly so),
                    # eliminating the 5s serial wait after the eval completes.
                    _move_on_directive_task: Optional[asyncio.Task] = None
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
                                band=candidate_band,
                                memory_block="",
                                cross_ref_rule=_pre_cross_ref,
                                client=_eval_openai_client,
                                llm_model=analysis_model,
                                usage_sink=_llmgen_llm_usages.append,
                                topic_item=_pre_next_item,
                                prev_answer=(payload.get("answer") or ""),
                                app_id=app_id,
                                candidate_name=candidate_name,
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
                        logger.info("[EVAL] turn=%d | releasing LLM gate -- Ishita will speak now", turn_snapshot)
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
                        "[MOVE_ON] turn=%d | %r  ->  %r  (type=%s score=%.2f probe=%s)",
                        turn_snapshot,
                        _topic_short_key(_old_topic or ""),
                        _topic_short_key(_active_topic or ""),
                        _next_brief_item.topic_type if _next_brief_item else "?",
                        _next_brief_item.relevance_score if _next_brief_item else 0.0,
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
                    # directive's _angle_guide and Ishita's system prompt — not here.
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
                        # Task was pre-fired in parallel with eval — await and validate
                        _prefired_result = await _move_on_directive_task
                        if _prefired_result:
                            _directive = _prefired_result
                            logger.info("[MOVE_ON_LLM] Used pre-fired directive (parallel) for %r", _new_topic_key_lc)
                        else:
                            # Pre-fired task returned empty — use rule-based fallback directly.
                            # Do NOT attempt a second LLM call; the fallback below handles it.
                            logger.warning("[MOVE_ON_LLM] Pre-fired directive empty for %r — using rule-based fallback", _new_topic_key_lc)
                            _directive = ""
                    else:
                        # Topic changed or no pre-fired task — generate now
                        if _move_on_directive_task is not None:
                            _move_on_directive_task.cancel()
                        _directive = await _generate_move_on_directive(
                            old_topic_title=_old_topic_title,
                            new_topic=_active_topic or "",
                            new_topic_title=_new_topic_title,
                            source=_src,
                            band=candidate_band,
                            memory_block="",
                            cross_ref_rule=_cross_ref_rule,
                            client=_eval_openai_client,
                            llm_model=analysis_model,
                            usage_sink=_eval_llm_usages_accumulated.append,
                            topic_item=_new_topic_item,
                            prev_answer=_prev_a,
                            app_id=app_id,
                            candidate_name=candidate_name,
                        )
                    # If LLM directive generation failed, use a minimal instruction
                    # that lets the LLM generate a natural question from the TOPIC_LOCK context.
                    # No rule-based template — LLM drives the opener.
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
                    # SOURCE RULE -- the one short line that tells Ishita HOW to frame the
                    # opener based on the topic tag. Keyed on the real tag values.
                    # This is what makes "we require so-and-so skill" (JD) differ from
                    # "what did you build" (resume) and "how do you think about X" (role).
                    if _src == "JD_TOPIC":
                        _source_lock = (
                            "\nSOURCE: JD REQUIREMENT. The candidate has NOT claimed this on their resume.\n"
                            "Frame it as 'this role requires X' and ask about their exposure. "
                            "NEVER say 'you mentioned', 'you listed', or 'your resume says'. "
                            "NEVER assume they have used it.\n"
                        )
                    elif _src == "ROLE_TOPIC":
                        _source_lock = (
                            "\nSOURCE: ROLE-DEPTH CHECK. Not on the resume, not in the JD.\n"
                            "Ask about their understanding or approach -- 'how do you think about X' -- "
                            "NEVER 'what was your experience with X'. They may have none.\n"
                        )
                    else:  # RESUME_TOPIC
                        _source_lock = (
                            "\nSOURCE: RESUME. The candidate has direct experience here.\n"
                            "Ask about what they built, decided, or what broke. NEVER ask 'do you have "
                            "experience with X' or 'why did you work there' -- they did.\n"
                        )
                    remove_system_messages_multi(chat_ctx, ("[NEXT_TURN_DIRECTIVE", "[TOPIC_LOCK", "[RECENT_CONTEXT"))
                    chat_ctx.add_message(role="system", content=_directive)
                    chat_ctx.add_message(role="system", content=(
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
                    ))
                    # One-shot guard: tell the next eval cycle to skip itself so
                    # the queued MOVE_ON opener can be spoken first, before any
                    # PROBE directive overwrites it.
                    agent._move_on_opener_pending = True
                    _qr["directive_text"] = _directive  # ponytail: debug report needs the literal injected text
                    logger.info("[AGENT] turn=%d | MOVE_ON directive injected (LLM) | new_topic=%r", turn_snapshot, _active_topic)
                    logger.debug("[MOVE_ON_DIRECTIVE] turn=%d:\n%s", turn_snapshot, _directive)
                else:
                    # -- PROBE -- LLM-driven directive using TopicItem brief context --
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
                    _directive = _build_probe_directive(
                        signal=_eval_signal,
                        signal_reason=_eval_signal_reason,
                        band=(payload.get("band") or candidate_band or "mid").lower(),
                        active_topic=_active_topic or "",
                        topic_item=_probe_brief_item,
                        prev_question=_prev_q,
                        prev_answer=_prev_a,
                        topic_follow_ups=_topic_follow_ups,
                        topic_denied=_topic_short_key(_active_topic or "").lower() in _covered_topic_keys,
                        coverage_memory="",
                        asked_questions_log=list(_asked_questions_log),
                        topic_transcript=_topic_thread_lines,
                    )
                    remove_system_messages_multi(chat_ctx, ("[NEXT_TURN_DIRECTIVE", "[TOPIC_LOCK", "[RECENT_CONTEXT"))
                    chat_ctx.add_message(role="system", content=_directive)
                    _qr["directive_text"] = _directive  # ponytail: debug report needs the literal injected text
                    if _scoring_topic_log and _scoring_topic_log != "?":
                        _ts_for_rotation = _topic_states.get(_normalize_topic_key(_scoring_topic_log))
                        if isinstance(_ts_for_rotation, dict):
                            _ts_for_rotation["probe_rotation_index"] = _rotation_idx + 1
                    logger.info(
                        "[PROBE] turn=%d | signal=%s | topic=%r | sat=%.1f/%.1f | brief_probe=%s brief_avoid=%s",
                        turn_snapshot, _eval_signal or "none", _scoring_topic_log,
                        _sat_after, _sat_thresh,
                        ",".join((_probe_brief_item.probe_focus or [])[:3]) if _probe_brief_item else "-",
                        ",".join((_probe_brief_item.probe_avoid or [])[:2]) if _probe_brief_item else "-",
                    )
                    logger.debug("[PROBE_DIRECTIVE] turn=%d:\n%s", turn_snapshot, _directive)
                logger.info("[EVAL] turn=%d | releasing LLM gate -- Ishita will speak now", turn_snapshot)
                agent._waiting_for_eval = False
                agent._directive_ready.set()
        except Exception as e:
            logger.error("[EVAL] _process_user_conversation_item failed turn=%d: %s", turn_snapshot, e, exc_info=True)
            agent._waiting_for_eval = False
            agent._directive_ready.set()
    _FIXED_WARMUP_TEXT = (
        "Right, so this'll be a fairly casual conversation — I'm just curious to know more about "
        "what you've worked on and how you think about things. Are you all set to begin?"
    )
    async def _handle_completed_user_turn(_turn_ctx, new_message) -> None:
        nonlocal _answer_received_at, _candidate_turn_since_last_assistant, \
            warmup_complete, _awaiting_first_interview_question
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
        # Turn 1 = candidate's reply to the greeting. Deliver fixed warmup via session.say()
        # so the LLM never generates this line (it was producing unpredictable filler).
        if turn_snapshot == 1 and not warmup_complete:
            agent._waiting_for_eval = True
            agent._directive_ready.clear()
            await _process_user_conversation_item(content, "user", turn_snapshot, is_final_eot=True)
            _append_with_elapsed("Candidate", content)
            try:
                await session.say(_FIXED_WARMUP_TEXT, allow_interruptions=False)
                _append_with_elapsed("Interviewer", _FIXED_WARMUP_TEXT)
                logger.info("[WARMUP] Fixed warmup delivered via session.say()")
            except Exception as _w_err:
                logger.warning("[WARMUP] session.say() warmup failed: %s", _w_err)
            finally:
                # Update phase status and release gate — candidate will answer warmup next
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
            return
        # Dynamic warmup (Option B): LLM decides readiness, not a fixed turn count.
        # Warmup ends when the candidate signals they are ready to begin.
        # We detect this by checking their response for readiness markers.
        # This fires from turn 2 onward — greeting (turn 1) is never a readiness signal.
        _warmup_readiness_markers = (
            "yes", "yeah", "yep", "ready", "let's go", "lets go", "go ahead",
            "sure", "ok", "okay", "absolutely", "of course", "let's begin",
            "lets begin", "start", "begin", "fire away", "go on", "alright",
        )
        _content_lc = content.strip().lower()
        # Match markers as whole words/phrases, not substrings
        import re as _re_warmup
        _candidate_signals_ready = (
            turn_snapshot >= 2
            and not warmup_complete
            and any(_re_warmup.search(r'\b' + m + r'\b', _content_lc) for m in _warmup_readiness_markers)
        )
        completing_warmup = _candidate_signals_ready
        logger.debug(
            "[USER_TURN] completed turn=%d words=%d text=%r signals_ready=%s",
            turn_snapshot,
            len(content.split()),
            content[:100],
            completing_warmup,
        )
        await _process_user_conversation_item(content, "user", turn_snapshot, is_final_eot=True)
        if completing_warmup:
            warmup_complete = True
            _first_interview_question_asked = False
            logger.info("[WARMUP] warmup_complete=True at turn=%d (candidate signalled readiness)", turn_snapshot)
            remove_system_messages(chat_ctx, "[WARMUP PHASE]")
            remove_system_messages(chat_ctx, "[PHASE_STATUS]")
            # Fix #1: Inject the first interview question directive immediately — no intermediate acknowledgement.
            # The LLM will open with the anchor topic on the next turn.
            chat_ctx.add_message(role="system", content=interview_directive_cached)
            logger.info("[WARMUP] First interview directive injected at turn=%d | ready to ask anchor topic", turn_snapshot)
            agent._waiting_for_eval = False
            agent._directive_ready.set()
    agent._completed_user_turn_handler = _handle_completed_user_turn
    #  TRANSCRIPT EVENT HANDLER
    # Registered on session "conversation_item_added"  fires for BOTH Ishita
    # (assistant) and Candidate (user) turns. Handles:
    #    Transcript persistence for both speakers
    #    turn_count / question tracking for assistant turns
    #    Warmup gate management
    # User-turn evaluation is handled by InterviewAgent.on_user_turn_completed.
    # 
    @session.on("conversation_item_added")
    def on_conversation_item_added(event) -> None:
        nonlocal turn_count, _last_interviewer_question, _question_asked_at, \
            _candidate_turn_since_last_assistant, warmup_complete, \
            _answer_received_at, _first_interview_question_asked, \
            _last_question_topic, _awaiting_first_interview_question
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
                    # This happens when STT echoes Ishita's greeting back as a candidate
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
                # count as interview questions — they don't contain a question for the
                # candidate, they are just "Take your time" filler. Detect them by the
                # inactivity_nudge_speaking flag set by _deliver_nudge().
                if inactivity_nudge_speaking:
                    logger.debug("[TURN_GUARD] Skipping nudge message — not an interview turn")
                    return
                # Greeting (turn 1 AI) and warmup (turn 2 AI) must never overwrite this
                # because their text ("How are you doing?", "All good on your end?") would
                # pollute eval context if the candidate gives a slow answer on turn 3+.
                # After warmup, we have a transient "acknowledgement only" phase before
                # the first real interview question. Don't count it as an interview turn.
                _is_interview_turn = warmup_complete and not _awaiting_first_interview_question and turn_count > 2
                if _is_ack_only_assistant_fragment(clean_content) and (_awaiting_first_interview_question or not warmup_complete):
                    logger.warning("[TURN_GUARD] Ignoring acknowledgement-only assistant fragment: %r", clean_content)
                    return
                # Save Ishita's line to transcript
                _append_with_elapsed("Interviewer", clean_content)
                if _is_interview_turn:
                    # Fix #2: Reset nudge flags when a new question is asked.
                    # This ensures nudges can fire independently for each question, not just the first.
                    nonlocal inactivity_nudge_sent_for_current_prompt, inactivity_warning_sent_for_current_prompt, inactivity_end_sent_for_current_prompt
                    inactivity_nudge_sent_for_current_prompt = False
                    inactivity_warning_sent_for_current_prompt = False
                    inactivity_end_sent_for_current_prompt = False
                    reset_inactivity_clock(start_waiting=True, preserve_nudge_flags=False)
                    logger.debug("[NUDGE] Nudge flags reset for new question at turn=%d", turn_count)
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
                    # is a single atomic operation — no separate pop() needed, no
                    # IndexError possible, no lock required in this sync callback.
                    if _last_interviewer_question and _first_interview_question_asked:
                        _asked_questions_log.append(_last_interviewer_question[:120])
                        # Per-topic question buffer — snapshotted into CoverageRecord on MOVE_ON
                        # so each question becomes a GLOBAL forbidden question (Fix: cross-topic
                        # duplicate-question prevention). Skip secondary/soft "general" phases.
                        if _last_question_topic not in ("general", "general conversation", None, ""):
                            _current_topic_questions.append(_last_interviewer_question[:120])
                    # First interview question just fired -- seal the opening move so the LLM
                    # cannot re-ask it. The base system prompt says "Open by asking about X"
                    # which conflicts with PROBE directives on subsequent turns. This message
                    # overrides that instruction once the opener has been delivered.
                    if not _first_interview_question_asked:
                        _first_interview_question_asked = True
                        _awaiting_first_interview_question = False
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
                        # Pre-clear the LLM gate NOW -- Ishita just delivered the first interview
                        # question. The next event will be Vamsi answering (Turn 3 candidate turn).
                        # Without this pre-clear, llm_node fires the moment Turn 3 STT arrives
                        # (gate was still SET from warmup), generating BEFORE Vamsi's answer is
                        # in chat_ctx, causing Ishita to repeat the same opening question.
                        # Clearing here ensures the gate is already closed when Turn 3 fires,
                        # so the sync gate fast-path (which sets it) runs after the answer lands.
                        agent._waiting_for_eval = True
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
                # Increment turn count and track timing
                _question_asked_at = time.perf_counter()
                _candidate_turn_since_last_assistant = False
                turn_count += 1
                if not warmup_complete and turn_count == 2:
                    # Ishita just said "Are you ready to begin?" — gate the LLM so it
                    # waits for the candidate's answer. The warmup completion handler
                    # will inject the warmup-done directive and release the gate.
                    agent._waiting_for_eval = True
                    agent._directive_ready.clear()
                    # Update PHASE_STATUS so if LLM fires again before candidate replies
                    # it knows the warmup question is ALREADY spoken — don't repeat it.
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
    inactivity_nudge_speaking = False
    first_agent_turn_committed_at: float | None = None
    llm_spoke_event = asyncio.Event()
    greeting_delivered_at: float | None = None
    def reset_inactivity_clock(start_waiting: bool, preserve_nudge_flags: bool = False) -> None:
        nonlocal awaiting_candidate_response, awaiting_candidate_since, \
            inactivity_nudge_sent_for_current_prompt, inactivity_warning_sent_for_current_prompt, \
            inactivity_end_sent_for_current_prompt
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
    @session.on("agent_state_changed")
    def on_agent_state_changed(event):
        nonlocal is_agent_speaking, first_agent_turn_committed_at
        if event.new_state == "speaking":
            is_agent_speaking = True
            if inactivity_nudge_speaking:
                logger.debug("[NUDGE] Scripted inactivity prompt speaking; preserving countdown")
            else:
                reset_inactivity_clock(start_waiting=False)
                logger.debug("[NUDGE] AI started speaking; old inactivity countdown cleared")
        elif event.new_state == "listening":
            is_agent_speaking = False
            if first_agent_turn_committed_at is None:
                first_agent_turn_committed_at = time.monotonic()
            # Start inactivity countdown immediately when AI finishes speaking
            reset_inactivity_clock(start_waiting=True, preserve_nudge_flags=False)
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
            "[FLOW] Session started  candidate=%s role=%s band=%s tts=%s llm=%s boot=%dms",
            candidate_name, job_title, candidate_band,
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
                        await session.say(welcome_text, allow_interruptions=False)
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
    #   7s  silence -> soft nudge
    #   15s silence -> warning
    #   25s silence -> end call
    INACTIVITY_NUDGE_SECS = 7
    INACTIVITY_WARNING_SECS = 15
    INACTIVITY_END_SECS = 25
    _name = candidate_first_name or candidate_name
    _SOFT_NUDGE_TEXT = f"Take your time, {_name}. I'm here when you're ready."
    _INACTIVITY_WARNING_TEXT = (
        f"Are you still there, {_name}? I'll go ahead and wrap up shortly if I don't hear from you."
    )
    _INACTIVITY_END_TEXT = (
        f"I'll go ahead and end the session here. "
        f"It was great speaking with you, {_name}. All the best!"
    )
    inactivity_warning_sent_for_current_prompt = False
    inactivity_end_sent_for_current_prompt = False
    async def _deliver_nudge(text: str) -> None:
        # Scripted speech should not behave like a new interview question. Preserve
        # the original silence timer across the nudge audio so 10/20/30/50/60s
        # thresholds are measured from the candidate's first chance to answer.
        nonlocal awaiting_candidate_response, awaiting_candidate_since, inactivity_nudge_speaking
        inactivity_nudge_speaking = True
        try:
            await session.say(text, allow_interruptions=True)
        finally:
            inactivity_nudge_speaking = False
        awaiting_candidate_response = True
        if awaiting_candidate_since is None:
            awaiting_candidate_since = time.monotonic()
    async def _send_termination_signal(reason: str):
        try:
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
        # --- T-20s: closing trigger ---
        if remaining <= CLOSING_TRIGGER_SECS and not _closing_triggered:
            _closing_triggered = True
            logger.info("[CLOSING] Triggered at remaining=%.1fs", remaining)
            _goodbye_candidate = (
                f"Sorry to interrupt — we're coming up on time, so I'll wrap up here. "
                f"It was great speaking with you, {candidate_first_name or candidate_name}. "
                "Thanks so much for your time, and we'll be in touch soon!"
            )
            _goodbye_silence = (
                f"We're just about at time, so I'll wrap up here. "
                f"It was great speaking with you, {candidate_first_name or candidate_name}. "
                "Thanks so much for your time, and we'll be in touch soon!"
            )
            try:
                if is_candidate_speaking or is_agent_speaking:
                    session.interrupt()
                    await asyncio.sleep(0.3)
                    await session.say(_goodbye_candidate, allow_interruptions=False)
                else:
                    await session.say(_goodbye_silence, allow_interruptions=False)
            except Exception as e:
                logger.warning("[CLOSING] Goodbye delivery failed: %s", e)
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
            and not agent._waiting_for_eval
        )
        # Log timing every 5 seconds so we can verify nudge schedule
        if int(inactivity_elapsed) % 5 == 0 and inactivity_elapsed >= 5:
            logger.debug(f"[NUDGE_TIMING] elapsed={inactivity_elapsed:.1f}s silent={_silence_active} agent_speaking={is_agent_speaking} candidate_speaking={is_candidate_speaking}")
        # 7s silence -> soft nudge (fires once per prompt)
        if _silence_active and inactivity_elapsed >= INACTIVITY_NUDGE_SECS and inactivity_elapsed < INACTIVITY_WARNING_SECS and not inactivity_nudge_sent_for_current_prompt:
            try:
                logger.info("[NUDGE_FIRE] 7s nudge at %.1fs elapsed", inactivity_elapsed)
                spawn_background_task(_deliver_nudge(_SOFT_NUDGE_TEXT), "inactivity_nudge")
                inactivity_nudge_sent_for_current_prompt = True
                logger.info("[NUDGE] Soft nudge sent at %.1fs silence", inactivity_elapsed)
            except Exception as e:
                logger.warning(f"[NUDGE] Failed to deliver soft nudge: {e}")
        # 15s silence -> warning (fires once per prompt)
        if _silence_active and inactivity_elapsed >= INACTIVITY_WARNING_SECS and inactivity_elapsed < INACTIVITY_END_SECS and not inactivity_warning_sent_for_current_prompt:
            try:
                logger.info("[NUDGE_FIRE] 15s warning at %.1fs elapsed", inactivity_elapsed)
                spawn_background_task(_deliver_nudge(_INACTIVITY_WARNING_TEXT), "inactivity_warning")
                inactivity_warning_sent_for_current_prompt = True
                logger.info("[NUDGE] Warning sent at %.1fs silence", inactivity_elapsed)
            except Exception as e:
                logger.warning(f"[NUDGE] Failed to deliver warning: {e}")
        # 25s silence -> end call (fires once per prompt)
        if _silence_active and inactivity_elapsed >= INACTIVITY_END_SECS and not inactivity_end_sent_for_current_prompt:
            logger.info("[NUDGE_FIRE] 25s END at %.1fs elapsed", inactivity_elapsed)
            logger.info("[NUDGE] Ending interview due to inactivity (%.1fs)", inactivity_elapsed)
            try:
                await session.say(_INACTIVITY_END_TEXT, allow_interruptions=False)
                await asyncio.sleep(3.0)
            except Exception as e:
                logger.warning("[NUDGE] Failed to deliver inactivity ending line: %s", e)
            inactivity_end_sent_for_current_prompt = True
            await _send_termination_signal("inactivity_timeout")
            interview_marked_finished = True
            interview_finished_event.set()
            disconnect_event.set()
            break
        await asyncio.sleep(1)
    # Check if we exited because of finish/disconnect or because time ran out
    time_expired = not finished_task.done() and not disconnected_task.done()
    if time_expired:
        # Goodbye was already spoken at T-20s inside the loop. Just signal disconnect.
        logger.info(f"[CLOSING] Session ended at time limit ({time_limit_mins}m)")
        await asyncio.sleep(3.0)  # allow TTS to finish before disconnecting
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
    )
    # AI Scorecard -- run inline (awaited) so it completes before teardown cancels background tasks
    if session_start_time:
        _final_scores    = list(answer_scores)
        _transcript_snap = list(transcript_lines)
        _proctoring_snap = dict(proctoring_data) if proctoring_data else {}
        if _is_test_session and _skip_report:
            # ponytail: test session with report disabled — skip all LLM report/summary calls
            logger.info("[REPORT] Skipped (test session with skipReport=True) for %s", app_id)
        else:
            # REC-04: report and summary are independent — run in parallel.
            scores_context = None
            async def _run_report_then_summary() -> None:
                nonlocal scores_context
                try:
                    logger.info("[REPORT] Generating with answer_scores=%d turns", len(_final_scores))
                    async with asyncio.timeout(300):
                        scores_context = await generate_interview_report(
                            app_id,
                            _transcript_snap,
                            _final_scores,
                            job_title,
                            proctoring_data=_proctoring_snap,
                            org_id=org_id,
                            _LLM_DEFAULT=str(ctx_data.llmInterviewReport).strip(),
                            jd_json=_coerce_jsonish(extracted_details) if extracted_details else None,
                            topic_records=list(_topic_records),
                            candidate_name=candidate_name,
                        )
                    logger.info("[REPORT] Completed. scores_context keys=%s",
                                list(scores_context.keys()) if scores_context else None)
                except asyncio.TimeoutError:
                    logger.warning(f"[REPORT] Timed out for {app_id} after 5 min")
                except Exception as e:
                    logger.error(f"[REPORT] Failed for {app_id}: {e}")
                # Summary runs immediately after report regardless of report success/failure
                try:
                    async with asyncio.timeout(60):
                        await generate_interview_summary(
                            app_id,
                            _transcript_snap,
                            job_title,
                            org_id=org_id,
                            _LLM_DEFAULT=analysis_model,
                            scores_context=scores_context,
                            candidate_name=candidate_name,
                        )
                except asyncio.TimeoutError:
                    logger.warning(f"[SUMMARY] Timed out for {app_id} after 60s")
                except Exception as e:
                    logger.error(f"[SUMMARY] Failed for {app_id}: {e}")
            await _run_report_then_summary()
    # Queue accumulated eval/brief/llmgen LLM usage before writing the exact
    # interview snapshot so recent-interview rows match the org-level totals.
    for _eval_usage in _eval_llm_usages_accumulated:
        await persist_org_manual_billing_usage(org_id, "interview", _eval_usage)
    for _brief_usage in _brief_llm_usages:
        await persist_org_manual_billing_usage(org_id, "interviewBrief", _brief_usage)
    for _gen_usage in _llmgen_llm_usages:
        await persist_org_manual_billing_usage(org_id, "interviewLLMGeneration", _gen_usage)
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
            stt_model=str(ctx_data.sttModel),
            plugin_tts_characters=billable_tts_characters,
            plugin_tts_audio_seconds=plugin_tts_audio_seconds,
            plugin_stt_audio_seconds=plugin_stt_audio_seconds,
        )
    except Exception as e:
        logger.error(f"[USAGE] Failed to persist interview billing snapshot for {app_id}: {e}")
        raise
    await flush_pending_manual_billing(org_id)
    # For test sessions: write cost metrics to testBillingMetrics column
    if _is_test_session:
        try:
            pool = await __import__("interview.agent_persistence", fromlist=["DatabasePool"]).DatabasePool.get()
            _usage_snap = latest_session_usage or session.usage
            _llm_in  = getattr(_usage_snap, "input_tokens",  0) or 0
            _llm_out = getattr(_usage_snap, "output_tokens", 0) or 0
            # rough cost estimate (GPT-4o pricing, update if model changes)
            _llm_cost = round((_llm_in * 2.5 + _llm_out * 10) / 1_000_000, 6)
            _tts_cost = round((billable_tts_characters or 0) * 0.000015, 6)
            _stt_cost = round((plugin_stt_audio_seconds or 0) * 0.0043 / 60, 6)
            async with pool.acquire() as _conn:
                await _conn.execute(
                    """UPDATE "Interview" SET "testBillingMetrics" = $1::jsonb, "updatedAt" = NOW()
                       WHERE "applicationId" = $2""",
                    json.dumps({
                        "skipReport": _skip_report,
                        "llmCost": _llm_cost,
                        "ttsCost": _tts_cost,
                        "sttCost": _stt_cost,
                        "llmInputTokens": int(_llm_in),
                        "llmOutputTokens": int(_llm_out),
                        "ttsChars": int(billable_tts_characters or 0),
                        "sttSeconds": round(float(plugin_stt_audio_seconds or 0), 1),
                        "ttsProvider": org_tts_provider,
                        "sttProvider": "deepgram",
                        "llmProvider": "openai",
                        "evaluationRuns": len(_eval_llm_usages_accumulated),
                        "briefGenerations": len(_brief_llm_usages),
                        "llmGenerations": len(_llmgen_llm_usages),
                        "evalInputTokens": sum(u.get("inputTokens", 0) for u in _eval_llm_usages_accumulated),
                        "evalOutputTokens": sum(u.get("outputTokens", 0) for u in _eval_llm_usages_accumulated),
                        "briefInputTokens": sum(u.get("inputTokens", 0) for u in _brief_llm_usages),
                        "briefOutputTokens": sum(u.get("outputTokens", 0) for u in _brief_llm_usages),
                        "llmgenInputTokens": sum(u.get("inputTokens", 0) for u in _llmgen_llm_usages),
                        "llmgenOutputTokens": sum(u.get("outputTokens", 0) for u in _llmgen_llm_usages),
                    }),
                    app_id,
                )
            logger.info("[TEST_BILLING] Saved metrics for %s | llm=$%.4f tts=$%.4f stt=$%.4f",
                        app_id, _llm_cost, _tts_cost, _stt_cost)
        except Exception as _tb_err:
            logger.warning("[TEST_BILLING] Failed to save metrics: %s", _tb_err)
        # Local test session -- push a full per-turn debug PDF to Slack for bug triage.
        logger.info("[DEBUG_REPORT] Test session complete — generating and sending debug PDF to Slack...")
        try:
            from interview.debug_report import generate_and_send_debug_report
            await generate_and_send_debug_report(
                app_id=app_id,
                candidate_name=candidate_name,
                job_title=job_title,
                answer_scores=list(answer_scores),
                topic_pool=list(_interview_brief.topic_pool),
                covered_topics=_covered_topic_keys.coverage_rows(),
                topic_records=list(_topic_records),
            )
        except Exception as _pdf_err:
            logger.error("[DEBUG_REPORT] Outer exception sending debug PDF: %s", _pdf_err, exc_info=True)
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
