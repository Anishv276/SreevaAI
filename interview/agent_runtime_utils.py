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
from dataclasses import dataclass, field
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger("interview-agent")


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 1 — AgentConfig (Singleton Configuration)
# ═══════════════════════════════════════════════════════════════════════════════

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
        # STT Configuration
        self._stt_model = os.environ.get("STT_MODEL", "flux-general-en").strip()
        self._flux_eot_threshold = float(os.environ.get("FLUX_EOT_THRESHOLD", "0.70"))
        self._flux_eager_eot_threshold_str = os.environ.get("FLUX_EAGER_EOT_THRESHOLD", "").strip()
        self._flux_eager_eot_threshold = (
            float(self._flux_eager_eot_threshold_str)
            if self._flux_eager_eot_threshold_str and self._flux_eager_eot_threshold_str.lower() != "none"
            else None
        )
        self._flux_eot_timeout_ms = int(os.environ.get("FLUX_EOT_TIMEOUT_MS", "3500"))

        # LLM Configuration
        self._llm_model = os.environ.get("INTERVIEW_LLM_MODEL", "gpt-4.1-mini").strip()
        self._eval_llm_model = os.environ.get("EVAL_LLM_MODEL", "gpt-4.1-nano").strip()
        self._interview_temperature = float(os.environ.get("INTERVIEW_TEMPERATURE", "0.75"))
        self._eval_temperature = float(os.environ.get("EVAL_TEMPERATURE", "0.0"))

        # Voice Configuration
        self._default_voice_id = os.environ.get("DEFAULT_VOICE_ID", "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc").strip()
        self._voice_registry = self._build_voice_registry()

        # Interview Configuration
        self._fixed_interview_duration_minutes = int(os.environ.get("FIXED_INTERVIEW_DURATION_MINUTES", "20"))

        # Database & Storage
        self._database_url = os.environ.get("DATABASE_URL", "").strip()
        self._agent_name = os.environ.get("LIVEKIT_AGENT_NAME", "ai_interviewer").strip()
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

    # ── STT Properties ──
    @property
    def stt_model(self) -> str:
        return self._stt_model

    @property
    def flux_eot_threshold(self) -> float:
        return self._flux_eot_threshold

    @property
    def flux_eager_eot_threshold(self) -> Optional[float]:
        return self._flux_eager_eot_threshold

    @property
    def flux_eot_timeout_ms(self) -> int:
        return self._flux_eot_timeout_ms

    # ── LLM Properties ──
    @property
    def llm_model(self) -> str:
        return self._llm_model

    @property
    def eval_llm_model(self) -> str:
        return self._eval_llm_model

    @property
    def interview_temperature(self) -> float:
        return self._interview_temperature

    @property
    def eval_temperature(self) -> float:
        return self._eval_temperature

    # ── Voice Properties ──
    @property
    def default_voice_id(self) -> str:
        return self._default_voice_id

    @property
    def voice_registry(self) -> Dict[str, Dict[str, str]]:
        return self._voice_registry.copy()

    def get_voice_provider(self, voice_id: str) -> Optional[Dict[str, str]]:
        """Get provider info for a voice ID. Returns None if not found."""
        return self._voice_registry.get(voice_id)

    # ── Interview Properties ──
    @property
    def fixed_interview_duration_minutes(self) -> int:
        return self._fixed_interview_duration_minutes

    # ── Database Properties ──
    @property
    def database_url(self) -> str:
        return self._database_url

    @property
    def agent_name(self) -> str:
        return self._agent_name

    @property
    def app_base_url(self) -> str:
        return self._app_base_url

    @staticmethod
    def _build_voice_registry() -> Dict[str, Dict[str, str]]:
        """Build voice registry from hardcoded values.

        In future, could be loaded from env var or external config.
        Returns a dict mapping voice_id -> {provider, model}
        """
        return {
            # Cartesia voices
            "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc": {"provider": "CARTESIA", "model": "cartesia/sonic-3"},
            "95d51f79-c397-46f9-b49a-23763d3eaa2d": {"provider": "CARTESIA", "model": "cartesia/sonic-3"},
            "f786b574-daa5-4673-aa0c-cbe3e8534c02": {"provider": "CARTESIA", "model": "cartesia/sonic-3"},
            "e07c00bc-4134-4eae-9ea4-1a55fb45746b": {"provider": "CARTESIA", "model": "cartesia/sonic-3"},
            "5ee9feff-1265-424a-9d7f-8e4d431a12c7": {"provider": "CARTESIA", "model": "cartesia/sonic-3"},
            "694f9389-aac1-45b6-b726-9d9369183238": {"provider": "CARTESIA", "model": "cartesia/sonic-3"},
            "638385f3-3333-4f5d-85a2-3f820c64b732": {"provider": "CARTESIA", "model": "cartesia/sonic-3"},
            "248be1fc-3d27-4452-9457-3705bf68bf8f": {"provider": "CARTESIA", "model": "cartesia/sonic-3"},
            # Sarvam voices
            "shubh":   {"provider": "SARVAM", "model": "bulbul:v3"},
            "manan":   {"provider": "SARVAM", "model": "bulbul:v3"},
            "ishita":  {"provider": "SARVAM", "model": "bulbul:v3"},
            "shreya":  {"provider": "SARVAM", "model": "bulbul:v3"},
            "priya":   {"provider": "SARVAM", "model": "bulbul:v3"},
            "aditya":  {"provider": "SARVAM", "model": "bulbul:v3"},
            "ritu":    {"provider": "SARVAM", "model": "bulbul:v3"},
            "rahul":   {"provider": "SARVAM", "model": "bulbul:v3"},
            "neha":    {"provider": "SARVAM", "model": "bulbul:v3"},
            "pooja":   {"provider": "SARVAM", "model": "bulbul:v3"},
            "rohan":   {"provider": "SARVAM", "model": "bulbul:v3"},
            "simran":  {"provider": "SARVAM", "model": "bulbul:v3"},
            "kavya":   {"provider": "SARVAM", "model": "bulbul:v3"},
            "amit":    {"provider": "SARVAM", "model": "bulbul:v3"},
            "dev":     {"provider": "SARVAM", "model": "bulbul:v3"},
            "varun":   {"provider": "SARVAM", "model": "bulbul:v3"},
            "kabir":   {"provider": "SARVAM", "model": "bulbul:v3"},
            "tanya":   {"provider": "SARVAM", "model": "bulbul:v3"},
            "sunny":   {"provider": "SARVAM", "model": "bulbul:v3"},
        }


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — MutableStateManager (Centralized State Management)
# ═══════════════════════════════════════════════════════════════════════════════

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

    def has_pending_billing(self, org_id: str) -> bool:
        """Check if there are pending billing events for an org."""
        return org_id in self._pending_manual_billing and len(self._pending_manual_billing[org_id]) > 0

    def clear_all(self) -> None:
        """Clear all mutable state (for testing/shutdown)."""
        self._db_pool = None
        self._db_pool_init_task = None
        self._pending_manual_billing.clear()


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 3 — TextSanitizer (Centralized Text Cleaning)
# ═══════════════════════════════════════════════════════════════════════════════

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
    _TTS_PHONETIC_FIXES: tuple[tuple[re.Pattern, str], ...] = (
        (re.compile(r"\s*[–—]\s*"), ", "),
        (re.compile(r"\s*-{2,}\s*"), ", "),
        (re.compile(r"(?<=[a-zA-Z])-(?=[a-zA-Z])"), ""),
        (re.compile(r"\.{2,}"), ", "),
        (re.compile(r"[`*_~]"), ""),
        (re.compile(r"\b(Hmm|Mm|Ah|Oh|Right|Yeah|So|Well|Okay)\b(?!\s*[,.\?!])"), r"\1,"),
        (re.compile(r" {2,}"), " "),
    )

    # Trailing fillers at end of turn
    _TRAILING_FILLER_RE = re.compile(r"(?:[,.\s]+)(?:um+|uh+)\s*[.!?]*\s*$", re.I)

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
    def apply_tts_phonetic_fixes(text: str) -> str:
        """Apply phonetic fixes for TTS speech synthesis.

        Args:
            text: Text to apply fixes to

        Returns:
            Text with TTS-friendly phonetic transformations
        """
        for pattern, replacement in TextSanitizer._TTS_PHONETIC_FIXES:
            text = pattern.sub(replacement, text)
        return text


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 4 — TranscriptManager (Efficient Transcript Assembly)
# ═══════════════════════════════════════════════════════════════════════════════

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
