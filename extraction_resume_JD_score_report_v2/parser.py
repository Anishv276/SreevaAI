"""
parser.py v2 — Two-pass resume extraction + JD extraction with rank-based weights.

Resume extraction:
  Call 1 (gpt-4o-mini, structural): dates, companies, titles, bullet_points — facts only.
  Call 2 (gpt-4o, semantic): ownership, impact, evidence_items — grounded in Call 1 output.
  Call 2 receives JD criteria so evidence_items can tag which criteria they prove.

JD extraction:
  Single call (gpt-4.1-mini) → criteria with priority_rank.
  Weights computed deterministically by _compute_criterion_weights in scorer.py.

Score mode:
  Receives pre-parsed JD + resume dicts, runs scorer + reporter.
"""
from __future__ import annotations

import json
import os
import re
import sys
from typing import Any

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

from extraction_resume_JD_score_report_v2.prompts import (
    JD_SYSTEM, build_jd_prompt,
    RESUME_STRUCTURAL_SYSTEM, build_resume_structural_prompt,
    RESUME_SEMANTIC_SYSTEM, build_resume_semantic_prompt,
)
from extraction_resume_JD_score_report_v2.scorer import compute_score, _compute_criterion_weights
from extraction_resume_JD_score_report_v2.reporter import generate_report


def _get_client() -> OpenAI:
    key = os.getenv("OPENAI_API_KEY", "")
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return OpenAI(api_key=key)


def _llm(client: OpenAI, system: str, user: str, model: str) -> tuple[dict, dict]:
    completion = client.chat.completions.create(
        model=model,
        temperature=0,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        response_format={"type": "json_object"},
    )
    content = completion.choices[0].message.content
    if not content:
        raise ValueError(f"Empty response from {model}")
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
    STRUCTURAL_MODEL = "gpt-4o-mini"
    SEMANTIC_MODEL = "gpt-4o"
    JD_MODEL = "gpt-4.1-mini"
    REPORT_MODEL = "gpt-4o-mini"
    STRUCTURAL_FALLBACK = "gpt-4.1-mini"
    SEMANTIC_FALLBACK = "gpt-4o-mini"

    def parse(self, text: str, doc_type: str, model_override: str | None = None) -> dict:
        client = _get_client()
        if doc_type == "JD":
            return self._parse_jd(client, text, model_override or self.JD_MODEL)
        if doc_type == "RESUME":
            return self._parse_resume(client, text, jd_criteria=None)
        if doc_type == "SCORE":
            return self._run_score(client, text, model_override)
        raise ValueError(f"Unknown doc_type: {doc_type!r}")

    def parse_resume_with_jd(self, text: str, jd_criteria: list[dict]) -> dict:
        """Used by pipeline when JD is already available — passes criteria to semantic pass."""
        client = _get_client()
        return self._parse_resume(client, text, jd_criteria=jd_criteria)

    # ── JD ────────────────────────────────────────────────────────────────────

    def _parse_jd(self, client: OpenAI, text: str, model: str) -> dict:
        print("--- [AI] Extracting JD structure... ---", file=sys.stderr, flush=True)
        data, usage = _llm(client, JD_SYSTEM, build_jd_prompt(text), model)
        data = _normalise_jd(data)
        return {"data": data, "usage": usage}

    # ── Resume: two-pass ──────────────────────────────────────────────────────

    def _parse_resume(
        self, client: OpenAI, text: str, jd_criteria: list[dict] | None
    ) -> dict:
        # Pass 1: structural
        print("--- [AI] Resume pass 1: structural extraction... ---", file=sys.stderr, flush=True)
        structural, usage1 = self._call_with_fallback(
            client,
            RESUME_STRUCTURAL_SYSTEM,
            build_resume_structural_prompt(text),
            self.STRUCTURAL_MODEL,
            self.STRUCTURAL_FALLBACK,
        )

        # Pass 2: semantic (grounded in structural output + JD criteria)
        print("--- [AI] Resume pass 2: semantic assessment... ---", file=sys.stderr, flush=True)
        semantic, usage2 = self._call_with_fallback(
            client,
            RESUME_SEMANTIC_SYSTEM,
            build_resume_semantic_prompt(structural, jd_criteria),
            self.SEMANTIC_MODEL,
            self.SEMANTIC_FALLBACK,
        )

        merged = _merge_resume(structural, semantic)

        usage = {
            "model": f"{usage1.get('model')}+{usage2.get('model')}",
            "inputTokens": (usage1.get("inputTokens", 0) or 0) + (usage2.get("inputTokens", 0) or 0),
            "outputTokens": (usage1.get("outputTokens", 0) or 0) + (usage2.get("outputTokens", 0) or 0),
            "cachedInputTokens": (usage1.get("cachedInputTokens", 0) or 0) + (usage2.get("cachedInputTokens", 0) or 0),
        }
        return {"data": merged, "usage": usage}

    def _call_with_fallback(
        self, client: OpenAI, system: str, user: str, model: str, fallback: str
    ) -> tuple[dict, dict]:
        try:
            return _llm(client, system, user, model)
        except Exception as exc:
            print(f"--- [AI] {model} failed: {exc}. Retrying with {fallback}... ---", file=sys.stderr, flush=True)
            return _llm(client, system, user, fallback)

    # ── Score ─────────────────────────────────────────────────────────────────

    def _run_score(self, client: OpenAI, json_text: str, model_override: str | None) -> dict:
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
        report_model = model_override or self.REPORT_MODEL
        try:
            report, report_usage = generate_report(
                jd_data, resume_data, jd_raw_text, resume_raw_text,
                score_result, client, report_model, screening_criteria,
            )

            # Strip LLM-written keys that must come from scorer
            LOCKED = {
                "score", "base_score", "human_layer", "human_adjustment", "human_judgment",
                "status", "breakdown", "skill_matching", "exp_status", "hard_rejected",
                "rejection_reasons", "candidate_years", "jd_min_years",
                "fit_radar", "work_history", "education", "core_claims",
                "uncertain_areas", "skill_depth",
            }
            for k in LOCKED:
                report.pop(k, None)

            # Assemble final output (scorer data takes precedence over LLM fields)
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
            return {"data": final, "usage": report_usage}

        except Exception as exc:
            return {
                "data": {
                    **score_result,
                    "recruiter_snapshot": f"Automated evaluation completed. Score: {score_result['score']}.",
                    "decision_reason": f"Report generation failed — {score_result['status']} at {score_result['score']}. Error: {exc}",
                },
                "usage": {"model": report_model, "inputTokens": 0, "outputTokens": 0, "cachedInputTokens": 0},
            }
