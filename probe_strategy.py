"""
Probe strategy router.

Turns signal flags and evaluator output into a concrete next move.
This is the training layer that keeps "signal -> reaction" explicit.
"""
from turn_decision import SignalFlags, TurnDecision


_PROBE_FAMILIES: dict[str, dict[str, str]] = {
    "clarification": {
        "goal": "Surface the inconsistency naturally. Ask them to reconcile the two statements.",
        "style": "Use genuine confusion, not accusation. Anchor on the two conflicting claims.",
    },
    "ownership": {
        "goal": "Ask what THEY personally owned, built, or decided - not the team.",
        "style": "Push from team-language into individual responsibility.",
    },
    "evidence": {
        "goal": "Ask for a concrete example, named project, or real moment from work.",
        "style": "Move from claim to proof. Ask for the exact instance, not the summary.",
    },
    "compression": {
        "goal": "Ask for the sequence step by step and compress the story into the real turning point.",
        "style": "Use when the answer gets too short or too collapsed on a follow-up.",
    },
    "depth": {
        "goal": "Go one level deeper on the real decision, tradeoff, or failure story.",
        "style": "Use when the answer is already substantive but not yet fully tested.",
    },
    "verification": {
        "goal": "Test recall on the specific moment before or after the claim.",
        "style": "Use when the answer sounds polished but lightly grounded.",
    },
    "normal": {
        "goal": "Topic sufficiently covered. Move to the next uncovered area from your interview plan.",
        "style": "No special probe needed.",
    },
}


_SIGNAL_TO_FAMILY = [
    ("contradiction", "clarification"),
    ("resume_claim_mismatch", "evidence"),
    ("example_evasion", "evidence"),
    ("latency_mismatch", "compression"),
    ("follow_up_collapse", "compression"),
    ("ownership_ambiguity", "ownership"),
]


_MODE_ALIASES = {
    "specificity": "evidence",
    "depth": "depth",
    "ownership": "ownership",
    "contradiction": "clarification",
    "clarification": "clarification",
    "compression": "compression",
    "evidence": "evidence",
    "verification": "verification",
}


def _normalize_family(mode: str | None, depth_signal: str) -> str:
    if mode:
        key = str(mode).strip().lower()
        if key in _MODE_ALIASES:
            return _MODE_ALIASES[key]
        if key in _PROBE_FAMILIES:
            return key

    normalized_depth = str(depth_signal or "").strip().upper()
    if normalized_depth == "SPECIFIC":
        return "compression"
    if normalized_depth == "DEEP":
        return "depth"
    return "evidence"


def _family_goal(family: str) -> str:
    return _PROBE_FAMILIES.get(family, _PROBE_FAMILIES["normal"])["goal"]


def _family_style(family: str) -> str:
    return _PROBE_FAMILIES.get(family, _PROBE_FAMILIES["normal"])["style"]


def route(
    signals: SignalFlags,
    depth_signal: str,
    topic_follow_up_count: int,
    max_follow_ups: int = 3,
    contradiction_detected: bool = False,
    llm_action: str = "MOVE_ON",
    llm_probe_mode: str | None = None,
) -> tuple[str, str, str]:
    """
    Returns (action, mode, next_goal).

    Priority:
      1. Hard cap on follow-ups -> MOVE_ON
      2. Contradiction -> VERIFY + clarification
      3. Signal flags -> PROBE with a concrete probe family
      4. LLM decision passthrough
      5. Default MOVE_ON
    """
    if topic_follow_up_count >= max_follow_ups:
        return ("MOVE_ON", "normal", _family_goal("normal"))

    if contradiction_detected:
        return ("VERIFY", "clarification", _family_goal("clarification"))

    for flag, family in _SIGNAL_TO_FAMILY:
        if signals.get(flag):
            action = "VERIFY" if family == "clarification" else "PROBE"
            return (action, family, _family_goal(family))

    if llm_action in ("PROBE", "VERIFY"):
        family = _normalize_family(llm_probe_mode, depth_signal)
        action = "VERIFY" if family == "clarification" else "PROBE"
        if llm_action == "VERIFY" and family != "clarification":
            action = "VERIFY"
        return (action, family, _family_goal(family))

    return ("MOVE_ON", "normal", _family_goal("normal"))


def build_directive(td: TurnDecision, depth_signal: str, topic_follow_up_count: int) -> str:
    """
    Build the NEXT_TURN_DIRECTIVE string injected into Ishita's context.
    """
    action = td["decision"]["action"]
    mode = td["decision"]["mode"]
    next_goal = td["decision"]["next_goal"]
    trust = td["trust"]
    quality = td["quality"]
    signals = td["signals"]

    active_signals = [k for k, v in signals.items() if v]
    style = _family_style(mode)

    lines = [
        "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]",
        f"DECISION: {action}" + (f" ({mode.upper()})" if action != "MOVE_ON" else ""),
        f"ANSWER DEPTH: {depth_signal}",
        f"QUALITY: clarity={quality['clarity']:.0f} depth={quality['depth']:.0f} "
        f"specificity={quality['specificity']:.0f} grounding={quality['grounding']:.0f}",
    ]

    if active_signals:
        lines.append(f"SIGNALS: {', '.join(active_signals)}")

    lines.append(f"TRUST DELTA: {trust['delta']:+.2f} - {trust['reason']}")
    lines.append(f"NEXT MOVE: {next_goal}")
    if style and style != "No special probe needed.":
        lines.append(f"QUESTION STYLE: {style}")

    if action != "MOVE_ON":
        lines.append(
            f"Follow-ups on this topic so far: {topic_follow_up_count}. "
            f"If this reaches 3, move on regardless."
        )

    return "\n".join(lines)
