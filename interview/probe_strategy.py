"""
Probe strategy data — family definitions, signal routing table, and mode aliases.

These three dicts are imported directly by eval_pipeline.py to drive inline
probe family selection. All routing/directive-building functions have been
removed — eval_pipeline builds directives itself.
"""


_PROBE_FAMILIES: dict[str, dict[str, str]] = {

    # ── 1. OWNERSHIP — who built it and how ──────────────────────────────────
    # Covers: ownership, process, day-to-day work
    # Fires when: "we" language, vague ownership, no specifics on how
    "ownership": {
        "goal": (
            "Find out what was specifically theirs and how they actually did it. "
            "Based on what they just said, pick the most natural angle:\n"
            "  → If they used 'we' or 'the team': ask what their specific role was in that exact thing\n"
            "  → If ownership is clear but HOW is vague: ask what they actually did first / day-to-day\n"
            "  → If they named a tool or approach: ask how they decided to use it that way\n"
            "ONE question. Anchor to something they actually said."
        ),
        "style": (
            "Never ask a generic 'what did you do'. Tie it to something specific they just named. "
            "Feel: curious colleague, not HR form. "
            "Example angles: 'What was specifically your part in that?' / "
            "'Walk me through what you actually did on a typical day when building this.' / "
            "'How did you decide to approach it that way?'"
        ),
    },

    # ── 2. DEPTH — prove it with numbers, tradeoffs, constraints ─────────────
    # Covers: outcome, scale, alternatives
    # Fires when: claim without metric, vague success, no tradeoff reasoning
    "depth": {
        "goal": (
            "Push past the claim — get the real number, constraint, or tradeoff. "
            "Based on what they just said, pick the sharpest angle:\n"
            "  → If they claimed a result but gave no numbers: ask what the actual metric was\n"
            "  → If they described a choice: ask what else they considered and why they didn't go that way\n"
            "  → If they described a system: ask about scale — volume, load, users, budget, deadline\n"
            "  → If they said 'it worked': ask how they knew it was working\n"
            "ONE question. Make it specific to what they just said."
        ),
        "style": (
            "Curious, not auditing. You just want the real picture. "
            "Example angles: 'What did that look like in numbers?' / "
            "'What would have broken if you'd gone the other way?' / "
            "'How much volume were you actually dealing with?' / "
            "'What was different after this shipped — for the user or the business?'"
        ),
    },

    # ── 3. AUTHENTICITY — real memory vs rehearsed answer ────────────────────
    # Covers: evidence, verification, follow_up_collapse_staged
    # Fires when: answer sounds rehearsed, follow-up collapsed, claim with zero instance
    "authenticity": {
        "goal": (
            "Get something a rehearsed answer cannot provide — real memory, imperfect detail, texture. "
            "Based on what they just said, pick the angle that cuts deepest:\n"
            "  → If the answer sounds polished and clean: ask for the exact moment — who was there, what happened right before\n"
            "  → If they claimed a skill but gave no real usage: ask for one specific time they actually used it\n"
            "  → If their follow-up is shallower than their first answer: go back to something specific from the first answer and ask them to reconstruct it\n"
            "  → If they said 'I've done this many times': ask which one, right now\n"
            "ONE question. Real candidates answer with imperfect recall. Coached ones loop or go blank."
        ),
        "style": (
            "Not suspicious — genuinely curious about the real story. "
            "Example angles: 'Take me back to the moment that decision was made — what was going on right before that?' / "
            "'Give me one specific time you actually did that — which project?' / "
            "'You mentioned X in your first answer — tell me more about that specific part.' / "
            "'What's something about that project that surprised you — something you didn't expect?'"
        ),
    },

    # ── 4. PRESSURE — hard moments, mistakes, judgment calls ─────────────────
    # Covers: failure, situational, behavioral
    # Fires when: story is too clean, no friction mentioned, need to test real judgment
    "pressure": {
        "goal": (
            "Surface a real hard moment — something went wrong, a tough call was made, or real pressure hit. "
            "Based on what they just said, pick the most natural angle:\n"
            "  → If the story sounds too smooth: ask what broke or almost broke along the way\n"
            "  → If they described a decision: ask what would have happened if they'd been wrong\n"
            "  → If they mentioned a challenge: anchor a 'tell me about a time' to that exact theme\n"
            "  → If they described a constraint: ask how they handled it when the constraint tightened further\n"
            "ONE question. Real candidates answer this easily with messy detail. Coached ones give a perfect STAR story."
        ),
        "style": (
            "Warm curiosity — every real project has something. Never gotcha. "
            "Example angles: 'What broke along the way — or what almost did?' / "
            "'If you were doing this again, what would you do differently?' / "
            "'Tell me about a specific moment where something felt like it was going wrong.' / "
            "'What was your plan B if this hadn't worked?' / "
            "'Was there a call you made alone that you weren't sure about?'"
        ),
    },

    # ── 5. CLARIFICATION — inconsistency or answer collapsing ────────────────
    # Covers: clarification, compression
    # Fires when: inconsistency detected, answer getting shorter not longer
    "clarification": {
        "goal": (
            "Something isn't adding up — surface it or slow them down. "
            "Based on what triggered this:\n"
            "  → If they contradicted something said earlier: name both things and ask them to connect them — genuine confusion, not accusation\n"
            "  → If their answers are getting shorter and vaguer: go back to the beginning of the story and ask them to walk through it step by step\n"
            "ONE question. Don't accuse. Just be genuinely confused or ask them to slow down."
        ),
        "style": (
            "Never say 'you contradicted yourself'. Sound like you're trying to understand. "
            "Example angles: 'Wait — earlier it sounded like X, but now it sounds more like Y. Help me connect those.' / "
            "'Let's go back to the start of this — what actually happened first?' / "
            "'I lost the thread a bit — walk me through it from the beginning.' / "
            "'I want to make sure I got this right — which one is it?'"
        ),
    },

    # ── Sentinel: move on ────────────────────────────────────────────────────
    "normal": {
        "goal": "Topic sufficiently covered. Move to the next uncovered area from your interview plan.",
        "style": "No special probe needed.",
    },
}


_SIGNAL_TO_FAMILY = [
    # Integrity signals — highest priority
    ("follow_up_collapse",          "authenticity"),   # First answer strong, follow-up collapsed → probe real memory
    ("resume_claim_mismatch",       "clarification"),  # Resume vs answer mismatch → surface it

    # Ownership / depth signals
    ("ownership_ambiguity",         "ownership"),      # Heavy "we", unclear personal role
    ("example_evasion",             "ownership"),      # Claimed ownership, no specifics on HOW

    # Authenticity signals
    ("latency_mismatch",            "authenticity"),   # Answer compressed → probe memory not script
    ("complexity_latency_mismatch", "authenticity"),   # Hard Q answered instantly → probe real memory

    # Fatigue — move on
    ("depth_decay",                 "normal"),         # Quality declining cross-topic → move on
]


_MODE_ALIASES = {
    # LLM probe_mode values → merged family names
    "compression":     "clarification",
    "evidence":        "authenticity",
    "verification":    "authenticity",
    "process":         "ownership",
    "outcome":         "depth",
    "alternatives":    "depth",
    "failure":         "pressure",
    "situational":     "pressure",
    "behavioral":      "pressure",
    "tradeoff":        "depth",
    "specificity":     "ownership",
    "depth":           "authenticity",
}


