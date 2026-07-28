"""
interview/conversational/scoring.py
Sales-module scoring. Mirrors interview.tech.scoring's two-call architecture
(one call scores the answer, one call classifies the signal) but with a
sales-specific quality rubric and the 12 sales probe signals, split across
Technical mode (deal mechanics, tools, pipeline reasoning) and Conversational
mode (behavioral/story-based signals).

Returns:
  quality scores  : clarity, depth, specificity, grounding, overall
  routing         : action (PROBE/MOVE_ON)
  signal          : one signal name + the exact reason it fired (never null)
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
# Response-level signals (G0) -- identical mechanics to tech mode. These fire
# on the SHAPE of the reply itself, independent of domain.
# ---------------------------------------------------------------------------
RESPONSE_SIGNALS = {
    "pure_denial": {
        "description": "Answer is ONLY denial, zero attempt, nothing substantive.",
        "action": "MOVE_ON (forced)",
    },
    "denial_with_continuation": {
        "description": "Starts with denial but adds substantive content (partial admission).",
        "action": "CONTINUE (score normally, cap at 5 to prevent saturation)",
    },
    "clarification_request": {
        "description": "Candidate asks to clarify/rephrase the question.",
        "action": "REPHRASE (ask question again, clearer)",
    },
    "rephrase_request": {
        "description": "Candidate asks to restart their own answer.",
        "action": "ACCEPT_REPHRASE (listen to new answer instead)",
    },
    "off_topic": {
        "description": "Answered a different question than what was asked.",
        "action": "REDIRECT (re-ask the original question)",
    },
}

# ---------------------------------------------------------------------------
# Content-level signals -- Sales Module Top 12.
# TECHNICAL_SIGNALS fire on deal-mechanics / tool / process questions.
# CONVERSATIONAL_SIGNALS fire on behavioral / story-based questions.
# Both sets are checked together per turn -- which subset is more relevant
# depends on the QUESTION TYPE the interviewer just asked (a mechanics
# question invites G1-G5, a "tell me about a time" question invites G6-G12),
# so the signal classifier is given both and told to weigh by question shape.
# ---------------------------------------------------------------------------

TECHNICAL_SIGNALS = {
    "deal_metrics_missing": {
        "trigger": "Question is about deals, quota, pipeline, or performance. Answer has NO number "
                   "anywhere -- no quota, ACV, win rate, cycle time, deal size, or volume.",
        "pattern": "Sales is a numbers-first function. An answer about performance or a deal that "
                   "never produces a single figure is the highest-value correctness gap to catch.",
        "examples": [
            "Q: What was your quota attainment last year? A: I did really well, consistently hit my numbers.",
            "Q: Walk me through your pipeline. A: I keep a healthy pipeline and stay on top of my deals.",
        ],
        "not_this": "NOT this if ANY real figure is present, even approximate ('around 120 percent', "
                    "'roughly 40 deals a quarter') -- an approximate number still counts as a metric. "
                    "NOT this if the question itself wasn't about deals/performance/pipeline.",
    },
    "objection_handling_theoretical": {
        "trigger": "Candidate describes objection handling as a general method or philosophy but "
                   "cannot produce ONE real objection they actually heard and how they responded.",
        "pattern": "Textbook objection-handling language ('I listen first, then address the concern, "
                   "then reframe the value') with no real client quote or real objection behind it.",
        "examples": [
            "Q: How do you handle price objections? A: I always listen to their concern first, then "
                "reframe around value instead of price. That's usually how I approach it.",
        ],
        "not_this": "NOT this if they quote or closely paraphrase a real objection a real client raised "
                    "('they said our price was 30 percent over their budget') -- that has substance, "
                    "check tech_choice_unjustified or fine as-is instead.",
    },
    "pipeline_thinking_weak": {
        "trigger": "No real grasp of pipeline stages, stage-to-stage movement, funnel logic, or "
                   "forecast reasoning when asked about their process, forecasting, or deal progression.",
        "pattern": "Vague process language with no stage names, no criteria for moving a deal forward, "
                   "no forecast category logic (commit / best-case / pipeline).",
        "examples": [
            "Q: How do you forecast your quarter? A: I just kind of know which deals feel close and add "
                "them up.",
            "Q: What moves a deal from qualification to proposal? A: Once they seem interested, I move "
                "forward with them.",
        ],
        "not_this": "NOT this if they name real stage criteria or forecast categories, even loosely "
                    "('I only call it commit if legal review has started') -- that shows real pipeline logic.",
    },
    "sales_tool_named_not_used": {
        "trigger": "Names a specific sales tool (Salesforce, HubSpot, Gong, Outreach, Salesloft, "
                   "ZoomInfo, LinkedIn Sales Navigator, etc.) but cannot explain what they actually did "
                   "with it -- no workflow, no configuration, no daily usage described.",
        "pattern": "The tool name appears; there is no operational verb behind it (logged, built a "
                   "sequence in, pulled a report from, set a stage rule in).",
        "examples": [
            "Q: What CRM have you used? A: Salesforce, HubSpot, some Gong too. [Three names, zero usage.]",
        ],
        "not_this": "NOT this if they describe actually doing something IN the tool ('I built my outbound "
                    "cadences in Outreach and tracked reply rate weekly') -- that shows real usage, check "
                    "strategy_choice_unjustified instead if the WHY is still missing.",
    },
    "strategy_choice_unjustified": {
        "trigger": "Candidate picked a channel, cadence, messaging angle, or sales play but cannot "
                   "explain WHY it was the right call for that situation.",
        "pattern": "A choice is stated as simple fact ('I called them') with no reasoning about why that "
                   "channel/play/timing/segment fit the target account or buyer.",
        "examples": [
            "Q: Why did you lead with a cold call instead of email for that account? A: I just called "
                "them, it worked out.",
        ],
        "not_this": "NOT this if they give even a simple reason ('their buyer persona rarely responds to "
                    "email, so I went straight to phone') -- then null, this signal doesn't fire.",
    },
}

CONVERSATIONAL_SIGNALS = {
    "deal_example_evaded": {
        "trigger": "Question asked for ONE real deal/customer/team example. Answer stays at habits and "
                   "platitudes -- 'usually', 'normally', 'I always' -- instead of a specific instance.",
        "pattern": "Most common behavioral-interview failure mode, sales-flavored: a rule about how they "
                   "generally sell instead of a real story about a specific deal.",
        "examples": [
            "Q: Tell me about a deal you almost lost. A: I always follow up quickly and stay persistent "
                "with the client.",
        ],
        "not_this": "NOT this if they name a real client/deal/account, even briefly. NOT this if they "
                    "tried and ran dry -- that's a depth gap, use deal_metrics_missing or "
                    "impact_not_measured instead depending on what's missing.",
    },
    "revenue_ownership_ambiguous": {
        "trigger": "Unclear what result the CANDIDATE personally drove versus what the team/account "
                   "manager/SDR/manager did. Sales narratives inflate personal contribution more than "
                   "most domains -- check this carefully.",
        "pattern": "'We closed the deal', 'our team hit the number', 'the account manager followed up' -- "
                   "real outcome, invisible personal contribution.",
        "examples": [
            "Q: Tell me about your biggest win. A: Our team closed a huge deal, we handled the negotiation "
                "together, the account manager did the follow-up.",
        ],
        "not_this": "NOT this if they say 'I' anywhere with a specific action ('I ran the discovery call "
                    "and negotiated the final terms') -- ownership is clear.",
    },
    "impact_not_measured": {
        "trigger": "Narrates an outcome with no concrete change described, even loosely -- 'it went "
                   "well', 'they were happy', 'we improved things' with nothing quantified or observed.",
        "pattern": "Story-level complement to deal_metrics_missing: this fires on OUTCOME vagueness "
                   "within a narrative, not on a metrics-specific question.",
        "examples": [
            "Q: What happened after you changed your outreach approach? A: It went really well, response "
                "was a lot better.",
        ],
        "not_this": "NOT this if ANY concrete change is named, even rough ('replies went from maybe one a "
                    "week to three or four') -- that's a real measurement, however loose.",
    },
    "conflict_story_sanitized": {
        "trigger": "A disagreement/conflict story (with a client, manager, or teammate) has no real "
                   "stakes or tension -- everything sounds smoothed over, resolved instantly, no friction.",
        "pattern": "Authenticity check distinct from objection_handling_theoretical -- this is about "
                    "INTERPERSONAL friction in a story, not sales-process knowledge.",
        "examples": [
            "Q: Tell me about a time you disagreed with your manager on how to run a deal. A: We talked "
                "it through and found a solution together, no big deal really.",
        ],
        "not_this": "NOT this if there's a real moment of tension, pushback, or an account of how they "
                    "actually felt or what was actually said -- even a small amount of friction disqualifies this.",
    },
    "reflection_missing": {
        "trigger": "Candidate cannot name a specific learning from a story, or cannot explain how that "
                   "learning was later applied to a different situation.",
        "pattern": "Strong self-awareness/growth-mindset check -- the story lands, but there is no "
                    "'and here's what I changed because of it' close.",
        "examples": [
            "Q: What did you learn from losing that deal? A: Just that sales can be unpredictable "
                "sometimes.",
        ],
        "not_this": "NOT this if they name something specific they now do differently, even small "
                    "('I now always confirm budget in the first call, I didn't before that deal').",
    },
    "customer_focus_missing": {
        "trigger": "Candidate talks ONLY from an internal perspective (quota, process, their own effort) "
                   "with no framing of the customer's pain, goal, or outcome anywhere in the answer.",
        "pattern": "Maps directly to sales performance quality, not just narrative authenticity -- a "
                    "good rep frames work in terms of what the customer needed.",
        "examples": [
            "Q: Walk me through how you ran that deal. A: I followed up every week, sent the proposal on "
                "time, kept pushing to get it signed by quarter end.",
        ],
        "not_this": "NOT this if the customer's need, pain point, or goal is mentioned anywhere, even "
                    "briefly ('they were struggling to get visibility into their pipeline').",
    },
    "decision_logic_opaque": {
        "trigger": "Candidate describes a decision they made but never explains how the options or "
                   "risks were weighed -- the decision is stated, not reasoned through.",
        "pattern": "Reasoning-quality check distinct from the other 11 -- this is about the THINKING "
                    "behind a choice, not the choice itself or its outcome.",
        "examples": [
            "Q: Why did you decide to walk away from that deal? A: It just wasn't going anywhere so I "
                "moved on.",
        ],
        "not_this": "NOT this if they name what they weighed, even simply ('the discount they wanted "
                    "would've put us below margin, and there was no budget flexibility on their side').",
    },
}

# Union used by anything that needs "all content signals" without caring which mode.
SIGNAL_DEFINITIONS: dict[str, dict] = {**TECHNICAL_SIGNALS, **CONVERSATIONAL_SIGNALS}


# ---------------------------------------------------------------------------
# SIGNAL DETECTION -- direct classification, same evidence-weighted gate-check
# approach validated in interview.tech.scoring (direct classification beat a
# feature-extraction + resolver alternative there; no reason sales content
# would reverse that finding, since the mechanism is domain-independent).
# ---------------------------------------------------------------------------

def _build_signal_prompt_block() -> str:
    return """\
-- SIGNAL DETECTION (EVIDENCE-WEIGHTED GATE CHECK) --

You are a signal classifier for a SALES interview. Your job is to pick the ONE signal that
BEST describes the SPECIFIC GAP in this answer. This is NOT a first-match-wins check — it is
a best-match check. Read the answer, then look at every gate, then pick the gate whose
trigger pattern is MOST STRONGLY present in the answer.

STEP 0 — RESPONSE-LEVEL GATES (G0). Only these are first-match-wins.
G0 gates describe the SHAPE of the reply itself (denial, clarification ask, off-topic).
If any G0 gate fires, return that signal immediately.

STEP 1 — CONTENT-LEVEL GATES. NOT first-match-wins. Two families:
  TECHNICAL gates (deal mechanics, tools, pipeline, strategy) — most relevant when the
    question asked about deals, numbers, process, tools, or a strategic choice.
  CONVERSATIONAL gates (story/behavioral) — most relevant when the question asked for a
    real instance, a conflict, a learning, or a customer-facing narrative.
Use the QUESTION SHAPE to weight which family is more likely, but check both — a mechanics
question can still surface a conversational gap (e.g. no customer framing at all), and a
behavioral question can still surface a technical gap (e.g. no metric anywhere in the story).

STEP 2 — VARIETY RULE (HARD). If the sidebar shows signals already fired on THIS topic,
those signals are BANNED for this turn unless literally no other content gate matches the
answer at all. Pick the STRONGEST gate that has NOT already fired on this topic. Every
content signal has a real interpretation of nearly every substantive answer — find it.

STEP 3 — REINTERPRET RULE. Gates overlap by design. The SAME answer can honestly fit
multiple content gates — use the variety rule to break ties, picking whichever hasn't fired.

---- RESPONSE-LEVEL GATES (G0) — check these FIRST ----

G0a — PURE_DENIAL: STRICT. Fires ONLY for a flat "I don't know / I'm not sure" about their
      OWN experience, and ONLY when that is the ENTIRE answer, nothing substantive.
      NOT this if they deny experience with a specific tool/deal type — that falls through
      to content gates (e.g. sales_tool_named_not_used), not G0a.
      → YES: SIGNAL = pure_denial. STOP.

G0b — DENIAL_WITH_CONTINUATION: Starts with denial BUT adds substantive content?
      "...but I did close one deal like that" → YES: SIGNAL = denial_with_continuation. STOP.

G0c — CLARIFICATION_REQUEST: Candidate asking you to clarify/rephrase, or checking the
      connection ("can you hear me")? → YES: SIGNAL = clarification_request. STOP.

G0d — REPHRASE_REQUEST: Candidate asking to restart or correct THEIR OWN answer?
      → YES: SIGNAL = rephrase_request. STOP.

G0e — OFF_TOPIC: Candidate answered a COMPLETELY DIFFERENT question, unrelated subject
      matter? → YES: SIGNAL = off_topic. STOP.
      NOT this for a vague or shallow ON-TOPIC attempt — that falls to content gates.

G0f — GARBLED/UNINTELLIGIBLE TRANSCRIPT: Is the text itself broken, muffled, or noise — not
      a real sentence, mostly fragments/filler, cut off mid-word, or otherwise not coherent
      enough to tell what the candidate meant? A transcription/audio problem, not a weak
      answer. → YES: SIGNAL = clarification_request. STOP.
      NOT this if the text is short but forms a real, coherent attempt at an answer, even a
      terse one ("yes", "I don't know", "cold calling") — that's real content, not noise.

If G0a-G0f = NO: evaluate ALL of the content gates below and pick the STRONGEST match.

---- TECHNICAL CONTENT GATES ----

T1 — DEAL_METRICS_MISSING: Question about deals/performance/pipeline, answer has ZERO
     numbers anywhere (no quota, ACV, win rate, cycle time, deal size, volume)?
     → YES: SIGNAL = deal_metrics_missing. CANDIDATE.

T2 — OBJECTION_HANDLING_THEORETICAL: Describes objection handling as a general method,
     cannot produce ONE real objection a real client actually raised?
     → YES: SIGNAL = objection_handling_theoretical. CANDIDATE.

T3 — PIPELINE_THINKING_WEAK: No real grasp of pipeline stages, stage movement, funnel
     logic, or forecast reasoning when asked about process/forecasting/progression?
     → YES: SIGNAL = pipeline_thinking_weak. CANDIDATE.

T4 — SALES_TOOL_NAMED_NOT_USED: Names a specific sales tool with ZERO evidence of actual
     usage — no workflow, no config, no operational verb behind the name?
     → YES: SIGNAL = sales_tool_named_not_used. CANDIDATE.

T5 — STRATEGY_CHOICE_UNJUSTIFIED: Picked a channel/play/cadence/messaging angle but never
     explained WHY it fit that situation?
     → YES: SIGNAL = strategy_choice_unjustified. CANDIDATE.

---- CONVERSATIONAL CONTENT GATES ----

C1 — DEAL_EXAMPLE_EVADED: Question asked for ONE real deal/customer instance, answer stays
     at habits/platitudes ("usually", "I always") instead of a specific instance?
     → YES: SIGNAL = deal_example_evaded. CANDIDATE.

C2 — REVENUE_OWNERSHIP_AMBIGUOUS: Real outcome described, but unclear what the CANDIDATE
     personally drove versus the team/account manager/SDR?
     → YES: SIGNAL = revenue_ownership_ambiguous. CANDIDATE.

C3 — IMPACT_NOT_MEASURED: Narrates an outcome with no concrete change described, even
     loosely — "it went well", nothing quantified or observed?
     → YES: SIGNAL = impact_not_measured. CANDIDATE.

C4 — CONFLICT_STORY_SANITIZED: A disagreement/conflict story has no real stakes or
     tension — everything sounds smoothed over, resolved instantly?
     → YES: SIGNAL = conflict_story_sanitized. CANDIDATE.

C5 — REFLECTION_MISSING: Cannot name a specific learning from a story, or how it was
     later applied to a different situation?
     → YES: SIGNAL = reflection_missing. CANDIDATE.

C6 — CUSTOMER_FOCUS_MISSING: Talks ONLY from an internal perspective — no customer pain,
     goal, or outcome framing anywhere in the answer?
     → YES: SIGNAL = customer_focus_missing. CANDIDATE.

C7 — DECISION_LOGIC_OPAQUE: Describes a decision but never explains how options or risks
     were weighed — the decision is stated, not reasoned through?
     → YES: SIGNAL = decision_logic_opaque. CANDIDATE.

Output exactly ONE signal. Never null, never multiple.\
"""


async def _classify_signal_from_answer(
    *,
    candidate_answer: str,
    last_question: str,
    client: Any,
    llm_model: str,
    signals_already_fired: list | None = None,
) -> tuple[str, str | None, dict | None]:
    """
    Fallback: compare the answer against every content-level signal definition
    and return (signal, signal_reason). Called only when the main eval LLM
    failed to return a valid signal. Respects the variety rule.
    """
    _fired = set(signals_already_fired or [])
    _remaining = [name for name in SIGNAL_DEFINITIONS if name not in _fired]
    if not _remaining:
        _remaining = list(SIGNAL_DEFINITIONS.keys())
    _signal_descriptions = "\n".join(
        f'"{name}": {SIGNAL_DEFINITIONS[name]["trigger"]}'
        for name in _remaining
    )
    _system = (
        "You are a signal classifier for a SALES interview evaluation system.\n"
        "Given a question and a candidate's answer, pick the ONE signal from the list below "
        "that best describes the gap or pattern in the answer.\n"
        "Signals already fired on this topic have been EXCLUDED — pick only from the list.\n\n"
        f"SIGNALS (choose exactly one):\n{_signal_descriptions}\n\n"
        "Output ONLY valid JSON: {\"signal\": \"<signal_name>\", \"signal_reason\": \"<3-12 word exact quote from their answer>\"}\n"
        "signal MUST be exactly one of the signal names listed above. Nothing else."
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
        if not reason and chosen in SIGNAL_DEFINITIONS:
            reason = SIGNAL_DEFINITIONS[chosen]["trigger"]
        if chosen in _remaining:
            return chosen, reason, _usage
        if chosen in SIGNAL_DEFINITIONS:
            return chosen, reason, _usage
    except Exception as exc:
        logger.warning("[EVAL] _classify_signal_from_answer (sales) failed (%s) — rotating fallback", exc)
    _rotation_order = [
        "sales_tool_named_not_used", "strategy_choice_unjustified", "revenue_ownership_ambiguous",
        "deal_example_evaded", "impact_not_measured", "customer_focus_missing",
        "decision_logic_opaque", "deal_metrics_missing", "pipeline_thinking_weak",
        "objection_handling_theoretical", "conflict_story_sanitized", "reflection_missing",
    ]
    for name in _rotation_order:
        if name in _remaining:
            return name, SIGNAL_DEFINITIONS[name]["trigger"], _usage
    _fallback = _rotation_order[len(_fired) % len(_rotation_order)]
    return _fallback, SIGNAL_DEFINITIONS[_fallback]["trigger"], _usage


async def _call_scoring(
    *,
    candidate_answer: str,
    last_question: str,
    topic_follow_up_count: int,
    recent_context: str,
    client: Any,
    llm_model: str,
    org_id: str,
    level: int,
    active_topic: str,
    topic_probe_focus: str | None,
    job_title: str,
) -> tuple[dict, dict]:
    """
    Call 1 — quality scoring only (no signal logic). Sales-specific rubric:
    the four dimensions are the same names as tech (clarity/depth/specificity/
    grounding) for compatibility with TopicState/saturation math, but the
    definition of each is rewritten for sales substance instead of technical
    substance (a real number/deal/customer outcome vs. a real tool/mechanism).
    """
    def _build_scoring_system_prompt() -> str:
        ctx = (
            "You are an experienced sales leader scoring a candidate's answer in a live interview.\n"
            "Think like a VP of Sales who has hired and managed hundreds of reps.\n"
            "You know the difference between someone who actually carried a number and someone who\n"
            "talks about sales in the abstract.\n"
            "Output ONLY valid JSON:\n"
            '{"answers_question":true/false,"clarity":0-10,"depth":0-10,"specificity":0-10,"grounding":0-10,'
            '"reason":"<one phrase from their answer that drove your scoring call>"}\n\n'
            "STEP 1 — answers_question: Did the candidate's answer actually address the question that was asked?\n"
            "  true  = they engaged with the question, even partially or weakly.\n"
            "  false = the answer has NOTHING to do with the question — completely unrelated topic,\n"
            "          pure social filler ('Yeah I am ready'), or zero attempt at what was asked.\n"
            "  A vague or generic sales attempt is still answers_question=TRUE — score it low on\n"
            "  depth/specificity, do NOT set answers_question=false.\n"
            "  If answers_question = false, you MUST set clarity=0, depth=0, specificity=0, grounding=0.\n\n"
            "STEP 2 — Score normally (only if answers_question = true).\n\n"
            f"Role: {job_title or 'not specified'} | Topic: {active_topic or 'general'}\n"
        )
        if topic_probe_focus:
            ctx += f"Probe focus: {topic_probe_focus}\n"
        ctx += (
            "This is voice-transcribed speech — score the meaning, not the grammar.\n\n"
            "BEFORE YOU SCORE: Read the answer as a real sales leader would.\n"
            "Ask yourself: does this person sound like they've actually carried a bag and closed real "
            "deals, or are they describing what selling is supposed to sound like?\n\n"

            "── CLARITY (20%) ──────────────────────────────\n"
            "Did they answer what was actually asked — not a safer, easier version of it?\n"
            "Low (0-4): off-topic, tangent, or answered a related but different question.\n"
            "Mid (5-6): addressed the question but missed part of the intent or drifted.\n"
            "High (7-10): directly answered what was asked. You got what you needed.\n"
            f"{'LEVEL 1: forgive nervousness and rambling — did they try to answer it? ' if level == 1 else ''}"
            f"{'LEVEL 3/4: precision expected. Tangents and pivots lower the score. ' if level in (3, 4) else ''}\n\n"

            "── DEPTH (35%) ────────────────────────────────\n"
            "Did they explain the HOW and WHY of a real sales decision — or just describe the WHAT?\n"
            "Generic best-practices language ('I always build rapport first') is not depth — cap at 5.\n"
            "Low (0-4): described what happened, no reasoning behind it.\n"
            "Mid (5-6): gave a real reason for a choice but it's thin — one layer, no constraint behind it.\n"
            "High (7-10): explained a real decision AND why it made sense given the buyer, the account, "
            "or the deal's specific constraints. Best answers show cause-effect — what they tried, what "
            "happened, what they adjusted.\n"
            f"{'LEVEL 1: a simple genuine reason counts. One honest WHY = 5+.' if level == 1 else ''}"
            f"{'LEVEL 2: expect at least one real constraint or tradeoff behind a sales decision. Generic reasoning = 4 max.' if level == 2 else ''}"
            f"{'LEVEL 3: expect competing options considered and a real tradeoff explained. Single-reason answers = 5 max.' if level == 3 else ''}"
            f"{'LEVEL 4: expect strategic judgment — territory/team/process level thinking. No tradeoff = 6 max.' if level == 4 else ''}\n\n"

            "── SPECIFICITY (20%) ──────────────────────────\n"
            "Did they give operational detail that could only exist if they actually did this work?\n"
            "Real specificity: a real number (quota, ACV, win rate, cycle time, deal size), a named "
            "objection a real client raised, a specific account type or buyer persona, a real constraint "
            "they hit, an outcome that actually happened.\n"
            "Tool names without usage context = no specificity. 'It went well' = no specificity.\n"
            "Low (0-4): generic — anyone who read a sales blog could say this.\n"
            "Mid (5-6): one real operational detail that required being there.\n"
            "High (7-10): multiple real details that make the deal/story traceable to a real event.\n"
            f"{'LEVEL 1: any real detail counts, even small-scale internship/practice numbers.' if level == 1 else ''}"
            f"{'LEVEL 2: expect at least one real number or constraint. Vague operational language = 4 max.' if level == 2 else ''}"
            f"{'LEVEL 3/4: expect real scale and multiple concrete details. Generic descriptions = 3 max.' if level in (3, 4) else ''}\n\n"

            "── GROUNDING (25%) ────────────────────────────\n"
            "Does this answer sound like someone who was actually on the call/in the room — or someone "
            "describing what being there is supposed to sound like?\n"
            "Signs of real grounding: something didn't go as planned, they remember it imperfectly, "
            "the detail is specific to their deal (not generic to the domain), the outcome wasn't "
            "guaranteed, there's a real stakeholder or real deadline or real budget constraint.\n"
            "Signs of a hollow answer: perfect linear story (prospect → pitch → close), everything "
            "worked, nothing was hard, the outcome is vague.\n"
            "An answer with no stated result or outcome cannot score above 5.\n"
            "Low (0-4): plausible but hollow. Reads like a description of selling, not a memory of a deal.\n"
            "Mid (5-6): at least one grounding signal — a real result, a real friction point, a real constraint.\n"
            "High (7-10): the story has texture. Something was hard or imperfect or specific to that deal.\n"
            f"{'LEVEL 1: a real outcome from an internship or practice sale counts. A failure they learned from = 6+.' if level == 1 else ''}"
            f"{'LEVEL 2: expect at least one friction point or specific outcome. Clean perfect narrative = 4 max.' if level == 2 else ''}"
            f"{'LEVEL 3: expect real account/territory texture and real constraints. Smooth polished story with no friction = 4 max.' if level == 3 else ''}"
            f"{'LEVEL 4: expect reflection or judgment under uncertainty. A perfect linear story with no tradeoff = 3 max.' if level == 4 else ''}\n\n"
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
            metadata=llm_metadata(call_type="eval_scoring_sales", level=level, org_id=org_id or ""),
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
    signals_already_fired: list | None,
) -> tuple[str | None, str | None, dict]:
    """
    Call 2 — signal classification only, own reasoning budget. Chooses across
    both the technical and conversational sales signal families.
    """
    _CONTENT_SIGNALS = set(SIGNAL_DEFINITIONS.keys())
    _fired = set(signals_already_fired or [])
    _fired_content = _fired & _CONTENT_SIGNALS
    _remaining_content = _CONTENT_SIGNALS - _fired_content

    def _build_signal_system_prompt() -> str:
        _off_topic_was_fired = "off_topic" in _fired

        ban_block = ""
        if _fired_content and _remaining_content:
            ban_block = (
                f"\nHARD VARIETY RULE — CONTENT SIGNALS ALREADY FIRED ON THIS TOPIC: {', '.join(sorted(_fired_content))}.\n"
                f"These signals are BANNED for this turn. You MUST pick from the REMAINING set:\n"
                f"  {', '.join(sorted(_remaining_content))}\n"
                f"Reinterpret the answer through a different lens. Firing a banned signal is a HARD FAILURE.\n"
            )
        elif _fired_content and not _remaining_content:
            _lru = next(iter(s for s in (signals_already_fired or []) if s in _CONTENT_SIGNALS), None)
            ban_block = (
                f"\nALL content signals have fired on this topic: {', '.join(sorted(_fired_content))}.\n"
                f"Variety is impossible. Pick the best fit; prefer the least-recently-used"
                + (f" ({_lru!r}).\n" if _lru else ".\n")
            )

        special_note = ""
        if _off_topic_was_fired:
            special_note = (
                "\nSPECIAL NOTE: off_topic already fired on a previous turn (likely a non-answer like "
                "'I am ready'). If this answer is AT ALL related to the topic — even vaguely — do NOT "
                "re-fire off_topic. Score it on content gates instead.\n"
            )

        return (
            "You are a signal classifier for a SALES interview evaluation system.\n"
            "Your ONLY job is to identify ONE signal that best describes the gap in the candidate's answer.\n\n"
            "You may reason briefly (2-4 sentences) before giving your final answer, but your final output\n"
            "MUST end with valid JSON on its own line:\n"
            '{"signal": "<signal_name>", "signal_reason": "<3-12 word exact quote from their answer>"}\n\n'
            "signal MUST be exactly one of the 12 valid signal names listed below. NEVER null.\n"
            f"Topic: {active_topic or 'general'}\n"
            + ban_block
            + special_note
            + "\n"
            + _build_signal_prompt_block()
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
            metadata=llm_metadata(call_type="eval_signal_sales", org_id=org_id or ""),
        ),
        timeout=30.0,
    )

    raw = resp.choices[0].message.content or ""

    from billing.billing import extract_usage as _extract_usage  # noqa: PLC0415
    _llm_usage = _extract_usage(resp, llm_model) if resp else {
        "model": llm_model, "inputTokens": 0, "outputTokens": 0, "cachedInputTokens": 0,
    }

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
                    _defn = SIGNAL_DEFINITIONS.get(_sig) or RESPONSE_SIGNALS.get(_sig)
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
    level: int = 2,
    active_topic: str = "",
    topic_probe_focus: str | None = None,
    job_title: str = "",
    signals_already_fired: list | None = None,
) -> dict:
    """
    Two dedicated LLM calls: Call 1 scores the answer, Call 2 classifies the signal.
    Sales-module version of interview.tech.scoring.evaluate_answer — same contract,
    same return shape, so interview.tech.eval / conversational.eval can share the
    exact same orchestration code.
    """
    if is_warmup:
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0, "overall": 0.0,
            "is_warmup": True,
            "action": "MOVE_ON", "forced_action": True,
            "signal": None, "signal_reason": None, "reason": "warmup turn",
        }

    if not candidate_answer or not candidate_answer.strip():
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0, "overall": 0.0,
            "action": "MOVE_ON", "forced_action": True,
            "signal": "pure_denial", "signal_reason": None, "reason": "empty answer",
        }

    word_count = len(candidate_answer.strip().split())
    recent_context = "\n".join(transcript_lines[-6:]) if transcript_lines else ""

    logger.info(
        "[EVAL:sales] > evaluate_answer (2-call) | model=%s words=%d follow_ups=%d topic=%s",
        llm_model, word_count, topic_follow_up_count, active_topic or "?",
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
        (scoring_data, _scoring_usage), (raw_signal, signal_reason, _signal_usage) = (
            await asyncio.gather(
                _call_scoring(
                    **_common_kwargs,
                    topic_follow_up_count=topic_follow_up_count,
                    level=level,
                    topic_probe_focus=topic_probe_focus,
                    job_title=job_title,
                ),
                _call_signal_classification(
                    **_common_kwargs,
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
            logger.info("[EVAL:sales] answers_question=false — forcing all scores to 0")
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

        _response_signals = {
            "pure_denial": ("MOVE_ON", True),
            "denial_with_continuation": ("CAP_SCORES", False),
            "clarification_request": ("REPHRASE", True),
            "rephrase_request": ("ACCEPT_REPHRASE", True),
            "off_topic": ("REDIRECT", True),
        }

        action = "PROBE"
        forced_action = False
        cap_scores_at_5 = False
        zero_scores = False

        if signal in _response_signals:
            action, forced_action = _response_signals[signal]
            if signal == "denial_with_continuation":
                cap_scores_at_5 = True
            elif signal in ("pure_denial", "clarification_request", "off_topic", "rephrase_request"):
                zero_scores = True

        if signal not in _response_signals and signal not in SIGNAL_DEFINITIONS and signal is not None:
            logger.warning("[EVAL:sales] unknown signal %r — ignoring", signal)
            signal = None

        if signal is None and not zero_scores and not cap_scores_at_5:
            signal, signal_reason, _fallback_usage = await _classify_signal_from_answer(
                candidate_answer=candidate_answer,
                last_question=last_question,
                client=client,
                llm_model=llm_model,
                signals_already_fired=signals_already_fired,
            )
            if _fallback_usage:
                _eval_llm_usages.append(_fallback_usage)
            logger.info("[EVAL:sales] signal was None — best-match classification selected %r", signal)

        signal_reason = str(signal_reason or "").strip() or None
        if signal is None:
            signal_reason = None

        _CONTENT = set(SIGNAL_DEFINITIONS.keys())
        _already = set(signals_already_fired or [])
        _fired_content = _already & _CONTENT
        if signal in _CONTENT and signal in _fired_content:
            _remaining = _CONTENT - _fired_content
            if _remaining:
                _reroll, _reroll_reason, _reroll_usage = await _classify_signal_from_answer(
                    candidate_answer=candidate_answer,
                    last_question=last_question,
                    client=client,
                    llm_model=llm_model,
                    signals_already_fired=list(_fired_content),
                )
                if _reroll_usage:
                    _eval_llm_usages.append(_reroll_usage)
                if _reroll and _reroll != signal:
                    logger.info(
                        "[EVAL:sales] variety-enforcement: LLM picked banned %r on topic — rerolled to %r",
                        signal, _reroll,
                    )
                    signal = _reroll
                    signal_reason = _reroll_reason

        reason = str(data.get("reason", ""))[:120]

        if zero_scores:
            clarity = 0.0
            depth = 0.0
            specificity = 0.0
            grounding = 0.0
            overall = 0.0
            reason = f"{signal} — no scoring"
        elif cap_scores_at_5:
            clarity = min(clarity, 5.0)
            depth = min(depth, 5.0)
            specificity = min(specificity, 5.0)
            grounding = min(grounding, 5.0)
            overall = min(overall, 5.0)
            reason = "denial with continuation — scores capped at 5"

        logger.info(
            "[EVAL:sales] [OK] signal=%s action=%s | clarity=%d depth=%d spec=%d ground=%d | reason=%s",
            signal, action,
            int(clarity), int(depth), int(specificity), int(grounding),
            repr(reason),
        )
        if signal_reason:
            logger.info("[EVAL:sales] signal_reason=%r", signal_reason)

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

    except (asyncio.TimeoutError, Exception) as e:
        _is_timeout = isinstance(e, asyncio.TimeoutError)
        logger.error(
            "[EVAL:sales] evaluate_answer %s (%s) — returning low-confidence recovery",
            "timed out" if _is_timeout else "failed", e,
        )
        return {
            "clarity": 2.0, "depth": 1.0, "specificity": 1.0, "grounding": 1.0,
            "overall": 1.3,
            "action": "PROBE",
            "signal": None,
            "signal_reason": None,
            "reason": "eval recovery (llm slow/unavailable)",
            "is_eval_recovery": True,
        }
