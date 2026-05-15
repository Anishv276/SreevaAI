"""
reporter.py - AI report generation ported from extract_pdf.py.
Fully self-contained. No dependency on extract_pdf.py.
"""
from __future__ import annotations
import json
import sys


def generate_report_inline(
    _jd_data, resume_data, jd_raw_text, resume_raw_text, score_result, client, report_model="gpt-4o-mini", screening_criteria=None
):
    """
    Full-fidelity AI report generation using gpt-4o-mini.
    Score and status are LOCKED by the deterministic engine — LLM only writes human-readable analysis.
    Every field the UI renders is produced here directly. No math fallbacks.
    """
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
    uncertain_areas_raw = resume_data.get("uncertain_areas", [])
    projects_raw = resume_data.get("projects", [])
    education_raw = resume_data.get("education", [])
    domain_skills = resume_data.get("skills", {}).get("domain_skills", [])
    candidate_name = resume_data.get("full_name", "the candidate")
    # Serialise structured context for the prompt
    wh_str = json.dumps(work_history_raw, indent=2) if work_history_raw else "[]"
    claims_str = json.dumps(core_claims_raw, indent=2) if core_claims_raw else "[]"
    depth_str = json.dumps(skill_depth_raw, indent=2) if skill_depth_raw else "[]"
    uncertain_str = json.dumps(uncertain_areas_raw, indent=2) if uncertain_areas_raw else "[]"
    projects_str = json.dumps(projects_raw, indent=2) if projects_raw else "[]"
    edu_str = json.dumps(education_raw, indent=2) if education_raw else "[]"
    domain_str = json.dumps(domain_skills) if domain_skills else "[]"
    screening_criteria_str = json.dumps(screening_criteria or {}, indent=2) if screening_criteria else "{}"
    prompt = f"""You are a Principal Technical Recruiter and Talent Intelligence expert with 15+ years of experience at tier-1 companies. You write the most insightful, evidence-grounded candidate evaluation reports in the industry.
The deterministic scoring engine has ALREADY computed the final score and status. These are LOCKED.
Your ONLY job: write deep, evidence-grounded human-readable analysis for every field below.
You CANNOT change the score, status, or breakdown numbers.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LOCKED SCORING RESULTS (READ ONLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Candidate           : {candidate_name}
Base Score          : {score_result["base_score"]}/100
Human Layer Score   : {score_result["human_layer"].get("human_score", total)}/100
Human Adjustment    : {score_result["human_layer"].get("human_adjustment", 0)}
Human Judgment      : {score_result["human_layer"].get("judgment", "Unknown")}
Final Score         : {total}/100
Status              : {status}
Criteria Match      : {breakdown["skills_score"]}/{breakdown["skills_max"]} pts
Experience Score    : {breakdown["exp_score"]}/{breakdown["exp_max"]} pts
Career Quality      : {breakdown["career_score"]}/{breakdown["career_max"]} pts
Good-to-have        : {breakdown["good_score"]}/{breakdown["good_max"]} pts
Domain Fit          : {breakdown.get("domain_score", 0)}/{breakdown.get("domain_max", 10)} pts
Must-have matched  : {json.dumps(matched)}
Must-have missing  : {json.dumps(missing)}
Good-to-have hits  : {json.dumps(matched_good)}
Experience status  : {exp_status} (candidate: {candidate_years} yrs | required: {jd_min_years} yrs)
{f"HARD REJECTION REASONS: {json.dumps(score_result['rejection_reasons'])}" if score_result["hard_rejected"] else "No hard rejection."}
Human layer summary: {score_result["human_layer"].get("summary", "")}
Human layer reasons: {json.dumps(score_result["human_layer"].get("reasons", []))}
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
{wh_str}
PROJECTS:
{projects_str}
EDUCATION:
{edu_str}
DOMAIN SKILLS:
{domain_str}
SCREENING CRITERIA:
{screening_criteria_str}
CORE CLAIMS (what the candidate asserts):
{claims_str}
SKILL DEPTH SIGNALS:
{depth_str}
UNCERTAIN AREAS (needs interview probing):
{uncertain_str}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FIELD INSTRUCTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. recruiter_snapshot (string)
   - 2-3 sentences. Start with candidate name.
   - Sentence 1: What can they do TODAY — name deepest skill, best evidence, strongest role.
   - Sentence 2: How well do they match THIS specific role — reference must-haves matched/missed.
   - Sentence 3: The single biggest gap or the single strongest differentiator.
   - Use company names, tools, metrics. ZERO vague adjectives ("strong", "passionate", "skilled").
2. fit_radar (object — all values 0–100, used directly in the radar chart)
   - "essentials": % of must-have skills confirmed with evidence (not just listed). Base on must-have match depth.
   - "experience": % experience fit. 100=meets/exceeds, 80=1yr short, 60=2yr short, 40=3yr short, 20=4+yr short.
   - "domain": % domain/contextual fit. Rate how well their industry background, domain skills, and JD scoring hints align.
   - "skills": % breadth of relevant technical skills confirmed across work history + projects (not just listed).
   - "evidence": % of the resume backed by strong proof signals: quantified outcomes, ownership, repeated work-history use, and role-relevant depth. 100=heavy proof, 50=mixed, 20=mostly listed-only.
   Each value must be independently justified — do NOT copy the score breakdown numbers directly.
3. skill_match_rows (array — 6–12 items, used in the "Skill signals" card)
   For each confirmed technical skill (from matched_must + matched_good + strong tools):
   - "name": canonical skill name
   - "stars": 1–5 rating of depth/evidence quality
     5 = multiple high-impact roles, metrics, owner-level; 4 = one strong role with evidence; 3 = used in work history but no clear outcomes; 2 = listed only or project-only; 1 = transferable/text mention only
   - "evidence_note": 1 short phrase. E.g. "Led 3 production deployments at Acme" or "Personal project only"
4. work_history_annotated (array — one entry PER role in WORK HISTORY)
   - "company": exact name
   - "role": exact title
   - "start_date": "MMM YYYY"
   - "end_date": "MMM YYYY" or "Present"
   - "duration_months": integer
   - "is_current": boolean
   - "company_type": "Product Startup" | "Service Company" | "Fortune 500" | "MNC" | "Agency" | "Freelance/Contract" | "Research/Academia" | "Early Stage Startup" | "Government/PSU"
   - "recruiter_summary": 2-3 sentences — what did they BUILD or DO, what tools, what scope, what outcome
   - "technologies_used": array of strings
   - "ownership_level": "owner" | "contributor" | "unclear"
   - "impact_strength": "high" | "medium" | "low"
   - "overlap_note": "Overlaps with [Company] by ~N months" or null
5. experience_assessment
   - "years": {candidate_years}
   - "vs_required": "{candidate_years} yrs vs {jd_min_years} yrs required"
   - "quality": rate the QUALITY of experience, not just years. E.g. "High — 3 owner-level roles with measurable outcomes"
   - "relevance": rate how relevant the experience domain is to THIS specific JD. E.g. "Strong — 2 of 3 companies were in same vertical"
6. candidate_potential
       - "for_this_role": "High" | "Medium" | "Low"
7. decision_reason (string — EXACTLY 3–4 sentences, this is the ONLY decision signal HR will read)
   This is the "why shortlisted / why rejected / why borderline" card. Write it so an HR manager reading ONLY this paragraph understands exactly what makes this candidate worth advancing or not.
   STRUCTURE (all 4 sentences must be present):
   - Sentence 1: The decisive verdict — what clinches shortlist, or what hard-blocks rejection. Name the top skill(s) and WHERE they were proven (company name + scope/metric). E.g. "At Razorpay, [Name] owned the full payments backend in Go, handling 2M+ daily transactions — directly matching 5 of 6 must-haves."
   - Sentence 2: Experience and ownership quality — years, seniority level, whether they were building or assisting, company type context. E.g. "With 6 years across two product startups, they held engineering lead responsibilities rather than support roles."
   - Sentence 3: The strongest differentiator OR the most important gap (whichever is most decision-relevant). Be specific. E.g. "The distributed systems depth — Kafka, Kubernetes, and Redis — is confirmed across three separate roles, not just listed."
   - Sentence 4: One concrete recommendation for the HR manager. Shortlisted: what to probe in interview. Borderline: what evidence would push them to shortlisted. Rejected: what would need to change for reconsideration. E.g. "Advance to technical screen; probe the system design ownership on the payment reconciliation project."
   RULES:
   - Every sentence must name a company, tool, project, or metric — no floating claims.
   - FORBIDDEN: "strong background", "passionate", "experienced in", "has worked with", "proficient", score numbers.
   - Tone: direct, professional, like a senior recruiter briefing a hiring manager in 30 seconds.
9. recruiter_snapshot is ALSO used as the "Screening summary" card bullets.
    Write it so it naturally splits into 3 bullet-sized insights when split on ". " — each sentence should stand alone.
    Return ONLY valid JSON matching this EXACT schema. No markdown. No code fences. No extra keys.
{{
  "recruiter_snapshot": "string",
  "fit_radar": {{
    "essentials": 0,
    "experience": 0,
    "domain": 0,
    "skills": 0,
    "evidence": 0
  }},
  "skill_match_rows": [
    {{"name":"string","stars":0,"evidence_note":"string"}}
  ],
  "experience_assessment": {{
    "years": {candidate_years},
    "vs_required": "{candidate_years} yrs vs {jd_min_years} yrs required",
    "quality": "string",
    "relevance": "string"
  }},
  "work_history_annotated": [
    {{
      "company":"string","role":"string","start_date":"string","end_date":"string",
      "duration_months":0,"is_current":false,"company_type":"string",
      "recruiter_summary":"string","technologies_used":["string"],
      "ownership_level":"owner|contributor|unclear","impact_strength":"high|medium|low",
      "overlap_note":"string|null"
    }}
  ],
  "candidate_potential": {{"for_this_role":"High|Medium|Low"}},
  "decision_reason": "string"
}}
"""
    completion = client.chat.completions.create(
        model=report_model,
        temperature=0,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a Principal Technical Recruiter and Talent Intelligence expert. "
                    "You produce world-class candidate evaluation reports used by hiring managers at top companies. "
                    "EVIDENCE DISCIPLINE: Every strength, concern, and claim MUST cite company name, tool, project, or metric. "
                    "FORBIDDEN words anywhere in output: 'strong communicator', 'team player', 'passionate', 'motivated', 'fast learner', 'detail-oriented', 'has experience with'. "
                    "REQUIRED evidence pattern: 'At [Company], [built/led/owned] [specific thing] using [tool] — [outcome/scale/metric]'. "
                    "TONE: Professional, factual, constructive. Rejected candidates get honest specific gaps, not unkind language. "
                    "DECISION BRIEF STYLE: Write decision_reason as a strict hiring recommendation, not a generic summary. "
                    "Avoid soft hedging terms and avoid motivational language. Use direct pass/fail reasoning tied to role requirements. "
                    "BIAS: Zero tolerance. No inference from name, nationality, gender, age, or education prestige alone. "
                    "fit_radar values are YOUR independent analytical judgment — do not copy score breakdown numbers. "
                    "Output ONLY valid JSON. No markdown. No code fences. No extra text outside the JSON object."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
    )
    report = json.loads(completion.choices[0].message.content)
    usage = getattr(completion, "usage", None)
    prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
    completion_tokens = getattr(usage, "completion_tokens", 0) or 0
    prompt_details = getattr(usage, "prompt_tokens_details", None)
    cached_tokens = getattr(prompt_details, "cached_tokens", 0) or 0
    return report, {
        "model": report_model,
        "inputTokens": prompt_tokens,
        "outputTokens": completion_tokens,
        "cachedInputTokens": cached_tokens,
    }

