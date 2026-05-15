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
    "follow_up_collapse_staged": {
        "goal": "Recover depth lost after a strong first answer. Use a staged memory probe, not a concept probe.",
        "style": "Escalate naturally: L1 ask for more detail, L2 ask what they personally owned, L3 reconstruct the exact moment.",
    },
    "depth": {
        "goal": "Go one level deeper on the real decision, tradeoff, or failure story.",
        "style": "Use when the answer is already substantive but not yet fully tested.",
    },
    "verification": {
        "goal": "Test recall on the specific moment before or after the claim.",
        "style": "Use when the answer sounds polished but lightly grounded.",
    },
    "rapport": {
        "goal": "Respond like a real person first, show you know the candidate's context, then bridge back naturally.",
        "style": "Start with a human acknowledgment. Do not pivot immediately into a new interview question.",
    },
    "normal": {
        "goal": "Topic sufficiently covered. Move to the next uncovered area from your interview plan.",
        "style": "No special probe needed.",
    },
}


_SIGNAL_TO_FAMILY = [
    # 1. CONTRADICTION: Candidate said two things that logically conflict (e.g. "I know Python" vs "I never used Python").
    ("contradiction", "clarification"),

    # 2. FOLLOW_UP_COLLAPSE: (Anti-Cheat) Candidate gave a perfect 1st answer but can't handle follow-ups.
    ("follow_up_collapse", "follow_up_collapse_staged"),

    # 3. RESUME_CLAIM_MISMATCH: The answer conflicts with facts found in their uploaded resume.
    ("resume_claim_mismatch", "evidence"),

    # 4. EXAMPLE_EVASION: Candidate is talking in theories and avoiding giving a real-life example.
    ("example_evasion", "evidence"),

    # 5. LATENCY_MISMATCH: (Anti-Cheat) Candidate answered way too fast for a complex question (suggests reading from a script).
    ("latency_mismatch", "compression"),

    # 6. OWNERSHIP_AMBIGUITY: Candidate keeps saying "We" or "The Team" to hide their lack of personal contribution.
    ("ownership_ambiguity", "ownership"),

    # 7. DEPTH_DECAY: Candidate is getting tired or "running out of juice" on this topic.
    ("depth_decay", "normal"),

    # 8. COMPLEXITY_LATENCY_MISMATCH: Candidate struggled with a simple question but answered a hard one instantly.
    ("complexity_latency_mismatch", "evidence"),
]


_MODE_ALIASES = {
    "specificity": "evidence",
    "contradiction": "clarification",
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
    max_follow_ups: int = 2,
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
            "L1 INTENT: Ask them to go back into the specific part that got thin.",
            "Anchor to something they said in their first answer — a number, a name, a situation.",
            "Do not use a generic 'tell me more' — reference what you actually want more of.",
            "If they recover with specifics: reduce collapse weight, note internally, move on.",
            "If they stay vague: this becomes stage 1 next turn.",
        ]
    elif collapse_stage == 1:
        probe_lines = [
            "L2 INTENT: Ownership focus. They are still being vague.",
            "Pick one specific thing they claimed the team did and ask what their personal role in that exact thing was.",
            "Do not use a generic ownership question — anchor it to their previous words.",
            "If they recover: reduce collapse weight, note internally, move on.",
            "If they deflect to team again: this becomes stage 2 — strong authenticity flag.",
        ]
    else:
        claim_anchor = f'about "{evidence[:80]}"' if evidence else "from their first answer"
        probe_lines = [
            "L3 INTENT: Memory reconstruction. This is a strong integrity flag.",
            f"Go back to the specific claim {claim_anchor}. Ask them to reconstruct the exact moment — not the summary.",
            "Ask for the state of things right before the event, or specific dialogue from a meeting.",
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
    max_follow_ups: int = 2,
) -> str:
    """
    Build the NEXT_TURN_DIRECTIVE string injected into the agent's context.

    Owns: per-turn signal reactions, follow-up cap enforcement, stage guard.
    Does NOT repeat: persona rules, aloud suppression, or stage-level question style
    (those live in prompt_layers.py and the active stage directive respectively).
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
            "OWNERSHIP PROBE: They used team language. Pick one specific thing they claimed "
            "the team did and ask what their personal role in that exact thing was.",
            "Do not use a generic ownership question — anchor it to their words.",
            "Wait for clear personal ownership language before moving on.",
        ])

    if "follow_up_collapse" in active_signals:
        lines.extend(_build_collapse_probe_lines(collapse_stage, td.get("signal_events", [])))

    lines.append(f"TRUST DELTA: {trust['delta']:+.2f} - {trust['reason']}")
    lines.append(f"NEXT MOVE: {next_goal}")
    if style and style != "No special probe needed.":
        lines.append(f"QUESTION STYLE: {style}")
    if action != "MOVE_ON":
        lines.append(
            "PROBE INTENT: Anchor your question to something specific they actually said — "
            "a project name, a number, a claim. Don't use a generic opener."
        )

    if action != "MOVE_ON":
        lines.append(
            f"Follow-ups on this topic so far: {topic_follow_up_count}. "
            f"If this reaches {max_follow_ups}, move on regardless."
        )
    elif action == "MOVE_ON" and uncovered_topics:
        next_topic = uncovered_topics[0] if uncovered_topics else "next area"
        lines.append(f"BRIDGE NOW to: {next_topic}")
    if current_stage:
        lines.append(
            f"STAGE GUARD: Keep your next question strictly within {current_stage.upper()} stage intent."
        )

    return "\n".join(lines)
