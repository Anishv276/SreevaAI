"""
interview/conversational/probe.py
Sales-module probe strategy. One probe per signal — tells the interview LLM
what fired, what it means, and how to frame the follow-up, without scripting
the exact question. Mirrors interview.tech.probe's architecture exactly.

Signal names match two types:
  RESPONSE signals (fired by G0 gates): pure_denial, denial_with_continuation,
    clarification_request, rephrase_request, off_topic
  CONTENT signals -- Sales Module Top 12, split:
    TECHNICAL:      deal_metrics_missing, objection_handling_theoretical,
                     pipeline_thinking_weak, sales_tool_named_not_used,
                     strategy_choice_unjustified
    CONVERSATIONAL:  deal_example_evaded, revenue_ownership_ambiguous,
                     impact_not_measured, conflict_story_sanitized,
                     reflection_missing, customer_focus_missing,
                     decision_logic_opaque
"""
from __future__ import annotations

from interview.agent_runtime_helpers import _strip_leaked_meta


SIGNAL_PROBES: dict[str, dict] = {

    "clarification_request": {
        "question_type": "CLARIFICATION REPHRASE",
        "voice_note":    "Helpful and patient, not apologetic.",
        "directive": """\
The candidate asked you to clarify: "{original_question}" → their clarification request was
"{clarification_request_text}".

If their clarification request already isolates a specific fork (an either/or, a "do you mean
X or Y"), answer that fork directly — don't re-explain the whole question from scratch.

Otherwise, diagnose the likely cause before rephrasing:
- A sales-jargon term with no shared meaning (MEDDIC, BANT, ACV) → replace with plain language.
- An ambiguous reference ("that deal," "it") → name the specific thing explicitly.
- A compound question → drop to the single most important half.
- Genuine abstraction → add one concrete anchor tied to something they already said.

Never repeat the original question verbatim, even reworded with the same structure. One short
"sure" or "good question" is enough acknowledgment. Never narrate why the first phrasing failed.""",
    },

    "rephrase_request": {
        "question_type": "REDO / CORRECTION",
        "voice_note":    "Encouraging and open.",
        "directive": """\
The candidate asked to redo their previous answer. Check first: did they only ask to restart,
or did the corrected answer already arrive in the same breath?

If they only asked (no new content yet): grant the floor in one short, warm beat, no
conditions — "Of course, take your time" or "Yeah, go for it." Do not add a question this
turn.

If the correction already arrived: treat it as their real answer. React to it exactly as you
would any other answer. If it still leaves a real gap, probe the content using ordinary
signal logic, not a "redo" framing.

Never reference the discarded first answer. Never say "no problem, these things happen." If
the candidate has redone the same answer twice already, don't grant an open floor a third
time — move things forward.""",
    },

    "off_topic": {
        "question_type": "REDIRECT",
        "voice_note":    "Warm and direct.",
        "directive": """\
The candidate answered "{off_topic_summary}" when you asked "{original_question}". Diagnose
first: is this a pivot to an easier, prepared talking point, or a genuine miss because your
question could reasonably be misread?

Acknowledge with one specific clause naming the actual thing they said — never a generic
"that's interesting." Then redirect with a version of the question that's sharper than the
first, not identical: narrow the scope, add "specifically," or anchor to one word from their
own answer if there's a natural bridge.

Never ask why they answered that instead. One question, no stacking. If this is the second
consecutive off-topic redirect on the same question, don't redirect a third time — accept
the closest usable answer and move the interview forward.""",
    },

    "denial_with_continuation": {
        "question_type": "PROBE PARTIAL ADMISSION",
        "voice_note":    "Warm, curious tone — often a strong candidate under-selling themselves.",
        "directive": """\
The candidate just hedged, then in the same breath described something real: "{continuation_excerpt}".
This is a self-esteem reflex, not a content gap. Skip the denial entirely — don't quote it,
don't acknowledge it, don't ask them to reconcile it with what they just said.

Check first: does "{continuation_excerpt}" already contain a concrete detail (a number, a
real deal, a named client, a specific outcome)? If yes, output NO_FOLLOW_UP_NEEDED and carry
that detail into scoring — don't manufacture a question just because the signal fired.

If the detail is still thin, react to the continuation as if it were the whole answer, and
pick the probe that matches what's actually missing:
- Vague scale word ("small," "basic," "a few") → ask what made it small, or what the real
  numbers behind that word were.
- Named a deal/client but gave no mechanism → ask for the one decision, objection, or outcome
  only someone who actually ran that deal would know.
- Sounds rehearsed → ask what actually happened when it played out, not the talking-point
  version.

Never say any variant of "you said you didn't have experience, but..." One question. Warm,
curious tone — this is often a strong candidate under-selling themselves.""",
    },

    # ---- TECHNICAL-MODE CONTENT SIGNALS ----

    "deal_metrics_missing": {
        "question_type": "NUMBER PULL",
        "voice_note":    "Direct and matter-of-fact — you're asking for a number, not accusing them of hiding one.",
        "directive": """\
The candidate answered a deals/performance/pipeline question with zero numbers anywhere. Ask
for ONE specific figure directly — quota attainment, deal size, win rate, cycle time, or
volume, whichever is most natural given what they just described. Do not ask an open "how did
it go" again — that produced the vague answer in the first place.

Anchor the number request to something they already said: if they mentioned "a big deal,"
ask what the actual deal size was. If they mentioned "hit my numbers," ask what percentage of
quota that actually was.

One question, one number. Direct and matter-of-fact tone — this is a completely normal thing
to ask a salesperson, not an accusation.""",
    },

    "objection_handling_theoretical": {
        "question_type": "REAL OBJECTION PULL",
        "voice_note":    "Curious and specific — you want the real moment, not the method.",
        "directive": """\
The candidate described objection handling as a general method or philosophy with no real
objection behind it. Ask them to recall the LAST real objection a client actually raised to
them — the exact words, if they can remember — and what they said back in that specific
moment.

Do not ask "how do you handle objections" again in any form — that produced the theoretical
answer. Ask for the memory, not the method: "What's the last pushback you actually got from
a prospect — what did they say?"

If they still can't produce a specific instance after this probe, accept the limit and move
on rather than probing a third time on the same angle. One question.""",
    },

    "pipeline_thinking_weak": {
        "question_type": "STAGE LOGIC PROBE",
        "voice_note":    "Genuinely curious about their actual process, not testing textbook knowledge.",
        "directive": """\
The candidate showed no real grasp of pipeline stages, stage movement, or forecast logic. Ask
for ONE concrete criterion: what specifically moves a deal from one stage to the next in their
process, or what makes them call a deal "commit" versus "best case" on a forecast call.

Ground it in their own language if they used any stage names or process words — otherwise ask
about their most recent quarter's forecast directly: "What made you confident calling that
deal in versus one that slipped?"

Do not ask a generic "walk me through your sales process" again. One question, focused on a
single decision point in their pipeline logic.""",
    },

    "sales_tool_named_not_used": {
        "question_type": "HANDS-ON VERIFICATION",
        "voice_note":    "Specific and grounded.",
        "directive": """\
The candidate named a specific sales tool with no evidence of using it. Pick the ONE most
central tool relevant to the topic; ignore the others even if several were named.

Ask for the single smallest concrete action directly: what they actually built or configured
in it (a sequence, a stage rule, a report), or what they check in it every morning — not "what
did you do with it," which is broad enough to answer with a role description instead of a
real action.

Never ask what the tool is — invites another definition. Never ask why they chose it — that's
strategy_choice_unjustified, a different signal. One question, one tool.""",
    },

    "strategy_choice_unjustified": {
        "question_type": "COMPARATIVE RATIONALE",
        "voice_note":    "Genuinely curious tone — testing judgment, not catching a mistake.",
        "directive": """\
The candidate picked a channel, cadence, messaging angle, or play but never explained why it
fit that situation. Name a concrete alternative that is plausible specifically for their
account/segment — not a generic "why not email instead" unless email is genuinely a live
alternative for that buyer type.

Ask "why this over [alternative]" directly — never an open "why did you choose it," which
invites a rehearsed line instead of real reasoning.

Bake in the fallback in the same question: also ask whether it was their call or something
inherited from a playbook/manager. That's useful information either way, no second turn needed.

One question. Genuinely curious — "it worked" is a reasonable starting answer; you're looking
for whether there's a real deciding factor underneath it.""",
    },

    # ---- CONVERSATIONAL-MODE CONTENT SIGNALS ----

    "deal_example_evaded": {
        "question_type": "MEMORY RETRIEVAL",
        "voice_note":    "Curious, not accusatory — you want the story, not to catch them out.",
        "directive": """\
The candidate answered with a general habit ("usually / normally / I always...") instead of a
real deal or customer instance. Do not repeat the "give me one specific example" request in
any form — that sentence shape already failed once.

Instead, give them a retrieval cue: anchor to a concrete, adjacent thing they already implied
exists — a deal size, a recent quarter, an account type, a specific client — and ask what
happened INSIDE that anchor. If nothing concrete was mentioned yet, manufacture the smallest
possible anchor from the topic ("the last deal you closed," "the most recent one before this").

If this signal has already fired once or more on this topic, switch retrieval channel:
- Ask about one DECISION they made on a specific deal, not a story.
- Ask about a specific OBJECTION or PUSHBACK and what they did with it.
- Ask about a CONSTRAINT they hit (budget, timeline, competitor).
- Ask what they'd do DIFFERENTLY if they ran that deal again now.

One question. Curious tone, not accusatory. Never say "can you give me an example." """,
    },

    "revenue_ownership_ambiguous": {
        "question_type": "PERSONAL ISOLATION",
        "voice_note":    "Direct tone, not aggressive; this is a common pattern, not an accusation.",
        "directive": """\
The candidate described a real result almost entirely in "we/team/they" — no personal action
verb anywhere. Pick one specific thing they mentioned (a deal, a negotiation, an outreach
sequence) and isolate their part in it.

The question must make "we" structurally unusable as an answer — force a singular, specific,
personal reference. A few proven angles:
- naming the specific deal/deliverable they described and asking what they personally ran or decided
- asking which call or decision in the deal cycle was theirs alone to make
- asking what they'd have done differently if they'd been completely alone on it
- coworker triangulation: what would the account manager say was specifically theirs, if asked

Never ask "what was your role" verbatim. Never ask about the team again. Direct tone, not
aggressive; this is a common pattern, not an accusation.""",
    },

    "impact_not_measured": {
        "question_type": "OUTCOME QUANTIFICATION",
        "voice_note":    "Curious and specific — you want the real number or observed change.",
        "directive": """\
The candidate narrated an outcome with no concrete change described — "it went well," nothing
quantified. Ask for the ONE specific thing that changed: a number, a rate, a response they
actually observed, or what the client said or did differently afterward.

Anchor it to what they described: if they said "response was better," ask what it went from
and to, even roughly. If they said "the client was happy," ask what the client actually did
next (renewed, expanded, referred someone) as the real signal of that.

One question. Don't accept "it went well" as an answer twice — if they stay vague after this
probe, accept the limit and move on rather than asking a third time.""",
    },

    "conflict_story_sanitized": {
        "question_type": "REAL TENSION PULL",
        "voice_note":    "Warm but persistent — you're normalizing that real disagreements have friction.",
        "directive": """\
The candidate's conflict/disagreement story has no real stakes or tension — everything sounds
resolved instantly. Ask for the actual moment of friction: what was said, what they were
worried about, or what almost went wrong before it got resolved.

Normalize it first in one short clause — real disagreements are supposed to have friction, so
don't make them feel like admitting tension is a bad look. Then ask a specific question like
what they actually said in the moment, or what they were afraid would happen if it went badly.

Never ask "was there any tension" as a yes/no — that invites another sanitized "not really."
Ask for the content of the friction directly. One question.""",
    },

    "reflection_missing": {
        "question_type": "LEARNING APPLICATION",
        "voice_note":    "Genuinely curious about growth, not testing for a rehearsed lesson.",
        "directive": """\
The candidate told a story but can't name a specific learning or how it changed what they do
now. Ask directly: what do they do differently today because of that specific experience —
not "what did you learn" in the abstract, which invites another platitude.

Ground it in the specific story they told: "After that deal slipped, what's one thing you
started doing differently in your next deals?" Make the question demand a concrete behavior
change, not a lesson statement.

If they still can't name anything concrete, accept it and move on — don't probe a third time
looking for insight that isn't there. One question.""",
    },

    "customer_focus_missing": {
        "question_type": "CUSTOMER PERSPECTIVE SHIFT",
        "voice_note":    "Curious, not corrective — you're pulling their attention to the buyer's side.",
        "directive": """\
The candidate described the work entirely from their own internal perspective — quota,
process, their own effort — with no mention of what the customer actually needed or felt. Ask
them to describe the SAME situation from the customer's side: what was the customer actually
trying to solve, or what would the customer say was the reason they said yes (or no).

Ground it in the specific deal/account they described, not a generic "how do you think about
the customer" question. "What was [the account] actually trying to fix when they came to you?"

One question. Curious, not corrective — you're redirecting the lens, not implying they did
something wrong.""",
    },

    "decision_logic_opaque": {
        "question_type": "TRADEOFF EXTRACTION",
        "voice_note":    "Genuinely interested in how they think, not skeptical of the decision itself.",
        "directive": """\
The candidate described a decision but never explained how the options or risks were weighed.
Ask directly what the real alternative was and why they didn't go with it — what would have
happened if they'd made the other call.

Ground the alternative in their specific situation, not a generic "what else could you have
done" — if they walked away from a deal, ask what would have had to be true for them to stay
in it instead. If they escalated something, ask what they were weighing against just letting
it go.

One question. Genuinely interested in their reasoning process, not skeptical of the decision
itself — "it worked out" is a fine starting point, you're looking for what was actually weighed.""",
    },
}

# Fallback probe when signal is null or unrecognised.
_DEFAULT_PROBE = {
    "question_type": "OPEN PULL",
    "voice_note":    "Curious and specific. Don't ask them to 'tell you more' — find the one thing worth digging into.",
    "directive": """\
Candidate answered, but signal classification did not run this turn. The topic brief above
already names a MANDATORY SUB-CONCEPT for this turn — use that as your target instead of
scanning their answer for something generically interesting.

Ask specifically about the mandatory sub-concept, grounded in whatever they actually said
that relates to it — push for one real detail: a number, a deal, a client, what happened
next. If they said nothing related to that sub-concept yet, ask about it directly.

Don't ask them to elaborate generally — target the named sub-concept and go deep on it.
Never ask a generic "tell me more".""",
}


# ---------------------------------------------------------------------------
# Level overlays -- per-signal, per-level (1=fresher-equiv .. 4=senior-equiv).
# Adjusts depth/stakes of the probe.
# ---------------------------------------------------------------------------
_LEVEL_OVERLAYS: dict[str, dict[int, str]] = {

    "deal_example_evaded": {
        1: "A real moment from an internship, practice sale, or class project counts — keep the bar accessible.",
        2: "Push for a real deal or account situation, not a hypothetical.",
        3: "The instance must come from real quota-carrying work. Push for the deal, not the category.",
        4: "Push for an instance with real stakes — a decision with real consequences for the number or the team.",
    },
    "deal_metrics_missing": {
        1: "Any real number counts, even small-scale (internship leads, practice calls booked).",
        2: "Expect a real quota, deal size, or rate figure tied to actual quota-carrying work.",
        3: "Expect precise figures — quota attainment percentage, ACV, win rate — not rounded platitudes.",
        4: "Expect team or territory-level numbers, not just individual figures.",
    },
    "revenue_ownership_ambiguous": {
        1: "Ask for their single concrete task on the deal — one action they personally took is enough.",
        2: "Ask what decision or call on the deal was specifically theirs.",
        3: "Ask which part of the deal cycle they owned end-to-end.",
        4: "Ask what decision was theirs to make — probe territory/team leadership, not just deal execution.",
    },
    "pipeline_thinking_weak": {
        1: "A basic sense of stages is enough — don't push for forecast-category nuance.",
        2: "Expect real stage criteria from their own deals.",
        3: "Expect forecast category logic (commit/best-case) with real reasoning.",
        4: "Expect territory or team-level pipeline judgment, not just their own deals.",
    },
    "sales_tool_named_not_used": {
        1: "Even light usage in training or a practice environment counts.",
        2: "Ask what they built or ran in it for a real deal or sequence.",
        3: "Push for a specific workflow or report they relied on regularly.",
        4: "Ask how it fit into team process or what adoption/rollout decision they made.",
    },
    "strategy_choice_unjustified": {
        1: "They may not have had a choice — ask if they considered anything else, even briefly.",
        2: "Expect a simple reason — buyer type, timing, prior response rate.",
        3: "Expect a real tradeoff — what they gave up by choosing this play over another.",
        4: "Expect a considered decision with team or territory-level consequences.",
    },
    "objection_handling_theoretical": {
        1: "A practice or roleplay objection counts if a real client one isn't available.",
        2: "Expect a real client objection with a real response.",
        3: "Expect a hard objection (competitor, budget cut, exec pushback) handled with real skill.",
        4: "Expect a high-stakes objection at the executive or contract-negotiation level.",
    },
}


# ---------------------------------------------------------------------------
# Intent-based reactions.
# ---------------------------------------------------------------------------
_SIGNAL_REACTIONS: dict[str, dict] = {
    "deal_example_evaded": {
        "tone": "gently redirecting — you accept the general point but want the real deal",
        "openers": ["Sure, generally —", "Okay, in general terms —", "Right, but specifically —"],
    },
    "deal_metrics_missing": {
        "tone": "direct and practical — asking for a number is completely normal",
        "openers": ["Got it —", "Okay —", "Right —"],
    },
    "revenue_ownership_ambiguous": {
        "tone": "neutral and matter-of-fact — you noticed it was a team effort",
        "openers": ["Right, the team —", "Okay, so collectively —", "Got it, a group effort —"],
    },
    "impact_not_measured": {
        "tone": "curious — you want the real number behind 'it went well'",
        "openers": ["Okay, went well —", "Right, better —", "Got it —"],
    },
    "sales_tool_named_not_used": {
        "tone": "curious — pick up the specific tool name they dropped",
        "openers": ["Okay, [tool] —", "[tool], right —", "Ah, you mentioned [tool] —"],
    },
    "strategy_choice_unjustified": {
        "tone": "genuinely interested in the decision",
        "openers": ["Interesting call —", "Okay, [channel] —", "Makes sense you went that way —"],
    },
    "pipeline_thinking_weak": {
        "tone": "engaged and practical — you followed the process",
        "openers": ["Right, that makes sense —", "Okay, I follow —", "Got it —"],
    },
    "objection_handling_theoretical": {
        "tone": "curious for the real moment behind the method",
        "openers": ["Okay, that approach —", "Right, makes sense —", "Got it —"],
    },
    "conflict_story_sanitized": {
        "tone": "warm and normalizing — real friction is expected, not a bad look",
        "openers": ["Fair enough —", "Okay —", "Right —"],
    },
    "reflection_missing": {
        "tone": "genuinely curious about what changed",
        "openers": ["Okay —", "Got it —", "Right —"],
    },
    "customer_focus_missing": {
        "tone": "curious, redirecting the lens to the buyer's side",
        "openers": ["Okay, from your side —", "Got it —", "Right —"],
    },
    "decision_logic_opaque": {
        "tone": "genuinely interested in the reasoning",
        "openers": ["Interesting —", "Okay —", "Got it —"],
    },
}

_BANNED_FILLER_OPENERS = (
    "great!", "awesome!", "that's interesting!", "impressive!", "impressive ",
    "solid!", "nice!", "cool!", "wow!", "amazing!",
)


def get_reaction_hint(signal: str | None, prev_answer: str) -> str:
    r = _SIGNAL_REACTIONS.get(signal or "")
    _banned_note = (
        "  Do NOT open with hollow praise words: 'Great!', 'Awesome!', 'That's interesting!', "
        "'Impressive!', 'Solid!', 'Nice!', 'Cool!', 'Wow!', 'Amazing!' — none of these, in any tone."
    )
    if not r:
        return (
            "REACTION: open with a short, specific beat that reacts to a real word they used "
            "(not a generic 'Mm').\n" + _banned_note
        )
    return (
        f"REACTION TONE: {r['tone']}.\n"
        f"  Example openers (adapt — replace [tool]/[channel] with the real thing they named, vary wording): "
        f"{' / '.join(r['openers'])}\n"
        f"  Make it specific to what they actually said. Do NOT default to a bland 'Mm' or 'Hmm'.\n"
        + _banned_note
    )


QUESTION_GENERATION_SYSTEM = """\
You are Ishitha, a sharp and warm AI interviewer conducting a SALES interview — not filling
out a form.

Before you write anything, read RECENT_QUESTION_PATTERNS below. Your new question's opener AND
scaffold must both be different from every entry in that list — not just reworded, structurally
different. A repeated scaffold is a repeated question even if the topic and vocabulary changed.

RECENT_QUESTION_PATTERNS:
{recent_question_patterns}

DECLINED_FACTS (facts the candidate has explicitly been unable to produce this interview):
{declined_facts}
Before writing a question, check whether it targets anything on that list. If it's on the
list, do not construct a question that resolves to asking for it again.

If the scaffold your current PROBE DIRECTIVE suggests would collide with one already used,
pick a genuinely different construction that still satisfies the same goal and question type.

YOUR JOB THIS TURN: ask ONE follow-up question based on what the candidate just said.

EVIDENCE-SUFFICIENCY CHECK FIRST: if the candidate's last answer already closed the gap the
PROBE DIRECTIVE describes, output exactly NO_FOLLOW_UP_NEEDED and nothing else.

OPEN WITH A REACTION THAT FITS WHAT THEY SAID:
- The PROBE DIRECTIVE includes a REACTION TONE. Open with a 2-4 word beat in that tone, but
  the actual words must not match any opener in RECENT_QUESTION_PATTERNS.
- Ground the reaction in a SPECIFIC word they used — a deal, a tool, a client, a number.
- Never default to a bland 'Mm' or 'Hmm', never reuse an opener template that already appears
  in the recent list.
- Never say 'Great!', 'Awesome!', 'That's interesting!', 'Impressive!', 'Solid!' — hollow filler.

THEN ASK ONE QUESTION — HARD LENGTH CAP:
- Reaction + question together: TWO sentences maximum, no exceptions.
- Never restate role context or "why this matters" before asking.
- EXACTLY ONE question mark in your entire output.
- Reference something specific they actually said — never ask in a vacuum.
- This is voice — write like you'd speak it out loud in under 8 seconds.
- Never say 'Can you' or 'Could you' — form-filler phrases.

MATCH THE QUESTION TYPE, VARY THE CONSTRUCTION:
The PROBE DIRECTIVE tells you the gap detected, the goal, and the QUESTION TYPE. Your question
must match that type, but the sentence construction must be one you have not used in
RECENT_QUESTION_PATTERNS.

OUTPUT FORMAT — READ CAREFULLY:
Output ONLY the reaction + question (or exactly NO_FOLLOW_UP_NEEDED). Do not show your
reasoning, do not name the scaffold you picked, do not add any parenthetical note. The
candidate hears this verbatim.
"""


def get_probe_context(
    *,
    signal: str | None,
    signal_reason: str | None,
    level: int,
    topic_follow_ups: int,
    topic_denied: bool,
    prev_answer: str,
    signals_history: list[str] | None = None,
    active_topic: str = "",
    prev_question: str = "",
    recent_question_patterns: str = "(none yet)",
    declined_facts: str = "(none yet)",
    ladder_rung: str = "",
    cross_cutting_signal: str | None = None,
) -> str:
    """
    Returns the probe context block injected into the directive. Sales-module
    mirror of interview.tech.probe.get_probe_context — identical mechanics,
    sales signal set.

    ladder_rung / cross_cutting_signal: accepted for call-site signature
    symmetry with the tech module (agent_runtime._build_probe_directive calls
    whichever module's get_probe_context is active without branching). Sales
    interviews are not in scope for the definition/mechanism/difference/
    scenario ladder or the Part B staged signal taxonomy fix, so both are
    currently unused here.
    """
    lines: list[str] = []
    _signals_history = signals_history or []
    _same_signal_repeated = (
        len(_signals_history) >= 2
        and signal is not None
        and _signals_history[-1] == signal
        and _signals_history[-2] == signal
    )

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
            "VOICE: Warm and low-pressure. 'No worries — what part of this deal did you actually run?'",
            "SKIP: Never re-ask the same thing. Never make them feel punished for not knowing.",
        ]
        return "\n".join(lines)

    probe = SIGNAL_PROBES.get(signal or "", None) if signal else None
    if probe is None:
        probe = _DEFAULT_PROBE

    _directive = probe["directive"].format(
        original_question=prev_question or "(question text unavailable)",
        clarification_request_text=prev_answer,
        continuation_excerpt=prev_answer,
        off_topic_summary=prev_answer,
    )

    lines.append(f"SIGNAL: {signal or 'none'}")
    if signal_reason:
        lines.append(f"TRIGGER (their exact words): \"{signal_reason}\"")
    lines.append(f"QUESTION TYPE: {probe['question_type']}")
    lines.append("DIRECTIVE (verbatim framing instructions for this signal):")
    lines.append(_directive)
    lines.append(f"VOICE: {probe['voice_note']}")
    lines.append(get_reaction_hint(signal, prev_answer))

    _level_note = _LEVEL_OVERLAYS.get(signal or "", {}).get(level)
    if _level_note:
        lines.append(f"LEVEL ({level}): {_level_note}")

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
            f"  a different deal, decision, or dimension inside the topic.",
            f"  Do NOT reference or build on their last answer. Do NOT probe the same",
            f"  detail they've been dodging. Open a NEW angle on the topic entirely.",
            f"  This is a fresh general question, not a follow-up.",
        ]

    lines.append("")
    lines.append("RECENT_QUESTION_PATTERNS:")
    lines.append(recent_question_patterns)
    lines.append("")
    lines.append("DECLINED_FACTS:")
    lines.append(declined_facts)

    return "\n".join(lines)
