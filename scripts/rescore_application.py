"""
rescore_application.py — Re-score a stored application against its drive's JD using v2 scorer.
Usage: python scripts/rescore_application.py <app_id_or_name>

Updates aiScore and aiReport in the DB.
"""
import json, os, sys
from dotenv import load_dotenv; load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg2
from openai import OpenAI
from extraction_resume_JD_score_report_v2.scorer import compute_score
from extraction_resume_JD_score_report_v2.parser import DocumentParser, _normalise_jd

def rescore(identifier: str, dry_run: bool = False):
    url = os.environ["DATABASE_URL"].replace("?pgbouncer=true","")
    conn = psycopg2.connect(url)
    cur = conn.cursor()

    # Find the application
    if identifier.startswith("app-"):
        cur.execute('SELECT id,"fullName","resumeData","resumeText","driveId","aiScore" FROM "Application" WHERE id=%s', (identifier,))
    else:
        cur.execute('SELECT id,"fullName","resumeData","resumeText","driveId","aiScore" FROM "Application" WHERE "fullName" ILIKE %s AND "isDeleted"=false ORDER BY "createdAt" DESC LIMIT 1', (f"%{identifier}%",))
    row = cur.fetchone()
    if not row:
        print(f"Application not found: {identifier}")
        return

    app_id, name, resume_raw, resume_text, drive_id, old_score = row
    resume = json.loads(resume_raw).get("parsed", {})
    resume_text = resume_text or ""

    # Get JD
    cur.execute('SELECT "extractedDetails","screeningCriteria","title" FROM "Drive" WHERE id=%s', (drive_id,))
    dr = cur.fetchone()
    if not dr or not dr[0]:
        print(f"Drive not found or has no JD: {drive_id}")
        return

    jd = _normalise_jd(json.loads(dr[0]))
    screening = json.loads(dr[1]) if dr[1] else {}
    drive_title = dr[2]

    print(f"Rescoring: {name}")
    print(f"Drive: {drive_title}")
    print(f"Old score: {old_score}")

    oai = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    score_result = compute_score(jd, resume, threshold=70, screening_criteria=screening,
                                 resume_raw_text=resume_text, openai_client=oai)

    new_score = score_result["score"]
    status = score_result["status"]
    print(f"New score: {new_score}  Status: {status}")
    print(f"Skills: {score_result['breakdown']['skills_score']}/50")
    print(f"\nMatched: {score_result['skill_matching']['matched_must']}")
    print(f"Missing: {score_result['skill_matching']['missing_must']}")

    if dry_run:
        print("\n[DRY RUN] Not updating DB.")
        return

    # Generate report too
    from extraction_resume_JD_score_report_v2.reporter import generate_report
    try:
        report, _ = generate_report(jd, resume, "", resume_text, score_result, oai, "gpt-4o-mini", screening)
        from extraction_resume_JD_score_report_v2.parser import DocumentParser
        LOCKED = {"score","status","breakdown","skill_matching","exp_status","hard_rejected","rejection_reasons","candidate_years","jd_min_years","fit_radar","work_history","education","core_claims","uncertain_areas","skill_depth"}
        for k in LOCKED: report.pop(k, None)
        final = {
            "score": score_result["score"],
            "status": score_result["status"],
            "breakdown": score_result["breakdown"],
            "skill_matching": score_result["skill_matching"],
            "exp_status": score_result["exp_status"],
            "hard_rejected": score_result["hard_rejected"],
            "rejection_reasons": score_result["rejection_reasons"],
            "candidate_years": score_result["candidate_years"],
            "jd_min_years": score_result["jd_min_years"],
            "semantic_matches": score_result.get("semantic_matches", []),
            "work_history": resume.get("work_history", []),
            "education": resume.get("education", []),
            **report,
        }
        report_json = json.dumps(final)
    except Exception as e:
        print(f"Report generation failed: {e}")
        report_json = json.dumps(score_result)

    cur.execute(
        'UPDATE "Application" SET "aiScore"=%s, "aiReport"=%s, "updatedAt"=NOW() WHERE id=%s',
        (new_score, report_json, app_id)
    )
    conn.commit()
    print(f"\nDB updated: aiScore={new_score}")
    cur.close(); conn.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/rescore_application.py <app_id_or_name> [--dry-run]")
        sys.exit(1)
    dry = "--dry-run" in sys.argv
    rescore(sys.argv[1], dry_run=dry)
