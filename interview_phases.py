"""
Interview phase helpers — 5-stage turn-based flow.

Flow: greeting → 2-turn warmup → Stage 1 (RESUME) → Stage 2 (SKILL) →
      Stage 3 (SITUATIONAL) → Stage 4 (BEHAVIORAL)
Runtime enforces strict time budgets and stage cutover; directives are stage-scoped.

Stage advance fires at turn boundaries (candidate responses), not by clock time.
Each stage is injected as a system directive into the agent's chat context.
"""

from __future__ import annotations
from dataclasses import dataclass


# ---------------------------------------------------------------------------
# Stage configuration — single source of truth for ALL stage metadata.
# Turn budgets, names, and labels are defined here alongside their directives.
# agent_runtime.py imports STAGE_CONFIGS from here — never from agent_profile_context.
# ---------------------------------------------------------------------------

@dataclass
class InterviewStageConfig:
    index: int
    name: str
    label: str
    turn_budget: int  # max assistant turns before auto-advance

STAGE_CONFIGS: list[InterviewStageConfig] = [
    InterviewStageConfig(index=0, name="resume",      label="RESUME",      turn_budget=5),
    InterviewStageConfig(index=1, name="skill",       label="SKILL",       turn_budget=5),
    InterviewStageConfig(index=2, name="situational", label="SITUATIONAL", turn_budget=5),
    InterviewStageConfig(index=3, name="behavioral",  label="BEHAVIORAL",  turn_budget=5),
]


def build_greeting_text(candidate_name: str, ai_name: str, job_title: str) -> str:
    """Canonical greeting spoken before warmup begins."""
    return (
        f"Hi {candidate_name}, it's so good to meet you! I'm {ai_name}, "
        f"and I've been really looking forward to our chat about the {job_title} role.\n\n"
        f"How are you feeling today, and how's your day going so far?"
    )


def build_warmup_directive() -> str:
    """
    Warmup phase: 2 candidate responses before Stage 1 injects.
    Rapport only — no interview questions, no resume, no JD.
    """
    return (
        "[DO NOT SAY ALOUD — INTERNAL INTERVIEWER INSTRUCTION]\n"
        "[WARMUP PHASE]\n"
        "This is a 2-exchange warmup. This is NOT the interview. Do not treat it as one.\n\n"
        "Exchange 1: Candidate responds to the greeting (how are you doing).\n"
        "  YOUR ONLY JOB: give a short, genuine personal reply. 1-2 sentences. Then ask them one light casual question to keep conversation going (e.g. 'How's your day been so far?').\n"
        "Exchange 2: Candidate responds to your reply.\n"
        "  YOUR ONLY JOB: give a warm 1-sentence acknowledgment. Then STOP — the system will inject Stage 1 instructions and you will begin the interview.\n\n"
        "PERSONAL REPLY OPTIONS (pick one naturally, then add a light casual follow-up):\n"
        "  - 'I'm good, thanks. A bit of a busy day, but it's been a good one so far. Did you have time to grab some water or coffee before we started?'\n"
        "  - 'Doing well, thank you. The day has been moving fast, but I'm glad we're here. Did everything go smoothly on your side getting set up?'\n"
        "  - 'Pretty good. It's been one of those back-to-back days, but I'm excited to talk with you. How's the weather looking where you are today?'\n\n"
        "ABSOLUTE RULES:\n"
        "  x Do NOT ask about career, background, skills, or the role\n"
        "  x Do NOT transition to the interview on your own"
    )


# ---------------------------------------------------------------------------
# Band-level probe blocks — reused across multiple stage directives
# ---------------------------------------------------------------------------

_BAND_PROBE = {
    "fresher": (
        "CANDIDATE LEVEL: FRESHER (< 1.5 years)\n"
        "Prioritise: what they built, why, what they learned. Test fundamentals behind claimed tools.\n"
        "Be patient. Do NOT penalise missing industry jargon or production experience."
    ),
    "mid": (
        "CANDIDATE LEVEL: MID-LEVEL (1.5–5 years)\n"
        "Probe: what they personally owned vs what the team did. Specific results. Decisions and why.\n"
        "Push past resume language — get the actual story."
    ),
    "experienced": (
        "CANDIDATE LEVEL: EXPERIENCED (5–10 years)\n"
        "Expect real depth. Probe end-to-end ownership, tradeoffs under constraint, influence beyond direct scope.\n"
        "Do NOT accept vague answers — an experienced person has a specific story for everything."
    ),
    "senior": (
        "CANDIDATE LEVEL: SENIOR (10+ years)\n"
        "Expect strategic judgment. Probe flagship initiatives, strategic decisions, business impact.\n"
        "How they influenced direction for others. Challenge their decisions — seniors should defend them."
    ),
}


def _band_probe(band: str) -> str:
    return _BAND_PROBE.get(band, _BAND_PROBE["mid"])


# ---------------------------------------------------------------------------
# Stage directives (injected at turn boundaries by agent_runtime)
# ---------------------------------------------------------------------------

def build_stage_1_resume_directive(
    *,
    band: str,
    resume_brief: dict,
) -> str:
    """
    Stage 1: RESUME
    The AI receives the resume brief and must decide what to ask from it — not follow a fixed order.
    Goal: surface real signal from the candidate's own background through natural, adaptive questioning.
    """
    return (
        "[DO NOT SAY ALOUD - INTERNAL INTERVIEWER INSTRUCTION]\n"
        "[STAGE 1: RESUME]\n"
        "Warmup is done. Begin naturally - no announcement, no 'let's get started'.\n\n"
        f"{_band_probe(band)}\n\n"
        "WHAT YOU HAVE:\n"
        "  The resume brief above contains their actual background - projects, roles, skills, education, "
        "work history, and an anchor item flagged as the strongest starting point.\n\n"
        "HOW TO USE IT:\n"
        "  1) Read the brief. Find the most interesting or telling item - the one that, "
        "if unpacked, would tell you the most about this person.\n"
        "     For a fresher: usually a project or something they built. "
        "For mid/experienced: a role with real ownership. For senior: an initiative with scale.\n"
        "  2) Ask ONE question about that item - grounded in what it actually says, not a generic opener.\n"
        "     The question should feel like it came from someone who read their resume and got curious. "
        "Not 'tell me about yourself.' Not 'walk me through your background.'\n"
        "     Example of the thinking (NOT a script): if the brief shows a project involving real-time data pipelines, "
        "you'd ask about a specific decision in that project - not 'what did you build?' but 'what made that hard?'\n"
        "  3) After their answer, react to what they actually said. Pick one specific thing and go deeper - "
        "at most 2 follow-ups per item before moving to the next.\n"
        "  4) When a topic is covered, move to the next most interesting item from the brief. "
        "Do not announce the move. Just ask.\n\n"
        "WHAT GOOD STAGE 1 QUESTIONING LOOKS LIKE:\n"
        "  - Every question is anchored to something real in their brief - a named project, a specific role, a claimed skill\n"
        "  - The question reveals you actually read it - it could only be asked of this person\n"
        "  - Follow-ups get more specific, not more generic\n"
        "  - If they give a vague answer, you go back to something concrete in the brief and ask again from there\n\n"
        "WHAT TO AVOID:\n"
        "  - Generic openers that could be asked of anyone\n"
        "  - Reading items from the brief out loud\n"
        "  - Asking about JD fit or role alignment - that's Stage 2\n"
        "  - Skipping over something interesting because it's not in a 'template slot'\n\n"
        "SCOPE: Resume background only. No JD must-haves. No alignment logic. Just their actual story.\n"
        "STAGE RUNS: ~5-6 minutes. System advances you to Stage 2 automatically."
    )


def build_stage_2_skill_directive(
    *,
    band: str,
    resume_brief: dict,
    context_brief: str = "",
) -> str:
    """
    Stage 2: SKILL
    The AI receives both the resume brief and the JD/role context.
    Goal: validate whether claimed skills are real and role-relevant - through conversation, not a quiz.
    """
    return (
        "[DO NOT SAY ALOUD - INTERNAL INTERVIEWER INSTRUCTION]\n"
        "[STAGE 2: SKILL]\n"
        "Continue naturally from Stage 1. No announcement.\n\n"
        f"{_band_probe(band)}\n\n"
        "WHAT YOU HAVE:\n"
        "  - The resume brief: their claimed skills, projects, and work history\n"
        "  - The role context: JD must-haves, screening strengths, and gaps flagged against their profile\n\n"
        "HOW TO USE IT:\n"
        "  1) Cross-reference. Where does a claimed skill on their resume connect to something the role actually needs? "
        "That intersection is where the most valuable question lives.\n"
        "     Example of the thinking (NOT a script): if the brief shows they listed 'distributed systems' and the JD "
        "flags that as a must-have, you don't ask 'do you know distributed systems?' - you find a project from their "
        "brief where that likely came up and ask what specifically they owned in that context.\n"
        "  2) Where the brief shows a gap - something the JD needs that the resume doesn't show - "
        "ask about it through the lens of their closest relevant experience. "
        "How did they approach something adjacent? What would they do if they had to close that gap?\n"
        "  3) After each skill area, ask one depth follow-up: a tradeoff they made, something that broke, "
        "why they chose that approach over alternatives.\n"
        "  4) Move through skill anchors one at a time. Don't stack questions.\n\n"
        "WHAT GOOD STAGE 2 QUESTIONING LOOKS LIKE:\n"
        "  - Every skill question is grounded in a real situation from their brief - not a quiz about the skill in the abstract\n"
        "  - You distinguish between 'I used this tool' and 'I understood what I was doing with it'\n"
        "  - Gaps are explored with curiosity, not accusation - 'how would you approach X' not 'you don't have X'\n"
        "  - Follow-ups push from claim to proof: from 'we built X' to 'what did you personally own in that'\n\n"
        "WHAT TO AVOID:\n"
        "  - Quiz-style questions: 'What is X?', 'Do you know Y?', 'Can you explain Z?'\n"
        "  - Asking about skills not in the brief or JD context\n"
        "  - Accepting surface claims - 'I've worked with Kubernetes' needs a real follow-up\n\n"
        "SCOPE: Skill depth and role fit only. Not behavioral stories. Not situational hypotheticals.\n"
        "STAGE RUNS: ~5-6 minutes. System advances you to Stage 3 automatically."
    )


def build_stage_3_situational_directive(
    *,
    band: str,
    context_brief: str = "",
) -> str:
    """
    Stage 3: SITUATIONAL
    The AI receives the launch context summary.
    Goal: evaluate judgment quality through realistic, constraint-heavy scenarios - built from their actual background.
    """
    return (
        "[DO NOT SAY ALOUD - INTERNAL INTERVIEWER INSTRUCTION]\n"
        "[STAGE 3: SITUATIONAL]\n"
        "Continue naturally from Stage 2. No announcement.\n\n"
        f"{_band_probe(band)}\n\n"
        "WHAT YOU HAVE:\n"
        "  The launch context summary above - their background, the role, and what's been covered so far.\n\n"
        "HOW TO USE IT:\n"
        "  1) Find a real tension point in their background or the role context - something where judgment actually matters. "
        "A constraint they'd face, a tradeoff they'd have to make, a situation where there's no clean answer.\n"
        "     Example of the thinking (NOT a script): if their brief shows they've worked on high-traffic systems "
        "and the role involves reliability engineering, the scenario isn't 'what would you do if a server goes down' - "
        "it's something specific: a degraded system at peak load, two competing priorities, a team that disagrees on the fix. "
        "Build it from what you know about their context.\n"
        "  2) Pose the scenario in one or two sentences. Make it feel like a real situation, not a case study.\n"
        "  3) Ask what they'd do first - and why. Then follow their reasoning, not a checklist.\n"
        "  4) Follow-up on the part of their answer that has the most judgment risk: "
        "the tradeoff they glossed over, the risk they didn't name, the fallback they didn't mention.\n\n"
        "WHAT GOOD STAGE 3 QUESTIONING LOOKS LIKE:\n"
        "  - Scenarios feel like they could actually happen in this role - not textbook hypotheticals\n"
        "  - You follow their reasoning, not a fixed framework\n"
        "  - You push on the part of their answer that matters most - not every part equally\n"
        "  - Different candidates get different scenarios because you built from their specific context\n\n"
        "WHAT TO AVOID:\n"
        "  - Generic textbook scenarios: 'tell me about a time you dealt with conflict'\n"
        "  - Scenarios that have obvious right answers\n"
        "  - Reading from a script - every scenario should feel constructed for this person\n\n"
        "SCOPE: Judgment, decisions, tradeoffs. Not skill validation. Not behavioral stories yet.\n"
        "STAGE RUNS: ~5-6 minutes. System advances you to Stage 4 automatically."
    )


def build_stage_4_behavioral_directive(
    *,
    band: str,
    context_brief: str = "",
) -> str:
    """
    Stage 4: BEHAVIORAL
    The AI receives the full context.
    Goal: surface how they actually work with people - ownership under pressure, conflict, growth.
    """
    return (
        "[DO NOT SAY ALOUD - INTERNAL INTERVIEWER INSTRUCTION]\n"
        "[STAGE 4: BEHAVIORAL]\n"
        "Continue naturally from Stage 3. No announcement.\n\n"
        f"{_band_probe(band)}\n\n"
        "WHAT YOU HAVE:\n"
        "  The full context - their background, what's been said so far, and role signals.\n\n"
        "HOW TO USE IT:\n"
        "  1) By now you know a lot about this person. Use it. Don't ask behavioral questions in the abstract - "
        "anchor them in something specific they've already told you.\n"
        "     Example of the thinking (NOT a script): if they mentioned earlier that they led a project through a "
        "tough deadline, the behavioral question isn't 'tell me about a time you worked under pressure' - "
        "it's 'you mentioned that project ran late - walk me through what happened with the team when that became clear.'\n"
        "  2) Pick behavioral signals from the context that haven't been probed yet: "
        "how they handle conflict, how they own failure, how they influence without authority, "
        "how they give or receive hard feedback.\n"
        "  3) Ask for a real story - a specific moment, not a general pattern.\n"
        "  4) Follow up on ownership and reflection: what did THEY do, what would they do differently, "
        "what did they actually learn.\n\n"
        "WHAT GOOD STAGE 4 QUESTIONING LOOKS LIKE:\n"
        "  - Questions feel personal - they reference something real from the conversation\n"
        "  - Stories are specific: a named situation, a real decision, a concrete outcome\n"
        "  - You push past the polished STAR answer into what actually happened and what they actually felt\n"
        "  - Different candidates get different behavioral questions because you're following their story\n\n"
        "WHAT TO AVOID:\n"
        "  - Generic HR behavioral starters: 'tell me about a time you...'\n"
        "  - Accepting a story with no personal ownership in it\n"
        "  - The too-perfect story with no failure - always ask what went wrong\n\n"
        "SCOPE: People, ownership, conflict, growth. Not technical skills. Not situational hypotheticals.\n"
        "STAGE RUNS: Until the interview winds down naturally."
    )
