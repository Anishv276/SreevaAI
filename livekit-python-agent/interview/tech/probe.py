"""
probe_strategy.py
One probe per signal. Tells the interview LLM what fired, what it means,
and how to frame the follow-up â€” without scripting the exact question.

Research-backed rewrite (see Docs/new.md): sufficiency checks before probing,
fact-level dedup (DECLINED_FACTS) so a declined number/name isn't re-asked in
different words, and generative (non-menu) angle/scenario construction with a
global RECENT_QUESTION_PATTERNS collision check baked into the system prompt.

10-DIMENSION HOLISTIC RUBRIC taxonomy (matches interview/tech/scoring.py) -- up
to 2 signals fire per turn (never staged/rung-scoped):
  RESPONSE-SHAPE signals (checked first, describe the SHAPE of the reply, never
    combine with a content signal): clarification_request, rephrase_request, off_topic
  CONTENT signals (10, level-calibrated):
    Hard Technical:            factual_error, shallow_label, cost_blind, edge_case_blind
    Situational/Execution:     ambiguity_unchecked, impact_disconnected
    Behavioral/Leadership:     ownership_diffuse, conflict_avoidant, growth_deflected
    Ceiling:                   mastery_demonstrated
    Fluency-bias guard:        confident_uncertain
    Non-attempt:               pure_denial
  Self-correction is a BOOLEAN modifier that composes with any of them, not a
  signal of its own.

MULTI-SIGNAL COMPOSITE DIRECTIVES: when scoring.py fires 2 signals on one turn,
get_probe_context builds a COMPOSITE directive (see _render_composite_directive)
that hands the question-generation LLM both gaps and instructs it to weave ONE
natural follow-up that touches both -- never two separate questions stapled
together, never a checklist recital of both gaps.
"""
from __future__ import annotations

from typing import Any

from interview.tech.scoring import _NON_COMBINING_SIGNALS


# ---------------------------------------------------------------------------
# HOW THESE PROBES WORK
#
# Each probe has:
#   dimension     -- which of the 10 rubric dimensions this targets
#   question_type -- the cognitive demand placed on the candidate
#   voice_note    -- how a real human interviewer would sound asking this
#   directive     -- verbatim framing instructions (principles, not a script)
#
# The interview LLM reads these and writes its OWN question grounded in
# the candidate's actual words. The probes teach the framing principle,
# not the script.
# ---------------------------------------------------------------------------

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
LEVEL 1 â€” junior / entry.
  BAR: a correct mechanism, explained in their own words, is a GOOD answer. Do not withhold
    approval waiting for a tradeoff they have no way to have learned yet.
  PUSH: one step past their answer, never two. If they trace it correctly, take it and move on.
  PREFER: TRACE ("walk me through what happens for this input") and simple OUTPUT questions.
    These are answerable from real understanding without production experience.
  AVOID: scale numbers, concurrency, org-level consequences, "what would you do differently" â€”
    they have no experience to draw on, so these produce invented answers you cannot score.
  A denial here is ordinary. Step down warmly and quickly.""",
    2: """\
LEVEL 2 â€” mid-level.
  BAR: correct mechanism is the FLOOR, not the achievement. One real tradeoff or failure mode
    is what makes an answer good.
  PUSH: two steps is reasonable. After a correct mechanism, ask what it costs.
  PREFER: FALSIFY (a concrete case that breaks a memorised claim) and a first real tradeoff
    under a mild constraint. TRACE is still useful when the answer sounded memorised.
  AVOID: org-scale and staff-level architecture framing â€” still above the role.""",
    3: """\
LEVEL 3 â€” senior.
  BAR: mechanism is assumed. The answer is only good if it carries judgment: what they'd choose,
    against what alternative, and what that choice costs.
  PUSH: hard, but on ONE thread. Follow a claim to its limit rather than sampling many topics.
  PREFER: FALSIFY and ESCALATE (add a real constraint â€” a scale number, a failure mode, a
    concurrent access â€” and ask whether their answer still holds). A forced choice between two
    valid options beats any "explain X" question at this level.
  AVOID: definition questions and anything answerable from documentation. If a question could be
    answered by someone who only read the docs last night, it is the wrong question here.""",
    4: """\
LEVEL 4 â€” staff / principal.
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
â”â”â” SHOWING CODE ON SCREEN â€” HARD CONTRACT â”â”â”
The candidate is on a VOICE call with a screen. They cannot type. If a question needs code,
you MUST emit it as a fenced block and the system renders it on their screen as a card.

SELF-CHECK BEFORE YOU SEND â€” do this every single turn, it takes one second:
Read back the words you just wrote. Do they refer to anything the candidate is supposed to
SEE? Any of "here's", "this", "let me show you", "look at", "on your screen", "the following",
"below", or a question like "what does this print / return / do?" â€” anything that only makes
sense if something is on screen.
  - If YES and you emitted a fenced block â†’ correct, send it.
  - If YES and there is NO fenced block in your output â†’ STOP. You are about to point at a
    blank screen. Fix it before sending: either add the fenced block with the real code, or
    rewrite the sentence so it stands alone as a spoken question with no "this" in it.
  - If NO â†’ send it, with no fence.

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

REACTION_POLICY = """\
1. REACTION
   - React to the substance of their last answer naturally (Hmm, Got it, Right).
   - Never say 'Great!' or 'Awesome!'.
"""

_QUESTION_GENERATION_TEMPLATE = """\
You are Ishitha, a sharp and warm AI interviewer. You are conducting a live technical interview.
You are not following a menu. You are listening, deciding, and asking the next question a real interviewer would actually say out loud.

â”â”â” CALIBRATE TO THE CANDIDATE'S LEVEL â”â”â”
{level_guide}

â”â”â” 10-DIMENSION RUBRIC DEFINITIONS â”â”â”
You evaluate candidates on 10 dimensions. Pay close attention to what fired:
- factual_error: The candidate stated something actively wrong. DO NOT correct them directly. Frame a test case or boundary condition that falsifies their claim and ask them what happens. Let them catch their own error.
- shallow_label: The candidate gave a name/label but no mechanism. The only valid move is 'OPEN THE BOX'. Ask them to step-by-step TRACE what happens inside the mechanism given a specific input. No "what is X" questions.
- cost_blind: The candidate gave a mechanism but ignored trade-offs. Force a choice under a constraint. Add scale, latency, or memory bounds and ask what they would do differently.
- edge_case_blind: The candidate missed boundaries. Push on a concrete failure condition. 'What happens if the database goes down mid-write?' or 'What if the user passes NULL?'
- ambiguity_unchecked: The candidate missed unstated constraints and jumped to a solution. Give them a hidden constraint and ask how their design changes.
- impact_disconnected: The candidate gave a generic textbook answer. Force them to tie it to a concrete business or user outcome from their past work.
- ownership_diffuse: The candidate used "we" or passive voice. Ask what part of the system THEY personally coded or designed, and what their specific alternatives were.
- conflict_avoidant: The candidate glossed over team friction. Ask about a time a stakeholder pushed back on this exact technical choice.
- growth_deflected: The candidate deflected blame on a failure. Ask what they personally learned and what specific safeguard they implemented.
- mastery_demonstrated: The candidate nailed it. Check for a genuine unseen edge case or move on.
- confident_uncertain: The candidate guessed right but sounded unsure. Re-ask the exact same mechanism from a slightly different angle to see if their knowledge holds.

â”â”â” YOUR JOB THIS TURN â”â”â”
Read the last answer, the question that produced it, and the signals together.
Generate ONE follow-up that sounds like a real interviewer thinking out loud.
Aim at the most informative gap first, but let a second signal influence the wording when it fits naturally.
Do not sound like a rubric, a checklist, or a template.

â”â”â” HOW TO BUILD THE QUESTION â”â”â”
1. REACTION
   - React to a concrete word or idea from their last answer naturally (Hmm, Got it, Right).
   - Never say 'Great!' or 'Awesome!'.
2. QUESTION
   - Must be one focused move, not a checklist of prompts. Put them in a real scenario.
   - 40-80 words total. EXACTLY ONE question mark.
â”â”â” RESUME CONTEXT â”â”â”
If resume context is provided below, use it to ground your question in something they actually built. 
If no resume context is provided, ground the question in the scenario they just described.

{code_card_contract}
"""


def render_question_generation_system(level: int = 2, signal: str | None = None, last_question_type: str = "") -> str:
    """The follow-up question-generation prompt, calibrated to the candidate's level.
    """
    level_guide = _LEVEL_QUESTION_GUIDE.get(level or 2, _LEVEL_QUESTION_GUIDE[2])
    _is_code = last_question_type.strip().lower() in ("code_trace", "snippet_eval", "query_trace")
    return _QUESTION_GENERATION_TEMPLATE.format(
        level_guide=level_guide,
        code_card_contract=CODE_CARD_CONTRACT if _is_code else "",
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
    _path = " â†’ ".join(f"{s:.1f}" for s in hist)
    _delta = hist[-1] - hist[-2]
    if _delta <= -2.5:
        _read = "sharp drop â€” candidate was doing well, don't treat this as a knowledge gap on the whole topic, just this specific angle"
    elif _delta >= 2.5:
        _read = "recovering â€” candidate found their footing, don't keep treating them as weak on this topic"
    elif hist[-1] >= 7.0 and min(hist) >= 6.0:
        _read = "consistently strong â€” safe to push for more precision/depth"
    elif hist[-1] <= 4.0 and max(hist) <= 4.5:
        _read = "consistently weak â€” this is a real gap, not a one-off stumble"
    else:
        _read = "flat/mixed â€” no strong trend either way"
    return f"{_path} ({_read})"


def get_probe_context(
    *,
    signal: str | None,
    signal_reason: str | None,
    level: int,
    topic_follow_ups: int,
    topic_denied: bool,
    prev_answer: str,
    signals: list[str] | None = None,
    signals_history: list[str] | None = None,
    active_topic: str = "",
    prev_question: str = "",
    cross_cutting_signal: str | None = None,
    topic_score_history: list[float] | None = None,
    last_question_type: str = "",
    topic_item: Any | None = None,
    provenance_out: dict | None = None,
) -> str:
    """
    Returns the probe context block injected into the directive.
    Tells the interview LLM what fired, what it means, and how to frame
    the next question â€” without scripting the exact words.

    signals_history: full ordered list of signals fired on this topic INCLUDING
      the current one. Used to detect when the same signal has fired 2+ times
      so the probe can pivot to a different section of the topic instead of
      asking another follow-up on the same angle.

    prev_question: the question the candidate just answered/reacted to. Used to
      fill the {original_question}/{off_topic_summary} placeholders in the
      clarification_request/off_topic directives.

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
    # it fires (shallow_label -> pivot to the failure-case variant; cost_blind ->
    # treat continued silence as the finding, don't probe a third time; off_topic and
    # rephrase_request have their own "don't redirect/grant a third time" language). 
    # For these, the generic ANGLE PIVOT block below would hand
    # the model a second, conflicting instruction on the same turn -- "ignore their
    # last answer, jump to an unrelated sub-concept" directly under a directive that
    # just said "adjust the angle on THIS answer." Let the signal's own handling win;
    # the pivot block only adds value for signals with no built-in repeat strategy.
    _SELF_HANDLED_ON_REPEAT = frozenset({
        "shallow_label", "cost_blind", "off_topic", "rephrase_request",
    })
    _same_signal_repeated = _same_signal_repeated and signal not in _SELF_HANDLED_ON_REPEAT



    # --- DYNAMIC MULTI-SIGNAL GENERATION ---
    valid_signals = [s for s in (signals or ([signal] if signal else [])) if s]
    
    if valid_signals:
        lines.append(f"SIGNALS FIRED: {', '.join(valid_signals)}")
    else:
        lines.append("SIGNALS FIRED: None (Follow mandatory sub-concept)")

    if signal_reason:
        lines.append(f"TRIGGER REASON: \"{signal_reason}\"")

    lines.append("DIRECTIVE: Use deep reasoning to target the above signals. Sound like a real interviewer who is actively listening, not like a rubric. If multiple signals fired, weave them into one natural follow-up only when it reads cleanly; otherwise center the primary signal and let the rest subtly shape the angle.")

    # Code card guidance
    _lqt = (last_question_type or "").strip().lower()
    if _lqt in ("code_trace", "snippet_eval", "query_trace"):
        lines.append(f"LAST QUESTION TYPE: {_lqt.upper()} (They are looking at code. Ground your question in the specific code snippet/trace).")

    # Score trend
    _trend = _render_score_trend(topic_score_history)
    if _trend:
        lines.append("")
        lines.append(f"SCORE TREND ON THIS TOPIC: {_trend}")


    if cross_cutting_signal:
        lines.append("")
        lines.append(f"CROSS-CUTTING SIGNAL: {cross_cutting_signal} (Adjust pacing/tone, don't mention directly).")

    return "\n".join(lines)





