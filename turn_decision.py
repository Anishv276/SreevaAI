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
    ownership_ambiguity: bool        # vague "we" with no personal contribution named
    example_evasion: bool            # stayed theoretical after request for real example
    resume_claim_mismatch: bool      # resume-like claims without concrete grounding
    latency_mismatch: bool           # answer is unnaturally compressed on a follow-up
    contradiction: bool              # conflicts with prior answer or resume claim
    follow_up_collapse: bool         # depth dropped sharply from first to follow-up answer
    depth_decay: bool                # cross-topic quality degradation across rolling window of turns
    complexity_latency_mismatch: bool  # inverted timing pattern — hard Q instant, easy Q slow
    ownership_clarified: bool        # recovery: candidate clarified personal ownership after ambiguity
    example_given: bool              # recovery: candidate provided concrete example after evasion
    contradiction_resolved: bool     # recovery: candidate convincingly resolved a surfaced contradiction
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
        re.compile(r"^\s*(?:okay|ok|yes|yep|yeah|i see|got it|sure|right|mmhmm|mhm|of course|sure thing|absolutely)\s*$", re.IGNORECASE),
    ),
    "answer_start": (
        re.compile(r"^\s*(?:so basically|yeah so|so|well|um so|i think|i guess|i believe|maybe|probably|sort of|kind of|let me think|i'm thinking|thinking)\b", re.IGNORECASE),
    ),
    "refusal": (
        re.compile(r"^\s*(?:i don't know|not sure|no idea|not really|can't say|cannot say)\s*$", re.IGNORECASE),
    ),
    "clarification_question": (
        re.compile(r"\b(?:what do you mean|could you repeat|can you repeat|what did you mean|could you clarify|can you clarify|sorry what|pardon|repeat that|say that again|rephrase)\b", re.IGNORECASE),
        re.compile(r"^\s*(?:sorry\?|what\?|huh\?|pardon\?)\s*$", re.IGNORECASE),
    ),
}
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
        trust_bucket_affected="behavioral_confidence",
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
    normalized = re.sub(r"[^\w\s']", " ", text.lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    for response_class, patterns in _SHORT_UTTERANCE_PATTERNS.items():
        if any(pattern.search(normalized) for pattern in patterns):
            return ShortUtteranceClassification(
                response_class=response_class,
                evidence=text,
                token_count=len(tokens),
            )
    # Ignore tiny fragments that often come from STT hallucination / echo bleed.
    # Keep genuine short answers only when they match one of the explicit patterns above.
    if len(tokens) <= 3:
        return None
    if len(tokens) >= 5:
        return None
    return ShortUtteranceClassification(
        response_class="genuine_short_answer",
        evidence=text,
        token_count=len(tokens),
    )
_DECAY_WINDOW = 3             # rolling window of overall scores; smaller for 20-min interviews
_DECAY_MILD_THRESHOLD = 1.2   # first-half avg minus second-half avg triggers mild decay
_DECAY_SEVERE_THRESHOLD = 2.0 # same, severe tier
_DECAY_COOLDOWN = 2           # minimum turns between consecutive firings; tighter for short interviews
def _detect_depth_decay_event(
    answer: str,
    last_question: str,
    current_depth: float,
    prior_depth_scores: list[float],
    topic_follow_up_count: int,
    contradiction_detected: bool,
    *,
    session_score_history: list[float],
    turns_since_last_decay: int,
) -> Optional[SignalEvent]:
    """
    Cross-topic depth decay detector.
    Uses session_score_history (overall quality scores across ALL topics) — not the
    topic-scoped prior_depth_scores — to detect interview-wide progressive decline.
    Window split: first half vs second half of last _DECAY_WINDOW scores.
    If second-half avg is materially lower than first-half avg, candidate is declining.
    Cooldown: will not re-fire within _DECAY_COOLDOWN turns of last firing to avoid
    noise oscillation on borderline candidates.
    """
    del answer, last_question, current_depth, prior_depth_scores, topic_follow_up_count, contradiction_detected
    if len(session_score_history) < _DECAY_WINDOW:
        return None
    if turns_since_last_decay < _DECAY_COOLDOWN:
        return None
    window = session_score_history[-_DECAY_WINDOW:]
    mid = len(window) // 2
    first_half_avg = sum(window[:mid]) / mid
    second_half_avg = sum(window[mid:]) / (len(window) - mid)
    drop = first_half_avg - second_half_avg
    if drop >= _DECAY_SEVERE_THRESHOLD:
        severity = "severe"
        confidence = min(0.95, 0.70 + drop * 0.04)
        score_delta = -0.12
    elif drop >= _DECAY_MILD_THRESHOLD:
        severity = "mild"
        confidence = min(0.88, 0.55 + drop * 0.04)
        score_delta = -0.06
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
# -- Complexity-Latency Mismatch -------------------------------------------
# Catches AI-assisted candidates: hard questions answered instantly (pre-generated
# text read aloud), and simple factual questions with unusual delay (looking things up).
# Thresholds tuned for 20-min interviews with ~50-sec turns.
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
# Fast complex: AI reads pre-generated answer, no real thinking time needed
_CLM_FAST_COMPLEX_SEC = 5.5   # complex Q answered in < 5.5s = suspicious
# Slow simple: candidate is looking something up (tab switch, reading notes)
_CLM_SLOW_SIMPLE_SEC = 22.0   # simple Q takes > 22s = suspicious
# Minimum answer substance — ignore greetings / single-sentence filler
_CLM_MIN_WORDS = 20
def _score_question_complexity(question: str) -> str:
    """
    Classify question as 'simple', 'moderate', or 'complex' using phrase matching
    + word count heuristic. No LLM call — runs in microseconds.
    """
    q = question.lower()
    word_count = len(q.split())
    complex_hits = sum(1 for p in _CLM_COMPLEX_PHRASES if p in q)
    simple_hits = sum(1 for p in _CLM_SIMPLE_PHRASES if p in q)
    if complex_hits >= 1 or word_count >= 20:
        return "complex"
    if simple_hits >= 1 or word_count <= 8:
        return "simple"
    return "moderate"
def _detect_complexity_latency_mismatch_event(
    answer: str,
    last_question: str,
    current_depth: float,
    prior_depth_scores: list[float],
    topic_follow_up_count: int,
    contradiction_detected: bool,
    *,
    response_latency_sec: Optional[float],
) -> Optional[SignalEvent]:
    """
    Complexity-Latency Mismatch detector.
    Two distinct failure patterns caught:
    1. FAST-COMPLEX: Candidate answers a deep behavioral question in < 5.5s with
       >= 20 words. Real humans need time to recall, structure, and articulate a
       specific past experience. An instant polished answer strongly suggests
       AI-generated text being read aloud.
    2. SLOW-SIMPLE: Candidate takes > 22s to answer a simple factual question
       (tools used, company name, years of experience). Slow simple answers suggest
       the candidate is switching context — looking at notes, searching, or asking AI.
    Both patterns are recruiter-visible and affect behavioral_confidence.
    The signal is NOT fired if latency data is unavailable (response_latency_sec=None).
    """
    del current_depth, prior_depth_scores, topic_follow_up_count, contradiction_detected
    if response_latency_sec is None:
        return None
    words = len(answer.split())
    if words < _CLM_MIN_WORDS:
        return None  # too short — not a substantive answer, skip
    complexity = _score_question_complexity(last_question)
    # Case 1: Complex behavioral question → instant full answer (AI-read pattern)
    if complexity == "complex" and response_latency_sec < _CLM_FAST_COMPLEX_SEC:
        time_under = _CLM_FAST_COMPLEX_SEC - response_latency_sec
        confidence = min(0.92, 0.62 + time_under * 0.06)
        return _build_signal_event(
            signal_name="complexity_latency_mismatch",
            signal_layer="behavioral_confidence",
            confidence=confidence,
            evidence=(
                f"complex question answered in {response_latency_sec:.1f}s "
                f"(expected >={_CLM_FAST_COMPLEX_SEC}s for genuine recall), "
                f"words={words}, complexity={complexity}"
            ),
            trust_bucket_affected="behavioral_confidence",
            score_delta=-0.14,
            probe_mode="evidence",
            recoverable=True,
            recruiter_visible=True,
        )
    # Case 2: Simple factual question → abnormally slow answer (lookup pattern)
    if complexity == "simple" and response_latency_sec > _CLM_SLOW_SIMPLE_SEC:
        time_over = response_latency_sec - _CLM_SLOW_SIMPLE_SEC
        confidence = min(0.82, 0.48 + time_over * 0.012)
        return _build_signal_event(
            signal_name="complexity_latency_mismatch",
            signal_layer="behavioral_confidence",
            confidence=confidence,
            evidence=(
                f"simple question took {response_latency_sec:.1f}s "
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
def detect_signal_events(
    *,
    candidate_answer: str,
    last_question: str,
    current_depth: float,
    prior_depth_scores: list[float],
    topic_follow_up_count: int,
    contradiction_detected: bool,
    collapse_stage: int = 0,
    session_score_history: Optional[list[float]] = None,
    turns_since_last_decay: int = 999,
    response_latency_sec: Optional[float] = None,
) -> list[SignalEvent]:
    # All detectors share the same positional signature; extra params are injected
    # for specific detectors via wrapper closures.
    def _collapse_detector(a, q, d, h, f, c):
        return _detect_follow_up_collapse_event(a, q, d, h, f, c, collapse_stage=collapse_stage)
    def _decay_detector(a, q, d, h, f, c):
        return _detect_depth_decay_event(
            a, q, d, h, f, c,
            session_score_history=session_score_history or [],
            turns_since_last_decay=turns_since_last_decay,
        )
    def _clm_detector(a, q, d, h, f, c):
        return _detect_complexity_latency_mismatch_event(
            a, q, d, h, f, c,
            response_latency_sec=response_latency_sec,
        )
    def _ownership_clarified_detector(a, q, d, h, f, c):  # noqa: ARG001
        del d, h, f, c
        return _detect_ownership_clarified_event(a, q)
    def _example_given_detector(a, q, d, h, f, c):  # noqa: ARG001
        del d, h, f, c
        return _detect_example_given_event(a, q)
    detectors: dict[str, Callable[[str, str, float, list[float], int, bool], Optional[SignalEvent]]] = {
        "ownership_ambiguity": _detect_ownership_ambiguity_event,
        "example_evasion": _detect_example_evasion_event,
        "resume_claim_mismatch": _detect_resume_claim_mismatch_event,
        "latency_mismatch": _detect_latency_mismatch_event,
        "follow_up_collapse": _collapse_detector,
        "contradiction": _detect_contradiction_event,
        "depth_decay": _decay_detector,
        "complexity_latency_mismatch": _clm_detector,
        "ownership_clarified": _ownership_clarified_detector,
        "example_given": _example_given_detector,
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
        depth_decay="depth_decay" in names,
        complexity_latency_mismatch="complexity_latency_mismatch" in names,
        ownership_clarified="ownership_clarified" in names,
        example_given="example_given" in names,
        contradiction_resolved="contradiction_resolved" in names,
    )
def detect_ownership_ambiguity(answer: str) -> bool:
    """
    True when answer uses team-language heavily with little personal ownership.
    Uses token-level matching to avoid false positives ("new" matching "we", etc.).
    Heuristic: we-tokens appear 2+ times, I-tokens appear 0-1 times.
    """
    return _detect_ownership_ambiguity_event(answer, "", 0.0, [], 0, False) is not None
def detect_example_evasion(answer: str, last_question: str) -> bool:
    """
    True when question asked for a real example but answer stays theoretical.
    """
    return _detect_example_evasion_event(answer, last_question, 0.0, [], 0, False) is not None
def _detect_ownership_clarified_event(
    answer: str,
    last_question: str,  # noqa: ARG001
) -> Optional[SignalEvent]:
    """
    Recovery signal: fires when candidate clarifies personal ownership after initial ambiguity.
    Looks for explicit personal pronouns + ownership language.
    """
    a_lower = answer.lower()
    # Check for personal ownership language
    has_personal = any(p in a_lower for p in _I_TOKENS)
    has_ownership = any(p in a_lower for p in [
        "i owned", "i designed", "i built", "i decided", "i led", "i managed",
        "i personally", "my responsibility", "my role", "i specifically"
    ])
    # Check that answer actually addresses the question (not deflecting)
    has_specifics = bool(re.search(r"\b(specific|personal|i|my|me|myself)\b", a_lower))
    if has_personal and has_ownership and has_specifics:
        return _build_signal_event(
            signal_name="ownership_clarified",
            signal_layer="behavioral_confidence",
            confidence=0.85,  # Recovery signal, high confidence
            evidence="candidate clarified personal ownership with explicit 'I' and ownership language",
            trust_bucket_affected="behavioral_confidence",
            score_delta=0.05,  # Positive recovery
            probe_mode="ownership",
            recoverable=False,  # Recovery signals don't fire multiple times
            recruiter_visible=True,
        )
    return None
def _detect_example_given_event(
    answer: str,
    last_question: str,  # noqa: ARG001
) -> Optional[SignalEvent]:
    """
    Recovery signal: fires when candidate provides concrete example after initial evasion.
    Looks for specific details: names, dates, numbers, project names.
    """
    a_lower = answer.lower()
    # Check for specific details
    has_specifics = bool(re.search(r"\b(at |in |during |when|year|ago|\d+|project|client|company|system|database|api)\b", a_lower))
    # Check for concrete language (not theoretical)
    is_concrete = not any(p in a_lower for p in [
        "typically", "usually", "generally", "you should", "you could",
        "ideally", "theoretically", "in theory"
    ])
    # Check word count (example_given should be substantive, not minimal)
    word_count = len(answer.split())
    is_substantive = word_count >= 25
    if has_specifics and is_concrete and is_substantive:
        return _build_signal_event(
            signal_name="example_given",
            signal_layer="behavioral_confidence",
            confidence=0.80,  # Recovery signal
            evidence="candidate provided concrete example with specific details, dates, or project names",
            trust_bucket_affected="behavioral_confidence",
            score_delta=0.04,  # Positive recovery (slightly less than ownership_clarified)
            probe_mode="evidence",
            recoverable=False,
            recruiter_visible=True,
        )
    return None
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
