"""
Interview phase helpers -- single unified 20-minute technical interview.

This module owns the parts of the interview system prompt that don't belong in
interview.tech.prompts: the resume payload (build_candidate_payload), the
code-card contract, the level guide, and the fixed greeting. The voice/reaction
mechanics and the QUESTION/resume-reference rules live in
interview.tech.prompts.build_voice_layer_prompt and build_evaluation_layer_prompt
-- this file used to duplicate those rules with its own slightly different
wording (a different word cap, a second copy of the resume-reference rule), and
having both live in context at once meant the model was reconciling two
versions of the same instruction every turn instead of following one. Say a
rule once, in the right place.

The flow, and where the resume is and is not allowed in:

    OPENING a topic -> ask the JD/skill question cold. The resume is NOT consulted,
      even when a project on it matches the topic exactly. Opening cold is what
      makes the answer worth anything: it tests the skill before the candidate can
      fall back on a rehearsed project narrative.

    FOLLOWING UP -> normally drill into what they just said (unchanged behaviour).
      The one exception: when the per-turn directive carries a verified
      "FOLLOW-UP SOURCE: RESUME PROJECT" block, the follow-up names that project
      and asks a technical verification question inside it. The match is decided
      upstream in interview.tech.resume_match, not by the speaking LLM, and only a
      high-confidence skill<->project overlap gets there. No match -> the ordinary
      skill follow-up, which is the common case.

So the resume changes only HOW A FOLLOW-UP IS GROUNDED, never what topics are
asked, never the opening question, and never the scoring.
"""
from __future__ import annotations

import json
from typing import Any




def build_greeting_text(candidate_name: str, ai_name: str) -> str:
    """Fixed greeting — natural, warm, consistent across all sessions."""
    name = (candidate_name or "").strip().split()[0] if candidate_name else "there"
    ai = (ai_name or "").strip() or "your interviewer"
    return f"Hi {name}, this is {ai}, your interviewer for today. Good to connect with you. How are you doing?"


# ---------------------------------------------------------------------------
# Resume payload -- the candidate's real background, injected once.
# ---------------------------------------------------------------------------
def _trim(value: Any, limit: int) -> str:
    return str(value or "").strip().replace("\n", " ")[:limit].rstrip()


def build_candidate_payload(resume_json: dict | None) -> str:
    """Compact JSON of what the candidate has actually built.

    Projects and work history carry their descriptions -- that is what lets a
    question say "your InsightRAG project, the wiki Q&A one" instead of just
    naming a tech tag. Returns "" when there is no usable resume, and the
    prompt then runs every topic as a plain JD question.
    """
    if not isinstance(resume_json, dict) or not resume_json:
        return ""
    try:
        from interview.resume import RawResumeJSON  # noqa: PLC0415
        raw = RawResumeJSON.model_validate(resume_json)
    except Exception:
        return ""

    payload: dict[str, Any] = {}

    projects = []
    for p in raw.get_projects()[:5]:
        name = _trim(p.name or p.title, 80)
        if not name:
            continue
        item: dict[str, Any] = {"name": name}
        tech = [t.strip() for t in p.resolved_tech if t and t.strip()][:8]
        if tech:
            item["tech"] = tech
        desc = _trim(p.description, 200) or _trim(" ".join(p.highlights), 200)
        if desc:
            item["description"] = desc
        projects.append(item)
    if projects:
        payload["projects"] = projects

    work = []
    for w in raw.get_work_history()[:4]:
        role, company = _trim(w.role, 80), _trim(w.company, 80)
        if not role and not company:
            continue
        item = {k: v for k, v in (("role", role), ("company", company)) if v}
        tech = [t.strip() for t in w.technologies_used if t and t.strip()][:8]
        if tech:
            item["tech"] = tech
        desc = _trim(w.description, 200) or _trim(" ".join(w.responsibilities), 200)
        if desc:
            item["description"] = desc
        work.append(item)
    if work:
        payload["work_history"] = work

    skills = [s.name.strip() for s in raw.get_technical_skills() if s.name and s.name.strip()]
    if skills:
        payload["skills"] = skills[:25]

    if not payload:
        return ""
    return "\nCANDIDATE RESUME:\n" + json.dumps(payload, ensure_ascii=False, indent=1) + "\n"


_LEVEL_GUIDE: dict[int, str] = {
    1: "LEVEL 1 (junior): FOR NEW TOPICS, question must be a straightforward mechanism or implementation question. "
       "For evaluation: a correct mechanism in their own words is a good answer. "
       "2-3 follow-ups per topic. Skip scale/architecture tradeoffs -- no basis to answer.",
    2: "LEVEL 2 (mid): FOR NEW TOPICS, question must be a scenario requiring structural choices or basic tradeoffs. "
       "For evaluation: correct mechanism is the floor; one real tradeoff or failure mode "
       "makes it good. 3-4 follow-ups. On a textbook answer, ask what it costs.",
    3: "LEVEL 3 (senior): FOR NEW TOPICS, question must be a complex scenario requiring architectural judgment. "
       "For evaluation: mechanism is assumed -- the answer is only good if it carries "
       "judgment (what they'd choose, against what, at what cost). 3-5 follow-ups, "
       "one thread deep rather than many shallow.",
    4: "LEVEL 4 (staff): FOR NEW TOPICS, question must be a system-scale design problem or a deep structural tradeoff. "
       "For evaluation: a correct answer is the baseline. Push for second-order reasoning "
       "-- what the choice costs the system or team over time. Press every tradeoff claim.",
}


_CODE_CARD_RULE = """\
━━━ SHOWING CODE ━━━
To show code, emit a real fenced block -- the tag renders it on their screen:
  <spoken setup, under 12 words>
  ```code_trace
  <real runnable code>
  ```
Tags: code_trace (trace the output) / snippet_eval (find the bug) / query_trace (what
does this query return). Only after at least one verbal question on the topic.

Before sending: do your words point at something they must SEE ("here's", "this",
"look at")? If yes and there's no fenced block, STOP -- you're pointing at a blank
screen. Add the fence or rewrite the sentence. Otherwise, no fence at all.

CORRECTNESS BEFORE YOU SEND: mentally trace the snippet/query for the exact case your
spoken question asks about, and confirm there is exactly one correct answer before you emit
it. code_trace/query_trace: you must be able to state the precise output/rows with certainty,
including edge behavior (empty input, NULL, zero, an empty table, a JOIN with no match).
snippet_eval: exactly one real logic bug, on a specific line, never a syntax error. query_trace
against an implied schema: state the minimal table/column shape in a one-line comment inside
the fence so the query isn't ambiguous. Match the difficulty (obvious vs. subtle bug, single
table vs. join+aggregation, simple loop vs. mutable-default/closure gotcha) to the candidate's
level -- see the LEVEL guide below.

FOLLOW-UPS on a card stay anchored to it: reference the exact variable/line/row in that
snippet, never a generic "what about edge cases?" Escalate by changing ONE concrete input
(empty, negative, duplicate, NULL) or asking what would need to change to fix it -- and know
the correct answer to that escalation before you ask it.
"""


_EXIT_RULE = """\
━━━ LEAVING A TOPIC ━━━
Leave a topic once it stops producing information -- either you've got a real mechanism
plus some judgment behind it, or two answers running have had no substance in them.
Rephrasing a third time at someone who doesn't know the area produces nothing except
panic, and a rattled candidate answers everything after it worse than they would have.

When you leave a topic they struggled with, say nothing about the struggle itself --
go straight into the next question as its own clean opener. Silence about the miss is
what keeps them composed for the topics they do know; a face-saving line still draws
attention to the thing that went wrong.
"""


def _build_custom_questions_block(custom_questions: list[str] | None) -> str:
    cqs = [q.strip() for q in (custom_questions or []) if q.strip()]
    if not cqs:
        return ""
    items = "\n".join(f"  {i + 1}. {q}" for i, q in enumerate(cqs))
    return f"\nRECRUITER QUESTIONS (weave in naturally; all must be asked before the end):\n{items}\n"


def _build_topics_block(interview_brief: Any, jd_skills: list[str] | None) -> str:
    if interview_brief is not None:
        topics = [t for t in interview_brief.topic_pool if t.topic_type in ("skill", "role_topic")]
        if topics:
            lines = []
            for t in topics:
                line = f"  - {t.title}"
                if t.full_description:
                    line += f"\n      {t.full_description}"
                if t.tech_stack:
                    line += f"\n      TECH: {', '.join(t.tech_stack)}"
                if t.probe_focus:
                    line += f"\n      [probe: {t.probe_focus}]"
                lines.append(line)
            return "\nJD TOPICS TO COVER (in priority order):\n" + "\n".join(lines) + "\n"

    jd_list = [str(s).strip() for s in (jd_skills or []) if str(s).strip()]
    if jd_list:
        return f"\nJD TOPICS TO COVER:\n  {', '.join(jd_list)}\n"
    return ""


def build_interview_directive(
    *,
    level: int,

    jd_skills: list[str] | None = None,
    custom_questions: list[str] | None = None,
    interview_brief=None,
    resume_json: dict | None = None,
) -> str:
    """Second system message, injected once warmup completes (see agent_runtime.py).

    Carries what build_voice_layer_prompt/build_evaluation_layer_prompt don't:
    the actual resume data, the code-card contract, and the level guide. The
    QUESTION-phrasing and resume-reference RULES live in interview.tech.prompts
    -- this only supplies the reference data and the code-card/level mechanics,
    so there's no second copy of the same rule to go stale relative to the first.
    """
    topics_block = _build_topics_block(interview_brief, jd_skills)
    if not topics_block:
        pass  # Rely purely on interview_brief topics

    # When there is no resume, state it as a fact up front rather than relying on a
    # conditional buried in the rules. Tested: with only the in-rule instruction the
    # model still opened with "I didn't see X on your resume" every time -- it will
    # narrate looking at a resume unless told plainly that none exists.
    resume_block = build_candidate_payload(resume_json)
    if not resume_block:
        resume_block = (
            "\nNO RESUME AVAILABLE for this candidate -- you know nothing about their\n"
            "background, and there is no document you have looked at. Saying 'I saw',\n"
            "'you mentioned', 'your project', or 'I didn't see that on your resume' claims\n"
            "knowledge you do not have, and it is obvious to the candidate. Ground your\n"
            "questions in concrete situations instead of in their history.\n"
        )

    strategy = ""
    if interview_brief is not None:
        strategy = f"ROLE STRATEGY: {interview_brief.interview_strategy}\n"
        if interview_brief.red_flags:
            strategy += f"WATCH FOR: {', '.join(interview_brief.red_flags)}\n"

    return (
        "[DO NOT SAY ALOUD]\n\n"
        "You are running a real technical interview. Find out how deep this candidate's\n"
        "knowledge actually goes by talking to them like a senior engineer would.\n\n"
        "If a [NEXT_TURN_DIRECTIVE] or [TOPIC_LOCK] appears in this context, follow it\n"
        "EXACTLY -- it is a live routing decision and overrides everything below.\n\n"
        f"{strategy}"
        f"{resume_block}"
        f"{topics_block}"
        f"\n{_LEVEL_GUIDE.get(level, _LEVEL_GUIDE[2])}\n"
        f"\n{_CODE_CARD_RULE}"
        f"\n{_EXIT_RULE}"
        f"{_build_custom_questions_block(custom_questions)}"
        "\nStart with the first JD topic above, using the same rule as every other question.\n"
        "Then follow what they say rather than marching down the list. Never close early.\n"
    )
