import sys
import json
import os
import re
import importlib
import warnings
from contextlib import contextmanager

# Suppress all warnings to stderr to keep stdout pure for JSON
warnings.filterwarnings("ignore")


@contextmanager
def silence_stdout():
    """
    Redirects stdout to stderr temporarily to prevent library-level 
    print statements from breaking our JSON-only stdout interface.
    """
    new_target = sys.stderr
    old_target = sys.stdout
    sys.stdout = new_target
    try:
        yield new_target
    finally:
        sys.stdout = old_target


def load_optional_module(module_name):
    try:
        with silence_stdout():
            return importlib.import_module(module_name)
    except ImportError:
        return None


with silence_stdout():
    pdfplumber = load_optional_module("pdfplumber")
    pymupdf4llm = load_optional_module("pymupdf4llm")
    fitz = load_optional_module("fitz")
    pdf2image = load_optional_module("pdf2image")
    PILImage = load_optional_module("PIL.Image")
    pytesseract = load_optional_module("pytesseract")
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

        # pdfplumber plain-text fallback (fast, no OCR, catches PDFs pymupdf4llm misses)
        plumber_text = ""
        if pdfplumber is not None:
            try:
                with pdfplumber.open(file_path) as pdf:
                    pages = [p.extract_text() or "" for p in pdf.pages]
                    plumber_text = "\n\n".join(p for p in pages if p.strip())
            except Exception as e:
                extraction_errors.append(f"pdfplumber text failed: {str(e)}")

        # JDs: pymupdf4llm first, pdfplumber plain text as fallback
        if type_ == "JD":
            if markdown_text:
                return markdown_text.strip()
            if plumber_text:
                return plumber_text.strip()
            # fall through to error

        extracted_parts = []
        if markdown_text:
            extracted_parts.append(markdown_text)

        # For RESUME: also grab tables via pdfplumber
        table_sections = []
        if pdfplumber is not None:
            try:
                table_sections = extract_tables_with_pdfplumber(file_path)
            except Exception as e:
                extraction_errors.append(f"pdfplumber tables failed: {str(e)}")

        if table_sections:
            extracted_parts.append(
                "## Extracted Tables\n\n" + "\n\n".join(table_sections)
            )

        # If pymupdf4llm got nothing, use pdfplumber plain text
        if not extracted_parts and plumber_text:
            extracted_parts.append(plumber_text)

        # OCR fallback for image-only / scanned PDFs
        if not extracted_parts:
            ocr_text = extract_text_via_ocr(file_path, max_pages=5 if type_ == "JD" else 10)
            if ocr_text:
                extracted_parts.append(ocr_text)

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


def extract_text_via_ocr(file_path, max_pages=5):
    if pytesseract is None:
        return ""

    ocr_chunks = []

    # Preferred path: render via PyMuPDF if available.
    if fitz is not None:
        try:
            doc = fitz.open(file_path)
            for page_index in range(min(len(doc), max_pages)):
                page = doc[page_index]
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                mode = "RGB" if pix.n < 4 else "RGBA"
                image = PILImage.frombytes(mode, [pix.width, pix.height], pix.samples)
                text = pytesseract.image_to_string(image)
                if text and text.strip():
                    ocr_chunks.append(text.strip())
            doc.close()
        except Exception as e:
            ocr_chunks.append(f"")

    if ocr_chunks:
        combined = "\n\n".join(chunk for chunk in ocr_chunks if chunk.strip()).strip()
        if combined:
            return combined

    # Fallback: use pdf2image if available and PIL is present.
    if pdf2image is not None and PILImage is not None:
        try:
            images = pdf2image.convert_from_path(file_path, first_page=1, last_page=max_pages)
            for image in images:
                text = pytesseract.image_to_string(image)
                if text and text.strip():
                    ocr_chunks.append(text.strip())
        except Exception:
            pass

    return "\n\n".join(chunk for chunk in ocr_chunks if chunk.strip()).strip()


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
    Returns a canonical key used for set-based matching.
    """
    s = skill.lower().strip()
    s = re.sub(r"\.js$", "", s)
    s = re.sub(r"js$", "", s)
    s = re.sub(r"[\.\-\_\s\/\(\)]", "", s)
    # Remove trailing version numbers: python3, python38 -> python
    s = re.sub(r"\d+$", "", s)
    aliases = {
        # JS / Node ecosystem
        "nodejs": "node",
        "node": "node",
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
        "es6": "javascript",
        "ecmascript": "javascript",
        # Python ecosystem
        "python": "python",
        "py": "python",
        "djangorest": "django",
        "djangorestframework": "django",
        "flaskapi": "flask",
        "fastapiframework": "fastapi",
        # Java ecosystem
        "springboot": "spring",
        "springframework": "spring",
        "hibernateorm": "hibernate",
        "javaee": "java",
        # Databases
        "postgresql": "postgres",
        "postgres": "postgres",
        "pgsql": "postgres",
        "mongodb": "mongo",
        "mongoose": "mongo",
        "elasticsearchdb": "elasticsearch",
        "opensearch": "elasticsearch",
        "mssql": "sqlserver",
        "microsoftsqlserver": "sqlserver",
        "mysql": "mysql",
        "mariadb": "mysql",
        "sqlite": "sqlite",
        "redis": "redis",
        "cassandradb": "cassandra",
        # Cloud
        "amazonaws": "aws",
        "amazonwebservices": "aws",
        "awscloud": "aws",
        "googlecloud": "gcp",
        "googlecloudplatform": "gcp",
        "googledevelopers": "gcp",
        "microsoftazure": "azure",
        "azurecloud": "azure",
        "azuredevops": "azure",
        # DevOps / infra
        "kubernetes": "k8s",
        "k8": "k8s",
        "dockercontainer": "docker",
        "dockercompose": "docker",
        "githubactions": "cicd",
        "gitlabcicd": "cicd",
        "gitlabci": "cicd",
        "circleci": "cicd",
        "jenkin": "jenkins",
        "jenkinsci": "jenkins",
        "terraformiac": "terraform",
        "ansible": "ansible",
        "helm": "helm",
        "argocd": "argocd",
        # AI / ML / Data
        "machinelearning": "ml",
        "artificialintelligence": "ai",
        "deeplearning": "dl",
        "naturallanguageprocessing": "nlp",
        "largelanguagemodel": "llm",
        "llms": "llm",
        "generativeai": "genai",
        "genai": "genai",
        "aiml": "ml",
        "datascience": "datascience",
        "apachespark": "spark",
        "pyspark": "spark",
        "apachekafka": "kafka",
        "apacheairflow": "airflow",
        "scikit": "scikitlearn",
        "sklearnlearn": "scikitlearn",
        "scikitlearn": "scikitlearn",
        "xgboost": "xgboost",
        "lightgbm": "lightgbm",
        "tensorflow": "tensorflow",
        "pytorch": "pytorch",
        "huggingface": "huggingface",
        "langchain": "langchain",
        # BI / Analytics
        "powerbi": "powerbi",
        "msexcel": "excel",
        "microsoftexcel": "excel",
        "googleanalytics": "googleanalytics",
        "ga4": "googleanalytics",
        "looker": "looker",
        "tableau": "tableau",
        "metabase": "metabase",
        "superset": "superset",
        # Automation / No-code
        "n8n": "n8n",
        "zapier": "zapier",
        "makecom": "make",
        "integromat": "make",
        # Mobile
        "reactnative": "reactnative",
        "flutterdev": "flutter",
        "swiftui": "swift",
        "kotlinandroid": "kotlin",
        "androiddev": "android",
        "iosdev": "ios",
        # Marketing / CRM / SaaS
        "hubspotcrm": "hubspot",
        "salesforcecrm": "salesforce",
        "googleads": "googleads",
        "googleadwords": "googleads",
        "metaads": "metaads",
        "facebookads": "metaads",
        "instagramads": "metaads",
        # API / protocols
        "restapi": "rest",
        "restful": "rest",
        "graphqlapi": "graphql",
        "grpcapi": "grpc",
        "websocket": "websockets",
        # Testing
        "jestjs": "jest",
        "pytestframework": "pytest",
        "cypressio": "cypress",
        "playwrighttest": "playwright",
        "unittesting": "testing",
        "integrationtesting": "testing",
        # Version control
        "github": "git",
        "gitlab": "git",
        "bitbucket": "git",
        # Messaging / queues
        "rabbitmq": "rabbitmq",
        "amazonsqs": "sqs",
        "awssqs": "sqs",
        "amazoneventbridge": "eventbridge",
        # Search
        "algolia": "algolia",
        "solr": "solr",
        # Misc infra
        "nginx": "nginx",
        "apache": "apache",
        "linuxadmin": "linux",
        "ubuntu": "linux",
        "centos": "linux",
    }
    return aliases.get(s, s)


# Transferable skill graph: if candidate has skill A, they partially match skill B.
# Used to avoid hard-zero for candidates with overlapping stacks.
# Format: { required_skill_canonical: [transferable_skills_canonical] }
TRANSFERABLE_SKILLS = {
    "react": ["reactnative", "next", "vue", "angular"],
    "reactnative": ["react", "flutter", "ios", "android"],
    "node": ["express", "fastapi", "django", "flask"],
    "python": ["django", "flask", "fastapi", "datascience", "ml"],
    "java": ["spring", "kotlin", "scala"],
    "spring": ["java", "springboot"],
    "aws": ["gcp", "azure", "cloudcomputing"],
    "gcp": ["aws", "azure", "cloudcomputing"],
    "azure": ["aws", "gcp", "cloudcomputing"],
    "k8s": ["docker", "helm", "argocd"],
    "docker": ["k8s", "containerd"],
    "postgres": ["mysql", "sqlserver", "sqlite", "oracle"],
    "mysql": ["postgres", "sqlserver", "mariadb"],
    "mongo": ["cassandra", "dynamodb", "firebase"],
    "elasticsearch": ["solr", "opensearch", "algolia"],
    "ml": ["datascience", "dl", "nlp", "scikitlearn"],
    "tensorflow": ["pytorch", "keras", "ml"],
    "pytorch": ["tensorflow", "keras", "ml"],
    "langchain": ["llm", "genai", "huggingface"],
    "graphql": ["rest", "grpc"],
    "kafka": ["rabbitmq", "sqs", "eventbridge"],
    "spark": ["hadoop", "hive", "databricks"],
    "typescript": ["javascript"],
    "javascript": ["typescript"],
    "flutter": ["reactnative", "ios", "android"],
    "tableau": ["powerbi", "looker", "metabase"],
    "powerbi": ["tableau", "looker", "superset"],
    "salesforce": ["hubspot", "crm"],
    "hubspot": ["salesforce", "crm"],
    "googleads": ["metaads", "sem", "ppc"],
    "metaads": ["googleads", "sem", "ppc"],
    "jest": ["testing", "pytest", "cypress"],
    "pytest": ["testing", "jest", "unittest"],
    "cicd": ["jenkins", "github", "gitlab", "githubactions"],
    "terraform": ["ansible", "cloudformation", "pulumi"],
    "n8n": ["zapier", "make", "automation"],
    "zapier": ["n8n", "make", "automation"],
    "rest": ["graphql", "grpc", "api"],
}


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


def compute_score(jd_data, resume_data, threshold=70, screening_criteria=None):
    """
    Deterministic scoring engine. Same input = same score, every time.
    LLM never touches this function.

    Score breakdown (100 pts total):
      Must-have skills    : 45 pts  (depth-weighted: keyword + evidence quality)
      Experience          : 25 pts  (years + seniority alignment)
      Good-to-have skills : 10 pts
      Career quality      : 10 pts  (progression, red flags, impact signals)
      Domain fit          : 10 pts  (JD scoring hints, domain skills, non-tech roles)

    Deterministic scoring engine. Same input = same score, every time.
    LLM never touches this function.

    Score breakdown (100 pts total):
      Must-have skills    : 45 pts  (weight × evidence depth × transferable credit)
      Experience          : 25 pts  (years gap + seniority alignment)
      Good-to-have skills : 10 pts  (partial credit for transferable skills)
      Career quality      : 10 pts  (impact signals, ownership, progression, red flags)
      Domain fit          : 10 pts  (scoring hints, domain skills, background match)

    Precision goals:
      - No false rejections: transferable skills, text hits, and fuzzy synonyms all
        get partial credit so strong candidates with non-standard terminology aren't dropped.
      - No false shortlists: hard rejection gates catch fundamental mismatches before
        the score is considered. Depth multipliers penalise "mentioned only" skills.
      - Overqualified != bad: seniority gap is capped at +-3 pts, never a hard reject.
      - Evidence quality matters: work history > project > listed only.
    """
    if screening_criteria is None:
        screening_criteria = {}

    # ── 0. Resolve skill/experience requirements (HR criteria overrides JD) ─
    hr_criteria_skills = screening_criteria.get("skills", {})
    hr_experience = screening_criteria.get("experience", {})

    if hr_criteria_skills:
        hr_required = hr_criteria_skills.get("required", [])
        if hr_required and isinstance(hr_required[0], dict):
            jd_must_have = [(s.get("name", ""), s.get("weight", "high") or "high") for s in hr_required]
        else:
            jd_must_have = [(s, "high") for s in hr_required] if hr_required else []
        hr_nice = hr_criteria_skills.get("niceToHave", [])
        jd_good_to_have = [s.get("name", "") if isinstance(s, dict) else s for s in hr_nice] if hr_nice else []
    else:
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

    if hr_experience:
        jd_min_years = hr_experience.get("minimumYears")
        jd_max_years = None
        jd_seniority = {"junior": "junior", "mid": "mid", "senior": "senior"}.get(
            hr_experience.get("seniorityLevel")
        )
    else:
        jd_experience = _as_dict(jd_data.get("experience", {}))
        jd_min_years = jd_experience.get("min_years")
        jd_max_years = jd_experience.get("max_years")
        jd_seniority = _as_dict(jd_data.get("role_context", {})).get("seniority")

    has_tech = jd_data.get("has_technical_requirements", True)
    scoring_hints = _as_dict(jd_data.get("scoring_hints", {}))

    # ── 1. Build resume skill pool ──────────────────────────────────────────
    resume_skills = resume_data.get("skills", {})
    work_history = resume_data.get("work_history", [])
    domain_skills = resume_skills.get("domain_skills", [])

    # skill_evidence_map: normalized -> {evidence, confidence, source, years}
    # Priority: work_history(4) > project(3) > listed(2) > keyword(1)
    skill_evidence_map = {}
    priority_rank = {"work_history": 4, "project": 3, "listed": 2, "keyword": 1}

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
            _add_skill(s["skill"], s.get("evidence", ""), "high", "listed", s.get("years_of_use"))
            all_resume_skill_names.append(s["skill"])
        elif isinstance(s, str) and s:
            _add_skill(s, "", "high", "listed")
            all_resume_skill_names.append(s)

    for s in (resume_skills.get("tools", []) or []):
        if isinstance(s, dict):
            tool, conf = s.get("tool"), s.get("confidence", "high")
            if tool and conf != "low":
                _add_skill(tool, s.get("evidence", ""), conf, "listed")
                all_resume_skill_names.append(tool)
        elif isinstance(s, str) and s:
            _add_skill(s, "", "high", "listed")
            all_resume_skill_names.append(s)

    for job in work_history:
        company = job.get("company", "work history")
        impact = job.get("impact_strength", "low")
        src = "work_history" if job.get("is_current") or impact == "high" else "project"
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

    resume_raw_text_corpus = " ".join(filter(None, [
        resume_data.get("candidate_summary", ""),
        resume_data.get("career_progression", {}).get("analysis", ""),
        " ".join(kw for kw in (resume_data.get("keywords", []) or []) if kw),
        " ".join(" ".join(str(t) for t in (job.get("technologies_used", []) or [])) for job in work_history),
        " ".join(s for s in domain_skills if s),
        " ".join(c.get("claim", "") for c in (resume_data.get("core_claims", []) or [])),
    ])).lower()

    # ── 2. Must-have skill scoring (45 pts) ────────────────────────────────
    # critical=3, high=2, medium=1
    # Evidence depth multiplier: work_history=1.2x, project/listed=1.0x, mentioned_only=0.85x
    # Transferable skill = 0.40-0.50x partial credit (not a full match, not zero)
    weight_map = {"critical": 3, "high": 2, "medium": 1}

    matched_must = []
    missing_must = []
    partial_must = []
    must_have_details = []
    total_weight = 0.0
    matched_weight = 0.0

    for skill, weight in jd_must_have:
        if not skill:
            continue
        w = weight_map.get(weight, 2)
        total_weight += w
        norm = normalize_skill(str(skill))
        level, multiplier = _skill_match_level(norm, resume_normalized, skill_evidence_map, resume_raw_text_corpus)

        if level in ("full", "confirmed", "mentioned", "text_hit"):
            matched_must.append(skill)
            matched_weight += w * multiplier
            match_status = "found" if level in ("full", "confirmed") else "mentioned"
        elif level == "transferable":
            partial_must.append(skill)
            matched_weight += w * multiplier
            match_status = "transferable"
        else:
            missing_must.append(skill)
            match_status = "not_found"

        must_have_details.append({"name": skill, "weight": weight, "status": match_status, "match_level": level})

    if total_weight > 0:
        skills_score = round((matched_weight / total_weight) * 45)
    elif not has_tech:
        jd_keywords = [k for k in (jd_data.get("keywords", []) or []) if k]
        if jd_keywords:
            kw_matched = sum(1 for k in jd_keywords if normalize_skill(k) in resume_normalized or k.lower() in resume_raw_text_corpus)
            skills_score = round((kw_matched / len(jd_keywords)) * 45)
            for k in jd_keywords:
                (matched_must if normalize_skill(k) in resume_normalized or k.lower() in resume_raw_text_corpus else missing_must).append(k)
        else:
            skills_score = 25
    else:
        jd_keywords = [k for k in (jd_data.get("keywords", []) or []) if k]
        if jd_keywords:
            kw_matched = sum(1 for k in jd_keywords if normalize_skill(k) in resume_normalized)
            skills_score = round((kw_matched / len(jd_keywords)) * 45)
            for k in jd_keywords:
                (matched_must if normalize_skill(k) in resume_normalized else missing_must).append(k)
        else:
            skills_score = 20

    skills_score = min(45, max(0, skills_score))

    # ── 3. Experience score (25 pts) ───────────────────────────────────────
    cv_exp = resume_data.get("experience", {})
    candidate_years = cv_exp.get("total_years")
    candidate_seniority = cv_exp.get("seniority_level")

    exp_score = 0
    exp_status = "unknown"
    seniority_rank = {"intern": 0, "junior": 1, "mid": 2, "senior": 3, "lead": 4, "manager": 5}

    if jd_min_years is None:
        exp_score = 18
        exp_status = "neutral"
    elif candidate_years is None:
        exp_score = 11
        exp_status = "unknown"
    else:
        gap = candidate_years - jd_min_years
        if gap >= 0:
            exp_score = 25
            exp_status = "meets"
            # Overqualified: only reduce if far over max_years (generous window)
            if jd_max_years and gap > (jd_max_years - jd_min_years + 4):
                exp_score = 22
                exp_status = "overqualified"
        elif gap >= -1:
            exp_score = 21
            exp_status = "close"
        elif gap >= -2:
            exp_score = 16
            exp_status = "below"
        elif gap >= -3:
            exp_score = 9
            exp_status = "significantly_below"
        else:
            exp_score = max(0, 5 - (abs(gap) - 3))
            exp_status = "significantly_below"

    # Seniority adjustment: capped at +-3 pts — overqualified candidates are not penalised heavily
    if jd_seniority and candidate_seniority:
        jd_lvl = seniority_rank.get(jd_seniority, 2)
        cand_lvl = seniority_rank.get(candidate_seniority, 2)
        gap_lvl = cand_lvl - jd_lvl
        if gap_lvl == 0:
            exp_score = min(25, exp_score + 2)
        elif gap_lvl == -1:
            pass
        elif gap_lvl == 1:
            exp_score = max(0, exp_score - 1)
        elif gap_lvl <= -2:
            exp_score = max(0, exp_score - 3)
        elif gap_lvl >= 2:
            exp_score = max(0, exp_score - 2)

    exp_score = max(0, min(25, exp_score))

    # ── 4. Good-to-have skills (10 pts) ────────────────────────────────────
    matched_good = []
    for skill in jd_good_to_have:
        if not skill:
            continue
        norm = normalize_skill(str(skill))
        level, _ = _skill_match_level(norm, resume_normalized, skill_evidence_map, resume_raw_text_corpus)
        if level != "none":
            matched_good.append(skill)

    good_score = round((len(matched_good) / len(jd_good_to_have)) * 10) if jd_good_to_have else 5

    # ── 5. Career quality (10 pts) ─────────────────────────────────────────
    career_pattern = resume_data.get("career_progression", {}).get("pattern", "unknown")
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

    jd_edu = _as_dict(jd_data.get("education", {}))
    if jd_edu.get("required") and not resume_data.get("education"):
        career_score -= 2

    career_score = max(0, min(10, career_score))

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

    if not has_tech:
        jd_bg = (jd_experience.get("preferred_background", "") or "").lower() if not hr_experience else ""
        if jd_bg:
            dm = sum(1 for s in domain_skills if s and (normalize_skill(s) in resume_normalized or s.lower() in jd_bg))
            if dm >= 3:
                domain_score = min(10, domain_score + 2)
            elif dm >= 1:
                domain_score = min(10, domain_score + 1)

    jd_kw_set = {normalize_skill(k) for k in (jd_data.get("keywords", []) or []) if k}
    domain_kw_hits = sum(1 for s in domain_skills if s and normalize_skill(s) in jd_kw_set)
    if domain_kw_hits >= 3:
        domain_score = min(10, domain_score + 1)

    domain_score = max(0, min(10, domain_score))

    # ── 7. Final score ─────────────────────────────────────────────────────
    total = min(100, max(0, skills_score + exp_score + good_score + career_score + domain_score))

    # ── 8. Hard rejection gates ────────────────────────────────────────────
    # Applied ONLY for fundamental mismatches. Err on the side of keeping candidates.
    hard_rejected = False
    rejection_reasons = []

    # Education gate
    hr_education = screening_criteria.get("education", {})
    if hr_education:
        required_degree = hr_education.get("degreeLevel")
        if required_degree:
            degree_rank = {"high_school": 1, "bachelor": 2, "master": 3, "phd": 4}
            cand_edu_list = resume_data.get("education") or []
            cand_str = ""
            if cand_edu_list and isinstance(cand_edu_list[0], dict):
                cand_str = (cand_edu_list[0].get("degree", "") or "").lower()
            if cand_str:
                if any(x in cand_str for x in ["phd", "doctorate"]):
                    cand_bucket = "phd"
                elif any(x in cand_str for x in ["master", "m.s.", "m.tech", "mba", "msc"]):
                    cand_bucket = "master"
                elif any(x in cand_str for x in ["bachelor", "b.s.", "b.e.", "b.tech", "b.a.", "bsc"]):
                    cand_bucket = "bachelor"
                else:
                    cand_bucket = "high_school"
                if degree_rank.get(cand_bucket, 0) < degree_rank.get(required_degree, 0):
                    hard_rejected = True
                    rejection_reasons.append(f"Education: requires {required_degree}, candidate has {cand_bucket}")

    # Location gate
    hr_location = screening_criteria.get("location", {})
    if hr_location:
        req_locs = hr_location.get("required", [])
        if req_locs and not hr_location.get("remoteOk", False):
            cand_loc = resume_data.get("location") or {}
            cand_city = (cand_loc.get("city", "") or "").lower()
            cand_country = (cand_loc.get("country", "") or "").lower()
            cand_state = (cand_loc.get("state", "") or "").lower()
            if (cand_city or cand_country) and not any(loc.lower() in (cand_city, cand_country, cand_state) for loc in req_locs):
                hard_rejected = True
                rejection_reasons.append(f"Location: requires {', '.join(req_locs)}, candidate in {cand_city or cand_country}")

    # Must-have gate: only reject if >70% have ZERO evidence (transferable counts, not zero)
    if jd_must_have:
        truly_missing = len(missing_must)
        if truly_missing / len(jd_must_have) > 0.70:
            hard_rejected = True
            rejection_reasons.append(f"Missing {truly_missing}/{len(jd_must_have)} must-have skills with no evidence")

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
            "skills_score": skills_score, "skills_max": 45,
            "exp_score": exp_score, "exp_max": 25,
            "good_score": good_score, "good_max": 10,
            "career_score": career_score, "career_max": 10,
            "domain_score": domain_score, "domain_max": 10,
        },
        "skill_matching": {
            "matched_must": matched_must,
            "missing_must": missing_must,
            "partial_must": partial_must,
            "matched_good": matched_good,
            "total_must": len(jd_must_have),
            "match_ratio": round((len(matched_must) + len(partial_must) * 0.5) / len(jd_must_have) * 100) if jd_must_have else 100,
            "must_have_details": must_have_details,
        },
        "exp_status": exp_status,
        "hard_rejected": hard_rejected,
        "rejection_reasons": rejection_reasons,
        "candidate_years": candidate_years,
        "jd_min_years": jd_min_years,
    }


def generate_report_inline(
    _jd_data, resume_data, jd_raw_text, resume_raw_text, score_result, client, report_model="gpt-4o"
):
    """
    Full-fidelity AI report generation using gpt-4o.
    Score and status are LOCKED by the deterministic engine — LLM only writes human-readable analysis.
    Every field the UI renders is produced here directly. No math fallbacks.
    """

    matched = score_result["skill_matching"]["matched_must"]
    missing = score_result["skill_matching"]["missing_must"]
    partial = score_result["skill_matching"].get("partial_must", [])
    matched_good = score_result["skill_matching"]["matched_good"]
    must_have_details = score_result["skill_matching"].get("must_have_details", [])
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
    red_flags_raw = resume_data.get("red_flags", [])
    projects_raw = resume_data.get("projects", [])
    education_raw = resume_data.get("education", [])
    domain_skills = resume_data.get("skills", {}).get("domain_skills", [])
    candidate_name = resume_data.get("full_name", "the candidate")

    # Serialise structured context for the prompt
    wh_str = json.dumps(work_history_raw, indent=2) if work_history_raw else "[]"
    claims_str = json.dumps(core_claims_raw, indent=2) if core_claims_raw else "[]"
    depth_str = json.dumps(skill_depth_raw, indent=2) if skill_depth_raw else "[]"
    uncertain_str = json.dumps(uncertain_areas_raw, indent=2) if uncertain_areas_raw else "[]"
    flags_str = json.dumps(red_flags_raw, indent=2) if red_flags_raw else "[]"
    projects_str = json.dumps(projects_raw, indent=2) if projects_raw else "[]"
    edu_str = json.dumps(education_raw, indent=2) if education_raw else "[]"
    domain_str = json.dumps(domain_skills) if domain_skills else "[]"
    must_details_str = json.dumps(must_have_details, indent=2) if must_have_details else "[]"
    partial_str = json.dumps(partial) if partial else "[]"

    prompt = f"""You are a Principal Technical Recruiter and Talent Intelligence expert with 15+ years of experience at tier-1 companies. You write the most insightful, evidence-grounded candidate evaluation reports in the industry.

The deterministic scoring engine has ALREADY computed the final score and status. These are LOCKED.
Your ONLY job: write deep, evidence-grounded human-readable analysis for every field below.
You CANNOT change the score, status, or breakdown numbers.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LOCKED SCORING RESULTS (READ ONLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Candidate        : {candidate_name}
Final Score      : {total}/100
Status           : {status}
Skills Score     : {breakdown["skills_score"]}/{breakdown["skills_max"]} pts
Experience Score : {breakdown["exp_score"]}/{breakdown["exp_max"]} pts
Good-to-have     : {breakdown["good_score"]}/{breakdown["good_max"]} pts
Career Quality   : {breakdown["career_score"]}/{breakdown["career_max"]} pts
Domain Fit       : {breakdown.get("domain_score", 0)}/{breakdown.get("domain_max", 10)} pts

Must-have matched  : {json.dumps(matched)}
Must-have partial  : {partial_str}
Must-have missing  : {json.dumps(missing)}
Good-to-have hits  : {json.dumps(matched_good)}
Experience status  : {exp_status} (candidate: {candidate_years} yrs | required: {jd_min_years} yrs)
{f"HARD REJECTION REASONS: {json.dumps(score_result['rejection_reasons'])}" if score_result["hard_rejected"] else "No hard rejection."}

Per-skill match detail:
{must_details_str}

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

CORE CLAIMS (what the candidate asserts):
{claims_str}

SKILL DEPTH SIGNALS:
{depth_str}

UNCERTAIN AREAS (needs interview probing):
{uncertain_str}

RED FLAGS DETECTED:
{flags_str}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FIELD INSTRUCTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. recruiter_snapshot (string)
   - 2-3 sentences. Start with candidate name.
   - Sentence 1: What can they do TODAY — name deepest skill, best evidence, strongest role.
   - Sentence 2: How well do they match THIS specific role — reference must-haves matched/missed.
   - Sentence 3: The single biggest gap or the single strongest differentiator.
   - Use company names, tools, metrics. ZERO vague adjectives ("strong", "passionate", "skilled").

2. decision_breakdown (array — one row PER must-have skill + experience + each good-to-have with a hit)
   - "criteria": skill or requirement name
   - "required": "Must-have" | "Good-to-have" | "Experience"
   - "candidate_has": "Yes — [specific evidence]" | "Partial — [transferable skill]" | "No"
   - "result": "pass" | "partial" | "fail"
   - "note": 1 sharp sentence. For pass: what evidence. For partial: what transfers and what's missing. For fail: what day-1 impact this creates.

3. strengths (3–5 items)
   - "point": headline — specific capability, NOT a personality trait. E.g. "Owns full React/Node.js product stack independently"
   - "evidence": "At [Company], [verb] [specific thing] using [tool] — [outcome/scale/metric]"
   - Derive from: owner-level roles, high impact_strength, validated core_claims, high skill_depth
   - BANNED words: communicator, team player, passionate, motivated, fast learner, detail-oriented

4. concerns (3–5 items)
   - "point": specific gap headline. E.g. "No production Kubernetes experience in a role requiring day-1 cluster ownership"
   - "missing_skills": exact skill names from the JD must-have list
   - "impact": "This matters because [specific thing they cannot do on day 1 without it]"
   - Derive from: missing_must list, uncertain_areas, contributor/unclear ownership, low impact_strength roles

5. fit_radar (object — all values 0–100, used directly in the radar chart)
   - "essentials": % of must-have skills confirmed with evidence (not just listed). Base on must-have match depth.
   - "experience": % experience fit. 100=meets/exceeds, 80=1yr short, 60=2yr short, 40=3yr short, 20=4+yr short.
   - "domain": % domain/contextual fit. Rate how well their industry background, domain skills, and JD scoring hints align.
   - "skills": % breadth of relevant technical skills confirmed across work history + projects (not just listed).
   - "confidence": your overall evidence confidence. How much of their resume is backed by verifiable specifics vs vague claims? 100=everything evidenced, 50=mixed, 20=mostly vague.
   Each value must be independently justified — do NOT copy the score breakdown numbers directly.

6. skill_match_rows (array — 6–12 items, used in the "Skill signals" card)
   For each confirmed technical skill (from matched_must + matched_good + strong tools):
   - "name": canonical skill name
   - "stars": 1–5 rating of depth/evidence quality
     5 = multiple high-impact roles, metrics, owner-level; 4 = one strong role with evidence; 3 = used in work history but no clear outcomes; 2 = listed only or project-only; 1 = transferable/text mention only
   - "evidence_note": 1 short phrase. E.g. "Led 3 production deployments at Acme" or "Personal project only"

7. work_history_annotated (array — one entry PER role in WORK HISTORY)
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

8. integrity_signals (array)
   - Check ALL date ranges for overlaps and unexplained gaps (>6 months)
   - "level": "Low" | "Medium" | "High"
   - "label": short flag title
   - "summary": 1-line description
   - "details": specific dates and calculation
   - If clean: [{{"level":"Low","label":"No anomalies","summary":"All dates consistent","details":"No overlaps, gaps, or inflation found."}}]

9. suitability_analysis
   - "suggestions": 3–5 SPECIFIC actionable items (name exact cert, tool, project type)
     BAD: "Learn more about cloud" | GOOD: "Complete AWS SAA-C03 — role requires solo infra ownership on day 1"
   - "readiness_timeline": one of: "Immediately — strong match" | "2–4 weeks onboarding" | "3–6 months upskilling" | "6–12 months" | "12–18 months" | "Not suitable for this role"

10. candidate_potential
    - "for_this_role": "High" | "Medium" | "Low"
    - "reasoning": 1 sentence. What they CAN do right now, not generic potential.

11. seniority_alignment
    - "candidate_level": integer 0–4 (0=Intern, 1=Junior, 2=Mid, 3=Senior, 4=Lead/Principal)
    - "jd_level": integer 0–4
    - "candidate_label": human label e.g. "Mid-level (2–4 yrs)"
    - "jd_label": human label e.g. "Senior (5+ yrs)"

12. career_progression_details
    - "pattern": "Linear Upward" | "Cross-functional Pivot" | "Lateral" | "Declining" | "Freelance/Portfolio" | "Early Career"
    - "role_flow": one sentence arc e.g. "Intern → SDE → Senior SDE → Tech Lead across 3 product companies"
    - "company_types": comma-separated e.g. "Early Stage Startup, Product Startup, MNC"
    - "tenure_avg": e.g. "18 months average" — calculate from actual durations
    - "pattern_note": 1-line recruiter read on progression quality
    - "company_note": 1-line read on company tier and diversity
    - "tenure_note": 1-line read on stability vs job-hopping risk

13. experience_assessment
    - "years": {candidate_years}
    - "vs_required": "{candidate_years} yrs vs {jd_min_years} yrs required"
    - "quality": rate the QUALITY of experience, not just years. E.g. "High — 3 owner-level roles with measurable outcomes"
    - "relevance": rate how relevant the experience domain is to THIS specific JD. E.g. "Strong — 2 of 3 companies were in same vertical"

14. project_relevance
    - "rating": "High" | "Medium" | "Low"
    - "reasoning": 1-2 sentences on whether projects demonstrate relevant depth or are just padding

15. decision_reason (string — EXACTLY 1 sentence)
    - The single most decisive reason for {status}.
    - Shortlisted: what clinches it. Borderline: what tips it. Rejected: the hard stopper.
    - No hedging. No softening. E.g. "5 of 6 must-haves confirmed across 3 owner-level roles with production metrics."

16. ai_verdict (string — 3–5 sentences)
    - Expert synthesis for HR. Combine: capability summary, must-have match quality, deepest evidence signal, recommendation.
    - Name companies and skills. Every sentence grounded in resume evidence.
    - State plainly why shortlisted OR why not.
    - For borderline: state exactly what would push them to shortlisted.
    - Call out any claim that needs interview verification.

17. recruiter_snapshot is ALSO used as the "Screening summary" card bullets.
    Write it so it naturally splits into 3 bullet-sized insights when split on ". " — each sentence should stand alone.

18. interview_questions (5–7 items, role-specific, evidence-targeted)
    - "question": the exact question to ask
    - "intent": what competency or gap this probes
    - "based_on": which resume claim or uncertainty triggered this question
    - Prioritise: uncertain_areas, partial matches, owner claims that lack metrics, gaps between role title and actual evidence

Return ONLY valid JSON matching this EXACT schema. No markdown. No code fences. No extra keys.

{{
  "recruiter_snapshot": "string",
  "decision_breakdown": [
    {{"criteria":"string","required":"Must-have|Good-to-have|Experience","candidate_has":"string","result":"pass|partial|fail","note":"string"}}
  ],
  "strengths": [
    {{"point":"string","evidence":"string"}}
  ],
  "concerns": [
    {{"point":"string","missing_skills":["string"],"impact":"string"}}
  ],
  "fit_radar": {{
    "essentials": 0,
    "experience": 0,
    "domain": 0,
    "skills": 0,
    "confidence": 0
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
  "project_relevance": {{"rating":"High|Medium|Low","reasoning":"string"}},
  "integrity_signals": [
    {{"level":"Low|Medium|High","label":"string","summary":"string","details":"string"}}
  ],
  "suitability_analysis": {{
    "suggestions": ["string"],
    "readiness_timeline": "string"
  }},
  "candidate_potential": {{"for_this_role":"High|Medium|Low","reasoning":"string"}},
  "seniority_alignment": {{
    "candidate_level":0,"jd_level":0,"candidate_label":"string","jd_label":"string"
  }},
  "career_progression_details": {{
    "pattern":"string","role_flow":"string","company_types":"string",
    "tenure_avg":"string","pattern_note":"string","company_note":"string","tenure_note":"string"
  }},
  "decision_reason": "string",
  "ai_verdict": "string",
  "interview_questions": [
    {{"question":"string","intent":"string","based_on":"string"}}
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
                    "You are a Principal Technical Recruiter and Talent Intelligence expert. "
                    "You produce world-class candidate evaluation reports used by hiring managers at top companies. "
                    "EVIDENCE DISCIPLINE: Every strength, concern, and claim MUST cite company name, tool, project, or metric. "
                    "FORBIDDEN words anywhere in output: 'strong communicator', 'team player', 'passionate', 'motivated', 'fast learner', 'detail-oriented', 'has experience with'. "
                    "REQUIRED evidence pattern: 'At [Company], [built/led/owned] [specific thing] using [tool] — [outcome/scale/metric]'. "
                    "TONE: Professional, factual, constructive. Rejected candidates get honest specific gaps, not unkind language. "
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


def extract_data(text, type_, llm_model_override=None):
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

    if type_ == "JD":
        prompt = f"""Extract a scoring-ready JSON object from this Job Description.
Output feeds an automated resume scoring engine. Accuracy is non-negotiable. No hallucination.

RULES:
1. SKILLS: must_have = explicitly required/essential only. good_to_have = preferred/bonus only.
   Ambiguous -> good_to_have. Soft skills (communication, teamwork, leadership) -> NEVER in must_have/good_to_have, omit entirely.
   weight: "critical" = core to role or mentioned 2+ times | "high" = clearly required | "medium" = minor requirement.
   Canonical names: React.js/ReactJS -> "React" | Node.js/NodeJS -> "Node.js" | PostgreSQL/Postgres -> "PostgreSQL" | AWS/Amazon Web Services -> "AWS" | JavaScript/JS -> "JavaScript" | TypeScript/TS -> "TypeScript" | GCP/Google Cloud -> "GCP" | Azure/MS Azure -> "Azure" | n8n/N8N -> "n8n". Use vendor's official name when unsure.

2. EXPERIENCE: Numbers only. "2-4 years" -> min:2, max:4 | "5+ years" -> min:5, max:null | fresher/entry -> min:0, max:1 | not mentioned -> null. Never guess from title.

3. SENIORITY: Infer from responsibilities and experience range, not title alone.
   intern=0-1yr | junior=1-3yr | mid=3-5yr | senior=5+yr | lead=manages others | manager=explicit management.

4. EDUCATION: Only extract if explicitly stated as required or preferred. null otherwise.

5. KEYWORDS: 8-12 canonical skill/domain terms for fallback matching. No soft skills.

6. SCORING HINTS: green_flags = signals that strongly indicate fit (specific tools, domain experience, certifications).
   red_flags = signals that indicate poor fit (wrong domain, missing critical context).

7. INTERVIEW QUESTIONS: Generate 4-6 sharp, role-specific interview questions based on the must-have skills and key responsibilities. Each question must target a specific competency gap or depth-check. Format: {{"question": string, "intent": string, "skill_tested": string}}.

8. has_technical_requirements: true if role requires specific tools/languages/platforms. false for pure management/soft-skill roles.

9. No data in JD -> null or []. Never invent.

Return ONLY valid JSON. No markdown, no explanation.

{{
  "job_title": string,
  "department": string | null,
  "work_type": "Remote" | "Hybrid" | "On-site",
  "employment_type": "Full-time" | "Part-time" | "Contract" | "Internship" | "Freelance" | null,
  "role_summary": string,
  "responsibilities": [string],
  "requirements": [string],
  "salary": {{
    "min": number | null,
    "max": number | null,
    "currency": string | null,
    "period": "yearly" | "monthly" | null
  }},
  "skills": {{
    "must_have": [
      {{"skill": string, "weight": "critical" | "high" | "medium"}}
    ],
    "good_to_have": [string]
  }},
  "experience": {{
    "min_years": number | null,
    "max_years": number | null,
    "preferred_background": string | null
  }},
  "role_context": {{
    "seniority": "intern" | "junior" | "mid" | "senior" | "lead" | "manager" | null
  }},
  "education": {{
    "required": string | null,
    "preferred": string | null
  }},
  "scoring_hints": {{
    "green_flags_to_reward": [string],
    "red_flags_to_watch": [string]
  }},
  "interview_questions": [
    {{"question": string, "intent": string, "skill_tested": string}}
  ],
  "has_technical_requirements": boolean,
  "keywords": [string]
}}

Job Description:
{text}
"""
    elif type_ == "RESUME":
        prompt = f"""Extract a precise, bias-free JSON object from this resume. Output feeds a scoring engine, AI hiring report, and interview question generator. No hallucination. Missing work_history is a fatal failure.

RULES:
1. NO INVENTION. null or [] if not evidenced. "mentioned in resume" = valid low-confidence evidence.
2. SKILLS SPLIT: technical[] = languages/frameworks/libraries only (Python, React, Node.js, FastAPI). tools[] = platforms/SaaS/cloud/databases (AWS, HubSpot, PostgreSQL, n8n, Power BI). domain_skills[] = functional competencies that are neither (lead generation, SEO, GTM strategy, data analysis). Canonical names: ReactJS->"React", NodeJS->"Node.js", PostgreSQL/Postgres->"PostgreSQL", n8n/N8N->"n8n", PowerBI->"Power BI". Generic mention ("CRM tools") -> tool:null, category:"CRM", confidence:"low".
3. EXPERIENCE: total_years = NON-OVERLAPPING sum. Merge concurrent roles, count overlap once. "Present" = April 2026. seniority: junior=0-2yr | mid=2-5yr | senior=5+yr | lead=leads others | manager=explicit management. Never assign mid+ to <2yr experience.
4. IMPACT SIGNALS: extract only explicit numbers/percentages/scale ("40% faster", "10k users"). Never invent. Empty = low evidence signal to scorer.
5. RED FLAGS — detect all that apply: overlapping_roles | job_hopping (2+ roles <10mo) | employment_gap (6+mo unexplained) | vague_descriptions | no_progression | generic_skills | title_inflation. severity: high=dealbreaker | medium=probe in interview | low=minor.
6. OWNERSHIP per role: owner=led/built it | contributor=involved | unclear=no evidence of responsibility.
7. IMPACT STRENGTH per role/project: high=metrics+ownership | medium=clear outcome, no metrics | low=vague.
8. CORE CLAIMS: top 3-5 strongest claims the candidate makes, each with evidence and confidence.
9. UNCERTAIN AREAS: sections that need interview probing — vague scope, missing outcomes, inconsistent dates.
10. current_company = most recent employer with "Present"/"Current" end date, else most recent.
11. candidate_summary: 2-3 sentences, recruiter-style. Name tools, company, domain, actual seniority. No gendered language. Do NOT copy resume objective.
12. keywords: 10-15 canonical skill/domain terms for JD matching.

Return ONLY valid JSON. No markdown, no explanation.

{{
  "full_name": string,
  "email": string | null,
  "phone": string | null,
  "location": {{"city": string | null, "state": string | null, "country": string | null}},
  "current_company": string | null,
  "current_role": string | null,
  "experience": {{
    "total_years": number | null,
    "seniority_level": "intern" | "junior" | "mid" | "senior" | "lead" | "manager" | null
  }},
  "work_history": [
    {{
      "company": string,
      "role": string,
      "duration_months": number | null,
      "start_date": string | null,
      "end_date": string | null,
      "is_current": boolean,
      "technologies_used": [string],
      "impact_signals": [string],
      "ownership_level": "owner" | "contributor" | "unclear",
      "impact_strength": "low" | "medium" | "high"
    }}
  ],
  "skills": {{
    "technical": [{{"skill": string, "evidence": string, "years_of_use": number | null}}],
    "tools": [{{"tool": string | null, "category": string | null, "evidence": string, "confidence": "high" | "medium" | "low"}}],
    "domain_skills": [string],
    "skill_depth": [{{"skill": string, "depth": "low" | "medium" | "high", "evidence": string}}]
  }},
  "education": [
    {{"degree": string | null, "field": string | null, "institution": string | null, "year": number | null, "type": "degree" | "diploma" | "certification" | "course" | "school"}}
  ],
  "projects": [
    {{"name": string | null, "description": string, "technologies": [string], "impact": string | null, "impact_strength": "low" | "medium" | "high"}}
  ],
  "core_claims": [{{"claim": string, "evidence": string, "confidence": "high" | "medium" | "low"}}],
  "uncertain_areas": [{{"area": string, "reason": string, "probe_question": string}}],
  "red_flags": [{{"flag": string, "severity": "high" | "medium" | "low", "detail": string}}],
  "career_progression": {{"pattern": "growing" | "lateral" | "declining" | "mixed" | "early-career" | "unknown", "analysis": string}},
  "candidate_summary": string,
  "keywords": [string]
}}

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
        screening_criteria = raw.get("screening_criteria", {}) or {}

        # -- 1. DETERMINISTIC SCORING (Python) ----------------
        score_result = compute_score(jd_data, resume_data, threshold, screening_criteria)

        # -- 2. HIGH-FIDELITY AI EVALUATION -------------------
        print(
            f"--- [AI] Synthesizing evaluation report for {resume_data.get('full_name', 'candidate')}... ---",
            file=sys.stderr,
            flush=True,
        )
        try:
            report, report_usage = generate_report_inline(
                jd_data,
                resume_data,
                jd_raw_text,
                resume_raw_text,
                score_result,
                client,
                report_model=llm_model_override or "gpt-5.4-mini",
            )
            # -- 3. ASSEMBLE FINAL OUTPUT -----------------------
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
                "core_claims": resume_data.get("core_claims", []),
                "uncertain_areas": resume_data.get("uncertain_areas", []),
                "skill_depth": resume_data.get("skills", {}).get("skill_depth", []),
                **report,  # Spread all LLM report fields (includes experience_assessment, work_history_annotated, decision_reason, etc.)
                # Backward-compat: if LLM still emits old key, promote it
                "experience_assessment": report.get("experience_assessment") or report.get("experience_analysis") or {},
            }
            return {"data": final_data, "usage": report_usage}
        except Exception as e:
            # Fallback reasoning if detailed report fails
            return {
                "data": {
                    **score_result,
                    "recruiter_snapshot": f"Automated evaluation completed with score {score_result['score']}.",
                    "ai_verdict": f"Status: {score_result['status']}. Score: {score_result['score']}.",
                },
                "usage": {
                    "model": llm_model_override or "gpt-5.4-mini",
                    "inputTokens": 0,
                    "outputTokens": 0,
                    "cachedInputTokens": 0,
                },
            }

    # gpt-5.4-mini for all types unless a model override is provided (fastest, cheapest)
    model = llm_model_override or "gpt-5.4-mini"
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

        usage = getattr(completion, "usage", None)
        prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
        completion_tokens = getattr(usage, "completion_tokens", 0) or 0
        prompt_details = getattr(usage, "prompt_tokens_details", None)
        cached_tokens = getattr(prompt_details, "cached_tokens", 0) or 0

        return {
            "data": json.loads(content),
            "usage": {
                "model": model,
                "inputTokens": prompt_tokens,
                "outputTokens": completion_tokens,
                "cachedInputTokens": cached_tokens,
            },
        }
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
    llm_model_override = sys.argv[3] if len(sys.argv) > 3 else None

    if not os.path.exists(file_path):
        print(json.dumps({"error": f"File not found: {file_path}"}))
        sys.exit(1)

    if type_ == "SCORE":
        # For SCORE, file_path contains JSON { "resume": "...", "jd": "..." }
        with open(file_path, "r", encoding="utf-8") as f:
            text = f.read()
        
        with silence_stdout():
            data = extract_data(text, type_, llm_model_override)
            
        print(
            json.dumps(
                {
                    "data": data.get("data", data),
                    "usage": data.get(
                        "usage",
                        {
                            "model": "gpt-4.1-mini",
                            "inputTokens": 0,
                            "outputTokens": 0,
                            "cachedInputTokens": 0,
                        },
                    ),
                }
            )
        )
    else:
        # For JD or RESUME, file_path is a PDF/text file
        with silence_stdout():
            text = extract_text(file_path, type_)
        
        # Guard against zero text extraction (prevents wasting AI credits/scoring errors)
        if not text or len(text.strip()) < 50:
             print(json.dumps({
                 "error": "The document appears to be empty or contains unreadable content. Please ensure the file is not a low-quality scanned image.",
                 "code": "EMPTY_DOCUMENT_ERROR"
             }))
             sys.exit(1)

        with silence_stdout():
            data = extract_data(text, type_, llm_model_override)

        # Output to stdout for the backend
        print(json.dumps({"text": text, "data": data["data"], "usage": data["usage"]}))
