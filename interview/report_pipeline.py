"""
report_pipeline.py
==================
Self-contained post-interview report pipeline.

Architecture:
  ┌─────────────────────────────────────────────────────────────────┐
  │  Domain Models   (Pydantic)  — typed contracts for all I/O      │
  │  IntegrityEngine (OOP)       — deterministic signal scorer      │
  │  BehavioralAnalyzer (OOP)    — LLM narrative from signals       │
  │  ReportLLMClient (OOP)       — singleton AsyncOpenAI + retry    │
  │  LangGraph Pipeline          — fan-out DAG: 3 nodes, 2 parallel │
  │  Public API                  — generate_interview_report()      │
  │                                generate_interview_summary()     │
  └─────────────────────────────────────────────────────────────────┘

LangGraph execution order:
  [signals]  →  [llm_calls + behavioral]  →  [assemble + persist]
      ↑                    ↑                          ↑
  deterministic        parallel asyncio.gather    writes to DB

DSA choices:
  - Counter (O(n)) for signal aggregation          — no nested loops
  - frozenset for tool-keyword noise filter        — O(1) membership
  - dict.fromkeys for ordered dedup                — O(n), stable order
  - heapq / sorted with key for topic ranking      — O(n log n)
  - all state is TypedDict (structural subtyping)  — zero runtime overhead

OOP choices:
  - IntegrityEngine: encapsulates weight tables + scoring formula
  - BehavioralAnalyzer: encapsulates prompt builder + LLM call
  - ReportLLMClient: singleton pattern, exponential retry, streaming
  - LLMCallSpec: dataclass — immutable call descriptor passed to client
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Literal, Optional

from langgraph.graph import END, StateGraph
from openai import AsyncOpenAI
from pydantic import BaseModel, Field, field_validator
from typing_extensions import TypedDict

from interview.agent_utils import truncate_to_tokens
from interview.agent_runtime_support import LLM_MODEL, logger, DATABASE_URL

# ---------------------------------------------------------------------------
# Re-import DB pool from persistence layer (no circular dep — persistence
# does NOT import report_pipeline)
# ---------------------------------------------------------------------------
from interview.agent_persistence import DatabasePool
from billing.billing import record_external_billing_usage as _persist_billing

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 1 — Domain Models (Pydantic)
# All LLM response shapes and shared data contracts live here.
# ═══════════════════════════════════════════════════════════════════════════════

class LLMEvalDimension(BaseModel):
    score:    int = Field(default=0, ge=0, le=100)
    evidence: str = ""

    @field_validator("score", mode="before")
    @classmethod
    def _clamp(cls, v: Any) -> int:
        try:
            return max(0, min(100, int(round(float(v)))))
        except (TypeError, ValueError):
            return 0


class LLMEvalResponse(BaseModel):
    communication:        LLMEvalDimension = Field(default_factory=LLMEvalDimension)
    technical_knowledge:  LLMEvalDimension = Field(default_factory=LLMEvalDimension)
    resume_credibility:   LLMEvalDimension = Field(default_factory=LLMEvalDimension)
    problem_solving:      LLMEvalDimension = Field(default_factory=LLMEvalDimension)
    clarity_of_thought:   LLMEvalDimension = Field(default_factory=LLMEvalDimension)
    strengths:            list[str] = Field(default_factory=list)
    concerns:             list[str] = Field(default_factory=list)


class LLMSkillEntry(BaseModel):
    skill:    str = ""
    score:    int = Field(default=5, ge=1, le=10)
    evidence: str = ""

    @field_validator("score", mode="before")
    @classmethod
    def _clamp(cls, v: Any) -> int:
        try:
            return max(1, min(10, int(round(float(v)))))
        except (TypeError, ValueError):
            return 5


class LLMSkillsResponse(BaseModel):
    skills: list[LLMSkillEntry] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — LangGraph State
# TypedDict = zero runtime cost, full static typing, LangGraph-native.
# ═══════════════════════════════════════════════════════════════════════════════

class ReportState(TypedDict, total=False):
    # ── Inputs ──────────────────────────────────────────────────────────────
    app_id:            str
    transcript_lines:  list[str]
    interview_scores:  list[dict]   # warmup filtered out before graph entry
    all_scores:        list[dict]
    job_title:         str
    proctoring_data:   dict | None
    org_id:            str | None
    llm_model:         str
    jd_json:           dict | None
    topic_records:     list[dict]   # per-topic MOVE_ON ground-truth from agent
    # ── Computed by node: signals ────────────────────────────────────────────
    integrity_result:  dict
    signal_context:    str
    jd_context:        str
    behavioral_signals: list[dict]
    # ── Computed by node: llm_calls ─────────────────────────────────────────
    eval_result:       LLMEvalResponse
    skills_result:     LLMSkillsResponse
    behavioral_analysis: dict
    # ── Final output ─────────────────────────────────────────────────────────
    scores_context:    dict | None


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 3 — IntegrityEngine (OOP + DSA)
#
# Encapsulates signal weight tables and the O(n) weighted scoring formula.
# frozenset for O(1) membership, Counter for O(n) aggregation.
# ═══════════════════════════════════════════════════════════════════════════════

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
        "face_absence":      -15.0,
        "multiple_faces":    -25.0,
        "camera_disabled":   -15.0,
        "microphone_disabled": -8.0,
        "identity_mismatch": -20.0,
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
            name = str(evt.get("signal_name") or evt.get("event") or "").strip()
            if name:
                counts[name] += 1

        score: float = 100.0
        fired: list[str] = []

        for sig, count in counts.items():
            if sig in cls._NEG_KEYS:
                score += cls._NEG[sig] * min(count, 3)
                fired.append(sig)
                score += cls._POS[sig]

        final = max(0, min(100, int(round(score))))
        band  = "HIGH" if final >= 80 else "MODERATE" if final >= 55 else "LOW"
        return {
            "score":        final,
            "band":         band,
            "signals_used": fired,
            "methodology":  "signal_weighted_deterministic",
        }


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 4 — SkillFilter (DSA)
#
# O(n) dedup with frozenset noise filter. Keeps only domain-level skill names,
# strips single-word tools/libraries that add no signal to the report.
# ═══════════════════════════════════════════════════════════════════════════════

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
        for topic in (str(s).strip() for s in raw if str(s).strip()):
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


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 5 — ReportLLMClient (OOP singleton + retry)
#
# Single AsyncOpenAI instance reused across all calls (avoids cold HTTP setup).
# Exponential backoff on transient errors. Streaming with usage capture.
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class LLMCallSpec:
    """Immutable descriptor for a single LLM call. Passed to ReportLLMClient."""
    system:          str
    user:            str
    max_tokens:      int
    timeout:         float
    response_format: dict
    call_type:       str
    temperature:     float       = 0.0
    org_id:          str        = ""
    app_id:          str        = ""
    prediction:      dict | None = None
    llm_model:       str        = LLM_MODEL


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

        for attempt, delay in enumerate((*self._RETRY_DELAYS, None), start=1):
            try:
                chunks: list[str] = []
                usage_data = None
                kwargs: dict[str, Any] = dict(
                    model=spec.llm_model,
                    temperature=spec.temperature,
                    max_tokens=spec.max_tokens,
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
                        {"role": "system", "content": spec.system},
                        {"role": "user",   "content": spec.user},
                    ],
                )
                if spec.prediction:
                    kwargs["prediction"] = spec.prediction

                async with asyncio.timeout(spec.timeout):
                    stream = await self.client.chat.completions.create(**kwargs)
                    async for chunk in stream:
                        if chunk.choices and chunk.choices[0].delta.content:
                            chunks.append(chunk.choices[0].delta.content)
                        if getattr(chunk, "usage", None):
                            usage_data = chunk.usage

                raw = "".join(chunks).strip()
                if not raw:
                    raise ValueError(f"[{spec.call_type}] empty LLM response")
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

        raise last_exc  # type: ignore[misc]

    @staticmethod
    def usage_dict(u: Any, model: str) -> dict:
        """Extract token counts — delegates to billing.extract_usage()."""
        from billing.billing import extract_usage  # noqa: PLC0415
        return extract_usage(u, model)


# Module-level singleton — instantiated once, reused for all calls.
_llm = ReportLLMClient()


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 6 — BehavioralAnalyzer (OOP)
#
# Encapsulates the signal-analysis prompt builder and LLM call.
# Moved here from behavioral_analysis.py — no external dependency needed.
# ═══════════════════════════════════════════════════════════════════════════════

class BehavioralAnalyzer:
    """Generates 4 plain-English behavioral analysis points for the HR team.

    Accepts per-turn behavioral signals (ownership_ambiguity, depth_decay, etc.)
    and the Q&A log, and returns grounded recruiter-readable observations.
    """

    _SYSTEM = (
        "You are a senior technical recruiter writing a post-interview brief that a hiring "
        "manager will read in 30 seconds to decide whether to move this candidate forward.\n\n"
        "You have full access to:\n"
        "  - The complete interview transcript\n"
        "  - BEHAVIORAL SIGNALS: patterns the AI detected turn-by-turn\n"
        "  - Every Q&A with per-dimension scores\n\n"
        "Write exactly 4 points. Each point covers ONE specific thing — a strength, a gap, "
        "or a behavioral pattern.\n\n"
        "RULES:\n"
        "1. Every point must name the specific topic or question it is about.\n"
        "2. Include what the candidate actually said or did — quote a phrase or describe the exact behavior.\n"
        "3. If behavioral signals fired repeatedly on the same topic, name the pattern.\n"
        "4. If the candidate struggled: say what broke down.\n"
        "5. If they were strong: say what made it strong.\n"
        "6. NEVER write generic sentences that could apply to any candidate.\n"
        "7. Do NOT mention score numbers or dimension names.\n\n"
        'Output ONLY a JSON array of exactly 4 strings. No wrapper, no markdown.\n'
        '["Point one.", "Point two.", "Point three.", "Point four."]'
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
        llm_model: str = LLM_MODEL,
        org_id:    str = "",
        app_id:    str = "",
    ) -> tuple[dict, list[dict]]:
        """Returns ({"points": [...]}, [usage_dict, ...])."""
        if not os.environ.get("OPENAI_API_KEY"):
            logger.warning("[BEHAVIORAL] Skipping: missing OPENAI_API_KEY")
            return {"points": []}, []

        user = self._build_user(transcript_lines, answer_scores, duration_sec, behavioral_signals)
        spec = LLMCallSpec(
            system=self._SYSTEM,
            user=user,
            max_tokens=1000,
            timeout=45.0,
            response_format={"type": "text"},
            call_type="behavioral_analysis",
            temperature=0.2,
            org_id=org_id,
            app_id=app_id,
            llm_model=llm_model,
        )
        try:
            raw, usage = await _llm.call(spec)
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    points = [str(p).strip() for p in parsed if p]
                elif isinstance(parsed, dict):
                    points = [str(v).strip() for v in parsed.values() if v]
                else:
                    points = []
            except Exception:
                points = [
                    l.strip().lstrip("-•").strip()
                    for l in raw.splitlines()
                    if len(l.strip()) > 20
                ]
            result = {"points": points[:5]}
            logger.info(
                "[BEHAVIORAL] %d points | signals=%d tokens=%d+%d",
                len(result["points"]),
                len(behavioral_signals),
                _llm.usage_dict(usage, llm_model)["inputTokens"],
                _llm.usage_dict(usage, llm_model)["outputTokens"],
            )
            return result, [_llm.usage_dict(usage, llm_model)]
        except Exception as e:
            logger.error("[BEHAVIORAL] LLM call failed: %s", e, exc_info=True)
            return {"points": []}, []


_behavioral_analyzer = BehavioralAnalyzer()


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 7 — Static LLM Prompts + JSON Schemas
#
# System prompts are byte-identical on every call → prompt cache hits.
# Compact field names (cm/tk/rc/ps/ct) reduce output tokens by ~30%.
# ═══════════════════════════════════════════════════════════════════════════════

_EVAL_SYSTEM = """You are a senior recruiter and talent evaluator reviewing a complete AI-conducted interview.
---
STEP 1 — BEFORE YOU SCORE ANYTHING, read the entire transcript and form these opinions:
"str": Every genuine strength you observed — written like you're telling a colleague what stood out.
  - Name the specific moment, tool, question, or answer. Not "good communicator" — but "walked through the Zapier workflow trigger-to-action without being prompted."
  - If nothing genuine stands out, return an empty array. Do NOT invent. Do NOT pad.
  - No floor. Zero is honest. Four is the max.
  - Each item is ONE sentence. Sharp. Specific. Could not apply to any other candidate.
"con": Every genuine concern — written with the same directness you'd use in a debrief call.
  - If they contradicted their resume, name what they claimed and what they couldn't explain.
  - If they went blank on a follow-up, say which topic.
  - If every answer was surface-level with no depth, say that.
  - No floor. Zero means no concerns. Four is the max.
  - Do NOT soften. Do NOT hedge.
---
STEP 2 — SCORE exactly 5 dimensions. For each produce:
- "s": integer 0-100
- "ev": ONE sentence — written like a recruiter's verbal note. Must name something SPECIFIC from this interview.
SCORING PHILOSOPHY:
- Do NOT inflate. Weak candidate = weak scores. Use the full 0-100 range.
- Refused to answer / went blank / pure filler → 0-20.
- Textbook answer, no personal evidence → 21-45.
- 76-100 only when there is real, verifiable, specific depth in the transcript.
DIMENSION 1 — cm (communication, weight 15%)
Score: How clearly and confidently did they express themselves across the ENTIRE interview?
  0-20: Incomprehensible — constant restarts
  21-45: Frequently unclear — hedged, lost the point mid-answer
  46-65: Passable — mostly followable, inconsistent
  66-80: Good — clear and direct, minor slips
  81-100: Excellent — precise, structured, confident under every challenge
DIMENSION 2 — tk (technical_knowledge, weight 30%)
Score: Did they show REAL hands-on knowledge — or just vocabulary?
  0-20: Nothing — repeated the question or went silent
  21-45: Surface — knows terms, can't explain mechanics
  46-65: Partial — real in 1-2 areas, weak elsewhere
  66-80: Solid — concrete examples, named tools, process explained
  81-100: Deep — specific details, real numbers, step-by-step, held every probe
DIMENSION 3 — rc (resume_credibility, weight 20%)
Score: Did their live answers hold up against their resume claims?
  0-20: Claims completely unsupported — couldn't explain their own experience
  21-45: Significant gaps — most items vague or contradicted under probing
  46-65: Mixed — some held, some fell apart
  66-80: Credible — most backed with real detail, minor gaps
  81-100: Fully credible — every claim explained with evidence, nothing contradicted
DIMENSION 4 — ps (problem_solving, weight 25%)
Score: Can they think through a problem — or do they recite answers?
  0-20: No reasoning — restated facts, silent on follow-ups
  21-45: Facts only — no structure, no tradeoff thinking
  46-65: Some structure — basic answers, fell apart under pressure
  66-80: Logical — named tradeoffs, handled probes clearly
  81-100: Sophisticated — framed independently, named tradeoffs unprompted
DIMENSION 5 — ct (clarity_of_thought, weight 10%)
Score: Was their thinking organized — or did they dump everything and hope?
  0-20: Stream of consciousness — no clear point in any answer
  21-45: Frequently drifted — missed what was actually asked
  46-65: Inconsistent — structured sometimes, scattered in others
  66-80: Clear — most answers structured, minor drift
  81-100: Sharp — framed every answer, landed a clear point
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
                "cm":  {"type": "object", "properties": {"s": {"type": "integer"}, "ev": {"type": "string"}}, "required": ["s", "ev"], "additionalProperties": False},
                "tk":  {"type": "object", "properties": {"s": {"type": "integer"}, "ev": {"type": "string"}}, "required": ["s", "ev"], "additionalProperties": False},
                "rc":  {"type": "object", "properties": {"s": {"type": "integer"}, "ev": {"type": "string"}}, "required": ["s", "ev"], "additionalProperties": False},
                "ps":  {"type": "object", "properties": {"s": {"type": "integer"}, "ev": {"type": "string"}}, "required": ["s", "ev"], "additionalProperties": False},
                "ct":  {"type": "object", "properties": {"s": {"type": "integer"}, "ev": {"type": "string"}}, "required": ["s", "ev"], "additionalProperties": False},
            },
            "required": ["str", "con", "cm", "tk", "rc", "ps", "ct"],
            "additionalProperties": False,
        },
    },
}

_SKILLS_FROM_RECORDS_SYSTEM = """You are writing a technical skill breakdown for the hiring team after an interview.
You will receive structured topic records captured by the interviewer at the moment each topic was closed.

YOUR JOB: Group everything the candidate demonstrated into DOMAIN CATEGORIES, not individual topics.
Use these category names (pick only those relevant to the role and what was actually discussed):
  Frontend, Backend, APIs & Integrations, Databases, DevOps & Infrastructure, Cloud, Mobile,
  Data & Analytics, AI/ML, System Design, Testing & QA, Security, Product & Domain Knowledge,
  Leadership & Process, Communication & Clarity

For each category:
- score: 1-10 based on how well the candidate demonstrated knowledge ACROSS all topics in that category
- evidence: ONE sharp sentence quoting or closely paraphrasing something specific they said

SCORING RULES (1-10):
- Base: avg_overall of topics mapped to this category
- Penalties: explicit_denial in any topic → cap category at 3, dry_topic → cap at 4, weak_exit → deduct 1
- Strong probe handling (probe_count <= 1, avg_overall >= 7) → add 0.5
- Round to nearest integer, clamp 1-10
- Only include categories where you have real evidence from the transcript

OUTPUT ONLY valid JSON matching the schema exactly. No markdown."""

_SKILLS_QA_SYSTEM = """You are writing a technical skill breakdown for the hiring team after an interview.
You will receive every question-answer pair with pre-scored dimensions (clarity, depth, specificity, grounding — each 0-10).

YOUR JOB: Group what the candidate demonstrated into DOMAIN CATEGORIES — not individual topics or tools.
Use these category names (pick only those relevant to the role and what was actually discussed):
  Frontend, Backend, APIs & Integrations, Databases, DevOps & Infrastructure, Cloud, Mobile,
  Data & Analytics, AI/ML, System Design, Testing & QA, Security, Product & Domain Knowledge,
  Leadership & Process, Communication & Clarity

For each category:
- score: 1-10 based on how well the candidate demonstrated that domain across all relevant Q&As
- evidence: ONE sharp sentence quoting or closely paraphrasing something specific they said

SCORING (1-10): base = avg(clarity, depth, specificity, grounding) for Q&As in that category.
Adjust UP for specific details/numbers, DOWN for vague answers or "I don't know". Clamp 1-10.
Only include categories where the candidate actually spoke about something in that domain.

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
                            "skill":    {"type": "string"},
                            "score":    {"type": "integer"},
                            "evidence": {"type": "string"},
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

_SUMMARY_SYSTEM = """You are a senior talent partner writing a confidential post-interview brief for the hiring team.
Write 3-5 bullet points. Each bullet is ONE clear sentence.
Rules for what to cover:
- Cover only what actually mattered in THIS interview.
- If they were strong in one specific area, name it with the exact thing they said or did.
- If they were weak across the board, all bullets can be negative.
- If integrity was flagged, name it explicitly.
- Do NOT write a bullet for every dimension.
Rules for how to write:
- Sound like a recruiter giving a verbal debrief, not a bot.
- Never write a sentence that could apply to any other candidate.
- No scores, no numbers, no percentages.
- No softening negative findings.
- Never invent positives not in the evidence.
- Never use gender-biased language.
- Each bullet starts with a dash (-).
OUTPUT ONLY the bullet points. No markdown fences. No extra text."""

_VERDICT_SYSTEM = """You are a senior hiring manager writing a final verdict for an interview.
Write ONE paragraph. 80-120 words. No more.
Rules:
- Start with exactly one of: STRONG HIRE / HIRE / MAYBE / REJECT — then a colon, then your reasoning.
- Name the single strongest signal and the single biggest concern — from the evidence, not generic.
- End with exactly one action sentence: what should happen next.
- No scores, no numbers, no hedging. Strong opinion, accountable.
- Write like you are telling the hiring manager face to face.
OUTPUT ONLY the paragraph. No markdown fences. No extra text."""


def _parse_eval_compact(raw: str) -> LLMEvalResponse:
    """Map compact field names (cm/tk/rc/ps/ct) back to full LLMEvalResponse model."""
    data = json.loads(raw)

    def _dim(key: str) -> LLMEvalDimension:
        d = data.get(key, {})
        return LLMEvalDimension(score=d.get("s", 0), evidence=d.get("ev", ""))

    return LLMEvalResponse(
        communication=_dim("cm"),
        technical_knowledge=_dim("tk"),
        resume_credibility=_dim("rc"),
        problem_solving=_dim("ps"),
        clarity_of_thought=_dim("ct"),
        strengths=list(data.get("str", [])),
        concerns=list(data.get("con", [])),
    )


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 8 — LangGraph Nodes
#
# Node execution order:
#   signals  →  llm_calls (eval + skills + behavioral in parallel)  →  assemble
#
# All three parallel tasks inside llm_calls run under asyncio.gather — no
# sequential blocking. DB write happens only in assemble.
# ═══════════════════════════════════════════════════════════════════════════════

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
            pool = await DatabasePool.get()
            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    'SELECT "integritySignals" FROM "Interview" WHERE "applicationId" = $1 LIMIT 1',
                    app_id,
                )
            if row and row["integritySignals"]:
                raw = row["integritySignals"]
                parsed = raw if isinstance(raw, list) else (
                    json.loads(raw) if isinstance(raw, str) else []
                )
                browser_events = [e for e in (parsed or []) if isinstance(e, dict)]
                # Normalize eventType → signal_name
                for ev in browser_events:
                    if "eventType" in ev and "signal_name" not in ev:
                        ev["signal_name"] = ev["eventType"]
                logger.info(
                    "[REPORT] %d browser integrity signals for %s",
                    len(browser_events), app_id,
                )
        except Exception as e:
            logger.warning("[REPORT] integritySignals fetch failed for %s: %s", app_id, e)

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
    jd_context = (
        "JOB DESCRIPTION:\n" + json.dumps(jd_json, ensure_ascii=False)[:2000]
        if jd_json else "No JD provided — assess based on role title only."
    )

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
    llm_model        = state.get("llm_model", LLM_MODEL)
    job_title        = state.get("job_title", "")
    org_id           = state.get("org_id") or ""
    app_id           = state.get("app_id", "")
    integrity_result = state["integrity_result"]
    all_scores       = state.get("all_scores", [])
    topic_records    = state.get("topic_records") or []
    behavioral_signals = state.get("behavioral_signals", [])
    transcript_lines = state.get("transcript_lines", [])
    interview_scores = state.get("interview_scores", [])

    # Build eval user prompt (dynamic vars → user msg, system is static)
    lines_to_use  = transcript_lines[4:] if len(transcript_lines) > 4 else transcript_lines
    transcript_text = truncate_to_tokens("\n".join(lines_to_use), 3500)
    eval_user = (
        f"Role: {job_title}\n"
        f"JD Context: {state['jd_context']}\n"
        f"Integrity Score: {integrity_result['score']}/100 ({integrity_result['band']})\n"
        f"Behavioral flags: {state['signal_context']}\n\n"
        f"Full Interview Transcript:\n{transcript_text}"
    )

    # Build skills user prompt — prefer rich topic_records over raw QA fallback
    if topic_records:
        records_lines: list[str] = []
        for i, rec in enumerate(topic_records, 1):
            sc = rec.get("scores", {})
            answers_text = " | ".join(rec.get("candidate_answers", [])[:4]) or "No answers recorded."
            tech = ", ".join(rec.get("tech_skills", [])) or "—"
            records_lines.append(
                f"[TOPIC {i}]\n"
                f"topic: {rec.get('topic', '')}\ntopic_type: {rec.get('topic_type', 'project')}\n"
                f"exit_reason: {rec.get('exit_reason', 'unknown')}\nprobe_count: {rec.get('probe_count', 0)}\n"
                f"avg_overall: {sc.get('avg_overall', 0):.1f}\navg_depth: {sc.get('avg_depth', 0):.1f}\n"
                f"last_specificity: {sc.get('last_specificity', 0):.1f}\n"
                f"last_grounding: {sc.get('last_grounding', 0):.1f}\n"
                f"tech_skills: {tech}\ndenied: {rec.get('denied', False)}\n"
                f"candidate_answers: {answers_text}\n"
            )
        skills_system = _SKILLS_FROM_RECORDS_SYSTEM
        skills_user   = f"Role: {job_title}\n\n" + "\n".join(records_lines)
        logger.info("[REPORT] Skills: anchored topic_records path (%d topics)", len(topic_records))
    else:
        qa_items = [
            s for s in all_scores
            if not s.get("is_warmup", False) and (s.get("question") or s.get("ai_question"))
        ]
        qa_lines: list[str] = []
        for i, s in enumerate(qa_items, 1):
            sb = s.get("score_breakdown") or {}
            qa_lines.append(
                f"Q{i}: {s.get('question') or s.get('ai_question', '')}\n"
                f"A: {s.get('answer') or s.get('candidate_answer', '')}\n"
                f"[clarity={sb.get('clarity', s.get('clarity', 0))} "
                f"depth={sb.get('depth', s.get('depth', 0))} "
                f"specificity={sb.get('specificity', s.get('specificity', 0))} "
                f"grounding={sb.get('grounding', s.get('grounding', 0))}]"
            )
        skills_system = _SKILLS_QA_SYSTEM
        skills_user = (
            f"Role: {job_title}\n\n" + "\n".join(qa_lines)
            if qa_lines else f"Role: {job_title}\n\nNo interview questions found."
        )
        logger.info("[REPORT] Skills: falling back to QA-block path")

    # Duration for behavioral analysis
    _total_turns   = len(interview_scores)
    session_duration = int(
        (state.get("proctoring_data") or {}).get("session_duration")
        or _total_turns * 90
    )

    # Predicted Outputs prefix for eval — skips generating fixed header tokens
    eval_prediction = {"type": "content", "content": '{"str":[],"con":[],"cm":{"s":'}

    # ── Run all 3 LLM calls in parallel ────────────────────────────────────
    (eval_raw, eval_usage), (skills_raw, skills_usage), (behavioral_result, beh_usages) = (
        await asyncio.gather(
            _llm.call(LLMCallSpec(
                system=_EVAL_SYSTEM,
                user=eval_user,
                max_tokens=900,
                timeout=45.0,
                response_format=_EVAL_JSON_SCHEMA,
                call_type="report_eval",
                org_id=org_id,
                app_id=app_id,
                prediction=eval_prediction,
                llm_model=llm_model,
            )),
            _llm.call(LLMCallSpec(
                system=skills_system,
                user=skills_user,
                max_tokens=700,
                timeout=45.0,
                response_format=_SKILLS_JSON_SCHEMA,
                call_type="report_skills",
                org_id=org_id,
                app_id=app_id,
                llm_model=llm_model,
            )),
            _behavioral_analyzer.analyze(
                transcript_lines=transcript_lines,
                answer_scores=interview_scores,
                duration_sec=session_duration,
                behavioral_signals=behavioral_signals,
                llm_model=llm_model,
                org_id=org_id,
                app_id=app_id,
            ),
        )
    )

    # Persist billing for all 3 calls concurrently
    if org_id:
        billing_tasks = [
            _persist_billing(
                org_id, "interviewReport", _llm.usage_dict(eval_usage, llm_model)
            ),
            _persist_billing(
                org_id, "interviewReport", _llm.usage_dict(skills_usage, llm_model)
            ),
            *[
                _persist_billing(org_id, "interviewReport", bu)
                for bu in beh_usages
            ],
        ]
        await asyncio.gather(*billing_tasks)

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
        "[REPORT] LLM done: app=%s comm=%d tech=%d cred=%d ps=%d cot=%d skills=%d behavioral=%d",
        app_id,
        eval_result.communication.score, eval_result.technical_knowledge.score,
        eval_result.resume_credibility.score, eval_result.problem_solving.score,
        eval_result.clarity_of_thought.score, len(skills_result.skills),
        len(behavioral_result.get("points", [])),
    )
    return {
        "eval_result":        eval_result,
        "skills_result":      skills_result,
        "behavioral_analysis": behavioral_result,
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

    # Dimension scores
    comm = eval_result.communication.score
    tech = eval_result.technical_knowledge.score
    cred = eval_result.resume_credibility.score
    ps   = eval_result.problem_solving.score
    cot  = eval_result.clarity_of_thought.score

    overall_score = max(0, min(100, int(round(
        comm * 0.15 + tech * 0.30 + cred * 0.20 + ps * 0.25 + cot * 0.10
    ))))

    skill_ratings_list = [
        {"skill": r.skill, "score": r.score, "evidence": r.evidence}
        for r in skills_result.skills
        if r.skill
    ]
    skills_evaluated = [r["skill"] for r in skill_ratings_list]

    proctoring_events = proctoring_data.get("events", [])

    # signalAnalysis column: LLM narrative + both signal lists clearly separated
    signal_analysis = {
        "points":             behavioral_analysis.get("points", []),
        "behavioral_signals": behavioral_signals,
        "proctoring_events":  proctoring_events,
    }

    score_breakdown_report = {
        "dimensions": [
            {"name": "Communication",               "score": comm, "evidence": eval_result.communication.evidence},
            {"name": "Technical & Subject Knowledge","score": tech, "evidence": eval_result.technical_knowledge.evidence},
            {"name": "Resume Credibility",          "score": cred, "evidence": eval_result.resume_credibility.evidence},
            {"name": "Problem Solving",             "score": ps,   "evidence": eval_result.problem_solving.evidence},
            {"name": "Clarity of Thought",          "score": cot,  "evidence": eval_result.clarity_of_thought.evidence},
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
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            # Update Interview table with scores
            await conn.execute(
                """UPDATE "Interview"
                   SET "scoreBreakdown"    = $1,
                       "skillRatings"      = $2,
                       "signalAnalysis"    = $3,
                       "interviewSummary"  = $4
                   WHERE "applicationId"  = $5""",
                json.dumps(score_breakdown_report),
                json.dumps(skill_ratings_list),
                json.dumps(signal_analysis),
                json.dumps(interview_summary_report),
                app_id,
            )

        logger.info(
            "[REPORT] Written: app=%s overall=%d comm=%d tech=%d cred=%d ps=%d cot=%d "
            "integrity=%d skills=%d behavioral_points=%d",
            app_id, overall_score, comm, tech, cred, ps, cot,
            integrity_result["score"], len(skills_evaluated),
            len(behavioral_analysis.get("points", [])),
        )
    except Exception as e:
        logger.error("[REPORT] DB write failed for %s: %s", app_id, e, exc_info=True)

    scores_context = {
        "overall":             overall_score,
        "communication":       comm,
        "technical_knowledge": tech,
        "resume_credibility":  cred,
        "problem_solving":     ps,
        "clarity_of_thought":  cot,
        "integrity_score":     integrity_result["score"],
        "integrity_band":      integrity_result["band"],
        "skills_evaluated":    skills_evaluated,
        "signal_summary":      state.get("signal_context", "none"),
        "dimensions":          score_breakdown_report["dimensions"],
        "skill_ratings":       skill_ratings_list,
        "strengths":           eval_result.strengths,
        "concerns":            eval_result.concerns,
    }
    return {"scores_context": scores_context}


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 9 — LangGraph Pipeline (compiled once at module load)
#
# Graph topology:
#   signals ──► llm_calls ──► assemble ──► END
#
# Compiled at module load — no rebuild per request. LangGraph's compiled graph
# is coroutine-safe and can be ainvoked concurrently from multiple sessions.
# ═══════════════════════════════════════════════════════════════════════════════

def _build_report_graph() -> Any:
    builder = StateGraph(ReportState)
    builder.add_node("signals",   _node_signals)
    builder.add_node("llm_calls", _node_llm_calls)
    builder.add_node("assemble",  _node_assemble)
    builder.set_entry_point("signals")
    builder.add_edge("signals",   "llm_calls")
    builder.add_edge("llm_calls", "assemble")
    builder.add_edge("assemble",  END)
    return builder.compile()


_REPORT_GRAPH = _build_report_graph()


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 10 — Public API
# ═══════════════════════════════════════════════════════════════════════════════

async def generate_interview_report(
    app_id:          str,
    transcript_lines: list,
    answer_scores:   list,
    job_title:       str,
    proctoring_data: Optional[dict] = None,
    org_id:          Optional[str]  = None,
    llm_model:       str            = LLM_MODEL,
    jd_json:         Optional[dict] = None,
    topic_records:   Optional[list] = None,
) -> Optional[dict]:
    """Run the full report pipeline.

    Returns scores_context dict (input to generate_interview_summary), or None
    on failure. Caller should run generate_interview_summary() afterwards.
    """
    if not transcript_lines or not DATABASE_URL:
        logger.warning("[REPORT] Skipping: missing transcript or DATABASE_URL")
        return None
    if not os.environ.get("OPENAI_API_KEY"):
        logger.warning("[REPORT] Skipping: missing OPENAI_API_KEY")
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
        "llm_model":        llm_model,
        "jd_json":          jd_json,
        "topic_records":    topic_records or [],
    }
    try:
        final_state = await _REPORT_GRAPH.ainvoke(initial_state)
        return final_state.get("scores_context")
    except asyncio.TimeoutError as e:
        logger.error("[REPORT] Timed out for %s: %s", app_id, e)
        return None
    except Exception as e:
        logger.error("[REPORT] Pipeline failed for %s: %s", app_id, e, exc_info=True)
        return None


async def generate_interview_summary(
    app_id:          str,
    transcript_lines: list,
    job_title:       str,
    org_id:          Optional[str]  = None,
    llm_model:       str            = LLM_MODEL,
    scores_context:  Optional[dict] = None,
) -> None:
    """Generate summary bullets + verdict and write to Interview.interviewSummary.

    Runs summary and verdict LLM calls in parallel. Does NOT use the full
    transcript — only the structured scores_context, for faster, cheaper calls.
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
            f"  {s['skill']} ({s['score']}/10): {s.get('evidence', '').strip()}"
            for s in skills[:12]
        )
        if skills else "  Not available"
    )

    strengths = ctx.get("strengths", [])
    concerns  = ctx.get("concerns", [])
    strengths_block = "\n".join(f"  - {s}" for s in strengths) if strengths else "  None identified"
    concerns_block  = "\n".join(f"  - {c}" for c in concerns)  if concerns  else "  None flagged"

    shared_user = (
        f"Role: {job_title}\n"
        f"Integrity: {integrity_band} ({integrity_score}/100)\n"
        f"Behavioral signals: {signal_summary}\n\n"
        f"DIMENSION SCORES + EVIDENCE:\n{dimension_block}\n\n"
        f"SKILL BREAKDOWN:\n{skill_block}\n\n"
        f"STRENGTHS OBSERVED:\n{strengths_block}\n\n"
        f"CONCERNS FLAGGED:\n{concerns_block}"
    )

    try:
        (summary_text, summary_usage), (verdict_text, verdict_usage) = await asyncio.gather(
            _llm.call(LLMCallSpec(
                system=_SUMMARY_SYSTEM,
                user=shared_user,
                max_tokens=500,
                timeout=60.0,
                response_format={"type": "text"},
                temperature=0.1,
                call_type="report_summary",
                org_id=org_id or "",
                app_id=app_id,
                llm_model=llm_model,
            )),
            _llm.call(LLMCallSpec(
                system=_VERDICT_SYSTEM,
                user=shared_user,
                max_tokens=200,
                timeout=60.0,
                response_format={"type": "text"},
                temperature=0.1,
                call_type="report_verdict",
                org_id=org_id or "",
                app_id=app_id,
                llm_model=llm_model,
            )),
        )

        if org_id:
            await asyncio.gather(
                _persist_billing(
                    org_id, "interviewReport", _llm.usage_dict(summary_usage, llm_model)
                ),
                _persist_billing(
                    org_id, "interviewReport", _llm.usage_dict(verdict_usage, llm_model)
                ),
            )

        if not summary_text and not verdict_text:
            logger.warning("[SUMMARY] Both outputs empty for %s — skipping save", app_id)
            return

        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE "Interview"
                   SET "interviewSummary" = COALESCE("interviewSummary", '{}') || $1::jsonb
                   WHERE "applicationId"  = $2""",
                json.dumps({"summary": summary_text, "decision_note": verdict_text}),
                app_id,
            )
        logger.info("[SUMMARY] Written summary + verdict for %s", app_id)

    except asyncio.TimeoutError:
        logger.warning("[SUMMARY] Timed out for %s", app_id)
    except Exception as e:
        logger.error("[SUMMARY] Failed for %s: %s", app_id, e, exc_info=True)
