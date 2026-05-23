"""
Probe strategy router.

Turns signal flags and evaluator output into a concrete next move.
This is the training layer that keeps "signal -> reaction" explicit.
"""
from typing import Optional
from interview.turn_decision import SignalFlags, TurnDecision


_PROBE_FAMILIES: dict[str, dict[str, str]] = {
    # ── Integrity / contradiction ─────────────────────────────────────────────
    "clarification": {
        "goal": "Surface the inconsistency naturally. Ask them to connect what they said just now with what they said earlier.",
        "style": (
            "Genuine confusion, not accusation. Name both things specifically. "
            "Examples: 'Wait — earlier you said X, but just now it sounds like Y. Help me connect those two.' "
            "/ 'I want to make sure I got this right — you mentioned X before, but now it sounds more like Y. Which is it?' "
            "Never say 'you contradicted yourself'. Just be confused and ask them to clarify."
        ),
    },

    # ── Ownership ────────────────────────────────────────────────────────────
    "ownership": {
        "goal": "Find out what was specifically theirs — what they personally decided, built, or owned — not the team's.",
        "style": (
            "Anchor to the exact thing they just described, not ownership in general. "
            "Examples: 'You mentioned the team built the pipeline — what was specifically your part in that?' "
            "/ 'When you say we deployed it, what did you personally own in that process?' "
            "/ 'Walk me through one day of your work on that — what were you actually doing?' "
            "Never ask a generic 'what did YOU do' — always tie it to something they just named."
        ),
    },

    # ── Outcome / impact ─────────────────────────────────────────────────────
    "outcome": {
        "goal": "Get a real number, metric, or before/after that proves the outcome they claimed.",
        "style": (
            "Move from the claim to the evidence. Ask for the specific measure, not a summary. "
            "Examples: 'You said it improved performance — what did that look like in numbers?' "
            "/ 'Did it actually ship? How did you know it was working?' "
            "/ 'What changed for the user or the business after this went live?' "
            "If they give a vague number, ask what it was before."
        ),
    },

    # ── Tech choice / stack ──────────────────────────────────────────────────
    "tech_stack": {
        "goal": "Ask WHY they chose the specific tool, language, or framework they named — not just what it was.",
        "style": (
            "Peer-level curiosity. Anchor directly to what they named. "
            "Examples: 'Why Django specifically — had you considered FastAPI or Flask?' "
            "/ 'What made you go with Postgres over something like MongoDB for this?' "
            "/ 'You picked React — was that a conscious choice or just what the team used?' "
            "Never ask about something they already explained. Never ask 'what tech did you use' if they listed it."
        ),
    },

    # ── Alternatives / why not X ─────────────────────────────────────────────
    "alternatives": {
        "goal": "Make them defend their choice by asking what else they considered and why they didn't go that way.",
        "style": (
            "Curious, not challenging. Anchor to the specific choice they described. "
            "Examples: 'Could you have just done X instead — what would have broken?' "
            "/ 'Did anyone push back on this approach? What was the alternative they were suggesting?' "
            "/ 'Looking back, was there a simpler way to solve this you considered and rejected?' "
            "The goal is to hear real tradeoff reasoning, not defend the answer."
        ),
    },

    # ── Scale / constraints ──────────────────────────────────────────────────
    "scale": {
        "goal": "Get the real numbers or constraints they were working under — volume, load, users, budget, team size, deadline.",
        "style": (
            "Concrete and specific. Works for both technical and non-technical contexts. "
            "Technical examples: 'How much data were you actually dealing with?' / 'What kind of traffic was this handling?' "
            "Non-technical examples: 'How many people were involved in this process?' / 'What was the volume you were managing?' "
            "/ 'Were there hard constraints — budget, timeline, headcount — that shaped what you could do?' "
            "If they give a range, ask which end it was closer to."
        ),
    },

    # ── Process / how work got done ──────────────────────────────────────────
    "process": {
        "goal": "Understand HOW decisions were made and how the work actually got done day-to-day.",
        "style": (
            "Ground it in the real workflow, not the theory. "
            "Examples: 'How did you decide what to build first — who made that call?' "
            "/ 'How did you validate it was working before shipping?' "
            "/ 'What did a typical day look like when you were in the middle of this?' "
            "/ 'How did you get alignment with the rest of the team on that decision?' "
            "This reveals actual experience vs rehearsed answers."
        ),
    },

    # ── Failure / what broke ─────────────────────────────────────────────────
    "failure": {
        "goal": "Find out what actually went wrong, what got cut, or what they'd do differently — the story is too clean.",
        "style": (
            "Warm curiosity, not gotcha. Every real project has something. "
            "Examples: 'What broke along the way — or what almost did?' "
            "/ 'If you were doing this again from scratch, what would you change?' "
            "/ 'What got cut or deprioritized that you wish you'd had time for?' "
            "/ 'Was there a point where you thought this wasn't going to work?' "
            "Real candidates answer this easily. Coached ones give perfect stories."
        ),
    },

    # ── Anti-cheat: answer collapse on follow-up ─────────────────────────────
    "follow_up_collapse_staged": {
        "goal": "Recover depth lost after a strong first answer — probe memory, not concept.",
        "style": (
            "Escalate naturally across turns. "
            "L1 — anchor to something specific from their first answer: 'You mentioned X — tell me more about that part specifically.' "
            "L2 — ownership focus: 'In that specific thing you mentioned, what was your personal role?' "
            "L3 — memory reconstruction: 'Take me back to the moment that decision was made — what was the state of things right before?' "
            "Real candidates recover with imperfect detail. Coached ones cannot reconstruct the moment."
        ),
    },

    # ── Anti-cheat: answer compressed on follow-up ───────────────────────────
    "compression": {
        "goal": "Slow them down — ask them to walk back to the beginning of the story and go step by step.",
        "style": (
            "Use when the follow-up answer got shorter, not longer. They're collapsing. "
            "Examples: 'Let's go back to the start of this — walk me through what happened first.' "
            "/ 'I lost the thread a bit — take me from the beginning, what was the situation before you got involved?' "
            "/ 'Slow down a second — what was the very first thing you did when this landed on your plate?' "
            "A real candidate will expand. A scripted one will loop."
        ),
    },

    # ── Claim without proof ──────────────────────────────────────────────────
    "evidence": {
        "goal": "They claimed a skill or capability but gave zero real instance of actually using it — get a specific moment.",
        "style": (
            "Move from the claim to the proof. Ask for one real instance, not a summary. "
            "Examples: 'Give me one specific time you actually used that — what was the project?' "
            "/ 'You mentioned you know X well — walk me through the last time you actually worked with it.' "
            "/ 'What's the most complex thing you've built with that?' "
            "Don't accept 'I've used it in multiple projects' — ask which one."
        ),
    },

    # ── Polished but shallow ─────────────────────────────────────────────────
    "verification": {
        "goal": "The answer sounds rehearsed — probe real memory of the exact moment, not the summary of it.",
        "style": (
            "Ask for something a coached answer can't provide: sensory memory or imperfect recall. "
            "Examples: 'Take me back to the exact moment that decision was made — who was in the room?' "
            "/ 'What was the state of things right before you started that?' "
            "/ 'What was the first thing you said when this problem landed on you?' "
            "/ 'What's one thing about that project that surprised you — something you didn't expect?' "
            "Real experiences have texture and imperfection. Rehearsed ones are too clean."
        ),
    },

    # ── Situational ──────────────────────────────────────────────────────────
    "situational": {
        "goal": "Test judgment by putting them in a realistic scenario anchored to what they just described — pressure, incident, scale, or constraint.",
        "style": (
            "Frame it from their actual context — never a generic 'what would you do if'. "
            "Use something they just mentioned as the setup. "
            "Examples: 'You mentioned the replication lag almost broke SLA — if that happened on a system 10x bigger, what would you do differently?' "
            "/ 'Say that same deadline hit but you had half the team — how do you approach it?' "
            "/ 'What if the stakeholder had rejected that approach entirely — what was your plan B?' "
            "One scenario. Make it feel like a natural extension of what they just said."
        ),
    },

    # ── Behavioral ───────────────────────────────────────────────────────────
    "behavioral": {
        "goal": "Surface a real lived moment — a hard call, a mistake, a conflict, a win under pressure — anchored to what they just mentioned.",
        "style": (
            "Anchor it to the theme they just raised, not a generic behavioral prompt. "
            "Examples: 'You mentioned convincing your lead — tell me about a time that kind of pushback didn't go your way. What happened?' "
            "/ 'You said the team was under a lot of pressure — tell me about a specific moment where something felt like it was going wrong.' "
            "/ 'You touched on making that call alone — tell me about a time a solo decision you made turned out to be wrong.' "
            "Real candidates answer this with imperfect detail. Coached ones give a polished STAR story."
        ),
    },

    # ── Sentinel: move on ────────────────────────────────────────────────────
    "normal": {
        "goal": "Topic sufficiently covered. Move to the next uncovered area from your interview plan.",
        "style": "No special probe needed.",
    },
}


_SIGNAL_TO_FAMILY = [
    # Integrity signals — highest priority, always surface these
    ("contradiction", "clarification"),           # Said two conflicting things → reconcile them
    ("follow_up_collapse", "follow_up_collapse_staged"),  # Perfect 1st answer, falls apart on follow-up → staged memory probe

    # Behavioral signals — candidate is hiding or evading
    ("ownership_ambiguity", "ownership"),         # Heavy "we" language, no personal ownership → anchor to what they named
    ("example_evasion", "evidence"),              # Claimed a skill but gave no real instance → get a specific moment
    ("resume_claim_mismatch", "clarification"),   # Resume says X, answer says Y → surface the conflict, not ask for more evidence

    # Anti-cheat timing signals
    ("latency_mismatch", "compression"),          # Follow-up answer compressed sharply → slow them down, walk back to the start
    ("complexity_latency_mismatch", "verification"),  # Hard question answered instantly → probe real memory, not rehearsed answer

    # Fatigue signal — candidate is running out of depth across topics
    ("depth_decay", "normal"),                    # Quality declining cross-topic → move on, don't push deeper
]


_MODE_ALIASES = {
    "contradiction": "clarification",
    "tradeoff": "alternatives",
    "depth": "verification",
    "tech_stack": "alternatives",
    "scale": "outcome",
    "specificity": "ownership",
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

    # Fallback by depth signal when no mode given
    normalized_depth = str(depth_signal or "").strip().upper()
    if normalized_depth == "SPECIFIC":
        # They named a real thing but no reasoning yet — ask why they chose it
        return "alternatives"
    if normalized_depth == "DEEP":
        # Already has specifics and reasoning — probe memory for authenticity
        return "verification"
    # SURFACE — no real instance yet
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
    llm_action: str = "MOVE_ON",
    llm_probe_mode: str | None = None,
) -> tuple[str, str, str]:
    """
    Returns (action, mode, next_goal).

    Priority:
      1. Behavioral/integrity signal flags → signal-driven probe family
      2. LLM suggestion (probe_mode from evaluate_answer_and_decide) → adaptive probe
      3. Default MOVE_ON (saturation system handles topic transitions)

    Note: Hard follow-up cap removed. Topic transitions are owned entirely by the
    saturation system in eval_pipeline.py. route() only decides PROBE vs MOVE_ON
    within a turn — not when to switch topics.
    """
    # Priority 1: signal flags — always override LLM when a real behavioral signal fires
    for flag, family in _SIGNAL_TO_FAMILY:
        if signals.get(flag):
            if flag == "depth_decay":
                return ("MOVE_ON", "normal", _family_goal("normal"))
            # clarification family = VERIFY (contradiction surface); all others = PROBE
            action = "VERIFY" if family == "clarification" else "PROBE"
            return (action, family, _family_goal(family))

    # Priority 2: LLM suggestion — use what evaluate_answer_and_decide picked
    if llm_action in ("PROBE", "VERIFY"):
        family = _normalize_family(llm_probe_mode, depth_signal)
        # Only contradiction/clarification warrants VERIFY; everything else is PROBE
        action = "VERIFY" if family == "clarification" else "PROBE"
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


def select_probe_family_from_rotation(
    probe_rotation_index: int,
    signal_names: list[str],
    topic_importance: Optional[str] = "HIGH",
    llm_probe_mode: Optional[str] = None,
) -> str:
    """
    Select the best probe family for the current turn.

    Priority:
      1. Behavioral/integrity signal fired → signal-driven family (always wins)
      2. LLM suggested a specific probe_mode → use it (adaptive, answer-aware)
      3. Fallback rotation → ensures variety when LLM returns nothing useful

    Fallback rotation order (covers distinct angles across 5 turns):
      0 = ownership   — what was specifically theirs
      1 = tech_stack  — why that tool/approach
      2 = outcome     — real number or proof of impact
      3 = alternatives — what else they considered
      4 = failure     — what broke or what they'd change (CRITICAL topics only)
    """
    # Priority 1: signal override
    for signal_name, family in _SIGNAL_TO_FAMILY:
        if signal_name in signal_names:
            return family

    # Priority 2: LLM probe_mode — adaptive, based on what candidate actually said
    if llm_probe_mode and llm_probe_mode in _PROBE_FAMILIES:
        return llm_probe_mode
    if llm_probe_mode and llm_probe_mode in _MODE_ALIASES:
        return _MODE_ALIASES[llm_probe_mode]

    # Priority 3: rotation fallback — variety across turns on the same topic
    rotation_families = ["ownership", "outcome", "alternatives", "failure", "process"]
    safe_index = max(0, min(len(rotation_families) - 1, probe_rotation_index))
    selected_family = rotation_families[safe_index]

    # Gate: failure probe only on HIGH/CRITICAL topics
    if selected_family == "failure" and topic_importance not in ("CRITICAL", "HIGH"):
        return "alternatives"

    return selected_family


def build_directive(
    td: TurnDecision,
    depth_signal: str,
    collapse_stage: int = 0,
    uncovered_topics: Optional[list[str]] = None,
) -> str:
    """
    Build the NEXT_TURN_DIRECTIVE injected into the agent's context each turn.

    Single injection point — probe family goal+style is the only instruction.
    No duplicate signal blocks (those caused repeated same-angle questions).
    follow_up_collapse gets its own staged lines since it has L1/L2/L3 logic.
    depth_decay gets a plain MOVE_ON with a human-readable note.
    Everything else: one goal, one style, one probe intent line.
    """
    action = td["decision"]["action"]
    mode = td["decision"]["mode"]
    next_goal = td["decision"]["next_goal"]
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

    # depth_decay: candidate is fatiguing — plain note, action already set to MOVE_ON
    if "depth_decay" in active_signals:
        lines.append(
            "Candidate answer quality is declining. Move to the next topic naturally — "
            "keep the next question light and broad. Do not reference the decline."
        )

    # follow_up_collapse: staged L1/L2/L3 memory probe — needs its own multi-line logic
    if "follow_up_collapse" in active_signals:
        lines.extend(_build_collapse_probe_lines(collapse_stage, td.get("signal_events", [])))

    lines.append(f"NEXT MOVE: {next_goal}")

    if style and style != "No special probe needed.":
        lines.append(f"QUESTION STYLE: {style}")

    if action != "MOVE_ON":
        lines.append(
            "PROBE INTENT: Anchor your question to something specific they actually said — "
            "a project name, a tool, a number, a claim. Never open with a generic question."
        )

    if action == "MOVE_ON" and uncovered_topics:
        next_topic = uncovered_topics[0]
        lines.extend([
            f"BRIDGE NOW to: {next_topic}",
            "NEXT TOPIC LOCK: Current topic is closed. Your very next question must be about the bridge topic above.",
            "Do NOT ask another follow-up on the previous topic.",
        ])

    return "\n".join(lines)
