import sys
import json
import os
import re
import importlib
import warnings
from datetime import datetime

# Suppress all warnings to stderr to keep stdout pure for JSON
warnings.filterwarnings("ignore")


def load_optional_module(module_name):
    try:
        return importlib.import_module(module_name)
    except ImportError:
        return None


pdfplumber = load_optional_module("pdfplumber")
pymupdf4llm = load_optional_module("pymupdf4llm")
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()


def extract_text(file_path, type_="RESUME"):
    """
    Extract text from PDF or raw text file.
    """
    if file_path.lower().endswith(".pdf"):
        extraction_errors = []
        markdown_text = ""
        table_sections = []

        if pymupdf4llm is None:
            extraction_errors.append("PyMuPDF4LLM is not installed")
        else:
            try:
                markdown_text = extract_pdf_markdown(file_path)
            except Exception as e:
                extraction_errors.append(f"PyMuPDF4LLM failed: {str(e)}")

        # JDs rarely need structural table extraction, skip to save time (~5-10s)
        if type_ == "JD":
            if markdown_text:
                return markdown_text.strip()
            # fallback to plumber only if markdown failed
            
        if pdfplumber is None:
            extraction_errors.append("pdfplumber is not installed")
        else:
            try:
                table_sections = extract_tables_with_pdfplumber(file_path)
            except Exception as e:
                extraction_errors.append(f"pdfplumber failed: {str(e)}")

        extracted_parts = []
        if markdown_text:
            extracted_parts.append(markdown_text)

        if table_sections:
            extracted_parts.append(
                "## Extracted Tables\n\n" + "\n\n".join(table_sections)
            )

        combined_text = "\n\n".join(extracted_parts).strip()
        if combined_text:
            return combined_text

        details = (
            " | ".join(extraction_errors)
            if extraction_errors
            else "No content detected"
        )
        print(json.dumps({"error": f"PDF Extraction Error: {details}"}))
        sys.exit(1)
    else:
        # Assume it's a text file
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read().strip()
        except Exception as e:
            print(json.dumps({"error": f"Text File Error: {str(e)}"}))
            sys.exit(1)


def extract_pdf_markdown(file_path):
    if pymupdf4llm is None:
        return ""

    markdown_text = pymupdf4llm.to_markdown(file_path)
    return markdown_text.strip() if markdown_text else ""


def normalize_table_cell(cell):
    if cell is None:
        return ""

    text = str(cell).replace("\n", " ").strip()
    text = re.sub(r"\s+", " ", text)
    return text.replace("|", "\\|")


def table_to_markdown(table):
    if not table:
        return ""

    rows = []
    for row in table:
        if not row:
            continue

        normalized_row = [normalize_table_cell(cell) for cell in row]
        if any(normalized_row):
            rows.append(normalized_row)

    if not rows:
        return ""

    max_cols = max(len(row) for row in rows)
    padded_rows = [row + [""] * (max_cols - len(row)) for row in rows]
    header = padded_rows[0]
    body = padded_rows[1:]

    if not any(header):
        header = [f"column_{index + 1}" for index in range(max_cols)]

    lines = [
        "| " + " | ".join(header) + " |",
        "| " + " | ".join(["---"] * max_cols) + " |",
    ]
    for row in body:
        lines.append("| " + " | ".join(row) + " |")

    return "\n".join(lines)


def extract_tables_with_pdfplumber(file_path):
    extracted_tables = []

    if pdfplumber is None:
        return extracted_tables

    with pdfplumber.open(file_path) as pdf:
        for page_index, page in enumerate(pdf.pages, start=1):
            tables = page.extract_tables() or []
            for table_index, table in enumerate(tables, start=1):
                table_markdown = table_to_markdown(table)
                if table_markdown:
                    extracted_tables.append(
                        f"### Table {table_index} (Page {page_index})\n{table_markdown}"
                    )

    return extracted_tables


def normalize_skill(skill):
    """
    Normalize skill names for fuzzy matching.
    Handles React vs ReactJS vs React.js etc.
    """
    s = skill.lower().strip()
    # Remove common suffixes
    s = re.sub(r"\.js$", "", s)
    s = re.sub(r"js$", "", s)
    # Remove special characters and spaces
    s = re.sub(r"[\.\-\_\s\/]", "", s)
    # Common aliases
    aliases = {
        "nodejs": "node",
        "reactjs": "react",
        "vuejs": "vue",
        "angularjs": "angular",
        "postgresql": "postgres",
        "mongodb": "mongo",
        "amazonaws": "aws",
        "googlecloud": "gcp",
        "googlecloudplatform": "gcp",
        "microsoftazure": "azure",
        "machinelearning": "ml",
        "artificialintelligence": "ai",
        "expressjs": "express",
        "nextjs": "next",
        "nuxtjs": "nuxt",
        "tailwindcss": "tailwind",
        "typescriptlang": "typescript",
        "javascriptjs": "javascript",
    }
    return aliases.get(s, s)


def compute_score(jd_data, resume_data):
    """
    100% deterministic scoring.
    Same input = same score. Every single time.
    LLM never touches this function.

    Score breakdown:
      Must-have skills    : 55 pts
      Experience          : 25 pts
      Good-to-have skills : 10 pts
      Career signals      : 10 pts
    """

    # ── Pull data ──────────────────────────────────────────────
    jd_skills = jd_data.get("skills", {})

    # Handle both old format (list of strings) and new format (list of objects)
    raw_must = jd_skills.get("must_have", [])
    if raw_must and isinstance(raw_must[0], dict):
        jd_must_have = [(s["skill"], s.get("weight", "high")) for s in raw_must]
    else:
        jd_must_have = [(s, "high") for s in raw_must]

    raw_good = jd_skills.get("good_to_have", [])
    if raw_good and isinstance(raw_good[0], dict):
        jd_good_to_have = [s["skill"] for s in raw_good]
    else:
        jd_good_to_have = raw_good

    jd_min_years = jd_data.get("experience", {}).get("min_years")
    jd_max_years = jd_data.get("experience", {}).get("max_years")
    jd_seniority = jd_data.get("role_context", {}).get("seniority")
    jd_deal_breakers = jd_data.get("deal_breakers", [])

    resume_skills = resume_data.get("skills", {})

    # Handle both old format (strings) and new format (objects)
    raw_tech = resume_skills.get("technical", [])
    if raw_tech and isinstance(raw_tech[0], dict):
        resume_technical = [s["skill"] for s in raw_tech]
    else:
        resume_technical = raw_tech

    raw_tools = resume_skills.get("tools", [])
    if raw_tools and isinstance(raw_tools[0], dict):
        resume_tools = [s["tool"] for s in raw_tools]
    else:
        resume_tools = raw_tools

    cv_exp = resume_data.get("experience", {})
    candidate_years = cv_exp.get("total_years")
    candidate_seniority = cv_exp.get("seniority_level")
    career_pattern = resume_data.get("career_progression", {}).get("pattern", "unknown")
    resume_red_flags = resume_data.get("red_flags", [])

    # ── Build normalized resume skill set ─────────────────────
    all_resume_skills = resume_technical + resume_tools
    resume_normalized = {normalize_skill(str(s)): s for s in all_resume_skills}

    # ── 1. Must-have skill matching (55 pts) ──────────────────
    # Weight map: critical=3, high=2, medium=1
    weight_map = {"critical": 3, "high": 2, "medium": 1}

    matched_must = []
    missing_must = []
    total_weight = 0
    matched_weight = 0

    for skill, weight in jd_must_have:
        w = weight_map.get(weight, 2)
        total_weight += w
        if normalize_skill(str(skill)) in resume_normalized:
            matched_must.append(skill)
            matched_weight += w
        else:
            missing_must.append(skill)

    if total_weight > 0:
        skills_score = round((matched_weight / total_weight) * 55)
    else:
        skills_score = 40  # neutral if no must-haves defined

    # ── 2. Experience score (25 pts) ──────────────────────────
    exp_score = 0
    exp_status = "unknown"

    if jd_min_years is None and candidate_years is None:
        exp_score = 18  # both unknown — neutral
        exp_status = "neutral"
    elif jd_min_years is None:
        exp_score = 18
        exp_status = "neutral"
    elif candidate_years is None:
        exp_score = 12  # candidate years unknown — slight penalty
        exp_status = "unknown"
    elif candidate_years >= jd_min_years:
        exp_score = 25
        exp_status = "meets"
        # Bonus if significantly over-qualified check
        if jd_max_years and candidate_years > jd_max_years + 3:
            exp_status = "overqualified"
    elif candidate_years >= jd_min_years - 1:
        exp_score = 18  # within 1 year — partial credit
        exp_status = "close"
    elif candidate_years >= jd_min_years - 2:
        exp_score = 10
        exp_status = "below"
    else:
        exp_score = max(0, 25 - (jd_min_years - candidate_years) * 5)
        exp_status = "significantly_below"

    # ── 3. Good-to-have skills (10 pts) ───────────────────────
    matched_good = []
    for skill in jd_good_to_have:
        if normalize_skill(str(skill)) in resume_normalized:
            matched_good.append(skill)

    if jd_good_to_have:
        good_score = round((len(matched_good) / len(jd_good_to_have)) * 10)
    else:
        good_score = 5  # neutral

    # ── 4. Career signals (10 pts) ────────────────────────────
    career_score = 10  # start full, deduct for issues

    # Deduct for red flags
    for flag in resume_red_flags:
        severity = flag.get("severity", "low")
        if severity == "high":
            career_score -= 4
        elif severity == "medium":
            career_score -= 2
        elif severity == "low":
            career_score -= 1

    # Seniority match bonus/penalty
    seniority_map = {"junior": 1, "mid": 2, "senior": 3, "lead": 4, "manager": 5}
    if jd_seniority and candidate_seniority:
        jd_level = seniority_map.get(jd_seniority, 0)
        cand_level = seniority_map.get(candidate_seniority, 0)
        gap = abs(jd_level - cand_level)
        if gap == 0:
            pass  # perfect match
        elif gap == 1:
            career_score -= 1
        elif gap >= 2:
            career_score -= 3

    # Career progression bonus
    if career_pattern == "growing":
        career_score = min(10, career_score + 1)

    career_score = max(0, career_score)

    # ── 5. Final score ─────────────────────────────────────────
    total = skills_score + exp_score + good_score + career_score
    total = min(100, max(0, total))

    # ── 6. Hard rejection rules ────────────────────────────────
    hard_rejected = False
    rejection_reasons = []

    if jd_must_have:
        missing_ratio = len(missing_must) / len(jd_must_have)
        if missing_ratio > 0.5:
            hard_rejected = True
            rejection_reasons.append(
                f"Missing {len(missing_must)} of {len(jd_must_have)} must-have skills ({round(missing_ratio * 100)}%)"
            )

    if exp_status == "significantly_below" and jd_min_years:
        hard_rejected = True
        rejection_reasons.append(
            f"Experience {candidate_years}y is significantly below minimum {jd_min_years}y required"
        )

    high_flags = [f for f in resume_red_flags if f.get("severity") == "high"]
    if len(high_flags) >= 2:
        hard_rejected = True
        rejection_reasons.append(
            f"Multiple high-severity red flags: {', '.join([f.get('flag', 'Unknown') for f in high_flags])}"
        )

    # ── 7. Status determination ────────────────────────────────
    if hard_rejected:
        status = "Rejected"
    elif total >= 78:
        status = "Shortlisted"
    elif total >= 55:
        status = "Borderline"
    else:
        status = "Rejected"

    return {
        "score": total,
        "status": status,
        "breakdown": {
            "skills_score": skills_score,
            "skills_max": 55,
            "exp_score": exp_score,
            "exp_max": 25,
            "good_score": good_score,
            "good_max": 10,
            "career_score": career_score,
            "career_max": 10,
        },
        "skill_matching": {
            "matched_must": matched_must,
            "missing_must": missing_must,
            "matched_good": matched_good,
            "total_must": len(jd_must_have),
            "match_ratio": round(len(matched_must) / len(jd_must_have) * 100)
            if jd_must_have
            else 100,
        },
        "exp_status": exp_status,
        "hard_rejected": hard_rejected,
        "rejection_reasons": rejection_reasons,
        "candidate_years": candidate_years,
        "jd_min_years": jd_min_years,
    }


def generate_report(
    jd_data, resume_data, jd_raw_text, resume_raw_text, score_result, client
):
    """
    LLM writes ONLY the human-readable report.
    Score and status are already locked — LLM cannot change them.
    Model: gpt-4o for deep reasoning.
    Temperature: 0 for consistency.
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

    prompt = f"""You are a senior technical recruiter writing a candidate evaluation report.

The scoring engine has ALREADY computed the final score and status.
Your ONLY job is to write the human-readable sections of the report.
You CANNOT change the score or status. Work with what you are given.

═══════════════════════════════════════
LOCKED RESULTS — DO NOT CHANGE THESE
═══════════════════════════════════════
Final Score     : {total}/100
Status          : {status}
Skills Score    : {breakdown["skills_score"]}/{breakdown["skills_max"]}
Experience Score: {breakdown["exp_score"]}/{breakdown["exp_max"]}
Bonus Score     : {breakdown["good_score"]}/{breakdown["good_max"]}
Career Score    : {breakdown["career_score"]}/{breakdown["career_max"]}

Must-have matched : {json.dumps(matched)}
Must-have missing : {json.dumps(missing)}
Good-to-have matched: {json.dumps(matched_good)}
Experience status : {exp_status} 
  (Candidate: {candidate_years} yrs | Required: {jd_min_years} yrs)
{f"Hard rejection reasons: {json.dumps(score_result['rejection_reasons'])}" if score_result["hard_rejected"] else ""}

═══════════════════════════════════════
JOB DESCRIPTION DATA
═══════════════════════════════════════
{json.dumps(jd_data, indent=2)}

═══════════════════════════════════════
CANDIDATE RESUME DATA
═══════════════════════════════════════
{json.dumps(resume_data, indent=2)}

═══════════════════════════════════════
ORIGINAL JD TEXT (for context)
═══════════════════════════════════════
{jd_raw_text[:2000]}

═══════════════════════════════════════
ORIGINAL RESUME TEXT (for context)
═══════════════════════════════════════
{resume_raw_text[:2000]}

═══════════════════════════════════════
YOUR TASK
═══════════════════════════════════════

Write the evaluation report sections below.

STRICT RULES — violating these makes the report useless:
1. Every sentence must contain at least one specific noun — a skill name, company name, tool name, or number.
   BAD: "The candidate lacks relevant experience."
   GOOD: "The candidate has 2 years of experience vs the required 5, with no test engineering roles found."

2. Never mention a skill, company, or project that does not appear in the data above.

3. If status is Rejected — be honest and direct. Do not soften with false hope.
   If status is Shortlisted — highlight genuine strengths, still note real gaps.
   If status is Borderline — explain EXACTLY what would push them to Shortlisted.

4. strengths must have evidence. If you cannot find evidence → do not include that strength.

5. concerns must name specific missing skills or gaps — not generic statements.

6. if_you_interview_anyway must be specific probing questions, not generic interview advice.

Return ONLY valid JSON in this exact schema:

{{
  "recruiter_snapshot": "2 sentences max. Written like a recruiter briefing a colleague in 10 seconds. Name actual skills, role, company. Example: 'Vamsi is a Python/data-ops profile with 2 years at ABC Corp applying for an SDET role. Strong in workflow automation but missing core test engineering stack — Selenium, Java, CI/CD.'",

  "decision_breakdown": [
    {{
      "criteria": "skill or requirement name",
      "required": "Must-have | Good-to-have | Experience",
      "candidate_has": "Yes — with evidence" | "No" | "Partial — explain",
      "result": "pass" | "fail" | "partial",
      "note": "one line — why this matters or what was found"
    }}
  ],

  "strengths": [
    {{
      "point": "specific strength title",
      "evidence": "exact evidence from resume — company, project, or tool name"
    }}
  ],

  "concerns": [
    {{
      "point": "specific concern title",
      "missing_skills": [string],
      "impact": "why this gap matters for THIS role specifically"
    }}
  ],

  "experience_assessment": {{
    "years": {candidate_years},
    "vs_required": "{candidate_years} years vs {jd_min_years} years required",
    "quality": "2 sentences on WHAT they built across their career, not just how long",
    "relevance": "1 sentence on how their past work maps to this specific JD"
  }},

  "project_relevance": {{
    "rating": "High" | "Medium" | "Low" | "None",
    "reasoning": "Specific projects from resume that relate or don't relate to JD requirements"
  }},

  "red_flags": [
    {{
      "flag": string,
      "severity": "High" | "Medium" | "Low",
      "detail": "specific detail from resume"
    }}
  ],

  "candidate_potential": {{
    "for_this_role": "Low" | "Medium" | "High",
    "reasoning": "1-2 sentences specific to this candidate and this JD",
    "alternative_fit": "If rejected — what kind of role would this candidate actually be good for?"
  }},

  "ai_verdict": "3-4 sentences. The definitive recruiter verdict. Name the exact skills matched and missing. State the experience gap precisely. End with a clear recommendation — shortlist, borderline review, or reject — and one line on why."
}}
"""

    completion = client.chat.completions.create(
        model="gpt-4o",
        temperature=0,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a senior technical recruiter with 10 years of hiring experience. "
                    "You write specific, evidence-based evaluation reports. "
                    "You never use generic language. "
                    "Every point you make is backed by something specific from the resume or JD. "
                    "You are honest — if a candidate is weak, you say so clearly and specifically. "
                    "Output ONLY valid JSON. No markdown. No extra text."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
    )

    return json.loads(completion.choices[0].message.content)


def extract_data(text, type_):
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print(
            json.dumps(
                {"error": "OPENAI_API_KEY is not set in the environment or .env file."}
            )
        )
        sys.exit(1)

    try:
        client = OpenAI(api_key=api_key)
    except Exception as e:
        print(json.dumps({"error": f"Failed to initialize OpenAI client: {str(e)}"}))
        sys.exit(1)

    prompt = ""
    det_results = None

    if type_ == "JD":
        prompt = f"""You are a senior technical recruiter extracting structured data from a Job Description.
Your output will be used to score resumes and generate candidate evaluation reports.
Every field must be specific, accurate, and evidence-based — pulled directly from the JD text.

Return JSON in this exact schema:

{{
  "job_title": string,
  "company_name": string | null,
  "department": string | null,
  "work_type": "Remote" | "Hybrid" | "On-site",
  "employment_type": "Full-time" | "Part-time" | "Contract" | "Internship" | "Freelance" | null,
  "role_context": {{
    "seniority": "junior" | "mid" | "senior" | "lead" | "manager" | null,
    "team_size_hint": string | null,
    "work_style": "startup" | "enterprise" | "agency" | "unknown",
    "ic_or_manager": "ic" | "manager" | "both" | "unknown",
    "pace": "fast-paced" | "structured" | "unknown"
  }},
  "location": {{
    "city": string | null,
    "state": string | null,
    "country": string | null,
    "remote": boolean,
    "hybrid": boolean
  }},
  "experience": {{
    "min_years": number | null,
    "max_years": number | null,
    "preferred_background": string
  }},
  "skills": {{
    "must_have": [
      {{
        "skill": string,
        "why_needed": string,
        "weight": "critical" | "high" | "medium"
      }}
    ],
    "good_to_have": [
      {{
        "skill": string,
        "context": string
      }}
    ],
    "soft_skills": [string]
  }},
  "education": {{
    "required": string | null,
    "preferred": string | null
  }},
  "responsibilities_flat": [string],
  "responsibilities": [
    {{
      "task": string,
      "skills_involved": [string],
      "seniority_signal": "junior" | "mid" | "senior" | null
    }}
  ],
  "requirements": [string],
  "deal_breakers": [
    {{
      "condition": string,
      "reason": string
    }}
  ],
  "interview_signals": [
    {{
      "area": string,
      "what_to_probe": string,
      "why_it_matters": string
    }}
  ],
  "salary": {{
    "min": number | null,
    "max": number | null,
    "currency": string | null,
    "period": "yearly" | "monthly" | null
  }},
  "scoring_hints": {{
    "prioritize": string,
    "red_flags_to_watch": [string],
    "green_flags_to_reward": [string]
  }},
  "role_summary": string,
  "keywords": [string]
}}

Extraction Rules:

SKILLS:
- must_have: Only skills explicitly required or mandatory in the JD.
  weight "critical" = mentioned multiple times OR role cannot function without it
  weight "high" = clearly required, mentioned once
  weight "medium" = required but minor part of the role
  why_needed = one line on what this skill is used for in THIS role specifically
- good_to_have: Only skills listed as preferred, bonus, or nice-to-have.
  context = why this would help in this role
- soft_skills: Communication, leadership, teamwork etc. NEVER put technical tools here.
- Normalize all skill names: "experience in React.js" → "React.js", "exp with postgres" → "PostgreSQL"

WORK TYPE:
- If remote=true and hybrid=false → "Remote"
- If hybrid=true → "Hybrid"
- If neither mentioned → "On-site"

EXPERIENCE:
- Convert to numbers: "2-4 years" → min_years: 2, max_years: 4
- If fresher role → min_years: 0
- preferred_background: one line on what kind of prior experience suits this role

RESPONSIBILITIES:
- responsibilities_flat: Plain readable strings for frontend display. Preserve all tool/tech names exactly.
- responsibilities: Rich version with skills_involved and seniority_signal for scoring engine.
  seniority_signal: does this task suggest junior/mid/senior level work?

REQUIREMENTS:
- Flat list of candidate-facing requirements exactly as written in JD. Keep them readable.

DEAL BREAKERS:
- Only extract if JD explicitly mentions hard disqualifiers.
- Examples: "must have fintech experience", "only for Indian citizens", "no freshers"

INTERVIEW SIGNALS:
- Based on responsibilities and requirements, generate 3-5 areas an interviewer should probe.
- Be specific to this role — not generic interview advice.

SALARY:
- Convert "5-10 LPA" → min: 500000, max: 1000000, currency: "INR", period: "yearly"
- Convert "50-70k USD" → min: 50000, max: 70000, currency: "USD", period: "yearly"

ROLE SUMMARY:
- 2-3 sentences written like a senior recruiter briefing a colleague.
- What this role actually is, what kind of person succeeds, and what the hard requirements are.
- Do NOT copy-paste from the JD.

SCORING HINTS:
- prioritize: What matters most for THIS specific role
- red_flags_to_watch: What in a resume should concern a reviewer
- green_flags_to_reward: What in a resume should impress a reviewer

KEYWORDS:
- 10-15 keywords for resume matching. Focus on technical terms, domain, and role-specific language.

IMPORTANT: Output ONLY valid JSON. No markdown, no explanation, no extra text.

Job Description:
{text}
"""
    elif type_ == "RESUME":
        prompt = f"""You are a senior technical recruiter extracting structured data from a candidate resume.
Your output will be used to score this candidate against a job description and generate a detailed evaluation report.
Every field must be specific and evidence-based — pulled directly from the resume text.
Never invent or assume information that is not present in the resume.

Return JSON in this exact schema:

{{
  "full_name": string,
  "email": string | null,
  "phone": string | null,
  "location": {{
    "city": string | null,
    "state": string | null,
    "country": string | null
  }},
  "current_company": string | null,
  "current_role": string | null,
  "experience": {{
    "total_years": number | null,
    "career_start_year": number | null,
    "seniority_level": "junior" | "mid" | "senior" | "lead" | "manager" | null
  }},
  "work_history": [
    {{
      "company": string,
      "role": string,
      "duration_months": number | null,
      "start_year": number | null,
      "end_year": number | null,
      "is_current": boolean,
      "what_they_built": [string],
      "technologies_used": [string],
      "impact_signals": [string],
      "seniority_signal": "junior" | "mid" | "senior" | null
    }}
  ],
  "skills": {{
    "technical": [
      {{
        "skill": string,
        "evidence": string,
        "years_of_use": number | null
      }}
    ],
    "tools": [
      {{
        "tool": string,
        "evidence": string
      }}
    ],
    "soft_skills": [string]
  }},
  "education": [
    {{
      "degree": string,
      "field": string | null,
      "institution": string | null,
      "year": number | null
    }}
  ],
  "projects": [
    {{
      "name": string | null,
      "description": string,
      "technologies": [string],
      "impact": string | null,
      "scale": string | null
    }}
  ],
  "red_flags": [
    {{
      "flag": string,
      "severity": "high" | "medium" | "low",
      "detail": string
    }}
  ],
  "career_progression": {{
    "pattern": "growing" | "lateral" | "declining" | "mixed" | "early-career" | "unknown",
    "assessment": string
  }},
  "candidate_summary": string,
  "keywords": [string]
}}

Extraction Rules:

EXPERIENCE:
- total_years: Calculate from career_start_year to now if not explicitly stated. Round to 1 decimal.
- career_start_year: Year of first job or internship found in resume.
- seniority_level: Infer from role titles, responsibilities, and years — do not just use title.
  junior = 0-2 years, individual contributor, guided work
  mid = 2-5 years, independent execution, some ownership
  senior = 5+ years, owns outcomes, influences decisions
  lead/manager = leads a team or function

WORK HISTORY:
- Extract every role mentioned, most recent first.
- what_they_built: What did they actually create, build, or deliver? Be specific. Preserve tool and tech names.
- impact_signals: Numbers, scale, outcomes if mentioned (e.g. "reduced load time by 40%", "handled 1M requests/day").
  If no impact mentioned → empty array, do NOT invent numbers.
- technologies_used: Only tools/tech explicitly mentioned for this role.
- duration_months: Calculate from dates if provided. If "Present" → calculate to current month.
- seniority_signal: Does the work described sound junior, mid, or senior level?

SKILLS:
- technical: Languages, frameworks, libraries only.
  evidence = which company or project they used this skill at. If unclear → "mentioned in resume"
  years_of_use = estimate from work history. If cannot determine → null
- tools: Software, platforms, SaaS tools, cloud services, databases.
  evidence = where they used it
- soft_skills: ONLY genuine soft skills — communication, leadership, problem-solving etc.
  NEVER put technical tools, platforms, or domain knowledge here.
  If you are unsure whether something is a soft skill → put it in tools instead.

EDUCATION:
- Extract all degrees, certifications, and courses mentioned.
- If only certification and no degree → still extract.

PROJECTS:
- description: What was built and what problem it solved. Be specific.
- impact: Measurable outcome if mentioned. If not mentioned → null. Do NOT invent.
- scale: Users, requests, data volume if mentioned. If not mentioned → null.

RED FLAGS — extract only if genuinely present:
- "job_hopping": Multiple jobs under 12 months each with no explanation
- "gap": Unexplained employment gap over 6 months
- "vague_descriptions": Roles with no specifics — only generic duties listed
- "no_progression": Same role/level across multiple companies over many years
- "skill_mismatch": Skills listed don't align with any work history
- severity: high = likely dealbreaker, medium = worth probing, low = minor concern

CAREER PROGRESSION:
- pattern: Does the career show growth, lateral moves, or decline in seniority?
- assessment: One sentence on what the career arc looks like.

CANDIDATE SUMMARY:
- 2-3 sentences written like a recruiter briefing a colleague.
- What kind of professional is this person, what have they built, what level are they at.
- Be specific — name actual companies, tools, domains from the resume.
- Do NOT copy-paste from the resume's own summary section.

KEYWORDS:
- 10-15 keywords for JD matching. Focus on technical skills, domain, tools, and role types.

IMPORTANT:
- Never invent impact numbers, companies, or skills not present in the resume.
- If a field has no data → use null or empty array, never guess.
- Output ONLY valid JSON. No markdown, no explanation, no extra text.

Resume:
{text}"""
    elif type_ == "SCORE":
        try:
            raw = json.loads(text)
        except:
            raw = {}

        jd_data = raw.get("jd", {})
        resume_data = raw.get("resume", {})
        jd_raw_text = raw.get("jd_raw_text", "")
        resume_raw_text = raw.get("resume_raw_text", "")

        # ── 1. DETERMINISTIC SCORING (Python) ────────────────
        score_result = compute_score(jd_data, resume_data)

        # ── 2. HIGH-FIDELITY AI EVALUATION ───────────────────
        print(
            f"--- [AI] Synthesizing evaluation report for {resume_data.get('full_name', 'candidate')}... ---",
            file=sys.stderr,
            flush=True,
        )
        try:
            report = generate_report(
                jd_data, resume_data, jd_raw_text, resume_raw_text, score_result, client
            )
            # ── 3. ASSEMBLE FINAL OUTPUT ───────────────────────
            final_data = {
                "score": score_result["score"],
                "status": score_result["status"],
                "breakdown": score_result["breakdown"],
                "skill_matching": score_result["skill_matching"],
                "exp_status": score_result["exp_status"],
                "hard_rejected": score_result["hard_rejected"],
                "rejection_reasons": score_result["rejection_reasons"],
                "candidate_years": score_result["candidate_years"],
                "jd_min_years": score_result["jd_min_years"],
                **report,  # Spread report to top-level for frontend
            }
            return final_data
        except Exception as e:
            # Fallback reasoning if detailed report fails
            return {
                **score_result,
                "recruiter_snapshot": f"Automated evaluation completed with score {score_result['score']}.",
                "ai_verdict": f"Status: {score_result['status']}. Score: {score_result['score']}.",
            }

    # Model and temperature based on type
    model = "gpt-4o-mini" if type_ in ["JD", "RESUME"] else "gpt-4o"
    temperature = 0

    system_prompt = (
        "You are a senior technical recruiter with 10 years of experience. "
        "You extract precise, structured data from documents. "
        "Output ONLY valid JSON. Follow the schema exactly."
        if type_ in ["JD", "RESUME"]
        else "You are a senior recruiter reporting to a hiring manager. You translate technical data into high-quality hiring insights."
    )

    try:
        if type_ in ["JD", "RESUME"]:
            print(
                f"--- [AI] Extracting structured {type_} data... ---",
                file=sys.stderr,
                flush=True,
            )
        else:
            print(
                f"--- [AI] Processing {type_} task... ---", file=sys.stderr, flush=True
            )

        completion = client.chat.completions.create(
            model=model,
            temperature=temperature,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
        )
        content = completion.choices[0].message.content

        # Merge deterministic results with AI reasoning if it was a score request
        if type_ == "SCORE":
            # SCORE now returns enriched data directly from the if/elif block
            return content

        if content is None:
            raise ValueError("OpenAI returned empty content")

        return json.loads(content)
    except Exception as e:
        print(json.dumps({"error": f"OpenAI Error: {str(e)}"}))
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(
            json.dumps(
                {"error": "Usage: python scripts/extract_pdf.py <file_path> <type>"}
            )
        )
        sys.exit(1)

    file_path = sys.argv[1]
    type_ = sys.argv[2]

    if not os.path.exists(file_path):
        print(json.dumps({"error": f"File not found: {file_path}"}))
        sys.exit(1)

    if type_ == "SCORE":
        # For SCORE, file_path contains JSON { "resume": "...", "jd": "..." }
        with open(file_path, "r", encoding="utf-8") as f:
            text = f.read()
        data = extract_data(text, type_)
        print(json.dumps({"data": data}))
    else:
        # For JD or RESUME, file_path is a PDF/text file
        text = extract_text(file_path, type_)
        data = extract_data(text, type_)

        # Output to stdout for the backend
        print(json.dumps({"text": text, "data": data}))
