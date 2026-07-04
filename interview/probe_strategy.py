"""
probe_strategy.py
One probe per signal. Tells the interview LLM what fired, what it means,
and how to frame the follow-up — without scripting the exact question.

Signal names match two types:
  RESPONSE signals (fired by G0 gates): pure_denial, denial_with_continuation, clarification_request, rephrase_request, off_topic
  CONTENT signals (fired by G1-G7 gates): example_evaded, depth_ceiling_hit, ownership_ambiguous, explanation_shallow,
                                            tool_named_not_used, tech_choice_unjustified, scenario_untested
"""
from __future__ import annotations


# ---------------------------------------------------------------------------
# HOW THESE PROBES WORK
#
# Each probe has:
#   what          -- what the candidate did (1 line, factual)
#   goal          -- the ONE thing the next question is trying to surface
#   question_type -- the cognitive demand placed on the candidate
#   principles    -- HOW to frame the question (not what to say -- principles)
#   voice_note    -- how a real human interviewer would sound asking this
#   skip          -- hard rules on what NOT to do
#
# The interview LLM reads these and writes its OWN question grounded in
# the candidate's actual words. The probes teach the framing principle,
# not the script.
# ---------------------------------------------------------------------------

SIGNAL_PROBES: dict[str, dict] = {

    # ---- RESPONSE-LEVEL SIGNALS (G0) ----
    # pure_denial fires: automatic MOVE_ON, no probe needed
    # clarification_request and rephrase_request: LLM needs to know what to ask

    "clarification_request": {
        "what":          "Candidate asked you to clarify or rephrase the question.",
        "goal":          "Ask the same question again, but in simpler, clearer language.",
        "question_type": "CLARIFICATION REPHRASE",
        "principles": [
            "Use simpler vocabulary — avoid jargon you used before.",
            "Break the question into smaller parts if it was complex.",
            "Give a concrete example or context to anchor it.",
            "Make it obvious what you're asking for — be direct.",
        ],
        "voice_note":    "Helpful and patient. A real interviewer might say: 'Sure, let me rephrase that. What I meant was...'",
        "skip":          "Never ask the exact same question again. Never sound frustrated or annoyed. "
                         "Never explain why they didn't understand the first time.",
    },

    "rephrase_request": {
        "what":          "Candidate asked to restart or correct their own answer.",
        "goal":          "Listen to their new answer instead of the first one. Treat this as their real answer.",
        "question_type": "REDO / CORRECTION",
        "principles": [
            "Accept the redo gracefully — don't compare it to the first answer.",
            "Score this new answer fresh, not against what they said before.",
            "If the new answer is better, use it. If it's the same, that's fine too.",
            "Don't ask them to clarify the first answer — move forward with the second one.",
        ],
        "voice_note":    "Encouraging and open. A real interviewer might say: 'Of course, go ahead. Take your time.'",
        "skip":          "Never say 'you said X before, but now you're saying Y'. "
                         "Never judge them for changing their answer. "
                         "This is about them getting it right, not catching inconsistencies.",
    },

    "off_topic": {
        "what":          "Candidate answered a different question than what you asked.",
        "goal":          "Redirect them back to your original question clearly.",
        "question_type": "REDIRECT",
        "principles": [
            "Name what they answered instead — 'I heard you say... but I was asking about...'",
            "Re-ask your original question, word-for-word if needed.",
            "Make it clear you value what they said, but need to stay on track.",
            "Don't make them feel bad for the pivot — it happens.",
        ],
        "voice_note":    "Warm and direct. A real interviewer might say: 'That's interesting, but let me get back to my original question: [re-ask]'",
        "skip":          "Never sound annoyed or accusatory. Never dismiss what they said. "
                         "Never ask 'why did you answer that when I asked something else' — just redirect.",
    },

    "denial_with_continuation": {
        "what":          "Candidate started with denial ('I don't...') but then added substantive content.",
        "goal":          "Dig deeper into the substantive part they mentioned, ignore the denial frame.",
        "question_type": "PROBE PARTIAL ADMISSION",
        "principles": [
            "Name what they DID (the continuation part) — 'You mentioned you built X, tell me about that.'",
            "Ask specifically about the work they admitted to, not the thing they denied.",
            "Treat their partial admission as real experience and probe it like any other answer.",
            "Don't dwell on the denial — move straight to what they actually did.",
        ],
        "voice_note":    "Direct and forward-looking. A real interviewer might say: 'You mentioned you deployed things — walk me through one of those deployments.'",
        "skip":          "Never say 'you said you didn't have experience, but then you said you did' — contradictory framing wastes time. "
                         "Never make them defend the contradiction. Just ask about what they actually did.",
    },

    # ---- CONTENT-LEVEL SIGNALS (G1-G7) ----

    "example_evaded": {
        "what":          "They gave a general rule or habit when a real story was asked for.",
        "goal":          "Get one specific moment that actually happened — a real time, not a type of time.",
        "question_type": "MEMORY RETRIEVAL",
        "principles": [
            "FIRST PROBE: Pin it to a specific moment — 'one time', 'a specific project', 'that one instance'.",
            "Name something they said and ask when that actually happened.",
            "Invite imperfection — real memories have friction. Ask what went wrong or surprised them.",
            "Make it impossible to answer with 'usually' again — force a time and place.",
            "ESCALATION (if fired 2+ times): Pivot from 'one specific time' to different angles:",
            "  - Ask about a DECISION they made (not a story)",
            "  - Ask about a TOOL or TECHNOLOGY they used",
            "  - Ask about a CONSTRAINT they hit (budget, time, resources)",
            "  - Ask 'what would you do DIFFERENTLY if you rebuilt it?' (reflection, not memory)",
        ],
        "voice_note":    "Sound curious, not accusatory. You want the story, not to catch them out. "
                         "A real interviewer might say: 'Give me one specific time that happened — not generally, one real instance.' "
                         "OR if they keep evading: 'Forget the story. What was ONE DECISION you personally made on that? "
                         "Or what broke? Or what tool did you have to use?'",
        "skip":          "Never ask 'can you give me an example' — too easy to dodge again with another pattern. "
                         "Never repeat the same angle 3+ times — pivot to decision/tool/constraint/reflection angles instead.",
    },

    "depth_ceiling_hit": {
        "what":          "They tried to answer but hit the edge of their knowledge and ran out.",
        "goal":          "Find the floor — the smallest, most concrete thing they DO know on this topic.",
        "question_type": "FLOOR FINDER",
        "principles": [
            "Don't push on the exact thing they ran out on — there's nothing there.",
            "Narrow down to the smallest adjacent thing they might have touched.",
            "Give them an easy entry: 'even the smallest step you ran yourself is fine'.",
            "Accept the limit gracefully — don't make them feel punished for not knowing.",
        ],
        "voice_note":    "Warm and low-pressure. A real interviewer might say: 'No worries — what part of this did you actually get your hands on, even briefly?'",
        "skip":          "Never re-ask the same question at a different angle — they have nothing more there. "
                         "Never make it feel like a test they are failing.",
    },

    "ownership_ambiguous": {
        "what":          "'We/team/they' throughout — their personal contribution is invisible.",
        "goal":          "Isolate the ONE thing that was specifically theirs — their action, decision, or output.",
        "question_type": "PERSONAL ISOLATION",
        "principles": [
            "Pick one specific thing they mentioned and ask what THEIR part in that was.",
            "Frame it so 'we' is not a valid answer — ask for their specific action or output.",
            "Tie the question to the topic and context, not a generic 'what did you do'.",
            "If they mentioned a deliverable, ask what they personally contributed to it.",
            "VARY the angle each time this fires — never fall back to the same canned "
            "'what was specifically yours?' line. Rotate between: naming a piece they mentioned and "
            "asking what they did on it; asking which decision in the process was theirs to make; "
            "asking what they'd have done differently if they'd been alone on it; asking what part "
            "they'd be able to rebuild from scratch without the team.",
        ],
        "voice_note":    "Direct but not aggressive. Examples of DIFFERENT angles a real interviewer might use "
                         "(pick whichever fits their actual answer, don't default to the first one every time): "
                         "'Out of everything you described, which piece did you personally drive end to end?' / "
                         "'If the team wasn't there, what part could you have built alone?' / "
                         "'Which of those decisions was actually yours to make?'",
        "skip":          "Never ask 'what was your role' — that is what got you here. "
                         "Never ask about the team again. Never use a generic anchor like 'what did you build', "
                         "and never repeat the exact same probe wording twice in one interview — "
                         "ground it in something specific from their actual answer.",
    },

    "explanation_shallow": {
        "what":          "They claimed strong personal ownership or ability but the explanation is hollow — describes it like an outsider would.",
        "goal":          "Get them inside the thing they claimed — one real decision they made, one constraint they hit, one thing that was hard.",
        "question_type": "TEACH-BACK / OPEN THE BOX",
        "principles": [
            "Ask them to go inside the thing they claimed — a real builder can describe the internals.",
            "Ask about something that would only exist if they actually did it: a decision point, a tradeoff, something that didn't work at first.",
            "A teach-back works well: ask how they'd explain this to someone new — real understanding shows in simplification.",
            "Tie the question directly to their specific claim — not a generic 'how did it work'.",
        ],
        "voice_note":    "Curious and open. A real interviewer might say: 'You said you built the whole thing — what was the trickiest part to get right?' "
                         "Or: 'If you were walking a new teammate through it, where would you start?'",
        "skip":          "Never ask 'what did you build' or 'what was your role' — they already claimed everything. "
                         "The gap is depth of understanding, not ownership. Don't ask them to claim it again — ask them to prove it.",
    },

    "tool_named_not_used": {
        "what":          "A specific tool, method, or framework was named — then defined or abandoned. No evidence of using it.",
        "goal":          "Get ONE concrete memory of operating it — something only someone who actually used it would know.",
        "question_type": "HANDS-ON VERIFICATION",
        "principles": [
            "Pick the ONE most central tool they named and go deep on only that one.",
            "Ask what they did WITH it — a step they ran, something they built, a problem it caused.",
            "Ask something that requires hands-on knowledge to answer — a real user has at least one specific memory.",
            "If they named multiple tools, pick the one most relevant to the topic and anchor on that.",
        ],
        "voice_note":    "Specific and grounded. A real interviewer might say: 'You mentioned [tool] — what did you actually do with it in the project?' "
                         "Or: 'Walk me through one thing you built or ran using [tool].'",
        "skip":          "Never ask what the tool IS — that just invites another definition. "
                         "Never ask about all named tools at once — one tool, one deep question. "
                         "Never ask why they chose it — that is a different signal.",
    },

    "tech_choice_unjustified": {
        "what":          "They clearly used the tool/method (real usage shown) but never explained WHY that one over alternatives.",
        "goal":          "Surface the decision behind the choice — was it deliberate, a default, or someone else's call?",
        "question_type": "COMPARATIVE RATIONALE",
        "principles": [
            "Name a real alternative to what they used and ask why they chose theirs over that one.",
            "Push for the deciding factor — what specifically made them pick this over the obvious other option.",
            "If it might not have been their decision, ask who made the call and what the reason was.",
            "Make the comparison concrete — 'why X instead of Y' is far sharper than 'why X'.",
        ],
        "voice_note":    "Genuinely curious. A real interviewer might say: 'You went with [tool] — why that one over [real alternative]?' "
                         "Or: 'What made you pick [method] here instead of [other approach]?'",
        "skip":          "Never ask what the tool does — they already showed they used it. "
                         "Always name a specific real alternative — an open 'why did you choose it' is too easy to deflect.",
    },

    "scenario_untested": {
        "what":          "Gave a correct textbook description — accurate but frictionless, no lived edge case or failure.",
        "goal":          "Stress-test whether the knowledge is real by presenting a scenario only a practitioner could handle.",
        "question_type": "SCENARIO STRESS-TEST",
        "principles": [
            "Present a realistic failure or edge case grounded in what they described.",
            "Ask what they'd do or check first — not to explain the concept again, but to solve a real problem.",
            "Pick something from their answer that could go wrong and ask what happens when it does.",
            "A good scenario question is one that textbook knowledge alone cannot answer correctly.",
        ],
        "voice_note":    "Conversational and real-world. A real interviewer might say: 'Say your similarity search started returning irrelevant results — what would you check first?' "
                         "Or: 'What happens if a lead goes cold right before close — how do you handle that?'",
        "skip":          "Never ask them to repeat or expand the flow — they already gave the textbook version. "
                         "The scenario must connect to what they specifically described, not a generic hypothetical.",
    },

}

# Fallback probe when signal is null or unrecognised
_DEFAULT_PROBE = {
    "what":          "Candidate answered, but something specific is still missing or unresolved.",
    "goal":          "Find the most concrete or interesting thread in what they said and pull it.",
    "question_type": "OPEN PULL",
    "principles": [
        "Pick the most specific or unexpected thing they mentioned and ask only about that.",
        "Push for one real detail — a number, a decision, a name, what happened next.",
        "Don't ask them to elaborate generally — pick one thing and go deep on it.",
    ],
    "voice_note":    "Curious and specific. Don't ask them to 'tell you more' — find the one thing worth digging into.",
    "skip":          "Never ask a generic 'tell me more'. Something in their answer is worth pulling — find it and name it.",
}


# ---------------------------------------------------------------------------
# Band overlays -- per-signal, per-band.
# Adjusts the depth and stakes of the probe based on seniority.
# ---------------------------------------------------------------------------
_BAND_OVERLAYS: dict[str, dict[str, str]] = {

    "example_evaded": {
        "fresher":     "A real moment from a college project, internship, or side project counts — keep the bar accessible.",
        "mid":         "Push for a real work moment — a specific project or client situation, not a classroom exercise.",
        "experienced": "The instance must come from real professional work. Push for the moment, not the category.",
        "senior":      "Push for an instance with real stakes — a decision that had real consequences for the business or team.",
    },
    "depth_ceiling_hit": {
        "fresher":     "Accept the limit quickly — redirect to the smallest adjacent thing they may have touched.",
        "mid":         "One gentle redirect to a related area before moving on.",
        "experienced": "Note the ceiling — a knowledge gap here is meaningful at this level. Move on cleanly.",
        "senior":      "A ceiling hit at senior level is a significant signal — acknowledge it and move on without dwelling.",
    },
    "ownership_ambiguous": {
        "fresher":     "Ask for their single concrete task — one action they personally did is enough.",
        "mid":         "Ask what decision or deliverable was specifically theirs in that work.",
        "experienced": "Ask which part they owned end-to-end and what that required of them personally.",
        "senior":      "Ask what decision was theirs to make — probe leadership ownership, not just task execution.",
    },
    "explanation_shallow": {
        "fresher":     "Ask HOW they did it step by step — don't push for tradeoffs or architectural rationale.",
        "mid":         "Ask what the hardest part was and what they did about it.",
        "experienced": "Ask about a design or process decision — why it's built or structured the way it is.",
        "senior":      "Ask what tradeoffs they weighed and what they'd do differently if they rebuilt it now.",
    },
    "tool_named_not_used": {
        "fresher":     "Even a tutorial or small exercise counts — ask what they ran or tried with it.",
        "mid":         "Ask what they built or configured with it in a real project context.",
        "experienced": "Push for a specific problem it solved and what the hands-on work actually involved.",
        "senior":      "Ask how it fit into the larger system and what the integration or adoption decision looked like.",
    },
    "tech_choice_unjustified": {
        "fresher":     "They may not have had a choice — ask if they considered anything else at all, even briefly.",
        "mid":         "Expect a simple reason — performance, ease of use, prior familiarity.",
        "experienced": "Expect a real tradeoff — what they gave up by choosing this over the alternative.",
        "senior":      "Expect a considered decision with second-order consequences — why this at scale, not just in a small project.",
    },
    "scenario_untested": {
        "fresher":     "Keep the scenario simple — a basic failure they would have hit in a student or side project.",
        "mid":         "A realistic operational problem — something that comes up in real work.",
        "experienced": "A failure at scale or an edge case requiring real operational experience to handle.",
        "senior":      "A systemic or architectural failure — what breaks at scale and how would they design around it.",
    },
}


# ---------------------------------------------------------------------------
# Intent-based reactions.
# The opener ("filler") must match the INTENT of what the candidate just said,
# not a fixed "Mm". The signal that fired encodes that intent -- so we map each
# signal to a reaction TONE plus example openers. The model is told to react in
# that tone and ground it in a specific word they used, so openers vary
# naturally turn to turn instead of defaulting to "Mm".
# ---------------------------------------------------------------------------
_SIGNAL_REACTIONS: dict[str, dict] = {
    "example_evaded": {
        "tone": "gently redirecting — you accept the general point but want the real instance",
        "openers": ["Sure, generally —", "Okay, in general terms —", "Right, but specifically —"],
    },
    "depth_ceiling_hit": {
        "tone": "warm and reassuring — make it safe that they ran out",
        "openers": ["No worries —", "That's alright —", "Fair enough —"],
    },
    "ownership_ambiguous": {
        "tone": "neutral and matter-of-fact — you noticed it was a team effort",
        "openers": ["Right, the team —", "Okay, so collectively —", "Got it, a group effort —"],
    },
    "explanation_shallow": {
        "tone": "lightly impressed then probing — acknowledge the claim, then test it",
        "openers": ["That's a big claim —", "Okay, the whole thing —", "Strong statement —"],
    },
    "tool_named_not_used": {
        "tone": "curious — pick up the specific tool name they dropped",
        "openers": ["Okay, [tool] —", "[tool], right —", "Ah, you mentioned [tool] —"],
    },
    "tech_choice_unjustified": {
        "tone": "genuinely interested in the decision",
        "openers": ["Interesting choice —", "Okay, [tool] —", "Makes sense you used it —"],
    },
    "scenario_untested": {
        "tone": "engaged and conversational — you followed the flow",
        "openers": ["Right, that flow makes sense —", "Okay, I follow —", "Mm, clean process —"],
    },
}


def get_reaction_hint(signal: str | None, prev_answer: str) -> str:
    """
    Returns a one-line reaction directive matching the INTENT of the answer
    (via the fired signal), so the opener varies and fits what they said.
    """
    r = _SIGNAL_REACTIONS.get(signal or "")
    if not r:
        return ("REACTION: open with a short, specific beat that reacts to a real word they used "
                "(not a generic 'Mm'). 2-4 words, then your question.")
    return (
        f"REACTION TONE: {r['tone']}.\n"
        f"  Example openers (adapt — replace [tool] with the real thing they named, vary the wording): "
        f"{' / '.join(r['openers'])}\n"
        f"  Make it specific to what they actually said. Do NOT default to a bland 'Mm' or 'Hmm'."
    )


# ---------------------------------------------------------------------------
# Question-generation system prompt -- injected into the interview LLM.
# This is what makes Ishita sound like a real human interviewer.
# ---------------------------------------------------------------------------
QUESTION_GENERATION_SYSTEM = """\
You are Ishita, a sharp and warm AI interviewer. You are conducting a real interview — not filling out a form.

Your job this turn: ask ONE follow-up question based on what the candidate just said.

OPEN WITH A REACTION THAT FITS WHAT THEY SAID:
- The PROBE DIRECTIVE includes a REACTION TONE. Open with a 2-4 word beat in that tone.
- Ground the reaction in a SPECIFIC word they used — a tool they named, a claim they made, the team they credited.
- NEVER default to a bland 'Mm' or 'Hmm' every time. The opener should be different each turn because
  it reacts to different content. A bold claim gets a different beat than someone who ran out of answers.
- Never say 'Great!', 'Awesome!', 'That's interesting!' — hollow filler.

THEN ASK ONE QUESTION:
- ONE question mark only. Never two questions in one turn.
- Reference something specific they actually said — never ask in a vacuum.
- Short is better. 1-2 sentences. The question should land, not explain itself.
- This is voice — write like you'd speak it, not like you'd type it.
- Never say 'Can you' or 'Could you' — form-filler phrases.

MATCH THE QUESTION TYPE:
The PROBE DIRECTIVE tells you the gap detected, the goal, and the QUESTION TYPE
(memory retrieval / floor finder / personal isolation / teach-back / hands-on verification /
comparative rationale / scenario stress-test). Your question must match that type —
but the words are yours, grounded in what they said. Never copy template phrases from the directive.
"""


def get_probe_context(
    *,
    signal: str | None,
    signal_reason: str | None,
    band: str,
    topic_follow_ups: int,
    topic_denied: bool,
    prev_answer: str,
    signals_history: list[str] | None = None,
    active_topic: str = "",
) -> str:
    """
    Returns the probe context block injected into the directive.
    Tells the interview LLM what fired, what it means, and how to frame
    the next question — without scripting the exact words.

    signals_history: full ordered list of signals fired on this topic INCLUDING
      the current one. Used to detect when the same signal has fired 2+ times
      so the probe can pivot to a different section of the topic instead of
      asking another follow-up on the same angle.
    """
    lines: list[str] = []
    _signals_history = signals_history or []
    _same_signal_repeated = (
        len(_signals_history) >= 2
        and signal is not None
        and _signals_history[-1] == signal
        and _signals_history[-2] == signal
    )

    # Denial override -- always highest priority
    _prev_lower = prev_answer.lower()
    _is_denial = any(p in _prev_lower for p in (
        "i forgot", "i don't remember", "i dont remember",
        "i don't know", "i dont know", "not sure", "can't remember", "cant remember",
    ))
    if topic_denied or _is_denial:
        lines += [
            "SIGNAL: candidate_denial",
            "WHAT: Candidate said they don't know, forgot, or can't explain this.",
            "GOAL: Accept it cleanly and pivot — don't push on what they can't answer.",
            "QUESTION TYPE: ACKNOWLEDGEMENT + PIVOT",
            "PRINCIPLES:",
            "  - One short acknowledgement, then redirect to something adjacent they might know.",
            "  - Give them an easy out — find the related thing they CAN speak to.",
            "VOICE: Warm and low-pressure. 'No worries — what part of this did you actually touch?'",
            "SKIP: Never re-ask the same thing. Never make them feel punished for not knowing.",
        ]
        return "\n".join(lines)

    probe = SIGNAL_PROBES.get(signal or "", None) if signal else None
    if probe is None:
        probe = _DEFAULT_PROBE

    lines.append(f"SIGNAL: {signal or 'none'}")
    lines.append(f"WHAT: {probe['what']}")
    if signal_reason:
        lines.append(f"TRIGGER (their exact words): \"{signal_reason}\"")
    lines.append(f"GOAL: {probe['goal']}")
    lines.append(f"QUESTION TYPE: {probe['question_type']}")
    lines.append("PRINCIPLES (how to frame — not what to say):")
    for p in probe["principles"]:
        lines.append(f"  - {p}")
    lines.append(f"VOICE: {probe['voice_note']}")
    lines.append(f"SKIP: {probe['skip']}")
    lines.append(get_reaction_hint(signal, prev_answer))

    _band_note = _BAND_OVERLAYS.get(signal or "", {}).get(band)
    if _band_note:
        lines.append(f"BAND ({band}): {_band_note}")

    if topic_follow_ups <= 1:
        lines += [
            "NOTE: First probe on this topic — pull the most specific thing from their answer.",
            "      Don't open generically. Find the one thread worth pulling and name it.",
        ]

    if _same_signal_repeated:
        _topic_label = (active_topic.split(" — ")[0].split(" - ")[0].split("|")[0].strip()[:60]
                        or "this topic")
        lines += [
            "",
            "ANGLE PIVOT (MANDATORY):",
            f"  The signal '{signal}' has fired 2 times in a row on '{_topic_label}'.",
            f"  Follow-up probing on the same angle is not surfacing anything new.",
            f"  STOP asking follow-ups on the current thread. Instead, ask a fresh,",
            f"  GENERAL question that targets a DIFFERENT section of '{_topic_label}' —",
            f"  a different sub-concept, mechanism, or dimension inside the topic.",
            f"  Do NOT reference or build on their last answer. Do NOT probe the same",
            f"  detail they've been dodging. Open a NEW angle on the topic entirely.",
            f"  Example pivots (adapt to the topic):",
            f"    - if you've been asking HOW something was built → ask about a DIFFERENT",
            f"      component or step in the same system",
            f"    - if you've been asking WHY they chose X → ask about a completely",
            f"      different decision they made on the topic",
            f"    - if you've been asking about mechanism → ask about outcome, failure,",
            f"      or an edge case they hit",
            f"  This is a fresh general question, not a follow-up.",
        ]

    return "\n".join(lines)
