"""
interview/conversational/report.py
===================================
Sales-module post-interview report pipeline. Reuses every domain-agnostic
piece of interview.tech.report unchanged (Pydantic domain models, IntegrityEngine,
SkillFilter, ReportLLMClient, BehavioralAnalyzer, AnswerIntegrityAnalyzer,
IntegrityNarrator, the signals/assemble LangGraph nodes, DB persistence) and
overrides only the domain-specific prompt layer: the eval rubric, skills
breakdown rubric, summary bullets, and hiring verdict — rewritten so a
candidate is judged as a salesperson (quota, deals, objections, customer
outcomes) instead of as an engineer (JD knowledge, technical problem solving).

The 5-dimension weighted framework (30/25/20/15/10) is kept — it is a
reasonable generic hiring rubric — but "JD Knowledge" is relabeled "Role Fit"
and every dimension's scoring guidance is rewritten for sales substance.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, Optional

from langgraph.graph import END, StateGraph
from typing_extensions import TypedDict

from interview.agent_runtime_support import DATABASE_URL
from interview.slack_error_logger import log_llm_error
from interview.agent_utils import truncate_to_tokens
from billing.billing import record_external_billing_usage as _persist_billing

# Reused verbatim -- domain-agnostic building blocks.
from interview.tech.report import (
    LLMEvalDimension,
    LLMEvalResponse,
    LLMSkillEntry,
    LLMSkillsResponse,
    ReportState,
    IntegrityEngine,
    SkillFilter,
    LLMCallSpec,
    ReportLLMClient,
    BehavioralAnalyzer,
    AnswerIntegrityAnalyzer,
    IntegrityNarrator,
    _ANSWER_INTEGRITY_JSON_SCHEMA,
    _ANSWER_INTEGRITY_FLAG_THRESHOLD,
    _build_answer_integrity_event,
    _build_resume_claims_block,
    _build_turn_windows,
    _attach_question_context,
    _node_signals,
    _llm,
    _behavioral_analyzer,
    _answer_integrity_analyzer,
    _answer_integrity_noop,
    _integrity_narrator,
)

logger = logging.getLogger("interview-agent")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Sales-specific static LLM prompts + JSON schemas.
# System prompts are byte-identical on every call -> prompt cache hits.
# Compact field names (rf/ps/ec/cm/od) match interview.tech.report's shape so
# LLMEvalResponse / _parse_eval_compact / the weighted formula are reusable
# unchanged -- only what "rf" (Role Fit, was "jk"/JD Knowledge) MEASURES changes.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_EVAL_SYSTEM = """You are a senior sales leader and talent evaluator. You have been handed a complete AI-conducted interview transcript and the job description the candidate applied for.

YOUR EVALUATION FRAMEWORK
==========================
Before scoring anything, determine the candidate's experience level from the transcript:
- FRESHER: New to sales, 0-1 year experience, only has internships/practice sales/campus roles
- MID-LEVEL: 1-4 years, has carried a quota, works under a manager's coaching
- EXPERIENCED: 4+ years, owns territory/accounts, closes independently, may mentor others
This classification changes what "good" looks like on every dimension.

STEP 1 — Read the transcript fully. Form your opinions before outputting anything.

"str": UP TO 3 genuine strengths, one sharp sentence each, named to this specific candidate.
  A genuine strength is something that would still stand out even for a stronger candidate — not just
  "hit quota" or "closed deals."
  Example good: "Named the exact objection ('your price is 30 percent over what we budgeted') and walked through reframing around ROI instead of discounting."
  Example bad: "Good communication throughout."
  Do NOT manufacture a minor, surface-level correct answer as a "strength" just to fill the list. Some
  candidates genuinely have no strengths worth naming, and some genuinely have several — base the count
  strictly on what the transcript actually shows, in either direction.

"con": UP TO 3 genuine concerns, one sharp sentence each, no softening.
  Name the exact topic and what broke down (no numbers anywhere, contradicted resume, purely theoretical
  objection handling, refused to name a real deal under probing).
  Do NOT invent minor nitpicks just to fill the list. Some candidates genuinely have no real concerns, and
  some genuinely have several — base the count strictly on what the transcript actually shows, in either
  direction.

CONTRADICTION RULE:
  Do NOT list "admitted uncertainty", "was honest about not knowing a number", or any similar
  phrasing as a strength when the same candidate also failed to demonstrate real deal knowledge
  of that topic. Being honest about a gap is not a differentiating strength — it is the
  bare minimum. A strength must be a genuinely positive signal, not merely the absence
  of dishonesty. If you flag a concern about topic X, you cannot also list "admitted
  they didn't know X" as a strength. Choose one or the other.



STEP 2 — Score 5 dimensions. Each score requires:
- "s": integer 0-100 (use the FULL range — do NOT cluster around 50-70)
- "ev": ONE sharp sentence starting with a specific action/quote from the interview. No generic praise.
  Example good: "Described the exact objection about implementation timeline they got from a VP prospect and the specific compromise they offered."
  Example bad: "Showed good knowledge of sales process."

SCORING PHILOSOPHY:
  0-20  = Blank, wrong, or pure filler. No usable signal.
  21-45 = Surface only. Sales vocabulary without real deal mechanics. Pattern-matched a textbook answer.
  46-65 = Partial. Real in 1-2 areas, gaps elsewhere. Needed probing to get anything useful.
  66-80 = Solid. Concrete deals/numbers. Named accounts, objections, decisions. Held most probes.
  81-100 = Deep and specific. Real quota/ACV numbers, real objections handled, step-by-step. Held every probe including unexpected ones.

---
DIMENSION 1 — rf (Role Fit, weight 30%)
Does this candidate understand the actual role they applied for? Score how well their answers align with
the specific segment, motion (inbound/outbound, SMB/enterprise, transactional/complex), and expectations
stated in the JD.

FRESHER baseline: Score based on relevant internships, practice sales, or campus-level selling that touch
  the JD's motion.
  A fresher who ran cold outreach in an internship matching the JD's motion and can explain it mechanically = 55-65.
  A fresher who can only name sales terminology from the JD without any real attempt = 25-35.

EXPERIENCED baseline: Score based on direct, quota-carrying experience with the JD's segment/motion.
  Claims 3 years selling but cannot explain how they actually ran a deal in that segment = max 35.
  Demonstrated hands-on knowledge of the specific JD motion with real deal evidence = 70-85.

SCORING ANCHORS:
  0-20:  No connection to role requirements. Answered generic sales questions but showed no fit for this specific motion/segment.
  21-45: Knows sales terminology from the JD but cannot explain how it applies in context of this role's motion.
  46-65: Relevant experience in 1-2 JD areas. Missing coverage of key requirements (e.g. never sold at this deal size).
  66-80: Solid alignment with JD. Named specific deals/accounts matching the JD's motion with working examples.
  81-100: Exceptional fit. Covered all major JD requirements with specific, verifiable deal evidence.

---
DIMENSION 2 — ps (Deal Reasoning, weight 25%)
This is NOT about whether they closed the deal. It measures HOW they reason through sales situations:
- Did they frame the account/buyer situation before answering? (structured approach)
- Did they name tradeoffs without being prompted (discount vs. terms, speed vs. deal size)? (depth of thinking)
- When given a follow-up or counter-example, did they adapt or repeat the same answer? (adaptability)
- Did they ask a clarifying question when a scenario was ambiguous? (intellectual honesty)
- Did they reason about why a deal stalled, what the real blocker was, second-order effects on the account? (systems thinking)
- When they didn't know something, did they reason from first principles or go silent? (reasoning ability)

FRESHER baseline: Evaluate reasoning potential, not quota history.
  A fresher who cannot give a polished answer but clearly reasons through a sales scenario logically = 55-65.
  A fresher who goes silent or just says "I don't know" on every hard question = 15-25.

EXPERIENCED baseline: Evaluate structured independent reasoning, not just reciting known plays.
  Named tradeoffs, constraints, and decision factors without being asked = strong signal.
  Only gave the textbook sales-methodology answer and stalled on follow-ups = 30-45 regardless of seniority.

SCORING ANCHORS:
  0-20:  No reasoning. Restated the question. Went silent on every follow-up.
  21-45: Reactive. Answered surface but could not reason beyond it. No tradeoffs, no structure.
  46-65: Basic structure. Understood the scenario, gave a reasonable first answer, but fell apart under probing.
  66-80: Logical and adaptive. Named tradeoffs. Adapted when challenged. Handled most probes.
  81-100: Sophisticated. Framed independently. Named tradeoffs unprompted. Showed second-order thinking about the deal/account.

---
DIMENSION 3 — ec (Track Record Credibility, weight 20%)
Did their live answers hold up against what they claimed on their resume or in their intro?
This measures track-record credibility — whether the quota, deals, and results listed on
their resume are genuinely theirs, not testing raw sales knowledge.

FRESHER baseline: Do NOT penalize for lacking a full quota history.
  Evaluate whether the internships/practice sales listed on their resume are genuine and specific
  when discussed live:
  - Named the specific prospect type or campaign they worked, not just a generic sales title
  - Described their personal contribution (what "I" did vs what "we" did)
  - When probed on a resume item, could explain the actual approach they took
  - Could walk through a specific pushback they got and how they responded
  FRESHER whose resume claims hold up with strong specificity = 60-75.
  Vague descriptions that don't match their resume claims = 30-45.

EXPERIENCED baseline: Much higher bar.
  - Named specific outcomes with real numbers matching what's claimed on their resume
    (quota attainment, ACV, win rate, deals closed)
  - Described their personal decisions behind resume-listed results ("I chose to lead with X because...")
  - When probed on a resume claim, gave more detail, not vaguer answers
  - If their resume said they "owned" an account or territory, they could describe what that actually meant
  EXPERIENCED candidate whose resume claims strong quota attainment but gives vague, textbook answers on
  their own stated results = 20-35.

SCORING ANCHORS:
  0-20:  Major contradictions. Resume claims about significant results they cannot explain at all.
  21-45: Significant vagueness. Most resume claims were team-framed or contradicted under probing.
  46-65: Mixed. Some resume claims held up, others fell apart or stayed vague despite probing.
  66-80: Credible. Most resume claims backed with specific detail. Minor gaps.
  81-100: Fully credible. Every resume claim explained with evidence. Nothing contradicted.

---
DIMENSION 4 — cm (Communication, weight 15%)
Was their communication clear, direct, and structured across the entire interview? For a sales role
this dimension carries extra weight — how they communicate IS the job.
This is a threshold signal — a score below 30 fails regardless of other scores.

FRESHER baseline: Same standard as experienced. Clear thinking is independent of seniority.
Score based on:
  - Did they directly answer the question asked (not a related question)?
  - Was the answer followable without asking for clarification?
  - Did they structure their response (beginning, middle, point) — the same structure a good pitch needs?
  - Did they use excessive hedging ("I think maybe", "kind of", "sort of") throughout?
  - When corrected or challenged (like a real objection), did they respond clearly or become circular/defensive?

SCORING ANCHORS:
  0-20:  Incomprehensible. Circular. Could not land a point. Constant restarts.
  21-45: Frequently unclear. Heavy hedging. Lost the thread. Answered a different question.
  46-65: Passable. Followable but inconsistent. Structured sometimes, scattered in others.
  66-80: Clear and direct. Most answers structured. Landed the point. Minor slips.
  81-100: Precise and confident. Every answer structured. No wasted words. Held clarity under pressure — the way they'd need to on a real call.

---
DIMENSION 5 — od (Ownership, weight 10%)
Did they actually run, decide, or close — or did they participate and observe?
Do NOT score on confidence or communication style. Score ONLY on evidence of personal responsibility for a deal/account outcome.

FRESHER baseline: Ownership for freshers shows as:
  - "I" vs "we" in deal/campaign descriptions
  - Describing outreach or messaging decisions they made, even small ones
  - Going beyond the assignment (extra follow-up, a play they tried on their own initiative)
  - Curiosity about the buyer/market (asked a thoughtful question about the account)
  - Accountable when describing what went wrong ("I missed following up" not "the lead just went cold")

EXPERIENCED baseline: Much higher bar.
  - Named specific decisions they personally made on a deal with the tradeoffs they weighed
  - Described impact in first person with specific metrics (their number, their deals)
  - Showed what they do when no manager is directing the play
  - Described accountability in a loss ("I let that deal go quiet and lost it" vs "the deal just fell through")
  - Proactively mentioned going beyond their stated quota/role

SCORING ANCHORS:
  0-20:  Pure observer. Used "we" for everything. Blame-shifted on losses. Passive throughout.
  21-45: Minimal ownership. Some personal examples but mostly team-framed or passive.
  46-65: Present ownership. Owned their work in stated examples. Some proactive signals.
  66-80: Strong ownership. Clear personal contributions to deals. Initiative shown. Good accountability.
  81-100: Exceptional. Multiple unprompted examples of going beyond. High self-direction. Named personal impact on the number.
---
OUTPUT ONLY valid JSON matching the schema exactly. No markdown. No extra keys."""

_EVAL_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "eval_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "str": {"type": "array", "items": {"type": "string"}},
                "con": {"type": "array", "items": {"type": "string"}},
                "jk":  {"type": "object", "properties": {"s": {"type": "integer"}, "ev": {"type": "string"}}, "required": ["s", "ev"], "additionalProperties": False},
                "ps":  {"type": "object", "properties": {"s": {"type": "integer"}, "ev": {"type": "string"}}, "required": ["s", "ev"], "additionalProperties": False},
                "ec":  {"type": "object", "properties": {"s": {"type": "integer"}, "ev": {"type": "string"}}, "required": ["s", "ev"], "additionalProperties": False},
                "cm":  {"type": "object", "properties": {"s": {"type": "integer"}, "ev": {"type": "string"}}, "required": ["s", "ev"], "additionalProperties": False},
                "od":  {"type": "object", "properties": {"s": {"type": "integer"}, "ev": {"type": "string"}}, "required": ["s", "ev"], "additionalProperties": False},
            },
            "required": ["str", "con", "jk", "ps", "ec", "cm", "od"],
            "additionalProperties": False,
        },
    },
}
# NOTE: the JSON schema keys stay "jk"/"ps"/"ec"/"cm"/"od" (not "rf") so
# _parse_eval_compact from interview.tech.report (which maps jk->jd_knowledge)
# can be reused unmodified below via _parse_eval_compact_sales. "jk" here
# means "Role Fit" for the sales module -- see _EVAL_SYSTEM's "rf" dimension
# name in the prompt text; the wire format is kept jk for code reuse.

_SKILLS_FROM_RECORDS_SYSTEM = """You are a senior sales evaluator writing a skill breakdown for the hiring team after a structured AI interview.
You will receive structured topic records from the interview.

YOUR JOB:
Group the topics discussed into 3-5 broad SALES CATEGORIES based on what was actually discussed in the interview.
Do NOT create a category if there is no interview evidence for it.
Examples of good category names: "Outbound Prospecting", "Deal Negotiation", "Objection Handling",
"Pipeline Management", "Account Management", "Discovery & Qualification", "Closing".

FOR EACH CATEGORY:
- skill: A concise, industry-standard category name (e.g. "Objection Handling", "Pipeline Management")
- score: 1-10 reflecting actual demonstrated ability. Use the full range. Do NOT cluster around 5-7.
  1-3: Could not explain even basics when asked. Major gaps.
  4-5: Knew terminology but couldn't explain mechanics. Surface-level only.
  6-7: Explained concepts correctly. Some hands-on deal experience. Gaps when probed deeper.
  8-9: Demonstrated real working knowledge. Held probes. Gave specific deal/number details.
  10: Exceptional depth. Could coach others on this. No gaps found.
- evidence: A detailed paragraph (4-6 sentences) explaining exactly why this score was given.
  Reference specific questions, the candidate's actual answers, whether they held up under probing,
  what they got right, what they missed, and what it means about their practical selling capability.
  NO generic praise. NO sentences that could apply to any other candidate.

SCORING ADJUSTMENTS:
- If the candidate said "I don't know" or denied a topic -> cap that category at 3.
- If they answered vaguely and couldn't give specifics when probed -> cap at 5.
- If they answered confidently AND held up to 1+ follow-up probes -> bump up by 1.

OUTPUT ONLY valid JSON matching the schema exactly. No markdown."""

_SKILLS_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "skills_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "skills": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "skill":    {"type": "string", "description": "The dynamic category name, e.g., 'Objection Handling'"},
                            "score":    {"type": "integer"},
                            "evidence": {"type": "string", "description": "In-depth analysis of why this score was given"},
                        },
                        "required": ["skill", "score", "evidence"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["skills"],
            "additionalProperties": False,
        },
    },
}

_SUMMARY_SYSTEM = """You are a senior talent partner writing a post-interview brief for the hiring team after a sales interview.
Write EXACTLY 3 bullet points. Each bullet is ONE crisp sentence.
Rules:
- Bullet 1: The single most important sales signal from this interview. Name the exact deal/topic and what they demonstrated or failed to demonstrate. Include what they said.
- Bullet 2: The single biggest overall takeaway about this candidate's fit and trajectory for the role (not a behavioral or communication observation — that's covered in the Behavioral Analysis section). Focus on what it means for the hiring decision.
- Bullet 3: One sharp hiring implication. What does this person look like carrying a quota 30 days in? What is the risk or gain?
- No softening. No filler. Every sentence unique to this candidate. No scores or numbers.
- Start each with a dash (-).
OUTPUT ONLY the 3 dashes. No markdown. No extra text."""

_VERDICT_SYSTEM = """You are a senior sales hiring manager (VP of Sales) making the final call after an interview.
You have the full picture: dimension scores, skill ratings, strengths, concerns, and interview evidence.

YOUR JOB:
Make a single, conclusive hiring decision with an evidence-backed score and justification.
Recruiters will rely on this to make or kill an offer. Be precise and accountable.

SCORING THE CANDIDATE (0-100):
You are given a COMPUTED WEIGHTED SCORE derived deterministically from the dimension scores — use it as
your starting anchor. Adjust it up or down by at most ~10 points based on the evidence, strengths, and
concerns text; do not ignore it and invent an unrelated number.

Map your judgment to the DIMENSION SCORES you were given:
1. Role Fit (30%) — maps to fit for this role's segment/motion
2. Deal Reasoning (25%) — maps to Problem Solving
3. Track Record Credibility (20%) — maps to Experience/Resume Credibility
4. Communication (15%) — maps to Communication
5. Ownership (10%) — maps to Ownership

Score based ONLY on the actual evidence in front of you — do not default to a middling number out of
caution, and do not push toward the extremes to "spread things out" either. A candidate who is genuinely
average — solid in some areas, weak in others, unremarkable overall — should score in the middle of the
range; that is a correct score, not a failure to differentiate. Reserve high scores for evidence of
genuinely strong, well-rounded performance, and low scores for evidence of genuinely weak or evasive
performance. The goal is an accurate score for THIS candidate, not an even distribution across candidates.


SCORE CALIBRATION:
0-30: Major gaps in basics. Cannot perform the role.
31-50: Surface-level knowledge only. High ramp-up cost. Significant risk.
51-65: Some competence but key gaps. Hire only for junior/SDR-style roles with mentorship.
66-79: Solid candidate. Some depth missing but capable. Hold if senior quota-carrying role, hire if junior.
80-89: Strong performer. Can carry a quota immediately. Minor gaps acceptable.
90-100: Exceptional. Exceeds bar for the role.


DECISION RULES:
- "Hire": score >= 70 AND no critical gaps in role-required sales skills.
- "Hold": score 50-69 OR strong in some areas but missing a key requirement.
- "Reject": score < 50 OR demonstrated inability in core role requirements.

JUSTIFICATION — Write 3 sharp bullet points starting with "-":
- Bullet 1: The single strongest positive signal from the entire interview. Name the exact deal/topic, what they said or did, and why it matters for this role.
- Bullet 2: The single biggest gap, risk, or concern. Name the specific moment where they failed or fell short. Be blunt.
- Bullet 3: The final verdict sentence. State the decision clearly, name the key reason, and what should happen next (move forward, hold for X reason, reject because Y).
No score numbers. No hedging. No generic language. Every sentence must be specific to this candidate's actual interview performance.

OUTPUT ONLY valid JSON matching the provided schema EXACTLY. No markdown fences."""

_VERDICT_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "verdict_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "decision":      {"type": "string", "enum": ["Hire", "Hold", "Reject"]},
                "score":         {"type": "integer", "description": "Holistic 0-100 score based on the entire interview."},
                "justification": {"type": "string", "description": "Concise, evidence-backed justification paragraph."}
            },
            "required": ["decision", "score", "justification"],
            "additionalProperties": False,
        },
    },
}


def _parse_eval_compact(raw: str) -> LLMEvalResponse:
    """Map compact field names (jk/ps/ec/cm/od) back to full LLMEvalResponse model.
    "jk" carries the Role Fit dimension for the sales module -- see the wire-format
    note above _SKILLS_FROM_RECORDS_SYSTEM."""
    data = json.loads(raw)

    def _dim(key: str) -> LLMEvalDimension:
        d = data.get(key, {})
        return LLMEvalDimension(score=d.get("s", 0), evidence=d.get("ev", ""))

    return LLMEvalResponse(
        jd_knowledge=_dim("jk"),
        problem_solving=_dim("ps"),
        experience_credibility=_dim("ec"),
        communication=_dim("cm"),
        ownership=_dim("od"),
        strengths=list(data.get("str", [])),
        concerns=list(data.get("con", [])),
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LangGraph nodes -- signals + assemble reused verbatim from interview.tech.report
# (imported above). Only llm_calls is redefined here to swap in the sales prompts.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def _node_llm_calls(state: ReportState) -> dict:
    """Node 2: eval + skills + behavioral analysis — all three in parallel.
    Sales-module mirror of interview.tech.report._node_llm_calls: identical
    orchestration, sales-specific prompts."""
    llm_default        = state["llm_model"]
    job_title        = state.get("job_title", "")
    org_id           = state.get("org_id") or ""
    app_id           = state.get("app_id", "")
    integrity_result = state["integrity_result"]
    topic_records    = state.get("topic_records") or []
    behavioral_signals = state.get("behavioral_signals", [])
    transcript_lines = state.get("transcript_lines", [])
    interview_scores = state.get("interview_scores", [])
    is_test          = state.get("is_test", False)

    lines_to_use  = transcript_lines[4:] if len(transcript_lines) > 4 else transcript_lines
    transcript_text = truncate_to_tokens("\n".join(lines_to_use), 5000)
    resume_context = _build_resume_claims_block(state.get("resume_json") or {})
    eval_user = (
        f"Role: {job_title}\n"
        f"JD Context: {state['jd_context']}\n"
        f"CANDIDATE RESUME (ground truth for Track Record Credibility dimension):\n{resume_context}\n\n"
        f"Integrity Score: {integrity_result['score']}/100 ({integrity_result['band']})\n"
        f"Behavioral flags: {state['signal_context']}\n\n"
        f"Full Interview Transcript:\n{transcript_text}"
    )

    records_lines: list[str] = []
    for i, rec in enumerate(topic_records, 1):
        topic_turns = [s for s in interview_scores if s.get("topic") == rec.get("topic")]
        turns_block = (
            "\n".join(
                f"  Q: {str(t.get('question', '')).strip()[:200]}\n"
                f"  A: {str(t.get('answer', '')).strip()[:300]}\n"
                f"  [clarity={t.get('clarity', 0)} depth={t.get('depth', 0)} "
                f"specificity={t.get('specificity', 0)} grounding={t.get('grounding', 0)} "
                f"overall={t.get('overall', 0)}]"
                for t in topic_turns
            )
            if topic_turns else "  No per-turn scores available."
        )
        records_lines.append(
            f"[TOPIC {i}] {rec.get('topic', '')}\n{turns_block}\n"
        )
    skills_user = (
        f"Role: {job_title}\n\n" + "\n".join(records_lines)
        if records_lines else f"Role: {job_title}\n\nNo interview topics found."
    )
    logger.info("[REPORT:sales] Skills: topic_records path (%d topics)", len(topic_records))

    _total_turns   = len(interview_scores)
    session_duration = int(
        (state.get("proctoring_data") or {}).get("session_duration")
        or _total_turns * 90
    )

    answer_integrity_enabled = state.get("answer_integrity_enabled", False)
    _answer_integrity_task = (
        _answer_integrity_analyzer.analyze(
            transcript_lines=transcript_lines,
            _LLM_DEFAULT=llm_default,
            org_id=org_id,
            app_id=app_id,
        )
        if answer_integrity_enabled
        else _answer_integrity_noop()
    )

    (
        (eval_raw, eval_usage),
        (skills_raw, skills_usage),
        (behavioral_result, beh_usages),
        (answer_integrity_result, answer_integrity_usages),
    ) = (
        await asyncio.gather(
            _llm.call(LLMCallSpec(
                system=_EVAL_SYSTEM,
                user=eval_user,
                max_tokens=1100,
                timeout=55.0,
                response_format=_EVAL_JSON_SCHEMA,
                call_type="report_eval_sales",
                org_id=org_id,
                app_id=app_id,
                _LLM_DEFAULT=llm_default,
            )),
            _llm.call(LLMCallSpec(
                system=_SKILLS_FROM_RECORDS_SYSTEM,
                user=skills_user,
                max_tokens=700,
                timeout=45.0,
                response_format=_SKILLS_JSON_SCHEMA,
                call_type="report_skills_sales",
                org_id=org_id,
                app_id=app_id,
                _LLM_DEFAULT=llm_default,
            )),
            _behavioral_analyzer.analyze(
                transcript_lines=transcript_lines,
                answer_scores=interview_scores,
                duration_sec=session_duration,
                behavioral_signals=behavioral_signals,
                _LLM_DEFAULT=llm_default,
                org_id=org_id,
                app_id=app_id,
            ),
            _answer_integrity_task,
        )
    )

    _all_integrity_events = list((state.get("proctoring_data") or {}).get("events", []))
    answer_integrity_flagged = (
        answer_integrity_enabled
        and answer_integrity_result["score"] >= _ANSWER_INTEGRITY_FLAG_THRESHOLD
    )
    if answer_integrity_flagged:
        _all_integrity_events.append(_build_answer_integrity_event(answer_integrity_result))

    integrity_narratives, integrity_narrative_usages = await _integrity_narrator.analyze(
        _all_integrity_events,
        _LLM_DEFAULT=llm_default,
        org_id=org_id,
        app_id=app_id,
    )

    _report_ctx = {
        "applicationId": app_id,
        "candidateName": state.get("candidate_name", ""),
        "jobTitle": job_title,
        "eventId": f"interview:{app_id}:report",
        "isTest": is_test,
    }
    def _bill(usage: dict) -> Any:
        usage = {**usage, "context": _report_ctx}
        return _persist_billing(org_id, "interviewReport", usage)
    if org_id:
        billing_tasks = [
            _bill(_llm.usage_dict(eval_usage, llm_default)),
            _bill(_llm.usage_dict(skills_usage, llm_default)),
            *[_bill(bu) for bu in beh_usages],
            *[_bill(au) for au in answer_integrity_usages],
            *[_bill(nu) for nu in integrity_narrative_usages],
        ]
        try:
            await asyncio.gather(*billing_tasks)
        except Exception as _bill_err:
            logger.error("[BILLING] interviewReport (sales) billing failed (non-fatal): %s", _bill_err)

    try:
        eval_result = _parse_eval_compact(eval_raw)
    except Exception as e:
        logger.warning("[REPORT:sales] eval parse failed: %s | raw=%s", e, eval_raw[:200])
        eval_result = LLMEvalResponse()

    try:
        skills_result = LLMSkillsResponse.model_validate(json.loads(skills_raw))
    except Exception as e:
        logger.warning("[REPORT:sales] skills parse failed: %s | raw=%s", e, skills_raw[:200])
        skills_result = LLMSkillsResponse()

    logger.info(
        "[REPORT:sales] LLM done: app=%s rf=%d ps=%d ec=%d cm=%d od=%d skills=%d behavioral=%d",
        app_id,
        eval_result.jd_knowledge.score, eval_result.problem_solving.score,
        eval_result.experience_credibility.score, eval_result.communication.score,
        eval_result.ownership.score, len(skills_result.skills),
        len(behavioral_result.get("points", [])),
    )
    return {
        "eval_result":        eval_result,
        "skills_result":      skills_result,
        "behavioral_analysis": behavioral_result,
        "answer_integrity_result": answer_integrity_result,
        "integrity_narratives": integrity_narratives,
    }


async def _node_assemble(state: ReportState) -> dict:
    """Node 3: assemble final scorecard blob and write to DB. Sales-module
    mirror of interview.tech.report._node_assemble — identical formula and DB
    write, "JD Knowledge" relabeled "Role Fit" in the persisted dimension name."""
    app_id           = state["app_id"]
    org_id           = state.get("org_id")
    proctoring_data  = state.get("proctoring_data") or {}
    eval_result      = state["eval_result"]
    skills_result    = state.get("skills_result") or LLMSkillsResponse()
    integrity_result = state["integrity_result"]
    behavioral_analysis = state.get("behavioral_analysis") or {"points": []}
    behavioral_signals  = state.get("behavioral_signals", [])
    answer_integrity_result = state.get("answer_integrity_result") or AnswerIntegrityAnalyzer._empty_result()
    integrity_signals_analysis = state.get("integrity_narratives") or {}

    answer_integrity_enabled = state.get("answer_integrity_enabled", False)
    answer_integrity_flagged = answer_integrity_enabled and answer_integrity_result["score"] >= _ANSWER_INTEGRITY_FLAG_THRESHOLD
    if answer_integrity_flagged:
        answer_integrity_event = _build_answer_integrity_event(answer_integrity_result)
        proctoring_data = {
            **proctoring_data,
            "events": [*proctoring_data.get("events", []), answer_integrity_event],
        }
        integrity_result = IntegrityEngine.score(proctoring_data["events"])
        if app_id and DATABASE_URL:
            try:
                from interview.agent_persistence import DatabasePool
                pool = await DatabasePool.get()
                async with pool.acquire() as conn:
                    row = await conn.fetchrow(
                        'SELECT "proctoringEvents" FROM "Interview" WHERE "applicationId" = $1 LIMIT 1',
                        app_id,
                    )
                    existing: list = []
                    if row and row["proctoringEvents"]:
                        raw = row["proctoringEvents"]
                        existing = raw if isinstance(raw, list) else (
                            json.loads(raw) if isinstance(raw, str) else []
                        )
                    await conn.execute(
                        """UPDATE "Interview" SET "proctoringEvents" = $1, "interviewUpdatedAt" = NOW()
                           WHERE "applicationId" = $2""",
                        json.dumps(existing + [answer_integrity_event]),
                        app_id,
                    )
            except Exception as e:
                logger.error("[ANSWER_INTEGRITY] Failed to persist answer_integrity event for %s: %s", app_id, e)

    rf  = eval_result.jd_knowledge.score
    ps  = eval_result.problem_solving.score
    ec  = eval_result.experience_credibility.score
    cm  = eval_result.communication.score
    od  = eval_result.ownership.score

    overall_score = max(0, min(100, round(
        rf * 0.30 + ps * 0.25 + ec * 0.20 + cm * 0.15 + od * 0.10
    )))

    skill_ratings_list = [
        {"skill": r.skill, "score": r.score, "evidence": r.evidence}
        for r in skills_result.skills
        if r.skill
    ]
    skills_evaluated = [r["skill"] for r in skill_ratings_list]

    signal_analysis = {
        "behavioral_signals": behavioral_signals,
        "behavioral_signals_analysis": behavioral_analysis.get("points", []),
        "integrity_analysis": {
            "narratives": integrity_signals_analysis,
            "answer_integrity": {
                "enabled":             answer_integrity_enabled,
                "score":               answer_integrity_result["score"],
                "flagged":             answer_integrity_flagged,
                "reason":              answer_integrity_result["reason"],
                "phrasing_score":      answer_integrity_result["phrasing_score"],
                "phrasing_reason":     answer_integrity_result["phrasing_reason"],
                "consistency_score":   answer_integrity_result["consistency_score"],
                "consistency_reason":  answer_integrity_result["consistency_reason"],
                "quotes":              answer_integrity_result["quotes"],
            },
        },
    }

    score_breakdown_report = {
        "dimensions": [
            {"name": "Role Fit",                 "score": rf, "evidence": eval_result.jd_knowledge.evidence},
            {"name": "Deal Reasoning",            "score": ps, "evidence": eval_result.problem_solving.evidence},
            {"name": "Track Record Credibility",  "score": ec, "evidence": eval_result.experience_credibility.evidence},
            {"name": "Communication",             "score": cm, "evidence": eval_result.communication.evidence},
            {"name": "Ownership",                "score": od, "evidence": eval_result.ownership.evidence},
        ],
        "overall":   overall_score,
        "integrity": {
            "score":        integrity_result["score"],
            "band":         integrity_result["band"],
            "signals_used": integrity_result.get("signals_used", []),
            "methodology":  "signal_weighted_deterministic",
        },
        "skills_evaluated": skills_evaluated,
    }

    interview_summary_report = {
        "strengths": eval_result.strengths,
        "concerns":  eval_result.concerns,
    }

    try:
        from interview.agent_persistence import DatabasePool
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE "Interview"
                   SET "aiScoreBreakdown"  = $1,
                       "aiSkillRatings"    = $2,
                       "proctoringAnalysis" = $3,
                       "aiInterviewSummary" = $4
                   WHERE "applicationId"  = $5""",
                json.dumps(score_breakdown_report),
                json.dumps(skill_ratings_list),
                json.dumps(signal_analysis),
                json.dumps(interview_summary_report),
                app_id,
            )

        logger.info(
            "[REPORT:sales] Written: app=%s overall=%d rf=%d ps=%d ec=%d cm=%d od=%d "
            "integrity=%d skills=%d behavioral_points=%d",
            app_id, overall_score, rf, ps, ec, cm, od,
            integrity_result["score"], len(skills_evaluated),
            len(behavioral_analysis.get("points", [])),
        )
    except Exception as e:
        logger.error("[REPORT:sales] DB write failed for %s: %s", app_id, e, exc_info=True)

    scores_context = {
        "overall":                overall_score,
        "jd_knowledge":           rf,
        "problem_solving":        ps,
        "experience_credibility": ec,
        "communication":          cm,
        "ownership":              od,
        "integrity_score":        integrity_result["score"],
        "integrity_band":         integrity_result["band"],
        "skills_evaluated":       skills_evaluated,
        "signal_summary":         state.get("signal_context", "none"),
        "dimensions":             score_breakdown_report["dimensions"],
        "skill_ratings":          skill_ratings_list,
        "strengths":              eval_result.strengths,
        "concerns":               eval_result.concerns,
        "behavioral_points":      behavioral_analysis.get("points", []),
        "integrity_signals_analysis": integrity_signals_analysis,
        "answer_integrity":       signal_analysis["integrity_analysis"]["answer_integrity"],
    }
    return {"scores_context": scores_context}


def _build_report_graph() -> Any:
    builder = StateGraph(ReportState)  # type: ignore
    builder.add_node("signals",   _node_signals)
    builder.add_node("llm_calls", _node_llm_calls)
    builder.add_node("assemble",  _node_assemble)
    builder.set_entry_point("signals")
    builder.add_edge("signals",   "llm_calls")
    builder.add_edge("llm_calls", "assemble")
    builder.add_edge("assemble",  END)
    return builder.compile()


_REPORT_GRAPH = _build_report_graph()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Public API -- same signatures as interview.tech.report so agent_persistence.py
# can call either module interchangeably based on interview_type.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def generate_interview_report(
    app_id:                str,
    transcript_lines:      list,
    answer_scores:         list,
    job_title:             str,
    llmInterviewReport:    str,
    proctoring_data:       Optional[dict] = None,
    org_id:                Optional[str]  = None,
    jd_json:               Optional[dict] = None,
    resume_json:           Optional[dict] = None,
    topic_records:         Optional[list] = None,
    candidate_name:        str = "",
    answer_integrity_enabled: bool = False,
    is_test:               bool = False,
) -> Optional[dict]:
    """Run the full sales report pipeline. Same contract as
    interview.tech.report.generate_interview_report."""
    if not transcript_lines or not DATABASE_URL:
        logger.warning("[REPORT:sales] Skipping: missing transcript or DATABASE_URL")
        return None
    if not os.environ.get("OPENAI_API_KEY"):
        logger.warning("[REPORT:sales] Skipping: missing OPENAI_API_KEY")
        return None
    if not llmInterviewReport:
        logger.error("[REPORT:sales] Missing org.llmInterviewReport from DB for app=%s", app_id)
        return None

    interview_scores = [s for s in answer_scores if not s.get("is_warmup", False)]
    initial_state: ReportState = {
        "app_id":           app_id,
        "transcript_lines": transcript_lines,
        "interview_scores": interview_scores,
        "all_scores":       answer_scores,
        "job_title":        job_title,
        "proctoring_data":  proctoring_data or {},
        "org_id":           org_id,
        "llm_model":        llmInterviewReport,
        "jd_json":          jd_json,
        "resume_json":      resume_json,
        "topic_records":    topic_records or [],
        "answer_integrity_enabled": answer_integrity_enabled,
        "is_test":          is_test,
    }
    _pipeline_start = time.monotonic()
    logger.info("[REPORT:sales] Pipeline started for app=%s", app_id)
    try:
        final_state = await _REPORT_GRAPH.ainvoke(initial_state)
        _pipeline_elapsed = time.monotonic() - _pipeline_start
        logger.info("[REPORT:sales] Pipeline finished for app=%s (%.1fs)", app_id, _pipeline_elapsed)
        return final_state.get("scores_context")
    except asyncio.TimeoutError as e:
        logger.error("[REPORT:sales] Timed out for %s: %s", app_id, e)
        return None
    except Exception as e:
        logger.error("[REPORT:sales] Pipeline failed for %s: %s", app_id, e, exc_info=True)
        try:
            await log_llm_error(
                app_id=app_id,
                org_name=org_id,
                candidate_name=candidate_name,
                provider="openai",
                error=str(e),
                reason="Report/summary generation failed",
            )
        except Exception:
            pass
        return None


async def generate_interview_summary(
    app_id:              str,
    transcript_lines:    list,
    job_title:           str,
    llmInterviewReport:  str,
    org_id:              Optional[str]  = None,
    scores_context:      Optional[dict] = None,
    candidate_name:      str = "",
    is_test:             bool = False,
) -> None:
    """Generate summary bullets + verdict and write to Interview.interviewSummary.
    Same contract as interview.tech.report.generate_interview_summary."""
    if not transcript_lines or not DATABASE_URL:
        logger.warning("[SUMMARY:sales] Skipping: missing transcript or DATABASE_URL")
        return
    if not os.environ.get("OPENAI_API_KEY"):
        logger.warning("[SUMMARY:sales] Skipping: missing OPENAI_API_KEY")
        return

    ctx             = scores_context or {}
    integrity_band  = ctx.get("integrity_band", "HIGH")
    integrity_score = ctx.get("integrity_score", 100)
    signal_summary  = ctx.get("signal_summary", "No signals flagged")
    computed_overall = ctx.get("overall", None)

    dimensions = ctx.get("dimensions", [])

    dimension_block = (
        "\n".join(
            f"  {d['name']}: {d['score']}/100 — {d.get('evidence', '').strip()}"
            for d in dimensions
        )
        if dimensions else "  Not available"
    )

    skills = ctx.get("skill_ratings", [])
    skill_block = (
        "\n".join(
            f"  {s['skill']} ({s['score']}/10): {s.get('evidence', '').strip()}"
            for s in skills[:12]
        )
        if skills else "  Not available"
    )

    strengths = ctx.get("strengths", [])
    concerns  = ctx.get("concerns", [])
    strengths_block = "\n".join(f"  - {s}" for s in strengths) if strengths else "  None identified"
    concerns_block  = "\n".join(f"  - {c}" for c in concerns)  if concerns  else "  None flagged"

    behavioral_points = ctx.get("behavioral_points", [])
    behavioral_block = (
        "\n\n".join(f"  - {p}" for p in behavioral_points) if behavioral_points else "  Not available"
    )

    integrity_signals_analysis = ctx.get("integrity_signals_analysis", {})
    integrity_signals_block = (
        "\n".join(
            f"  {name}:\n" + "\n".join(f"    - {p}" for p in points)
            for name, points in integrity_signals_analysis.items()
        )
        if integrity_signals_analysis else "  No proctoring signals fired."
    )

    answer_integrity = ctx.get("answer_integrity", {})
    answer_integrity_block = (
        f"  Flagged: {answer_integrity.get('flagged', False)} | Score: {answer_integrity.get('score', 0)}/100\n"
        f"  Reason: {answer_integrity.get('reason', 'Not available')}"
        if answer_integrity.get("enabled") else "  Not enabled for this org."
    )

    transcript_text = truncate_to_tokens("\n".join(transcript_lines), 5000)

    shared_user = (
        f"Role: {job_title}\n"
        f"Integrity: {integrity_band} ({integrity_score}/100)\n"
        f"Behavioral signals: {signal_summary}\n"
        f"COMPUTED WEIGHTED SCORE: {computed_overall if computed_overall is not None else 'Not available'}/100 "
        f"(deterministic weighted average of the dimension scores below — use this as your anchor point)\n\n"
        f"DIMENSION SCORES + EVIDENCE:\n{dimension_block}\n\n"
        f"SKILL BREAKDOWN:\n{skill_block}\n\n"
        f"STRENGTHS OBSERVED:\n{strengths_block}\n\n"
        f"CONCERNS FLAGGED:\n{concerns_block}\n\n"
        f"BEHAVIORAL ANALYSIS:\n{behavioral_block}\n\n"
        f"INTEGRITY SIGNALS ANALYSIS:\n{integrity_signals_block}\n\n"
        f"ANSWER INTEGRITY:\n{answer_integrity_block}\n\n"
        f"FULL INTERVIEW TRANSCRIPT:\n{transcript_text}"
    )

    _summary_start = time.monotonic()
    logger.info("[SUMMARY:sales] report_summary + report_verdict started (app=%s)", app_id)
    try:
        (summary_text, summary_usage), (verdict_text, verdict_usage) = await asyncio.gather(
            _llm.call(LLMCallSpec(
                system=_SUMMARY_SYSTEM,
                user=shared_user,
                max_tokens=500,
                timeout=60.0,
                response_format={"type": "text"},
                temperature=0.1,
                call_type="report_summary_sales",
                org_id=org_id or "",
                app_id=app_id,
                _LLM_DEFAULT=llmInterviewReport,
            )),
            _llm.call(LLMCallSpec(
                system=_VERDICT_SYSTEM,
                user=shared_user,
                max_tokens=250,
                timeout=60.0,
                response_format=_VERDICT_JSON_SCHEMA,
                temperature=0.1,
                call_type="report_verdict_sales",
                org_id=org_id or "",
                app_id=app_id,
                _LLM_DEFAULT=llmInterviewReport,
            )),
        )

        if org_id:
            _summary_ctx = {
                "applicationId": app_id,
                "candidateName": candidate_name,
                "jobTitle": job_title,
                "eventId": f"interview:{app_id}:summary",
                "isTest": is_test,
            }
            def _bill(usage: dict) -> Any:
                usage = {**usage, "context": _summary_ctx}
                return _persist_billing(org_id, "interviewReport", usage)
            try:
                await asyncio.gather(
                    _bill(_llm.usage_dict(summary_usage, llmInterviewReport)),
                    _bill(_llm.usage_dict(verdict_usage, llmInterviewReport)),
                )
            except Exception as _bill_err:
                logger.error("[BILLING] interviewReport summary (sales) billing failed (non-fatal): %s", _bill_err)

        _summary_elapsed = time.monotonic() - _summary_start
        logger.info(
            "[SUMMARY:sales] report_summary + report_verdict ended (%.1fs, app=%s)",
            _summary_elapsed, app_id,
        )
        if not summary_text and not verdict_text:
            logger.warning("[SUMMARY:sales] Both outputs empty for %s — skipping save", app_id)
            return

        try:
            verdict_parsed = json.loads(verdict_text)
        except Exception:
            verdict_parsed = {"decision": "Hold", "score": 50, "justification": verdict_text.strip()}

        from interview.agent_persistence import DatabasePool
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE "Interview"
                   SET "aiInterviewSummary" = COALESCE("aiInterviewSummary", '{}') || $1::jsonb
                   WHERE "applicationId"  = $2""",
                json.dumps({"summary": summary_text, "decision_note": verdict_parsed}),
                app_id,
            )
        logger.info("[SUMMARY:sales] Written summary + verdict for %s", app_id)

    except asyncio.TimeoutError:
        logger.warning("[SUMMARY:sales] Timed out for %s", app_id)
    except Exception as e:
        logger.error("[SUMMARY:sales] Failed for %s: %s", app_id, e, exc_info=True)
        try:
            await log_llm_error(
                app_id=app_id,
                org_name=org_id,
                candidate_name=candidate_name,
                provider="openai",
                error=str(e),
                reason="Report/summary generation failed",
            )
        except Exception:
            pass
