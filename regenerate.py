import asyncio
import os
import json
import asyncpg
from dotenv import load_dotenv

load_dotenv()

from interview.agent_persistence import DatabasePool
from interview.report_pipeline import generate_interview_report, generate_interview_summary

async def main():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("No DB URL")
        return

    pool = await DatabasePool.get()

    async with pool.acquire() as conn:
        rows = await conn.fetch('''
            SELECT a.id as app_id, a."fullName", i."interviewTranscript", i."questionByQuestionAnalysis",
                   d."title" as job_title, d."orgId" as org_id,
                   d."extractedDetails" as jd_json
            FROM "Application" a
            JOIN "Interview" i ON i."applicationId" = a.id
            JOIN "Drive" d ON a."driveId" = d.id
            WHERE a."fullName" ILIKE '%vadla vamsi krishna%'
        ''')

    if not rows:
        print("No application found.")
        return

    for row in rows:
        app_id    = row['app_id']
        job_title = row['job_title']
        org_id    = row['org_id']
        transcript = row['interviewTranscript'] or ""
        transcript_lines = transcript.split('\n')

        # Parse JD JSON for role-aware scoring
        jd_json = None
        raw_jd = row['jd_json']
        if raw_jd:
            try:
                jd_json = json.loads(raw_jd) if isinstance(raw_jd, str) else raw_jd
            except Exception:
                jd_json = None

        qba = row['questionByQuestionAnalysis']
        answer_scores = []
        if qba:
            parsed_qba = json.loads(qba) if isinstance(qba, str) else qba
            for turn in parsed_qba:
                answer_scores.append({
                    "turn":           turn.get("turn"),
                    "question":       turn.get("ai_question"),
                    "ai_question":    turn.get("ai_question"),
                    "answer":         turn.get("candidate_answer"),
                    "candidate_answer": turn.get("candidate_answer"),
                    "topic":          turn.get("topic"),
                    "is_warmup":      turn.get("is_warmup", False),
                    "score_breakdown": turn.get("score_breakdown", {}),
                    "signal":         turn.get("signal"),
                    "signal_reason":  turn.get("signal_reason", ""),
                })

        print(f"Generating for {app_id} - {row['fullName']}  (JD: {'yes' if jd_json else 'no'})")

        scores_context = await generate_interview_report(
            app_id=app_id,
            transcript_lines=transcript_lines,
            answer_scores=answer_scores,
            job_title=job_title,
            proctoring_data={"events": []},
            org_id=org_id,
            llm_model="gpt-4o-mini",
            jd_json=jd_json,
        )

        if scores_context:
            await generate_interview_summary(
                app_id=app_id,
                transcript_lines=transcript_lines,
                job_title=job_title,
                org_id=org_id,
                llm_model="gpt-4o-mini",
                scores_context=scores_context
            )
            print(f"Successfully generated report and summary for {app_id}")
        else:
            print("Failed to generate report")

    await pool.close()

if __name__ == "__main__":
    asyncio.run(main())

