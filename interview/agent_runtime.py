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
from billing.billing import (
    flush_billing as flush_pending_manual_billing,
    record_manual_usage as persist_org_manual_billing_usage,
    save_interview_billing as persist_interview_billing_snapshot,
    save_org_usage_metrics as persist_org_usage_metrics,
)
from openai import AsyncOpenAI
from pydantic import BaseModel, field_validator

import re as _re
from dataclasses import dataclass
from enum import Enum

class CoverageSource(str, Enum):
    EXPLICIT  = "explicit"    # agent explicitly moved on after probing
    AUTO_SKILL = "auto_skill" # skill inferred from a project's [tech] brackets
    CUSTOM_Q  = "custom_q"    # recruiter-supplied custom question was answered

@dataclass
class CoverageRecord:
    short_key:     str
    display_title: str
    source:        CoverageSource
    gist:          str = ""          # first ~25 words of candidate answer; "" for auto
    via_topic:     str = ""          # parent topic title when source == AUTO_SKILL

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
        return _re.sub(r"[^a-z0-9]+", " ", short.lower()).strip()

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

    def get_memory_block(self, *, limit: int = 10) -> str:
        """
        Returns a formatted block for LLM directive injection.

        Example output:
          [COVERAGE MEMORY — already discussed, do not re-open]
          - DataFlow Project: candidate described Kafka pipeline, Python as primary tech
          - python (via DataFlow Project): covered in-depth during project — skip standalone
          - custom Q "conflict resolution": candidate described mediation approach
        """
        if not self._store:
            return ""
        lines: list[str] = []
        for rec in list(self._store.values())[-limit:]:
            if rec.source == CoverageSource.AUTO_SKILL and rec.via_topic:
                detail = f"covered in-depth during {rec.via_topic} discussion — skip standalone question"
                lines.append(f"- {rec.display_title} (via {rec.via_topic}): {detail}")
            elif rec.source == CoverageSource.CUSTOM_Q:
                gist_part = f": {rec.gist}" if rec.gist else ""
                lines.append(f"- custom Q \"{rec.display_title}\"{gist_part}")
            else:
                gist_part = f": {rec.gist}" if rec.gist else ""
                lines.append(f"- {rec.display_title}{gist_part}")
        body = "\n".join(lines)
        return (
            "[COVERAGE MEMORY — already discussed, do not re-open]\n"
            f"{body}\n"
            "If candidate revisits a covered topic, acknowledge with the context above "
            "('Yes, we covered X during Y — I have a clear picture, let\'s move on') "
            "and redirect to the active topic. Do NOT probe a covered topic again.\n"
        )

# Module-level singleton — reuses the HTTP/2 connection pool and TLS session
# across all eval, directive, and brief calls for every interview session.
# Creating AsyncOpenAI() per-session causes a cold TLS handshake on the first
# call of each session, adding 50–200ms. One shared client eliminates that.
_SHARED_OPENAI_CLIENT: AsyncOpenAI = AsyncOpenAI()
from interview.agent_runtime_helpers import (
    _build_recent_context_block,
    _single_question_transform,
    _tts_acronym_transform,
    polish_candidate_facing_text,
    remove_system_messages,
    remove_system_messages_multi,
    tts_phonetic_processor,
)
from interview.agent_runtime_support import (
    INTERVIEW_TEMPERATURE,
    DEFAULT_VOICE_ID,
    EVAL_LLM_MODEL,
    INTERVIEW_LLM_MODEL,
    VOICE_REGISTRY,
    FIXED_INTERVIEW_DURATION_MINUTES,
    STT_MODEL,
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
def _build_secondary_directive(secondary: dict, *, job_title: str) -> str:
    """Build the [NEXT_TURN_DIRECTIVE] for a SECONDARY-PHASE move (used when the
    primary resume/skill pool is exhausted but time remains, so the agent keeps the
    interview going instead of wrapping up early).
    phase = "deepen"      -> go deeper on a strong topic the candidate answered well
    phase = "jd_scenario" -> turn a JD must-have skill into a real situational question
    phase = "soft"        -> a warm, always-answerable wind-down question
    """
    phase = secondary.get("phase")
    if phase == "deepen":
        topic = secondary.get("topic", "")
        title = _topic_short_title(topic)
        return (
            "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
            "DECISION: DEEPEN\n"
            f"TOPIC CONTEXT: {topic}\n"
            f"The candidate answered well on {title} earlier. You have time -- go DEEPER now.\n"
            "Ask ONE harder follow-up that pushes past the surface: a real tradeoff they made,\n"
            "what broke or almost broke, a number/scale, or what they would change if rebuilding it.\n"
            "Do NOT re-ask what they already told you -- build on it. ONE question. Sound curious, not repetitive.\n"
            "Do NOT wrap up or say goodbye -- the interview is still in progress."
        )
    if phase == "jd_scenario":
        skill = secondary.get("topic", "")
        return (
            "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
            "DECISION: JD_SCENARIO\n"
            f"JD REQUIREMENT: {skill}\n"
            f"This is a must-have for the {job_title or 'role'}. Turn it into a REAL situational question --\n"
            "not 'have you used X?'. Ask how they would approach a concrete task that needs this skill,\n"
            "e.g. 'If you had to set up X for a new campaign from scratch, how would you start?'\n"
            "If they clearly have no idea, accept it briefly and the next turn will move on.\n"
            "ONE question. Practical and concrete. Do NOT wrap up or say goodbye."
        )
    # soft
    q = secondary.get("question", "What are you most excited to work on next?")
    return (
        "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
        "DECISION: SOFT\n"
        "You have time left and the resume/JD topics are covered. Keep it warm and human.\n"
        f"Ask this (or a close natural variant): \"{q}\"\n"
        "ONE question. Friendly, low-pressure. Do NOT wrap up or say goodbye yet."
    )
async def _generate_probe_directive(
    *,
    signal: Optional[str],
    signal_reason: Optional[str],
    band: str,
    active_topic: str,
    topic_item: Optional[Any],
    prev_question: str,
    prev_answer: str,
    topic_follow_ups: int,
    is_closing_tier: bool,
    topic_denied: bool,
    coverage_memory: str,
    asked_questions_log: list[str],
    topic_transcript: list[str],
    client: Any,
    llm_model: str = "gpt-4.1-mini",
    usage_sink: Optional[Any] = None,
) -> str:
    """
    Builds a probe directive that tells the interview LLM what SIGNAL fired,
    what it means, what ANGLE to pursue, and what the probe family demands.
    No scripted question — Ishita generates the question herself from the
    live conversation, guided by the signal context and family definition.
    """
    import logging as _logging
    from interview.probe_strategy import get_probe_context
    _log = _logging.getLogger("interview-agent")

    # -- Topic brief block --
    _topic_ctx = ""
    if topic_item is not None:
        parts = [f"TOPIC: {topic_item.title}"]
        if topic_item.full_description:
            parts.append(f"WHAT THIS IS: {topic_item.full_description}")
        if topic_item.probe_focus:
            parts.append(f"INTERESTING ANGLES: {', '.join(topic_item.probe_focus)}")
        if topic_item.probe_avoid:
            parts.append(f"SKIP: {', '.join(topic_item.probe_avoid)}")
        if topic_item.why_relevant:
            parts.append(f"WHY THIS MATTERS: {topic_item.why_relevant}")
        _topic_ctx = "\n".join(parts)
    else:
        _topic_ctx = f"TOPIC: {active_topic}"

    # -- Conversation thread (last 8 lines so directive LLM sees full back-and-forth) --
    _thread = "\n".join(topic_transcript[-8:]) if topic_transcript else (
        f"Interviewer: {prev_question}\nCandidate: {prev_answer}"
    )

    _asked = "\n".join(f"  - {q}" for q in asked_questions_log[-6:])

    # -- Signal probe context from probe_strategy --
    _probe_ctx = get_probe_context(
        signal=signal,
        signal_reason=signal_reason,
        band=band,
        topic_follow_ups=topic_follow_ups,
        is_closing_tier=is_closing_tier,
        topic_denied=topic_denied,
        prev_answer=prev_answer,
    )

    _system = (
        "You are a senior interviewer coach writing a PRIVATE DIRECTIVE for Ishita, an AI interviewer.\n"
        "This directive is NEVER spoken aloud. Ishita reads it, then generates her OWN question\n"
        "from the live conversation. She does not copy your words.\n\n"
        "YOUR JOB: Tell Ishita what the signal means, what angle to pursue, and what to find out.\n"
        "Do NOT write a question. A scripted question makes her sound robotic.\n\n"
        "Output format (plain text, no markdown):\n"
        "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
        f"DECISION: PROBE ({(signal or 'depth').upper()})\n"
        "WHAT THE CANDIDATE REVEALED: 1-2 lines — what is interesting, missing, or suspicious in what they just said\n"
        "ANGLE TO PURSUE: The specific thread worth pulling — reference their actual words, not a generic description\n"
        "INTENT: What Ishita is trying to find out and why this angle matters right now\n"
        "FORBIDDEN: 1-2 specific things NOT to do this turn\n\n"
        "Rules:\n"
        "- NO question ever. Ishita generates the question herself.\n"
        "- ANGLE must quote or reference something from the conversation thread — never generic.\n"
        "- One angle only. Sharp and specific beats broad and general."
    )

    _user = (
        f"BAND: {band.upper()}\n\n"
        f"TOPIC BRIEF:\n{_topic_ctx}\n\n"
        f"CONVERSATION THREAD:\n{_thread}\n\n"
        f"SIGNAL & PROBE CONTEXT:\n{_probe_ctx}\n\n"
        + (f"QUESTIONS ALREADY ASKED (do NOT repeat these angles):\n{_asked}\n\n" if _asked else "")
        + (f"{coverage_memory}\n" if coverage_memory else "")
        + "Write the directive now."
    )

    try:
        chunks: list[str] = []
        _usage = None
        async with asyncio.timeout(8.0):
            stream = await client.chat.completions.create(
                model=llm_model,
                messages=[
                    {"role": "system", "content": _system},
                    {"role": "user",   "content": _user},
                ],
                temperature=0.3,
                max_tokens=400,
                stream=True,
                stream_options={"include_usage": True},
                store=True,
                metadata={"call_type": "probe_directive", "band": band, "signal": signal or "none"},
                prediction={"type": "content", "content": (
                    "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                    f"DECISION: PROBE ({(signal or 'depth').upper()})\n"
                    "WHAT THE CANDIDATE REVEALED: "
                )},
            )
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    chunks.append(chunk.choices[0].delta.content)
                if getattr(chunk, "usage", None):
                    _usage = chunk.usage
        if usage_sink and _usage:
            from billing.billing import extract_usage as _extract_usage  # noqa: PLC0415
            usage_sink(_extract_usage(_usage, llm_model))
        generated = "".join(chunks).strip()
        if not generated:
            raise ValueError("empty probe directive")
        _log.info("[PROBE_LLM] Generated | topic=%r signal=%s | %d chars",
                  active_topic[:60], signal or "none", len(generated))
        return generated

    except Exception as exc:
        _log.warning("[PROBE_LLM] generation failed (%s) — fallback", exc)
        _thread_fallback = "\n".join(topic_transcript[-4:]) if topic_transcript else (
            f"Interviewer: {prev_question}\nCandidate: {prev_answer}"
        )
        _signal_line = f"SIGNAL: {signal} — {signal_reason}" if signal else "No specific signal detected."
        return (
            f"[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
            f"DECISION: PROBE ({(signal or 'depth').upper()})\n"
            f"WHAT THE CANDIDATE REVEALED: Their answer left something specific unresolved.\n"
            f"{_signal_line}\n"
            f"ANGLE TO PURSUE: Find the most concrete or surprising thing in their last answer and pull that thread.\n"
            f"INTENT: Understand what they actually did or decided — not just what they say they did.\n"
            f"CONVERSATION THREAD:\n{_thread_fallback}\n"
            f"FORBIDDEN: Do not ask a generic question. Do not repeat an already-asked angle."
        )


async def _generate_move_on_directive(
    *,
    old_topic_title: str,
    new_topic: str,
    new_topic_title: str,
    source: str,
    band: str,
    llm_brief: str,
    memory_block: str,
    cross_ref_rule: str,
    client: Any,
    llm_model: str = "gpt-4.1-mini",
    usage_sink: Optional[Any] = None,
    topic_item: Optional[Any] = None,  # TopicItem from InterviewBrief — enriches directive
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
        if topic_item.why_relevant:
            parts.append(f"WHY RELEVANT: {topic_item.why_relevant}")
        if topic_item.probe_focus:
            parts.append(f"PROBE FOCUS: {', '.join(topic_item.probe_focus)}")
        if topic_item.probe_avoid:
            parts.append(f"PROBE AVOID: {', '.join(topic_item.probe_avoid)}")
        if topic_item.impact:
            parts.append(f"IMPACT: {topic_item.impact}")
        _brief_context = "\n".join(parts)
    elif llm_brief:
        new_title_lc = new_topic_title.lower()
        brief_lines = llm_brief.split("\n")
        for i, line in enumerate(brief_lines):
            if new_title_lc in line.lower():
                start = max(0, i - 1)
                end = min(len(brief_lines), i + 6)
                _brief_context = "\n".join(brief_lines[start:end]).strip()
                break
        if not _brief_context:
            _brief_context = llm_brief[:800]
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
    # Tag-based framing — the tag tells us what the candidate knows and how to open
    if source in ("RESUME_TOPIC", "resume_project", "resume_skill"):
        # Candidate has direct experience here. Ask about what they built/did.
        _name_clause = (
            "name the project (NOT any company -- this is a standalone personal project)"
            if _is_standalone else
            "name the specific project or role"
        )
        _angle_guide = (
            f"Tag: RESUME_TOPIC — the candidate has direct experience here.\n"
            f"Frame as: what they personally built, their specific role, a decision they made, or what broke.\n"
            f"Open by naming {_name_clause} and asking one concrete question grounded in it.\n"
            f"NEVER say 'you mentioned' or 'on your resume' — just ask naturally about the work.\n"
            f"NEVER open generically. Every word must be specific to {new_topic_title}."
        )
    elif source in ("JD_TOPIC", "jd_skill"):
        # Candidate has NOT claimed this. Ask neutrally — the role requires it.
        _angle_guide = (
            f"Tag: JD_TOPIC — this is required by the role, but the candidate has not claimed it on their resume.\n"
            f"Frame as: the role requires this, curious about their exposure.\n"
            f"Example framing: 'This role works a lot with {new_topic_title} — what's your experience there?'\n"
            f"or: 'How have you approached {new_topic_title} in your work?'\n"
            f"NEVER say 'you listed', 'you claimed', 'on your resume', or assume prior experience.\n"
            f"If they say they haven't used it, accept that and move on — do not grill them."
        )
    elif source in ("ROLE_TOPIC", "role_topic"):
        # Role knowledge check — not from resume or JD. Ask about understanding/approach.
        _probe_focus_str = "; ".join(topic_item.probe_focus[:3]) if (topic_item and topic_item.probe_focus) else ""
        _role_desc = (topic_item.full_description if topic_item else "") or new_topic
        _angle_guide = (
            f"Tag: ROLE_TOPIC — this is a role-depth check from expert knowledge, not from the resume or JD.\n"
            f"Frame as: curious about their understanding or approach, not interrogating experience.\n"
            f"Context: {_role_desc}\n"
            f"Angle: {_probe_focus_str or 'what they know, how they think about it, any real usage'}\n"
            f"NEVER expose the internal topic label. Ask a grounded, specific question — not 'what do you know about X?'.\n"
            f"Example framing: 'How do you think about [specific aspect of {new_topic_title}] in practice?'"
        )
    else:
        _angle_guide = (
            f"Open with a specific, grounded question about {new_topic_title} based on the brief context above."
        )
    _system = (
        "You are writing an internal directive for an AI interviewer named Ishita. "
        "This directive is NEVER spoken aloud -- it is a system instruction she reads and acts on silently. "
        "Your job: write the full [NEXT_TURN_DIRECTIVE] block for a MOVE_ON moment.\n\n"
        "The directive must include:\n"
        "1. DECISION: MOVE_ON\n"
        "2. TOPIC YOU ARE LEAVING: <old topic> -- CLOSED. Do NOT reference it.\n"
        "3. NEW ACTIVE TOPIC: <new topic>\n"
        "4. WHAT WE KNOW: bullet points from the analyst brief about the new topic\n"
        "5. OPENING ANGLE: specific guidance on what angle Ishita should take -- what makes this topic interesting, "
        "what is worth probing, what the analyst brief flagged\n"
        "6. TRANSITION RULE: how to open (one short acknowledgement + natural question -- no 'Next up:', "
        "no 'Moving on to:', no 'Tell me about X what did you work on there?')\n"
        "7. FORBIDDEN PHRASES: list what Ishita must NOT say\n\n"
        "Then write the OPENING QUESTION Ishita should ask -- labeled as:\n"
        "SUGGESTED OPENING QUESTION: <question>\n\n"
        "The question must:\n"
        "- Be specific (name the project, tool, or a concrete detail). Only name a COMPANY\n"
        "  if the context explicitly links the topic to that employer -- never guess an\n"
        "  employer for a standalone/personal project (see ATTRIBUTION GUARD if present).\n"
        "- Sound natural and curious -- not like a checklist item\n"
        "- NEVER start with 'Can you' or 'Could you' -- sounds like a form, not a person\n"
        "- Ask like someone genuinely curious about this specific topic and this specific person\n"
        "- The opening question must emerge from the context above, not from a template\n"
        "- Be ONE sentence only\n"
        "- Be calibrated to the band (FRESHER=surface ownership + what/why; MID=decisions+tradeoffs; SENIOR=strategy+judgment)\n\n"
        "Output the directive as plain text. No markdown. No code blocks."
    )
    _user = (
        f"BAND: {band.upper()}\n"
        f"LEAVING TOPIC: {old_topic_title}\n"
        f"NEW TOPIC: {new_topic_title}\n"
        f"NEW TOPIC FULL CONTEXT: {new_topic}\n"
        f"SOURCE: {source}\n\n"
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
        if source in ("JD_TOPIC", "jd_skill") and re.search(
            r"\b(you listed|you claimed|on your resume|in your resume|listed .*resume|resume .*listed)\b",
            generated,
            flags=re.I,
        ):
            raise ValueError("generated JD-only directive used resume-claim phrasing")
        # Wrap in standard header/footer and append memory + cross-ref blocks
        directive = (
            "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
            + generated
            + "\n\nACKNOWLEDGEMENT RULES:\n"
            "  - Start with ONE natural micro-reaction, 3-8 words, based on what the candidate just said.\n"
            "  - Use varied human fillers: 'Right, that makes sense.', 'Hmm, okay.', 'Ah, okay.', "
            "'Oh, interesting.', 'Fair enough.', 'No worries.'\n"
            "  - For vague answers use 'Hmm, okay...' before clarifying. For honest gaps use 'Fair enough.' or 'No worries.'\n"
            "  - Do not repeat the same acknowledgement two turns in a row.\n"
            "  - NEVER say 'Thanks for sharing', 'Thanks for clarifying', or any 'thanks for [verb]ing' phrase.\n"
            "  - NEVER end a sentence with 'hmm', 'umm', 'ahh', 'ohh', 'right', or 'yeah'.\n"
            f"  - NEVER reference the old topic '{old_topic_title}' -- it is closed.\n"
            "  - DO NOT wrap up, say goodbye, or add any closing phrase.\n"
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
                        # No sentence boundary found but buffer is large — push now
                        # so TTS starts generating instead of waiting for a period that
                        # may never come (e.g. LLM response with no punctuation).
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
    orgLocation: Optional[str] = None
    driveLocation: Optional[str] = None
    aiName: Optional[str] = "Ishita"
    voiceId: Optional[str] = None
    voiceProvider: Optional[str] = None
    voiceModel: Optional[str] = None
    deepgramModel: Optional[str] = None
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
    interview_llm_model: str = INTERVIEW_LLM_MODEL
    interview_llm_temperature: float = INTERVIEW_TEMPERATURE
    analysis_model = EVAL_LLM_MODEL
    lang_codes = _LANGUAGE_CODES.get(interview_lang)
    if not lang_codes:
        raise RuntimeError(f"Unsupported interview language in DB: {interview_lang}")
    _eval_llm_usages_accumulated: list[dict] = []
    logger.info(
        "[BRIEF] Generating interview brief | candidate=%s role=%s",
        candidate_first_name or candidate_name, job_title,
    )
    _brief_openai_client: AsyncOpenAI = _SHARED_OPENAI_CLIENT
    _title_lc = (job_title or "").lower()
    if any(w in _title_lc for w in ("senior", "lead", "staff", "principal", "architect", "vp", "head")):
        _band_seed = "senior"
    elif any(w in _title_lc for w in ("junior", "intern", "trainee", "fresher", "entry", "graduate")):
        _band_seed = "fresher"
    elif any(w in _title_lc for w in ("mid", "ii", "iii", "2", "3")):
        _band_seed = "mid"
    else:
        _band_seed = "mid"
    _interview_brief: InterviewBrief = await generate_interview_brief(
        candidate_name=candidate_first_name or candidate_name,
        job_title=job_title,
        candidate_band=_band_seed,
        resume_json=structured_resume if isinstance(structured_resume, dict) else {},
        jd_data=extracted_details or {},
        custom_questions=_interview_questions or [],
        openai_client=_brief_openai_client,
        # brief uses its own fast model (gpt-4.1), not the eval model
        usage_sink=_eval_llm_usages_accumulated.append,
    )
    # Use the LLM's band assessment — more accurate than mechanical inference
    candidate_band = _interview_brief.candidate_band
    logger.info("[FLOW] Band=%s | candidate=%s | role=%s", candidate_band, candidate_name, job_title)
    # Convenience views directly from InterviewBrief — no wrapper objects needed
    _brief_skills    = [t.title for t in _interview_brief.topic_pool if t.topic_type == "skill"]
    _brief_projects  = [t.title for t in _interview_brief.topic_pool if t.topic_type == "project"]
    _brief_work      = [t.title for t in _interview_brief.topic_pool if t.topic_type == "work"]
    _anchor_title    = _interview_brief.anchor_topic.title
    _anchor_full     = f"{_interview_brief.anchor_topic.title} - {_interview_brief.anchor_topic.full_description}"
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
    if _interview_brief.focus_areas:
        logger.info("[BRIEF] focus_areas: %s", " | ".join(_interview_brief.focus_areas))
    for _i, _t in enumerate(_interview_brief.topic_pool):
        logger.info(
            "[BRIEF] topic[%d] %-10s score=%.2f  %r  probe=%s",
            _i, _t.topic_type, _t.relevance_score, _t.title,
            ",".join(_t.probe_focus[:3]) or "-",
        )
    # Compact text block for eval layer prompt
    _candidate_llm_brief = (
        f"ROLE: {_interview_brief.role_context.role_title}\n"
        f"CANDIDATE: {_interview_brief.candidate_summary}\n"
        f"STRATEGY: {_interview_brief.interview_strategy}\n"
        f"ANCHOR: {_interview_brief.anchor_topic.title} — {_interview_brief.anchor_topic.full_description[:200]}\n"
        f"FOCUS: {', '.join(_interview_brief.focus_areas)}\n"
        f"RED FLAGS: {', '.join(_interview_brief.red_flags)}\n"
    )
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
        org_location=_compact_optional(ctx_data.orgLocation),
        drive_location=_compact_optional(ctx_data.driveLocation),
    )
    evaluation_layer_prompt = build_evaluation_layer_prompt(
        live_prompt_context=_candidate_llm_brief,
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
    stt_plugin = build_stt(language_code=lang_codes["stt"], keyterms=flux_session_keyterms)
    _tts_builder = {
        "SARVAM":     build_sarvam_tts,
        "ELEVENLABS": build_elevenlabs_tts,
        "CARTESIA":   build_cartesia_tts,
    }.get(org_tts_provider, build_cartesia_tts)
    logger.info(f"[TTS] Using %s  voice=%s model=%s", org_tts_provider, voice_id, org_tts_model)
    # For Sarvam v3: resolve the pronunciation dictionary ID once per session.
    # get_or_create_dict_id() returns the cached env-var value on subsequent calls
    # (no extra API round-trip), so this is fast after first deployment.
    _sarvam_dict_id: str | None = None
    if org_tts_provider == "SARVAM":
        from interview.sarvam_pronunciation_dict import get_or_create_dict_id as _get_dict_id
        _sarvam_api_key = os.environ.get("SARVAM_API_KEY", "")
        if _sarvam_api_key:
            _sarvam_dict_id = await _get_dict_id(_sarvam_api_key)
    tts_plugin = _tts_builder(
        language=lang_codes["tts"],
        model=org_tts_model,
        voice_id=voice_id,
        **({"dict_id": _sarvam_dict_id} if _sarvam_dict_id else {}),
    )
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
        "use_tts_aligned_transcript": False,
        # _tts_acronym_transform is skipped for Sarvam: pronunciation is handled
        # server-side via dict_id + enable_preprocessing (always-on in v3).
        # Running it for Sarvam caused double-normalization and the letter-reading bug.
        "tts_text_transforms": [
            "filter_emoji",
            *([_tts_acronym_transform] if org_tts_provider != "SARVAM" else []),
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
    _custom_q_reminder_fired: bool = False
    _covered_topic_keys = CoveredTopics()  # single source of truth — normalized lowercase keys
    # Topics whose CLOSING / reflection question has already been asked. One-shot per topic.
    # Read inside the PROBE directive builder to avoid asking the reflection question twice
    # on the same project.
    _topic_closing_fired: set[str] = set()
    _asked_questions_log: collections.deque = collections.deque(maxlen=6)  # EC-3: deque(maxlen) makes append atomic — no pop() race
    _reflection_probe_count: int = 0           # session-wide count of reflection probes used

    _first_interview_question_asked: bool = False  # True after first post-warmup AI question fires
    _awaiting_first_interview_question: bool = False  # warmup confirmed; next assistant turn must open interview
    # Secondary-phase coverage: once the primary resume/skill pool is exhausted but
    # meaningful time remains, the agent does NOT wrap up early. It progresses through
    # deepen-strong -> JD-scenario -> soft topics so the full ~20 min is used like a
    # real interview. These sets track what secondary coverage has already been used.

    _deepened_topic_keys: set[str] = set()     # topics re-opened in secondary deepening phase
    _soft_questions_asked: int = 0             # count of soft/wind-down questions used
    # Per-topic ground-truth records built at MOVE_ON time — replaces end-of-session
    # LLM transcript re-reading for skill extraction. Each entry is appended when the
    # agent closes a topic so eval scores, probe count, exit reason, and candidate
    # answers are captured while the context is live, not inferred afterward.
    _topic_records: list[dict] = []
    # Running buffer of candidate answers for the CURRENT active topic (reset on MOVE_ON)
    _current_topic_answers: list[str] = []
    # Lock protecting all shared session state that is written by background tasks.
    _session_state_lock = asyncio.Lock()
    # -- Agent-side topic tracker ----------------------------------------------
    # The agent owns topic selection -- eval only scores the current topic.
    # resume_topics and skill_topics are built once from the InterviewBrief
    # and reused every turn in the inline eval payload and topic selection.
    def _build_topic_pool() -> list[str]:
        """
        Build resume topic pool and skill topic pool from InterviewBrief.
        Topics are sorted by relevance_score (LLM-assigned), filtered by role.
        Unified single Topic Pool — RESUME_TOPIC, JD_TOPIC, and ROLE_TOPIC all in one flat list.
        Ordered by the brief's relevance_score (LLM-assigned). Anchor always first.
        Each topic is a full context string: "Title - Description [tech1, tech2]"
        """
        def _item_to_full_str(item: "TopicItem") -> str:
            desc = item.full_description.strip()
            tech = ", ".join(item.tech_stack) if item.tech_stack else ""
            if tech:
                return f"{item.title} - {desc} [{tech}]"
            return f"{item.title} - {desc}" if desc else item.title

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

    # Unified topic pool: RESUME_TOPIC + JD_TOPIC + ROLE_TOPIC in one flat list
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
        for t in _topic_pool:
            k = _topic_short_key(t)
            if not k or k == excluded_key or k in _covered_topic_keys:
                continue
            return t
        return None

    def _mark_topic_covered(topic: Optional[str], *, answer_gist: str = "") -> None:
        """Single entry point for all topic completion — covered, denied, skipped, all go here."""
        if not topic:
            return
        k = _topic_short_key(topic)
        if not k:
            return
        topic_title = topic.split(" - ")[0].strip()
        _covered_topic_keys.record(
            topic,
            source=CoverageSource.EXPLICIT,
            gist=" ".join(answer_gist.split()[:25]),
        )
        logger.info("[COVERED] topic done: %r  (total covered: %d / %d)", k, len(_covered_topic_keys), len(_topic_pool))
        # Auto-cover skills the brief says are already covered by this topic
        topic_key_lc = k.lower()
        for skill_id, covering_topic_ids in _interview_brief.skill_coverage_map.items():
            if any(_topic_short_key_for_ordering(tid).lower() == topic_key_lc for tid in covering_topic_ids):
                skill_key = _topic_short_key_for_ordering(skill_id).lower()
                if skill_key and skill_key not in _covered_topic_keys:
                    _covered_topic_keys.record(
                        skill_id,
                        source=CoverageSource.AUTO_SKILL,
                        via_topic=topic_title,
                    )
                    logger.info("[SKILL_DEDUP] auto-covered %r via %r", skill_key, topic_title)

    def _strongest_uncovered_for_deepening(exclude_key: str) -> Optional[tuple[str, float]]:
        # EC-1: _topic_states is a shared dict mutated by concurrent MOVE_ON events.
        # Take a snapshot under the lock so we iterate a stable copy, not a dict
        # that another coroutine is writing to mid-loop.
        topic_states_snap = dict(_topic_states)
        best: Optional[tuple[str, float]] = None
        for t in _topic_pool:
            k = _topic_short_key(t)
            if not k or k == exclude_key or k in _deepened_topic_keys or k in _covered_topic_keys:
                continue
            ts = topic_states_snap.get(_normalize_topic_key(k))
            score = float(ts.get("saturation_score", 0.0)) if isinstance(ts, dict) else 0.0
            if score >= 2.0 and (best is None or score > best[1]):
                best = (t, score)
        return best
    # Soft / wind-down questions for the final stretch -- band-agnostic, always answerable.
    _SOFT_QUESTIONS: list[str] = [
        "What kind of work do you most enjoy doing day-to-day?",
        "What are you actively learning or building right now?",
        "What drew you to this specific role?",
        "Where do you want to grow technically over the next year?",
        "What does your best work look like -- give me one concrete example.",
    ]
    def _select_secondary_topic(exclude_key: str) -> Optional[dict]:
        """When the topic pool is exhausted but time remains:
        (1) deepen the strongest answered topic, (2) soft question."""
        nonlocal _soft_questions_asked
        # Phase 1: deepen a strong topic (one deeper pass each).
        strong = _strongest_uncovered_for_deepening(exclude_key)
        if strong is not None:
            topic_str, _score = strong
            _deepened_topic_keys.add(_topic_short_key(topic_str))
            return {"phase": "deepen", "topic": topic_str}
        # Phase 2: soft question.
        if _soft_questions_asked < len(_SOFT_QUESTIONS):
            q = _SOFT_QUESTIONS[_soft_questions_asked]
            _soft_questions_asked += 1
            return {"phase": "soft", "question": q}
        return None
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
        prefetch_ready = bool(
            _candidate_llm_brief
            and interview_directive_cached
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
    def _candidate_meta_intent(text: str) -> Optional[str]:
        """Classify candidate turns that are about the interview itself.
        These must be handled before scoring. Otherwise a real human question
        like "what is this company about?" gets scored as a bad answer to the
        previous interview question and the agent feels like a bot.
        """
        t = re.sub(r"\s+", " ", (text or "").lower()).strip()
        if not t:
            return None
        if any(m in t for m in (
            "can you repeat", "could you repeat", "repeat that", "repeat the question",
            "say that again", "say again", "didn't get you", "didnt get you",
            "didn't hear", "didnt hear", "didn't catch", "didnt catch",
            "what was the question", "what are you asking",
        )):
            return "repeat"
        if any(m in t for m in (
            "what is this company", "what's this company", "what company is this",
            "tell me about the company", "explain me the company", "company about",
        )):
            return "company"
        if any(m in t for m in (
            "what do you mean gtm", "what is gtm", "what's gtm",
            "what do you mean by gtm", "gtm role", "what is the role",
            "explain the role", "what does this role mean",
        )):
            return "role"
        if any(m in t for m in (
            "should i use", "which tool should", "what tool should",
            "zapier or", "or some other tool", "which one should i",
        )):
            return "tool_choice"
        if any(m in t for m in (
            "can we shift", "can we change", "change the question",
            "shift to new question", "skip this", "skip the question",
            "new question",
        )):
            return "skip"
        if any(m in t for m in (
            "why are you asking", "what stage", "which stage",
            "what are you trying to collect", "what information you are trying",
        )):
            return "process"
        return None
    def _meta_answer_directive(intent: str) -> str:
        org = _compact_optional(ctx_data.orgName) or "the company"
        role = job_title or "this role"
        last_q = (_last_interviewer_question or "").strip()
        if intent == "repeat":
            return (
                "[META_QUESTION_DIRECTIVE - DO NOT SAY ALOUD]\n"
                "The candidate asked you to repeat or simplify the question.\n"
                f"Repeat this question in simpler words: \"{last_q}\"\n"
                "Do not score their request. Ask only the repeated question."
            )
        if intent == "company":
            return (
                "[META_QUESTION_DIRECTIVE - DO NOT SAY ALOUD]\n"
                "The candidate asked what the company is about. Answer like a real interviewer first.\n"
                f"Say one short sentence: \"{org} is hiring for this role, and today I'm mainly checking how your automation and GTM thinking fit the work.\"\n"
                f"Then continue with ONE concise interview question for the {role} role. Do not ignore their question."
            )
        if intent == "role":
            return (
                "[META_QUESTION_DIRECTIVE - DO NOT SAY ALOUD]\n"
                "The candidate asked what GTM/the role means. Answer first, then continue.\n"
                "Say one short sentence explaining that GTM means go-to-market: outreach, lead generation, campaign workflows, and conversion improvement.\n"
                "Then ask ONE simple question about which of those areas they have actually worked on."
            )
        if intent == "tool_choice":
            return (
                "[META_QUESTION_DIRECTIVE - DO NOT SAY ALOUD]\n"
                "The candidate is asking which tool to choose, not answering the interview question.\n"
                "Answer briefly: either Zapier or n8n can be valid; what matters is why they choose it for the workflow.\n"
                "Then ask ONE question: which tool would they choose for that workflow and why?"
            )
        if intent == "skip":
            return (
                "[META_QUESTION_DIRECTIVE - DO NOT SAY ALOUD]\n"
                "The candidate asked to change or skip the question. Respect it.\n"
                "Acknowledge naturally with a short reaction like 'Fair enough.' or 'No worries.' "
                "Then ask ONE different question from a new uncovered topic. Do not mention the skipped topic again."
            )
        return (
            "[META_QUESTION_DIRECTIVE - DO NOT SAY ALOUD]\n"
            f"The candidate asked about the interview process. Answer in one short sentence: you are mapping fit for the {role} role.\n"
            "Then ask exactly one concise question from the current stage objective."
        )
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
    ) -> None:
        nonlocal proctoring_events, _last_interviewer_question, \
            answer_scores, \
            greeting_delivered_at, \
            warmup_complete, _last_depth_decay_turn, \
            _active_topic, _covered_topic_keys, _topic_states, \
            _last_applied_eval_turn, _topic_score_histories, \
            _awaiting_first_interview_question, \
            _asked_questions_log, _reflection_probe_count, \
            _last_question_topic, _topic_records, _current_topic_answers
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
            append_transcript_line("Candidate", content)
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
            _meta_intent = _candidate_meta_intent(answer_snap)
            if _meta_intent and not is_warmup_response:
                if _meta_intent == "skip":
                    async with _session_state_lock:
                        _mark_topic_covered(_active_topic, answer_gist=answer_snap)
                        _next_after_skip = _next_uncovered_topic(exclude=_active_topic)
                        if _next_after_skip:
                            _active_topic = _next_after_skip
                            _last_question_topic = _topic_short_title(_active_topic or "")
                async with _session_state_lock:
                    answer_scores.append({
                        "question": question_snap or _last_interviewer_question or "",
                        "answer": answer_snap,
                        "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0,
                        "overall": 0.0,
                        "signals": [],
                        "concerns": [],
                        "is_meta_question": True,
                        "topic": _active_topic or "general",
                    })
                spawn_background_task(
                    persist_answer_scores(app_id, list(answer_scores)),
                    f"scores_meta_turn_{turn_snapshot}",
                )
                remove_system_messages_multi(chat_ctx, (
                    "[META_QUESTION_DIRECTIVE", "[NEXT_TURN_DIRECTIVE", "[TOPIC_LOCK", "[RECENT_CONTEXT",
                ))
                chat_ctx.add_message(
                    role="system",
                    content=_meta_answer_directive(_meta_intent),
                )
                if _meta_intent == "skip" and _active_topic:
                    _skip_topic_key = _topic_short_key(_active_topic or "")
                    _skip_topic_rule = ""
                    if _skip_topic_key in {"ai", "ai tools"}:
                        _skip_topic_rule = (
                            "\nAI SKILL RULE: Ask about actual AI tools, agents, prompts, or workflows "
                            "they have used or built. Do not ask supervised vs unsupervised learning "
                            "or any textbook AI theory."
                        )
                    chat_ctx.add_message(
                        role="system",
                        content=(
                            "[TOPIC_LOCK - CRITICAL INSTRUCTION]\n"
                            "The candidate asked to skip the previous question. Respect that.\n"
                            f"NEW ACTIVE TOPIC: {_topic_short_title(_active_topic)}\n"
                            f"FULL CONTEXT: {_active_topic}\n"
                            "Ask one different, concrete question on this new topic. Do not reference the skipped topic."
                            f"{_skip_topic_rule}"
                        ),
                    )
                logger.info(
                    "[META] turn=%d intent=%s -- skipped eval/scoring and injected response directive",
                    turn_snapshot, _meta_intent,
                )
                agent._move_on_opener_pending = False
                agent._waiting_for_eval = False
                agent._directive_ready.set()
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
            # Inject structured recent Q&A context for callbacks and follow-up context.
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
            # warmup_complete is set by _handle_completed_user_turn when candidate
            # signals readiness. _process_user_conversation_item only records the turn.
            # Start eval only after warmup has fully finished.
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
                response_latency_snap: Optional[float] = (
                    round(_answer_received_at - _question_asked_at, 3)
                    if _question_asked_at > 0 and _answer_received_at > _question_asked_at
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
                # EVAL IS THE SINGLE SOURCE OF TRUTH.
                # run_eval_and_build_directive NEVER returns None and NEVER raises:
                # recovery (slow/failed LLM) is owned inside eval, which always returns
                # a real, topic-advancing result with a serialized topic_state_dict.
                # The agent therefore has NO fallback path -- it trusts eval's return.
                _eval_result_inline: dict = await run_eval_and_build_directive(payload, _eval_openai_client)
                # -- Unpack eval result ----------------------------------------
                _action_from_eval   = str(_eval_result_inline.get("action", "PROBE")).upper()
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
                _sat_after    = _saturation.get("score", 0.0)
                _sat_thresh   = _saturation.get("threshold", 0.0)
                _is_saturated = _saturation.get("is_saturated", False)
                _weak_exit    = _saturation.get("weak_exit", False)
                _dry_topic    = _saturation.get("dry_topic", False)
                # Agent applies its own action logic on top of eval's recommendation.
                # dry_topic = consecutive low-yield answers hit cap -> always move on.
                _action = "PROBE"
                if _weak_exit or _is_saturated or _dry_topic:
                    _action = "MOVE_ON"
                elif _action_from_eval == "MOVE_ON":
                    _action = "MOVE_ON"
                # else: PROBE (default)
                logger.info(
                    "[AGENT] turn=%d | decision_logic: sat=%.1f/%.1f saturated=%s weak=%s dry=%s "
                    "eval_action=%s -> agent_action=%s",
                    turn_snapshot, _sat_after, _sat_thresh, _is_saturated, _weak_exit, _dry_topic,
                    _action_from_eval, _action
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
                    _mark_topic_covered(_old_topic, answer_gist=(payload.get("answer") or ""))
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
                            # Determine exit reason from saturation flags
                            _exit_reason = (
                                "explicit_denial" if _old_key in _covered_topic_keys
                                else "weak_exit"  if _weak_exit
                                else "saturated"  if _is_saturated
                                else "dry_topic"  if _dry_topic
                                else "eval_moveon"
                            )
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
                            logger.info(
                                "[TOPIC_RECORD] turn=%d | recorded topic=%r exit=%s probes=%d avg_overall=%.1f answers=%d",
                                turn_snapshot, _old_key, _exit_reason, _probe_count, _avg_overall, len(_topic_records),
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
                        _move_on_directive_task = asyncio.ensure_future(
                            _generate_move_on_directive(
                                old_topic_title=_pre_old_title,
                                new_topic=_next_topic,
                                new_topic_title=_topic_short_title(_next_topic),
                                source=_pre_next_src,
                                band=candidate_band,
                                llm_brief=_candidate_llm_brief,
                                memory_block="",
                                cross_ref_rule="",
                                client=_eval_openai_client,
                                llm_model=analysis_model,
                                usage_sink=_eval_llm_usages_accumulated.append,
                                topic_item=_pre_next_item,
                            )
                        )
                    # SECONDARY PHASE -- do NOT wrap up early when the primary pool is
                    # exhausted but meaningful time remains. A real interviewer uses the
                    # full window: deepen strong topics -> JD scenarios -> soft questions.
                    # Only fall through to WRAP_UP when time is genuinely low OR every
                    # secondary avenue is used up.
                    _secondary_buffer_secs = CLOSING_TRIGGER_SECS + 120  # keep ~2min of room
                    if _next_topic is None and _remaining_total_seconds_now() > _secondary_buffer_secs:
                        _old_key = _topic_short_key(_old_topic or "")
                        _secondary = _select_secondary_topic(_old_key)
                        if _secondary is not None:
                            _sec_directive = _build_secondary_directive(
                                _secondary, job_title=job_title,
                            )
                            if _secondary.get("phase") in ("deepen", "jd_scenario") and _secondary.get("topic"):
                                async with _session_state_lock:
                                    _active_topic = _secondary["topic"]
                                _last_question_topic = _topic_short_title(_active_topic or "")
                            else:
                                # SOFT phase: no resume/JD topic owns this answer. Point the
                                # active topic at a neutral label so the soft answer does NOT
                                # accumulate saturation against (and corrupt) the last real topic.
                                async with _session_state_lock:
                                    _active_topic = "general conversation"
                                _last_question_topic = "general"
                            remove_system_messages_multi(chat_ctx, ("[NEXT_TURN_DIRECTIVE", "[TOPIC_LOCK", "[RECENT_CONTEXT"))
                            chat_ctx.add_message(role="system", content=_sec_directive)
                            agent._move_on_opener_pending = True
                            logger.info(
                                "[AGENT] turn=%d | SECONDARY PHASE=%s injected (remaining=%.0fs) topic=%r",
                                turn_snapshot, _secondary.get("phase"),
                                _remaining_total_seconds_now(), _secondary.get("topic") or _secondary.get("question"),
                            )
                            logger.info("[EVAL] turn=%d | releasing LLM gate -- Ishita will speak now", turn_snapshot)
                            agent._waiting_for_eval = False
                            agent._directive_ready.set()
                            return
                    # Bug-1 fix (Change G): if everything is covered, do not loop
                    # back to a finished topic -- inject a wrap-up directive instead.
                    if _next_topic is None:
                        async with _session_state_lock:
                            _active_topic = "general conversation"
                        _last_question_topic = "general"
                        logger.info(
                            "[AGENT] turn=%d | all topics + secondary phases covered (remaining=%.0fs) -- wrap-up",
                            turn_snapshot, _remaining_total_seconds_now(),
                        )
                        _covered_list = "\n".join(
                            f"  - {k}" for k in sorted(_covered_topic_keys.keys())
                        ) or "  (none)"
                        _directive = (
                            "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                            "DECISION: WRAP_UP\n"
                            "All planned interview topics have been covered.\n"
                            "[COVERED TOPICS -- DO NOT RE-OPEN ANY OF THESE]\n"
                            f"{_covered_list}\n"
                            "Keep the conversation going naturally. Ask ONE light follow-up such as "
                            "'What kind of work are you most excited about right now?' or "
                            "'Is there anything you wish we'd had more time to talk about?'\n"
                            "HARD RULES:\n"
                            "- Do NOT re-open any covered topic.\n"
                            "- Do NOT say goodbye, thank you, all the best, or any closing phrase.\n"
                            "- The system will close the interview at the right moment."
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
                    _memory_block = _covered_topic_keys.get_memory_block()
                    # Cross-reference rule -- different phrasing depending on whether the
                    # NEW topic is a resume_skill (fair to probe depth) or jd_skill
                    # (don't quiz on theory; stay applied).
                    if _src == "resume_skill":
                        if _new_topic_title.lower() in {"ai", "ai tools"}:
                            _cross_ref_rule = (
                                "\n[CROSS-REFERENCE RULE -- applied AI skill]\n"
                                "The candidate lists AI/AI tools, but this is a broad skill. Do NOT ask textbook AI theory "
                                "such as supervised vs unsupervised learning. Ask one applied question about actual tools, "
                                "agents, prompts, automations, or workflows they have used or built. If they say they do "
                                "not know or do not remember, acknowledge once and pivot away."
                            )
                        else:
                            _cross_ref_rule = (
                                "\n[CROSS-REFERENCE RULE -- candidate may cite a covered project]\n"
                                "If the candidate cites a project already in INTERVIEW MEMORY as evidence "
                                f"for {_new_topic_title}, treat that project as KNOWN CONTEXT -- do NOT "
                                "re-introduce it ('Let's move to ...'), do NOT ask what they built in it, "
                                "and do NOT ask their role in it (already covered).\n"
                                f"They CLAIM {_new_topic_title} on their resume, so probe SKILL-LEVEL depth.\n"
                                "Pick ONE category and generate the equivalent question for the CURRENT skill:\n"
                                f"  a) Mechanic / concept  -- how a core feature of {_new_topic_title} works\n"
                                f"  b) Pitfall awareness   -- a common mistake or gotcha with {_new_topic_title}\n"
                                f"  c) Tradeoff            -- when to use {_new_topic_title} vs an alternative, or when NOT to\n"
                                f"  d) Hands-on debugging  -- how they'd debug a typical {_new_topic_title} problem\n"
                                f"  e) Internals           -- what {_new_topic_title} does under the hood\n"
                                "Calibrate to band: FRESHER -> (a)(b)(d); MID/SENIOR -> (c)(e).\n"
                                "The question must be answerable WITHOUT re-explaining the project. It tests\n"
                                "whether they actually know the skill, not just that they used it once.\n"
                                "NEVER ask a question whose answer is already in INTERVIEW MEMORY."
                            )
                    elif _src == "jd_skill":
                        _cross_ref_rule = (
                            "\n[CROSS-REFERENCE RULE -- JD-only skill, candidate does NOT claim it on resume]\n"
                            "The candidate does NOT list this skill on their resume. The opener already asks\n"
                            "whether they've worked with it. Based on their answer:\n"
                            "  - If they say NO / never used it: acknowledge briefly and let the next MOVE_ON\n"
                            "    pivot away. Do NOT push, do NOT quiz on theory.\n"
                            "  - If they say YES and cite a project (possibly one already in INTERVIEW MEMORY):\n"
                            "    stay APPLIED, not theoretical. Ask only what they actually did with it:\n"
                            f"      * 'What specifically did you use {_new_topic_title} for in that project?'\n"
                            "      * 'Did you build it from scratch or follow a tutorial?'\n"
                            "      * 'What worked, what didn't?'\n"
                            "    DO NOT ask about internals, mechanics, or theory -- they make no expertise\n"
                            "    claim, so trivia-style questions are unfair."
                        )
                    else:
                        _cross_ref_rule = (
                            "\n[CROSS-REFERENCE RULE]\n"
                            "If the candidate cites a project already in INTERVIEW MEMORY, do NOT re-open it. "
                            "Probe the NEW angle of the current topic instead."
                        )
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
                            llm_brief=_candidate_llm_brief,
                            memory_block=_memory_block,
                            cross_ref_rule=_cross_ref_rule,
                            client=_eval_openai_client,
                            llm_model=analysis_model,
                            usage_sink=_eval_llm_usages_accumulated.append,
                            topic_item=_new_topic_item,
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
                            f"{_memory_block}"
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
                    _source_lock = ""
                    if _src == "jd_skill":
                        _source_lock = (
                            "\nSOURCE RULE: This is a JD-only skill. The candidate did NOT list it on the resume. "
                            "Do NOT say or imply 'you mentioned it on your resume', 'you listed it', or "
                            "'your resume says'. Ask only whether they have worked with it.\n"
                        )
                    elif _src == "resume_skill":
                        _source_lock = (
                            "\nSOURCE RULE: This is a resume skill. It is fair to ask where they used it, "
                            "but do not re-open a covered project.\n"
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
                        "Ask ONE natural, specific question to open the new topic. "
                        "Use the SUGGESTED OPENING QUESTION in your directive above as your starting point. "
                        "Do NOT say 'Tell me about X -- what did you work on there?' -- be more specific than that. "
                        "Do not mention tools, projects, or details from the previous topic."
                    ))
                    # One-shot guard: tell the next eval cycle to skip itself so
                    # the queued MOVE_ON opener can be spoken first, before any
                    # PROBE directive overwrites it.
                    agent._move_on_opener_pending = True
                    logger.info("[AGENT] turn=%d | MOVE_ON directive injected (LLM) | new_topic=%r", turn_snapshot, _active_topic)
                    logger.debug("[MOVE_ON_DIRECTIVE] turn=%d:\n%s", turn_snapshot, _directive)
                else:
                    # -- PROBE -- LLM-driven directive using TopicItem brief context --
                    _prev_q = (payload.get("question") or "").strip()
                    _prev_a = (payload.get("answer") or "").strip()
                    _topic_follow_ups = int((_new_topic_state_dict or {}).get("follow_up_turns", 0) or 0)
                    _depth_topic_key_lc = _topic_short_key(_active_topic or "").lower()
                    _active_brief_item = next((t for t in _interview_brief.topic_pool if _topic_short_key_for_ordering(t.title).lower() == _depth_topic_key_lc), None)
                    _depth_is_resume_project = bool(_active_topic) and (_active_brief_item is None or _active_brief_item.tag == 'RESUME_TOPIC')
                    _depth_sat_score = float((_new_topic_state_dict or {}).get("saturation_score", 0.0) or 0.0)
                    _depth_sat_thresh = float((_new_topic_state_dict or {}).get("saturation_threshold", 0.0) or 0.0)
                    _depth_sat_ratio = (_depth_sat_score / _depth_sat_thresh) if _depth_sat_thresh > 0 else 0.0
                    _is_closing_on_project = (
                        _depth_is_resume_project
                        and _topic_follow_ups >= 2
                        and _depth_sat_ratio >= 0.6
                        and _depth_topic_key_lc not in _topic_closing_fired
                        and _reflection_probe_count < 2
                    )
                    if _is_closing_on_project:
                        try:
                            async with _session_state_lock:
                                _topic_closing_fired.add(_depth_topic_key_lc)
                                _reflection_probe_count += 1
                            logger.info(
                                "[AGENT] turn=%d | CLOSING tier fired for project %r (session_reflection_count=%d)",
                                turn_snapshot, _depth_topic_key_lc, _reflection_probe_count,
                            )
                        except Exception as _closing_err:
                            logger.warning("[AGENT] turn=%d | CLOSING tier setup failed: %s", turn_snapshot, _closing_err)
                            _is_closing_on_project = False
                    # Fetch TopicItem for the active topic from the brief
                    _probe_brief_item = next(
                        (t for t in _interview_brief.topic_pool
                         if _topic_short_key_for_ordering(t.title).lower() == _depth_topic_key_lc),
                        None,
                    )
                    # Build the conversation thread for this topic from the live
                    # transcript. Take the last 8 lines so the probe LLM sees the
                    # full back-and-forth, not just the most recent exchange.
                    _topic_thread_lines = lines_snap_eval[-8:] if lines_snap_eval else []
                    _directive = await _generate_probe_directive(
                        signal=_eval_signal,
                        signal_reason=_eval_signal_reason,
                        band=(payload.get("band") or candidate_band or "mid").lower(),
                        active_topic=_active_topic or "",
                        topic_item=_probe_brief_item,
                        prev_question=_prev_q,
                        prev_answer=_prev_a,
                        topic_follow_ups=_topic_follow_ups,
                        is_closing_tier=_is_closing_on_project,
                        topic_denied=_topic_short_key(_active_topic or "").lower() in _covered_topic_keys,
                        coverage_memory=_covered_topic_keys.get_memory_block(),
                        asked_questions_log=list(_asked_questions_log),
                        topic_transcript=_topic_thread_lines,
                        client=_eval_openai_client,
                        llm_model=analysis_model,
                        usage_sink=_eval_llm_usages_accumulated.append,
                    )
                    remove_system_messages_multi(chat_ctx, ("[NEXT_TURN_DIRECTIVE", "[TOPIC_LOCK", "[RECENT_CONTEXT"))
                    chat_ctx.add_message(role="system", content=_directive)
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
        _candidate_signals_ready = (
            turn_snapshot >= 2
            and not warmup_complete
            and any(m in _content_lc for m in _warmup_readiness_markers)
        )
        completing_warmup = _candidate_signals_ready
        logger.debug(
            "[USER_TURN] completed turn=%d words=%d text=%r signals_ready=%s",
            turn_snapshot,
            len(content.split()),
            content[:100],
            completing_warmup,
        )
        await _process_user_conversation_item(content, "user", turn_snapshot)
        if completing_warmup:
            warmup_complete = True
            _awaiting_first_interview_question = True
            logger.info("[WARMUP] warmup_complete=True at turn=%d (candidate signalled readiness)", turn_snapshot)
            remove_system_messages(chat_ctx, "[WARMUP PHASE]")
            remove_system_messages(chat_ctx, "[PHASE_STATUS]")
            # Inject BOTH directives now:
            # 1. WARMUP_DONE: one short acknowledgement ONLY ("Great, let's get started.")
            # 2. NEXT_TURN_DIRECTIVE: the first interview question — fires in the same LLM
            #    turn so Ishita says acknowledgement + first question together naturally,
            #    without needing a candidate response in between.
            _anchor_ctx = _active_topic or _anchor_full
            _anchor_title = _anchor_ctx.split(" - ")[0].strip()
            chat_ctx.add_message(
                role="system",
                content=(
                    "[PHASE_STATUS -- DO NOT SAY ALOUD]\n"
                    "GREETING: DONE. WARMUP: DONE.\n"
                    "DO NOT greet again, re-introduce yourself, or repeat the readiness check.\n"
                ),
            )
            chat_ctx.add_message(
                role="system",
                content=(
                    "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                    "DECISION: FIRST_QUESTION\n"
                    f"ANCHOR TOPIC: {_anchor_title}\n"
                    f"FULL CONTEXT: {_anchor_ctx[:300]}\n"
                    "YOUR RESPONSE THIS TURN:\n"
                    "  Ask your first interview question directly. Do NOT open with 'Great' or 'Perfect' alone.\n"
                    "  If you need a transition, make it a FULL SENTENCE tied to the topic, e.g.:\n"
                    f"    'Let's jump right in — [question about {_anchor_title}]?'\n"
                    f"    'Alright, let's get into it — [question about {_anchor_title}]?'\n"
                    "  The question must be specific to the anchor topic context above — not generic.\n"
                    f"  Follow the FIRST QUESTION RULE from the interview directive for band={candidate_band}.\n"
                    "  ONE question only. Do not list topics, do not explain the process.\n"
                    "  Sound natural — like a real interviewer starting a conversation, not reading a script."
                ),
            )
            logger.info(
                "[WARMUP] WARMUP COMPLETE at turn=%d | injecting first question directive | anchor=%r",
                turn_snapshot, _anchor_title,
            )
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
                _is_interview_turn = warmup_complete or turn_count > 2
                if _is_interview_turn and _is_ack_only_assistant_fragment(clean_content):
                    logger.warning("[TURN_GUARD] Ignoring acknowledgement-only assistant fragment: %r", clean_content)
                    return
                # Save Ishita's line to transcript
                append_transcript_line("Interviewer", clean_content)
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
                    _q_mentions_expected = bool(_expected_tokens) and any(
                        t in _q_lower_check for t in _expected_tokens
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
                        if _other_tokens and all(t in _q_lower_check for t in _other_tokens):
                            _drifted_to_other = True
                            break
                    # Follow-up: no explicit topic name, no other topic named, but the
                    # wording clearly continues the prior answer. This catches long
                    # questions like "you mentioned collecting data..." that were being
                    # mislabeled as general.
                    _looks_like_context_followup = (
                        not _q_mentions_expected
                        and not _drifted_to_other
                        and any(marker in _q_lower_check for marker in (
                            "you mentioned", "you said", "when you say", "when you mentioned",
                            "how did you", "what did you", "what was", "walk me through",
                            "tell me more", "can you share", "approximately", "if you were to",
                            "what kind of", "what were the", "what were you",
                        ))
                    )
                    # Pronoun follow-up: short question, no explicit topic name, no other
                    # topic named -- treat as still-on-topic.
                    _looks_like_pronoun_followup = (
                        not _q_mentions_expected
                        and not _drifted_to_other
                        and len(_q_lower_check.split()) <= 18
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
            inactivity_nudge_sent_for_current_prompt
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
        if start_waiting:
            logger.debug("[NUDGE] Inactivity clock started (awaiting candidate response)")
        else:
            logger.debug("[NUDGE] Inactivity clock cleared")
    @session.on("user_state_changed")
    def on_user_state_changed(event):
        nonlocal is_candidate_speaking
        if event.new_state == "speaking":
            is_candidate_speaking = True
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
            logger.debug("[NUDGE] AI finished speaking; waiting for assistant prompt commit")
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
                                "[PHASE_STATUS -- DO NOT SAY ALOUD]\n"
                                "GREETING: DONE. You have already said hello and introduced yourself.\n"
                                "DO NOT greet again, re-introduce yourself, or ask 'how are you doing' again.\n"
                                "CURRENT PHASE: WARMUP -- respond to what they said, briefly introduce the interview, ask if ready.\n"
                                "Do NOT mention projects, resume items, skills, companies, or specific tools yet."
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
        # 7s silence -> soft nudge (fires once per prompt)
        if _silence_active and inactivity_elapsed < INACTIVITY_WARNING_SECS and not inactivity_nudge_sent_for_current_prompt:
            try:
                spawn_background_task(_deliver_nudge(_SOFT_NUDGE_TEXT), "inactivity_nudge")
                inactivity_nudge_sent_for_current_prompt = True
                logger.info("[NUDGE] Soft nudge sent at %.0fs silence", inactivity_elapsed)
            except Exception as e:
                logger.warning(f"[NUDGE] Failed to deliver soft nudge: {e}")
        # 15s silence -> warning
        if _silence_active and inactivity_elapsed >= INACTIVITY_WARNING_SECS and inactivity_elapsed < INACTIVITY_END_SECS:
            try:
                spawn_background_task(_deliver_nudge(_INACTIVITY_WARNING_TEXT), "inactivity_warning")
                logger.info("[NUDGE] Warning sent at %.0fs silence", inactivity_elapsed)
            except Exception as e:
                logger.warning(f"[NUDGE] Failed to deliver warning: {e}")
        # 25s silence -> end call
        if _silence_active and inactivity_elapsed >= INACTIVITY_END_SECS:
            logger.info("[NUDGE] Ending interview due to inactivity (%.0fs)", inactivity_elapsed)
            try:
                await session.say(_INACTIVITY_END_TEXT, allow_interruptions=False)
                await asyncio.sleep(3.0)
            except Exception as e:
                logger.warning("[NUDGE] Failed to deliver inactivity ending line: %s", e)
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
        stt_model=STT_MODEL,
        plugin_tts_characters=billable_tts_characters,
        plugin_tts_audio_seconds=plugin_tts_audio_seconds,
        plugin_stt_audio_seconds=plugin_stt_audio_seconds,
    )
    # AI Scorecard -- run inline (awaited) so it completes before teardown cancels background tasks
    if session_start_time:
        _final_scores    = list(answer_scores)
        _transcript_snap = list(transcript_lines)
        _proctoring_snap = dict(proctoring_data) if proctoring_data else {}
        # REC-04: report and summary are independent — run in parallel.
        # generate_interview_summary builds its own content from scores_context
        # which report writes to DB; summary reads from DB via scores_context arg.
        # We run report first to get scores_context, then summary immediately after.
        # Since summary needs scores_context from report, we use a two-phase gather:
        # Phase 1: report (produces scores_context)
        # Phase 2: summary (consumes scores_context) — fired immediately after report done
        # Both phases run as background tasks so session shutdown isn't blocked.
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
                        llm_model=analysis_model,
                        jd_json=_coerce_jsonish(extracted_details) if extracted_details else None,
                        topic_records=list(_topic_records),
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
                        llm_model=analysis_model,
                        scores_context=scores_context,
                    )
            except asyncio.TimeoutError:
                logger.warning(f"[SUMMARY] Timed out for {app_id} after 60s")
            except Exception as e:
                logger.error(f"[SUMMARY] Failed for {app_id}: {e}")
        spawn_background_task(_run_report_then_summary(), "report_and_summary")
    # Queue accumulated eval/brief/directive LLM usage before writing the exact
    # interview snapshot so recent-interview rows match the org-level totals.
    for _eval_usage in _eval_llm_usages_accumulated:
        await persist_org_manual_billing_usage(org_id, "interview", _eval_usage)
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
            stt_model=STT_MODEL,
            plugin_tts_characters=billable_tts_characters,
            plugin_tts_audio_seconds=plugin_tts_audio_seconds,
            plugin_stt_audio_seconds=plugin_stt_audio_seconds,
        )
    except Exception as e:
        logger.error(f"[USAGE] Failed to persist interview billing snapshot for {app_id}: {e}")
        raise
    await flush_pending_manual_billing(org_id)
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
