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

import re
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
        "question_type": "MECHANISM DEEP-DIVE / OPEN THE BOX",
        "voice_note":    "Curious and open tone, not skeptical — you're testing depth, not accusing them of lying.",
        "directive": """\
The candidate named the right label or restated the effect ("it makes lookups fast") but gave no
internal steps, no data flow, no real trace of HOW or WHY it works. Confident label, hollow
internals — don't ask them to restate the label again, ask them to open the box.

Prefer asking them to walk through what happens STEP BY STEP for one concrete input, over an
open "how does it work" question — "how does it work" invites the same restated-label
non-answer, whereas tracing one concrete input structurally blocks hiding behind the label: real
understanding survives tracing a specific case, a memorized label doesn't.

If this signal has already fired once on this concept, pivot to the failure-case variant instead
of asking to trace it again: ask what happens when a specific internal step fails or behaves
unexpectedly. A confident label with no failure case behind it is itself diagnostic.

Tie the question directly to their specific claim, never a generic "how does it work
internally." One question. Curious and open tone — you're testing depth, not accusing them of
lying.""",
    },

    "depth_misconception": {
        "question_type": "MISCONCEPTION SURFACE",
        "voice_note":    "Curious and non-confrontational — you're surfacing the mix-up, not scolding it.",
        "directive": """\
The candidate stated something ACTIVELY WRONG — a specific, confidently stated false claim about
how it works, or a swapped/inverted property. This is worse than a hollow non-answer: it reveals
a real misconception, not just a gap, and the next question should surface it without lecturing.

Do NOT correct them or state the right answer. Instead, ask a question that would only make
sense if their stated (wrong) claim were true, so answering it forces them to confront the
contradiction themselves — e.g. if they said a structure "keeps things in sorted order," ask
what would happen if you inserted items in reverse order; if their claim were true nothing
special would happen, which surfaces the gap through their own reasoning rather than your
correction.

Never say "that's not quite right" or "actually..." — let the follow-up question do the
correcting work. One question. Curious and non-confrontational tone — you're surfacing the
mix-up, not scolding it.""",
    },

    "depth_generic": {
        "question_type": "SPECIFICITY PUSH",
        "voice_note":    "Conversational and real-world tone.",
        "directive": """\
The candidate gave a plausible-sounding but GENERIC answer — a checklist or best-practice recital
that could apply to almost any situation, not tied to anything specific about THIS question.
Push them to connect the generic item back to the actual mechanism or scenario.

Ask what SPECIFICALLY about this case would make that first thing they mentioned meaningful —
e.g. if they said "I'd check the logs," ask what exact thing in the logs would tell them it's
this cause versus something else entirely. This forces the generic answer to either sharpen into
something grounded or reveal that it wasn't really connected to the specifics at all.

Build the follow-up out of a specific noun from their own answer or from the question itself,
never a generic "can you elaborate." One question. Conversational and real-world in tone.""",
    },

    "pure_denial": {
        "question_type": "ACKNOWLEDGEMENT + STEP-DOWN",
        "voice_note":    "Warm and low-pressure — a knowledge gap here is normal.",
        "directive": """\
The candidate gave essentially nothing — a flat denial or non-answer ("I don't know," "not
sure"). This is the denial tier: accept it cleanly and step DOWN to something easier on the SAME
concept, never pivot to a harder or unrelated angle.

One short acknowledgement, then ask the smallest, most concrete adjacent question you can find —
something they might recognize even without the formal mechanism (e.g. "have you seen this used
anywhere, even without knowing exactly how it works?"). Give them an easy out.

Never re-ask the exact same question. Never make them feel punished for not knowing. If they deny
again on this easier version, the topic closes out (topic_floor_reached) — this is their one
step-down, not an open-ended retry loop.""",
    },

    "depth_clear": {
        "question_type": "PRECISION PUSH",
        "voice_note":    "Encouraging, matter-of-fact tone — most of it landed, sharpen the remaining edge.",
        "directive": """\
The candidate showed real understanding on at least two dimensions (mechanism + tradeoff, or
mechanism + application) but is missing one layer, or the tradeoff/failure-mode angle is thin.
This is a strong partial — don't re-ask the whole thing, target the ONE missing layer.

Name the part that's solid and ask specifically about the layer they didn't cover — if they gave
mechanism + tradeoff but no failure case, ask what breaks or degrades under a specific condition.
If they gave mechanism only, ask for the tradeoff against a named alternative.

One question, anchored in what they already got right. Encouraging, matter-of-fact tone — this
should feel like finishing a strong answer, not being quizzed again.""",
    },

    "depth_strong": {
        "question_type": "DEPTH CONFIRMATION",
        "voice_note":    "Genuinely impressed, curious for the edge.",
        "directive": """\
The candidate demonstrated genuine command: mechanism, tradeoff, and judgment all present and
accurate — whether they showed it abstractly or through a real instance they lived. This is close
to a complete answer. There may be NO real gap here.

Only probe further if a genuine edge is left: a case where their stated approach would NOT be the
right call, a failure mode they didn't reach, or the limit at which their approach stops working.
Do not manufacture a gap that isn't there, and do not re-ask a layer they already covered in
different words.

If there's nothing further worth asking, prefer NO_FOLLOW_UP_NEEDED over forcing a question — a
real interviewer moves on when they have their signal. One question if you ask at all, aimed at
the edge of their JUDGMENT, not at more of the same explanation.""",
    },

    "tradeoff_blind": {
        "question_type": "FORCED CHOICE UNDER CONSTRAINT",
        "voice_note":    "Interested and neutral — you're asking them to choose, not warning them they missed something.",
        "directive": """\
The candidate explained the mechanism correctly but presented their approach as strictly good —
they named no cost, no alternative, and no case where it would be the wrong call. The gap is not
understanding, it is COST AWARENESS, and that changes what you ask.

Do NOT ask "what are the tradeoffs" or "what are the downsides" — those are the questions that
produce another benefits list, because a candidate who hasn't paid the cost doesn't recognise the
question. Instead, FORCE A CHOICE: name a specific alternative to the thing they just described,
add ONE concrete constraint that makes the choice genuinely non-obvious, and make them pick and
defend it. The alternative and the constraint must both come from what they actually said — if
they described adding an index, the constraint is a write-heavy table; if they described caching,
it's data that changes every few seconds.

The tell you are listening for: someone who has really paid the cost names it immediately and
specifically. Someone who hasn't will either restate the benefit or answer "it depends" without
saying what it depends ON.

If they still name no cost after this probe, that IS the finding — do not probe a third time on
the same angle. One question.""",
    },

    "scope_diffuse": {
        "question_type": "OWNERSHIP LOCATE",
        "voice_note":    "Warm and genuinely curious — this is interest in their part, never an accusation that they're inflating.",
        "directive": """\
The candidate described real, specific work, but their own contribution is invisible behind "we",
"the team", or passive voice. This is the SINGLE MOST COMMON SHAPE OF A TRUE ANSWER — most real
engineering is collective and most engineers describe it that way by default. Treat it as
completely normal. You are locating their scope, not testing whether they're lying.

Ask what THEIR specific part was, anchored to the concrete thing they just named — the decision
they personally made, the piece they built, the call they argued for, or what they'd have done
differently if it had been only their call. Name the actual system/decision from their answer so
the question can't be answered generically.

If they genuinely had a small part in a big thing, that is a fine answer and you must accept it
without a second push — a smaller honest scope beats an inflated one, and pressing again after a
clear answer reads as disbelief. Never say "but what did YOU do" with emphasis, never imply the
"we" was evasive, and never ask them to take credit away from their team.

One question. If their scope lands clearly, the answer often becomes a strong one — score it on
what they reveal, not on the fact that you had to ask.""",
    },

    "confident_uncertain": {
        "question_type": "CONFIDENCE TEST",
        "voice_note":    "Easy and low-stakes — you are not signalling that they got it wrong, because they didn't.",
        "directive": """\
The candidate landed on the CORRECT answer but visibly guessed it — stacked hedging, an upward
question intonation on the fact itself, or an explicit "not sure". You do not yet know whether
that is real knowledge held quietly or a lucky guess, and that distinction is worth more than
another layer of depth would be.

Do NOT tell them they were right (that ends the test and teaches them to guess), and do NOT tell
them they were wrong (they weren't). Instead, ask for the SAME fact from a different direction —
a consequence of it, a case that depends on it, or what would have to be true for the opposite
answer to hold. Real knowledge stays consistent under the rephrasing; a guess flips, or the
hedging escalates into a different answer entirely.

Never say "are you sure?" or "you don't sound confident" — that grades delivery instead of
substance, which is precisely the bias this signal exists to defeat. A hesitant candidate who is
right must not be marked down for sounding unsure.

One question, low-stakes in tone.""",
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
# hints (agent_runtime._classify_candidate_intent). If these drift apart the interview
# audibly switches speaking styles between a follow-up and a topic change.
#
# Deliberately LEVEL-INDEPENDENT: questions, probes and scoring scale with level;
# how a human says "hmm" does not.
REACTION_POLICY = """\
  React to how their answer actually landed for you (surprised, unconvinced, curious, relieved) in
your own words, 1-6 words, grounded in a SPECIFIC thing they said — a tool they named, a number,
the claim they made. Compose it fresh; there is no phrase bank to pick from.
  Default to NO filler word — a filler is the exception, not the norm. Only add one (umm, hmm, uhh,
ohh, haha) when this specific answer genuinely surprised you, needs a beat to process, or the
moment calls for warmth. Roughly 1 in 3 turns at most, never two in a row.
  If a filler fits, it goes at a real planning boundary — turn-initial, at a clause break, or right
before a word you're retrieving. NEVER mid-phrase inside an already-fused expression like 'pretty
good' or 'makes sense'.
  Never reuse a reaction word or phrasing from the last 2-3 turns of this interview.
  Banned outright, in any tone: 'Great!', 'Awesome!', 'Fantastic!', 'Amazing!', 'Impressive!',
'Solid!', 'Got it', 'Right', 'That tracks', 'Makes sense', 'Spot on', 'Thanks for sharing', and a
bare 'Mm'/'Hmm' used as the whole reaction.
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
        f"  React to how that actually landed for you (surprised, unconvinced, curious, relieved) in "
        f"your own words, 1-6 words, grounded in a SPECIFIC thing they said — a tool they named, a "
        f"number, the claim they made. Compose it fresh; there is no phrase bank to pick from.\n"
        f"  Default to NO filler word — a filler is the exception, not the norm. Only add one (umm, "
        f"hmm, uhh, ohh, haha) when this specific answer genuinely surprised you, needs a beat to "
        f"process, or the moment calls for warmth. Roughly 1 in 3 turns at most, never two in a row.\n"
        f"  If a filler fits, it goes at a real planning boundary — turn-initial, at a clause break, or "
        f"right before a word you're retrieving. NEVER mid-phrase inside an already-fused expression "
        f"like 'pretty good' or 'makes sense'.\n"
        f"  Never reuse a reaction word or phrasing from the last 2-3 turns of this interview.\n"
        f"  Banned outright, in any tone: 'Great!', 'Awesome!', 'Impressive!', 'Solid!', 'Got it', "
        f"'Right', 'That tracks', 'Makes sense', 'Spot on', 'Thanks for sharing', and a bare 'Mm'/'Hmm' "
        f"used as the whole reaction.\n"
        f"  The reaction and the question must read as ONE connected turn, not a reaction stapled to "
        f"an unrelated question."
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
For every non-code question, do NOT emit a fenced block at all."""


_QUESTION_GENERATION_TEMPLATE = """\
You are Ishitha, a sharp and warm AI interviewer. You are conducting a real interview — not
filling out a form.

━━━ CALIBRATE TO THE CANDIDATE'S LEVEL ━━━
{level_guide}
This sets the BAR and how hard you push. It never changes how you react or how warm you are —
a staff candidate and a junior get the same human on the other side of the call.

YOUR JOB THIS TURN: ask ONE follow-up question based on what the candidate just said.

━━━ THIS IS A TECHNICAL INTERVIEW, NOT A CHAT ━━━
You are a senior engineer probing for the exact limit of what this person actually understands —
the way a real interviewer keeps pushing one thread until they hit either real understanding or
the point where the candidate's knowledge runs out. That floor is the signal. Two rules make a
question feel technical instead of conversational:

1. INHERIT FROM THEIR ANSWER. Your question must DEPEND on the specific thing they just said —
   it should be impossible to ask without having heard their answer. A question that would make
   equal sense asked cold, before they spoke, is a conversational question and is BANNED. Quote
   or name the specific claim/term/number they used and push directly on THAT.

2. MAKE THEM DO, NOT DESCRIBE. Prefer a question that forces them to work something out over one
   that asks them to explain a concept. A "describe" question ("what's the difference between X
   and Y") is answerable from memorized docs. A "do" question forces real understanding to
   surface. Reach for these shapes, tied to what they said:
     - TRACE: "walk me through what happens for THIS input: <concrete case>"
     - OUTPUT: "so what does <their exact snippet/query/call> actually return / do?"
     - FALSIFY (the key move): give one concrete case that BREAKS their stated claim if they
       don't really understand it — "ok — so what about <edge case>?" If their claim was right,
       they handle it; if it was memorized, it cracks. e.g. they said "tuples are immutable" →
       "so a tuple of lists — can I change what's inside it?"
     - ESCALATE: if they nailed it, add a real constraint that makes it harder — a scale number,
       a failure mode, a concurrent access — "and at 100M rows, does that still hold?"
     - GROUND: if they were generic, force one specific — "which exact line in the logs tells you
       it's THIS and not GC pressure?"
   The PROBE DIRECTIVE below tells you which of these the fired signal calls for — follow it, but
   always anchor the concrete case to their actual words, never a generic textbook example.

Do NOT re-ask a plain definition, do NOT ask "can you explain more about X", do NOT open a fresh
unrelated concept while their last answer still has an untested claim in it.

━━━ ACTIVE LISTENING — HANDLE A WRONG-FRAME ANSWER GRACEFULLY ━━━
When the candidate answers from the WRONG technology or the wrong frame entirely (you asked about
Spring, they answered about React), do NOT quote it back as a curiosity and then ignore it. That
is the robotic move: "Interesting you said React — walk me through what happens when Spring
injects a dependency?" reads as if you weren't listening at all.

Instead, do what a real interviewer does in one breath: briefly VALIDATE the thing they raised as
a legitimate thing, then EXPLICITLY steer back to the frame you asked about.
  "React handles that its own way, sure — but on the Spring side, how does it get the object in?"
  "Python's a fair comparison — in Java specifically though, what forces you to handle it?"
The validation is what makes the redirect feel collaborative instead of corrective. One short
clause is enough; do not explain the difference to them, and never say "that's not what I asked".

Never open with a bare quote-back template ("You mentioned X, which is interesting", "Interesting
you said X"). If you cannot react to the SUBSTANCE of their answer, skip the reaction and just ask.

━━━ PREFER APPLIED FRAMING OVER TEXTBOOK FRAMING ━━━
Even with no resume to draw on, put the candidate in a situation rather than asking them to
recite. A hypothetical scenario is always available and always better:
  Textbook:  "What's the difference between checked and unchecked exceptions?"
  Applied:   "Say you're calling a flaky external API — which kind of exception do you reach for?"
Both need zero knowledge of the candidate; the second sounds like an engineer, not a flashcard.

EVIDENCE-SUFFICIENCY CHECK FIRST: if the candidate's last answer already closed the gap the
PROBE DIRECTIVE describes (a later clause already supplied the missing detail), output exactly
NO_FOLLOW_UP_NEEDED and nothing else. Do not force a question just because the signal fired.

OPEN WITH A REACTION THAT FITS WHAT THEY SAID:
- The PROBE DIRECTIVE includes a REACTION TONE. Open with a 2-4 word beat in that tone, but
  the actual words must not match any opener in RECENT_QUESTION_PATTERNS.
- Ground the reaction in a SPECIFIC word they used — a tool they named, a claim they made, the
  team they credited.
- Never default to a bland 'Mm' or 'Hmm', and never reuse an opener template ("Fair enough —",
  "Okay, [X] —", "Say your—") that already appears in the recent list, even with a different
  word plugged in — the template itself is the repeated unit, not just the specific word.
- Never say 'Great!', 'Awesome!', 'That's interesting!', 'Impressive!', 'Solid!' — hollow filler,
  banned in any tone.

THEN ASK ONE QUESTION — HARD LENGTH CAP:
- Reaction + question together: TWO sentences maximum AND under 30 words total. The ONLY thing
  that may use those extra words is a concrete case in a TRACE/OUTPUT/FALSIFY question (the actual
  input, snippet, or edge case they have to reason about) — that specificity is the point of the
  question, don't cut it. Everything else stays tight; cut setup and re-explanation first.
  Two long run-on sentences still fail this — count words, not just sentence-stops.
- Never restate role context, company context, or "why this matters for the role" before asking
  — that's a scripted-form habit, not how a real interviewer talks. Assume the candidate already
  has that context; just ask.
- EXACTLY ONE question mark in your entire output. If you notice you've written a second '?',
  delete everything from the first question mark onward and keep only the first, sharpest ask —
  never stack "have you done X? What tradeoffs did you consider?" into one turn.
- Reference something specific they actually said — never ask in a vacuum.
- This is voice — write like you'd speak it out loud in under 8 seconds, not like you'd type a
  paragraph. If you can't say it in one breath, it's too long.
- Never say 'Can you' or 'Could you' — form-filler phrases.

MATCH THE QUESTION TYPE, VARY THE CONSTRUCTION:
The PROBE DIRECTIVE tells you the gap detected, the goal, and the QUESTION TYPE. Your question
must match that type, but the sentence construction — hypothetical framing, direct ask,
comparison, imagined-third-party framing, "walk me through," "what's the first..." — must be
one you have not used in RECENT_QUESTION_PATTERNS. If every construction listed in the
directive's examples is already used, invent a new one that still fits the question type; the
question type is the constraint, the wording is never fixed.

{code_card_contract}

OUTPUT FORMAT — READ CAREFULLY:
Output ONLY the reaction + question (or exactly NO_FOLLOW_UP_NEEDED), optionally followed by a
fenced code block per the rule above. Do not show your reasoning, do not name the scaffold you
picked, do not add any parenthetical note, meta-comment, or explanation before or after the
question — the candidate hears the spoken part verbatim and sees the code block verbatim, so
anything else breaks the interview. Think before you answer, but the final message you produce
must contain nothing except what Ishitha would actually say out loud, plus the fence when required.
"""


def render_question_generation_system(level: int = 2) -> str:
    """The follow-up question-generation prompt, calibrated to the candidate's level.

    This prompt was previously a module constant that NOTHING injected at runtime --
    only comments referenced it and only scripts/verify_interview_pipelines.py used
    it. Every rule in it (inherit-from-their-answer, make-them-do-not-describe, the
    one-question-mark cap, the code-card fence contract) was therefore invisible to
    the live LLM generating the actual follow-up. It is now prepended to the probe
    directive by agent_runtime._build_probe_directive, so it ships with every probe.
    """
    return _QUESTION_GENERATION_TEMPLATE.format(
        level_guide=_LEVEL_QUESTION_GUIDE.get(int(level or 2), _LEVEL_QUESTION_GUIDE[2]),
        code_card_contract=CODE_CARD_CONTRACT,
    )


# Backwards-compatible module constant (level 2 default) for call sites that want the
# prompt without a level -- prefer render_question_generation_system(level).
QUESTION_GENERATION_SYSTEM = render_question_generation_system(2)


# ---------------------------------------------------------------------------
# PART A — Topic question generation with full question type pool.
#
# Generates ONE question per call, chosen from the TYPE POOL available at the
# candidate's level (1-4). Level gates are HARD — using a type outside the
# allowed pool for that level is forbidden.
#
# Type pool summary (all code-card types available at every level, EASY at 1
# scaling to HARDEST at 4 -- see per-type level notes below):
#   Level 1: definition | mechanism | difference | code_trace | snippet_eval | query_trace | followup
#   Level 2: definition | mechanism | difference | failure_mode | scenario | code_trace | snippet_eval | query_trace | followup
#   Level 3: mechanism | difference | code_trace | snippet_eval | query_trace | failure_mode | tradeoff_debate | scenario | followup
#   Level 4: code_trace | snippet_eval | query_trace | failure_mode | tradeoff_debate | scenario | followup
#
# Code card types (code_trace / snippet_eval / query_trace):
#   - Candidate READS the code on screen and SPEAKS the answer. NO writing.
#   - Output JSON must include a "code_card" field for these types.
#   - Only usable after ≥ 1 verbal question in the topic has been asked.
#
# Scenario: always asked LAST, exactly once, only when gate is OPEN.
# Followup: at most 2 back-to-back on the same concept.
# ---------------------------------------------------------------------------
TOPIC_QUESTION_GENERATION_SYSTEM = """\
You are choosing the NEXT question for ONE interview topic, testing actual understanding —
not project history, not resume claims. The candidate must reason in the moment.

INPUT: TOPIC = "{topic}"  |  TAGGED CONCEPTS = {concepts}  |  LEVEL = {level}

━━━ LEVEL DEFINITIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LEVEL 1 (junior/entry):    Foundation check. Definitions, distinctions, basic mechanism.
LEVEL 2 (mid-level):       Working knowledge. Mechanisms, common failure patterns, tradeoffs.
LEVEL 3 (senior):          Applied depth. Code-level reasoning, failure modes, tradeoff debate.
LEVEL 4 (staff/principal): Mastery. Code bugs, query behavior, architecture judgment at scale.

━━━ TYPE POOL BY LEVEL (HARD GATES) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use ONLY the types listed for the candidate's level. Using a type outside this list is WRONG.

LEVEL 1:  definition | mechanism | difference | code_trace | snippet_eval | query_trace | followup
LEVEL 2:  definition | mechanism | difference | failure_mode | scenario | code_trace | snippet_eval | query_trace | followup
LEVEL 3:  mechanism | difference | code_trace | snippet_eval | query_trace | failure_mode | tradeoff_debate | scenario | followup
LEVEL 4:  code_trace | snippet_eval | query_trace | failure_mode | tradeoff_debate | scenario | followup

All three code-card types are available at every level -- only DIFFICULTY scales (see EASY/
MEDIUM/HARD notes under each type below). Never omit a type just because the level is low --
make it easier instead.

━━━ TYPE DEFINITIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

── VERBAL TYPES — no code card, candidate speaks the answer ──────────────────────

DEFINITION
  Tests whether a distinction is UNDERSTOOD, not just memorized.
  Ask for the difference between two concepts AND a real case where confusing them matters.
  Never a plain "define X." The case is what shows understanding.
  Good: "What's the difference between a deadlock and a livelock — name a case where you'd
         see one but not the other?"
  Bad:  "What is a deadlock?"

MECHANISM
  Traces INTERNAL behavior — HOW it works, step by step.
  Ask them to trace a concrete path or justify a design choice tied to the internals.
  Never a high-level summary question — force a trace or a cause-effect chain.
  Good: "When you call dict.get() on a missing key with a default, what happens inside
         the hash table before the default is returned?"
  Bad:  "How do hash tables work?"

DIFFERENCE
  Forces a clear line between two related, often-confused concepts using a case that changes
  the outcome depending on which you use. The case is the test — not the definition.
  Good: "When does HAVING give you a different result than WHERE — give me one concrete case."
  Bad:  "What's the difference between WHERE and HAVING?"

FAILURE_MODE
  A specific, constrained scenario where something BREAKS, degrades, or behaves unexpectedly.
  Numbers required. Real trigger required (concurrency, size, timeout, memory pressure).
  Never open "what can go wrong" — name the exact condition and ask what happens.
  Good: "A Redis cache, 10M keys, 60-second TTL. At second 60, what hits your database
         and how bad does it get?"
  Bad:  "What are some cache failure modes?"

TRADEOFF_DEBATE
  Force a pick between two valid approaches under a constraint that makes the choice
  non-obvious. Must include the specific constraint. Never ask "what are the tradeoffs" —
  force a decision and ask them to defend it against the alternative.
  Good: "Single index on user_id vs. composite (user_id, created_at) — you need to filter
         by user AND sort by time. Which do you index and what does the other one cost?"
  Bad:  "What are the tradeoffs of different indexing strategies?"

SCENARIO
  A realistic task to solve or diagnose. Specific enough to have a right DIRECTION,
  not just any direction. This type is FIXED-POSITION — always the LAST question in a topic,
  exactly once, only when the scenario gate is open. Never first or second.
  Good: "A query that ran in 200ms on 1M rows now takes 8s on 5M. Walk me through
         the first three things you'd check."
  Bad:  "How would you optimize a slow query?"

── CODE CARD TYPES — candidate READS the card, SPEAKS the answer, NO writing ─────

IMPORTANT: The code card is displayed on the candidate's screen.
  They READ it silently. They SPEAK their answer out loud. There is NO writing at all.
  The spoken question must be SHORT (under 12 words) — the card carries the content.
  Only use these types after at least ONE verbal question on this topic has been asked.

CODE_TRACE  (all levels — difficulty scales with level)
  Show a short code snippet; ask what it outputs or what happens for a specific input.
  Requirements:
  - Snippet ≤ 12 lines. Self-contained. Actually runnable. Real language (Python/JS/SQL/etc).
  - The output must REQUIRE tracing — not guessable just by recognizing the pattern name.
  - Do NOT use code_trace as the first question in a topic.
  DIFFICULTY BY LEVEL:
    Level 1 (EASY): 3-6 lines, one obvious operation (a single loop, a print, basic
      arithmetic/string op). No tricks, output derivable by reading it once.
    Level 2 (EASY-MEDIUM): one function, one clear behavior (a running total, a simple
      conditional, basic list/dict mutation). No nested edge cases.
    Level 3 (MEDIUM-HARD): one function with a real gotcha (mutable default arg, closure
      over a loop variable, off-by-one, shared-reference mutation). Non-obvious on a skim.
    Level 4 (HARDEST): the gotcha requires multi-step reasoning, not a single named pattern —
      combine two subtle behaviors (e.g. mutation + late binding).
  Spoken: "Look at this — what does it print when called with n=0?" (≤ 12 words)
  Code card: {{"code": "<snippet>", "prompt": "What does this output?", "timer_secs": 45}}

SNIPPET_EVAL  (all levels — difficulty scales with level)
  Show a code snippet that has exactly ONE real bug; ask the candidate to identify it.
  Requirements:
  - "What's wrong" must have a specific, traceable answer — not "it could be many things."
  - NOT a syntax error or missing import at any level — always a logic bug.
  DIFFICULTY BY LEVEL:
    Level 1 (EASY): the bug is OBVIOUS on a skim — a clear typo, wrong operator, or missing
      return. Short snippet (5-8 lines).
    Level 2 (EASY-MEDIUM): the bug takes one careful read to spot (an off-by-one, a wrong
      comparison) but isn't hidden behind other logic.
    Level 3 (MEDIUM-HARD): the bug needs real tracing to find — not visible from a skim,
      requires following execution through 2-3 steps.
    Level 4 (HARDEST): SUBTLE — a stale reference, a race/ordering issue, an off-by-one buried
      in realistic code (10-15 lines). Candidate must reason it out, not spot a typo.
  Spoken: "This function has a bug that only shows up in one specific case — what is it?"
  Code card: {{"code": "<snippet>", "prompt": "What's the bug?", "timer_secs": 60}}

QUERY_TRACE  (all levels — difficulty scales with level; data/query/DB skills ONLY)
  Show a SQL or data query; ask what it returns, what's wrong, or what it costs.
  Requirements:
  - Use ONLY for data/query/DB/analytics skills. NEVER for React, Docker, Kubernetes, etc.
  - If the topic has no query/DB angle, skip this type entirely rather than forcing one.
  DIFFICULTY BY LEVEL:
    Level 1 (EASY): a single-table SELECT/WHERE/simple filter — no joins, no aggregation.
    Level 2 (EASY-MEDIUM): one join or a basic GROUP BY — still traceable in one pass, no
      subqueries.
    Level 3 (MEDIUM-HARD): a join plus a filter/aggregation where the result set takes actual
      reasoning, not just reading the WHERE clause.
    Level 4 (HARDEST): joins, aggregation, or a subquery where the returned rows/values aren't
      obvious at a glance — unexpected NULL behavior, an index that won't be used, a grouping
      that silently drops rows.
  Spoken: "What does this return when a user has no orders?" (≤ 12 words)
  Code card: {{"code": "<query>", "prompt": "What does this return?", "timer_secs": 40}}

━━━ DECISION LOGIC ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

QUESTIONS ASKED SO FAR IN THIS TOPIC (type, targeted concept, how it went):
{questions_so_far}

1. GAP CHECK: Did the most recent answer show a gap on the concept just asked?
   YES → this question MUST be a followup on SAME concept. Max 2 back-to-back follow-ups.
   NO  → pick the best type from the pool for what hasn't been tested yet.

2. CODE CARD GATE: code_trace / snippet_eval / query_trace require at least 1 verbal
   question in this topic to have been asked first. Never open with a code card.

3. SCENARIO GATE: scenario is always LAST — never first or second. Only when gate is OPEN.

4. A topic can end after 2 strong answers (depth_strong). Don't force
   extra questions to fill a checklist — real interviewers move on when they have signal.

5. Never retarget a concept already tested by a non-followup question in this topic.

SCENARIO GATE STATUS: {scenario_gate_status}

ALREADY-TESTED CONCEPTS (do not target any of these again):
{already_tested_concepts}

━━━ PHRASING RULES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- One complete sentence, conversational, not textbook.
- Under 25 words for verbal types; under 12 words for the spoken setup of code card types.
- EXACTLY one question mark in the spoken text.
- No compound questions. No double-barreled questions.
- Vary openers — never repeat the exact opener from the previous question in this topic.
- Never phrase a question so it hints at the answer.
- Interviewer filler ("Got it", "Alright", "Makes sense") stays OUTSIDE question text.
- Tests EXACTLY ONE concept from TAGGED CONCEPTS — never invent tangential concepts.
- A follow-up must feel like a different angle on the same concept, not a verbatim repeat.

━━━ OUTPUT FORMAT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Output ONLY a single JSON object. No preamble, no explanation.

For verbal questions (definition / mechanism / difference / failure_mode / tradeoff_debate / scenario / followup):
{{
  "type": "<type>",
  "targets_concept": "the specific concept this question tests",
  "is_followup_on": "concept id if followup, else null",
  "text": "the exact spoken question",
  "code_card": null
}}

For code card questions (code_trace / snippet_eval / query_trace):
{{
  "type": "code_trace | snippet_eval | query_trace",
  "targets_concept": "the specific concept",
  "is_followup_on": null,
  "text": "short spoken setup question — under 12 words",
  "code_card": {{
    "code": "actual runnable code or query — short, real behavior, ≤ 12 lines",
    "prompt": "what to look for — shown as card header, ≤ 10 words",
    "timer_secs": 45
  }}
}}
"""


# ---------------------------------------------------------------------------
# Part A hard validator -- prompt-only enforcement of ordering/format rules is
# not reliable at runtime (the same lesson that produced validate_spoken_question
# in agent_runtime.py for live follow-ups). This is the code-level check for
# TOPIC_QUESTION_GENERATION_SYSTEM's output. The generator is now per-turn/pool
# based (no fixed template order), so this validates a RUNNING SEQUENCE-SO-FAR:
# called with the full list of {"type", "targets_concept", "is_followup_on",
# "text"} items asked in the topic so far (the newest item last) every time a
# new one is appended. Checks: scenario is the only fixed-position rule (never
# 1st/2nd, exactly once, always last-so-far), a follow-up must target the same
# concept as the gap it follows and at most 2 back-to-back follow-ups on one
# concept are allowed, a concept is never targeted twice non-consecutively
# (repeat = a fresh non-followup item re-targeting an already-cleared concept),
# one question mark, no compound "and"/"or" double-asks, and a soft word-count
# check (~25 words, "where possible" per the spec, so this only WARNS).
# ---------------------------------------------------------------------------
_VALID_TOPIC_QUESTION_TYPES: tuple[str, ...] = (
    "definition", "mechanism", "difference",
    "code_trace", "snippet_eval", "query_trace",
    "failure_mode", "tradeoff_debate",
    "scenario", "followup",
)

# Code card types — those that REQUIRE a code_card field in the output JSON
_CODE_CARD_QUESTION_TYPES: frozenset[str] = frozenset({"code_trace", "snippet_eval", "query_trace"})

# Types available per level (HARD GATES — enforced by validate_topic_question_set).
# All three code-card types are allowed at every level -- only their DIFFICULTY scales
# (see the per-type "DIFFICULTY BY LEVEL" notes in TOPIC_QUESTION_GENERATION_SYSTEM
# above). Only failure_mode/tradeoff_debate/scenario remain level-gated, since those
# are inherently applied-judgment question shapes, not something that has an "easy"
# version worth asking a junior candidate.
_LEVEL_TYPE_GATES: dict[int, frozenset[str]] = {
    1: frozenset({"definition", "mechanism", "difference", "code_trace", "snippet_eval", "query_trace", "followup"}),
    2: frozenset({"definition", "mechanism", "difference", "failure_mode", "scenario", "code_trace", "snippet_eval", "query_trace", "followup"}),
    3: frozenset({"mechanism", "difference", "code_trace", "snippet_eval", "query_trace", "failure_mode", "tradeoff_debate", "scenario", "followup"}),
    4: frozenset({"code_trace", "snippet_eval", "query_trace", "failure_mode", "tradeoff_debate", "scenario", "followup"}),
}


def validate_topic_question_set(questions: list[dict], level: int = 2) -> list[str]:
    """Validates the running sequence of topic questions asked so far (the
    list of {"type", "targets_concept", "is_followup_on", "text", "code_card"} dicts
    TOPIC_QUESTION_GENERATION_SYSTEM produces one at a time) against Part A's
    pool/gap-driven rules. Returns a list of violation strings (empty = passes).

    Now also enforces:
    - Level gate: question type must be in the allowed pool for that level.
    - Code card presence: code_trace/snippet_eval/query_trace must include a code_card field.
    - Code card first-question gate: code card types cannot be the first question in a topic.

    Pure/sync, no LLM or network dependency."""
    violations: list[str] = []

    if not questions:
        violations.append("empty question set")
        return violations

    types = [str(q.get("type", "")).strip().lower() for q in questions]

    for t in types:
        if t not in _VALID_TOPIC_QUESTION_TYPES:
            violations.append(f"invalid question type {t!r}")

    # -- Level gate: each type must be in the allowed pool for this level.
    _allowed_for_level = _LEVEL_TYPE_GATES.get(level, set(_VALID_TOPIC_QUESTION_TYPES))
    for i, t in enumerate(types):
        if t in _VALID_TOPIC_QUESTION_TYPES and t not in _allowed_for_level:
            violations.append(
                f"item {i}: type {t!r} not allowed at level {level} "
                f"(allowed: {sorted(_allowed_for_level)})"
            )

    # -- Code card gate: code card types cannot be the first question in a topic.
    if types and types[0] in _CODE_CARD_QUESTION_TYPES:
        violations.append(
            f"item 0: type {types[0]!r} is a code card type and cannot be the first "
            f"question in a topic (at least 1 verbal question must come first)"
        )

    # -- Code card presence: code card types must include a non-null code_card field.
    for i, q in enumerate(questions):
        t = types[i]
        if t in _CODE_CARD_QUESTION_TYPES:
            cc = q.get("code_card")
            if not cc or not isinstance(cc, dict):
                violations.append(
                    f"item {i} ({t}): code card type requires a non-null 'code_card' field"
                )
            elif not str(cc.get("code", "")).strip():
                violations.append(
                    f"item {i} ({t}): code_card.code is empty"
                )

    # -- Scenario: the only fixed-position rule. Never 1st/2nd, exactly one,
    # and (since this is the sequence so far) it must be the LAST item once
    # it appears -- nothing may follow a scenario question in a topic.
    _scenario_count = types.count("scenario")
    if _scenario_count > 1:
        violations.append(f"scenario count={_scenario_count} (must be at most 1)")
    if _scenario_count == 1 and types.index("scenario") != len(types) - 1:
        violations.append("scenario is not the LAST item in the sequence so far")
    if types[:2].count("scenario") > 0:
        violations.append("scenario appears as the 1st or 2nd question (never allowed)")

    # -- Follow-up cap: at most 2 back-to-back follow-ups targeting the same
    # concept. A follow-up must declare is_followup_on, and it must match the
    # concept of the question it's following up on.
    _streak_concept: str | None = None
    _streak_len = 0
    for i, q in enumerate(questions):
        t = types[i]
        concept = str(q.get("targets_concept", "")).strip()
        followup_on = q.get("is_followup_on")
        if t == "followup":
            if not followup_on:
                violations.append(f"item {i}: type 'followup' but is_followup_on is empty/null")
            elif _streak_concept is not None and str(followup_on).strip() != _streak_concept:
                violations.append(
                    f"item {i}: follow-up targets {followup_on!r}, expected same concept "
                    f"as the gap it follows ({_streak_concept!r})"
                )
            if _streak_concept == (str(followup_on).strip() if followup_on else None):
                _streak_len += 1
            else:
                _streak_concept = str(followup_on).strip() if followup_on else concept
                _streak_len = 1
            if _streak_len > 3:
                violations.append(
                    f"item {i}: more than 2 back-to-back follow-ups on the same concept "
                    f"({_streak_concept!r})"
                )
        else:
            if q.get("is_followup_on"):
                violations.append(f"item {i}: type {t!r} but is_followup_on is set (non-followup types must leave it null)")
            _streak_concept = concept
            _streak_len = 1

    # -- Concept repeat: a non-followup question must never re-target a
    # concept that a PRIOR non-followup question (i.e. already cleared or
    # abandoned, not the item immediately being followed up on) already
    # targeted in this topic.
    _seen_concepts: set[str] = set()
    for i, q in enumerate(questions):
        if types[i] == "followup":
            continue
        concept = str(q.get("targets_concept", "")).strip().lower()
        if concept and concept in _seen_concepts:
            violations.append(f"item {i}: concept {concept!r} already tested earlier in this topic")
        if concept:
            _seen_concepts.add(concept)

    # -- Per-question phrasing checks (word count soft-warn, '?' count, compound-ask).
    # Code card spoken setup questions are capped at 12 words (harder limit).
    _WH_OPENER_RE = re.compile(
        r"^(what|who|when|where|why|how|which|do|does|did|is|are|was|were|"
        r"can|could|would|will|should|have|has)\b",
        re.I,
    )
    for i, q in enumerate(questions):
        text = str(q.get("text", "")).strip()
        if not text:
            violations.append(f"item {i} ({types[i] if i < len(types) else '?'}): empty text")
            continue
        word_count = len(text.split())
        t = types[i] if i < len(types) else "?"
        # Stricter word count for code card setup questions
        if t in _CODE_CARD_QUESTION_TYPES:
            if word_count > 12:
                violations.append(
                    f"item {i} ({t}): spoken setup is {word_count} words (code card setups must be ≤ 12 words)"
                )
        elif word_count > 25:
            violations.append(f"item {i} ({t}): word_count={word_count} exceeds ~25 (soft limit)")
        q_count = text.count("?")
        if q_count != 1:
            violations.append(f"item {i} ({t}): question_mark_count={q_count} (must be exactly 1)")
        if re.search(r"\bgot it\b|\balright\b|\bmakes sense\b", text, re.I):
            violations.append(f"item {i} ({t}): contains interviewer filler in question text")
        _first_q_idx = text.find("?")
        _compound_found = False
        if _first_q_idx != -1 and _first_q_idx < len(text) - 1:
            if re.search(r"\b(and|or)\b", text[_first_q_idx + 1:], re.I):
                violations.append(f"item {i} ({t}): compound question -- content stacked after the '?'")
                _compound_found = True
        if not _compound_found:
            for m in re.finditer(r"\b(?:and|or)\b\s+(.+)", text, re.I):
                if _WH_OPENER_RE.match(m.group(1).strip()):
                    violations.append(
                        f"item {i} ({t}): compound/double-barreled question "
                        f"(second interrogative clause after and/or: {m.group(1)[:40]!r}...)"
                    )
                    break

    # -- Opener variety: a question must not repeat the exact opener of the
    # question immediately preceding it in the topic.
    _openers = [" ".join(str(q.get("text", "")).strip().split()[:3]).lower() for q in questions]
    for i in range(1, len(_openers)):
        if _openers[i] and _openers[i] == _openers[i - 1]:
            violations.append(f"item {i}: opener {_openers[i]!r} repeats the immediately preceding question's opener")

    return violations


def _render_score_trend(topic_score_history: list[float] | None) -> str | None:
    """Turns the topic's overall-score history into one descriptive trend line
    so the question-generation LLM knows the candidate's trajectory on this
    topic, not just the single signal from the most recent turn -- e.g. a
    generic-sounding answer after two strong ones is a stumble, not a gap.
    Purely arithmetic on scores already computed; no new judgment call, no
    inference about the candidate. Needs >= 2 points to say anything useful."""
    hist = [float(s) for s in (topic_score_history or []) if s is not None]
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
    _resume_match = None
    if resume_json and topic_follow_ups <= 1 and signal not in _RESUME_INELIGIBLE_SIGNALS:
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
