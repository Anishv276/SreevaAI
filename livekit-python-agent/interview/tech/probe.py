"""
probe_strategy.py
One probe per signal. Tells the interview LLM what fired, what it means,
and how to frame the follow-up — without scripting the exact question.

Research-backed rewrite (see Docs/new.md): sufficiency checks before probing,
fact-level dedup (DECLINED_FACTS) so a declined number/name isn't re-asked in
different words, and generative (non-menu) angle/scenario construction with a
global RECENT_QUESTION_PATTERNS collision check baked into the system prompt.

Part B staged signal taxonomy: signal names match three types --
  RESPONSE-SHAPE signals (orthogonal to the staged taxonomy, describe the
    SHAPE of the reply): clarification_request, rephrase_request, off_topic
  STAGE signals (16 total, 4 per question stage -- exactly one fires per
    turn, matching whichever stage/rung the question just answered targeted):
    definition_{correct,partial,confused,absent}
    mechanism_{correct,shallow,incorrect,absent}
    distinction_{clear,one_sided,reversed,absent}
    application_{grounded,generic}, reasoning_unjustified, application_absent
  CROSS-CUTTING signals (at most one, alongside a stage signal, never instead
    of it): verbal_disfluency, buzzword_without_substance,
    self_correction_recovery, internal_contradiction, pure_denial
"""
from __future__ import annotations

import re

from interview.agent_runtime_helpers import _strip_leaked_meta


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

    # Each entry's "directive" is the verbatim "Improved Prompt" text from
    # Docs/new.md for that signal -- production text, not a paraphrase of it.
    # question_type/voice_note are kept only for the reaction-hint plumbing
    # in get_reaction_hint()/get_probe_context() below.

    "clarification_request": {
        "question_type": "CLARIFICATION REPHRASE",
        "voice_note":    "Helpful and patient, not apologetic.",
        "directive": """\
The candidate asked you to clarify: "{original_question}" → their clarification request was
"{clarification_request_text}".

If their clarification request already isolates a specific fork (an either/or, a "do you mean
X or Y"), answer that fork directly — don't re-explain the whole question from scratch, that
discards the precision they just gave you.

Otherwise, diagnose the likely cause before rephrasing:
- A jargon term with no shared meaning → replace it with plain language; don't just swap in a
  synonym of the same abstract word, re-derive what you're asking in concrete terms.
- An ambiguous reference ("that approach," "it") → name the specific thing explicitly.
- A compound question → drop to the single most important half; ask the other half later if
  needed.
- Genuine abstraction → add one concrete anchor tied to something they already said.

Never repeat the original question verbatim, even reworded with the same structure. One short
"sure" or "good question" is enough acknowledgment — don't over-apologize. Never narrate why
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

    # ---- STAGE 1: DEFINITION SIGNALS ----

    "definition_partial": {
        "question_type": "DEFINITION COMPLETION",
        "voice_note":    "Warm and encouraging — they're close, not wrong.",
        "directive": """\
The candidate got PART of the definition right but is missing a key element or hedging heavily
without a confident landing. This is a real, if incomplete, attempt — not a gap to re-explain
from scratch and not a wrong claim to correct.

Ask for the ONE missing piece directly, grounded in what they already said: name the part of
their answer that's solid, then ask what's true about the piece they left vague or skipped.
Never ask them to "define it again" — that repeats the exact framing that only got you a
partial answer the first time.

If this is the first probe on this concept: point at the specific gap ("you said X — what
about Y, does that fit the same idea or not?"). If the concept has already been probed once and
is still partial, pivot to asking for a concrete example instead of another definitional angle —
a real example forces the missing precision to surface on its own.

One question. Warm and encouraging tone — they're close, not wrong; this should feel like
completing a thought, not being quizzed again.""",
    },

    "definition_confused": {
        "question_type": "MISCONCEPTION SURFACE",
        "voice_note":    "Curious and non-confrontational — you're surfacing the mix-up, not scolding it.",
        "directive": """\
The candidate stated the definition ACTIVELY WRONG — swapped it with a different concept's
definition, or asserted a property that's the opposite of true. This is worse than a gap: it's
a real misconception, and the next question should surface it without lecturing.

Do NOT correct them or state the right answer. Instead, ask a question that would only make
sense if their stated (wrong) property were true, so answering it forces them to confront the
contradiction themselves — e.g. if they said a structure "keeps things in sorted order," ask
what would happen if you inserted items in reverse order; if their claim were true nothing
special would happen, which surfaces the gap through their own reasoning rather than your
correction.

Never say "that's not quite right" or "actually..." — let the follow-up question do the
correcting work. One question. Curious and non-confrontational tone — you're surfacing the
mix-up, not scolding it.""",
    },

    "definition_absent": {
        "question_type": "ACKNOWLEDGEMENT + STEP-DOWN",
        "voice_note":    "Warm and low-pressure — a knowledge gap here is normal.",
        "directive": """\
The candidate gave essentially nothing on this definition — a flat denial or non-answer. This is
the denial tier: accept it cleanly and step DOWN to something easier on the SAME concept, never
pivot to a harder or unrelated angle.

One short acknowledgement, then ask the smallest, most concrete adjacent question you can find —
something they might recognize even if they can't produce the formal definition (e.g. "have you
seen this used anywhere, even without knowing the formal name for it?"). Give them an easy out.

Never re-ask the exact same definitional question. Never make them feel punished for not
knowing. If this is the second consecutive denial-tier answer on this topic, do not probe
further — the topic is being closed out (topic_floor_reached), not escalated.""",
    },

    # ---- STAGE 2: MECHANISM SIGNALS ----

    "mechanism_shallow": {
        "question_type": "MECHANISM DEEP-DIVE / OPEN THE BOX",
        "voice_note":    "Curious and open tone, not skeptical — you're testing depth, not accusing them of lying.",
        "directive": """\
The candidate named the mechanism or restated its effect ("it makes lookups fast") but gave no
internal steps, no data flow, no real trace of HOW it works. Confident label, hollow internals —
don't ask them to restate the label again, ask them to open the box.

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

    "mechanism_incorrect": {
        "question_type": "MISCONCEPTION SURFACE",
        "voice_note":    "Curious and non-confrontational — you're surfacing the mix-up, not scolding it.",
        "directive": """\
The candidate described an internal mechanism that is ACTIVELY WRONG — a specific, confidently
stated false claim about how it works, not just vague or hollow. This is worse than a shallow
non-answer: it's a real misconception about the internals.

Do NOT correct them directly. Ask a question that only makes sense if their stated (wrong)
mechanism were true, so answering it surfaces the contradiction through their own reasoning —
e.g. if they described it as a linear scan, ask what they'd expect to happen to lookup time as
the data set gets 100x larger; if their claim were true the answer would be very different from
what actually happens, and working through that gap is more instructive than being told.

Never say "that's not right" — let the follow-up do the correcting work. One question. Curious
and non-confrontational tone.""",
    },

    "mechanism_absent": {
        "question_type": "ACKNOWLEDGEMENT + STEP-DOWN",
        "voice_note":    "Warm and low-pressure — a knowledge gap here is normal.",
        "directive": """\
The candidate gave essentially nothing about how it works internally — a flat denial or
non-answer. Denial tier: accept cleanly and step DOWN to something easier on the SAME concept.

One short acknowledgement, then ask about the smallest observable EFFECT of the mechanism rather
than the mechanism itself (e.g. "forget the internals — have you noticed it behaves differently
under X versus Y?") — collapsing from "how" to "what did you notice" gives them something small
to confirm rather than having to generate mechanism content from nothing.

Never re-open the same "how does it work" framing that just failed. If this is the second
consecutive denial-tier answer on this topic, do not probe further — the topic is being closed
out, not escalated.""",
    },

    # ---- STAGE 3: DIFFERENCE SIGNALS ----

    "distinction_one_sided": {
        "question_type": "COMPARATIVE COMPLETION",
        "voice_note":    "Encouraging, matter-of-fact tone — half the comparison landed, finish it.",
        "directive": """\
The candidate correctly described ONE side of the comparison but was vague or silent on the
other — the contrast itself never completed. Don't re-ask for "the difference" in general;
name the side they already got right and ask directly what changes on the OTHER side.

Anchor the question in their own correct half: "okay, so [concept A] does X — what does
[concept B] do differently, then?" This is more targeted than a fresh "what's the difference"
because it uses their own correct answer as the anchor point instead of asking them to
regenerate the whole comparison.

If this is a repeat probe on the same comparison, ask for a concrete case where picking the
wrong one of the two would actually cause a problem — a scenario-shaped nudge often surfaces
the missing half better than another direct definitional ask.

One question. Encouraging, matter-of-fact tone.""",
    },

    "distinction_reversed": {
        "question_type": "MISCONCEPTION SURFACE (HIGH PRIORITY)",
        "voice_note":    "Curious and non-confrontational, but this is a real misconception — don't understate it internally.",
        "directive": """\
The candidate swapped the two concepts' properties — attributed concept A's real trait to
concept B or vice versa, confidently. This is ACTIVE CONFUSION about both concepts at once, not
just a gap, and it is scored worse than a non-attempt (Part D.3) — but the QUESTION itself
should stay curious, not corrective; the scoring severity and the tone are separate things.

Do NOT state the correction. Construct a question that only makes sense if their swapped
version were true, so they hit the contradiction themselves — e.g. if they said "B allows
duplicates, A doesn't" when it's actually the reverse, ask what would happen if you tried to
insert the same value twice into A specifically; if their claim were true nothing would stop it,
and testing that against what they actually know tends to surface the swap.

Never say "you have that backwards" — let the follow-up question do the work. One question.
Curious and non-confrontational tone, even though this is a serious signal internally.""",
    },

    "distinction_absent": {
        "question_type": "ACKNOWLEDGEMENT + STEP-DOWN",
        "voice_note":    "Warm and low-pressure — a knowledge gap here is normal.",
        "directive": """\
The candidate gave essentially nothing on the comparison — a flat denial or non-answer. Denial
tier: accept cleanly and step DOWN to something easier on the SAME pair of concepts.

One short acknowledgement, then ask about just ONE of the two concepts in isolation (drop the
comparison framing entirely for this turn) — "let's just take [concept A] on its own — what do
you know about that one?" A comparison is harder than either concept alone; retreating to one
side gives them a smaller, more answerable target.

Never re-ask "what's the difference" again immediately. If this is the second consecutive
denial-tier answer on this topic, do not probe further — the topic is being closed out.""",
    },

    # ---- STAGE 4: SCENARIO SIGNALS (gated -- only reached after the
    # conceptual average clears CONCEPTUAL_GATE_THRESHOLD_PCT) ----

    "application_generic": {
        "question_type": "SCENARIO SPECIFICITY PUSH",
        "voice_note":    "Conversational and real-world tone.",
        "directive": """\
The candidate gave a plausible-sounding but GENERIC response to the scenario — a checklist that
could apply to almost any failure, not tied to the specific mechanism this topic is actually
about. Push them to connect the generic checklist item back to the mechanism.

Ask what SPECIFICALLY about this mechanism would make that first check meaningful — e.g. if
they said "I'd check the logs," ask what exact thing in the logs would tell them it's this
mechanism's fault versus something else entirely. This forces the generic answer to either
sharpen into something grounded or reveal that it wasn't really connected to the mechanism at
all.

Build the follow-up out of a specific noun from their own answer or from the scenario itself,
never a generic "how would you debug this further." One question. Conversational and real-world
in tone.""",
    },

    "reasoning_unjustified": {
        "question_type": "TRIAGE RATIONALE",
        "voice_note":    "Genuinely curious tone — you're testing judgment, not catching them in a mistake.",
        "directive": """\
The candidate named a plausible action for the scenario ("I'd just restart it") but gave NO
reasoning for why that's the right first move — a bare assertion with no triage logic behind
it. Ask directly why that would be the first thing to check or do, not the tenth.

Frame it as genuine curiosity about their triage instinct, not a challenge: "what makes that
the first thing you'd reach for, over [a plausible alternative first check]?" Naming a concrete
alternative sharpens the question — an open "why" invites a rehearsed non-answer, a specific
alternative forces a real comparison.

One question. Genuinely curious tone — you're testing whether there's real judgment behind the
action, not catching them in a mistake; a reasonable-sounding first guess is a fine starting
point, you're looking for the reasoning underneath it.""",
    },

    "application_absent": {
        "question_type": "ACKNOWLEDGEMENT + STEP-DOWN",
        "voice_note":    "Warm and low-pressure — a knowledge gap here is normal.",
        "directive": """\
The candidate gave essentially nothing for the scenario — a flat denial or non-answer. Denial
tier: accept cleanly and step DOWN — since scenario is the last rung, stepping down means
dropping the scenario framing entirely and asking about the underlying mechanism directly
instead, on the same concept.

One short acknowledgement, then ask the smallest concrete question about the mechanism itself
("no worries — forget the scenario for a second, what's the one thing you'd check about how
this works at all?"). Never re-open the same scenario framing that just failed.

If this is the second consecutive denial-tier answer on this topic, do not probe further — the
topic is being closed out.""",
    },

    # ---- CROSS-CUTTING SIGNALS (fire alongside a stage signal) ----

    "buzzword_without_substance": {
        "question_type": "SUBSTANCE VERIFICATION",
        "voice_note":    "Specific and grounded, not skeptical.",
        "directive": """\
The candidate dropped technical-sounding terms with no real content behind them for THIS
question's concept — jargon used as a shield rather than as shorthand for real understanding.

Ask for the single smallest concrete detail that only someone with real understanding could
produce — not "what does that term mean" (invites another definition), but something that
requires having actually reasoned about the concept: a specific case where it applies, a
specific number, or a specific step. A real understanding can generate one of these on demand;
buzzword-only familiarity cannot.

One question, tied to the specific term they used. Specific and grounded tone, not skeptical —
you're verifying substance, not calling out a bluff.""",
    },

    "internal_contradiction": {
        "question_type": "CONTRADICTION RESOLUTION (NEUTRAL)",
        "voice_note":    "Neutral and curious, never accusatory.",
        "directive": """\
The candidate said two things in the same answer that directly conflict, and never resolved
which one they meant — distinct from self_correction_recovery, where they caught and fixed it
themselves. Ask them to resolve it, neutrally.

Name both things they said, in their own words, and ask which one is actually true — "you
mentioned both X and Y just now — which of those is actually the case?" Never imply they
contradicted themselves as a criticism; people genuinely think out loud and land on a real
answer when asked to pick.

One question. Neutral and curious tone, never accusatory — the goal is resolution, not calling
out the inconsistency.""",
    },

}

# ---------------------------------------------------------------------------
# "Cleared" tier -- definition_correct / mechanism_correct / distinction_clear /
# application_grounded. These four are NOT in SIGNAL_PROBES: a cleared concept
# means the ladder/sub-concept rotation should ADVANCE (concept_cleared, Part
# C.2), not receive another probe on the same thing. get_probe_context()
# checks for membership in this set BEFORE falling back to SIGNAL_PROBES/
# _DEFAULT_PROBE and returns NO_FOLLOW_UP_NEEDED guidance directly.
# ---------------------------------------------------------------------------
_CLEARED_SIGNALS: frozenset[str] = frozenset({
    "definition_correct", "mechanism_correct", "distinction_clear", "application_grounded",
})

# ---------------------------------------------------------------------------
# Cross-cutting signal notes -- appended to the directive alongside whichever
# stage signal fired (Part B: at most one cross-cutting signal per turn).
# verbal_disfluency and buzzword_without_substance are content-neutral by
# themselves (see Part D.1's scoring calibration -- the note here is about
# framing, not scoring); pure_denial is handled upstream by the denial-tier
# override in get_probe_context() and never reaches this block.
# ---------------------------------------------------------------------------
_CROSS_CUTTING_NOTES: dict[str, str] = {
    "verbal_disfluency": (
        "  Delivery was rambly/hedging/filler-heavy, but that's HOW they said it, not WHAT --\n"
        "  do not treat this as evidence of a gap. Frame your reaction and follow-up around the\n"
        "  substance of their answer, not its delivery. Never comment on the rambling itself."
    ),
    "self_correction_recovery": (
        "  Candidate caught and corrected their own mistake mid-answer -- a GOOD sign, not a\n"
        "  fumble. Acknowledge the corrected version warmly (briefly, don't over-praise it) and\n"
        "  build your follow-up on the corrected claim, not the initial slip."
    ),
    "buzzword_without_substance": (
        "  Already reflected in the stage signal's directive above if it's the primary signal;\n"
        "  if it's riding alongside a different stage signal, keep the follow-up anchored to a\n"
        "  concrete detail-check rather than another open 'what does that mean' question."
    ),
}

# Fallback probe when signal is null or unrecognised (mostly: eval call timed out,
# errored, or returned unparseable JSON -- a real G0/G1-G7 classification almost
# never resolves to null, since the content gates are instructed to always pick one).
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
# Band overlays -- per-signal, per-band.
# Adjusts the depth and stakes of the probe based on seniority.
# ---------------------------------------------------------------------------
_BAND_OVERLAYS: dict[str, dict[str, str]] = {

    "definition_partial": {
        "fresher":     "Accept a rough approximation — ask for just the one missing word or property, keep it gentle.",
        "mid":         "Ask for the specific missing element directly.",
        "experienced": "Expect near-complete precision — push on the exact missing qualifier.",
        "senior":      "A partial definition at this level is notable — push for the precise missing distinction.",
    },
    "definition_confused": {
        "fresher":     "Surface the mix-up gently with a very concrete example — don't make it feel like a test failure.",
        "mid":         "Surface the contradiction with a concrete case.",
        "experienced": "A confused definition at this level is a real flag — surface it clearly via a concrete case.",
        "senior":      "Surface it via a case with real stakes — this level of confusion is significant here.",
    },
    "mechanism_shallow": {
        "fresher":     "Ask HOW it works step by step for one concrete input — don't push for edge cases yet.",
        "mid":         "Ask them to trace one concrete input through the mechanism.",
        "experienced": "Expect a real internal trace — push for the step they're skipping.",
        "senior":      "Expect fluency with the internals — a shallow answer here is a real gap.",
    },
    "mechanism_incorrect": {
        "fresher":     "Surface it gently via a concrete case — a mechanism mix-up is common at this level.",
        "mid":         "Surface the wrong claim via a concrete case that would behave differently if it were true.",
        "experienced": "A wrong mechanism claim at this level is a real flag — surface it clearly.",
        "senior":      "This level of mechanism error is significant — surface it via a case with real consequences.",
    },
    "distinction_one_sided": {
        "fresher":     "Accept the one correct side — ask for just a simple word or two about the other.",
        "mid":         "Ask what changes on the other side directly.",
        "experienced": "Expect a real completed contrast — push for the missing half precisely.",
        "senior":      "A half-completed distinction at this level is notable — push for full precision.",
    },
    "distinction_reversed": {
        "fresher":     "Surface the swap very gently with a simple concrete case — this is a common early mix-up.",
        "mid":         "Surface the swap via a concrete case.",
        "experienced": "A reversed distinction at this level is a real flag — surface it clearly.",
        "senior":      "This level of confusion is significant — surface it via a case with real stakes.",
    },
    "application_generic": {
        "fresher":     "A generic-but-plausible checklist is fine — gently connect it to the mechanism.",
        "mid":         "Push to connect the generic checklist item to the specific mechanism.",
        "experienced": "Expect the check to already be mechanism-specific — push on what's missing.",
        "senior":      "A generic checklist at this level is a real gap — push hard for mechanism-specific reasoning.",
    },
    "reasoning_unjustified": {
        "fresher":     "Accept a reasonable guess — ask gently what made them think of that first.",
        "mid":         "Ask for the reasoning behind the first move directly.",
        "experienced": "Expect real triage logic — push for the reasoning, not just the action.",
        "senior":      "Expect systemic judgment behind the first move — an unjustified action here is a real gap.",
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
    "definition_partial": {
        "tone": "encouraging — they're close, help them land it",
        "openers": ["Right, close —", "Okay, almost —", "Good start —"],
    },
    "definition_confused": {
        "tone": "curious, non-confrontational — surfacing a mix-up, not correcting",
        "openers": ["Interesting —", "Okay, let's check that —", "Hm, let's see —"],
    },
    "definition_absent": {
        "tone": "warm and reassuring — make it safe that they don't know",
        "openers": ["No worries —", "That's alright —", "Fair enough —"],
    },
    "mechanism_shallow": {
        "tone": "lightly impressed then probing — acknowledge the claim, then open the box",
        "openers": ["Okay, so —", "Right, and —", "Got it, so —"],
    },
    "mechanism_incorrect": {
        "tone": "curious, non-confrontational — surfacing a mix-up, not correcting",
        "openers": ["Interesting —", "Okay, let's check that —", "Hm, let's see —"],
    },
    "mechanism_absent": {
        "tone": "warm and reassuring — make it safe that they ran out",
        "openers": ["No worries —", "That's alright —", "Fair enough —"],
    },
    "distinction_one_sided": {
        "tone": "encouraging, matter-of-fact — half landed, finish it",
        "openers": ["Right, and —", "Okay, so on the other side —", "Got that half —"],
    },
    "distinction_reversed": {
        "tone": "curious, non-confrontational — surfacing a mix-up, not correcting",
        "openers": ["Interesting —", "Okay, let's check that —", "Hm, let's see —"],
    },
    "distinction_absent": {
        "tone": "warm and reassuring — make it safe that they don't know",
        "openers": ["No worries —", "That's alright —", "Fair enough —"],
    },
    "application_generic": {
        "tone": "engaged and conversational — you followed the flow, now push for specifics",
        "openers": ["Right, that tracks —", "Okay, I follow —", "Makes sense —"],
    },
    "reasoning_unjustified": {
        "tone": "genuinely curious about the reasoning",
        "openers": ["Interesting choice —", "Okay, and —", "Fair enough, but —"],
    },
    "application_absent": {
        "tone": "warm and reassuring — make it safe that they don't know",
        "openers": ["No worries —", "That's alright —", "Fair enough —"],
    },
}

# Banned hollow-filler openers -- exact ban list plus the pattern class it belongs to.
# Kept as an explicit list (not just 3 examples) since a narrow ban list is exactly
# what let "Impressive process!" slip through in testing.
_BANNED_FILLER_OPENERS = (
    "great!", "awesome!", "that's interesting!", "impressive!", "impressive ",
    "solid!", "nice!", "cool!", "wow!", "amazing!",
)


def get_reaction_hint(signal: str | None, prev_answer: str) -> str:
    """
    Returns a one-line reaction directive matching the INTENT of the answer
    (via the fired signal), so the opener varies and fits what they said.
    """
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
        f"  Example openers (adapt — replace [tool] with the real thing they named, vary the wording): "
        f"{' / '.join(r['openers'])}\n"
        f"  Make it specific to what they actually said. Do NOT default to a bland 'Mm' or 'Hmm'.\n"
        + _banned_note
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
QUESTION_GENERATION_SYSTEM = """\
You are Ishitha, a sharp and warm AI interviewer. You are conducting a real interview — not
filling out a form.

Before you write anything, read RECENT_QUESTION_PATTERNS below. It lists the opener and
scaffold (the underlying question shape/template, independent of topic) for your last several
questions. Your new question's opener AND scaffold must both be different from every entry in
that list — not just reworded, structurally different. A repeated scaffold is a repeated
question even if the topic and vocabulary changed.

RECENT_QUESTION_PATTERNS:
{recent_question_patterns}

DECLINED_FACTS (facts the candidate has explicitly been unable to produce this interview):
{declined_facts}
Before writing a question, check whether it targets anything on that list — not by matching
wording, but by matching the underlying thing being requested. If it's on the list, do not
construct a question that resolves to asking for it again, regardless of wording or how much
time has passed.

If the scaffold your current PROBE DIRECTIVE suggests would collide with one already used,
do not use that scaffold — the directive's example phrasing is illustrative, not a script; pick
a genuinely different construction that still satisfies the same goal and question type.

YOUR JOB THIS TURN: ask ONE follow-up question based on what the candidate just said.

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
- Reaction + question together: TWO sentences maximum AND under 25 words total, no exceptions.
  Two long run-on sentences still fail this — count words, not just sentence-stops. If your draft
  runs longer, cut setup and context first — the candidate already lived what happened, they
  don't need it re-explained back to them before the question lands.
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

OUTPUT FORMAT — READ CAREFULLY:
Output ONLY the reaction + question (or exactly NO_FOLLOW_UP_NEEDED). Do not show your
reasoning, do not name the scaffold you picked, do not add any parenthetical note, meta-comment,
or explanation before or after the question — the candidate hears this verbatim, so anything
other than the spoken reaction+question breaks the interview. Think before you answer, but the
final message you produce must contain nothing except what Ishitha would actually say out loud.
"""


# ---------------------------------------------------------------------------
# Core skill question generator -- TECH INTERVIEWS ONLY.
# Generates a structured 6-item question set for a given skill × band.
#
# NOT used for real-time follow-up (that is QUESTION_GENERATION_SYSTEM above).
# This is an OFFLINE / pre-interview call: for each priority skill extracted
# by the brief pipeline, call the LLM once with this system prompt to produce
# the full question set for that skill before the interview begins.
#
# The six sections deliberately avoid any "tell me about a project" framing —
# every question stands alone as a cold-reasoning prompt the candidate cannot
# prep for by rehearsing their resume.
# ---------------------------------------------------------------------------
CORE_SKILL_QUESTION_SYSTEM = """\
You are generating the CORE QUESTION SET for a technical interview skill, testing actual
capability — not project history, not resume claims, not "tell me about a time you used X."
The candidate should not be able to prep for these by rehearsing their resume; they must
reason in the moment.

INPUT: SKILL = "{skill}"  |  BAND = "{band}"  (fresher / mid / experienced / senior)

Generate exactly SIX items, each testing a different layer of real understanding of {skill}.
Do not ask about the candidate's past projects, teams, or resume in ANY of the six — every
question must be answerable purely from knowing {skill} itself, cold.

1. FUNDAMENTALS
   Tests whether a basic distinction or definition is actually understood, not memorized.
   Pick two concepts commonly confused or misused within {skill}. Ask for the difference AND
   a concrete case where getting it wrong causes a real bug/failure — not just "define X."

2. CORE_MECHANICS
   Tests "how does this actually work under the hood," not "what is this called."
   Pick one internal mechanism of {skill} that's easy to name but hard to actually explain
   (e.g. the thing candidates can say the keyword for but can't trace the behavior of).
   Ask them to walk through what happens, step by step, or to justify a real design choice
   tied to that mechanism.

3. PERFORMANCE
   Present ONE concrete, numbers-bearing scenario (a specific data size, latency, or load
   figure) where something in {skill} is slow, expensive, or degraded. Ask what they'd check
   FIRST — not a general "how would you optimize this," which invites a checklist recital
   instead of real triage instinct.

4. ROBUSTNESS
   Present a failure-handling or edge-case scenario specific to {skill} (concurrent access,
   partial failure, malformed input, resource exhaustion — whichever is most native to this
   skill). Ask how they'd detect or prevent it, not just "what could go wrong."

5. APPLIED (band-scaled)
   - fresher: a small, self-contained task solvable with fundamentals alone. No systems
     context assumed.
   - mid: a task embedded in a realistic single-service/single-project context with one
     real constraint (time, data size, an existing system to integrate with).
   - experienced/senior: a task requiring a tradeoff decision at a systems or architectural
     level — multiple valid approaches, no single correct answer, the point is HOW they
     reason about the tradeoff.
   Do not restate the definition of {skill} for context — assume they already have it.

6. PROBE_VARIANT
   A single follow-up question to use ONLY if the APPLIED answer is shallow, textbook, or
   evasive. It must escalate one level deeper than APPLIED — either invert a stated
   assumption, or ask what breaks the approach they just gave.

HARD CONSTRAINTS:
- Never reference "your project," "your resume," "a time when," or "have you used" — these
  produce prep-able answers. Every question stands alone as a cold-reasoning prompt.
- Each of the 6 items must be answerable in under 30 seconds of spoken reasoning — no
  multi-part compound questions.
- Do not repeat the same underlying concept across two of the six items, even if phrased
  differently — each must test a genuinely different layer (definition vs. mechanism vs.
  diagnosis vs. failure-handling vs. tradeoff).
- Ground every scenario (performance, robustness, applied) in a plausible real number,
  constraint, or concrete noun specific to {skill} — never a vague "a large dataset" or
  "under load" with no anchor.
- Output ONLY the six questions, labeled by section. No preamble, no explanation of why you
  chose them.
"""


# ---------------------------------------------------------------------------
# PART A — Topic question generation, staged taxonomy schema.
#
# Generates ONE question per call, chosen from the type POOL (definition /
# mechanism / difference / scenario), reacting to whatever gap the candidate's
# last answer in this topic left open -- not a fixed template order. A
# follow-up on an open gap is inserted immediately, wherever in the topic that
# happens to be, capped at 2 back-to-back follow-ups on the same concept
# before moving on (mirrors TopicState.register_subconcept_probe's 2-probe
# cap in eval.py). Scenario remains the one fixed-position rule: never 1st/
# 2nd, exactly once, gated on TopicState.can_enter_scenario()'s conceptual
# average. Distinct from CORE_SKILL_QUESTION_SYSTEM above (a different,
# pre-existing 6-section offline generator, unused in the live loop).
#
# NOT used for real-time PROBE-directive follow-up wording (that's
# QUESTION_GENERATION_SYSTEM above, which reacts to a specific fired signal).
# This is the topic-level question chooser: called once per turn to decide
# the NEXT question in an ongoing topic, given the history of what's been
# asked and how it went so far.
# ---------------------------------------------------------------------------
TOPIC_QUESTION_GENERATION_SYSTEM = """\
You are choosing the NEXT question for ONE interview topic, testing actual understanding of
its tagged concepts — not project history, not resume claims. The candidate must reason in the
moment; nothing here should be prep-able by rehearsing a resume.

INPUT: TOPIC = "{topic}"  |  TAGGED CONCEPTS = {concepts}  |  BAND = "{band}"

QUESTIONS ASKED SO FAR IN THIS TOPIC (type, targeted concept, how it went):
{questions_so_far}

TYPE POOL (not a fixed sequence — pick whichever fits what's untested and what the last answer
suggests should be checked next):
- DEFINITION — define or explain a core term/concept.
- MECHANISM — how something works internally, or what it actually does.
- DIFFERENCE — distinguish between two related concepts.
- SCENARIO — a concrete "what would you check/do" situation.

Definition does not have to come first, and a topic does not need to touch all three conceptual
types before moving on. Choose whichever conceptual type from the pool best fits what hasn't
been tested yet in this topic and what the candidate's last answer suggests should be checked
next.

NEXT-QUESTION DECISION LOGIC — run this before choosing:
A follow-up is not reserved for the end of the topic — insert it IMMEDIATELY, right after
whichever question exposed the gap, wherever in the topic that happens to be. It can happen
after question 1, after question 3, after another follow-up, anywhere.

1. Check the candidate's most recent answer in this topic (see QUESTIONS ASKED SO FAR). If it
   showed a gap on the concept just asked (partial, shallow, confused, or absent), the question
   you produce right now must be a FOLLOW-UP on that SAME concept — ask for a concrete example,
   ask them to restate it differently, or ask a simpler angle on it. Never move to a new
   conceptual type while a gap is open, no matter how many questions have already been asked.
2. At most 2 follow-ups on the same concept, back to back. If it's still unresolved after 2,
   drop that concept and pick a different, untested conceptual type from the pool instead — do
   not keep hammering the same gap indefinitely.
3. Only when the current concept is cleared (no open gap) do you pick a new conceptual type
   from the pool — in whatever order fits the conversation, not a fixed template order.
4. A topic can legitimately end after just 2 conceptual questions if those already give a clear
   read (strong or weak). Do not force extra questions just to complete a checklist.
5. SCENARIO is the only fixed-position rule: it is asked LAST, exactly once per topic, and ONLY
   if the candidate's average performance across the conceptual questions asked so far clears
   the gate threshold (TopicState.can_enter_scenario() in eval.py decides this at runtime — you
   are told below whether the gate is currently open). Never produce it as the 1st or 2nd
   question. If the gate is not open, do not produce a scenario question at all.

SCENARIO GATE STATUS: {scenario_gate_status}

PHRASING RULES — the question you produce must follow ALL of these:
- One complete, grammatically clean sentence, phrased the way a real interviewer would say it
  out loud — conversational, not textbook. "What happens when two keys hash to the same
  bucket?" not "Define hash collision and its resolution strategies."
- No compound/double-barreled questions — never "what is X and why does Y happen."
- At most ONE unfamiliar technical term — don't jargon-stack a second one in the same sentence.
- Under ~25 words where possible — this is a voice/TTS pipeline; long sentences degrade badly.
- Vary openers — do not default to "Can you explain...". Rotate across: "What's the difference
  between...", "How does...", "Why would you...", "What happens when...", "Walk me through...".
  Never repeat the exact opener you used on the immediately preceding question in this topic.
- Never phrase a question so it hints at or contains the answer.
- Interviewer filler ("Got it," "Alright," "Makes sense") stays OUTSIDE the question text —
  appended by the delivery layer at runtime, never part of what you generate here.
- Tests EXACTLY ONE concept, drawn only from TAGGED CONCEPTS for this topic — never invent a
  tangential concept outside that list.
- Never target a concept already tested earlier in the interview, even under a different topic
  — check ALREADY-TESTED CONCEPTS below.
- A follow-up must feel like a natural rephrase or a different angle on the same concept, not a
  verbatim repeat of the question that exposed the gap.

ALREADY-TESTED CONCEPTS (do not target any of these again):
{already_tested_concepts}

OUTPUT FORMAT — output ONLY a single JSON object, nothing else, no preamble or explanation:
{{
  "type": "definition | mechanism | difference | scenario | followup",
  "targets_concept": "the specific concept this question tests",
  "is_followup_on": "concept id if this is a follow-up, else null",
  "text": "..."
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
_VALID_TOPIC_QUESTION_TYPES: tuple[str, ...] = ("definition", "mechanism", "difference", "scenario", "followup")


def validate_topic_question_set(questions: list[dict]) -> list[str]:
    """Validates the running sequence of topic questions asked so far (the
    list of {"type", "targets_concept", "is_followup_on", "text"} dicts
    TOPIC_QUESTION_GENERATION_SYSTEM produces one at a time) against Part A's
    pool/gap-driven rules. Returns a list of violation strings (empty =
    passes). Pure/sync, no LLM or network dependency, so it's trivially
    unit-testable and can run as a real post-generation gate after each turn."""
    violations: list[str] = []

    if not questions:
        violations.append("empty question set")
        return violations

    types = [str(q.get("type", "")).strip().lower() for q in questions]

    for t in types:
        if t not in _VALID_TOPIC_QUESTION_TYPES:
            violations.append(f"invalid question type {t!r}")

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
    # Compound-ask detection mirrors agent_runtime.validate_spoken_question's two
    # shapes: (a) content stacked after the '?', (b) a second interrogative clause
    # joined by and/or BEFORE the (only) '?' -- e.g. "What is X and how does Y work?"
    # has just one '?' but is still a double-barreled question (phrasing rule ban).
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
        if word_count > 25:
            violations.append(f"item {i} ({types[i]}): word_count={word_count} exceeds ~25 (soft limit)")
        q_count = text.count("?")
        if q_count != 1:
            violations.append(f"item {i} ({types[i]}): question_mark_count={q_count} (must be exactly 1)")
        if re.search(r"\bgot it\b|\balright\b|\bmakes sense\b", text, re.I):
            violations.append(f"item {i} ({types[i]}): contains interviewer filler in question text")
        _first_q_idx = text.find("?")
        _compound_found = False
        if _first_q_idx != -1 and _first_q_idx < len(text) - 1:
            if re.search(r"\b(and|or)\b", text[_first_q_idx + 1:], re.I):
                violations.append(f"item {i} ({types[i]}): compound question -- content stacked after the '?'")
                _compound_found = True
        if not _compound_found:
            for m in re.finditer(r"\b(?:and|or)\b\s+(.+)", text, re.I):
                if _WH_OPENER_RE.match(m.group(1).strip()):
                    violations.append(
                        f"item {i} ({types[i]}): compound/double-barreled question "
                        f"(second interrogative clause after and/or: {m.group(1)[:40]!r}...)"
                    )
                    break

    # -- Opener variety: a question must not repeat the exact opener of the
    # question immediately preceding it in the topic (consecutive-only check,
    # since across a long gap-driven topic the same opener recurring much
    # later is not the "always says the same thing" failure mode this guards
    # against).
    _openers = [" ".join(str(q.get("text", "")).strip().split()[:3]).lower() for q in questions]
    for i in range(1, len(_openers)):
        if _openers[i] and _openers[i] == _openers[i - 1]:
            violations.append(f"item {i}: opener {_openers[i]!r} repeats the immediately preceding question's opener")

    return violations


_LADDER_RUNG_GUIDANCE: dict[str, str] = {
    "definition": (
        "Ask a DEFINITION question: what the concept IS, or a basic distinction between "
        "two commonly confused terms -- testing real understanding, not memorization. "
        "Do not ask about mechanism internals, comparisons, or a scenario at this rung."
    ),
    "mechanism": (
        "Ask a MECHANISM question: how it actually works under the "
        "hood, not just what it's called. Do not ask a pure definition question -- assume "
        "the definition rung is already covered."
    ),
    "difference": (
        "Ask a DIFFERENCE question: contrast this concept with a closely "
        "related one (X vs Y) and what actually changes the choice between them. Do not "
        "ask a numbers-bearing or failure scenario at this rung -- that's the LAST rung, "
        "gated separately."
    ),
    "scenario": (
        "Ask a SCENARIO question: a concrete, numbers-bearing or debugging-style scenario "
        "where something is slow, broken, or degraded -- ask what they'd check or do FIRST. "
        "This rung is GATED: it is only reached once the candidate's conceptual answers "
        "(definition/mechanism/difference) have already cleared the threshold, so if "
        "you were handed this rung, treat it as earned -- go straight to the applied "
        "scenario, don't re-check fundamentals first."
    ),
}


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
    prev_question: str = "",
    recent_question_patterns: str = "(none yet)",
    declined_facts: str = "(none yet)",
    ladder_rung: str = "",
    cross_cutting_signal: str | None = None,
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

    ladder_rung: the fixed question-type rung (definition/mechanism/difference/
      scenario) the caller's TopicState says the NEXT question on this topic must
      target (see TopicState.current_rung_name() in eval.py). This is a hard
      constraint -- it always steps DOWN after a denial-tier signal and steps UP
      otherwise (never past "difference" into "scenario" unless the conceptual-
      average gate clears -- see TopicState.can_enter_scenario()), so the
      question never escalates right after the candidate couldn't answer, and a
      scenario/debugging-style question is never the 1st or 2nd question asked
      on a topic. Empty string when the caller has no ladder state.

    cross_cutting_signal: Part B's optional cross-cutting signal (verbal_disfluency/
      buzzword_without_substance/self_correction_recovery/internal_contradiction/
      pure_denial) fired ALONGSIDE the primary stage signal, if any.
    """
    lines: list[str] = []
    _signals_history = signals_history or []
    _same_signal_repeated = (
        len(_signals_history) >= 2
        and signal is not None
        and _signals_history[-1] == signal
        and _signals_history[-2] == signal
    )

    _rung_line = ""
    if ladder_rung:
        _rung_guidance = _LADDER_RUNG_GUIDANCE.get(ladder_rung, "")
        _rung_line = (
            f"\nDIFFICULTY RUNG (HARD CONSTRAINT): {ladder_rung.upper()}\n"
            f"  {_rung_guidance}\n"
            f"  This rung is fixed by the interview's ladder tracker, not a suggestion --\n"
            f"  do not ask a harder or easier question than this rung specifies."
        )

    # Denial-tier override -- always highest priority. Part B replaces the old
    # raw-text substring sniff with the actual signal name whenever one is
    # available (a "*_absent" stage signal, or the cross-cutting pure_denial) --
    # topic_denied (from eval.py's TopicState) and a crude text fallback remain
    # as a safety net for callers that haven't threaded a signal through yet.
    _is_denial_signal = bool(signal) and signal.endswith("_absent")
    _is_denial_cross_cutting = cross_cutting_signal == "pure_denial"
    _prev_lower = prev_answer.lower()
    _is_denial_text_fallback = any(p in _prev_lower for p in (
        "i forgot", "i don't remember", "i dont remember",
        "i don't know", "i dont know", "not sure", "can't remember", "cant remember",
    ))
    if topic_denied or _is_denial_signal or _is_denial_cross_cutting or _is_denial_text_fallback:
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
            _rung_line,
        ]
        return "\n".join(lines)

    # Cleared tier -- concept_cleared (Part C.2): no follow-up needed, the
    # ladder/sub-concept rotation advances. Short-circuits before SIGNAL_PROBES
    # since these 4 signals intentionally have no probe directive of their own.
    if signal in _CLEARED_SIGNALS:
        lines += [
            f"SIGNAL: {signal}",
            "WHAT: Candidate cleared this concept -- no gap to probe.",
            "GOAL: Do not ask another question on the SAME concept. Output exactly",
            "      NO_FOLLOW_UP_NEEDED and nothing else -- the sub-concept rotation",
            "      or ladder rung will advance to the next target automatically.",
        ]
        return "\n".join(lines)

    probe = SIGNAL_PROBES.get(signal or "", None) if signal else None
    if probe is None:
        probe = _DEFAULT_PROBE

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
    lines.append(get_reaction_hint(signal, prev_answer))

    _band_note = _BAND_OVERLAYS.get(signal or "", {}).get(band)
    if _band_note:
        lines.append(f"BAND ({band}): {_band_note}")

    if cross_cutting_signal and cross_cutting_signal in _CROSS_CUTTING_NOTES:
        lines.append(f"CROSS-CUTTING SIGNAL: {cross_cutting_signal}")
        lines.append(_CROSS_CUTTING_NOTES[cross_cutting_signal])

    if _rung_line:
        lines.append(_rung_line)

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

    lines.append("")
    lines.append("RECENT_QUESTION_PATTERNS:")
    lines.append(recent_question_patterns)
    lines.append("")
    lines.append("DECLINED_FACTS:")
    lines.append(declined_facts)

    return "\n".join(lines)
