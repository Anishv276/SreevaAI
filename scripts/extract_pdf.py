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
pytesseract = load_optional_module("pytesseract")
pdf2image = load_optional_module("pdf2image")
from PIL import Image
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
        
        # --- PDF OCR FALLBACK ---
        if not combined_text or (len(combined_text) < 100 and type_ == "JD"):
            if pytesseract and pdf2image:
                try:
                    ocr_text = extract_text_with_ocr(file_path)
                    if ocr_text:
                        combined_text = ocr_text
                except Exception as e:
                    extraction_errors.append(f"OCR failed: {str(e)}")
            else:
                extraction_errors.append("OCR modules (pytesseract/pdf2image) not installed for scanned PDF")

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


def extract_text_with_ocr(file_path):
    """
    Fallback for scanned PDFs using Tesseract OCR.
    """
    if not pdf2image or not pytesseract:
        return ""

    try:
        # Convert PDF to list of images
        images = pdf2image.convert_from_path(file_path)
        full_text = []

        for i, image in enumerate(images):
            # Perform OCR on each page
            page_text = pytesseract.image_to_string(image)
            if page_text.strip():
                full_text.append(f"## OCR Page {i+1}\n\n{page_text}")

        return "\n\n".join(full_text)
    except Exception as e:
        # Log to stderr to avoid breaking JSON stdout
        import sys
        print(f"OCR Internal Error: {str(e)}", file=sys.stderr)
        return ""


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
    # Canonical alias map — covers common resume vs JD naming divergences
    aliases = {
        # JS / Node ecosystem
        "nodejs": "node",
        "reactjs": "react",
        "vuejs": "vue",
        "angularjs": "angular",
        "expressjs": "express",
        "nextjs": "next",
        "nuxtjs": "nuxt",
        "tailwindcss": "tailwind",
        "typescriptlang": "typescript",
        "javascriptjs": "javascript",
        "js": "javascript",
        "ts": "typescript",
        # Python ecosystem
        "python3": "python",
        "py": "python",
        # Java ecosystem
        "springboot": "spring",
        "springframework": "spring",
        "hibernateorm": "hibernate",
        # Databases
        "postgresql": "postgres",
        "mongodb": "mongo",
        "elasticsearchdb": "elasticsearch",
        "mssql": "sqlserver",
        "microsoftsqlserver": "sqlserver",
        # Cloud
        "amazonaws": "aws",
        "amazonwebservices": "aws",
        "googlecloud": "gcp",
        "googlecloudplatform": "gcp",
        "microsoftazure": "azure",
        "azurecloud": "azure",
        # DevOps / infra
        "kubernetes": "k8s",
        "k8": "k8s",
        "dockercontainer": "docker",
        "githubactions": "cicd",
        "gitlabci": "cicd",
        "circleci": "cicd",
        "jenkin": "jenkins",
        "terraformiac": "terraform",
        # AI / ML / Data
        "machinelearning": "ml",
        "artificialintelligence": "ai",
        "deeplearning": "dl",
        "naturallanguageprocessing": "nlp",
        "largelanguagemodel": "llm",
        "llms": "llm",
        "generativeai": "genai",
        "aiml": "ml",
        "datascience": "data science",
        "apachespark": "spark",
        "apachekafka": "kafka",
        "apacheairflow": "airflow",
        # BI / Analytics
        "powerbi": "power bi",
        "msexcel": "excel",
        "microsoftexcel": "excel",
        "googleanalytics": "ga",
        "looker": "looker",
        # Automation / No-code
        "n8n": "n8n",
        "zapier": "zapier",
        # Mobile
        "reactnative": "react native",
        "flutterdev": "flutter",
        "swiftui": "swift",
        # Marketing / CRM / SaaS tools
        "hubspotcrm": "hubspot",
        "salesforcecrm": "salesforce",
        "googleads": "google ads",
        "metaads": "meta ads",
        "facebookads": "meta ads",
    }
    return aliases.get(s, s)


def _as_dict(value):
    """
    Safely coerce a value to a dict.
    If it's already a dict, return it. If it's a string, try to parse as JSON.
    Otherwise return {}.
    """
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


def compute_score(jd_data, resume_data, threshold=70):
    """
    Deterministic scoring engine. Same input = same score, every time.
    LLM never touches this function.

    Score breakdown (100 pts total):
      Must-have skills    : 45 pts  (depth-weighted: keyword + evidence quality)
      Experience          : 25 pts  (years + seniority alignment)
      Good-to-have skills : 10 pts
      Career quality      : 10 pts  (progression, red flags, impact signals)
      Domain fit          : 10 pts  (JD scoring hints, domain skills, non-tech roles)

    threshold: per-drive value from DB. Scores >= threshold = Shortlisted.
    """

    # ── Pull JD data ───────────────────────────────────────────
    jd_skills = jd_data.get("skills", {})

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

    jd_experience = _as_dict(jd_data.get("experience", {}))
    jd_min_years = jd_experience.get("min_years")
    jd_max_years = jd_experience.get("max_years")
    jd_seniority = _as_dict(jd_data.get("role_context", {})).get("seniority")
    has_tech = jd_data.get("has_technical_requirements", True)
    scoring_hints = _as_dict(jd_data.get("scoring_hints", {}))

    # ── Pull resume data ───────────────────────────────────────
    resume_skills = resume_data.get("skills", {})

    raw_tech = resume_skills.get("technical", [])
    # Build skill → evidence map for depth scoring
    skill_evidence_map = {}
    if raw_tech and isinstance(raw_tech[0], dict):
        for s in raw_tech:
            name = s.get("skill", "")
            evidence = s.get("evidence", "mentioned in resume")
            yrs = s.get("years_of_use")
            if name:
                skill_evidence_map[normalize_skill(name)] = {
                    "evidence": evidence, "years": yrs, "confidence": "high"
                }
        resume_technical = [s["skill"] for s in raw_tech]
    else:
        resume_technical = raw_tech

    raw_tools = resume_skills.get("tools", [])
    resume_tools = []
    if raw_tools and isinstance(raw_tools[0], dict):
        for s in raw_tools:
            tool_name = s.get("tool")
            confidence = s.get("confidence", "high")
            evidence = s.get("evidence", "mentioned in resume")
            if tool_name and confidence != "low":
                resume_tools.append(tool_name)
                norm = normalize_skill(tool_name)
                if norm not in skill_evidence_map:
                    skill_evidence_map[norm] = {
                        "evidence": evidence,
                        "years": None,
                        "confidence": confidence
                    }
    else:
        resume_tools = raw_tools

    cv_exp = resume_data.get("experience", {})
    candidate_years = cv_exp.get("total_years")
    candidate_seniority = cv_exp.get("seniority_level")
    career_pattern = resume_data.get("career_progression", {}).get("pattern", "unknown")
    resume_red_flags = resume_data.get("red_flags", [])
    work_history = resume_data.get("work_history", [])

    # ── Build comprehensive resume skill pool ──────────────────
    all_resume_skills = list(resume_technical) + resume_tools

    for job in work_history:
        for tech in job.get("technologies_used", []):
            if tech and isinstance(tech, str):
                all_resume_skills.append(tech)
                # Work history evidence = stronger signal
                norm = normalize_skill(tech)
                if norm not in skill_evidence_map:
                    skill_evidence_map[norm] = {
                        "evidence": job.get("company", "work history"),
                        "years": None,
                        "confidence": "high"
                    }

    for proj in resume_data.get("projects", []):
        for tech in proj.get("technologies", []):
            if tech and isinstance(tech, str):
                all_resume_skills.append(tech)
                norm = normalize_skill(tech)
                if norm not in skill_evidence_map:
                    skill_evidence_map[norm] = {
                        "evidence": proj.get("name", "project"),
                        "years": None,
                        "confidence": "medium"
                    }

    for kw in resume_data.get("keywords", []):
        if kw and isinstance(kw, str):
            all_resume_skills.append(kw)

    domain_skills = resume_skills.get("domain_skills", [])
    all_resume_skills.extend([s for s in domain_skills if s])

    # Deduplicate
    resume_normalized = {}
    for s in all_resume_skills:
        norm = normalize_skill(str(s))
        if norm and norm not in resume_normalized:
            resume_normalized[norm] = s

    # Full resume text for text-based matching
    resume_all_text = " ".join(filter(None, [
        resume_data.get("candidate_summary", ""),
        resume_data.get("career_progression", {}).get("analysis", ""),
        " ".join(kw for kw in resume_data.get("keywords", []) if kw),
        " ".join(
            " ".join(str(t) for t in job.get("technologies_used", []))
            for job in work_history
        ),
        " ".join(s for s in domain_skills if s),
    ])).lower()

    # ── 1. Must-have skill matching (45 pts) ──────────────────
    # Weight: critical=3, high=2, medium=1
    # Depth multiplier: skill backed by work history evidence gets 1.2x
    weight_map = {"critical": 3, "high": 2, "medium": 1}

    matched_must = []
    missing_must = []
    total_weight = 0
    matched_weight = 0

    for skill, weight in jd_must_have:
        w = weight_map.get(weight, 2)
        total_weight += w
        norm = normalize_skill(str(skill))
        if norm in resume_normalized:
            matched_must.append(skill)
            # Depth bonus: if evidenced in work history = 1.2x, project = 1.1x, medium confidence = 1.0x
            ev = skill_evidence_map.get(norm, {})
            if ev.get("confidence") == "high" and ev.get("evidence", "") not in ("mentioned in resume", ""):
                matched_weight += w * 1.2
            elif ev.get("confidence") == "medium":
                matched_weight += w * 1.0
            else:
                matched_weight += w * 0.85  # mentioned only, no context
        else:
            missing_must.append(skill)

    if total_weight > 0:
        skills_score = round((matched_weight / total_weight) * 45)
    elif not has_tech:
        # Non-tech role: score domain_skills against JD keywords instead of flat baseline
        jd_keywords = [k for k in jd_data.get("keywords", []) if k]
        if jd_keywords:
            kw_matched = sum(1 for k in jd_keywords if normalize_skill(k) in resume_normalized or k.lower() in resume_all_text)
            skills_score = round((kw_matched / len(jd_keywords)) * 45)
            for k in jd_keywords:
                if normalize_skill(k) in resume_normalized or k.lower() in resume_all_text:
                    matched_must.append(k)
                else:
                    missing_must.append(k)
        else:
            skills_score = 25  # no signal at all
    else:
        # Tech role but JD produced no must_have — use keywords as proxy
        jd_keywords = [k for k in jd_data.get("keywords", []) if k]
        if jd_keywords:
            kw_matched = sum(1 for k in jd_keywords if normalize_skill(k) in resume_normalized)
            skills_score = round((kw_matched / len(jd_keywords)) * 45)
            for k in jd_keywords:
                if normalize_skill(k) in resume_normalized:
                    matched_must.append(k)
                else:
                    missing_must.append(k)
        else:
            skills_score = 20  # last resort

    skills_score = min(45, skills_score)

    # ── 2. Experience score (25 pts) ──────────────────────────
    exp_score = 0
    exp_status = "unknown"
    seniority_map = {"intern": 0, "junior": 1, "mid": 2, "senior": 3, "lead": 4, "manager": 5}

    if jd_min_years is None and candidate_years is None:
        exp_score = 17
        exp_status = "neutral"
    elif jd_min_years is None:
        # No requirement — give credit proportionally to seniority match
        exp_score = 17
        exp_status = "neutral"
    elif candidate_years is None:
        exp_score = 10
        exp_status = "unknown"
    elif candidate_years >= jd_min_years:
        if jd_max_years and candidate_years > jd_max_years + 3:
            exp_score = 20  # overqualified — slight reduction
            exp_status = "overqualified"
        else:
            exp_score = 25
            exp_status = "meets"
    elif candidate_years >= jd_min_years - 1:
        exp_score = 19  # 1 year short — very close
        exp_status = "close"
    elif candidate_years >= jd_min_years - 2:
        exp_score = 13
        exp_status = "below"
    elif candidate_years >= jd_min_years - 3:
        exp_score = 7
        exp_status = "significantly_below"
    else:
        exp_score = max(0, 5 - (jd_min_years - candidate_years - 3))
        exp_status = "significantly_below"

    # Seniority alignment adjustment (±4 pts within exp budget)
    if jd_seniority and candidate_seniority:
        jd_level = seniority_map.get(jd_seniority, 0)
        cand_level = seniority_map.get(candidate_seniority, 0)
        gap = cand_level - jd_level  # positive = overqualified, negative = underqualified
        if gap == 0:
            exp_score = min(25, exp_score + 2)   # perfect seniority match bonus
        elif gap == -1:
            pass  # 1 level below: no change
        elif gap == 1:
            exp_score = max(0, exp_score - 1)    # 1 level above: slight penalty
        elif gap <= -2:
            exp_score = max(0, exp_score - 4)    # significantly under-leveled
        elif gap >= 2:
            exp_score = max(0, exp_score - 3)    # significantly over-leveled

    exp_score = max(0, min(25, exp_score))

    # ── 3. Good-to-have skills (10 pts) ───────────────────────
    matched_good = []
    for skill in jd_good_to_have:
        if normalize_skill(str(skill)) in resume_normalized:
            matched_good.append(skill)

    if jd_good_to_have:
        good_score = round((len(matched_good) / len(jd_good_to_have)) * 10)
    else:
        good_score = 5

    # ── 4. Career quality (10 pts) ────────────────────────────
    # Starts at 5, can go up to 10 or down to 0
    career_score = 5

    # Impact signals are a strong positive — shows candidates deliver measurable outcomes
    total_impact_signals = sum(len(job.get("impact_signals", [])) for job in work_history)
    if total_impact_signals >= 3:
        career_score += 3
    elif total_impact_signals >= 1:
        career_score += 1

    # Career progression
    if career_pattern == "growing":
        career_score += 2
    elif career_pattern == "lateral":
        career_score += 1
    elif career_pattern == "declining":
        career_score -= 2

    # Red flags deductions
    for flag in resume_red_flags:
        severity = flag.get("severity", "low")
        if severity == "high":
            career_score -= 3
        elif severity == "medium":
            career_score -= 1
        # low severity: no deduction (minor, not disqualifying)

    # Education when explicitly required
    jd_edu = _as_dict(jd_data.get("education", {}))
    candidate_edu = resume_data.get("education", [])
    if jd_edu.get("required") and not candidate_edu:
        career_score -= 2

    career_score = max(0, min(10, career_score))

    # ── 5. Domain fit (10 pts) ────────────────────────────────
    # Uses JD scoring hints + domain skills match
    domain_score = 5  # neutral baseline

    if scoring_hints:
        for green in scoring_hints.get("green_flags_to_reward", []):
            if green and (
                normalize_skill(green) in resume_normalized
                or green.lower() in resume_all_text
            ):
                domain_score = min(10, domain_score + 2)

        for red in scoring_hints.get("red_flags_to_watch", []):
            if red and red.lower() in resume_all_text:
                domain_score = max(0, domain_score - 2)

    # For non-tech roles: domain_skills match against JD preferred background
    if not has_tech:
        jd_background = jd_experience.get("preferred_background", "").lower()
        if jd_background:
            domain_matches = sum(
                1 for s in domain_skills
                if s and (normalize_skill(s) in resume_normalized or s.lower() in jd_background)
            )
            if domain_matches >= 3:
                domain_score = min(10, domain_score + 2)
            elif domain_matches >= 1:
                domain_score = min(10, domain_score + 1)

    domain_score = max(0, min(10, domain_score))

    # ── 6. Final score ────────────────────────────────────────
    total = skills_score + exp_score + good_score + career_score + domain_score
    total = min(100, max(0, total))

    # ── 7. Hard rejection rules ───────────────────────────────
    hard_rejected = False
    rejection_reasons = []

    if jd_must_have:
        missing_ratio = len(missing_must) / len(jd_must_have)
        # Reject if missing >60% of must-haves (raised from 50% to reduce false rejections)
        if missing_ratio > 0.60:
            hard_rejected = True
            rejection_reasons.append(
                f"Missing {len(missing_must)} of {len(jd_must_have)} must-have skills ({round(missing_ratio * 100)}%)"
            )

    if exp_status == "significantly_below" and jd_min_years and candidate_years is not None:
        if (jd_min_years - candidate_years) >= 3:
            hard_rejected = True
            rejection_reasons.append(
                f"Experience {candidate_years}y is {jd_min_years - candidate_years}y below minimum {jd_min_years}y required"
            )

    # Only hard-reject for 2+ HIGH severity flags (single high flag = deduction, not rejection)
    high_flags = [f for f in resume_red_flags if f.get("severity") == "high"]
    if len(high_flags) >= 2:
        hard_rejected = True
        rejection_reasons.append(
            f"Multiple high-severity red flags: {', '.join([f.get('flag', 'Unknown') for f in high_flags])}"
        )

    # ── 8. Status determination ───────────────────────────────
    borderline_floor = max(0, threshold - 10)
    if hard_rejected:
        status = "Rejected"
    elif total >= threshold:
        status = "Shortlisted"
    elif total >= borderline_floor:
        status = "Borderline"
    else:
        status = "Rejected"

    return {
        "score": total,
        "status": status,
        "breakdown": {
            "skills_score": skills_score,
            "skills_max": 45,
            "exp_score": exp_score,
            "exp_max": 25,
            "good_score": good_score,
            "good_max": 10,
            "career_score": career_score,
            "career_max": 10,
            "domain_score": domain_score,
            "domain_max": 10,
        },
        "skill_matching": {
            "matched_must": matched_must,
            "missing_must": missing_must,
            "matched_good": matched_good,
            "total_must": len(jd_must_have),
            "match_ratio": round(len(matched_must) / len(jd_must_have) * 100)
            if jd_must_have
            else 100,
            "must_have_details": [
                {
                    "name": s[0],
                    "weight": s[1],
                    "status": "found" if normalize_skill(s[0]) in resume_normalized and skill_evidence_map.get(normalize_skill(s[0]), {}).get("confidence") == "high" and skill_evidence_map.get(normalize_skill(s[0]), {}).get("evidence", "") not in ("mentioned in resume", "") 
                              else "mentioned" if normalize_skill(s[0]) in resume_normalized 
                              else "not_found"
                } for s in jd_must_have
            ]
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

    # Build work history context for the LLM to annotate
    work_history_raw = resume_data.get("work_history", [])
    work_history_str = json.dumps(work_history_raw, indent=2) if work_history_raw else "[]"

    prompt = f"""You are a senior technical recruiter writing a world-class candidate evaluation report.

The scoring engine has ALREADY computed the final score and status.
Your ONLY job is to write the human-readable sections. You CANNOT change the score or status.

═══════════════════════════════════════
LOCKED RESULTS — DO NOT CHANGE THESE
═══════════════════════════════════════
Final Score     : {total}/100
Status          : {status}
Skills Score    : {breakdown["skills_score"]}/{breakdown["skills_max"]}
Experience Score: {breakdown["exp_score"]}/{breakdown["exp_max"]}
Good-to-have    : {breakdown["good_score"]}/{breakdown["good_max"]}
Career Quality  : {breakdown["career_score"]}/{breakdown["career_max"]}
Domain Fit      : {breakdown.get("domain_score", 0)}/{breakdown.get("domain_max", 10)}

Must-have matched : {json.dumps(matched)}
Must-have missing : {json.dumps(missing)}
Good-to-have matched: {json.dumps(matched_good)}
Experience status : {exp_status}
  (Candidate: {candidate_years} yrs | Required: {jd_min_years} yrs)
{f"Hard rejection reasons: {json.dumps(score_result['rejection_reasons'])}" if score_result["hard_rejected"] else ""}

═══════════════════════════════════════
JOB DESCRIPTION RAW TEXT
═══════════════════════════════════════
{jd_raw_text[:3000]}

═══════════════════════════════════════
RESUME RAW TEXT
═══════════════════════════════════════
{resume_raw_text[:4000]}

═══════════════════════════════════════
WORK HISTORY (structured — annotate each role)
═══════════════════════════════════════
{work_history_str}

═══════════════════════════════════════
FIELD-BY-FIELD INSTRUCTIONS — READ EVERY LINE
═══════════════════════════════════════

1. recruiter_snapshot:
   - EXACTLY 2-3 sentences. Start with the candidate's name if known, otherwise "This candidate".
   - Name actual companies and skills. Be direct. No vague adjectives.
   - Example: "Aditya brings 4 years of Python and React experience across two product startups (Zepto, Groww). Strong backend depth with measurable delivery but no enterprise-scale exposure, which is the primary gap for this role."

2. strengths (MUST return MINIMUM 3, MAXIMUM 5):
   - Each strength must be a distinct, specific capability with hard evidence.
   - "point": headline (e.g., "Proven Python backend at scale")
   - "evidence": cite company, project, tool, or metric. Pattern: "At [Company], [built/led/shipped] [thing] using [tool] — [outcome or scale]."
   - FORBIDDEN: "strong communicator", "team player", "passionate", "has experience with"

3. concerns (MUST return MINIMUM 3, MAXIMUM 5):
   - Each concern must be a concrete, role-specific gap — not a vague statement.
   - "point": the gap headline (e.g., "No enterprise AWS deployment experience")
   - "missing_skills": list the exact skill names missing (use same normalized names as JD must-haves)
   - "impact": explain precisely WHY this gap matters for THIS role. Name what they'd fail to do on day 1.

4. work_history_annotated — ANNOTATE EVERY ROLE:
   For EACH role in the WORK HISTORY section above, produce one entry:
   - "company": exact company name from the resume
   - "role": exact job title from the resume
   - "start_date": formatted as "MMM YYYY" (e.g., "Jan 2022") — extract from resume text
   - "end_date": "MMM YYYY" or "Present" if current
   - "duration_months": integer
   - "is_current": true/false
   - "company_type": classify as one of: "Product Startup", "Service Company", "Fortune 500", "MNC", "Agency", "Freelance/Contract", "Research/Academia", "Early Stage Startup", "Government/PSU"
   - "recruiter_summary": 2-3 sentences. What did they actually BUILD or DO here? Name tools, scope, outcomes. Pattern: "Built X using Y for Z users/clients. Led/Contributed to [initiative]. Key outcome: [metric or impact]."
   - "technologies_used": list of tech/tools actually used in this role (from resume context)
   - "overlap_note": if this role's dates overlap with another role, flag it. Format: "Overlaps with [Company] by ~N months." Otherwise null.

5. integrity_signals — DATE MATH & EVIDENCE:
   - Calculate ALL role overlaps from start/end dates. Do NOT skip any.
   - For each signal: "level" = Low/Medium/High, "label" = short title, "summary" = 1 line, "details" = specific evidence.
   - Short tenures (<8 months) get a Low or Medium flag with context (intern/contract/layoff = Low; unexplained exit = Medium).
   - If resume has no anomalies → return ONE Low signal: {{ "level": "Low", "label": "No anomalies detected", "summary": "All dates consistent and verifiable", "details": "No gaps, overlaps, or title inflation identified." }}

6. suitability_analysis — HYPER-SPECIFIC:
   - suggestions: 3-5 items. Each must name a SPECIFIC tool, platform, or project type.
     BAD: "Learn cloud computing"
     GOOD: "Get AWS Solutions Architect Associate certified — this role requires independent infra ownership"
   - readiness_timeline: realistic range like "Immediately — strong match", "3-6 months", "6-12 months", "12-18 months"

7. seniority_alignment:
   - candidate_level and jd_level: 0=Intern, 1=Junior, 2=Mid, 3=Senior, 4=Lead/Principal
   - candidate_label and jd_label: human-readable e.g., "Mid-level", "Senior", "Lead"

8. career_progression_details:
   - pattern: e.g., "Linear Upward", "Cross-functional Pivot", "Lateral (same level)", "Declining", "Freelance/Portfolio"
   - role_flow: one sentence describing the career arc (e.g., "SDE → Senior SDE → Tech Lead at increasing company sizes")
   - company_types: comma-separated summary (e.g., "Early Stage Startup, Product Startup, MNC")
   - tenure_avg: e.g., "14 months average" — calculate from actual durations
   - pattern_note, company_note, tenure_note: one-line recruiter commentary on each dimension

9. decision_reason — THE SHARP LINE:
   - EXACTLY 1 sentence. The single most decisive reason for the status verdict.
   - If Shortlisted: "What clinches it." e.g., "5 of 6 must-haves confirmed with direct project evidence across 3 companies."
   - If Borderline: "What tips it." e.g., "Strong Python depth but zero cloud deployment experience in a role that requires day-1 AWS ownership."
   - If Rejected: "The hard stopper." e.g., "Missing 4 of 5 must-have skills with no transferable evidence across any role."
   - No hedging. No softening. One precise, recruiter-grade sentence.

10. ai_verdict:
    - 3-5 sentences. Executive summary combining score, key strengths, critical gaps, and recommendation.
    - Name companies and skills. Ground every claim in evidence from the resume.

Return ONLY valid JSON in this EXACT schema (no markdown, no code fences):

{{
  "recruiter_snapshot": "string",
  "decision_breakdown": [
    {{
      "criteria": "string",
      "required": "Must-have | Good-to-have | Experience",
      "candidate_has": "Yes — with evidence | No | Partial",
      "result": "pass | fail | partial",
      "note": "string"
    }}
  ],
  "strengths": [
    {{ "point": "string", "evidence": "string" }}
  ],
  "concerns": [
    {{ "point": "string", "missing_skills": ["string"], "impact": "string" }}
  ],
  "experience_assessment": {{
    "years": {candidate_years},
    "vs_required": "{candidate_years} years vs {jd_min_years} years required",
    "quality": "string",
    "relevance": "string"
  }},
  "work_history_annotated": [
    {{
      "company": "string",
      "role": "string",
      "start_date": "string",
      "end_date": "string",
      "duration_months": 0,
      "is_current": false,
      "company_type": "string",
      "recruiter_summary": "string",
      "technologies_used": ["string"],
      "overlap_note": "string | null"
    }}
  ],
  "project_relevance": {{ "rating": "High | Medium | Low", "reasoning": "string" }},
  "integrity_signals": [
    {{
      "level": "Low | Medium | High",
      "label": "string",
      "summary": "string",
      "details": "string"
    }}
  ],
  "suitability_analysis": {{
    "suggestions": ["string"],
    "readiness_timeline": "string"
  }},
  "candidate_potential": {{ "for_this_role": "Low | Medium | High", "reasoning": "string" }},
  "seniority_alignment": {{
    "candidate_level": 0,
    "jd_level": 0,
    "candidate_label": "string",
    "jd_label": "string"
  }},
  "career_progression_details": {{
    "pattern": "string",
    "role_flow": "string",
    "company_types": "string",
    "tenure_avg": "string",
    "pattern_note": "string",
    "company_note": "string",
    "tenure_note": "string"
  }},
  "decision_reason": "string",
  "ai_verdict": "string",
  "interview_questions": [
    {{ "question": "string", "intent": "string", "based_on": "string" }}
  ]
}}
"""

    completion = client.chat.completions.create(
        model="gpt-4o",
        temperature=0,
        messages=[
            {
                "role": "system",
                "content": (
                    # Transferable skills — credit non-obvious domain competencies
                    "A Marketing analyst running A/B tests has statistical thinking. "
                    "A banker automating reconciliation has process automation skills. Credit these when relevant. "

                    # Evidence discipline — no vague adjectives, only concrete facts
                    "EVIDENCE DISCIPLINE: Every strength, gap, and claim MUST cite a company name, tool name, "
                    "project name, or metric. FORBIDDEN: 'strong communicator', 'team player', 'has experience with', "
                    "'passionate', 'motivated'. "
                    "REQUIRED pattern: 'At [Company], built [thing] using [tool] that [outcome]'. "

                    # Tone standards — professional, respectful, constructive
                    "TONE STANDARDS (NON-NEGOTIABLE): "
                    "Write in professional, respectful, and constructive language at all times. "
                    "If status is Rejected — be specific and factual about what is missing, but never dismissive or unkind. "
                    "Frame gaps as 'requires development in X' or 'no evidence of Y found' — NOT as personal failures. "
                    "If status is Borderline — explain PRECISELY what skills or experience would move them to Shortlisted. "
                    "Every candidate, regardless of outcome, deserves a report that is fair, accurate, and professional. "

                    # Bias prohibition
                    "No hallucinations. No gender, age, nationality, or name-based bias. "
                    "Do not infer personality, attitude, or cultural fit from resume alone. "

                    # Output format
                    "Output ONLY valid JSON. No markdown. No code fences. No extra text."
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
        prompt = f"""You are a senior technical recruiter and structured data engineer.
Your job is to extract a precise, bias-free, machine-readable JSON object from a Job Description.
This output is consumed by an automated scoring engine that matches hundreds of resumes.
Every field you produce directly affects hiring decisions — accuracy and fairness are non-negotiable.

════════════════════════════════════════════════
BEFORE YOU EXTRACT — MANDATORY PRE-CHECKS
════════════════════════════════════════════════

1. SOFT SKILLS NEVER GO IN must_have OR good_to_have
   Communication, problem-solving, teamwork, leadership, ownership, willingness to learn —
   these are NEVER technical skills. They belong ONLY in soft_skills.
   If a JD has no real technical must-haves → must_have = []
   A scoring engine will try to match must_have against resumes. Soft skills WILL break scoring.

2. GENDER AND BIAS NEUTRALITY
   Strip all gendered language from extracted text:
     "he/she" → "the candidate"
     "guys", "rockstar", "ninja", "guru", "hustler" → remove or neutralize
     "recent graduate" with age implication → keep as "entry-level"
   Never infer or state gender. Never use language that implies cultural fit bias.

3. LOCATION — NEVER ASSUME
   If no city/state/country is mentioned → all location fields = null
   Do NOT infer location from company name, language, or currency.
   If remote=true is stated → work_type = "Remote", hybrid = false
   If hybrid is stated → work_type = "Hybrid", remote = false
   If neither is stated → work_type = "On-site", but remote=false, hybrid=false, city/state/country = null
   NEVER set work_type = "On-site" and leave all location fields null without flagging it.

4. EXPERIENCE — NUMBERS ONLY
   Convert all text ranges to numbers: "2-4 years" → min_years: 2, max_years: 4
   Fresher/entry-level/0 experience → min_years: 0, max_years: 1
   "5+ years" → min_years: 5, max_years: null
   If no experience mentioned → min_years: null, max_years: null
   NEVER guess experience from seniority title alone.

5. SKILL NORMALIZATION — CONSISTENT NAMES
   Always use the canonical form:
     React.js / ReactJS / React JS → "React"
     Node.js / NodeJS → "Node.js"
     Postgres / PostgreSQL / postgres → "PostgreSQL"
     AWS / Amazon Web Services → "AWS"
     GCP / Google Cloud / Google Cloud Platform → "GCP"
     MS Azure / Microsoft Azure → "Azure"
     JS / Javascript / javascript → "JavaScript"
     TS / Typescript → "TypeScript"
     ML / Machine Learning → "Machine Learning"
     AI tools / artificial intelligence tools → "AI Tools"
     n8n / N8N → "n8n"
   When in doubt: use the official product name exactly as the vendor writes it.

6. MUST-HAVE vs GOOD-TO-HAVE — STRICT CLASSIFICATION
   must_have: ONLY skills the JD marks as required, mandatory, must have, essential.
     weight = "critical" if mentioned 2+ times OR the role cannot function without it
     weight = "high" if clearly required, mentioned once
     weight = "medium" if required but a minor part of the role
   good_to_have: ONLY skills listed as preferred, bonus, nice-to-have, plus, or advantageous.
   If a skill is ambiguous → classify as good_to_have, never must_have.
   If must_have ends up empty because the JD has no real technical requirements → that is correct.

7. SALARY STANDARDIZATION
   Always convert to annual base numbers in the local currency:
     "5-10 LPA INR" → min: 500000, max: 1000000, currency: "INR", period: "yearly"
     "50-70k USD" → min: 50000, max: 70000, currency: "USD", period: "yearly"
     "₹30,000/month" → min: 360000, max: null, currency: "INR", period: "yearly"
   If salary not mentioned → min: null, max: null, currency: null, period: null, disclosed: false

8. DEAL BREAKERS — ONLY IF EXPLICIT
   Only extract if the JD explicitly states a hard disqualifier.
   Examples of valid deal breakers: "must be based in X city", "only Indian nationals", "no freshers"
   DO NOT invent deal breakers from soft language like "preferred" or "ideally".

9. RESPONSIBILITIES — PRESERVE EXACT TOOL NAMES
   In responsibilities_flat, copy tool/tech names exactly as they appear in the JD.
   In responsibilities (rich), extract skills_involved only from skills actually used in that task.
   seniority_signal: Does this task imply junior / mid / senior level work?
     junior = guided task, learning on the job
     mid = independent execution, some ownership
     senior = owns outcomes, makes decisions, influences architecture

10. DO NOT HALLUCINATE
    If a field has no data in the JD → null or []
    Never infer company name from email domains, logos, or context clues.
    Never fill in location from assumed country based on language or currency.

11. REQUIREMENTS vs SKILLS
    The 'requirements' field MUST be a flat list of actual qualifications or prerequisites.
    Include specific years of experience, degree requirements, certifications (e.g., AWS Certified), 
    and hard tech requirements that aren't just single-word skills.
    Example: ["Bachelor's degree in Computer Science", "AWS Solutions Architect certificate", "5+ years experience in high-traffic Python apps"]
    DO NOT leave 'requirements' empty if the JD mentions qualifications.

════════════════════════════════════════════════
OUTPUT SCHEMA
════════════════════════════════════════════════

Return ONLY valid JSON matching this schema exactly. No markdown. No explanation. No extra keys.

{{
  "job_title": string,
  "company_name": string | null,
  "department": string | null,

  "work_type": "Remote" | "Hybrid" | "On-site",
  "employment_type": "Full-time" | "Part-time" | "Contract" | "Internship" | "Freelance" | null,

  "location": {{
    "city": string | null,
    "state": string | null,
    "country": string | null,
    "remote": boolean,
    "hybrid": boolean,
    "location_confidence": "stated" | "inferred" | "unknown"
  }},

  "role_context": {{
    "seniority": "intern" | "junior" | "mid" | "senior" | "lead" | "manager" | null,
    "team_size_hint": string | null,
    "work_style": "startup" | "enterprise" | "agency" | "unknown",
    "ic_or_manager": "ic" | "manager" | "both" | "unknown",
    "pace": "fast-paced" | "structured" | "unknown"
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
      "condition": "string",
      "reason": "string"
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
    "period": "yearly" | "monthly" | null,
    "disclosed": boolean
  }},

  "scoring_hints": {{
    "prioritize": string,
    "red_flags_to_watch": [string],
    "green_flags_to_reward": [string]
  }},

  "role_summary": string,
  "has_technical_requirements": boolean,
  "keywords": [string]
}}

════════════════════════════════════════════════
Job Description:
{text}
"""
    elif type_ == "RESUME":
        prompt = f"""You are a senior technical recruiter and structured data engineer.
Your job is to extract a precise, bias-free, machine-readable JSON object from a candidate resume.
Accuracy directly affects hiring decisions — do not guess, invent, or over-interpret.
EXTREME CAUTION: You MUST extract the full Professional Experience (Work History) and Education sections. Missing these is a fatal failure.

════════════════════════════════════════════════
MANDATORY PRE-CHECKS — READ BEFORE EXTRACTING
════════════════════════════════════════════════

1. NEVER INVENT DATA
   If a field has no evidence in the resume → use null or []
   Never infer company credibility, project scale, or impact numbers that aren't written.
   "mentioned in resume" is a valid evidence value — it signals low confidence for the scoring engine.

2. SOFT SKILLS — STRICT DEFINITION
   soft_skills accepts ONLY: communication, leadership, collaboration, teamwork, ownership,
   problem-solving, adaptability, time management, attention to detail, critical thinking.
   NEVER place in soft_skills:
     - Domain skills (data analysis, lead nurturing, competitor analysis)
     - Functional skills (workflow automation, campaign management, SEO)
     - Technical tools of any kind
   Domain/functional skills that don't fit technical[] or tools[] → add to a separate
   "domain_skills" array in the skills object.

3. TOOLS vs TECHNICAL — STRICT SPLIT
   technical[]: Programming languages, frameworks, libraries ONLY.
     Examples: Python, React, Node.js, Pandas, TensorFlow, FastAPI
   tools[]: Platforms, SaaS apps, cloud services, databases, automation tools, BI tools.
     Examples: n8n, Zapier, HubSpot, Notion, Power BI, AWS, PostgreSQL, Slack, Apollo
   If a tool is listed generically (e.g. "CRM tools", "AI tools", "automation software"):
     → Set tool name to null, add a "category" field: "CRM", "AI", "automation"
     → evidence must note "generic mention — specific tool unknown"
     → This signals to the scoring engine that it cannot do exact matching.

4. EXPERIENCE — CALCULATE HONESTLY
   total_years: Sum only NON-OVERLAPPING work periods.
     If two roles run concurrently, count the overlapping months ONCE.
     Algorithm:
       1. List all (start_date, end_date) pairs as month offsets from earliest start.
       2. Merge overlapping intervals.
       3. Sum the merged durations. Convert to years (round to 1 decimal).
   career_start_year: Year of the earliest role, internship, or freelance gig in the resume.
   seniority_level: Infer strictly from EVIDENCE, not job title alone.
     junior  = 0–2 years, individual contributor, guided or structured tasks
     mid     = 2–5 years, independent execution, some ownership of outcomes
     senior  = 5+ years, owns outcomes end-to-end, influences team/architecture
     lead    = leads others, directly manages or mentors team members
     manager = direct management responsibility stated explicitly
   NEVER assign "mid" or above to a fresh graduate with <2 years total experience.

5. TIMELINE CONSISTENCY
   For each role, if start_year = end_year (same year), duration_months must be ≤ 11.
   If is_current = true, compute duration_months up to the current extraction date.
   Flag any role where end_year < start_year as a data error in red_flags.
   Flag overlapping roles explicitly in career_progression.analysis.

6. IMPACT SIGNALS — EXTRACT, NEVER INVENT
   Extract only numbers, percentages, scale indicators explicitly written in the resume.
   Examples of valid impact: "reduced load time by 40%", "served 10k daily users", "3x revenue growth"
   If none found → impact_signals: [] (correct — do NOT write generic phrases like "improved efficiency")
   The scoring engine treats empty impact_signals as a signal of low evidence quality.

7. TECHNOLOGIES IN PROJECTS — ALWAYS EXTRACT
   For every project, extract technologies from the description text even if not in a separate list.
   Example: "Built automation to send Slack messages" → technologies: ["Slack", "automation"]
   Never leave technologies: [] if the project description names any tool or technology.

8. RED FLAGS — DETECT THESE SPECIFICALLY
   Check for and report every applicable flag:
   - "overlapping_roles": Two or more roles with concurrent date ranges
   - "job_hopping": 2+ roles under 10 months each (excluding internships)
   - "employment_gap": Unexplained gap of 6+ months between roles
   - "vague_descriptions": Role has no specifics — only generic duties, no tool names, no outcomes
   - "no_progression": Same seniority level across 3+ roles at different companies
   - "generic_skills": Skills listed that are categories not specific tools (e.g. "CRM tools", "AI tools")
   - "title_inflation": Job title implies seniority (Senior, Lead, Director) not supported by experience length
   Severity:
     high   = likely dealbreaker for most roles (overlapping roles, title inflation with <1yr exp)
     medium = worth probing in interview (vague descriptions, job hopping, generic skills)
     low    = minor concern (single short-tenure role, missing impact data)

9. SKILL NORMALIZATION
   Use canonical names:
     React.js / ReactJS → "React"
     Node.js / NodeJS → "Node.js"
     n8n / N8N → "n8n"
     Power BI / PowerBI → "Power BI"
     Google Sheets / GSheets → "Google Sheets"
     Postgres / PostgreSQL → "PostgreSQL"
   Never normalize to a generic category. "HubSpot" stays "HubSpot", not "CRM".

10. BIAS NEUTRALITY
    Use "they/them" or candidate's stated name — never assume gender.
    Do not comment on age, nationality, institution prestige, or personal details.
    candidate_summary must describe skills and experience only — not personal attributes.

11. CURRENT COMPANY & ROLE identification
    - current_company MUST be the employer where the candidate is presently working.
    - Identification: Look for "Present", "Current", or "Till Date" in work history.
    - If no "Present" role exists, current_company should be the most recent employer.
    - Never leave current_company null if there is any work history.

════════════════════════════════════════════════
OUTPUT SCHEMA
════════════════════════════════════════════════

Return ONLY valid JSON matching this schema exactly. No markdown. No explanation. No extra keys.

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
  "canonical_role_type": string | null,
  // Normalized role category for scoring: e.g. "Software Engineer", "Data Analyst",
  // "GTM / Growth Engineer", "Product Manager", "DevOps Engineer"
  // Use a standard role family — not the exact resume title

  "experience": {{
    "total_years": number | null,
    // NON-OVERLAPPING sum. See Pre-check #4.
    "career_start_year": number | null,
    "seniority_level": "intern" | "junior" | "mid" | "senior" | "lead" | "manager" | null,
    "has_concurrent_roles": boolean,
    // true if any two roles in work_history overlap in time
    "concurrent_roles_note": string | null
    // Describe which roles overlap and by how many months, if applicable
  }},

    "work_history": [
    {{
      "company": string,
      "role": string,
      "company_type": "startup" | "enterprise" | "agency" | "freelance" | "unknown",
      // Infer from context. "unknown" if insufficient signal.
      "duration_months": number | null,
      "start_date": string | null, // e.g. "Jan 2024"
      "end_date": string | null,   // e.g. "present" or "Dec 2023"
      "is_current": boolean,
      "recruiter_summary": string, 
      // A cohesive 1-2 sentence summary of "what they actually did". 
      // Outcome-focused. Like a recruiter explaining the role in 10 seconds.
      "overlap_note": string | null,
      // If this role overlaps with any other role in the timeline, 
      // state: "Overlaps with [Company] role by ~[months] months"
      "what_they_built": [string],
      // OUTCOMES and DELIVERABLES — not tool lists.
      "technologies_used": [string],
      "impact_signals": [string],
      "seniority_signal": "intern" | "junior" | "mid" | "senior" | null
    }}
  ],

  "skills": {{
    "technical": [
      {{
        "skill": string,           // canonical name
        "evidence": string,        // company or project name where used
        "years_of_use": number | null
      }}
    ],
    "tools": [
      {{
        "tool": string | null,     // specific tool name. null if only category known.
        "category": string | null, // e.g. "CRM", "AI", "automation" — only if tool is null
        "evidence": string,        // company/project or "mentioned in resume" if no context
        "confidence": "high" | "medium" | "low"
        // high   = named + used in a specific role
        // medium = named but no role/project context
        // low    = generic category mention only
      }}
    ],
    "domain_skills": [string],
    // Functional competencies that are NOT soft skills and NOT specific tools.
    // Examples: "lead generation", "campaign analytics", "GTM strategy", "data analysis",
    //           "workflow automation", "SEO", "content marketing"

    "soft_skills": [string]
    // ONLY: communication, leadership, collaboration, ownership, problem-solving, etc.
    // See Pre-check #2 for full rules.
  }},

  "education": [
    {{
      "degree": string | null,
      "field": string | null,
      "institution": string | null,
      "year": number | null,
      "type": "degree" | "diploma" | "certification" | "course" | "school"
    }}
  ],

  "projects": [
    {{
      "name": string | null,
      "description": string,
      // What was built and what problem it solved. Specific.
      "technologies": [string],
      // Extract from description text if not listed explicitly. Never leave [] if tools are named.
      "impact": string | null,
      // Only if explicitly stated. null otherwise.
      "scale": string | null
      // Only if explicitly stated. null otherwise.
    }}
  ],

  "red_flags": [
    {{
      "flag": string,
      // One of: overlapping_roles | job_hopping | employment_gap | vague_descriptions |
      //         no_progression | generic_skills | title_inflation | skill_mismatch | data_error
      "severity": "high" | "medium" | "low",
      "detail": string
      // Specific — name companies, dates, or skills involved. No generic language.
    }}
  ],

  "career_progression": {{
    "pattern": "growing" | "lateral" | "declining" | "mixed" | "early-career" | "unknown",
    "analysis": "string"
    // 1–2 sentences. Name actual companies and role types. Note overlaps or gaps if present.
  }},

  "candidate_summary": "string",
  // 2–3 sentences written like a recruiter briefing a colleague.
  // Must name: specific tools/skills, at least one company, and the domain they work in.
  // Must state their actual seniority level based on evidence — not their title.
  // Bias-neutral. No gendered language.
  // Do NOT copy their resume objective or summary section.

  "keywords": ["string"]
  // 10–15 keywords for JD matching. Canonical names. No categories.
}}

DEDUCTIVE REASONING STEPS FOR EXPERIENCE:
1. List all roles with Start and End dates.
2. If End is "Present", use current date (April 2026).
3. Calculate duration for each role in months.
4. Merge overlapping periods to avoid double counting.
5. Sum merged intervals and divide by 12.0.
6. Provide the result in "total_years".

════════════════════════════════════════════════
Resume:
{text}"""
    elif type_ == "SCORE":
        try:
            raw = json.loads(text)
        except:
            raw = {}

        jd_data = raw.get("jd", {})
        resume_data = raw.get("resume", {})

        # Defensive: if jd_data or resume_data came as a JSON string, parse them
        if isinstance(jd_data, str):
            try:
                jd_data = json.loads(jd_data)
            except Exception:
                jd_data = {}
        if not isinstance(jd_data, dict):
            jd_data = {}

        if isinstance(resume_data, str):
            try:
                resume_data = json.loads(resume_data)
            except Exception:
                resume_data = {}
        if not isinstance(resume_data, dict):
            resume_data = {}
        jd_raw_text = raw.get("jd_raw_text", "")
        resume_raw_text = raw.get("resume_raw_text", "")
        threshold = int(raw.get("threshold", 70))

        # ── 1. DETERMINISTIC SCORING (Python) ────────────────
        score_result = compute_score(jd_data, resume_data, threshold)

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
                # Include raw work_history from resume as fallback for older UI reads
                "work_history": resume_data.get("work_history", []),
                **report,  # Spread all LLM report fields (includes experience_assessment, work_history_annotated, decision_reason, etc.)
                # Backward-compat: if LLM still emits old key, promote it
                "experience_assessment": report.get("experience_assessment") or report.get("experience_analysis") or {},
            }
            return final_data
        except Exception as e:
            # Fallback reasoning if detailed report fails
            return {
                **score_result,
                "recruiter_snapshot": f"Automated evaluation completed with score {score_result['score']}.",
                "ai_verdict": f"Status: {score_result['status']}. Score: {score_result['score']}.",
            }

    # gpt-4o-mini for all types
    model = "gpt-4o-mini"
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
        
        # Guard against zero text extraction (prevents wasting AI credits/scoring errors)
        if not text or len(text.strip()) < 50:
             print(json.dumps({
                 "error": "The document appears to be empty or contains unreadable content. Please ensure the file is not a low-quality scanned image.",
                 "code": "EMPTY_DOCUMENT_ERROR"
             }))
             sys.exit(1)

        data = extract_data(text, type_)

        # Output to stdout for the backend
        print(json.dumps({"text": text, "data": data}))
