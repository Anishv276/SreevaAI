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
    question targeted): depth_mastered, depth_clear, depth_applied,
    depth_shallow, depth_misconception, depth_generic, pure_denial,
    recovery_attempted
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

    # Keyed on the UNIVERSAL 8-signal taxonomy from interview/tech/scoring.py
    # (depth_mastered/clear/applied/shallow/misconception/generic, pure_denial,
    # recovery_attempted) plus the 3 response-shape signals. This taxonomy has
    # no staged/rung concept (no definition/mechanism/distinction/application
    # split) -- one signal fires per turn regardless of what layer the question
    # targeted.

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

Never re-ask the exact same question. Never make them feel punished for not knowing. This is the
last probe on this concept in this topic — a single denial closes the topic out
(topic_floor_reached), it is not escalated further.""",
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

    "depth_applied": {
        "question_type": "DEPTH CONFIRMATION",
        "voice_note":    "Genuinely impressed, curious for the edge.",
        "directive": """\
The candidate connected their answer to a real, concrete situation with a specific constraint and
outcome — the gold-standard signal. There may be no real gap here; only probe further if there is
a natural edge left uncovered (what they'd do differently, a failure mode they didn't mention, or
the limit of when their approach stops working).

If there's nothing further worth asking, prefer NO_FOLLOW_UP_NEEDED over manufacturing a
question — do not force depth that isn't there just because a signal fired.

One question if you ask at all, targeting the specific edge of what they already described.""",
    },

    "depth_mastered": {
        "question_type": "DEPTH CONFIRMATION",
        "voice_note":    "Genuinely impressed, curious for the edge.",
        "directive": """\
The candidate demonstrated genuine mastery: mechanism, tradeoff, and judgment all present. This
is close to a complete answer — only probe further if there's a real edge case or alternative
approach worth testing their judgment against; do not manufacture a gap that isn't there.

If there's nothing further worth asking, prefer NO_FOLLOW_UP_NEEDED over forcing a question.

One question if you ask at all — push on the edge of their judgment (a case where their stated
approach would NOT be the right call), not a repeat of what they already covered.""",
    },

    "recovery_attempted": {
        "question_type": "BUILD ON THE CORRECTION",
        "voice_note":    "Warm, brief acknowledgement of the catch, then build on the corrected claim.",
        "directive": """\
The candidate caught and corrected their own mistake mid-answer — a GOOD sign, not a fumble.
Acknowledge the corrected version warmly but briefly (don't over-praise it), and build your
follow-up on the corrected claim as if that's what they'd said from the start.

Never reference the initial slip or imply there was a stumble. Treat the corrected answer using
ordinary signal logic for its content (if it's still thin, probe deeper on the corrected claim; if
it's solid, push the next layer).

One question, grounded in the corrected version only.""",
    },

}

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
    "depth_shallow": {
        "tone": "lightly impressed then probing — acknowledge the claim, then open the box",
        "openers": ["Okay, so —", "Right, and —", "Got it, so —"],
    },
    "depth_misconception": {
        "tone": "curious, non-confrontational — surfacing a mix-up, not correcting",
        "openers": ["Interesting —", "Okay, let's check that —", "Hm, let's see —"],
    },
    "depth_generic": {
        "tone": "engaged and conversational — you followed the flow, now push for specifics",
        "openers": ["Right, that tracks —", "Okay, I follow —", "Makes sense —"],
    },
    "pure_denial": {
        "tone": "warm and reassuring — make it safe that they don't know",
        "openers": ["No worries —", "That's alright —", "Fair enough —"],
    },
    "depth_clear": {
        "tone": "encouraging, matter-of-fact — most of it landed, sharpen the rest",
        "openers": ["Right, and —", "Okay, close —", "Good start —"],
    },
    "depth_applied": {
        "tone": "genuinely impressed, curious for the edge",
        "openers": ["Nice, and —", "Okay, real scenario —", "Good, so —"],
    },
    "depth_mastered": {
        "tone": "genuinely impressed, curious for the edge",
        "openers": ["Nice, and —", "Okay, real scenario —", "Good, so —"],
    },
    "recovery_attempted": {
        "tone": "warm, brief acknowledgement of the catch, then build on the corrected claim",
        "openers": ["Right, and —", "Okay, so —", "Got it —"],
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

OUTPUT FORMAT — READ CAREFULLY:
Output ONLY the reaction + question (or exactly NO_FOLLOW_UP_NEEDED). Do not show your
reasoning, do not name the scaffold you picked, do not add any parenthetical note, meta-comment,
or explanation before or after the question — the candidate hears this verbatim, so anything
other than the spoken reaction+question breaks the interview. Think before you answer, but the
final message you produce must contain nothing except what Ishitha would actually say out loud.
"""


# ---------------------------------------------------------------------------
# Core skill question generator -- TECH INTERVIEWS ONLY.
# Generates a structured 6-item question set for a given skill × level.
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

INPUT: SKILL = "{skill}"  |  LEVEL = {level}  (1=fresher-equiv / 2=mid-equiv / 3=experienced-equiv / 4=senior-equiv)

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

5. APPLIED (level-scaled)
   - level 1: a small, self-contained task solvable with fundamentals alone. No systems
     context assumed.
   - level 2: a task embedded in a realistic single-service/single-project context with one
     real constraint (time, data size, an existing system to integrate with).
   - level 3: a tradeoff decision at a systems level — multiple valid approaches, no single
     correct answer, the point is HOW they reason about the tradeoff.
   - level 4: an advanced architecture-level tradeoff, going deeper than level 3 — expect
     reasoning about edge cases and failure modes across multiple interacting components,
     not just a single service's tradeoff.
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

INPUT: TOPIC = "{topic}"  |  TAGGED CONCEPTS = {concepts}  |  LEVEL = {level}

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
    ladder_rung: str = "",
    cross_cutting_signal: str | None = None,
    topic_score_history: list[float] | None = None,
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
    _is_denial_text_fallback = any(p in _prev_lower for p in (
        "i forgot", "i don't remember", "i dont remember",
        "i don't know", "i dont know", "not sure", "can't remember", "cant remember",
    ))
    if topic_denied or _is_denial_text_fallback:
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

    lines.append("")
    lines.append("RECENT_QUESTION_PATTERNS:")
    lines.append(recent_question_patterns)
    lines.append("")
    lines.append("DECLINED_FACTS:")
    lines.append(declined_facts)

    return "\n".join(lines)
