"""
reporter.py v2

What's new vs v1:
- Evidence library: high-quality evidence_items are formatted as [EV-xxx] citation blocks
  and passed to the LLM. The model must cite them by ID, not invent facts.
- Grounding verification: after generation, company names in prose are checked
  against actual work_history. Hallucinated companies are flagged in
  score_result["grounding_warnings"].
- Criteria breakdown passed to reporter so it can write criterion-level explanations
  (what drove the score up/down) rather than vague summaries.
- decision_reason fallback is tighter: 4 sentences minimum, structured format.
"""
from __future__ import annotations

import json
import re
from typing import Any

from extraction_resume_JD_score_report.prompts import build_reporter_prompt, REPORTER_SYSTEM


def _build_evidence_blocks(evidence_items: list[dict]) -> list[str]:
    """Format high-quality evidence_items as citation blocks for the LLM."""
    blocks = []
    for ev in evidence_items:
        level = ev.get("evidence_level", 1)
        if level < 3:
            continue  # skip low-quality items; reporter only cites meaningful evidence
        ev_id = ev.get("id", "?")
        company = ev.get("source_company") or ev.get("source_role") or "unknown"
        text = ev.get("text", "")
        metric = ev.get("metric", "")
        ownership = ev.get("ownership", "unclear")
        proves = ev.get("proves", [])
        metric_str = f" | METRIC: {metric}" if metric else ""
        proves_str = f" | proves: {', '.join(proves[:4])}" if proves else ""
        blocks.append(
            f"[EV-{ev_id}] {company} | Level {level} | {ownership} ownership"
            f"{metric_str}{proves_str}\n  \"{text}\""
        )
    return blocks


def _build_criteria_breakdown(criteria_results: list[dict]) -> list[dict]:
    """Build a compact per-criterion summary for the reporter prompt."""
    out = []
    for cr in criteria_results:
        ms = cr.get("match_source", {})
        out.append({
            "criterion": cr.get("criterion"),
            "priority": cr.get("priority"),
            "result": cr.get("result"),
            "match_type": ms.get("match_type", "none"),
            "matched_to": ms.get("matched_skill"),
            "evidence_text": (ms.get("evidence_text") or "")[:120],
            "source_company": ms.get("source_company"),
            "confidence": cr.get("confidence"),
            "score_contribution": cr.get("score_contribution"),
        })
    return out


def _verify_grounding(report: dict, resume_data: dict) -> list[str]:
    """
    Check that company names cited in prose exist in work_history.
    Returns a list of warning strings (empty = clean).
    """
    valid_companies = {
        job.get("company", "").lower().strip()
        for job in resume_data.get("work_history", [])
        if job.get("company")
    }
    warnings = []
    for field in ["recruiter_snapshot", "decision_reason"]:
        text = report.get(field, "")
        # Find "At Company" or "at Company" patterns
        cited = re.findall(r"\bAt ([A-Z][a-zA-Z0-9\s&\.]+?)(?:,|\.|\sâ€”|\sand\s)", text)
        for name in cited:
            name_clean = name.strip().lower()
            if len(name_clean) < 3:
                continue
            if not any(name_clean in vc or vc in name_clean for vc in valid_companies):
                warnings.append(f"{field}: company '{name.strip()}' not found in work history")
    return warnings


def _is_weak_decision_reason(text: str) -> bool:
    if not text or not text.strip():
        return True
    weak_markers = [
        "ai screening analysis complete",
        "report generation failed",
        "decision note unavailable",
        "re-scan to generate",
    ]
    if any(m in text.lower() for m in weak_markers):
        return True
    sentences = [s.strip() for s in re.split(r"[.!?]", text) if s.strip()]
    return len(sentences) < 3


def _decision_reason_fallback(score_result: dict, resume_data: dict) -> str:
    status = score_result.get("status", "Borderline")
    name = resume_data.get("full_name") or "This candidate"
    matched = score_result.get("skill_matching", {}).get("matched_must", [])
    missing = score_result.get("skill_matching", {}).get("missing_must", [])
    cy = score_result.get("candidate_years")
    jm = score_result.get("jd_min_years")
    top = matched[0] if matched else "core role skills"
    tail = f", {', '.join(matched[1:3])}" if len(matched) > 1 else ""
    gap_text = ", ".join(missing[:2]) if missing else "must-have depth"
    yr_text = f"{cy} years" if cy else "available experience"
    req_text = f"{jm} years required" if jm else "the role requirement"

    if status == "Shortlisted":
        return (
            f"{name} is shortlisted based on direct evidence for {top}{tail} in work history. "
            f"The profile shows {yr_text} against {req_text}, with ownership signals supporting advancement. "
            f"The primary risk to validate is {gap_text if missing else 'production-grade depth beyond listed skills'}. "
            f"Advance to the technical round and probe architecture decisions, delivery scope, and measurable outcomes for {top}."
        )
    if status == "Rejected":
        return (
            f"{name} is rejected because the resume lacks direct evidence for critical requirements, especially {gap_text}. "
            f"The profile shows {yr_text} versus {req_text}, and ownership evidence is below the bar for this role. "
            f"The gap between listed skills and proven delivery outcomes is the decisive factor, despite partial positives in {top}. "
            "Reconsider only if updated evidence shows clear production ownership, scope, and measurable impact for the missing requirements."
        )
    return (
        f"{name} is borderline because strengths in {top} are offset by unresolved gaps in {gap_text}. "
        f"The profile shows {yr_text} against {req_text}, and ownership depth is inconsistent across roles. "
        f"The core concern is uneven evidence quality across must-have criteria. "
        f"Use the next round as a decision gate to verify production depth and delivery ownership in {top}."
    )


def generate_report(
    jd_data: dict,
    resume_data: dict,
    jd_raw_text: str,
    resume_raw_text: str,
    score_result: dict,
    client: Any,
    report_model: str,
    screening_criteria: dict | None = None,
) -> tuple[dict, dict]:
    """
    Generate the recruiter report.

    Returns (report_dict, usage_dict).
    score_result is mutated to add grounding_warnings.
    """
    evidence_items = resume_data.get("evidence_items", []) or []
    evidence_blocks = _build_evidence_blocks(evidence_items)
    criteria_breakdown = _build_criteria_breakdown(score_result.get("criteria_results", []))

    prompt = build_reporter_prompt(
        jd_raw_text=jd_raw_text,
        resume_raw_text=resume_raw_text,
        resume_data=resume_data,
        score_result=score_result,
        evidence_blocks=evidence_blocks,
        criteria_breakdown=criteria_breakdown,
        screening_criteria=screening_criteria,
    )

    completion = client.chat.completions.create(
        model=report_model,
        temperature=0,
        messages=[
            {"role": "system", "content": REPORTER_SYSTEM},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
    )

    import json as _json
    report = _json.loads(completion.choices[0].message.content)

    # Strip any keys the LLM shouldn't be writing
    LOCKED_KEYS = {
        "score", "base_score", "human_layer", "human_adjustment", "status",
        "breakdown", "skill_matching", "exp_status", "hard_rejected",
        "rejection_reasons", "candidate_years", "jd_min_years",
    }
    for k in LOCKED_KEYS:
        report.pop(k, None)

    # Grounding verification
    warnings = _verify_grounding(report, resume_data)
    score_result.setdefault("grounding_warnings", []).extend(warnings)

    # Fallback for weak decision_reason
    if _is_weak_decision_reason(report.get("decision_reason", "")):
        report["decision_reason"] = _decision_reason_fallback(score_result, resume_data)

    # Patch missing fit_radar axes from score breakdown
    radar = report.get("fit_radar") or {}
    bd = score_result.get("breakdown", {})
    if "must_haves" not in radar:
        radar["must_haves"] = min(100, round(bd.get("skills_score", 0) / max(bd.get("skills_max", 50), 1) * 100))
    if "exp_depth" not in radar:
        radar["exp_depth"] = min(100, round(bd.get("exp_score", 0) / max(bd.get("exp_max", 15), 1) * 100))
    if "domain_fit" not in radar:
        radar["domain_fit"] = min(100, round(bd.get("domain_score", 0) / max(bd.get("domain_max", 10), 1) * 100))
    if "skill_breadth" not in radar:
        radar["skill_breadth"] = min(100, round(float(score_result.get("skill_matching", {}).get("match_ratio", 0))))
    if "evidence_quality" not in radar:
        radar["evidence_quality"] = min(100, round(bd.get("career_score", 0) / max(bd.get("career_max", 15), 1) * 100))
    report["fit_radar"] = radar

    from billing.billing import extract_usage  # noqa: PLC0415
    usage = extract_usage(completion, report_model)

    return report, usage
