"""
billing/billing.py
==================
Single source of truth for ALL billing across every product feature.

If a billing bug is reported, this is the only file to check.

Architecture:
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Section 1 — Rate Tables            (dict literals, O(1) lookup)    │
  │  Section 2 — Pydantic Models        (ModelBilling, FeatureBilling,  │
  │                                      OrgBilling)                    │
  │  Section 3 — CostStrategy (OOP)     (Protocol + 4 frozen dataclass  │
  │                                      strategies via registry)       │
  │  Section 4 — CostCalculator (OOP)   (wraps strategies, normalises   │
  │                                      model names with regex cache)  │
  │  Section 5 — UsageSummarizer (OOP)  (LiveKit AgentSessionUsage →   │
  │                                      feature-agnostic session dict) │
  │  Section 7 — PendingBuffer (OOP)    (in-memory accumulator for      │
  │                                      manual LLM usage, flushed at  │
  │                                      session end)                   │
  │  Section 8 — BillingRepository(OOP) (all DB writes; one class owns │
  │                                      every SQL write path)          │
  │  Section 9 — Public API             (5 async functions, one per    │
  │                                      feature + a flush helper)      │
  └──────────────────────────────────────────────────────────────────────┘

Features tracked:
  interview         — full session: LLM (agent turns) + TTS + STT
  interviewReport   — post-session LangGraph report pipeline LLM calls
  resumeExtraction  — resume parse LLM call (worker.ts → Python)
  jdExtraction      — JD parse LLM call (worker.ts → Python)
  resumeReport      — resume scoring/report LLM calls

DSA choices:
  - frozenset for O(1) feature-name validation
  - dict for O(1) rate lookups (provider → model → rate)
  - Counter (O(n)) for aggregating per-model usage across a session
  - defaultdict for pending-buffer accumulation (no key-existence check)
  - re.compile() cached at class level (not per-call) for model normalisation

OOP choices:
  - Protocol  for CostStrategy (structural subtyping, no ABC overhead)
  - @dataclass(frozen=True) strategies (hashable, zero mutation risk)
  - Registry dict maps provider string → strategy instance (O(1) dispatch)
  - All DB writes in BillingRepository so SQL is never scattered
  - PendingBuffer is a plain class with a defaultdict — no asyncio primitives
    needed because it is only ever mutated from one coroutine per session
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import time
import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any, ClassVar, Literal, Optional, Protocol

from pydantic import BaseModel, Field, field_validator

from interview.agent_runtime_support import (
    DATABASE_URL,
    _PENDING_MANUAL_BILLING,
    logger,
)
from interview.agent_utils import _coerce_jsonish

try:
    from livekit.agents.metrics import AgentSessionUsage
except ImportError:  # allow import without livekit in test / CI environments
    AgentSessionUsage = Any  # type: ignore[assignment,misc]

# ===============================================================================
# SECTION 1 -- Rate Tables
# All pricing lives here. To update a price, change one line in this section.
# ===============================================================================

_INR_PER_USD: float = float(os.environ.get("BILLING_INR_PER_USD", "83.0"))

# OpenAI LLM -- USD per million tokens
_OPENAI_RATES: dict[str, dict[str, float]] = {
    "gpt-4.1-nano": {"input": 0.10,  "cached_input": 0.025, "output": 0.40},
    "gpt-4.1-mini": {"input": 0.40,  "cached_input": 0.10,  "output": 1.60},
    "gpt-4.1":      {"input": 2.00,  "cached_input": 0.50,  "output": 8.00},
    "gpt-4o-mini":  {"input": 0.15,  "cached_input": 0.075, "output": 0.60},
    "gpt-4o":       {"input": 2.50,  "cached_input": 1.25,  "output": 10.00},
    "gpt-5.4-mini": {"input": 0.75,  "cached_input": 0.075, "output": 4.50},
    "gpt-5-mini":   {"input": 0.25,  "cached_input": 0.025, "output": 2.00},
    "gpt-5-nano":   {"input": 0.05,  "cached_input": 0.005, "output": 0.40},
    "gpt-5":        {"input": 1.25,  "cached_input": 0.125, "output": 10.00},
}

# OpenAI embeddings -- USD per million input tokens (no output/cached tiers).
# Used by extraction_resume_JD_score_report/scorer.py's SemanticSkillIndex for
# resume/JD semantic matching -- a real, separately-billed API call that was
# previously not tracked or billed at all.
_OPENAI_EMBEDDING_RATES: dict[str, float] = {
    "text-embedding-3-small": 0.02,
    "text-embedding-3-large": 0.13,
    "text-embedding-ada-002": 0.10,
}
_OPENAI_EMBEDDING_DEFAULT: float = float(os.environ.get("OPENAI_EMBEDDING_DEFAULT_USD_PER_MILLION", "0.02"))

# Fallback rate for any OpenAI model NOT explicitly listed above. Extraction/
# report features let admins pick arbitrary model names from the DB config, so a
# newly-selected (or newly-released) model must NOT cause the whole usage record
# to be dropped -- see CostCalculator.openai. We approximate with a mid-tier
# "mini" price and log a warning so the exact rate can be added later. Mirrors the
# graceful-default behaviour already used for ElevenLabs/Deepgram.
_OPENAI_RATES_DEFAULT: dict[str, float] = {
    "input":        float(os.environ.get("OPENAI_LLM_DEFAULT_INPUT_USD_PER_MILLION",  "0.40")),
    "cached_input": float(os.environ.get("OPENAI_LLM_DEFAULT_CACHED_USD_PER_MILLION", "0.10")),
    "output":       float(os.environ.get("OPENAI_LLM_DEFAULT_OUTPUT_USD_PER_MILLION", "1.60")),
}

# ElevenLabs TTS -- USD per million characters
_ELEVENLABS_TTS_RATES: dict[str, float] = {
    "eleven_flash_v2":        50.0,
    "eleven_flash_v2_5":      50.0,
    "eleven_turbo_v2":        50.0,
    "eleven_turbo_v2_5":      50.0,
    "eleven_multilingual_v2": 100.0,
    "eleven_multilingual_v3": 100.0,
}
_ELEVENLABS_TTS_DEFAULT: float = float(os.environ.get("ELEVENLABS_TTS_USD_PER_MILLION_CHARS", "100.0"))

# Sarvam TTS -- INR per 10k characters (converted to USD at runtime)
_SARVAM_TTS_RATES_INR: dict[str, float] = {
    "bulbul:v3": 30.0,
    "bulbul:v2": 15.0,
}

# Deepgram STT -- USD per minute
_DEEPGRAM_STT_RATES: dict[str, float] = {
    "nova-3":             0.0048,
    "nova-2":             0.0043,
    "flux-general-en":    0.0065,
    "flux-general-multi": 0.0078,
}

# Valid feature names -- frozenset for O(1) validation
# chatbot removed: feature is no longer active in this product
_VALID_FEATURES: frozenset[str] = frozenset({
    "interview",
    "interviewReport",
    "interviewBrief",
    "interviewLLMGeneration",
    "resumeExtraction",
    "jdExtraction",
    "resumeReport",
})

# LiveKit AgentSessionUsage field mappings (src attr → public JSON key)
_USAGE_BUCKET_FIELDS: dict[str, tuple[tuple[str, str], ...]] = {
    "llm": (
        ("input_tokens",                "inputTokens"),
        ("input_cached_tokens",         "inputCachedTokens"),
        ("input_audio_tokens",          "inputAudioTokens"),
        ("input_cached_audio_tokens",   "inputCachedAudioTokens"),
        ("input_text_tokens",           "inputTextTokens"),
        ("input_cached_text_tokens",    "inputCachedTextTokens"),
        ("input_image_tokens",          "inputImageTokens"),
        ("input_cached_image_tokens",   "inputCachedImageTokens"),
        ("output_tokens",               "outputTokens"),
        ("output_audio_tokens",         "outputAudioTokens"),
        ("output_text_tokens",          "outputTextTokens"),
        ("session_duration",            "sessionDuration"),
    ),
    "tts": (
        ("input_tokens",    "inputTokens"),
        ("output_tokens",   "outputTokens"),
        ("characters_count","charactersCount"),
        ("audio_duration",  "audioDuration"),
    ),
    "stt": (
        ("input_tokens",   "inputTokens"),
        ("output_tokens",  "outputTokens"),
        ("audio_duration", "audioDuration"),
    ),
    "interruption": (
        ("total_requests", "totalRequests"),
    ),
}
_USAGE_TYPE_TO_BUCKET: dict[str, str] = {
    "llm_usage":          "llm",
    "tts_usage":          "tts",
    "stt_usage":          "stt",
    "interruption_usage": "interruption",
}

# ===============================================================================
# SECTION 1B -- extract_usage()
#
# Single canonical function for pulling token counts from any OpenAI completion
# object. Previously duplicated in:
#   - extraction_resume_JD_score_report_v2/parser.py
#   - extraction_resume_JD_score_report_v2/reporter.py
#   - interview/agent_scoring.py
#   - interview/interview_brief.py
#
# All callers now import this instead of repeating the same getattr chains.
# ===============================================================================

def extract_usage(completion: Any, model: str = "") -> dict[str, Any]:
    """Extract token counts from an OpenAI completion or usage object.

    Accepts two forms:
      - A full ChatCompletion/streaming chunk  → reads .usage sub-object
      - A raw usage object (CompletionUsage)   → reads .prompt_tokens directly

    Safe when usage is None. Works for both streaming and non-streaming calls.

    Returns:
        {
            "model":             str   — model name from response or fallback arg,
            "inputTokens":       int,
            "outputTokens":      int,
            "cachedInputTokens": int,
        }
    """
    # If the object has .prompt_tokens directly it IS the usage object
    # (e.g. chunk.usage from a streaming call). Otherwise treat it as
    # a completion wrapper and unwrap .usage first.
    if hasattr(completion, "prompt_tokens"):
        usage = completion
        resolved_model = model
    else:
        usage = getattr(completion, "usage", None)
        resolved_model = str(getattr(completion, "model", "") or model or "").strip()

    details = getattr(usage, "prompt_tokens_details", None)
    return {
        "model":             resolved_model,
        "inputTokens":       int(getattr(usage, "prompt_tokens",    0) or 0) if usage else 0,
        "outputTokens":      int(getattr(usage, "completion_tokens", 0) or 0) if usage else 0,
        "cachedInputTokens": int(getattr(details, "cached_tokens",   0) or 0) if usage else 0,
    }


# ===============================================================================
# SECTION 2 -- Pydantic Models
# Typed contracts for every billing shape stored in or read from the DB.
# ===============================================================================

class ModelBilling(BaseModel):
    """Usage + cost for one provider:model combination."""
    provider:          str   = "unknown"
    model:             str   = "unknown"
    runs:              int   = 0
    inputTokens:       int   = 0
    cachedInputTokens: int   = 0
    outputTokens:      int   = 0
    sessionDuration:   float = 0.0
    costUsd:           float = 0.0
    characters:        int   = 0
    audioSeconds:      float = 0.0


class FeatureBilling(BaseModel):
    """Aggregated billing for one product feature (interview / resumeExtraction / …)."""
    runs:              int   = 0
    inputTokens:       int   = 0
    cachedInputTokens: int   = 0
    outputTokens:      int   = 0
    sessionDuration:   float = 0.0
    costUsd:           float = 0.0
    ttsRuns:           int   = 0
    ttsCharacters:     int   = 0
    ttsCostUsd:        float = 0.0
    sttRuns:           int   = 0
    sttAudioSeconds:   float = 0.0
    sttCostUsd:        float = 0.0
    byModel:    dict[str, ModelBilling] = Field(default_factory=dict)
    ttsByModel: dict[str, ModelBilling] = Field(default_factory=dict)
    sttByModel: dict[str, ModelBilling] = Field(default_factory=dict)


class OrgBilling(BaseModel):
    """All features for one organisation — stored inside usageMetrics.billing.

    chatbot removed: feature is no longer active. Existing DB rows that still
    carry a chatbot key are silently ignored by Pydantic (extra='ignore' default).
    """
    interview:              FeatureBilling = Field(default_factory=FeatureBilling)
    interviewReport:        FeatureBilling = Field(default_factory=FeatureBilling)
    interviewBrief:         FeatureBilling = Field(default_factory=FeatureBilling)
    interviewLLMGeneration: FeatureBilling = Field(default_factory=FeatureBilling)
    resumeExtraction:       FeatureBilling = Field(default_factory=FeatureBilling)
    jdExtraction:           FeatureBilling = Field(default_factory=FeatureBilling)
    resumeReport:           FeatureBilling = Field(default_factory=FeatureBilling)


class InterviewBillingSnapshot(BaseModel):
    """Per-interview billing snapshot stored in Interview.billingSnapshot."""
    candidateName:      str   = ""
    jobTitle:           str   = ""
    interviewName:      str   = ""
    durationSec:        int   = 0
    creditsUsed:        float = 0.0
    llmCostUsd:         float = 0.0
    ttsCostUsd:         float = 0.0
    sttCostUsd:         float = 0.0
    totalCostUsd:       float = 0.0
    inputTokens:        int   = 0
    outputTokens:       int   = 0
    cachedInputTokens:  int   = 0
    sessionDuration:    float = 0.0
    ttsCharacters:      int   = 0
    sttAudioSeconds:    float = 0.0
    llmByModel:         dict  = Field(default_factory=dict)
    ttsByModel:         dict  = Field(default_factory=dict)
    sttByModel:         dict  = Field(default_factory=dict)
    costSource:         str   = "exact"
    updatedAt:          float = Field(default_factory=time.time)
    billedAt:           Optional[float] = None

    @field_validator("totalCostUsd", mode="before")
    @classmethod
    def _round(cls, v: Any) -> float:
        return round(float(v or 0), 8)


# ===============================================================================
# SECTION 3 -- CostStrategy (OOP: Protocol + frozen dataclasses)
#
# Adding a new provider = add one frozen dataclass + one line in _REGISTRY.
# No if/elif chains anywhere.
# ===============================================================================

class CostStrategy(Protocol):
    def tts_cost(self, model: str, chars: int) -> float: ...
    def stt_cost(self, model: str, seconds: float) -> float: ...


@dataclass(frozen=True)
class _SarvamStrategy:
    def tts_cost(self, model: str, chars: int) -> float:
        rate = _SARVAM_TTS_RATES_INR.get(model, _SARVAM_TTS_RATES_INR["bulbul:v3"])
        return (chars / 10_000.0) * rate / max(_INR_PER_USD, 1e-6)

    def stt_cost(self, model: str, seconds: float) -> float:
        return 0.0


@dataclass(frozen=True)
class _ElevenLabsStrategy:
    def tts_cost(self, model: str, chars: int) -> float:
        return (chars / 1_000_000.0) * _ELEVENLABS_TTS_RATES.get(model, _ELEVENLABS_TTS_DEFAULT)

    def stt_cost(self, model: str, seconds: float) -> float:
        return 0.0


@dataclass(frozen=True)
class _DeepgramStrategy:
    def tts_cost(self, model: str, chars: int) -> float:
        return 0.0

    def stt_cost(self, model: str, seconds: float) -> float:
        rate = _DEEPGRAM_STT_RATES.get(model, _DEEPGRAM_STT_RATES["flux-general-en"])
        return (seconds / 60.0) * rate


# O(1) provider dispatch -- adding a provider is one line here
_PROVIDER_REGISTRY: dict[str, CostStrategy] = {
    "SARVAM":     _SarvamStrategy(),
    "ELEVENLABS": _ElevenLabsStrategy(),
    "DEEPGRAM":   _DeepgramStrategy(),
}

# ===============================================================================
# SECTION 4 -- CostCalculator (OOP)
#
# Centralises all cost arithmetic. Class-level compiled regex avoids
# recompiling on every call (O(1) amortised instead of O(n) per call).
# ===============================================================================

class CostCalculator:
    """Stateless cost calculator. All methods are classmethods — no instance needed."""

    # Compiled once at class-definition time, not per call
    _DATE_SUFFIX_RE: ClassVar[re.Pattern[str]] = re.compile(r"[-:]\d{4}-\d{2}-\d{2}$")
    _TTS_PREFIX_RE:  ClassVar[re.Pattern[str]] = re.compile(r"^(elevenlabs)/")

    @classmethod
    def _norm_openai(cls, model: str) -> str:
        """Strip date suffixes: 'gpt-4.1-mini-2025-04-14' → 'gpt-4.1-mini'."""
        return cls._DATE_SUFFIX_RE.sub("", model.strip().lower())

    @classmethod
    def _norm_tts(cls, model: str) -> str:
        return cls._TTS_PREFIX_RE.sub("", str(model or "").strip().lower())

    @classmethod
    def _norm_stt(cls, model: str) -> str:
        return str(model or "").strip().lower()

    @classmethod
    def openai(cls, model: str, input_t: int, cached_t: int, output_t: int) -> float:
        key = cls._norm_openai(model)
        if key in _OPENAI_EMBEDDING_RATES:
            # Embeddings have no completion/cached tiers -- input tokens are the
            # only billable quantity. Routed through here (rather than requiring
            # every caller to know to call .embedding() instead) so an embedding
            # usage record can flow through the same LLM-shaped merge/ledger path
            # used everywhere else, with no schema/shape change needed upstream.
            return cls.embedding(model, input_t)
        rates = _OPENAI_RATES.get(key)
        if not rates:
            # Graceful fallback -- an unknown/newly-configured model must NOT drop
            # the whole usage record (that silently hid resume/JD extraction costs
            # from billing). Approximate with a default rate and warn, matching the
            # TTS/STT strategies which already fall back rather than raise.
            logger.warning(
                "[BILLING] No OpenAI pricing for model %r (normalised: %r) -- "
                "using default rate (input=%.2f cached=%.2f output=%.2f /1M). "
                "Add this model to _OPENAI_RATES for exact costs.",
                model, key,
                _OPENAI_RATES_DEFAULT["input"], _OPENAI_RATES_DEFAULT["cached_input"],
                _OPENAI_RATES_DEFAULT["output"],
            )
            rates = _OPENAI_RATES_DEFAULT
        input_t  = max(0, int(input_t  or 0))
        output_t = max(0, int(output_t or 0))
        cached_t = max(0, min(int(cached_t or 0), input_t))
        uncached = input_t - cached_t
        return (
            (uncached  / 1_000_000.0) * rates["input"]
            + (cached_t / 1_000_000.0) * rates["cached_input"]
            + (output_t / 1_000_000.0) * rates["output"]
        )

    @classmethod
    def embedding(cls, model: str, input_t: int) -> float:
        key = cls._norm_openai(model)
        rate = _OPENAI_EMBEDDING_RATES.get(key, _OPENAI_EMBEDDING_DEFAULT)
        input_t = max(0, int(input_t or 0))
        return (input_t / 1_000_000.0) * rate

    @classmethod
    def tts(cls, provider: str, model: str, chars: int) -> float:
        chars = max(0, int(chars or 0))
        if not chars:
            return 0.0
        strategy = _PROVIDER_REGISTRY.get(provider.strip().upper())
        return strategy.tts_cost(cls._norm_tts(model), chars) if strategy else 0.0

    @classmethod
    def stt(cls, provider: str, model: str, seconds: float) -> float:
        seconds = max(0.0, float(seconds or 0.0))
        if not seconds:
            return 0.0
        strategy = _PROVIDER_REGISTRY.get(provider.strip().upper())
        return strategy.stt_cost(cls._norm_stt(model), seconds) if strategy else 0.0


# ===============================================================================
# SECTION 5 -- UsageSummarizer (OOP)
#
# Converts a LiveKit AgentSessionUsage object into a provider/model-keyed dict.
# Also handles the plugin-metrics override path (plugin STT/TTS values are more
# accurate than what LiveKit internally tracks).
# ===============================================================================

class UsageSummarizer:
    """Converts LiveKit session usage into the canonical session_summary dict."""

    @staticmethod
    def _empty_bucket(kind: str) -> dict:
        return {
            "sessions": 0,
            "totals":   {pub: 0 for _, pub in _USAGE_BUCKET_FIELDS[kind]},
            "byModel":  {},
        }

    @classmethod
    def from_session(cls, session_usage: Any) -> dict[str, Any]:
        """Build a session_summary dict from a LiveKit AgentSessionUsage.

        Uses Counter (O(n)) to aggregate per-kind usage across all model_usage
        items. Raises ValueError if provider or model is missing — these are
        required to attribute cost correctly.
        """
        summary: dict[str, Any] = {k: cls._empty_bucket(k) for k in _USAGE_BUCKET_FIELDS}
        if not session_usage:
            return summary

        seen: set[str] = set()
        for item in getattr(session_usage, "model_usage", []) or []:
            kind = _USAGE_TYPE_TO_BUCKET.get(getattr(item, "type", ""))
            if not kind:
                continue
            seen.add(kind)
            provider  = str(getattr(item, "provider", "") or "").strip().upper()
            model     = str(getattr(item, "model",    "") or "").strip()
            if not provider or not model:
                raise ValueError(f"[BILLING] Cannot summarize {kind} usage — provider or model missing")
            # Normalize OpenAI base-URL variants (e.g. "API.OPENAI.COM") → "OPENAI"
            if "OPENAI" in provider or provider in ("API", "API.OPENAI.COM"):
                provider = "OPENAI"
            key    = f"{provider}:{model}"
            bucket = summary[kind]
            bucket["sessions"] = 1
            mb = bucket["byModel"].setdefault(
                key,
                {"provider": provider, "model": model, "sessions": 0,
                 **{pub: 0 for _, pub in _USAGE_BUCKET_FIELDS[kind]}},
            )
            mb["sessions"] = 1
            for src, pub in _USAGE_BUCKET_FIELDS[kind]:
                v = getattr(item, src, 0) or 0
                bucket["totals"][pub] += v
                mb[pub] += v

        for kind in seen:
            summary[kind]["sessions"] = 1
        return summary

    @classmethod
    def override_plugin_metrics(
        cls,
        summary: dict[str, Any],
        *,
        tts_provider: Optional[str] = None,
        tts_model:    Optional[str] = None,
        tts_chars:    int   = 0,
        tts_secs:     float = 0.0,
        stt_provider: Optional[str] = None,
        stt_model:    Optional[str] = None,
        stt_secs:     float = 0.0,
    ) -> dict[str, Any]:
        """Replace LiveKit's internal TTS/STT tracking with per-plugin metrics.

        LiveKit's AgentSessionUsage TTS/STT values are less accurate than what
        the individual plugin wrappers report. When plugin values are available,
        they override the session summary's tts/stt buckets entirely.
        """
        if int(tts_chars or 0) > 0:
            provider = str(tts_provider or "").strip().upper()
            model    = str(tts_model    or "").strip()
            if not provider or not model:
                raise ValueError("[BILLING] Cannot record TTS usage — provider or model missing")
            key = f"{provider}:{model}"
            summary["tts"] = {
                "sessions": 1,
                "totals": {
                    "inputTokens":    0,
                    "outputTokens":   0,
                    "charactersCount": int(tts_chars),
                    "audioDuration":  float(tts_secs or 0.0),
                },
                "byModel": {key: {
                    "provider":       provider,
                    "model":          model,
                    "sessions":       1,
                    "inputTokens":    0,
                    "outputTokens":   0,
                    "charactersCount": int(tts_chars),
                    "audioDuration":  float(tts_secs or 0.0),
                }},
            }

        if float(stt_secs or 0.0) > 0:
            provider = str(stt_provider or "").strip().upper()
            model    = str(stt_model    or "").strip()
            if not provider or not model:
                raise ValueError("[BILLING] Cannot record STT usage — provider or model missing")
            key = f"{provider}:{model}"
            summary["stt"] = {
                "sessions": 1,
                "totals": {"inputTokens": 0, "outputTokens": 0, "audioDuration": float(stt_secs)},
                "byModel": {key: {
                    "provider":     provider,
                    "model":        model,
                    "sessions":     1,
                    "inputTokens":  0,
                    "outputTokens": 0,
                    "audioDuration": float(stt_secs),
                }},
            }

        # LLM tokens are billed per-turn via the interviewLLMGeneration hook
        # (every live-agent turn is directive-jobn, never generic chat) --
        # zero them here to avoid double-billing the same tokens under the
        # session-total "interview" bucket. sessionDuration is kept: it's not
        # a token count and isn't captured anywhere else.
        llm_bucket = summary.get("llm")
        if llm_bucket:
            for pub in ("inputTokens", "inputCachedTokens", "inputAudioTokens",
                        "inputCachedAudioTokens", "inputTextTokens", "inputCachedTextTokens",
                        "inputImageTokens", "inputCachedImageTokens",
                        "outputTokens", "outputAudioTokens", "outputTextTokens"):
                llm_bucket["totals"][pub] = 0
                for mb in llm_bucket["byModel"].values():
                    mb[pub] = 0

        return summary


# ===============================================================================
# SECTION 7 -- PendingBuffer (OOP)
#
# Accumulates manual LLM usage records in memory during a session.
# Flushed atomically to the DB at session end via BillingRepository.
#
# Uses defaultdict(list) -- O(1) append, no key-existence check needed.
# Thread-safe for single-coroutine access (one session per agent process).
# ===============================================================================

class PendingBuffer:
    """In-memory accumulator for manual LLM usage (report pipeline, JD extraction, etc.).

    These usages bypass LiveKit's AgentSessionUsage because they are direct
    AsyncOpenAI calls, not routed through LiveKit plugins. They must be
    accumulated here and flushed at session end.
    """

    # Module-level shared buffer keyed by org_id -- matches _PENDING_MANUAL_BILLING
    # in agent_runtime_support so the two views of the buffer stay in sync.
    _store: ClassVar[dict[str, list[tuple[str, dict]]]] = _PENDING_MANUAL_BILLING

    @classmethod
    def push(cls, org_id: str, feature: str, usage: dict[str, Any]) -> None:
        """Accumulate one usage record. O(1) amortised."""
        if not org_id or not usage:
            return
        if feature not in _VALID_FEATURES:
            logger.warning("[BILLING] PendingBuffer.push: unknown feature %r — defaulting to 'interview'", feature)
            feature = "interview"
        cls._store.setdefault(org_id, []).append((feature, usage))

    @classmethod
    def pop(cls, org_id: str) -> list[tuple[str, dict]]:
        """Remove and return all pending entries for this org. O(1)."""
        return cls._store.pop(org_id, [])

    @classmethod
    def peek(cls, org_id: str) -> list[tuple[str, dict]]:
        """Read without removing (for snapshot building)."""
        return cls._store.get(org_id, [])


# ===============================================================================
# SECTION 8A -- Entity Ledger (OOP)
#
# Upserts ONE row per (organizationId, feature, entity) into the "UsageEvent"
# table — jd:{jobId}, resume:{applicationId}, interview:{applicationId} — instead
# of one row per raw API call. Each row's `usage` JSONB holds the per-sub-feature,
# per-model breakdown; `costUsd` is the running sum of every costUsd inside it.
#
# Three domain ledgers build the right usage fragment and share one upsert:
#   - JdExtractionLedger  -> usage.jdExtraction.llm[]
#   - ResumeLedger        -> usage.resumeExtraction.llm[] / usage.resumeReport.llm[]
#   - InterviewLedger     -> usage.{eval,brief,llmGeneration,report}.llm[]
#                            + usage.tts / usage.stt (top-level audio)
#
# The org blob remains the source of truth for TOTALS; this ledger powers the
# super-admin per-item detail views. Every upsert is wrapped in try/except so a
# ledger failure (e.g. the table not yet migrated on a stale deploy) can never
# break the billing transaction that owns the blob.
#
# Context envelope: callers attach usage["context"] =
#   {eventId, jobId, applicationId, interviewId, jobTitle, candidateName,
#    label, ledgerFeature, createdAt, source, isTest}
# ===============================================================================

def _usage_context(usage: dict[str, Any]) -> dict[str, Any]:
    """Extract the optional ledger context envelope from a usage dict."""
    ctx = usage.get("context")
    return dict(ctx) if isinstance(ctx, dict) else {}


def _merge_model_array(existing: list, entry: dict) -> list:
    """Merge one per-model LLM entry into a model-array, summing on (model, provider).

    Entry shape: {model, provider, calls, inputTokens, cachedInputTokens,
    outputTokens, costUsd}. Matching entries are summed in place; new ones append.
    """
    model = str(entry.get("model", "") or "").strip()
    provider = str(entry.get("provider", "") or "").strip()
    for cur in existing:
        if str(cur.get("model", "")).strip() == model and str(cur.get("provider", "")).strip() == provider:
            for k in ("calls", "inputTokens", "cachedInputTokens", "outputTokens"):
                cur[k] = int(cur.get(k, 0) or 0) + int(entry.get(k, 0) or 0)
            cur["costUsd"] = round(float(cur.get("costUsd", 0.0) or 0.0) + float(entry.get("costUsd", 0.0) or 0.0), 8)
            return existing
    existing.append({
        "model": model, "provider": provider,
        "calls": int(entry.get("calls", 0) or 0),
        "inputTokens": int(entry.get("inputTokens", 0) or 0),
        "cachedInputTokens": int(entry.get("cachedInputTokens", 0) or 0),
        "outputTokens": int(entry.get("outputTokens", 0) or 0),
        "costUsd": round(float(entry.get("costUsd", 0.0) or 0.0), 8),
    })
    return existing


def _merge_audio_model_array(existing: list, entry: dict, *, unit_key: str) -> list:
    """Merge one per-model TTS/STT entry (unit_key = 'characters' | 'seconds')."""
    model = str(entry.get("model", "") or "").strip()
    provider = str(entry.get("provider", "") or "").strip()
    for cur in existing:
        if str(cur.get("model", "")).strip() == model and str(cur.get("provider", "")).strip() == provider:
            cur["calls"] = int(cur.get("calls", 0) or 0) + int(entry.get("calls", 0) or 0)
            cur[unit_key] = (cur.get(unit_key, 0) or 0) + (entry.get(unit_key, 0) or 0)
            cur["costUsd"] = round(float(cur.get("costUsd", 0.0) or 0.0) + float(entry.get("costUsd", 0.0) or 0.0), 8)
            return existing
    existing.append({
        "model": model, "provider": provider,
        "calls": int(entry.get("calls", 0) or 0),
        unit_key: entry.get(unit_key, 0) or 0,
        "costUsd": round(float(entry.get("costUsd", 0.0) or 0.0), 8),
    })
    return existing


def _sum_usage_cost(usage: dict[str, Any]) -> float:
    """Sum every model-level `costUsd` in the usage JSON tree (inside `llm`/
    `byModel` arrays only). Sub-keys like tts/stt also carry a rolled-up
    `costUsd` at their own level (see EntityLedger._apply_fragment) as a
    convenience summary -- summing indiscriminately would double-count it
    on top of its own byModel entries.
    """
    total = 0.0
    for sub in usage.values():
        if not isinstance(sub, dict):
            continue
        for entries_key in ("llm", "byModel"):
            for entry in sub.get(entries_key) or []:
                try:
                    total += float(entry.get("costUsd", 0.0) or 0.0)
                except (TypeError, ValueError):
                    pass
    return round(total, 8)


class EntityLedger:
    """Shared upsert for all three domain ledgers.

    Each domain ledger builds a `usage` fragment (the sub-keys it owns) and calls
    `upsert`, which reads the existing row FOR UPDATE, deep-merges the fragment
    into the stored usage JSON (summing per-model arrays), recomputes costUsd, and
    writes the row back. Idempotent-safe: a retry with the same numbers double-
    counts, so callers keep the same call-level dedup they always had (the eventId
    is the entity key, so the row is stable across a feature's many calls).
    """

    @staticmethod
    def _apply_fragment(stored: dict[str, Any], fragment: dict[str, Any]) -> dict[str, Any]:
        """Deep-merge `fragment` into `stored`, summing per-model arrays.

        fragment sub-keys are one of:
          {<subfeature>: {"llm": [modelEntry, ...]}}     (jd/resume/interview LLM)
          {"tts"|"stt": {unit_total, "costUsd", "byModel": [audioEntry, ...]}}
        """
        for sub, frag_val in fragment.items():
            if not isinstance(frag_val, dict):
                continue
            cur = stored.setdefault(sub, {})
            if "llm" in frag_val:
                arr = cur.setdefault("llm", [])
                if not isinstance(arr, list):
                    arr = cur["llm"] = []
                for entry in frag_val["llm"]:
                    _merge_model_array(arr, entry)
            if "byModel" in frag_val:  # audio (tts/stt)
                unit_key = "characters" if sub == "tts" else "seconds"
                arr = cur.setdefault("byModel", [])
                if not isinstance(arr, list):
                    arr = cur["byModel"] = []
                for entry in frag_val["byModel"]:
                    _merge_audio_model_array(arr, entry, unit_key=unit_key)
                # Recompute the audio sub-key's rolled-up unit total + cost from byModel.
                cur[unit_key] = sum((m.get(unit_key, 0) or 0) for m in arr)
                cur["costUsd"] = round(sum(float(m.get("costUsd", 0.0) or 0.0) for m in arr), 8)
        return stored

    @classmethod
    async def upsert(
        cls, conn, *, org_id: str, feature: str, event_id: str,
        fragment: dict[str, Any], job_id: Optional[str] = None,
        application_id: Optional[str] = None, interview_id: Optional[str] = None,
        job_title: Optional[str] = None, candidate_name: Optional[str] = None,
        is_test: bool = False, created_at: Any = None,
    ) -> None:
        """Read-merge-write one entity row. Never raises — ledger must not break billing.

        Runs in its own savepoint (nested conn.transaction()) so that when this
        entry fails, only its savepoint rolls back — the connection stays usable
        for the rest of the batch. Without this, one bad entry (e.g. a transient
        FK error) aborted the whole outer transaction and every sibling entry in
        the same flush_pending()/save_org_usage() loop failed with
        InFailedSQLTransactionError right behind it.
        """
        if not org_id or not event_id or not fragment:
            return
        try:
            # Nested transaction = savepoint: a failure here rolls back only this
            # savepoint, not the whole outer transaction/connection — otherwise every
            # later statement on `conn` fails with InFailedSQLTransactionError.
            async with conn.transaction():
                existing = await conn.fetchrow(
                    'SELECT id, "usage", "jobTitle", "candidateName" FROM "UsageEvent" '
                    'WHERE "eventId" = $1 FOR UPDATE',
                    event_id,
                )
                if existing:
                    stored = _coerce_jsonish(existing["usage"])
                    cls._apply_fragment(stored, fragment)
                    cost = _sum_usage_cost(stored)
                    await conn.execute(
                        'UPDATE "UsageEvent" SET "usage" = $1::jsonb, "costUsd" = $2, '
                        '"jobTitle" = COALESCE($3, "jobTitle"), '
                        '"candidateName" = COALESCE($4, "candidateName"), '
                        '"jobId" = COALESCE("jobId", $5), '
                        '"applicationId" = COALESCE("applicationId", $6), '
                        '"interviewId" = COALESCE("interviewId", $7), '
                        '"updatedAt" = NOW() WHERE id = $8',
                        json.dumps(stored), cost, job_title, candidate_name,
                        job_id, application_id, interview_id, existing["id"],
                    )
                else:
                    stored = cls._apply_fragment({}, fragment)
                    cost = _sum_usage_cost(stored)
                    await conn.execute(
                        'INSERT INTO "UsageEvent" '
                        '("id","organizationId","feature","jobId","applicationId","interviewId",'
                        '"jobTitle","candidateName","isTest","usage","costUsd","eventId","createdAt","updatedAt") '
                        'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,COALESCE($13, NOW()),NOW()) '
                        'ON CONFLICT ("eventId") DO NOTHING',
                        "evt_" + uuid.uuid4().hex, org_id, feature, job_id, application_id, interview_id,
                        job_title, candidate_name, bool(is_test), json.dumps(stored), cost, event_id,
                        _to_ts(created_at),
                    )
        except Exception as e:  # noqa: BLE001 — ledger must never break billing
            logger.error("[BILLING] EntityLedger.upsert failed (non-fatal) event=%s: %s", event_id, e, exc_info=True)
            return
        # Own savepoint too -- _refresh_org_usage_summary already catches its own
        # errors internally, but without a savepoint a mid-query failure there
        # would still poison conn for whatever runs after it in this batch.
        async with conn.transaction():
            await _refresh_org_usage_summary(conn, org_id)


async def _refresh_org_usage_summary(conn, org_id: str) -> None:
    """Recompute OrgUsageSummary for one org from the UsageEvent ledger (mirrors
    lib/usage-metrics.ts#computeOrgUsageBreakdown). Runs after every ledger
    upsert so the cache is never stale. Never raises — summary is a read-side
    cache, not the source of truth."""
    try:
        row = await conn.fetchrow(
            """
            SELECT
              COALESCE(SUM(CASE WHEN feature = 'jdExtraction'
                THEN (SELECT SUM((m->>'costUsd')::float8) FROM jsonb_array_elements(usage->'jdExtraction'->'llm') m) END), 0) AS "jdExtractionCostUsd",
              COALESCE(SUM(CASE WHEN feature = 'resumeExtraction'
                THEN (SELECT SUM((m->>'costUsd')::float8) FROM jsonb_array_elements(usage->'resumeExtraction'->'llm') m) END), 0) AS "resumeExtractionCostUsd",
              COALESCE(SUM(CASE WHEN feature = 'resumeExtraction'
                THEN (SELECT SUM((m->>'costUsd')::float8) FROM jsonb_array_elements(usage->'resumeReport'->'llm') m) END), 0) AS "resumeReportCostUsd",
              COALESCE(SUM(CASE WHEN feature = 'interview'
                THEN (SELECT SUM((m->>'costUsd')::float8) FROM jsonb_array_elements(usage->'eval'->'llm') m) END), 0) AS "interviewEvalCostUsd",
              COALESCE(SUM(CASE WHEN feature = 'interview'
                THEN (SELECT SUM((m->>'costUsd')::float8) FROM jsonb_array_elements(usage->'brief'->'llm') m) END), 0) AS "interviewBriefCostUsd",
              COALESCE(SUM(CASE WHEN feature = 'interview'
                THEN (SELECT SUM((m->>'costUsd')::float8) FROM jsonb_array_elements(usage->'llmGeneration'->'llm') m) END), 0) AS "interviewGenerationCostUsd",
              COALESCE(SUM(CASE WHEN feature = 'interview'
                THEN (SELECT SUM((m->>'costUsd')::float8) FROM jsonb_array_elements(usage->'report'->'llm') m) END), 0) AS "interviewReportCostUsd",
              COALESCE(SUM(CASE WHEN feature = 'interview'
                THEN (usage->'tts'->>'costUsd')::float8 END), 0) AS "interviewTtsCostUsd",
              COALESCE(SUM(CASE WHEN feature = 'interview'
                THEN (usage->'stt'->>'costUsd')::float8 END), 0) AS "interviewSttCostUsd"
            FROM "UsageEvent"
            WHERE "organizationId" = $1 AND "isTest" = false
            """,
            org_id,
        )
        if row is None:
            return
        jd = float(row["jdExtractionCostUsd"] or 0)
        resume_ext = float(row["resumeExtractionCostUsd"] or 0)
        resume_report = float(row["resumeReportCostUsd"] or 0)
        interview_eval = float(row["interviewEvalCostUsd"] or 0)
        interview_brief = float(row["interviewBriefCostUsd"] or 0)
        interview_gen = float(row["interviewGenerationCostUsd"] or 0)
        interview_report = float(row["interviewReportCostUsd"] or 0)
        interview_tts = float(row["interviewTtsCostUsd"] or 0)
        interview_stt = float(row["interviewSttCostUsd"] or 0)
        total = jd + resume_ext + resume_report + interview_eval + interview_brief + interview_gen + interview_report + interview_tts + interview_stt
        org_row = await conn.fetchrow('SELECT name FROM "OrganizationDetails" WHERE id = $1', org_id)
        org_name = org_row["name"] if org_row else ""
        await conn.execute(
            """
            INSERT INTO "OrgUsageSummary"
              ("orgId","orgName","jdExtractionCostUsd","resumeExtractionCostUsd","resumeReportCostUsd",
               "interviewLlmCostUsd","interviewEvalCostUsd","interviewBriefCostUsd","interviewGenerationCostUsd",
               "interviewTtsCostUsd","interviewSttCostUsd","interviewReportCostUsd","totalCostUsd","lastComputedAt")
            VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,NOW())
            ON CONFLICT ("orgId") DO UPDATE SET
              "orgName" = $2, "jdExtractionCostUsd" = $3, "resumeExtractionCostUsd" = $4, "resumeReportCostUsd" = $5,
              "interviewLlmCostUsd" = $6, "interviewEvalCostUsd" = $6, "interviewBriefCostUsd" = $7,
              "interviewGenerationCostUsd" = $8, "interviewTtsCostUsd" = $9, "interviewSttCostUsd" = $10,
              "interviewReportCostUsd" = $11, "totalCostUsd" = $12, "lastComputedAt" = NOW()
            """,
            org_id, org_name, round(jd, 8), round(resume_ext, 8), round(resume_report, 8),
            round(interview_eval, 8), round(interview_brief, 8), round(interview_gen, 8),
            round(interview_tts, 8), round(interview_stt, 8), round(interview_report, 8), round(total, 8),
        )
        # NOTE: interviewLlmCostUsd historically mirrors interviewEvalCostUsd
        # (see lib/usage-metrics.ts computeOrgUsageBreakdown) -- both bound to
        # the $6 placeholder above is intentional, not a bug.
    except Exception as e:  # noqa: BLE001 — summary refresh must never break billing
        logger.error("[BILLING] _refresh_org_usage_summary failed (non-fatal) org=%s: %s", org_id, e, exc_info=True)


def _llm_entry(usage: dict[str, Any], *, provider: str = "openai") -> Optional[dict[str, Any]]:
    """Build one per-model LLM entry (with cost) from a manual usage dict, or None."""
    model = str(usage.get("model", "") or "").strip()
    if not model:
        return None
    input_t = int(usage.get("inputTokens", 0) or 0)
    cached_t = int(usage.get("cachedInputTokens", 0) or 0)
    output_t = int(usage.get("outputTokens", 0) or 0)
    cost = CostCalculator.openai(model, input_t, cached_t, output_t)
    return {
        "model": model, "provider": provider, "calls": 1,
        "inputTokens": input_t, "cachedInputTokens": cached_t,
        "outputTokens": output_t, "costUsd": round(cost, 8),
    }


# Call-site feature/ledgerFeature -> interview usage sub-key.
_INTERVIEW_SUBKEY: dict[str, str] = {
    "interviewEval": "eval",
    "interview": "eval",
    "interviewBrief": "brief",
    "interviewLLMGeneration": "llmGeneration",
    "interviewReport": "report",
}


class JdExtractionLedger:
    """Upserts the jd:{jobId} row. usage.jdExtraction.llm[]."""

    @classmethod
    async def record(cls, conn, org_id: str, feature: str, usage: dict[str, Any]) -> None:
        ctx = _usage_context(usage)
        job_id = str(ctx.get("jobId") or "").strip()
        if not job_id:
            logger.warning("[BILLING] JdExtractionLedger: no jobId in context — skipping ledger row")
            return
        entry = _llm_entry(usage)
        if not entry:
            return
        await EntityLedger.upsert(
            conn, org_id=org_id, feature="jdExtraction", event_id=f"jd:{job_id}",
            fragment={"jdExtraction": {"llm": [entry]}},
            job_id=job_id, job_title=ctx.get("jobTitle"),
            is_test=bool(ctx.get("isTest", False)),
            created_at=ctx.get("createdAt"),
        )


class ResumeLedger:
    """Upserts the resume:{applicationId} row. usage.resumeExtraction / .resumeReport."""

    @classmethod
    async def record(cls, conn, org_id: str, feature: str, usage: dict[str, Any]) -> None:
        ctx = _usage_context(usage)
        app_id = str(ctx.get("applicationId") or "").strip()
        if not app_id:
            logger.warning("[BILLING] ResumeLedger: no applicationId in context — skipping ledger row")
            return
        sub = "resumeReport" if feature == "resumeReport" else "resumeExtraction"
        entry = _llm_entry(usage)
        if not entry:
            return
        await EntityLedger.upsert(
            conn, org_id=org_id, feature="resumeExtraction", event_id=f"resume:{app_id}",
            fragment={sub: {"llm": [entry]}},
            job_id=ctx.get("jobId"), application_id=app_id,
            job_title=ctx.get("jobTitle"), candidate_name=ctx.get("candidateName"),
            is_test=bool(ctx.get("isTest", False)), created_at=ctx.get("createdAt"),
        )


class InterviewLedger:
    """Upserts the interview:{interviewId|applicationId} row.

    LLM sub-features (eval/brief/llmGeneration/report) come through record_llm; the
    session's TTS/STT come through record_audio. Both share the same entity row.
    """

    @staticmethod
    async def _resolve_interview_id(conn, app_id: Optional[str]) -> Optional[str]:
        """Look up Interview.id by applicationId (unique) -- call-site context
        for report/eval/brief/llmgen usage only carries applicationId, so
        without this every such UsageEvent row is written with interviewId=NULL
        even though a matching Interview row exists."""
        if not app_id:
            return None
        row = await conn.fetchrow('SELECT id FROM "Interview" WHERE "applicationId" = $1', app_id)
        return row["id"] if row else None

    @staticmethod
    async def _entity(conn, ctx: dict[str, Any]) -> tuple[Optional[str], Optional[str], Optional[str]]:
        """Return (entity_key_id, application_id, interview_id).

        Prefer interviewId when present; otherwise resolve it from applicationId
        via the Interview table (report/eval/brief/llmgen call sites only have
        applicationId at write time)."""
        app_id = str(ctx.get("applicationId") or "").strip() or None
        interview_id = str(ctx.get("interviewId") or "").strip() or None
        if not interview_id:
            interview_id = await InterviewLedger._resolve_interview_id(conn, app_id)
        key_id = interview_id or app_id
        return key_id, app_id, interview_id

    @classmethod
    async def record_llm(cls, conn, org_id: str, feature: str, usage: dict[str, Any]) -> None:
        ctx = _usage_context(usage)
        ledger_feature = str(ctx.get("ledgerFeature") or "").strip()
        sub = _INTERVIEW_SUBKEY.get(ledger_feature) or _INTERVIEW_SUBKEY.get(feature)
        if not sub:
            logger.warning("[BILLING] InterviewLedger: unknown sub-feature for feature=%r ledgerFeature=%r", feature, ledger_feature)
            return
        key_id, app_id, interview_id = await cls._entity(conn, ctx)
        if not key_id:
            logger.warning("[BILLING] InterviewLedger: no interviewId/applicationId — skipping ledger row")
            return
        entry = _llm_entry(usage)
        if not entry:
            return
        job_id = str(ctx.get("jobId") or "").strip() or None
        await EntityLedger.upsert(
            conn, org_id=org_id, feature="interview", event_id=f"interview:{key_id}",
            fragment={sub: {"llm": [entry]}},
            job_id=job_id, application_id=app_id, interview_id=interview_id,
            job_title=ctx.get("jobTitle"), candidate_name=ctx.get("candidateName"),
            is_test=bool(ctx.get("isTest", False)), created_at=ctx.get("createdAt"),
        )

    @classmethod
    async def record_audio(
        cls, conn, org_id: str, *, app_id: Optional[str], interview_id: Optional[str],
        job_id: Optional[str] = None,
        summary: dict[str, Any], candidate_name: Optional[str], job_title: Optional[str],
        is_test: bool,
    ) -> None:
        """Fold a session summary's tts/stt byModel maps into the interview row."""
        app_id = (app_id or "").strip() or None
        interview_id = (interview_id or "").strip() or None
        if not interview_id:
            interview_id = await cls._resolve_interview_id(conn, app_id)
        key_id = interview_id or app_id
        if not key_id:
            return
        fragment: dict[str, Any] = {}
        for kind in ("tts", "stt"):
            by_model = _coerce_jsonish(_coerce_jsonish(summary.get(kind)).get("byModel"))
            entries: list[dict[str, Any]] = []
            for msummary in by_model.values():
                m = _coerce_jsonish(msummary)
                provider = str(m.get("provider", "") or "").strip().upper() or ("DEEPGRAM" if kind == "stt" else "UNKNOWN")
                model = str(m.get("model", "") or "").strip() or "unknown"
                if kind == "tts":
                    chars = int(m.get("charactersCount", 0) or 0)
                    if chars <= 0:
                        continue
                    entries.append({"model": model, "provider": provider, "calls": 1,
                                    "characters": chars, "costUsd": round(CostCalculator.tts(provider, model, chars), 8)})
                else:
                    secs = float(m.get("audioDuration", 0) or 0.0)
                    if secs <= 0:
                        continue
                    entries.append({"model": model, "provider": provider, "calls": 1,
                                    "seconds": secs, "costUsd": round(CostCalculator.stt(provider, model, secs), 8)})
            if entries:
                fragment[kind] = {"byModel": entries}
        if not fragment:
            return
        await EntityLedger.upsert(
            conn, org_id=org_id, feature="interview", event_id=f"interview:{key_id}",
            fragment=fragment, application_id=(app_id or None), interview_id=(interview_id or None),
            job_id=(job_id or None), job_title=job_title, candidate_name=candidate_name, is_test=is_test,
        )


# ===============================================================================
# SECTION 6B -- Demo session billing
#
# Demo sessions have no OrganizationDetails row, so they never touch UsageEvent
# (organizationId is a required FK there). Same rate tables (CostCalculator),
# same per-model entry shape (_llm_entry / tts+stt byModel), written directly
# onto DemoSession.usageJson/usageCostUsd -- no separate ledger table, since
# this is written exactly once at session end (no concurrent-writer merge
# needed, unlike the org ledger which many calls hit throughout a session).
# ===============================================================================

async def save_demo_session_usage(
    demo_session_id: str,
    *,
    live_usages: list[dict[str, Any]] | None = None,      # live conversation LLM (from session.usage)
    eval_usages: list[dict[str, Any]] | None = None,       # per-answer eval LLM calls
    llmgen_usages: list[dict[str, Any]] | None = None,     # per-topic-transition question-gen LLM calls
    tts_provider: Optional[str] = None,
    tts_model: Optional[str] = None,
    tts_characters: int = 0,
    stt_provider: Optional[str] = None,
    stt_model: Optional[str] = None,
    stt_audio_seconds: float = 0.0,
) -> None:
    """Write DemoSession.usageJson/usageCostUsd for a completed demo interview.

    Never raises -- billing must not break a demo session's completion path.
    """
    if not demo_session_id or not DATABASE_URL:
        return
    try:
        usage: dict[str, Any] = {}

        def _add_llm_bucket(key: str, entries_raw: list[dict[str, Any]] | None) -> None:
            if not entries_raw:
                return
            arr: list[dict[str, Any]] = []
            for raw in entries_raw:
                entry = _llm_entry(raw)
                if entry:
                    _merge_model_array(arr, entry)
            if arr:
                usage[key] = {"llm": arr}

        _add_llm_bucket("live", live_usages)
        _add_llm_bucket("eval", eval_usages)
        _add_llm_bucket("llmGeneration", llmgen_usages)

        if tts_characters > 0 and tts_provider and tts_model:
            cost = CostCalculator.tts(tts_provider, tts_model, tts_characters)
            usage["tts"] = {
                "characters": tts_characters, "costUsd": round(cost, 8),
                "byModel": [{"model": tts_model, "provider": tts_provider.strip().upper(),
                             "calls": 1, "characters": tts_characters, "costUsd": round(cost, 8)}],
            }
        if stt_audio_seconds > 0 and stt_provider and stt_model:
            cost = CostCalculator.stt(stt_provider, stt_model, stt_audio_seconds)
            usage["stt"] = {
                "seconds": stt_audio_seconds, "costUsd": round(cost, 8),
                "byModel": [{"model": stt_model, "provider": stt_provider.strip().upper(),
                             "calls": 1, "seconds": stt_audio_seconds, "costUsd": round(cost, 8)}],
            }

        if not usage:
            return
        cost_usd = _sum_usage_cost(usage)

        from interview.agent_persistence import DatabasePool  # lazy -- avoid circular at module load
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            await conn.execute(
                'UPDATE "DemoSession" SET "usageJson" = $1::jsonb, "usageCostUsd" = $2 WHERE id = $3',
                json.dumps(usage), cost_usd, demo_session_id,
            )
        logger.info("[BILLING] Saved demo session usage: session=%s cost=$%.6f", demo_session_id, cost_usd)
    except Exception as e:  # noqa: BLE001 -- billing must never break session completion
        logger.error("[BILLING] save_demo_session_usage failed for session=%s: %s", demo_session_id, e, exc_info=True)


async def _record_ledger_entry(conn, org_id: str, feature: str, usage: dict[str, Any]) -> None:
    """Route one manual usage entry to the right domain ledger (LLM path)."""
    ctx = _usage_context(usage)
    ledger_feature = str(ctx.get("ledgerFeature") or "").strip()
    # voicePreview has no interview/application entity — kept in the org blob only.
    if ledger_feature == "voicePreview":
        return
    if feature == "jdExtraction":
        await JdExtractionLedger.record(conn, org_id, feature, usage)
    elif feature in ("resumeExtraction", "resumeReport"):
        await ResumeLedger.record(conn, org_id, feature, usage)
    else:  # interview / interviewBrief / interviewLLMGeneration / interviewReport / interviewEval
        await InterviewLedger.record_llm(conn, org_id, feature, usage)


# ponytail: retired LedgerWriter (per-call rows) in favour of the 3 entity ledgers
# above. Every ledger write now upserts one entity row via EntityLedger.


def _to_ts(v: Any):
    """Coerce a ledger createdAt (epoch float or None) to a datetime or None."""
    if v is None:
        return None
    try:
        from datetime import datetime, timezone
        return datetime.fromtimestamp(float(v), tz=timezone.utc)
    except Exception:
        return None


# ===============================================================================
# SECTION 8 -- BillingRepository (OOP)
#
# Every SQL write related to billing lives here. One class, one responsibility.
# If a DB write fails, the traceback always points to this class.
# ===============================================================================

class BillingRepository:
    """All DB writes for billing. Stateless — no instance data, only classmethods."""

    # Standalone Modal workers (e.g. generate_brief.py) own their own asyncpg
    # pool and can't pull in agent_persistence.DatabasePool without dragging
    # its report_pipeline re-export chain into their image. They inject their
    # pool here instead; the default path (live agent runtime) is unaffected.
    _external_pool: ClassVar[Any] = None

    @classmethod
    def set_external_pool(cls, pool) -> None:
        cls._external_pool = pool

    @classmethod
    async def _get_pool(cls):
        if cls._external_pool is not None:
            return cls._external_pool
        from interview.agent_persistence import DatabasePool  # lazy — avoids circular at module load
        return await DatabasePool.get()

    @classmethod
    async def flush_pending(cls, org_id: str) -> None:
        """Write all pending manual billing entries for an org to the UsageEvent
        ledger (the sole source of truth) in one transaction."""
        if not org_id or not DATABASE_URL:
            return
        pending = PendingBuffer.pop(org_id)
        if not pending:
            return
        try:
            pool = await cls._get_pool()
            async with pool.acquire() as conn:
                async with conn.transaction():
                    # Per-entity ledger upserts (non-fatal on individual failure).
                    for feature, usage in pending:
                        await _record_ledger_entry(conn, org_id, feature, usage)
            logger.info("[BILLING] Flushed %d pending entries for org=%s", len(pending), org_id)
        except Exception as e:
            logger.error("[BILLING] flush_pending failed for org=%s: %s", org_id, e, exc_info=True)
            raise

    @classmethod
    async def save_org_usage(
        cls,
        org_id: str,
        session_summary: dict[str, Any],
        tts_provider: Optional[str] = None,
        tts_model:    Optional[str] = None,
        stt_provider: Optional[str] = None,
        stt_model:    Optional[str] = None,
        *,
        app_id:         Optional[str] = None,
        interview_id:   Optional[str] = None,
        job_id:         Optional[str] = None,
        candidate_name: Optional[str] = None,
        job_title:      Optional[str] = None,
        is_test:        bool = False,
    ) -> None:
        """Record a session's TTS/STT into the interview UsageEvent entity row.

        UsageEvent is the sole source of truth: real and test sessions write the
        same interview:{interviewId|applicationId} row, differing only by is_test.
        """
        if not org_id or not DATABASE_URL or not app_id:
            return
        if not any(bucket.get("sessions") for bucket in session_summary.values()):
            return
        try:
            pool = await cls._get_pool()
            async with pool.acquire() as conn:
                async with conn.transaction():
                    await InterviewLedger.record_audio(
                        conn, org_id, app_id=app_id, interview_id=interview_id, job_id=job_id,
                        summary=session_summary,
                        candidate_name=candidate_name, job_title=job_title,
                        is_test=is_test,
                    )
            llm_t = session_summary["llm"]["totals"]
            logger.info(
                "[BILLING] Saved org usage: org=%s llm_tokens=%d stt_secs=%.1f tts_secs=%.1f test=%s",
                org_id,
                int(llm_t.get("inputTokens", 0)) + int(llm_t.get("outputTokens", 0)),
                session_summary["stt"]["totals"].get("audioDuration", 0),
                session_summary["tts"]["totals"].get("audioDuration", 0),
                is_test,
            )
        except Exception as e:
            logger.error("[BILLING] save_org_usage failed for org=%s: %s", org_id, e, exc_info=True)
            raise

    @classmethod
    async def record_org_billing_usage(cls, org_id: str, feature: str, usage: dict[str, Any]) -> None:
        """Record a single external LLM usage event and flush it to DB immediately.

        Used by non-agent callers (worker.ts JD/resume extraction) that spawn this
        script as a subprocess and cannot share the in-process PendingBuffer across
        process boundaries.
        """
        if not org_id or not usage or not DATABASE_URL:
            return
        PendingBuffer.push(org_id, feature, usage)
        await cls.flush_pending(org_id)

    @classmethod
    async def deduct_quota(cls, app_id: str, duration_seconds: Optional[float] = None) -> None:
        """Atomically deduct one interview quota slot. Idempotent via the
        dedicated Interview.quotaDeductedAt column: a single
        UPDATE ... WHERE "quotaDeductedAt" IS NULL RETURNING id is the atomic
        claim — exactly one caller wins, the rest see no rows and skip."""
        if not DATABASE_URL:
            return
        try:
            pool = await cls._get_pool()
            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    """SELECT d."organizationId" AS "orgId",
                              i."durationInSeconds" AS "interviewDuration",
                              NULLIF(i."sessionRecording"->>'durationSec', '')::float AS "recordingDurationSec"
                       FROM "Interview" i
                       JOIN "Application" a ON a.id = i."applicationId"
                       JOIN "Job"       d ON d.id  = a."jobId"
                       WHERE a.id = $1 LIMIT 1""",
                    app_id,
                )
                if not row:
                    logger.warning("[BILLING] deduct_quota: no Interview row for app=%s", app_id)
                    return
                org_id = row["orgId"]
                if not org_id:
                    logger.warning("[BILLING] deduct_quota: no orgId for app=%s", app_id)
                    return
                dur = float(duration_seconds or 0) or float(row["interviewDuration"] or 0) or float(row["recordingDurationSec"] or 0)
                marked = await conn.fetch(
                    """UPDATE "Interview"
                       SET "quotaDeductedAt" = NOW(), "interviewUpdatedAt" = NOW()
                       WHERE "applicationId" = $1 AND "quotaDeductedAt" IS NULL
                       RETURNING id""",
                    app_id,
                )
                if not marked:
                    logger.info("[BILLING] deduct_quota: already billed for app=%s — skip", app_id)
                    return
                await conn.execute(
                    'UPDATE "OrganizationDetails" SET "totalInterviewsUsed" = COALESCE("totalInterviewsUsed", 0) + 1, "orgUpdatedAt" = NOW() WHERE id = $1',
                    org_id,
                )
                if dur > 0:
                    credits = round((dur / 60) * 100) / 100
                    if credits > 0:
                        await conn.execute(
                            'UPDATE "OrganizationDetails" SET "billingCreditsUsed" = COALESCE("billingCreditsUsed", 0) + $1, "orgUpdatedAt" = NOW() WHERE id = $2',
                            credits, org_id,
                        )
                        logger.info("[BILLING] Deducted 1 quota + %.2f credits: app=%s org=%s dur=%.0fs", credits, app_id, org_id, dur)
                    else:
                        logger.info("[BILLING] Deducted 1 quota (no credits — dur=%.0fs): app=%s org=%s", dur, app_id, org_id)
                else:
                    logger.warning("[BILLING] Deducted 1 quota but duration unknown: app=%s org=%s", app_id, org_id)
        except Exception as e:
            logger.error("[BILLING] deduct_quota failed for app=%s: %s", app_id, e, exc_info=True)
            raise


# ===============================================================================
# SECTION 9 -- Public API
#
# These are the only functions the rest of the codebase should call.
# Each maps to one product feature.
# ===============================================================================

async def record_manual_usage(org_id: Optional[str], feature: str, usage: dict[str, Any]) -> None:
    """Accumulate one manual LLM usage record (report pipeline, JD/resume extraction).

    Does NOT write to DB — call flush_billing() at session end.
    Replaces: persist_org_manual_billing_usage()
    """
    if not org_id or not usage:
        return
    PendingBuffer.push(org_id, feature, usage)


async def flush_billing(org_id: Optional[str]) -> None:
    """Write all accumulated manual usage to DB. Call once at session end.

    Replaces: flush_pending_manual_billing()
    """
    if not org_id:
        return
    await BillingRepository.flush_pending(org_id)


async def save_org_usage_metrics(
    org_id:                   Optional[str],
    session_usage:            Any,
    *,
    tts_provider:             Optional[str] = None,
    tts_model:                Optional[str] = None,
    stt_provider:             Optional[str] = None,
    stt_model:                Optional[str] = None,
    plugin_tts_characters:    int   = 0,
    plugin_tts_audio_seconds: float = 0.0,
    plugin_stt_audio_seconds: float = 0.0,
    app_id:                   Optional[str] = None,
    interview_id:             Optional[str] = None,
    job_id:                   Optional[str] = None,
    candidate_name:           Optional[str] = None,
    job_title:                Optional[str] = None,
    is_test:                  bool = False,
) -> None:
    """Merge a session's usage into Organization.usageMetrics.

    Covers the full interview session at the org level (LiveKit raw buckets +
    structured interview billing bucket).
    Replaces: persist_org_usage_metrics()
    """
    if not org_id or not DATABASE_URL:
        return
    has_plugin = bool(plugin_tts_characters or plugin_tts_audio_seconds or plugin_stt_audio_seconds)
    if session_usage is None and not has_plugin:
        logger.info("[BILLING] save_org_usage_metrics: no usage for org=%s — skipping", org_id)
        return

    summary = UsageSummarizer.from_session(session_usage)
    summary = UsageSummarizer.override_plugin_metrics(
        summary,
        tts_provider=tts_provider, tts_model=tts_model,
        tts_chars=plugin_tts_characters, tts_secs=plugin_tts_audio_seconds,
        stt_provider=stt_provider, stt_model=stt_model,
        stt_secs=plugin_stt_audio_seconds,
    )
    await BillingRepository.save_org_usage(
        org_id, summary,
        tts_provider=tts_provider, tts_model=tts_model,
        stt_provider=stt_provider, stt_model=stt_model,
        app_id=app_id, interview_id=interview_id, job_id=job_id,
        candidate_name=candidate_name, job_title=job_title, is_test=is_test,
    )


async def deduct_interview_quota(app_id: str, duration_seconds: Optional[float] = None) -> None:
    """Deduct one interview credit + quota slot. Idempotent.

    Replaces: deduct_interview_billing()
    """
    await BillingRepository.deduct_quota(app_id, duration_seconds)

async def record_external_billing_usage(org_id: Optional[str], feature: str, usage: dict[str, Any]) -> None:
    """Record a usage event from non-Python callers such as Next.js routes/workers.

    Also the single path for interviewReport LLM usage from report_pipeline.py:
    test sessions flow through here identically to real ones (usage["context"]
    carries isTest=True), landing in the same interview:{app} UsageEvent row's
    report sub-key just flagged isTest.
    """
    if not org_id:
        return
    await BillingRepository.record_org_billing_usage(org_id, feature, usage)


def _json_result(ok: bool, **payload: Any) -> None:
    print(json.dumps({"ok": ok, **payload}, separators=(",", ":")))


async def _main_cli() -> int:
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        if command == "record-org-usage":
            await record_external_billing_usage(payload.get("orgId"), payload.get("feature", "interview"), payload.get("usage") or {})
            _json_result(True, result="usage recorded")
            return 0
        if command == "deduct-interview-quota":
            await deduct_interview_quota(payload.get("appId") or payload.get("applicationId"), payload.get("durationSeconds"))
            _json_result(True)
            return 0
        if command == "price-llm-usage":
            # Stateless -- no DB write, no org. Prices one OpenAI usage dict
            # ({model, inputTokens, outputTokens, cachedInputTokens}) and returns
            # the same {model, provider, calls, ...tokens, costUsd} shape every
            # other ledger uses, so callers that don't have an org (demo
            # templates) can still price a call with the ONE rate table in this
            # file instead of duplicating _OPENAI_RATES in TypeScript.
            entry = _llm_entry(payload.get("usage") or {})
            if not entry:
                _json_result(False, error="usage.model is required")
                return 2
            _json_result(True, entry=entry)
            return 0
        _json_result(False, error=f"Unknown billing command: {command}")
        return 2
    except Exception as exc:
        _json_result(False, error=str(exc))
        return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main_cli()))

