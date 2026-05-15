"""
config.py — All static lookup tables and constants for the HR agent pipeline.

WHY THIS FILE EXISTS:
    Previously, SKILL_ALIASES and TRANSFERABLE_SKILLS were inlined inside
    normalize_skill() in extract_pdf.py (600+ lines of if/else and dicts).
    Moving them here means:
      - One place to update skill mappings.
      - AI agents can read/modify mappings without touching scoring logic.
      - Fast O(1) dict lookups instead of chained if-else.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Skill Alias Map  (canonical normalisation)
# Input  -> canonical key used everywhere in the scoring engine.
# Ported verbatim from normalize_skill() in extract_pdf.py.
# ---------------------------------------------------------------------------
SKILL_ALIASES: dict[str, str] = {
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
    # OOP
    "objectoriented": "oop",
    "objectorientedprogramming": "oop",
    "oops": "oop",
    "oop": "oop",
    "corejava": "java",
    "javafundamentals": "java",
    "javabasics": "java",
    # Version control
    "versioncontrol": "git",
    "sourcecontrol": "git",
    # Testing
    "jestjs": "jest",
    "pytestframework": "pytest",
    "cypressio": "cypress",
    "playwrighttest": "playwright",
    "unittesting": "testing",
    "integrationtesting": "testing",
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

# ---------------------------------------------------------------------------
# Transferable Skill Graph
# If a resume has skill A, it partially satisfies a JD requirement for skill B.
# Used in _skill_match_level to avoid hard-zero for adjacent stacks.
# Ported verbatim from TRANSFERABLE_SKILLS in extract_pdf.py.
# ---------------------------------------------------------------------------
TRANSFERABLE_SKILLS: dict[str, list[str]] = {
    "react": ["reactnative", "next", "vue", "angular"],
    "reactnative": ["react", "flutter", "ios", "android"],
    "node": ["express", "fastapi", "django", "flask"],
    "python": ["django", "flask", "fastapi", "datascience", "ml"],
    "java": ["spring", "kotlin", "scala"],
    "spring": ["java", "springboot"],
    "dsa": ["java", "python", "javascript", "typescript", "cpp"],
    "oop": ["java", "python", "javascript", "typescript", "spring", "django"],
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
}

# ---------------------------------------------------------------------------
# JD Canonical Skill Reference (used in LLM prompts)
# Ported verbatim from JD_CANONICAL_SKILL_REFERENCE in extract_pdf.py.
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# Role Band Profiles for Human-Like Adjustment (used by HumanLayerAdjuster)
# Ported verbatim from role_profiles dict in _build_human_like_adjustment.
# ---------------------------------------------------------------------------
ROLE_BAND_PROFILES: dict[str, dict] = {
    "intern":   {"direct": 1.00, "adjacent": 0.50, "impact": 1.00, "experience": 0.85, "domain": 0.90, "blocker": 1.05, "max_positive": 10, "max_negative": 15},
    "junior":   {"direct": 1.00, "adjacent": 0.55, "impact": 1.00, "experience": 0.90, "domain": 0.95, "blocker": 1.10, "max_positive": 10, "max_negative": 16},
    "mid":      {"direct": 1.05, "adjacent": 0.50, "impact": 1.05, "experience": 0.90, "domain": 1.00, "blocker": 1.15, "max_positive":  9, "max_negative": 18},
    "senior":   {"direct": 1.15, "adjacent": 0.35, "impact": 1.15, "experience": 0.80, "domain": 1.05, "blocker": 1.20, "max_positive":  8, "max_negative": 18},
    "lead":     {"direct": 1.20, "adjacent": 0.30, "impact": 1.20, "experience": 0.80, "domain": 1.10, "blocker": 1.25, "max_positive":  8, "max_negative": 20},
    "manager":  {"direct": 1.20, "adjacent": 0.25, "impact": 1.20, "experience": 0.80, "domain": 1.10, "blocker": 1.25, "max_positive":  8, "max_negative": 20},
}

# Scoring weight multipliers — ported from RESULT_MULT / EVIDENCE_MULT constants
RESULT_MULT: dict[str, float] = {
    "meets": 1.0,
    "partially_meets": 0.55,
    "unclear": 0.25,
    "does_not_meet": 0.0,
}

EVIDENCE_MULT: dict[str, float] = {
    "work_history_outcome": 1.0,
    "work_history": 0.85,
    "project": 0.65,
    "listed": 0.30,
    "inferred": 0.15,
}

EVIDENCE_PRIORITY_RANK: dict[str, int] = {
    "work_history_outcome": 5,
    "work_history": 4,
    "project": 3,
    "listed": 2,
    "keyword": 1,
}
