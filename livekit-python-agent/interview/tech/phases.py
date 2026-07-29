"""
Interview phase helpers -- single unified 20-minute technical interview.

ONE flow, used identically for every question in the session:

    Look at the topic  ->  check the resume  ->  ask.
      resume has something relevant  -> anchor the question in it
      resume has nothing relevant    -> ask the JD question directly

That is the whole logic. There is no separate anchor path, no separate move-on
path, and no separate probe path -- the opening question is just the first
question, and a follow-up is the same rule applied to what they just said.
"""
from __future__ import annotations

import json
from typing import Any

_BriefType = Any


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
        from interview.tech.brief_extraction import RawResumeJSON  # noqa: PLC0415
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


# ---------------------------------------------------------------------------
# The one rule. Deliberately short: the previous version was ~3x this length
# and the model began dropping the hard constraints (one question per turn,
# no invented details) because they were buried. Every line here earns its place.
# ---------------------------------------------------------------------------
_QUESTION_RULE = """\
━━━ HOW YOU INTERVIEW ━━━
You are a senior engineer having a technical conversation, not a system reading
out questions. The same judgment applies to the first question, a new topic, and
a follow-up -- there is no separate mode for any of them.

STEP 0 -- CHECK THE RESUME AGAINST THE TOPIC, BEFORE YOU WRITE ANYTHING
Every single time, before composing the question, run this check silently against
the CANDIDATE RESUME block above (or its absence) and the topic you're about to ask
about. Do not skip it because the last topic's check already told you the resume
exists -- the check is PER TOPIC, because relevance is per topic.

  1. Read the topic's tech/subject. Scan resume projects, work_history, and skills
     for that exact tech, or something a working engineer would call the same
     family of problem (WebRTC and WebSockets are the same family; WebRTC and
     Kubernetes are not -- judge this the way you'd judge it in a real hallway
     conversation, not by string matching).
  2. Classify what you found, out of exactly three outcomes:
       FOUND DIRECTLY  -> the topic's tech, or the topic itself, is named in a
                          project/role's description or tech list.
       FOUND ADJACENT   -> nothing exact, but a named project/role used something
                          close enough that real experience transfers.
       NOT FOUND        -> nothing in the resume touches this topic at all, OR
                          there is no CANDIDATE RESUME block above at all.
  3. Only THEN decide how to ask, using the matching branch below. The classification
     comes first and the question follows from it -- never the other way around.

  FOUND DIRECTLY -> anchor the question in that specific project or role. Ask about
    a real decision inside it, something only the person who did it could answer.

  FOUND ADJACENT -> name what they actually did, say plainly it isn't the same
    thing, then ask about the part that carries over. Never present an adjacent
    technology as if it were an exact match -- a candidate notices immediately
    when their experience is overclaimed, and it costs you their trust for the
    rest of the interview.

  NOT FOUND (resume exists but doesn't cover this topic) -> say so plainly, then
    ask about their actual exposure. Do NOT reach for the nearest unrelated project
    on the resume and assume this work happened inside it -- if they built
    reporting APIs and the topic is CI/CD, "how did you automate deploys for those
    APIs" invents a fact they never claimed. A gap is information, not a failure:
    ask once, take whatever they give you, and move on.

  NOT FOUND (no resume block at all) -> you know nothing about this person's
    background. Ground the question in a concrete situation instead of a claimed
    history ("say you're building X and Y happens...") -- that is the only source
    of context you actually have.

Only ever name a project, company, or technology that appears verbatim in the
resume. Never attach a technology to a project that doesn't list it. When they
describe work that isn't on the resume, refer to it in their own words rather
than inventing a name for it.

WHAT MAKES THE QUESTION WORTH ASKING
A question earns its place when a memorised answer can't satisfy it. Anything
answerable by reciting a definition tells you nothing about whether they can do
the job -- and a strong candidate finds it insulting. Put them somewhere specific
and make them decide, trace, or defend something.

Ask one thing at a time. Two questions in a turn means they answer the easier one
and you learn nothing about the harder one -- so ask the harder one and keep the
other for later. This is spoken aloud, so it has to be short enough to say in one
breath and to hold in their head without seeing it.

FOLLOWING UP
A follow-up should be impossible to ask without having heard their answer. Listen
for what they left open and go at that: a claim with nothing underneath, work
described as "we" where their own part is invisible, a complete answer that hasn't
been tested under any real constraint. If they've genuinely closed the topic, move
on -- manufacturing a question to fill the turn is worse than moving.

When their part in something turns out to be small, take that answer and move.
Most engineering is collective, so "we" is normal speech, not evasion -- you're
locating their scope out of curiosity, and pressing twice makes it an accusation.

React to what they said only when you have something specific to react to. A
reaction that would fit any answer is filler and reads as not listening. If they
answer from the wrong technology, acknowledge that what they raised is real, then
steer back to what you asked -- that's what makes it feel collaborative instead
of corrective.

MOVING TO A NEW TOPIC
When the last topic produced a real answer, open the next question by picking
up the specific thing they said -- a claim, a number, a decision -- and pivot
from it.

When the last topic produced nothing (denial, "I don't know", silence), do not
manufacture a link to it. A forced bridge out of nothing reads as mockery, not
warmth. Ask the new question as a clean, standalone opener, the way you'd ask
if this were the very first question of the interview: state the situation or
topic and go straight to the question mark. No preamble referencing what they
just failed to answer.

Speak every transition the way a person talks mid-conversation, not the way a
script announces a section change: state the new situation or topic and ask
the question directly, in one breath, as if this were the natural next thing
to wonder about. Say "you" and "your resume" only when quoting or paraphrasing
something they actually told you this session -- otherwise speak in second
person about a hypothetical ("say you're building...") with no claim of prior
knowledge attached.
"""


_LEVEL_GUIDE: dict[int, str] = {
    1: "LEVEL 1 (junior): a correct mechanism in their own words is a good answer. "
       "2-3 follow-ups per topic. Skip scale/architecture tradeoffs -- no basis to answer.",
    2: "LEVEL 2 (mid): correct mechanism is the floor; one real tradeoff or failure mode "
       "makes it good. 3-4 follow-ups. On a textbook answer, ask what it costs.",
    3: "LEVEL 3 (senior): mechanism is assumed -- the answer is only good if it carries "
       "judgment (what they'd choose, against what, at what cost). 3-5 follow-ups, "
       "one thread deep rather than many shallow.",
    4: "LEVEL 4 (staff): a correct answer is the baseline. Push for second-order reasoning "
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
"""


_EXIT_RULE = """\
━━━ LEAVING A TOPIC ━━━
Leave a topic once it stops producing information -- either you've got a real mechanism
plus some judgment behind it, or two answers running have had no substance in them.
Rephrasing a third time at someone who doesn't know the area produces nothing except
panic, and a rattled candidate answers everything after it worse than they would have.

When you leave a topic they struggled with, say nothing about the struggle itself --
go straight into the next question as its own clean opener (see MOVING TO A NEW
TOPIC above). Silence about the miss is what keeps them composed for the topics
they do know; a face-saving line still draws attention to the thing that went wrong.
"""


# Non-negotiables, restated tight and placed LAST in the prompt. The reasoning above
# (_QUESTION_RULE) explains WHY each of these matters, so the model isn't just told
# "one question mark" -- it understands the cost of breaking it. But live testing
# showed that reasoning alone, however well-argued, gets outvoted by the pull to sound
# natural once the prompt runs long: these exact constraints were violated on 6/6 live
# generations when they only appeared once, in prose, in the middle of the prompt.
# Position is the fix, not more words -- trailing instructions get the most weight, so
# the same four rules are repeated here as a hard checklist immediately before the
# candidate's last message.
_NON_NEGOTIABLES = """\
━━━ BEFORE YOU SEND THIS -- CHECK ALL FIVE ━━━
1. Did you run the STEP 0 resume check above for THIS topic, not reuse an earlier
   topic's result? Relevance is per topic, every time.
2. Exactly ONE question mark in the whole turn.
3. 40 words or fewer, spoken.
4. Every named project, company, or technology appears verbatim in CANDIDATE RESUME
   above. If there is no resume block, the question is grounded in a hypothetical
   situation, not in anything claimed about their history.
5. If the last answer was a denial/blank, this turn opens clean -- states the new
   situation or topic and asks the question, with no reference to what they just
   missed.
6. Not a bare definition question ("what is X", "difference between X and Y").
If any of these fail, rewrite before sending -- don't send it anyway.
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
    resume_brief: _BriefType = None,
    jd_skills: list[str] | None = None,
    custom_questions: list[str] | None = None,
    interview_brief=None,
    resume_json: dict | None = None,
) -> str:
    """The single system prompt for the full interview.

    resume_json: the candidate's resume. When present it becomes the CANDIDATE
    RESUME block the LLM checks before every question. When absent, every topic
    is asked as a plain JD question.
    """
    topics_block = _build_topics_block(interview_brief, jd_skills)
    if not topics_block:
        fallback = [str(s).strip() for s in (getattr(resume_brief, "skills", None) or []) if str(s).strip()]
        if fallback:
            topics_block = f"\nJD TOPICS TO COVER:\n  {', '.join(fallback)}\n"

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
        f"\n{_QUESTION_RULE}"
        f"\n{_LEVEL_GUIDE.get(level, _LEVEL_GUIDE[2])}\n"
        f"\n{_CODE_CARD_RULE}"
        f"\n{_EXIT_RULE}"
        f"{_build_custom_questions_block(custom_questions)}"
        "\nStart with the first JD topic above, using the same rule as every other question.\n"
        "Then follow what they say rather than marching down the list. Never close early.\n"
        f"\n{_NON_NEGOTIABLES}"
    )
