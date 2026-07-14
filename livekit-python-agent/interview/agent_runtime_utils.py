"""
interview/agent_runtime_utils.py
=================================
Centralized utility module for agent runtime configuration, state management,
and common patterns. Extracted from agent_runtime_support and agent_runtime_helpers
to improve maintainability, testability, and reduce code duplication.

Architecture:
  AgentConfig         — singleton config management (env vars, voice registry)
  MutableStateManager — centralized mutable state (DB pool, billing queue)
  TextSanitizer       — all text cleaning patterns in one place
  TranscriptManager   — transcript line merging logic (O(n), not O(n²))
"""
from __future__ import annotations

import os
import logging
import re
from typing import Any, Optional, Dict

from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger("interview-agent")


# ===============================================================================
# SECTION 1 -- AgentConfig (Singleton Configuration)
# ===============================================================================

class VoiceProviderMapping(BaseModel):
    """Type-safe voice provider mapping."""
    provider: str = Field(..., pattern="^(CARTESIA|SARVAM|ELEVENLABS)$")
    model: str = Field(..., min_length=1)

    @field_validator("provider", "model", mode="before")
    @classmethod
    def strip_whitespace(cls, v: Any) -> str:
        if isinstance(v, str):
            return v.strip()
        return str(v)


class AgentConfig:
    """Singleton configuration manager for the interview agent.

    Centralizes environment variable parsing, voice registry, and model constants
    in one place. Lazy-loads environment and provides type-safe access.

    Usage:
        config = AgentConfig.get()
        stt_model = config.stt_model
        voice_info = config.get_voice_provider("ishita")
    """

    _instance: Optional[AgentConfig] = None

    def __init__(self) -> None:
        # STT Configuration -- stt_model comes from org DB, not env
        # eot_threshold: Deepgram's own docs (developers.deepgram.com/docs/flux/configuration)
        # give three use-case tiers: Natural conversation 0.7/5000ms, Low-Latency real-time
        # agents 0.7/6000ms, High-Reliability (OTP/legal) 0.85/8000ms. This was previously
        # raised to 0.80 to stop Flux cutting off candidates mid-thinking-pause, but that
        # traded into the opposite complaint -- turn-end detection feeling slow/laggy.
        # 0.7 matches Deepgram's own Low-Latency tier (real-time conversational agent,
        # not sensitive-data capture), keeping eot_timeout_ms's longer window (below) to
        # still tolerate a natural thinking pause without needing a higher confidence bar.
        self._flux_eot_threshold = float(os.environ.get("FLUX_EOT_THRESHOLD", "0.7"))
        self._flux_eager_eot_threshold_str = os.environ.get("FLUX_EAGER_EOT_THRESHOLD", "").strip()
        self._flux_eager_eot_threshold = (
            float(self._flux_eager_eot_threshold_str)
            if self._flux_eager_eot_threshold_str and self._flux_eager_eot_threshold_str.lower() != "none"
            else None
        )
        # eot_timeout_ms: kept at Deepgram's own Low-Latency-tier value (6000ms) -- this is
        # the hard ceiling before Flux forces a turn-end regardless of confidence, so it's
        # what tolerates a candidate's natural thinking pause. Lowering threshold (above)
        # should speed up detection on clearly-finished speech without needing to shrink
        # this ceiling and risk reintroducing the original mid-answer cutoff bug.
        self._flux_eot_timeout_ms = int(os.environ.get("FLUX_EOT_TIMEOUT_MS", "6000"))

        # LLM models are now per-org from DB (set via Super Admin → AI Models).
        # Only temperature is still env-configurable (not model-specific, applies globally).
        self._interview_temperature = float(os.environ.get("INTERVIEW_TEMPERATURE", "0.75"))
        self._eval_temperature = float(os.environ.get("EVAL_TEMPERATURE", "0.0"))

        # Interview Configuration
        self._fixed_interview_duration_minutes = int(os.environ.get("FIXED_INTERVIEW_DURATION_MINUTES", "20"))

        # Database & Storage
        self._database_url = os.environ.get("DATABASE_URL", "").strip()
        self._agent_name = os.environ.get("LIVEKIT_AGENT_NAME", "sreeva_agent").strip()
        self._app_base_url = (
            os.environ.get("APP_URL", "")
            or os.environ.get("NEXT_PUBLIC_APP_URL", "")
            or "https://sreevaai.com"
        ).rstrip("/")

    @classmethod
    def get(cls) -> AgentConfig:
        """Get or create singleton instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        """Reset singleton (for testing)."""
        cls._instance = None

    # -- STT Properties --
    @property
    def flux_eot_threshold(self) -> float:
        return self._flux_eot_threshold

    @property
    def flux_eager_eot_threshold(self) -> Optional[float]:
        return self._flux_eager_eot_threshold

    @property
    def flux_eot_timeout_ms(self) -> int:
        return self._flux_eot_timeout_ms

    # -- LLM Properties --
    @property
    def interview_temperature(self) -> float:
        return self._interview_temperature

    @property
    def eval_temperature(self) -> float:
        return self._eval_temperature

    # -- Interview Properties --
    @property
    def fixed_interview_duration_minutes(self) -> int:
        return self._fixed_interview_duration_minutes

    # -- Database Properties --
    @property
    def database_url(self) -> str:
        return self._database_url

    @property
    def agent_name(self) -> str:
        return self._agent_name

    @property
    def app_base_url(self) -> str:
        return self._app_base_url



# ===============================================================================
# SECTION 2 -- MutableStateManager (Centralized State Management)
# ===============================================================================

class MutableStateManager:
    """Centralized manager for mutable module-level state.

    Manages:
      - DB pool (AsyncPG, lazy-init)
      - Pending manual billing (per-org accumulator)
      - DB pool init task (async coordination)

    Usage:
        state = MutableStateManager()
        state.set_db_pool(pool)
        state.append_billing("org_123", ("event", {data}))
        events = state.flush_billing("org_123")
    """

    def __init__(self) -> None:
        self._db_pool: Any = None
        self._db_pool_init_task: Any = None
        self._pending_manual_billing: Dict[str, list] = {}

    def set_db_pool(self, pool: Any) -> None:
        """Set the database connection pool."""
        self._db_pool = pool

    def get_db_pool(self) -> Any:
        """Get the database connection pool."""
        return self._db_pool

    def set_db_pool_init_task(self, task: Any) -> None:
        """Set the DB pool initialization task (for async coordination)."""
        self._db_pool_init_task = task

    def get_db_pool_init_task(self) -> Any:
        """Get the DB pool initialization task."""
        return self._db_pool_init_task

    def append_billing(self, org_id: str, event: tuple) -> None:
        """Append a billing event to the accumulator for an org."""
        if org_id not in self._pending_manual_billing:
            self._pending_manual_billing[org_id] = []
        self._pending_manual_billing[org_id].append(event)

    def get_pending_billing(self, org_id: str) -> list:
        """Get pending billing events for an org (non-destructive)."""
        return self._pending_manual_billing.get(org_id, [])

    def flush_billing(self, org_id: str) -> list:
        """Get and clear pending billing events for an org."""
        events = self._pending_manual_billing.pop(org_id, [])
        return events


# ===============================================================================
# SECTION 3 -- TextSanitizer (Centralized Text Cleaning)
# ===============================================================================

class TextSanitizer:
    """Centralized text sanitization patterns and logic.

    Encapsulates all regex patterns for:
      - Control directive removal
      - Acknowledgement normalization
      - Phonetic/TTS-specific fixes
      - Filler cleanup

    All patterns are class-level constants (no per-call allocation).

    Usage:
        sanitizer = TextSanitizer()
        cleaned = sanitizer.sanitize_candidate_facing_text(text)
        polished = sanitizer.polish_candidate_facing_text(text)
    """

    # Control phrases that must not leak to candidates
    _CONTROL_PHRASES = (
        "DO NOT SAY ALOUD",
        "INTERNAL INTERVIEWER INSTRUCTION",
        "NEXT_TURN_DIRECTIVE",
        "SHORT_RESPONSE_DIRECTIVE",
        "INTERVIEW STATE UPDATE",
        "SYSTEM ALERT",
        "TOPIC:NEW",
        "TOPIC:FOLLOWUP",
    )

    # Banned acknowledgement patterns (LLM tendency → natural response)
    _BANNED_ACK_REPLACEMENTS: tuple[tuple[re.Pattern, str], ...] = (
        (re.compile(r"^\s*thanks\s+for\s+(?:sharing|clarifying|explaining|that)\s*[,.\-–—]*\s*", re.I), "Got it. "),
        (re.compile(r"^\s*thank\s+you\s+for\s+(?:sharing|clarifying|explaining)\s*[,.\-–—]*\s*", re.I), "Got it. "),
        (re.compile(r"^\s*good\.\s+so\s+i['']?ll\s+be\s+conducting\b", re.I), "Doing well, packed with interviews today. I'll be conducting"),
    )

    # TTS phonetic fixes (preserve speech flow for voice synthesis)
    # Fixes for Sarvam/Cartesia: collapse em-dashes and ellipses they can't handle
    _TTS_PHONETIC_FIXES: tuple[tuple[re.Pattern, str], ...] = (
        (re.compile(r"\s*[–—]\s*"), ", "),
        (re.compile(r"\s*-{2,}\s*"), ", "),
        (re.compile(r"(?<=[a-zA-Z])-(?=[a-zA-Z])"), ""),
        (re.compile(r"\.{2,}"), ", "),
        (re.compile(r"[`*_~]"), ""),
        (re.compile(r"\b(Hmm|Mm|Ah|Oh|Right|Yeah|So|Well|Okay)\b(?!\s*[,.\?!])"), r"\1,"),
        (re.compile(r" {2,}"), " "),
    )
    # ElevenLabs-specific fixes: preserve em-dashes and ellipses (ElevenLabs uses them
    # for natural pauses), only strip markdown and normalize filler punctuation.
    _TTS_PHONETIC_FIXES_ELEVENLABS: tuple[tuple[re.Pattern, str], ...] = (
        (re.compile(r"\s*-{2,}\s*"), "— "),          # double-hyphen → em-dash (ElevenLabs pause)
        (re.compile(r"(?<=[a-zA-Z])-(?=[a-zA-Z])"), " "),  # hyphenated-words → spaced
        (re.compile(r"[`*_~]"), ""),                   # strip markdown
        (re.compile(r"\b(Hmm|Mm|Ah|Oh|Right|Yeah|So|Well|Okay)\b(?!\s*[,.\?!])"), r"\1,"),
        (re.compile(r" {2,}"), " "),
    )

    # Trailing fillers at end of turn
    _TRAILING_FILLER_RE = re.compile(r"(?:[,.\s]+)(?:um+|uh+)\s*[.!?]*\s*$", re.I)

    # Matches ALL-CAPS words of 2–6 letters, optionally plural (APIs, LLMs).
    _CAPS_ACRONYM_RE: re.Pattern = re.compile(r"\b([A-Z]{2,6})(s?)\b")

    # CamelCase splitter: insert a space before each uppercase letter that follows a
    # lowercase letter (e.g. "FineTuning" → "Fine Tuning", "GitHub" → "Git Hub").
    # This is only applied to CamelCase words (not ALL-CAPS, which are handled above).
    _CAMEL_RE: re.Pattern = re.compile(r"([a-z])([A-Z])")

    # ponytail: positive allowlist only — an ALL-CAPS word is letter-spaced ONLY if it's
    # a known acronym here. Everything else (MINUTES, STOP, HELLO, any capitalized
    # common word the LLM emits) is left untouched. This is the inverse of the old
    # "expand everything, allowlist the exceptions" design, which mispronounced any
    # capitalized English word not yet added to an exceptions list (the "m-i-n-u-t-e-s"
    # bug). Add new real acronyms here as they come up; forgetting to add one just means
    # Sarvam reads it as a word (safe), not that it gets spelled out (broken).
    _KNOWN_ACRONYMS: frozenset[str] = frozenset({
        "RAG", "LLM", "LLMs", "NLP", "API", "APIs", "CICD",
        "SQL", "AWS", "GCP", "GIT", "SSH", "PDF", "URL", "HTTP", "HTML", "CSS",
        "JSON", "YAML", "REST", "CRUD", "CORS", "UUID", "GPU", "CPU", "RAM",
    })

    @staticmethod
    def normalize_for_sarvam(text: str) -> str:
        """Auto-fix pronunciation for known technical acronyms.

        1. ALL-CAPS acronyms found in _KNOWN_ACRONYMS get letter-spaced so
           Sarvam says "R A G" clearly instead of "ragg" or "R-A-G". Any other
           ALL-CAPS word is left as-is (Sarvam reads plain capitalized words fine).

        2. CamelCase words (FineTuning, DevOps, LangChain written in-sentence)
           get a space inserted at each case boundary so Sarvam reads them as
           two natural words instead of mashing them together.
        """
        def _fix_caps(m: re.Match) -> str:
            word = m.group(1)
            plural = m.group(2)  # 's' or ''
            if word not in TextSanitizer._KNOWN_ACRONYMS:
                return m.group(0)
            # Space out: "RAG" → "R A G", "LLMs" → "L L M s"
            spaced = " ".join(word)
            return (spaced + " " + plural) if plural else spaced

        # Pass 1: fix known ALL-CAPS acronyms
        result = TextSanitizer._CAPS_ACRONYM_RE.sub(_fix_caps, text)
        # Pass 2: split CamelCase (only interior boundaries, not ALL-CAPS runs)
        result = TextSanitizer._CAMEL_RE.sub(r"\1 \2", result)
        return result

    @staticmethod
    def sanitize_candidate_facing_text(text: str) -> str:
        """Remove internal control directives from text.

        Args:
            text: Raw text (may contain directives)

        Returns:
            Cleaned text safe to speak or display to candidate
        """
        result = (text or "").replace("<wait for response>", "").strip()
        if not result:
            return ""

        cleaned_lines = []
        for line in result.splitlines():
            stripped = line.strip()
            if (
                stripped.startswith("[DO NOT SAY ALOUD")
                or stripped.startswith("[WARMUP")
                or stripped.startswith("[NEXT_TURN_DIRECTIVE")
                or stripped.startswith("[SHORT_RESPONSE_DIRECTIVE")
                or stripped.startswith("[INTERVIEW STATE UPDATE")
                or re.search(r"TOPIC\s*:\s*(NEW|FOLLOWUP)", stripped, re.IGNORECASE)
            ):
                continue
            cleaned_lines.append(line)

        result = "\n".join(cleaned_lines).strip()
        result = re.sub(r"\[(?:[^\[\]]|\[[^\]]*\]){0,2000}\]", " ", result)

        for phrase in TextSanitizer._CONTROL_PHRASES:
            result = re.sub(re.escape(phrase), " ", result, flags=re.IGNORECASE)

        result = re.sub(r"\s{2,}", " ", result).strip()
        return result

    @staticmethod
    def polish_candidate_facing_text(text: str) -> str:
        """Final deterministic cleanup before text is spoken.

        Args:
            text: Text to polish (may contain banned acks, fillers, etc.)

        Returns:
            Polished text ready for TTS
        """
        result = TextSanitizer.sanitize_candidate_facing_text(text)
        if not result:
            return ""

        for pattern, replacement in TextSanitizer._BANNED_ACK_REPLACEMENTS:
            result = pattern.sub(replacement, result)

        result = re.sub(
            r"^\s*good\s+to\s+hear\.\s+i(?:'|’)?ll\s+be\s+conducting\b",
            "Good to hear; doing well, packed with interviews today. I'll be conducting",
            result,
            flags=re.I,
        )

        result = TextSanitizer._TRAILING_FILLER_RE.sub("", result)
        result = re.sub(r"\s{2,}", " ", result).strip()
        return result

    @staticmethod
    def apply_tts_phonetic_fixes(text: str, provider: str = "") -> str:
        """Apply phonetic fixes for TTS speech synthesis.

        ElevenLabs preserves em-dashes and ellipses as natural pause cues.
        Sarvam/Cartesia collapse them to commas to avoid mispronunciation.
        """
        fixes = (
            TextSanitizer._TTS_PHONETIC_FIXES_ELEVENLABS
            if provider.upper() == "ELEVENLABS"
            else TextSanitizer._TTS_PHONETIC_FIXES
        )
        for pattern, replacement in fixes:
            text = pattern.sub(replacement, text)
        return text


# ===============================================================================
# SECTION 4 -- TranscriptManager (Efficient Transcript Assembly)
# ===============================================================================

class TranscriptManager:
    """Manages transcript line assembly with intelligent merging.

    Handles:
      - Deduplication (don't add duplicate lines)
      - Same-speaker merging (consolidate consecutive speaker lines)
      - STT fragment assembly (merge partial outputs)

    O(1) append cost (no scanning transcript on each add).
    Single linear scan only when needed for system message removal.

    Usage:
        tm = TranscriptManager()
        tm.append("Candidate", "I worked on...")
        tm.append("Interviewer", "Tell me more...")
        lines = tm.lines
        tm.remove_system_messages(chat_ctx, "[DIRECTIVE_MARKER")
    """

    def __init__(self) -> None:
        self._lines: list[str] = []

    @property
    def lines(self) -> list[str]:
        """Get all transcript lines."""
        return self._lines

    def append(self, speaker: str, text: str) -> None:
        """Append a transcript line, with dedup and merge logic.

        Args:
            speaker: "Candidate", "Interviewer", etc.
            text: Line content

        Behavior:
            - Removes HTML tags and extra whitespace
            - Skips empty lines
            - Deduplicates exact repeats
            - Merges same-speaker consecutive lines (STT fragments)
        """
        text = re.sub(r"<[^>]+>", "", text).strip()
        clean = " ".join(text.split()).strip()
        if not clean:
            return

        line = f"{speaker}: {clean}"

        if not self._lines:
            self._lines.append(line)
            logger.debug(f"Transcript: {line}")
            return

        prev = self._lines[-1]
        if prev == line:
            return

        current_speaker_match = re.match(r"^([A-Za-z]+)(?:\[\d+\])?$", speaker)
        prev_match = re.match(r"^([A-Za-z]+)(?:\[\d+\])?:\s*(.*)$", prev)

        if current_speaker_match and prev_match and current_speaker_match.group(1) == prev_match.group(1):
            prev_speaker = re.sub(r":\s*.*$", "", prev)
            prev_text = prev_match.group(2).strip()

            if clean == prev_text or prev_text.startswith(clean):
                return

            if clean.startswith(prev_text):
                self._lines[-1] = f"{prev_speaker}: {clean}"
                logger.debug(f"Transcript merged: {self._lines[-1]}")
                return

            merged = " ".join(f"{prev_text} {clean}".split()).strip()
            self._lines[-1] = f"{prev_speaker}: {merged}"
            logger.debug(f"Transcript merged: {self._lines[-1]}")
            return

        self._lines.append(line)
        logger.debug(f"Transcript: {line}")

    def clear(self) -> None:
        """Clear all transcript lines."""
        self._lines.clear()

    def __len__(self) -> int:
        return len(self._lines)

    def __iter__(self):
        return iter(self._lines)
