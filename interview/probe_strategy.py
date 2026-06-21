"""
Probe strategy data -- family definitions, signal routing table, and mode aliases.
These three dicts are imported directly by eval_pipeline.py to drive inline
probe family selection. All routing/directive-building functions have been
removed -- eval_pipeline builds directives itself.
"""
import random
def _pick(options: list[str]) -> str:
    return random.choice(options)
# Each family has a "goals" list -- one is picked randomly per turn so the
# same signal type produces different question angles across sessions.
_PROBE_FAMILIES: dict[str, dict] = {
    # -- 1. OWNERSHIP -- who built it and how ----------------------------------
    "ownership": {
        "goals": [
            (
                "Find out what was specifically theirs and how they actually did it. "
                "Based on what they just said, pick the most natural angle:\n"
                "  -> If they used 'we' or 'the team': ask what their specific role was in that exact thing\n"
                "  -> If ownership is clear but HOW is vague: ask what they actually did first / day-to-day\n"
                "  -> If they named a tool or approach: ask how they decided to use it that way\n"
                "ONE question. Anchor to something they actually said."
            ),
            (
                "Get concrete about personal contribution. Pick one:\n"
                "  -> Ask them to walk through what they personally did on day one of this project\n"
                "  -> If they said 'we built': ask what specifically would not have existed without them\n"
                "  -> If they named a deliverable: ask who reviewed it and what feedback they got\n"
                "ONE question only. Make it feel like natural curiosity, not an audit."
            ),
            (
                "Surface the real personal role -- what they decided, not what the team did.\n"
                "  -> If 'we' language: ask what the split of work looked like and which part was theirs\n"
                "  -> If they described a process: ask what they changed or improved in that process\n"
                "  -> If they mentioned a tool: ask who chose that tool and why\n"
                "ONE question. Grounded in what they just said."
            ),
        ],
        "style": (
            "Never ask a generic 'what did you do'. Tie it to something specific they just named. "
            "Feel: curious colleague, not HR form."
        ),
    },
    # -- 2. DEPTH -- prove it with numbers, tradeoffs, constraints -------------
    "depth": {
        "goals": [
            (
                "Push past the claim -- get the real number, constraint, or tradeoff. "
                "Based on what they just said, pick the sharpest angle:\n"
                "  -> If they claimed a result but gave no numbers: ask what the actual metric was\n"
                "  -> If they described a choice: ask what else they considered and why they didn't go that way\n"
                "  -> If they described a system: ask about scale -- volume, load, users, budget, deadline\n"
                "  -> If they said 'it worked': ask how they knew it was working\n"
                "ONE question. Make it specific to what they just said."
            ),
            (
                "Get the real picture behind the claim:\n"
                "  -> If they gave a vague outcome: ask what changed for the end user after this shipped\n"
                "  -> If they described an approach: ask what the alternative was and why they ruled it out\n"
                "  -> If they mentioned a constraint: ask how tight that constraint actually was in practice\n"
                "ONE question. Specific to something they actually said."
            ),
            (
                "Find the tradeoff or the real constraint:\n"
                "  -> If they made a technical decision: ask what they had to give up to make it work\n"
                "  -> If they described a timeline: ask what got cut or descoped to hit it\n"
                "  -> If they claimed success: ask what the hardest part of getting there was\n"
                "ONE question. No leading -- let them fill in the detail."
            ),
        ],
        "style": (
            "Curious, not auditing. You just want the real picture. "
            "Example angles: 'What did that look like in numbers?' / "
            "'What would have broken if you'd gone the other way?'"
        ),
    },
    # -- 3. AUTHENTICITY -- real memory vs rehearsed answer --------------------
    "authenticity": {
        "goals": [
            (
                "Get something a rehearsed answer cannot provide -- real memory, imperfect detail, texture. "
                "Based on what they just said, pick the angle that cuts deepest:\n"
                "  -> If the answer sounds polished and clean: ask for the exact moment -- who was there, what happened right before\n"
                "  -> If they claimed a skill but gave no real usage: ask for one specific time they actually used it\n"
                "  -> If their follow-up is shallower than their first answer: go back to something specific from the first answer\n"
                "ONE question. Real candidates answer with imperfect recall."
            ),
            (
                "Get a specific instance -- not a description of a type of thing they do:\n"
                "  -> Ask them to name the actual project or moment -- not 'a time when' but 'which one'\n"
                "  -> If they gave an example: ask what happened right after and whether it went the way they expected\n"
                "  -> If they described a pattern: ask for the one that stands out most and why\n"
                "ONE question. Specific, grounded, real."
            ),
            (
                "Test for real recall versus a rehearsed script:\n"
                "  -> Ask about something peripheral to the story -- who they worked with, what the team said, what surprised them\n"
                "  -> If they gave a smooth answer: ask what they would do differently if they had to do it again right now\n"
                "  -> If they cited an achievement: ask what almost went wrong while getting there\n"
                "ONE question. Something only someone who lived it would know."
            ),
        ],
        "style": (
            "Not suspicious -- genuinely curious about the real story. "
            "Example: 'Take me back to that moment -- what was going on right before that decision?'"
        ),
    },
    # -- 4. PRESSURE -- hard moments, mistakes, judgment calls -----------------
    "pressure": {
        "goals": [
            (
                "Surface a real hard moment -- something went wrong, a tough call was made, or real pressure hit. "
                "Based on what they just said, pick the most natural angle:\n"
                "  -> If the story sounds too smooth: ask what broke or almost broke along the way\n"
                "  -> If they described a decision: ask what would have happened if they'd been wrong\n"
                "  -> If they mentioned a challenge: anchor to that exact theme\n"
                "ONE question. Real candidates answer this easily with messy detail."
            ),
            (
                "Find the friction in the story -- every real project has some:\n"
                "  -> Ask what they were most worried about at the start, and whether it played out that way\n"
                "  -> If they described a process: ask what the hardest part of actually doing it was, not planning it\n"
                "  -> If they described a team situation: ask about a moment where there was disagreement\n"
                "ONE question. Let them tell you what was hard -- don't tell them."
            ),
            (
                "Get to a real decision under pressure:\n"
                "  -> Ask about a call they made that they weren't fully sure about at the time\n"
                "  -> If they described a delivery: ask what they had to cut or compromise to ship\n"
                "  -> If they mentioned a stakeholder: ask about a moment where they had to push back\n"
                "ONE question. Warm, curious -- not interrogation."
            ),
        ],
        "style": (
            "Warm curiosity -- every real project has something. Never gotcha. "
            "Example: 'What broke along the way -- or what almost did?'"
        ),
    },
    # -- 5. CLARIFICATION -- inconsistency or answer collapsing ----------------
    "clarification": {
        "goals": [
            (
                "Something isn't adding up -- surface it or slow them down. "
                "Based on what triggered this:\n"
                "  -> If they contradicted something said earlier: name both things and ask them to connect them\n"
                "  -> If their answers are getting shorter and vaguer: ask them to walk through it step by step from the start\n"
                "ONE question. Don't accuse. Just be genuinely confused."
            ),
            (
                "Slow the pace and get clarity:\n"
                "  -> If the answer jumped around: ask them to start from the beginning and go step by step\n"
                "  -> If they used a term vaguely: ask exactly what they mean by it in this context\n"
                "  -> If two things they said seem to conflict: point to both and ask which one is right\n"
                "ONE question. Sound like you're trying to understand, not catch them out."
            ),
            (
                "Surface the inconsistency gently:\n"
                "  -> Say you got a bit lost and ask them to re-trace a specific part of what they described\n"
                "  -> If an earlier claim and a later one don't match: name them both and ask how they fit together\n"
                "  -> If they were vague on who did what: ask them to be specific about that one part\n"
                "ONE question. Tone: curious, not suspicious."
            ),
        ],
        "style": (
            "Never say 'you contradicted yourself'. Sound like you're trying to understand. "
            "Example: 'I lost the thread a bit -- can you walk me through that part again from the start?'"
        ),
    },
    # -- 6. REFLECTION -- last question on a project; surface judgment/learning
    # Only fired when the agent's CLOSING tier explicitly forces this family
    # (resume project, follow_ups >= N, sat >= ~60%, not yet fired on this topic).
    # Never picked by signal routing or rotation.
    "reflection": {
        "goals": [
            (
                "This is the CLOSING question on this project -- surface judgment, learning, "
                "or self-awareness. Pick whichever feels most natural given what they have said:\n"
                "  -> If you had to rebuild this project today, what would you change and why?\n"
                "  -> Looking back, is there one decision you would make differently?\n"
                "  -> What did this project teach you that you did not expect going in?\n"
                "ONE question. Anchor to a specific detail they already mentioned so it does not "
                "feel like a generic template."
            ),
            (
                "This is the CLOSING question on this project -- invite honest self-assessment. "
                "Pick whichever fits best:\n"
                "  -> What part of this project are you most proud of, and why?\n"
                "  -> Where do you think it falls short -- what would not survive real-world use?\n"
                "  -> If a more senior engineer reviewed your work, what would they push back on?\n"
                "ONE question. Tone: warm, genuinely curious -- not stress-testing."
            ),
        ],
        "style": (
            "Warm, reflective. You are inviting them to step back and evaluate their own work, "
            "not interrogating. Example: 'If you rebuilt this today, what would you change first?'"
        ),
    },
    # -- Sentinel: move on ----------------------------------------------------
    "normal": {
        "goals": ["Topic sufficiently covered. Move to the next uncovered area from your interview plan."],
        "style": "No special probe needed.",
    },
}
_CANT_REMEMBER_MARKERS: tuple[str, ...] = (
    "not sure", "i forgot", "long time ago", "old project", "not really",
    "didn't build", "did not build", "i wasn't", "i was not",
    "never worked", "never used", "haven't worked", "havent worked",
    "haven't used", "havent used", "haven't done", "havent done",
    "no experience",
)
_DEPTH_GUARDS: dict[str, str] = {
    "closing": (
        "\nTOPIC DEPTH: CLOSING -- this is the LAST probe on this project before MOVE_ON.\n"
        "  -> Ask ONE reflective question to surface judgment, learning, or self-awareness.\n"
        "     Pick whichever fits most naturally given what they have already said:\n"
        "       * If you rebuilt this project today, what would you change and why?\n"
        "       * Looking back, is there one decision you would make differently?\n"
        "       * What did this project teach you that you did not expect going in?\n"
        "  -> Anchor to a SPECIFIC tool, choice, or detail they mentioned earlier -- not generic.\n"
        "  -> Do NOT ask another 'what was your role / what part did you build' question."
    ),
    "early": (
        "\nTOPIC DEPTH: EARLY -- this is one of the FIRST questions on this topic.\n"
        "  -> Stay at the SURFACE first: what they personally built, what problem it solved,\n"
        "     or what their role was. Establish the WHAT before the HOW.\n"
        "  -> Do NOT jump into deep mechanics or step-by-step walkthroughs yet.\n"
        "  -> Anchor to a concrete detail from TOPIC CONTEXT so they know exactly what you mean."
    ),
    "established_fresher": (
        "\nTOPIC DEPTH: ESTABLISHED (FRESHER BAND).\n"
        "  -> Probe HOW they built it: what did they actually do step by step?\n"
        "  -> Ask about WHAT HAPPENED: what worked, what broke, what surprised them.\n"
        "  -> Do NOT ask about tradeoffs, alternatives considered, or architectural decisions.\n"
        "     Frame tool choices as curiosity: 'Why did you pick X?' not 'What alternatives did you consider?'\n"
        "  -> Ownership is the goal: what was SPECIFICALLY theirs?"
    ),
    "established": (
        "\nTOPIC DEPTH: ESTABLISHED -- they've set the WHAT, now go deeper "
        "into mechanics, decisions, or tradeoffs."
    ),
}
def get_probe_goal(family: str, rotation_index: int = 0) -> str:
    """Return a goal string for the given probe family.
    H5 fix: accepts an explicit rotation_index so the agent advances through
    the goal list deterministically (one step per PROBE turn) instead of
    picking randomly each turn.  The agent reads probe_rotation_index from
    TopicState and passes it here, then increments and persists the new index.
    Falls back to index 0 when called without an explicit index.
    """
    fam = _PROBE_FAMILIES.get(family, _PROBE_FAMILIES["normal"])
    goals = fam.get("goals", [fam.get("goal", "Probe the candidate.")])
    return goals[rotation_index % len(goals)]
def get_probe_style(family: str) -> str:
    fam = _PROBE_FAMILIES.get(family, _PROBE_FAMILIES["normal"])
    return fam.get("style", "")
# Signal-to-probe-family routing table. Ordered by priority -- when multiple
# signals fire on the same turn, the first match in this list wins.
#
# Priority rationale:
#   follow_up_collapse     -- most serious: first answer was strong but follow-up
#                             collapsed, suggests the first answer was rehearsed.
#   weak_technical_hedge  -- inconsistency between resume and answer, surface it.
#   complexity/latency     -- suspicious timing, test real memory.
#   ownership_ambiguity    -- heavy "we" language, find personal contribution.
#   example_evasion        -- dodged example with theory, test real experience.
#   depth_decay (mild)     -- quality dipping, one pressure probe before giving up.
_SIGNAL_TO_FAMILY: list[tuple[str, str]] = [
    ("follow_up_collapse",          "authenticity"),
    ("weak_technical_hedge",       "clarification"),
    ("complexity_latency_mismatch", "authenticity"),
    ("latency_mismatch",            "authenticity"),
    ("ownership_ambiguity",         "ownership"),
    ("example_evasion",             "authenticity"),
    ("depth_decay",                 "pressure"),
    ("depth_decay_mild_pressure",   "pressure"),
]
_MODE_ALIASES = {
    # LLM probe_mode values -> merged family names
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
