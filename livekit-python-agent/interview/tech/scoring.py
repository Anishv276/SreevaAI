"""
interview/tech/scoring.py
Two dedicated LLM calls per turn: one scores the answer, one classifies signals.
Splitting the calls eliminates conjunctive-logic collapse — the scoring call focuses
purely on quality dimensions, and the signal call gets its own reasoning budget
(chain-of-thought allowed) to find every gap in the answer and fire up to 2 signals.

Returns:
  quality scores  : clarity, depth, specificity, grounding, overall
  routing         : action (PROBE/MOVE_ON)
  signal          : the PRIMARY (highest-priority) signal name — drives all existing
                     state machinery (saturation, denial streaks, MOVE_ON) unchanged
  signals         : up to 2 signal names (primary first) — the full holistic finding,
                     handed to probe.py to build one composite follow-up question

10-DIMENSION HOLISTIC RUBRIC — this is the complete signal taxonomy (replaces the old
9-signal set entirely). Modeled on FAANG hiring-manager rubrics (Amazon Leadership
Principles, Google Googliness, Meta): technical AND situational/behavioral gaps are
both first-class signals, because a senior interview is not just correctness-and-depth.

  Response-shape signals (shape of reply, checked first, exactly one, never combined
  with a content signal): clarification_request, rephrase_request, off_topic

  Content signals (10, level-calibrated, up to 2 fire together per turn):
    1. factual_error          — Factual Correctness gap: stated something actively false
    2. shallow_label          — Mechanism & Depth gap: correct label, box never opened
    3. cost_blind             — Trade-offs & Cost gap: mechanism correct, zero cost/alternative named
    4. edge_case_blind        — Edge Cases & Failure Modes gap: no failure/stress-case awareness
    5. ambiguity_unchecked    — Navigating Ambiguity gap: jumped straight to a solution on a vague
                                ask instead of clarifying requirements/constraints first
    6. impact_disconnected    — Business Impact gap: technical choice never tied to a business/user
                                outcome; "did it because it was cool tech"
    7. ownership_diffuse      — Ownership & Scope gap: "we"/passive voice, personal decision invisible
    8. conflict_avoidant      — Conflict & Influence gap: no evidence of pushing back, handling
                                disagreement, or influencing a stakeholder without authority
    9. growth_deflected       — Learnings & Growth gap: discussing a failure/mistake with blame
                                deflected outward and no stated lesson
    10. mastery_demonstrated  — CEILING: mechanism + cost + edge case + ownership + judgment all
                                present; the answer that closes a topic

  Plus two signals that are not "gaps" in the same sense:
    confident_uncertain — right answer, visibly guessed (fluency-bias guard, orthogonal to the
                          10 dimensions above — can combine with any of them)
    pure_denial         — zero attempt, zero content (never combines with anything)

  Self-correction remains a BOOLEAN modifier, not a signal (see SELF_CORRECTION_TRIGGER).
  No null ever: fallback is shallow_label.
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
# 10-DIMENSION HOLISTIC RUBRIC — the complete content-signal set.
#
# Modeled on FAANG hiring-manager rubrics (Amazon Leadership Principles, Google
# Googliness, Meta): a senior interview is not just correctness-and-depth, so
# situational/behavioral gaps are first-class signals alongside technical ones.
#
# Each dimension is a GAP signal (what's MISSING from the answer), except
# mastery_demonstrated (the ceiling, everything present) and confident_uncertain
# (a fluency-bias guard orthogonal to the 10 dimensions). Up to 2 signals fire
# per turn — the classifier finds every real gap, ranks them, and hands the
# top 2 to question generation so ONE follow-up can hit the two sharpest gaps
# at once instead of interrogating dimension-by-dimension like a checklist.
#
# CODE QUESTIONS (code_trace / snippet_eval / query_trace): only the four Part 1
# (Hard Technical) signals are reachable — factual_error, shallow_label,
# cost_blind, edge_case_blind. A trace/bug-find answer has no "business impact"
# or "ownership" to speak of; forcing those dimensions onto a code snippet
# produces a nonsensical gap. See _build_content_signal_prompt_block.
# ---------------------------------------------------------------------------
CONTENT_SIGNAL_DEFINITIONS: dict[str, dict] = {

    # -------------------------------------------------------------------------
    # CEILING — fires when the answer is essentially complete across the board.
    # -------------------------------------------------------------------------
    "mastery_demonstrated": {
        "dimension": "Ceiling — all dimensions present",
        "trigger": (
            "CORRECT + APPLIED + OWNED. The answer contains, independently: (1) the MECHANISM — how "
            "the thing actually works, not just what it does; (2) the COST — a real tradeoff or "
            "constraint; (3) an EDGE CASE or failure mode, named unprompted; (4) JUDGMENT — a stated "
            "position on when to use it vs. an alternative; AND (5) if the answer describes real work, "
            "personal ownership is visible ('I decided', 'I built', 'my call was'), not just 'we'. "
            "Survives a 'what breaks this?' push because the failure mode is already named."
        ),
        "pattern": (
            "Reserve strictly. This is the answer that stops the follow-up because there is nothing "
            "left to ask. A practitioner's answer, not a textbook one."
        ),
        "examples": [
            "DB indexing: 'A B-tree keeps keys sorted so range scans walk leaf nodes — that's why "
            "BETWEEN is fast. But on a low-cardinality boolean column the planner ignores the index "
            "and does a seq scan anyway because selectivity is too low. I chose to only add it as the "
            "trailing column of a composite where the leading column is selective — that was my call "
            "after we hit exactly this on the orders table.'",
            "Caching (grounded route): '50k reads/sec on our catalog, Redis TTL=30s. On expiry we "
            "hit stampede — every miss slammed Postgres at once. I fixed it with probabilistic early "
            "expiration. Traded staler reads for not taking the DB down.'",
        ],
        "not_this": (
            "NOT this if mechanism/cost/edge-case/judgment is missing — score the specific gap "
            "instead (shallow_label / cost_blind / edge_case_blind). NOT this if any claim is false "
            "→ factual_error. NOT this if right but visibly guessed → confident_uncertain. NOT this "
            "if ownership is still diffuse on real described work → ownership_diffuse."
        ),
    },

    # -------------------------------------------------------------------------
    # 1. FACTUAL CORRECTNESS — a specific false claim was stated.
    # -------------------------------------------------------------------------
    "factual_error": {
        "dimension": "1. Factual Correctness",
        "trigger": (
            "INCORRECT CLAIM, STATED AS FACT. Any affirmatively false technical claim: a wrong "
            "mechanism, an inversion, a swapped property, or a wrong syntax/name for a construct. "
            "For code/query questions: states a WRONG output value, wrong bug diagnosis, or wrong "
            "description of what a query returns. It does NOT need to be delivered confidently — "
            "a hesitant wrong claim ('umm, we create a list using def?') is still a wrong claim. "
            "What matters is that a specific stated thing is FALSE, not how sure they sounded. "
            "COMMON CASE: do not shy away from this signal and default to shallow_label just "
            "because the answer was short."
        ),
        "pattern": (
            "The single most important signal to classify correctly. A wrong answer must score "
            "BELOW a hesitant right one and BELOW a flat 'I don't know'. Silence is a gap; a "
            "wrong claim is active confusion that would ship a bug. The probe: do NOT correct "
            "them. Ask a Socratic question that only makes sense IF their wrong claim were true, "
            "forcing them to discover the contradiction themselves."
        ),
        "examples": [
            "Hash maps: 'Hash maps keep everything in sorted order.' (false — that is a BST)",
            "Generators: 'Generators run in a separate thread.' (false — same thread, suspended "
            "frame at yield)",
            "Python: 'We create a list using def.' (false — that is a function definition)",
            "SQL: 'LEFT JOIN is faster than INNER because it returns fewer rows.' (false on both "
            "counts)",
            "Code trace: candidate says output is '5' when the actual output is '4'",
            "Snippet eval: candidate identifies the wrong line as the bug",
        ],
        "not_this": (
            "NOT this if the answer is merely thin or vague but nothing in it is actually WRONG "
            "→ shallow_label. NOT this if it is mostly right with a missing piece → a different "
            "gap signal. NOT this if it is a complete non-attempt with no claim at all → "
            "pure_denial. Fires whenever a specific stated claim is FALSE."
        ),
    },

    # -------------------------------------------------------------------------
    # 2. MECHANISM & DEPTH — correct label, hollow internals.
    # -------------------------------------------------------------------------
    "shallow_label": {
        "dimension": "2. Mechanism & Depth",
        "trigger": (
            "CORRECT LABEL, NO MECHANISM. Names the right concept or restates its effect but "
            "cannot open the box: no internal steps, no data flow, no trace, no HOW. This is "
            "exactly what a memorized label produces: right word, hollow underneath. The "
            "memorization test: would NOT survive 'trace it for this concrete input'. A correct "
            "one-word answer like 'O(log n)' without any explanation of why is shallow_label. "
            "For code/query questions: states the right output label but cannot explain why the "
            "code produces it."
        ),
        "pattern": (
            "The most common real-interview failure mode. Correct at the surface, empty below "
            "it. The probe is ALWAYS to open the box: 'walk me through what happens step by "
            "step for this one specific input' — that question cannot be answered by reciting "
            "the label."
        ),
        "examples": [
            "Hash maps: 'It makes lookups fast, that's the whole point.'",
            "Generators: 'They're memory efficient and lazy.'",
            "An index: 'It speeds up the query.'",
            "Code trace: 'It prints 3.' — correct output, zero explanation of how the recursion "
            "or closure arrived there.",
        ],
        "not_this": (
            "NOT this if any real mechanism is traced, even partially → score on the specific "
            "remaining gap instead. NOT this if the claim is actively WRONG → factual_error. NOT "
            "this if it is a generic best-practice checklist → impact_disconnected. NOT this if "
            "it is a flat non-attempt with no content → pure_denial. shallow_label is NARROW — a "
            "correct label with truly nothing underneath it. Do not use it as a catch-all."
        ),
    },

    # -------------------------------------------------------------------------
    # 3. TRADE-OFFS & COST — the sharpest junior/senior discriminator.
    # -------------------------------------------------------------------------
    "cost_blind": {
        "dimension": "3. Trade-offs & Cost",
        "trigger": (
            "CORRECT MECHANISM, ZERO COST AWARENESS. The candidate explains the mechanism "
            "accurately — they are not guessing — but presents their approach as having no "
            "downside, no alternative worth comparing, and no case where it would be the wrong "
            "call. Pushing on 'what's the downside?' produces another benefit list, not a cost. "
            "The mechanism must be present and correct for this to fire. A hollow answer that "
            "also names no cost is shallow_label, not this."
        ),
        "pattern": (
            "The single sharpest junior/senior discriminator. Juniors learn what a tool DOES; "
            "seniors learn what it COSTS and when not to reach for it. The probe for this signal "
            "is ALWAYS a forced choice under a specific constraint — never 'what are the tradeoffs?'"
        ),
        "examples": [
            "Indexing: 'Indexes make queries fast, so I'd add one on every column we filter by.' "
            "— correct that indexes speed reads, zero awareness of write amplification, storage "
            "cost, or planner selectivity behavior.",
            "Caching: 'Redis in front of the DB solves the latency.' — no mention of "
            "invalidation, staleness, cold-cache behavior, or memory pressure.",
            "Microservices: accurately describes service isolation and independent deploys, names "
            "no cost — not latency, not distributed transactions, not operational overhead.",
        ],
        "not_this": (
            "NOT this if they name a cost or alternative, even briefly → not this signal. NOT "
            "this if the mechanism itself is absent or hollow → shallow_label. NOT this if any "
            "claim is wrong → factual_error. NOT this if it is an ungrounded best-practice "
            "checklist → impact_disconnected."
        ),
    },

    # -------------------------------------------------------------------------
    # 4. EDGE CASES & FAILURE MODES — mechanism correct, breakage never considered.
    # -------------------------------------------------------------------------
    "edge_case_blind": {
        "dimension": "4. Edge Cases & Failure Modes",
        "trigger": (
            "CORRECT MECHANISM, ZERO FAILURE-MODE AWARENESS. The candidate traces or explains the "
            "happy path correctly but never considers how it breaks: no mention of scale limits, "
            "concurrent access, empty/null/boundary input, partial failure, or what happens under "
            "load or stress. This is distinct from cost_blind — cost_blind is about willingly-paid "
            "downsides (memory, latency, complexity); edge_case_blind is about the system BREAKING "
            "outright at some boundary the candidate never considered."
        ),
        "pattern": (
            "Fires often on system-design and code-trace answers alike. The probe is always to "
            "hand them a specific boundary condition and ask what happens: 'what happens when "
            "[N] hits zero / the queue is full / two requests land at the same time?'"
        ),
        "examples": [
            "Rate limiter: 'It counts requests in a window and blocks over the limit.' — correct "
            "mechanism, no mention of what happens at the window boundary or under a burst.",
            "Code trace: correctly traces the happy path but the function has an off-by-one at "
            "an empty list and the candidate never considers that input.",
            "Queue-based design: describes the queue correctly, never mentions what happens if "
            "the consumer dies mid-processing or the queue itself fills up.",
        ],
        "not_this": (
            "NOT this if the missing gap is specifically the COST/tradeoff, not a failure mode "
            "→ cost_blind. NOT this if the mechanism itself is hollow → shallow_label. NOT this "
            "if they DO name a failure mode, even one → not this signal, credit it."
        ),
    },

    # -------------------------------------------------------------------------
    # 5. NAVIGATING AMBIGUITY — jumped to a solution without clarifying.
    # -------------------------------------------------------------------------
    "ambiguity_unchecked": {
        "dimension": "5. Navigating Ambiguity",
        "trigger": (
            "JUMPED STRAIGHT TO A SOLUTION ON A VAGUE ASK. The question or scenario had a genuinely "
            "underspecified requirement (scale unstated, 'real-time' undefined, consistency needs "
            "unclear, whose problem this actually solves is unclear) and the candidate designed or "
            "answered immediately without naming the ambiguity, asking a clarifying question, or "
            "stating the assumption they're making. Only applies to open-ended/scenario/design "
            "questions — never fires on a closed factual or code-trace question, which has no "
            "ambiguity to navigate."
        ),
        "pattern": (
            "A senior/staff discriminator: junior engineers solve the stated problem; senior "
            "engineers interrogate whether it's the right problem first. The probe: hand them the "
            "missing constraint explicitly and ask whether it changes their answer."
        ),
        "examples": [
            "'We decided to use Kafka because the PM wanted real-time analytics.' — no push-back "
            "on what 'real-time' actually needs to mean, no stated assumption about latency/volume.",
            "Given 'design a notification system' with no scale or channel given, launches straight "
            "into an architecture without stating what assumption they're proceeding under.",
        ],
        "not_this": (
            "NOT this if the candidate DID state an assumption or ask what the constraint was, even "
            "briefly ('assuming this is for order confirmations, not spam-level ephemeral events...') "
            "→ credit it, don't fire this. NOT this on a closed, unambiguous factual or code question "
            "— there is nothing to navigate there."
        ),
    },

    # -------------------------------------------------------------------------
    # 6. BUSINESS IMPACT — technical choice never tied to an outcome.
    # -------------------------------------------------------------------------
    "impact_disconnected": {
        "dimension": "6. Business Impact",
        "trigger": (
            "PLAUSIBLE BUT UNGROUNDED IN OUTCOME. A memorized best-practice checklist or a technical "
            "choice justified only by 'it's the modern/scalable/right way to do it' — with zero "
            "connection to a business outcome, user impact, cost, or the actual problem being solved. "
            "Someone who never did the work could say the exact same thing. 'I'd check logs, look "
            "at metrics, optimize based on findings' fits every performance question ever asked and "
            "never lands on WHY it mattered to anyone."
        ),
        "pattern": (
            "The prepared-candidate failure mode: fluent frameworks or 'cool tech' justification, no "
            "tie to a real outcome. The probe is ALWAYS to force the connection: 'what did that "
            "actually change for the user/business, in a number or a concrete outcome?'"
        ),
        "examples": [
            "Slow query: 'I'd check the logs, look at metrics, monitor performance, and optimize "
            "based on findings.' — no mention of what the slowness was costing anyone.",
            "'We moved to microservices because it's more scalable and modern.' — no stated business "
            "reason (which outcome needed which scale), just the appeal of the technology itself.",
        ],
        "not_this": (
            "NOT this if there is a real reason tied to an outcome, even a small one → not this "
            "signal. NOT this if it is a hollow one-word label rather than a checklist → "
            "shallow_label. NOT this if it is grounded in a specific real instance with a stated "
            "result → mastery_demonstrated or ownership_diffuse."
        ),
    },

    # -------------------------------------------------------------------------
    # 7. OWNERSHIP & SCOPE — real work, invisible personal contribution.
    # -------------------------------------------------------------------------
    "ownership_diffuse": {
        "dimension": "7. Ownership & Scope",
        "trigger": (
            "REAL WORK, INVISIBLE OWNERSHIP. The candidate describes a specific, credible instance "
            "— a real system, a real migration, a real incident — but their personal contribution is "
            "collectively described, passive, or unstated. Markers: 'we decided', 'the team moved "
            "to', 'it was migrated', 'the PM wanted'. The work is real; the candidate's individual "
            "scope and decision inside it is not yet visible. This signal reads ONLY the ownership "
            "language — it never infers that 'we' means they didn't do it."
        ),
        "pattern": (
            "A PROBE TARGET, NOT A DEDUCTION. This is the most common shape of a TRUE answer because "
            "most real engineering is collective. It is not evasion. It fires so the next question "
            "can locate their specific call — 'which part was yours, what did YOU personally decide.'"
        ),
        "examples": [
            "'We moved off the monolith and split out the payments service, choosing gRPC for "
            "the internal calls.' — real migration, real decision, zero indication of this person's "
            "specific part.",
            "'The team was seeing timeouts under load so it was rearchitected with a queue.' "
            "— passive voice throughout, no actor named.",
        ],
        "not_this": (
            "NOT this if their personal decision or action IS identified ('I benchmarked both and "
            "picked gRPC because...') → score on depth alone. NOT this if there is no real instance, "
            "just a hypothetical → impact_disconnected. NOT this if the described work is vague "
            "rather than specific → shallow_label."
        ),
    },

    # -------------------------------------------------------------------------
    # 8. CONFLICT & INFLUENCE — no evidence of navigating disagreement.
    # -------------------------------------------------------------------------
    "conflict_avoidant": {
        "dimension": "8. Conflict & Influence",
        "trigger": (
            "A DISAGREEMENT OR CROSS-TEAM ASK IS IMPLIED, BUT NEVER ADDRESSED. The scenario clearly "
            "involves a stakeholder with a different priority (a PM pushing for a deadline, another "
            "team wanting a different approach, a technical limit someone else doesn't want to "
            "accept) but the candidate's answer skips straight past the friction — describes what was "
            "built with no account of how the disagreement was handled, whether they pushed back, or "
            "how they got buy-in without formal authority over the other party."
        ),
        "pattern": (
            "Only applies when the scenario or the candidate's own answer surfaces a real "
            "disagreement or cross-functional ask — never manufactured on a pure mechanism question. "
            "The probe: name the friction explicitly and ask how they actually handled it."
        ),
        "examples": [
            "'The PM wanted real-time analytics so we used Kafka.' — a stakeholder ask is stated, "
            "but there's zero account of whether the candidate pushed back, negotiated scope, or "
            "just executed the ask as given.",
            "'Another team wanted us to use their internal library but it didn't fit our latency "
            "needs, so we used it anyway.' — a real conflict named, but no resolution or influence "
            "described.",
        ],
        "not_this": (
            "NOT this if the answer already describes how they pushed back, negotiated, or "
            "influenced the other party, even briefly → credit it, don't fire this. NOT this on a "
            "question with no stakeholder or disagreement implied at all — do not manufacture a gap."
        ),
    },

    # -------------------------------------------------------------------------
    # 9. LEARNINGS & GROWTH — blame deflected, no stated lesson.
    # -------------------------------------------------------------------------
    "growth_deflected": {
        "dimension": "9. Learnings & Growth",
        "trigger": (
            "DISCUSSING A FAILURE OR MISTAKE, BLAME DEFLECTED OUTWARD, NO STATED LESSON. The "
            "candidate is describing something that went wrong (a bug that shipped, a bad estimate, "
            "an incident, a wrong call) and either blames external factors exclusively ('the "
            "requirements changed on us', 'the other team's code was bad') with no self-accountable "
            "framing, or states what happened with no reflection on what they would do differently or "
            "what they learned."
        ),
        "pattern": (
            "Only applies when the answer is actually ABOUT a failure/mistake — never manufactured "
            "on a success story. The probe: ask directly what they would do differently now, or what "
            "changed in how they work because of it."
        ),
        "examples": [
            "'The outage happened because the on-call before me left bad documentation.' — a real "
            "incident, blame placed entirely elsewhere, no stated personal takeaway.",
            "'We shipped a bug because QA missed it.' — no mention of what the candidate personally "
            "changed afterward (a test they now write, a review habit, anything).",
        ],
        "not_this": (
            "NOT this if the candidate already owns their part and states a concrete lesson, even a "
            "small one ('I should have added a canary check — I do that by default now') → credit "
            "it, don't fire this. NOT this if the answer isn't about a failure at all."
        ),
    },

    # -------------------------------------------------------------------------
    # FLUENCY BIAS GUARD — correct but clearly guessed. Orthogonal to the 10-D grid.
    # -------------------------------------------------------------------------
    "confident_uncertain": {
        "dimension": "Fluency-bias guard (orthogonal)",
        "trigger": (
            "RIGHT ANSWER, VISIBLY GUESSED. The technical content is correct, but the delivery "
            "shows the candidate does not actually know it: hedging stacked on hedging ('I "
            "think... maybe... probably... not sure but...'), an upward questioning intonation on "
            "the fact itself, offering a contradictory alternative immediately after ('or maybe "
            "it's the other way'), or explicitly flagging a guess ('I'm not sure but I'll say "
            "O(log n)?'). The answer must be CORRECT for this to fire. A hedged wrong answer "
            "is factual_error."
        ),
        "pattern": (
            "Grading FLUENCY instead of SUBSTANCE is the best-documented failure in interview "
            "scoring, and it runs in both directions. factual_error guards the confident-and-wrong "
            "direction; this guards the hesitant-but-right direction. The probe: re-ask the SAME "
            "fact from a different angle. A guess flips. Real knowledge holds."
        ),
        "examples": [
            "'I think it's... maybe O(log n)? Could be O(n), I'm not really sure.' — the right "
            "answer is in there, stated as a coin flip.",
            "'Probably because the index isn't selective enough? Something like that anyway.' "
            "— correct reasoning, offered as a question to the interviewer.",
        ],
        "not_this": (
            "NOT this for ordinary mild hedging around a confidently-held answer ('I'd say "
            "O(log n) because the tree is balanced') → grade on depth normally; a single 'I "
            "think' is not uncertainty. NOT this if the answer is actually WRONG → "
            "factual_error, regardless of how hedged. NOT this if they hedge and never "
            "land on anything → shallow_label or pure_denial."
        ),
    },

    # -------------------------------------------------------------------------
    # NON-ATTEMPT — never combines with anything else.
    # -------------------------------------------------------------------------
    "pure_denial": {
        "dimension": "Non-attempt",
        "trigger": (
            "ZERO attempt AND ZERO content. Apply this MECHANICAL TEST before selecting it, and "
            "select it ONLY if the answer fails the test:\n"
            "  STEP 1 — Strip every denial/hedge phrase from the answer ('I don't know', 'not sure', "
            "'I forgot', 'I haven't used it', 'maybe', 'I think', 'actually', 'sure', 'okay').\n"
            "  STEP 2 — Look at what TEXT REMAINS. Does anything remain that names a technical term, a "
            "concept, a tool, a language, a comparison, or any claim at all — however wrong, garbled, "
            "partial, or off-target?\n"
            "  STEP 3 — If ANYTHING remains: this is NOT pure_denial. Classify it on that remaining "
            "content instead (wrong claim → factual_error, hollow label → shallow_label, unrelated "
            "subject → off_topic). If NOTHING remains: pure_denial.\n"
            "This is a test on CONTENT, never on tone, length, confidence, or transcription quality. A "
            "one-word answer that names a real concept PASSES the test and is not a denial. A rambling "
            "answer that names nothing FAILS it and is."
        ),
        "pattern": "Distinct from every other signal, which all have SOME attempt. Honest and worth acknowledging cleanly — a calibrated 'I don't know' is more useful than a confident wrong guess, and must never score below factual_error. The bar is: after this sentence, do we know ANYTHING about what they think the answer might be? If yes, it is NOT pure_denial, however hedged or unsure it sounds.",
        "examples": ["I don't know.", "Not sure.", "No idea.", "I haven't worked with that.", "[silence]"],
        "not_this": (
            "NOT this if there's ANY attempt, even wrong, hollow, hedged, or trailing off mid-thought. "
            "A wrong attempt → factual_error. A hollow-label attempt → shallow_label. "
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
            "is content. Wrong-but-stated → factual_error. Vague-but-stated → shallow_label. "
            "Unrelated subject entirely → off_topic. Never pure_denial.\n"
            "  (c) A CONVERSATIONAL ACKNOWLEDGEMENT THAT IS NOT AN ANSWER YET. 'Sure.', 'Okay.', 'Yeah.' "
            "— the candidate is agreeing to answer, not declining to. They have not denied anything. "
            "This is a non-answer to be re-prompted, NOT a denial to be scored — use clarification_request "
            "so the interviewer simply asks again rather than treating it as a knowledge gap.\n"
            "  (d) A VAGUE ATTEMPT USING NON-TECHNICAL WORDS. 'we use different variables', 'it's more "
            "on the setup side' — an attempt to describe a mechanism in lay terms. That is exactly what "
            "shallow_label exists for. A candidate reaching for plain language is still reaching."
        ),
    },

}

# Signals evaluated on CODE questions (code_trace / snippet_eval / query_trace).
# Only the four Part-1 Hard Technical dimensions make sense against a fabricated
# code/query snippet -- there is no "business impact" or "ownership" in tracing
# a bug. pure_denial and confident_uncertain remain reachable everywhere.
CODE_QUESTION_SIGNALS: frozenset[str] = frozenset({
    "factual_error", "shallow_label", "cost_blind", "edge_case_blind",
    "mastery_demonstrated", "confident_uncertain", "pure_denial",
})

# Signals never allowed to co-fire as the secondary pick alongside another signal
# (each is a self-contained verdict, not a gap that composes with a second gap).
_NON_COMBINING_SIGNALS: frozenset[str] = frozenset({
    "pure_denial", "mastery_demonstrated",
})

# Max content signals returned per turn -- the composite question-generation
# directive is built to weave at most 2 gaps into one natural follow-up; a third
# turns the follow-up into a checklist interrogation instead of one sharp question.
MAX_SIGNALS_PER_TURN: int = 2

# Self-correction is NOT a signal -- it is a MODIFIER on whatever signal(s) fired.
#
# As a boolean it composes with every signal instead of competing with them:
# self_corrected + shallow_label, self_corrected + cost_blind are both expressible,
# and the probe reads the flag for its opening beat while the signal(s) still
# drive the question.
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
    """10-Dimension Holistic Rubric signal detection -- CHAIN OF THOUGHT, MULTI-SIGNAL.

    Unlike a single-pick enum, this asks the classifier to walk ALL applicable
    dimensions, silently note EVERY real gap it finds, then return the TOP
    {MAX_SIGNALS_PER_TURN} ranked by how much each would change the next question --
    never more, so question generation gets a sharp composite instead of a checklist.

    Level (1-4) calibrates how seriously each gap is WEIGHTED. It never changes WHICH
    signal fires: a wrong claim is factual_error at every level. Only the severity of
    that finding moves.

    question_type: on a code question (code_trace / snippet_eval / query_trace) only
    the four Hard Technical dimensions are reachable -- see CODE_QUESTION_SIGNALS.
    A code-trace/bug-find answer has no "business impact" or "ownership" to probe.
    """
    _level_context = {
        1: (
            "LEVEL 1 (junior/entry): a mechanism trace with one real detail is a STRONG positive — "
            "do not withhold credit waiting for mastery_demonstrated. shallow_label is a real gap "
            "but not a red flag. cost_blind and edge_case_blind are EXPECTED and near-costless at "
            "this level: juniors have not yet been burned by production. ambiguity_unchecked, "
            "conflict_avoidant, and growth_deflected are NOT worth firing at this level unless "
            "glaring — juniors are not expected to navigate stakeholder friction yet. "
            "ownership_diffuse is expected; juniors genuinely own small slices of collective work."
        ),
        2: (
            "LEVEL 2 (mid-level): a real mechanism trace is the expected FLOOR. shallow_label signals "
            "a real knowledge gap worth probing. cost_blind is a MILD negative — by mid-level they "
            "should have hit at least one downside in production. edge_case_blind is worth one probe. "
            "ambiguity_unchecked and conflict_avoidant only fire if the scenario clearly called for "
            "it. ownership_diffuse is worth one probe but not a mark against them."
        ),
        3: (
            "LEVEL 3 (senior): mastery_demonstrated is the target and a full mechanism trace is the "
            "floor. shallow_label is a SIGNIFICANT gap. cost_blind is a SERIOUS negative — cost "
            "awareness is the core of the senior role. edge_case_blind matters — seniors are expected "
            "to think about failure. ambiguity_unchecked is a real discriminator here: a senior who "
            "solves the stated problem without questioning it is a flag. ownership_diffuse and "
            "conflict_avoidant both matter: a senior who cannot name their own call, or cannot "
            "describe navigating a disagreement, has not demonstrated seniority — probe and weight "
            "heavily. growth_deflected on a failure story is a real flag at this level."
        ),
        4: (
            "LEVEL 4 (principal/staff): mastery_demonstrated is the BASELINE, not the ceiling. "
            "shallow_label is a red flag. cost_blind is close to DISQUALIFYING on a core skill. "
            "edge_case_blind is a major flag — staff-level design is precisely about anticipating "
            "breakage others miss. ambiguity_unchecked is a MAJOR flag: the entire job at this level "
            "is deciding what problem is worth solving before solving it. impact_disconnected is a "
            "flag — staff work is judged by outcome, not by how interesting the tech was. "
            "ownership_diffuse and conflict_avoidant are major flags: staff-level impact and "
            "cross-team influence ARE the job, and inability to name either is itself the finding. "
            "growth_deflected on any failure story is a serious red flag at this level."
        ),
    }.get(level, "Grade for genuine understanding at the expected level.")

    # Code-question gate: only Hard Technical dimensions are reachable.
    _qt = (question_type or "").strip().lower()
    _is_code_question = _qt in ("code_trace", "snippet_eval", "query_trace")
    _code_q_note = ""
    if _is_code_question:
        if _qt == "code_trace":
            _code_q_note = (
                "\nCODE TRACE QUESTION: The candidate read a code snippet and answered verbally. Only "
                "factual_error / shallow_label / cost_blind / edge_case_blind / mastery_demonstrated / "
                "confident_uncertain / pure_denial are reachable -- there is no ambiguity, business "
                "impact, ownership, conflict, or growth dimension in tracing a fabricated snippet.\n"
                "  shallow_label: stated the correct output/behavior but gave NO explanation of why the "
                "code produces it (no trace of execution, no naming of the rule or mechanism).\n"
                "  edge_case_blind: traced the stated case correctly but the snippet has an obvious "
                "boundary (empty input, zero, off-by-one) they never considered unprompted.\n"
                "  mastery_demonstrated: correct output + full trace of execution + names the edge case "
                "or boundary behavior without being asked.\n"
                "  factual_error: stated the WRONG output value, or wrong diagnosis of why it behaves "
                "that way (e.g. said 'it prints 5' when it prints 4).\n"
                "  pure_denial: said 'I don't know' or 'I can't read this' with no attempt.\n"
            )
        elif _qt == "snippet_eval":
            _code_q_note = (
                "\nSNIPPET EVAL QUESTION: The candidate read a code snippet with a bug and answered "
                "verbally. Only the four Hard Technical signals + confident_uncertain/pure_denial "
                "are reachable.\n"
                "  shallow_label: said 'something is wrong' or named a vague area but could not "
                "identify the specific bug or the condition that triggers it.\n"
                "  edge_case_blind: correctly identified the bug's symptom but not the specific "
                "boundary/input condition that triggers it.\n"
                "  mastery_demonstrated: correctly identified the bug, the trigger condition, AND "
                "explained why the code fails (the language rule or logic gap being violated).\n"
                "  factual_error: identified a bug that does NOT exist, or misidentified the wrong "
                "line/function as the source of the bug.\n"
                "  pure_denial: said 'I can't find it' or 'I don't know' with no attempt.\n"
            )
        elif _qt == "query_trace":
            _code_q_note = (
                "\nQUERY TRACE QUESTION: The candidate read a SQL/data query and answered verbally. "
                "Only the four Hard Technical signals + confident_uncertain/pure_denial are reachable.\n"
                "  shallow_label: stated a correct general answer ('it returns users') but did not "
                "trace the JOIN/WHERE/GROUP behavior or the specific case asked about.\n"
                "  edge_case_blind: described the query's normal behavior correctly but missed the "
                "specific edge case being asked about (NULLs, empty join side, dropped groups).\n"
                "  mastery_demonstrated: correct result + full trace of the query plan + identifies "
                "a performance trap or edge case (e.g. missing index, unexpected NULL, dropped rows).\n"
                "  factual_error: said the query returns a wrong result, or described the JOIN/WHERE "
                "behavior incorrectly.\n"
                "  pure_denial: said 'I don't know SQL' or 'I can't read this' with no attempt.\n"
            )

    _reachable = CODE_QUESTION_SIGNALS if _is_code_question else frozenset(CONTENT_SIGNAL_DEFINITIONS)
    _gate_lines = []
    for name, defn in CONTENT_SIGNAL_DEFINITIONS.items():
        if name not in _reachable:
            continue
        _gate_lines.append(
            f"  \"{name}\" [{defn['dimension']}]: {defn['trigger']}\n"
            f"    Pattern: {defn['pattern']}\n"
            f"    Example: {defn['examples'][0]}\n"
            f"    {defn['not_this']}"
        )
    _gates_block = "\n\n".join(_gate_lines)
    _reachable_list = ", ".join(n for n in CONTENT_SIGNAL_DEFINITIONS if n in _reachable)

    return f"""\
---- CONTENT SIGNALS — 10-DIMENSION HOLISTIC RUBRIC, MULTI-SIGNAL (up to {MAX_SIGNALS_PER_TURN}) ----

{_level_context}
{_code_q_note}
REACHABLE SIGNALS THIS TURN: {_reachable_list}

--- CHAIN OF THOUGHT — WALK EVERY REACHABLE DIMENSION BEFORE PICKING ---
Do not pattern-match to the first plausible signal. Silently check the answer against
EACH reachable dimension below, in order, and note whether it is a GAP, present, or
not applicable to this question:
  1. Factual Correctness — is any specific stated claim actually FALSE?
  2. Mechanism & Depth — did they open the box, or just name the label?
  3. Trade-offs & Cost — mechanism present: did they name a real cost or alternative?
  4. Edge Cases & Failure Modes — did they consider how this breaks, unprompted?
  5. Navigating Ambiguity — if the ask was vague, did they clarify or state an assumption?
  6. Business Impact — is the choice tied to a real outcome, or just "the modern way"?
  7. Ownership & Scope — if real work is described, is THEIR personal call visible?
  8. Conflict & Influence — if a stakeholder disagreement is implied, how did they handle it?
  9. Learnings & Growth — if discussing a failure, did they own it and state a lesson?
  10. (ceiling) — if NONE of the above are gaps, this is mastery_demonstrated.

Then apply PRIORITY ORDER to pick the final signal(s):
  0. Zero attempt, zero content → pure_denial ALONE (apply the mechanical test). Never
     combines with anything else.
  1. Any claim affirmatively FALSE → factual_error is always the PRIMARY signal, however
     fluent the delivery. Confident-and-wrong scores BELOW hesitant-and-right and BELOW
     "I don't know". May combine with a SECOND, different-dimension gap if a completely
     separate one is also clearly present (e.g. factual_error + ownership_diffuse).
  2. Correct answer, visibly guessed → confident_uncertain. May combine with a real
     content gap found alongside it (e.g. confident_uncertain + shallow_label).
  3. No claim is wrong and no gap survives scrutiny across ALL reachable dimensions →
     mastery_demonstrated ALONE.
  4. Otherwise: rank every GAP found by dimension order above (Hard Technical gaps
     generally outrank Situational/Behavioral ones on a technical question, but a
     glaring Ownership or Ambiguity gap on a scenario question can outrank a minor
     Edge Case gap — use judgment on what actually deserves the next question).
     Return the TOP {MAX_SIGNALS_PER_TURN} distinct-dimension gaps, primary first.
     NEVER return two signals from the same dimension.

{_gates_block}

MULTI-SIGNAL RULES:
- Return AT MOST {MAX_SIGNALS_PER_TURN} signals, primary first. One is completely valid
  when only one real gap exists — never pad to 2 with a manufactured second finding.
- The two signals, if two, MUST be from two DIFFERENT dimensions (never factual_error
  twice, never two flavors of the same gap).
- pure_denial and mastery_demonstrated NEVER combine with a second signal — they are
  each a complete verdict on their own.
- Rank by what would produce the SHARPEST single follow-up question, not by raw count
  of gaps found — a question that tries to hit 2 unrelated dimensions at once must
  still read as ONE natural question, not an interrogation checklist.

ANTI-LOOP RULE: If the same PRIMARY signal has already fired TWICE on this topic, do
NOT pick it a third time without re-reading the answer specifically hunting for a
dimension you may have skipped over. Three identical primary signals in a row usually
means the classifier stopped reading, not that the candidate stopped improving.

CRITICAL ORDERING RULES:
1. CORRECTNESS DOMINATES. A wrong claim is factual_error however fluent — it must
   never be scored as a lesser gap just because it was articulate.
2. LABEL â‰  UNDERSTANDING. A correct label with no mechanism traced is shallow_label.
   Do not credit the keyword — credit only the substance under it.
3. ownership_diffuse fires on a SPECIFIC real instance with invisible ownership. It is
   a PROBE TARGET, not a deduction. A 'we' is never evidence they didn't do it.
4. cost_blind requires the mechanism to be PRESENT — it is the COST that's missing.
   A hollow answer that also names no cost is shallow_label, not cost_blind.
5. confident_uncertain: the answer must be CORRECT. A hedged WRONG answer is
   factual_error; a hedge that never lands on anything is shallow_label.
6. pure_denial is ONLY for a complete non-attempt. ANY attempt — even wrong — is a
   different signal. Apply the mechanical test before picking it.
7. ambiguity_unchecked / conflict_avoidant / growth_deflected only fire when the
   scenario or the candidate's own answer actually surfaces that situation — never
   manufacture a behavioral gap on a pure mechanism/definition question.

FALLBACK RULE (no null ever, but do NOT use as a shortcut): Before landing on
shallow_label as the primary signal, re-walk the reachable dimensions explicitly:
  - Is any specific claim FALSE? → factual_error.
  - Is there a real mechanism trace, even one step? → not shallow_label.
  - Is it a fluent checklist with no claim tied to THIS question? → impact_disconnected.
  - Is it a specific real instance with collective ownership? → ownership_diffuse.
  - Is it a complete non-attempt with nothing said? → pure_denial.
shallow_label is NARROW — a correct label with truly nothing underneath it — not a
default resting place. Reaching it requires ruling out the alternatives above.\
"""


async def _classify_signal_from_answer(
    *,
    candidate_answer: str,
    last_question: str,
    client: Any,
    llm_model: str,
    level: int = 2,
    question_type: str = "",
) -> tuple[list[str], str | None, dict | None]:
    """
    Fallback: compare the answer against the 10-Dimension Holistic Rubric.
    Used only when the primary signal call returned nothing parseable, so it does
    not decide self_corrected -- that modifier defaults to False on this path.
    Called only when the main eval LLM failed to return valid signals.
    Fallback signals list is always ["shallow_label"] (never empty).
    """
    _qt = (question_type or "").strip().lower()
    _reachable = CODE_QUESTION_SIGNALS if _qt in ("code_trace", "snippet_eval", "query_trace") else frozenset(CONTENT_SIGNAL_DEFINITIONS)
    _candidates = [n for n in CONTENT_SIGNAL_DEFINITIONS if n in _reachable]
    _signal_descriptions = "\n".join(
        f'"{name}" [{CONTENT_SIGNAL_DEFINITIONS[name]["dimension"]}]: {CONTENT_SIGNAL_DEFINITIONS[name]["trigger"]}'
        for name in _candidates
    )
    _system = (
        "You are a signal classifier for a technical interview evaluation system using a "
        "10-Dimension Holistic Rubric.\n"
        "Given the question and the candidate's answer, pick up to 2 signals from the list below "
        "(primary first) that best describe the real gap(s) in this specific answer.\n\n"
        f"SIGNALS:\n{_signal_descriptions}\n\n"
        'Output ONLY valid JSON: {"signals": ["<signal_name>", "<signal_name optional>"], '
        '"signal_reason": "<3-12 word exact quote from their answer>"}\n'
        f"Every entry in signals MUST be exactly one of the names listed above, from DIFFERENT "
        f"dimensions, max {MAX_SIGNALS_PER_TURN}. Never empty — but do not default to shallow_label "
        "out of uncertainty. Rule out a wrong claim (factual_error), a real mechanism trace, a "
        "generic checklist (impact_disconnected), a complete answer (mastery_demonstrated), and a "
        "non-attempt (pure_denial) first. shallow_label is only a correct label with nothing underneath."
    )
    _user = f"QUESTION: {last_question}\n\nANSWER: {candidate_answer}"
    _usage: dict | None = None
    try:
        resp = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=0.0,
                **token_limit_kwarg(llm_model, 100),
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
        reason = str(result.get("signal_reason") or "").strip() or None
        chosen_raw = result.get("signals")
        if not chosen_raw and result.get("signal"):
            chosen_raw = [result.get("signal")]
        chosen = [str(s).strip() for s in (chosen_raw or []) if str(s).strip() in CONTENT_SIGNAL_DEFINITIONS]
        chosen = chosen[:MAX_SIGNALS_PER_TURN]
        if not reason and chosen:
            reason = CONTENT_SIGNAL_DEFINITIONS[chosen[0]]["trigger"]
        if chosen:
            return chosen, reason, _usage
    except Exception as exc:
        logger.warning("[EVAL] _classify_signal_from_answer failed (%s) — using shallow_label fallback", exc)
    # Deterministic fallback: shallow_label (gap tier — "attempted but hollow")
    return ["shallow_label"], CONTENT_SIGNAL_DEFINITIONS["shallow_label"]["trigger"], _usage


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
            "-- SCORE ADDITIVELY, PER CORRECT ELEMENT PRESENT (do this before assigning any number) --\n"
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

            "-- DISFLUENCY VS. CORRECTNESS (apply this before scoring any dimension) --\n"
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

            "-- SELF-CORRECTION IS A GOOD SIGN, NOT A FUMBLE --\n"
            "If the candidate states something, then catches their OWN mistake and corrects it to "
            "something accurate (even mid-sentence), score the CORRECTED version, and score it "
            "HIGHER than if they'd only given the fumble — catching your own error is evidence of "
            "real understanding, not a penalty-worthy stumble. Do not average the wrong first attempt "
            "with the corrected one; weight toward the correction they landed on.\n\n"

            "-- ACTIVE WRONGNESS IS WORSE THAN NO ATTEMPT --\n"
            "A confident, specific claim that is ACTUALLY WRONG (states a mechanism backwards, swaps "
            "two concepts' properties, asserts something false with certainty) reveals a real "
            "misconception — this must score LOWER than a flat 'I don't know' on the same question, "
            "not the same or higher. Silence is a gap; a confident wrong answer is active confusion. "
            "Do not be fooled by confident delivery into scoring a wrong claim as if it were correct.\n\n"

            "-- CLARITY (20%) ------------------------------\n"
            "Did they answer what was actually asked — not a safer, easier version of it?\n"
            "A polished answer to the wrong question scores low. A rough answer to the right question scores high.\n"
            "Low (0-4): off-topic, tangent, or answered a related but different question.\n"
            "Mid (5-6): addressed the question but missed part of the intent or drifted.\n"
            "High (7-10): directly answered what was asked. You got what you needed.\n\n"

            "-- DEPTH (35%) --------------------------------\n"
            "Did they explain the HOW and WHY — or just describe the WHAT?\n"
            "Ask yourself: could someone who only read about this topic give the same answer?\n"
            "If yes, depth is low. Real depth is specific to their situation, their constraints, their actual decisions.\n"
            "Generic best-practices language ('I always start by understanding requirements') is not depth — cap at 5.\n"
            "Low (0-4): described what happened, no reasoning behind it.\n"
            "Mid (5-6): gave a real reason for a choice but it's thin — one layer, no constraint or tradeoff behind it.\n"
            "High (7-10): explained a real decision AND why that decision made sense given their specific situation. "
            "The best answers show a cause-effect chain — what they tried, what happened, why they adjusted. "
            "Expect at least one real constraint or tradeoff behind a decision — generic reasoning caps at 4.\n\n"

            "-- SPECIFICITY (20%) --------------------------\n"
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

            "-- GROUNDING (25%) ----------------------------\n"
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
    signals_already_fired: list[str] | None = None,
) -> tuple[list[str], str | None, bool, dict]:
    """
    Call 2 — 10-Dimension Holistic Rubric signal classification, chain-of-thought over
    every dimension, up to MAX_SIGNALS_PER_TURN signals returned (primary first).
    Returns (signals_list, signal_reason, self_corrected, llm_usage_dict).
    question_type: the type of question that was asked (code_trace, snippet_eval, query_trace,
    mechanism, etc.) — gates which of the 10 dimensions are reachable this turn.
    """
    def _build_signal_system_prompt() -> str:
        _fired_list = ", ".join(signals_already_fired) if signals_already_fired else "None"
        return (
            "You are a strict signal classifier for a technical interview.\\n"
            "Read the QUESTION, the ANSWER, and the RECENT CONVERSATION together before deciding.\\n"
            f"Signals already fired on this topic: [{_fired_list}].\\n"
            "Your job is to identify the smallest set of real, evidence-backed signals that best "
            "determine the next interviewer question. Rank by what changes the next question most.\\n\\n"
            "PHASE 1 — MANDATORY DIMENSION WALK (silent)\\n"
            "Walk ALL reachable dimensions in order (1-10). For each: is there a gap? YES/NO + one-word reason.\\n"
            "Do not skip. Do not stop early.\\n\\n"
            "PHASE 2 — PRIORITY RANKING\\n"
            "Apply priority rules:\\n"
            "  1) Check response-shape gates first.\\n"
            "  2) If the answer contains any specific false claim, factual_error wins.\\n"
            "  3) If the answer is fully correct and complete for the level, mastery_demonstrated wins.\\n"
            "  4) Otherwise choose the most specific gap.\\n"
            "Pick TOP 2 signals from different dimensions.\\n\\n"
            "PHASE 3 — OUTPUT JSON\\n"
            "Your final output MUST end with valid JSON on its own line:\\n"
            '{"signals": ["<primary_signal>", "<secondary_signal optional>"],\\n'
            ' "signal_reason": "<3-12 word exact quote from their answer>",\\n'
            ' "self_corrected": true|false}\\n\\n'
            "self_corrected is a MODIFIER, decided separately from the signals. It does not compete "
            "with them and does not change which signals you pick. " + SELF_CORRECTION_TRIGGER + "\\n\\n"
            f"Every entry in signals MUST be exactly one of the signal names below, each from a "
            f"DIFFERENT dimension, max {MAX_SIGNALS_PER_TURN}. Never return an empty list.\\n"
            f"Topic: {active_topic or 'general'} | Level: {level}\\n"
            + (f"Question type: {question_type} (see code-question calibration rules below)\\n" if question_type else "")
            + "\\n"
            + _build_response_shape_gate_block()
            + "\\n\\n"
            + _build_content_signal_prompt_block(level, question_type=question_type)
        )

    resp = await asyncio.wait_for(
        client.chat.completions.create(
            model=llm_model,
            temperature=0.0,
            **token_limit_kwarg(llm_model, 550),
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
    signals: list[str] = []
    signal_reason: str | None = None
    self_corrected: bool = False
    import re as _re
    _json_matches = _re.findall(r'\{.*?\}', raw, _re.DOTALL)
    for _candidate_json in reversed(_json_matches):
        try:
            _parsed = json.loads(_candidate_json)
            _raw_signals = _parsed.get("signals")
            if not _raw_signals and _parsed.get("signal"):
                _raw_signals = [_parsed.get("signal")]
            _sigs = [str(s).strip() for s in (_raw_signals or []) if str(s).strip()]
            if _sigs:
                # De-dup while preserving order, cap at MAX_SIGNALS_PER_TURN, never two
                # signals from the same dimension.
                _seen_dims: set[str] = set()
                for _s in _sigs:
                    if _s in RESPONSE_SIGNALS:
                        # Response signals are exclusive and don't have a "dimension"
                        signals = [_s]
                        break
                        
                    _defn = CONTENT_SIGNAL_DEFINITIONS.get(_s)
                    if not _defn:
                        continue
                    _dim = _defn["dimension"]
                    if _dim in _seen_dims:
                        continue
                    _seen_dims.add(_dim)
                    signals.append(_s)
                    if len(signals) >= MAX_SIGNALS_PER_TURN:
                        break
                if signals and signals[0] in _NON_COMBINING_SIGNALS:
                    signals = signals[:1]
                _reason = str(_parsed.get("signal_reason") or "").strip() or None
                if not _reason and signals:
                    _defn = CONTENT_SIGNAL_DEFINITIONS.get(signals[0]) or RESPONSE_SIGNALS.get(signals[0])
                    _reason = (_defn.get("trigger") or _defn.get("description")) if _defn else None
                signal_reason = _reason
                self_corrected = bool(_parsed.get("self_corrected"))
                if signals:
                    break
        except (json.JSONDecodeError, ValueError):
            continue

    return signals, signal_reason, self_corrected, _llm_usage


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
    signals_already_fired: list[str] | None = None,
) -> dict:
    """
    Two dedicated LLM calls: Call 1 scores the answer, Call 2 classifies signals against
    the 10-Dimension Holistic Rubric (up to MAX_SIGNALS_PER_TURN signals, primary first).
    Level (1-4) calibrates scoring and signal severity.

    question_type: the type of question that was asked — passed to the signal classifier
      to calibrate it for code card questions (code_trace, snippet_eval, query_trace).

    Returns:
      clarity, depth, specificity, grounding, overall  — quality scores
      action        — PROBE | MOVE_ON | REPHRASE | REDIRECT | ACCEPT_REPHRASE
      signal        — the PRIMARY signal name, never null (fallback: shallow_label) —
                      drives all existing state machinery (saturation, denial streaks)
      signals       — up to MAX_SIGNALS_PER_TURN signal names, primary first — the full
                      holistic finding, handed to probe.py for composite question generation
      signal_reason — exact quote from their answer that triggered it, or null
      reason        — short phrase for the routing decision
    """
    if is_warmup:
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0, "overall": 0.0,
            "is_warmup": True,
            "action": "MOVE_ON", "forced_action": True,
            "signal": None, "signals": [], "signal_reason": None, "reason": "warmup turn",
        }

    if not candidate_answer or not candidate_answer.strip():
        # Empty answer = pure_denial
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0, "overall": 0.0,
            "action": "PROBE", "forced_action": False,
            "signal": "pure_denial", "signals": ["pure_denial"],
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
        (scoring_data, _scoring_usage), (raw_signals, signal_reason, self_corrected, _signal_usage) = (
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

        signals: list[str] = [s.strip() for s in (raw_signals or []) if s and s.strip()]
        signal: str | None = signals[0] if signals else None

        action = "PROBE"
        forced_action = False
        zero_scores = False

        # Response-shape signals — short-circuit content scoring. These never combine
        # with a content signal, so if one is present it is always alone in the list.
        if signal in RESPONSE_SIGNALS:
            if signal == "clarification_request":
                logger.info("[EVAL] clarification_request detected, returning immediately with zero scores")
                return {
                    "clarity": 0.0, "depth": 0.0, "specificity": 0.0, "grounding": 0.0, "overall": 0.0,
                    "action": "REPHRASE", "forced_action": True,
                    "signal": signal, "signals": [signal],
                    "signal_reason": signal_reason, "reason": "clarification request — zero scores",
                    "_llm_usage": _eval_llm_usages,
                }
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
        elif signal is not None and any(s not in CONTENT_SIGNAL_DEFINITIONS for s in signals):
            logger.warning("[EVAL] unknown signal(s) %r — running fallback classifier", signals)
            signal, signals = None, []

        # Fallback classifier removed; defaulting to shallow_label below if needed.

        # Final guard: ensure signal is always set (never null)
        if signal is None:
            signal = "shallow_label"
            signals = ["shallow_label"]
            logger.info("[EVAL] signal still None after fallback — using shallow_label default")

        signal_reason = (signal_reason or "").strip() or None

        reason = str(data.get("reason", ""))[:120]

        # factual_error is WORSE than pure_denial: active wrongness reveals a real misconception
        if signal == "factual_error" and answers_question is not False:
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
            "signals": signals,
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
            "signal": "shallow_label",
            "signals": ["shallow_label"],
            "signal_reason": f"eval recovery — {type(e).__name__}: {str(e)[:120]}",
            "reason": "eval recovery (llm slow/unavailable)",
            "is_eval_recovery": True,
        }






