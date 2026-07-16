"""
report_pipeline.py
==================
Self-contained post-interview report pipeline.

Architecture:
  - Domain Models   (Pydantic)  -- typed contracts for all I/O
  - IntegrityEngine (OOP)       -- deterministic signal scorer
  - BehavioralAnalyzer (OOP)    -- LLM narrative from signals
  - ReportLLMClient (OOP)       -- singleton AsyncOpenAI + retry
  - LangGraph Pipeline          -- fan-out DAG: 3 nodes, 2 parallel
  - Public API                  -- generate_interview_report()
                                   generate_interview_summary()

LangGraph execution order:
  [signals] -> [llm_calls + behavioral] -> [assemble + persist]
  deterministic -> parallel asyncio.gather -> writes to DB

DSA choices:
  - Counter (O(n)) for signal aggregation          -- no nested loops
  - frozenset for tool-keyword noise filter        -- O(1) membership
  - dict.fromkeys for ordered dedup                -- O(n), stable order
  - heapq / sorted with key for topic ranking      -- O(n log n)
  - all state is TypedDict (structural subtyping)  -- zero runtime overhead

OOP choices:
  - IntegrityEngine: encapsulates weight tables + scoring formula
  - BehavioralAnalyzer: encapsulates prompt builder + LLM call
  - ReportLLMClient: singleton pattern, exponential retry, streaming
  - LLMCallSpec: dataclass -- immutable call descriptor passed to client
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Literal, Optional

from langgraph.graph import END, StateGraph
from openai import AsyncOpenAI
from pydantic import BaseModel, Field, field_validator
from typing_extensions import TypedDict

from interview.agent_utils import truncate_to_tokens
from interview.agent_runtime_support import logger, DATABASE_URL
from interview.brief_extraction import RawResumeJSON, ResumeExtractor

from billing.billing import record_external_billing_usage as _persist_billing
from interview.slack_error_logger import log_llm_error

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECTION 1 — Domain Models (Pydantic)
# All LLM response shapes and shared data contracts live here.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class LLMEvalDimension(BaseModel):
    score:    int = Field(default=0, ge=0, le=100)
    evidence: str = ""

    @field_validator("score", mode="before")
    @classmethod
    def _clamp(cls, v: Any) -> int:
        try:
            return max(0, min(100, round(float(v))))
        except (TypeError, ValueError):
            return 0


class LLMEvalResponse(BaseModel):
    jd_knowledge:          LLMEvalDimension = Field(default_factory=LLMEvalDimension)
    problem_solving:       LLMEvalDimension = Field(default_factory=LLMEvalDimension)
    experience_credibility: LLMEvalDimension = Field(default_factory=LLMEvalDimension)
    communication:         LLMEvalDimension = Field(default_factory=LLMEvalDimension)
    ownership:             LLMEvalDimension = Field(default_factory=LLMEvalDimension)
    strengths:             list[str] = Field(default_factory=list)
    concerns:              list[str] = Field(default_factory=list)


class LLMSkillEntry(BaseModel):
    skill:    str = ""
    score:    int = Field(default=5, ge=1, le=10)
    evidence: list[str] = Field(default_factory=list)

    @field_validator("score", mode="before")
    @classmethod
    def _clamp(cls, v: Any) -> int:
        try:
            return max(1, min(10, round(float(v))))
        except (TypeError, ValueError):
            return 5


class LLMSkillsResponse(BaseModel):
    skills: list[LLMSkillEntry] = Field(default_factory=list)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECTION 2 — LangGraph State
# TypedDict = zero runtime cost, full static typing, LangGraph-native.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class ReportState(TypedDict, total=False):
    # -- Inputs --------------------------------------------------------------
    app_id:            str
    transcript_lines:  list[str]
    interview_scores:  list[dict]   # warmup filtered out before graph entry
    all_scores:        list[dict]
    job_title:         str
    proctoring_data:   dict | None
    org_id:            str | None
    llm_model:         str
    jd_json:           dict | None
    resume_json:       dict | None  # structured resume -- feeds experience_credibility eval
    topic_records:     list[dict]   # per-topic MOVE_ON ground-truth from agent
    answer_integrity_enabled: bool  # org toggle — gates the AnswerIntegrityAnalyzer LLM call
    is_test:           bool  # test session -- flags UsageEvent rows isTest=True, same ledger path
    # -- Computed by node: signals --------------------------------------------
    integrity_result:  dict
    signal_context:    str
    jd_context:        str
    behavioral_signals: list[dict]
    # -- Computed by node: llm_calls -----------------------------------------
    eval_result:       LLMEvalResponse
    skills_result:     LLMSkillsResponse
    behavioral_analysis: dict
    answer_integrity_result: dict
    # -- Final output ---------------------------------------------------------
    scores_context:    dict | None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECTION 3 — IntegrityEngine (OOP + DSA)
#
# Encapsulates signal weight tables and the O(n) weighted scoring formula.
# frozenset for O(1) membership, Counter for O(n) aggregation.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class IntegrityEngine:
    """Deterministic integrity scorer: 0-100, band HIGH/MODERATE/LOW.

    Weight tables are class-level constants — shared across all instances,
    no per-call allocation. Counter aggregation is O(n) with no nested loops.
    """

    # Browser-side proctoring signals only — these are what integrity score measures.
    # Behavioural signals (ownership_ambiguity, depth_decay, etc.) are NOT here;
    # they go to BehavioralAnalyzer, not the integrity score.
    _NEG: dict[str, float] = {
        "tab_switch":        -10.0,
        "fullscreen_exit":   -15.0,
        "window_focus_loss": -10.0,
        "face_absence":      -15.0,
        "multiple_faces":    -25.0,
        "camera_disabled":   -15.0,
        "microphone_disabled": -8.0,
        "identity_mismatch": -20.0,
        "connection_lost":   -12.0,
        "answer_integrity":  0.0,
        "session_fingerprint": -20.0,
    }

    _NEG_KEYS: frozenset[str] = frozenset(_NEG)

    @classmethod
    def score(
        cls,
        browser_signals: list[dict],
    ) -> dict:
        """O(n) integrity score from browser-side proctoring events only.

        browser_signals — events written by the frontend during the interview
                          (tab_switch, face_absence, multiple_faces, etc.)
        Behavioural signals (ownership_ambiguity, etc.) are excluded by design.
        """
        counts: Counter[str] = Counter()

        for evt in browser_signals:
            name = str(evt.get("signal_name") or "").strip()
            if name:
                counts[name] += 1

        score: float = 100.0
        fired: list[str] = []

        for sig, count in counts.items():
            if sig in cls._NEG_KEYS:
                score += cls._NEG[sig] * min(count, 3)
                fired.append(sig)

        final = max(0, min(100, round(score)))
        band  = "HIGH" if final >= 80 else "MODERATE" if final >= 55 else "LOW"
        return {
            "score":        final,
            "band":         band,
            "signals_used": fired,
            "methodology":  "signal_weighted_deterministic",
        }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECTION 4 — SkillFilter (DSA)
#
# O(n) dedup with frozenset noise filter. Keeps only domain-level skill names,
# strips single-word tools/libraries that add no signal to the report.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class SkillFilter:
    _NOISE: frozenset[str] = frozenset({
        "google sheets", "google calendar", "instagram", "facebook",
        "n8n", "zapier", "python", "javascript", "typescript",
        "excel", "notion", "slack", "whatsapp", "airtable",
        "hubspot", "salesforce", "stripe", "twilio", "sendgrid",
        "openai", "chatgpt", "langchain", "react", "nextjs",
        "postgresql", "mysql", "mongodb", "redis", "aws", "gcp", "azure",
    })

    @classmethod
    def filter(cls, raw: list[str], *, limit: int = 8) -> list[str]:
        """O(n) ordered dedup with noise removal.

        Uses a seen-set for O(1) duplicate check and frozenset membership
        for O(1) noise lookup. Preserves insertion order (stable output).
        """
        seen: set[str] = set()
        result: list[str] = []
        for topic in (s.strip() for s in raw if s.strip()):
            if topic.lower() in cls._NOISE:
                continue
            if len(topic.split()) == 1 and len(topic) < 10:
                continue
            key = topic.lower()
            if key in seen:
                continue
            seen.add(key)
            result.append(topic)
            if len(result) >= limit:
                break
        return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECTION 5 — ReportLLMClient (OOP singleton + retry)
#
# Single AsyncOpenAI instance reused across all calls (avoids cold HTTP setup).
# Exponential backoff on transient errors. Streaming with usage capture.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _strip_surrogates(text: str) -> str:
    """Drop lone UTF-16 surrogates (e.g. \\udc9d from mangled emoji/STT output).

    The OpenAI SDK encodes the request body as utf-8, which raises
    UnicodeEncodeError on unpaired surrogates -- one bad char in the transcript
    otherwise kills the entire report/summary pipeline. 'replace' + re-decode
    swaps each unencodable surrogate for U+FFFD instead of failing.
    """
    if not text:
        return text
    return text.encode("utf-8", "replace").decode("utf-8", "replace")


@dataclass(frozen=True)
class LLMCallSpec:
    """Immutable descriptor for a single LLM call. Passed to ReportLLMClient."""
    system:          str
    user:            str
    max_tokens:      int
    response_format: dict
    call_type:       str
    _LLM_DEFAULT:    str
    timeout:         float | None = None  # None = no timeout, let LLM take as long as needed
    temperature:     float       = 0.0
    org_id:          str        = ""
    app_id:          str        = ""
    candidate_name:  str        = ""
    prediction:      dict | None = None


class ReportLLMClient:
    """Singleton OpenAI client for all report LLM calls.

    Instantiated once at module load. Thread/coroutine-safe because AsyncOpenAI
    uses httpx which is coroutine-safe by design.
    Retry strategy: 3 attempts, delays (1s, 3s, 7s), transient errors only.
    """

    _RETRY_DELAYS: tuple[float, ...] = (1.0, 3.0, 7.0)
    _TRANSIENT_STATUS: frozenset[int] = frozenset({429, 500, 502, 503, 504})

    _instance: ReportLLMClient | None = None
    _client:   AsyncOpenAI | None = None

    def __new__(cls) -> ReportLLMClient:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._client = AsyncOpenAI()
        return cls._instance

    @property
    def client(self) -> AsyncOpenAI:
        assert self._client is not None
        return self._client

    async def call(self, spec: LLMCallSpec) -> tuple[str, Any]:
        """Execute one LLM call with retry. Returns (raw_text, usage_obj)."""
        last_exc: Exception | None = None
        _call_start = time.monotonic()
        logger.info("[REPORT] %s started (app=%s)", spec.call_type, spec.app_id or "?")

        for attempt, delay in enumerate((*self._RETRY_DELAYS, None), start=1):
            try:
                chunks: list[str] = []
                usage_data = None
                kwargs: dict[str, Any] = dict(
                    model=spec._LLM_DEFAULT,
                    temperature=spec.temperature,
                    max_completion_tokens=spec.max_tokens,
                    stream=True,
                    stream_options={"include_usage": True},
                    response_format=spec.response_format,
                    store=True,
                    metadata={
                        "call_type": spec.call_type,
                        "app_id":    spec.app_id,
                        "org_id":    spec.org_id,
                        "attempt":   str(attempt),
                    },
                    messages=[
                        {"role": "system", "content": _strip_surrogates(spec.system)},
                        {"role": "user",   "content": _strip_surrogates(spec.user)},
                    ],
                )
                if spec.prediction:
                    kwargs["prediction"] = spec.prediction

                if spec.timeout is not None:
                    async with asyncio.timeout(spec.timeout):
                        stream = await self.client.chat.completions.create(**kwargs)
                        async for chunk in stream:  # type: ignore
                            if chunk.choices and chunk.choices[0].delta.content:
                                chunks.append(chunk.choices[0].delta.content)
                            if getattr(chunk, "usage", None):
                                usage_data = chunk.usage
                else:
                    stream = await self.client.chat.completions.create(**kwargs)
                    async for chunk in stream:  # type: ignore
                        if chunk.choices and chunk.choices[0].delta.content:
                            chunks.append(chunk.choices[0].delta.content)
                        if getattr(chunk, "usage", None):
                            usage_data = chunk.usage

                raw = "".join(chunks).strip()
                if not raw:
                    raise ValueError(f"[{spec.call_type}] empty LLM response")
                _elapsed = time.monotonic() - _call_start
                logger.info(
                    "[REPORT] %s ended (%.1fs, app=%s)",
                    spec.call_type, _elapsed, spec.app_id or "?",
                )
                return raw, usage_data

            except Exception as exc:
                last_exc = exc
                is_transient = isinstance(exc, (asyncio.TimeoutError, ConnectionError)) or (
                    hasattr(exc, "status_code")
                    and getattr(exc, "status_code", 0) in self._TRANSIENT_STATUS
                )
                if delay is None or not is_transient:
                    break
                logger.warning(
                    "[REPORT] %s attempt %d failed (%s), retrying in %.1fs",
                    spec.call_type, attempt, exc, delay,
                )
                await asyncio.sleep(delay)

        try:
            await log_llm_error(
                app_id=spec.app_id,
                org_name=spec.org_id,
                candidate_name=spec.candidate_name,
                provider="openai",
                error=str(last_exc),
                reason=f"LLM call failed after retries — call_type={spec.call_type}",
            )
        except Exception:
            pass
        raise last_exc  # type: ignore[misc]

    @staticmethod
    def usage_dict(u: Any, model: str) -> dict:
        """Extract token counts — delegates to billing.extract_usage()."""
        from billing.billing import extract_usage  # noqa: PLC0415
        return extract_usage(u, model)


# Module-level singleton — instantiated once, reused for all calls.
_llm = ReportLLMClient()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECTION 6 — BehavioralAnalyzer (OOP)
#
# Encapsulates the signal-analysis prompt builder and LLM call.
# Moved here from behavioral_analysis.py — no external dependency needed.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class BehavioralAnalyzer:
    """Generates 4 plain-English behavioral analysis points for the HR team.

    Accepts per-turn behavioral signals (ownership_ambiguity, depth_decay, etc.)
    and the Q&A log, and returns grounded recruiter-readable observations.
    """

    _SYSTEM = (
        "You are writing a behavioral communication analysis of a candidate's interview performance for a recruiter.\n"
        "This is NOT a technical assessment and NOT a general summary — those are covered elsewhere in the report.\n"
        "Your ONLY job is to describe HOW the candidate communicated and behaved during the conversation, not WHAT they knew or whether their answers were technically correct.\n\n"
        "You have been given the full Q&A transcript, per-turn behavioral signals, and answer quality scores.\n\n"
        "SIGNALS YOU KNOW ABOUT (from probe_strategy.py):\n"
        "- ownership_ambiguous: Candidate said 'we/they' instead of 'I'. Unclear personal contribution.\n"
        "- answer_hollow: Candidate said WHAT they did, not HOW or WHY. No operational detail.\n"
        "- example_evaded: Asked for a real story. Got theory or 'usually I do X' instead.\n"
        "- functional_claim_unverified: Named a tool/method vaguely. Couldn't prove hands-on usage.\n"
        "- claim_not_demonstrated: Made a strong self-claim with no evidence to back it up.\n\n"
        "YOUR JOB: Cover up to 5 topics below, but ONLY the ones with real evidence in the transcript — "
        "skip a topic entirely rather than padding it with a weak or generic observation. For each topic "
        "you do cover, write ONE topic label and EXACTLY 2-3 short, sharp bullet points (one sentence "
        "each), not a paragraph.\n\n"
        "TOPICS TO CONSIDER:\n"
        "1. Composure Under Pressure: When challenged, corrected, or asked a hard follow-up, did they stay calm and adapt, or become flustered, defensive, or repetitive? Quote the moment.\n"
        "2. Communication Style: Were their answers direct and structured, or did they ramble, hedge ('I think maybe', 'kind of', 'sort of'), or circle back without landing a point?\n"
        "3. Engagement & Responsiveness: Did their energy and attentiveness stay consistent, or did it visibly shift (e.g. sharp and engaged early, flat or checked-out later)? Reference where the shift happened.\n"
        "4. Handling Not Knowing Something: When they didn't know an answer, did they admit it plainly, reason out loud, bluff, deflect, or go silent? Quote the exact moment.\n"
        "5. Delivery Consistency: Did their communication style stay stable across topics, or did it change noticeably between rehearsed-sounding topics and unexpected ones?\n\n"
        "HARD RULES:\n"
        "- Every bullet MUST reference a specific question, topic, or near-exact quote from the transcript.\n"
        "- Do NOT write a sentence that could apply to any other candidate.\n"
        "- Do NOT use filler praise like 'showed enthusiasm' or 'had a positive attitude'.\n"
        "- Do NOT mention score numbers or dimension names.\n"
        "- Do NOT judge technical correctness, domain knowledge, or whether an answer was 'right' — that belongs to a different section of the report.\n"
        "- Do NOT make personality or character judgments (e.g. 'introverted', 'a confident person', 'a team player'). Describe specific observed behavior in THIS interview only, never a trait label.\n\n"
        'Output ONLY valid JSON: {"points": [{"topic": "Composure Under Pressure", "bullets": ["...", "..."]}, ...]}. '
        "No markdown, no extra keys."
    )


    @staticmethod
    def _build_user(
        transcript_lines: list[str],
        answer_scores:    list[dict],
        duration_sec:     int,
        behavioral_signals: list[dict],
    ) -> str:
        parts: list[str] = []

        # Session metadata
        mins            = duration_sec // 60
        candidate_turns = sum(1 for l in transcript_lines if l.startswith("Candidate:"))
        ai_turns        = sum(1 for l in transcript_lines
                              if l.startswith("Interviewer:") or l.startswith("AI:"))
        scored          = len([s for s in answer_scores if not s.get("is_warmup")])
        parts.append(
            f"SESSION\nDuration: {mins} min | Candidate turns: {candidate_turns} | "
            f"Interviewer turns: {ai_turns} | Scored answers: {scored}"
        )

        # Aggregate signals — O(n), stable topic order via dict.fromkeys
        if behavioral_signals:
            grouped: dict[str, list[dict]] = {}
            for ev in behavioral_signals:
                grouped.setdefault(ev.get("signal_name", "unknown"), []).append(ev)

            sig_lines: list[str] = []
            for name, evs in grouped.items():
                turns  = sorted({e.get("turn", 0) for e in evs if e.get("turn")})
                topics = list(dict.fromkeys(e.get("topic", "") for e in evs if e.get("topic")))
                reasons = "; ".join(
                    e.get("signal_reason", "") for e in evs[:3] if e.get("signal_reason")
                )
                location = (
                    f"during {', '.join(repr(t) for t in topics[:3])}"
                    if topics else f"at turns {turns}"
                )
                line = f"  {name} x{len(evs)} {location}"
                if reasons:
                    line += f" — {reasons}"
                sig_lines.append(line)
            parts.append("BEHAVIORAL SIGNALS\n" + "\n".join(sig_lines))
        else:
            parts.append("BEHAVIORAL SIGNALS\nNone detected.")

        # Q&A log
        qa_lines: list[str] = []
        for s in answer_scores:
            if s.get("is_warmup"):
                continue
            block = (
                f"  TOPIC: {s.get('topic') or 'unknown topic'}\n"
                f"    Q: {str(s.get('question', '')).strip()[:220]}\n"
                f"    A: {str(s.get('answer', '')).strip()[:400]}\n"
                f"    [depth={s.get('depth','?')} specificity={s.get('specificity','?')} "
                f"grounding={s.get('grounding','?')}]"
            )
            sig = s.get("signal")
            if sig:
                reason = s.get("signal_reason", "")
                block += f"\n    SIGNAL: {sig}" + (f" — {reason}" if reason else "")
            qa_lines.append(block)

        if qa_lines:
            parts.append("QUESTION & ANSWER LOG\n\n" + "\n\n".join(qa_lines))

        return "\n\n".join(parts)

    async def analyze(
        self,
        transcript_lines:   list[str],
        answer_scores:      list[dict],
        duration_sec:       int,
        behavioral_signals: list[dict],
        *,
        _LLM_DEFAULT: str,
        org_id:    str = "",
        app_id:    str = "",
    ) -> tuple[dict, list[dict]]:
        """Returns ({"points": [{"topic": str, "bullets": [str, ...]}, ...]}, [usage_dict, ...])."""
        if not os.environ.get("OPENAI_API_KEY"):
            logger.warning("[BEHAVIORAL] Skipping: missing OPENAI_API_KEY")
            return {"points": []}, []

        user = self._build_user(transcript_lines, answer_scores, duration_sec, behavioral_signals)
        spec = LLMCallSpec(
            system=self._SYSTEM,
            user=user,
            max_tokens=800,
            response_format=_BEHAVIORAL_JSON_SCHEMA,
            call_type="behavioral_analysis",
            temperature=0.2,
            org_id=org_id,
            app_id=app_id,
            _LLM_DEFAULT=_LLM_DEFAULT,
        )
        try:
            raw, usage = await _llm.call(spec)
            data = json.loads(raw)
            points = [
                {
                    "topic": str(p.get("topic", "")).strip(),
                    "bullets": [str(b).strip() for b in p.get("bullets", []) if str(b).strip()][:3],
                }
                for p in data.get("points", [])
                if str(p.get("topic", "")).strip() and p.get("bullets")
            ]
            result = {"points": points[:5]}
            logger.info(
                "[BEHAVIORAL] %d points | signals=%d tokens=%d+%d",
                len(result["points"]),
                len(behavioral_signals),
                _llm.usage_dict(usage, _LLM_DEFAULT)["inputTokens"],
                _llm.usage_dict(usage, _LLM_DEFAULT)["outputTokens"],
            )
            return result, [_llm.usage_dict(usage, _LLM_DEFAULT)]
        except Exception as e:
            logger.error("[BEHAVIORAL] LLM call failed: %s", e, exc_info=True)
            return {"points": []}, []


_BEHAVIORAL_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "behavioral_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "points": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "topic": {"type": "string"},
                            "bullets": {
                                "type": "array",
                                "items": {"type": "string"},
                                "minItems": 2,
                                "maxItems": 3,
                            },
                        },
                        "required": ["topic", "bullets"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["points"],
            "additionalProperties": False,
        },
    },
}


_behavioral_analyzer = BehavioralAnalyzer()


# â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-
# SECTION 6b — AnswerIntegrityAnalyzer (OOP)
#
# The one content-layer integrity signal: a candidate can pass every
# behavioral/environmental check (never leaves the tab, camera stays on,
# own voice throughout) while still cheating in a way only visible in what
# they actually SAID. Two failure modes, one analyzer, one LLM call:
#
#   1. Phrasing:     does any single answer sound AI-generated/read rather
#                     than spoken (stock phrasing, essay cadence, register
#                     mismatch vs the candidate's own casual moments)?
#   2. Consistency:   do claims made in different turns contradict each
#                     other (e.g. "led a team of 15" in turn 3, "just me
#                     and 4 others" in turn 8)? This catches a candidate
#                     reading from notes -- each individual answer sounds
#                     natural, but the story doesn't hold together.
#
# Complementary failure modes: a notes-reader passes (1) but fails (2); an
# earpiece-fed candidate fails (1) but passes (2). One combined score covers
# both without doubling the LLM call.
# â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-â-

class AnswerIntegrityAnalyzer:
    """Detects AI-generated/read phrasing AND cross-turn contradictions.

    Runs once per interview (not per-turn) over the full transcript, in
    parallel with the other report LLM calls. This is judgment work, not
    keyword matching -- a candidate saying "leverage" once because it's the
    correct technical term is not a signal; the same candidate producing
    three consecutive essay-structured answers with zero natural speech
    markers is. The model must reason about the WHOLE pattern, not pattern-
    match a phrase list, and must anchor every claim in an exact quote --
    an unsupported claim is worse than useless to a recruiter deciding
    whether to trust this candidate.
    """

    _SYSTEM = (
        "You are a senior interview integrity analyst. You are given a candidate's SPOKEN interview "
        "transcript (speech-to-text, so natural spoken grammar/filler words are expected and normal -- "
        "do not flag them). Your job is to catch two specific failure modes a candidate can hide behind "
        "clean behavioral proctoring (camera on, no tab switches): reading/AI-generated answers, and "
        "self-contradiction across turns. This requires real judgment, not keyword spotting -- reason "
        "about the full pattern of how this specific candidate talks before concluding anything.\n\n"
        "CHECK 1 -- AI-GENERATED OR READ PHRASING\n"
        "Read the ENTIRE transcript first to build a baseline for how this candidate actually talks: "
        "their vocabulary, sentence length, filler words, self-corrections, hedging. Then look for "
        "answers that break from that baseline in ways consistent with reading or AI generation:\n"
        "- Stock LLM/essay phrasing that a real person doesn't say out loud: 'it's worth noting that', "
        "'in today's fast-paced environment', 'leverage synergies', 'at the end of the day', 'plays a "
        "crucial role', 'delve into', 'firstly... secondly... in conclusion'.\n"
        "- A sudden jump in polish/structure/vocabulary for ONE answer that doesn't match how the same "
        "candidate talked two questions earlier or later -- the register mismatch is the signal, not "
        "eloquence itself.\n"
        "- Total absence of natural speech markers (no filler words, no self-correction, no false "
        "starts) on a long, detailed answer, when the candidate DOES show those markers elsewhere in "
        "the same transcript -- the contrast is what matters.\n"
        "Do NOT flag: a consistently articulate candidate (if they talk that way throughout, that's "
        "just how they talk), correct use of technical jargon, a well-rehearsed personal story told "
        "once, non-native English phrasing quirks, or short answers with too little signal to judge.\n"
        "If you flag this, you MUST quote the exact suspect sentence(s) and name specifically what about "
        "it breaks from the candidate's own established baseline elsewhere in the transcript.\n\n"
        "CHECK 2 -- CROSS-TURN CONTRADICTION\n"
        "Scan every turn for factual claims about the same project/role/event and check them against "
        "each other: different numbers for the same thing (team size, timeline, budget, scale), an "
        "ownership claim that changes ('I led it' vs 'I was just one of the team' about the same "
        "project), or a technical detail that flatly contradicts an earlier turn's version. This catches "
        "a candidate reading from prepared notes even when each individual answer sounds natural.\n"
        "Do NOT flag: reasonable elaboration or added detail later, rounding differences ('about 10' "
        "then '12'), or genuinely different projects/roles being discussed.\n"
        "If you flag this, you MUST quote both conflicting claims and name which turns they came from.\n\n"
        "OUTPUT — be decisive, not hedgy. If neither check finds real evidence, say so plainly in one "
        "line ('No AI-generated phrasing or contradictions found; responses were consistent and matched "
        "the candidate's natural speech pattern throughout') — do not manufacture a weak finding to have "
        "something to report.\n"
        "Output ONLY valid JSON matching the schema exactly. No markdown.\n"
        "- ai_phrasing_flagged: true only if you found a concrete, quotable instance breaking from the "
        "candidate's baseline. false otherwise.\n"
        "- contradiction_flagged: true only if you found two concrete, quotable conflicting claims. "
        "false otherwise.\n"
        "- verdict: 2-3 short, high-impact sentences for a recruiter reading this in 5 seconds. If "
        "either check fired, state exactly what fired, quote the evidence, and say what it means for "
        "hiring judgment. If nothing fired, one confident sentence saying so is enough. No hedging, no "
        "filler, no restating these instructions."
    )

    @staticmethod
    def _build_user(transcript_lines: list[str]) -> str:
        transcript_text = truncate_to_tokens("\n".join(transcript_lines), 5000)
        return f"Full Interview Transcript:\n{transcript_text}"

    @staticmethod
    def _empty_result() -> dict:
        return {
            "ai_phrasing_flagged": False, "contradiction_flagged": False,
            "flagged": False, "verdict": [],
        }

    async def analyze(
        self,
        transcript_lines: list[str],
        *,
        _LLM_DEFAULT: str,
        org_id: str = "",
        app_id: str = "",
    ) -> tuple[dict, list[dict]]:
        """Returns (result_dict, [usage_dict]). result_dict has ai_phrasing_flagged,
        contradiction_flagged, flagged (either of the two), and verdict
        (2-3 sentence recruiter-facing summary).
        """
        if not os.environ.get("OPENAI_API_KEY"):
            logger.warning("[ANSWER_INTEGRITY] Skipping: missing OPENAI_API_KEY")
            return self._empty_result(), []
        if not transcript_lines:
            return self._empty_result(), []

        user = self._build_user(transcript_lines)
        spec = LLMCallSpec(
            system=self._SYSTEM,
            user=user,
            max_tokens=400,
            response_format=_ANSWER_INTEGRITY_JSON_SCHEMA,
            call_type="report_answer_integrity",
            org_id=org_id,
            app_id=app_id,
            _LLM_DEFAULT=_LLM_DEFAULT,
        )
        try:
            raw, usage = await _llm.call(spec)
            data = json.loads(raw)
            ai_phrasing_flagged = bool(data.get("ai_phrasing_flagged", False))
            contradiction_flagged = bool(data.get("contradiction_flagged", False))
            result = {
                "ai_phrasing_flagged":   ai_phrasing_flagged,
                "contradiction_flagged": contradiction_flagged,
                "flagged":               ai_phrasing_flagged or contradiction_flagged,
                "verdict": [str(v).strip() for v in (data.get("verdict") or []) if str(v).strip()][:3],
            }
            logger.info(
                "[ANSWER_INTEGRITY] ai_phrasing=%s contradiction=%s tokens=%d+%d",
                ai_phrasing_flagged, contradiction_flagged,
                _llm.usage_dict(usage, _LLM_DEFAULT)["inputTokens"],
                _llm.usage_dict(usage, _LLM_DEFAULT)["outputTokens"],
            )
            return result, [_llm.usage_dict(usage, _LLM_DEFAULT)]
        except Exception as e:
            logger.error("[ANSWER_INTEGRITY] LLM call failed: %s", e, exc_info=True)
            return self._empty_result(), []


_answer_integrity_analyzer = AnswerIntegrityAnalyzer()


def _build_answer_integrity_event(answer_integrity_result: dict) -> dict:
    """Single source of truth for the answer_integrity event shape -- used both
    when building the integrity-tab event list (_node_llm_calls) and when
    persisting/scoring in _node_assemble."""
    return {
        "eventType":   "answer_integrity",
        "signal_name": "answer_integrity",
        "severity":    "high" if (answer_integrity_result["ai_phrasing_flagged"] and answer_integrity_result["contradiction_flagged"]) else "medium",
        "timestamp":   int(time.time() * 1000),
        "ai_phrasing_flagged":   answer_integrity_result["ai_phrasing_flagged"],
        "contradiction_flagged": answer_integrity_result["contradiction_flagged"],
        "verdict":               answer_integrity_result["verdict"],
    }


async def _answer_integrity_noop() -> tuple[dict, list[dict]]:
    """Stand-in for a disabled answer_integrity toggle -- skips the LLM call
    and cost entirely while keeping the same gather() tuple shape."""
    return AnswerIntegrityAnalyzer._empty_result(), []


def _build_resume_claims_block(resume_json: dict) -> str:
    """Turn raw resume JSON into a checkable claims list for the eval prompt.

    Reuses the same deterministic ResumeExtractor the interview brief pipeline
    uses (interview/brief_extraction.py) -- zero extra LLM cost. A flat JSON
    dump truncated by char count risks cutting off the project/impact fields
    that actually matter for Resume Credibility scoring; extracting only
    projects/work_history/skills into short claim lines keeps every concrete,
    checkable claim (tech, duration, impact numbers) inside the token budget.
    """
    if not resume_json:
        return "No resume provided — score Resume Credibility based on self-reported claims in the transcript only."

    try:
        raw = RawResumeJSON.model_validate(resume_json)
        projects, work, skills = ResumeExtractor().extract(raw)
    except Exception:
        return "Resume provided but could not be parsed — score Resume Credibility based on self-reported claims in the transcript only."

    if not projects and not work and not skills:
        return "Resume provided but contained no extractable projects/work history/skills — score Resume Credibility based on self-reported claims in the transcript only."

    lines: list[str] = []
    for w in work[:6]:
        tech = ", ".join(w.tech) or "—"
        lines.append(f"WORK: {w.title} ({w.duration or 'duration unknown'}) — {w.description[:300]} [tech: {tech}]")
    for p in projects[:6]:
        tech = ", ".join(p.tech) or "—"
        impact = f" — impact claimed: {p.impact}" if p.impact else ""
        lines.append(f"PROJECT: {p.title} ({p.duration or 'duration unknown'}) — {p.description[:300]} [tech: {tech}]{impact}")
    if skills:
        lines.append("SKILLS CLAIMED: " + ", ".join(s.name for s in skills[:20]))

    return "\n".join(lines)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECTION 7 — Static LLM Prompts + JSON Schemas
#
# System prompts are byte-identical on every call -> prompt cache hits.
# Compact field names (cm/tk/rc/ps/ct) reduce output tokens by ~30%.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_EVAL_SYSTEM = """You are a senior technical recruiter and talent evaluator. You have been handed a complete AI-conducted interview transcript and the job description the candidate applied for.

YOUR EVALUATION FRAMEWORK
==========================
Before scoring anything, determine the candidate's experience level from the transcript:
- FRESHER: Student, recent graduate, 0-1 year experience, only has projects/internships
- MID-LEVEL: 1-4 years, some production exposure, works under guidance
- EXPERIENCED: 4+ years, production systems, owns decisions, leads others
This classification changes what "good" looks like on every dimension.

STEP 1 — Read the transcript fully. Form your opinions before outputting anything.

"str": UP TO 3 genuine strengths, one sharp sentence each, named to this specific candidate.
  A genuine strength is something that would still stand out even for a stronger candidate — not just
  "answered correctly" or "named the right term."
  Example good: "Explained exactly why they chose Kafka over RabbitMQ and stated the throughput numbers from their own load tests."
  Example bad: "Good communication throughout."
  Do NOT manufacture a minor, surface-level correct answer as a "strength" just to fill the list. Some
  candidates genuinely have no strengths worth naming, and some genuinely have several — base the count
  strictly on what the transcript actually shows, in either direction.

"con": UP TO 3 genuine concerns, one sharp sentence each, no softening.
  Name the exact topic and what broke down (blank answer, contradicted resume, surface-level only, refused probe).
  Do NOT invent minor nitpicks just to fill the list. Some candidates genuinely have no real concerns, and
  some genuinely have several — base the count strictly on what the transcript actually shows, in either
  direction.

CONTRADICTION RULE:
  Do NOT list "admitted uncertainty", "was honest about not knowing", or any similar
  phrasing as a strength when the same candidate also failed to demonstrate knowledge
  of that topic. Being honest about a gap is not a differentiating strength — it is the
  bare minimum. A strength must be a genuinely positive signal, not merely the absence
  of dishonesty. If you flag a concern about topic X, you cannot also list "admitted
  they didn't know X" as a strength. Choose one or the other.



STEP 2 — Score 5 dimensions. Each score requires:
- "s": integer 0-100 (use the FULL range — do NOT cluster around 50-70)
- "ev": ONE sharp sentence starting with a specific action/quote from the interview. No generic praise.
  Example good: "Described the exact retry-with-backoff logic they implemented in the billing microservice when asked about failure handling."
  Example bad: "Showed good knowledge of backend systems."

SCORING PHILOSOPHY:
  0-20  = Blank, wrong, or pure filler. No usable signal.
  21-45 = Surface only. Vocabulary without mechanics. Pattern-matched a textbook answer.
  46-65 = Partial. Real in 1-2 areas, gaps elsewhere. Needed probing to get anything useful.
  66-80 = Solid. Concrete examples. Named tools, processes, decisions. Held most probes.
  81-100 = Deep and specific. Real numbers, real trade-offs, step-by-step. Held every probe including unexpected ones.

---
DIMENSION 1 — jk (JD Knowledge, weight 30%)
Does this candidate understand the actual role they applied for? Score how well their answers align with
the specific responsibilities, required skills, and expectations stated in the JD.

FRESHER baseline: Score based on relevant coursework, projects, or internships that touch the JD skills.
  A fresher who built a CRUD app using the tech stack in the JD and can explain it mechanically = 55-65.
  A fresher who can only name the technologies from the JD without any implementation = 25-35.

EXPERIENCED baseline: Score based on direct, production-level experience with JD requirements.
  Claims 3 years with the core JD skill but cannot explain basic implementation details = max 35.
  Demonstrated hands-on knowledge of the specific JD requirements with production evidence = 70-85.

SCORING ANCHORS:
  0-20:  No connection to role requirements. Answered generic questions but showed no JD-specific knowledge.
  21-45: Knows the technology names from the JD but cannot explain how they work in context of the role.
  46-65: Relevant knowledge in 1-2 JD areas. Missing coverage of key requirements.
  66-80: Solid alignment with JD. Named specific tools/responsibilities from the JD with working examples.
  81-100: Exceptional fit. Covered all major JD requirements with specific, verifiable evidence.

---
DIMENSION 2 — ps (Problem Solving, weight 25%)
This is NOT about whether the final answer was correct. It measures HOW they reason through problems:
- Did they frame the problem before answering? (structured approach)
- Did they name trade-offs without being prompted? (depth of thinking)
- When given a follow-up or counter-example, did they adapt or repeat the same answer? (adaptability)
- Did they ask a clarifying question when a problem was ambiguous? (intellectual honesty)
- Did they reason about failure modes, edge cases, or second-order effects? (systems thinking)
- When they didn't know something, did they reason from first principles or go silent? (reasoning ability)

FRESHER baseline: Evaluate reasoning potential, not production experience.
  A fresher who cannot give a correct answer but clearly reasons through it logically = 55-65.
  A fresher who goes silent or just says "I don't know" on every hard question = 15-25.

EXPERIENCED baseline: Evaluate structured independent reasoning, not just reciting known solutions.
  Named trade-offs, constraints, and decision factors without being asked = strong signal.
  Only gave the textbook answer and stalled on follow-ups = 30-45 regardless of seniority.

SCORING ANCHORS:
  0-20:  No reasoning. Restated the question. Went silent on every follow-up.
  21-45: Reactive. Answered surface but could not reason beyond it. No trade-offs, no structure.
  46-65: Basic structure. Understood the problem, gave a reasonable first answer, but fell apart under probing.
  66-80: Logical and adaptive. Named trade-offs. Adapted when challenged. Handled most probes.
  81-100: Sophisticated. Framed independently. Named trade-offs unprompted. Showed second-order thinking.

---
DIMENSION 3 — ec (Resume Credibility, weight 20%)
Did their live answers hold up against what they claimed on their resume or in their intro?
This measures resume credibility — whether the experience, projects, and skills listed on
their resume are genuinely theirs, not testing raw technical knowledge.

FRESHER baseline: Do NOT penalize for lacking production experience.
  Evaluate whether the projects/internships listed on their resume are genuine and specific
  when discussed live:
  - Named the specific problem they solved, not just the technology on their resume
  - Described their personal contribution (what "I" did vs what "we" did)
  - When probed on a resume project, could explain architecture decisions they made
  - Could walk through a specific bug they fixed or feature they built
  FRESHER whose resume claims hold up with strong project credibility = 60-75.
  Vague descriptions that don't match their resume claims = 30-45.

EXPERIENCED baseline: Much higher bar.
  - Named specific outcomes with real metrics matching what's claimed on their resume
    (latency reduced, coverage increased, users served)
  - Described their personal decisions behind resume-listed work ("I chose X over Y because...")
  - When probed on a resume claim, gave more detail, not vaguer answers
  - If their resume said they "led" something, they could describe what leadership actually
    meant in that context
  EXPERIENCED candidate whose resume claims 5 years but gives vague, textbook answers on their
  own stated resume work = 20-35.

SCORING ANCHORS:
  0-20:  Major contradictions. Resume claims about significant experience they cannot explain at all.
  21-45: Significant vagueness. Most resume claims were team-framed or contradicted under probing.
  46-65: Mixed. Some resume claims held up, others fell apart or stayed vague despite probing.
  66-80: Credible. Most resume claims backed with specific detail. Minor gaps.
  81-100: Fully credible. Every resume claim explained with evidence. Nothing contradicted.

---
DIMENSION 4 — cm (Communication, weight 15%)
Was their communication clear, direct, and structured across the entire interview?
This is a threshold signal — a score below 30 fails regardless of technical scores.

FRESHER baseline: Same standard as experienced. Clear thinking is independent of seniority.
Score based on:
  - Did they directly answer the question asked (not a related question)?
  - Was the answer followable without asking for clarification?
  - Did they structure their response (beginning, middle, point)?
  - Did they use excessive hedging ("I think maybe", "kind of", "sort of") throughout?
  - When corrected or challenged, did they respond clearly or became circular/defensive?

SCORING ANCHORS:
  0-20:  Incomprehensible. Circular. Could not land a point. Constant restarts.
  21-45: Frequently unclear. Heavy hedging. Lost the thread. Answered a different question.
  46-65: Passable. Followable but inconsistent. Structured sometimes, scattered in others.
  66-80: Clear and direct. Most answers structured. Landed the point. Minor slips.
  81-100: Precise and confident. Every answer structured. No wasted words. Held clarity under pressure.

---
DIMENSION 5 — od (Ownership, weight 10%)
Did they actually build, lead, or decide — or did they participate and observe?
Do NOT score on confidence or communication style. Score ONLY on evidence of personal responsibility.

FRESHER baseline: Ownership for freshers shows as:
  - "I" vs "we" in project descriptions
  - Describing design decisions they made, even small ones
  - Going beyond the assignment (self-initiated improvement, additional feature, fix they spotted unprompted)
  - Curiosity about the role (asked a thoughtful question about the problem space)
  - Accountable when describing what went wrong ("I missed X" not "the team didn't do Y")

EXPERIENCED baseline: Much higher bar.
  - Named specific decisions they personally made with the trade-offs they weighed
  - Described impact in first person with specific metrics
  - Showed what they do when no one tells them what to do
  - Described accountability in a failure ("I shipped the bug and I fixed it" vs "we had an incident")
  - Proactively mentioned going beyond their stated role

SCORING ANCHORS:
  0-20:  Pure observer. Used "we" for everything. Blame-shifted on failures. Passive throughout.
  21-45: Minimal ownership. Some personal examples but mostly team-framed or passive.
  46-65: Present ownership. Owned their work in stated examples. Some proactive signals.
  66-80: Strong ownership. Clear personal contributions. Initiative shown. Good accountability.
  81-100: Exceptional. Multiple unprompted examples of going beyond. High self-direction. Named impact.
---
OUTPUT ONLY valid JSON matching the schema exactly. No markdown. No extra keys."""

_EVAL_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "eval_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "str": {"type": "array", "items": {"type": "string"}},
                "con": {"type": "array", "items": {"type": "string"}},
                "jk":  {"type": "object", "properties": {"s": {"type": "integer"}, "ev": {"type": "string"}}, "required": ["s", "ev"], "additionalProperties": False},
                "ps":  {"type": "object", "properties": {"s": {"type": "integer"}, "ev": {"type": "string"}}, "required": ["s", "ev"], "additionalProperties": False},
                "ec":  {"type": "object", "properties": {"s": {"type": "integer"}, "ev": {"type": "string"}}, "required": ["s", "ev"], "additionalProperties": False},
                "cm":  {"type": "object", "properties": {"s": {"type": "integer"}, "ev": {"type": "string"}}, "required": ["s", "ev"], "additionalProperties": False},
                "od":  {"type": "object", "properties": {"s": {"type": "integer"}, "ev": {"type": "string"}}, "required": ["s", "ev"], "additionalProperties": False},
            },
            "required": ["str", "con", "jk", "ps", "ec", "cm", "od"],
            "additionalProperties": False,
        },
    },
}

_SKILLS_FROM_RECORDS_SYSTEM = """You are a senior technical evaluator writing a skill breakdown for the hiring team after a structured AI interview.
You will receive structured topic records from the interview.

YOUR JOB:
Group the topics discussed into 3-5 broad DOMAIN CATEGORIES based on what was actually discussed in the interview.
Do NOT create a category if there is no interview evidence for it.

FOR EACH CATEGORY:
- skill: A concise, industry-standard category name (e.g. "Backend Development", "System Design", "Frontend Engineering")
- score: 1-10 reflecting actual demonstrated ability. Use the full range. Do NOT cluster around 5-7.
  1-3: Could not explain even basics when asked. Major gaps.
  4-5: Knew terminology but couldn't explain mechanics. Surface-level only.
  6-7: Explained concepts correctly. Some hands-on knowledge. Gaps when probed deeper.
  8-9: Demonstrated real working knowledge. Held probes. Gave specific implementation details.
  10: Exceptional depth. Could teach this. No gaps found.
- evidence: EXACTLY 2-3 short bullet points (array of strings), not a paragraph. Each bullet is
  ONE sharp sentence referencing a specific question/answer/probe moment and what it proves about
  their practical capability. NO generic praise. NO sentences that could apply to any other candidate.

SCORING ADJUSTMENTS:
- If the candidate said "I don't know" or denied a topic -> cap that category at 3.
- If they answered vaguely and couldn't give specifics when probed -> cap at 5.
- If they answered confidently AND held up to 1+ follow-up probes -> bump up by 1.

OUTPUT ONLY valid JSON matching the schema exactly. No markdown."""

_SKILLS_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "skills_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "skills": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "skill":    {"type": "string", "description": "The dynamic category name, e.g., 'Frontend Development'"},
                            "score":    {"type": "integer"},
                            "evidence": {
                                "type": "array",
                                "items": {"type": "string"},
                                "minItems": 2,
                                "maxItems": 3,
                                "description": "2-3 sharp bullet points explaining the score",
                            },
                        },
                        "required": ["skill", "score", "evidence"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["skills"],
            "additionalProperties": False,
        },
    },
}

_ANSWER_INTEGRITY_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "answer_integrity_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "ai_phrasing_flagged":   {"type": "boolean", "description": "true only if a concrete, quotable AI-generated/read passage was found"},
                "contradiction_flagged": {"type": "boolean", "description": "true only if two concrete, quotable conflicting claims were found"},
                "verdict": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": 1,
                    "maxItems": 3,
                    "description": "1-3 short, high-impact sentences for a recruiter: what fired, the concrete evidence (quote or claim), and what it means for hiring judgment. One confident sentence if nothing fired.",
                },
            },
            "required": ["ai_phrasing_flagged", "contradiction_flagged", "verdict"],
            "additionalProperties": False,
        },
    },
}

_SUMMARY_SYSTEM = """You are a senior talent partner writing a post-interview brief for the hiring team.
The brief must read as if written by a person who watched THIS specific interview, not a template filled
in for any candidate. Do not force content into a fixed slot if it doesn't genuinely belong there.

Write 2-4 bullet points — exactly as many as this candidate's interview actually earns, not a fixed count.
A candidate with one standout signal and one clear gap needs 2 bullets; a candidate with several distinct,
non-redundant things worth telling a recruiter can get up to 4. Never pad to hit a number, and never merge
two unrelated observations into one bullet just to stay under a count.

Each bullet is ONE crisp sentence covering ONE of these lenses — use only the lenses that have real
evidence behind them for this candidate, in whatever order matters most for THIS candidate:
- The most important technical signal: name the exact topic and what they demonstrated or failed to
  demonstrate, including what they actually said.
- The biggest overall takeaway about fit and trajectory for the role (not behavioral/communication — that
  lives in a separate section). What it means for the hiring decision.
- A sharp hiring implication: what this person looks like in the role 30 days in, and what the risk or
  gain is.
- Anything else that is genuinely the most important thing a recruiter needs to know about this specific
  candidate that the above lenses don't capture — only if it's real and non-redundant.

HARD RULES:
- No softening, no filler, no restating a dimension score in words ("their communication was decent").
- Every sentence must be something that could ONLY be said about this candidate — if a sentence could be
  copy-pasted onto a different candidate's report unchanged, cut it.
- No scores or numbers.
- Start each bullet with a dash (-).
OUTPUT ONLY the dashes, one per line. No markdown. No extra text."""

_VERDICT_SYSTEM = """You are a senior hiring manager making the final call after an interview. Recruiters
will rely on this to make or kill an offer — be precise, accountable, and actually do the reading.

YOU ARE GIVEN, IN THE USER MESSAGE, EVERYTHING A HUMAN REVIEWER WOULD READ BEFORE DECIDING — READ ALL OF
IT, NOT JUST THE NUMBERS:
- The 5 dimension scores and the evidence behind each (JD Knowledge, Problem Solving, Resume/Experience
  Credibility, Communication, Ownership).
- A computed weighted average of those 5 scores — a rough reference point only; it cannot see anything
  below it, so don't treat it as a ceiling or floor.
- The full skill-by-skill breakdown with ratings and evidence per skill.
- Strengths and concerns lists.
- The behavioral analysis (composure, communication style, engagement, how they handled not knowing
  something).
- Answer integrity findings (AI-generated/read phrasing, cross-turn contradictions).
- The FULL interview transcript — the ground truth every other section above is a summary of.

YOUR JOB: read all of it and form one honest, holistic judgment of this candidate, the way a sharp human
reviewer would after actually reading the whole file — not by averaging the numbers you're given. Weigh
each section by how much it actually tells you: the transcript and skill evidence usually carry more
signal than a single dimension label; a genuine integrity flag or a stark contradiction between what a
section claims and what the transcript shows should weigh heavily regardless of what the other numbers say.

Give ONE score, 0-100, that reflects your real judgment of this specific candidate for this specific role.
Use the full range — a genuinely weak candidate should score low, a genuinely strong one should score
high, and a genuinely mixed candidate should score in the middle. Do not default to a safe middling number,
and do not compress candidates toward any particular range out of caution. Accuracy for THIS candidate is
the only goal.

DECISION RULES:
- "Hire": score >= 65 AND no DISQUALIFYING gap. A disqualifying gap means the candidate could not do the
  job's core function — e.g. a backend role candidate who cannot explain how their own code works, or who
  has zero grasp of the primary language/framework the role requires. A single soft spot in ONE secondary
  or peripheral area (e.g. solid everywhere else but vague on one specific sub-topic like a particular
  cloud service's IAM details) is normal for almost every real candidate and does NOT disqualify — score
  >= 65 with only minor, secondary gaps should be Hire, not Hold. Do not downgrade a strong candidate to
  Hold just because they weren't flawless on every single sub-topic asked.
- "Hold": score 45-64, OR score >= 65 but with a genuinely significant gap or unresolved integrity concern
  that materially affects whether they can do the job, not just a minor sub-topic weakness.
- "Reject": score < 45, OR a disqualifying gap/confirmed integrity issue regardless of score.

JUSTIFICATION — Write 3 sharp bullet points starting with "-":
- Bullet 1: The single strongest positive signal from the entire interview. Name the exact topic, what they said or did, and why it matters for this role. Pull from the transcript or skill evidence, not just a dimension label.
- Bullet 2: The single biggest gap, risk, or concern — pulling from whichever section makes it clearest (transcript, skill breakdown, behavioral read, or integrity). Name the specific moment. Be blunt. If there genuinely isn't one, say plainly that no material gap was found instead of manufacturing one.
- Bullet 3: The final verdict sentence. State the decision clearly, name the key reason, and what should happen next.
No score numbers. No hedging. No generic language. Every sentence must be specific to this candidate's actual interview performance.

OUTPUT ONLY valid JSON matching the provided schema EXACTLY. No markdown fences."""

_VERDICT_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "verdict_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "decision":      {"type": "string", "enum": ["Hire", "Hold", "Reject"]},
                "score":         {"type": "integer", "description": "Holistic 0-100 score based on the entire interview."},
                "justification": {"type": "string", "description": "Concise, evidence-backed justification paragraph."}
            },
            "required": ["decision", "score", "justification"],
            "additionalProperties": False,
        },
    },
}


def _parse_eval_compact(raw: str) -> LLMEvalResponse:
    """Map compact field names (jk/ps/ec/cm/od) back to full LLMEvalResponse model."""
    data = json.loads(raw)

    def _dim(key: str) -> LLMEvalDimension:
        d = data.get(key, {})
        return LLMEvalDimension(score=d.get("s", 0), evidence=d.get("ev", ""))

    return LLMEvalResponse(
        jd_knowledge=_dim("jk"),
        problem_solving=_dim("ps"),
        experience_credibility=_dim("ec"),
        communication=_dim("cm"),
        ownership=_dim("od"),
        strengths=list(data.get("str", [])),
        concerns=list(data.get("con", [])),
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECTION 8 — LangGraph Nodes
#
# Node execution order:
#   signals  ->  llm_calls (eval + skills + behavioral in parallel)  ->  assemble
#
# All three parallel tasks inside llm_calls run under asyncio.gather — no
# sequential blocking. DB write happens only in assemble.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _build_turn_windows(interview_scores: list[dict]) -> list[dict]:
    """Build a per-turn timing window from answer_scores for event correlation.

    Each window covers [question_asked_at_wall_ms, next_turn's question_asked_at_wall_ms)
    so a proctoring event's timestamp can be matched to "which question was live."
    Turns missing a wall-clock timestamp (older sessions, before this field existed)
    are skipped -- they simply can't be correlated, not an error.
    """
    windows: list[dict] = []
    dated = [
        s for s in interview_scores
        if not s.get("is_warmup") and s.get("question_asked_at_wall_ms")
    ]
    dated.sort(key=lambda s: s["question_asked_at_wall_ms"])
    for i, s in enumerate(dated):
        start = s["question_asked_at_wall_ms"]
        end = dated[i + 1]["question_asked_at_wall_ms"] if i + 1 < len(dated) else start + 10 * 60 * 1000
        windows.append({
            "start": start,
            "end": end,
            "turn": s.get("turn"),
            "question": str(s.get("question", "")).strip(),
            "topic": str(s.get("topic", "")).strip(),
        })
    return windows


def _attach_question_context(events: list[dict], windows: list[dict]) -> list[dict]:
    """Attach during_question/during_topic to each event whose timestamp falls
    inside a turn's window. Events with no matching window (e.g. before the
    first question, or an older session with no wall-clock data) are left as-is.
    """
    if not windows:
        return events
    for ev in events:
        ts = ev.get("timestamp")
        if not isinstance(ts, (int, float)):
            continue
        for w in windows:
            if w["start"] <= ts < w["end"]:
                if w["question"]:
                    ev["during_question"] = w["question"]
                if w["topic"]:
                    ev["during_topic"] = w["topic"]
                break
    return events


async def _node_signals(state: ReportState) -> dict:
    """Node 1: deterministic integrity + signal context.

    Fetches browser-side integritySignals from DB (written by frontend during
    the interview) and merges with agent-side behavioral signals from per-turn
    eval. All O(n) via Counter.
    """
    proctoring_data = state.get("proctoring_data") or {}
    app_id          = state.get("app_id", "")
    org_id          = state.get("org_id")

    agent_events: list[dict] = list(proctoring_data.get("events", []) or [])
    browser_events: list[dict] = []

    # Fetch browser-side proctoring events written during the interview
    if app_id and DATABASE_URL:
        try:
            from interview.agent_persistence import DatabasePool
            pool = await DatabasePool.get()
            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    'SELECT "proctoringEvents" FROM "Interview" WHERE "applicationId" = $1 LIMIT 1',
                    app_id,
                )
            if row and row["proctoringEvents"]:
                raw = row["proctoringEvents"]
                parsed = raw if isinstance(raw, list) else (
                    json.loads(raw) if isinstance(raw, str) else []
                )
                browser_events = [e for e in (parsed or []) if isinstance(e, dict)]
                # Normalize eventType -> signal_name
                for ev in browser_events:
                    if "eventType" in ev and "signal_name" not in ev:
                        ev["signal_name"] = ev["eventType"]
                logger.info(
                    "[REPORT] %d browser integrity signals for %s",
                    len(browser_events), app_id,
                )
        except Exception as e:
            logger.warning("[REPORT] integritySignals fetch failed for %s: %s", app_id, e)

    # Attach "which question was live" to every event that has a timestamp --
    # answers "left the tab during the Python question" instead of just "left
    # the tab at some point." Turns without a wall-clock timestamp (sessions
    # recorded before this field existed) are silently skipped, not an error.
    _turn_windows = _build_turn_windows(state.get("interview_scores", []))
    browser_events = _attach_question_context(browser_events, _turn_windows)
    agent_events = _attach_question_context(agent_events, _turn_windows)

    integrity_result = IntegrityEngine.score(browser_events)

    # Build signal_context string for LLM eval user prompt — O(n) Counter
    all_events = agent_events + browser_events
    sig_counts: Counter[str] = Counter(
        str(ev.get("signal_name") or ev.get("signal") or ev.get("event") or "").strip()
        for ev in all_events
        if ev.get("signal_name") or ev.get("signal") or ev.get("event")
    )
    signal_context = (
        ", ".join(f"{k}x{v}" for k, v in sig_counts.items()) if sig_counts else "none"
    )

    jd_json = state.get("jd_json") or {}
    # Extract structured JD context + experience level for the eval prompt
    if jd_json:
        jd_str = json.dumps(jd_json, ensure_ascii=False)[:2500]
        # Detect experience level hint from JD fields
        exp_years = (
            jd_json.get("experience_years")
            or jd_json.get("min_experience")
            or jd_json.get("experience")
            or jd_json.get("years_of_experience")
            or ""
        )
        seniority = (
            jd_json.get("seniority")
            or jd_json.get("level")
            or jd_json.get("job_level")
            or ""
        )
        exp_hint = ""
        if exp_years:
            exp_hint = f" (requires {exp_years} years experience)"
        elif seniority:
            sl = str(seniority).lower()
            if any(x in sl for x in ["junior", "fresher", "entry", "graduate", "intern"]):
                exp_hint = " (entry-level / fresher role)"
            elif any(x in sl for x in ["senior", "lead", "principal", "staff", "architect"]):
                exp_hint = " (senior / experienced role)"
        jd_context = (
            f"JOB DESCRIPTION{exp_hint}:\n{jd_str}"
        )
    else:
        jd_context = "No JD provided — assess based on role title only."

    # Extract behavioral signals from per-turn scores for downstream nodes
    interview_scores = state.get("interview_scores", [])
    behavioral_signals: list[dict] = [
        {
            "signal_name":   s["signal"],
            "signal_reason": s.get("signal_reason", ""),
            "turn":          s.get("turn", 0),
            "topic":         s.get("topic", ""),
            "question":      s.get("question", "")[:200],
            "answer":        s.get("answer", "")[:300],
        }
        for s in interview_scores
        if s.get("signal")
    ]

    merged_proctoring = {**proctoring_data, "events": all_events}

    logger.info(
        "[REPORT] Signals: app=%s integrity=%d band=%s behavioral=%d",
        app_id, integrity_result["score"], integrity_result["band"],
        len(behavioral_signals),
    )
    return {
        "integrity_result":  integrity_result,
        "signal_context":    signal_context,
        "jd_context":        jd_context,
        "behavioral_signals": behavioral_signals,
        "proctoring_data":   merged_proctoring,
    }


async def _node_llm_calls(state: ReportState) -> dict:
    """Node 2: eval + skills + behavioral analysis — all three in parallel.

    asyncio.gather runs all three LLM calls concurrently, cutting wall-clock
    time from ~15s sequential to ~7s parallel.
    """
    llm_default        = state["llm_model"]
    job_title        = state.get("job_title", "")
    org_id           = state.get("org_id") or ""
    app_id           = state.get("app_id", "")
    integrity_result = state["integrity_result"]
    topic_records    = state.get("topic_records") or []
    behavioral_signals = state.get("behavioral_signals", [])
    transcript_lines = state.get("transcript_lines", [])
    interview_scores = state.get("interview_scores", [])
    is_test          = state.get("is_test", False)

    # Build eval user prompt (dynamic vars -> user msg, system is static)
    lines_to_use  = transcript_lines[4:] if len(transcript_lines) > 4 else transcript_lines
    transcript_text = truncate_to_tokens("\n".join(lines_to_use), 5000)
    resume_context = _build_resume_claims_block(state.get("resume_json") or {})
    eval_user = (
        f"Role: {job_title}\n"
        f"JD Context: {state['jd_context']}\n"
        f"CANDIDATE RESUME (ground truth for Resume Credibility dimension):\n{resume_context}\n\n"
        f"Integrity Score: {integrity_result['score']}/100 ({integrity_result['band']})\n"
        f"Behavioral flags: {state['signal_context']}\n\n"
        f"Full Interview Transcript:\n{transcript_text}"
    )

    # Build skills user prompt from topic_records, enriched with each topic's
    # actual per-turn scores (matched by topic name from interview_scores) so
    # the LLM sees turn-by-turn granularity, not just the topic-level average.
    records_lines: list[str] = []
    for i, rec in enumerate(topic_records, 1):
        topic_turns = [s for s in interview_scores if s.get("topic") == rec.get("topic")]
        turns_block = (
            "\n".join(
                f"  Q: {str(t.get('question', '')).strip()[:200]}\n"
                f"  A: {str(t.get('answer', '')).strip()[:300]}\n"
                f"  [clarity={t.get('clarity', 0)} depth={t.get('depth', 0)} "
                f"specificity={t.get('specificity', 0)} grounding={t.get('grounding', 0)} "
                f"overall={t.get('overall', 0)}]"
                for t in topic_turns
            )
            if topic_turns else "  No per-turn scores available."
        )
        records_lines.append(
            f"[TOPIC {i}] {rec.get('topic', '')}\n{turns_block}\n"
        )
    skills_system = _SKILLS_FROM_RECORDS_SYSTEM
    skills_user = (
        f"Role: {job_title}\n\n" + "\n".join(records_lines)
        if records_lines else f"Role: {job_title}\n\nNo interview topics found."
    )
    logger.info("[REPORT] Skills: topic_records path (%d topics)", len(topic_records))

    # Duration for behavioral analysis
    _total_turns   = len(interview_scores)
    session_duration = int(
        (state.get("proctoring_data") or {}).get("session_duration")
        or _total_turns * 90
    )

    # answer_integrity is an org-toggled signal (super-admin proctoring config) --
    # disabled orgs skip the LLM call entirely, not just the resulting event.
    answer_integrity_enabled = state.get("answer_integrity_enabled", False)
    _answer_integrity_task = (
        _answer_integrity_analyzer.analyze(
            transcript_lines=transcript_lines,
            _LLM_DEFAULT=llm_default,
            org_id=org_id,
            app_id=app_id,
        )
        if answer_integrity_enabled
        else _answer_integrity_noop()
    )

    # -- Run the 4 independent LLM calls in parallel ------------------------
    (
        (eval_raw, eval_usage),
        (skills_raw, skills_usage),
        (behavioral_result, beh_usages),
        (answer_integrity_result, answer_integrity_usages),
    ) = (
        await asyncio.gather(
            _llm.call(LLMCallSpec(
                system=_EVAL_SYSTEM,
                user=eval_user,
                max_tokens=1100,
                response_format=_EVAL_JSON_SCHEMA,
                call_type="report_eval",
                org_id=org_id,
                app_id=app_id,
                _LLM_DEFAULT=llm_default,
            )),
            _llm.call(LLMCallSpec(
                system=skills_system,
                user=skills_user,
                max_tokens=700,
                response_format=_SKILLS_JSON_SCHEMA,
                call_type="report_skills",
                org_id=org_id,
                app_id=app_id,
                _LLM_DEFAULT=llm_default,
            )),
            _behavioral_analyzer.analyze(
                transcript_lines=transcript_lines,
                answer_scores=interview_scores,
                duration_sec=session_duration,
                behavioral_signals=behavioral_signals,
                _LLM_DEFAULT=llm_default,
                org_id=org_id,
                app_id=app_id,
            ),
            _answer_integrity_task,
        )
    )

    # Persist billing for all 4 calls concurrently — non-fatal so a DB blip
    # doesn't take down the entire report and cause a silent "[REPORT] Failed".
    # Real and test sessions take the SAME path: the interviewReport LLM cost
    # lands in the interview:{app} UsageEvent row's report sub-key, flagged
    # isTest so test spend is distinguishable but never separate.
    _report_ctx = {
        "applicationId": app_id,
        "candidateName": state.get("candidate_name", ""),
        "jobTitle": job_title,
        "eventId": f"interview:{app_id}:report",
        "isTest": is_test,
    }
    def _bill(usage: dict) -> Any:
        usage = {**usage, "context": _report_ctx}
        return _persist_billing(org_id, "interviewReport", usage)
    if org_id:
        billing_tasks = [
            _bill(_llm.usage_dict(eval_usage, llm_default)),
            _bill(_llm.usage_dict(skills_usage, llm_default)),
            *[_bill(bu) for bu in beh_usages],
            *[_bill(au) for au in answer_integrity_usages],
        ]
        try:
            await asyncio.gather(*billing_tasks)
        except Exception as _bill_err:
            logger.error("[BILLING] interviewReport billing failed (non-fatal): %s", _bill_err)

    # Parse and validate
    try:
        eval_result = _parse_eval_compact(eval_raw)
    except Exception as e:
        logger.warning("[REPORT] eval parse failed: %s | raw=%s", e, eval_raw[:200])
        eval_result = LLMEvalResponse()

    try:
        skills_result = LLMSkillsResponse.model_validate(json.loads(skills_raw))
    except Exception as e:
        logger.warning("[REPORT] skills parse failed: %s | raw=%s", e, skills_raw[:200])
        skills_result = LLMSkillsResponse()

    logger.info(
        "[REPORT] LLM done: app=%s jk=%d ps=%d ec=%d cm=%d od=%d skills=%d behavioral=%d",
        app_id,
        eval_result.jd_knowledge.score, eval_result.problem_solving.score,
        eval_result.experience_credibility.score, eval_result.communication.score,
        eval_result.ownership.score, len(skills_result.skills),
        len(behavioral_result.get("points", [])),
    )
    return {
        "eval_result":        eval_result,
        "skills_result":      skills_result,
        "behavioral_analysis": behavioral_result,
        "answer_integrity_result": answer_integrity_result,
    }


async def _node_assemble(state: ReportState) -> dict:
    """Node 3: assemble final scorecard blob and write to DB.

    Weighted overall score formula:
      comm×0.15 + tech×0.30 + cred×0.20 + ps×0.25 + cot×0.10
    """
    app_id           = state["app_id"]
    org_id           = state.get("org_id")
    proctoring_data  = state.get("proctoring_data") or {}
    interview_scores = state.get("interview_scores", [])
    eval_result      = state["eval_result"]
    skills_result    = state.get("skills_result") or LLMSkillsResponse()
    integrity_result = state["integrity_result"]
    behavioral_analysis = state.get("behavioral_analysis") or {"points": []}
    behavioral_signals  = state.get("behavioral_signals", [])
    answer_integrity_result = state.get("answer_integrity_result") or AnswerIntegrityAnalyzer._empty_result()

    # Content-layer integrity signal: fold the answer-integrity verdict into the
    # same browser-events list that jobs the deterministic integrity score,
    # so a candidate who behaves cleanly but cheats in what they SAID (AI-read
    # phrasing, or contradicts themselves across turns) still gets caught. Only
    # fires as an event if either check actually found something; the verdict
    # is always kept in signalAnalysis regardless, for recruiter judgment.
    # Gated on the org toggle -- disabled orgs never fire this event even if
    # a flag happens to be present in state (defense in depth; the LLM call
    # itself is already skipped upstream when disabled).
    answer_integrity_enabled = state.get("answer_integrity_enabled", False)
    answer_integrity_flagged = answer_integrity_enabled and answer_integrity_result["flagged"]
    if answer_integrity_flagged:
        answer_integrity_event = _build_answer_integrity_event(answer_integrity_result)
        proctoring_data = {
            **proctoring_data,
            "events": [*proctoring_data.get("events", []), answer_integrity_event],
        }
        integrity_result = IntegrityEngine.score(proctoring_data["events"])
        if app_id and DATABASE_URL:
            try:
                from interview.agent_persistence import DatabasePool
                pool = await DatabasePool.get()
                async with pool.acquire() as conn:
                    row = await conn.fetchrow(
                        'SELECT "proctoringEvents" FROM "Interview" WHERE "applicationId" = $1 LIMIT 1',
                        app_id,
                    )
                    existing: list = []
                    if row and row["proctoringEvents"]:
                        raw = row["proctoringEvents"]
                        existing = raw if isinstance(raw, list) else (
                            json.loads(raw) if isinstance(raw, str) else []
                        )
                    await conn.execute(
                        """UPDATE "Interview" SET "proctoringEvents" = $1, "interviewUpdatedAt" = NOW()
                           WHERE "applicationId" = $2""",
                        json.dumps(existing + [answer_integrity_event]),
                        app_id,
                    )
            except Exception as e:
                logger.error("[ANSWER_INTEGRITY] Failed to persist answer_integrity event for %s: %s", app_id, e)

    # Dimension scores — new 5-dimension framework
    jk  = eval_result.jd_knowledge.score
    ps  = eval_result.problem_solving.score
    ec  = eval_result.experience_credibility.score
    cm  = eval_result.communication.score
    od  = eval_result.ownership.score

    # Weighted overall: JD Knowledge 30% + Problem Solving 25% + Experience Credibility 20%
    #                   + Communication 15% + Ownership 10%
    overall_score = max(0, min(100, round(
        jk * 0.30 + ps * 0.25 + ec * 0.20 + cm * 0.15 + od * 0.10
    )))

    skill_ratings_list = [
        {"skill": r.skill, "score": r.score, "evidence": r.evidence}
        for r in skills_result.skills
        if r.skill
    ]
    skills_evaluated = [r["skill"] for r in skill_ratings_list]

    # signalAnalysis column: exactly two top-level blocks -- behavioral (the
    # 5-point interview-content analysis) and integrity_analysis (everything
    # integrity-related that isn't already covered by the dedicated
    # integritySignals DB column). Raw proctoring events are NOT duplicated
    # here -- the UI's proctoring rows already read from integritySignals
    # (see groupedProctoringSignals in app/admin/candidates/[id]/page.tsx),
    # so keeping a second copy here was pure duplication risk with no reader.
    signal_analysis = {
        "behavioral_signals": behavioral_signals,
        "behavioral_signals_analysis": behavioral_analysis.get("points", []),
        "integrity_analysis": {
            "answer_integrity": {
                "enabled":                 answer_integrity_enabled,
                "flagged":                 answer_integrity_flagged,
                "ai_phrasing_flagged":     answer_integrity_result["ai_phrasing_flagged"],
                "contradiction_flagged":   answer_integrity_result["contradiction_flagged"],
                "verdict":                 answer_integrity_result["verdict"],
            },
        },
    }

    score_breakdown_report = {
        "dimensions": [
            {"name": "JD Knowledge",            "score": jk, "evidence": eval_result.jd_knowledge.evidence},
            {"name": "Problem Solving",          "score": ps, "evidence": eval_result.problem_solving.evidence},
            {"name": "Experience Credibility",   "score": ec, "evidence": eval_result.experience_credibility.evidence},
            {"name": "Communication",            "score": cm, "evidence": eval_result.communication.evidence},
            {"name": "Ownership",               "score": od, "evidence": eval_result.ownership.evidence},
        ],
        "overall":   overall_score,
        "integrity": {
            "score":        integrity_result["score"],
            "band":         integrity_result["band"],
            "signals_used": integrity_result.get("signals_used", []),
            "methodology":  "signal_weighted_deterministic",
        },
        "skills_evaluated": skills_evaluated,
    }

    interview_summary_report = {
        "strengths": eval_result.strengths,
        "concerns":  eval_result.concerns,
    }

    try:
        from interview.agent_persistence import DatabasePool
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            # Update Interview table with scores
            await conn.execute(
                """UPDATE "Interview"
                   SET "aiScoreBreakdown"  = $1,
                       "aiSkillRatings"    = $2,
                       "proctoringAnalysis" = $3,
                       "aiInterviewSummary" = $4
                   WHERE "applicationId"  = $5""",
                json.dumps(score_breakdown_report),
                json.dumps(skill_ratings_list),
                json.dumps(signal_analysis),
                json.dumps(interview_summary_report),
                app_id,
            )

        logger.info(
            "[REPORT] Written: app=%s overall=%d jk=%d ps=%d ec=%d cm=%d od=%d "
            "integrity=%d skills=%d behavioral_points=%d",
            app_id, overall_score, jk, ps, ec, cm, od,
            integrity_result["score"], len(skills_evaluated),
            len(behavioral_analysis.get("points", [])),
        )
    except Exception as e:
        logger.error("[REPORT] DB write failed for %s: %s", app_id, e, exc_info=True)

    scores_context = {
        "overall":                overall_score,
        "jd_knowledge":           jk,
        "problem_solving":        ps,
        "experience_credibility": ec,
        "communication":          cm,
        "ownership":              od,
        "integrity_score":        integrity_result["score"],
        "integrity_band":         integrity_result["band"],
        "skills_evaluated":       skills_evaluated,
        "signal_summary":         state.get("signal_context", "none"),
        "dimensions":             score_breakdown_report["dimensions"],
        "skill_ratings":          skill_ratings_list,
        "strengths":              eval_result.strengths,
        "concerns":               eval_result.concerns,
        "behavioral_points":      behavioral_analysis.get("points", []),
        "answer_integrity":       signal_analysis["integrity_analysis"]["answer_integrity"],
    }
    return {"scores_context": scores_context}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECTION 9 — LangGraph Pipeline (compiled once at module load)
#
# Graph topology:
#   signals ---> llm_calls ---> assemble ---> END
#
# Compiled at module load — no rebuild per request. LangGraph's compiled graph
# is coroutine-safe and can be ainvoked concurrently from multiple sessions.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _build_report_graph() -> Any:
    builder = StateGraph(ReportState)  # type: ignore
    builder.add_node("signals",   _node_signals)
    builder.add_node("llm_calls", _node_llm_calls)
    builder.add_node("assemble",  _node_assemble)
    builder.set_entry_point("signals")
    builder.add_edge("signals",   "llm_calls")
    builder.add_edge("llm_calls", "assemble")
    builder.add_edge("assemble",  END)
    return builder.compile()


_REPORT_GRAPH = _build_report_graph()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECTION 10 — Public API
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def generate_interview_report(
    app_id:                str,
    transcript_lines:      list,
    answer_scores:         list,
    job_title:             str,
    llmInterviewReport:    str,
    proctoring_data:       Optional[dict] = None,
    org_id:                Optional[str]  = None,
    jd_json:               Optional[dict] = None,
    resume_json:           Optional[dict] = None,
    topic_records:         Optional[list] = None,
    candidate_name:        str = "",
    answer_integrity_enabled: bool = False,
    is_test:               bool = False,
) -> Optional[dict]:
    """Run the full report pipeline.

    Requires org.llmInterviewReport from DB — fail fast if missing.
    Returns scores_context dict (input to generate_interview_summary), or None
    on failure. Caller should run generate_interview_summary() afterwards.
    """
    if not transcript_lines or not DATABASE_URL:
        logger.warning("[REPORT] Skipping: missing transcript or DATABASE_URL")
        return None
    if not os.environ.get("OPENAI_API_KEY"):
        logger.warning("[REPORT] Skipping: missing OPENAI_API_KEY")
        return None
    if not llmInterviewReport:
        logger.error("[REPORT] Missing org.llmInterviewReport from DB for app=%s", app_id)
        return None

    interview_scores = [s for s in answer_scores if not s.get("is_warmup", False)]
    initial_state: ReportState = {
        "app_id":           app_id,
        "transcript_lines": transcript_lines,
        "interview_scores": interview_scores,
        "all_scores":       answer_scores,
        "job_title":        job_title,
        "proctoring_data":  proctoring_data or {},
        "org_id":           org_id,
        "llm_model":        llmInterviewReport,
        "jd_json":          jd_json,
        "resume_json":      resume_json,
        "topic_records":    topic_records or [],
        "answer_integrity_enabled": answer_integrity_enabled,
        "is_test":          is_test,
    }
    _pipeline_start = time.monotonic()
    logger.info("[REPORT] Pipeline started for app=%s", app_id)
    try:
        final_state = await _REPORT_GRAPH.ainvoke(initial_state)
        _pipeline_elapsed = time.monotonic() - _pipeline_start
        logger.info("[REPORT] Pipeline finished for app=%s (%.1fs)", app_id, _pipeline_elapsed)
        return final_state.get("scores_context")
    except asyncio.TimeoutError as e:
        logger.error("[REPORT] Timed out for %s: %s", app_id, e)
        return None
    except Exception as e:
        logger.error("[REPORT] Pipeline failed for %s: %s", app_id, e, exc_info=True)
        try:
            await log_llm_error(
                app_id=app_id,
                org_name=org_id,
                candidate_name=candidate_name,
                provider="openai",
                error=str(e),
                reason="Report/summary generation failed",
            )
        except Exception:
            pass
        return None


async def generate_interview_summary(
    app_id:              str,
    transcript_lines:    list,
    job_title:           str,
    llmInterviewReport:  str,
    org_id:              Optional[str]  = None,
    scores_context:      Optional[dict] = None,
    candidate_name:      str = "",
    is_test:             bool = False,
) -> None:
    """Generate summary bullets + verdict and write to Interview.interviewSummary.

    Requires org.llmInterviewReport from DB — fail fast if missing.
    Runs summary and verdict LLM calls in parallel. Both see everything the
    earlier report stages produced (eval, skills, behavioral, integrity) PLUS
    the full transcript, so the final score/verdict is grounded in the same
    evidence a human reviewer would use, not just the aggregated scores.
    """
    if not transcript_lines or not DATABASE_URL:
        logger.warning("[SUMMARY] Skipping: missing transcript or DATABASE_URL")
        return
    if not os.environ.get("OPENAI_API_KEY"):
        logger.warning("[SUMMARY] Skipping: missing OPENAI_API_KEY")
        return

    ctx             = scores_context or {}
    integrity_band  = ctx.get("integrity_band", "HIGH")
    integrity_score = ctx.get("integrity_score", 100)
    signal_summary  = ctx.get("signal_summary", "No signals flagged")
    computed_overall = ctx.get("overall", None)

    dimensions = ctx.get("dimensions", [])

    dimension_block = (
        "\n".join(
            f"  {d['name']}: {d['score']}/100 — {d.get('evidence', '').strip()}"
            for d in dimensions
        )
        if dimensions else "  Not available"
    )

    skills = ctx.get("skill_ratings", [])
    skill_block = (
        "\n".join(
            f"  {s['skill']} ({s['score']}/10):\n" + "\n".join(f"    - {e}" for e in (s.get("evidence") or []))
            for s in skills[:12]
        )
        if skills else "  Not available"
    )

    strengths = ctx.get("strengths", [])
    concerns  = ctx.get("concerns", [])
    strengths_block = "\n".join(f"  - {s}" for s in strengths) if strengths else "  None identified"
    concerns_block  = "\n".join(f"  - {c}" for c in concerns)  if concerns  else "  None flagged"

    behavioral_points = ctx.get("behavioral_points", [])
    behavioral_block = (
        "\n\n".join(
            f"  {p['topic']}:\n" + "\n".join(f"    - {b}" for b in p.get("bullets", []))
            for p in behavioral_points
        )
        if behavioral_points else "  Not available"
    )

    answer_integrity = ctx.get("answer_integrity", {})
    answer_integrity_block = (
        f"  Flagged: {answer_integrity.get('flagged', False)}\n"
        + "\n".join(f"  - {v}" for v in answer_integrity.get("verdict", []))
        if answer_integrity.get("enabled") else "  Not enabled for this org."
    )

    transcript_text = truncate_to_tokens("\n".join(transcript_lines), 5000)

    shared_user = (
        f"Role: {job_title}\n"
        f"Integrity: {integrity_band} ({integrity_score}/100)\n"
        f"Behavioral signals: {signal_summary}\n"
        f"COMPUTED WEIGHTED SCORE: {computed_overall if computed_overall is not None else 'Not available'}/100 "
        f"(deterministic weighted average of the 5 dimension scores below — a reference point only, it "
        f"cannot see the transcript/skills/behavioral/integrity sections below it; form your own score "
        f"from the full picture, not just this number)\n\n"
        f"DIMENSION SCORES + EVIDENCE:\n{dimension_block}\n\n"
        f"SKILL BREAKDOWN:\n{skill_block}\n\n"
        f"STRENGTHS OBSERVED:\n{strengths_block}\n\n"
        f"CONCERNS FLAGGED:\n{concerns_block}\n\n"
        f"BEHAVIORAL ANALYSIS:\n{behavioral_block}\n\n"
        f"ANSWER INTEGRITY:\n{answer_integrity_block}\n\n"
        f"FULL INTERVIEW TRANSCRIPT:\n{transcript_text}"
    )


    _summary_start = time.monotonic()
    logger.info("[SUMMARY] report_summary + report_verdict started (app=%s)", app_id)
    try:
        (summary_text, summary_usage), (verdict_text, verdict_usage) = await asyncio.gather(
            _llm.call(LLMCallSpec(
                system=_SUMMARY_SYSTEM,
                user=shared_user,
                max_tokens=500,
                response_format={"type": "text"},
                temperature=0.1,
                call_type="report_summary",
                org_id=org_id or "",
                app_id=app_id,
                _LLM_DEFAULT=llmInterviewReport,
            )),
            _llm.call(LLMCallSpec(
                system=_VERDICT_SYSTEM,
                user=shared_user,
                max_tokens=250,
                response_format=_VERDICT_JSON_SCHEMA,
                temperature=0.1,
                call_type="report_verdict",
                org_id=org_id or "",
                app_id=app_id,
                _LLM_DEFAULT=llmInterviewReport,
            )),
        )

        if org_id:
            _summary_ctx = {
                "applicationId": app_id,
                "candidateName": candidate_name,
                "jobTitle": job_title,
                "eventId": f"interview:{app_id}:summary",
                "isTest": is_test,
            }
            def _bill(usage: dict) -> Any:
                usage = {**usage, "context": _summary_ctx}
                return _persist_billing(org_id, "interviewReport", usage)
            try:
                await asyncio.gather(
                    _bill(_llm.usage_dict(summary_usage, llmInterviewReport)),
                    _bill(_llm.usage_dict(verdict_usage, llmInterviewReport)),
                )
            except Exception as _bill_err:
                logger.error("[BILLING] interviewReport summary billing failed (non-fatal): %s", _bill_err)

        _summary_elapsed = time.monotonic() - _summary_start
        logger.info(
            "[SUMMARY] report_summary + report_verdict ended (%.1fs, app=%s)",
            _summary_elapsed, app_id,
        )
        if not summary_text and not verdict_text:
            logger.warning("[SUMMARY] Both outputs empty for %s — skipping save", app_id)
            return

        try:
            verdict_parsed = json.loads(verdict_text)
        except Exception:
            # Fallback if the LLM didn't return valid JSON
            verdict_parsed = {"decision": "Hold", "score": 50, "justification": verdict_text.strip()}

        from interview.agent_persistence import DatabasePool
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE "Interview"
                   SET "aiInterviewSummary" = COALESCE("aiInterviewSummary", '{}') || $1::jsonb
                   WHERE "applicationId"  = $2""",
                json.dumps({"summary": summary_text, "decision_note": verdict_parsed}),
                app_id,
            )
        logger.info("[SUMMARY] Written summary + verdict for %s", app_id)

    except asyncio.TimeoutError:
        logger.warning("[SUMMARY] Timed out for %s", app_id)
    except Exception as e:
        logger.error("[SUMMARY] Failed for %s: %s", app_id, e, exc_info=True)
        try:
            await log_llm_error(
                app_id=app_id,
                org_name=org_id,
                candidate_name=candidate_name,
                provider="openai",
                error=str(e),
                reason="Report/summary generation failed",
            )
        except Exception:
            pass