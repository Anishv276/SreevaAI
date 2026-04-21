"""
TurnDecision schema and signal detection logic.

Consumed by evaluate_answer_and_decide() in agent.py via turn_evaluator.py.
"""
from __future__ import annotations
import re
from typing import Callable, Optional, TypedDict


# -- Schema --------------------------------------------------------------------

class QualityScores(TypedDict):
    clarity: float      # 0-10: how clear the answer is
    depth: float        # 0-10: reasoning shown
    specificity: float  # 0-10: real names/numbers/examples
    grounding: float    # 0-10: tied to lived experience


class SignalFlags(TypedDict):
    ownership_ambiguity: bool   # vague "we" with no personal contribution named
    example_evasion: bool       # stayed theoretical after request for real example
    resume_claim_mismatch: bool # resume-like claims without concrete grounding
    latency_mismatch: bool      # answer is unnaturally compressed on a follow-up
    contradiction: bool         # conflicts with prior answer or resume claim
    follow_up_collapse: bool    # depth dropped sharply from first to follow-up answer
    meta_question: bool         # candidate is checking if Ishita is a bot or if she's present


class TrustDelta(TypedDict):
    delta: float        # -1.0 to +1.0 change in session trust this turn
    reason: str         # one short sentence explaining the change


class DecisionOutput(TypedDict):
    action: str         # "MOVE_ON" | "PROBE" | "VERIFY"
    mode: str           # "normal" | "depth" | "ownership" | "contradiction" | "verification"
    next_goal: str      # short description of what Ishita should focus on next


class TurnDecision(TypedDict):
    quality: QualityScores
    signals: SignalFlags
    signal_events: list[SignalEvent]
    trust: TrustDelta
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


class ShortUtteranceClassification(TypedDict):
    response_class: str
    evidence: str
    token_count: int


_SIGNAL_RULES: dict[str, SignalRule] = {}


def register_signal_rule(
    signal_name: str,
    *,
    signal_layer: str,
    trust_bucket_affected: str,
    probe_mode: str,
    recoverable: bool,
    recruiter_visible: bool,
    detector: Callable[
        [str, str, float, list[float], int, bool],
        Optional[SignalEvent],
    ],
) -> None:
    _SIGNAL_RULES[signal_name] = SignalRule(
        signal_layer=signal_layer,
        trust_bucket_affected=trust_bucket_affected,
        probe_mode=probe_mode,
        recoverable=recoverable,
        recruiter_visible=recruiter_visible,
        detector=detector,
    )


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


# -- Signal detection helpers --------------------------------------------------

# Exact token sets - matched against whitespace-split tokens, not raw substrings.
# This prevents "we" matching "new", "i" matching "image", etc.
_WE_TOKENS = {"we", "our", "team", "they", "everyone"}
_I_TOKENS = {"i", "me", "my", "myself", "i'd", "i've"}

_THEORY_PHRASES = {
    "generally", "typically", "usually", "in theory", "the best practice",
    "you should", "one would", "the idea is", "ideally", "the approach is",
    "you can", "the way to", "it depends",
}

_EXAMPLE_REQUEST_PHRASES = {
    "give me an example", "can you give", "tell me about a time",
    "walk me through", "specific example", "real example", "describe a time",
    "can you share", "tell me about", "recall a time",
}

_RESUME_LIKE_PHRASES = {
    "i have worked with",
    "i've worked with",
    "i have experience with",
    "i've used",
    "i used",
    "on my resume",
    "i am familiar with",
    "i'm familiar with",
    "i have handled",
    "i worked on",
    "i've handled",
}

_COMPRESSION_REQUEST_PHRASES = {
    "walk me through",
    "step by step",
    "what happened first",
    "what was the first",
    "what was the sequence",
    "how did you handle",
    "what exactly changed",
    "what did you do",
}

_SHORT_UTTERANCE_PATTERNS: dict[str, tuple[re.Pattern[str], ...]] = {
    "connection_check": (
        re.compile(r"^\s*(?:can you hear me|hear me|hello|you there|are you there)\s*$", re.IGNORECASE),
        re.compile(r"^\s*hear me\??\s*$", re.IGNORECASE),
    ),
    "acknowledgment": (
        re.compile(r"^\s*(?:okay|ok|yes|yep|yeah|i see|got it|sure|right|mmhmm|mhm)\s*$", re.IGNORECASE),
    ),
    "answer_start": (
        re.compile(r"^\s*(?:so basically|yeah so|so|well|um so)\b", re.IGNORECASE),
    ),
    "refusal": (
        re.compile(r"^\s*(?:i don't know|not sure|no idea|not really|can't say|cannot say)\s*$", re.IGNORECASE),
    ),
}

_META_QUESTION_PATTERNS = (
    re.compile(r"\bcan you hear me\b", re.IGNORECASE),
    re.compile(r"\bhear me\b", re.IGNORECASE),
    re.compile(r"\bare you there\b", re.IGNORECASE),
    re.compile(r"\bare you a bot\b", re.IGNORECASE),
    re.compile(r"\bdo you know me\b", re.IGNORECASE),
    re.compile(r"\bhave any idea\b", re.IGNORECASE),
)


def _detect_ownership_ambiguity_event(
    answer: str,
    last_question: str,
    current_depth: float,
    prior_depth_scores: list[float],
    topic_follow_up_count: int,
    contradiction_detected: bool,
) -> Optional[SignalEvent]:
    del last_question, current_depth, prior_depth_scores, topic_follow_up_count, contradiction_detected
    tokens = answer.lower().split()
    clean = [t.strip(".,!?;:\"'()") for t in tokens]
    we_count = sum(1 for t in clean if t in _WE_TOKENS)
    i_count = sum(1 for t in clean if t in _I_TOKENS)
    if we_count < 2 or i_count > 1:
        return None

    return _build_signal_event(
        signal_name="ownership_ambiguity",
        signal_layer="behavioral_confidence",
        confidence=min(1.0, 0.45 + 0.15 * max(0, we_count - 1)),
        evidence=f"team-language count={we_count}, first-person count={i_count}",
        trust_bucket_affected="behavioral_confidence",
        score_delta=-0.15,
        probe_mode="ownership",
        recoverable=True,
        recruiter_visible=True,
    )


def _detect_example_evasion_event(
    answer: str,
    last_question: str,
    current_depth: float,
    prior_depth_scores: list[float],
    topic_follow_up_count: int,
    contradiction_detected: bool,
) -> Optional[SignalEvent]:
    del current_depth, prior_depth_scores, topic_follow_up_count, contradiction_detected
    q_lower = last_question.lower()
    question_asked_for_example = any(p in q_lower for p in _EXAMPLE_REQUEST_PHRASES)
    if not question_asked_for_example:
        return None
    a_lower = answer.lower()
    answer_is_theoretical = any(p in a_lower for p in _THEORY_PHRASES)
    import re
    has_specifics = bool(re.search(r"\b(at |in |during |when|year|ago|\d+)\b", a_lower))
    if not (answer_is_theoretical or not has_specifics):
        return None

    return _build_signal_event(
        signal_name="example_evasion",
        signal_layer="behavioral_confidence",
        confidence=0.78 if answer_is_theoretical else 0.68,
        evidence="example requested but answer stayed theoretical or lacked specifics",
        trust_bucket_affected="behavioral_confidence",
        score_delta=-0.15,
        probe_mode="evidence",
        recoverable=True,
        recruiter_visible=False,
    )


def _detect_resume_claim_mismatch_event(
    answer: str,
    last_question: str,
    current_depth: float,
    prior_depth_scores: list[float],
    topic_follow_up_count: int,
    contradiction_detected: bool,
) -> Optional[SignalEvent]:
    del prior_depth_scores, topic_follow_up_count, contradiction_detected
    q_lower = last_question.lower()
    if not any(p in q_lower for p in _EXAMPLE_REQUEST_PHRASES | _COMPRESSION_REQUEST_PHRASES):
        return None

    a_lower = answer.lower()
    if not any(p in a_lower for p in _RESUME_LIKE_PHRASES):
        return None

    import re
    has_specifics = bool(re.search(r"\b(at |in |during |when|year|ago|\d+)\b", a_lower))
    if has_specifics and current_depth >= 5.5:
        return None

    return _build_signal_event(
        signal_name="resume_claim_mismatch",
        signal_layer="behavioral_confidence",
        confidence=0.72 if not has_specifics else 0.62,
        evidence="resume-like claim with weak grounding or missing concrete evidence",
        trust_bucket_affected="behavioral_confidence",
        score_delta=-0.12,
        probe_mode="evidence",
        recoverable=True,
        recruiter_visible=True,
    )


def _detect_follow_up_collapse_event(
    answer: str,
    last_question: str,
    current_depth: float,
    prior_depth_scores: list[float],
    topic_follow_up_count: int,
    contradiction_detected: bool,
    collapse_stage: int = 0,
) -> Optional[SignalEvent]:
    """
    Adaptive follow-up collapse detection.

    Tiers:
      complete  — first >= 6.0, follow-up <= 3.0 (specifics vanish entirely)
      partial   — first >= 6.0, follow-up 3.1-5.0, drop >= 2.0 (reasoning thins)

    Staged behaviour:
      collapse_stage=0  — first detection, recoverable, L1 probe
      collapse_stage=1  — repeated after a prior collapse, stronger flag
    """
    del answer, last_question, contradiction_detected
    if topic_follow_up_count < 1 or not prior_depth_scores:
        return None

    first_answer_depth = (
        prior_depth_scores[-topic_follow_up_count]
        if len(prior_depth_scores) > topic_follow_up_count
        else prior_depth_scores[0]
    )
    drop = first_answer_depth - current_depth

    if first_answer_depth < 6.0:
        return None

    if current_depth <= 3.0:
        collapse_type = "complete"
    elif current_depth <= 5.0 and drop >= 2.0:
        collapse_type = "partial"
    else:
        return None

    # Repeated collapse is a stronger flag — raise confidence and score penalty
    if collapse_stage >= 1:
        confidence = min(0.97, 0.80 + (drop * 0.04))
        score_delta = -0.38
        is_recoverable = False
    else:
        confidence = min(0.95, 0.65 + (drop * 0.05))
        score_delta = -0.20 if collapse_type == "complete" else -0.12
        is_recoverable = True

    return _build_signal_event(
        signal_name="follow_up_collapse",
        signal_layer="hard_integrity",
        confidence=confidence,
        evidence=(
            f"{collapse_type} collapse: first={first_answer_depth:.1f} "
            f"follow-up={current_depth:.1f} drop={drop:.1f} stage={collapse_stage}"
        ),
        trust_bucket_affected="competency_authenticity",
        score_delta=score_delta,
        probe_mode="follow_up_collapse_staged",
        recoverable=is_recoverable,
        recruiter_visible=True,
    )


def _detect_latency_mismatch_event(
    answer: str,
    last_question: str,
    current_depth: float,
    prior_depth_scores: list[float],
    topic_follow_up_count: int,
    contradiction_detected: bool,
) -> Optional[SignalEvent]:
    del contradiction_detected
    if topic_follow_up_count < 1 or not prior_depth_scores:
        return None

    q_lower = last_question.lower()
    if not any(p in q_lower for p in _COMPRESSION_REQUEST_PHRASES | _EXAMPLE_REQUEST_PHRASES):
        return None

    words = [w for w in re.split(r"\s+", answer.strip()) if w]
    if len(words) > 42:
        return None

    first_answer_depth = (
        prior_depth_scores[-topic_follow_up_count]
        if len(prior_depth_scores) > topic_follow_up_count
        else prior_depth_scores[0]
    )
    drop = first_answer_depth - current_depth
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


def _detect_contradiction_event(
    answer: str,
    last_question: str,
    current_depth: float,
    prior_depth_scores: list[float],
    topic_follow_up_count: int,
    contradiction_detected: bool,
) -> Optional[SignalEvent]:
    del answer, last_question, current_depth, prior_depth_scores, topic_follow_up_count
    if not contradiction_detected:
        return None
    return _build_signal_event(
        signal_name="contradiction",
        signal_layer="hard_integrity",
        confidence=0.95,
        evidence="cross-turn factual contradiction detected",
        trust_bucket_affected="hard_integrity",
        score_delta=-0.40,
        probe_mode="contradiction",
        recoverable=True,
        recruiter_visible=True,
    )


def classify_short_utterance(utterance: str) -> Optional[ShortUtteranceClassification]:
    text = re.sub(r"\s+", " ", (utterance or "").strip())
    if not text:
        return None

    tokens = [t for t in re.split(r"\s+", text) if t]
    if len(tokens) >= 5:
        return None

    normalized = re.sub(r"[^\w\s']", " ", text.lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    for response_class, patterns in _SHORT_UTTERANCE_PATTERNS.items():
        if any(pattern.search(normalized) for pattern in patterns):
            return ShortUtteranceClassification(
                response_class=response_class,
                evidence=text,
                token_count=len(tokens),
            )

    return ShortUtteranceClassification(
        response_class="genuine_short_answer",
        evidence=text,
        token_count=len(tokens),
    )


def _detect_meta_question_event(
    answer: str,
    last_question: str,
    current_depth: float,
    prior_depth_scores: list[float],
    topic_follow_up_count: int,
    contradiction_detected: bool,
) -> Optional[SignalEvent]:
    del last_question, current_depth, prior_depth_scores, topic_follow_up_count, contradiction_detected
    a_lower = answer.lower()
    if not any(pattern.search(a_lower) for pattern in _META_QUESTION_PATTERNS):
        return None

    return _build_signal_event(
        signal_name="meta_question",
        signal_layer="rapport_repair",
        confidence=0.91,
        evidence="candidate asked a meta-checking question about presence, identity, or bot-ness",
        trust_bucket_affected="rapport_repair",
        score_delta=0.0,
        probe_mode="rapport",
        recoverable=True,
        recruiter_visible=False,
    )


def detect_signal_events(
    *,
    candidate_answer: str,
    last_question: str,
    current_depth: float,
    prior_depth_scores: list[float],
    topic_follow_up_count: int,
    contradiction_detected: bool,
    collapse_stage: int = 0,
) -> list[SignalEvent]:
    # All detectors share the same positional signature; collapse_stage is injected
    # only for the follow_up_collapse detector via a wrapper closure.
    def _collapse_detector(a, q, d, h, f, c):
        return _detect_follow_up_collapse_event(a, q, d, h, f, c, collapse_stage=collapse_stage)

    detectors: dict[str, Callable[[str, str, float, list[float], int, bool], Optional[SignalEvent]]] = {
        "ownership_ambiguity": _detect_ownership_ambiguity_event,
        "example_evasion": _detect_example_evasion_event,
        "resume_claim_mismatch": _detect_resume_claim_mismatch_event,
        "latency_mismatch": _detect_latency_mismatch_event,
        "follow_up_collapse": _collapse_detector,
        "contradiction": _detect_contradiction_event,
        "meta_question": _detect_meta_question_event,
    }
    events: list[SignalEvent] = []
    for signal_name, detector in detectors.items():
        event = detector(
            candidate_answer,
            last_question,
            current_depth,
            prior_depth_scores,
            topic_follow_up_count,
            contradiction_detected,
        )
        if event is None:
            continue
        if event["signal_name"] != signal_name:
            event["signal_name"] = signal_name
        events.append(event)
    return events


def build_signal_flags(signal_events: list[SignalEvent]) -> SignalFlags:
    names = {event["signal_name"] for event in signal_events}
    return SignalFlags(
        ownership_ambiguity="ownership_ambiguity" in names,
        example_evasion="example_evasion" in names,
        resume_claim_mismatch="resume_claim_mismatch" in names,
        latency_mismatch="latency_mismatch" in names,
        contradiction="contradiction" in names,
        follow_up_collapse="follow_up_collapse" in names,
        meta_question="meta_question" in names,
    )


register_signal_rule(
    "ownership_ambiguity",
    signal_layer="behavioral_confidence",
    trust_bucket_affected="behavioral_confidence",
    probe_mode="ownership",
    recoverable=True,
    recruiter_visible=True,
    detector=_detect_ownership_ambiguity_event,
)
register_signal_rule(
    "example_evasion",
    signal_layer="behavioral_confidence",
    trust_bucket_affected="behavioral_confidence",
    probe_mode="evidence",
    recoverable=True,
    recruiter_visible=False,
    detector=_detect_example_evasion_event,
)
register_signal_rule(
    "resume_claim_mismatch",
    signal_layer="behavioral_confidence",
    trust_bucket_affected="behavioral_confidence",
    probe_mode="evidence",
    recoverable=True,
    recruiter_visible=True,
    detector=_detect_resume_claim_mismatch_event,
)
register_signal_rule(
    "latency_mismatch",
    signal_layer="behavioral_confidence",
    trust_bucket_affected="behavioral_confidence",
    probe_mode="compression",
    recoverable=True,
    recruiter_visible=False,
    detector=_detect_latency_mismatch_event,
)
register_signal_rule(
    "follow_up_collapse",
    signal_layer="hard_integrity",
    trust_bucket_affected="competency_authenticity",
    probe_mode="follow_up_collapse_staged",
    recoverable=True,
    recruiter_visible=True,
    detector=_detect_follow_up_collapse_event,
)
register_signal_rule(
    "contradiction",
    signal_layer="hard_integrity",
    trust_bucket_affected="hard_integrity",
    probe_mode="contradiction",
    recoverable=True,
    recruiter_visible=True,
    detector=_detect_contradiction_event,
)
register_signal_rule(
    "meta_question",
    signal_layer="rapport_repair",
    trust_bucket_affected="rapport_repair",
    probe_mode="rapport",
    recoverable=True,
    recruiter_visible=False,
    detector=_detect_meta_question_event,
)


def detect_ownership_ambiguity(answer: str) -> bool:
    """
    True when answer uses team-language heavily with little personal ownership.
    Uses token-level matching to avoid false positives ("new" matching "we", etc.).
    Heuristic: we-tokens appear 2+ times, I-tokens appear 0-1 times.
    """
    tokens = answer.lower().split()
    return _detect_ownership_ambiguity_event(answer, "", 0.0, [], 0, False) is not None


def detect_example_evasion(answer: str, last_question: str) -> bool:
    """
    True when question asked for a real example but answer stays theoretical.
    """
    return _detect_example_evasion_event(answer, last_question, 0.0, [], 0, False) is not None


def detect_follow_up_collapse(
    current_depth: float,
    prior_depth_scores: list[float],
    topic_follow_up_count: int,
) -> bool:
    """
    True when adaptive collapse tiers fire (complete or partial).
    """
    return _detect_follow_up_collapse_event(
        "", "", current_depth, prior_depth_scores, topic_follow_up_count, False
    ) is not None


def compute_trust_delta(
    signal_events: list[SignalEvent],
    quality: QualityScores,
) -> TrustDelta:
    """
    Compute trust change this turn based on signals and quality.
    Range: -1.0 (very suspicious) to +1.0 (very trustworthy).
    """
    delta = 0.0
    reasons = []

    for event in signal_events:
        event_delta = float(event.get("score_delta", 0.0))
        delta += event_delta
        if event_delta < 0:
            reasons.append(f"{event['signal_name']} on {event['trust_bucket_affected']}")

    # Quality bonus/malus
    avg_quality = (quality["clarity"] + quality["depth"] + quality["specificity"] + quality["grounding"]) / 4.0
    if avg_quality >= 7.5:
        delta += 0.2
        reasons.append("high-quality detailed answer")
    elif avg_quality <= 3.0:
        delta -= 0.1
        reasons.append("low-quality surface answer")

    delta = max(-1.0, min(1.0, delta))
    reason = "; ".join(reasons) if reasons else "no strong signals"
    return TrustDelta(delta=round(delta, 2), reason=reason)


def build_turn_decision(
    quality: dict,
    signals: SignalFlags,
    signal_events: list[SignalEvent],
    trust: TrustDelta,
    action: str,
    mode: str,
    next_goal: str,
) -> TurnDecision:
    """Assemble a complete TurnDecision from component parts."""
    return TurnDecision(
        quality=QualityScores(
            clarity=quality.get("clarity", 5.0),
            depth=quality.get("depth", 5.0),
            specificity=quality.get("specificity", 5.0),
            grounding=quality.get("grounding", 5.0),
        ),
        signals=signals,
        signal_events=signal_events,
        trust=trust,
        decision=DecisionOutput(action=action, mode=mode, next_goal=next_goal),
    )
