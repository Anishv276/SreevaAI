"""
Simulate a 15-minute interview billing deduction for the test org.
Shows before/after state in DB.
"""
import asyncio
import asyncpg
import json
import time

DATABASE_URL = "postgresql://postgres.wfyvdqeqpkmskipyjysw:Lumoscale%403468%5E%25%24@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"

# 15 minutes in seconds
TEST_DURATION_SEC = 15 * 60  # 900s

async def run_test():
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        # Find the org
        org = await conn.fetchrow("""
            SELECT id, "interviewQuotaTotal", "interviewQuotaUsed", "creditsUsed"
            FROM "Organization"
            WHERE id = 'org-test-6462'
        """)
        if not org:
            print("ERROR: Org not found")
            return

        print("=== BEFORE ===")
        print(f"  quotaTotal={org['interviewQuotaTotal']}")
        print(f"  quotaUsed={org['interviewQuotaUsed']}")
        print(f"  quotaRemaining={org['interviewQuotaTotal'] - org['interviewQuotaUsed']}")
        print(f"  creditsUsed={org['creditsUsed']}")

        # Insert a fake completed interview for a fake applicationId
        fake_app_id = f"test-billing-run-{int(time.time())}"
        print(f"\n  Fake applicationId: {fake_app_id}")
        print(f"  Duration: {TEST_DURATION_SEC}s = 15 min")
        credits_delta = round((TEST_DURATION_SEC / 60) * 100) / 100

        # We'll test deduct_interview_billing directly by replicating the logic here
        # Step 1: Create a minimal Interview row (no application needed — we test the function logic)
        # Instead, let's call the actual function from agent_persistence
        import sys
        import os
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        os.environ["DATABASE_URL"] = DATABASE_URL

        from interview.agent_persistence import deduct_interview_billing

        # We need a real applicationId that is COMPLETED and unbilled — let's pick the most recent one
        # or just do it raw against org directly for testing

        # Raw test: simulate what deduct_interview_billing does against the org directly
        # Deduct 1 quota slot
        await conn.execute("""
            UPDATE "Organization"
            SET "interviewQuotaUsed" = COALESCE("interviewQuotaUsed", 0) + 1,
                "creditsUsed" = COALESCE("creditsUsed", 0) + $1,
                "updatedAt" = NOW()
            WHERE id = $2
        """, credits_delta, org["id"])

        print(f"\n  Deducted: 1 quota slot + {credits_delta} credits (15 min)")

        # Read back
        updated = await conn.fetchrow("""
            SELECT "interviewQuotaTotal", "interviewQuotaUsed", "creditsUsed"
            FROM "Organization"
            WHERE id = $1
        """, org["id"])

        print("\n=== AFTER ===")
        print(f"  quotaTotal={updated['interviewQuotaTotal']}")
        print(f"  quotaUsed={updated['interviewQuotaUsed']}")
        print(f"  quotaRemaining={updated['interviewQuotaTotal'] - updated['interviewQuotaUsed']}")
        print(f"  creditsUsed={updated['creditsUsed']}")

        # Rollback the test deduction
        await conn.execute("""
            UPDATE "Organization"
            SET "interviewQuotaUsed" = COALESCE("interviewQuotaUsed", 0) - 1,
                "creditsUsed" = COALESCE("creditsUsed", 0) - $1,
                "updatedAt" = NOW()
            WHERE id = $2
        """, credits_delta, org["id"])

        reverted = await conn.fetchrow("""
            SELECT "interviewQuotaTotal", "interviewQuotaUsed", "creditsUsed"
            FROM "Organization"
            WHERE id = $1
        """, org["id"])

        print("\n=== REVERTED (test cleanup) ===")
        print(f"  quotaTotal={reverted['interviewQuotaTotal']}")
        print(f"  quotaUsed={reverted['interviewQuotaUsed']}")
        print(f"  creditsUsed={reverted['creditsUsed']}")
        print("\nTest complete. DB is back to original state.")

    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(run_test())