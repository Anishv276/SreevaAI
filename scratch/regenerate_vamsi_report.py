import asyncio
import json
import os
import sys
from typing import Optional

# Add the current directory to sys.path to import local modules
sys.path.append(os.getcwd())

from interview.agent_persistence import generate_interview_report, get_db_pool
from behavioral_analysis import synthesize_behavioral_report

async def regenerate_report(app_id: str):
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        # Fetch necessary data
        row = await conn.fetchrow("""
            SELECT i."interviewTranscript", i."answerScores", i."proctoringReport", d.role as "jobTitle", d."orgId"
            FROM "Interview" i
            JOIN "Application" a ON i."applicationId" = a.id
            JOIN "Drive" d ON a."driveId" = d.id
            WHERE a.id = $1
        """, app_id)
        
        if not row:
            print(f"No interview found for application {app_id}")
            return

        transcript_lines = row['interviewTranscript'].split("\n") if row['interviewTranscript'] else []
        
        answer_scores_raw = row['answerScores']
        if isinstance(answer_scores_raw, str):
            answer_scores_data = json.loads(answer_scores_raw)
        else:
            answer_scores_data = answer_scores_raw
        
        answer_scores = answer_scores_data.get('allAnswers', []) if answer_scores_data else []
        
        proctoring_report_raw = row['proctoringReport']
        if isinstance(proctoring_report_raw, str):
            proctoring_data = json.loads(proctoring_report_raw)
        else:
            proctoring_data = proctoring_report_raw

        job_title = row['jobTitle']
        org_id = row['orgId']
        
        print(f"Regenerating report for {app_id}...")
        print(f"Transcript lines: {len(transcript_lines)}")
        print(f"Answer scores: {len(answer_scores)}")
        
        # We'll use GPT-4o for regeneration
        llm_model = "gpt-4o"
        
        try:
            await generate_interview_report(
                app_id=app_id,
                transcript_lines=transcript_lines,
                answer_scores=answer_scores,
                job_title=job_title,
                proctoring_data=proctoring_data,
                org_id=org_id,
                llm_model=llm_model
            )
            print("Successfully regenerated report!")
        except Exception as e:
            print(f"Failed to regenerate report: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    app_id = "app-vamsi-2026-1-cmp8occmg00-3900"
    if len(sys.argv) > 1:
        app_id = sys.argv[1]
    asyncio.run(regenerate_report(app_id))
