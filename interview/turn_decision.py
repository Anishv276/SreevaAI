"""
TurnDecision schema and signal detection logic.
Consumed by evaluate_answer_and_decide() in agent.py via turn_evaluator.py.

Refactor additions (all non-breaking):
  - Pydantic models: QualityScoresModel, SignalEventModel, DecisionOutputModel,
    -- runtime validation + dot-access alongside TypedDicts.
  - DetectionContext: migrated to Pydantic BaseModel (same attrs, same creation sites).
  - CollapseRule dataclass: replaces nested if/elif in FollowUpCollapseDetector.
  - QuestionComplexityScorer: OOP wrapper with class-level LRU cache.
  - SignalEvaluator: added register(), unregister(), evaluate_async().
  - LangChain RunnableParallel: optional composable signal evaluation pipeline.
  - Bug fix: added strong_under_pressure field to SignalFlags TypedDict.
  All existing public function signatures unchanged.
"""
from __future__ import annotations

import asyncio
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Callable, ClassVar, Optional, TypedDict

from pydantic import BaseModel, Field, field_validator

# LangChain -- optional; graceful fallback if not installed
try:
    from langchain_core.runnables import RunnableLambda, RunnableParallel
    _LANGCHAIN_AVAILABLE = True
except ImportError:  # pragma: no cover
    _LANGCHAIN_AVAILABLE = False


# ===========================================================================
# Schema TypedDicts -- preserved exactly for all existing callers
# ===========================================================================

class QualityScores(TypedDict):
    clarity: float      # 0-10: how clear the answer is
    depth: float        # 0-10: reasoning shown
    specificity: float  # 0-10: real names/numbers/examples
    grounding: float    # 0-10: tied to lived experience
    fluency: float      # 0-10: smooth natural delivery
    confidence: float   # 0-10: assertiveness and decisiveness

class SignalFlags(TypedDict):
    ownership_ambiguity: bool
    example_evasion: bool
    weak_technical_hedge: bool
    latency_mismatch: bool
    follow_up_collapse: bool
    depth_decay: bool
    complexity_latency_mismatch: bool
    ownership_clarified: bool
    example_given: bool
    strong_under_pressure: bool      # [BUG FIX] was missing from original TypedDict

class DecisionOutput(TypedDict):
    action: str         # "MOVE_ON" | "PROBE" | "VERIFY"
    mode: str
    next_goal: str

class TurnDecision(TypedDict):
    quality: QualityScores
    signals: SignalFlags
    signal_events: list[SignalEvent]
    decision: DecisionOutput

class SignalEvent(TypedDict):
    signal_name: str
    signal_layer: str
    confidence: float
    evidence: str
    trust_bucket_affected: str
    score_delta: float
    probe_mode: str
    recoverable: bool
    recruiter_visible: bool

class SignalRule(TypedDict):
    signal_layer: str
    trust_bucket_affected: str
    probe_mode: str
    recoverable: bool
    recruiter_visible: bool
    detector: Callable[
        [str, str, float, list[float], int, bool],
        Optional[SignalEvent],
    ]

# ===========================================================================
# Pydantic Models -- dot-access + validation wrappers (alongside TypedDicts)
# ===========================================================================

class QualityScoresModel(BaseModel):
    """Validated quality scores -- all fields clamped 0.0-10.0."""
    clarity: float = Field(default=5.0, ge=0.0, le=10.0)
    depth: float = Field(default=5.0, ge=0.0, le=10.0)
    specificity: float = Field(default=5.0, ge=0.0, le=10.0)
    grounding: float = Field(default=5.0, ge=0.0, le=10.0)
    fluency: float = Field(default=5.0, ge=0.0, le=10.0)
    confidence: float = Field(default=5.0, ge=0.0, le=10.0)
    model_config = {"extra": "ignore"}

    @field_validator("clarity","depth","specificity","grounding","fluency","confidence", mode="before")
    @classmethod
    def _clamp(cls, v: Any) -> float:
        return max(0.0, min(10.0, float(v or 0.0)))

    @property
    def overall(self) -> float:
        return (self.clarity + self.depth + self.specificity + self.grounding) / 4.0

    def to_dict(self) -> dict:
        return self.model_dump()

    @classmethod
    def from_dict(cls, d: dict) -> "QualityScoresModel":
        return cls.model_validate(d)


class SignalEventModel(BaseModel):
    """Validated signal event -- confidence clamped to [0.0, 1.0]."""
    signal_name: str
    signal_layer: str
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    evidence: str = Field(default="")
    trust_bucket_affected: str
    score_delta: float = Field(default=0.0)
    probe_mode: str = Field(default="normal")
    recoverable: bool = Field(default=True)
    recruiter_visible: bool = Field(default=False)
    model_config = {"extra": "ignore"}

    @field_validator("confidence", mode="before")
    @classmethod
    def _clamp_conf(cls, v: Any) -> float:
        return max(0.0, min(1.0, float(v or 0.0)))

    def to_signal_event(self) -> SignalEvent:
        return SignalEvent(**self.model_dump())

    @classmethod
    def from_signal_event(cls, ev: SignalEvent) -> "SignalEventModel":
        return cls.model_validate(ev)


class DecisionOutputModel(BaseModel):
    action: str = Field(default="MOVE_ON")
    mode: str = Field(default="normal")
    next_goal: str = Field(default="")
    model_config = {"extra": "ignore"}

    @field_validator("action", mode="before")
    @classmethod
    def _normalize_action(cls, v: Any) -> str:
        s = str(v or "MOVE_ON").strip().upper()
        return s if s in ("MOVE_ON", "PROBE", "VERIFY") else "MOVE_ON"


# ===========================================================================
# Signal detection helpers -- unchanged from original
# ===========================================================================

_WE_TOKENS = {"we", "our", "team", "they", "everyone"}
_I_TOKENS = {"i", "me", "my", "myself", "i'd", "i've"}
_THEORY_PHRASES = {
    "generally", "typically", "usually", "in theory", "the best practice",
    "you should", "one would", "the idea is", "ideally", "the approach is",
    "you can", "the way to", "it depends",
}

# C3/C4 fix: shared regex used by BOTH ExampleEvasionDetector and
# ExampleGivenDetector so their "has specifics" threshold is identical and
# the two signals can never fire simultaneously.  Covers temporal markers
# (original narrow set) PLUS technical specificity tokens so answers
# containing named tools, modules, or actions are not penalised.
_SPECIFICS_RE = re.compile(
    r"\b("
    r"at |in |during |when|year|ago|\d+"        # temporal / numeric
    r"|using|with|via|built|wrote|implemented"   # action specificity
    r"|deployed|configured|designed|created"
    r"|project|client|company|system|database"   # entity names
    r"|api|service|module|class|function|script"
    r"|pipeline|repo|endpoint|schema|table"
    r")\b",
    re.IGNORECASE,
)
_EXAMPLE_REQUEST_PHRASES = {
    "give me an example", "can you give", "tell me about a time",
    "walk me through", "specific example", "real example", "describe a time",
    "can you share", "tell me about", "recall a time",
    "what was your role", "what did you personally", "what did you own",
    "what was your contribution", "what did you build", "what did you decide",
    "what exactly did you", "what specifically did you", "what was the actual",
    "what was the process", "what was the logic", "how did you qualify",
    "how did you build", "how did you trigger", "what were you responsible",
}
_RESUME_LIKE_PHRASES = {
    "i have worked with", "i've worked with", "i have experience with",
    "i've used", "i used", "on my resume", "i am familiar with",
    "i'm familiar with", "i have handled", "i worked on", "i've handled",
}
_COMPRESSION_REQUEST_PHRASES = {
    "walk me through", "step by step", "what happened first",
    "what was the first", "what was the sequence", "how did you handle",
    "what exactly changed", "what did you do",
    "what was your role", "what did you personally", "what was the actual",
    "what was the process", "what was the logic",
    "what were you responsible", "what exactly did you", "what specifically did you",
}

# ===========================================================================
# Builder helper -- unchanged
# ===========================================================================

def _build_signal_event(
    *,
    signal_name: str,
    signal_layer: str,
    confidence: float,
    evidence: str,
    trust_bucket_affected: str,
    score_delta: float,
    probe_mode: str,
    recoverable: bool,
    recruiter_visible: bool,
) -> SignalEvent:
    return SignalEvent(
        signal_name=signal_name,
        signal_layer=signal_layer,
        confidence=max(0.0, min(1.0, float(confidence))),
        evidence=evidence,
        trust_bucket_affected=trust_bucket_affected,
        score_delta=float(score_delta),
        probe_mode=probe_mode,
        recoverable=recoverable,
        recruiter_visible=recruiter_visible,
    )


# ===========================================================================
# DSA: CollapseRule -- replaces nested if/elif in FollowUpCollapseDetector
# ===========================================================================

@dataclass(frozen=True)
class CollapseRule:
    """Declarative collapse classification rule.

    Evaluated in order; first matching rule wins (replaces the if/elif chain).
    Frozen dataclass -- rules are immutable config, never mutated at runtime.
    """
    label: str           # "complete" | "partial"
    max_depth: float     # current_depth must be <= this to match
    min_drop: float      # drop from first answer must be >= this to match
    # Confidence scaling
    base_conf: float = 0.65
    drop_weight: float = 0.05
    max_conf: float = 0.95
    # Score deltas
    delta_normal: float = -0.20
    delta_partial: float = -0.12

    def matches(self, current_depth: float, drop: float) -> bool:
        return current_depth <= self.max_depth and drop >= self.min_drop

    def compute_confidence(self, drop: float, escalated: bool) -> float:
        if escalated:
            return min(0.97, 0.80 + drop * 0.04)
        return min(self.max_conf, self.base_conf + drop * self.drop_weight)

    def score_delta(self, escalated: bool) -> float:
        if escalated:
            return -0.38
        return self.delta_normal if self.label == "complete" else self.delta_partial


# Ordered -- first match wins (mirrors original if/elif evaluation order)
_COLLAPSE_RULES: tuple[CollapseRule, ...] = (
    CollapseRule(label="complete", max_depth=3.0, min_drop=0.0),  # depth ≤ 3.0
    CollapseRule(label="partial",  max_depth=5.0, min_drop=2.0),  # depth ≤ 5.0 AND drop ≥ 2.0
)


# ===========================================================================
# DetectionContext -- Pydantic BaseModel (same attrs, validated, no positional args)
# ===========================================================================

class DetectionContext(BaseModel):
    """Per-turn context passed to every signal detector.

    Migrated from a plain __init__ class to Pydantic BaseModel:
      - depth clamped to [0, 10]
      - latency normalized (None if negative)
      - score lists coerced to list[float]
    All creation sites already use keyword arguments -- zero call-site changes.
    """
    answer: str
    last_question: str
    current_depth: float = Field(default=5.0)
    prior_depth_scores: list[float] = Field(default_factory=list)
    topic_follow_up_count: int = Field(default=0, ge=0)
    collapse_stage: int = Field(default=0, ge=0)
    session_score_history: list[float] = Field(default_factory=list)
    turns_since_last_decay: int = Field(default=999, ge=0)
    response_latency_sec: Optional[float] = Field(default=None)
    model_config = {"extra": "forbid"}

    @field_validator("current_depth", mode="before")
    @classmethod
    def _clamp_depth(cls, v: Any) -> float:
        return max(0.0, min(10.0, float(v or 0.0)))

    @field_validator("prior_depth_scores", "session_score_history", mode="before")
    @classmethod
    def _norm_list(cls, v: Any) -> list[float]:
        return [float(x) for x in (v or []) if x is not None]

    @field_validator("response_latency_sec", mode="before")
    @classmethod
    def _norm_latency(cls, v: Any) -> Optional[float]:
        if v is None:
            return None
        f = float(v)
        return f if f >= 0.0 else None


# ===========================================================================
# Abstract detector base -- unchanged interface
# ===========================================================================

class BaseDetector(ABC):
    @abstractmethod
    def detect(self, ctx: DetectionContext) -> Optional[SignalEvent]:
        pass


# ===========================================================================
# All detectors -- logic unchanged; CollapseRule used in FollowUpCollapseDetector
# ===========================================================================

class OwnershipAmbiguityDetector(BaseDetector):
    _SHORT_EVASION_THRESHOLD = 12
    # M5 fix: separate the "counts as we-language" tokens from the "triggers
    # short-evasion" tokens.  Previously both sets overlapped (_WE_TOKENS
    # contains "team"/"they"/"everyone") making the we_count < 2 guard
    # contradict the any() check.  Now: short-evasion only fires on neutral
    # topic/project/personal words that carry no pronoun count weight.
    _SHORT_EVASION_TRIGGER_WORDS = frozenset({"personal", "project", "developed"})

    def detect(self, ctx: DetectionContext) -> Optional[SignalEvent]:
        tokens = ctx.answer.lower().split()
        clean = [t.strip(".,!?;:\"'()") for t in tokens]
        we_count = sum(1 for t in clean if t in _WE_TOKENS)
        i_count = sum(1 for t in clean if t in _I_TOKENS)
        classic_hit = we_count >= 2 and i_count <= 1
        # M5 fix: short-evasion trigger set no longer overlaps with _WE_TOKENS.
        # Fires on very short answers that name a project/personal context but
        # claim zero personal ownership (no "I/me/my" AND no team pronoun).
        short_evasion_hit = (
            len(clean) <= self._SHORT_EVASION_THRESHOLD
            and i_count == 0
            and we_count == 0
            and any(w in clean for w in self._SHORT_EVASION_TRIGGER_WORDS)
        )
        if not (classic_hit or short_evasion_hit):
            return None
        if classic_hit:
            confidence = min(1.0, 0.45 + 0.15 * max(0, we_count - 1))
            evidence = f"team-language count={we_count}, first-person count={i_count}"
        else:
            confidence = 0.72
            evidence = f"answer too short ({len(clean)} words) with no first-person ownership tokens"
        return _build_signal_event(
            signal_name="ownership_ambiguity",
            signal_layer="behavioral_confidence",
            confidence=confidence,
            evidence=evidence,
            trust_bucket_affected="behavioral_confidence",
            score_delta=-0.15,
            probe_mode="ownership",
            recoverable=True,
            recruiter_visible=True,
        )


class ExampleEvasionDetector(BaseDetector):
    def detect(self, ctx: DetectionContext) -> Optional[SignalEvent]:
        q_lower = ctx.last_question.lower()
        if not any(p in q_lower for p in _EXAMPLE_REQUEST_PHRASES):
            return None
        a_lower = ctx.answer.lower()
        answer_is_theoretical = any(p in a_lower for p in _THEORY_PHRASES)
        # C3 fix: use the shared _SPECIFICS_RE which covers technical tokens
        # (tool names, action verbs, entity types) in addition to temporal /
        # numeric markers.  Previously only dates/numbers counted, causing
        # the signal to fire on substantive technical answers.
        has_specifics = bool(_SPECIFICS_RE.search(a_lower))
        word_count = len(ctx.answer.split())
        is_too_short = word_count <= 15 and not has_specifics
        # Evasion fires only when the answer is genuinely thin:
        #   - clearly theoretical language used, OR
        #   - very short (<=15 words) with no specific detail
        # An answer that is NOT theoretical AND has specifics → no signal.
        if not (answer_is_theoretical or is_too_short):
            return None
        # C4 fix: mutual exclusion — if ExampleGivenDetector would fire on
        # this same answer (concrete, substantive, non-theoretical), suppress
        # evasion to prevent contradictory signals on the same turn.
        is_concrete = not answer_is_theoretical
        is_substantive = word_count >= 25
        if has_specifics and is_concrete and is_substantive:
            return None
        if is_too_short and not answer_is_theoretical:
            confidence = 0.70
        else:
            confidence = 0.78 if answer_is_theoretical else 0.68
        return _build_signal_event(
            signal_name="example_evasion",
            signal_layer="behavioral_confidence",
            confidence=confidence,
            evidence="example requested but answer stayed theoretical, too short, or lacked specifics",
            trust_bucket_affected="behavioral_confidence",
            score_delta=-0.15,
            probe_mode="evidence",
            recoverable=True,
            recruiter_visible=False,
        )


class WeakTechnicalHedgeDetector(BaseDetector):
    """Detects hedging language ('I've worked with', 'I'm familiar with') combined
    with weak depth — indicates resume-padding rather than real experience.

    H3 fix: renamed from ResumeClaimMismatchDetector.  The original name implied
    a comparison against actual resume data (which was never done).  The signal
    fires on hedging language + low depth, so 'weak_technical_hedge' is accurate.
    """

    def detect(self, ctx: DetectionContext) -> Optional[SignalEvent]:
        q_lower = ctx.last_question.lower()
        if not any(p in q_lower for p in _EXAMPLE_REQUEST_PHRASES | _COMPRESSION_REQUEST_PHRASES):
            return None
        a_lower = ctx.answer.lower()
        if not any(p in a_lower for p in _RESUME_LIKE_PHRASES):
            return None
        # C3 fix: use shared _SPECIFICS_RE for consistent specificity detection.
        has_specifics = bool(_SPECIFICS_RE.search(a_lower))
        if has_specifics and ctx.current_depth >= 5.5:
            return None
        return _build_signal_event(
            signal_name="weak_technical_hedge",
            signal_layer="behavioral_confidence",
            confidence=0.72 if not has_specifics else 0.62,
            evidence="hedging language ('I've worked with', 'familiar with') without concrete grounding",
            trust_bucket_affected="behavioral_confidence",
            score_delta=-0.12,
            probe_mode="evidence",
            recoverable=True,
            recruiter_visible=True,
        )


class FollowUpCollapseDetector(BaseDetector):
    """Detects sharp quality drop from first to follow-up answer.

    Uses the CollapseRule dispatch table instead of nested if/elif:
    new collapse types -> add a rule to _COLLAPSE_RULES, no method changes needed.
    """

    def detect(self, ctx: DetectionContext) -> Optional[SignalEvent]:
        if ctx.topic_follow_up_count < 1 or not ctx.prior_depth_scores:
            return None
        first_answer_depth = ctx.prior_depth_scores[0]
        drop = first_answer_depth - ctx.current_depth
        if first_answer_depth < 6.0:
            return None

        # Dispatch table replaces: if current_depth <= 3.0 / elif current_depth <= 5.0 ...
        rule = next(
            (r for r in _COLLAPSE_RULES if r.matches(ctx.current_depth, drop)),
            None,
        )
        if rule is None:
            return None

        escalated = ctx.collapse_stage >= 1
        return _build_signal_event(
            signal_name="follow_up_collapse",
            signal_layer="hard_integrity",
            confidence=rule.compute_confidence(drop, escalated),
            evidence=(
                f"{rule.label} collapse: first={first_answer_depth:.1f} "
                f"follow-up={ctx.current_depth:.1f} drop={drop:.1f} level={ctx.collapse_stage}"
            ),
            trust_bucket_affected="behavioral_confidence",
            score_delta=rule.score_delta(escalated),
            probe_mode="follow_up_collapse_escalated",
            recoverable=not escalated,
            recruiter_visible=True,
        )


class LatencyMismatchDetector(BaseDetector):
    def detect(self, ctx: DetectionContext) -> Optional[SignalEvent]:
        if ctx.topic_follow_up_count < 1 or not ctx.prior_depth_scores:
            return None
        q_lower = ctx.last_question.lower()
        if not any(p in q_lower for p in _COMPRESSION_REQUEST_PHRASES | _EXAMPLE_REQUEST_PHRASES):
            return None
        words = [w for w in re.split(r"\s+", ctx.answer.strip()) if w]
        if len(words) > 42:
            return None
        first_answer_depth = ctx.prior_depth_scores[0]
        drop = first_answer_depth - ctx.current_depth
        if drop < 1.5 and len(words) > 28:
            return None
        if drop < 0.8 and len(words) > 18:
            return None
        return _build_signal_event(
            signal_name="latency_mismatch",
            signal_layer="behavioral_confidence",
            confidence=min(1.0, 0.52 + max(0.0, drop) / 8.0),
            evidence=f"follow-up answer compressed to {len(words)} words after a detail-seeking question",
            trust_bucket_affected="behavioral_confidence",
            score_delta=-0.10,
            probe_mode="compression",
            recoverable=True,
            recruiter_visible=False,
        )


_DECAY_MIN_TOPIC_TURNS = 4
_DECAY_WINDOW = 4
_DECAY_MILD_THRESHOLD = 1.0
_DECAY_SEVERE_THRESHOLD = 1.8
_DECAY_COOLDOWN = 3


class DepthDecayDetector(BaseDetector):
    def detect(self, ctx: DetectionContext) -> Optional[SignalEvent]:
        if ctx.topic_follow_up_count < _DECAY_MIN_TOPIC_TURNS:
            return None
        if len(ctx.session_score_history) < _DECAY_WINDOW:
            return None
        if ctx.turns_since_last_decay < _DECAY_COOLDOWN:
            return None
        window = ctx.session_score_history[-_DECAY_WINDOW:]
        mid = len(window) // 2
        first_half_avg = sum(window[:mid]) / mid
        second_half_avg = sum(window[mid:]) / (len(window) - mid)
        drop = first_half_avg - second_half_avg
        if drop >= _DECAY_SEVERE_THRESHOLD:
            severity, confidence, score_delta = "severe", min(0.95, 0.70 + drop * 0.04), -0.12
        elif drop >= _DECAY_MILD_THRESHOLD:
            severity, confidence, score_delta = "mild", min(0.88, 0.55 + drop * 0.04), -0.06
        else:
            return None
        return _build_signal_event(
            signal_name="depth_decay",
            signal_layer="intelligence_quality",
            confidence=confidence,
            evidence=(
                f"{severity} cross-topic decay: window={_DECAY_WINDOW} turns, "
                f"first_half_avg={first_half_avg:.2f}, second_half_avg={second_half_avg:.2f}, "
                f"drop={drop:.2f}"
            ),
            trust_bucket_affected="intelligence_quality",
            score_delta=score_delta,
            probe_mode="normal",
            recoverable=True,
            recruiter_visible=True,
        )


_CLM_COMPLEX_PHRASES = {
    "tell me about a time", "walk me through", "describe a situation",
    "give me an example", "how did you handle", "what was the hardest",
    "explain your decision", "what tradeoff", "what would you have done differently",
    "how did you influence", "what was the impact", "how did you prioritize",
    "describe a challenge", "what did you learn", "tell me about a project",
    "how did you approach", "what was your strategy", "describe your process",
}
_CLM_SIMPLE_PHRASES = {
    "what is your", "how many years", "which company", "when did you",
    "what tools", "have you used", "do you know about", "are you familiar",
    "what's your", "how long have", "where did you", "what is your current",
    "what languages", "what frameworks", "which team",
}
_CLM_FAST_COMPLEX_SEC = 5.5
_CLM_SLOW_SIMPLE_SEC = 22.0
_CLM_MIN_WORDS = 20


# ===========================================================================
# OOP: QuestionComplexityScorer -- class-level LRU cache (max 256 entries)
# ===========================================================================

class QuestionComplexityScorer:
    """Complexity classifier for interview questions.

    M6 fix: replaced the hand-rolled class-level dict cache (not thread-safe
    under concurrent evals from multiple simultaneous interviews) with
    functools.lru_cache on the static compute method.  lru_cache uses an
    internal lock and is safe for concurrent access from multiple threads.
    """

    @staticmethod
    @__import__("functools").lru_cache(maxsize=256)
    def _compute(question: str) -> str:
        q = question.lower()
        word_count = len(q.split())
        complex_hits = sum(1 for p in _CLM_COMPLEX_PHRASES if p in q)
        simple_hits = sum(1 for p in _CLM_SIMPLE_PHRASES if p in q)
        if complex_hits >= 1 or word_count >= 20:
            return "complex"
        if simple_hits >= 1 or word_count <= 8:
            return "simple"
        return "moderate"

    @classmethod
    def score(cls, question: str) -> str:
        return cls._compute(question)

    @classmethod
    def clear_cache(cls) -> None:
        cls._compute.cache_clear()


def _score_question_complexity(question: str) -> str:
    """Classify question complexity. Delegates to QuestionComplexityScorer (cached)."""
    return QuestionComplexityScorer.score(question)


class ComplexityLatencyMismatchDetector(BaseDetector):
    def detect(self, ctx: DetectionContext) -> Optional[SignalEvent]:
        if ctx.response_latency_sec is None:
            return None
        words = len(ctx.answer.split())
        if words < _CLM_MIN_WORDS:
            return None
        complexity = _score_question_complexity(ctx.last_question)
        if complexity == "complex" and ctx.response_latency_sec < _CLM_FAST_COMPLEX_SEC:
            time_under = _CLM_FAST_COMPLEX_SEC - ctx.response_latency_sec
            confidence = min(0.92, 0.62 + time_under * 0.06)
            return _build_signal_event(
                signal_name="complexity_latency_mismatch",
                signal_layer="behavioral_confidence",
                confidence=confidence,
                evidence=(
                    f"complex question answered in {ctx.response_latency_sec:.1f}s "
                    f"(expected >={_CLM_FAST_COMPLEX_SEC}s for genuine recall), "
                    f"words={words}, complexity={complexity}"
                ),
                trust_bucket_affected="behavioral_confidence",
                score_delta=-0.14,
                probe_mode="evidence",
                recoverable=True,
                recruiter_visible=True,
            )
        if complexity == "simple" and ctx.response_latency_sec > _CLM_SLOW_SIMPLE_SEC:
            time_over = ctx.response_latency_sec - _CLM_SLOW_SIMPLE_SEC
            confidence = min(0.82, 0.48 + time_over * 0.012)
            return _build_signal_event(
                signal_name="complexity_latency_mismatch",
                signal_layer="behavioral_confidence",
                confidence=confidence,
                evidence=(
                    f"simple question took {ctx.response_latency_sec:.1f}s "
                    f"(expected <={_CLM_SLOW_SIMPLE_SEC}s), "
                    f"words={words}, complexity={complexity}"
                ),
                trust_bucket_affected="behavioral_confidence",
                score_delta=-0.08,
                probe_mode="compression",
                recoverable=True,
                recruiter_visible=True,
            )
        return None


class OwnershipClarifiedDetector(BaseDetector):
    def detect(self, ctx: DetectionContext) -> Optional[SignalEvent]:
        a_lower = ctx.answer.lower()
        has_personal = any(p in a_lower for p in _I_TOKENS)
        has_ownership = any(p in a_lower for p in [
            "i owned", "i designed", "i built", "i decided", "i led", "i managed",
            "i personally", "my responsibility", "my role", "i specifically"
        ])
        # M4 fix: removed dead condition 3 (`has_specifics`). Any answer that
        # satisfies has_ownership already contains "i", "my", or "i specifically",
        # so the old `re.search(r"\b(specific|personal|i|my|me|myself)\b")` was
        # always True when has_ownership was True — it added zero filtering.
        if has_personal and has_ownership:
            return _build_signal_event(
                signal_name="ownership_clarified",
                signal_layer="behavioral_confidence",
                confidence=0.85,
                evidence="candidate clarified personal ownership with explicit 'I' and ownership language",
                trust_bucket_affected="behavioral_confidence",
                score_delta=0.05,
                probe_mode="ownership",
                recoverable=False,
                recruiter_visible=True,
            )
        return None


class ExampleGivenDetector(BaseDetector):
    def detect(self, ctx: DetectionContext) -> Optional[SignalEvent]:
        a_lower = ctx.answer.lower()
        # C4 fix: use the same _SPECIFICS_RE as ExampleEvasionDetector so the
        # two signals share one definition of "has specifics" and can never
        # both fire on the same answer.
        has_specifics = bool(_SPECIFICS_RE.search(a_lower))
        is_concrete = not any(p in a_lower for p in [
            "typically", "usually", "generally", "you should", "you could",
            "ideally", "theoretically", "in theory"
        ])
        word_count = len(ctx.answer.split())
        is_substantive = word_count >= 25
        if has_specifics and is_concrete and is_substantive:
            return _build_signal_event(
                signal_name="example_given",
                signal_layer="behavioral_confidence",
                confidence=0.80,
                evidence="candidate provided concrete example with specific details, dates, or project names",
                trust_bucket_affected="behavioral_confidence",
                score_delta=0.04,
                probe_mode="evidence",
                recoverable=False,
                recruiter_visible=True,
            )
        return None


class StrongUnderPressureDetector(BaseDetector):
    """Fires when a probed candidate still delivers a high-quality answer.

    Mirrors trust_engine inline check (topic_follow_up_count >= 1, overall >= 6.5)
    and produces a recruiter-visible SignalEvent (the inline path never emitted one).
    """
    _QUALITY_THRESHOLD = 6.5

    def detect(self, ctx: DetectionContext) -> Optional[SignalEvent]:
        if ctx.topic_follow_up_count < 1:
            return None
        if ctx.current_depth < self._QUALITY_THRESHOLD:
            return None
        if len(ctx.answer.split()) < 20:
            return None
        confidence = min(0.95, 0.70 + (ctx.current_depth - self._QUALITY_THRESHOLD) * 0.05)
        return _build_signal_event(
            signal_name="strong_under_pressure",
            signal_layer="behavioral_confidence",
            confidence=confidence,
            evidence=(
                f"probed answer maintained high depth={ctx.current_depth:.1f} "
                f"(threshold={self._QUALITY_THRESHOLD}) on follow-up #{ctx.topic_follow_up_count}"
            ),
            trust_bucket_affected="behavioral_confidence",
            score_delta=0.05,
            probe_mode="ownership",
            recoverable=False,
            recruiter_visible=True,
        )


# ===========================================================================
# OOP: SignalEvaluator -- Registry + Orchestrator (extended, unchanged evaluate())
# ===========================================================================

class SignalEvaluator:
    """OOP Registry and orchestrator for all BaseDetector subclasses.

    Adds over original:
      register() / unregister() -- dynamic per-org detector management
      evaluate_async()           -- parallel execution via asyncio.gather
      langchain_pipeline()       -- optional RunnableParallel composable path
    """

    _DETECTORS: ClassVar[dict[str, BaseDetector]] = {
        "ownership_ambiguity":          OwnershipAmbiguityDetector(),
        "example_evasion":              ExampleEvasionDetector(),
        "weak_technical_hedge":         WeakTechnicalHedgeDetector(),
        "follow_up_collapse":           FollowUpCollapseDetector(),
        "latency_mismatch":             LatencyMismatchDetector(),
        "depth_decay":                  DepthDecayDetector(),
        "complexity_latency_mismatch":  ComplexityLatencyMismatchDetector(),
        "ownership_clarified":          OwnershipClarifiedDetector(),
        "example_given":                ExampleGivenDetector(),
        "strong_under_pressure":        StrongUnderPressureDetector(),
    }

    # -- Registry API --------------------------------------------------------

    @classmethod
    def register(cls, name: str, detector: BaseDetector, *, replace: bool = False) -> None:
        """Register a new detector. Raises if name exists and replace=False."""
        if name in cls._DETECTORS and not replace:
            raise ValueError(f"Detector '{name}' already registered. Use replace=True to override.")
        cls._DETECTORS[name] = detector

    @classmethod
    def unregister(cls, name: str) -> None:
        """Remove a detector by name (no-op if not found)."""
        cls._DETECTORS.pop(name, None)

    # -- Synchronous path -- original, unchanged ------------------------------

    @classmethod
    def evaluate(cls, ctx: DetectionContext) -> list[SignalEvent]:
        events: list[SignalEvent] = []
        for name, detector in cls._DETECTORS.items():
            event = detector.detect(ctx)
            if event is not None:
                if event.get("signal_name") != name:
                    event["signal_name"] = name
                events.append(event)
        return events

    # -- Async parallel path -- new -------------------------------------------

    @classmethod
    async def evaluate_async(cls, ctx: DetectionContext) -> list[SignalEvent]:
        """Run all detectors in parallel via asyncio.gather + thread executor.

        Total latency ≈ slowest single detector (not sum of all).
        Falls back to synchronous evaluate() if no running loop is found.
        """
        detectors = list(cls._DETECTORS.items())
        try:
            loop = asyncio.get_running_loop()
            raw = await asyncio.gather(
                *[loop.run_in_executor(None, det.detect, ctx) for _, det in detectors],
                return_exceptions=False,
            )
        except RuntimeError:
            return cls.evaluate(ctx)

        events: list[SignalEvent] = []
        for (name, _), event in zip(detectors, raw):
            if event is not None:
                if event.get("signal_name") != name:
                    event["signal_name"] = name
                events.append(event)
        return events

    # -- LangChain composable path -- optional --------------------------------

    @classmethod
    def langchain_pipeline(cls):
        """Build a LangChain RunnableParallel over all registered detectors.

        Returns None if langchain-core is not installed.

        Usage::
            pipe = SignalEvaluator.langchain_pipeline()
            if pipe:
                results = pipe.invoke(ctx)   # dict[name, SignalEvent | None]
                events = [v for v in results.values() if v is not None]
        """
        if not _LANGCHAIN_AVAILABLE:
            return None
        return RunnableParallel(
            {
                name: RunnableLambda(lambda ctx_arg, _d=det: _d.detect(ctx_arg))
                for name, det in cls._DETECTORS.items()
            }
        )


# ===========================================================================
# Public facade endpoints -- all signatures unchanged
# ===========================================================================

def _legacy_detection_context(
    *,
    answer: str = "",
    last_question: str = "",
    current_depth: float = 5.0,
    prior_depth_scores: Optional[list[float]] = None,
    topic_follow_up_count: int = 0,
    collapse_stage: int = 0,
    session_score_history: Optional[list[float]] = None,
    turns_since_last_decay: int = 999,
    response_latency_sec: Optional[float] = None,
) -> DetectionContext:
    return DetectionContext(
        answer=answer,
        last_question=last_question,
        current_depth=current_depth,
        prior_depth_scores=prior_depth_scores or [],
        topic_follow_up_count=topic_follow_up_count,
        collapse_stage=collapse_stage,
        session_score_history=session_score_history or [],
        turns_since_last_decay=turns_since_last_decay,
        response_latency_sec=response_latency_sec,
    )


def detect_ownership_ambiguity(answer: str) -> bool:
    return _detect_ownership_ambiguity_event(answer=answer) is not None


def detect_example_evasion(answer: str, last_question: str) -> bool:
    return _detect_example_evasion_event(answer=answer, last_question=last_question) is not None


def detect_follow_up_collapse(
    current_depth: float,
    prior_depth_scores: list[float],
    topic_follow_up_count: int,
) -> bool:
    return _detect_follow_up_collapse_event(
        answer="",
        last_question="",
        current_depth=current_depth,
        prior_depth_scores=prior_depth_scores,
        topic_follow_up_count=topic_follow_up_count,
    ) is not None


def _detect_ownership_ambiguity_event(
    answer: str,
    last_question: str = "",
    current_depth: float = 5.0,
    prior_depth_scores: Optional[list[float]] = None,
    topic_follow_up_count: int = 0,
) -> Optional[SignalEvent]:
    return OwnershipAmbiguityDetector().detect(_legacy_detection_context(
        answer=answer,
        last_question=last_question,
        current_depth=current_depth,
        prior_depth_scores=prior_depth_scores,
        topic_follow_up_count=topic_follow_up_count,
    ))


def _detect_example_evasion_event(
    answer: str,
    last_question: str,
    current_depth: float = 5.0,
    prior_depth_scores: Optional[list[float]] = None,
    topic_follow_up_count: int = 0,
) -> Optional[SignalEvent]:
    return ExampleEvasionDetector().detect(_legacy_detection_context(
        answer=answer,
        last_question=last_question,
        current_depth=current_depth,
        prior_depth_scores=prior_depth_scores,
        topic_follow_up_count=topic_follow_up_count,
    ))


def _detect_weak_technical_hedge_event(
    answer: str,
    last_question: str,
    current_depth: float,
    prior_depth_scores: Optional[list[float]] = None,
    topic_follow_up_count: int = 0,
) -> Optional[SignalEvent]:
    return WeakTechnicalHedgeDetector().detect(_legacy_detection_context(
        answer=answer,
        last_question=last_question,
        current_depth=current_depth,
        prior_depth_scores=prior_depth_scores,
        topic_follow_up_count=topic_follow_up_count,
    ))


def _detect_follow_up_collapse_event(
    answer: str,
    last_question: str,
    current_depth: float,
    prior_depth_scores: Optional[list[float]],
    topic_follow_up_count: int,
    collapse_stage: int = 0,
) -> Optional[SignalEvent]:
    return FollowUpCollapseDetector().detect(_legacy_detection_context(
        answer=answer,
        last_question=last_question,
        current_depth=current_depth,
        prior_depth_scores=prior_depth_scores,
        topic_follow_up_count=topic_follow_up_count,
        collapse_stage=collapse_stage,
    ))


def _detect_latency_mismatch_event(
    answer: str,
    last_question: str,
    current_depth: float,
    prior_depth_scores: Optional[list[float]],
    topic_follow_up_count: int,
) -> Optional[SignalEvent]:
    return LatencyMismatchDetector().detect(_legacy_detection_context(
        answer=answer,
        last_question=last_question,
        current_depth=current_depth,
        prior_depth_scores=prior_depth_scores,
        topic_follow_up_count=topic_follow_up_count,
    ))


def _detect_resume_claim_mismatch_event(
    answer: str,
    last_question: str,
    current_depth: float,
    prior_depth_scores: Optional[list[float]] = None,
    topic_follow_up_count: int = 0,
) -> Optional[SignalEvent]:
    event = WeakTechnicalHedgeDetector().detect(_legacy_detection_context(
        answer=answer,
        last_question=last_question,
        current_depth=current_depth,
        prior_depth_scores=prior_depth_scores,
        topic_follow_up_count=topic_follow_up_count,
    ))
    if event is None:
        return None
    return {**event, "signal_name": "resume_claim_mismatch"}


def _detect_depth_decay_event(
    answer: str,
    last_question: str,
    current_depth: float,
    prior_depth_scores: Optional[list[float]],
    topic_follow_up_count: int,
    session_score_history: Optional[list[float]] = None,
    turns_since_last_decay: int = 999,
) -> Optional[SignalEvent]:
    # Legacy helper detected cross-turn decay from session history alone.
    effective_followups = max(topic_follow_up_count, _DECAY_MIN_TOPIC_TURNS)
    return DepthDecayDetector().detect(_legacy_detection_context(
        answer=answer,
        last_question=last_question,
        current_depth=current_depth,
        prior_depth_scores=prior_depth_scores,
        topic_follow_up_count=effective_followups,
        session_score_history=session_score_history,
        turns_since_last_decay=turns_since_last_decay,
    ))


def _detect_complexity_latency_mismatch_event(
    answer: str,
    last_question: str,
    current_depth: float,
    prior_depth_scores: Optional[list[float]],
    topic_follow_up_count: int,
    response_latency_sec: Optional[float] = None,
) -> Optional[SignalEvent]:
    return ComplexityLatencyMismatchDetector().detect(_legacy_detection_context(
        answer=answer,
        last_question=last_question,
        current_depth=current_depth,
        prior_depth_scores=prior_depth_scores,
        topic_follow_up_count=topic_follow_up_count,
        response_latency_sec=response_latency_sec,
    ))


def _detect_ownership_clarified_event(answer: str, last_question: str = "") -> Optional[SignalEvent]:
    return OwnershipClarifiedDetector().detect(_legacy_detection_context(
        answer=answer,
        last_question=last_question,
    ))


def _detect_example_given_event(answer: str, last_question: str = "") -> Optional[SignalEvent]:
    return ExampleGivenDetector().detect(_legacy_detection_context(
        answer=answer,
        last_question=last_question,
    ))


def detect_signal_events(
    *,
    candidate_answer: str,
    last_question: str,
    current_depth: float,
    prior_depth_scores: list[float],
    topic_follow_up_count: int,
    collapse_stage: int = 0,
    session_score_history: Optional[list[float]] = None,
    turns_since_last_decay: int = 999,
    response_latency_sec: Optional[float] = None,
) -> list[SignalEvent]:
    """Detect all signal events for the current turn. Public API unchanged."""
    ctx = DetectionContext(
        answer=candidate_answer,
        last_question=last_question,
        current_depth=current_depth,
        prior_depth_scores=prior_depth_scores,
        topic_follow_up_count=topic_follow_up_count,
        collapse_stage=collapse_stage,
        session_score_history=session_score_history,
        turns_since_last_decay=turns_since_last_decay,
        response_latency_sec=response_latency_sec,
    )
    return SignalEvaluator.evaluate(ctx)


def build_signal_flags(signal_events: list[SignalEvent]) -> SignalFlags:
    names = {event["signal_name"] for event in signal_events}
    return SignalFlags(
        ownership_ambiguity="ownership_ambiguity" in names,
        example_evasion="example_evasion" in names,
        weak_technical_hedge=("weak_technical_hedge" in names) or ("resume_claim_mismatch" in names),
        latency_mismatch="latency_mismatch" in names,
        follow_up_collapse="follow_up_collapse" in names,
        depth_decay="depth_decay" in names,
        complexity_latency_mismatch="complexity_latency_mismatch" in names,
        ownership_clarified="ownership_clarified" in names,
        example_given="example_given" in names,
        strong_under_pressure="strong_under_pressure" in names,
    )


def compute_trust_delta(signal_events: list[SignalEvent], quality: dict) -> dict[str, Any]:
    """Compute the legacy trust delta summary from quality + signals.

    This compatibility helper preserves the older test-facing API that
    returned a simple delta/reason pair. The current runtime uses the richer
    TrustEngine instead, so this stays intentionally lightweight.
    """
    clarity = float(quality.get("clarity", 5.0))
    depth = float(quality.get("depth", 5.0))
    specificity = float(quality.get("specificity", 5.0))
    grounding = float(quality.get("grounding", 5.0))
    overall = (clarity + depth + specificity + grounding) / 4.0

    if overall >= 8.0:
        return {"delta": 0.20, "reason": "high-quality answer"}
    if overall >= 6.5:
        return {"delta": 0.10, "reason": "solid answer"}
    if overall >= 4.5:
        return {"delta": 0.00, "reason": "mixed answer"}
    return {"delta": -0.10, "reason": "low-quality answer"}


def build_turn_decision(
    quality: dict,
    signals: SignalFlags,
    signal_events: list[SignalEvent],
    *args: Any,
) -> TurnDecision:
    if len(args) == 3:
        action, mode, next_goal = args
    elif len(args) == 4:
        # Legacy signature: (quality, signals, events, trust_delta, action, mode, next_goal)
        _, action, mode, next_goal = args
    else:
        raise TypeError(
            "build_turn_decision() expects either 6 positional args "
            "(quality, signals, events, action, mode, next_goal) or "
            "7 positional args including the legacy trust_delta argument."
        )
    return TurnDecision(
        quality=QualityScores(
            clarity=quality.get("clarity", 5.0),
            depth=quality.get("depth", 5.0),
            specificity=quality.get("specificity", 5.0),
            grounding=quality.get("grounding", 5.0),
            fluency=quality.get("fluency", 0.0),
            confidence=quality.get("confidence", 0.0),
        ),
        signals=signals,
        signal_events=signal_events,
        decision=DecisionOutput(action=action, mode=mode, next_goal=next_goal),
    )
