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
- decision_reason is a full multi-sentence paragraph walking through the score
  breakdown, must-have coverage, and decisive factor -- no template fallback.
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
    for field in ["decision_reason"]:
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


def generate_report(
    resume_data: dict,
    score_result: dict,
    client: Any,
    report_model: str,
    screening_criteria: dict | None = None,
) -> tuple[dict, dict]:
    """
    Generate the recruiter report.

    Returns (report_dict, usage_dict).
    score_result is mutated to add grounding_warnings.

    jd_data/jd_raw_text/resume_raw_text were dropped from the signature: the
    prompt never needed the raw JD/resume text (evidence_blocks + criteria_
    breakdown already ground every output field), and jd_data was unused here.
    """
    evidence_items = resume_data.get("evidence_items", []) or []
    evidence_blocks = _build_evidence_blocks(evidence_items)
    criteria_breakdown = _build_criteria_breakdown(score_result.get("criteria_results", []))

    prompt = build_reporter_prompt(
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

    import os
    import sys
    _agent_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "livekit-python-agent")
    if _agent_dir not in sys.path:
        sys.path.insert(0, _agent_dir)  # billing/billing.py lives here (see commit 82e7fba)
    from billing.billing import extract_usage  # noqa: PLC0415
    usage = extract_usage(completion, report_model)

    return report, usage
