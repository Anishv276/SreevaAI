"""
prompts.py v2 — All LLM prompts.

Key changes from v1:
1. JD extraction: criteria extracted without weights first, then ranked.
   Weights are computed deterministically from rank (no LLM arithmetic).
2. Resume extraction split into two calls:
   - Call 1 (structural): facts only, no interpretation, cheap model.
   - Call 2 (semantic): ownership/evidence assessment grounded in Call 1 output.
3. Resume Call 2 receives JD criteria as context so evidence_items explicitly
   tag which criteria they prove — ending the vocabulary mismatch problem.
4. Evidence level 5 now requires BOTH owner ownership AND a quantified metric.
   This is enforced in the prompt and validated by the Pydantic model.
"""
from __future__ import annotations
import json

# ── JD ────────────────────────────────────────────────────────────────────────

JD_SYSTEM = (
    "You are a senior technical recruiter with 10 years of structured hiring experience. "
    "Extract precise, structured data from job descriptions. Output ONLY valid JSON."
)

def build_jd_prompt(text: str) -> str:
    return f"""Convert this Job Description into structured role eligibility criteria.

CRITICAL MINDSET: A JD describes a ROLE, not just a keyword list. Extract what the person
must be ABLE TO DO and PROVE — not merely what tools they can list.

EXTRACTION RULES:

1. CRITERIA — extract 5–12 items covering ALL meaningful signals:
   - Explicit technologies ("React required", "5 years Python")
   - Responsibilities ("build REST APIs", "own the data pipeline end to end")
   - Experience requirements ("3+ years backend", "senior-level autonomy")
   - Ownership expectations ("lead technical design", "own features to production")
   - Domain context ("fintech background", "B2B SaaS experience")
   - Education/certs ONLY if explicitly required

2. CATEGORIES:
   "skill"          = specific technology or tool
   "responsibility" = something they must DO in this role
   "experience"     = years or depth in a domain
   "ownership"      = autonomy level expected
   "domain"         = industry or business context

3. PRIORITY:
   "critical" = role cannot function without (explicit hard requirement or universally table-stakes for this role title)
   "high"     = clearly required, mentioned prominently
   "medium"   = preferred or nice-to-have

4. RANK — within each priority tier, assign a rank (1 = most important):
   This replaces asking the LLM to do math. Weights are computed from rank.
   critical_rank: 1–5 (max 5 critical criteria)
   high_rank:     1–7
   medium_rank:   1–5

5. EVIDENCE REQUIRED (default "any"):
   "any"          = DEFAULT. Listing on resume is sufficient.
   "work_history" = ONLY when JD explicitly says "professional experience", "production", "commercial setting".
   "project"      = ONLY when JD explicitly says "portfolio", "open-source", "show your work".

6. TABLE STAKES: Set is_table_stakes: true for skills so fundamental to this exact role title
   that their absence would be disqualifying even if not in the JD.
   Example: Python for Data Scientist, Java for Java Backend Developer, SQL for Data Analyst.
   Maximum 2 table-stakes criteria. Leave false if uncertain.

7. SCORING HINTS:
   green_flags_to_reward: 2–4 concrete differentiators (e.g. "open-source contributor", "AWS Lambda at scale")
   red_flags_to_watch: 2–3 concrete misalignments (e.g. "only legacy stack experience", "no startup experience")

8. NO INVENTION: Never add skills not present or clearly implied by the JD.
9. NO SOFT SKILLS as criteria unless the JD provides a concrete proof signal.
10. EXPERIENCE: "2–4 years" → min_years:2, max_years:4. "5+" → min_years:5, max_years:null.

Return ONLY valid JSON. No markdown. No explanation.

{{
  "job_title": string,
  "role_level": "intern"|"junior"|"mid"|"senior"|"lead"|"manager",
  "experience": {{
    "min_years": number|null,
    "max_years": number|null,
    "preferred_background": string|null
  }},
  "criteria": [
    {{
      "id": string,
      "category": "skill"|"responsibility"|"experience"|"ownership"|"domain",
      "name": string,
      "priority": "critical"|"high"|"medium",
      "priority_rank": number,
      "evidence_required": "any"|"work_history"|"project",
      "is_table_stakes": boolean,
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

# ── Resume: Call 1 (structural) ───────────────────────────────────────────────

RESUME_STRUCTURAL_SYSTEM = (
    "You extract factual structure from resumes. "
    "Copy exact text. Never paraphrase. Never infer. Never add. Output ONLY valid JSON."
)

def build_resume_structural_prompt(text: str) -> str:
    return f"""Extract ONLY the verifiable facts from this resume. No interpretation. No paraphrasing.

RULES:
- Copy company names, role titles, and dates EXACTLY as written.
- Compute duration_months from start_date and end_date. If dates are missing, set null.
- bullet_points: copy the exact text of every bullet point or sentence under each role. Do not summarize.
- technologies_used: extract exact technology names as written (e.g. "React.js", "PostgreSQL 14").
- skills_section: list every item from the Skills / Technical Skills section exactly as written.
- If a field is not present in the resume, set it to null or []. Never invent.
- parse_confidence: "high" if dates/companies are clear, "medium" if some fields are ambiguous, "low" if mostly unclear.

Return ONLY valid JSON matching this schema exactly:

{{
  "parse_confidence": "high"|"medium"|"low",
  "full_name": string|null,
  "email": string|null,
  "phone": string|null,
  "location": {{"city": string|null, "state": string|null, "country": string|null}},
  "links": {{"linkedin": string|null, "github": string|null, "portfolio": string|null}},
  "work_history": [{{
    "id": string,
    "company": string,
    "role": string,
    "start_date": "YYYY-MM"|null,
    "end_date": "YYYY-MM"|"Present"|null,
    "duration_months": number|null,
    "is_current": boolean,
    "technologies_used": [string],
    "bullet_points": [string]
  }}],
  "projects": [{{
    "id": string,
    "name": string|null,
    "type": "professional"|"academic"|"personal"|"freelance"|"open_source",
    "technologies": [string],
    "description": string
  }}],
  "education": [{{
    "degree": string|null,
    "field": string|null,
    "institution": string|null,
    "year": number|null
  }}],
  "certifications": [{{
    "name": string,
    "issuer": string|null,
    "date": "YYYY-MM"|null
  }}],
  "skills_section": [string]
}}

Resume:
{text}
"""

# ── Resume: Call 2 (semantic assessment) ─────────────────────────────────────

RESUME_SEMANTIC_SYSTEM = (
    "You are a principal technical recruiter assessing candidate evidence quality. "
    "You receive a verified resume structure and must assess ownership, impact quality, "
    "and skill evidence — grounded in the provided facts. Output ONLY valid JSON."
)

def build_resume_semantic_prompt(structural: dict, jd_criteria: list[dict] | None = None) -> str:
    criteria_hint = ""
    if jd_criteria:
        critical_high = [c for c in jd_criteria if c.get("priority") in ("critical", "high")]
        if critical_high:
            criteria_hint = f"""
JD CRITERIA TO TAG IN EVIDENCE (use these EXACT strings in the "proves" array):
{json.dumps([c["name"] for c in critical_high], indent=2)}

For each evidence_item, include in "proves" every JD criterion name from the list above
that this specific piece of evidence genuinely demonstrates. Only include if the evidence
clearly shows the skill — not merely mentions it.
"""

    return f"""You are given a verified resume structure extracted from a resume.
Assess the QUALITY and OWNERSHIP of evidence for each role. Do not invent facts.

VERIFIED RESUME STRUCTURE:
{json.dumps(structural, indent=2)}
{criteria_hint}

ASSESSMENT RULES:

1. TOTAL EXPERIENCE:
   - total_years: sum non-overlapping professional experience in years (float).
     Exclude internships under 6 months. If roles overlap, count the longer one.
   - Compute from duration_months in the verified structure — do not re-parse dates.
   - seniority_level: infer from title signals AND total_years.
     intern=0–1yr | junior=1–3yr | mid=3–5yr | senior=5+yr | lead=manages others | manager=explicit management
   - seniority_reason: one sentence explaining why.

2. ROLE ASSESSMENTS — for each role in work_history, assess:
   - ownership_level:
     "owner": designed it, made architectural decisions, led it solo or as tech lead.
       Signals: "designed", "architected", "built from scratch", "led", "owned", "responsible for".
     "contributor": built features within someone else's architecture.
       Signals: "contributed to", "worked on", "implemented feature for", "part of team".
     "unclear": language is too vague to determine.
   - impact_strength: "high" if multiple quantified outcomes, "medium" if some outcomes, "low" if effort-only.
   - impact_signals: ONLY bullet_points that contain a QUANTIFIED outcome (%, users, ms latency, $ revenue, time saved).
     Copy exact bullet text. Exclude vague bullets like "improved performance", "enhanced user experience".
   - business_domain: the industry/domain of this company (e.g. "fintech", "edtech", "e-commerce", "B2B SaaS").

3. EVIDENCE ITEMS — extract the 2–5 strongest pieces of evidence per role AND per project:
   Include work_history AND project evidence items. Projects count as real evidence.
   - text: the exact bullet or claim (copy verbatim).
   - proves: list of canonical skill keys OR JD criteria names this evidence demonstrates.
   - type: "work_history" for roles, "project" for projects.
   - source_ref_id: the role/project id this evidence comes from.
   - source_company: company name for work_history; project name for projects.
   - evidence_level:
     5 = work_history, owner-level, quantified metric ("Led Redis cache layer, reducing API latency by 40%")
     4 = work_history, owner-level, clear outcome but no hard number
     3 = work_history contributor with metric, OR owner-built project with real technical depth
         (multi-component system, integrates APIs, real deployment — not a tutorial clone)
     2 = simple personal/hobby project, OR contributor with only qualitative outcome
     1 = listed in skills section only, no supporting evidence
     RULE: NEVER assign 5 without BOTH "owner" ownership AND a number/% in the text.
     RULE: NEVER assign 4 or 5 for skills_section items.
     RULE: A student/fresher who built a complete end-to-end project with owner ownership
           (e.g. RAG pipeline, OCR system, meeting assistant) should receive level 3.
   - has_metric: true ONLY if the text contains a number, %, or currency amount.
   - metric: extract the exact metric string if present.
   - confidence: 0.9 if unambiguous, 0.7 if reasonable inference, 0.5 if stretch.

4. SKILLS — build from evidence, including both work_history AND projects:
   - technical[]: languages and frameworks with evidence in work_history or projects.
   - tools[]: platforms, cloud, databases, DevOps tools with evidence.
   - domain_skills[]: business capabilities (e.g. "payment processing", "real-time systems") — NO tech names.
   For each skill, set source_strength based on highest-quality evidence:
     "work_history_outcome" = appears in a role with a quantified impact signal
     "work_history" = appears in a role but no quantified outcome
     "project" = appears only in projects (set this for students/freshers with real projects)
     "listed" = only in skills_section, never in any role or project

5. CAREER TIMELINE:
   - overlaps: roles where date ranges overlap > 2 months.
   - gaps: periods > 6 months between roles.
   - job_hopping_risk: "high" if avg tenure < 12 months across 3+ roles, "medium" if 2 short roles, "none"/"low" otherwise.
   - progression_pattern: "growing" (higher scope/title over time) | "lateral" (similar level) | "declining" | "mixed" | "early_career" | "unknown".

6. RED FLAGS — evidence-based only:
   Types: overlapping_roles | job_hopping | employment_gap | vague_descriptions | no_progression | generic_skills | title_inflation | missing_impact
   - "high" severity: clear fabrication signals, 2+ overlapping roles, 3+ short tenures.
   - "medium" severity: all roles with zero quantified outcomes, significant unexplained gaps.
   - "low" severity: minor inconsistencies.

7. CORE CLAIMS — top 3–5 strongest claims this candidate can make, grounded in evidence_items.

8. CANDIDATE SUMMARY — 2–3 recruiter-style sentences. No gendered language. No vague adjectives.
   Each sentence must name a specific company, skill, or metric.

Return ONLY valid JSON:

{{
  "total_years": number|null,
  "total_months": number|null,
  "seniority_level": "intern"|"junior"|"mid"|"senior"|"lead"|"manager"|null,
  "seniority_reason": string,
  "role_assessments": [{{
    "role_id": string,
    "ownership_level": "owner"|"contributor"|"unclear",
    "impact_strength": "high"|"medium"|"low",
    "impact_signals": [string],
    "business_domain": string|null
  }}],
  "evidence_items": [{{
    "id": string,
    "type": "work_history"|"project"|"certification"|"listed_skill",
    "source_ref_id": string|null,
    "source_company": string|null,
    "source_role": string|null,
    "text": string,
    "proves": [string],
    "evidence_level": 1|2|3|4|5,
    "ownership": "owner"|"contributor"|"unclear",
    "has_metric": boolean,
    "metric": string|null,
    "confidence": number
  }}],
  "skills": {{
    "technical": [{{"skill": string, "evidence": string, "evidence_level": number, "years_of_use": number|null, "source_strength": string}}],
    "tools": [{{"tool": string, "category": string|null, "evidence": string, "evidence_level": number, "source_strength": string, "confidence": string}}],
    "domain_skills": [string]
  }},
  "career_timeline": {{
    "overlaps": [{{"roles": [string, string], "overlap_months": number, "severity": string}}],
    "gaps": [{{"after_role_id": string, "gap_months": number, "severity": string}}],
    "job_hopping_risk": "none"|"low"|"medium"|"high",
    "progression_pattern": "growing"|"lateral"|"declining"|"mixed"|"early_career"|"unknown"
  }},
  "core_claims": [{{"claim": string, "evidence": string, "confidence": "high"|"medium"|"low"}}],
  "uncertain_areas": [{{"area": string, "reason": string, "probe_question": string}}],
  "red_flags": [{{"flag": string, "severity": "high"|"medium"|"low", "detail": string}}],
  "candidate_summary": string
}}
"""

# ── Reporter ──────────────────────────────────────────────────────────────────

REPORTER_SYSTEM = (
    "You are a Principal Technical Recruiter producing candidate evaluation reports. "
    "EVIDENCE DISCIPLINE: every factual claim MUST cite a specific company name, tool, project, or metric "
    "from the provided evidence library using its [EV-xxx] citation ID. "
    "FORBIDDEN in all output: 'strong background', 'passionate', 'experienced in', 'has worked with', "
    "'demonstrates proficiency', score numbers in narrative text. "
    "REQUIRED sentence pattern: 'At [Company], [built/led/owned] [specific thing] using [tool] — [outcome/scale/metric]'. "
    "BIAS: zero tolerance — no inference from name, nationality, gender, age, or education prestige. "
    "Output ONLY valid JSON. No markdown. No code fences."
)

def build_reporter_prompt(
    jd_raw_text: str,
    resume_raw_text: str,
    resume_data: dict,
    score_result: dict,
    evidence_blocks: list[str],
    criteria_breakdown: list[dict],
    screening_criteria: dict | None = None,
) -> str:
    candidate_name = resume_data.get("full_name", "the candidate")
    matched = score_result["skill_matching"]["matched_must"]
    missing = score_result["skill_matching"]["missing_must"]
    matched_good = score_result["skill_matching"]["matched_good"]
    status = score_result["status"]
    total = score_result["score"]
    breakdown = score_result["breakdown"]
    candidate_years = score_result["candidate_years"]
    jd_min_years = score_result["jd_min_years"]
    exp_status = score_result["exp_status"]
    work_history = resume_data.get("work_history", [])
    domain_skills = resume_data.get("skills", {}).get("domain_skills", [])
    projects = resume_data.get("projects", [])

    return f"""The deterministic scoring engine has LOCKED the final score and status.
Your ONLY job: write sharp, evidence-grounded human-readable analysis. You CANNOT change scores.

━━━ LOCKED SCORING RESULTS (READ ONLY) ━━━
Candidate      : {candidate_name}
Final Score    : {total}/100  (Base: {score_result["base_score"]}, Human adj: {score_result["human_layer"].get("human_adjustment", 0)})
Status         : {status}
Criteria Match : {breakdown["skills_score"]}/{breakdown["skills_max"]} pts
Experience     : {breakdown["exp_score"]}/{breakdown["exp_max"]} pts
Career Quality : {breakdown["career_score"]}/{breakdown["career_max"]} pts
Good-to-have   : {breakdown["good_score"]}/{breakdown["good_max"]} pts
Domain Fit     : {breakdown.get("domain_score", 0)}/{breakdown.get("domain_max", 10)} pts
Must matched   : {json.dumps(matched)}
Must missing   : {json.dumps(missing)}
Good hits      : {json.dumps(matched_good)}
Exp status     : {exp_status} ({candidate_years} yrs | required: {jd_min_years} yrs)
{f"HARD REJECTION: {json.dumps(score_result['rejection_reasons'])}" if score_result["hard_rejected"] else "No hard rejection."}
Human summary  : {score_result["human_layer"].get("summary", "")}

━━━ CRITERIA EVIDENCE TRACE ━━━
{json.dumps(criteria_breakdown, indent=2)}

━━━ EVIDENCE LIBRARY (cite by [EV-id] in your output) ━━━
{chr(10).join(evidence_blocks) if evidence_blocks else "No high-quality evidence items extracted."}

━━━ JOB DESCRIPTION ━━━
{jd_raw_text[:3000]}

━━━ RESUME RAW TEXT ━━━
{resume_raw_text[:4000]}

━━━ STRUCTURED RESUME ━━━
WORK HISTORY: {json.dumps(work_history, indent=2)}
PROJECTS: {json.dumps(projects, indent=2)}
DOMAIN SKILLS: {json.dumps(domain_skills)}
CORE CLAIMS: {json.dumps(resume_data.get("core_claims", []), indent=2)}
{f"SCREENING CRITERIA: {json.dumps(screening_criteria)}" if screening_criteria else ""}

━━━ OUTPUT INSTRUCTIONS ━━━

GLOBAL RULES:
- Every factual sentence MUST name a company, tool, project, or metric from THIS resume.
- Cite evidence by [EV-id] when referencing an evidence_item.
- FORBIDDEN: vague adjectives, score numbers in prose, demographic inferences.
- Tone: direct, specific, professional. Rejected candidates get honest gaps, not unkind language.

1. recruiter_snapshot (string — 3 sentences)
   S1: What they can do TODAY — deepest skill, strongest role, best evidence with [EV-id].
   S2: How they match THIS role — must-haves matched/missed specifically.
   S3: Biggest gap OR strongest differentiator.

2. fit_radar (0–100 each — YOUR independent judgment, NOT score breakdown copy):
   - must_haves: % of JD must-haves confirmed in work history or projects (not merely listed).
     Missing must-haves pull this down. Each missed critical = -15 to -20 pts.
   - exp_depth: % experience quality — years vs minimum, ownership level, building vs assisting.
   - domain_fit: % industry alignment — ramp-time risk. 100=exact match, 50=adjacent, 20=mismatch.
   - skill_breadth: % confirmed tech stack width across distinct areas. Listed-only = 20 max.
   - evidence_quality: % resume backed by verifiable proof — metrics, ownership, system names.

3. fit_radar_notes (1–2 sentences per axis naming specific skill/company/metric that drove score UP or DOWN).

4. skill_match_rows (6–12 items — confirmed technical skills only):
   - name: canonical skill name
   - stars: 1–5 (5=multiple high-impact owner roles + metrics; 1=text mention only)
   - evidence_note: one phrase, e.g. "3 years at Razorpay, production scale" or "Personal project only"

5. work_history_annotated (one entry per role):
   - company, role, start_date (MMM YYYY), end_date (MMM YYYY or Present), duration_months, is_current
   - recruiter_summary: 2–3 sentences — what built, tools used, scope, outcome. Name specifics with [EV-id].
   - technologies_used: [string]
   - ownership_level, impact_strength

6. experience_assessment: {{"years": {candidate_years}, "vs_required": "{candidate_years} yrs vs {jd_min_years} yrs required"}}

7. candidate_potential: {{"for_this_role": "High"|"Medium"|"Low"}}

8. decision_reason (EXACTLY 4 sentences):
   S1: Decisive verdict + top skill WHERE proven (company + scope/metric + [EV-id]).
   S2: Experience + ownership quality (years, seniority, building vs assisting, company type).
   S3: Strongest differentiator OR most important gap — specific tool/company/metric.
   S4: Concrete recommendation. Shortlisted: what to probe. Borderline: what would push through. Rejected: what would need to change.

9. strengths (EXACTLY 3 items):
   - label: 3–5 word noun phrase naming the specific strength (e.g. "Node.js ownership at Swiggy")
   - body: 1–2 sentences with company, tool, metric, outcome. Cite [EV-id].

10. weaknesses (EXACTLY 3 items):
    - label: 3–5 word noun phrase naming the specific gap
    - body: what is missing, why it matters for THIS role, what would resolve it.

11. ai_summary (EXACTLY 4 cards):
    - "Core Skills": confirmed vs JD. emerald=80%+ matched, amber=partial, rose=weak.
    - "Experience": years vs minimum + ownership. emerald=meets+owner, amber=close/contributor, rose=short.
    - "Applied Depth": skills in work vs listed. emerald=majority in work, amber=mixed, rose=mostly listed.
    - "Risks": 1–2 specific blockers. Always rose. Name the skill/gap/mismatch.

12. citations_used (array of [EV-id] strings you cited — used for grounding verification).

Return ONLY valid JSON:
{{
  "recruiter_snapshot": "string",
  "fit_radar": {{"must_haves": 0, "exp_depth": 0, "domain_fit": 0, "skill_breadth": 0, "evidence_quality": 0}},
  "fit_radar_notes": {{"must_haves": "string", "exp_depth": "string", "domain_fit": "string", "skill_breadth": "string", "evidence_quality": "string"}},
  "skill_match_rows": [{{"name":"string","stars":0,"evidence_note":"string"}}],
  "experience_assessment": {{"years": {candidate_years}, "vs_required": "string"}},
  "work_history_annotated": [{{"company":"string","role":"string","start_date":"string","end_date":"string","duration_months":0,"is_current":false,"recruiter_summary":"string","technologies_used":["string"],"ownership_level":"string","impact_strength":"string"}}],
  "candidate_potential": {{"for_this_role": "string"}},
  "decision_reason": "string",
  "strengths": [{{"label":"string","body":"string"}},{{"label":"string","body":"string"}},{{"label":"string","body":"string"}}],
  "weaknesses": [{{"label":"string","body":"string"}},{{"label":"string","body":"string"}},{{"label":"string","body":"string"}}],
  "ai_summary": [
    {{"label":"Core Skills","body":"string","tone":"emerald|amber|rose"}},
    {{"label":"Experience","body":"string","tone":"emerald|amber|rose"}},
    {{"label":"Applied Depth","body":"string","tone":"emerald|amber|rose"}},
    {{"label":"Risks","body":"string","tone":"rose"}}
  ],
  "citations_used": ["string"]
}}
"""
