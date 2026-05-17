import json
import sys
from pathlib import Path


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from extraction_resume_JD_score_report import parser as score_parser


def test_run_score_accepts_temp_json_file_path(monkeypatch):
    payload = {
        "jd": {"criteria": [{"name": "Python", "category": "skill", "priority": "high", "weight": 10}]},
        "resume": {
            "skills": {"technical": [{"skill": "Python", "source_strength": "work_history_outcome"}]},
            "experience": {"total_years": 5},
            "work_history": [{"company": "Acme", "technologies_used": ["Python"], "impact_signals": ["Shipped service"]}],
        },
        "threshold": 70,
        "screening_criteria": {},
    }
    payload_path = Path.cwd() / "scratch" / "score_input.json"
    payload_path.parent.mkdir(parents=True, exist_ok=True)
    payload_path.write_text(json.dumps(payload), encoding="utf-8")

    captured = {}

    def fake_compute_score(jd_data, resume_data, threshold=70, screening_criteria=None):
        captured["jd_data"] = jd_data
        captured["resume_data"] = resume_data
        captured["threshold"] = threshold
        captured["screening_criteria"] = screening_criteria
        return {
            "score": 88,
            "base_score": 80,
            "human_layer": {"human_score": 88, "human_adjustment": 8, "judgment": "Shortlisted", "summary": "", "reasons": []},
            "status": "Shortlisted",
            "breakdown": {"skills_score": 40, "skills_max": 50, "exp_score": 15, "exp_max": 15, "good_score": 5, "good_max": 10, "career_score": 10, "career_max": 15, "domain_score": 10, "domain_max": 10},
            "skill_matching": {"matched_must": ["Python"], "missing_must": [], "matched_good": [], "match_ratio": 100, "must_have_details": []},
            "exp_status": "meets",
            "hard_rejected": False,
            "rejection_reasons": [],
            "candidate_years": 5,
            "jd_min_years": None,
        }

    def fake_generate_report_inline(*args, **kwargs):
        return {"fit_radar": {}, "decision_reason": "ok. Sentence two here. Sentence three here."}, {"model": "gpt-4o-mini", "inputTokens": 0, "outputTokens": 0, "cachedInputTokens": 0}

    monkeypatch.setattr(score_parser, "_compute_score", fake_compute_score)
    monkeypatch.setattr(score_parser, "_generate_report_inline", fake_generate_report_inline)

    parser = score_parser.DocumentParser()
    result = parser._run_score(client=object(), json_text=str(payload_path), model_override=None)

    assert captured["jd_data"]["criteria"][0]["name"] == "Python"
    assert captured["resume_data"]["experience"]["total_years"] == 5
    assert captured["threshold"] == 70
    assert result["data"]["score"] == 88
    assert result["data"]["decision_reason"] == "ok. Sentence two here. Sentence three here."


def test_run_score_still_accepts_raw_json_text(monkeypatch):
    payload = {"jd": {}, "resume": {}, "threshold": 60, "screening_criteria": {}}
    captured = {}

    def fake_compute_score(jd_data, resume_data, threshold=70, screening_criteria=None):
        captured["threshold"] = threshold
        return {
            "score": 80,
            "base_score": 80,
            "human_layer": {"human_score": 80, "human_adjustment": 0, "judgment": "Shortlisted", "summary": "", "reasons": []},
            "status": "Shortlisted",
            "breakdown": {"skills_score": 50, "skills_max": 50, "exp_score": 15, "exp_max": 15, "good_score": 5, "good_max": 10, "career_score": 5, "career_max": 15, "domain_score": 5, "domain_max": 10},
            "skill_matching": {"matched_must": [], "missing_must": [], "matched_good": [], "match_ratio": 100, "must_have_details": []},
            "exp_status": "neutral",
            "hard_rejected": False,
            "rejection_reasons": [],
            "candidate_years": None,
            "jd_min_years": None,
        }

    def fake_generate_report_inline(*args, **kwargs):
        return {"fit_radar": {}, "decision_reason": "raw. Sentence two here. Sentence three here."}, {"model": "gpt-4o-mini", "inputTokens": 0, "outputTokens": 0, "cachedInputTokens": 0}

    monkeypatch.setattr(score_parser, "_compute_score", fake_compute_score)
    monkeypatch.setattr(score_parser, "_generate_report_inline", fake_generate_report_inline)

    parser = score_parser.DocumentParser()
    result = parser._run_score(client=object(), json_text=json.dumps(payload), model_override=None)

    assert captured["threshold"] == 60
    assert result["data"]["decision_reason"] == "raw. Sentence two here. Sentence three here."
