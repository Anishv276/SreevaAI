import asyncio
import asyncpg
import json
import os

DATABASE_URL = "postgresql://postgres.wfyvdqeqpkmskipyjysw:Lumoscale%403468%5E%25%24@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"

async def check_vamsi():
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        # Search for candidates with Vamsi in their name
        rows = await conn.fetch("""
            SELECT a.id as "appId", a."fullName", a."aiReport" as "appAiReport", i."interviewTranscript", i."proctoringReport", i.status, i."interviewReport", i."strategicVerdict", i."aiSummary", i."answerScores"
            FROM "Interview" i
            JOIN "Application" a ON i."applicationId" = a.id
            WHERE a."fullName" ILIKE '%Vamsi Krishna Dakka%'
            ORDER BY i."createdAt" DESC
            LIMIT 5
        """)
        
        for row in rows:
            print(f"Candidate: {row['fullName']}")
            print(f"Application ID: {row['appId']}")
            print(f"Status: {row['status']}")
            
            scores = row['answerScores']
            if scores and scores != {} and scores != "{}":
                scores_data = json.loads(scores) if isinstance(scores, str) else scores
                print(f"Answer Scores: FOUND ({scores_data.get('totalAnswers', 0)} answers)")
            else:
                print("Answer Scores: MISSING")

            
            summary = row['aiSummary']
            if summary:
                print(f"AI Summary: FOUND (Length: {len(summary)})")
                print(f"AI Summary Snippet: {summary[:200]}...")
            else:
                print("AI Summary: MISSING")


            
            app_report = row['appAiReport']
            if app_report:
                print(f"Application AI Report (Snippet):")
                print(app_report[:500])
            else:
                print("Application AI Report: MISSING")

            report = row['interviewReport']
            if report and report != {} and report != "{}":
                report_data = json.loads(report) if isinstance(report, str) else report
                print("Interview Report (Keys):")
                print(list(report_data.keys()))
                print("Interview Report (Snippet):")
                print(json.dumps(report_data, indent=2)[:500])
            else:
                print("Interview Report: MISSING or EMPTY")
                
            verdict = row['strategicVerdict']
            if verdict and verdict != {} and verdict != "{}":
                verdict_data = json.loads(verdict) if isinstance(verdict, str) else verdict
                print("Strategic Verdict (Keys):")
                print(list(verdict_data.keys()))
            else:
                print("Strategic Verdict: MISSING or EMPTY")




            proctoring = row['proctoringReport']
            if proctoring:
                report_data = json.loads(proctoring) if isinstance(proctoring, str) else proctoring
                print(f"Stages Covered: {report_data.get('total_stages_covered')}")

            
            transcript = row['interviewTranscript']
            if transcript:
                print("Transcript Snippet (last 500 chars):")
                print(transcript[-500:])
            else:
                print("No transcript found.")
            print("-" * 40)
            
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(check_vamsi())
