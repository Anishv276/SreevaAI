"""
parser.py v2 â€” Two-pass resume extraction + JD extraction with rank-based weights.

Resume extraction:
  Call 1 (structural): dates, companies, titles, bullet_points â€” facts only.
  Call 2 (semantic): ownership, impact, evidence_items â€” grounded in Call 1 output.
  Call 2 receives JD criteria so evidence_items can tag which criteria they prove.

JD extraction:
  Single call â†’ criteria with priority_rank.
  Weights computed deterministically by _compute_criterion_weights in scorer.py.

Score mode:
  Receives pre-parsed JD + resume dicts, runs scorer + reporter.
"""
from __future__ import annotations

import json
import os
import re
import sys

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

from extraction_resume_JD_score_report.prompts import (
    JD_SYSTEM, build_jd_prompt,
    RESUME_STRUCTURAL_SYSTEM, build_resume_structural_prompt,
    RESUME_SEMANTIC_SYSTEM, build_resume_semantic_prompt,
)
from extraction_resume_JD_score_report.scorer import compute_score, _compute_criterion_weights
from extraction_resume_JD_score_report.reporter import generate_report


def _get_client() -> OpenAI:
    key = os.getenv("OPENAI_API_KEY", "")
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return OpenAI(api_key=key)


def _llm(client: OpenAI, system: str, user: str, model: str) -> tuple[dict, dict]:
    completion = client.chat.completions.create(
        model=model,
        temperature=0,
        seed=0,  # fixed seed for deterministic extraction; value is arbitrary
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        response_format={"type": "json_object"},
    )
    content = completion.choices[0].message.content
    if not content:
        raise ValueError(f"Empty response from {model}")
    _agent_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "livekit-python-agent")
    if _agent_dir not in sys.path:
        sys.path.insert(0, _agent_dir)  # billing/billing.py lives here (see commit 82e7fba)
    from billing.billing import extract_usage  # noqa: PLC0415
    return json.loads(content), extract_usage(completion, model)


def _normalise_jd(jd: dict) -> dict:
    """Ensure job_title is never empty; compute weights from rank."""
    if not jd.get("job_title", "").strip():
        level = jd.get("role_level", "")
        jd["job_title"] = f"{level.capitalize()} Role".strip() if level else "Unknown Role"
    hints = jd.get("scoring_hints") or {}
    hints.setdefault("green_flags_to_reward", [])
    hints.setdefault("red_flags_to_watch", [])
    jd["scoring_hints"] = hints
    # Compute deterministic weights from priority_rank
    if jd.get("criteria"):
        jd["criteria"] = _compute_criterion_weights(jd["criteria"])
    return jd


def _merge_resume(structural: dict, semantic: dict) -> dict:
    """
    Merge Call 1 (structural) and Call 2 (semantic) into the flat dict the scorer expects.
    For each work_history role, overlay the semantic assessment (ownership, impact_signals, etc.)
    """
    work_history_struct = structural.get("work_history", [])
    role_assessments = {ra["role_id"]: ra for ra in semantic.get("role_assessments", [])}

    merged_work = []
    for role in work_history_struct:
        rid = role.get("id", "")
        assessment = role_assessments.get(rid, {})
        merged_work.append({
            **role,
            "responsibilities": role.get("bullet_points", []),  # scorer expects "responsibilities"
            "ownership_level": assessment.get("ownership_level", "unclear"),
            "impact_strength": assessment.get("impact_strength", "low"),
            "impact_signals": assessment.get("impact_signals", []),
            "business_domain": assessment.get("business_domain"),
            "technologies_used": role.get("technologies_used", []),
        })

    merged_projects = []
    for proj in structural.get("projects", []):
        merged_projects.append({
            **proj,
            "name": proj.get("name"),
            "type": proj.get("type", "personal"),
            "technologies": proj.get("technologies", []),
            "description": proj.get("description", ""),
            "impact_signals": [],
            "ownership_level": "owner",
            "impact_strength": "low",
        })

    total_years = semantic.get("total_years")
    seniority = semantic.get("seniority_level")

    merged: dict = {
        "full_name": structural.get("full_name"),
        "email": structural.get("email"),
        "phone": structural.get("phone"),
        "location": structural.get("location", {}),
        "links": structural.get("links", {}),
        "current_company": merged_work[0].get("company") if merged_work else None,
        "current_role": merged_work[0].get("role") if merged_work else None,
        "experience": {
            "total_years": total_years,
            "total_months": semantic.get("total_months"),
            "seniority_level": seniority,
            "seniority_reason": semantic.get("seniority_reason", ""),
        },
        "work_history": merged_work,
        "projects": merged_projects,
        "education": structural.get("education", []),
        "certifications": structural.get("certifications", []),
        "evidence_items": semantic.get("evidence_items", []),
        "skills": semantic.get("skills", {"technical": [], "tools": [], "domain_skills": []}),
        "career_timeline": semantic.get("career_timeline", {}),
        "core_claims": semantic.get("core_claims", []),
        "uncertain_areas": semantic.get("uncertain_areas", []),
        "red_flags": semantic.get("red_flags", []),
        "candidate_summary": semantic.get("candidate_summary", ""),
        "keywords": list({
            *structural.get("skills_section", []),
            *(semantic.get("skills", {}).get("domain_skills", []) or []),
        }),
        "parse_confidence": structural.get("parse_confidence", "medium"),
    }
    return merged


class DocumentParser:
    def parse(self, text: str, doc_type: str, model_override: str) -> dict:
        client = _get_client()
        model = model_override
        if doc_type == "JD":
            return self._parse_jd(client, text, model)
        if doc_type == "RESUME":
            return self._parse_resume(client, text, model, jd_criteria=None)
        if doc_type == "SCORE":
            return self._run_score(client, text, model)
        raise ValueError(f"Unknown doc_type: {doc_type!r}")

    def parse_resume_with_jd(self, text: str, jd_criteria: list[dict], model_override: str) -> dict:
        """Used by pipeline when JD is already available â€” passes criteria to semantic pass."""
        client = _get_client()
        return self._parse_resume(client, text, model_override, jd_criteria=jd_criteria)

    # -- JD --------------------------------------------------------------------

    def _parse_jd(self, client: OpenAI, text: str, model: str) -> dict:
        print("--- [AI] Extracting JD structure... ---", file=sys.stderr, flush=True)
        data, usage = _llm(client, JD_SYSTEM, build_jd_prompt(text), model)
        data = _normalise_jd(data)
        return {"data": data, "usage": usage}

    # -- Resume: two-pass ------------------------------------------------------

    def _parse_resume(
        self, client: OpenAI, text: str, model: str, jd_criteria: list[dict] | None
    ) -> dict:
        print("--- [AI] Resume pass 1: structural extraction... ---", file=sys.stderr, flush=True)
        structural, usage1 = _llm(client, RESUME_STRUCTURAL_SYSTEM, build_resume_structural_prompt(text), model)

        print("--- [AI] Resume pass 2: semantic assessment... ---", file=sys.stderr, flush=True)
        semantic, usage2 = _llm(client, RESUME_SEMANTIC_SYSTEM, build_resume_semantic_prompt(structural, jd_criteria), model)

        merged = _merge_resume(structural, semantic)
        # "usage" stays the summed total (unchanged shape, existing callers keep
        # working) -- "usages" is the new per-call breakdown: 2 real LLM calls
        # (structural pass, semantic pass), each billed and displayed separately.
        usage = {
            "model": model,
            "inputTokens": (usage1.get("inputTokens", 0) or 0) + (usage2.get("inputTokens", 0) or 0),
            "outputTokens": (usage1.get("outputTokens", 0) or 0) + (usage2.get("outputTokens", 0) or 0),
            "cachedInputTokens": (usage1.get("cachedInputTokens", 0) or 0) + (usage2.get("cachedInputTokens", 0) or 0),
        }
        usages = [
            {**usage1, "model": usage1.get("model") or model, "callLabel": "structural extraction"},
            {**usage2, "model": usage2.get("model") or model, "callLabel": "semantic assessment"},
        ]
        return {"data": merged, "usage": usage, "usages": usages}

    # -- Score -----------------------------------------------------------------

    def _run_score(self, client: OpenAI, json_text: str, model: str) -> dict:
        # Load payload
        candidate = str(json_text or "").strip()
        if os.path.isfile(candidate):
            with open(candidate, encoding="utf-8") as fh:
                candidate = fh.read()
        try:
            raw = json.loads(candidate)
        except json.JSONDecodeError as e:
            print(json.dumps({"error": f"Invalid JSON: {e}", "code": "JSON_DECODE_ERROR"}))
            sys.exit(1)

        jd_data = raw.get("jd") or {}
        resume_data = raw.get("resume") or {}
        if isinstance(jd_data, str):
            jd_data = json.loads(jd_data) if jd_data else {}
        if isinstance(resume_data, str):
            resume_data = json.loads(resume_data) if resume_data else {}

        jd_raw_text = raw.get("jd_raw_text", "")
        resume_raw_text = raw.get("resume_raw_text", "")
        threshold = int(raw.get("threshold", 70))
        screening_criteria = raw.get("screening_criteria") or {}

        jd_data = _normalise_jd(jd_data)

        print(f"--- [AI] Scoring {resume_data.get('full_name', 'candidate')}... ---", file=sys.stderr, flush=True)
        score_result = compute_score(
            jd_data, resume_data, threshold, screening_criteria, openai_client=client
        )

        print("--- [AI] Generating report... ---", file=sys.stderr, flush=True)
        report_model = model
        try:
            report, report_usage = generate_report(
                jd_data, resume_data, jd_raw_text, resume_raw_text,
                score_result, client, report_model, screening_criteria,
            )

            # Strip keys that MUST come from scorer, not LLM
            LOCKED = {
                "score", "base_score", "human_layer", "human_adjustment", "human_judgment",
                "status", "breakdown", "skill_matching", "exp_status", "hard_rejected",
                "rejection_reasons", "candidate_years", "jd_min_years",
                "work_history", "education", "core_claims", "uncertain_areas", "skill_depth",
            }  # fit_radar intentionally NOT locked â€” reporter generates it, we keep it
            for k in LOCKED:
                report.pop(k, None)

            # Strip [EV-xxx] citation tags from all text fields before storing in DB
            _EV_RE = re.compile(r"\[EV-[^\]]+\]")
            _COLOUR_RE = re.compile(r"^(emerald|amber|rose|green|red|yellow):\s*", re.IGNORECASE)
            def _clean(v: object) -> object:
                if isinstance(v, str):
                    return _COLOUR_RE.sub("", _EV_RE.sub("", v)).strip()
                if isinstance(v, list):
                    return [_clean(i) for i in v]
                if isinstance(v, dict):
                    return {k2: _clean(v2) for k2, v2 in v.items()}
                return v
            report = {k: _clean(v) for k, v in report.items()}

            # Assemble final output -- scorer data takes precedence over LLM fields
            final = {
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
                "semantic_matches": score_result.get("semantic_matches", []),
                "grounding_warnings": score_result.get("grounding_warnings", []),
                "work_history": resume_data.get("work_history", []),
                "education": resume_data.get("education", []),
                "core_claims": resume_data.get("core_claims", []),
                "uncertain_areas": resume_data.get("uncertain_areas", []),
                **report,
                "experience_assessment": report.get("experience_assessment") or {},
            }
            # "usage" stays the report-LLM-only total (unchanged shape) -- "usages"
            # adds the previously-untracked embeddings call (scorer.py's semantic
            # matching) as its own entry, so both real API calls behind a single
            # "resume report" are billed and displayed, not just the report one.
            usages = [{**report_usage, "callLabel": "report generation"}]
            embedding_usage = score_result.get("embedding_usage")
            if embedding_usage:
                usages.append({**embedding_usage, "isEmbedding": True, "callLabel": "semantic matching"})
            return {"data": final, "usage": report_usage, "usages": usages}

        except Exception as exc:
            fallback_usage = {"model": report_model, "inputTokens": 0, "outputTokens": 0, "cachedInputTokens": 0}
            usages = [{**fallback_usage, "callLabel": "report generation"}]
            embedding_usage = score_result.get("embedding_usage")
            if embedding_usage:
                usages.append({**embedding_usage, "isEmbedding": True, "callLabel": "semantic matching"})
            return {
                "data": {
                    **score_result,
                    "recruiter_snapshot": f"Automated evaluation completed. Score: {score_result['score']}.",
                    "decision_reason": f"Report generation failed â€” {score_result['status']} at {score_result['score']}. Error: {exc}",
                },
                "usage": fallback_usage,
                "usages": usages,
            }
