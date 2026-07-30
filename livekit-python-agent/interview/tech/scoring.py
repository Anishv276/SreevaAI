"""
interview/tech/scoring.py
Two dedicated LLM calls per turn: one scores the answer, one classifies the signal.
Splitting the calls eliminates conjunctive-logic collapse — the scoring call focuses
purely on quality dimensions, and the signal call gets its own reasoning budget
(400-600 tokens, chain-of-thought allowed) to pick the ONE best-fit signal.

Returns:
  quality scores  : clarity, depth, specificity, grounding, overall
  routing         : action (PROBE/MOVE_ON)
  signal          : one signal name + the exact reason it fired (never null)

Universal signal taxonomy (replaces the old 16-signal stage-scoped system):
  Response-shape signals (shape of reply, checked first):
    clarification_request, rephrase_request, off_topic
  Content signals (9 universal, level-calibrated):
    depth_strong, depth_clear, tradeoff_blind, scope_diffuse,
    confident_uncertain, depth_shallow, depth_misconception,
    depth_generic, pure_denial
  Plus a self_corrected BOOLEAN modifier (not a signal -- see SELF_CORRECTION_TRIGGER)
  No null ever: fallback is depth_shallow.
"""
from __future__ import annotations
import asyncio
import json
import logging
from typing import Any, Optional

logger = logging.getLogger("interview-agent")
from interview.agent_runtime_support import EVAL_TEMPERATURE
from interview.agent_runtime_utils import token_limit_kwarg, llm_metadata


# ---------------------------------------------------------------------------
# Response-shape signals -- fire on the SHAPE of the reply, not the content.
# Checked FIRST before any content signal.
# ---------------------------------------------------------------------------
RESPONSE_SIGNALS = {
    "clarification_request": {
        "description": "Candidate asks to clarify/rephrase the question.",
        "action": "REPHRASE (ask question again, clearer)",
    },
    "rephrase_request": {
        "description": "Candidate asks to restart their own answer.",
        "action": "ACCEPT_REPHRASE (listen to new answer instead)",
    },
    "off_topic": {
        "description": "Answered a completely different question than what was asked.",
        "action": "REDIRECT (re-ask the original question)",
    },
}

# ---------------------------------------------------------------------------
# Universal content signals (9) — the signal encodes THREE independent axes that
# real technical interviewers score separately (Google's rubric scores
# problem-solving/correctness independently from communication; Karat rubrics
# separate "code correctness" from "technical communication"):
#
#   AXIS 1 — CORRECTNESS: is the specific technical claim right, partial, or
#            wrong? (an eloquent WRONG answer must never outscore a terse RIGHT
#            one — that is the #1 failure of grading on fluency)
#   AXIS 2 — DEPTH: how far past a memorized label did they get?
#            label_only  → could be said by someone who read one docs paragraph
#            mechanism   → can explain HOW / trace a concrete case
#            applied     → real tradeoff + judgment from having done the work
#   AXIS 3 — STANCE: how the answer is HELD and OWNED, independent of whether it
#            is right or deep. Two failure modes live here that neither other axis
#            can express, and each needs a different next question:
#              cost-blindness  → correct mechanism, no idea what it COSTS
#                                (tradeoff_blind — the junior/senior discriminator)
#              scope-blindness → real work described, own contribution invisible
#                                (scope_diffuse — a probe target, never a deduction)
#            plus confident_uncertain: right answer, visibly guessed. Grading
#            fluency instead of substance is the best-documented scoring bias, and
#            it runs both ways — depth_misconception guards the confident-and-wrong
#            direction, confident_uncertain guards the hesitant-but-right one.
#
# A signal EARNS its slot only if it demands a DIFFERENT next question. Signals do
# exactly two jobs: pick the probe and feed scoring. Two signals that fire the same
# probe are one signal with two names, and on a single-pick enum they only add
# contention. That test is why depth_mastered and depth_applied were merged into
# depth_strong (identical probe, identical voice, and a coin-flip between them on
# every strong answer that scored differently), and why recovery_attempted was
# demoted to a boolean (see SELF_CORRECTION_TRIGGER below).
#
# The 9 signals are the meaningful CELLS of that grid. Level (1-4) calibrates
# the WEIGHT, not which cell fires. The classifier is told to resolve the two
# axes FIRST, then map to the cell — this is what stops everything collapsing
# to depth_shallow.
#
# Memorization test (the core senior-interviewer move): a memorized label
# survives "what is X" but NOT "trace X for this concrete input" or "what
# breaks X". If the answer is a correct-sounding label with no surviving
# mechanism, that is depth_shallow, not depth_clear — score the substance
# under the label, never the label itself.
# ---------------------------------------------------------------------------
CONTENT_SIGNAL_DEFINITIONS: dict[str, dict] = {

    "depth_strong": {
        "trigger": "CORRECT + APPLIED depth. Mechanism (HOW), tradeoff or failure mode (WHY it breaks), AND judgment about when to use it vs alternatives — all present and accurate. Survives a 'what breaks this' push. The judgment may be demonstrated EITHER abstractly (they can defend the choice against a named alternative) OR through a grounded real instance ('50k reads/sec, Redis TTL=30s, we hit cache stampede, fixed it with probabilistic early expiration'). Both routes reach the same ceiling. For code/query questions: correctly traces the execution AND explains WHY the code behaves that way (scope rule, evaluation order, NULL semantics) — not just the output.",
        "pattern": "A practitioner's answer, not a textbook one: traces the internals, names the failure cases, defends a real judgment call. This is the ceiling — reserve it.",
        "examples": [
            "For DB indexing: 'A B-tree keeps keys sorted so range scans walk leaf nodes in order — that's why BETWEEN is fast. But a low-cardinality column like a boolean flag, the planner ignores the index and does a seq scan anyway because the index isn't selective. I'd only index it if it's part of a composite with a selective leading column.'",
            "For caching (grounded route): '50k reads/sec on our catalog, Redis TTL=30s. On expiry we hit cache stampede — every miss slammed Postgres at once. Fixed it with probabilistic early expiration. Traded staler reads for not taking the DB down.'",
            "For a code_trace: correctly says output is '[1, 2]' AND explains that list slicing creates a new list so the original is unchanged — traces the memory model, not just the output",
        ],
        "not_this": "NOT this if any dimension (mechanism/tradeoff/judgment) is missing → depth_clear, or → tradeoff_blind if specifically the cost/alternative is the missing piece. NOT this if any specific claim is factually WRONG, however fluent → depth_misconception. NOT this if the answer is right but visibly guessed → confident_uncertain. NOT this if the work is real but the candidate's own scope in it is invisible → scope_diffuse.",
    },

    "depth_clear": {
        "trigger": "CORRECT + MECHANISM depth. Everything stated is accurate and they genuinely explain HOW it works or trace the concrete case — real understanding, not a label — but one layer is missing (no tradeoff, or no failure mode, or no 'when NOT to use it'). For code/query questions: states the correct output or result AND traces at least one step of the execution (e.g. 'because the list is modified in place'), but doesn't explain the full evaluation order or edge cases.",
        "pattern": "Solid, correct, mechanism-level. One targeted push (a tradeoff, a failure case, a harder input) away from mastered. This is the expected 'good answer' floor for a competent candidate.",
        "examples": [
            "For hashing: 'Two keys can hash to the same bucket — a collision — so it chains them in a list at that slot and walks the list on lookup. Worst case all keys collide and it degrades to O(n).' — correct mechanism, but didn't mention resize/load factor or how a real impl mitigates it.",
            "For a code_trace: 'It prints 4 because the loop runs n-1 times, not n.' — correct output with correct reason, but didn't explain what happens at the boundary condition",
            "For a query_trace: 'It returns nothing because the LEFT JOIN on orders filters to only users WITH orders — wait, no, the WHERE on orders.id IS NOT NULL is doing that.' — traced the right issue, missed explaining why NULL propagation causes it",
        ],
        "not_this": "NOT this if a tradeoff AND judgment are also present and accurate → depth_strong. NOT this if the missing layer is SPECIFICALLY the cost/alternative → tradeoff_blind. NOT this if it's just a correct-sounding label with no real mechanism traced → depth_shallow. NOT this if any claim is wrong → depth_misconception.",
    },

    "tradeoff_blind": {
        "trigger": "CORRECT MECHANISM, ZERO COST AWARENESS. They explain how their approach works and it is accurate — but they cannot name what it COSTS, when it would be the wrong call, or what they'd compare it against. Every technique is presented as strictly good. Fires specifically when the missing layer is the tradeoff/alternative, and pushing on it produces more of the same benefit list rather than a cost.",
        "pattern": "The single sharpest junior-vs-senior discriminator. Juniors learn what a tool DOES; seniors learn what it COSTS and when not to reach for it. An engineer who cannot name the downside of their own choice has not made a choice — they have applied a default. Distinct from depth_clear (which is any missing layer) because the probe is different: depth_clear gets 'what else', this gets a FORCED CHOICE under a constraint.",
        "examples": [
            "For indexing: 'Indexes make queries fast, so I'd add one on every column we filter by.' — correct that indexes speed reads, no awareness of write amplification, storage, or planner selectivity.",
            "For caching: 'Redis in front of the DB, that solves the latency.' — no mention of invalidation, staleness, or what happens on a cold cache.",
            "For microservices: accurately describes service isolation and independent deploys, names no cost at all — not network latency, not distributed transactions, not operational overhead.",
        ],
        "not_this": "NOT this if they DO name a cost or alternative, even briefly → depth_clear or depth_strong. NOT this if the mechanism itself is absent or hollow → depth_shallow (they must have earned the mechanism for this to be the interesting gap). NOT this if any claim is wrong → depth_misconception. NOT this if it's an ungrounded best-practice checklist → depth_generic.",
    },

    "scope_diffuse": {
        "trigger": "REAL WORK, INVISIBLE OWNERSHIP. They describe a specific, credible thing that actually happened — a real system, a real migration, a real incident — but their OWN contribution is collective, passive, or unstated: 'we decided', 'the team moved to', 'it was migrated', 'we ended up choosing'. The work is real; the candidate's personal scope inside it is not yet visible.",
        "pattern": "A PROBE TARGET, NOT A DEDUCTION — this is the single most common shape of a TRUE answer, because most real engineering is collective and most engineers describe it that way by default. It is not evasion and must never be scored as one. It fires so the next question can ask what THEIR call was; if that probe lands, the answer often converts straight to depth_strong.",
        "examples": [
            "'We moved off the monolith and split out the payments service, and we chose gRPC for the internal calls.' — real migration, real decision, zero indication of what this person did.",
            "'The team was seeing timeouts under load so it was rearchitected with a queue.' — passive voice throughout, no actor named at all.",
        ],
        "not_this": "NOT this if their personal decision or action IS identified ('I benchmarked both and picked gRPC because...') → score on depth alone. NOT this if there's no real instance at all, just a hypothetical ('you'd want a queue there') → depth_generic. NOT this if the described work is vague rather than specific → depth_shallow. Ownership language is the ONLY thing this signal reads — never infer that a 'we' means they didn't do the work.",
    },

    "confident_uncertain": {
        "trigger": "RIGHT ANSWER, VISIBLY GUESSED. The technical content lands correct, but the delivery shows they do not actually know it — hedging stacked on hedging ('I think... maybe... probably... not sure but'), an upward questioning intonation on the fact itself, immediately offering a contradictory alternative, or explicitly flagging it as a guess. The correctness may be genuine recall under low confidence, or it may be luck; this signal exists to find out which.",
        "pattern": "Grading FLUENCY instead of SUBSTANCE is the best-documented failure in interview scoring, and it runs in BOTH directions. The confident-and-wrong direction is already handled (depth_misconception outranks fluency). This is the mirror: a hesitant candidate who is actually right must not be marked down for sounding unsure, and a lucky guess must not be credited as knowledge. Neither depth_clear (over-credits the guess) nor depth_shallow (under-credits real knowledge) can express this, which is why it needs its own probe: re-ask the SAME fact from a different direction — a guess flips, real knowledge holds.",
        "examples": [
            "'I think it's... maybe O(log n)? Could be O(n), I'm not really sure.' — the right answer is in there, stated as a coin flip.",
            "'Probably because the index isn't selective enough? Something like that anyway.' — correct reasoning, offered as a question.",
        ],
        "not_this": "NOT this for ordinary mild hedging around a confidently-held answer ('I'd say it's O(log n) because the tree is balanced') → grade on depth normally; a single 'I think' is not uncertainty. NOT this if the answer is actually WRONG → depth_misconception, regardless of how hedged. NOT this if they hedge and then never land on anything → depth_shallow or pure_denial. The answer must be CORRECT for this to fire.",
    },

    "depth_shallow": {
        "trigger": "CORRECT LABEL, NO MECHANISM. Names the right concept or restates its effect but cannot open the box — no internal steps, no trace, no 'how'. Exactly what a memorized label produces: right word, hollow underneath. Would NOT survive 'trace it for this input'. For code/query questions: states the right output label or result name but cannot explain why the code produces it or trace through the execution.",
        "pattern": "The most common real-interview failure mode, and the one that separates recall from understanding. Correct at the surface, empty below it. Grade the substance under the label — the label alone is worth little.",
        "examples": [
            "For hash maps: 'It makes lookups fast, that's the whole point.'",
            "For generators: 'They're memory efficient and lazy.'",
            "For an index: 'It speeds up the query.'",
            "For a code_trace: 'It prints 3.' (correct output, but zero explanation of how the recursion/closure/mutation arrived there)",
            "For a query_trace: 'It returns the users.' (right direction, no tracing of the JOIN or NULL behavior)",
        ],
        "not_this": "NOT this if any real mechanism is actually traced, even partially → depth_clear. NOT this if the claim is actively WRONG → depth_misconception. NOT this if it's a generic best-practice checklist rather than a hollow label → depth_generic. NOT this if it's a flat non-attempt → pure_denial.",
    },

    "depth_misconception": {
        "trigger": "INCORRECT claim, stated as if true. ANY affirmatively FALSE technical claim — a wrong mechanism, an inversion, a swapped property, OR a wrong how-to/wrong syntax/wrong name for a thing (naming the wrong construct, wrong keyword, wrong function). For code/query questions: states a WRONG output value, a wrong diagnosis of a bug, or a wrong explanation of what a query returns. It does not need to be delivered confidently — a hesitant wrong claim ('umm, we create a list using def?') is still a wrong claim. What matters is that a specific stated thing is FALSE, not how sure they sounded.",
        "pattern": "The single most important signal to get right: a wrong answer must score BELOW a hesitant right one and below a flat 'I don't know'. Silence is a gap; a wrong claim is active confusion that would ship a bug. This is a COMMON case, not a rare one — do not shy away from it and default to depth_shallow just because the answer was short.",
        "examples": [
            "For hash maps: 'Hash maps keep everything in sorted order.' (false — that's a tree)",
            "For generators: 'Generators run in a separate thread.' (false — same thread, suspended frame)",
            "For Python: 'We create a list using def / using diff.' (false — that's a function / that's not a thing; a list is [] )",
            "For SQL: 'LEFT JOIN is faster than INNER because it returns fewer rows.' (false on both counts)",
            "For a code_trace: candidate says the output is '5' when the actual output is '4' (wrong value, not just vague)",
            "For a snippet_eval: candidate identifies the wrong line as the bug, or invents a bug that isn't there",
            "For a query_trace: candidate says the query returns all rows when it actually returns nothing due to an unmatched JOIN",
        ],
        "not_this": "NOT this if the answer is merely thin/vague but nothing in it is actually WRONG → depth_shallow. NOT this if it's mostly right with a missing piece → depth_clear. NOT this if it's a complete non-attempt with no claim at all ('I don't know') → pure_denial. Fires whenever a specific stated claim is FALSE.",
    },

    "depth_generic": {
        "trigger": "PLAUSIBLE BUT UNGROUNDED. A memorized best-practice checklist that could apply to almost any question — technically not-wrong, but with zero reasoning tied to THIS specific problem. Someone who never did the work could say the exact same thing.",
        "pattern": "The prepared-candidate failure mode: fluent frameworks, no substance. Distinct from depth_shallow (which is a hollow LABEL) — this is a hollow PROCESS. 'I'd check logs, look at metrics, optimize' fits every performance question ever asked.",
        "examples": ["For a slow query: 'I'd check the logs, look at metrics, monitor performance, and optimize based on findings.'", "For DB choice: 'It depends on the use case — I'd gather requirements and pick the best tool.'"],
        "not_this": "NOT this if there's a real reason specific to THIS question → depth_clear. NOT this if it's a hollow one-word label rather than a checklist → depth_shallow. NOT this if it's grounded in a specific real instance → depth_strong (or scope_diffuse if the instance is real but their own role in it is invisible).",
    },

    "pure_denial": {
        "trigger": (
            "ZERO attempt AND ZERO content. Apply this MECHANICAL TEST before selecting it, and "
            "select it ONLY if the answer fails the test:\n"
            "  STEP 1 — Strip every denial/hedge phrase from the answer ('I don't know', 'not sure', "
            "'I forgot', 'I haven't used it', 'maybe', 'I think', 'actually', 'sure', 'okay').\n"
            "  STEP 2 — Look at what TEXT REMAINS. Does anything remain that names a technical term, a "
            "concept, a tool, a language, a comparison, or any claim at all — however wrong, garbled, "
            "partial, or off-target?\n"
            "  STEP 3 — If ANYTHING remains: this is NOT pure_denial. Classify it on that remaining "
            "content instead (wrong claim → depth_misconception, hollow label → depth_shallow, "
            "unrelated subject → off_topic). If NOTHING remains: pure_denial.\n"
            "This is a test on CONTENT, never on tone, length, confidence, or transcription quality. A "
            "one-word answer that names a real concept PASSES the test and is not a denial. A rambling "
            "answer that names nothing FAILS it and is."
        ),
        "pattern": "Distinct from every other signal, which all have SOME attempt. Honest and worth acknowledging cleanly — a calibrated 'I don't know' is more useful than a confident wrong guess, and must never score below depth_misconception. The bar is: after this sentence, do we know ANYTHING about what they think the answer might be? If yes, it is NOT pure_denial, however hedged or unsure it sounds.",
        "examples": ["I don't know.", "Not sure.", "No idea.", "I haven't worked with that.", "[silence]"],
        "not_this": (
            "NOT this if there's ANY attempt, even wrong, hollow, hedged, or trailing off mid-thought. "
            "A wrong attempt → depth_misconception. A hollow-label attempt → depth_shallow. "
            "'I don't know, maybe it's something like X' → scored on X, not pure_denial. "
            "'I don't remember exactly, but I think it does Y' → scored on Y, not pure_denial. "
            "'I'm not sure if it's synchronized or a lock, one of those' → an attempt (two named candidates), not pure_denial. "
            "'I don't think I've used that, but it sounds like it might Z' → scored on Z, not pure_denial. "
            "Only the FIRST clause matching 'I don't know' etc. is never enough by itself — read the "
            "whole turn. Reserve pure_denial strictly for a complete non-attempt with no content at all.\n"
            "\n"
            "THESE FOUR SHAPES ARE THE COMMON MISFIRES. None of them is pure_denial:\n"
            "  (a) A GARBLED OR PARTIAL TECHNICAL TERM. Voice transcription mangles words constantly. "
            "If the mangled text is plausibly a technical term for this topic, credit the attempt and "
            "grade the content — 'and calculation' when asked about OOP principles is almost certainly "
            "'encapsulation', which is a CORRECT answer, not a denial. Recover the intended term from "
            "the topic context before judging. Never punish a candidate for the microphone.\n"
            "  (b) A COMPARISON TO ANOTHER TECHNOLOGY. 'Java is very different from Python', 'we use it "
            "like React' — these are real claims that reveal a real (possibly wrong) mental model. That "
            "is content. Wrong-but-stated → depth_misconception. Vague-but-stated → depth_shallow. "
            "Unrelated subject entirely → off_topic. Never pure_denial.\n"
            "  (c) A CONVERSATIONAL ACKNOWLEDGEMENT THAT IS NOT AN ANSWER YET. 'Sure.', 'Okay.', 'Yeah.' "
            "— the candidate is agreeing to answer, not declining to. They have not denied anything. "
            "This is a non-answer to be re-prompted, NOT a denial to be scored — use clarification_request "
            "so the interviewer simply asks again rather than treating it as a knowledge gap.\n"
            "  (d) A VAGUE ATTEMPT USING NON-TECHNICAL WORDS. 'we use different variables', 'it's more "
            "on the setup side' — an attempt to describe a mechanism in lay terms. That is exactly what "
            "depth_shallow exists for. A candidate reaching for plain language is still reaching."
        ),
    },

}

# Self-correction is NOT a signal -- it is a MODIFIER on whatever signal fired.
#
# It used to be the 9th content signal ("recovery_attempted"), which was wrong on
# two counts. First, it only ever fired on a CORRECT landing, which made it
# "depth_clear plus a tone note" -- it was spending a slot on the single-pick enum
# to carry an instruction about how to SOUND. Second, because the enum picks one
# winner, a candidate who self-corrected into a still-thin answer had nowhere to
# go: the correction was either recorded and the thinness lost, or vice versa.
#
# As a boolean it composes with every signal instead of competing with them:
# self_corrected + depth_clear, self_corrected + depth_shallow, self_corrected +
# tradeoff_blind are all now expressible, and the probe reads the flag for its
# opening beat while the signal still drives the question.
SELF_CORRECTION_TRIGGER = (
    "TRUE when the candidate caught and fixed their OWN error mid-answer, without the interviewer "
    "pointing it out -- 'I said it keeps things sorted, no wait, that's a BST' / 'restart, it's not "
    "a separate thread, the frame just suspends at yield'. A genuine positive: you cannot "
    "self-correct a fact you never understood. Score the LANDING, not the slip. FALSE for ordinary "
    "hesitation or hedging with no actual correction, and FALSE if they fumbled without reaching a "
    "better answer."
)

# Flat set of all valid signal names (response shape + content) for validation
ALL_SIGNALS: frozenset[str] = frozenset(RESPONSE_SIGNALS) | frozenset(CONTENT_SIGNAL_DEFINITIONS)

# Signals that count toward denial streak (2 consecutive → MOVE_ON)
DENIAL_SIGNALS: frozenset[str] = frozenset({"pure_denial"})

# Signals that do NOT count as a real follow-up turn (no saturation credit)
NON_FOLLOWUP_SIGNALS: frozenset[str] = frozenset({
    "clarification_request",
    "rephrase_request",
    "off_topic",
})

# ---------------------------------------------------------------------------
# SIGNAL DETECTION -- direct classification.
#
# Tested against a feature-extraction + code-resolver alternative (see
# tests/test_signal_ab.py): direct classification won on both gpt-4.1-nano
# (6/10 vs 4/10) and gpt-4.1-mini (7/10 vs 6/10). Splitting the judgment into
# 11 boolean features gave the model 11 chances to be wrong instead of 1 -- 
# worse, not better. Keeping it as a single classification call.
# ---------------------------------------------------------------------------

def _build_response_shape_gate_block() -> str:
    """Response-shape gates -- checked FIRST, first-match-wins."""
    return """\
---- RESPONSE-SHAPE GATES — check these FIRST, before any content signal ----

RS-a — CLARIFICATION_REQUEST: Is candidate asking YOU to clarify/rephrase the question,
      saying they didn't understand/follow the question, OR checking the connection/
      whether you can hear them (not answering the question at all, just checking in)?
      "What do you mean?" | "Can you rephrase?" | "Can you repeat?" | "I didn't get you" |
      "I don't get it" | "I don't understand" | "Sorry, can you repeat that?" |
      "Hey, can you hear me?" | "Are you there?" | "Hello? Can you hear me?"
      → YES: SIGNAL = clarification_request. STOP.

RS-b — REPHRASE_REQUEST: Is candidate asking to RESTART or correct THEIR OWN answer?
      "Let me say that again" | "I misspoke, what I meant..." | "Sorry, I said that wrong"
      → YES: SIGNAL = rephrase_request. STOP.

RS-c — OFF_TOPIC: Did candidate answer a COMPLETELY DIFFERENT question — one that has
      NOTHING to do with the topic or question asked?
      Q: "Kubernetes scaling?" A: "I love React" | Q: "Indexing tradeoffs?" A: "I like Python"
      → YES: SIGNAL = off_topic. STOP.
      NOT this if they attempted to address the question but gave a vague, shallow, wrong,
      or confused answer — a partial or even incorrect technical attempt is ON-TOPIC and
      falls through to the content signal below, NOT off_topic.
      off_topic ONLY fires when the subject matter itself is unrelated to what was asked.

RS-d — GARBLED/UNINTELLIGIBLE TRANSCRIPT: Is the text itself broken, muffled, or noise —
      not a real sentence in any language, mostly fragments/filler ("uh- wha- sorry- can
      you- mm"), cut off mid-word, or otherwise not coherent enough to tell what the
      candidate meant to say? This is a TRANSCRIPTION problem (mic cutting out, background
      noise, connection glitch), not a weak or wrong answer.
      → YES: SIGNAL = clarification_request. STOP.
      NOT this if the text is short but forms a real, coherent attempt at an answer, even a
      one-word or terse technical one ("O(log n)", "primary key", "yes", "I don't know",
      "b-tree index") — those are real content, not noise, and must fall through normally.
      Judge this on whether a human reading the transcript could tell what topic the
      candidate was trying to address at all, not on how complete or correct the answer is.

If none of RS-a/b/c/d fired: this answer gets exactly ONE content signal (below).\
"""


def _build_content_signal_prompt_block(level: int, question_type: str = "") -> str:
    """Universal content signal detection — all 9 signals always available, no stage scoping.

    Level (1-4) calibrates how seriously each outcome is WEIGHTED. It never changes
    WHICH signal fires: a wrong claim is depth_misconception at every level, and an
    unnamed tradeoff is tradeoff_blind at every level. Only the severity moves. This
    separation is deliberate -- if level changed the detection criteria too, the same
    answer would be classified differently for two candidates and the report would be
    comparing different things.

    question_type (optional): the type of question that was asked (e.g. 'code_trace',
    'snippet_eval', 'query_trace'). Used to inject code-question-specific calibration."""
    _level_context = {
        1: (
            "LEVEL 1 (junior/entry): depth_clear is a STRONG positive — do not withhold it waiting "
            "for depth_strong. depth_shallow is a real gap but not a red flag. tradeoff_blind is "
            "EXPECTED at this level and near-costless: juniors have not yet been burned by the "
            "downside of anything. confident_uncertain is normal and should not be penalised — "
            "hedging is honest at this level. scope_diffuse is expected; juniors genuinely do own "
            "small slices of collective work."
        ),
        2: (
            "LEVEL 2 (mid-level): depth_clear is the expected FLOOR. depth_shallow signals a real "
            "knowledge gap worth probing. tradeoff_blind is a MILD negative — by mid-level they "
            "should have hit at least one downside in production. confident_uncertain is mildly "
            "negative on core skills, neutral elsewhere. scope_diffuse is worth one probe but not "
            "a mark against them."
        ),
        3: (
            "LEVEL 3 (senior): depth_strong is the target and depth_clear is the floor. "
            "depth_shallow is a SIGNIFICANT gap. tradeoff_blind is a SERIOUS negative — cost "
            "awareness is the core of the senior role, and presenting every technique as strictly "
            "good is the clearest sign someone has not operated at this level. scope_diffuse "
            "matters here: a senior who cannot articulate their own call inside a team decision "
            "has not demonstrated seniority, so probe it and weight the answer heavily."
        ),
        4: (
            "LEVEL 4 (principal/staff): depth_strong is the BASELINE, not the ceiling. "
            "depth_shallow is a red flag. tradeoff_blind is close to DISQUALIFYING on a core "
            "skill — at this level the entire job is choosing between valid options under "
            "constraint. scope_diffuse is a major flag: staff-level impact is precisely the part "
            "that is theirs, and inability to name it is itself the finding. confident_uncertain "
            "on a core skill is notable — fluency on fundamentals is assumed at this level."
        ),
    }.get(level, "Grade for genuine understanding at the expected level.")

    # Code-question-specific calibration injected when the question was a code type.
    _qt = (question_type or "").strip().lower()
    _code_q_note = ""
    if _qt in ("code_trace", "snippet_eval", "query_trace"):
        if _qt == "code_trace":
            _code_q_note = (
                "\nCODE TRACE QUESTION: The candidate read a code snippet and answered verbally.\n"
                "  depth_shallow: stated the correct output/behavior but gave NO explanation of why the "
                "code produces it (no trace of execution, no naming of the rule or mechanism).\n"
                "  depth_clear: correct output AND explained at least one execution step (e.g. 'because "
                "the loop starts at index 1, not 0' or 'because append mutates in place').\n"
                "  depth_strong: correct output + full trace of execution + explains edge case or "
                "boundary behavior without being asked.\n"
                "  depth_misconception: stated the WRONG output value, or wrong diagnosis of why it "
                "behaves that way (e.g. said 'it prints 5' when it prints 4).\n"
                "  pure_denial: said 'I don't know' or 'I can't read this' with no attempt.\n"
            )
        elif _qt == "snippet_eval":
            _code_q_note = (
                "\nSNIPPET EVAL QUESTION: The candidate read a code snippet with a bug and answered verbally.\n"
                "  depth_shallow: said 'something is wrong' or named a vague area but could not "
                "identify the specific bug or the condition that triggers it.\n"
                "  depth_clear: correctly identified the bug AND the condition that triggers it, but "
                "did not explain the underlying mechanism (why the code is wrong).\n"
                "  depth_strong: correctly identified the bug, the trigger condition, AND explained "
                "why the code fails (the language rule or logic gap being violated).\n"
                "  depth_misconception: identified a bug that does NOT exist, or misidentified the "
                "wrong line/function as the source of the bug.\n"
                "  pure_denial: said 'I can't find it' or 'I don't know' with no attempt.\n"
            )
        elif _qt == "query_trace":
            _code_q_note = (
                "\nQUERY TRACE QUESTION: The candidate read a SQL/data query and answered verbally.\n"
                "  depth_shallow: stated a correct general answer ('it returns users') but did not "
                "trace the JOIN/WHERE/GROUP behavior or the specific case asked about.\n"
                "  depth_clear: correctly described what the query returns in the specific case AND "
                "explained one key behavior (e.g. NULL propagation, LEFT JOIN semantics).\n"
                "  depth_strong: correct result + full trace of the query plan + identifies a "
                "performance trap or edge case (e.g. missing index, unexpected NULL, dropped rows).\n"
                "  depth_misconception: said the query returns a wrong result, or described the "
                "JOIN/WHERE behavior incorrectly.\n"
                "  pure_denial: said 'I don't know SQL' or 'I can't read this' with no attempt.\n"
            )

    _gate_lines = []
    for name, defn in CONTENT_SIGNAL_DEFINITIONS.items():
        _gate_lines.append(
            f"  \"{name}\": {defn['trigger']}\n"
            f"    Pattern: {defn['pattern']}\n"
            f"    Example: {defn['examples'][0]}\n"
            f"    {defn['not_this']}"
        )
    _gates_block = "\n\n".join(_gate_lines)

    return f"""\
---- CONTENT SIGNAL — pick exactly ONE of these 9 ----

{_level_context}
{_code_q_note}
RESOLVE TWO AXES FIRST, THEN MAP TO THE SIGNAL (do this before picking a name):

  AXIS 1 — CORRECTNESS: Is the specific technical claim right?
    correct  — everything stated is accurate
    partial  — mostly right, one piece missing or imprecise
    wrong    — a specific claim is affirmatively FALSE: an inversion, a swap, a wrong
               mechanism, OR a wrong how-to / wrong syntax / wrong name for a construct
               (e.g. "create a list with def" — that's a function, not a list). A wrong
               claim is 'wrong' whether stated confidently or hesitantly.
    none     — no claim attempted at all
  Judge correctness on SUBSTANCE, never on fluency. A confident, well-spoken WRONG
  answer is still wrong. A hesitant, rambly RIGHT answer is still right. Voice
  transcription is messy — grade what they MEAN, not how cleanly they said it.

  AXIS 2 — DEPTH: How far past a memorized label did they get?
    label_only — names the concept / restates the effect, but no HOW. Would NOT
                 survive "trace it for this input". This is the memorization tell.
    mechanism  — actually explains HOW / traces the concrete case
    applied    — real tradeoff + judgment, ideally from a grounded real instance

  Then map:
    correct + applied                    → depth_strong
    correct + mechanism, no cost named   → tradeoff_blind
    correct + mechanism, other gap       → depth_clear
    correct + label_only                 → depth_shallow
    correct but visibly guessed          → confident_uncertain
    real instance, ownership invisible   → scope_diffuse
    plausible-but-ungrounded checklist   → depth_generic
    wrong (any depth)                    → depth_misconception
    none                                 → pure_denial

  ORDER OF RESOLUTION when more than one could fit (first match wins):
    0. NOTHING remains after stripping hedges → pure_denial (run the mechanical test in its
       definition FIRST; it is the narrowest signal here, not the default landing spot)
    1. wrong claim anywhere                 → depth_misconception (correctness dominates)
    2. correct but visibly guessed          → confident_uncertain (the guess is the story)
    3. real instance, ownership invisible   → scope_diffuse (ask whose call it was)
    4. mechanism present, no cost named     → tradeoff_blind
    5. otherwise map on the two axes above

  ANTI-LOOP RULE — pure_denial and depth_shallow are the two signals that attract lazy
  classification, because they are the easiest to justify for a weak answer. If EITHER has
  already fired twice on this topic, treat a third as a red flag on your own reasoning and
  re-read the answer specifically hunting for content you skipped: a mangled technical term,
  a comparison, a partial mechanism, a wrong claim worth naming. A candidate producing three
  identical signals in a row usually means the classifier stopped reading, not that the
  candidate stopped answering. Only repeat the signal if the mechanical test genuinely still
  fails on this specific answer.

{_gates_block}

CRITICAL ordering rules:
1. CORRECTNESS DOMINATES. A wrong claim is depth_misconception no matter how fluent or
   detailed — it must never be scored as depth_clear/mastered just because it was
   articulate. Confident-and-wrong scores BELOW hesitant-and-right and BELOW "I don't know".
2. LABEL ≠ UNDERSTANDING. A correct-sounding label with no mechanism traced is depth_shallow,
   NOT depth_clear. Do not credit the keyword — credit only the substance under it.
3. scope_diffuse: fires on a SPECIFIC real instance whose OWNERSHIP is collective or passive. It is
   a PROBE TARGET, not a deduction — never read a "we" as evidence they didn't do the work. If
   there is no real instance at all (just a hypothetical or a habit), this is not it.
4. tradeoff_blind: requires the mechanism to be PRESENT and correct — it is the COST that's
   missing, not the understanding. A hollow answer that also names no cost is depth_shallow.
5. confident_uncertain: the answer must be CORRECT. A hedged WRONG answer is depth_misconception,
   and a hedge that never lands on anything is depth_shallow or pure_denial.
6. pure_denial is ONLY for a complete non-attempt. ANY attempt — even wrong — is a different signal.

FALLBACK RULE (no null ever, but do NOT use this as a shortcut): Before ever landing on
depth_shallow, you MUST re-walk the two axes explicitly:
  - Is any specific claim actually FALSE? → depth_misconception, not depth_shallow.
  - Is it a real, if imperfect, mechanism trace (even one step)? → depth_clear, not depth_shallow.
  - Is it a fluent checklist/best-practice recital with no claim tied to THIS question? → depth_generic, not depth_shallow.
  - Is it grounded in a specific real instance with a constraint and outcome? → depth_strong, or
    scope_diffuse if that instance's ownership is collective. Not depth_shallow.
  - Is it a complete non-attempt with nothing said? → pure_denial, not depth_shallow.
depth_shallow is a narrow, specific cell — a correct label with truly nothing underneath it —
not a default resting place for uncertainty. Reaching it requires ruling out all five alternatives
above, not just failing to be sure which one applies.\
"""


async def _classify_signal_from_answer(
    *,
    candidate_answer: str,
    last_question: str,
    client: Any,
    llm_model: str,
    level: int = 2,
) -> tuple[str, str | None, dict | None]:
    """
    Fallback: compare the answer against all 9 universal content signals.
    Used only when the primary signal call returned nothing parseable, so it does
    not decide self_corrected -- that modifier defaults to False on this path.
    Called only when the main eval LLM failed to return a valid signal.
    Fallback signal is always depth_shallow (never null).
    """
    _candidates = list(CONTENT_SIGNAL_DEFINITIONS.keys())
    _signal_descriptions = "\n".join(
        f'"{name}": {CONTENT_SIGNAL_DEFINITIONS[name]["trigger"]}'
        for name in _candidates
    )
    _system = (
        "You are a signal classifier for a technical interview evaluation system.\n"
        "Given the question and the candidate's answer, pick the ONE signal from the list below "
        "that best describes this specific answer.\n\n"
        f"SIGNALS (choose exactly one):\n{_signal_descriptions}\n\n"
        "Output ONLY valid JSON: {\"signal\": \"<signal_name>\", \"signal_reason\": \"<3-12 word exact quote from their answer>\"}\n"
        "signal MUST be exactly one of the signal names listed above. Never null — but do not default to "
        "depth_shallow out of uncertainty. Rule out a wrong claim (depth_misconception), a real mechanism "
        "trace (depth_clear), a generic checklist (depth_generic), a grounded instance (depth_strong), and "
        "a non-attempt (pure_denial) first. depth_shallow is only a correct label with truly nothing underneath."
    )
    _user = f"QUESTION: {last_question}\n\nANSWER: {candidate_answer}"
    _usage: dict | None = None
    try:
        resp = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=0.0,
                **token_limit_kwarg(llm_model, 80),
                messages=[
                    {"role": "system", "content": _system},
                    {"role": "user", "content": _user},
                ],
                response_format={"type": "json_object"},
            ),
            timeout=30.0,
        )
        from billing.billing import extract_usage as _extract_usage  # noqa: PLC0415
        _usage = _extract_usage(resp, llm_model) if resp else None
        raw = resp.choices[0].message.content or ""
        result = json.loads(raw)
        chosen = str(result.get("signal", "")).strip()
        reason = str(result.get("signal_reason") or "").strip() or None
        if not reason and chosen in CONTENT_SIGNAL_DEFINITIONS:
            reason = CONTENT_SIGNAL_DEFINITIONS[chosen]["trigger"]
        if chosen in CONTENT_SIGNAL_DEFINITIONS:
            return chosen, reason, _usage
    except Exception as exc:
        logger.warning("[EVAL] _classify_signal_from_answer failed (%s) — using depth_shallow fallback", exc)
    # Deterministic fallback: depth_shallow (gap tier — "attempted but hollow")
    return "depth_shallow", CONTENT_SIGNAL_DEFINITIONS["depth_shallow"]["trigger"], _usage


async def _call_scoring(
    *,
    candidate_answer: str,
    last_question: str,
    topic_follow_up_count: int,
    recent_context: str,
    client: Any,
    llm_model: str,
    org_id: str,
    active_topic: str,
    level: int,
    topic_probe_focus: str | None,
    job_title: str,
) -> tuple[dict, dict]:
    """
    Call 1 — quality scoring only (no signal logic).
    Returns (parsed_data_dict, llm_usage_dict).
    """
    _level_bar = {
        1: "This is a LEVEL 1 (basic) question. Grade for genuine understanding of "
           "fundamentals, not polish. A simple, honest, correct answer with one real "
           "reason behind it deserves a high score even without tradeoffs or scale context.",
        2: "This is a LEVEL 2 (moderate) question. Expect real working knowledge, not just "
           "textbook recall. A generic, no-reasoning answer should be capped well below the top.",
        3: "This is a LEVEL 3 (experienced) question. Expect applied depth: a real tradeoff, "
           "constraint, or judgment call behind the answer. A single-reason, no-tradeoff answer "
           "should be capped in the middle of the range, not the top.",
        4: "This is a LEVEL 4 (advanced/senior) question. Expect strategic judgment — why this "
           "over the alternatives, second-order thinking, awareness of failure modes at scale. "
           "A textbook-correct but shallow answer should be capped well below the top.",
    }.get(level, "Grade for genuine understanding, not polish.")

    def _build_scoring_system_prompt() -> str:
        ctx = (
            "You are an experienced interviewer scoring a candidate's answer.\n"
            "Think like a senior hiring manager who has interviewed hundreds of people.\n"
            "You know the difference between someone who did the work and someone who read about it.\n"
            "Output ONLY valid JSON:\n"
            '{"answers_question":true/false,"clarity":0-10,"depth":0-10,"specificity":0-10,"grounding":0-10,'
            '"reason":"<one phrase from their answer that drove your scoring call>"}\n\n'
            "STEP 1 — answers_question: Did the candidate's answer actually address the question that was asked?\n"
            "  true  = they engaged with the question, even partially or weakly.\n"
            "  false = the answer has NOTHING to do with the question — completely unrelated topic,\n"
            "          pure social filler ('Yeah I am ready'), or zero attempt at what was asked.\n"
            "  IMPORTANT: A vague, shallow, or generic attempt is still answers_question=TRUE.\n"
            "  'I built the pipeline with loaders, chunking, and retrieval' is true even if it\n"
            "  lacks depth. Score it low on depth/specificity — do NOT set answers_question=false.\n"
            "  answers_question=false is ONLY for answers where the subject matter is completely\n"
            "  unrelated (candidate talks about a different topic entirely, or says only 'I am ready').\n"
            "  If answers_question = false, you MUST set clarity=0, depth=0, specificity=0, grounding=0.\n"
            "  No score at all for an answer that does not address the question.\n\n"
            "STEP 2 — Score normally (only if answers_question = true).\n\n"
            "── SCORE ADDITIVELY, PER CORRECT ELEMENT PRESENT (do this before assigning any number) ──\n"
            "Before scoring depth/specificity, silently list the specific correct sub-elements of THIS\n"
            "concept that a strong answer would contain (e.g. for checked vs. unchecked exceptions: a\n"
            "correct example of each, the compiler-enforcement distinction, the throw-vs-throws\n"
            "distinction). Then check which of those the candidate's answer actually contains, and\n"
            "credit each one present — do not default to a flat mid/low score just because you are\n"
            "unsure or the answer isn't exhaustive. An answer with 2 of 3 correct sub-elements scores\n"
            "meaningfully higher than one with 0 or 1, even though neither is a 'complete' answer. Never\n"
            "round an uncertain case down to a generic default penalty — score exactly what is present.\n\n"
            f"Role: {job_title or 'not specified'} | Topic: {active_topic or 'general'}\n"
            f"{_level_bar}\n"
        )
        if topic_probe_focus:
            ctx += f"Probe focus: {topic_probe_focus}\n"
        ctx += (
            "This is voice-transcribed speech — score the meaning, not the grammar.\n\n"
            "BEFORE YOU SCORE: Read the answer as a real interviewer would.\n"
            "Ask yourself: does this person sound like they actually did this work?\n"
            "Strip away fluency and polish. Look for the substance underneath.\n\n"

            "── DISFLUENCY VS. CORRECTNESS (apply this before scoring any dimension) ──\n"
            "Separate HOW they said it from WHAT they said. Filler words ('um', 'like'), "
            "run-on or rambling phrasing, restarting a sentence, or self-correcting mid-answer "
            "are DELIVERY, not substance — they are NOT evidence of a wrong or shallow answer.\n"
            "Score in this order: (1) first identify whether the correct key concepts are present "
            "and correctly related to each other — this is the primary driver of clarity/depth; "
            "(2) only then apply a SMALL deduction for delivery quality (confusing rambling that "
            "actually obscures WHICH concept they mean, not just clumsy phrasing of a clear one).\n"
            "A rambling, hedging, self-correcting answer that arrives at the right concept and "
            "relationship must score MEANINGFULLY HIGHER than an answer that is fluent and confident "
            "but substantively wrong or contains no real answer — fluency is not a proxy for "
            "correctness, and correctness must not be suppressed to near-zero just because the "
            "delivery was messy. Reserve low clarity/depth scores for answers that are actually "
            "wrong, empty, or off-target — not for answers that are merely awkwardly phrased.\n\n"

            "── SELF-CORRECTION IS A GOOD SIGN, NOT A FUMBLE ──\n"
            "If the candidate states something, then catches their OWN mistake and corrects it to "
            "something accurate (even mid-sentence), score the CORRECTED version, and score it "
            "HIGHER than if they'd only given the fumble — catching your own error is evidence of "
            "real understanding, not a penalty-worthy stumble. Do not average the wrong first attempt "
            "with the corrected one; weight toward the correction they landed on.\n\n"

            "── ACTIVE WRONGNESS IS WORSE THAN NO ATTEMPT ──\n"
            "A confident, specific claim that is ACTUALLY WRONG (states a mechanism backwards, swaps "
            "two concepts' properties, asserts something false with certainty) reveals a real "
            "misconception — this must score LOWER than a flat 'I don't know' on the same question, "
            "not the same or higher. Silence is a gap; a confident wrong answer is active confusion. "
            "Do not be fooled by confident delivery into scoring a wrong claim as if it were correct.\n\n"

            "── CLARITY (20%) ──────────────────────────────\n"
            "Did they answer what was actually asked — not a safer, easier version of it?\n"
            "A polished answer to the wrong question scores low. A rough answer to the right question scores high.\n"
            "Low (0-4): off-topic, tangent, or answered a related but different question.\n"
            "Mid (5-6): addressed the question but missed part of the intent or drifted.\n"
            "High (7-10): directly answered what was asked. You got what you needed.\n\n"

            "── DEPTH (35%) ────────────────────────────────\n"
            "Did they explain the HOW and WHY — or just describe the WHAT?\n"
            "Ask yourself: could someone who only read about this topic give the same answer?\n"
            "If yes, depth is low. Real depth is specific to their situation, their constraints, their actual decisions.\n"
            "Generic best-practices language ('I always start by understanding requirements') is not depth — cap at 5.\n"
            "Low (0-4): described what happened, no reasoning behind it.\n"
            "Mid (5-6): gave a real reason for a choice but it's thin — one layer, no constraint or tradeoff behind it.\n"
            "High (7-10): explained a real decision AND why that decision made sense given their specific situation. "
            "The best answers show a cause-effect chain — what they tried, what happened, why they adjusted. "
            "Expect at least one real constraint or tradeoff behind a decision — generic reasoning caps at 4.\n\n"

            "── SPECIFICITY (20%) ──────────────────────────\n"
            "Did they give you operational detail that could only exist if they actually did this work?\n"
            "This is NOT about tool names or software. Anyone can study a job description and name every tool in it.\n"
            "Real specificity: a real number (quota, headcount, deal size, %, volume), a constraint they hit, "
            "a specific failure they fixed, a real decision point, an outcome that actually happened, "
            "a specific client type or team structure or process step that was theirs.\n"
            "Tool names without usage context = no specificity. 'It went well' = no specificity. "
            "'I usually handle X type of client' = pattern, not specificity.\n"
            "Low (0-4): generic — anyone who read one article could say this.\n"
            "Mid (5-6): one real operational detail that required being there.\n"
            "High (7-10): multiple real details that together make the work traceable to a real event, not a type of event. "
            "Expect at least one real number or constraint — vague operational language caps at 4.\n\n"

            "── GROUNDING (25%) ────────────────────────────\n"
            "Does this answer sound like someone who was there — or someone describing what being there is supposed to sound like?\n"
            "Grounding is the hardest score to fake. Clarity, depth, and specificity can all be rehearsed. "
            "Grounding requires details that only exist when you actually lived through something.\n"
            "Signs of real grounding: something didn't go as planned. They remember it imperfectly "
            "('around 40%, I don't remember exactly'). The detail is specific to their situation, not generic to the domain. "
            "The outcome wasn't guaranteed. They reflect on what they'd do differently. "
            "There's organisational texture — a real stakeholder, a real deadline, a real constraint from outside them.\n"
            "Signs of a hollow answer: perfect linear story (problem → action → success). "
            "Everything worked. Nothing was hard. The outcome is vague. "
            "It sounds like a case study of how this work should go, not how it actually went.\n"
            "An answer with no stated result or outcome cannot score above 5 — something must have happened.\n"
            "Low (0-4): plausible but hollow. Reads like a description of the work, not a memory of doing it.\n"
            "Mid (5-6): at least one grounding signal — a real result, a real friction point, a real constraint.\n"
            "High (7-10): the story has texture. Something was hard or imperfect or specific to their situation. "
            "You believe this person was actually there. Expect at least one friction point or specific "
            "outcome — a clean, perfect narrative with no friction caps at 4.\n\n"
        )
        return ctx

    stream = await asyncio.wait_for(
        client.chat.completions.create(
            model=llm_model,
            temperature=EVAL_TEMPERATURE,
            **token_limit_kwarg(llm_model, 120),
            stream=True,
            messages=[
                {"role": "system", "content": _build_scoring_system_prompt()},
                {
                    "role": "user",
                    "content": (
                        f"QUESTION: {last_question}\n\n"
                        f"ANSWER: {candidate_answer}\n\n"
                        f"FOLLOW-UPS ON THIS TOPIC SO FAR: {topic_follow_up_count}\n\n"
                        f"RECENT CONVERSATION (last 3 exchanges):\n{recent_context}"
                    ),
                },
            ],
            response_format={"type": "json_object"},
            stream_options={"include_usage": True},
            store=True,
            metadata=llm_metadata(call_type="eval_scoring", level=level, org_id=org_id or ""),
        ),
        timeout=45.0,
    )

    raw = ""
    _usage = None
    async for chunk in stream:
        if chunk.choices and chunk.choices[0].delta.content:
            raw += chunk.choices[0].delta.content
        if chunk.usage:
            _usage = chunk.usage

    from billing.billing import extract_usage as _extract_usage  # noqa: PLC0415
    _llm_usage = _extract_usage(_usage, llm_model) if _usage else {
        "model": llm_model, "inputTokens": 0, "outputTokens": 0, "cachedInputTokens": 0,
    }
    return json.loads(raw), _llm_usage


async def _call_signal_classification(
    *,
    candidate_answer: str,
    last_question: str,
    recent_context: str,
    client: Any,
    llm_model: str,
    org_id: str,
    active_topic: str,
    level: int = 2,
    question_type: str = "",
    signals_already_fired: list[str] = None,
) -> tuple[str | None, str | None, bool, dict]:
    """
    Call 2 — universal signal classification, with its own 400-600 token reasoning budget.
    Brief chain-of-thought is allowed before the final JSON.
    Returns (signal, signal_reason, self_corrected, llm_usage_dict).
    question_type: the type of question that was asked (code_trace, snippet_eval, query_trace,
    mechanism, etc.) — used to calibrate signal classification for code card questions.
    """
    def _build_signal_system_prompt() -> str:
        _fired_list = ", ".join(signals_already_fired) if signals_already_fired else "None"
        return (
            "You are a signal classifier for a technical interview evaluation system.\n"
            f"Signals already fired on this topic: [{_fired_list}].\n"
            "Your job is to predict the best signal to fire NEXT based on analyzing the answer. To ensure a dynamic\n"
            "interview, prioritize selecting a valid signal that has NOT been fired yet, if it is a logical follow-up.\n\n"
            "You may reason briefly (2-4 sentences) before giving your final answer, but your final output\n"
            "MUST end with valid JSON on its own line:\n"
            '{"signal": "<signal_name>", "signal_reason": "<3-12 word exact quote from their answer>",\n'
            ' "self_corrected": true|false}\n\n'
            "self_corrected is a MODIFIER, decided SEPARATELY from the signal — it does not compete with\n"
            "it and does not change which signal you pick. " + SELF_CORRECTION_TRIGGER + "\n\n"
            "signal MUST be exactly one of the signal names below. NEVER null — but do not default to\n"
            "depth_shallow out of uncertainty. Rule out a wrong claim (depth_misconception), a real\n"
            "mechanism trace (depth_clear), a generic checklist (depth_generic), a grounded instance\n"
            "(depth_strong), and a non-attempt (pure_denial) first. depth_shallow is only\n"
            "a correct label with truly nothing underneath — not a resting place for indecision.\n"
            f"Topic: {active_topic or 'general'} | Level: {level}\n"
            + (f"Question type: {question_type} (see code-question calibration rules below)\n" if question_type else "")
            + "\n"
            + _build_response_shape_gate_block()
            + "\n\n"
            + _build_content_signal_prompt_block(level, question_type=question_type)
        )

    resp = await asyncio.wait_for(
        client.chat.completions.create(
            model=llm_model,
            temperature=0.0,
            **token_limit_kwarg(llm_model, 500),
            messages=[
                {"role": "system", "content": _build_signal_system_prompt()},
                {
                    "role": "user",
                    "content": (
                        f"QUESTION: {last_question}\n\n"
                        f"ANSWER: {candidate_answer}\n\n"
                        f"RECENT CONVERSATION (last 3 exchanges):\n{recent_context}"
                    ),
                },
            ],
            store=True,
            metadata=llm_metadata(call_type="eval_signal", level=level, org_id=org_id or ""),
        ),
        timeout=30.0,
    )

    raw = resp.choices[0].message.content or ""

    from billing.billing import extract_usage as _extract_usage  # noqa: PLC0415
    _llm_usage = _extract_usage(resp, llm_model) if resp else {
        "model": llm_model, "inputTokens": 0, "outputTokens": 0, "cachedInputTokens": 0,
    }

    # Extract the last JSON object from the response (chain-of-thought comes first)
    signal: str | None = None
    signal_reason: str | None = None
    self_corrected: bool = False
    import re as _re
    _json_matches = _re.findall(r'\{[^{}]+\}', raw)
    for _candidate_json in reversed(_json_matches):
        try:
            _parsed = json.loads(_candidate_json)
            _sig = str(_parsed.get("signal", "")).strip()
            _reason = str(_parsed.get("signal_reason") or "").strip() or None
            if _sig:
                signal = _sig
                if not _reason:
                    _defn = CONTENT_SIGNAL_DEFINITIONS.get(_sig) or RESPONSE_SIGNALS.get(_sig)
                    _reason = _defn.get("trigger") or _defn.get("description") if _defn else None
                signal_reason = _reason
                self_corrected = bool(_parsed.get("self_corrected"))
                break
        except (json.JSONDecodeError, ValueError):
            continue

    return signal, signal_reason, self_corrected, _llm_usage


async def evaluate_answer(
    candidate_answer: str,
    last_question: str,
    topic_follow_up_count: int,
    transcript_lines: list,
    client,
    llm_model: str,
    org_id: Optional[str] = None,
    is_warmup: bool = False,
    active_topic: str = "",
    level: int = 2,
    topic_probe_focus: str | None = None,
    job_title: str = "",
    question_type: str = "",
    signals_already_fired: list[str] = None,
) -> dict:
    """
    Two dedicated LLM calls: Call 1 scores the answer, Call 2 classifies the signal.
    Signal taxonomy is now universal (8 content signals + 3 response shape signals).
    No active_stage, no topic_tag, no cross_cutting_signal.
    Level (1-4) calibrates scoring and signal severity.

    question_type: the type of question that was asked — passed to the signal classifier
      to calibrate it for code card questions (code_trace, snippet_eval, query_trace).

    Returns:
      clarity, depth, specificity, grounding, overall  — quality scores
      action       — PROBE | MOVE_ON | REPHRASE | REDIRECT | ACCEPT_REPHRASE
      signal       — one signal name, never null (fallback: depth_shallow)
      signal_reason — exact quote from their answer that triggered it, or null
      reason       — short phrase for the routing decision
    """
    if is_warmup:
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0, "overall": 0.0,
            "is_warmup": True,
            "action": "MOVE_ON", "forced_action": True,
            "signal": None, "signal_reason": None, "reason": "warmup turn",
        }

    if not candidate_answer or not candidate_answer.strip():
        # Empty answer = pure_denial
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0, "overall": 0.0,
            "action": "PROBE", "forced_action": False,
            "signal": "pure_denial",
            "signal_reason": None, "reason": "empty answer",
        }

    word_count = len(candidate_answer.strip().split())
    recent_context = "\n".join(transcript_lines[-6:]) if transcript_lines else ""

    logger.info(
        "[EVAL] > evaluate_answer (2-call) | model=%s words=%d follow_ups=%d topic=%s level=%d",
        llm_model, word_count, topic_follow_up_count, active_topic or "?", level,
    )

    _common_kwargs = dict(
        candidate_answer=candidate_answer,
        last_question=last_question,
        recent_context=recent_context,
        client=client,
        llm_model=llm_model,
        org_id=org_id or "",
        active_topic=active_topic,
    )

    try:
        # Fire both calls concurrently — scoring and signal classification are independent.
        (scoring_data, _scoring_usage), (raw_signal, signal_reason, self_corrected, _signal_usage) = (
            await asyncio.gather(
                _call_scoring(
                    **_common_kwargs,
                    level=level,
                    topic_follow_up_count=topic_follow_up_count,
                    topic_probe_focus=topic_probe_focus,
                    job_title=job_title,
                ),
                _call_signal_classification(
                    **_common_kwargs,
                    level=level,
                    question_type=question_type,
                    signals_already_fired=signals_already_fired,
                ),
            )
        )

        _eval_llm_usages: list[dict] = [_scoring_usage, _signal_usage]

        data = scoring_data

        def _clamp(v: Any, lo: float = 0.0, hi: float = 10.0) -> float:
            try:
                return max(lo, min(hi, float(v)))
            except (TypeError, ValueError):
                return 0.0

        answers_question = data.get("answers_question", True)
        if answers_question is False:
            logger.info("[EVAL] answers_question=false — forcing all scores to 0")
            clarity = depth = specificity = grounding = overall = 0.0
        else:
            clarity     = _clamp(data.get("clarity", 0))
            depth       = _clamp(data.get("depth", 0))
            specificity = _clamp(data.get("specificity", 0))
            grounding   = _clamp(data.get("grounding", 0))
            overall = (
                clarity * 0.20
                + depth * 0.35
                + specificity * 0.20
                + grounding * 0.25
            )

        signal = str(raw_signal).strip() if raw_signal else None

        action = "PROBE"
        forced_action = False
        zero_scores = False

        # Response-shape signals — short-circuit content scoring
        if signal in RESPONSE_SIGNALS:
            if signal == "clarification_request":
                action, forced_action = "REPHRASE", True
                zero_scores = True
            elif signal == "rephrase_request":
                action, forced_action = "ACCEPT_REPHRASE", True
                zero_scores = True
            elif signal == "off_topic":
                action, forced_action = "REDIRECT", True
                zero_scores = True
        elif signal == "pure_denial":
            # NOT zero_scores. pure_denial means "no attempt was made", which is a
            # real outcome worth 0 on depth -- but forcing ALL four dimensions to
            # 0.0 fed consecutive_zero_scores, which hits is_dry_topic() at 2 and
            # closes the topic. Combined with an over-firing pure_denial classifier
            # that meant one misread answer plus one denial killed a topic before
            # any real question was asked, and every topic reported sat=0.0/5.0
            # because a zeroed turn contributes nothing to saturation either.
            # The scoring call already returns near-zero dimensions for a genuine
            # non-answer; trust it and let a real denial earn its own low score
            # rather than hard-stamping one.
            pass
        elif signal not in CONTENT_SIGNAL_DEFINITIONS and signal is not None:
            logger.warning("[EVAL] unknown signal %r — running fallback classifier", signal)
            signal = None

        # If signal is still None, run fallback classifier
        if signal is None and not zero_scores:
            signal, signal_reason, _fallback_usage = await _classify_signal_from_answer(
                candidate_answer=candidate_answer,
                last_question=last_question,
                client=client,
                llm_model=llm_model,
                level=level,
            )
            if _fallback_usage:
                _eval_llm_usages.append(_fallback_usage)
            logger.info("[EVAL] signal was None — fallback classifier selected %r", signal)

        # Final guard: ensure signal is always set (never null)
        if signal is None:
            signal = "depth_shallow"
            logger.info("[EVAL] signal still None after fallback — using depth_shallow default")

        signal_reason = str(signal_reason or "").strip() or None

        reason = str(data.get("reason", ""))[:120]

        # depth_misconception is WORSE than pure_denial: active wrongness reveals a real misconception
        if signal == "depth_misconception" and answers_question is not False:
            _penalty = 2.0
            clarity = max(0.0, clarity - _penalty)
            depth = max(0.0, depth - _penalty)
            specificity = max(0.0, specificity - _penalty)
            grounding = max(0.0, grounding - _penalty)
            overall = (clarity * 0.20 + depth * 0.35 + specificity * 0.20 + grounding * 0.25)
            reason = f"{signal} — active misconception, scored below a non-attempt"

        # self_corrected: a MODIFIER, not a signal (see SELF_CORRECTION_TRIGGER above).
        # Applies on top of whatever signal fired, so a self-correction into a still-thin
        # answer keeps its thin signal AND gets credit for the catch -- the old
        # recovery_attempted signal could express only one of those two facts.
        if self_corrected and not zero_scores:
            _recovery_boost = 1.5
            clarity = min(10.0, clarity + _recovery_boost)
            depth = min(10.0, depth + _recovery_boost)
            overall = min(10.0, (clarity * 0.20 + depth * 0.35 + specificity * 0.20 + grounding * 0.25))
            reason = f"{reason} — self-correction credited" if reason else "self-correction credited"

        if zero_scores:
            clarity = 0.0
            depth = 0.0
            specificity = 0.0
            grounding = 0.0
            overall = 0.0
            reason = f"{signal} — no scoring"

        logger.info(
            "[EVAL] [OK] signal=%s action=%s | clarity=%d depth=%d spec=%d ground=%d | reason=%s",
            signal, action,
            int(clarity), int(depth), int(specificity), int(grounding),
            repr(reason),
        )
        if signal_reason:
            logger.info("[EVAL] signal_reason=%r", signal_reason)

        return {
            "clarity": clarity, "depth": depth,
            "specificity": specificity, "grounding": grounding,
            "overall": overall,
            "action": action,
            "forced_action": forced_action if action != "PROBE" else False,
            "signal": signal,
            "signal_reason": signal_reason,
            "reason": reason,
            "_llm_usage": _eval_llm_usages,
        }

    except Exception as e:
        logger.error(
            "[EVAL_FALLBACK] evaluate_answer failed: %s: %s | answer=%r",
            type(e).__name__, e, (candidate_answer or "")[:300],
        )
        return {
            "clarity": 2.0, "depth": 1.0, "specificity": 1.0, "grounding": 1.0,
            "overall": 1.3,
            "action": "PROBE",
            "signal": "depth_shallow",
            "signal_reason": f"eval recovery — {type(e).__name__}: {str(e)[:120]}",
            "reason": "eval recovery (llm slow/unavailable)",
            "is_eval_recovery": True,
        }


