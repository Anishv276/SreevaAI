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
# Tone per signal -- shapes WHICH kind of reaction fits (impressed vs. reassuring vs.
# curious), not the literal wording. The actual filler word is picked live from
# _ALLOWED_FILLERS below, chosen to fit prev_question/prev_answer -- not hardcoded
# per signal, so the same signal doesn't always produce the same opener.
_SIGNAL_TONES: dict[str, str] = {
    "depth_shallow": "lightly impressed then probing — acknowledge the claim, then open the box",
    "depth_misconception": "curious, non-confrontational — surfacing a mix-up, not correcting",
    "depth_generic": "engaged and conversational — you followed the flow, now push for specifics",
    "pure_denial": "warm and reassuring — make it safe that they don't know",
    "depth_clear": "encouraging, matter-of-fact — most of it landed, sharpen the rest",
    "depth_applied": "genuinely impressed, curious for the edge",
    "depth_mastered": "genuinely impressed, curious for the edge",
    "recovery_attempted": "warm, brief acknowledgement of the catch, then build on the corrected claim",
}

# The ONLY fillers allowed as a reaction opener. Short, natural, low-key -- picked
# to fit the specific answer/question in front of the LLM at generation time, not
# tied to a fixed signal. Anything outside this list (hollow praise, "Got it",
# "Right", "That tracks", "Makes sense", "Spot on", etc.) is banned.
_ALLOWED_FILLERS = (
    "Ok", "Understood", "Alright", "Fine", "Ah, I see", "Exactly",
    "No worries", "Good start", "Fair enough", "I see",
)


def get_reaction_hint(signal: str | None, prev_answer: str, prev_question: str = "") -> str:
    """
    Returns a one-line reaction directive: pick a filler from _ALLOWED_FILLERS that
    actually fits prev_question/prev_answer and the tone for this signal, rather than
    a fixed per-signal opener list -- so the same signal doesn't always produce the
    same wording, and the choice is grounded in what was actually said.
    """
    tone = _SIGNAL_TONES.get(signal or "", "engaged and conversational, reacting to what they just said")
    _allowed_list = ", ".join(f"'{w}'" for w in _ALLOWED_FILLERS)
    return (
        f"REACTION TONE: {tone}.\n"
        f"  Pick ONE filler from this exact list, whichever best fits their answer "
        f"(\"{prev_answer[:160]}\") to your last question (\"{prev_question[:120]}\") — "
        f"do not invent a new one, do not always default to the same one: {_allowed_list}.\n"
        f"  Follow it with a dash and go straight into the reaction/question — do not add any "
        f"other hollow praise or conversational crutch ('Great!', 'Impressive!', 'Got it', 'Right', "
        f"'That tracks', 'Makes sense', 'Spot on') before or after the chosen filler.\n"
        f"  Make the reaction specific to what they actually said. Never default to a bland 'Mm' or 'Hmm'."
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

SHOWING A CODE CARD (code_trace / snippet_eval / query_trace question types only):
If the PROBE DIRECTIVE's question type is code_trace, snippet_eval, or query_trace, you MUST
show the snippet as an actual markdown fenced code block — not describe it in words. The fence's
language tag MUST be exactly one of these three words, matching which kind of card it is (this
tag is machine-parsed downstream, not just decoration):
  code_trace   -- candidate traces execution/output of normal code
  snippet_eval -- candidate spots a bug planted in the snippet
  query_trace  -- candidate traces what a SQL/data query returns
Output:
  <your spoken reaction + setup, under 12 words>
  ```code_trace
  <the code, real and runnable — not pseudocode>
  ```
(swap the fence tag for `snippet_eval` or `query_trace` to match the question type you were
asked to produce). The fenced block is REQUIRED for these three types — a code question with no
fence is broken, the candidate will see nothing. For every other question type, never include a
fenced block.

OUTPUT FORMAT — READ CAREFULLY:
Output ONLY the reaction + question (or exactly NO_FOLLOW_UP_NEEDED), optionally followed by a
fenced code block per the rule above. Do not show your reasoning, do not name the scaffold you
picked, do not add any parenthetical note, meta-comment, or explanation before or after the
question — the candidate hears the spoken part verbatim and sees the code block verbatim, so
anything else breaks the interview. Think before you answer, but the final message you produce
must contain nothing except what Ishitha would actually say out loud, plus the fence when required.
"""


# ---------------------------------------------------------------------------
# CODE_CARD_RULES — when the agent MUST or MUST NOT show a code card.
#
# FUNDAMENTAL RULE: Code cards are READ-ONLY for the candidate.
# The candidate READS the card and SPEAKS their answer. There is NO writing.
# Use code cards ONLY when the content cannot be spoken clearly (code output,
# bug diagnosis, query behavior). All other question types are purely verbal.
# ---------------------------------------------------------------------------
CODE_CARD_RULES: dict[str, dict] = {
    "code_trace": {
        "use_code_card": True,
        "timer_secs": 45,
        "format": "Show the full snippet. Spoken question sets up what to find — under 12 words.",
        "candidate_action": "Reads code on screen, speaks the output or trace verbally. No writing.",
    },
    "snippet_eval": {
        "use_code_card": True,
        "timer_secs": 60,
        "format": "Show the snippet with the bug. Do NOT mark or hint the bug location.",
        "candidate_action": "Reads code, speaks what's wrong and why. No writing.",
    },
    "query_trace": {
        "use_code_card": True,
        "timer_secs": 40,
        "format": "Show the query. Spoken question asks what it returns or what's wrong.",
        "candidate_action": "Reads query on screen, speaks the result or issue verbally. No writing.",
    },
    "definition":       {"use_code_card": False},
    "mechanism":        {"use_code_card": False},
    "difference":       {"use_code_card": False},
    "failure_mode":     {"use_code_card": False},
    "tradeoff_debate":  {"use_code_card": False},
    "scenario":         {"use_code_card": False},
    "followup":         {
        "use_code_card": "conditional",
        "format": "If the parent question was a code type, the follow-up may show the same card.",
    },
}

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

4. A topic can end after 2 strong answers (depth_mastered / depth_applied). Don't force
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
    ladder_rung: str = "",
    cross_cutting_signal: str | None = None,
    topic_score_history: list[float] | None = None,
    last_question_type: str = "",
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
            elif signal in ("depth_clear", "depth_mastered", "depth_applied"):
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

    return "\n".join(lines)
