"""
fetch_and_test.py — Fetch real JD + resume from DB, run v1 vs v2 scoring comparison.

Looks for:
  - Drive with title/role matching "GTM" (the JD)
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
from extraction_resume_JD_score_report.scorer import compute_score as score_v1
from extraction_resume_JD_score_report_v2.scorer import compute_score as score_v2


# ── DB fetch ──────────────────────────────────────────────────────────────────

def get_conn():
    url = os.environ["DATABASE_URL"]
    # psycopg2 doesn't support pgbouncer param; strip it
    url = url.replace("?pgbouncer=true", "")
    return psycopg2.connect(url)


def fetch_gtm_drive(cur) -> dict | None:
    cur.execute("""
        SELECT id, title, role, "extractedDetails", "screeningCriteria", "jdPreviewUrl"
        FROM "Drive"
        WHERE ("title" ILIKE '%gtm%' OR "role" ILIKE '%gtm%')
          AND "isDeleted" = false
        ORDER BY "createdAt" DESC
        LIMIT 5
    """)
    rows = cur.fetchall()
    if not rows:
        return None
    print(f"\nFound {len(rows)} GTM drive(s):")
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
        "drive_id": row[0],
        "title": row[1],
        "role": row[2],
        "jd_data": extracted,
        "screening_criteria": screening,
        "jd_preview_url": row[5],
    }


def fetch_vamsi_application(cur, drive_id: str | None = None) -> dict | None:
    if drive_id:
        cur.execute("""
            SELECT id, "fullName", email, "resumeData", "resumeText", "aiScore", "aiReport", "driveId"
            FROM "Application"
            WHERE "fullName" ILIKE %s
              AND "isDeleted" = false
              AND "driveId" = %s
            ORDER BY "createdAt" DESC
            LIMIT 5
        """, ('%vamsi%', drive_id))
    else:
        cur.execute("""
            SELECT id, "fullName", email, "resumeData", "resumeText", "aiScore", "aiReport", "driveId"
            FROM "Application"
            WHERE "fullName" ILIKE %s
              AND "isDeleted" = false
            ORDER BY "createdAt" DESC
            LIMIT 5
        """, ('%vamsi%',))
    rows = cur.fetchall()
    if not rows:
        return None
    print(f"\nFound {len(rows)} Vamsi application(s):")
    for i, r in enumerate(rows):
        print(f"  [{i}] id={r[0]}  name={r[1]}  email={r[2]}  drive={r[7]}  existing_score={r[5]}")
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
        "drive_id": row[7],
    }


# ── Comparison runner ─────────────────────────────────────────────────────────

def run(drive_id_override: str | None = None):
    conn = get_conn()
    cur = conn.cursor()

    print("=== Fetching GTM Drive ===")
    drive = fetch_gtm_drive(cur)
    if not drive:
        print("ERROR: No GTM drive found. Check drive title/role in DB.")
        return

    print(f"\nUsing drive: {drive['title']} ({drive['drive_id']})")
    jd_data = drive["jd_data"]
    if not jd_data:
        print("WARNING: Drive has no extractedDetails (JD not yet parsed). Cannot score.")
        print("Drive screening criteria:", json.dumps(drive["screening_criteria"], indent=2)[:400])
        return

    print("\n=== Fetching Vamsi Application ===")
    app = fetch_vamsi_application(cur, drive["drive_id"])
    if not app:
        # Try without drive filter
        print("  Not found in GTM drive, searching all drives...")
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
    # resumeData is stored as {"source": {...}, "parsed": {...}} — unwrap
    if "parsed" in resume_data:
        resume_data = resume_data["parsed"]

    screening = drive["screening_criteria"]

    # ── Run both scorers ──────────────────────────────────────────────────────
    oai = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    print("\n=== Running v1 scorer ===")
    try:
        v1 = score_v1(jd_data, resume_data, threshold=70, screening_criteria=screening)
    except Exception as e:
        print(f"v1 ERROR: {e}")
        v1 = None

    print("=== Running v2 scorer (with semantic embeddings) ===")
    try:
        v2 = score_v2(jd_data, resume_data, threshold=70, screening_criteria=screening, resume_raw_text=app["resume_text"], openai_client=oai)
    except Exception as e:
        print(f"v2 ERROR: {e}")
        v2 = None

    # ── Print comparison ──────────────────────────────────────────────────────
    print("\n" + "=" * 80)
    print(f"  RESULTS: {app['full_name']} vs {drive['title']}")
    print("=" * 80)

    prod = app["existing_score"]
    v1s = v1["score"] if v1 else "ERROR"
    v2s = v2["score"] if v2 else "ERROR"

    print(f"\n  {'Metric':<35} {'Production':>12} {'v1':>10} {'v2':>10}")
    print(f"  {'-'*70}")
    print(f"  {'Score':<35} {str(prod or 'n/a'):>12} {str(v1s):>10} {str(v2s):>10}")

    if v1 and v2:
        print(f"  {'Status':<35} {'n/a':>12} {v1['status']:>10} {v2['status']:>10}")
        bd1 = v1.get("breakdown", {})
        bd2 = v2.get("breakdown", {})
        print(f"  {'Skills score'::<35} {'':>12} {bd1.get('skills_score',0):>9}/50 {bd2.get('skills_score',0):>9}/50")
        print(f"  {'Experience score':<35} {'':>12} {bd1.get('exp_score',0):>9}/15 {bd2.get('exp_score',0):>9}/15")
        print(f"  {'Career quality':<35} {'':>12} {bd1.get('career_score',0):>9}/15 {bd2.get('career_score',0):>9}/15")
        print(f"  {'Domain fit':<35} {'':>12} {bd1.get('domain_score',0):>9}/10 {bd2.get('domain_score',0):>9}/10")
        print(f"  {'Human adjustment (v2)':<35} {'':>12} {'n/a':>10} {v2['human_layer'].get('human_adjustment',0):>+10}")
        print(f"  {'Hard rejected (v2)':<35} {'':>12} {'n/a':>10} {str(v2.get('hard_rejected',False)):>10}")

        print(f"\n  Criteria matched (v1): {v1['skill_matching']['matched_must']}")
        print(f"  Criteria missing (v1): {v1['skill_matching']['missing_must']}")
        print(f"\n  Criteria matched (v2): {v2['skill_matching']['matched_must']}")
        print(f"  Criteria missing (v2): {v2['skill_matching']['missing_must']}")

        sm = v2.get("semantic_matches", [])
        if sm:
            print(f"\n  Semantic matches used by v2 (embedding path):")
            for s in sm:
                print(f"    '{s['criterion']}' -> '{s['matched_to']}' (sim={s['similarity']:.2f}) -> {s['result']}")

        print(f"\n  v2 human layer summary: {v2['human_layer'].get('summary','')}")

        # Per-criterion breakdown (v2)
        print(f"\n  Per-criterion detail (v2):")
        for cr in v2.get("criteria_results", []):
            ms = cr.get("match_source", {})
            mt = ms.get("match_type", "none")
            print(f"    [{cr['priority']:8s}] {cr['criterion']:<40s} -> {cr['result']:<20s} via {mt} (contrib: {cr.get('score_contribution',0):.1f})")

    print("\n" + "=" * 80)
    cur.close()
    conn.close()


if __name__ == "__main__":
    run()
