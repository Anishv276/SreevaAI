import asyncio
import os
import json
import dotenv
from agent_persistence import get_db_pool

# Load .env
dotenv.load_dotenv(dotenv_path=".env")

async def check_murali():
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        # Search for candidates with Murali in their name
        rows = await conn.fetch("""
            SELECT a.id as "appId", a."fullName", i."interviewTranscript", i."proctoringReport", i.status, i."interviewReport", i."interviewRecordingUrl", i."recordingStatus", i."recordingMimeType", i."recordingCompletedAt", i."recordingManifest"
            FROM "Interview" i
            JOIN "Application" a ON i."applicationId" = a.id
            WHERE a."fullName" ILIKE '%Murali%'
            ORDER BY i."createdAt" DESC
            LIMIT 5
        """)
        
        if not rows:
            print("No candidate found with name Murali")
            return
            
        for row in rows:
            print(f"Candidate: {row['fullName']}")
            print(f"Application ID: {row['appId']}")
            print(f"Status: {row['status']}")
            print(f"Recording URL: {row['interviewRecordingUrl']}")
            print(f"Recording Status: {row['recordingStatus']}")
            print(f"Recording MimeType: {row['recordingMimeType']}")
            print(f"Recording Completed At: {row['recordingCompletedAt']}")
            print("Recording Manifest:")
            if row['recordingManifest']:
                try:
                    manifest = json.loads(row['recordingManifest'])
                    print(json.dumps(manifest, indent=2))
                except Exception as e:
                    print(row['recordingManifest'])
            else:
                print("None")
            print("-" * 40)

if __name__ == "__main__":
    asyncio.run(check_murali())
