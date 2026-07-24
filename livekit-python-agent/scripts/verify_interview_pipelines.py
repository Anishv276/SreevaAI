"""
scripts/verify_interview_pipelines.py
======================================
End-to-end verification script: runs ONE tech candidate and ONE sales
candidate through the real pipelines with real LLM calls (no mocks) --

  1. brief generation      (interview.tech.brief / interview.conversational.brief)
  2. simulated interview   (a second LLM plays the candidate; the real
                             evaluation-layer prompt + question-generation
                             system prompt drive what Ishitha asks)
  3. per-turn scoring+signal (interview.tech.scoring / .conversational.scoring)
  4. per-turn probe directive (interview.tech.probe / .conversational.probe)
  5. eval orchestration + saturation (interview.tech.eval / .conversational.eval)
  6. final report + summary  (interview.tech.report / .conversational.report)

Writes a full transcript + every intermediate artifact (brief JSON, per-turn
scores/signals/directives, final scorecard) to scripts/verify_output/<run>.json
and prints a condensed trace to stdout as it runs.

This talks to a REAL OpenAI account and (for the report step) attempts a
real DB UPDATE against DATABASE_URL keyed on a throwaway app_id -- harmless
no-op if that application id doesn't exist, matching how report_pipeline.py
always behaves for an unknown id. Set VERIFY_SKIP_DB=1 to skip the report/
summary DB-touching steps entirely and still get everything else.

Usage:
    cd livekit-python-agent
    python scripts/verify_interview_pipelines.py
    python scripts/verify_interview_pipelines.py --turns 6 --which tech
    python scripts/verify_interview_pipelines.py --which sales
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any

_repo_root = Path(__file__).resolve().parents[1]
if str(_repo_root) not in sys.path:
    sys.path.insert(0, str(_repo_root))

from dotenv import load_dotenv
load_dotenv()

from openai import AsyncOpenAI

from interview.agent_runtime_utils import token_limit_kwarg

OUTPUT_DIR = Path(__file__).resolve().parent / "verify_output"
OUTPUT_DIR.mkdir(exist_ok=True)

CANDIDATE_LLM_MODEL = os.environ.get("VERIFY_CANDIDATE_MODEL", "gpt-4.1-mini")
INTERVIEW_LLM_MODEL = os.environ.get("VERIFY_INTERVIEW_MODEL", "gpt-4.1")
SKIP_DB = os.environ.get("VERIFY_SKIP_DB", "0") == "1"


# ---------------------------------------------------------------------------
# Fixture data -- one tech resume+JD, one sales resume+JD.
# ---------------------------------------------------------------------------

TECH_JOB_TITLE = "Backend Engineer"
TECH_JD_DATA = {
    "title": "Backend Engineer",
    "criteria": [
        {"name": "Python", "priority": "critical", "description": "Production Python services"},
        {"name": "PostgreSQL", "priority": "high", "description": "Schema design, query optimization"},
        {"name": "Distributed systems", "priority": "high", "description": "Designing for scale and failure"},
        {"name": "REST API design", "priority": "medium", "description": "Public/internal API design"},
        {"name": "Docker/Kubernetes", "priority": "medium", "description": "Containerized deployment"},
    ],
    "responsibilities": [
        "Design and own backend services handling significant production traffic",
        "Participate in on-call rotation and incident response",
        "Mentor junior engineers on system design",
    ],
}
TECH_RESUME_JSON = {
    "name": "Arjun Mehta",
    "experience": {"total_years": 4.5, "seniority_level": "mid"},
    "work_history": [
        {
            "company": "Fintech Co",
            "role": "Backend Engineer",
            "duration_months": 30,
            "technologies_used": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker"],
            "responsibilities": [
                "Owned the payments reconciliation service processing ~2M transactions/day",
                "Migrated a monolithic ledger service to an event-driven architecture using Kafka",
                "Reduced p99 API latency from 800ms to 150ms via query optimization and caching",
            ],
            "impact_signals": ["Cut reconciliation job runtime from 6h to 40min"],
        },
        {
            "company": "Startup Labs",
            "role": "Software Engineer",
            "duration_months": 24,
            "technologies_used": ["Python", "Django", "MySQL"],
            "responsibilities": [
                "Built internal admin tooling and reporting dashboards",
                "Wrote integration tests for the checkout flow",
            ],
        },
    ],
    "projects": [
        {
            "name": "Distributed Rate Limiter",
            "description": "Built a token-bucket rate limiter shared across service instances using Redis, deployed for an internal API gateway.",
            "technologies": ["Python", "Redis", "Docker"],
            "impact_signals": ["Prevented 3 downstream outages during traffic spikes"],
        },
    ],
    "skills": {
        "technical": ["Python", "PostgreSQL", "Redis", "Kafka", "Docker", "Kubernetes", "FastAPI", "AWS"],
    },
}

SALES_JOB_TITLE = "Enterprise Account Executive"
SALES_JD_DATA = {
    "title": "Enterprise Account Executive",
    "criteria": [
        {"name": "Enterprise sales cycle", "priority": "critical", "description": "6-9 month complex deal cycles"},
        {"name": "MEDDIC qualification", "priority": "high", "description": "Structured deal qualification"},
        {"name": "Multi-stakeholder navigation", "priority": "high", "description": "Selling to VP/C-level buying committees"},
        {"name": "Salesforce", "priority": "medium", "description": "Pipeline and forecast management"},
        {"name": "Negotiation", "priority": "medium", "description": "Contract and pricing negotiation"},
    ],
    "responsibilities": [
        "Own a book of enterprise accounts and carry an annual quota",
        "Run the full sales cycle from discovery to close for six-figure deals",
        "Forecast pipeline accurately to sales leadership",
    ],
}
SALES_RESUME_JSON = {
    "name": "Priya Nair",
    "experience": {"total_years": 5.0, "seniority_level": "senior"},
    "work_history": [
        {
            "company": "CloudStack Inc",
            "role": "Enterprise Account Executive",
            "duration_months": 36,
            "technologies_used": ["Salesforce", "Gong", "Outreach"],
            "responsibilities": [
                "Carried a $1.2M annual quota selling to mid-market and enterprise accounts",
                "Closed a $340K deal with a Fortune 500 logistics company after a 7-month cycle",
                "Ran discovery calls using MEDDIC to qualify deals before investing time",
                "Negotiated contract terms directly with procurement and legal on 6-figure deals",
            ],
            "impact_signals": ["Attained 118% of quota in FY2023", "Closed 14 deals averaging $85K ACV"],
        },
        {
            "company": "SaaSly",
            "role": "Account Executive (SMB)",
            "duration_months": 24,
            "technologies_used": ["HubSpot"],
            "responsibilities": [
                "Ran full-cycle transactional sales for SMB accounts, 2-3 week deal cycles",
                "Consistently exceeded monthly quota for 5 consecutive quarters",
            ],
        },
    ],
    "projects": [],
    "skills": {
        "technical": ["Salesforce", "MEDDIC", "Gong", "Outreach", "Negotiation", "Forecasting"],
    },
}

CUSTOM_QUESTIONS: list[str] = []


# ---------------------------------------------------------------------------
# Candidate simulator -- a second LLM plays the candidate so answers are
# realistic (varied quality: some strong+specific, some vague, one denial)
# instead of scripted strings that wouldn't exercise the signal detectors.
# ---------------------------------------------------------------------------

CANDIDATE_PERSONA_SYSTEM = """\
You are role-playing as a job candidate being interviewed live. You are given the
candidate's real resume/background and the interviewer's latest question.

Answer AS THIS CANDIDATE, in first person, the way a real person speaks out loud
(not polished essay prose). Follow this turn-by-turn quality pattern across the
interview so the transcript exercises different signal detectors:
  - Turns 1-2: strong, specific, grounded answers with real numbers/details from
    the resume background.
  - One turn in the middle: give a VAGUE, generic answer with no real specifics
    (e.g. "yeah it went well, we worked together as a team") to test weak-signal
    detection.
  - One turn: openly say you don't have much experience with whatever specific
    thing was asked (a real "I'm not sure" / "I haven't done that") to test the
    denial/depth-ceiling path.
  - Other turns: solid, plausible mid-quality answers.
Keep each answer to 2-4 sentences, spoken style, contractions, no bullet points.
Never break character. Never mention you are an AI.
"""


async def _simulate_candidate_answer(
    *,
    client: AsyncOpenAI,
    resume_background: str,
    question: str,
    turn_index: int,
) -> str:
    resp = await client.chat.completions.create(
        model=CANDIDATE_LLM_MODEL,
        temperature=0.7,
        **token_limit_kwarg(CANDIDATE_LLM_MODEL, 180),
        messages=[
            {"role": "system", "content": CANDIDATE_PERSONA_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"CANDIDATE BACKGROUND:\n{resume_background}\n\n"
                    f"This is turn {turn_index} of the interview.\n"
                    f"INTERVIEWER'S QUESTION:\n{question}\n\n"
                    f"Give the candidate's spoken answer now."
                ),
            },
        ],
    )
    return (resp.choices[0].message.content or "").strip()


async def _generate_next_question(
    *,
    client: AsyncOpenAI,
    system_prompt: str,
    directive_block: str,
    transcript_lines: list[str],
) -> str:
    """Drives the real QUESTION_GENERATION_SYSTEM prompt (tech or sales) with the
    live directive block, so the printed question is what Ishitha would actually
    say -- not a stand-in."""
    recent = "\n".join(transcript_lines[-6:])
    resp = await client.chat.completions.create(
        model=INTERVIEW_LLM_MODEL,
        temperature=0.4,
        **token_limit_kwarg(INTERVIEW_LLM_MODEL, 150),
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"{directive_block}\n\nRECENT TRANSCRIPT:\n{recent}",
            },
        ],
    )
    text = (resp.choices[0].message.content or "").strip()
    return text


# ---------------------------------------------------------------------------
# One full pipeline run for a given module ("tech" or "sales")
# ---------------------------------------------------------------------------

async def run_pipeline(
    *,
    which: str,
    num_turns: int,
    client: AsyncOpenAI,
    level: int = 2,
) -> dict:
    is_sales = which == "sales"
    job_title = SALES_JOB_TITLE if is_sales else TECH_JOB_TITLE
    jd_data = SALES_JD_DATA if is_sales else TECH_JD_DATA
    resume_json = SALES_RESUME_JSON if is_sales else TECH_RESUME_JSON
    candidate_name = resume_json["name"]

    if is_sales:
        from interview.conversational.brief import generate_interview_brief
        from interview.conversational.scoring import evaluate_answer
        from interview.conversational.probe import get_probe_context, QUESTION_GENERATION_SYSTEM
        from interview.conversational.prompts import build_evaluation_layer_prompt, build_voice_layer_prompt, build_system_prompt
        from interview.conversational.eval import run_eval_and_build_directive
        from interview.conversational.report import generate_interview_report, generate_interview_summary
    else:
        from interview.tech.brief import generate_interview_brief
        from interview.tech.scoring import evaluate_answer
        from interview.tech.probe import get_probe_context, QUESTION_GENERATION_SYSTEM
        from interview.tech.prompts import build_evaluation_layer_prompt, build_voice_layer_prompt, build_system_prompt
        from interview.tech.eval import run_eval_and_build_directive
        from interview.tech.report import generate_interview_report, generate_interview_summary

    log: dict[str, Any] = {
        "which": which, "job_title": job_title, "candidate_name": candidate_name,
        "candidate_llm_model": CANDIDATE_LLM_MODEL, "interview_llm_model": INTERVIEW_LLM_MODEL,
        "turns": [],
    }

    def _hr(title: str) -> None:
        print(f"\n{'='*90}\n{title}\n{'='*90}")

    # -- Step 1: level + brief --------------------------------------------------
    _hr(f"[{which.upper()}] STEP 1 -- Brief generation")
    # admin-selected level -- passed in via --level, never inferred from candidate/JD
    print(f"level={level}")

    _brief_usages: list[dict] = []
    t0 = time.perf_counter()
    brief = await generate_interview_brief(
        candidate_name=candidate_name,
        job_title=job_title,
        level=level,
        jd_data=jd_data,
        custom_questions=CUSTOM_QUESTIONS,
        openai_client=client,
        llm_model=INTERVIEW_LLM_MODEL,
        usage_sink=_brief_usages.append,
    )
    print(f"brief generated in {time.perf_counter() - t0:.1f}s")
    print(f"anchor_topic: {brief.anchor_topic.title}  [{brief.anchor_topic.tag}]")
    print(f"topic_pool ({len(brief.topic_pool)} topics):")
    for t in brief.topic_pool:
        print(f"  - [{t.tag:12s}] {t.title}  (probe: {', '.join(t.probe_focus)})")
    print(f"interview_strategy: {brief.interview_strategy}")
    print(f"red_flags: {brief.red_flags}")
    log["level"] = level
    log["brief"] = json.loads(brief.model_dump_json())

    # -- Step 2: build the evaluation-layer + voice-layer system prompt -------
    voice_layer_prompt = build_voice_layer_prompt(
        candidate_name=candidate_name, job_title=job_title,
        time_limit_mins=20, ai_name="Ishitha", org_name="Verify Co",
    )
    evaluation_layer_prompt = build_evaluation_layer_prompt(
        candidate_name=candidate_name, job_title=job_title,
        interview_brief=brief, level=level,
    )
    system_prompt = build_system_prompt(
        voice_layer_prompt=voice_layer_prompt, evaluation_layer_prompt=evaluation_layer_prompt,
    )
    log["evaluation_layer_prompt_preview"] = evaluation_layer_prompt[:2000]

    # -- Step 3: simulate a multi-turn interview -------------------------------
    _hr(f"[{which.upper()}] STEP 2 -- Simulated interview ({num_turns} turns)")

    resume_background = json.dumps(resume_json, indent=None)
    transcript_lines: list[str] = []
    topic_pool = list(brief.topic_pool)
    active_topic_item = brief.anchor_topic
    active_topic_state: dict | None = None
    topic_idx = 0

    # Opening question grounded on the anchor topic (mirrors phases.py's opening rule).
    current_question = (
        f"Let's start with {active_topic_item.title}. {active_topic_item.full_description} "
        f"Walk me through it -- what was actually yours in this?"
    )

    for turn in range(1, num_turns + 1):
        print(f"\n--- Turn {turn} | topic: {active_topic_item.title} [{active_topic_item.tag}] ---")
        print(f"Q: {current_question}")

        answer = await _simulate_candidate_answer(
            client=client, resume_background=resume_background,
            question=current_question, turn_index=turn,
        )
        print(f"A: {answer}")
        transcript_lines.append(f"Interviewer: {current_question}")
        transcript_lines.append(f"Candidate: {answer}")

        eval_payload = {
            "app_id": log.get("app_id", "verify-script"),
            "turn": turn,
            "answer": answer,
            "question": current_question,
            "transcript_lines": transcript_lines,
            "org_id": "",
            "llm_model": INTERVIEW_LLM_MODEL,
            "active_topic": active_topic_item.title,
            "active_topic_state": active_topic_state,
            "anchor_item": brief.anchor_topic.title,
            "job_title": job_title,
            "remaining_seconds": 900.0,
            "candidate_name": candidate_name,
            "level": level,
            "time_limit_mins": 20,
            "topic_tag": active_topic_item.tag,
            "topic_probe_focus": active_topic_item.probe_focus,
            "topic_why_relevant": active_topic_item.why_relevant,
        }
        eval_result = await run_eval_and_build_directive(eval_payload, client)
        signal = eval_result["signal"]
        signal_reason = eval_result["signal_reason"]
        action = eval_result["action"]
        qr = eval_result["quality_record"]
        active_topic_state = eval_result["saturation"]["topic_state_dict"]

        print(
            f"SCORE: clarity={qr['clarity']:.1f} depth={qr['depth']:.1f} "
            f"specificity={qr['specificity']:.1f} grounding={qr['grounding']:.1f} "
            f"overall={qr['overall']:.1f}"
        )
        print(f"SIGNAL: {signal!r}  reason={signal_reason!r}")
        print(f"ACTION: {action}  |  saturation={eval_result['saturation']['score']:.1f}/{eval_result['saturation']['threshold']:.1f}")

        turn_log = {
            "turn": turn, "topic": active_topic_item.title, "topic_tag": active_topic_item.tag,
            "question": current_question, "answer": answer,
            "scores": {k: qr[k] for k in ("clarity", "depth", "specificity", "grounding", "overall")},
            "signal": signal, "signal_reason": signal_reason, "action": action,
            "saturation": eval_result["saturation"],
        }

        # -- Build next question: PROBE (stay on topic) or MOVE_ON (advance) --
        if action == "MOVE_ON" and topic_idx + 1 < len(topic_pool):
            topic_idx += 1
            active_topic_item = topic_pool[topic_idx]
            active_topic_state = None
            directive_block = (
                f"[NEXT_TURN_DIRECTIVE]\naction: MOVE_ON\nnew_topic: {active_topic_item.title}\n"
                f"source_tag: {active_topic_item.tag}\ncontext: {active_topic_item.full_description}\n"
                f"probe_focus: {', '.join(active_topic_item.probe_focus)}\n"
            )
        else:
            probe_context = get_probe_context(
                signal=signal, signal_reason=signal_reason, level=level,
                topic_follow_ups=eval_result["saturation"]["follow_up_turns"],
                topic_denied=False, prev_answer=answer,
                signals_history=(active_topic_state or {}).get("signals_fired", []),
                active_topic=active_topic_item.title, prev_question=current_question,
            )
            directive_block = f"[NEXT_TURN_DIRECTIVE]\naction: PROBE\n{probe_context}\n"

        turn_log["directive_sent_to_question_gen"] = directive_block
        next_question = await _generate_next_question(
            client=client, system_prompt=QUESTION_GENERATION_SYSTEM,
            directive_block=directive_block, transcript_lines=transcript_lines,
        )
        turn_log["next_question_generated"] = next_question
        print(f"NEXT Q (generated): {next_question}")

        current_question = next_question if next_question and next_question != "NO_FOLLOW_UP_NEEDED" else (
            f"Tell me more about {active_topic_item.title}."
        )
        log["turns"].append(turn_log)

    # -- Step 4: final report + summary ---------------------------------------
    _hr(f"[{which.upper()}] STEP 3 -- Final report + summary")
    app_id = f"verify-{which}-{uuid.uuid4().hex[:8]}"
    log["app_id"] = app_id

    answer_scores = [
        {
            "turn": t["turn"], "topic": t["topic"], "question": t["question"], "answer": t["answer"],
            "clarity": t["scores"]["clarity"], "depth": t["scores"]["depth"],
            "specificity": t["scores"]["specificity"], "grounding": t["scores"]["grounding"],
            "overall": t["scores"]["overall"], "signal": t["signal"], "signal_reason": t["signal_reason"],
            "is_warmup": False,
        }
        for t in log["turns"]
    ]
    topic_records = [
        {"topic": t.title, "topic_type": t.topic_type} for t in topic_pool[: topic_idx + 1]
    ]

    if SKIP_DB:
        print("VERIFY_SKIP_DB=1 -- skipping generate_interview_report/summary (DB write).")
        log["scores_context"] = None
    else:
        scores_context = await generate_interview_report(
            app_id, transcript_lines, answer_scores, job_title,
            llmInterviewReport=INTERVIEW_LLM_MODEL,
            proctoring_data={}, org_id=None, jd_json=jd_data, resume_json=resume_json,
            topic_records=topic_records, candidate_name=candidate_name,
            answer_integrity_enabled=False, is_test=True,
        )
        log["scores_context"] = scores_context
        if scores_context:
            print(f"\nOVERALL SCORE: {scores_context['overall']}/100")
            for d in scores_context["dimensions"]:
                print(f"  {d['name']:28s} {d['score']:3d}/100  -- {d['evidence'][:100]}")
            print(f"\nSTRENGTHS: {scores_context['strengths']}")
            print(f"CONCERNS:  {scores_context['concerns']}")
            print(f"SKILLS EVALUATED: {[s['skill'] for s in scores_context['skill_ratings']]}")

            await generate_interview_summary(
                app_id, transcript_lines, job_title,
                llmInterviewReport=INTERVIEW_LLM_MODEL, org_id=None,
                scores_context=scores_context, candidate_name=candidate_name, is_test=True,
            )
            print("(summary+verdict generated -- DB write attempted for throwaway app_id, expected no-op)")
        else:
            print("generate_interview_report returned None (see logs above for why).")

    return log


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--which", choices=["tech", "sales", "both"], default="both")
    parser.add_argument("--turns", type=int, default=6)
    parser.add_argument("--level", type=int, choices=[1, 2, 3, 4], default=2)
    args = parser.parse_args()

    if not os.environ.get("OPENAI_API_KEY"):
        print("ERROR: OPENAI_API_KEY not set (checked .env at repo root).", file=sys.stderr)
        sys.exit(1)

    client = AsyncOpenAI()
    targets = ["tech", "sales"] if args.which == "both" else [args.which]

    run_id = time.strftime("%Y%m%d_%H%M%S")
    results: dict[str, Any] = {}
    for which in targets:
        results[which] = await run_pipeline(which=which, num_turns=args.turns, client=client, level=args.level)
        out_path = OUTPUT_DIR / f"{run_id}_{which}.json"
        out_path.write_text(json.dumps(results[which], indent=2, default=str), encoding="utf-8")
        print(f"\n[{which.upper()}] Full trace written to {out_path}")

    print(f"\n{'='*90}\nDONE. Outputs in {OUTPUT_DIR}\n{'='*90}")


if __name__ == "__main__":
    asyncio.run(main())
