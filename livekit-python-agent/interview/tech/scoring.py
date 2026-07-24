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
  Content signals (8 universal, level-calibrated):
    depth_mastered, depth_clear, depth_applied,
    depth_shallow, depth_misconception, depth_generic,
    pure_denial, recovery_attempted
  No null ever: fallback is depth_shallow.
"""
from __future__ import annotations
import asyncio
import json
import logging
from typing import Any, Optional

logger = logging.getLogger("interview-agent")
from interview.agent_runtime_support import EVAL_TEMPERATURE
from interview.agent_runtime_utils import token_limit_kwarg


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
# Universal content signals (8) — the signal encodes TWO independent axes that
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
#
# The 8 signals are the meaningful CELLS of that grid. Level (1-4) calibrates
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

    "depth_mastered": {
        "trigger": "CORRECT + APPLIED depth. Explains the mechanism (HOW), the tradeoff or failure mode (WHY it breaks), AND judgment about when to use it vs alternatives. All three present and technically accurate. Survives a 'what breaks this' push. For code/query questions: correctly traces the execution or returns the right result AND explains WHY the code behaves that way (scope rule, evaluation order, NULL semantics, etc.) — not just the output.",
        "pattern": "A practitioner's answer, not a textbook one. They can trace the internals, name the failure cases, and defend a real judgment call. This is the ceiling — reserve it.",
        "examples": [
            "For DB indexing: 'A B-tree keeps keys sorted so range scans walk leaf nodes in order — that's why BETWEEN is fast. But a low-cardinality column like a boolean flag, the planner ignores the index and does a seq scan anyway because the index isn't selective. I'd only index it if it's part of a composite with a selective leading column.'",
            "For a code_trace: correctly says output is '[1, 2]' AND explains that list slicing creates a new list so the original is unchanged — traces the memory model, not just the output",
        ],
        "not_this": "NOT this if any dimension (mechanism/tradeoff/judgment) is missing → depth_clear. NOT this if any specific claim in it is factually WRONG, however fluent → depth_misconception. NOT this if it's a real-experience story without the mechanism → depth_applied.",
    },

    "depth_clear": {
        "trigger": "CORRECT + MECHANISM depth. Everything stated is accurate and they genuinely explain HOW it works or trace the concrete case — real understanding, not a label — but one layer is missing (no tradeoff, or no failure mode, or no 'when NOT to use it'). For code/query questions: states the correct output or result AND traces at least one step of the execution (e.g. 'because the list is modified in place'), but doesn't explain the full evaluation order or edge cases.",
        "pattern": "Solid, correct, mechanism-level. One targeted push (a tradeoff, a failure case, a harder input) away from mastered. This is the expected 'good answer' floor for a competent candidate.",
        "examples": [
            "For hashing: 'Two keys can hash to the same bucket — a collision — so it chains them in a list at that slot and walks the list on lookup. Worst case all keys collide and it degrades to O(n).' — correct mechanism, but didn't mention resize/load factor or how a real impl mitigates it.",
            "For a code_trace: 'It prints 4 because the loop runs n-1 times, not n.' — correct output with correct reason, but didn't explain what happens at the boundary condition",
            "For a query_trace: 'It returns nothing because the LEFT JOIN on orders filters to only users WITH orders — wait, no, the WHERE on orders.id IS NOT NULL is doing that.' — traced the right issue, missed explaining why NULL propagation causes it",
        ],
        "not_this": "NOT this if a tradeoff AND judgment are also present and accurate → depth_mastered. NOT this if it's just a correct-sounding label with no real mechanism traced → depth_shallow. NOT this if any claim is wrong → depth_misconception.",
    },

    "depth_applied": {
        "trigger": "CORRECT + real applied judgment grounded in a concrete situation: a specific decision, a real failure debugged, a real tradeoff navigated — with a specific constraint (a number, a scale, a deadline) and what they actually did.",
        "pattern": "Gold standard for grounding. 'In [specific situation] I did X because Y, and the tradeoff was Z' — not 'I usually do X'. Proves the knowledge is load-bearing, not just recalled.",
        "examples": ["For caching: '50k reads/sec on our catalog, Redis TTL=30s. On expiry we hit cache stampede — every miss slammed Postgres at once. Fixed it with probabilistic early expiration so keys refresh before the hard TTL. Traded slightly-staler reads for not taking the DB down.'"],
        "not_this": "NOT this if the scenario is generic or hypothetical ('you'd usually cache X') → depth_generic. NOT this if there's no specific constraint or outcome. A habit is not an applied instance.",
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
        "not_this": "NOT this if there's a real reason specific to THIS question → depth_clear. NOT this if it's a hollow one-word label rather than a checklist → depth_shallow. NOT this if it's grounded in a specific real instance → depth_applied.",
    },

    "pure_denial": {
        "trigger": "ZERO attempt. A flat non-answer: 'I don't know', 'not sure', 'never used it', or silence. No engagement with the content at all.",
        "pattern": "Distinct from every other signal, which all have SOME attempt. Honest and worth acknowledging cleanly — a calibrated 'I don't know' is more useful than a confident wrong guess, and must never score below depth_misconception.",
        "examples": ["I don't know.", "I'm not sure about that one.", "I haven't really worked with that."],
        "not_this": "NOT this if there's ANY attempt, even wrong or hollow. A wrong attempt → depth_misconception. A hollow-label attempt → depth_shallow. Reserve strictly for a complete non-attempt.",
    },

    "recovery_attempted": {
        "trigger": "SELF-CORRECTION to a CORRECT landing. Starts uncertain or wrong, then catches their OWN error mid-answer and arrives at an accurate answer — without the interviewer pointing it out. Score the corrected landing.",
        "pattern": "A strong positive signal that only real understanding produces — you cannot self-correct a fact you never understood. Weight toward the corrected version, not the initial slip.",
        "examples": ["'I said it keeps things sorted — no wait, that's a BST. A hash map uses a hash function to pick the bucket, order isn't preserved.'", "'Restart — it's not a separate thread, the frame just suspends at yield and resumes on next().'"],
        "not_this": "NOT this if they fumbled and did NOT actually reach a better answer → depth_shallow or depth_misconception. Recovery requires LANDING on something correct, not just hesitating or hedging.",
    },
}

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

If none of RS-a/b/c fired: this answer gets exactly ONE content signal (below).\
"""


def _build_content_signal_prompt_block(level: int, question_type: str = "") -> str:
    """Universal content signal detection — all 8 signals always available, no stage scoping.
    Level (1-4) calibrates how seriously each outcome is weighted.
    question_type (optional): the type of question that was asked (e.g. 'code_trace',
    'snippet_eval', 'query_trace'). Used to inject code-question-specific calibration."""
    _level_context = {
        1: "LEVEL 1 (junior/entry): depth_shallow is a real gap but not a red flag. depth_clear is a strong positive.",
        2: "LEVEL 2 (mid-level): depth_clear is the expected floor. depth_shallow signals a knowledge gap worth probing.",
        3: "LEVEL 3 (senior): depth_mastered or depth_applied expected. depth_shallow is a significant gap.",
        4: "LEVEL 4 (principal/staff): depth_applied or depth_mastered is the baseline. depth_shallow is a red flag.",
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
                "  depth_mastered: correct output + full trace of execution + explains edge case or "
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
                "  depth_mastered: correctly identified the bug, the trigger condition, AND explained "
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
                "  depth_mastered: correct result + full trace of the query plan + identifies a "
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
---- CONTENT SIGNAL — pick exactly ONE of these 8 ----

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
    correct + applied                    → depth_mastered  (or depth_applied if it's
                                            a grounded real-experience instance)
    correct + mechanism                  → depth_clear
    correct + label_only                 → depth_shallow
    plausible-but-ungrounded checklist   → depth_generic
    wrong (any depth)                    → depth_misconception
    none                                 → pure_denial
    self-corrected to a correct landing  → recovery_attempted

{_gates_block}

CRITICAL ordering rules:
1. CORRECTNESS DOMINATES. A wrong claim is depth_misconception no matter how fluent or
   detailed — it must never be scored as depth_clear/mastered just because it was
   articulate. Confident-and-wrong scores BELOW hesitant-and-right and BELOW "I don't know".
2. LABEL ≠ UNDERSTANDING. A correct-sounding label with no mechanism traced is depth_shallow,
   NOT depth_clear. Do not credit the keyword — credit only the substance under it.
3. depth_applied: only when grounded in a SPECIFIC real instance (a real decision, failure,
   or constraint), not a hypothetical or a habit.
4. recovery_attempted: candidate catches their OWN error unprompted and lands correct. Score the landing.
5. pure_denial is ONLY for a complete non-attempt. ANY attempt — even wrong — is a different signal.

FALLBACK RULE (no null ever): If you truly cannot decide, first re-check AXIS 1 — if any claim
is wrong, it's depth_misconception; if the attempt is a hollow label, depth_shallow. Only use
depth_shallow as a last resort when the answer is a genuine but empty attempt.\
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
    Fallback: compare the answer against all 8 universal content signals.
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
        "signal MUST be exactly one of the signal names listed above. If unsure, use depth_shallow. Never null."
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
            timeout=5.0,
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
            metadata={
                "call_type": "eval_scoring",
                "level": str(level),
                "org_id": str(org_id or ""),
            },
        ),
        timeout=8.0,
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
) -> tuple[str | None, str | None, dict]:
    """
    Call 2 — universal signal classification, with its own 400-600 token reasoning budget.
    Brief chain-of-thought is allowed before the final JSON.
    Returns (signal, signal_reason, llm_usage_dict).
    question_type: the type of question that was asked (code_trace, snippet_eval, query_trace,
    mechanism, etc.) — used to calibrate signal classification for code card questions.
    """
    def _build_signal_system_prompt() -> str:
        return (
            "You are a signal classifier for a technical interview evaluation system.\n"
            "Your job is to identify the signal that best describes the candidate's answer.\n\n"
            "You may reason briefly (2-4 sentences) before giving your final answer, but your final output\n"
            "MUST end with valid JSON on its own line:\n"
            '{"signal": "<signal_name>", "signal_reason": "<3-12 word exact quote from their answer>"}\n\n'
            "signal MUST be exactly one of the signal names below. NEVER null. If unsure, use depth_shallow.\n"
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
            metadata={
                "call_type": "eval_signal",
                "level": str(level),
                "org_id": str(org_id or ""),
            },
        ),
        timeout=6.0,
    )

    raw = resp.choices[0].message.content or ""

    from billing.billing import extract_usage as _extract_usage  # noqa: PLC0415
    _llm_usage = _extract_usage(resp, llm_model) if resp else {
        "model": llm_model, "inputTokens": 0, "outputTokens": 0, "cachedInputTokens": 0,
    }

    # Extract the last JSON object from the response (chain-of-thought comes first)
    signal: str | None = None
    signal_reason: str | None = None
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
                break
        except (json.JSONDecodeError, ValueError):
            continue

    return signal, signal_reason, _llm_usage


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
        (scoring_data, _scoring_usage), (raw_signal, signal_reason, _signal_usage) = (
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
            zero_scores = True
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

        # recovery_attempted: score the corrected landing, give a small boost
        if signal == "recovery_attempted" and not zero_scores:
            _recovery_boost = 1.5
            clarity = min(10.0, clarity + _recovery_boost)
            depth = min(10.0, depth + _recovery_boost)
            overall = min(10.0, (clarity * 0.20 + depth * 0.35 + specificity * 0.20 + grounding * 0.25))
            reason = f"{reason} — recovery credited" if reason else "recovery_attempted credited"

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


