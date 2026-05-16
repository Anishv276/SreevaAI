import asyncio
import asyncpg
import json
import os

DATABASE_URL = "postgresql://postgres.wfyvdqeqpkmskipyjysw:Lumoscale%403468%5E%25%24@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"

async def check_vamsi_full():
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        # Search for the specific candidate
        row = await conn.fetchrow("""
            SELECT a."fullName", i."interviewTranscript", i."proctoringReport", i.status
            FROM "Interview" i
            JOIN "Application" a ON i."applicationId" = a.id
            WHERE a."fullName" = 'Vamsi Krishna Dakka'
            ORDER BY i."createdAt" DESC
            LIMIT 1
        """)
        
        if not row:
            print("Candidate 'Vamsi Krishna Dakka' not found.")
            return

        print(f"Candidate: {row['fullName']}")
        print("=" * 60)
        
        report = row['proctoringReport']
        if report:
            report_data = json.loads(report) if isinstance(report, str) else report
            print(f"Stage History: {report_data.get('stage_history')}")
        
        transcript = row['interviewTranscript']
        if transcript:
            print("FULL TRANSCRIPT:")
            print(transcript)
        else:
            print("No transcript found.")
            
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(check_vamsi_full())
