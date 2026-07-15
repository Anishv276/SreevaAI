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
  │  Section 6 — BucketMerger (OOP)     (merges one session into the   │
  │                                      right OrgBilling bucket)       │
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
# graceful-default behaviour already used for Cartesia/ElevenLabs/Deepgram.
_OPENAI_RATES_DEFAULT: dict[str, float] = {
    "input":        float(os.environ.get("OPENAI_LLM_DEFAULT_INPUT_USD_PER_MILLION",  "0.40")),
    "cached_input": float(os.environ.get("OPENAI_LLM_DEFAULT_CACHED_USD_PER_MILLION", "0.10")),
    "output":       float(os.environ.get("OPENAI_LLM_DEFAULT_OUTPUT_USD_PER_MILLION", "1.60")),
}

# Cartesia TTS -- USD per million characters
_CARTESIA_TTS_RATES: dict[str, float] = {
    "sonic-3":    15.0,
    "sonic-2":    15.0,
    "sonic":      15.0,
    "sonic-3-hd": 30.0,
    "sonic-2-hd": 30.0,
    "sonic-hd":   30.0,
}
_CARTESIA_TTS_DEFAULT: float = float(os.environ.get("CARTESIA_TTS_USD_PER_MILLION_CHARS", "15.0"))

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
class _CartesiaStrategy:
    def tts_cost(self, model: str, chars: int) -> float:
        return (chars / 1_000_000.0) * _CARTESIA_TTS_RATES.get(model, _CARTESIA_TTS_DEFAULT)

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
    "CARTESIA":   _CartesiaStrategy(),
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
    _TTS_PREFIX_RE:  ClassVar[re.Pattern[str]] = re.compile(r"^(cartesia|elevenlabs)/")

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
# SECTION 6 -- BucketMerger (OOP)
#
# Merges one session's usage into a FeatureBilling bucket in-place.
# All three component merges (LLM, TTS, STT) follow the same pattern:
#   1. Extract relevant data from session_summary
#   2. Validate provider + model present (raises if missing)
#   3. Compute cost via CostCalculator
#   4. Accumulate into the Pydantic model (in-place mutation)
# ===============================================================================

class BucketMerger:
    """Merges session usage into a FeatureBilling bucket.

    All methods mutate `bucket` in-place and return None.
    Separating the three component merges makes each individually testable.
    """

    @staticmethod
    def merge_llm(bucket: FeatureBilling, llm_totals: dict, llm_by_model: dict) -> None:
        """O(1) hash-lookup accumulation per model. Raises if provider/model absent."""
        has_totals = any(
            int(llm_totals.get(k, 0) or 0) > 0
            for k in ("inputTokens", "inputCachedTokens", "outputTokens", "sessionDuration")
        )
        if not llm_by_model and not has_totals:
            return

        bucket.runs              += 1
        bucket.inputTokens       += int(llm_totals.get("inputTokens",       0) or 0)
        bucket.cachedInputTokens += int(llm_totals.get("inputCachedTokens", 0) or 0)
        bucket.outputTokens      += int(llm_totals.get("outputTokens",      0) or 0)
        bucket.sessionDuration   += float(llm_totals.get("sessionDuration", 0) or 0)

        session_cost = 0.0
        for model_key, raw in llm_by_model.items():
            row      = _coerce_jsonish(raw)
            provider = str(row.get("provider", "") or "").strip().upper()
            model    = str(row.get("model",    "") or "").strip()
            if not provider or not model:
                raise ValueError(f"[BILLING] LLM merge: provider/model missing in {model_key!r}")
            input_t  = int(row.get("inputTokens",       0) or 0)
            cached_t = int(row.get("inputCachedTokens", 0) or 0)
            output_t = int(row.get("outputTokens",      0) or 0)
            dur      = float(row.get("sessionDuration", 0) or 0)
            cost     = CostCalculator.openai(model, input_t, cached_t, output_t)
            session_cost += cost
            mb = bucket.byModel.setdefault(model_key, ModelBilling(provider=provider, model=model))
            mb.runs              += 1
            mb.inputTokens       += input_t
            mb.cachedInputTokens += cached_t
            mb.outputTokens      += output_t
            mb.sessionDuration   += dur
            mb.costUsd           += cost

        bucket.costUsd += session_cost

    @staticmethod
    def merge_tts(bucket: FeatureBilling, tts_by_model: dict, tts_total_chars: int) -> None:
        if tts_total_chars > 0 and not tts_by_model:
            raise ValueError("[BILLING] TTS merge: byModel is empty but total chars > 0")

        session_chars, session_cost = 0, 0.0
        for _, raw in tts_by_model.items():
            row      = _coerce_jsonish(raw)
            provider = str(row.get("provider", "") or "").strip().upper()
            model    = str(row.get("model",    "") or "").strip()
            if not provider or not model:
                raise ValueError("[BILLING] TTS merge: provider/model missing")
            chars = int(row.get("charactersCount", 0) or row.get("inputTokens", 0) or 0)
            if not chars:
                continue
            session_chars += chars
            cost           = CostCalculator.tts(provider, model, chars)
            session_cost  += cost
            key = f"{provider.lower()}:{model.lower()}"
            mb  = bucket.ttsByModel.setdefault(key, ModelBilling(provider=provider, model=model))
            mb.runs       += 1
            mb.characters += chars
            mb.costUsd    += cost

        if session_chars:
            bucket.ttsRuns       += 1
            bucket.ttsCharacters += session_chars
            bucket.ttsCostUsd    += session_cost

    @staticmethod
    def merge_stt(bucket: FeatureBilling, stt_by_model: dict, stt_total_secs: float) -> None:
        if stt_total_secs > 0 and not stt_by_model:
            raise ValueError("[BILLING] STT merge: byModel is empty but total seconds > 0")

        session_secs, session_cost = 0.0, 0.0
        for _, raw in stt_by_model.items():
            row      = _coerce_jsonish(raw)
            provider = str(row.get("provider", "") or "").strip().upper()
            model    = str(row.get("model",    "") or "").strip()
            if not provider or not model:
                raise ValueError("[BILLING] STT merge: provider/model missing")
            secs = float(row.get("audioDuration", 0) or 0.0)
            if not secs:
                continue
            session_secs += secs
            cost          = CostCalculator.stt(provider, model, secs)
            session_cost += cost
            key = f"{provider.lower()}:{model.lower()}"
            mb  = bucket.sttByModel.setdefault(key, ModelBilling(provider=provider, model=model))
            mb.runs        += 1
            mb.audioSeconds += secs
            mb.costUsd     += cost

        if session_secs:
            bucket.sttRuns        += 1
            bucket.sttAudioSeconds += session_secs
            bucket.sttCostUsd     += session_cost

    @classmethod
    def merge_session(
        cls,
        existing_org_billing: dict[str, Any],
        feature: str,
        session_summary: dict[str, Any],
        tts_config: Optional[dict] = None,
        stt_config: Optional[dict] = None,
    ) -> dict[str, Any]:
        """Merge one session into the right feature bucket and return updated billing dict.

        This is the main entry point. It:
          1. Validates the feature name (O(1) frozenset check)
          2. Loads the OrgBilling Pydantic model (validates all bucket shapes)
          3. Calls the three component merges
          4. Returns the updated dict (Pydantic → dict)
        """
        if feature not in _VALID_FEATURES:
            raise ValueError(f"[BILLING] Unknown feature {feature!r}. Valid: {sorted(_VALID_FEATURES)}")

        merged = dict(existing_org_billing)
        org    = OrgBilling.model_validate(_coerce_jsonish(merged.get("billing")))
        bucket: FeatureBilling = getattr(org, feature)

        llm_data  = _coerce_jsonish(session_summary.get("llm"))
        tts_data  = _coerce_jsonish(session_summary.get("tts"))
        stt_data  = _coerce_jsonish(session_summary.get("stt"))

        llm_totals   = _coerce_jsonish(llm_data.get("totals"))
        llm_by_model = _coerce_jsonish(llm_data.get("byModel"))
        tts_totals   = _coerce_jsonish(tts_data.get("totals"))
        tts_by_model = _coerce_jsonish(tts_data.get("byModel"))
        stt_totals   = _coerce_jsonish(stt_data.get("totals"))
        stt_by_model = _coerce_jsonish(stt_data.get("byModel"))

        tts_chars = int(tts_totals.get("charactersCount", 0) or tts_totals.get("inputTokens", 0) or 0)
        stt_secs  = float(stt_totals.get("audioDuration", 0) or 0.0)

        llm_has = bool(llm_by_model) or any(
            int(llm_totals.get(k, 0) or 0) > 0
            for k in ("inputTokens", "inputCachedTokens", "outputTokens", "sessionDuration")
        )
        if not llm_has and not tts_chars and not stt_secs:
            merged["billing"] = org.model_dump()
            return merged

        if llm_has:
            cls.merge_llm(bucket, llm_totals, llm_by_model)
        cls.merge_tts(bucket, tts_by_model, tts_chars)
        cls.merge_stt(bucket, stt_by_model, stt_secs)

        merged["billing"] = org.model_dump()
        return merged


# Backward-compat aliases used by agent_persistence.py and agent_runtime.py
def merge_feature_billing(
    existing: dict[str, Any],
    feature:  str,
    session_summary: dict[str, Any],
    tts_config: Optional[dict] = None,
    stt_config: Optional[dict] = None,
) -> dict[str, Any]:
    return BucketMerger.merge_session(existing, feature, session_summary, tts_config, stt_config)


def merge_interview_billing(
    existing: dict[str, Any],
    session_summary: dict[str, Any],
    tts_config: Optional[dict] = None,
    stt_config: Optional[dict] = None,
) -> dict[str, Any]:
    return BucketMerger.merge_session(existing, "interview", session_summary, tts_config, stt_config)


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

    @classmethod
    def build_session_summary(cls, model: str, usage: dict[str, Any]) -> dict[str, Any]:
        """Wrap a single manual LLM usage record as a session_summary dict.

        This lets BucketMerger.merge_session() handle manual LLM records the
        same way it handles LiveKit AgentSessionUsage records.
        """
        model = str(model or "").strip()
        if not model:
            raise ValueError("[BILLING] PendingBuffer.build_session_summary: model name is required")
        input_t  = int(usage.get("inputTokens",       0) or 0)
        cached_t = int(usage.get("cachedInputTokens", 0) or 0)
        output_t = int(usage.get("outputTokens",      0) or 0)
        dur      = float(usage.get("sessionDuration", 0) or 0)
        return {
            "llm": {
                "sessions": 1,
                "totals": {
                    "inputTokens":       input_t,
                    "inputCachedTokens": cached_t,
                    "outputTokens":      output_t,
                    "sessionDuration":   dur,
                },
                "byModel": {
                    f"openai:{model}": {
                        "provider":          "openai",
                        "model":             model,
                        "inputTokens":       input_t,
                        "inputCachedTokens": cached_t,
                        "outputTokens":      output_t,
                        "sessionDuration":   dur,
                    }
                },
            },
            "tts": {"sessions": 0, "totals": {}, "byModel": {}},
            "stt": {"sessions": 0, "totals": {}, "byModel": {}},
        }


def merge_manual_billing_usage(
    existing: dict[str, Any],
    feature:  str,
    usage:    dict[str, Any],
) -> dict[str, Any]:
    """Backward-compat function: merge one manual usage record into the org billing dict.

    Handles both LLM-shaped usage (inputTokens/outputTokens + model) and
    TTS/STT-shaped usage (ttsCharacters / sttAudioSeconds + ttsProvider/ttsModel
    or sttProvider/sttModel). The TTS/STT branch is what makes voice-preview
    billing (which sends no `model`) actually land in the blob instead of
    raising "model required".
    """
    tts_chars = int(usage.get("ttsCharacters", 0) or 0)
    stt_secs  = float(usage.get("sttAudioSeconds", 0) or 0)
    model     = str(usage.get("model", "") or "").strip()

    # LLM-shaped record: merge via the session-summary path (unchanged behaviour).
    if model:
        session_summary = PendingBuffer.build_session_summary(model, usage)
        return BucketMerger.merge_session(existing, feature, session_summary)

    # TTS/STT-only record (no LLM model): build a summary carrying just the
    # audio side so BucketMerger.merge_session can fold it into the bucket.
    if tts_chars > 0 or stt_secs > 0:
        summary: dict[str, Any] = {
            "llm": {"sessions": 0, "totals": {}, "byModel": {}},
            "tts": {"sessions": 0, "totals": {}, "byModel": {}},
            "stt": {"sessions": 0, "totals": {}, "byModel": {}},
        }
        if tts_chars > 0:
            tp = str(usage.get("ttsProvider", "") or "").strip().upper() or "UNKNOWN"
            tm = str(usage.get("ttsModel", "") or "").strip() or "unknown"
            summary["tts"] = {
                "sessions": 1,
                "totals": {"charactersCount": tts_chars},
                "byModel": {f"{tp}:{tm}": {"provider": tp, "model": tm, "charactersCount": tts_chars}},
            }
        if stt_secs > 0:
            sp = str(usage.get("sttProvider", "") or "").strip().upper() or "DEEPGRAM"
            sm = str(usage.get("sttModel", "") or "").strip() or "unknown"
            summary["stt"] = {
                "sessions": 1,
                "totals": {"audioDuration": stt_secs},
                "byModel": {f"{sp}:{sm}": {"provider": sp, "model": sm, "audioDuration": stt_secs}},
            }
        return BucketMerger.merge_session(existing, feature, summary)

    raise ValueError(f"[BILLING] merge_manual_billing_usage: model required for feature {feature!r}")


# ===============================================================================
# SECTION 8A -- LedgerWriter (OOP)
#
# Emits per-event rows into the "UsageEvent" table. The org blob remains the
# source of truth for TOTALS; this ledger powers the super-admin per-item detail
# views. Every insert is idempotent (ON CONFLICT ("eventId") DO NOTHING) and the
# whole insert path is wrapped in try/except so a ledger failure (e.g. the table
# not yet migrated on a stale deploy) can never break billing.
#
# Context envelope: manual-usage callers may attach usage["context"] =
#   {eventId, jobId, applicationId, interviewId, jobTitle, candidateName,
#    label, ledgerFeature, createdAt, source}
# Old billing.py deployments simply ignore this extra key.
# ===============================================================================

def _usage_context(usage: dict[str, Any]) -> dict[str, Any]:
    """Extract the optional ledger context envelope from a usage dict."""
    ctx = usage.get("context")
    return dict(ctx) if isinstance(ctx, dict) else {}


class LedgerWriter:
    """Builds and inserts per-event UsageEvent rows. Stateless — classmethods only."""

    @staticmethod
    def _row(
        *,
        feature: str, kind: str, provider: str, model: str,
        event_id: str, cost_usd: float,
        calls: int = 1, input_t: int = 0, cached_t: int = 0, output_t: int = 0,
        tts_chars: int = 0, stt_secs: float = 0.0,
        ctx: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "id": "evt_" + uuid.uuid4().hex,
            "feature": ctx.get("ledgerFeature") or feature,
            "kind": kind,
            "provider": provider or "openai",
            "model": model or "unknown",
            "calls": int(calls or 0),
            "inputTokens": int(input_t or 0),
            "cachedInputTokens": int(cached_t or 0),
            "outputTokens": int(output_t or 0),
            "ttsCharacters": int(tts_chars or 0),
            "sttAudioSeconds": float(stt_secs or 0.0),
            "costUsd": round(float(cost_usd or 0.0), 8),
            "jobId": ctx.get("jobId"),
            "applicationId": ctx.get("applicationId"),
            "interviewId": ctx.get("interviewId"),
            "jobTitle": ctx.get("jobTitle"),
            "candidateName": ctx.get("candidateName"),
            "label": ctx.get("label"),
            "eventId": event_id,
            "source": ctx.get("source") or "live",
            "isTest": bool(ctx.get("isTest", False)),
            "createdAt": ctx.get("createdAt"),  # None → DB default now()
        }

    @classmethod
    def build_rows(cls, pending: list[tuple[str, dict]]) -> list[dict[str, Any]]:
        """Turn pending (feature, usage) entries into UsageEvent row dicts.

        One row per (feature, kind, provider:model). The logical eventId from
        context is suffixed with :<kind>:<provider>:<model> so retries dedup and
        multiple models under one logical event get distinct rows.
        """
        rows: list[dict[str, Any]] = []
        for feature, usage in pending:
            ctx = _usage_context(usage)
            logical = str(ctx.get("eventId") or usage.get("eventId") or "").strip()
            if not logical:
                logical = "evt:" + uuid.uuid4().hex

            model = str(usage.get("model", "") or "").strip()
            if model:
                provider = "openai"
                input_t  = int(usage.get("inputTokens", 0) or 0)
                cached_t = int(usage.get("cachedInputTokens", 0) or 0)
                output_t = int(usage.get("outputTokens", 0) or 0)
                cost = CostCalculator.openai(model, input_t, cached_t, output_t)
                kind = "embedding" if usage.get("isEmbedding") else "llm"
                rows.append(cls._row(
                    feature=feature, kind=kind, provider=provider, model=model,
                    event_id=f"{logical}:{kind}:{provider}:{model}", cost_usd=cost,
                    input_t=input_t, cached_t=cached_t, output_t=output_t, ctx=ctx,
                ))

            tts_chars = int(usage.get("ttsCharacters", 0) or 0)
            if tts_chars > 0:
                tp = str(usage.get("ttsProvider", "") or "").strip().upper() or "UNKNOWN"
                tm = str(usage.get("ttsModel", "") or "").strip() or "unknown"
                cost = CostCalculator.tts(tp, tm, tts_chars)
                rows.append(cls._row(
                    feature=feature, kind="tts", provider=tp, model=tm,
                    event_id=f"{logical}:tts:{tp}:{tm}", cost_usd=cost,
                    tts_chars=tts_chars, ctx=ctx,
                ))

            stt_secs = float(usage.get("sttAudioSeconds", 0) or 0)
            if stt_secs > 0:
                sp = str(usage.get("sttProvider", "") or "").strip().upper() or "DEEPGRAM"
                sm = str(usage.get("sttModel", "") or "").strip() or "unknown"
                cost = CostCalculator.stt(sp, sm, stt_secs)
                rows.append(cls._row(
                    feature=feature, kind="stt", provider=sp, model=sm,
                    event_id=f"{logical}:stt:{sp}:{sm}", cost_usd=cost,
                    stt_secs=stt_secs, ctx=ctx,
                ))
        return rows

    @staticmethod
    def build_session_rows(
        *, app_id: str, interview_id: Optional[str], summary: dict[str, Any],
        candidate_name: Optional[str], job_title: Optional[str], is_test: bool,
    ) -> list[dict[str, Any]]:
        """Build interviewSession TTS/STT ledger rows from a session summary's
        tts/stt byModel maps. LLM rows come via the manual-usage pending path
        (eval/brief/llmgen), so only audio is emitted here."""
        rows: list[dict[str, Any]] = []
        if not app_id:
            return rows
        ctx = {
            "applicationId": app_id, "interviewId": interview_id,
            "candidateName": candidate_name, "jobTitle": job_title, "isTest": is_test,
        }
        for kind in ("tts", "stt"):
            by_model = _coerce_jsonish(_coerce_jsonish(summary.get(kind)).get("byModel"))
            for msummary in by_model.values():
                m = _coerce_jsonish(msummary)
                provider = str(m.get("provider", "") or "").strip().upper() or ("DEEPGRAM" if kind == "stt" else "UNKNOWN")
                model    = str(m.get("model", "") or "").strip() or "unknown"
                chars    = int(m.get("charactersCount", 0) or 0)
                secs     = float(m.get("audioDuration", 0) or 0.0)
                if kind == "tts":
                    if chars <= 0:
                        continue
                    cost = CostCalculator.tts(provider, model, chars)
                else:
                    if secs <= 0:
                        continue
                    cost = CostCalculator.stt(provider, model, secs)
                rows.append(LedgerWriter._row(
                    feature="interviewSession", kind=kind, provider=provider, model=model,
                    event_id=f"interview:{app_id}:{kind}:{provider}:{model}", cost_usd=cost,
                    tts_chars=chars if kind == "tts" else 0,
                    stt_secs=secs if kind == "stt" else 0.0, ctx=ctx,
                ))
        return rows

    @classmethod
    async def insert(cls, conn, rows: list[dict[str, Any]]) -> None:
        """Insert ledger rows (ON CONFLICT DO NOTHING). Never raises — a ledger
        failure must not break the billing transaction that owns the blob."""
        if not rows:
            return
        try:
            await conn.executemany(
                'INSERT INTO "UsageEvent" '
                '("id","organizationId","feature","kind","provider","model","calls",'
                '"inputTokens","cachedInputTokens","outputTokens","ttsCharacters",'
                '"sttAudioSeconds","costUsd","jobId","applicationId","interviewId",'
                '"jobTitle","candidateName","label","eventId","source","isTest","createdAt") '
                "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,"
                "COALESCE($23, NOW())) "
                'ON CONFLICT ("eventId") DO NOTHING',
                [
                    (
                        r["id"], r["_orgId"], r["feature"], r["kind"], r["provider"], r["model"],
                        r["calls"], r["inputTokens"], r["cachedInputTokens"], r["outputTokens"],
                        r["ttsCharacters"], r["sttAudioSeconds"], r["costUsd"], r["jobId"],
                        r["applicationId"], r["interviewId"], r["jobTitle"], r["candidateName"],
                        r["label"], r["eventId"], r["source"], r["isTest"],
                        _to_ts(r.get("createdAt")),
                    )
                    for r in rows
                ],
            )
        except Exception as e:  # noqa: BLE001 — ledger must never break billing
            logger.error("[BILLING] LedgerWriter.insert failed (non-fatal): %s", e, exc_info=True)


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
        """Write all pending manual billing entries for an org in one transaction."""
        if not org_id or not DATABASE_URL:
            return
        pending = PendingBuffer.pop(org_id)
        if not pending:
            return
        try:
            pool = await cls._get_pool()
            async with pool.acquire() as conn:
                async with conn.transaction():
                    row = await conn.fetchrow(
                        'SELECT COALESCE("platformUsageMetrics", \'{}\'::jsonb) AS "usageMetrics" '
                        'FROM "OrganizationDetails" WHERE id = $1 FOR UPDATE',
                        org_id,
                    )
                    if not row:
                        logger.warning("[BILLING] flush_pending: org %s not found", org_id)
                        return
                    merged = _coerce_jsonish(row["usageMetrics"])
                    for feature, usage in pending:
                        merged = merge_manual_billing_usage(merged, feature, usage)
                        _fb = _coerce_jsonish(_coerce_jsonish(merged.get("billing")).get(feature))
                        logger.info(
                            "[BILLING] flush_pending merged feature=%s model=%s runs=%s "
                            "inputTokens=%s outputTokens=%s costUsd=%s",
                            feature, usage.get("model", "?"),
                            _fb.get("runs"), _fb.get("inputTokens"),
                            _fb.get("outputTokens"), _fb.get("costUsd"),
                        )
                    await conn.execute(
                        'UPDATE "OrganizationDetails" SET "platformUsageMetrics" = $1::jsonb, "orgUpdatedAt" = NOW() WHERE id = $2',
                        json.dumps(merged), org_id,
                    )
                    # Per-event ledger rows (same transaction; non-fatal on failure).
                    ledger_rows = LedgerWriter.build_rows(pending)
                    for r in ledger_rows:
                        r["_orgId"] = org_id
                    await LedgerWriter.insert(conn, ledger_rows)
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
        candidate_name: Optional[str] = None,
        job_title:      Optional[str] = None,
        is_test:        bool = False,
    ) -> None:
        """Merge a session's LiveKit usage into Organization.usageMetrics (livekit bucket)."""
        if not org_id or not DATABASE_URL:
            return
        if is_test:
            # Test sessions must never pollute the org's real billing totals --
            # see the module docstring / report_worker.py's identical guard on
            # the manual-usage side. Only the ledger insert used to be gated on
            # is_test; this blob merge was missing the same guard.
            return
        if not any(bucket.get("sessions") for bucket in session_summary.values()):
            return
        try:
            pool = await cls._get_pool()
            async with pool.acquire() as conn:
                async with conn.transaction():
                    row = await conn.fetchrow(
                        'SELECT COALESCE("platformUsageMetrics", \'{}\'::jsonb) AS "usageMetrics" '
                        'FROM "OrganizationDetails" WHERE id = $1 FOR UPDATE',
                        org_id,
                    )
                    if not row:
                        logger.warning("[BILLING] save_org_usage: org %s not found", org_id)
                        return
                    existing = _coerce_jsonish(row["usageMetrics"])
                    merged   = dict(existing)
                    livekit  = _coerce_jsonish(merged.get("livekit"))

                    # Merge per-kind raw LiveKit buckets into the livekit namespace
                    for kind, kind_summary in session_summary.items():
                        if not isinstance(kind_summary, dict):
                            continue
                        cur = _coerce_jsonish(livekit.get(kind)) or UsageSummarizer._empty_bucket(kind)
                        cur["sessions"] = int(cur.get("sessions", 0)) + int(kind_summary.get("sessions", 0))
                        totals = cur.setdefault("totals", {pub: 0 for _, pub in _USAGE_BUCKET_FIELDS[kind]})
                        for _, pub in _USAGE_BUCKET_FIELDS[kind]:
                            totals[pub] = totals.get(pub, 0) + kind_summary.get("totals", {}).get(pub, 0)
                        by_model = cur.setdefault("byModel", {})
                        for mkey, msummary in kind_summary.get("byModel", {}).items():
                            provider = str(msummary.get("provider", "") or "").strip().upper()
                            model    = str(msummary.get("model",    "") or "").strip()
                            if not provider or not model:
                                raise ValueError(f"[BILLING] save_org_usage: provider/model missing in {kind}:{mkey}")
                            mb = _coerce_jsonish(by_model.get(mkey)) or {
                                "provider": provider, "model": model, "sessions": 0,
                                **{pub: 0 for _, pub in _USAGE_BUCKET_FIELDS[kind]},
                            }
                            mb["sessions"] = int(mb.get("sessions", 0)) + int(msummary.get("sessions", 0))
                            for _, pub in _USAGE_BUCKET_FIELDS[kind]:
                                mb[pub] = mb.get(pub, 0) + msummary.get(pub, 0)
                            by_model[mkey] = mb
                        cur["updatedAt"] = time.time()
                        livekit[kind]    = cur

                    merged["livekit"]   = livekit
                    merged["updatedAt"] = time.time()
                    # Also merge into the structured interview billing bucket
                    merged = BucketMerger.merge_session(
                        merged, "interview", session_summary,
                        tts_config={"provider": tts_provider or "", "model": tts_model or ""},
                        stt_config={"provider": stt_provider or "", "model": stt_model or ""},
                    )
                    await conn.execute(
                        'UPDATE "OrganizationDetails" SET "platformUsageMetrics" = $1::jsonb, "orgUpdatedAt" = NOW() WHERE id = $2',
                        json.dumps(merged), org_id,
                    )
                    # interviewSession TTS/STT ledger rows (same transaction; non-fatal).
                    # Test sessions never write org billing, so this only runs for real
                    # interviews — but guard on is_test for defence in depth.
                    if app_id and not is_test:
                        session_rows = LedgerWriter.build_session_rows(
                            app_id=app_id, interview_id=interview_id,
                            summary=session_summary,
                            candidate_name=candidate_name, job_title=job_title,
                            is_test=is_test,
                        )
                        for r in session_rows:
                            r["_orgId"] = org_id
                        await LedgerWriter.insert(conn, session_rows)
            llm_t = session_summary["llm"]["totals"]
            logger.info(
                "[BILLING] Saved org usage: org=%s llm_tokens=%d stt_secs=%.1f tts_secs=%.1f",
                org_id,
                int(llm_t.get("inputTokens", 0)) + int(llm_t.get("outputTokens", 0)),
                session_summary["stt"]["totals"].get("audioDuration", 0),
                session_summary["tts"]["totals"].get("audioDuration", 0),
            )
        except Exception as e:
            logger.error("[BILLING] save_org_usage failed for org=%s: %s", org_id, e, exc_info=True)
            raise

    @classmethod
    async def save_interview_snapshot(
        cls,
        app_id:           str,
        session_summary:  dict[str, Any],
        pending:          list[tuple[str, dict]],
        *,
        candidate_name:   Optional[str]  = None,
        job_title:        Optional[str]  = None,
        duration_seconds: Optional[float]= None,
        tts_provider:     Optional[str]  = None,
        tts_model:        Optional[str]  = None,
        stt_provider:     Optional[str]  = None,
        stt_model:        Optional[str]  = None,
    ) -> None:
        """Write the per-interview billing snapshot to Interview.billingSnapshot."""
        if not app_id or not DATABASE_URL:
            return

        snapshot_billing = BucketMerger.merge_session(
            {}, "interview", session_summary,
            tts_config={"provider": tts_provider or "", "model": tts_model or ""},
            stt_config={"provider": stt_provider or "", "model": stt_model or ""},
        )
        ib = _coerce_jsonish(_coerce_jsonish(snapshot_billing.get("billing")).get("interview"))

        # Fold in manual LLM entries for this interview's own LLM spend: eval/signal
        # scoring ("interview"), brief generation ("interviewBrief"), and per-turn
        # question generation ("interviewLLMGeneration"). All three happen inside
        # this single interview session, so the per-interview snapshot's LLM total
        # must include all three, not just eval.
        _INTERVIEW_OWN_LLM_FEATURES = ("interview", "interviewBrief", "interviewLLMGeneration")
        for feature, usage in pending:
            if feature not in _INTERVIEW_OWN_LLM_FEATURES:
                continue
            model = str(usage.get("model", "") or "").strip()
            if not model:
                raise ValueError("[BILLING] save_interview_snapshot: model required in pending entry")
            input_t  = int(usage.get("inputTokens",       0) or 0)
            cached_t = int(usage.get("cachedInputTokens", 0) or 0)
            output_t = int(usage.get("outputTokens",      0) or 0)
            cost     = CostCalculator.openai(model, input_t, cached_t, output_t)
            mkey     = f"openai:{model}"
            ib["runs"]              = int(ib.get("runs",             0)) + 1
            ib["inputTokens"]       = int(ib.get("inputTokens",      0)) + input_t
            ib["cachedInputTokens"] = int(ib.get("cachedInputTokens",0)) + cached_t
            ib["outputTokens"]      = int(ib.get("outputTokens",     0)) + output_t
            ib["costUsd"]           = float(ib.get("costUsd",         0.0)) + cost
            bm = _coerce_jsonish(ib.get("byModel"))
            cur = _coerce_jsonish(bm.get(mkey))
            cur["runs"]              = int(cur.get("runs",             0)) + 1
            cur["inputTokens"]       = int(cur.get("inputTokens",      0)) + input_t
            cur["cachedInputTokens"] = int(cur.get("cachedInputTokens",0)) + cached_t
            cur["outputTokens"]      = int(cur.get("outputTokens",     0)) + output_t
            cur["costUsd"]           = float(cur.get("costUsd",        0.0)) + cost
            bm[mkey]                 = cur
            ib["byModel"]            = bm

        total_cost = (
            float(ib.get("costUsd",    0.0))
            + float(ib.get("ttsCostUsd", 0.0))
            + float(ib.get("sttCostUsd", 0.0))
        )
        candidate_name = candidate_name or ""
        job_title      = job_title or ""
        snapshot = InterviewBillingSnapshot(
            candidateName     = candidate_name,
            jobTitle          = job_title,
            interviewName     = f"{candidate_name or 'Candidate'} - {job_title or 'Interview'}",
            durationSec       = int(duration_seconds or 0),
            creditsUsed       = round((float(duration_seconds or 0) / 60.0) * 100) / 100,
            llmCostUsd        = float(ib.get("costUsd",         0.0)),
            ttsCostUsd        = float(ib.get("ttsCostUsd",      0.0)),
            sttCostUsd        = float(ib.get("sttCostUsd",      0.0)),
            totalCostUsd      = total_cost,
            inputTokens       = int(ib.get("inputTokens",       0)),
            outputTokens      = int(ib.get("outputTokens",      0)),
            cachedInputTokens = int(ib.get("cachedInputTokens", 0)),
            sessionDuration   = float(ib.get("sessionDuration", 0)),
            ttsCharacters     = int(ib.get("ttsCharacters",     0)),
            sttAudioSeconds   = float(ib.get("sttAudioSeconds", 0)),
            llmByModel        = ib.get("byModel",   {}),
            ttsByModel        = ib.get("ttsByModel", {}),
            sttByModel        = ib.get("sttByModel", {}),
        )
        logger.info(
            "[BILLING] Snapshot: app=%s dur=%ds llm=%.6f tts=%.6f stt=%.6f total=%.6f "
            "inputTokens=%d outputTokens=%d ttsChars=%d",
            app_id, snapshot.durationSec,
            snapshot.llmCostUsd, snapshot.ttsCostUsd, snapshot.sttCostUsd, snapshot.totalCostUsd,
            snapshot.inputTokens, snapshot.outputTokens, snapshot.ttsCharacters,
        )
        try:
            pool = await cls._get_pool()
            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    'SELECT i.id, COALESCE(i."billingSnapshotAtCompletion", \'{}\'::jsonb) AS "billingSnapshot" '
                    'FROM "Interview" i '
                    'JOIN "Application" a ON a.id = i."applicationId" '
                    'WHERE a.id = $1 LIMIT 1',
                    app_id,
                )
                if not row:
                    logger.error("[BILLING] save_interview_snapshot: no Interview row for app=%s", app_id)
                    return
                existing = _coerce_jsonish(row["billingSnapshot"])
                persisted = {**existing, **snapshot.model_dump()}
                # Never overwrite billedAt once set (idempotency guard)
                if existing.get("billedAt") is not None:
                    persisted["billedAt"] = existing["billedAt"]
                await conn.execute(
                    'UPDATE "Interview" SET "billingSnapshotAtCompletion" = $1::jsonb, "interviewUpdatedAt" = NOW() '
                    'WHERE "applicationId" = $2',
                    json.dumps(persisted), app_id,
                )
            logger.info(
                "[BILLING] Snapshot saved: app=%s total=%.6f inputTokens=%d outputTokens=%d",
                app_id, snapshot.totalCostUsd, snapshot.inputTokens, snapshot.outputTokens,
            )
        except Exception as e:
            logger.error("[BILLING] save_interview_snapshot DB write failed for app=%s: %s", app_id, e, exc_info=True)
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
    async def record_test_report_llm_usage(cls, app_id: str, usage: dict[str, Any]) -> None:
        """Add one report-pipeline LLM call's accurate cost to a test session's
        testBillingMetrics.llmCost, instead of the org's real usageMetrics bucket.

        Test-session report/summary calls run the exact same LLM code path as
        real interviews, so without this the cost would land in
        Organization.usageMetrics.billing.interviewReport indistinguishable from
        real candidates. Routing it here at the single _persist_billing call
        site (report_pipeline.py) keeps test spend fully separate at the source.
        """
        if not app_id or not usage or not DATABASE_URL:
            return
        model    = str(usage.get("model", "") or "")
        input_t  = int(usage.get("inputTokens", 0) or 0)
        cached_t = int(usage.get("cachedInputTokens", 0) or 0)
        output_t = int(usage.get("outputTokens", 0) or 0)
        if not model:
            return
        try:
            cost = CostCalculator.openai(model, input_t, cached_t, output_t)
        except ValueError:
            return
        try:
            pool = await cls._get_pool()
            async with pool.acquire() as conn:
                await conn.execute(
                    """UPDATE "Interview" SET "testSessionBillingMetrics" = jsonb_set(
                           jsonb_set(
                               COALESCE("testSessionBillingMetrics", '{}'::jsonb),
                               '{reportLlmCost}',
                               to_jsonb(COALESCE(("testSessionBillingMetrics"->>'reportLlmCost')::float, 0) + $1::float),
                               true
                           ),
                           '{reportLlmRuns}',
                           to_jsonb(COALESCE(("testSessionBillingMetrics"->>'reportLlmRuns')::int, 0) + 1),
                           true
                       ), "interviewUpdatedAt" = NOW()
                       WHERE "applicationId" = $2""",
                    cost, app_id,
                )
        except Exception as e:
            logger.error("[BILLING] record_test_report_llm_usage failed for app=%s: %s", app_id, e)

    @classmethod
    async def deduct_quota(cls, app_id: str, duration_seconds: Optional[float] = None) -> None:
        """Atomically deduct one interview quota slot. Idempotent via billedAt guard."""
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
                       SET "billingSnapshotAtCompletion" = jsonb_set(
                               COALESCE("billingSnapshotAtCompletion", '{}'::jsonb),
                               '{billedAt}',
                               to_jsonb(extract(epoch from now())::bigint)
                           ), "interviewUpdatedAt" = NOW()
                       WHERE "applicationId" = $1
                         AND ("billingSnapshotAtCompletion" IS NULL OR "billingSnapshotAtCompletion"->'billedAt' IS NULL)
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


async def save_interview_billing(
    app_id:                   str,
    session_usage:            Any,
    *,
    org_id:                   Optional[str]   = None,
    candidate_name:           Optional[str]   = None,
    job_title:                Optional[str]   = None,
    duration_seconds:         Optional[float] = None,
    tts_provider:             Optional[str]   = None,
    tts_model:                Optional[str]   = None,
    stt_provider:             Optional[str]   = None,
    stt_model:                Optional[str]   = None,
    plugin_tts_characters:    int   = 0,
    plugin_tts_audio_seconds: float = 0.0,
    plugin_stt_audio_seconds: float = 0.0,
) -> None:
    """Save per-interview billing snapshot (Interview.billingSnapshot).

    Covers the full interview session: LLM (agent turns) + TTS + STT.
    Replaces: persist_interview_billing_snapshot()
    """
    if not app_id or not DATABASE_URL:
        return

    has_any = (
        bool(session_usage)
        or bool(duration_seconds)
        or int(plugin_tts_characters or 0) > 0
        or float(plugin_stt_audio_seconds or 0) > 0
        or bool(org_id and PendingBuffer.peek(org_id))
    )
    if not has_any:
        logger.warning("[BILLING] save_interview_billing: no signal for app=%s — skipping", app_id)
        return

    summary = UsageSummarizer.from_session(session_usage)
    summary = UsageSummarizer.override_plugin_metrics(
        summary,
        tts_provider=tts_provider, tts_model=tts_model,
        tts_chars=plugin_tts_characters, tts_secs=plugin_tts_audio_seconds,
        stt_provider=stt_provider, stt_model=stt_model,
        stt_secs=plugin_stt_audio_seconds,
    )
    pending = PendingBuffer.peek(org_id) if org_id else []

    await BillingRepository.save_interview_snapshot(
        app_id, summary, pending,
        candidate_name=candidate_name,
        job_title=job_title,
        duration_seconds=duration_seconds,
        tts_provider=tts_provider, tts_model=tts_model,
        stt_provider=stt_provider, stt_model=stt_model,
    )


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
        app_id=app_id, interview_id=interview_id,
        candidate_name=candidate_name, job_title=job_title, is_test=is_test,
    )


async def deduct_interview_quota(app_id: str, duration_seconds: Optional[float] = None) -> None:
    """Deduct one interview credit + quota slot. Idempotent.

    Replaces: deduct_interview_billing()
    """
    await BillingRepository.deduct_quota(app_id, duration_seconds)

async def record_external_billing_usage(org_id: Optional[str], feature: str, usage: dict[str, Any]) -> None:
    """Record a usage event from non-Python callers such as Next.js routes/workers."""
    if not org_id:
        return
    await BillingRepository.record_org_billing_usage(org_id, feature, usage)

async def record_test_report_billing_usage(app_id: str, usage: dict[str, Any]) -> None:
    """Record one report-pipeline LLM call's cost for a TEST session only.

    Keeps test-session report/summary spend out of the org's real billing
    totals — see BillingRepository.record_test_report_llm_usage for why.
    """
    await BillingRepository.record_test_report_llm_usage(app_id, usage)


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
        _json_result(False, error=f"Unknown billing command: {command}")
        return 2
    except Exception as exc:
        _json_result(False, error=str(exc))
        return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main_cli()))

