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
- Tone: direct, specific, professional.
- CHARACTER LIMITS ARE HARD: bodies that exceed them will be cut off mid-sentence on screen.

━━━ SECTION 1 — FIT RADAR ━━━

Output "fit_radar" (0–100 each) — YOUR independent judgment, NOT a copy of the score breakdown:
- role_fit: What % of JD must-haves + good-to-haves does the resume actually cover via evidence (not just listing)? 100 = every requirement proven, 50 = partial/adjacent, 20 = major gaps.
- tech_depth: Mastery vs. exposure. Owner-level system builds = high. Contributor on others' systems = mid. Skills-section-only = low.
- proven_impact: Achievement density. % of resume backed by metrics, quantified outcomes, or clear ownership — not just duty descriptions.
- hire_risk: INVERTED (100 = no risk, 0 = high risk). Penalise: short tenures, stagnation, domain mismatch, stale core skills.
- growth_velocity: Career trajectory speed (0–100, neutral=50). Reward scope/title escalation, ownership level rising over time. Penalise short stints or declining trajectory.

Output "fit_radar_notes" — one sharp sentence per axis grounded in THIS resume's specific evidence.
  - DO NOT write generic explanations of what the axis means.
  - DO name the specific signal that drove the score. Examples:
    - role_fit: "Covers React, Node.js, and PostgreSQL from JD but missing the required AWS Lambda experience."
    - tech_depth: "Led microservices rebuild at Razorpay [EV-003] — owner-level system design, not just feature work."
    - proven_impact: "Only 2 of 6 roles carry quantified outcomes; remainder are duty descriptions with no metrics."
    - hire_risk: "Three stints under 8 months in the last 4 years; stability concern for a senior hire."
    - growth_velocity: "IC contributor throughout with no title or scope escalation across 5 roles."

━━━ SECTION 2 — AI SUMMARY (3 cards) ━━━

LIMIT: Each body is displayed at 13px in a fixed card. Write 2–3 complete sentences.
Target 200–280 characters per body — enough to say something meaningful, short enough to read in 5 seconds.
No filler phrases ("is a", "demonstrates", "has shown"). Start with the strongest signal immediately.
Cite [EV-id] only when it fits naturally.

HOW TO WRITE EACH CARD:
Think: "If I had 10 seconds to tell a hiring manager the ONE thing they must know, what is it?"
Answer that question first. Then add ONE follow-up sentence with the specific proof or gap.

Cards:
1. label="Executive Summary", tone="emerald"|"amber"|"rose"
   S1: Their professional identity in one punchy line — role type + strongest domain + scale/context.
   S2: The single most impressive concrete thing they built or owned, with company and outcome.
   Example: "Backend engineer specializing in high-throughput payment systems with 6 years at fintech scale. Built Razorpay's settlement engine [EV-001] processing 50M transactions/day — sole architect and owner."

2. label="JD Alignment", tone="emerald"|"amber"|"rose"
   S1: The strongest match to THIS specific JD — name the exact skills or responsibilities that align.
   S2: The most critical gap vs. THIS JD — what the JD requires that is absent or weak in the resume.
   Example: "Covers all three core JD requirements: React, Node.js, and PostgreSQL — each with production-scale work history. Missing the required AWS Lambda experience; only on-prem and GCP deployments visible in resume."

3. label="Primary Risk", tone="rose" (always rose)
   S1: The single biggest reason this hire might fail — be specific, not generic.
   S2: Why it matters for THIS role specifically, or what evidence makes it a real concern.
   Example: "Three tenures under 8 months in the last 4 years signal a retention risk for a senior long-term hire. No role shows ownership of a system beyond feature-level contribution — a gap for a role requiring architectural independence."

━━━ SECTION 3 — STRENGTHS & WEAKNESSES ━━━

LIMIT: Each body is clipped at 260 characters on screen. Write tight — every word must land.
MANDATORY STRUCTURE for every body:
  [Specific fact from resume — company/project/metric] → [what this proves or why it's a risk for THIS role]

ANTI-PATTERNS (will produce useless output — never do these):
  ✗ "Demonstrated strong ownership across multiple roles" — too vague, names nothing
  ✗ "Has experience with high-scale systems" — still vague
  ✗ "Shows repeated ability to..." — pattern-talk without the evidence
  ✓ "Owned payment gateway rebuild at Razorpay [EV-003] and fraud pipeline at Juspay — two owner-level fintech systems proves this is a builder, not just a contributor."
  ✓ "All 5 roles list Python but only 1 (Juspay, 8 months) has a quantified outcome — depth is unverifiable for a senior mandate."

strengths (EXACTLY 3 — pick the 3 most DEFENSIBLE advantages grounded in resume evidence):
BEFORE writing, ask: "What are the top 3 things this person has provably done that most candidates at this level haven't?"
- label: 3–5 word conceptual frame. NOT skill names ("Strong Python"). Use role/outcome frames:
  "Fintech System Ownership", "0-to-1 Product Delivery", "High-Scale API Architecture", "Multi-Domain Ownership", "Quantified Impact Track Record"
- body: Lead with the strongest specific fact. End with what it means for THIS role. ≤ 260 chars.

weaknesses (EXACTLY 3 — pick the 3 most IMPACTFUL gaps or risks for THIS specific JD):
BEFORE writing, ask: "What are the top 3 things that could make this hire fail or underperform in this exact role?"
- label: 3–5 word risk frame. "No Architectural Ownership", "Tenure Instability Risk", "Missing Domain Context", "Unverified Depth Claims", "Contributor-Only Track Record"
- body: Lead with the specific evidence that proves the gap. End with why it matters for THIS role. ≤ 260 chars.

━━━ SECTION 4 — DECISION REASON ━━━

decision_reason: EXACTLY 3 sentences. This is shown directly to HR as the shortlisting note.
S1: Decisive verdict — the top skill proven WHERE (company + metric/scope).
S2: Key gap or mismatch — what is missing or weak relative to the JD.
S3: Concrete recommendation: what to probe (shortlisted), what would tip the decision (borderline), or what would need to change (rejected).
Keep it under 400 characters total. No preamble, no hedging, no restating status.

━━━ SECTION 5 — CAREER TIMELINE ━━━

work_history_annotated (one entry per role from the structured resume):
- company, role, start_date ("MMM YYYY"), end_date ("MMM YYYY" or "Present"), duration_months, is_current
- recruiter_summary: EXACTLY 1–2 sentences. Structure: "[what they owned/built] using [tech stack]. [outcome or scale if available]."
  HARD LIMIT: ≤ 180 characters. No preamble like "In this role..." or "Responsible for...".
  Example: "Owned the real-time fraud detection pipeline in Python + Kafka. Reduced false-positive rate by 30% [EV-004]."
- technologies_used: [string] — copy from resume, max 6 items
- ownership_level: "owner"|"contributor"|"unclear"
- impact_strength: "high"|"medium"|"low"

━━━ SECTION 6 — SKILL RATINGS ━━━

skill_match_rows (6–12 items — JD-relevant skills only, technical skills only):
- name: canonical skill name
- stars: 1–5
  5 = multiple owner-level roles with this skill + quantified outcome
  4 = owner-level in one role OR contributor with strong outcome
  3 = contributor role with this skill, no strong outcome
  2 = project only (personal/academic)
  1 = skills-section mention only, no supporting evidence
- evidence_note: ONE phrase ≤ 60 chars. e.g. "3 yrs at Razorpay, prod scale" or "Personal project only" or "Skills section only"

skill_matching:
- matched_must: COPY verbatim from LOCKED SCORING RESULTS above.
- missing_must: COPY verbatim from LOCKED SCORING RESULTS above.
- matched_good: COPY verbatim from LOCKED SCORING RESULTS above.
- must_have_details: For each skill in matched_must, add one entry:
  - name: skill name (must match matched_must entry exactly)
  - evidence: 1 sentence — WHERE in the resume this skill is proven and HOW (company + role + outcome/scale). ≤ 140 chars.
    Example: "Built REST APIs at Razorpay using Node.js, serving 10M daily requests [EV-002]."

━━━ SECTION 7 — OTHER FIELDS ━━━

recruiter_snapshot (string — 3 sentences):
S1: What they can do TODAY — deepest skill + strongest role + best evidence [EV-id].
S2: How they match THIS role — must-haves matched/missed specifically.
S3: Biggest gap OR strongest differentiator.

experience_assessment: {{"years": {candidate_years}, "vs_required": "{candidate_years} yrs vs {jd_min_years} yrs required"}}

candidate_potential: {{"for_this_role": "High"|"Medium"|"Low"}}

Return ONLY valid JSON:
{{
  "recruiter_snapshot": "string",
  "fit_radar": {{"role_fit": 0, "tech_depth": 0, "proven_impact": 0, "hire_risk": 0, "growth_velocity": 0}},
  "fit_radar_notes": {{"role_fit": "string", "tech_depth": "string", "proven_impact": "string", "hire_risk": "string", "growth_velocity": "string"}},
  "skill_match_rows": [{{"name":"string","stars":0,"evidence_note":"string"}}],
  "skill_matching": {{
    "matched_must": ["string"],
    "missing_must": ["string"],
    "matched_good": ["string"],
    "must_have_details": [{{"name":"string","evidence":"string"}}]
  }},
  "experience_assessment": {{"years": {candidate_years}, "vs_required": "string"}},
  "work_history_annotated": [{{"company":"string","role":"string","start_date":"string","end_date":"string","duration_months":0,"is_current":false,"recruiter_summary":"string","technologies_used":["string"],"ownership_level":"string","impact_strength":"string"}}],
  "candidate_potential": {{"for_this_role": "string"}},
  "decision_reason": "string",
  "strengths": [{{"label":"string","body":"string"}},{{"label":"string","body":"string"}},{{"label":"string","body":"string"}}],
  "weaknesses": [{{"label":"string","body":"string"}},{{"label":"string","body":"string"}},{{"label":"string","body":"string"}}],
  "ai_summary": [
    {{"label":"Executive Summary","body":"string","tone":"emerald|amber|rose"}},
    {{"label":"JD Alignment","body":"string","tone":"emerald|amber|rose"}},
    {{"label":"Primary Risk","body":"string","tone":"rose"}}
  ]
}}
"""
