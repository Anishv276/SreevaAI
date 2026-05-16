"""
End-to-end test of deduct_interview_billing() on a real completed interview.
1. Clears billedAt on one interview (to make it re-billable)
2. Calls deduct_interview_billing() with 15min duration
3. Shows before/after org state
4. Rolls back everything
"""
import asyncio
import asyncpg
import json
import sys
import os

DATABASE_URL = "postgresql://postgres.wfyvdqeqpkmskipyjysw:Lumoscale%403468%5E%25%24@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"
TEST_DURATION_SEC = 15 * 60  # 900s = 15 min

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["DATABASE_URL"] = DATABASE_URL


async def run():
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        # Pick the most recent completed interview
        interview = await conn.fetchrow("""
            SELECT i."applicationId", i."billingSnapshot", i."interviewDuration"
            FROM "Interview" i
            JOIN "Application" a ON a.id = i."applicationId"
            WHERE i.status = 'COMPLETED'
              AND i."billingSnapshot"->'billedAt' IS NOT NULL
            ORDER BY i."completedAt" DESC
            LIMIT 1
        """)
        if not interview:
            print("No billed completed interview found to test against")
            return

        app_id = interview["applicationId"]
        original_snapshot = interview["billingSnapshot"]
        original_duration = interview["interviewDuration"]

        print(f"Test target: applicationId={app_id}")
        print(f"  Original duration in DB: {original_duration}s")

        # Read org state before
        org_before = await conn.fetchrow("""
            SELECT o.id, o."interviewQuotaTotal", o."interviewQuotaUsed", o."creditsUsed"
            FROM "Organization" o
            JOIN "Drive" d ON d."orgId" = o.id
            JOIN "Application" a ON a."driveId" = d.id
            WHERE a.id = $1
        """, app_id)

        print(f"\n=== BEFORE ===")
        print(f"  quotaTotal   = {org_before['interviewQuotaTotal']}")
        print(f"  quotaUsed    = {org_before['interviewQuotaUsed']}")
        print(f"  quotaRemain  = {org_before['interviewQuotaTotal'] - org_before['interviewQuotaUsed']}")
        print(f"  creditsUsed  = {org_before['creditsUsed']}")

        # Step 1: Clear billedAt so the function thinks it's unbilled
        await conn.execute("""
            UPDATE "Interview"
            SET "billingSnapshot" = "billingSnapshot" - 'billedAt',
                "interviewDuration" = 900,
                "updatedAt" = NOW()
            WHERE "applicationId" = $1
        """, app_id)
        print(f"\n  [Setup] Cleared billedAt, set duration=900s on {app_id}")

        # Step 2: Call the real function
        from interview.agent_persistence import deduct_interview_billing
        await deduct_interview_billing(app_id, duration_seconds=TEST_DURATION_SEC)
        print(f"  [Function] deduct_interview_billing() called with duration={TEST_DURATION_SEC}s")

        # Step 3: Read back
        org_after = await conn.fetchrow("""
            SELECT o."interviewQuotaTotal", o."interviewQuotaUsed", o."creditsUsed"
            FROM "Organization" o
            JOIN "Drive" d ON d."orgId" = o.id
            JOIN "Application" a ON a."driveId" = d.id
            WHERE a.id = $1
        """, app_id)

        interview_after = await conn.fetchrow("""
            SELECT "billingSnapshot", "interviewDuration"
            FROM "Interview" WHERE "applicationId" = $1
        """, app_id)

        snapshot_after = interview_after["billingSnapshot"]
        if isinstance(snapshot_after, str):
            snapshot_after = json.loads(snapshot_after)

        print(f"\n=== AFTER ===")
        print(f"  quotaTotal   = {org_after['interviewQuotaTotal']}")
        print(f"  quotaUsed    = {org_after['interviewQuotaUsed']}  (delta: +{org_after['interviewQuotaUsed'] - org_before['interviewQuotaUsed']})")
        print(f"  quotaRemain  = {org_after['interviewQuotaTotal'] - org_after['interviewQuotaUsed']}")
        print(f"  creditsUsed  = {org_after['creditsUsed']}  (delta: +{float(org_after['creditsUsed']) - float(org_before['creditsUsed']):.2f})")
        print(f"  billedAt set = {'billedAt' in (snapshot_after or {})}")
        expected_credits = round((TEST_DURATION_SEC / 60) * 100) / 100
        print(f"\n  Expected credit delta: +{expected_credits} (15 min)")

        ok_quota = org_after['interviewQuotaUsed'] - org_before['interviewQuotaUsed'] == 1
        ok_credits = abs(float(org_after['creditsUsed']) - float(org_before['creditsUsed']) - expected_credits) < 0.01
        ok_billed = 'billedAt' in (snapshot_after or {})
        print(f"\n  quota deducted by 1: {'PASS' if ok_quota else 'FAIL'}")
        print(f"  credits deducted correctly: {'PASS' if ok_credits else 'FAIL'}")
        print(f"  billedAt set on Interview:  {'PASS' if ok_billed else 'FAIL'}")

        # Step 4: Idempotency check — call again, should be no-op
        await deduct_interview_billing(app_id, duration_seconds=TEST_DURATION_SEC)
        org_after2 = await conn.fetchrow("""
            SELECT o."interviewQuotaUsed", o."creditsUsed"
            FROM "Organization" o
            JOIN "Drive" d ON d."orgId" = o.id
            JOIN "Application" a ON a."driveId" = d.id
            WHERE a.id = $1
        """, app_id)
        ok_idempotent = (org_after2['interviewQuotaUsed'] == org_after['interviewQuotaUsed']
                         and org_after2['creditsUsed'] == org_after['creditsUsed'])
        print(f"  idempotency (2nd call no-op): {'PASS' if ok_idempotent else 'FAIL'}")

        # Rollback
        await conn.execute("""
            UPDATE "Interview"
            SET "billingSnapshot" = $1::jsonb,
                "interviewDuration" = $2,
                "updatedAt" = NOW()
            WHERE "applicationId" = $3
        """, json.dumps(original_snapshot) if isinstance(original_snapshot, dict) else original_snapshot,
            original_duration, app_id)
        await conn.execute("""
            UPDATE "Organization"
            SET "interviewQuotaUsed" = $1,
                "creditsUsed" = $2,
                "updatedAt" = NOW()
            FROM "Drive" d
            JOIN "Application" a ON a."driveId" = d.id
            WHERE "Organization".id = d."orgId" AND a.id = $3
        """, org_before['interviewQuotaUsed'], org_before['creditsUsed'], app_id)

        print(f"\n  [Rollback] DB restored to original state")

    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(run())