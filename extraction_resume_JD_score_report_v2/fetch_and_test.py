"""
fetch_and_test.py — Fetch real JD + resume from DB, run v1 vs v2 scoring comparison.

Looks for:
  - Job with title/role matching "GTM" (the JD)
  - Application with fullName matching "Vadla Vamsi Krishna" (the resume)

Then runs both scorers against the already-parsed data stored in the DB
(resumeData / extractedDetails) and compares results.
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg2
from dotenv import load_dotenv

load_dotenv()

from openai import OpenAI
from extraction_resume_JD_score_report_v2.scorer import compute_score as score_v2


# -- DB fetch ------------------------------------------------------------------

def get_conn():
    url = os.environ["DATABASE_URL"]
    # psycopg2 doesn't support pgbouncer param; strip it
    url = url.replace("?pgbouncer=true", "")
    return psycopg2.connect(url)


def fetch_gtm_job(cur) -> dict | None:
    cur.execute("""
        SELECT id, title, "jobRole" AS role, "jdExtractedDetails" AS "extractedDetails", "resumeScreeningCriteria" AS "screeningCriteria", "jdPreviewUrl"
        FROM "Job"
        WHERE ("title" ILIKE '%gtm%' OR "jobRole" ILIKE '%gtm%')
          AND "isDeleted" = false
        ORDER BY "jobCreatedAt" DESC
        LIMIT 5
    """)
    rows = cur.fetchall()
    if not rows:
        return None
    print(f"\nFound {len(rows)} GTM job(s):")
    for i, r in enumerate(rows):
        print(f"  [{i}] id={r[0]}  title={r[1]}  role={r[2]}")
    row = rows[0]
    extracted = {}
    if row[3]:
        try:
            extracted = json.loads(row[3])
        except Exception:
            pass
    screening = {}
    if row[4]:
        try:
            screening = json.loads(row[4])
        except Exception:
            pass
    return {
        "job_id": row[0],
        "title": row[1],
        "role": row[2],
        "jd_data": extracted,
        "screening_criteria": screening,
        "jd_preview_url": row[5],
    }


def fetch_vamsi_application(cur, job_id: str | None = None) -> dict | None:
    if job_id:
        cur.execute("""
            SELECT id, "candidateFullName", "candidateEmail", "resumeParsedData", "resumeRawText", "resumeAiScore", "resumeAiReport", "jobId"
            FROM "Application"
            WHERE "candidateFullName" ILIKE %s
              AND "isDeleted" = false
              AND "jobId" = %s
            ORDER BY "appliedAt" DESC
            LIMIT 5
        """, ('%vamsi%', job_id))
    else:
        cur.execute("""
            SELECT id, "candidateFullName", "candidateEmail", "resumeParsedData", "resumeRawText", "resumeAiScore", "resumeAiReport", "jobId"
            FROM "Application"
            WHERE "candidateFullName" ILIKE %s
              AND "isDeleted" = false
            ORDER BY "appliedAt" DESC
            LIMIT 5
        """, ('%vamsi%',))
    rows = cur.fetchall()
    if not rows:
        return None
    print(f"\nFound {len(rows)} Vamsi application(s):")
    for i, r in enumerate(rows):
        print(f"  [{i}] id={r[0]}  name={r[1]}  email={r[2]}  job={r[7]}  existing_score={r[5]}")
    row = rows[0]
    resume_data = {}
    if row[3]:
        try:
            resume_data = json.loads(row[3])
        except Exception:
            pass
    return {
        "app_id": row[0],
        "full_name": row[1],
        "email": row[2],
        "resume_data": resume_data,
        "resume_text": row[4] or "",
        "existing_score": row[5],
        "existing_report": row[6],
        "job_id": row[7],
    }


# -- Comparison runner ---------------------------------------------------------

def run(job_id_override: str | None = None):
    conn = get_conn()
    cur = conn.cursor()

    print("=== Fetching GTM Job ===")
    job = fetch_gtm_job(cur)
    if not job:
        print("ERROR: No GTM job found. Check job title/role in DB.")
        return

    print(f"\nUsing job: {job['title']} ({job['job_id']})")
    jd_data = job["jd_data"]
    if not jd_data:
        print("WARNING: Job has no extractedDetails (JD not yet parsed). Cannot score.")
        print("Job screening criteria:", json.dumps(job["screening_criteria"], indent=2)[:400])
        return

    print("\n=== Fetching Vamsi Application ===")
    app = fetch_vamsi_application(cur, job["job_id"])
    if not app:
        # Try without job filter
        print("  Not found in GTM job, searching all jobs...")
        app = fetch_vamsi_application(cur, None)
    if not app:
        print("ERROR: No application found for 'Vamsi'. Check name in DB.")
        return

    print(f"\nUsing application: {app['full_name']} ({app['app_id']})")
    print(f"Existing production score: {app['existing_score']}")

    resume_data = app["resume_data"]
    if not resume_data:
        print("ERROR: Application has no resumeData (resume not yet parsed).")
        return
    # resumeData is stored as {"source": {...}, "parsed": {...}} -- unwrap
    if "parsed" in resume_data:
        resume_data = resume_data["parsed"]

    screening = job["screening_criteria"]

    # -- Run scorer ------------------------------------------------------------
    oai = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    print("=== Running scorer ===")
    try:
        result = score_v2(jd_data, resume_data, threshold=70, screening_criteria=screening,
                          resume_raw_text=app["resume_text"], openai_client=oai)
    except Exception as e:
        print(f"ERROR: {e}")
        cur.close(); conn.close()
        return

    # -- Print results ---------------------------------------------------------
    print("\n" + "=" * 80)
    print(f"  RESULTS: {app['full_name']} vs {job['title']}")
    print("=" * 80)

    prod = app["existing_score"]
    bd = result.get("breakdown", {})
    print(f"\n  {'Metric':<35} {'Production':>12} {'Scorer':>10}")
    print(f"  {'-'*60}")
    print(f"  {'Score':<35} {str(prod or 'n/a'):>12} {result['score']:>10}")
    print(f"  {'Status':<35} {'n/a':>12} {result['status']:>10}")
    print(f"  {'Skills':<35} {'':>12} {bd.get('skills_score',0):>9}/50")
    print(f"  {'Experience':<35} {'':>12} {bd.get('exp_score',0):>9}/15")
    print(f"  {'Career quality':<35} {'':>12} {bd.get('career_score',0):>9}/15")
    print(f"  {'Domain fit':<35} {'':>12} {bd.get('domain_score',0):>9}/10")
    print(f"  {'Human adjustment':<35} {'':>12} {result['human_layer'].get('human_adjustment',0):>+10}")
    print(f"  {'Hard rejected':<35} {'':>12} {str(result.get('hard_rejected',False)):>10}")

    print(f"\n  Matched : {result['skill_matching']['matched_must']}")
    print(f"  Missing : {result['skill_matching']['missing_must']}")

    sm = result.get("semantic_matches", [])
    if sm:
        print(f"\n  Semantic matches:")
        for s in sm:
            print(f"    '{s['criterion']}' -> '{s['matched_to']}' (sim={s['similarity']:.2f}) -> {s['result']}")

    print(f"\n  Human layer: {result['human_layer'].get('summary','')}")

    print(f"\n  Per-criterion:")
    for cr in result.get("criteria_results", []):
        ms = cr.get("match_source", {})
        mt = ms.get("match_type", "none")
        print(f"    [{cr['priority']:8s}] {cr['criterion']:<40s} -> {cr['result']:<20s} via {mt} (contrib: {cr.get('score_contribution',0):.1f})")

    print("\n" + "=" * 80)
    cur.close()
    conn.close()


if __name__ == "__main__":
    run()
