"""
Probe strategy router.

Turns signal flags and evaluator output into a concrete next move.
This is the training layer that keeps "signal -> reaction" explicit.
"""
from typing import Optional
from turn_decision import SignalFlags, TurnDecision


_PROBE_FAMILIES: dict[str, dict[str, str]] = {
    "clarification": {
        "goal": "Surface the inconsistency naturally. Ask them to reconcile the two statements.",
        "style": "Use genuine confusion, not accusation. Anchor on the two conflicting claims.",
        "starters": [
            "Earlier you said X, but just now you said Y — help me understand which is closer to what actually happened.",
            "I want to make sure I'm following — those two things sound a bit different to me. Can you walk me through it again?",
        ],
    },
    "ownership": {
        "goal": "Ask what THEY personally owned, built, or decided - not the team.",
        "style": "Push from team-language into individual responsibility.",
        "starters": [
            "What specifically did you do versus the rest of the team?",
            "If I called your manager, what would they say your individual contribution was?",
            "Walk me through what you personally built or decided — not what the team did.",
        ],
    },
    "evidence": {
        "goal": "Ask for a concrete example, named project, or real moment from work.",
        "style": "Move from claim to proof. Ask for the exact instance, not the summary.",
        "starters": [
            "Give me a specific example of when that actually happened.",
            "That sounds practiced — give me a real moment where this played out.",
            "What's the most concrete instance you can think of? Name the project, the situation.",
        ],
    },
    "compression": {
        "goal": "Ask for the sequence step by step and compress the story into the real turning point.",
        "style": "Use when the answer gets too short or too collapsed on a follow-up.",
        "starters": [
            "Walk me through it step by step — what happened first, then what?",
            "What was the actual turning point? Not the outcome — the moment the decision was made.",
        ],
    },
    "follow_up_collapse_staged": {
        "goal": "Recover depth lost after a strong first answer. Use a staged memory probe, not a concept probe.",
        "style": "Escalate naturally: L1 ask for more detail, L2 ask what they personally owned, L3 reconstruct the exact moment.",
        "starters": [
            "Can you walk me through that in a bit more detail?",
            "What was your specific role in that — what did you personally own or build?",
            "Forget the overview — tell me about one specific day or meeting where that actually happened.",
        ],
    },
    "depth": {
        "goal": "Go one level deeper on the real decision, tradeoff, or failure story.",
        "style": "Use when the answer is already substantive but not yet fully tested.",
        "starters": [
            "What was the hardest part of that — not in general, the specific hardest moment?",
            "What would have broken if you'd made a different call there?",
            "What did you get wrong before you got it right?",
        ],
    },
    "verification": {
        "goal": "Test recall on the specific moment before or after the claim.",
        "style": "Use when the answer sounds polished but lightly grounded.",
        "starters": [
            "What was the state of things right before that happened? Walk me through it.",
            "I want to make sure I understand — you said X, can you walk me through what that looked like concretely?",
            "When you say Y, what does that mean in practice? Give me a real example.",
        ],
    },
    "rapport": {
        "goal": "Respond like a real person first, show you know the candidate's context, then bridge back naturally.",
        "style": "Start with a human acknowledgment. Do not pivot immediately into a new interview question.",
        "starters": [
            "That makes sense — [brief acknowledgment]. Let me come back to what we were discussing.",
            "Got it. [acknowledge]. Now — [bridge to question].",
        ],
    },
    "normal": {
        "goal": "Topic sufficiently covered. Move to the next uncovered area from your interview plan.",
        "style": "No special probe needed.",
        "starters": [
            "Okay, that gives me what I need there. Let me shift to something different.",
            "Got it. Before we move on, one quick thing — [targeted follow-up if needed].",
        ],
    },
}


_SIGNAL_TO_FAMILY = [
    ("contradiction", "clarification"),
    ("follow_up_collapse", "follow_up_collapse_staged"),
    ("resume_claim_mismatch", "evidence"),
    ("example_evasion", "evidence"),
    ("latency_mismatch", "compression"),
    ("ownership_ambiguity", "ownership"),
    ("depth_decay", "normal"),
    ("complexity_latency_mismatch", "evidence"),
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
    "rapport": "rapport",
    "follow_up_collapse_staged": "follow_up_collapse_staged",
}

_SHORT_UTTERANCE_FAMILIES = {
    "connection_check": {
        "goal": "Acknowledge the connection check briefly, reassure the candidate, and do not advance the interview yet.",
        "style": "Sound human and calm. Confirm you can hear them, then continue naturally.",
    },
    "acknowledgment": {
        "goal": "Treat this as acknowledgment, not a substantive answer. Keep the interview moving with the planned question and never end the interview here.",
        "style": "Do not overreact. Keep the pacing steady, continue the thread, and do not mention ending the interview.",
    },
    "answer_start": {
        "goal": "The candidate has started their answer. Stay silent and wait. Do NOT speak yet.",
        "style": "Say nothing. Do not encourage, prompt, or interject. Wait for the candidate to finish speaking.",
    },
    "refusal": {
        "goal": "Acknowledge the hesitation warmly and rephrase the question more simply or narrowly.",
        "style": "Lower the pressure. Keep the tone supportive and practical.",
    },
    "genuine_short_answer": {
        "goal": "Accept the brief answer as real, then ask one focused follow-up for specifics.",
        "style": "Briefly accept the answer, then move to one concrete follow-up.",
    },
    "clarification_question": {
        "goal": "The candidate is asking for clarification on your question. Answer their question directly and briefly, then re-ask the same question.",
        "style": "Give a short, clear answer to what they asked. Do not probe, do not advance the topic. Re-ask your original question after clarifying.",
    },
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


def _family_starters(family: str) -> list[str]:
    return _PROBE_FAMILIES.get(family, _PROBE_FAMILIES["normal"]).get("starters", [])


def build_short_utterance_directive(short_class: str, evidence: str) -> str:
    family = _SHORT_UTTERANCE_FAMILIES.get(short_class, _SHORT_UTTERANCE_FAMILIES["genuine_short_answer"])
    lines = [
        "[SHORT_RESPONSE_DIRECTIVE - DO NOT SAY ALOUD]",
        f"CLASS: {short_class}",
        f"RAW UTTERANCE: {evidence}",
        f"NEXT MOVE: {family['goal']}",
        f"QUESTION STYLE: {family['style']}",
    ]
    return "\n".join(lines)


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
            if flag == "depth_decay":
                # Candidate is fatiguing — move to next topic, not deeper probe
                return ("MOVE_ON", "normal", _family_goal("normal"))
            action = "VERIFY" if family == "clarification" else "PROBE"
            return (action, family, _family_goal(family))

    if llm_action in ("PROBE", "VERIFY"):
        family = _normalize_family(llm_probe_mode, depth_signal)
        action = "VERIFY" if family == "clarification" else "PROBE"
        if llm_action == "VERIFY" and family != "clarification":
            action = "VERIFY"
        return (action, family, _family_goal(family))

    return ("MOVE_ON", "normal", _family_goal("normal"))


def _build_collapse_probe_lines(collapse_stage: int, signal_events: list) -> list[str]:
    """
    Return the staged memory-probe lines for follow_up_collapse.
    stage 0 = first detection -> L1 (natural)
    stage 1 = probe already issued, no recovery -> L2 (ownership)
    stage 2+ = still no recovery -> L3 (exact moment)
    """
    # Extract evidence from the signal event for anchor phrasing
    evidence = ""
    for ev in signal_events:
        if ev.get("signal_name") == "follow_up_collapse":
            evidence = ev.get("evidence", "")
            break

    header = [
        "FOLLOW-UP COLLAPSE DETECTED.",
        "This is the strongest anti-cheat pattern — first answer had real specifics, follow-up lost them.",
        "Do NOT accept the weaker answer and move on. Run a staged memory probe.",
        "A real candidate recovers with imperfection and texture. A coached one cannot reconstruct the moment.",
    ]

    if collapse_stage == 0:
        probe_lines = [
            "PROBE LEVEL: L1 — natural, low pressure.",
            "PROBE: Ask them to walk through that part a bit more specifically.",
            'EXAMPLE: "Got it — can you walk me through that in a bit more detail?"',
            "If they recover with specifics: reduce collapse weight, note internally, move on.",
            "If they stay vague: this becomes stage 1 next turn.",
        ]
    elif collapse_stage == 1:
        probe_lines = [
            "PROBE LEVEL: L2 — ownership focus.",
            "PROBE: Ask what they personally handled, not what the team did.",
            'EXAMPLE: "What was your specific role in that — what did you personally own or build?"',
            "If they recover: reduce collapse weight, note internally, move on.",
            "If they deflect to team again: this becomes stage 2 — strong authenticity flag.",
        ]
    else:
        claim_anchor = f'about "{evidence[:80]}"' if evidence else "from their first answer"
        probe_lines = [
            "PROBE LEVEL: L3 — memory reconstruction. This is a strong integrity flag.",
            f"PROBE: Go back to the specific claim {claim_anchor}. Ask them to reconstruct the exact moment — not the summary.",
            f'EXAMPLE: "Forget the overview for a second — tell me about one specific day or meeting where {claim_anchor.replace("about ", "", 1)} actually happened. What was said? What did you do?"',
            'EXAMPLE: "What was the state of things right before you made that call? Walk me through it step by step."',
            "AI and rehearsed answers cannot reconstruct this. Real candidates will have imperfect recall with texture.",
            "If they cannot reconstruct: log as strong authenticity flag. Continue but weight this heavily.",
        ]

    return header + [f"EVIDENCE: {evidence}"] + probe_lines if evidence else header + probe_lines


def build_directive(
    td: TurnDecision,
    depth_signal: str,
    topic_follow_up_count: int,
    collapse_stage: int = 0,
    uncovered_topics: Optional[list[str]] = None,
    current_stage: str = "",
) -> str:
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
        f"CURRENT STAGE: {current_stage or 'unknown'}",
        f"ANSWER DEPTH: {depth_signal}",
        f"QUALITY: clarity={quality['clarity']:.0f} depth={quality['depth']:.0f} "
        f"specificity={quality['specificity']:.0f} grounding={quality['grounding']:.0f}",
    ]

    if active_signals:
        lines.append(f"SIGNALS: {', '.join(active_signals)}")

    if "depth_decay" in active_signals:
        lines.extend([
            "DEPTH DECAY DETECTED — candidate answer quality is declining across topics.",
            "Do NOT ask a harder or deeper question. The candidate is fatiguing.",
            "ACTION: Move to the next topic at normal pace. Keep the next question light and broad.",
            "If uncovered topics remain, bridge to the most important one now.",
            "Do not reference the quality decline to the candidate.",
        ])

    if "ownership_ambiguity" in active_signals:
        lines.extend([
            "OWNERSHIP AMBIGUITY DETECTED.",
            "Candidate uses heavy team language ('we', 'our', 'team') with minimal personal ownership ('I', 'my').",
            "This patterns suggests candidate contributed to team effort but is unclear on personal technical decisions.",
            "[ACTION - MANDATORY]",
            "Next turn, ask directly about PERSONAL contribution:",
            "  - 'What specifically did YOU do versus the rest of the team?'",
            "  - 'If I called your manager, what would they say YOUR individual contribution was?'",
            "  - 'Walk me through what YOU personally built or decided — not what the team did.'",
            "Wait for clear personal ownership language before moving on.",
        ])

    if "follow_up_collapse" in active_signals:
        lines.extend(_build_collapse_probe_lines(collapse_stage, td.get("signal_events", [])))

    lines.append(f"TRUST DELTA: {trust['delta']:+.2f} - {trust['reason']}")
    lines.append(f"NEXT MOVE: {next_goal}")
    if style and style != "No special probe needed.":
        lines.append(f"QUESTION STYLE: {style}")
    starters = _family_starters(mode)
    if starters and action != "MOVE_ON":
        lines.append("EXAMPLE OPENERS (use as inspiration, not verbatim):")
        for s in starters[:2]:
            lines.append(f"  - {s}")

    if action != "MOVE_ON":
        lines.append(
            f"Follow-ups on this topic so far: {topic_follow_up_count}. "
            f"If this reaches 2, move on regardless."
        )
    elif action == "MOVE_ON" and uncovered_topics:
        next_topic = uncovered_topics[0] if uncovered_topics else "next area"
        lines.append(f"BRIDGE NOW to: {next_topic}")
    if current_stage:
        lines.append(
            f"STAGE GUARD: Keep your next question strictly within {current_stage.upper()} stage intent."
        )

    return "\n".join(lines)
