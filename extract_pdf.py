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
        # API / protocols — JD phrases and LLM compound tags
        "restapi": "rest",
        "restapis": "rest",
        "restfulapi": "rest",
        "restfulapis": "rest",
        "restful": "rest",
        "restapidevelopment": "rest",
        "restapidesign": "rest",
        "restapiconsumption": "rest",
        "restapidevelopmentanddesign": "rest",
        "backendapidevelopment": "rest",
        "apidevelopment": "rest",
        "apidesign": "rest",
        "apiintegration": "rest",
        "apidesignandintegration": "rest",
        "graphqlapi": "graphql",
        "graphqlapis": "graphql",
        "grpcapi": "grpc",
        "websocket": "websockets",
        # DSA / CS fundamentals
        "datastructuresandalgorithms": "dsa",
        "datastructures": "dsa",
        "algorithmsanddatastructures": "dsa",
        "dsa": "dsa",
        "algorithms": "dsa",
        "algorithmicthinking": "dsa",
        # OOP / Java fundamentals
        "objectoriented": "oop",
        "objectorientedprogramming": "oop",
        "oops": "oop",
        "oop": "oop",
        "corejava": "java",
        "javafundamentals": "java",
        "javabasics": "java",
        # Version control extras
        "versioncontrol": "git",
        "sourcecontrol": "git",
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
    # DSA: any language with work history implies foundational DSA knowledge
    "dsa": ["java", "python", "javascript", "typescript", "cpp"],
    # OOP: any OOP language implies OOP concepts
    "oop": ["java", "python", "javascript", "typescript", "spring", "django"],
    # REST: node/express/spring/django all build REST APIs
    "rest": ["node", "express", "spring", "django", "fastapi", "flask"],
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
def _normalise_jd_weights(jd_data):
    criteria = jd_data.get("criteria", [])
    if not criteria:
        return jd_data
    raw = [max(c.get("weight", 0), 1) for c in criteria]
    total = sum(raw)
    if total == 0:
        return jd_data
    count = len(raw)
    # If there are more than 100 criteria, exact normalization with a min-1 floor
    # is impossible. Fall back to the original weights in that pathological case.
    if count > 100:
        return jd_data

    scale = 100.0 / total
    # Largest-remainder normalization:
    # 1) scale weights
    # 2) take floors with a minimum of 1
    # 3) distribute any remaining points to the largest fractional parts
    scaled_float = [w * scale for w in raw]
    scaled = [max(1, int(w)) for w in scaled_float]
    diff = 100 - sum(scaled)
    if diff > 0:
        order = sorted(
            range(len(scaled_float)),
            key=lambda i: (scaled_float[i] - int(scaled_float[i]), raw[i]),
            reverse=True,
        )
        for i in order:
            if diff <= 0:
                break
            scaled[i] += 1
            diff -= 1
    elif diff < 0:
        order = sorted(
            range(len(scaled)),
            key=lambda i: (scaled[i] - 1, raw[i]),
            reverse=True,
        )
        for i in order:
            if diff >= 0:
                break
            if scaled[i] <= 1:
                continue
            scaled[i] -= 1
            diff += 1
    for c, w in zip(criteria, scaled):
        c["weight"] = w
    jd_data["criteria"] = criteria
    return jd_data

JD_CANONICAL_SKILL_REFERENCE = """
Frontend: React | Vue | Angular | Next.js | Nuxt.js | TypeScript | JavaScript | Tailwind CSS
Backend: Node.js | Express | Django | Flask | FastAPI | Spring | Hibernate | Java
Mobile: React Native | Flutter | Swift | Kotlin | Android | iOS
Databases: PostgreSQL | MySQL | MongoDB | Redis | Elasticsearch | SQLite | SQL Server | Cassandra
Cloud: AWS | GCP | Azure
DevOps/Infra: Docker | Kubernetes | Terraform | Ansible | Helm | ArgoCD | Jenkins | CI/CD | Linux | Nginx
AI/ML: Python | TensorFlow | PyTorch | scikit-learn | Hugging Face | LangChain | LLM | GenAI | ML | NLP | Spark | Kafka | Airflow
BI/Analytics: Power BI | Tableau | Looker | Metabase | Superset | Google Analytics | Excel
CRM/Marketing: HubSpot | Salesforce | Google Ads | Meta Ads | Zapier | n8n | Make
API/Protocols: REST | GraphQL | gRPC | WebSockets
Testing: Jest | Pytest | Cypress | Playwright
Version control: Git
Messaging: RabbitMQ | SQS | EventBridge
""".strip()

RESUME_CANONICAL_SKILL_REFERENCE = """
react | vue | angular | next | nuxt | typescript | javascript | tailwind | node | express | django | flask | fastapi | spring | hibernate | java | python
postgres | mongo | elasticsearch | sqlserver | mysql | sqlite | redis | cassandra | aws | gcp | azure | k8s | docker | cicd | linux | nginx
ai | dl | nlp | llm | genai | ml | datascience | spark | kafka | airflow | scikitlearn | xgboost | lightgbm | tensorflow | pytorch | huggingface | langchain
powerbi | excel | googleanalytics | looker | tableau | metabase | superset | n8n | zapier | make | reactnative | flutter | swift | kotlin | android | ios
hubspot | salesforce | googleads | metaads | rest | graphql | grpc | websockets | dsa | oop | git | testing | jest | pytest | cypress | playwright
rabbitmq | sqs | eventbridge | algolia | solr | apache
""".strip()


def _postprocess_jd_output(jd_data):
    """
    Normalize extracted JD JSON before it is persisted.
    This makes the stored JD safer for deterministic scoring.
    """
    if not isinstance(jd_data, dict):
        return {}
    jd_data = _normalise_jd_weights(jd_data)
    scoring_hints = jd_data.get("scoring_hints")
    if not isinstance(scoring_hints, dict):
        scoring_hints = {}
    scoring_hints.setdefault("green_flags_to_reward", [])
    scoring_hints.setdefault("red_flags_to_watch", [])
    jd_data["scoring_hints"] = scoring_hints
    return jd_data

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


def _build_human_like_adjustment(
    jd_data,
    resume_data,
    score_result,
    criteria_results,
    resume_normalized,
    work_history,
    resume_raw_text_corpus,
):
    """
    Second-layer human-like rubric.
    This does not replace the deterministic score; it re-reads the same evidence
    with recruiter-style judgment about direct proof, adjacency, ownership, and risk.
    The adjustment is intentionally bounded so the layer can refine, not rewrite,
    the base score.
    """
    jd_role = (
        jd_data.get("role_level")
        or _as_dict(jd_data.get("role_context", {})).get("seniority")
        or "unknown"
    )
    jd_role_key = str(jd_role or "").strip().lower()
    candidate_years = score_result.get("candidate_years")
    jd_min_years = score_result.get("jd_min_years")
    jd_keywords = {normalize_skill(k) for k in (jd_data.get("keywords", []) or []) if k}

    def resolve_role_band() -> str:
        if jd_role_key in ("intern", "junior", "mid", "senior", "lead", "manager"):
            return jd_role_key
        if jd_min_years is not None:
            if jd_min_years <= 1:
                return "intern"
            if jd_min_years <= 2:
                return "junior"
            if jd_min_years <= 5:
                return "mid"
            return "senior"
        if candidate_years is not None:
            if candidate_years <= 1:
                return "intern"
            if candidate_years <= 2:
                return "junior"
            if candidate_years <= 5:
                return "mid"
            return "senior"
        return "mid"

    role_band = resolve_role_band()
    role_profiles = {
        "intern": {
            "direct": 1.00,
            "adjacent": 0.50,
            "impact": 1.00,
            "experience": 0.85,
            "domain": 0.90,
            "blocker": 1.05,
            "max_positive": 10,
            "max_negative": 15,
        },
        "junior": {
            "direct": 1.00,
            "adjacent": 0.55,
            "impact": 1.00,
            "experience": 0.90,
            "domain": 0.95,
            "blocker": 1.10,
            "max_positive": 10,
            "max_negative": 16,
        },
        "mid": {
            "direct": 1.05,
            "adjacent": 0.50,
            "impact": 1.05,
            "experience": 0.90,
            "domain": 1.00,
            "blocker": 1.15,
            "max_positive": 9,
            "max_negative": 18,
        },
        "senior": {
            "direct": 1.15,
            "adjacent": 0.35,
            "impact": 1.15,
            "experience": 0.80,
            "domain": 1.05,
            "blocker": 1.20,
            "max_positive": 8,
            "max_negative": 18,
        },
        "lead": {
            "direct": 1.20,
            "adjacent": 0.30,
            "impact": 1.20,
            "experience": 0.80,
            "domain": 1.10,
            "blocker": 1.25,
            "max_positive": 8,
            "max_negative": 20,
        },
        "manager": {
            "direct": 1.20,
            "adjacent": 0.25,
            "impact": 1.20,
            "experience": 0.80,
            "domain": 1.10,
            "blocker": 1.25,
            "max_positive": 8,
            "max_negative": 20,
        },
    }
    profile = role_profiles.get(role_band, role_profiles["mid"])

    jd_core_skills = []
    for criterion in (jd_data.get("criteria", []) or []):
        if criterion.get("category") == "skill":
            normalized = normalize_skill(criterion.get("name"))
            if normalized:
                jd_core_skills.append(normalized)
    jd_core_skill_hits = [skill for skill in jd_core_skills if skill in resume_normalized]
    jd_core_skill_misses = [skill for skill in jd_core_skills if skill not in resume_normalized]
    jd_core_skill_total = len(jd_core_skills)
    jd_core_skill_hit_count = len(jd_core_skill_hits)
    jd_core_skill_match_ratio = (jd_core_skill_hit_count / jd_core_skill_total) if jd_core_skill_total else 0.0
    tech_alignment_clear = jd_core_skill_total == 0 or jd_core_skill_match_ratio >= 0.80
    tech_alignment_partial = jd_core_skill_total == 0 or jd_core_skill_match_ratio >= 0.50

    adjustment = 0
    reasons = []
    strong_evidence = []
    risk_flags = []

    def add_delta(delta: int, reason: str, evidence: str | None = None):
        nonlocal adjustment
        if delta == 0:
            return
        adjustment += delta
        entry = {"delta": delta, "reason": reason}
        if evidence:
            entry["evidence"] = evidence
            if delta > 0:
                strong_evidence.append({"reason": reason, "evidence": evidence, "delta": delta})
        reasons.append(entry)

    def job_has_backend_depth(job):
        techs = {normalize_skill(t) for t in (job.get("technologies_used", []) or []) if t}
        resp = " ".join(job.get("responsibilities", []) or []).lower()
        backend_tokens = {
            "java",
            "spring",
            "hibernate",
            "rest",
            "node",
            "express",
            "django",
            "flask",
            "fastapi",
            "python",
            "microservices",
            "api",
        }
        return bool(techs & backend_tokens) or any(tok in resp for tok in backend_tokens)

    direct_hits = [c for c in criteria_results if c.get("result") == "meets"]
    partial_hits = [c for c in criteria_results if c.get("result") in ("partially_meets", "unclear")]
    strong_direct = [c for c in direct_hits if c.get("ev_type") in ("work_history_outcome", "work_history")]
    weak_direct = [c for c in direct_hits if c.get("ev_type") in ("project", "listed", "inferred")]

    # 1) Direct must-have evidence carries the most weight.
    if strong_direct and tech_alignment_partial:
        direct_names = ", ".join(c.get("criterion", "") for c in strong_direct[:4]) or None
        if tech_alignment_clear:
            direct_cap = 4
            direct_reason = f"Direct must-have evidence is proven in work history and the JD tech stack is a strong match ({role_band} fit)"
        else:
            direct_cap = 2
            direct_reason = f"Direct must-have evidence exists, but the JD tech stack is only partially matched ({role_band} fit)"
        add_delta(
            int(round(min(direct_cap, len(strong_direct) * 2) * profile["direct"])),
            direct_reason,
            direct_names,
        )
    elif strong_direct:
        direct_names = ", ".join(c.get("criterion", "") for c in strong_direct[:4]) or None
        risk_flags.append("Direct proof exists, but the candidate is weak on the JD technology stack")
        add_delta(
            -2 if role_band in ("intern", "junior") else -3,
            "Direct proof is present, but it does not line up tightly enough with the JD technology stack",
            direct_names,
        )
    if weak_direct and tech_alignment_partial:
        weak_names = ", ".join(c.get("criterion", "") for c in weak_direct[:4]) or None
        add_delta(
            int(round(min(3, len(weak_direct)) * (0.7 if not tech_alignment_clear else 0.9))),
            "Some criteria are supported only by weaker evidence",
            weak_names,
        )

    # 2) Technology alignment should lead the judgment.
    if jd_core_skills:
        if tech_alignment_clear:
            add_delta(
                int(round(4 * profile["direct"])),
                f"Strong direct technology alignment across {jd_core_skill_hit_count}/{jd_core_skill_total} core JD skills",
                ", ".join(jd_core_skill_hits[:5]),
            )
        elif tech_alignment_partial:
            add_delta(
                int(round(2 * profile["direct"])),
                f"Partial technology alignment across {jd_core_skill_hit_count}/{jd_core_skill_total} core JD skills",
                ", ".join(jd_core_skill_hits[:5]),
            )
        elif jd_core_skill_hit_count == 1:
            risk_flags.append("Only one core JD technology is evidenced")
            add_delta(
                -2 if role_band in ("intern", "junior") else -3,
                "Only one core JD technology is evidenced, which is weaker than the role expects",
                ", ".join(jd_core_skill_hits[:5]),
            )
        else:
            if "No direct JD technology match" not in risk_flags:
                risk_flags.append("No direct JD technology match")
            add_delta(
                -6 if role_band in ("intern", "junior") else -7,
                "The resume does not show direct alignment with the JD technology stack",
                ", ".join(jd_core_skills[:5]),
            )

    # 3) Adjacent backend proof only reinforces a real technology match.
    backend_jobs = [job for job in work_history if job_has_backend_depth(job)]
    backend_jobs_with_impact = [job for job in backend_jobs if job.get("impact_signals")]
    if backend_jobs and jd_core_skill_hits and tech_alignment_partial:
        base_backend_delta = 3 if len(backend_jobs) >= 2 else 1
        add_delta(
            int(round(base_backend_delta * profile["adjacent"])),
            f"Multiple backend roles reinforce the technology match ({role_band} fit)",
            "; ".join(f"{job.get('company')} / {job.get('role')}" for job in backend_jobs[:2]),
        )
    if backend_jobs_with_impact and jd_core_skill_hits and tech_alignment_clear:
        base_backend_impact = 2 if len(backend_jobs_with_impact) >= 2 else 1
        add_delta(
            int(round(base_backend_impact * profile["impact"])),
            f"Backend work included measurable outcomes that reinforce the technology match ({role_band} fit)",
            "; ".join(job.get("company", "") for job in backend_jobs_with_impact[:2]),
        )

    # 4) Measurable ownership and impact should move the score up materially.
    impact_signals = sum(len(job.get("impact_signals", []) or []) for job in work_history)
    owner_count = sum(1 for job in work_history if job.get("ownership_level") == "owner")
    if tech_alignment_partial:
        if impact_signals >= 4 and tech_alignment_clear:
            add_delta(int(round(3 * profile["impact"])), "Multiple measurable outcomes show the candidate ships real work", f"{impact_signals} impact signals")
        elif impact_signals >= 2 and tech_alignment_clear:
            add_delta(int(round(2 * profile["impact"])), "There is enough measurable output to trust the resume narrative", f"{impact_signals} impact signals")
        elif impact_signals >= 1 and tech_alignment_clear:
            add_delta(int(round(1 * profile["impact"])), "At least one measurable outcome is present", f"{impact_signals} impact signal")
        if owner_count >= 2 and tech_alignment_clear:
            add_delta(int(round(2 * profile["impact"])), "Multiple owner-level roles indicate genuine execution ownership", f"{owner_count} owner-level roles")
        elif owner_count == 1 and tech_alignment_clear:
            add_delta(int(round(1 * profile["impact"])), "One owner-level role adds credibility", "1 owner-level role")

    # 5) Experience and freshness.
    if jd_min_years is not None and candidate_years is not None and tech_alignment_partial:
        if candidate_years >= jd_min_years:
            add_delta(int(round(3 * profile["experience"])), "Candidate meets the required experience floor", f"{candidate_years} yrs vs {jd_min_years} yrs required")
        elif candidate_years + 1 >= jd_min_years:
            gap_delta = 2 if role_band in ("intern", "junior") else 1 if role_band == "mid" else 0
            if gap_delta > 0:
                add_delta(
                    int(round(gap_delta * profile["experience"])),
                    f"The experience gap is small and acceptable for a {role_band} role",
                    f"{candidate_years} yrs vs {jd_min_years} yrs required",
                )

    # 6) Domain and keyword overlap.
    domain_skills = resume_data.get("skills", {}).get("domain_skills", []) or []
    jd_kw_hits = sum(1 for s in domain_skills if s and normalize_skill(s) in jd_keywords)
    if jd_kw_hits >= 3 and tech_alignment_partial:
        add_delta(int(round(3 * profile["domain"])), "Domain skills align with JD keywords", f"{jd_kw_hits} overlapping domain skills")
    elif jd_kw_hits >= 1 and tech_alignment_clear:
        add_delta(int(round(1 * profile["domain"])), "Some domain alignment is visible", f"{jd_kw_hits} overlapping domain skill")

    # 7) Penalize true blockers, but only when the resume really gives no adjacent proof.
    missing_must = set(score_result.get("skill_matching", {}).get("missing_must", []) or [])
    if "Java" in missing_must and "java" not in resume_normalized:
        risk_flags.append("Java is not evidenced")
        add_delta(int(round(-5 * profile["blocker"])), "Core Java is absent from the structured evidence", "Java missing")
    if "Spring Boot" in missing_must and "spring" not in resume_normalized and "springboot" not in resume_normalized:
        if not backend_jobs and not ({"java", "rest"} <= set(resume_normalized.keys())):
            risk_flags.append("Spring Boot is not evidenced")
            add_delta(int(round(-4 * profile["blocker"])), "Spring Boot is missing and there is no adjacent backend proof", "Spring Boot missing")
    if "Data Structures and Algorithms" in missing_must:
        if not any(tok in resume_normalized for tok in ("dsa", "algorithm", "algorithms")):
            add_delta(int(round(-2 * profile["blocker"])), "DSA is still weakly evidenced", "No explicit DSA signal")

    adjustment = max(-1 * profile["max_negative"], min(profile["max_positive"], adjustment))
    human_score = max(0, min(100, round(score_result["score"] + adjustment)))
    confidence = 55
    if strong_direct:
        confidence += 15
    if impact_signals >= 2:
        confidence += 10
    if backend_jobs:
        confidence += 10
    if jd_core_skill_hits:
        confidence += 3 if len(jd_core_skill_hits) >= 2 else 1
    if not risk_flags:
        confidence += 5
    confidence = max(35, min(95, confidence))

    if human_score >= 75:
        judgment = "Shortlisted"
    elif human_score >= 60:
        judgment = "Borderline"
    else:
        judgment = "Rejected"

    summary_bits = []
    if strong_direct:
        summary_bits.append(
            f"Direct proof covers {len(strong_direct)} JD criteria: {', '.join(c.get('criterion', '') for c in strong_direct[:4])}"
        )
    if jd_core_skills:
        summary_bits.append(
            f"Core JD technology hits: {len(jd_core_skill_hits)} matched, {len(jd_core_skill_misses)} missing"
        )
    if backend_jobs:
        summary_bits.append(
            f"Backend evidence comes from {len(backend_jobs)} work-history roles: {', '.join(job.get('company', '') for job in backend_jobs[:3])}"
        )
    summary_bits.append(f"Role band used for tuning: {role_band}")
    if strong_evidence:
        summary_bits.append(
            "Most useful signals: " + "; ".join(
                f"{item['reason']} ({item.get('evidence', '')})" for item in strong_evidence[:3]
            )
        )
    if partial_hits:
        summary_bits.append(
            f"Partial evidence remains on {', '.join(c.get('criterion', '') for c in partial_hits[:3])}"
        )
    if risk_flags:
        summary_bits.append("Risks: " + "; ".join(risk_flags))

    return {
        "base_score": score_result["score"],
        "human_adjustment": adjustment,
        "human_score": human_score,
        "confidence": confidence,
        "judgment": judgment,
        "strong_evidence": strong_evidence,
        "reasons": reasons,
        "risk_flags": risk_flags,
        "summary": " ".join(summary_bits).strip(),
    }
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
            # Multi-word phrases (e.g. "Data Structures and Algorithms", "REST APIs") are
            # not single-token skills — use "responsibility" category so the raw-text word
            # matching path fires for them instead of exact normalized-key lookup.
            is_multiword = len(str(name).split()) > 2
            category = "responsibility" if is_multiword else "skill"
            jd_criteria.append({
                "id": f"legacy_{name}", "category": category, "name": name,
                "priority": w, "weight": weight_pts,
                "evidence_required": "any", "source_text": name
            })
        # Also add good_to_have as medium criteria so they contribute to good_score pool
        for s in (jd_skills.get("good_to_have", []) or []):
            name = s["skill"] if isinstance(s, dict) else s
            if not name:
                continue
            is_multiword = len(str(name).split()) > 2
            category = "responsibility" if is_multiword else "skill"
            jd_criteria.append({
                "id": f"legacy_good_{name}", "category": category, "name": name,
                "priority": "medium", "weight": 8,
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
    evidence_items = resume_data.get("evidence_items", []) or []
    if not isinstance(evidence_items, list):
        evidence_items = []
    domain_skills = resume_skills.get("domain_skills", [])
    skill_evidence_map = {}
    priority_rank = {"work_history_outcome": 5, "work_history": 4, "project": 3, "listed": 2, "keyword": 1}
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
            mapped_src = src if src in ("work_history_outcome", "work_history", "project", "listed", "inferred") else "listed"
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
                mapped_src = src if src in ("work_history_outcome", "work_history", "project", "listed", "inferred") else "listed"
                _add_skill(tool, s.get("evidence", ""), conf, mapped_src)
                all_resume_skill_names.append(tool)
        elif isinstance(s, str) and s:
            _add_skill(s, "", "high", "listed")
            all_resume_skill_names.append(s)
    for job in work_history:
        company = job.get("company", "work history")
        src = "work_history_outcome" if job.get("impact_signals") else ("work_history" if job.get("impact_strength") in ("high", "medium") else "project")
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
    career_timeline = resume_data.get("career_timeline", {})
    career_progression = _as_dict(resume_data.get("career_progression", {}))
    career_context = " ".join(filter(None, [
        career_timeline.get("progression_pattern", ""),
        career_timeline.get("job_hopping_risk", ""),
        career_progression.get("analysis", ""),
    ]))
    resume_raw_text_corpus = " ".join(filter(None, [
        resume_data.get("candidate_summary", ""),
        career_context,
        " ".join(kw for kw in (resume_data.get("keywords", []) or []) if kw),
        " ".join(" ".join(str(t) for t in (job.get("technologies_used", []) or [])) for job in work_history),
        " ".join(job.get("business_domain", "") for job in work_history if job.get("business_domain")),
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
    matched_must = []
    missing_must = []
    partial_must = []
    matched_good = []
    must_have_details = []
    
    # Initialize custom check counters
    custom_required_total = 0
    custom_required_missing = []
    custom_required_hits = []

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

        # Experience-category criteria are scored from the resume's total_years,
        # not from text/skill matching, to avoid treating "3+ years in fintech" like a skill.
        if ccategory == "experience":
            cand_yrs = resume_data.get("experience", {}).get("total_years")
            # Try to parse a minimum/maximum requirement from the criterion name.
            # Supports "5+ years", "5 years", and "5-7 years" style phrases.
            req_min = None
            req_max = None
            range_match = re.search(r"(\d+)\s*(?:-|to|–|—)\s*(\d+)\s*(?:\+)?\s*years?", cname, re.IGNORECASE)
            plus_match = re.search(r"(\d+)\s*\+\s*years?", cname, re.IGNORECASE)
            single_match = re.search(r"(\d+)\s*years?", cname, re.IGNORECASE)
            if range_match:
                req_min = int(range_match.group(1))
                req_max = int(range_match.group(2))
            elif plus_match:
                req_min = int(plus_match.group(1))
            elif single_match:
                req_min = int(single_match.group(1))

            if cand_yrs is not None and req_min is not None:
                gap = cand_yrs - req_min
                if req_max is not None and cand_yrs > req_max + 2:
                    result, ev_type, confidence = "unclear", "work_history", 0.65
                elif gap >= 0:
                    result, ev_type, confidence = "meets", "work_history", 0.90
                elif gap >= -1:
                    result, ev_type, confidence = "partially_meets", "work_history", 0.70
                elif gap >= -2:
                    result, ev_type, confidence = "unclear", "listed", 0.40
                else:
                    result, ev_type, confidence = "does_not_meet", "none", 0.0
            elif cand_yrs is not None:
                # If we can’t parse the requirement, give only mild credit rather than a full pass.
                result, ev_type, confidence = "unclear", "work_history", 0.45
            # Skip generic matching entirely for experience criteria
            criteria_results.append({
                "criterion": cname, "category": ccategory, "priority": cpriority,
                "weight": cweight, "result": result, "confidence": round(confidence, 2),
                "evidence": matched_evidence_text, "ev_type": ev_type,
            })
            r_mult = RESULT_MULT.get(result, 0.0)
            e_mult = EVIDENCE_MULT.get(ev_type, 0.15)
            contribution = cweight * r_mult * e_mult
            if cpriority == "medium":
                good_matched_weight += contribution
            else:
                must_matched_weight += contribution
            if result == "meets":
                (matched_good if cpriority == "medium" else matched_must).append(cname)
                must_have_details.append({"name": cname, "weight": cpriority, "status": "found", "match_level": "full"})
            elif result in ("partially_meets", "unclear"):
                if cpriority != "medium":
                    partial_must.append(cname)
                must_have_details.append({"name": cname, "weight": cpriority, "status": "mentioned", "match_level": result})
            else:
                if cpriority != "medium":
                    missing_must.append(cname)
                must_have_details.append({"name": cname, "weight": cpriority, "status": "not_found", "match_level": "none"})
            continue

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
                if ev_src_raw == "work_history_outcome":
                    result = "meets"
                    ev_type = "work_history_outcome"
                    confidence = 1.0
                elif ev_src_raw == "work_history":
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

    # Custom HR screening checks are handled separately from JD criteria.
    for check in hr_custom_checks:
        check_text = ""
        required = False
        if isinstance(check, dict):
            check_text = str(check.get("text") or check.get("label") or "").strip()
            required = bool(check.get("required"))
        else:
            check_text = str(check or "").strip()
        if not check_text:
            continue

        custom_required_total += 1 if required else 0
        level, multiplier = _custom_check_match(check_text, resume_normalized, resume_raw_text_corpus)
        if level in ("full", "partial", "mentioned"):
            custom_required_hits.append(check_text)
            if required:
                must_matched_weight += 10 * multiplier
                must_total_weight += 10
            must_have_details.append({
                "name": f"Custom: {check_text}",
                "weight": "high",
                "status": "found" if level == "full" else "mentioned",
                "match_level": level,
            })
        else:
            if required:
                custom_required_missing.append(check_text)
                missing_must.append(f"Custom: {check_text}")
                must_total_weight += 10
            must_have_details.append({
                "name": f"Custom: {check_text}",
                "weight": "high",
                "status": "not_found",
                "match_level": level,
            })
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
    human_layer = _build_human_like_adjustment(
        jd_data,
        resume_data,
        {
            "score": total,
            "candidate_years": candidate_years,
            "jd_min_years": jd_min_years,
            "skill_matching": {"missing_must": missing_must},
        },
        criteria_results,
        resume_normalized,
        work_history,
        resume_raw_text_corpus,
    )
    adjusted_total = int(human_layer.get("human_score", total))
    # ── 8. Hard rejection gates ────────────────────────────────────────────
    # Criteria-based: reject only if 2+ CRITICAL criteria are "does_not_meet"
    hard_rejected = False
    rejection_reasons = []
    critical_fails = [c for c in criteria_results if c.get("priority") == "critical" and c.get("result") == "does_not_meet"]
    critical_total = len([c for c in criteria_results if c.get("priority") == "critical"])
    # Hard reject only when ALL critical criteria fail, or all but one in a large critical set.
    # A threshold of >= 2 was firing on intern JDs where the evidence path was weak,
    # causing candidates with strong work history to be incorrectly hard-rejected.
    if critical_total > 0 and len(critical_fails) >= max(2, critical_total):
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
    elif adjusted_total >= threshold:
        status = "Shortlisted"
    elif adjusted_total >= borderline_floor:
        status = "Borderline"
    else:
        status = "Rejected"
    # Build shortlist reason from criteria results
    top_evidence = [c["evidence"] for c in criteria_results if c["result"] == "meets" and c["evidence"]][:3]
    gaps_to_probe = [c["criterion"] for c in criteria_results if c["result"] in ("partially_meets", "unclear")][:4]
    total_criteria = len(jd_criteria)
    met_criteria = len([c for c in criteria_results if c["result"] == "meets"])
    return {
        "score": adjusted_total,
        "base_score": total,
        "human_layer": human_layer,
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
7. decision_reason (string — EXACTLY 1 sentence)
   - The single most decisive reason for {status}.
   - Shortlisted: what clinches it. Borderline: what tips it. Rejected: the hard stopper.
   - No hedging. No softening. E.g. "5 of 6 must-haves confirmed across 3 owner-level roles with production metrics."
8. ai_verdict (string — 3–5 sentences)
   - Expert synthesis for HR. Combine: capability summary, must-have match quality, deepest evidence signal, recommendation.
   - Name companies and skills. Every sentence grounded in resume evidence.
   - State plainly why shortlisted OR why not.
   - For borderline: state exactly what would push them to shortlisted.
   - Call out any claim that needs interview verification.
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
  "decision_reason": "string",
  "ai_verdict": "string"
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
   - Keep the weights proportional to importance; the Python pipeline will re-normalize before save, but your output should still reflect the intended 100-point split.

5. EVIDENCE REQUIRED:
   - "work_history" = use when the JD says the candidate must have done it in a real job, including:
       * any "X+ years of experience in..." requirement
       * any senior/lead/ownership criterion
       * any phrase like "production experience", "hands-on experience", or "proven track record"
       * any critical-priority criterion where listed-only evidence would be too weak
   - "project" = use when a project/freelance/open-source signal would be acceptable evidence
   - "any" = use only when a listed skill or simple mention is enough, especially for low-stakes or nice-to-have items

6. CANONICAL SKILL NAMES — use these exact canonical labels in criterion "name" and "keywords" fields.
   The scoring engine normalises against a strict alias table, so use the canonical form below rather than variants.
{JD_CANONICAL_SKILL_REFERENCE}

   If the JD uses a variant (e.g. "ReactJS", "Postgres", "k8s", "GCP", "Node"), map it to the canonical form above.

7. NO INVENTION: Do not add skills or tools not mentioned in the JD. If JD says "build APIs", do NOT automatically add Node.js, Python, or Docker unless stated.

8. NO SOFT SKILLS AS CRITERIA: "communication", "teamwork", "leadership" are NOT scorable criteria unless the JD gives a concrete proof signal (e.g., "manage a team of 5").

9. EXPERIENCE EXTRACTION:
   - "2-4 years" → min_years: 2, max_years: 4
   - "5+ years" → min_years: 5, max_years: null
   - "fresher" / "entry level" → min_years: 0, max_years: 1
   - not mentioned → null

10. SENIORITY INFERENCE (from responsibilities + experience, NOT title alone):
    intern=0-1yr | junior=1-3yr | mid=3-5yr | senior=5+yr | lead=manages others | manager=explicit management

11. CATEGORY DECISION RULES — use the most specific category that fits:
    - "skill" = a named technology, language, framework, or tool (React, Python, PostgreSQL, Docker)
    - "responsibility" = a concrete deliverable or action the person must DO in this role (build dashboards, integrate third-party APIs, write unit tests, debug, test, document, collaborate). Use when the JD says "you will..." or "responsible for..."
    - "experience" = a stated duration or seniority in a domain ("3+ years in fintech", "senior-level backend experience", "X years of production Java")
    - "ownership" = explicit autonomy expectation (own the product roadmap, lead the architecture, drive end-to-end delivery). Use ONLY when the JD says the candidate will own or lead something independently.
    - "domain" = required industry or business context with no specific tool attached (SaaS product experience, B2B sales background, regulated healthcare environment)
    Do NOT default to "skill" for responsibility, ownership, or domain requirements.

12. EVIDENCE REQUIRED DECISION RULES:
    - "work_history" = use when the JD implies the candidate must have proven this in a real job:
        * any criterion with "X+ years of experience in..."
        * any senior/lead/ownership criterion
        * any phrase like "proven track record", "production experience", or "hands-on experience"
        * any critical-priority criterion where listed-only evidence would be too weak
    - "project" = use when demonstrated ability matters but employment is not required:
        * portfolio, open-source, freelance, or academic work would be acceptable evidence
        * junior/intern roles where project evidence is a valid signal
    - "any" = use only when a listed skill or mention is genuinely sufficient:
        * tool familiarity
        * nice-to-have / medium-priority criteria with no experience requirement
        * simple knowledge signals like "familiarity with Git"

13. SCORING HINTS — extract signals that help rank candidates WITHIN the shortlisted pool:
    The downstream scorer reads these directly. Do not omit the field.
    green_flags_to_reward: List 2-5 concrete differentiators that would make a candidate STAND OUT above the minimum bar.
        Examples: same industry background, exact product type built, valued but not required certifications,
        experience at a competitor/well-known company, or a directly adjacent stack that reduces onboarding risk.
        Derive these from: preferred qualifications, bonus points, nice-to-have sections, and the overall role context.
        Use canonical skill/domain names (same rules as criterion names).
        If none are clearly implied, return [].
    red_flags_to_watch: List 2-4 concrete signals that should REDUCE a candidate's domain fit score.
        Examples: only agency/freelance experience for a product role, only enterprise background for a startup role,
        or an unrelated domain when domain expertise is central to the role.
        Derive from: role context, company stage signals, or explicit "we are NOT looking for..." language.
        If none are clearly implied, return [].

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
- The "proves" field MUST use CANONICAL SKILL NAMES — the exact same strings the scoring engine
  matches against (see RULE 5 and the canonical name list below). These are the primary match keys.
  You MAY also include functional tags AFTER the canonical names, but canonical names come first.

  CANONICAL SKILL KEYS (use these normalized keys exactly; these are what normalize_skill() expects):
{RESUME_CANONICAL_SKILL_REFERENCE}

  FUNCTIONAL TAGS (add only after canonical names if relevant):
    "api_integration", "dashboard_building", "team_leadership",
    "backend_api_development", "data_pipeline", "campaign_management"

  EXAMPLE — a bullet "Built REST APIs in Node.js for the payments service":
    "proves": ["node", "rest", "backend_api_development"]
  EXAMPLE — a bullet "Created React dashboards with live PostgreSQL data":
    "proves": ["react", "postgres", "dashboard_building"]

- Good `proves[]` entries usually include both the canonical skill key and the functional tag when both are supported by the same bullet.
- Do NOT use snake_case tags alone when the bullet clearly supports a technology match.

- Do NOT create evidence from assumptions.
- "has_metric" = true only if the text contains explicit numbers, percentages, scale, or business outcomes.

RULE 4 — SKILLS SPLIT:
  technical[] = languages, frameworks, libraries ONLY.
    Examples: Python, JavaScript, TypeScript, React, Vue, Angular, Node.js, FastAPI, Django, TensorFlow.
  tools[] = platforms, SaaS, cloud, databases, DevOps, CRM, analytics, automation.
    Examples: AWS, GCP, Azure, PostgreSQL, MongoDB, Docker, Kubernetes, HubSpot, Salesforce, Power BI, Tableau, n8n.
  domain_skills[] = functional/business CAPABILITIES ONLY — what the candidate can DO, not what they used.
    These are action-noun phrases that describe a business function, not a named technology.
    VALID examples: "lead generation", "SEO", "API integration", "dashboard development",
      "campaign management", "data analysis", "product roadmap ownership",
      "B2B sales", "content marketing", "revenue operations", "user research"
    MUST NOT contain: any named tool, database, language, framework, platform, or cloud service.
    HARD RULE: if it is a named technology, it belongs in technical[] or tools[] — never in domain_skills[].
    INVALID (these go in technical[] or tools[] instead):
      "PostgreSQL", "Docker", "AWS", "Python", "React", "MongoDB", "Tableau",
      "Kubernetes", "Redis", "Airflow", "HubSpot", "Power BI", "n8n"
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
      owner = sole or primary builder/decision-maker. Use only when the bullet clearly reads as
              the candidate owning the work end-to-end. Strong signals: "led", "built",
              "architected", "launched", "founded", "owned", "created", "drove", "designed",
              "implemented" WHEN the sentence is written in first-person ownership style and not
              "we built". If the bullet is collaborative, do NOT mark owner.
      contributor = team effort. Use when the bullet says "worked on", "assisted", "contributed",
                   "collaborated", "supported", "helped", or uses "we" language throughout.
      unclear = vague description, tools-only list, or cannot determine from text.
  - impact_strength:
      high = ownership + explicit metric/scale/revenue/users/business outcome.
      medium = clear work output, no metric.
      low = vague responsibility or tool list only.
  - impact_signals[] = extract ONLY strings that contain a measurable outcome, scale, or
      business result. Each string must have at least one of: a number, a percentage, a
      named business metric, a user/revenue scale, or a named system/product outcome.
      INCLUDE only facts like: "reduced API latency by 40%", "served 50k daily active users",
               "cut deployment time from 2 hours to 15 minutes", "generated $200k pipeline"
      EXCLUDE generic responsibility text like: "built REST APIs", "worked on dashboards",
               "improved performance", "responsible for backend", "collaborated with team"
      If no bullet in the role meets this bar, set impact_signals: [].

RULE 6a — SOURCE STRENGTH (for skills[] and tools[] entries — affects scoring 3×):
  This is a 3x multiplier. Assign with care.
  "work_history_outcome" = skill appears in a job responsibility AND the bullet has a
      measurable outcome, metric, or explicit business result (e.g. "reduced latency by 40%").
  "work_history"         = skill appears in a job's responsibilities[] or technologies_used[]
      with an action verb, but NO metric (e.g. "Built REST APIs using Node.js").
  "project"              = skill only in a personal/academic/freelance project, OR the
      candidate contributed (not owned) its use in a job.
  "listed"               = skill appears ONLY in a skills section, with no job or project
      bullet that mentions it. Default when context is absent.
  "inferred"             = you can infer the skill was used but the resume never states it.
      Use sparingly; never upgrade inferred to work_history.

  Decision algorithm (use the highest level that the evidence supports):
    1. Does any job bullet mention the skill AND contain a number/%, scale, or outcome? → "work_history_outcome"
    2. Does any job bullet mention the skill with an action verb (built, integrated, deployed, designed, shipped, optimized)? → "work_history"
    3. Is the skill only in a project section or freelance/personal work? → "project"
    4. Is the skill only in a "Skills" or "Technologies" list with no job/project reference? → "listed"

  Practical rule:
    - If the same skill appears in multiple places, pick the strongest source_strength.
    - If a work bullet has a metric, do NOT downgrade it to listed just because the same skill also appears in the skills section.
    - If the bullet is clearly a project, do NOT label it work_history.

RULE 7 — EXPERIENCE CALCULATION:
  - total_years = NON-OVERLAPPING sum of professional work history only.
  - Use this algorithm exactly:
    Step 1. List every professional role with its start_date and end_date (use YYYY-MM).
            If end_date is "Present", treat it as 2026-05.
    Step 2. Sort all roles by start_date ascending.
    Step 3. Merge overlapping date ranges: if role B starts before role A ends,
            extend A's end to max(A.end, B.end) and discard the B span.
            Repeat until no ranges overlap.
    Step 4. Sum the durations of only the merged (non-overlapping) spans in months.
    Step 5. Exclude any role that is explicitly an internship AND lasted fewer than 6 months.
    Step 6. Exclude unpaid/academic projects, coursework, and volunteer roles unless
            the resume explicitly labels them as "freelance", "client work", or "contract".
    Step 7. Divide the total months by 12. Round to 1 decimal place for total_years.
            Store the raw month count in total_months.
  - Do NOT include education duration.
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

RULE 8a — CAREER PROGRESSION SUMMARY:
  - Also populate career_progression.analysis with a 2-3 sentence recruiter-style narrative of the candidate's career arc.
  - Mention whether the path is linear, a pivot, early-career, or inconsistent.
  - Use this field as a human-readable alias for older consumers that still expect career progression text.

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
  "career_progression": {{
    "analysis": string
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
        # Normalize older frozen JDs before scoring so the deterministic scorer sees the same shape.
        jd_data = _postprocess_jd_output(jd_data)
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
                report_model=llm_model_override or "gpt-4o-mini",
                screening_criteria=screening_criteria,
            )
            fit_radar = _as_dict(report.get("fit_radar", {}))
            if not fit_radar:
                fit_radar = {}
            if "evidence" not in fit_radar and "confidence" in fit_radar:
                fit_radar["evidence"] = fit_radar.get("confidence")
            if "evidence" not in fit_radar:
                career_max = max(1, int(score_result["breakdown"].get("career_max", 15) or 15))
                fit_radar["evidence"] = min(100, round((score_result["breakdown"].get("career_score", 0) / career_max) * 100))
            if "essentials" not in fit_radar:
                skills_max = max(1, int(score_result["breakdown"].get("skills_max", 50) or 50))
                fit_radar["essentials"] = min(100, round((score_result["breakdown"].get("skills_score", 0) / skills_max) * 100))
            if "experience" not in fit_radar:
                exp_max = max(1, int(score_result["breakdown"].get("exp_max", 15) or 15))
                fit_radar["experience"] = min(100, round((score_result["breakdown"].get("exp_score", 0) / exp_max) * 100))
            if "domain" not in fit_radar:
                domain_max = max(1, int(score_result["breakdown"].get("domain_max", 10) or 10))
                fit_radar["domain"] = min(100, round((score_result["breakdown"].get("domain_score", 0) / domain_max) * 100))
            if "skills" not in fit_radar:
                match_ratio = score_result.get("skill_matching", {}).get("match_ratio", 0)
                fit_radar["skills"] = min(100, round(float(match_ratio) if match_ratio is not None else 0))
            # -- 3. ASSEMBLE FINAL OUTPUT -----------------------
            final_data = {
                "score": score_result["score"],
                "base_score": score_result["base_score"],
                "human_layer": score_result["human_layer"],
                "human_adjustment": score_result["human_layer"].get("human_adjustment", 0),
                "human_judgment": score_result["human_layer"].get("judgment", "Unknown"),
                "status": score_result["status"],
                "breakdown": score_result["breakdown"],
                "skill_matching": score_result["skill_matching"],
                "exp_status": score_result["exp_status"],
                "hard_rejected": score_result["hard_rejected"],
                "rejection_reasons": score_result["rejection_reasons"],
                "candidate_years": score_result["candidate_years"],
                "jd_min_years": score_result["jd_min_years"],
                "fit_radar": fit_radar,
                # Raw resume fields as fallback for UI reads (overridden by **report where gpt-4o-mini produces them)
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
                        "model": "gpt-4o-mini",
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
        parsed = json.loads(content)
        if type_ == "JD":
            parsed = _postprocess_jd_output(parsed)
        return {
            "data": parsed,
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
                            "model": "gpt-4o-mini",
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
