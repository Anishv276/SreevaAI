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


def build_probe_directive(
    *,
    probe_family: str,
    rotation_index: int,
    band: str,
    active_topic: str,
    prev_question: str,
    prev_answer: str,
    topic_follow_ups: int,
    is_closing_tier: bool,
    topic_denied: bool,
    overall_score: float,
    depth_score: float,
    discussed_log: list[str],
    asked_questions_log: list[str],
    skill_denial_count: int,
    covered_topics: list[str] | None = None,
) -> tuple[str, str]:
    """Build the complete PROBE [NEXT_TURN_DIRECTIVE] string.

    Returns (directive_string, effective_family) tuple.
    Called from agent_runtime.py.
    """
    prev_a_gist = " ".join(prev_answer.split()[:40])
    is_cant_remember = topic_denied or any(m in prev_answer.lower() for m in _CANT_REMEMBER_MARKERS)
    is_short = overall_score <= 0.5 and depth_score == 0.0 and len(prev_answer.split()) < 8

    memory = "\n".join(discussed_log[-5:])
    memory_block = f"\n[INTERVIEW MEMORY -- DO NOT RE-ASK THESE]\n{memory}\n" if memory else ""

    # Compact list of topics already finished -- keeps the LLM from drifting back
    # into something covered earlier (a major source of repeated questions).
    covered_block = ""
    _covered = [c for c in (covered_topics or []) if c]
    if _covered:
        _cov = "\n".join(f"  - {c}" for c in _covered[-10:])
        covered_block = (
            f"\n[ALREADY COVERED -- DO NOT RE-OPEN OR ASK ABOUT THESE AGAIN]\n{_cov}\n"
        )

    # Attribution guard -- a STANDALONE project must never be tied to an employer.
    # This is the per-turn enforcement of the PROJECT-vs-WORK rule (the static system
    # prompt alone was not enough: across a long context the LLM fused a [standalone]
    # project with a nearby company, e.g. asking "...at Social Rises" about a personal
    # project). Re-assert it on every probe turn while that topic is active.
    attribution_block = ""
    if "[standalone]" in (active_topic or "").lower():
        attribution_block = (
            "\n[ATTRIBUTION GUARD -- CRITICAL]\n"
            "This topic is a STANDALONE / personal project. It is NOT linked to any company.\n"
            "NEVER attach an employer name to it (no '...at <Company>').\n"
            "Ask about the project on its own terms.\n"
        )

    recent_q_block = ""
    if asked_questions_log:
        ql = "\n".join(f"  - {q}" for q in asked_questions_log[-6:])
        recent_q_block = (
            f"\n[QUESTIONS ALREADY ASKED -- DO NOT REPEAT OR CLOSELY REPHRASE ANY OF THESE]\n{ql}\n"
        )

    skill_denial_block = ""
    if skill_denial_count >= 3:
        skill_denial_block = (
            "\n[SKILL DENIAL PATTERN DETECTED]\n"
            f"The candidate has denied {skill_denial_count} consecutive skill questions.\n"
            "DO NOT ask another 'You mentioned X on your resume' question.\n"
            "Instead ask ONE open question: 'Of the skills on your resume, which one "
            "are you most confident in, and why?' -- then accept whatever they say and move on.\n"
        )

    if is_cant_remember:
        return (
            "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
            "DECISION: PROBE (REDIRECT)\n"
            f"TOPIC CONTEXT: {active_topic}\n"
            f"CANDIDATE SAID: \"{prev_a_gist}{'...' if len(prev_answer.split()) > 40 else ''}\"\n"
            "CANDIDATE SAID THEY DON'T REMEMBER OR DIDN'T BUILD IT.\n"
            "DO NOT push them to remember. DO NOT dwell on the gap.\n"
            "Instead, pick ONE of these redirects based on context:\n"
            "  -> If they don't remember details: ask what they DO remember -- even one small thing\n"
            "  -> If they didn't build it: ask what their actual role was, or what they worked on instead\n"
            "  -> If the topic has a specific tool/tech: ask if they've ever used it in any context\n"
            "Acknowledge with one word ('Okay.' / 'Fair enough.' / 'Got it.') then redirect.\n"
            "ONE question. Keep it light -- don't make them feel judged."
            f"{attribution_block}"
            f"{memory_block}"
            f"{covered_block}",
            "redirect",
        )

    short_nudge = (
        "\nCANDIDATE GAVE A VERY SHORT ANSWER -- push back warmly but directly.\n"
        "Don't just re-ask. React like a real interviewer who expected more:\n"
        "  - 'That's a start -- can you give me a bit more to work with?'\n"
        "  - 'I'd love to hear more than that -- what specifically did you do?'"
    ) if is_short else ""

    is_early = topic_follow_ups <= 1
    if is_closing_tier:
        depth_guard = _DEPTH_GUARDS["closing"]
        effective_family = "reflection"
    elif is_early:
        depth_guard = _DEPTH_GUARDS["early"]
        effective_family = probe_family
    elif band == "fresher":
        depth_guard = _DEPTH_GUARDS["established_fresher"]
        effective_family = probe_family
    else:
        depth_guard = _DEPTH_GUARDS["established"]
        effective_family = probe_family

    # For fresher band at established tier, depth-family goals contain tradeoff/alternatives
    # angles which the depth_guard explicitly bans. Reroute to ownership goals instead,
    # which focus on HOW they built it -- consistent with the guard.
    if depth_guard is _DEPTH_GUARDS["established_fresher"] and effective_family == "depth":
        effective_family = "ownership"

    goal = get_probe_goal(effective_family, rotation_index)
    style = get_probe_style(effective_family)

    return (
        "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
        f"DECISION: PROBE ({effective_family.upper()})\n"
        f"BAND: {band.upper()}\n"
        f"TOPIC CONTEXT: {active_topic}\n"
        "  ^ Use specific details from this (tools, systems, tech) to make your question "
        "concrete -- do NOT ask generically about 'the project'.\n"
        f"{depth_guard}\n"
        f"ANGLE: {goal}\n"
        f"HOW TO ASK: {style}\n"
        f"LAST QUESTION YOU ASKED: \"{prev_question}\"\n"
        f"CANDIDATE SAID: \"{prev_a_gist}{'...' if len(prev_answer.split()) > 40 else ''}\"\n"
        "DO NOT ask the same question again. DO NOT rephrase it.\n"
        "Pick the most natural angle from ANGLE/HOW TO ASK based on what they actually said.\n"
        "ONE question only. Sound natural.\n"
        "DO NOT wrap up or say goodbye -- the interview is still in progress."
        f"{attribution_block}"
        f"{short_nudge}"
        f"{memory_block}"
        f"{covered_block}"
        f"{recent_q_block}"
        f"{skill_denial_block}"
    ), effective_family


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


