"""
Step C: Compare-and-Confirm Baseline Test
==========================================
This script tests the CORE SCORING MATH of extract_pdf.py
using MOCK DATA so we don't need a real PDF or API key.

Run BEFORE the refactor to capture baseline:
    python scripts/test_baseline.py

Run AFTER the refactor to verify nothing changed:
    python scripts/test_baseline.py
    # Compare baseline_output.json with new output
"""

import sys
import os
import json

# ---- Add scripts dir to path so we can import extract_pdf functions ----
sys.path.insert(0, os.path.dirname(__file__))

# Silence stdout during import (extract_pdf redirects stdout during module load)
import io
_old_stdout = sys.stdout
sys.stdout = io.StringIO()
try:
    from extract_pdf import (
        normalize_skill,
        _skill_match_level,
        compute_score,
        TRANSFERABLE_SKILLS,
    )
finally:
    sys.stdout = _old_stdout

# =========================================================================
# MOCK DATA — mirrors a real mid-level backend developer resume vs JD
# Uses the NEW "criteria" format that compute_score expects natively.
# =========================================================================

MOCK_RESUME_DATA = {
    "name": "Ravi Kumar",
    "experience": {
        "total_years": 3.5,
        "currentRole": "Backend Developer",
        "currentCompany": "TechCorp",
    },
    "skills": {
        "technical": [
            {"skill": "Python",     "confidence": "high",   "evidence": "Built REST APIs using Django and FastAPI"},
            {"skill": "Node.js",    "confidence": "high",   "evidence": "Developed microservices at TechCorp"},
            {"skill": "PostgreSQL", "confidence": "high",   "evidence": "Managed production database at TechCorp"},
            {"skill": "Docker",     "confidence": "medium", "evidence": "Containerised services for deployment"},
            {"skill": "React",      "confidence": "low",    "evidence": "mentioned in resume"},
        ]
    },
    "projects": [
        {
            "name": "API Gateway",
            "description": "Built a high-performance API gateway handling 10k RPS",
            "technologies": ["Python", "FastAPI", "Redis", "Docker"],
        }
    ],
    "work_history": [
        {"company": "TechCorp", "role": "Backend Developer", "duration": "2021-2024"},
    ],
    "education": [
        {"degree": "B.Tech", "field": "Computer Science", "school": "JNTU", "year": "2021"}
    ],
}

# JD in the "criteria" format that compute_score uses natively
MOCK_JD_DATA = {
    "title": "Senior Backend Engineer",
    "experience": {"min_years": 3, "max_years": 6},
    "criteria": [
        {"id": "c1", "category": "skill",    "name": "Python",     "priority": "critical", "weight": 20, "evidence_required": "any", "source_text": "Python"},
        {"id": "c2", "category": "skill",    "name": "Node.js",    "priority": "high",     "weight": 15, "evidence_required": "any", "source_text": "Node.js"},
        {"id": "c3", "category": "skill",    "name": "PostgreSQL", "priority": "high",     "weight": 15, "evidence_required": "any", "source_text": "PostgreSQL"},
        {"id": "c4", "category": "skill",    "name": "Docker",     "priority": "high",     "weight": 10, "evidence_required": "any", "source_text": "Docker"},
        {"id": "c5", "category": "skill",    "name": "React",      "priority": "medium",   "weight": 10, "evidence_required": "any", "source_text": "React"},
        {"id": "c6", "category": "skill",    "name": "Kubernetes", "priority": "medium",   "weight": 5,  "evidence_required": "any", "source_text": "Kubernetes"},
        {"id": "c7", "category": "skill",    "name": "Redis",      "priority": "medium",   "weight": 5,  "evidence_required": "any", "source_text": "Redis"},
    ],
    "scoring_hints": {
        "green_flags_to_reward": ["High-traffic API experience", "Production DB ownership"],
        "red_flags_to_watch":    ["No backend project evidence"],
    },
    "domain": "backend",
}

MOCK_RESUME_TEXT = """
Ravi Kumar - Backend Developer
3.5 years of experience at TechCorp.
Skills: Python, FastAPI, Node.js, PostgreSQL, Docker, Redis.
Built API gateway handling 10,000 requests per second.
Managed PostgreSQL database in production.
""".strip()


# =========================================================================
# TEST 1: Skill Normalization
# =========================================================================

def test_skill_normalization():
    """Verify the skill alias map works correctly."""
    cases = [
        ("ReactJS",    "react"),
        ("NodeJS",     "node"),
        ("Postgresql", "postgres"),
        ("SpringBoot", "spring"),
        ("Python3",    "python"),
        ("K8s",        "k8s"),
    ]
    results = []
    for raw, expected in cases:
        got = normalize_skill(raw)
        results.append({
            "input": raw,
            "expected": expected,
            "got": got,
            "pass": got == expected,
        })
    return results


# =========================================================================
# TEST 2: Skill Match Levels
# =========================================================================

def test_skill_match_levels():
    """Verify that match levels (full/confirmed/transferable/none) work."""
    resume_normalized = set()
    skill_evidence_map = {}
    for skill_entry in MOCK_RESUME_DATA["skills"]["technical"]:
        norm = normalize_skill(skill_entry["skill"])
        resume_normalized.add(norm)
        skill_evidence_map[norm] = {
            "evidence":   skill_entry.get("evidence", ""),
            "confidence": skill_entry.get("confidence", "high"),
        }

    resume_raw_text = MOCK_RESUME_TEXT.lower()

    cases = [
        # (jd_skill,    expected_level)
        ("Python",     "full"),         # high confidence + real evidence
        ("Docker",     "confirmed"),    # medium confidence
        ("React",      "mentioned"),    # low confidence / "mentioned"
        ("Kubernetes", "transferable"), # Not in resume but Docker is (transferable)
        ("Go",         "none"),         # completely absent
    ]

    results = []
    for raw_skill, expected_level in cases:
        norm = normalize_skill(raw_skill)
        level, multiplier = _skill_match_level(
            norm, resume_normalized, skill_evidence_map, resume_raw_text
        )
        results.append({
            "skill":          raw_skill,
            "expected_level": expected_level,
            "got_level":      level,
            "multiplier":     multiplier,
            "pass":           level == expected_level,
        })
    return results


# =========================================================================
# TEST 3: Full Deterministic Score
# =========================================================================

def test_full_score():
    """Run compute_score on mock data and capture the full output."""
    result = compute_score(
        jd_data=MOCK_JD_DATA,
        resume_data=MOCK_RESUME_DATA,
        threshold=70,
        screening_criteria=None,
    )
    return result


# =========================================================================
# RUNNER
# =========================================================================

def main():
    print("=" * 60)
    print("STEP C: BASELINE CAPTURE TEST")
    print("=" * 60)

    # --- Test 1: Skill Normalization ---
    print("\n[TEST 1] Skill Normalization")
    norm_results = test_skill_normalization()
    all_pass_1 = all(r["pass"] for r in norm_results)
    for r in norm_results:
        status = "PASS" if r["pass"] else "FAIL"
        print(f"  [{status}]  '{r['input']}' -> '{r['got']}' (expected '{r['expected']}')")
    print(f"  Result: {'ALL PASS' if all_pass_1 else 'SOME FAILED'}")

    # --- Test 2: Skill Match Levels ---
    print("\n[TEST 2] Skill Match Levels")
    match_results = test_skill_match_levels()
    all_pass_2 = all(r["pass"] for r in match_results)
    for r in match_results:
        status = "PASS" if r["pass"] else "FAIL"
        print(f"  [{status}]  '{r['skill']}' -> level='{r['got_level']}' mult={r['multiplier']} (expected '{r['expected_level']}')")
    print(f"  Result: {'ALL PASS' if all_pass_2 else 'SOME FAILED'}")

    # --- Test 3: Full Score ---
    print("\n[TEST 3] Full Scoring Engine (compute_score)")
    score_result = {}
    score_ok = False
    try:
        score_result = test_full_score()
        # Try multiple key names in case the schema evolved
        score = (
            score_result.get("score")
            or score_result.get("final_score")
            or score_result.get("total_score")
            or "N/A"
        )
        status_label = (
            score_result.get("status")
            or score_result.get("hiring_status")
            or score_result.get("recommendation")
            or "N/A"
        )
        print(f"  Score:    {score}")
        print(f"  Status:   {status_label}")
        print(f"  Keys:     {list(score_result.keys())}")
        score_ok = True
    except Exception as e:
        print(f"  [FAIL] Exception: {e}")
        score_result = {"error": str(e)}

    # --- Save baseline JSON ---
    baseline = {
        "test_1_normalization": norm_results,
        "test_2_match_levels":  match_results,
        "test_3_full_score":    score_result,
        "summary": {
            "test_1_pass": all_pass_1,
            "test_2_pass": all_pass_2,
            "test_3_pass": score_ok,
            "all_pass":    all_pass_1 and all_pass_2 and score_ok,
        },
    }

    output_path = os.path.join(os.path.dirname(__file__), "baseline_output.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(baseline, f, indent=2, default=str)

    print(f"\n{'='*60}")
    print(f"Baseline saved -> {output_path}")
    overall = baseline["summary"]["all_pass"]
    print(
        f"Overall: {'ALL TESTS PASSED — safe to proceed with refactor' if overall else 'SOME TESTS FAILED — fix before refactor'}"
    )
    print("=" * 60)
    return 0 if overall else 1


if __name__ == "__main__":
    sys.exit(main())
