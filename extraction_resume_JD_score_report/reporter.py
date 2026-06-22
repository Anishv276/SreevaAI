"""
reporter.py - Single LLM call that produces all human-readable fields for the resume report.
Score and status are LOCKED by the deterministic engine — this function only writes analysis.
"""
from __future__ import annotations
import json


def generate_report_inline(
    _jd_data, resume_data, jd_raw_text, resume_raw_text, score_result, client, report_model="gpt-4o-mini", screening_criteria=None
):
    matched = score_result["skill_matching"]["matched_must"]
    missing = score_result["skill_matching"]["missing_must"]
    matched_good = score_result["skill_matching"]["matched_good"]
    status = score_result["status"]
    total = score_result["score"]
    breakdown = score_result["breakdown"]
    candidate_years = score_result["candidate_years"]
    jd_min_years = score_result["jd_min_years"]
    exp_status = score_result["exp_status"]
    work_history_raw = resume_data.get("work_history", [])
    core_claims_raw = resume_data.get("core_claims", [])
    skill_depth_raw = resume_data.get("skills", {}).get("skill_depth", [])
    projects_raw = resume_data.get("projects", [])
    domain_skills = resume_data.get("skills", {}).get("domain_skills", [])
    candidate_name = resume_data.get("full_name", "the candidate")
    screening_criteria_str = json.dumps(screening_criteria or {}, indent=2) if screening_criteria else "{}"

    prompt = f"""You are a Principal Technical Recruiter with 15+ years at tier-1 companies.
The deterministic scoring engine has ALREADY computed the final score and status — these are LOCKED.
Your ONLY job: write sharp, evidence-grounded human-readable analysis for every field below.
You CANNOT change the score, status, or breakdown numbers.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LOCKED SCORING RESULTS (READ ONLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Candidate           : {candidate_name}
Final Score         : {total}/100  (Base: {score_result["base_score"]}, Human adjustment: {score_result["human_layer"].get("human_adjustment", 0)})
Status              : {status}
Human Judgment      : {score_result["human_layer"].get("judgment", "Unknown")}
Criteria Match      : {breakdown["skills_score"]}/{breakdown["skills_max"]} pts
Experience Score    : {breakdown["exp_score"]}/{breakdown["exp_max"]} pts
Career Quality      : {breakdown["career_score"]}/{breakdown["career_max"]} pts
Good-to-have        : {breakdown["good_score"]}/{breakdown["good_max"]} pts
Domain Fit          : {breakdown.get("domain_score", 0)}/{breakdown.get("domain_max", 10)} pts
Must-have matched   : {json.dumps(matched)}
Must-have missing   : {json.dumps(missing)}
Good-to-have hits   : {json.dumps(matched_good)}
Experience status   : {exp_status} (candidate: {candidate_years} yrs | required: {jd_min_years} yrs)
{f"HARD REJECTION REASONS: {json.dumps(score_result['rejection_reasons'])}" if score_result["hard_rejected"] else "No hard rejection."}
Human layer summary : {score_result["human_layer"].get("summary", "")}
Human layer reasons : {json.dumps(score_result["human_layer"].get("reasons", []))}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
JOB DESCRIPTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{jd_raw_text[:3500]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESUME RAW TEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{resume_raw_text[:4500]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRUCTURED RESUME DATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORK HISTORY:
{json.dumps(work_history_raw, indent=2) if work_history_raw else "[]"}
PROJECTS:
{json.dumps(projects_raw, indent=2) if projects_raw else "[]"}
DOMAIN SKILLS:
{json.dumps(domain_skills) if domain_skills else "[]"}
CORE CLAIMS:
{json.dumps(core_claims_raw, indent=2) if core_claims_raw else "[]"}
SKILL DEPTH SIGNALS:
{json.dumps(skill_depth_raw, indent=2) if skill_depth_raw else "[]"}
SCREENING CRITERIA:
{screening_criteria_str}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FIELD INSTRUCTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GLOBAL RULES (apply to every field):
- Every sentence MUST name a specific company, skill, tool, project, or metric from THIS resume.
- FORBIDDEN everywhere: "strong background", "passionate", "experienced in", "has worked with", "proficient", "demonstrates proficiency", "shows strong", "background in", "strong understanding of", score numbers.
- Tone: direct, factual, professional. Rejected candidates get honest specific gaps, not unkind language.
- BIAS: Zero tolerance. No inference from name, nationality, gender, age, or education prestige.

1. recruiter_snapshot (string — 3 sentences, used as the screening summary)
   - Sentence 1: What can they do TODAY — name deepest skill, strongest role, best evidence.
   - Sentence 2: How well do they match THIS role — reference must-haves matched/missed.
   - Sentence 3: The single biggest gap or the single strongest differentiator.
   Each sentence must stand alone as a bullet. No vague adjectives.

2. fit_radar (object — all values 0–100, shown as a pentagon radar chart)
   These are YOUR independent analytical judgments — do NOT copy score breakdown numbers.
   Fresher rule: if JD requires 0-2 yrs or role_level is intern/junior, score exp_depth against that bar (a fresher with relevant projects should score 60-75, not 15).

   - "must_haves": % of JD must-haves confirmed with work history or project evidence — NOT just listed.
     100=all confirmed; 80=80%+; 60=~60% or partial; 40=<half; 20=listed only, no proof; 0=none.
     CRITICAL: Every skill in missing_must pulls this DOWN. Every matched_must from work_history pulls it UP.

   - "exp_depth": % experience quality — years vs JD minimum + ownership level (owner > contributor > unclear) + building vs assisting.
     100=meets years + owner-level 2+ roles; 80=meets years, contributor; 60=1yr short, strong ownership; 40=2yr short or all-contributor; 20=3yr+ short; 0=no relevant exp.

   - "domain_fit": % industry/company-type alignment — measures ramp-time risk.
     100=exact domain + company-type match; 80=adjacent, fast ramp; 60=different but transferable; 40=mismatch, slow ramp; 20=unrelated; 0=opposite domain.
     Use work history business_domain fields. Unclear = 50.

   - "skill_breadth": % of confirmed (NOT listed) tech stack that is wide across distinct areas.
     100=5+ areas confirmed in work/projects; 80=4 areas; 60=3; 40=2; 20=1 narrow area; 0=none confirmed.
     A 20-skill skills section with no work proof = 20, not 80.

   - "evidence_quality": % of resume backed by verifiable proof — metrics, repeated use, ownership claims, system names.
     100=every major claim has a number/company/outcome; 80=most backed; 60=half backed; 40=mostly asserted; 20=skills list + job titles only; 0=entirely generic.
     0 impact signals + listed-only sources = 15-25.

3. fit_radar_notes (object — 1-2 sentences per axis, shown when HR hovers the radar point)
   Each note: state WHY the score is what it is, naming the specific skill/company/tool that drove it UP or DOWN.
   FORBIDDEN: generic axis descriptions, "the candidate has experience with", "shows proficiency in".
   EXAMPLES:
   - must_haves: "4 of 5 must-haves confirmed in work history — React, Node.js at Razorpay and AWS at Flipkart. Spring Boot is missing from all roles and projects."
   - exp_depth: "3 yrs vs 2 required — meets the bar. Owner-level at Swiggy (search infra solo) but contributor-only at the previous two roles."
   - domain_fit: "Both prior roles are B2C consumer apps — this JD is B2B SaaS fintech. Domain tooling (compliance, audit trails) is absent."
   - skill_breadth: "Confirmed in 3 areas: backend (Node.js, 2 roles), databases (PostgreSQL + Redis at Razorpay), cloud (AWS Lambda at Flipkart). Testing and CI/CD are listed-only."
   - evidence_quality: "6 impact signals — '40% latency reduction at Razorpay', '2M DAU at Swiggy'. 20 skills listed but only 8 appear in work history."

4. skill_match_rows (array — 6–12 items, used in the Skill Signals card)
   For each confirmed technical skill from matched_must + matched_good + strong tools:
   - "name": canonical skill name
   - "stars": 1–5 (5=multiple high-impact roles + metrics + owner-level; 4=one strong role with evidence; 3=work history, no clear outcomes; 2=project or listed only; 1=text mention only)
   - "evidence_note": 1 short phrase naming the company or project. E.g. "2 years at Razorpay, production scale" or "Personal project only"

5. work_history_annotated (array — one entry PER role in WORK HISTORY, powers the Career Timeline)
   - "company": exact name
   - "role": exact title
   - "start_date": "MMM YYYY"
   - "end_date": "MMM YYYY" or "Present"
   - "duration_months": integer
   - "is_current": boolean
   - "recruiter_summary": 2-3 sentences — what did they BUILD, what tools, what scope, what outcome. Name specifics.
   - "technologies_used": array of strings
   - "ownership_level": "owner" | "contributor" | "unclear"
   - "impact_strength": "high" | "medium" | "low"

6. experience_assessment
   - "years": {candidate_years}
   - "vs_required": "{candidate_years} yrs vs {jd_min_years} yrs required"

7. candidate_potential
   - "for_this_role": "High" | "Medium" | "Low"

8. decision_reason (string — EXACTLY 4 sentences — the ONLY shortlisting signal HR reads)
   - Sentence 1: The decisive verdict. Name top skill(s) and WHERE proven (company + scope/metric).
   - Sentence 2: Experience and ownership quality — years, seniority, building vs assisting, company type.
   - Sentence 3: Strongest differentiator OR most important gap — be specific, name the tool/company/metric.
   - Sentence 4: Concrete recommendation. Shortlisted: what to probe. Borderline: what evidence would push them through. Rejected: what would need to change.

9. strengths (array of exactly 3 items — shown in Evidence Highlights panel)
   Each item: "label" (3-5 word noun phrase naming the specific strength), "body" (1-2 sentences with evidence)
   - Label example: "Node.js ownership at Swiggy" — NOT "Strong Node.js background"
   - Body: what they built, at what scale, with what outcome. Name the company and tool.
   - Pick the 3 most hire-decision-relevant positives. Do not pad.

10. weaknesses (array of exactly 3 items — shown in Evidence Highlights panel)
    Each item: "label" (3-5 word noun phrase naming the specific gap), "body" (1-2 sentences)
    - Label example: "Kubernetes not evidenced" — NOT "Limited cloud experience"
    - Body: what is missing, why it matters for THIS role, what would resolve it.
    - FORBIDDEN: "may struggle with", "could benefit from", "lacks sufficient".

11. ai_summary (array of exactly 4 cards — shown in AI Summary panel)
    Each card: "label", "body" (max 2 sentences), "tone" ("emerald" | "amber" | "rose")
    Cards in this exact order:
    - "Core Skills": confirmed tech stack vs JD — name top 2-3 matched skills and what is missing. emerald=80%+ matched, amber=partial, rose=weak.
    - "Experience": years vs minimum + ownership — name the company where ownership was clearest. emerald=meets+owner, amber=close/contributor, rose=short 2+ yrs.
    - "Applied Depth": skills used in real work vs just listed — name the strongest applied evidence and biggest listed-only gap. emerald=majority in work history, amber=mixed, rose=mostly listed.
    - "Risks": the 1-2 specific things that would block or delay this hire. Always "rose". Name the skill, gap, or mismatch — no generic concerns.

Return ONLY valid JSON matching this EXACT schema. No markdown. No code fences. No extra keys.
{{
  "recruiter_snapshot": "string",
  "fit_radar": {{
    "must_haves": 0,
    "exp_depth": 0,
    "domain_fit": 0,
    "skill_breadth": 0,
    "evidence_quality": 0
  }},
  "fit_radar_notes": {{
    "must_haves": "string",
    "exp_depth": "string",
    "domain_fit": "string",
    "skill_breadth": "string",
    "evidence_quality": "string"
  }},
  "skill_match_rows": [
    {{"name":"string","stars":0,"evidence_note":"string"}}
  ],
  "experience_assessment": {{
    "years": {candidate_years},
    "vs_required": "{candidate_years} yrs vs {jd_min_years} yrs required"
  }},
  "work_history_annotated": [
    {{
      "company":"string","role":"string","start_date":"string","end_date":"string",
      "duration_months":0,"is_current":false,
      "recruiter_summary":"string","technologies_used":["string"],
      "ownership_level":"owner|contributor|unclear","impact_strength":"high|medium|low"
    }}
  ],
  "candidate_potential": {{"for_this_role":"High|Medium|Low"}},
  "decision_reason": "string",
  "strengths": [
    {{"label":"string","body":"string"}},
    {{"label":"string","body":"string"}},
    {{"label":"string","body":"string"}}
  ],
  "weaknesses": [
    {{"label":"string","body":"string"}},
    {{"label":"string","body":"string"}},
    {{"label":"string","body":"string"}}
  ],
  "ai_summary": [
    {{"label":"Core Skills","body":"string","tone":"emerald|amber|rose"}},
    {{"label":"Experience","body":"string","tone":"emerald|amber|rose"}},
    {{"label":"Applied Depth","body":"string","tone":"emerald|amber|rose"}},
    {{"label":"Risks","body":"string","tone":"rose"}}
  ]
}}
"""
    completion = client.chat.completions.create(
        model=report_model,
        temperature=0,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a Principal Technical Recruiter producing candidate evaluation reports for hiring managers. "
                    "EVIDENCE DISCIPLINE: every claim MUST cite company name, tool, project, or metric. "
                    "FORBIDDEN anywhere in output: 'strong communicator', 'team player', 'passionate', 'motivated', 'fast learner', 'detail-oriented', 'has experience with', score numbers in narrative text. "
                    "REQUIRED pattern: 'At [Company], [built/led/owned] [specific thing] using [tool] — [outcome/scale/metric]'. "
                    "BIAS: zero tolerance — no inference from name, nationality, gender, age, or education prestige. "
                    "Output ONLY valid JSON. No markdown. No code fences. No extra text outside the JSON object."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
    )
    report = json.loads(completion.choices[0].message.content)
    from billing.billing import extract_usage  # noqa: PLC0415
    return report, extract_usage(completion, report_model)
