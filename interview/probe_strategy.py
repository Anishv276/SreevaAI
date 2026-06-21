"""
probe_strategy.py
One probe definition per signal. When a signal fires, the probe tells the
directive LLM exactly what happened and what to do — no families, no mapping.

get_probe_context() returns the full context block injected into the directive.
The directive LLM writes ANGLE + INTENT from it.
The interview LLM generates the actual question from the conversation.
"""
from __future__ import annotations


# ---------------------------------------------------------------------------
# Signal probes — one per signal, sharp and direct.
# Each entry:
#   signal   — what fired (matches SIGNAL_DEFINITIONS key in agent_scoring.py)
#   what     — what the candidate did that triggered this (1 line)
#   goal     — what you are trying to find out (1 line)
#   ask      — how to shape the question (2-3 sharp points, no examples)
#   skip     — what NOT to do (1-2 hard rules)
# ---------------------------------------------------------------------------
SIGNAL_PROBES: dict[str, dict] = {

    "ownership_ambiguous": {
        "signal":  "ownership_ambiguous",
        "what":    "Candidate used 'we/team/they' without saying what THEY personally did.",
        "goal":    "Find the one thing that was specifically theirs — their action, decision, or deliverable.",
        "ask": [
            "Anchor to something concrete they mentioned and ask what THEIR part in it was.",
            "Make it impossible to answer with 'we' — ask for their specific action or output.",
            "Ask what would have been different if they hadn't been on this.",
        ],
        "skip":    "Do not ask 'what was your role' — that got you here. Do not ask about the team.",
    },

    "example_evaded": {
        "signal":  "example_evaded",
        "what":    "Asked for a real story or instance. Got theory or 'usually I...' instead.",
        "goal":    "Get one specific real moment — not a type of thing, one actual time.",
        "ask": [
            "Force a memory: ask about a specific time, not how they generally do it.",
            "Push for an imperfect detail — what happened, what went wrong, what surprised them.",
            "Something only someone who lived it would know.",
        ],
        "skip":    "Do not ask 'can you give an example' — too easy to dodge again. Force specificity.",
    },

    "depth_insufficient": {
        "signal":  "depth_insufficient",
        "what":    "Candidate said WHAT they did. Never said HOW or WHY.",
        "goal":    "Get the mechanics — one real decision, step, or reason behind what they did.",
        "ask": [
            "Ask HOW one specific thing they named actually worked.",
            "Push for the decision behind it — why that way and not another.",
            "If they named a tool or output, ask what building it actually involved.",
        ],
        "skip":    "Do not ask 'can you tell me more' — too open. Pick one thing and ask about its mechanics.",
    },

    "surface_answer": {
        "signal":  "surface_answer",
        "what":    "Answer was correct but hollow — no names, no numbers, no real texture.",
        "goal":    "Get one concrete detail that proves they were actually there doing this.",
        "ask": [
            "Ask for one specific name, number, or outcome from what they described.",
            "Push for something measurable or named — not a description of a category.",
            "Find the one thing in their answer that could have been more specific and press on it.",
        ],
        "skip":    "Do not accept another generic answer. Any real answer has at least one specific thing in it.",
    },

    "tech_claim_unverified": {
        "signal":  "tech_claim_unverified",
        "what":    "Named a specific tool or tech but described it vaguely or generically.",
        "goal":    "Find out if they actually used it — a real user has at least one concrete memory.",
        "ask": [
            "Ask what they specifically BUILT or CONFIGURED with it — not what the tool does.",
            "Ask about something that requires hands-on knowledge to answer.",
            "What did they actually set up, connect, or write with it?",
        ],
        "skip":    "Do not ask what the tool is or why they chose it. Focus on what they DID with it.",
    },

    "new_tech_thread": {
        "signal":  "new_tech_thread",
        "what":    "Candidate mentioned a tool or approach not on their resume — unprompted reveal.",
        "goal":    "Pull this thread — if they brought it up unprompted, there is something real here.",
        "ask": [
            "Ask how they picked it up or what they used it for.",
            "Ask what surprised them about it or where it fit into their work.",
            "This is a positive signal — ask with genuine curiosity, not pressure.",
        ],
        "skip":    "Do not make this feel like a gotcha. They volunteered this — follow it warmly.",
    },

    "claim_not_demonstrated": {
        "signal":  "claim_not_demonstrated",
        "what":    "Made a strong claim about themselves with nothing concrete to back it up.",
        "goal":    "Get one real example that proves the claim — specific enough that a fake answer shows.",
        "ask": [
            "Ask for one real instance where that claim was actually tested.",
            "Push for something specific — a time, a project, an outcome.",
            "If they claim X, ask when X actually mattered and what happened.",
        ],
        "skip":    "Do not accept 'I always do X' or another general statement. Push for one real moment.",
    },

}

# Fallback probe when signal is null or unrecognised
_DEFAULT_PROBE = {
    "what":  "Candidate answered but something specific is missing or unresolved.",
    "goal":  "Find the most concrete or interesting thing in what they said and pull that thread.",
    "ask": [
        "Pick the most specific or unexpected thing they mentioned and ask about that.",
        "Push for one real detail — a name, a number, a decision, what happened next.",
    ],
    "skip":  "Do not ask a generic follow-up. Something in their answer is worth pulling — find it.",
}


def get_probe_context(
    *,
    signal: str | None,
    signal_reason: str | None,
    band: str,
    topic_follow_ups: int,
    is_closing_tier: bool,
    topic_denied: bool,
    prev_answer: str,
) -> str:
    """
    Returns the probe context block injected into the directive prompt.
    Sharp and direct — tells the directive LLM what fired, what it means,
    and exactly what kind of question to generate.
    """
    lines: list[str] = []

    # Denial override — always highest priority
    _prev_lower = prev_answer.lower()
    _is_denial = any(p in _prev_lower for p in (
        "i forgot", "i don't remember", "i dont remember",
        "i don't know", "i dont know", "not sure", "can't remember", "cant remember",
    ))
    if topic_denied or _is_denial:
        lines += [
            "SIGNAL: candidate_denial",
            "WHAT: Candidate said they don't know, forgot, or can't explain this.",
            "GOAL: Accept it and pivot — don't push on what they can't answer.",
            "ASK:",
            "  - One short acknowledgement ('No worries.' / 'Fair enough.'), then move.",
            "  - Pivot to what they DO remember, even vaguely.",
            "  - Or ask about something related they mentioned elsewhere in this thread.",
            "SKIP: Never ask them to reflect on what they should have done differently here.",
            "      Never re-ask what they forgot from a different angle.",
        ]
        return "\n".join(lines)

    # Closing tier — wrap this topic
    if is_closing_tier:
        lines += [
            "SIGNAL: topic_closing",
            "WHAT: Main facts on this topic are covered. Time to close it.",
            "GOAL: One honest reflective question to finish the topic well.",
            "ASK:",
            "  - What would they do differently if they built this again?",
            "  - What surprised them most, or what are they most proud of?",
            "  - Anchor to something SPECIFIC they actually said — not a generic reflection.",
            "SKIP: Do not open a new sub-topic. Do not ask about mechanics.",
        ]
        return "\n".join(lines)

    # Signal-based probe
    probe = SIGNAL_PROBES.get(signal or "", None) if signal else None
    if probe is None:
        probe = _DEFAULT_PROBE

    lines.append(f"SIGNAL: {signal or 'none'}")
    lines.append(f"WHAT: {probe['what']}")
    if signal_reason:
        lines.append(f"TRIGGER: \"{signal_reason}\"")
    lines.append(f"GOAL: {probe['goal']}")
    lines.append("ASK:")
    for point in probe["ask"]:
        lines.append(f"  - {point}")
    lines.append(f"SKIP: {probe['skip']}")

    # Band / turn overlays — sharp, one line each
    if topic_follow_ups <= 1:
        lines += [
            "NOTE: First probe on this topic. Pull the most interesting thing from their answer.",
            "      Not generic — find the specific detail worth digging into.",
        ]
    elif band == "fresher":
        lines += [
            "NOTE: Fresher. Don't push for tradeoffs. Ask HOW they actually did it in practice.",
        ]

    return "\n".join(lines)
