Give import asyncio
import asyncpg
import json
import os

DATABASE_URL = "postgresql://postgres.wfyvdqeqpkmskipyjysw:Lumoscale%403468%5E%25%24@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"

async def check_vamsi():
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        # Search for candidates with Vamsi in their name
        rows = await conn.fetch("""
            SELECT a."fullName", i."interviewTranscript", i."proctoringReport", i.status
            FROM "Interview" i
            JOIN "Application" a ON i."applicationId" = a.id
            WHERE a."fullName" ILIKE '%Vamsi%'
            ORDER BY i."createdAt" DESC
            LIMIT 5
        """)
        
        for row in rows:
            print(f"Candidate: {row['fullName']}")
            print(f"Status: {row['status']}")
            report = row['proctoringReport']
            if report:
                report_data = json.loads(report) if isinstance(report, str) else report
                print(f"Stages Covered: {report_data.get('total_stages_covered')}")
                print(f"Stage History: {report_data.get('stage_history')}")
            else:
                print("No proctoring report found.")
            
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
