import asyncio
import asyncpg
import json

DATABASE_URL = "postgresql://postgres.wfyvdqeqpkmskipyjysw:Lumoscale%403468%5E%25%24@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"

async def check_billing():
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        # Recent interviews and their billing state
        rows = await conn.fetch("""
            SELECT
                a."fullName",
                a.id as "appId",
                i.status,
                i."completedAt",
                i."interviewDuration",
                i."recordingDurationSec",
                i."billingSnapshot",
                i."createdAt"
            FROM "Interview" i
            JOIN "Application" a ON i."applicationId" = a.id
            JOIN "Drive" d ON d.id = a."driveId"
            JOIN "Organization" o ON o.id = d."orgId"
            WHERE o.id = (
                SELECT d2."orgId" FROM "Application" a2
                JOIN "Drive" d2 ON d2.id = a2."driveId"
                WHERE a2."fullName" ILIKE '%Vamsi%'
                LIMIT 1
            )
            ORDER BY i."createdAt" DESC
            LIMIT 10
        """)

        print("=== Recent Interviews ===")
        for row in rows:
            snapshot = row["billingSnapshot"]
            if isinstance(snapshot, str):
                try:
                    snapshot = json.loads(snapshot)
                except Exception:
                    snapshot = {}
            billed_at = snapshot.get("billedAt") if snapshot else None
            dur = row["interviewDuration"] or row["recordingDurationSec"]
            print(f"  {row['fullName']} | status={row['status']} | dur={dur}s | billedAt={billed_at} | completedAt={row['completedAt']}")

        # Org quota state
        org_row = await conn.fetchrow("""
            SELECT o.id, o."interviewQuotaTotal", o."interviewQuotaUsed", o."creditsUsed"
            FROM "Organization" o
            JOIN "Drive" d ON d."orgId" = o.id
            JOIN "Application" a ON a."driveId" = d.id
            WHERE a."fullName" ILIKE '%Vamsi%'
            LIMIT 1
        """)
        if org_row:
            print(f"\n=== Org Billing ===")
            print(f"  quotaTotal={org_row['interviewQuotaTotal']} quotaUsed={org_row['interviewQuotaUsed']} creditsUsed={org_row['creditsUsed']}")

    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(check_billing())