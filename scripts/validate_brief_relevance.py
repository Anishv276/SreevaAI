"""
scripts/validate_brief_relevance.py
====================================
Read-only check: find a candidate by name, generate an InterviewBrief from
their real resume + JD (no DB writes), and print topic_pool so you can eyeball
whether topic selection is actually relevant to the role or just dumping
every resume line as a topic.

Usage:
    python scripts/validate_brief_relevance.py "Vamsi Krishna"
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

import asyncpg
from dotenv import load_dotenv
from openai import AsyncOpenAI

_repo_root = Path(__file__).resolve().parents[1]
if str(_repo_root) not in sys.path:
    sys.path.insert(0, str(_repo_root))
load_dotenv(_repo_root / ".env")

from interview.band_classifier import classify_band  # noqa: E402
from interview.generate_brief import _coerce_dict, _normalize_dsn  # noqa: E402
from interview.interview_brief import generate_interview_brief  # noqa: E402

_FIND_QUERY = """
SELECT
    a.id                                        AS "applicationId",
    a."candidateFullName"                       AS "fullName",
    a."resumeParsedData"                        AS "resumeData",
    d."jobRole"                                 AS "role",
    d."title",
    d."jdExtractedDetails"                      AS "extractedDetails",
    d."aiGeneratedInterviewQuestions"           AS "interviewQuestions",
    o."llmInterviewBrief"
FROM "Application" a
JOIN "Job" d ON a."jobId" = d.id
LEFT JOIN "OrganizationDetails" o ON d."organizationId" = o.id
WHERE a."candidateFullName" ILIKE $1
ORDER BY a."appliedAt" DESC
LIMIT 1
"""


def _custom_questions(raw: object) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(q).strip() for q in raw if str(q).strip()]
    try:
        parsed = json.loads(str(raw))
        return [str(q).strip() for q in parsed if str(q).strip()] if isinstance(parsed, list) else []
    except Exception:
        return []


async def main(name_query: str) -> None:
    database_url = os.environ["DATABASE_URL"]
    openai_key = os.environ["OPENAI_API_KEY"]

    pool = await asyncpg.create_pool(
        _normalize_dsn(database_url), ssl=False, statement_cache_size=0, min_size=1, max_size=1,
    )
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(_FIND_QUERY, f"%{name_query}%")
        if not row:
            print(f"No application found matching name ILIKE '%{name_query}%'", file=sys.stderr)
            sys.exit(1)
        row = dict(row)

        job_title = (row["role"] or row["title"] or "").strip()
        resume_json = _coerce_dict(row["resumeData"])
        jd_data = _coerce_dict(row["extractedDetails"])
        custom_questions = _custom_questions(row["interviewQuestions"])
        band, total_years, seniority = classify_band(resume_json)

        print(f"Candidate: {row['fullName']}  (applicationId={row['applicationId']})")
        print(f"Role: {job_title}  |  Band: {band}  ({total_years:.1f}y, {seniority or 'unknown'})")
        print(f"Custom questions provided: {len(custom_questions)}")
        print(f"Resume data present: {'yes' if resume_json else 'NO'}  |  JD data present: {'yes' if jd_data else 'NO'}")
        print("-" * 70)

        if not resume_json:
            print("No resumeData on this application -- cannot validate topic relevance.", file=sys.stderr)
            sys.exit(1)

        openai_client = AsyncOpenAI(api_key=openai_key)
        llm_model = (row["llmInterviewBrief"] or "gpt-4.1").strip()

        brief = await generate_interview_brief(
            candidate_name=row["fullName"],
            job_title=job_title,
            candidate_band=band,
            resume_json=resume_json,
            jd_data=jd_data,
            custom_questions=custom_questions,
            openai_client=openai_client,
            llm_model=llm_model,
        )

        print(f"\nANCHOR: {brief.anchor_topic.title}  [{brief.anchor_topic.tag}]")
        print(f"\nTOPIC POOL ({len(brief.topic_pool)} items):\n")
        for i, t in enumerate(brief.topic_pool, 1):
            custom_flag = "  [CUSTOM]" if t.is_custom_question else ""
            print(f"{i:2d}. [{t.tag:13s}] {t.title}{custom_flag}")
            print(f"    {t.full_description}")
            if t.probe_focus:
                print(f"    probe: {', '.join(t.probe_focus)}")
            print()

        print("-" * 70)
        print(f"red_flags: {brief.red_flags}")
        print(f"\nManually check above: does every RESUME_TOPIC actually matter for '{job_title}'?")
        print("Anything that looks like a resume line item unrelated to the role is a relevance-filter miss.")
    finally:
        await pool.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print('Usage: python scripts/validate_brief_relevance.py "<candidate name>"', file=sys.stderr)
        sys.exit(1)
    asyncio.run(main(sys.argv[1]))
