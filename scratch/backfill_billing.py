"""
Backfill billing for all COMPLETED interviews that were never billed (billedAt IS NULL).
Marks billedAt, deducts interviewQuotaUsed, and increments creditsUsed per org.
Safe to run multiple times — atomic mark prevents double-billing.
"""
import asyncio
import asyncpg
import json

DATABASE_URL = "postgresql://postgres.wfyvdqeqpkmskipyjysw:Lumoscale%403468%5E%25%24@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"

async def backfill():
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        # Find all completed, unbilled interviews
        rows = await conn.fetch("""
            SELECT
                i."applicationId",
                i."interviewDuration",
                i."recordingDurationSec",
                d."orgId"
            FROM "Interview" i
            JOIN "Application" a ON a.id = i."applicationId"
            JOIN "Drive" d ON d.id = a."driveId"
            WHERE i.status = 'COMPLETED'
              AND ("billingSnapshot" IS NULL OR "billingSnapshot"->'billedAt' IS NULL)
              AND d."orgId" IS NOT NULL
        """)

        print(f"Found {len(rows)} unbilled completed interviews")

        org_quota = {}   # orgId -> count to deduct
        org_credits = {} # orgId -> credits to add

        billed = []
        for row in rows:
            app_id = row["applicationId"]
            org_id = row["orgId"]
            dur = float(row["interviewDuration"] or row["recordingDurationSec"] or 0)

            # Atomic mark
            marked = await conn.fetch("""
                UPDATE "Interview"
                SET "billingSnapshot" = jsonb_set(
                    COALESCE("billingSnapshot", '{}'::jsonb),
                    '{billedAt}',
                    to_jsonb(extract(epoch from now())::bigint)
                ),
                "updatedAt" = NOW()
                WHERE "applicationId" = $1
                  AND ("billingSnapshot" IS NULL OR "billingSnapshot"->'billedAt' IS NULL)
                RETURNING id
            """, app_id)

            if not marked:
                print(f"  SKIP {app_id} — already marked during run")
                continue

            org_quota[org_id] = org_quota.get(org_id, 0) + 1
            credits = round((dur / 60) * 100) / 100 if dur > 0 else 0
            org_credits[org_id] = org_credits.get(org_id, 0) + credits
            billed.append((app_id, org_id, dur, credits))
            print(f"  Marked {app_id} | org={org_id} | dur={dur:.0f}s | credits={credits:.2f}")

        # Now reset quotaUsed to actual count and set creditsUsed
        print(f"\nUpdating org billing totals...")
        for org_id in set(list(org_quota.keys()) + list(org_credits.keys())):
            # Count ALL billed completed interviews for this org (after backfill)
            total = await conn.fetchval("""
                SELECT COUNT(*)
                FROM "Interview" i
                JOIN "Application" a ON a.id = i."applicationId"
                JOIN "Drive" d ON d.id = a."driveId"
                WHERE i.status = 'COMPLETED'
                  AND "billingSnapshot"->'billedAt' IS NOT NULL
                  AND d."orgId" = $1
            """, org_id)

            total_credits = await conn.fetchval("""
                SELECT COALESCE(SUM(
                    ROUND((COALESCE(i."interviewDuration", i."recordingDurationSec", 0)::numeric / 60) * 100) / 100
                ), 0)
                FROM "Interview" i
                JOIN "Application" a ON a.id = i."applicationId"
                JOIN "Drive" d ON d.id = a."driveId"
                WHERE i.status = 'COMPLETED'
                  AND "billingSnapshot"->'billedAt' IS NOT NULL
                  AND d."orgId" = $1
            """, org_id)

            await conn.execute("""
                UPDATE "Organization"
                SET "interviewQuotaUsed" = $1,
                    "creditsUsed" = $2,
                    "updatedAt" = NOW()
                WHERE id = $3
            """, total, float(total_credits), org_id)

            print(f"  Org {org_id}: quotaUsed={total}, creditsUsed={float(total_credits):.2f}")

        print(f"\nDone. Billed {len(billed)} interviews.")

    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(backfill())