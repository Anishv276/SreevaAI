"""
scorer.py - Full deterministic scoring engine ported from extract_pdf.py.
Fully self-contained. No dependency on extract_pdf.py.
"""
from __future__ import annotations
import re
import json
from extraction_resume_JD_score_report.utils import normalize_skill, _as_dict
from extraction_resume_JD_score_report.config import TRANSFERABLE_SKILLS


def _skill_match_level(norm_skill, resume_normalized, skill_evidence_map, resume_raw_text):
    """
    Returns (match_level, multiplier) for a single JD skill against the resume.
      "full"        - exact match with strong evidence  -> 1.2x
      "confirmed"   - exact match, evidence present     -> 1.0x
      "mentioned"   - exact match, only listed          -> 0.85x
      "transferable"- related skill found               -> 0.50x
      "text_hit"    - skill name found in raw text      -> 0.40x
      "none"        - no evidence                       -> 0.0x
    """
    if norm_skill in resume_normalized:
        ev = skill_evidence_map.get(norm_skill, {})
        evidence_text = ev.get("evidence", "")
        confidence = ev.get("confidence", "high")
        if confidence == "high" and evidence_text and evidence_text not in ("mentioned in resume", ""):
            return "full", 1.2
        elif confidence == "medium" or evidence_text not in ("mentioned in resume", ""):
            return "confirmed", 1.0
        else:
            return "mentioned", 0.85
    # Transferable skill partial credit
    for transferable in TRANSFERABLE_SKILLS.get(norm_skill, []):
        if transferable in resume_normalized:
            ev = skill_evidence_map.get(transferable, {})
            if ev.get("confidence", "high") == "high":
                return "transferable", 0.50
            return "transferable", 0.40
    # Raw text hit — skill literally appears in summary/text but LLM didn't extract it
    if norm_skill and len(norm_skill) >= 3 and norm_skill in resume_raw_text:
        return "text_hit", 0.40
    return "none", 0.0

def _custom_check_match(check_text, resume_normalized, resume_raw_text):
    normalized = re.sub(r"[^a-z0-9]+", " ", str(check_text or "").lower()).strip()
    if not normalized:
        return "none", 0.0
    if normalized in resume_raw_text:
        return "full", 1.0
    tokens = [tok for tok in normalized.split() if len(tok) > 2]
    if not tokens:
        return "none", 0.0
    hits = 0
    for tok in tokens:
        if tok in resume_raw_text or normalize_skill(tok) in resume_normalized:
            hits += 1
    ratio = hits / len(tokens)
    if ratio >= 0.8:
        return "full", 1.0
    if ratio >= 0.5:
        return "partial", 0.6
    if ratio > 0:
        return "mentioned", 0.3
    return "none", 0.0

def _build_human_like_adjustment(
    jd_data,
    resume_data,
    score_result,
    criteria_results,
    resume_normalized,
    work_history,
    resume_raw_text_corpus,
):
    """
    Second-layer human-like rubric.
    This does not replace the deterministic score; it re-reads the same evidence
    with recruiter-style judgment about direct proof, adjacency, ownership, and risk.
    The adjustment is intentionally bounded so the layer can refine, not rewrite,
    the base score.
    """
    jd_role = (
        jd_data.get("role_level")
        or _as_dict(jd_data.get("role_context", {})).get("seniority")
        or "unknown"
    )
    jd_role_key = str(jd_role or "").strip().lower()
    candidate_years = score_result.get("candidate_years")
    jd_min_years = score_result.get("jd_min_years")
    jd_keywords = {normalize_skill(k) for k in (jd_data.get("keywords", []) or []) if k}

    def resolve_role_band() -> str:
        if jd_role_key in ("intern", "junior", "mid", "senior", "lead", "manager"):
            return jd_role_key
        if jd_min_years is not None:
            if jd_min_years <= 1:
                return "intern"
            if jd_min_years <= 2:
                return "junior"
            if jd_min_years <= 5:
                return "mid"
            return "senior"
        if candidate_years is not None:
            if candidate_years <= 1:
                return "intern"
            if candidate_years <= 2:
                return "junior"
            if candidate_years <= 5:
                return "mid"
            return "senior"
        return "mid"

    role_band = resolve_role_band()
    role_profiles = {
        "intern": {
            "direct": 1.00,
            "adjacent": 0.50,
            "impact": 1.00,
            "experience": 0.85,
            "domain": 0.90,
            "blocker": 1.05,
            "max_positive": 10,
            "max_negative": 15,
        },
        "junior": {
            "direct": 1.00,
            "adjacent": 0.55,
            "impact": 1.00,
            "experience": 0.90,
            "domain": 0.95,
            "blocker": 1.10,
            "max_positive": 10,
            "max_negative": 16,
        },
        "mid": {
            "direct": 1.05,
            "adjacent": 0.50,
            "impact": 1.05,
            "experience": 0.90,
            "domain": 1.00,
            "blocker": 1.15,
            "max_positive": 9,
            "max_negative": 18,
        },
        "senior": {
            "direct": 1.15,
            "adjacent": 0.35,
            "impact": 1.15,
            "experience": 0.80,
            "domain": 1.05,
            "blocker": 1.20,
            "max_positive": 8,
            "max_negative": 18,
        },
        "lead": {
            "direct": 1.20,
            "adjacent": 0.30,
            "impact": 1.20,
            "experience": 0.80,
            "domain": 1.10,
            "blocker": 1.25,
            "max_positive": 8,
            "max_negative": 20,
        },
        "manager": {
            "direct": 1.20,
            "adjacent": 0.25,
            "impact": 1.20,
            "experience": 0.80,
            "domain": 1.10,
            "blocker": 1.25,
            "max_positive": 8,
            "max_negative": 20,
        },
    }
    profile = role_profiles.get(role_band, role_profiles["mid"])

    jd_core_skills = []
    for criterion in (jd_data.get("criteria", []) or []):
        if criterion.get("category") == "skill":
            normalized = normalize_skill(criterion.get("name"))
            if normalized:
                jd_core_skills.append(normalized)
    jd_core_skill_hits = [skill for skill in jd_core_skills if skill in resume_normalized]
    jd_core_skill_misses = [skill for skill in jd_core_skills if skill not in resume_normalized]
    jd_core_skill_total = len(jd_core_skills)
    jd_core_skill_hit_count = len(jd_core_skill_hits)
    jd_core_skill_match_ratio = (jd_core_skill_hit_count / jd_core_skill_total) if jd_core_skill_total else 0.0
    tech_alignment_clear = jd_core_skill_total == 0 or jd_core_skill_match_ratio >= 0.80
    tech_alignment_partial = jd_core_skill_total == 0 or jd_core_skill_match_ratio >= 0.50

    adjustment = 0
    reasons = []
    strong_evidence = []
    risk_flags = []

    def add_delta(delta: int, reason: str, evidence: str | None = None):
        nonlocal adjustment
        if delta == 0:
            return
        adjustment += delta
        entry = {"delta": delta, "reason": reason}
        if evidence:
            entry["evidence"] = evidence
            if delta > 0:
                strong_evidence.append({"reason": reason, "evidence": evidence, "delta": delta})
        reasons.append(entry)

    def job_has_backend_depth(job):
        techs = {normalize_skill(t) for t in (job.get("technologies_used", []) or []) if t}
        resp = " ".join(job.get("responsibilities", []) or []).lower()
        backend_tokens = {
            "java",
            "spring",
            "hibernate",
            "rest",
            "node",
            "express",
            "django",
            "flask",
            "fastapi",
            "python",
            "microservices",
            "api",
        }
        return bool(techs & backend_tokens) or any(tok in resp for tok in backend_tokens)

    direct_hits = [c for c in criteria_results if c.get("result") == "meets"]
    partial_hits = [c for c in criteria_results if c.get("result") in ("partially_meets", "unclear")]
    strong_direct = [c for c in direct_hits if c.get("ev_type") in ("work_history_outcome", "work_history")]
    weak_direct = [c for c in direct_hits if c.get("ev_type") in ("project", "listed", "inferred")]

    # 1) Direct must-have evidence carries the most weight.
    if strong_direct and tech_alignment_partial:
        direct_names = ", ".join(c.get("criterion", "") for c in strong_direct[:4]) or None
        if tech_alignment_clear:
            direct_cap = 4
            direct_reason = f"Direct must-have evidence is proven in work history and the JD tech stack is a strong match ({role_band} fit)"
        else:
            direct_cap = 2
            direct_reason = f"Direct must-have evidence exists, but the JD tech stack is only partially matched ({role_band} fit)"
        add_delta(
            int(round(min(direct_cap, len(strong_direct) * 2) * profile["direct"])),
            direct_reason,
            direct_names,
        )
    elif strong_direct:
        direct_names = ", ".join(c.get("criterion", "") for c in strong_direct[:4]) or None
        risk_flags.append("Direct proof exists, but the candidate is weak on the JD technology stack")
        add_delta(
            -2 if role_band in ("intern", "junior") else -3,
            "Direct proof is present, but it does not line up tightly enough with the JD technology stack",
            direct_names,
        )
    if weak_direct and tech_alignment_partial:
        weak_names = ", ".join(c.get("criterion", "") for c in weak_direct[:4]) or None
        add_delta(
            int(round(min(3, len(weak_direct)) * (0.7 if not tech_alignment_clear else 0.9))),
            "Some criteria are supported only by weaker evidence",
            weak_names,
        )

    # 2) Technology alignment should lead the judgment.
    if jd_core_skills:
        if tech_alignment_clear:
            add_delta(
                int(round(4 * profile["direct"])),
                f"Strong direct technology alignment across {jd_core_skill_hit_count}/{jd_core_skill_total} core JD skills",
                ", ".join(jd_core_skill_hits[:5]),
            )
        elif tech_alignment_partial:
            add_delta(
                int(round(2 * profile["direct"])),
                f"Partial technology alignment across {jd_core_skill_hit_count}/{jd_core_skill_total} core JD skills",
                ", ".join(jd_core_skill_hits[:5]),
            )
        elif jd_core_skill_hit_count == 1:
            risk_flags.append("Only one core JD technology is evidenced")
            add_delta(
                -2 if role_band in ("intern", "junior") else -3,
                "Only one core JD technology is evidenced, which is weaker than the role expects",
                ", ".join(jd_core_skill_hits[:5]),
            )
        else:
            if "No direct JD technology match" not in risk_flags:
                risk_flags.append("No direct JD technology match")
            add_delta(
                -6 if role_band in ("intern", "junior") else -7,
                "The resume does not show direct alignment with the JD technology stack",
                ", ".join(jd_core_skills[:5]),
            )

    # 3) Adjacent backend proof only reinforces a real technology match.
    backend_jobs = [job for job in work_history if job_has_backend_depth(job)]
    backend_jobs_with_impact = [job for job in backend_jobs if job.get("impact_signals")]
    if backend_jobs and jd_core_skill_hits and tech_alignment_partial:
        base_backend_delta = 3 if len(backend_jobs) >= 2 else 1
        add_delta(
            int(round(base_backend_delta * profile["adjacent"])),
            f"Multiple backend roles reinforce the technology match ({role_band} fit)",
            "; ".join(f"{job.get('company')} / {job.get('role')}" for job in backend_jobs[:2]),
        )
    if backend_jobs_with_impact and jd_core_skill_hits and tech_alignment_clear:
        base_backend_impact = 2 if len(backend_jobs_with_impact) >= 2 else 1
        add_delta(
            int(round(base_backend_impact * profile["impact"])),
            f"Backend work included measurable outcomes that reinforce the technology match ({role_band} fit)",
            "; ".join(job.get("company", "") for job in backend_jobs_with_impact[:2]),
        )

    # 4) Measurable ownership and impact should move the score up materially.
    impact_signals = sum(len(job.get("impact_signals", []) or []) for job in work_history)
    owner_count = sum(1 for job in work_history if job.get("ownership_level") == "owner")
    if tech_alignment_partial:
        if impact_signals >= 4 and tech_alignment_clear:
            add_delta(int(round(3 * profile["impact"])), "Multiple measurable outcomes show the candidate ships real work", f"{impact_signals} impact signals")
        elif impact_signals >= 2 and tech_alignment_clear:
            add_delta(int(round(2 * profile["impact"])), "There is enough measurable output to trust the resume narrative", f"{impact_signals} impact signals")
        elif impact_signals >= 1 and tech_alignment_clear:
            add_delta(int(round(1 * profile["impact"])), "At least one measurable outcome is present", f"{impact_signals} impact signal")
        if owner_count >= 2 and tech_alignment_clear:
            add_delta(int(round(2 * profile["impact"])), "Multiple owner-level roles indicate genuine execution ownership", f"{owner_count} owner-level roles")
        elif owner_count == 1 and tech_alignment_clear:
            add_delta(int(round(1 * profile["impact"])), "One owner-level role adds credibility", "1 owner-level role")

    # 5) Experience and freshness.
    if jd_min_years is not None and candidate_years is not None and tech_alignment_partial:
        if candidate_years >= jd_min_years:
            add_delta(int(round(3 * profile["experience"])), "Candidate meets the required experience floor", f"{candidate_years} yrs vs {jd_min_years} yrs required")
        elif candidate_years + 1 >= jd_min_years:
            gap_delta = 2 if role_band in ("intern", "junior") else 1 if role_band == "mid" else 0
            if gap_delta > 0:
                add_delta(
                    int(round(gap_delta * profile["experience"])),
                    f"The experience gap is small and acceptable for a {role_band} role",
                    f"{candidate_years} yrs vs {jd_min_years} yrs required",
                )

    # 6) Domain and keyword overlap.
    domain_skills = resume_data.get("skills", {}).get("domain_skills", []) or []
    jd_kw_hits = sum(1 for s in domain_skills if s and normalize_skill(s) in jd_keywords)
    if jd_kw_hits >= 3 and tech_alignment_partial:
        add_delta(int(round(3 * profile["domain"])), "Domain skills align with JD keywords", f"{jd_kw_hits} overlapping domain skills")
    elif jd_kw_hits >= 1 and tech_alignment_clear:
        add_delta(int(round(1 * profile["domain"])), "Some domain alignment is visible", f"{jd_kw_hits} overlapping domain skill")

    # 7) Penalize true blockers, but only when the resume really gives no adjacent proof.
    missing_must = set(score_result.get("skill_matching", {}).get("missing_must", []) or [])
    if "Java" in missing_must and "java" not in resume_normalized:
        risk_flags.append("Java is not evidenced")
        add_delta(int(round(-5 * profile["blocker"])), "Core Java is absent from the structured evidence", "Java missing")
    if "Spring Boot" in missing_must and "spring" not in resume_normalized and "springboot" not in resume_normalized:
        if not backend_jobs and not ({"java", "rest"} <= set(resume_normalized.keys())):
            risk_flags.append("Spring Boot is not evidenced")
            add_delta(int(round(-4 * profile["blocker"])), "Spring Boot is missing and there is no adjacent backend proof", "Spring Boot missing")
    if "Data Structures and Algorithms" in missing_must:
        if not any(tok in resume_normalized for tok in ("dsa", "algorithm", "algorithms")):
            add_delta(int(round(-2 * profile["blocker"])), "DSA is still weakly evidenced", "No explicit DSA signal")

    adjustment = max(-1 * profile["max_negative"], min(profile["max_positive"], adjustment))
    human_score = max(0, min(100, round(score_result["score"] + adjustment)))
    confidence = 55
    if strong_direct:
        confidence += 15
    if impact_signals >= 2:
        confidence += 10
    if backend_jobs:
        confidence += 10
    if jd_core_skill_hits:
        confidence += 3 if len(jd_core_skill_hits) >= 2 else 1
    if not risk_flags:
        confidence += 5
    confidence = max(35, min(95, confidence))

    if human_score >= 75:
        judgment = "Shortlisted"
    elif human_score >= 60:
        judgment = "Borderline"
    else:
        judgment = "Rejected"

    summary_bits = []
    if strong_direct:
        summary_bits.append(
            f"Direct proof covers {len(strong_direct)} JD criteria: {', '.join(c.get('criterion', '') for c in strong_direct[:4])}"
        )
    if jd_core_skills:
        summary_bits.append(
            f"Core JD technology hits: {len(jd_core_skill_hits)} matched, {len(jd_core_skill_misses)} missing"
        )
    if backend_jobs:
        summary_bits.append(
            f"Backend evidence comes from {len(backend_jobs)} work-history roles: {', '.join(job.get('company', '') for job in backend_jobs[:3])}"
        )
    summary_bits.append(f"Role band used for tuning: {role_band}")
    if strong_evidence:
        summary_bits.append(
            "Most useful signals: " + "; ".join(
                f"{item['reason']} ({item.get('evidence', '')})" for item in strong_evidence[:3]
            )
        )
    if partial_hits:
        summary_bits.append(
            f"Partial evidence remains on {', '.join(c.get('criterion', '') for c in partial_hits[:3])}"
        )
    if risk_flags:
        summary_bits.append("Risks: " + "; ".join(risk_flags))

    return {
        "base_score": score_result["score"],
        "human_adjustment": adjustment,
        "human_score": human_score,
        "confidence": confidence,
        "judgment": judgment,
        "strong_evidence": strong_evidence,
        "reasons": reasons,
        "risk_flags": risk_flags,
        "summary": " ".join(summary_bits).strip(),
    }

def compute_score(jd_data, resume_data, threshold=70, screening_criteria=None):
    """
    Deterministic evidence-based scoring engine. LLM never touches this function.
    Score breakdown (100 pts):
      Criteria match (critical/high) : 50 pts  (evidence_items weight x result x evidence quality)
      Experience + Seniority         : 15 pts  (years gap + seniority alignment)
      Good-to-have criteria (medium) : 10 pts  (same criteria loop, medium priority pool)
      Career quality                 : 15 pts  (ownership, impact signals, progression, red flags)
      Domain fit                     : 10 pts  (JD keywords vs domain_skills + scoring hints)
    Evidence quality: work_history_outcome > work_history > project > listed > inferred
    """

    if screening_criteria is None:
        screening_criteria = {}
    # ── 0. Resolve JD Criteria (new) + legacy skill fallback ─────────────────
    jd_criteria = jd_data.get("criteria", [])
    hr_custom_checks = screening_criteria.get("customChecks", []) or screening_criteria.get("custom_checks", [])

    # If HR has overridden skills via screening_criteria, inject as criteria items
    hr_criteria_skills = screening_criteria.get("skills", {})
    if hr_criteria_skills:
        hr_required = hr_criteria_skills.get("mustHave") or hr_criteria_skills.get("required", [])
        if hr_required:
            # Convert HR override skills into criteria format
            hr_skill_criteria = []
            for s in hr_required:
                name = s.get("name", s) if isinstance(s, dict) else s
                w = s.get("weight", "high") if isinstance(s, dict) else "high"
                weight_pts = {"critical": 20, "high": 15, "medium": 10}.get(w, 15)
                hr_skill_criteria.append({
                    "id": f"hr_{name}", "category": "skill", "name": name,
                    "priority": w, "weight": weight_pts,
                    "evidence_required": "any", "source_text": f"HR required: {name}"
                })
            if hr_skill_criteria:
                jd_criteria = hr_skill_criteria  # HR overrides JD criteria

    # Legacy fallback: if old JD format (no criteria), convert must_have skills to criteria
    if not jd_criteria:
        jd_skills = jd_data.get("skills", {})
        raw_must = jd_skills.get("must_have", [])
        for s in raw_must:
            name = s["skill"] if isinstance(s, dict) else s
            w = s.get("weight", "high") if isinstance(s, dict) else "high"
            weight_pts = {"critical": 20, "high": 15, "medium": 10}.get(w, 15)
            # Multi-word phrases (e.g. "Data Structures and Algorithms", "REST APIs") are
            # not single-token skills — use "responsibility" category so the raw-text word
            # matching path fires for them instead of exact normalized-key lookup.
            is_multiword = len(str(name).split()) > 2
            category = "responsibility" if is_multiword else "skill"
            jd_criteria.append({
                "id": f"legacy_{name}", "category": category, "name": name,
                "priority": w, "weight": weight_pts,
                "evidence_required": "any", "source_text": name
            })
        # Also add good_to_have as medium criteria so they contribute to good_score pool
        for s in (jd_skills.get("good_to_have", []) or []):
            name = s["skill"] if isinstance(s, dict) else s
            if not name:
                continue
            is_multiword = len(str(name).split()) > 2
            category = "responsibility" if is_multiword else "skill"
            jd_criteria.append({
                "id": f"legacy_good_{name}", "category": category, "name": name,
                "priority": "medium", "weight": 8,
                "evidence_required": "any", "source_text": name
            })


    jd_experience = _as_dict(jd_data.get("experience", {}))
    jd_min_years = jd_experience.get("min_years")
    jd_max_years = jd_experience.get("max_years")
    # New JD format uses role_level, old uses role_context.seniority
    jd_seniority = jd_data.get("role_level") or _as_dict(jd_data.get("role_context", {})).get("seniority")
    has_tech = jd_data.get("has_technical_requirements", True)
    scoring_hints = _as_dict(jd_data.get("scoring_hints", {}))
    # ── 1. Build resume skill pool ──────────────────────────────────────────
    resume_skills = resume_data.get("skills", {})
    work_history = resume_data.get("work_history", [])
    evidence_items = resume_data.get("evidence_items", []) or []
    if not isinstance(evidence_items, list):
        evidence_items = []
    domain_skills = resume_skills.get("domain_skills", [])
    skill_evidence_map = {}
    priority_rank = {"work_history_outcome": 5, "work_history": 4, "project": 3, "listed": 2, "keyword": 1}
    def _add_skill(name, evidence, confidence, source, years=None):
        norm = normalize_skill(str(name))
        if not norm:
            return norm
        existing = skill_evidence_map.get(norm)
        if not existing or priority_rank.get(source, 0) > priority_rank.get(existing.get("source", ""), 0):
            skill_evidence_map[norm] = {"evidence": evidence, "confidence": confidence, "source": source, "years": years}
        return norm
    all_resume_skill_names = []
    for s in (resume_skills.get("technical", []) or []):
        if isinstance(s, dict) and s.get("skill"):
            src = s.get("source_strength", "listed")
            mapped_src = src if src in ("work_history_outcome", "work_history", "project", "listed", "inferred") else "listed"
            _add_skill(s["skill"], s.get("evidence", ""), "high", mapped_src, s.get("years_of_use"))
            all_resume_skill_names.append(s["skill"])
        elif isinstance(s, str) and s:
            _add_skill(s, "", "high", "listed")
            all_resume_skill_names.append(s)
    for s in (resume_skills.get("tools", []) or []):
        if isinstance(s, dict):
            tool, conf = s.get("tool"), s.get("confidence", "high")
            if tool and conf != "low":
                src = s.get("source_strength", "listed")
                mapped_src = src if src in ("work_history_outcome", "work_history", "project", "listed", "inferred") else "listed"
                _add_skill(tool, s.get("evidence", ""), conf, mapped_src)
                all_resume_skill_names.append(tool)
        elif isinstance(s, str) and s:
            _add_skill(s, "", "high", "listed")
            all_resume_skill_names.append(s)
    for job in work_history:
        company = job.get("company", "work history")
        src = "work_history_outcome" if job.get("impact_signals") else ("work_history" if job.get("impact_strength") in ("high", "medium") else "project")
        for tech in (job.get("technologies_used", []) or []):
            if tech and isinstance(tech, str):
                _add_skill(tech, company, "high", src)
                all_resume_skill_names.append(tech)
    for proj in (resume_data.get("projects", []) or []):
        pname = proj.get("name", "project")
        for tech in (proj.get("technologies", []) or []):
            if tech and isinstance(tech, str):
                _add_skill(tech, pname, "medium", "project")
                all_resume_skill_names.append(tech)
    for kw in (resume_data.get("keywords", []) or []):
        if kw and isinstance(kw, str):
            _add_skill(kw, "", "medium", "keyword")
            all_resume_skill_names.append(kw)
    all_resume_skill_names.extend([s for s in domain_skills if s])
    resume_normalized = {}
    for s in all_resume_skill_names:
        norm = normalize_skill(str(s))
        if norm and norm not in resume_normalized:
            resume_normalized[norm] = s
    career_timeline = resume_data.get("career_timeline", {})
    career_progression = _as_dict(resume_data.get("career_progression", {}))
    career_context = " ".join(filter(None, [
        career_timeline.get("progression_pattern", ""),
        career_timeline.get("job_hopping_risk", ""),
        career_progression.get("analysis", ""),
    ]))
    resume_raw_text_corpus = " ".join(filter(None, [
        resume_data.get("candidate_summary", ""),
        career_context,
        " ".join(kw for kw in (resume_data.get("keywords", []) or []) if kw),
        " ".join(" ".join(str(t) for t in (job.get("technologies_used", []) or [])) for job in work_history),
        " ".join(job.get("business_domain", "") for job in work_history if job.get("business_domain")),
        " ".join(s for s in domain_skills if s),
        " ".join(c.get("claim", "") for c in (resume_data.get("core_claims", []) or [])),
    ])).lower()
    # ── 2. Criteria-Based Scoring (50 pts) ─────────────────────────────────
    # Each JD criterion is evaluated against resume evidence.
    # result_multiplier: meets=1.0, partially_meets=0.55, unclear=0.25, does_not_meet=0.0
    # evidence_multiplier: work_history+outcome=1.0, work_history=0.85, project=0.65, listed/any=0.30
    RESULT_MULT = {"meets": 1.0, "partially_meets": 0.55, "unclear": 0.25, "does_not_meet": 0.0}
    EVIDENCE_MULT = {"work_history_outcome": 1.0, "work_history": 0.85, "project": 0.65, "listed": 0.30, "inferred": 0.15}
    criteria_results = []
    # Separate pools: critical/high -> 50 pts, medium -> 10 pts
    must_matched_weight = 0
    must_total_weight = 0
    good_matched_weight = 0
    good_total_weight = 0
    matched_must = []
    missing_must = []
    partial_must = []
    matched_good = []
    must_have_details = []
    
    # Initialize custom check counters
    custom_required_total = 0
    custom_required_missing = []
    custom_required_hits = []

    for criterion in jd_criteria:
        cname = criterion.get("name")
        ccategory = criterion.get("category", "skill")
        cpriority = criterion.get("priority", "high")
        cweight = max(criterion.get("weight", 10), 1)
        cev_required = criterion.get("evidence_required", "any")
        if not cname:
            continue
        if cpriority == "medium":
            good_total_weight += cweight
        else:
            must_total_weight += cweight
        # Per-criterion state
        norm_cname = normalize_skill(cname)
        result = "does_not_meet"
        ev_type = "none"
        matched_evidence_text = ""
        confidence = 0.0
        best_ev_level = 0

        # Experience-category criteria are scored from the resume's total_years,
        # not from text/skill matching, to avoid treating "3+ years in fintech" like a skill.
        if ccategory == "experience":
            cand_yrs = resume_data.get("experience", {}).get("total_years")
            # Try to parse a minimum/maximum requirement from the criterion name.
            # Supports "5+ years", "5 years", and "5-7 years" style phrases.
            req_min = None
            req_max = None
            range_match = re.search(r"(\d+)\s*(?:-|to|–|—)\s*(\d+)\s*(?:\+)?\s*years?", cname, re.IGNORECASE)
            plus_match = re.search(r"(\d+)\s*\+\s*years?", cname, re.IGNORECASE)
            single_match = re.search(r"(\d+)\s*years?", cname, re.IGNORECASE)
            if range_match:
                req_min = int(range_match.group(1))
                req_max = int(range_match.group(2))
            elif plus_match:
                req_min = int(plus_match.group(1))
            elif single_match:
                req_min = int(single_match.group(1))

            if cand_yrs is not None and req_min is not None:
                gap = cand_yrs - req_min
                if req_max is not None and cand_yrs > req_max + 2:
                    result, ev_type, confidence = "unclear", "work_history", 0.65
                elif gap >= 0:
                    result, ev_type, confidence = "meets", "work_history", 0.90
                elif gap >= -1:
                    result, ev_type, confidence = "partially_meets", "work_history", 0.70
                elif gap >= -2:
                    result, ev_type, confidence = "unclear", "listed", 0.40
                else:
                    result, ev_type, confidence = "does_not_meet", "none", 0.0
            elif cand_yrs is not None:
                # If we can’t parse the requirement, give only mild credit rather than a full pass.
                result, ev_type, confidence = "unclear", "work_history", 0.45
            # Skip generic matching entirely for experience criteria
            criteria_results.append({
                "criterion": cname, "category": ccategory, "priority": cpriority,
                "weight": cweight, "result": result, "confidence": round(confidence, 2),
                "evidence": matched_evidence_text, "ev_type": ev_type,
            })
            r_mult = RESULT_MULT.get(result, 0.0)
            e_mult = EVIDENCE_MULT.get(ev_type, 0.15)
            contribution = cweight * r_mult * e_mult
            if cpriority == "medium":
                good_matched_weight += contribution
            else:
                must_matched_weight += contribution
            if result == "meets":
                (matched_good if cpriority == "medium" else matched_must).append(cname)
                must_have_details.append({"name": cname, "weight": cpriority, "status": "found", "match_level": "full"})
            elif result in ("partially_meets", "unclear"):
                if cpriority != "medium":
                    partial_must.append(cname)
                must_have_details.append({"name": cname, "weight": cpriority, "status": "mentioned", "match_level": result})
            else:
                if cpriority != "medium":
                    missing_must.append(cname)
                must_have_details.append({"name": cname, "weight": cpriority, "status": "not_found", "match_level": "none"})
            continue

        for ev in evidence_items:
            proves = [normalize_skill(p) for p in ev.get("proves", [])]
            ev_text = ev.get("text", "").lower()
            ev_level = ev.get("evidence_level", 1)
            ev_ownership = ev.get("ownership", "unclear")
            if norm_cname in proves or norm_cname in ev_text:
                if ev_level > best_ev_level:
                    best_ev_level = ev_level
                    conf_val = ev.get("confidence", 0.7)
                    if isinstance(conf_val, str):
                        confidence = {"high": 1.0, "medium": 0.7, "low": 0.4}.get(conf_val.lower(), 0.7)
                    else:
                        confidence = float(conf_val)
                    matched_evidence_text = ev.get("text", "")
                    if ev_level >= 5:
                        result = "meets"
                        ev_type = "work_history_outcome"
                    elif ev_level >= 4 and ev_ownership == "owner":
                        result = "meets"
                        ev_type = "work_history_outcome"
                    elif ev_level >= 3:
                        result = "meets"
                        ev_type = "work_history"
                    elif ev_level == 2:
                        result = "partially_meets"
                        ev_type = "project"
                    else:
                        result = "unclear"
                        ev_type = "listed"

        # Fallback: match against traditional skill_evidence_map + raw text corpus
        if result == "does_not_meet":
            level, multiplier = _skill_match_level(norm_cname, resume_normalized, skill_evidence_map, resume_raw_text_corpus)
            if level in ("full", "confirmed"):
                ev_src_raw = skill_evidence_map.get(norm_cname, {}).get("source", "listed")
                if ev_src_raw == "work_history_outcome":
                    result = "meets"
                    ev_type = "work_history_outcome"
                    confidence = 1.0
                elif ev_src_raw == "work_history":
                    result = "meets"
                    ev_type = "work_history"
                    confidence = 0.85
                elif ev_src_raw == "project":
                    result = "partially_meets"
                    ev_type = "project"
                    confidence = 0.65
                else:
                    result = "unclear" if ccategory == "responsibility" else "partially_meets"
                    ev_type = "listed"
                    confidence = 0.40
            elif level == "transferable":
                result = "partially_meets"
                ev_type = "listed"
                confidence = 0.50
            elif level in ("mentioned", "text_hit"):
                result = "unclear"
                ev_type = "inferred"
                confidence = 0.25
            else:
                # For non-skill categories (responsibility/ownership/domain), check raw text
                if ccategory in ("responsibility", "ownership", "domain"):
                    words = [w for w in cname.lower().split() if len(w) > 3]
                    hits = sum(1 for w in words if w in resume_raw_text_corpus)
                    if hits >= max(2, len(words) // 2):
                        result = "unclear"
                        ev_type = "inferred"
                        confidence = 0.20

        # Apply evidence_required constraint
        if cev_required == "work_history" and ev_type not in ("work_history", "work_history_outcome"):
            if result == "meets":
                result = "partially_meets"
                confidence *= 0.6

        # Compute weighted contribution
        r_mult = RESULT_MULT.get(result, 0.0)
        e_mult = EVIDENCE_MULT.get(ev_type, 0.15)
        contribution = cweight * r_mult * e_mult

        if cpriority == "medium":
            good_matched_weight += contribution
        else:
            must_matched_weight += contribution

        # Track for reporting + legacy compat
        criteria_results.append({
            "criterion": cname, "category": ccategory, "priority": cpriority,
            "weight": cweight, "result": result, "confidence": round(confidence, 2),
            "evidence": matched_evidence_text, "ev_type": ev_type,
        })
        if result == "meets":
            if cpriority == "medium":
                matched_good.append(cname)
            else:
                matched_must.append(cname)
            must_have_details.append({"name": cname, "weight": cpriority, "status": "found", "match_level": "full"})
        elif result in ("partially_meets", "unclear"):
            if cpriority != "medium":
                partial_must.append(cname)
            must_have_details.append({"name": cname, "weight": cpriority, "status": "mentioned", "match_level": result})
        else:
            if cpriority != "medium":
                missing_must.append(cname)
            must_have_details.append({"name": cname, "weight": cpriority, "status": "not_found", "match_level": "none"})

    # Custom HR screening checks are handled separately from JD criteria.
    for check in hr_custom_checks:
        check_text = ""
        required = False
        if isinstance(check, dict):
            check_text = str(check.get("text") or check.get("label") or "").strip()
            required = bool(check.get("required"))
        else:
            check_text = str(check or "").strip()
        if not check_text:
            continue

        custom_required_total += 1 if required else 0
        level, multiplier = _custom_check_match(check_text, resume_normalized, resume_raw_text_corpus)
        if level in ("full", "partial", "mentioned"):
            custom_required_hits.append(check_text)
            if required:
                must_matched_weight += 10 * multiplier
                must_total_weight += 10
            must_have_details.append({
                "name": f"Custom: {check_text}",
                "weight": "high",
                "status": "found" if level == "full" else "mentioned",
                "match_level": level,
            })
        else:
            if required:
                custom_required_missing.append(check_text)
                missing_must.append(f"Custom: {check_text}")
                must_total_weight += 10
            must_have_details.append({
                "name": f"Custom: {check_text}",
                "weight": "high",
                "status": "not_found",
                "match_level": level,
            })
    # Final score normalization
    skills_score = round((must_matched_weight / must_total_weight) * 50) if must_total_weight else 50
    skills_score = min(50, max(0, skills_score))

    good_score = round((good_matched_weight / good_total_weight) * 10) if good_total_weight else 5
    good_score = min(10, max(0, good_score))

    # ── 3. Experience score (15 pts) ───────────────────────────────────────
    cv_exp = resume_data.get("experience", {})
    candidate_years = cv_exp.get("total_years")
    candidate_seniority = cv_exp.get("seniority_level")
    exp_score = 0
    exp_status = "unknown"
    seniority_rank = {"intern": 0, "junior": 1, "mid": 2, "senior": 3, "lead": 4, "manager": 5}
    if jd_min_years is None:
        exp_score = 15
        exp_status = "neutral"
    elif candidate_years is None:
        exp_score = 11
        exp_status = "unknown"
    else:
        gap = candidate_years - jd_min_years
        if gap >= 0:
            exp_score = 15
            exp_status = "meets"
            # Overqualified: only reduce if far over max_years (generous window)
            if jd_max_years and gap > (jd_max_years - jd_min_years + 4):
                exp_score = 13
                exp_status = "overqualified"
        elif gap >= -1:
            exp_score = 12
            exp_status = "close"
        elif gap >= -2:
            exp_score = 9
            exp_status = "below"
        elif gap >= -3:
            exp_score = 5
            exp_status = "significantly_below"
        else:
            exp_score = max(0, 3 - (abs(gap) - 3))
            exp_status = "significantly_below"
    # Seniority adjustment: capped at +-2 pts
    if jd_seniority and candidate_seniority:
        jd_lvl = seniority_rank.get(jd_seniority, 2)
        cand_lvl = seniority_rank.get(candidate_seniority, 2)
        gap_lvl = cand_lvl - jd_lvl
        if gap_lvl == 0:
            exp_score = min(15, exp_score + 1)
        elif gap_lvl == -1:
            pass
        elif gap_lvl == 1:
            exp_score = max(0, exp_score - 1)
        elif gap_lvl <= -2:
            exp_score = max(0, exp_score - 2)
        elif gap_lvl >= 2:
            exp_score = max(0, exp_score - 1)
    exp_score = max(0, min(15, exp_score))

    # ── 4. Career quality (15 pts) ─────────────────────────────────────────
    career_pattern = resume_data.get("career_timeline", {}).get("progression_pattern", "unknown")
    resume_red_flags = resume_data.get("red_flags", [])
    is_early_career = candidate_seniority in ("intern", "junior") or (candidate_years is not None and candidate_years <= 2)
    career_score = 4 if is_early_career else 5
    total_impact_signals = sum(len(job.get("impact_signals", []) or []) for job in work_history)
    if total_impact_signals >= 4:
        career_score += 3
    elif total_impact_signals >= 2:
        career_score += 2
    elif total_impact_signals >= 1:
        career_score += 1
    role_ownership_levels = [job.get("ownership_level") for job in work_history]
    role_impact_strengths = [job.get("impact_strength") for job in work_history]
    owner_count = sum(1 for lvl in role_ownership_levels if lvl == "owner")
    if owner_count >= 2:
        career_score += 2
    elif owner_count == 1:
        career_score += 1
    if sum(1 for s in role_impact_strengths if s == "high") >= 2:
        career_score += 1
    if work_history and all(lvl in (None, "contributor", "unclear") for lvl in role_ownership_levels):
        career_score -= 1
    if career_pattern == "growing":
        career_score += 2
    elif career_pattern == "lateral":
        career_score += 1
    elif career_pattern == "declining":
        career_score -= 2
    for flag in resume_red_flags:
        sev = flag.get("severity", "low")
        if sev == "high":
            career_score -= 3
        elif sev == "medium":
            career_score -= 1
    career_score = max(0, min(15, career_score))
    # ── 6. Domain fit (10 pts) ─────────────────────────────────────────────
    domain_score = 5
    for green in (scoring_hints.get("green_flags_to_reward", []) or []):
        if green:
            level, _ = _skill_match_level(normalize_skill(green), resume_normalized, skill_evidence_map, resume_raw_text_corpus)
            if level in ("full", "confirmed"):
                domain_score = min(10, domain_score + 2)
            elif level in ("mentioned", "text_hit", "transferable"):
                domain_score = min(10, domain_score + 1)
    for red in (scoring_hints.get("red_flags_to_watch", []) or []):
        if red and red.lower() in resume_raw_text_corpus:
            domain_score = max(0, domain_score - 2)
    jd_kw_set = {normalize_skill(k) for k in (jd_data.get("keywords", []) or []) if k}
    domain_kw_hits = sum(1 for s in domain_skills if s and normalize_skill(s) in jd_kw_set)
    if domain_kw_hits >= 3:
        domain_score = min(10, domain_score + 1)
    domain_score = max(0, min(10, domain_score))
    # ── 7. Final score ─────────────────────────────────────────────────────
    total = min(100, max(0, skills_score + exp_score + good_score + career_score + domain_score))
    human_layer = _build_human_like_adjustment(
        jd_data,
        resume_data,
        {
            "score": total,
            "candidate_years": candidate_years,
            "jd_min_years": jd_min_years,
            "skill_matching": {"missing_must": missing_must},
        },
        criteria_results,
        resume_normalized,
        work_history,
        resume_raw_text_corpus,
    )
    adjusted_total = int(human_layer.get("human_score", total))
    # ── 8. Hard rejection gates ────────────────────────────────────────────
    # Criteria-based: reject only if 2+ CRITICAL criteria are "does_not_meet"
    hard_rejected = False
    rejection_reasons = []
    critical_fails = [c for c in criteria_results if c.get("priority") == "critical" and c.get("result") == "does_not_meet"]
    critical_total = len([c for c in criteria_results if c.get("priority") == "critical"])
    # Hard reject only when ALL critical criteria fail, or all but one in a large critical set.
    # A threshold of >= 2 was firing on intern JDs where the evidence path was weak,
    # causing candidates with strong work history to be incorrectly hard-rejected.
    if critical_total > 0 and len(critical_fails) >= max(2, critical_total):
        hard_rejected = True
        rejection_reasons.append(f"Missing critical requirements: {[c['criterion'] for c in critical_fails]}")
    if custom_required_total > 0 and len(custom_required_missing) / custom_required_total > 0.70:
        hard_rejected = True
        rejection_reasons.append(f"Missing {len(custom_required_missing)}/{custom_required_total} required custom checks")
    # Experience gate: only if gap is extreme (>=4 years under minimum)
    if exp_status == "significantly_below" and jd_min_years and candidate_years is not None:
        if (jd_min_years - candidate_years) >= 4:
            hard_rejected = True
            rejection_reasons.append(f"Experience: {candidate_years}y vs {jd_min_years}y required")
    # Red flag gate: >=2 HIGH severity flags only
    high_flags = [f for f in resume_red_flags if f.get("severity") == "high"]
    if len(high_flags) >= 2:
        hard_rejected = True
        rejection_reasons.append(f"Multiple high-severity flags: {', '.join(f.get('flag', 'unknown') for f in high_flags)}")
    # ── 9. Status ──────────────────────────────────────────────────────────
    borderline_floor = max(0, threshold - 10)
    if hard_rejected:
        status = "Rejected"
    elif adjusted_total >= threshold:
        status = "Shortlisted"
    elif adjusted_total >= borderline_floor:
        status = "Borderline"
    else:
        status = "Rejected"
    # Build shortlist reason from criteria results
    top_evidence = [c["evidence"] for c in criteria_results if c["result"] == "meets" and c["evidence"]][:3]
    gaps_to_probe = [c["criterion"] for c in criteria_results if c["result"] in ("partially_meets", "unclear")][:4]
    total_criteria = len(jd_criteria)
    met_criteria = len([c for c in criteria_results if c["result"] == "meets"])
    return {
        "score": adjusted_total,
        "base_score": total,
        "human_layer": human_layer,
        "status": status,
        "breakdown": {
            "skills_score": skills_score, "skills_max": 50,
            "exp_score": exp_score, "exp_max": 15,
            "good_score": good_score, "good_max": 10,
            "career_score": career_score, "career_max": 15,
            "domain_score": domain_score, "domain_max": 10,
        },
        "criteria_results": criteria_results,
        "skill_matching": {
            "matched_must": matched_must,
            "missing_must": missing_must,
            "partial_must": partial_must,
            "matched_good": matched_good,
            "total_must": total_criteria,
            "match_ratio": round((met_criteria / total_criteria) * 100) if total_criteria else 100,
            "must_have_details": must_have_details,
        },
        "top_evidence": top_evidence,
        "gaps_to_probe": gaps_to_probe,
        "exp_status": exp_status,
        "hard_rejected": hard_rejected,
        "rejection_reasons": rejection_reasons,
        "candidate_years": candidate_years,
        "jd_min_years": jd_min_years,
    }



class ScoringEngine:
    def score(self, jd_data, resume_data, threshold=70, screening_criteria=None):
        return compute_score(jd_data, resume_data, threshold, screening_criteria)
