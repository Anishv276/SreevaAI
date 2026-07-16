"""
scorer.py v2 â€” Evidence-based deterministic scoring engine.

Key changes from v1:
1. Semantic skill matching via embeddings (optional, graceful fallback to lexical).
   Replaces static TRANSFERABLE_SKILLS dict â€” covers vocabulary mismatch automatically.
2. Evidence source tied to per-skill evidence items, not per-job impact presence.
   Fixes: "all skills at a job with one impact signal get work_history_outcome" inflation.
3. CriterionResult carries a full MatchSource trace for every criterion.
4. Hard rejection gate: â‰¥60% critical failure (not "all critical") for non-intern/junior roles.
5. Cross-validation: recompute total_years from work_history before scoring.
6. Human layer adjustment bounded and documented per change.
7. No hardcoded technology names (Java, Spring Boot DSA) in the adjustment layer â€”
   those are JD-specific, not universal blockers.
"""
from __future__ import annotations

import re
import math
from typing import Optional

from extraction_resume_JD_score_report.models import (
    MatchResult, MatchType, MatchSource, CriterionResult,
    EvidenceSource, CriterionPriority,
)

# -- Constants ------------------------------------------------------------------

RESULT_MULT: dict[str, float] = {
    "meets": 1.0,
    "partially_meets": 0.55,
    "unclear": 0.25,
    "does_not_meet": 0.0,
}

EVIDENCE_MULT: dict[str, float] = {
    "work_history_outcome": 1.0,
    "work_history": 0.85,
    "project": 0.65,
    "listed": 0.30,
    "inferred": 0.15,
    "none": 0.0,
}

# Semantic similarity thresholds
SIM_MEETS = 0.88        # effectively same skill
SIM_PARTIAL = 0.75      # adjacent / transferable
SIM_UNCLEAR = 0.62      # weak semantic overlap

ROLE_BAND_PROFILES: dict[str, dict] = {
    "intern":  {"direct": 1.00, "adjacent": 0.50, "impact": 1.00, "experience": 0.85, "domain": 0.90, "blocker": 1.05, "max_positive": 10, "max_negative": 15},
    "junior":  {"direct": 1.00, "adjacent": 0.55, "impact": 1.00, "experience": 0.90, "domain": 0.95, "blocker": 1.10, "max_positive": 10, "max_negative": 16},
    "mid":     {"direct": 1.05, "adjacent": 0.50, "impact": 1.05, "experience": 0.90, "domain": 1.00, "blocker": 1.15, "max_positive":  9, "max_negative": 18},
    "senior":  {"direct": 1.15, "adjacent": 0.35, "impact": 1.15, "experience": 0.80, "domain": 1.05, "blocker": 1.20, "max_positive":  8, "max_negative": 18},
    "lead":    {"direct": 1.20, "adjacent": 0.30, "impact": 1.20, "experience": 0.80, "domain": 1.10, "blocker": 1.25, "max_positive":  8, "max_negative": 20},
    "manager": {"direct": 1.20, "adjacent": 0.25, "impact": 1.20, "experience": 0.80, "domain": 1.10, "blocker": 1.25, "max_positive":  8, "max_negative": 20},
}

# -- Helpers --------------------------------------------------------------------

def _normalize(s: str) -> str:
    """Canonical skill key (same logic as v1 SkillManager)."""
    if not s:
        return ""
    s = s.lower().strip()
    s = re.sub(r"\.js$", "", s)
    s = re.sub(r"js$", "", s)
    s = re.sub(r"[.\-\_\s\/\(\)]", "", s)
    s = re.sub(r"\d+$", "", s)
    from extraction_resume_JD_score_report.config import SKILL_ALIASES
    return SKILL_ALIASES.get(s, s)

def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    mag = math.sqrt(sum(x**2 for x in a)) * math.sqrt(sum(x**2 for x in b))
    return dot / (mag + 1e-9)

def _as_dict(v) -> dict:
    if isinstance(v, dict):
        return v
    import json
    if isinstance(v, str):
        try:
            r = json.loads(v)
            return r if isinstance(r, dict) else {}
        except Exception:
            return {}
    return {}

def _seniority_rank(level: str) -> int:
    return {"intern": 0, "junior": 1, "mid": 2, "senior": 3, "lead": 4, "manager": 5}.get(level, 2)


# -- Semantic index -------------------------------------------------------------

class SemanticSkillIndex:
    """
    Embeds JD criteria and resume content for similarity-based matching.

    For skill criteria: matches against resume skill names.
    For responsibility/ownership/domain criteria: matches against evidence_item texts
    and responsibility sentences â€” catching vocabulary mismatches like
    "outreach systems" vs "outbound campaigns".

    Falls back gracefully if embedding fails.
    """

    def __init__(
        self,
        criteria: list[dict],
        resume_skill_names: list[str],
        evidence_texts: list[tuple[str, str, int]],  # [(text, source_label, ev_level), ...]
        client=None,
    ):
        self._criteria_vecs: dict[str, list[float]] = {}
        self._skill_vecs: dict[str, list[float]] = {}
        self._evidence_vecs: list[tuple[list[float], str, str, int]] = []  # (vec, text, label, ev_level)
        self._available = False
        self.embedding_usage: dict | None = None  # {"model", "inputTokens"} if the embeddings call ran

        if client is None:
            return

        skill_criteria = [c for c in criteria if c.get("category") == "skill"]
        other_criteria = [c for c in criteria if c.get("category") in ("responsibility", "ownership", "domain")]

        skill_criteria_names = list({c["name"] for c in skill_criteria})
        other_criteria_names = list({c["name"] for c in other_criteria})
        all_criteria_names = list(set(skill_criteria_names + other_criteria_names))
        ev_texts = list({t for t, _, _l in evidence_texts})

        all_texts = list(set(all_criteria_names + resume_skill_names + ev_texts))
        if not all_texts:
            return

        try:
            resp = client.embeddings.create(model="text-embedding-3-small", input=all_texts)
            vec_map = {text: resp.data[i].embedding for i, text in enumerate(all_texts)}

            for name in all_criteria_names:
                if name in vec_map:
                    self._criteria_vecs[name] = vec_map[name]
            for name in resume_skill_names:
                if name in vec_map:
                    self._skill_vecs[name] = vec_map[name]
            for text, label, ev_level in evidence_texts:
                if text in vec_map:
                    self._evidence_vecs.append((vec_map[text], text, label, ev_level))

            self._available = True
            # Embeddings usage has no completion_tokens -- prompt_tokens IS the
            # billable quantity for this call type.
            usage = getattr(resp, "usage", None)
            if usage is not None:
                self.embedding_usage = {
                    "model": "text-embedding-3-small",
                    "inputTokens": int(getattr(usage, "prompt_tokens", 0) or 0),
                }
        except Exception:
            self._available = False

    @property
    def available(self) -> bool:
        return self._available

    def best_skill_match(self, criterion_name: str) -> tuple[str, float]:
        """Match a skill criterion against resume skill names."""
        if not self._available:
            return "", 0.0
        cvec = self._criteria_vecs.get(criterion_name)
        if not cvec:
            return "", 0.0
        best_sim, best_name = 0.0, ""
        for rname, rvec in self._skill_vecs.items():
            sim = _cosine(cvec, rvec)
            if sim > best_sim:
                best_sim = sim
                best_name = rname
        return best_name, best_sim

    def best_evidence_match(self, criterion_name: str) -> tuple[str, float, str]:
        """
        Match criterion against evidence texts.
        Ranks by (evidence_level DESC, sim DESC) so a cert/listed item never
        beats real work_history evidence even at higher raw similarity.
        """
        if not self._available or not self._evidence_vecs:
            return "", 0.0, ""
        cvec = self._criteria_vecs.get(criterion_name)
        if not cvec:
            return "", 0.0, ""
        # Collect all matches above noise floor, then pick best by level then sim
        MIN_SIM = 0.40
        candidates: list[tuple[int, float, str, str]] = []  # (ev_level, sim, text, label)
        for evec, text, label, ev_level in self._evidence_vecs:
            sim = _cosine(cvec, evec)
            if sim >= MIN_SIM:
                candidates.append((ev_level, sim, text, label))
        if not candidates:
            return "", 0.0, ""
        # Sort: higher ev_level first, then higher sim
        candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
        best_level, best_sim, best_text, best_label = candidates[0]
        return best_text, best_sim, best_label

    # Keep old name for callers that use best_match
    def best_match(self, criterion_name: str) -> tuple[str, float]:
        return self.best_skill_match(criterion_name)


# -- Evidence pool builder ------------------------------------------------------

def _build_skill_evidence_map(resume_data: dict, resume_raw_text: str = "") -> tuple[dict[str, dict], dict[str, str], str]:
    """
    Build:
    - skill_evidence_map: norm_skill â†’ {source, evidence, confidence}
      Source is tied to evidence_items.has_metric + ownership, NOT job-level impact presence.
    - resume_normalized: norm_skill â†’ original name (for exact matching)
    - raw_text_corpus: lowercased blob for text-fallback matching
    """
    evidence_items = resume_data.get("evidence_items", []) or []
    work_history = resume_data.get("work_history", [])
    resume_skills = resume_data.get("skills", {})
    projects = resume_data.get("projects", [])

    # Skills that appear in evidence_items with has_metric=True AND owner ownership
    level5_skills: set[str] = set()
    level4_skills: set[str] = set()
    level3_skills: set[str] = set()

    for ev in evidence_items:
        ev_level = ev.get("evidence_level", 1)
        for p in ev.get("proves", []):
            nk = _normalize(p)
            if not nk:
                continue
            if ev_level >= 5:
                level5_skills.add(nk)
            elif ev_level >= 4:
                level4_skills.add(nk)
            elif ev_level >= 3:
                level3_skills.add(nk)

    PRIORITY = {"work_history_outcome": 5, "work_history": 4, "project": 3, "listed": 2, "inferred": 1}

    skill_evidence_map: dict[str, dict] = {}

    def _add(name: str, evidence: str, confidence: str, source: str, company: str = ""):
        nk = _normalize(name)
        if not nk:
            return nk
        # Upgrade source based on evidence_item quality
        if nk in level5_skills:
            source = "work_history_outcome"
        elif nk in level4_skills and source in ("work_history", "work_history_outcome"):
            source = "work_history_outcome"
        elif nk in level3_skills and source == "listed":
            source = "work_history"
        existing = skill_evidence_map.get(nk)
        if not existing or PRIORITY.get(source, 0) > PRIORITY.get(existing.get("source", ""), 0):
            skill_evidence_map[nk] = {"evidence": evidence, "confidence": confidence,
                                       "source": source, "company": company}
        return nk

    all_names: list[str] = []

    # From structured skills section
    for s in (resume_skills.get("technical", []) or []):
        if isinstance(s, dict) and s.get("skill"):
            src = s.get("source_strength", "listed")
            _add(s["skill"], s.get("evidence", ""), "high", src)
            all_names.append(s["skill"])
        elif isinstance(s, str) and s:
            _add(s, "", "high", "listed")
            all_names.append(s)

    for s in (resume_skills.get("tools", []) or []):
        if isinstance(s, dict) and s.get("tool"):
            conf = s.get("confidence", "medium")
            if conf == "low":
                continue
            src = s.get("source_strength", "listed")
            _add(s["tool"], s.get("evidence", ""), conf, src)
            all_names.append(s["tool"])
        elif isinstance(s, str) and s:
            _add(s, "", "medium", "listed")
            all_names.append(s)

    # From work history technologies
    for job in work_history:
        company = job.get("company", "")
        # Source for work-history skills: use work_history by default;
        # evidence_item quality will upgrade specific skills above.
        for tech in (job.get("technologies_used", []) or []):
            if tech and isinstance(tech, str):
                _add(tech, company, "high", "work_history", company)
                all_names.append(tech)

    # From projects -- owner-built projects with real depth count as work_history level
    for proj in projects:
        proj_name = proj.get("name", "project")
        is_owner = proj.get("ownership_level", "") == "owner"
        # A project with owner-level ownership scores as work_history (not just "project")
        # This is critical for freshers/students whose projects ARE their primary evidence.
        proj_source = "work_history" if is_owner else "project"
        for tech in (proj.get("technologies", []) or []):
            if tech and isinstance(tech, str):
                _add(tech, proj_name, "medium", proj_source)
                all_names.append(tech)

    # From keywords
    for kw in (resume_data.get("keywords", []) or []):
        if kw:
            _add(kw, "", "medium", "listed")
            all_names.append(kw)

    # Also add domain skills
    for ds in (resume_skills.get("domain_skills", []) or []):
        if ds:
            all_names.append(ds)

    resume_normalized: dict[str, str] = {}
    for name in all_names:
        nk = _normalize(str(name))
        if nk and nk not in resume_normalized:
            resume_normalized[nk] = name

    # Build raw corpus for text-fallback matching
    career_timeline = resume_data.get("career_timeline", {})
    career_prog = _as_dict(resume_data.get("career_progression", {}))
    raw_corpus = " ".join(filter(None, [
        resume_data.get("candidate_summary", ""),
        career_timeline.get("progression_pattern", ""),
        career_prog.get("analysis", ""),
        " ".join(resume_data.get("keywords", []) or []),
        " ".join(
            " ".join(str(t) for t in (job.get("technologies_used", []) or []))
            for job in work_history
        ),
        # Include responsibilities/bullet_points -- critical for responsibility-category criteria
        " ".join(
            " ".join(str(r) for r in (job.get("responsibilities", []) or job.get("bullet_points", [])))
            for job in work_history
        ),
        " ".join(
            " ".join(str(s) for s in (job.get("impact_signals", []) or []))
            for job in work_history
        ),
        " ".join(job.get("business_domain", "") for job in work_history if job.get("business_domain")),
        " ".join(resume_skills.get("domain_skills", []) or []),
        " ".join(c.get("claim", "") for c in (resume_data.get("core_claims", []) or [])),
        " ".join(ev.get("text", "") for ev in (resume_data.get("evidence_items", []) or [])),
        # Include project descriptions and technologies -- critical for scoring
        " ".join(proj.get("description", "") for proj in (resume_data.get("projects", []) or [])),
        " ".join(
            " ".join(str(t) for t in (proj.get("technologies", []) or []))
            for proj in (resume_data.get("projects", []) or [])
        ),
        resume_raw_text[:3000],  # catch skills buried in prose (Zapier, Chroma, Git, etc.)
    ])).lower()

    return skill_evidence_map, resume_normalized, raw_corpus


# -- Cross-validation -----------------------------------------------------------

def _cross_validate_experience(resume_data: dict) -> dict:
    """
    Recompute total_years from work_history duration_months.
    If LLM-extracted total_years deviates by > 1.5 years, override with computed value.
    Returns mutated resume_data (shallow copy of experience dict).
    """
    work_history = resume_data.get("work_history", [])
    if not work_history:
        return resume_data

    # Naive sum -- overlaps are handled by taking max of concurrent roles
    # Simple approach: sort by start_date, subtract overlaps
    total_months = sum(
        (j.get("duration_months") or 0)
        for j in work_history
        if isinstance(j.get("duration_months"), (int, float))
    )

    if total_months <= 0:
        return resume_data

    computed_years = round(total_months / 12, 1)
    exp = dict(resume_data.get("experience", {}))
    extracted_years = exp.get("total_years")

    if extracted_years is not None:
        if abs(extracted_years - computed_years) > 1.5:
            exp["total_years"] = computed_years
            exp["_years_corrected"] = True
            resume_data = dict(resume_data)
            resume_data["experience"] = exp
    else:
        exp["total_years"] = computed_years
        resume_data = dict(resume_data)
        resume_data["experience"] = exp

    return resume_data


# -- JD weight computation -----------------------------------------------------

def _compute_criterion_weights(criteria: list[dict]) -> list[dict]:
    """
    Assign weights from priority + priority_rank (instead of LLM-computed math).
    Ensures weights sum to 100 using largest-remainder method.

    Weight bands (points per rank position):
      critical rank 1 â†’ 25, rank 2 â†’ 22, rank 3 â†’ 19, rank 4 â†’ 16, rank 5 â†’ 13
      high     rank 1 â†’ 14, rank 2 â†’ 12, rank 3 â†’ 10, rank 4 â†’ 9,  rank 5 â†’ 8, rank 6 â†’ 7, rank 7 â†’ 6
      medium   rank 1 â†’ 8,  rank 2 â†’ 7,  rank 3 â†’ 6,  rank 4 â†’ 5,  rank 5 â†’ 4
    """
    WEIGHT_BANDS: dict[str, list[int]] = {
        "critical": [25, 22, 19, 16, 13, 11, 9],
        "high":     [14, 12, 10, 9, 8, 7, 6, 5, 4],
        "medium":   [8, 7, 6, 5, 4, 3, 3, 2],
    }

    # Group by priority, sort by priority_rank within each group
    by_priority: dict[str, list[dict]] = {"critical": [], "high": [], "medium": []}
    unranked: list[dict] = []
    for c in criteria:
        p = c.get("priority", "high")
        if p in by_priority:
            by_priority[p].append(c)
        else:
            unranked.append(c)

    assigned: list[tuple[dict, float]] = []
    for priority, band in WEIGHT_BANDS.items():
        group = sorted(by_priority.get(priority, []), key=lambda x: x.get("priority_rank", 99))
        for i, criterion in enumerate(group):
            raw_weight = band[min(i, len(band) - 1)]
            assigned.append((criterion, float(raw_weight)))

    for c in unranked:
        assigned.append((c, 8.0))

    # Largest-remainder normalization to sum=100
    if not assigned:
        return criteria

    total_raw = sum(w for _, w in assigned)
    scale = 100.0 / total_raw
    scaled_floats = [w * scale for _, w in assigned]
    scaled_ints = [max(1, int(f)) for f in scaled_floats]
    diff = 100 - sum(scaled_ints)
    order = sorted(range(len(scaled_ints)),
                   key=lambda i: (scaled_floats[i] - int(scaled_floats[i]), assigned[i][1]),
                   reverse=True)
    for idx in order:
        if diff == 0:
            break
        if diff > 0:
            scaled_ints[idx] += 1
            diff -= 1
        elif scaled_ints[idx] > 1:
            scaled_ints[idx] -= 1
            diff += 1

    result = []
    for (criterion, _), weight in zip(assigned, scaled_ints):
        c = dict(criterion)
        c["weight"] = weight
        result.append(c)
    return result


# -- Core criterion matching ----------------------------------------------------

def _match_criterion(
    criterion: dict,
    evidence_items: list[dict],
    skill_evidence_map: dict,
    resume_normalized: dict,
    raw_corpus: str,
    semantic_index: SemanticSkillIndex,
    resume_data: dict,
) -> CriterionResult:
    """
    Match one JD criterion against the resume. Returns a CriterionResult with
    full MatchSource trace.

    Matching priority (highest first):
    1. Evidence items (explicit LLM-extracted, tagged by criterion name)
    2. Exact normalized skill match
    3. Semantic embedding match (if index available)
    4. Raw text match (for responsibility/domain categories)
    """
    cname = criterion.get("name", "")
    ccategory = criterion.get("category", "skill")
    cpriority = criterion.get("priority", "high")
    cweight = max(criterion.get("weight", 10), 1)
    cev_required = criterion.get("evidence_required", "any")
    norm_cname = _normalize(cname)

    result = MatchResult.does_not_meet
    ev_type = EvidenceSource.inferred
    confidence = 0.0
    match_source = MatchSource(match_type=MatchType.none)

    # -- Handle experience-category criteria ----------------------------------
    if ccategory == "experience":
        cand_yrs = resume_data.get("experience", {}).get("total_years")
        req_min = req_max = None
        for pat, groups in [
            (re.search(r"(\d+)\s*(?:-|to|â€“|â€”)\s*(\d+)\s*years?", cname, re.I), (1, 2)),
            (re.search(r"(\d+)\s*\+\s*years?", cname, re.I), (1, None)),
            (re.search(r"(\d+)\s*years?", cname, re.I), (1, None)),
        ]:
            if pat:
                req_min = int(pat.group(groups[0]))
                if groups[1]:
                    req_max = int(pat.group(groups[1]))
                break

        if cand_yrs is not None and req_min is not None:
            gap = cand_yrs - req_min
            if req_max is not None and cand_yrs > req_max + 2:
                result, ev_type, confidence = MatchResult.unclear, EvidenceSource.work_history, 0.65
            elif gap >= 0:
                result, ev_type, confidence = MatchResult.meets, EvidenceSource.work_history, 0.90
            elif gap >= -1:
                result, ev_type, confidence = MatchResult.partially_meets, EvidenceSource.work_history, 0.70
            elif gap >= -2:
                result, ev_type, confidence = MatchResult.unclear, EvidenceSource.listed, 0.40
            else:
                result, ev_type, confidence = MatchResult.does_not_meet, EvidenceSource.inferred, 0.0
        elif cand_yrs is not None:
            result, ev_type, confidence = MatchResult.unclear, EvidenceSource.work_history, 0.45

        # Stack-gated experience: "3+ years JAVA backend" must not pass on years alone
        # if the named technology is absent from the resume's proven skills.
        # Extract skill-like tokens from the criterion name and require at least one
        # to be present; otherwise the years are in the wrong stack -- cap at unclear.
        if result == MatchResult.meets:
            stack_tokens = set()
            for raw_word in re.split(r"[\s,/\-]+", cname):
                nk = _normalize(raw_word)
                # Only count tokens that are real skills (in resume or a known alias target)
                from extraction_resume_JD_score_report.config import SKILL_ALIASES
                if nk and len(nk) >= 2 and (nk in SKILL_ALIASES.values() or nk in {"java", "python", "node", "react", "spring", "django", "dotnet", "php", "ruby", "golang", "rust", "scala", "kotlin"}):
                    stack_tokens.add(nk)
            if stack_tokens:
                proven = any(tok in resume_normalized for tok in stack_tokens)
                if not proven:
                    # Years exist but in a different stack than the JD names
                    result, ev_type, confidence = MatchResult.does_not_meet, EvidenceSource.inferred, 0.0

        match_source = MatchSource(match_type=MatchType.exact, ev_source=ev_type)
        contribution = cweight * RESULT_MULT.get(result.value, 0) * EVIDENCE_MULT.get(ev_type.value, 0.15)
        return CriterionResult(
            criterion=cname, category=ccategory, priority=CriterionPriority(cpriority),
            weight=cweight, result=result, confidence=round(confidence, 2),
            match_source=match_source, score_contribution=round(contribution, 2),
        )

    # -- Pass 1: evidence_items (LLM-tagged) ----------------------------------
    best_ev_level = 0
    matched_ev_text = ""
    matched_ev_company = ""
    matched_ev_id = ""

    for ev in evidence_items:
        proves_norms = [_normalize(p) for p in ev.get("proves", [])]
        ev_text_lower = ev.get("text", "").lower()
        ev_level = ev.get("evidence_level", 1)
        ev_ownership = ev.get("ownership", "unclear")

        # Match if criterion name appears in proves (by norm key OR by exact string)
        # or if the criterion name appears in the evidence text
        criterion_in_proves = (
            norm_cname in proves_norms
            or cname.lower() in proves_norms
            or any(cname.lower() == _normalize(p) for p in ev.get("proves", []))
        )
        criterion_in_text = norm_cname in ev_text_lower or cname.lower() in ev_text_lower

        if criterion_in_proves or criterion_in_text:
            if ev_level > best_ev_level:
                best_ev_level = ev_level
                matched_ev_text = ev.get("text", "")
                matched_ev_company = ev.get("source_company", "")
                matched_ev_id = ev.get("id", "")
                conf_raw = ev.get("confidence", 0.7)
                confidence = float(conf_raw) if isinstance(conf_raw, (int, float)) else \
                    {"high": 1.0, "medium": 0.7, "low": 0.4}.get(str(conf_raw).lower(), 0.7)

                if ev_level >= 5:
                    result, ev_type = MatchResult.meets, EvidenceSource.work_history_outcome
                elif ev_level >= 4 and ev_ownership == "owner":
                    result, ev_type = MatchResult.meets, EvidenceSource.work_history_outcome
                elif ev_level >= 3:
                    result, ev_type = MatchResult.meets, EvidenceSource.work_history
                elif ev_level == 2:
                    result, ev_type = MatchResult.partially_meets, EvidenceSource.project
                else:
                    result, ev_type = MatchResult.unclear, EvidenceSource.listed

    if result != MatchResult.does_not_meet:
        match_source = MatchSource(
            match_type=MatchType.exact,
            matched_skill=cname,
            evidence_item_id=matched_ev_id,
            evidence_text=matched_ev_text,
            source_company=matched_ev_company,
            ev_source=ev_type,
        )

    # -- Pass 1b: responsibility satisfied by its constituent skill in evidence --
    # A criterion like "Design, develop, test, and maintain Java-based applications"
    # is satisfied when its named technology (Java) is proven in high-level evidence,
    # even if the full criterion string was never tagged in proves[]. This is the
    # deterministic bridge that makes responsibility criteria match real work without
    # requiring the resume to have been extracted with JD-awareness.
    if result == MatchResult.does_not_meet and ccategory in ("responsibility", "ownership", "domain"):
        # Pull skill-like tokens from the criterion (normalized words that map to a known skill)
        # Tokens from criterion name that exist in resume's proven skills
        criterion_skill_tokens = set()
        for raw_word in re.split(r"[\s,/\-]+", cname):
            nk = _normalize(raw_word)
            if nk and len(nk) >= 2 and nk in resume_normalized:
                criterion_skill_tokens.add(nk)

        # Keywords from criterion for project description matching
        crit_keywords = {_normalize(w) for w in re.split(r"[\s,/\-]+", cname) if len(w) > 3}

        best_ev_level_1b = 0
        matched_text_1b = ""
        matched_company_1b = ""
        matched_id_1b = ""

        # Check evidence_items (needs skill token overlap)
        if criterion_skill_tokens:
            for ev in evidence_items:
                proves_norms = {_normalize(p) for p in ev.get("proves", [])}
                if criterion_skill_tokens & proves_norms:
                    lvl = ev.get("evidence_level", 1)
                    if lvl > best_ev_level_1b:
                        best_ev_level_1b = lvl
                        matched_text_1b = ev.get("text", "")
                        matched_company_1b = ev.get("source_company", "")
                        matched_id_1b = ev.get("id", "")

        # Check project descriptions unconditionally -- covers "Build RAG systems"
        # matching a project that built a RAG pipeline, even when criterion tokens
        # don't map to resume_normalized (common for domain-description criteria)
        for proj in (resume_data.get("projects", []) or []):
            proj_desc = (proj.get("description", "") or "").lower()
            proj_techs = {_normalize(t) for t in (proj.get("technologies", []) or [])}
            proj_all = proj_desc + " " + " ".join(proj_techs)
            tech_overlap = criterion_skill_tokens & proj_techs
            domain_hit = any(kw in proj_all for kw in crit_keywords if len(kw) >= 4)
            if tech_overlap or domain_hit:
                is_owner = proj.get("ownership_level", "") == "owner"
                lvl = 3 if is_owner else 2
                if lvl > best_ev_level_1b:
                    best_ev_level_1b = lvl
                    matched_text_1b = proj.get("description", "")[:120]
                    matched_company_1b = proj.get("name", "project")
                    matched_id_1b = f"proj-{proj.get('id', '')}"

        if best_ev_level_1b >= 4:
            result, ev_type = MatchResult.meets, EvidenceSource.work_history
            confidence = 0.80
        elif best_ev_level_1b >= 3:
            result, ev_type = MatchResult.partially_meets, EvidenceSource.work_history
            confidence = 0.65
        if result != MatchResult.does_not_meet:
            match_source = MatchSource(
                match_type=MatchType.exact,
                matched_skill=matched_company_1b or ", ".join(sorted(criterion_skill_tokens)),
                evidence_item_id=matched_id_1b,
                evidence_text=matched_text_1b,
                source_company=matched_company_1b,
                ev_source=ev_type,
            )

    # -- Pass 2: exact normalized skill match ---------------------------------
    if result == MatchResult.does_not_meet and ccategory == "skill":
        if norm_cname in resume_normalized:
            ev_info = skill_evidence_map.get(norm_cname, {})
            src = ev_info.get("source", "listed")
            ev_src = EvidenceSource(src) if src in EvidenceSource.__members__.values() else EvidenceSource.listed
            ev_text_for_match = ev_info.get("evidence", "")
            ev_company = ev_info.get("company", "")
            conf_raw = ev_info.get("confidence", "medium")
            confidence = {"high": 1.0, "medium": 0.7, "low": 0.4}.get(str(conf_raw).lower(), 0.7)

            if src == "work_history_outcome":
                result, ev_type = MatchResult.meets, EvidenceSource.work_history_outcome
            elif src == "work_history":
                result, ev_type = MatchResult.meets, EvidenceSource.work_history
            elif src == "project":
                result, ev_type = MatchResult.partially_meets, EvidenceSource.project
            else:
                result, ev_type = MatchResult.partially_meets, EvidenceSource.listed
                confidence = 0.4

            match_source = MatchSource(
                match_type=MatchType.exact,
                matched_skill=resume_normalized[norm_cname],
                evidence_text=ev_text_for_match,
                source_company=ev_company,
                ev_source=ev_type,
            )

    # -- Pass 2b: compound skill criterion ("React.js and Next.js", "Flask and FastAPI") --
    # JD criteria often bundle multiple skills into one name. Split and check each token.
    if result == MatchResult.does_not_meet and ccategory == "skill":
        # Split on commas, "and", "&", slashes
        tokens = re.split(r"[,&/]|\band\b", cname, flags=re.IGNORECASE)
        _SRC_RANK = {"work_history_outcome": 5, "work_history": 4, "project": 3, "listed": 2, "inferred": 1}
        best_src = "listed"
        best_token = ""
        best_company = ""
        for token in tokens:
            ntok = _normalize(token.strip())
            if not ntok or len(ntok) < 2:
                continue
            if ntok in resume_normalized:
                ev_info = skill_evidence_map.get(ntok, {})
                src = ev_info.get("source", "listed")
                if _SRC_RANK.get(src, 0) > _SRC_RANK.get(best_src, 0):
                    best_src = src
                    best_token = resume_normalized[ntok]
                    best_company = ev_info.get("company", "")
        if best_token:
            ev_src = EvidenceSource(best_src) if best_src in EvidenceSource.__members__.values() else EvidenceSource.listed
            if best_src in ("work_history_outcome", "work_history"):
                result, ev_type = MatchResult.meets, ev_src
            else:
                result, ev_type = MatchResult.partially_meets, EvidenceSource.listed
            confidence = 0.80
            match_source = MatchSource(
                match_type=MatchType.exact,
                matched_skill=best_token,
                source_company=best_company,
                ev_source=ev_type,
            )

    # -- Pass 3: semantic embedding match -------------------------------------
    if result == MatchResult.does_not_meet and semantic_index.available and ccategory == "skill":
        best_resume_skill, sim = semantic_index.best_match(cname)
        if sim >= SIM_MEETS:
            norm_best = _normalize(best_resume_skill)
            ev_info = skill_evidence_map.get(norm_best, {})
            src = ev_info.get("source", "listed")
            ev_src = EvidenceSource(src) if src in EvidenceSource.__members__.values() else EvidenceSource.listed
            if src in ("work_history_outcome", "work_history"):
                result, ev_type = MatchResult.meets, ev_src
            else:
                result, ev_type = MatchResult.partially_meets, EvidenceSource.listed
            confidence = sim * 0.9  # slight discount for semantic vs exact
            match_source = MatchSource(
                match_type=MatchType.semantic,
                matched_skill=best_resume_skill,
                semantic_similarity=round(sim, 3),
                ev_source=ev_type,
            )
        elif sim >= SIM_PARTIAL:
            result, ev_type = MatchResult.partially_meets, EvidenceSource.listed
            confidence = sim * 0.8
            match_source = MatchSource(
                match_type=MatchType.semantic,
                matched_skill=best_resume_skill,
                semantic_similarity=round(sim, 3),
                ev_source=EvidenceSource.listed,
            )
        elif sim >= SIM_UNCLEAR:
            result, ev_type = MatchResult.unclear, EvidenceSource.inferred
            confidence = sim * 0.6
            match_source = MatchSource(
                match_type=MatchType.semantic,
                matched_skill=best_resume_skill,
                semantic_similarity=round(sim, 3),
                ev_source=EvidenceSource.inferred,
            )

    # -- Pass 3b: semantic skill match for responsibility criteria ------------
    # Some responsibility criteria name a skill concept ("assist in creating GTM strategies")
    # that maps cleanly to a domain_skill ("gtm strategy"). Try the skill match path first.
    if result == MatchResult.does_not_meet and ccategory in ("responsibility", "ownership", "domain") and semantic_index.available:
        best_skill, sim_s = semantic_index.best_skill_match(cname)
        if sim_s >= SIM_PARTIAL:
            norm_best = _normalize(best_skill)
            ev_info = skill_evidence_map.get(norm_best, {})
            src = ev_info.get("source", "listed")
            ev_src = EvidenceSource(src) if src in EvidenceSource.__members__.values() else EvidenceSource.listed
            if src in ("work_history_outcome", "work_history"):
                result, ev_type = MatchResult.meets, ev_src
            else:
                result, ev_type = MatchResult.partially_meets, EvidenceSource.listed
            confidence = sim_s * 0.8
            match_source = MatchSource(
                match_type=MatchType.semantic, matched_skill=best_skill,
                semantic_similarity=round(sim_s, 3), ev_source=ev_type,
            )

    # -- Pass 3c: semantic evidence match (responsibility/ownership/domain) ---
    # Matches criterion against responsibility sentences and evidence_item texts.
    # Catches vocabulary mismatches like "outreach systems" vs "outbound campaigns".
    # Lower thresholds than skill matching because sentence-level similarity is noisier.
    EV_SIM_MEETS   = 0.70  # very close paraphrase
    EV_SIM_PARTIAL = 0.55  # clearly related topic
    EV_SIM_UNCLEAR = 0.45  # weak but non-zero overlap
    if result == MatchResult.does_not_meet and ccategory in ("responsibility", "ownership", "domain") and semantic_index.available:
        ev_text, sim, ev_company = semantic_index.best_evidence_match(cname)
        if sim >= EV_SIM_MEETS:
            result, ev_type = MatchResult.meets, EvidenceSource.work_history
            confidence = sim * 0.80
            match_source = MatchSource(
                match_type=MatchType.semantic, matched_skill=ev_text[:80],
                semantic_similarity=round(sim, 3), source_company=ev_company,
                ev_source=EvidenceSource.work_history,
            )
        elif sim >= EV_SIM_PARTIAL:
            result, ev_type = MatchResult.partially_meets, EvidenceSource.work_history
            confidence = sim * 0.65
            match_source = MatchSource(
                match_type=MatchType.semantic, matched_skill=ev_text[:80],
                semantic_similarity=round(sim, 3), source_company=ev_company,
                ev_source=EvidenceSource.work_history,
            )
        elif sim >= EV_SIM_UNCLEAR:
            result, ev_type = MatchResult.unclear, EvidenceSource.inferred
            confidence = sim * 0.45
            match_source = MatchSource(
                match_type=MatchType.semantic, matched_skill=ev_text[:80],
                semantic_similarity=round(sim, 3), ev_source=EvidenceSource.inferred,
            )

    # -- Pass 4a: raw text exact for skills (catches Zapier/Chroma/Git in prose) -
    if result == MatchResult.does_not_meet and ccategory == "skill":
        norm_in_corpus = _normalize(cname)
        if norm_in_corpus and len(norm_in_corpus) >= 3 and norm_in_corpus in raw_corpus:
            result, ev_type = MatchResult.unclear, EvidenceSource.inferred
            confidence = 0.25
            match_source = MatchSource(match_type=MatchType.text, ev_source=EvidenceSource.inferred)

    # -- Pass 4b: raw text (responsibility/ownership/domain only) --------------
    if result == MatchResult.does_not_meet and ccategory in ("responsibility", "ownership", "domain"):
        words = [w for w in cname.lower().split() if len(w) > 3]
        if words:
            hits = sum(1 for w in words if w in raw_corpus)
            ratio = hits / len(words)
            if ratio >= 0.5:  # 0.5 so 2/4 content words pass
                result, ev_type = MatchResult.unclear, EvidenceSource.inferred
                confidence = 0.20
                match_source = MatchSource(match_type=MatchType.text, ev_source=EvidenceSource.inferred)

    # -- Apply evidence_required constraint ------------------------------------
    if cev_required == "work_history" and ev_type not in (
        EvidenceSource.work_history, EvidenceSource.work_history_outcome
    ):
        if result == MatchResult.meets:
            result = MatchResult.partially_meets
            confidence *= 0.6

    contribution = cweight * RESULT_MULT.get(result.value, 0) * EVIDENCE_MULT.get(ev_type.value, 0.15)
    return CriterionResult(
        criterion=cname, category=ccategory, priority=CriterionPriority(cpriority),
        weight=cweight, result=result, confidence=round(confidence, 2),
        match_source=match_source, score_contribution=round(contribution, 2),
    )


# -- Human-layer adjustment -----------------------------------------------------

def _human_layer(
    jd_data: dict,
    resume_data: dict,
    base_score: int,
    criteria_results: list[CriterionResult],
    candidate_years: Optional[float],
    jd_min_years: Optional[float],
) -> dict:
    """
    Role-band-aware second-pass adjustment. Bounded to not flip a clear decision.
    No hardcoded technology names â€” those are JD-specific, not universal.
    """
    jd_role_key = str(jd_data.get("role_level") or "mid").lower().strip()
    band = jd_role_key if jd_role_key in ROLE_BAND_PROFILES else "mid"
    profile = ROLE_BAND_PROFILES[band]
    jd_keywords = {_normalize(k) for k in (jd_data.get("keywords", []) or []) if k}

    adjustment = 0
    reasons: list[dict] = []
    risk_flags: list[str] = []
    strong_evidence: list[dict] = []
    work_history = resume_data.get("work_history", [])

    def add(delta: int, reason: str, evidence: str | None = None):
        nonlocal adjustment
        if delta == 0:
            return
        adjustment += delta
        entry: dict = {"delta": delta, "reason": reason}
        if evidence:
            entry["evidence"] = evidence
            if delta > 0:
                strong_evidence.append({"reason": reason, "evidence": evidence, "delta": delta})
        reasons.append(entry)

    # 1. Direct must-have criteria
    strong_direct = [r for r in criteria_results
                     if r.result == MatchResult.meets
                     and r.priority != CriterionPriority.medium
                     and r.match_source.ev_source in (EvidenceSource.work_history, EvidenceSource.work_history_outcome)]
    weak_direct = [r for r in criteria_results
                   if r.result == MatchResult.meets
                   and r.priority != CriterionPriority.medium
                   and r.match_source.ev_source in (EvidenceSource.project, EvidenceSource.listed)]

    # Core skill alignment
    skill_criteria = [r for r in criteria_results if r.category == "skill" and r.priority != CriterionPriority.medium]
    skill_hits = [r for r in skill_criteria if r.result in (MatchResult.meets, MatchResult.partially_meets)]
    skill_ratio = len(skill_hits) / len(skill_criteria) if skill_criteria else 1.0

    tech_clear = skill_ratio >= 0.80
    tech_partial = skill_ratio >= 0.50

    if strong_direct and tech_partial:
        cap = 4 if tech_clear else 2
        delta = int(round(min(cap, len(strong_direct) * 2) * profile["direct"]))
        add(delta, f"Strong must-have evidence in work history ({band} fit)",
            ", ".join(r.criterion for r in strong_direct[:4]))
    elif strong_direct:
        risk_flags.append("Must-have evidence exists but tech stack alignment is weak")
        add(-3 if band in ("senior", "lead", "manager") else -2,
            "Direct proof present but tech stack partially misaligned")

    if weak_direct and tech_partial:
        add(int(round(min(3, len(weak_direct)) * 0.8)),
            "Some criteria supported by project/listed evidence",
            ", ".join(r.criterion for r in weak_direct[:3]))

    # 2. Technology alignment
    if skill_criteria:
        if tech_clear:
            add(int(round(4 * profile["direct"])),
                f"Strong tech alignment ({len(skill_hits)}/{len(skill_criteria)} skill criteria met)",
                ", ".join(r.criterion for r in skill_hits[:5]))
        elif tech_partial:
            add(int(round(2 * profile["direct"])),
                f"Partial tech alignment ({len(skill_hits)}/{len(skill_criteria)} skill criteria met)")
        elif len(skill_hits) == 1:
            risk_flags.append("Only one core skill criterion matched")
            add(-3 if band in ("senior", "lead", "manager") else -2,
                "Only one core skill criterion evidenced")
        else:
            risk_flags.append("No core skill alignment")
            add(-7 if band in ("senior", "lead", "manager") else -6,
                "Resume does not align with JD technology stack")

    # 3. Impact and ownership signals
    impact_count = sum(len(job.get("impact_signals", []) or []) for job in work_history)
    owner_count = sum(1 for job in work_history if job.get("ownership_level") == "owner")

    if tech_partial:
        if impact_count >= 4 and tech_clear:
            add(int(round(3 * profile["impact"])), f"Multiple measurable outcomes ({impact_count} impact signals)")
        elif impact_count >= 2 and tech_clear:
            add(int(round(2 * profile["impact"])), f"{impact_count} quantified impact signals")
        elif impact_count >= 1 and tech_clear:
            add(int(round(1 * profile["impact"])), "At least one measurable outcome")

        if owner_count >= 2 and tech_clear:
            add(int(round(2 * profile["impact"])), f"{owner_count} owner-level roles")
        elif owner_count == 1 and tech_clear:
            add(int(round(1 * profile["impact"])), "One owner-level role adds credibility")

    # 4. Experience gap
    if jd_min_years is not None and candidate_years is not None and tech_partial:
        if candidate_years >= jd_min_years:
            add(int(round(3 * profile["experience"])), f"Meets experience floor ({candidate_years}yr â‰¥ {jd_min_years}yr)")
        elif candidate_years + 1 >= jd_min_years:
            gap_delta = 2 if band in ("intern", "junior") else 1 if band == "mid" else 0
            if gap_delta:
                add(int(round(gap_delta * profile["experience"])),
                    f"Small experience gap acceptable for {band} role ({candidate_years}yr vs {jd_min_years}yr)")

    # 5. Domain keyword overlap
    domain_skills = resume_data.get("skills", {}).get("domain_skills", []) or []
    jd_kw_hits = sum(1 for s in domain_skills if s and _normalize(s) in jd_keywords)
    if jd_kw_hits >= 3 and tech_partial:
        add(int(round(3 * profile["domain"])), f"{jd_kw_hits} domain skills align with JD keywords")
    elif jd_kw_hits >= 1 and tech_clear:
        add(int(round(1 * profile["domain"])), f"{jd_kw_hits} domain skill overlap")

    # 6. Penalty: table-stakes criteria completely missing
    table_stakes_missing = [r for r in criteria_results
                            if r.result == MatchResult.does_not_meet
                            and r.priority == CriterionPriority.critical]
    for ts in table_stakes_missing[:2]:  # cap at 2 penalties
        risk_flags.append(f"Critical criterion '{ts.criterion}' not evidenced")
        add(int(round(-4 * profile["blocker"])),
            f"Critical criterion '{ts.criterion}' is completely absent")

    # Clamp
    adjustment = max(-profile["max_negative"], min(profile["max_positive"], adjustment))
    human_score = max(0, min(100, base_score + adjustment))

    # Confidence
    confidence = 55
    if strong_direct:
        confidence += 15
    if impact_count >= 2:
        confidence += 10
    if tech_clear:
        confidence += 10
    elif tech_partial:
        confidence += 5
    if not risk_flags:
        confidence += 5
    confidence = max(35, min(95, confidence))

    judgment = "Shortlisted" if human_score >= 75 else "Borderline" if human_score >= 60 else "Rejected"

    summary_parts = [
        f"Role band: {band}",
        f"Skill criteria: {len(skill_hits)}/{len(skill_criteria)} met",
        f"Strong direct evidence: {len(strong_direct)} criteria",
        f"Impact signals: {impact_count}",
        f"Owner-level roles: {owner_count}",
    ]
    if risk_flags:
        summary_parts.append("Risks: " + "; ".join(risk_flags))

    return {
        "base_score": base_score,
        "human_adjustment": adjustment,
        "human_score": human_score,
        "confidence": confidence,
        "judgment": judgment,
        "strong_evidence": strong_evidence,
        "reasons": reasons,
        "risk_flags": risk_flags,
        "summary": " | ".join(summary_parts),
    }


# -- Main scoring function -----------------------------------------------------

def compute_score(
    jd_data: dict,
    resume_data: dict,
    threshold: int = 70,
    screening_criteria: dict | None = None,
    resume_raw_text: str = "",
    openai_client=None,
) -> dict:
    """
    Deterministic scoring engine v2.

    Score breakdown (100 pts):
      Criteria match (critical/high) : 50 pts
      Experience + Seniority         : 15 pts
      Good-to-have criteria (medium) : 10 pts
      Career quality                 : 15 pts
      Domain fit                     : 10 pts
    """
    if screening_criteria is None:
        screening_criteria = {}

    # -- 0. Cross-validate experience -----------------------------------------
    resume_data = _cross_validate_experience(resume_data)

    # -- 1. Compute JD criterion weights from rank -----------------------------
    raw_criteria = list(jd_data.get("criteria", []) or [])

    # Merge HR custom skills
    hr_criteria_skills = screening_criteria.get("skills", {})
    if hr_criteria_skills:
        existing = {str(c.get("name", "")).lower() for c in raw_criteria}
        for s in (hr_criteria_skills.get("mustHave") or hr_criteria_skills.get("required", [])):
            name = (s.get("name", s) if isinstance(s, dict) else s).strip()
            if name and name.lower() not in existing:
                raw_criteria.append({"id": f"hr_must_{name}", "category": "skill", "name": name,
                                     "priority": "high", "priority_rank": 99, "evidence_required": "any",
                                     "source_text": f"HR required: {name}"})
                existing.add(name.lower())
        for s in (hr_criteria_skills.get("optional") or hr_criteria_skills.get("niceToHave", [])):
            name = (s.get("name", s) if isinstance(s, dict) else s).strip()
            if name and name.lower() not in existing:
                raw_criteria.append({"id": f"hr_opt_{name}", "category": "skill", "name": name,
                                     "priority": "medium", "priority_rank": 99, "evidence_required": "any",
                                     "source_text": f"HR optional: {name}"})
                existing.add(name.lower())

    jd_criteria = _compute_criterion_weights(raw_criteria)

    # -- 2. Build resume skill pool --------------------------------------------
    skill_evidence_map, resume_normalized, raw_corpus = _build_skill_evidence_map(resume_data, resume_raw_text)

    # -- 3. Build semantic index -----------------------------------------------
    resume_skill_names = list(resume_normalized.values())
    # Build evidence texts: responsibilities + evidence_items for responsibility/ownership matching
    evidence_texts: list[tuple[str, str]] = []
    work_history_for_idx = resume_data.get("work_history", [])
    for job in work_history_for_idx:
        company = job.get("company", "")
        for resp in (job.get("responsibilities", []) or job.get("bullet_points", [])):
            if resp and isinstance(resp, str):
                evidence_texts.append((resp, company, 3))  # responsibility = level 3 baseline
        for sig in (job.get("impact_signals", []) or []):
            if sig and isinstance(sig, str):
                evidence_texts.append((sig, company, 4))  # impact signal = level 4 baseline
    for ev in (resume_data.get("evidence_items", []) or []):
        text = ev.get("text", "")
        if text:
            evidence_texts.append((text, ev.get("source_company", ""), ev.get("evidence_level", 1)))
    # Include project descriptions as Level 4 evidence
    for proj in (resume_data.get("projects", []) or []):
        text = proj.get("description", "")
        if text:
            evidence_texts.append((text, proj.get("name", "project"), 4))

    semantic_index = SemanticSkillIndex(
        jd_criteria, resume_skill_names, evidence_texts, client=openai_client
    )

    # -- 4. Score each criterion -----------------------------------------------
    evidence_items = resume_data.get("evidence_items", []) or []

    # Synthesize project evidence_items when extraction didn't create them.
    # This fixes the case where v1 extraction stored projects[] but left evidence_items
    # with only volunteer/work-history entries -- common for freshers with project-only resumes.
    existing_project_proves: set[str] = set()
    for ev in evidence_items:
        if ev.get("type") == "project":
            for p in ev.get("proves", []):
                existing_project_proves.add(_normalize(p))

    for proj in (resume_data.get("projects", []) or []):
        techs = [t for t in (proj.get("technologies", []) or []) if t]
        if not techs:
            continue
        norm_techs = {_normalize(t) for t in techs}
        # Only synthesize if project technologies aren't already in project evidence_items
        if not norm_techs.issubset(existing_project_proves):
            is_owner = proj.get("ownership_level", "") == "owner"
            ev_level = 3 if is_owner else 2
            proj_desc = proj.get("description", "")
            text = proj_desc[:300] if proj_desc else f"Built {proj.get('name', 'project')} using {', '.join(techs[:6])}"
            evidence_items = list(evidence_items) + [{
                "id": f"synth-proj-{proj.get('id', proj.get('name', 'p'))}",
                "type": "project",
                "source_ref_id": proj.get("id"),
                "source_company": proj.get("name", "project"),
                "source_role": None,
                "text": text,
                "proves": techs,
                "evidence_level": ev_level,
                "ownership": "owner" if is_owner else "contributor",
                "has_metric": False,
                "metric": None,
                "confidence": 0.8,
            }]
            existing_project_proves.update(norm_techs)

    criteria_results: list[CriterionResult] = []
    must_matched_weight = must_total_weight = 0.0
    good_matched_weight = good_total_weight = 0.0
    matched_must: list[str] = []
    missing_must: list[str] = []
    partial_must: list[str] = []
    matched_good: list[str] = []
    must_have_details: list[dict] = []
    semantic_matches: list[dict] = []

    for criterion in jd_criteria:
        cr = _match_criterion(
            criterion, evidence_items, skill_evidence_map,
            resume_normalized, raw_corpus, semantic_index, resume_data,
        )
        criteria_results.append(cr)

        if cr.match_source.match_type == MatchType.semantic:
            semantic_matches.append({
                "criterion": cr.criterion,
                "matched_to": cr.match_source.matched_skill,
                "similarity": cr.match_source.semantic_similarity,
                "result": cr.result.value,
            })

        if cr.priority == CriterionPriority.medium:
            good_total_weight += cr.weight
            good_matched_weight += cr.score_contribution
            if cr.result == MatchResult.meets:
                matched_good.append(cr.criterion)
        else:
            must_total_weight += cr.weight
            must_matched_weight += cr.score_contribution
            if cr.result == MatchResult.meets:
                matched_must.append(cr.criterion)
                must_have_details.append({"name": cr.criterion, "weight": cr.priority.value, "status": "found", "match_level": "full"})
            elif cr.result in (MatchResult.partially_meets, MatchResult.unclear):
                partial_must.append(cr.criterion)
                must_have_details.append({"name": cr.criterion, "weight": cr.priority.value, "status": "mentioned", "match_level": cr.result.value})
            else:
                missing_must.append(cr.criterion)
                must_have_details.append({"name": cr.criterion, "weight": cr.priority.value, "status": "not_found", "match_level": "none"})

    # Custom HR checks
    hr_custom_checks = screening_criteria.get("customChecks", []) or screening_criteria.get("custom_checks", [])
    custom_required_total = 0
    custom_required_missing: list[str] = []
    for check in hr_custom_checks:
        check_text = (str(check.get("text") or check.get("label") or "").strip()
                      if isinstance(check, dict) else str(check or "").strip())
        required = bool(check.get("required")) if isinstance(check, dict) else False
        if not check_text:
            continue
        custom_required_total += 1 if required else 0
        norm_check = re.sub(r"[^a-z0-9 ]", " ", check_text.lower()).strip()
        found = norm_check in raw_corpus or all(
            tok in raw_corpus for tok in norm_check.split() if len(tok) > 2
        )
        if found:
            if required:
                must_matched_weight += 10
                must_total_weight += 10
        else:
            if required:
                custom_required_missing.append(check_text)
                missing_must.append(f"Custom: {check_text}")
                must_total_weight += 10

    skills_score = min(50, max(0, round((must_matched_weight / must_total_weight) * 50))) if must_total_weight else 50
    good_score = min(10, max(0, round((good_matched_weight / good_total_weight) * 10))) if good_total_weight else 5

    # -- 5. Experience score (15 pts) ------------------------------------------
    cv_exp = resume_data.get("experience", {})
    candidate_years = cv_exp.get("total_years")
    candidate_seniority = cv_exp.get("seniority_level", "")
    jd_exp = _as_dict(jd_data.get("experience", {}))
    jd_min_years = jd_exp.get("min_years")
    jd_max_years = jd_exp.get("max_years")
    jd_seniority = jd_data.get("role_level", "")

    exp_score = 0
    exp_status = "unknown"
    if jd_min_years is None:
        exp_score, exp_status = 15, "neutral"
    elif candidate_years is None:
        exp_score, exp_status = 11, "unknown"
    else:
        gap = candidate_years - jd_min_years
        if gap >= 0:
            exp_score, exp_status = 15, "meets"
            if jd_max_years and gap > (jd_max_years - jd_min_years + 4):
                exp_score, exp_status = 13, "overqualified"
        elif gap >= -1:
            exp_score, exp_status = 12, "close"
        elif gap >= -2:
            exp_score, exp_status = 9, "below"
        elif gap >= -3:
            exp_score, exp_status = 5, "significantly_below"
        else:
            exp_score, exp_status = max(0, 3 - (abs(gap) - 3)), "significantly_below"

    if jd_seniority and candidate_seniority:
        gap_lvl = _seniority_rank(candidate_seniority) - _seniority_rank(jd_seniority)
        if gap_lvl == 0:
            exp_score = min(15, exp_score + 1)
        elif gap_lvl == 1:
            exp_score = max(0, exp_score - 1)
        elif gap_lvl <= -2:
            exp_score = max(0, exp_score - 2)
        elif gap_lvl >= 2:
            exp_score = max(0, exp_score - 1)
    exp_score = max(0, min(15, exp_score))

    # -- 6. Career quality (15 pts) --------------------------------------------
    work_history = resume_data.get("work_history", [])
    career_pattern = resume_data.get("career_timeline", {}).get("progression_pattern", "unknown")
    red_flags = resume_data.get("red_flags", [])
    is_early = candidate_seniority in ("intern", "junior") or (candidate_years is not None and candidate_years <= 2)
    career_score = 4 if is_early else 5

    total_impact = sum(len(job.get("impact_signals", []) or []) for job in work_history)
    if total_impact >= 4:
        career_score += 3
    elif total_impact >= 2:
        career_score += 2
    elif total_impact >= 1:
        career_score += 1

    owner_count = sum(1 for job in work_history if job.get("ownership_level") == "owner")
    if owner_count >= 2:
        career_score += 2
    elif owner_count == 1:
        career_score += 1
    if sum(1 for job in work_history if job.get("impact_strength") == "high") >= 2:
        career_score += 1
    if work_history and all(job.get("ownership_level") in (None, "contributor", "unclear") for job in work_history):
        career_score -= 1
    if career_pattern == "growing":
        career_score += 2
    elif career_pattern == "lateral":
        career_score += 1
    elif career_pattern == "declining":
        career_score -= 2

    for flag in red_flags:
        sev = flag.get("severity", "low")
        if sev == "high":
            career_score -= 3
        elif sev == "medium":
            career_score -= 1
    career_score = max(0, min(15, career_score))

    # -- 7. Domain fit (10 pts) ------------------------------------------------
    scoring_hints = _as_dict(jd_data.get("scoring_hints", {}))
    domain_skills = resume_data.get("skills", {}).get("domain_skills", []) or []
    jd_kw_set = {_normalize(k) for k in (jd_data.get("keywords", []) or []) if k}

    domain_score = 5
    for green in (scoring_hints.get("green_flags_to_reward", []) or []):
        if green and _normalize(green) in resume_normalized:
            domain_score = min(10, domain_score + 2)
        elif green and green.lower() in raw_corpus:
            domain_score = min(10, domain_score + 1)
    for red in (scoring_hints.get("red_flags_to_watch", []) or []):
        if red and red.lower() in raw_corpus:
            domain_score = max(0, domain_score - 2)
    kw_hits = sum(1 for s in domain_skills if s and _normalize(s) in jd_kw_set)
    if kw_hits >= 3:
        domain_score = min(10, domain_score + 1)
    domain_score = max(0, min(10, domain_score))

    # -- 8. Base total and human layer -----------------------------------------
    base_total = min(100, max(0, skills_score + exp_score + good_score + career_score + domain_score))
    human = _human_layer(
        jd_data, resume_data, base_total, criteria_results,
        candidate_years, jd_min_years,
    )
    adjusted_total = int(human["human_score"])

    # -- 9. Hard rejection gate (v2: â‰¥60% critical fail for non-intern/junior) -
    hard_rejected = False
    rejection_reasons: list[str] = []

    critical_results = [r for r in criteria_results if r.priority == CriterionPriority.critical]
    # A critical criterion counts as failed if it's does_not_meet, OR if it's a SKILL
    # backed only by weak evidence (inferred/listed = bare text mention, not real work).
    # This catches "Java listed once but never used" against a Java-critical JD.
    def _critical_failed(r) -> bool:
        if r.result == MatchResult.does_not_meet:
            return True
        if (r.category == "skill"
                and r.result in (MatchResult.unclear, MatchResult.partially_meets)
                and r.match_source.ev_source in (EvidenceSource.inferred, EvidenceSource.listed)):
            return True
        return False
    critical_fails = [r for r in critical_results if _critical_failed(r)]
    critical_fail_ratio = len(critical_fails) / len(critical_results) if critical_results else 0

    jd_role_for_gate = jd_data.get("role_level", "mid")
    if jd_role_for_gate not in ("intern", "junior") and critical_results:
        if critical_fail_ratio >= 0.60:
            hard_rejected = True
            rejection_reasons.append(f"Missing {len(critical_fails)}/{len(critical_results)} critical criteria: "
                                      f"{[r.criterion for r in critical_fails]}")
    elif critical_results and critical_fail_ratio == 1.0:
        # For intern/junior: only hard reject if ALL critical fail
        hard_rejected = True
        rejection_reasons.append(f"All critical criteria failed: {[r.criterion for r in critical_fails]}")

    if custom_required_total > 0 and len(custom_required_missing) / custom_required_total > 0.70:
        hard_rejected = True
        rejection_reasons.append(f"Missing {len(custom_required_missing)}/{custom_required_total} required custom checks")

    if exp_status == "significantly_below" and jd_min_years and candidate_years is not None:
        if (jd_min_years - candidate_years) >= 4:
            hard_rejected = True
            rejection_reasons.append(f"Experience: {candidate_years}yr vs {jd_min_years}yr required")

    high_flags = [f for f in red_flags if f.get("severity") == "high"]
    if len(high_flags) >= 2:
        hard_rejected = True
        rejection_reasons.append(f"Multiple high-severity flags: {[f.get('flag') for f in high_flags]}")

    # -- 10. Final status ------------------------------------------------------
    borderline_floor = max(0, threshold - 10)
    if hard_rejected:
        status = "Rejected"
    elif adjusted_total >= threshold:
        status = "Shortlisted"
    elif adjusted_total >= borderline_floor:
        status = "Borderline"
    else:
        status = "Rejected"

    total_criteria = len(jd_criteria)
    met_criteria = len([r for r in criteria_results if r.result == MatchResult.meets])

    return {
        "score": adjusted_total,
        "base_score": base_total,
        "human_layer": human,
        "status": status,
        "breakdown": {
            "skills_score": skills_score, "skills_max": 50,
            "exp_score": exp_score,       "exp_max": 15,
            "good_score": good_score,     "good_max": 10,
            "career_score": career_score, "career_max": 15,
            "domain_score": domain_score, "domain_max": 10,
        },
        "criteria_results": [cr.model_dump() for cr in criteria_results],
        "skill_matching": {
            "matched_must": matched_must,
            "missing_must": missing_must,
            "partial_must": partial_must,
            "matched_good": matched_good,
            "total_must": total_criteria,
            "match_ratio": round((met_criteria / total_criteria) * 100) if total_criteria else 100,
            "must_have_details": must_have_details,
        },
        "top_evidence": [r.match_source.evidence_text for r in criteria_results if r.result == MatchResult.meets and r.match_source.evidence_text][:3],
        "gaps_to_probe": [r.criterion for r in criteria_results if r.result in (MatchResult.partially_meets, MatchResult.unclear)][:4],
        "exp_status": exp_status,
        "hard_rejected": hard_rejected,
        "rejection_reasons": rejection_reasons,
        "candidate_years": candidate_years,
        "jd_min_years": jd_min_years,
        "semantic_matches": semantic_matches,
        "grounding_warnings": [],
        "embedding_usage": semantic_index.embedding_usage,
    }


class ScoringEngine:
    def score(self, jd_data: dict, resume_data: dict,
              threshold: int = 70, screening_criteria: dict | None = None,
              openai_client=None, resume_raw_text: str = "") -> dict:
        return compute_score(jd_data, resume_data, threshold, screening_criteria, resume_raw_text, openai_client)
