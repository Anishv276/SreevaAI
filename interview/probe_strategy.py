"""
probe_strategy.py
One probe per signal. Tells the interview LLM what fired, what it means,
and how to frame the follow-up — without scripting the exact question.

Research-backed rewrite (see Docs/new.md): sufficiency checks before probing,
fact-level dedup (DECLINED_FACTS) so a declined number/name isn't re-asked in
different words, and generative (non-menu) angle/scenario construction with a
global RECENT_QUESTION_PATTERNS collision check baked into the system prompt.

Signal names match two types:
  RESPONSE signals (fired by G0 gates): pure_denial, denial_with_continuation, clarification_request, rephrase_request, off_topic
  CONTENT signals (fired by G1-G7 gates): example_evaded, depth_ceiling_hit, ownership_ambiguous, explanation_shallow,
                                            tool_named_not_used, tech_choice_unjustified, scenario_untested
"""
from __future__ import annotations
import re


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

    "denial_with_continuation": {
        "question_type": "PROBE PARTIAL ADMISSION",
        "voice_note":    "Warm, curious tone — often a strong junior candidate under-selling themselves.",
        "directive": """\
The candidate just hedged, then in the same breath described something real: "{continuation_excerpt}".
This is a self-esteem reflex, not a content gap. Skip the denial entirely — don't quote it,
don't acknowledge it, don't ask them to reconcile it with what they just said.

Check first: does "{continuation_excerpt}" already contain a concrete detail (a number, a
specific failure, a named decision)? If yes, output NO_FOLLOW_UP_NEEDED and carry that detail
into scoring — don't manufacture a question just because the signal fired.

If the detail is still thin, react to the continuation as if it were the whole answer, and
pick the probe that matches what's actually missing:
- Vague scale word ("basic," "simple," "small") → ask what made it basic, or what a fuller
  version would have needed that this didn't.
- Named a thing but gave no mechanism → ask for the one decision, config choice, or failure
  only someone who built it would know.
- Sounds like a tutorial exercise → ask what it was for or what happened when it ran; a real
  build has a natural next fact, a copy-paste doesn't.

Never say any variant of "you said you didn't have experience, but..." — banned outright, not
just discouraged. One question. Warm, curious tone — this is often a strong junior candidate
under-selling themselves, and an interrogative tone here suppresses disclosure for the rest of
the interview.""",
    },

    # ---- CONTENT-LEVEL SIGNALS (G1-G7) ----

    "example_evaded": {
        "question_type": "MEMORY RETRIEVAL",
        "voice_note":    "Curious, not accusatory — you want the story, not to catch them out.",
        "directive": """\
The candidate answered with a general habit ("usually / normally / I always...") instead of a
real instance. Do not repeat the "give me one specific time" request in any form — that
sentence shape already failed once.

Instead, give them a retrieval cue: anchor to a concrete, adjacent thing they already implied
exists — a project name, a recent timeframe, a system, a team — and ask what happened INSIDE
that anchor. If nothing concrete was mentioned yet, manufacture the smallest possible anchor
from the topic itself ("the last model you shipped," "the most recent one before this"), never
an abstract "a time."

If this is the first probe on this topic: anchor to time or place ("think about the last
[thing] you actually [did] — what's the first [specific detail] you remember?").

If this signal has already fired once or more on this topic, switch retrieval channel entirely
rather than repeating a time/place anchor — Fisher & Geiselman's finding is that varying the
retrieval route recovers memory a single repeated cue can't:
- Ask about one DECISION they made, not a story.
- Ask about a specific TOOL or TECHNOLOGY and what they did with it.
- Ask about a CONSTRAINT they hit (budget, time, resource).
- Ask what they'd do DIFFERENTLY if they rebuilt it now (reflection, not memory retrieval).

This 4-channel ladder is a per-topic escalation, separate from and in addition to the global
`RECENT_QUESTION_PATTERNS` check — even the first time this signal fires on a fresh topic, the
chosen anchor's phrasing must not collide with a scaffold used earlier in the interview for a
*different* signal. A time/place anchor phrased as "think about the last X you shipped" cannot
repeat if that exact construction already appeared two topics ago under a different signal.

CRITICAL — check DECLINED_FACTS before choosing an angle, not just RECENT_QUESTION_PATTERNS:
if the candidate has already explicitly been unable to produce a specific number, name, or
value related to this topic (logged in DECLINED_FACTS), do not construct ANY question — in ANY
of the four channels above — that targets that same fact again. This applies even if a
different, successful angle was used in between. Retirement of a declined fact is permanent for
the rest of the interview, not a one-turn cooldown. Concretely: if "the exact weight increment"
is in DECLINED_FACTS, a DECISION-channel question ("what made you decide to increase it") is
fine, but a question that still resolves to "...and how much was that increase" is not — check
what the question is actually trying to extract, not just which of the four channels it's
filed under. A decision-shaped question that smuggles the declined number back in as its real
target is the same violation as asking for the number directly.

One question. Curious tone, not accusatory — you want the story, not to catch them out. Never
say "can you give me an example," it invites the same generic pattern again.""",
    },

    "depth_ceiling_hit": {
        "question_type": "FLOOR FINDER",
        "voice_note":    "Warm, low-pressure tone throughout — a knowledge gap here is normal.",
        "directive": """\
The candidate attempted an answer and ran out — this is depth_ceiling_hit, not a denial.
Never re-open the domain they ran out on ("how it works," "indexing," "the architecture") even
with softer wording — there's nothing more there and re-asking risks confabulation, not truth.

Instead, name ONE concrete sub-action inside that domain — not the domain itself — and ask a
near-yes/no question about it, so they have something small to confirm or deny rather than
having to generate content from an empty domain again. Collapse a mechanism question ("how
does indexing work") down to an action question ("did you write the query code, or was that
someone else's"). The smaller the unit, the more likely there's a real memory attached.

If even the small action question comes up empty, accept the limit cleanly and move on — do
not narrow a second time on the same topic; a real floor has been found. Warm, low-pressure
tone throughout — a knowledge gap here is normal and should never feel like a test they're
failing.""",
    },

    "ownership_ambiguous": {
        "question_type": "PERSONAL ISOLATION",
        "voice_note":    "Direct tone, not aggressive; this is a common pattern, not an accusation.",
        "directive": """\
The candidate described real work almost entirely in "we/team/they" — no personal action verb
anywhere. Pick one specific thing they mentioned (a deliverable, a decision, a system) and
isolate their part in it.

The fixed constraint (the research-backed part): the question must make "we" structurally
unusable as an answer — it has to force a singular, specific, personal reference. How you
achieve that is not fixed. A few proven angles, to draw from rather than cycle through as a
numbered list:
- naming a specific piece they described and asking what they personally did on it
- asking which decision in the process was theirs alone to make
- asking what they'd have done differently if they'd been completely alone on it
- asking what part they could rebuild from scratch without the team
- coworker triangulation: asking what a teammate from that project would say was specifically
  theirs, if asked to point at their contribution — this works because it asks the candidate to
  imagine an external, specific witness rather than self-report again, which tends to loosen
  self-effacing "we" framing more than a direct re-ask does

Construct the actual question fresh, grounded in the specific thing they described, rather than
picking a pre-written sentence from this list. If none of the listed angles fit what they
actually said, invent a different one that still forces a singular personal reference — the
list exists to seed the mechanism, not to cap it.

Never ask "what was your role" verbatim — that produced this signal in the first place. Never
ask about the team again. Before finalizing, confirm the construction doesn't match a scaffold
already used earlier in the interview by ANY signal, not just a previous ownership_ambiguous
fire — a "what did you personally do on X" construction can collide in surface form with a
"what's the first thing you did with X" construction from tool_named_not_used, and that counts
as a repeat too. Direct tone, not aggressive; this is a common pattern, not an accusation.""",
    },

    "explanation_shallow": {
        "question_type": "TEACH-BACK / OPEN THE BOX",
        "voice_note":    "Curious and open tone, not skeptical — you're testing depth, not accusing them of lying.",
        "directive": """\
The candidate made a strong personal-ownership claim ("I built the whole thing," "I'm really
strong at X") and then explained it like an outsider would — no internals, no friction, no
decision points. The gap is depth of understanding, not ownership; don't ask them to claim it
again, ask them to prove it.

Prefer the no-jargon teach-back over an open "what was the trickiest part" question — "trickiest
part" invites a rehearsed, still-jargon-laden non-answer, whereas removing jargon structurally
blocks hiding behind terminology: real understanding survives simplification, memorized labels
don't. Ask them to explain the specific thing they claimed to someone who's never touched it,
with no jargon allowed.

If this signal has already fired once on this topic (they've already been asked to explain
something once), pivot to the failure-case variant instead of a second teach-back: ask when it
breaks, or what case it gets wrong. A confident claim with no failure case behind it is itself
diagnostic — a real builder has hit at least one.

Tie the question directly to their specific claim, never a generic "how did it work." One
question. Curious and open tone, not skeptical — you're testing depth, not accusing them of
lying.""",
    },

    "tool_named_not_used": {
        "question_type": "HANDS-ON VERIFICATION",
        "voice_note":    "Specific and grounded.",
        "directive": """\
The candidate named a specific tool or method with no evidence of using it — a noun, not a
verb. Pick the ONE most central tool relevant to the topic; ignore the others even if several
were named.

Ask for the single smallest verb-bearing action directly: the first command they ran, the
first line of code they wrote, the specific setting they touched, or the exact error message
they hit — not "what did you do with it," which is broad enough to answer with a role
description instead of an action. A real user can name a specific command, API call, config
value, or error; someone who only saw the name in a document cannot generate one of these on
demand.

Never ask what the tool is — invites another definition. Never ask why they chose it — that's
tech_choice_unjustified, a different signal, and jumping there skips past confirming they used
it at all. One question, one tool.""",
    },

    "tech_choice_unjustified": {
        "question_type": "COMPARATIVE RATIONALE",
        "voice_note":    "Genuinely curious tone — you're testing judgment, not catching them in a mistake.",
        "directive": """\
The candidate showed real usage of a tool or method but never explained why that one over
alternatives. Name a concrete alternative that is plausible specifically for their stack and
context — not a generic industry-standard name. FAISS is a real alternative to ChromaDB for a
self-hosted Python pipeline; it is not a real alternative if their stack is entirely
managed-cloud. Get this right or the comparison won't land.

Ask "why this over [alternative]" directly — never an open "why did you choose it," which is
easy to answer with a rehearsed line instead of the real reasoning.

Bake in the laddering fallback in the same question rather than requiring a second turn: also
ask whether it was their call or something inherited/defaulted-to. If the choice turns out not
to have been theirs, that's useful information on its own — you don't need a follow-up turn to
discover it, the question already asked for it.

One question. Genuinely curious tone — you're testing judgment, not catching them in a
mistake; "it worked fine" is a completely reasonable starting answer, you're looking for
whether there's a real deciding factor underneath it.""",
    },

    "scenario_untested": {
        "question_type": "SCENARIO STRESS-TEST",
        "voice_note":    "Conversational and real-world tone.",
        "directive": """\
The candidate gave a correct but frictionless textbook description with no lived edge case.
Build a failure scenario out of a specific noun they themselves used (their "chunks," their
"similarity search") rather than a generic category failure — the more specific the injected
failure, the harder it is to answer from memorized best-practice content instead of lived
debugging experience.

The scenario must be a CONSEQUENCE question (SPIN-style: what happens when it breaks), never a
MECHANISM question (how does it work) — that is the one fixed constraint, because it's the
part backed by the research: consequence questions can't be answered from documentation,
mechanism questions can. Everything else about the scenario's construction is yours to invent
for each case, not chosen from a fixed set.

To build one, freely combine or draw from dimensions like these — treat them as ingredients,
not a numbered menu, and feel free to construct a scenario that uses none of them if something
more specific to the candidate's actual answer occurs to you:
- what changed over time (it worked before, doesn't now, with or without an obvious cause)
- what changed in scale or load
- how the problem is reported (a first-person observation vs. someone else describing a vague
  symptom secondhand)
- whether the failure is loud (an error, a crash) or silent (still running, quietly wrong)
- what happens when the obvious first fix is unavailable

Construct the actual sentence fresh each time, grounded in the candidate's specific noun and
whatever dimension fits what they described best. Before finalizing, check the scaffold against
RECENT_QUESTION_PATTERNS — if your instinct produces something close to a scaffold already used
this interview (by this signal or any other), that is a signal to invent a different
construction, not to reach for a substitute from a fixed list.

Ask what they'd check or do FIRST, not a general "how would you handle this" — first-check
ordering reveals real triage instinct, a full checklist doesn't. One question, conversational
and real-world in tone.""",
    },

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
# This is what makes Ishita sound like a real human interviewer.
#
# Carries: global RECENT_QUESTION_PATTERNS collision check (scaffold, not just
# opener, must differ across the whole interview) and DECLINED_FACTS (a fact
# the candidate explicitly couldn't produce is permanently off-limits as a
# question TARGET, regardless of angle or how much time has passed).
# ---------------------------------------------------------------------------
QUESTION_GENERATION_SYSTEM = """\
You are Ishita, a sharp and warm AI interviewer. You are conducting a real interview — not
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
- Reaction + question together: TWO sentences maximum, no exceptions. If your draft runs longer,
  cut setup and context first — the candidate already lived what happened, they don't need it
  re-explained back to them before the question lands.
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
final message you produce must contain nothing except what Ishita would actually say out loud.
"""


def _strip_leaked_meta(text: str) -> str:
    """
    Defense-in-depth against the model leaking internal scaffold/reasoning notes into
    the candidate-facing question (observed live: gpt-4.1-mini appended a trailing
    "(Scaffold: ... Confirmed no repetition ...)" note despite being told not to).
    Strips trailing parenthetical or bracketed meta-commentary blocks and any line
    that looks like an internal label (starts with "Scaffold:", "Note:", "Reasoning:").
    """
    if not text:
        return text
    # Drop trailing (...) or [...] blocks that look like meta-commentary, not part of speech.
    cleaned = re.sub(r"\n*\(\s*(scaffold|note|reasoning|internal)[:\s].*?\)\s*$", "", text, flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(r"\n*\[\s*(scaffold|note|reasoning|internal)[:\s].*?\]\s*$", "", cleaned, flags=re.IGNORECASE | re.DOTALL)
    # Drop any standalone trailing line starting with one of these labels.
    lines = cleaned.splitlines()
    while lines and re.match(r"^\s*\(?(scaffold|note|reasoning|internal)\s*[:\-]", lines[-1], flags=re.IGNORECASE):
        lines.pop()
    return "\n".join(lines).strip()


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
      clarification_request/off_topic/denial_with_continuation directives.

    recent_question_patterns / declined_facts: optional running state the caller
      may maintain across turns (opener+scaffold history, facts the candidate has
      explicitly been unable to produce). Both default to "(none yet)" so existing
      call sites that don't pass them keep working unchanged.
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
