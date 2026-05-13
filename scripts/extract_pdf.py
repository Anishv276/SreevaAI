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
            jd_criteria.append({
                "id": f"legacy_{name}", "category": "skill", "name": name,
                "priority": w, "weight": weight_pts,
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
    domain_skills = resume_skills.get("domain_skills", [])
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
            src = s.get("source_strength", "listed")
            mapped_src = "work_history" if src in ("work_history_outcome", "work_history") else ("project" if src == "project" else "listed")
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
                mapped_src = "work_history" if src in ("work_history_outcome", "work_history") else ("project" if src == "project" else "listed")
                _add_skill(tool, s.get("evidence", ""), conf, mapped_src)
                all_resume_skill_names.append(tool)
        elif isinstance(s, str) and s:
            _add_skill(s, "", "high", "listed")
            all_resume_skill_names.append(s)
    for job in work_history:
        company = job.get("company", "work history")
        src = "work_history" if job.get("impact_strength") in ("high", "medium") else "project"
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
        for ev in evidence_items:
            proves = [normalize_skill(p) for p in ev.get("proves", [])]
            ev_text = ev.get("text", "").lower()
            ev_level = ev.get("evidence_level", 1)
            ev_ownership = ev.get("ownership", "unclear")
            if norm_cname in proves or norm_cname in ev_text:
                if ev_level > best_ev_level:
                    best_ev_level = ev_level
                    confidence = float(ev.get("confidence", 0.7))
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
                if ev_src_raw == "work_history":
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

    # HR custom checks
    custom_required_hits = []
    for item in hr_custom_checks:
        if isinstance(item, dict):
            check_text = str(item.get("text") or item.get("label") or item.get("name") or "").strip()
            required = bool(item.get("required"))
        else:
            check_text = str(item).strip()
            required = False
        if not check_text:
            continue
        level, multiplier = _custom_check_match(check_text, resume_normalized, resume_raw_text_corpus)
        if required:
            custom_required_total += 1
            if level in ("full", "partial", "mentioned"):
                custom_required_hits.append(check_text)
                must_matched_weight += 10 * multiplier
                must_total_weight += 10
                must_have_details.append({"name": f"Custom: {check_text}", "weight": "high",
                                          "status": "found" if level == "full" else "mentioned", "match_level": level})
            else:
                custom_required_missing.append(check_text)
                missing_must.append(f"Custom: {check_text}")
                must_total_weight += 10
                must_have_details.append({"name": f"Custom: {check_text}", "weight": "high",
                                          "status": "not_found", "match_level": level})
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
    # ── 8. Hard rejection gates ────────────────────────────────────────────
    # Criteria-based: reject only if 2+ CRITICAL criteria are "does_not_meet"
    hard_rejected = False
    rejection_reasons = []
    critical_fails = [c for c in criteria_results if c.get("priority") == "critical" and c.get("result") == "does_not_meet"]
    if len(critical_fails) >= 2:
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
    elif total >= threshold:
        status = "Shortlisted"
    elif total >= borderline_floor:
        status = "Borderline"
    else:
        status = "Rejected"
    # Build shortlist reason from criteria results
    top_evidence = [c["evidence"] for c in criteria_results if c["result"] == "meets" and c["evidence"]][:3]
    gaps_to_probe = [c["criterion"] for c in criteria_results if c["result"] in ("partially_meets", "unclear")][:4]
    total_criteria = len(jd_criteria)
    met_criteria = len([c for c in criteria_results if c["result"] == "meets"])
    return {
        "score": total,
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
def generate_report_inline(
    _jd_data, resume_data, jd_raw_text, resume_raw_text, score_result, client, report_model="gpt-4o", screening_criteria=None
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
    screening_criteria_str = json.dumps(screening_criteria or {}, indent=2) if screening_criteria else "{}"
    prompt = f"""You are a Principal Technical Recruiter and Talent Intelligence expert with 15+ years of experience at tier-1 companies. You write the most insightful, evidence-grounded candidate evaluation reports in the industry.
The deterministic scoring engine has ALREADY computed the final score and status. These are LOCKED.
Your ONLY job: write deep, evidence-grounded human-readable analysis for every field below.
You CANNOT change the score, status, or breakdown numbers.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LOCKED SCORING RESULTS (READ ONLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Candidate           : {candidate_name}
Final Score         : {total}/100
Status              : {status}
Criteria Match      : {breakdown["skills_score"]}/{breakdown["skills_max"]} pts
Experience Score    : {breakdown["exp_score"]}/{breakdown["exp_max"]} pts
Career Quality      : {breakdown["career_score"]}/{breakdown["career_max"]} pts
Good-to-have        : {breakdown["good_score"]}/{breakdown["good_max"]} pts
Domain Fit          : {breakdown.get("domain_score", 0)}/{breakdown.get("domain_max", 10)} pts
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
SCREENING CRITERIA:
{screening_criteria_str}
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
        prompt = f"""You are an expert ATS analyst. Your task is to convert a Job Description into a structured set of ROLE ELIGIBILITY CRITERIA that a resume screening engine will use to evaluate candidates.

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

4. WEIGHTS: Assign weights so all criteria weights SUM TO EXACTLY 100. Distribute based on priority:
   - critical criteria get 15-25 points each
   - high criteria get 10-15 points each
   - medium criteria get 5-10 points each

5. EVIDENCE REQUIRED:
   - "work_history" = must be proven in a past job (not just listed)
   - "project" = can be proven via project or freelance work
   - "any" = listed skill or mention is sufficient

6. CANONICAL SKILL NAMES:
   React.js/ReactJS → "React" | Node.js/NodeJS → "Node.js" | PostgreSQL/Postgres → "PostgreSQL"
   AWS/Amazon Web Services → "AWS" | JavaScript/JS → "JavaScript" | TypeScript/TS → "TypeScript"
   GCP/Google Cloud → "GCP" | Azure/MS Azure → "Azure" | n8n/N8N → "n8n"

7. NO INVENTION: Do not add skills or tools not mentioned in the JD. If JD says "build APIs", do NOT automatically add Node.js, Python, or Docker unless stated.

8. NO SOFT SKILLS AS CRITERIA: "communication", "teamwork", "leadership" are NOT scorable criteria unless the JD gives a concrete proof signal (e.g., "manage a team of 5").

9. EXPERIENCE EXTRACTION:
   - "2-4 years" → min_years: 2, max_years: 4
   - "5+ years" → min_years: 5, max_years: null
   - "fresher" / "entry level" → min_years: 0, max_years: 1
   - not mentioned → null

10. SENIORITY INFERENCE (from responsibilities + experience, NOT title alone):
    intern=0-1yr | junior=1-3yr | mid=3-5yr | senior=5+yr | lead=manages others | manager=explicit management

Return ONLY valid JSON. No markdown. No explanation. No hallucination.

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
  "has_technical_requirements": boolean,
  "keywords": [string]
}}

Job Description:
{text}
"""
    elif type_ == "RESUME":
        prompt = f"""You are an expert talent intelligence analyst and ATS resume auditor.

Your task is to convert this resume into a structured, evidence-first JSON object.
This output will feed:
1. A deterministic role eligibility scoring engine.
2. A candidate screening report for HR.
3. An AI interview question generator.

CORE PHILOSOPHY:
A resume is NOT a keyword list. It is a set of evidence claims.
Your job is to identify WHAT the candidate has PROVEN, not what they have listed.
Every skill, tool, and responsibility must be traced back to a source in the resume.

═══════════════════════════════════════════
RULES
═══════════════════════════════════════════

RULE 1 — NO INVENTION:
- Never add companies, dates, tools, metrics, or responsibilities not in the resume.
- If missing, use null or [].
- If work_history is missing or unreadable, set work_history: [] and add a HIGH severity red_flag: missing_work_history.

RULE 2 — EVIDENCE LEVELS (use for evidence_items and skills):
  5 = Work history with ownership AND metrics/outcome (e.g. "Led migration, reduced load time by 40%").
  4 = Work history with ownership, no metric (e.g. "Built the API layer for the payments service").
  3 = Work history mentioned as contributor (e.g. "Worked on React components for the dashboard").
  2 = Project, freelance, academic, or portfolio evidence.
  1 = Skill listed in skills section only. No proof of use.
  0 = Not evidenced at all. Do NOT include these.

RULE 3 — EVIDENCE ITEMS (most important section):
- For every work role and significant project, extract 1-5 evidence_items.
- Each evidence_item is ONE specific thing the candidate did or built.
- The "text" field must be copied or tightly paraphrased from the resume.
- The "proves" field must list canonical responsibility/skill tags it proves.
  Examples: "react", "api_integration", "dashboard_building", "team_leadership",
            "backend_api_development", "data_pipeline", "campaign_management".
- Do NOT create evidence from assumptions.
- "has_metric" = true only if the text contains explicit numbers, percentages, scale, or business outcomes.

RULE 4 — SKILLS SPLIT:
  technical[] = languages, frameworks, libraries ONLY.
    Examples: Python, JavaScript, TypeScript, React, Vue, Angular, Node.js, FastAPI, Django, TensorFlow.
  tools[] = platforms, SaaS, cloud, databases, DevOps, CRM, analytics, automation.
    Examples: AWS, GCP, Azure, PostgreSQL, MongoDB, Docker, Kubernetes, HubSpot, Salesforce, Power BI, Tableau, n8n.
  domain_skills[] = functional/business capabilities (NOT tools or languages).
    Examples: lead generation, SEO, API integration, dashboard development, campaign management, data analysis.
  Do NOT duplicate the same item across all three lists.

RULE 5 — CANONICAL NAMES:
  ReactJS / React.js → React
  NodeJS / Node.js → Node.js
  PostgreSQL / Postgres → PostgreSQL
  JavaScript / JS → JavaScript
  TypeScript / TS → TypeScript
  PowerBI → Power BI
  N8N / n8n.io → n8n
  Amazon Web Services → AWS
  Google Cloud Platform → GCP
  Microsoft Azure → Azure

RULE 6 — WORK HISTORY (extract every role):
  - Preserve exact company, role, start_date, end_date.
  - Dates must be YYYY-MM where possible.
  - Use "Present" ONLY if resume says Present, Current, Till Date, or equivalent.
  - "Present" = May 2026 for duration_months calculation.
  - duration_months must be calculated from start_date to end_date.
  - ownership_level:
      owner = "led", "built", "architected", "launched", "founded", "owned", "created", "drove".
      contributor = "worked on", "assisted", "contributed", "collaborated", "supported".
      unclear = vague description or tools list only.
  - impact_strength:
      high = ownership + explicit metric/scale/revenue/users/business outcome.
      medium = clear work output, no metric.
      low = vague responsibility or tool list only.

RULE 7 — EXPERIENCE CALCULATION:
  - total_years = NON-OVERLAPPING sum of professional work history only.
  - Merge concurrent roles; count overlap once.
  - Do NOT include education duration.
  - Do NOT include projects unless explicitly freelance/paid/client work.
  - seniority_level:
      intern = internship or <1 year total.
      junior = 0-2 years.
      mid = 2-5 years.
      senior = 5+ years.
      lead = explicit technical or team leadership evidence.
      manager = explicit people management.
  - NEVER assign mid+ if total_years < 2. Only exception: explicit founder/CTO/leadership evidence.
  - Always explain seniority_reason in 1 line.

RULE 8 — CAREER TIMELINE:
  - Detect overlapping roles (same months at 2 companies).
  - Detect unexplained gaps (6+ months between roles with no explanation).
  - job_hopping_risk: "high" if 2+ roles each under 10 months.
  - progression_pattern: growing/lateral/declining/mixed/early_career/unknown.

RULE 9 — CORE CLAIMS (top 3-5):
  - A claim is something the candidate asserts about their capability.
  - Must be grounded in evidence_items.
  - confidence: high = company + action + tool + outcome. medium = action + tool, no outcome. low = generic/summary only.

RULE 10 — UNCERTAIN AREAS:
  Add an uncertain_area when:
  - role description is vague.
  - a tool is listed but not tied to any job or project.
  - dates are missing or inconsistent.
  - title suggests seniority but evidence is thin.
  - current role is unclear.
  Each must include a probe_question for the AI interview.

RULE 11 — RED FLAGS (evidence-based only):
  Detect: overlapping_roles | job_hopping | employment_gap | vague_descriptions | no_progression | generic_skills | title_inflation | missing_work_history.
  severity: high = affects screening reliability. medium = probe in interview. low = minor quality issue.
  Do NOT flag name, gender, nationality, age, photo, religion, or personal background.

RULE 12 — CANDIDATE SUMMARY:
  2-3 sentences. Recruiter-style. Name tools, company, domain, actual seniority.
  Do NOT use gendered language. Do NOT copy resume objective.

RULE 13 — PARSE SAFETY:
  - If resume text is clearly corrupted, scanned, or unreadable, set parse_confidence to "low" and add a warning.
  - Return ONLY valid JSON. No markdown. No explanation. No extra keys.

═══════════════════════════════════════════
OUTPUT SCHEMA
═══════════════════════════════════════════

{{
  "parse_confidence": "high" | "medium" | "low",
  "full_name": string | null,
  "email": string | null,
  "phone": string | null,
  "location": {{
    "city": string | null,
    "state": string | null,
    "country": string | null
  }},
  "current_company": string | null,
  "current_role": string | null,
  "links": {{
    "linkedin": string | null,
    "github": string | null,
    "portfolio": string | null
  }},
  "experience": {{
    "total_years": number | null,
    "total_months": number | null,
    "seniority_level": "intern" | "junior" | "mid" | "senior" | "lead" | "manager" | null,
    "seniority_reason": string
  }},
  "work_history": [
    {{
      "id": string,
      "company": string,
      "role": string,
      "start_date": "YYYY-MM" | null,
      "end_date": "YYYY-MM" | "Present" | null,
      "duration_months": number | null,
      "is_current": boolean,
      "responsibilities": [string],
      "technologies_used": [string],
      "impact_signals": [string],
      "ownership_level": "owner" | "contributor" | "unclear",
      "impact_strength": "high" | "medium" | "low",
      "business_domain": string | null
    }}
  ],
  "projects": [
    {{
      "id": string,
      "name": string | null,
      "type": "professional" | "academic" | "personal" | "freelance" | "open_source",
      "description": string,
      "technologies": [string],
      "impact_signals": [string],
      "ownership_level": "owner" | "contributor" | "unclear",
      "impact_strength": "high" | "medium" | "low"
    }}
  ],
  "evidence_items": [
    {{
      "id": string,
      "type": "work_history" | "project" | "certification" | "listed_skill" | "summary",
      "source_ref_id": string | null,
      "source_company": string | null,
      "source_role": string | null,
      "text": string,
      "proves": [string],
      "evidence_level": 1 | 2 | 3 | 4 | 5,
      "ownership": "owner" | "contributor" | "unclear",
      "has_metric": boolean,
      "metric": string | null,
      "confidence": number
    }}
  ],
  "skills": {{
    "technical": [
      {{
        "skill": string,
        "evidence": string,
        "evidence_level": 1 | 2 | 3 | 4 | 5,
        "years_of_use": number | null,
        "source_strength": "work_history_outcome" | "work_history" | "project" | "listed" | "inferred"
      }}
    ],
    "tools": [
      {{
        "tool": string | null,
        "category": string | null,
        "evidence": string,
        "evidence_level": 1 | 2 | 3 | 4 | 5,
        "source_strength": "work_history_outcome" | "work_history" | "project" | "listed" | "inferred",
        "confidence": "high" | "medium" | "low"
      }}
    ],
    "domain_skills": [string]
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
  "certifications": [
    {{
      "name": string,
      "issuer": string | null,
      "date": "YYYY-MM" | null
    }}
  ],
  "career_timeline": {{
    "overlaps": [
      {{
        "roles": [string, string],
        "overlap_months": number,
        "severity": "low" | "medium" | "high"
      }}
    ],
    "gaps": [
      {{
        "after_role_id": string,
        "gap_months": number,
        "severity": "low" | "medium" | "high"
      }}
    ],
    "job_hopping_risk": "none" | "low" | "medium" | "high",
    "progression_pattern": "growing" | "lateral" | "declining" | "mixed" | "early_career" | "unknown"
  }},
  "core_claims": [
    {{
      "claim": string,
      "evidence": string,
      "confidence": "high" | "medium" | "low"
    }}
  ],
  "uncertain_areas": [
    {{
      "area": string,
      "reason": string,
      "probe_question": string
    }}
  ],
  "red_flags": [
    {{
      "flag": "overlapping_roles" | "job_hopping" | "employment_gap" | "vague_descriptions" | "no_progression" | "generic_skills" | "title_inflation" | "missing_work_history",
      "severity": "high" | "medium" | "low",
      "detail": string
    }}
  ],
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
            # Resume reports MUST use GPT-4o only — no fallback to mini
            report, report_usage = generate_report_inline(
                jd_data,
                resume_data,
                jd_raw_text,
                resume_raw_text,
                score_result,
                client,
                report_model=llm_model_override or "gpt-4o",
                screening_criteria=screening_criteria,
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
                # Raw resume fields as fallback for UI reads (overridden by **report where gpt-4o produces them)
                "work_history": resume_data.get("work_history", []),
                "education": resume_data.get("education", []),
                "core_claims": resume_data.get("core_claims", []),
                "uncertain_areas": resume_data.get("uncertain_areas", []),
                "skill_depth": resume_data.get("skills", {}).get("skill_depth", []),
                **report,  # Spread all LLM report fields (includes experience_assessment, work_history_annotated, decision_reason, etc.)
                # Backward-compat: if LLM still emits old key, promote it
                "experience_assessment": report.get("experience_assessment") or report.get("experience_analysis") or {},
            }
            return {"data": final_data, "usage": report_usage}
        except Exception as e:
            # Fallback reasoning if detailed report fails (still use GPT-4o)
            return {
                "data": {
                    **score_result,
                    "recruiter_snapshot": f"Automated evaluation completed with score {score_result['score']}.",
                    "ai_verdict": f"Status: {score_result['status']}. Score: {score_result['score']}.",
                },
                "usage": {
                    "model": "gpt-4o",
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
                            "model": "gpt-4o",
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
