"""
prompts.py — All LLM prompts in one place.

Previously buried inside extract_pdf.py's extract_data() function.
Moving them here means:
  - One file to update when prompt logic changes
  - Easy to A/B test prompts without touching pipeline logic
  - Clear ownership: prompts are data, not code
"""
from __future__ import annotations
from extraction_resume_JD_score_report.config import JD_CANONICAL_SKILL_REFERENCE, RESUME_CANONICAL_SKILL_REFERENCE


JD_SYSTEM_PROMPT = (
    "You are a senior technical recruiter with 10 years of experience. "
    "You extract precise, structured data from documents. "
    "Output ONLY valid JSON. Follow the schema exactly."
)

RESUME_SYSTEM_PROMPT = (
    "You are a senior technical recruiter with 10 years of experience. "
    "You extract precise, structured data from documents. "
    "Output ONLY valid JSON. Follow the schema exactly."
)

def build_jd_prompt(text: str) -> str:
    """Returns the full JD extraction user prompt."""
    return f"""You are an expert ATS analyst. Your task is to convert a Job Description into a structured set of ROLE ELIGIBILITY CRITERIA that a resume screening engine will use to evaluate candidates.

CRITICAL MINDSET: A JD with only 4 visible skills is NOT asking to match only 4 skills. It is describing a ROLE. Your job is to extract WHAT THE PERSON MUST BE ABLE TO DO, proven by evidence — not just what tools they list.

EXTRACTION RULES:
1. CRITERIA (6-10 items, no more): Extract criteria from ALL of these signals in the JD:
   - Explicit skills/technologies (e.g., "React required")
   - Responsibilities (e.g., "build dashboards", "integrate APIs", "manage campaigns")
   - Experience requirements (e.g., "2+ years of frontend experience")
   - Ownership expectations (e.g., "own features from development to release")
   - Domain/context (e.g., "SaaS product experience", "fintech background")
   - Education/certifications (ONLY if explicitly required)

2. CATEGORY TYPES:
   - "skill" = specific technology or tool (React, Python, SQL)
   - "responsibility" = something they must DO in this role (build dashboards, integrate APIs)
   - "experience" = years or seniority in a domain
   - "ownership" = autonomy and leadership expected (own features, lead team)
   - "domain" = industry or business context (SaaS, fintech, e-commerce)

3. PRIORITY LEVELS:
   - "critical" = role cannot function without this (core deliverable or explicit hard requirement)
   - "high" = clearly required, mentioned prominently
   - "medium" = preferred or "nice to have"

4. WEIGHTS: Assign weights so all criteria weights SUM TO EXACTLY 100.
   - critical criteria get 15-25 points each
   - high criteria get 10-15 points each
   - medium criteria get 5-10 points each

5. EVIDENCE REQUIRED — default is "any". Only upgrade when the JD text explicitly demands it:
   - "any" = DEFAULT. Use for all skills, tools, and technologies. A candidate listing React, Python, SQL etc. on their resume is sufficient proof. This is the correct value for the vast majority of criteria.
   - "project" = Use ONLY when the JD explicitly says something like "portfolio required", "show us your work", or "open-source contributions expected".
   - "work_history" = Use ONLY when the JD explicitly says phrases like "must have X in production", "professional experience required", "X years of hands-on experience in a commercial setting", "led a team", or "owned end-to-end in a real job". Do NOT use this for normal skill requirements.

6. CANONICAL SKILL NAMES — use these exact canonical labels:
{JD_CANONICAL_SKILL_REFERENCE}

7. NO INVENTION: Do not add skills/tools not mentioned in the JD.
8. NO SOFT SKILLS AS CRITERIA unless the JD gives a concrete proof signal.
9. EXPERIENCE: "2-4 years" → min_years:2, max_years:4. "5+" → min_years:5, max_years:null.
10. SENIORITY: intern=0-1yr | junior=1-3yr | mid=3-5yr | senior=5+yr | lead=manages others | manager=explicit management

13. SCORING HINTS:
    green_flags_to_reward: 2-5 concrete differentiators that make a candidate stand out.
    red_flags_to_watch: 2-4 concrete signals that reduce domain fit score.

Return ONLY valid JSON. No markdown. No explanation.

{{
  "job_title": string,
  "role_level": "intern" | "junior" | "mid" | "senior" | "lead" | "manager",
  "experience": {{
    "min_years": number | null,
    "max_years": number | null,
    "preferred_background": string | null
  }},
  "criteria": [
    {{
      "id": string,
      "category": "skill" | "responsibility" | "experience" | "ownership" | "domain",
      "name": string,
      "priority": "critical" | "high" | "medium",
      "weight": number,
      "evidence_required": "work_history" | "project" | "any",
      "source_text": string
    }}
  ],
  "scoring_hints": {{
    "green_flags_to_reward": [string],
    "red_flags_to_watch": [string]
  }},
  "has_technical_requirements": boolean,
  "keywords": [string]
}}

Job Description:
{text}
"""


def build_resume_prompt(text: str) -> str:
    """Returns the full resume extraction user prompt."""
    return f"""You are an expert talent intelligence analyst and ATS resume auditor.

Your task is to convert this resume into a structured, evidence-first JSON object.
This output will feed:
1. A deterministic role eligibility scoring engine.
2. A candidate screening report for HR.
3. An AI interview question generator.

CORE PHILOSOPHY:
A resume is NOT a keyword list. It is a set of evidence claims.
Your job is to identify WHAT the candidate has PROVEN, not what they have listed.

RULES:
- RULE 1: NO INVENTION. Never add companies, dates, tools, metrics not in the resume.
- RULE 2 EVIDENCE LEVELS: 5=work+ownership+metric, 4=work+ownership, 3=work+contributor, 2=project, 1=listed only.
- RULE 3: Extract 1-5 evidence_items per role/project. Use CANONICAL SKILL KEYS in "proves":
{RESUME_CANONICAL_SKILL_REFERENCE}
- RULE 4 SKILLS: technical[]=languages/frameworks. tools[]=platforms/cloud/DB/DevOps. domain_skills[]=business capabilities ONLY (no tech names).
- RULE 6: Extract every work role. Compute duration_months. owner/contributor/unclear for ownership_level.
- RULE 7 EXPERIENCE: total_years = non-overlapping professional work. Exclude internships <6 months.
- RULE 8: career_timeline with overlaps, gaps, job_hopping_risk, progression_pattern.
- RULE 9: core_claims top 3-5 grounded in evidence_items.
- RULE 10: uncertain_areas for vague roles, unlinked tools, inconsistent dates.
- RULE 11: red_flags evidence-based only (overlapping_roles|job_hopping|employment_gap|vague_descriptions|no_progression|generic_skills|title_inflation|missing_work_history).
- RULE 12: candidate_summary 2-3 recruiter-style sentences. No gendered language.
- RULE 13: Return ONLY valid JSON.

OUTPUT SCHEMA:
{{
  "parse_confidence": "high" | "medium" | "low",
  "full_name": string | null,
  "email": string | null,
  "phone": string | null,
  "location": {{"city": string | null, "state": string | null, "country": string | null}},
  "current_company": string | null,
  "current_role": string | null,
  "links": {{"linkedin": string | null, "github": string | null, "portfolio": string | null}},
  "experience": {{
    "total_years": number | null,
    "total_months": number | null,
    "seniority_level": "intern" | "junior" | "mid" | "senior" | "lead" | "manager" | null,
    "seniority_reason": string
  }},
  "work_history": [{{
    "id": string, "company": string, "role": string,
    "start_date": "YYYY-MM" | null, "end_date": "YYYY-MM" | "Present" | null,
    "duration_months": number | null, "is_current": boolean,
    "responsibilities": [string], "technologies_used": [string],
    "impact_signals": [string], "ownership_level": "owner" | "contributor" | "unclear",
    "impact_strength": "high" | "medium" | "low", "business_domain": string | null
  }}],
  "projects": [{{
    "id": string, "name": string | null,
    "type": "professional" | "academic" | "personal" | "freelance" | "open_source",
    "description": string, "technologies": [string],
    "impact_signals": [string], "ownership_level": "owner" | "contributor" | "unclear",
    "impact_strength": "high" | "medium" | "low"
  }}],
  "evidence_items": [{{
    "id": string, "type": "work_history" | "project" | "certification" | "listed_skill" | "summary",
    "source_ref_id": string | null, "source_company": string | null, "source_role": string | null,
    "text": string, "proves": [string], "evidence_level": 1 | 2 | 3 | 4 | 5,
    "ownership": "owner" | "contributor" | "unclear", "has_metric": boolean,
    "metric": string | null, "confidence": number
  }}],
  "skills": {{
    "technical": [{{"skill": string, "evidence": string, "evidence_level": 1|2|3|4|5, "years_of_use": number | null, "source_strength": "work_history_outcome"|"work_history"|"project"|"listed"|"inferred"}}],
    "tools": [{{"tool": string | null, "category": string | null, "evidence": string, "evidence_level": 1|2|3|4|5, "source_strength": "work_history_outcome"|"work_history"|"project"|"listed"|"inferred", "confidence": "high"|"medium"|"low"}}],
    "domain_skills": [string]
  }},
  "education": [{{"degree": string | null, "field": string | null, "institution": string | null, "year": number | null, "type": "degree"|"diploma"|"certification"|"course"|"school"}}],
  "certifications": [{{"name": string, "issuer": string | null, "date": "YYYY-MM" | null}}],
  "career_timeline": {{
    "overlaps": [{{"roles": [string, string], "overlap_months": number, "severity": "low"|"medium"|"high"}}],
    "gaps": [{{"after_role_id": string, "gap_months": number, "severity": "low"|"medium"|"high"}}],
    "job_hopping_risk": "none" | "low" | "medium" | "high",
    "progression_pattern": "growing" | "lateral" | "declining" | "mixed" | "early_career" | "unknown"
  }},
  "career_progression": {{"analysis": string}},
  "core_claims": [{{"claim": string, "evidence": string, "confidence": "high"|"medium"|"low"}}],
  "uncertain_areas": [{{"area": string, "reason": string, "probe_question": string}}],
  "red_flags": [{{"flag": string, "severity": "high"|"medium"|"low", "detail": string}}],
  "candidate_summary": string,
  "keywords": [string]
}}

Resume:
{text}"""
