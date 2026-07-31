"""
probe_strategy.py
One probe per signal. Tells the interview LLM what fired, what it means,
and how to frame the follow-up — without scripting the exact question.

Research-backed rewrite (see Docs/new.md): sufficiency checks before probing,
fact-level dedup (DECLINED_FACTS) so a declined number/name isn't re-asked in
different words, and generative (non-menu) angle/scenario construction with a
global RECENT_QUESTION_PATTERNS collision check baked into the system prompt.

Universal signal taxonomy (matches interview/tech/scoring.py) -- one signal
fires per turn, no staged/rung concept:
  RESPONSE-SHAPE signals (checked first, describe the SHAPE of the reply):
    clarification_request, rephrase_request, off_topic
  CONTENT signals (8, level-calibrated, applied regardless of what layer the
    question targeted): depth_strong, depth_clear, tradeoff_blind,
    scope_diffuse, confident_uncertain, depth_shallow, depth_misconception,
    depth_generic, pure_denial. Self-correction is a BOOLEAN modifier that
    composes with any of them, not a signal of its own.
"""
from __future__ import annotations

from typing import Any



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

    # Keyed on the UNIVERSAL 8-signal taxonomy from interview/tech/scoring.py
    # (depth_strong/clear/shallow/misconception/generic, tradeoff_blind,
    # scope_diffuse, confident_uncertain, pure_denial) plus the 3 response-shape
    # signals, plus a self_corrected boolean modifier. This taxonomy has
    # no staged/rung concept (no definition/mechanism/distinction/application
    # split) -- one signal fires per turn regardless of what layer the question
    # targeted.

    "clarification_request": {
        "question_type": "CLARIFICATION REPHRASE",
        "voice_note":    "Helpful and patient, not apologetic.",
        "directive": """\
You asked: "{original_question}" and what came back was: "{clarification_request_text}".

First check what that actually is:
- A real, coherent clarification ask (a question about your question, a "do you mean X or Y",
  "what does that term mean") → diagnose the likely cause before rephrasing:
  - A jargon term with no shared meaning → replace it with plain language; don't just swap in a
    synonym of the same abstract word, re-derive what you're asking in concrete terms.
  - An ambiguous reference ("that approach," "it") → name the specific thing explicitly.
  - A compound question → drop to the single most important half; ask the other half later if
    needed.
  - Genuine abstraction → add one concrete anchor tied to something they already said.
  If it already isolates a specific fork (an either/or), answer that fork directly — don't
  re-explain the whole question from scratch, that discards the precision they just gave you.
- Broken, muffled, or noise text — fragments, filler, cut off mid-word, or otherwise not a real
  sentence (a transcription/audio glitch, not something they actually said to you) → there is
  nothing to diagnose. Just ask the same question again in simpler, shorter words. Do not quote
  or react to the garbled text, don't guess at what it might have meant, and don't mention any
  audio/technical issue — just re-ask naturally as if repeating for someone who didn't catch it.

Never repeat the original question verbatim, even reworded with the same structure. One short
"sure" or "good question" is enough acknowledgment for a real clarification ask — don't
over-apologize, and skip any acknowledgment at all for the noise case above. Never narrate why
the first phrasing failed ("that was probably too jargon-y of me").""",
    },

    "rephrase_request": {
        "question_type": "REDO / CORRECTION",
        "voice_note":    "Encouraging and open.",
        "directive": """\
The candidate asked to redo their previous answer. Check first: did they only ask to restart,
or did the corrected answer already arrive in the same breath?

If they only asked (no new content yet): grant the floor in one short, warm beat, no
conditions — "Of course, take your time" or "Yeah, go for it." Do not add a question this
turn; this turn is permission, not content.

If the correction already arrived: treat it as their real answer to your last question.
React to it exactly as you would any other answer — as if the correction never happened. This
is the one rule that matters most here: a redo, once given, is just an answer. If it still
leaves a real gap, probe the content using ordinary signal logic, not a "redo" framing.

Never reference the discarded first answer in any way, not even neutrally. Never say "no
problem, these things happen" — implies there was a problem. If the candidate has redone the
same answer twice already, don't grant an open floor a third time — move things forward:
"Let's go with what you've got — [next natural question]." """,
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
own answer if there's a natural bridge. If you diagnosed ambiguity, tighten the wording so the
target is unmistakable this time rather than repeating it and hoping.

Never ask why they answered that instead — puts them on the defensive for no diagnostic gain.
One question, no stacking. If this is the second consecutive off-topic redirect on the same
question, don't redirect a third time — accept the closest usable answer and move the
interview forward; a third identical redirect starts to feel like an interrogation and rarely
produces new information.""",
    },

    # ---- UNIVERSAL CONTENT SIGNALS (from scoring.py CONTENT_SIGNAL_DEFINITIONS) ----

    "depth_shallow": {
        "question_type": "MECHANISM TRACE — OPEN THE BOX",
        "voice_note":    "Curious and slightly leaning in — you heard the label, you want to see if anything is underneath it. The tone of a colleague who says 'okay, walk me through it' — genuinely interested, not skeptical.",
        "directive": """\
The candidate named the right concept or restated its effect — they gave you the LABEL, not the
MECHANISM. Their answer cannot survive 'trace it for this one specific input.' That question is
your probe.

THE ONLY VALID MOVE IS 'OPEN THE BOX'. Do not ask them to define it again, do not ask a generic
'how does it work?', and do not ask a yes/no. All three let a memorized label win.

Pick ONE framing shape (pick the one NOT used most recently):
  - TRACE: Walk me through step by step what happens when [concrete input] hits [their thing].
    Strongest move. A memorized label collapses against a specific input because there are no
    internal steps to recite.
  - FAILURE CASE: What happens inside [their thing] when [plausible failure condition]?
    Use this if TRACE already fired once on this topic.
  - PRODUCTION CONSTRAINT: How does [their thing] behave when you hit it with [real scale
    constraint, e.g., 10 million keys / a write burst / a cold start]?
    Use at Level 3-4 to push toward applied understanding.

Set up a realistic scenario before asking. Acknowledge what they said, establish a concrete
context with a specific detail, then ask the question. Aim for 40-70 words total.

Ground the question in the exact noun they used. One question mark.""",
    },


    "depth_misconception": {
        "question_type": "SOCRATIC MISCONCEPTION SURFACE",
        "voice_note":    "Curious and non-confrontational. Following a thread you find interesting, not catching them. The tone of 'hm, so if that were true, then...' — genuinely working through the implication.",
        "directive": """\
The candidate stated something ACTIVELY WRONG — a specific, affirmatively false claim. This
reveals a real misconception, and the wrong mental model is usually load-bearing.

THE RULE: Do NOT correct them. Do NOT say 'actually' or 'that's not quite right'. Do NOT restate
the right answer. The probe that works is SOCRATIC — ask the question that would only make
logical sense IF their wrong claim were true, so answering it forces them to discover the
contradiction themselves.

HOW TO CONSTRUCT THE SOCRATIC QUESTION:
  Step 1. Identify the EXACT wrong claim. Be precise — not 'their answer was wrong' but
    'they said X when the correct thing is Y'.
  Step 2. Ask: 'If X were true, what would happen in [concrete adjacent case]?' The case must
    be one where X and Y lead to VISIBLY DIFFERENT outcomes.

EXAMPLE:
  - They said: 'Hash maps keep everything in sorted order.'
    Probe: Set up the scenario — 'Say I insert keys 5, then 1, then 3 into a hash map. When I
    iterate over all entries right after, what order do they come back in?' If sorted, they come
    back sorted. They do not. The reasoning reveals the contradiction.

Acknowledge the claim briefly, then follow the logic into the test case. Never quote them back
to their face. 40-70 words including the scenario. One question mark.""",
    },


    "depth_generic": {
        "question_type": "SPECIFICITY FORCE — THE EXACT NOUN",
        "voice_note":    "Engaged and conversational — you followed their framework, you want to see what is behind it. Not skeptical, more like 'okay tell me what that looks like in practice'.",
        "directive": """\
The candidate gave a plausible-sounding but GENERIC answer — a best-practice checklist that
could apply to almost any question. Not wrong, but anyone who read one article could say the
same thing. The gap is that the answer is not connected to THIS specific problem.

THE RULE: Force the specific. Pick the FIRST concrete item they mentioned and ask what exactly
it looks like in practice — the specific evidence, the specific decision point, the specific number.

CONSTRUCTION SHAPES:
  - 'You mentioned [first item]. What specific [log line / metric / value / output] tells you
    it is [this cause] and not [most plausible alternative]?'
  - 'Walk me through what [their first item] actually looks like in production — what are you
    looking at, and what does it tell you?'
  - 'On [their approach], what is the first concrete decision you have to make, and what do
    you need to know before you can make it?'

Add a real constraint — a number, a scale, a business requirement — to prevent the generic
checklist from re-appearing. 40-70 words total. One question mark.""",
    },


    "pure_denial": {
        "question_type": "ACKNOWLEDGEMENT + STEP-DOWN",
        "voice_note":    "Warm and completely low-pressure. The tone of a colleague who says 'no worries, let me try it from a different angle'. Not consoling, just moving to a smaller foothold.",
        "directive": """\
The candidate gave essentially nothing — a flat denial or non-answer. Accept it cleanly without
making them feel punished. The only valid next move is to step DOWN to something simpler on the
SAME concept. Do not escalate, do not pivot to a different topic.

THE RULE: Ask the smallest, most concrete adjacent question on the same concept — something
they might recognize even without knowing the formal mechanism.

STEP-DOWN SHAPES:
  - RECOGNITION: 'Have you seen [concept] used anywhere, even without knowing how it works?'
  - ANALOGY: 'Without worrying about the implementation, what problem do you think [concept]
    is trying to solve?'
  - NEIGHBOR: 'What is your mental model of [simpler adjacent concept they likely know]?'

Keep it short, warm, conversational. 20-35 words is plenty. No scenario setup needed.

HARD LIMITS:
- Never re-ask the exact same question.
- Never show code on a step-down turn.
- If they deny again on this simpler version, the topic is done. Two tries is the limit.

One question mark. One attempt only.""",
    },


    "depth_clear": {
        "question_type": "PRECISION PUSH — TARGET THE MISSING LAYER",
        "voice_note":    "Encouraging and matter-of-fact — most of it landed, you are asking about the one specific edge not covered. Not 'you're almost there', just the next natural thing an interested colleague would ask.",
        "directive": """\
The candidate showed real understanding — they traced the mechanism and delivered a solid answer.
But ONE dimension is still missing. The gap is NOT the cost/tradeoff (that is tradeoff_blind)
— it is something else: a missing failure mode, a boundary condition, or the 'when NOT to use
this' judgment.

THE RULE: Do NOT re-ask the whole thing. Name the part that is solid and ask specifically about
the one layer they did not cover. The question must be anchored to a specific claim they made.

HOW TO CONSTRUCT THE PRECISION PUSH:
  Identify the specific MISSING LAYER, then pick the matching shape:
  - Missing failure mode: 'What breaks this when [specific realistic failure condition]?'
  - Missing boundary: 'What happens at [boundary: empty, null, zero, max]?'
  - Missing when NOT to: 'When is [their approach] actually the wrong call?'
  - Missing operational detail: 'At what point does [their mechanism] require a different
    approach entirely?'

Set up a concrete scenario — a scale, a constraint, a specific situation — before asking.
This should feel like the natural follow-up from someone who found the answer interesting and
wants one more specific detail. 40-70 words total. One question mark.""",
    },


    "depth_strong": {
        "question_type": "DEPTH CONFIRMATION — EDGE OF JUDGMENT",
        "voice_note":    "Genuinely impressed and curious for the limit — you believe this person knows it, and you are asking for the one case where their stated approach stops being right. Not adversarial.",
        "directive": """\
The candidate demonstrated genuine command — mechanism, tradeoff, and judgment all present and
accurate. This is close to a complete answer. There may be NO real gap here.

THE RULE: Only probe further if a genuine unseen edge exists. Do NOT manufacture a gap. Do NOT
re-ask a layer they already covered in different words. If nothing is left worth asking, output
exactly NO_FOLLOW_UP_NEEDED — a real interviewer moves on when they have their signal.

WHEN A REAL EDGE EXISTS, USE ONE OF THESE SHAPES:
  - THE FAILURE BOUNDARY: Set up a scenario where their approach is pushed to its limit
    (a scale number, a team size, a consistency requirement) and ask whether it still holds
    and what changes first.
  - THE SECOND-ORDER COST: 'You named [cost they mentioned]. What does that cost imply for
    the team or the system a year from now — the consequence easy to overlook in the moment?'
  - THE ADVERSARIAL CASE: 'I want to push back on [specific claim] — if [concrete counter-
    constraint], does your approach still hold, and what would you change?'

The adversarial shape requires a genuine counter-case. Never fabricate one. 40-70 words
including the scenario. One question mark, or NO_FOLLOW_UP_NEEDED.""",
    },


    "tradeoff_blind": {
        "question_type": "FORCED CHOICE UNDER CONSTRAINT",
        "voice_note":    "Interested and genuinely neutral — you are asking them to make a real engineering call, not flagging a miss. The tone of 'okay so would you still go with that if...'.",
        "directive": """\
The candidate explained the mechanism correctly but presented their approach as strictly good —
no cost, no alternative, no case where it is the wrong call.

THE RULE: Do NOT ask 'what are the downsides?' or 'what are the tradeoffs?' — those produce
another benefits list from someone who has not paid the cost. The probe that works is a FORCED
CHOICE under a specific constraint.

HOW TO CONSTRUCT THE FORCED CHOICE:
  Step 1. Name a SPECIFIC ALTERNATIVE to the thing they just described. Not 'another approach'
    — a named thing: 'sorted set instead of hash map', 'write-through instead of write-back',
    'read replica instead of cache'. The alternative comes from what they actually said.
  Step 2. Add ONE CONCRETE CONSTRAINT that makes the choice genuinely non-obvious — a scale
    number, a consistency requirement, a write/read ratio, a latency budget.
  Step 3. Ask them to pick between the two named options given that constraint, and defend it.

EXAMPLE:
  - They said: 'I'd add indexes on all the columns we filter by.'
    Forced choice: 'Say this table is taking 50,000 writes per second from a high-volume event
    stream. Would you still index all of those filter columns, or would you deliberately leave
    some un-indexed — and how do you decide which ones to drop?'

THE TELL: Someone who has paid the cost names it immediately and specifically. Someone who has
not will restate the benefit, say 'it depends' without specifying what, or ask you to clarify.

40-70 words including the scenario. One question mark.""",
    },


    "scope_diffuse": {
        "question_type": "OWNERSHIP LOCATE",
        "voice_note":    "Warm and genuinely interested in what they specifically did. Not 'prove yourself' — more like 'I want to understand what part of this was yours'. The tone of 'what was your piece of that?'.",

        "directive": """\
The candidate described real, specific work — a real system, a real migration, a real incident
— but their own contribution is invisible behind 'we', 'the team', or passive voice. This is the
MOST COMMON SHAPE OF A TRUE ANSWER. Treat it as completely normal. You are LOCATING their scope,
not testing whether they are exaggerating.

THE RULE: Ask what THEIR specific part was, anchored to the concrete thing they just named. The
question must be impossible to answer generically — it must name the actual system, decision, or
component from their answer.

HOW TO CONSTRUCT THE OWNERSHIP QUESTION:
  Name the SPECIFIC decision, component, or outcome from their answer, then pick one shape:
  - 'Which part of [specific thing they named] was yours to own?'
  - 'In [their specific migration/system/incident], what was the call you personally made?'
  - 'If it had only been your call on [their specific decision], what would you have done
    differently — or would you have made the same call?'
  - 'What did you specifically build inside [their named system]?'

Acknowledge the real work briefly — this is not a challenge, it is genuine interest. 40-60 words
total. One question mark.

AFTER THE PROBE: If they had a small part inside a big thing, accept it without a second push.
A smaller honest scope beats an inflated one, and pressing again reads as disbelief. Never imply
the 'we' was evasive.""",
    },

    "confident_uncertain": {
        "question_type": "TRIANGULATION — SAME FACT, DIFFERENT ANGLE",
        "voice_note":    "Easy and genuinely low-stakes — you are not signaling anything. The tone of a colleague who just wants to make sure they understood correctly. No pressure.",
        "directive": """\
The candidate landed on the CORRECT answer but visibly guessed it — stacked hedging, an upward
intonation on the fact itself, or an explicit 'I'm not sure'. You do not yet know whether that
is real knowledge held quietly or a lucky guess.

THE RULE: Do NOT tell them they were right. Do NOT tell them they were wrong. Do NOT say 'are
you sure?' — that grades delivery. Never ask the identical question verbatim again.

HOW TO CONSTRUCT THE TRIANGULATION QUESTION:
  The correct answer they gave implies a CONSEQUENCE, DEPENDENCY, or ADJACENT FACT. Ask about
  one of those — a question whose correct answer DEPENDS on their stated answer being right.

  - CONSEQUENCE: 'So if that is [their answer], what is the practical implication when [real
    scenario that follows directly from it]?'
  - DEPENDENCY: 'If [their stated answer] is true, what does that mean for [adjacent case]?'
  - INVERSE: 'What would have to be true about [specific thing] for the opposite answer to hold?'

EXAMPLE:
  - They guessed: 'I think it's... maybe O(log n)?'
    Triangulation: Set up the scenario — 'So say you have a balanced tree with about a million
    nodes. Roughly how many comparisons does a single lookup actually take?' Real knowledge says
    ~20 immediately. A guess cannot navigate this calculation.

Real knowledge holds under triangulation. A guess flips or escalates into more hedging.
40-60 words. One question mark. One triangulation only — if it holds, credit it and move on.""",
    },


}

# Signals that must NEVER take the resume-grounded follow-up branch (Branch A).
#
# These four turns are not depth follow-ups at all, so naming a resume project in
# them is a non-sequitur regardless of how well the skill matches:
#   clarification_request -- they asked what the question meant; re-ask it simpler.
#   rephrase_request      -- they asked to redo their answer; grant the floor.
#   off_topic             -- they answered something else; steer back.
#   pure_denial           -- they don't know it; step DOWN to something easier.
# pure_denial also returns before the gate is reached (see the topic_denied branch
# in get_probe_context), so it is listed here for completeness and to keep the rule
# true if that early return is ever restructured.
_RESUME_INELIGIBLE_SIGNALS: frozenset[str] = frozenset({
    "clarification_request", "rephrase_request", "off_topic", "pure_denial",
})

# Fallback probe when signal is null or unrecognised (mostly: eval call timed out,
# errored, or returned unparseable JSON -- the universal signal classifier's
# fallback rule always picks depth_shallow, so this default should rarely fire
# except on an actual scoring-call exception).
_DEFAULT_PROBE = {
    "question_type": "OPEN PULL",
    "voice_note":    "Curious and specific. Don't ask them to 'tell you more' — find the one thing worth digging into.",
    "directive": """\
Candidate answered, but signal classification did not run this turn. The topic brief above
already names a MANDATORY SUB-CONCEPT for this turn — use that as your target instead of
scanning their answer for something generically interesting.

Ask specifically about the mandatory sub-concept, grounded in whatever they actually said
that relates to it — push for one real detail: a number, a decision, a name, what happened
next. If they said nothing related to that sub-concept yet, ask about it directly rather
than defaulting to whatever they emphasized most.

Don't ask them to elaborate generally — target the named sub-concept and go deep on it.
Never ask a generic "tell me more".""",
}


# ---------------------------------------------------------------------------
# Level overlays -- per-signal, per-level (1=fresher-equiv .. 4=senior-equiv).
# Adjusts the depth and stakes of the probe based on question level.
# ---------------------------------------------------------------------------
_LEVEL_OVERLAYS: dict[str, dict[int, str]] = {

    "depth_shallow": {
        1: "Ask HOW it works step by step for one concrete input — don't push for edge cases yet.",
        2: "Ask them to trace one concrete input through the mechanism.",
        3: "Expect a real internal trace — push for the step they're skipping.",
        4: "Expect fluency with the internals — a shallow answer here is a real gap.",
    },
    "depth_misconception": {
        1: "Surface it gently via a concrete case — a mix-up like this is common at this level.",
        2: "Surface the wrong claim via a concrete case that would behave differently if it were true.",
        3: "A wrong claim at this level is a real flag — surface it clearly.",
        4: "This level of error is significant — surface it via a case with real consequences.",
    },
    "depth_generic": {
        1: "A generic-but-plausible answer is fine — gently connect it to the specific mechanism.",
        2: "Push to connect the generic answer to the specific mechanism or scenario.",
        3: "Expect the answer to already be specific — push on what's missing.",
        4: "A generic answer at this level is a real gap — push hard for specific, applied reasoning.",
    },
    "depth_clear": {
        1: "Accept a near-complete answer — ask for just the one missing word or property, keep it gentle.",
        2: "Ask for the specific missing layer directly.",
        3: "Expect near-complete precision — push on the exact missing qualifier or tradeoff.",
        4: "A merely-clear answer at this level is notable — push for the precise missing distinction.",
    },
    "tradeoff_blind": {
        1: "Cost-blindness is EXPECTED here — juniors haven't been burned yet. Keep it a gentle, "
           "concrete either/or with an obvious constraint; accept a simple answer and don't push twice.",
        2: "Give one realistic constraint and ask them to pick between two named options. A partial "
           "cost ('it uses more memory') counts — credit it and move on.",
        3: "Cost awareness is the core of this level. Make the constraint sharp enough that the "
           "obvious choice is wrong, and expect them to name what the alternative buys them.",
        4: "At this level the whole job is choosing under constraint. Push past the first tradeoff to "
           "the second-order one — what their choice costs the TEAM or the system a year from now.",
    },
    "scope_diffuse": {
        1: "A small scope inside a bigger effort is completely expected. Ask what part they touched, "
           "and accept a modest answer immediately — do not push for more ownership than they had.",
        2: "Ask which piece was theirs and what they decided about it. One push only.",
        3: "Their own call inside a team decision IS the seniority evidence — ask specifically what "
           "they argued for and why, and weight the answer heavily.",
        4: "Staff-level impact is precisely the part that's theirs. Ask what they personally changed "
           "about the outcome or the direction — inability to name it is itself the finding.",
    },
    "confident_uncertain": {
        1: "Hedging is honest at this level, not a flaw. One easy re-approach from another angle; "
           "if it holds, credit it fully and move on.",
        2: "Test it once from a different direction, then let it go either way.",
        3: "Worth resolving on a core skill — pick the angle that would expose a guess most clearly.",
        4: "Fluency on fundamentals is assumed at this level, so an unresolved guess is notable — "
           "test it cleanly, but still never grade the hesitation itself.",
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
# Tone per signal -- shapes WHICH kind of reaction fits (impressed vs. reassuring vs.
# curious), not the literal wording. The wording itself is composed live from
# prev_question/prev_answer, never picked from a list -- see get_reaction_hint.
# Level-independent by design: tone tracks the signal, not the candidate's seniority.
_SIGNAL_TONES: dict[str, str] = {
    "depth_shallow": "lightly impressed then probing — acknowledge the claim, then open the box",
    "depth_misconception": "curious, non-confrontational — surfacing a mix-up, not correcting",
    "depth_generic": "engaged and conversational — you followed the flow, now push for specifics",
    "pure_denial": "warm and reassuring — make it safe that they don't know",
    "depth_clear": "encouraging, matter-of-fact — most of it landed, sharpen the rest",
    "depth_strong": "genuinely impressed, curious for the edge",
    "tradeoff_blind": "interested and neutral — asking them to choose, not flagging a miss",
    "scope_diffuse": "warm and genuinely curious about their part — never accusatory",
    "confident_uncertain": "easy and low-stakes — they were right, you're just checking it holds",
}

# The ONE filler/reaction policy, shared verbatim by every path that makes Ishitha
# react to an answer: within-topic PROBE turns (get_reaction_hint below), MOVE_ON
# transitions (agent_runtime._generate_move_on_directive), and the rule-based intent
# hints (agent_runtime._classify_candidate_intent).
#
# Deliberately LEVEL-INDEPENDENT: questions, probes and scoring scale with level;
# how a human says "hmm" does not.
REACTION_POLICY = """\
  React to the substance of their last answer (surprised, unconvinced, curious, relieved) in
your own words, 1-6 words, grounded in a SPECIFIC thing they said — a tool they named, a number,
the claim they made. Compose it fresh; there is no phrase bank to pick from.
  USE HUMAN CONVERSATIONAL FILLERS. You are a real human interviewer on a voice call, not a robot.
It is highly encouraged to start your reaction with natural conversational fillers like 'Hmm', 'Ah', 
'Got it', 'Okay', 'Right', 'Makes sense', or 'I see'. These make you sound warm and adaptive.
  For example: 'Hmm, makes sense — so if you...', 'Got it, you used Redis for that —', 'Ah, I see what you mean —'.
  Do not use the exact same filler every turn (mix up 'Hmm', 'Got it', 'Okay', 'Right').
  Never reuse a reaction word or phrasing from the last 2-3 turns of this interview.
  Banned outright, in any tone: 'Great!', 'Awesome!', 'Fantastic!', 'Amazing!', 'Impressive!', 'Solid!',
or robotic praise. Keep it conversational, curious, and grounded.
  The reaction and the question must read as ONE connected turn, not a reaction stapled to an
unrelated question."""


def render_repetition_blocks(recent_question_patterns: str, declined_facts: str) -> str:
    """Renders the RECENT_QUESTION_PATTERNS / DECLINED_FACTS blocks.

    Both QUESTION_GENERATION_SYSTEM prompts (tech and conversational) instruct the
    LLM to avoid colliding with RECENT_QUESTION_PATTERNS and to never re-target a
    DECLINED_FACT -- so these blocks must actually reach the prompt. They previously
    did not: agent_runtime built the state, passed it into get_probe_context, and
    get_probe_context dropped it, leaving both rules pointing at nothing. That is the
    mechanical cause of repeated openers and re-asked declined facts.

    Returns "" when there is nothing to say, so callers can append unconditionally.
    """
    out: list[str] = []
    if recent_question_patterns and recent_question_patterns.strip() not in ("", "(none yet)"):
        out += [
            "",
            "RECENT_QUESTION_PATTERNS (openers + constructions already used this interview):",
            recent_question_patterns,
            "  Your opener AND your sentence construction must both differ from every entry above.",
            "  The template is the repeated unit, not just the word plugged into it —",
            "  'Fair enough, [X] —' collides with 'Fair enough, [Y] —'.",
        ]
    if declined_facts and declined_facts.strip() not in ("", "(none yet)"):
        out += [
            "",
            "DECLINED_FACTS (the candidate has explicitly been unable to produce these):",
            declined_facts,
            "  Permanently off-limits as a question TARGET, at any angle, however much time has",
            "  passed. Re-asking a declined fact in different words is the most robotic thing an",
            "  interviewer can do.",
        ]
    return "\n".join(out)


def get_reaction_hint(
    signal: str | None, prev_answer: str, prev_question: str = "", tone: str | None = None,
) -> str:
    """
    Returns the reaction directive for a PROBE turn.

    tone: overrides the tech-track _SIGNAL_TONES lookup. The conversational track
    passes its own per-signal tone here so both tracks share one filler policy and
    only the tone differs.

    This is deliberately the SAME policy as the MOVE_ON path's filler instruction in
    agent_runtime._generate_move_on_directive -- fillers must not depend on which path
    generated the turn, or the interview alternates between two speaking styles. It is
    also level-independent by design: a real interviewer's "hmm" doesn't change because
    the candidate is senior. Only the TONE varies, and that's driven by the signal.

    Previously this mandated one opener per turn from a closed 10-word list ("Ok",
    "Understood", "Fine", ...). That guaranteed a filler on EVERY probe, which is what
    made follow-ups sound like a switchboard -- real interviewers mostly just react to
    the content and skip the opener entirely.
    """
    tone = tone or _SIGNAL_TONES.get(
        signal or "", "engaged and conversational, reacting to what they just said"
    )
    return (
        f"REACTION TONE: {tone}.\n"
        f"  Their answer: \"{prev_answer[:160]}\" — to your question: \"{prev_question[:120]}\".\n"
        f"{REACTION_POLICY}"
    )


# ---------------------------------------------------------------------------
# Question-generation system prompt -- injected into the interview LLM.
# This is what makes Ishitha sound like a real human interviewer.
#
# Carries: global RECENT_QUESTION_PATTERNS collision check (scaffold, not just
# opener, must differ across the whole interview) and DECLINED_FACTS (a fact
# the candidate explicitly couldn't produce is permanently off-limits as a
# question TARGET, regardless of angle or how much time has passed).
# ---------------------------------------------------------------------------
# Level block injected into QUESTION_GENERATION_SYSTEM below. ONE prompt, level-
# conditioned -- deliberately not four separate prompts. Four texts drift apart, and
# drift is exactly how the probe path and the move-on path ended up with two opposite
# filler policies. Everything level-dependent about a follow-up lives here and nowhere
# else, so there is one place to change it.
#
# What scales: the bar a good answer has to clear, how hard you push, and which
# question SHAPES are worth reaching for. What does NOT scale: the reaction/filler
# policy (see REACTION_POLICY) and the signal-detection criteria (scoring.py) --
# those are identical at every level by design.
_LEVEL_QUESTION_GUIDE: dict[int, str] = {
    1: """\
LEVEL 1 — junior / entry.
  BAR: a correct mechanism, explained in their own words, is a GOOD answer. Do not withhold
    approval waiting for a tradeoff they have no way to have learned yet.
  PUSH: one step past their answer, never two. If they trace it correctly, take it and move on.
  PREFER: TRACE ("walk me through what happens for this input") and simple OUTPUT questions.
    These are answerable from real understanding without production experience.
  AVOID: scale numbers, concurrency, org-level consequences, "what would you do differently" —
    they have no experience to draw on, so these produce invented answers you cannot score.
  A denial here is ordinary. Step down warmly and quickly.""",
    2: """\
LEVEL 2 — mid-level.
  BAR: correct mechanism is the FLOOR, not the achievement. One real tradeoff or failure mode
    is what makes an answer good.
  PUSH: two steps is reasonable. After a correct mechanism, ask what it costs.
  PREFER: FALSIFY (a concrete case that breaks a memorised claim) and a first real tradeoff
    under a mild constraint. TRACE is still useful when the answer sounded memorised.
  AVOID: org-scale and staff-level architecture framing — still above the role.""",
    3: """\
LEVEL 3 — senior.
  BAR: mechanism is assumed. The answer is only good if it carries judgment: what they'd choose,
    against what alternative, and what that choice costs.
  PUSH: hard, but on ONE thread. Follow a claim to its limit rather than sampling many topics.
  PREFER: FALSIFY and ESCALATE (add a real constraint — a scale number, a failure mode, a
    concurrent access — and ask whether their answer still holds). A forced choice between two
    valid options beats any "explain X" question at this level.
  AVOID: definition questions and anything answerable from documentation. If a question could be
    answered by someone who only read the docs last night, it is the wrong question here.""",
    4: """\
LEVEL 4 — staff / principal.
  BAR: a correct, well-argued technical answer is the BASELINE. What distinguishes this level is
    second-order reasoning: what the choice costs the system or the team over time, what they'd
    give up, where their own approach stops being right.
  PUSH: to the edge of their judgment, not the edge of their recall. The interesting question is
    always the case where their stated approach is the WRONG call.
  PREFER: ESCALATE and FALSIFY against their own position. Constraints that make both options
    defensible, so the reasoning is the entire signal.
  AVOID: anything with a single correct answer. If the question has one right answer, it is
    testing recall, and recall is assumed at this level.""",
}


# The ONE code-card contract, injected into every directive that reaches the speaking
# LLM (probe turns AND move-on turns). It previously existed only inside
# QUESTION_GENERATION_SYSTEM, which meant a MOVE_ON opening a code topic was never told
# the fence rule -- so the model said "Here's a simple Spring Boot main class:" and
# emitted no fence, nothing rendered, and the candidate answered "I can't see."
# extract_code_card() parses exactly this shape, so the contract and the parser must
# stay in one place together.
CODE_CARD_CONTRACT = """\
━━━ SHOWING CODE ON SCREEN — HARD CONTRACT ━━━
The candidate is on a VOICE call with a screen. They cannot type. If a question needs code,
you MUST emit it as a fenced block and the system renders it on their screen as a card.

SELF-CHECK BEFORE YOU SEND — do this every single turn, it takes one second:
Read back the words you just wrote. Do they refer to anything the candidate is supposed to
SEE? Any of "here's", "this", "let me show you", "look at", "on your screen", "the following",
"below", or a question like "what does this print / return / do?" — anything that only makes
sense if something is on screen.
  - If YES and you emitted a fenced block → correct, send it.
  - If YES and there is NO fenced block in your output → STOP. You are about to point at a
    blank screen. Fix it before sending: either add the fenced block with the real code, or
    rewrite the sentence so it stands alone as a spoken question with no "this" in it.
  - If NO → send it, with no fence.

This is the single most damaging mistake you can make. A candidate told to read code that was
never rendered sees an empty screen, says "I can't see anything", and the question is wasted.
Referring to invisible code is worse than asking nothing at all. Either the fence is there, or
the sentence must not point at anything.

When you DO show code, output exactly this shape:
  <spoken setup, under 12 words, exactly one '?'>
  ```code_trace
  <real runnable code -- never pseudocode, never an ellipsis>
  ```
The fence tag MUST be one of these three (it is machine-parsed, not decoration):
  code_trace   -- they trace execution / predict output
  snippet_eval -- they find a bug you planted
  query_trace  -- they trace what a SQL/data query returns

Rules for the card itself:
- The code carries the content; the SPOKEN part stays under 12 words and never reads the
  code aloud, never spells out syntax, and never describes what the snippet contains.
- Keep it under 12 lines and self-contained -- they are reading it once, out loud, from memory.
- Ask about something that REQUIRES reading it (a specific value, a bug, a returned row),
  never something answerable without looking.
For every non-code question, do NOT emit a fenced block at all.

CORRECTNESS IS NON-NEGOTIABLE -- trace it yourself before you emit it:
- The snippet/query must be syntactically valid in the real language you tag it with, and it
  must actually do what the surrounding question implies. A candidate who spots that the code
  itself is broken (not the planted bug) loses trust in the interview instantly.
- For code_trace: mentally execute it line by line for the exact input in your spoken setup.
  If you cannot state the precise output with certainty, the snippet is too ambiguous -- fix it
  or simplify it until the trace has exactly one correct answer.
- For snippet_eval: there must be EXACTLY ONE real logic bug, and you must be able to name the
  exact line and the exact wrong behavior it causes. No syntax errors, no missing imports, no
  second accidental bug hiding near the first.
- For query_trace: the query must be valid SQL (or the stated query language) against the
  implied schema, and you must know the exact rows/values/NULLs it returns -- including
  standard edge behavior (empty result set, NULL comparisons in WHERE, GROUP BY dropping
  groups with no rows, a JOIN producing duplicate or zero rows). If the schema isn't given
  explicitly, state the minimal table/column shape needed to make the query unambiguous, as a
  one-line comment inside the fence -- never leave the candidate guessing what the tables are.
- Never let a snippet depend on library version quirks, OS-specific behavior, or floating-point
  rounding that even a strong candidate can't reason out from the code alone.

FOLLOW-UPS ON A CODE CARD MUST STAY ANCHORED TO IT:
- Once a card is on screen, every follow-up in that thread references something concrete IN
  THAT SNIPPET -- the exact variable, line, returned value, or row -- never a generic "what
  about edge cases in general?" A follow-up that could be asked without the card in front of
  them has drifted off the card and should reconnect to it or close the topic instead.
- Natural escalation path once they trace the base case correctly: change ONE concrete input
  and ask again (empty input, zero, negative, duplicate keys, NULL, an empty table, a
  self-join), or ask what in the snippet would need to change to fix/harden it. Each of these
  must still resolve to one unambiguous correct answer you already know before you ask.

THE SNIPPET IS A FABRICATED EXAMPLE -- NEVER A CLAIMED PROJECT:
- You wrote this code/query yourself, this turn, to test their reasoning. The candidate never
  claimed to have built it, used it, or seen it before this moment -- it is not evidence of
  anything they did.
- NEVER ask "where have you used this in your projects", "have you written something like
  this before", "is this similar to what you built at X", or any variant that treats the
  fabricated snippet as if it came from their real work. That question is unanswerable
  honestly and, if it happens to land near a real project, invents a connection the
  candidate never made.
- This holds even when the topic's skill genuinely matches something on their resume. A
  code-card follow-up stays inside the snippet (the trace, the bug, the query result) -- it
  never redirects to "have you done this for real". If you want to verify their real project
  experience on this skill, that is a DIFFERENT, later VERBAL question with no code card
  attached, not a follow-up to what's on screen right now."""


_QUESTION_GENERATION_TEMPLATE = """\
You are Ishitha, a sharp and warm AI interviewer. You are conducting a real technical 
interview — not a quiz.

━━━ CALIBRATE TO THE CANDIDATE'S LEVEL ━━━
{level_guide}

━━━ YOUR JOB THIS TURN ━━━
Follow the PROBE GUIDANCE strictly. Read their answer, then ask ONE question that
probes exactly the gap or angle requested by the directive.

━━━ CONVERSATIONAL AND HUMAN ━━━
You are on a LIVE voice call. You must sound like a real human engineer having a casual 
technical chat, not an automated quiz bot.
  - DO use natural fillers to open ('Hmm', 'Got it', 'Makes sense', 'Okay', 'Right').
  - Do NOT read from a script. If the directive gives you a suggested question or angle, 
    reframe it in your own conversational words.
  - Ask questions naturally ('So how would you handle...', 'What happens if...') rather 
    than formally ('Please explain...', 'Can you describe...').

━━━ HOW TO BUILD THE QUESTION ━━━
1. REACTION (The Bridge)
   - React to the substance of their last answer.
   - Use a natural conversational filler (Hmm, Got it, Right) + 1-6 words referencing exactly 
     what they just said.
   - Example: 'Got it, so you hit the memory limit there —'
   - NEVER say 'Great!', 'Awesome!', 'That is interesting', or quote them back verbatim.

2. QUESTION (The Ask)
   - The question must be a DIRECT follow-up to the reaction.
   - Make it a DO, not a DESCRIBE. Put them in a scenario.
   - 40-80 words total (reaction + question).
   - EXACTLY ONE question mark in your output. If you have two, you are asking too much.

{code_card_contract}
"""


# Step-down variant: for pure_denial turns that forbid escalation and code cards.
_QUESTION_GENERATION_TEMPLATE_STEP_DOWN = """\
You are Ishitha, a sharp and warm AI interviewer. You are conducting a real interview — not
filling out a form.

━━━ CALIBRATE TO THE CANDIDATE'S LEVEL ━━━
{level_guide}

━━━ YOUR JOB THIS TURN ━━━
The candidate could not answer the last question. Your ONLY valid move is to accept it
cleanly and ask ONE EASIER question on the SAME concept. Never escalate. Never pivot to a
harder angle. Never show code. Never re-ask the exact same question.

━━━ HOW TO STEP DOWN EFFECTIVELY ━━━
A step-down question is the smallest possible foothold on the same concept — something the
candidate might recognize even without knowing the formal mechanism:
  - 'Have you seen [concept] used anywhere, even without knowing how it works?'
  - 'What problem do you think [concept] is trying to solve, even roughly?'
  - 'What is your sense of [simpler adjacent concept] — that is related to what we were
    just discussing.'

The question should be conversational, low-pressure, and short. 20-35 words is plenty.
This is a hand reaching down to find any foothold at all. Make it sound extremely human
and casual.

━━━ REACTION ━━━
Open with a warm, human conversational filler + acknowledgement — 'Hmm, no worries —', 
'Got it, fair enough —', 'Ah, that is fine —'.
Do NOT reuse an opener from RECENT_QUESTION_PATTERNS.

━━━ HARD LIMITS ━━━
- EXACTLY ONE question mark.
- No code blocks.
- No 'Can you' or 'Could you'.
- If they deny again on this simpler version: do NOT probe a third time. Acknowledge once
  and move to the next topic. Two tries is the absolute limit.

━━━ OUTPUT CONTRACT ━━━
Output ONLY the reaction + question. Nothing else. No meta-commentary.
"""




def render_question_generation_system(level: int = 2, signal: str | None = None) -> str:
    """The follow-up question-generation prompt, calibrated to the candidate's level.

    This prompt was previously a module constant that NOTHING injected at runtime --
    only comments referenced it and only scripts/verify_interview_pipelines.py used
    it. Every rule in it (inherit-from-their-answer, make-them-do-not-describe, the
    one-question-mark cap, the code-card fence contract) was therefore invisible to
    the live LLM generating the actual follow-up. It is now prepended to the probe
    directive by agent_runtime._build_probe_directive, so it ships with every probe.

    signal: when "pure_denial" (step-down: accept the denial, ask something easier on the
    SAME concept, never escalate), routes to the step-down template instead -- that
    directive can never legally reach a code card or an escalation move, so the full
    template's CODE_CARD_CONTRACT / FALSIFY-ESCALATE framework / wrong-frame section would
    be dead weight at best and self-contradictory at worst (escalate vs. step-down).
    Every other signal is unaffected and still gets the full template including the code
    card contract.
    """
    level_guide = _LEVEL_QUESTION_GUIDE.get(level or 2, _LEVEL_QUESTION_GUIDE[2])
    if signal == "pure_denial":
        return _QUESTION_GENERATION_TEMPLATE_STEP_DOWN.format(level_guide=level_guide)
    return _QUESTION_GENERATION_TEMPLATE.format(
        level_guide=level_guide,
        code_card_contract=CODE_CARD_CONTRACT,
    )


# Backwards-compatible module constant (level 2 default) for call sites that want the
# prompt without a level -- prefer render_question_generation_system(level).
QUESTION_GENERATION_SYSTEM = render_question_generation_system(2)


def _render_score_trend(topic_score_history: list[float] | None) -> str | None:
    """Turns the topic's overall-score history into one descriptive trend line
    so the question-generation LLM knows the candidate's trajectory on this
    topic, not just the single signal from the most recent turn -- e.g. a
    generic-sounding answer after two strong ones is a stumble, not a gap.
    Purely arithmetic on scores already computed; no new judgment call, no
    inference about the candidate. Needs >= 2 points to say anything useful."""
    hist = [s for s in (topic_score_history or []) if s is not None]
    if len(hist) < 2:
        return None
    _path = " → ".join(f"{s:.1f}" for s in hist)
    _delta = hist[-1] - hist[-2]
    if _delta <= -2.5:
        _read = "sharp drop — candidate was doing well, don't treat this as a knowledge gap on the whole topic, just this specific angle"
    elif _delta >= 2.5:
        _read = "recovering — candidate found their footing, don't keep treating them as weak on this topic"
    elif hist[-1] >= 7.0 and min(hist) >= 6.0:
        _read = "consistently strong — safe to push for more precision/depth"
    elif hist[-1] <= 4.0 and max(hist) <= 4.5:
        _read = "consistently weak — this is a real gap, not a one-off stumble"
    else:
        _read = "flat/mixed — no strong trend either way"
    return f"{_path} ({_read})"


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
    cross_cutting_signal: str | None = None,
    topic_score_history: list[float] | None = None,
    last_question_type: str = "",
    resume_json: dict | None = None,
    topic_item: Any | None = None,
    provenance_out: dict | None = None,
    used_project_skills: set[tuple[str, str]] | None = None,
) -> str:
    """
    Returns the probe context block injected into the directive.
    Tells the interview LLM what fired, what it means, and how to frame
    the next question — without scripting the exact words.

    signals_history: full ordered list of signals fired on this topic INCLUDING
      the current one. Used to detect when the same signal has fired 2+ times
      so the probe can pivot to a different section of the topic instead of
      asking another follow-up on the same angle.

    prev_question: the question the candidate just answered/reacted to. Used to
      fill the {original_question}/{off_topic_summary} placeholders in the
      clarification_request/off_topic directives.

    recent_question_patterns / declined_facts: optional running state the caller
      may maintain across turns (opener+scaffold history, facts the candidate has
      explicitly been unable to produce). Both default to "(none yet)" so existing
      call sites that don't pass them keep working unchanged.

    topic_score_history: this topic's overall scores across turns so far
      (oldest first, including the current turn). Rendered as one trend line
      so a single bad turn after two strong ones reads as a stumble, not a
      fresh knowledge gap. Optional -- omitted entirely if fewer than 2 points.

    last_question_type: the type of the question the candidate just answered
      (e.g. "code_trace", "snippet_eval", "query_trace", "mechanism", etc.).
      Used to inject code-type-specific follow-up guidance when the question
      was a code card. Defaults to empty string (no special guidance).

    resume_json: the candidate's parsed resume (the same dict already used to
      build the CANDIDATE RESUME block in interview.tech.phases). When it carries
      a named project that genuinely exercises the skill under test, the topic's
      FIRST follow-up (topic_follow_ups <= 1 -- see the ONCE PER TOPIC comment
      above the gate for why 1, not 0) is sourced from that project (Branch A)
      instead of from the candidate's last answer. Every later follow-up on the
      same topic is always Branch B, regardless of the match -- one project
      mention per topic, so a second follow-up doesn't reword the same "ask
      about a decision/tradeoff/metric" prompt into a near-duplicate of the
      first. Defaults to None, which keeps the pre-existing answer-drill
      behaviour (Branch B) exactly as it was -- so every call site that does not
      pass it is unchanged.

    topic_item: the TopicItem for the active topic. Supplies probe_focus/title/
      tech_stack, which is how the tested SKILL is identified (a competency, not a
      keyword) before searching the resume. Optional for the same reason.

    provenance_out: optional dict the caller passes in to receive this turn's
      follow-up provenance (follow_up_source / referenced_project / skill_matched)
      for logging and analytics. Written in place so the reported provenance comes
      from the SAME branch decision that actually built the directive -- recomputing
      it at the call site could disagree with what was really sent. Always populated
      with all three keys on a PROBE turn, including on the Branch B path.

    used_project_skills: (project title, tested skill) pairs already asked about in
      an earlier Branch A follow-up this interview (caller-maintained, session-
      scoped, both lower-cased). Passed straight through to find_resume_match. The
      SAME project may legitimately be named again for a genuinely different
      skill -- only the exact project+skill combination is excluded, so a
      candidate's one flagship project can still ground follow-ups on caching,
      API design, and testing across three different topics without repeating any
      one of those questions. Defaults to None (no exclusion, pre-existing
      single-best-match behaviour).
    """
    lines: list[str] = []
    # Default provenance = Branch B. Every early return below leaves this as-is
    # unless Branch A actually fires, so the field is never absent or stale.
    if provenance_out is not None:
        from interview.tech.resume_match import follow_up_provenance  # noqa: PLC0415
        provenance_out.update(follow_up_provenance(None))
    _signals_history = signals_history or []
    _same_signal_repeated = (
        len(_signals_history) >= 2
        and signal is not None
        and _signals_history[-1] == signal
        and _signals_history[-2] == signal
    )
    # Signals whose own directive text already prescribes what to do the second time
    # it fires (depth_shallow -> pivot to the failure-case variant; tradeoff_blind ->
    # treat continued silence as the finding, don't probe a third time; off_topic and
    # rephrase_request have their own "don't redirect/grant a third time" language;
    # pure_denial is handled entirely by the earlier topic_denied branch and never
    # reaches this point). For these, the generic ANGLE PIVOT block below would hand
    # the model a second, conflicting instruction on the same turn -- "ignore their
    # last answer, jump to an unrelated sub-concept" directly under a directive that
    # just said "adjust the angle on THIS answer." Let the signal's own handling win;
    # the pivot block only adds value for signals with no built-in repeat strategy.
    _SELF_HANDLED_ON_REPEAT = frozenset({
        "depth_shallow", "tradeoff_blind", "off_topic", "rephrase_request",
    })
    _same_signal_repeated = _same_signal_repeated and signal not in _SELF_HANDLED_ON_REPEAT

    # NO KEYWORD DENIAL FALLBACK.
    #
    # This branch used to also fire on a bare substring match over ("i forgot",
    # "i don't know", "not sure", ...) against the candidate's raw answer. That
    # match ran BEFORE the signal lookup and overrode whatever the classifier had
    # decided, so any answer merely CONTAINING a hedge was forced onto the denial
    # step-down path -- "I'm not sure exactly, but I'd use a HashMap" (a real
    # answer), "I don't remember, can you give me an example?" (a clarification
    # request), and "I don't know, maybe O(log n)" (a correct guess) were all
    # treated as flat non-attempts. No amount of prompt work on the classifier
    # could fix that, because the classifier's output was being discarded.
    #
    # Whether an answer is a genuine non-attempt is a judgment about CONTENT, not
    # a string match -- pure_denial's definition in scoring.py now carries the
    # mechanical strip-the-hedge-and-check-the-residue test, and the classifier
    # applies it with the full question and answer in view. Trust that decision.
    # topic_denied stays: it is state the caller owns, not a guess about text.
    if topic_denied or signal == "pure_denial":
        lines += [
            f"SIGNAL: {signal or 'candidate_denial'}",
            "WHAT: Candidate said they don't know, forgot, or can't explain this.",
            "GOAL: Accept it cleanly and ask an EASIER question on the SAME skill --",
            "      never pivot to a different, harder, or more advanced sub-domain.",
            "QUESTION TYPE: ACKNOWLEDGEMENT + STEP-DOWN",
            "PRINCIPLES:",
            "  - One short acknowledgement, then ask a simpler question on the same skill.",
            "  - Do NOT escalate to a more advanced or more abstract question after a denial.",
            "  - Give them an easy out — find the related, SIMPLER thing they might know.",
            "VOICE: Warm and low-pressure. 'No worries — what part of this did you actually touch?'",
            "SKIP: Never re-ask the same thing. Never make them feel punished for not knowing.",
        ]
        return "\n".join(lines)

    probe = SIGNAL_PROBES.get(signal or "", None) if signal else None
    if probe is None:
        probe = _DEFAULT_PROBE

    # -- BRANCH A GATE: resume-grounded follow-up ------------------------------
    # When the skill under test is something the candidate claims to have BUILT,
    # a verification question about that named project outranks another mechanism
    # drill on their last sentence. Branch A replaces the signal's probe framing
    # for this one turn (never appends to it -- see render_resume_grounded_probe).
    #
    # ONCE PER TOPIC. Branch A is eligible only on the topic's FIRST follow-up.
    #
    # topic_follow_ups is TopicState.follow_up_turns from eval.py, read AFTER
    # add_contribution() has already incremented it for the turn being scored --
    # so it is 1 (not 0) on the very first probe of a topic, 2 on the second, and
    # so on. Gating on 0 (as an earlier version of this code did) meant the gate
    # was never satisfied on any real turn, so Branch A silently never fired in
    # production even though it worked correctly in tests that called
    # get_probe_context directly with a hand-picked topic_follow_ups=0 -- a value
    # the real runtime never actually produces. Confirmed against
    # run_eval_and_build_directive (eval.py) and the read at agent_runtime.py's
    # PROBE branch (_topic_follow_ups = ...follow_up_turns...), both of which see
    # the post-increment count.
    #
    # Every follow-up after the first on this topic drills into what the
    # candidate just said, same as before this feature existed. Without this
    # gate, the same project keeps winning the match on every follow-up in the
    # topic (nothing else about the topic changes turn to turn), so the
    # directive gave the LLM the same "ask about a decision/metric/tradeoff/
    # failure-mode" framing twice in a row and it produced two differently-
    # worded versions of the same question -- e.g. "how did generators impact
    # CPU during Celery tasks?" immediately followed by "what caused the high
    # CPU when using generators?" on the same project. One project mention per
    # topic is the point: ask it once, then let the conversation go wherever
    # their answer actually leads.
    #
    # Only DEPTH signals are eligible. The response-shape signals and pure_denial
    # are excluded by construction: those turns are "repeat the question", "let
    # them redo it", "steer back on topic" and "step down to something easier" --
    # naming a resume project in any of them is a non-sequitur, and pure_denial
    # already returned above. resume_json=None (no resume, or matching disabled)
    # short-circuits to Branch B, which is the pre-existing behaviour verbatim.
    #
    # CODE/QUERY CARDS ARE ALWAYS FABRICATED EXAMPLES -- never eligible for Branch A.
    # A code_trace/snippet_eval/query_trace card is a synthetic exercise built to test
    # reasoning about a hypothetical snippet; it was never claimed as something the
    # candidate built. If the candidate just answered one of these and Branch A still
    # fires, the directive tells the LLM to ask a verification question about a REAL
    # resume project on the SAME skill -- which reads to the candidate as "where have
    # you used this in your projects?" about code they never wrote, because nothing in
    # this branch's output distinguishes "the skill" from "the specific fabricated
    # snippet you just read." Gate it out entirely rather than trying to thread that
    # distinction through the wording: the candidate's own project is still fair game
    # on a later VERBAL follow-up once the topic moves off the code card.
    _lqt_gate = (last_question_type or "").strip().lower()
    _resume_match = None
    if (
        resume_json
        and topic_follow_ups <= 1
        and signal not in _RESUME_INELIGIBLE_SIGNALS
        and _lqt_gate not in ("code_trace", "snippet_eval", "query_trace")
    ):
        from interview.tech.resume_match import (  # noqa: PLC0415
            extract_tested_skill,
            find_resume_match,
            follow_up_provenance,
            render_resume_grounded_probe,
        )
        _tested_skill = extract_tested_skill(
            topic_item=topic_item,
            active_topic=active_topic,
            prev_question=prev_question,
        )
        _resume_match = find_resume_match(
            resume_json=resume_json,
            tested_skill=_tested_skill,
            topic_item=topic_item,
            used_project_skills=used_project_skills,
        )
        if _resume_match.is_match:
            if provenance_out is not None:
                provenance_out.update(follow_up_provenance(_resume_match))
            lines.append(f"SIGNAL: {signal or 'none'}")
            if signal_reason:
                lines.append(f"TRIGGER (their exact words): \"{signal_reason}\"")
            lines.append(render_resume_grounded_probe(_resume_match, signal=signal))
            lines.append(f"VOICE: {probe['voice_note']}")
            lines.append(get_reaction_hint(signal, prev_answer, prev_question))
            # The repetition/declined-fact blocks still apply -- a resume-grounded
            # question can collide with an earlier opener just as easily, and a
            # fact the candidate already couldn't produce stays off-limits even
            # when it lives inside a project we just named.
            _rep = render_repetition_blocks(recent_question_patterns, declined_facts)
            if _rep:
                lines.append(_rep)
            return "\n".join(lines)

    # Fill the {original_question}/{off_topic_summary}/{continuation_excerpt}/
    # {clarification_request_text} placeholders that appear verbatim in some
    # directives (see clarification_request, off_topic, denial_with_continuation
    # in SIGNAL_PROBES). prev_answer doubles as clarification_request_text /
    # continuation_excerpt / off_topic_summary since it IS the text that carries
    # each of those meanings depending on which signal fired.
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
    lines.append(get_reaction_hint(signal, prev_answer, prev_question))

    _level_note = _LEVEL_OVERLAYS.get(signal or "", {}).get(level)
    if _level_note:
        lines.append(f"LEVEL ({level}): {_level_note}")

    # -- Code-type-specific follow-up guidance ----------------------------------
    # When the candidate's last answer was in response to a code card question,
    # the follow-up probe must be calibrated differently from a verbal question.
    # The candidate READ code and SPOKE their answer — the gap is about code
    # reasoning, not verbal recall, so the probe must stay in that domain.
    _lqt = (last_question_type or "").strip().lower()
    if _lqt in ("code_trace", "snippet_eval", "query_trace"):
        lines.append("")
        lines.append(f"LAST QUESTION TYPE: {_lqt.upper()} (candidate read code on screen, spoke answer)")
        if _lqt == "code_trace":
            if signal == "depth_shallow":
                lines.append(
                    "  CODE PROBE GUIDANCE: They gave the right output label but couldn't trace how. "
                    "Ask them to go line-by-line — 'start at line 1, what's the state of X at that point?' "
                    "Don't ask a generic 'how does it work' — force a concrete trace step."
                )
            elif signal == "depth_misconception":
                lines.append(
                    "  CODE PROBE GUIDANCE: They said the WRONG output. Surface it by asking about "
                    "a specific line or variable: 'after line 3 runs, what is the value of X?' "
                    "Don't correct them directly — let the trace reveal the error."
                )
            elif signal == "pure_denial":
                lines.append(
                    "  CODE PROBE GUIDANCE: They couldn't read the code at all. Drop the code card. "
                    "Ask a verbal mechanism question on the same concept — 'what does this construct "
                    "do in general?' without showing code again."
                )
            elif signal in ("depth_clear", "depth_strong"):
                lines.append(
                    "  CODE PROBE GUIDANCE: They traced it correctly. If probing further, escalate "
                    "to a harder case: change one input value or add a constraint and ask what changes."
                )
        elif _lqt == "snippet_eval":
            if signal == "depth_shallow":
                lines.append(
                    "  CODE PROBE GUIDANCE: They said 'something is wrong' but couldn't name what. "
                    "Point to a specific function or line: 'look at line N — what does that return "
                    "when X is empty?' Force them to trace the specific condition that triggers the bug."
                )
            elif signal == "depth_misconception":
                lines.append(
                    "  CODE PROBE GUIDANCE: They named a bug that doesn't exist (wrong diagnosis). "
                    "Ask them to trace the actual execution: 'if X is empty, walk me through what "
                    "happens on that specific line.' Let the trace surface the real issue."
                )
            elif signal == "pure_denial":
                lines.append(
                    "  CODE PROBE GUIDANCE: They couldn't find any bug. Don't show another snippet. "
                    "Ask verbally: 'what would happen if this function was called with an empty input?' "
                    "Give them a foothold into the problem without the code overhead."
                )
        elif _lqt == "query_trace":
            if signal == "depth_shallow":
                lines.append(
                    "  CODE PROBE GUIDANCE: They named the general behavior but couldn't trace it. "
                    "Ask about the specific edge case: 'what does the JOIN return when there are no "
                    "matching rows on the right side?' Force them to reason about the specific case."
                )
            elif signal == "depth_misconception":
                lines.append(
                    "  CODE PROBE GUIDANCE: They gave the wrong result. Ask a falsifying question: "
                    "'if that were true, what would happen when a user has NULL in that column?' "
                    "Let their own reasoning surface the error."
                )
            elif signal == "pure_denial":
                lines.append(
                    "  CODE PROBE GUIDANCE: They couldn't reason about the query. Drop to a verbal "
                    "question about the underlying concept: 'what does a LEFT JOIN do when there's "
                    "no matching row on the right side?' No code card this time."
                )



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

    _trend = _render_score_trend(topic_score_history)
    if _trend:
        lines.append("")
        lines.append(f"SCORE TREND ON THIS TOPIC: {_trend}")

    _repetition = render_repetition_blocks(recent_question_patterns, declined_facts)
    if _repetition:
        lines.append(_repetition)
    if cross_cutting_signal:
        lines += [
            "",
            f"CROSS-CUTTING SIGNAL: {cross_cutting_signal} — a delivery/behaviour observation that "
            f"runs alongside the content signal. Let it shape your TONE and pacing only. Never "
            f"mention it, never ask about it, never let it change what you probe.",
        ]

    return "\n".join(lines)
