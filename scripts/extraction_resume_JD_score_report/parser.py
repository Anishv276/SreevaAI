"""
parser.py — DocumentParser using prompts.py (fully decoupled from extract_pdf.py).

For JD and RESUME: calls OpenAI with the structured prompts from prompts.py.
For SCORE: runs compute_score + generate_report_inline internally.
"""
from __future__ import annotations

import json
import os
import sys

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

# Fully self-contained — no extract_pdf.py dependency
from extraction_resume_JD_score_report.scorer import compute_score as _compute_score
from extraction_resume_JD_score_report.reporter import generate_report_inline as _generate_report_inline
from extraction_resume_JD_score_report.utils import _postprocess_jd_output, _as_dict
from extraction_resume_JD_score_report.prompts import (
    build_jd_prompt,
    build_resume_prompt,
    JD_SYSTEM_PROMPT,
    RESUME_SYSTEM_PROMPT,
)

def _is_weak_decision_reason(text: str) -> bool:
    normalized = " ".join(str(text or "").strip().lower().split())
    if not normalized:
        return True
    weak_markers = [
        "ai screening analysis complete",
        "re-scan to generate the decision note",
        "report generation failed",
        "decision note unavailable",
        "no decision note",
    ]
    if any(marker in normalized for marker in weak_markers):
        return True
    sentences = [s.strip() for s in str(text).replace("!", ".").replace("?", ".").split(".") if s.strip()]
    return len(sentences) < 3

def _build_decision_reason_fallback(score_result: dict, resume_data: dict) -> str:
    status = str(score_result.get("status", "Borderline")).strip() or "Borderline"
    name = str(resume_data.get("full_name") or "This candidate").strip() or "This candidate"
    skill_matching = score_result.get("skill_matching", {}) or {}
    matched = [str(x).strip() for x in (skill_matching.get("matched_must", []) or []) if str(x).strip()]
    missing = [str(x).strip() for x in (skill_matching.get("missing_must", []) or []) if str(x).strip()]
    candidate_years = score_result.get("candidate_years")
    jd_min_years = score_result.get("jd_min_years")
    top_skill = matched[0] if matched else "core role skills"
    matched_tail = f", plus {', '.join(matched[1:3])}" if len(matched) > 1 else ""
    years_text = f"{candidate_years} years" if isinstance(candidate_years, (int, float)) else "the available years"
    req_text = f"{jd_min_years} years required" if isinstance(jd_min_years, (int, float)) else "the role requirement"
    primary_gap = ", ".join(missing[:2]) if missing else "critical must-have depth"

    if status.lower() == "shortlisted":
        return (
            f"{name} is shortlisted because the resume shows direct evidence for {top_skill}{matched_tail} in role-relevant delivery. "
            f"The profile indicates {years_text} against {req_text}, with ownership signals that support advancing this candidate. "
            f"The only material risk is {primary_gap if missing else 'confirming production-grade depth in interview rather than list-level familiarity'}. "
            f"Advance to the technical round and validate architecture decisions, delivery scope, and measurable outcomes for {top_skill}."
        )
    if status.lower() == "rejected":
        return (
            f"{name} is rejected because the resume does not provide sufficient direct evidence for role-critical requirements, especially {primary_gap}. "
            f"The profile shows {years_text} versus {req_text}, and current ownership evidence is below the bar for this role level. "
            f"The decisive gap is the difference between listed skills and proven delivery outcomes in required areas, despite partial positives in {top_skill}. "
            "Reconsider only if updated evidence shows clear production ownership, scope, and measurable impact for the missing must-have requirements."
        )
    return (
        f"{name} is currently borderline because matched strengths such as {top_skill} are offset by unresolved gaps like {primary_gap}. "
        f"The profile shows {years_text} against {req_text}, but ownership depth is not yet strong enough for a clear advance decision. "
        "The main concern is inconsistent evidence quality across must-have skills, so the current signal remains mixed. "
        f"Use the next round as a decision gate to verify production depth, delivery scope, and decision ownership in {top_skill}."
    )


def _get_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return OpenAI(api_key=api_key)


def _call_llm(client: OpenAI, system: str, user: str, model: str) -> tuple[dict, dict]:
    """Call OpenAI and return (parsed_json, usage_dict)."""
    completion = client.chat.completions.create(
        model=model,
        temperature=0,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format={"type": "json_object"},
    )
    content = completion.choices[0].message.content
    if not content:
        raise ValueError("OpenAI returned empty content")
    usage = getattr(completion, "usage", None)
    return json.loads(content), {
        "model": model,
        "inputTokens": getattr(usage, "prompt_tokens", 0) or 0,
        "outputTokens": getattr(usage, "completion_tokens", 0) or 0,
        "cachedInputTokens": getattr(getattr(usage, "prompt_tokens_details", None), "cached_tokens", 0) or 0,
    }


def _load_score_payload(json_text_or_path: str) -> str:
    """
    SCORE mode historically received a temp JSON file path from the worker.
    The split pipeline also supports raw JSON text for compatibility with older
    callers and direct tests.
    """
    candidate = str(json_text_or_path or "").strip()
    if not candidate:
        return "{}"

    if os.path.exists(candidate) and os.path.isfile(candidate):
        with open(candidate, "r", encoding="utf-8") as fh:
            return fh.read()

    return candidate


class DocumentParser:
    """
    Parses documents via LLM using prompts from prompts.py.
    Fully decoupled from extract_pdf.py for JD and RESUME modes.
    SCORE mode still delegates to the original scoring + report pipeline.
    """

    DEFAULT_MODEL = "gpt-5.4-mini"
    REPORT_MODEL = "gpt-4o-mini"

    def parse(self, text: str, doc_type: str, model_override: str | None = None) -> dict:
        """
        Parse text for a given doc_type.
        Returns {"data": {...}, "usage": {...}}
        """
        client = _get_client()
        model = model_override or self.DEFAULT_MODEL

        if doc_type == "JD":
            return self._parse_jd(client, text, model)

        if doc_type == "RESUME":
            return self._parse_resume(client, text, model)

        if doc_type == "SCORE":
            return self._run_score(client, text, model_override)

        raise ValueError(f"Unknown doc_type: {doc_type}")

    # ------------------------------------------------------------------ #

    def _parse_jd(self, client: OpenAI, text: str, model: str) -> dict:
        print("--- [AI] Extracting structured JD data... ---", file=sys.stderr, flush=True)
        data, usage = _call_llm(client, JD_SYSTEM_PROMPT, build_jd_prompt(text), model)
        data = _postprocess_jd_output(data)
        return {"data": data, "usage": usage}

    def _parse_resume(self, client: OpenAI, text: str, model: str) -> dict:
        print("--- [AI] Extracting structured RESUME data... ---", file=sys.stderr, flush=True)
        data, usage = _call_llm(client, RESUME_SYSTEM_PROMPT, build_resume_prompt(text), model)
        return {"data": data, "usage": usage}

    def _run_score(self, client: OpenAI, json_text: str, model_override: str | None) -> dict:
        """SCORE mode: deterministic scoring + AI report (mirrors extract_pdf.py SCORE branch)."""
        try:
            payload_str = _load_score_payload(json_text)
            raw = json.loads(payload_str)
        except json.JSONDecodeError as e:
            print(json.dumps({"error": f"Invalid JSON payload for SCORE: {str(e)}", "code": "JSON_DECODE_ERROR"}))
            sys.exit(1)
        except Exception as e:
            print(json.dumps({"error": f"Failed to load SCORE payload: {str(e)}", "code": "PAYLOAD_LOAD_ERROR"}))
            sys.exit(1)

        jd_data = raw.get("jd", {})
        resume_data = raw.get("resume", {})

        if isinstance(jd_data, str):
            try:
                jd_data = json.loads(jd_data)
            except Exception:
                jd_data = {}
        if not isinstance(jd_data, dict):
            jd_data = {}
        if isinstance(resume_data, str):
            try:
                resume_data = json.loads(resume_data)
            except Exception:
                resume_data = {}
        if not isinstance(resume_data, dict):
            resume_data = {}

        jd_raw_text = raw.get("jd_raw_text", "")
        resume_raw_text = raw.get("resume_raw_text", "")
        threshold = int(raw.get("threshold", 70))
        screening_criteria = raw.get("screening_criteria", {}) or {}

        jd_data = _postprocess_jd_output(jd_data)

        # 1. Deterministic scoring
        score_result = _compute_score(jd_data, resume_data, threshold, screening_criteria)

        # 2. AI report
        print(
            f"--- [AI] Synthesizing evaluation report for {resume_data.get('full_name', 'candidate')}... ---",
            file=sys.stderr, flush=True,
        )
        report_model = model_override or self.REPORT_MODEL
        try:
            report, report_usage = _generate_report_inline(
                jd_data, resume_data, jd_raw_text, resume_raw_text,
                score_result, client,
                report_model=report_model,
                screening_criteria=screening_criteria,
            )

            fit_radar = _as_dict(report.get("fit_radar", {}))
            # Fallback radar values if LLM missed them
            if "evidence" not in fit_radar:
                career_max = max(1, int(score_result["breakdown"].get("career_max", 15) or 15))
                fit_radar["evidence"] = min(100, round((score_result["breakdown"].get("career_score", 0) / career_max) * 100))
            if "essentials" not in fit_radar:
                skills_max = max(1, int(score_result["breakdown"].get("skills_max", 50) or 50))
                fit_radar["essentials"] = min(100, round((score_result["breakdown"].get("skills_score", 0) / skills_max) * 100))
            if "experience" not in fit_radar:
                exp_max = max(1, int(score_result["breakdown"].get("exp_max", 15) or 15))
                fit_radar["experience"] = min(100, round((score_result["breakdown"].get("exp_score", 0) / exp_max) * 100))
            if "domain" not in fit_radar:
                domain_max = max(1, int(score_result["breakdown"].get("domain_max", 10) or 10))
                fit_radar["domain"] = min(100, round((score_result["breakdown"].get("domain_score", 0) / domain_max) * 100))
            if "skills" not in fit_radar:
                match_ratio = score_result.get("skill_matching", {}).get("match_ratio", 0)
                fit_radar["skills"] = min(100, round(float(match_ratio) if match_ratio is not None else 0))

            # Prevent the LLM from hallucinating keys that overwrite our deterministic scoring engine
            for key in ["score", "base_score", "human_layer", "human_adjustment", "human_judgment", "status", "breakdown", "skill_matching", "exp_status", "hard_rejected", "rejection_reasons", "candidate_years", "jd_min_years", "fit_radar", "work_history", "education", "core_claims", "uncertain_areas", "skill_depth"]:
                report.pop(key, None)

            final_data = {
                "score": score_result["score"],
                "base_score": score_result["base_score"],
                "human_layer": score_result["human_layer"],
                "human_adjustment": score_result["human_layer"].get("human_adjustment", 0),
                "human_judgment": score_result["human_layer"].get("judgment", "Unknown"),
                "status": score_result["status"],
                "breakdown": score_result["breakdown"],
                "skill_matching": score_result["skill_matching"],
                "exp_status": score_result["exp_status"],
                "hard_rejected": score_result["hard_rejected"],
                "rejection_reasons": score_result["rejection_reasons"],
                "candidate_years": score_result["candidate_years"],
                "jd_min_years": score_result["jd_min_years"],
                "fit_radar": fit_radar,
                "work_history": resume_data.get("work_history", []),
                "education": resume_data.get("education", []),
                "core_claims": resume_data.get("core_claims", []),
                "uncertain_areas": resume_data.get("uncertain_areas", []),
                "skill_depth": resume_data.get("skills", {}).get("skill_depth", []),
                **report,
                "experience_assessment": report.get("experience_assessment") or report.get("experience_analysis") or {},
            }
            decision_reason = str(final_data.get("decision_reason") or "").strip()
            if _is_weak_decision_reason(decision_reason):
                final_data["decision_reason"] = _build_decision_reason_fallback(score_result, resume_data)
            return {"data": final_data, "usage": report_usage}

        except Exception as exc:
            return {
                "data": {
                    **score_result,
                    "recruiter_snapshot": f"Automated evaluation completed with score {score_result['score']}.",
                    "decision_reason": f"Report generation failed — {score_result['status']} at score {score_result['score']}. Error: {exc}",
                },
                "usage": {"model": report_model, "inputTokens": 0, "outputTokens": 0, "cachedInputTokens": 0},
            }
