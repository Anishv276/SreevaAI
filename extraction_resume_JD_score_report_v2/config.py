"""
config.py v2 — Only what the scorer actually needs at import time.

SKILL_ALIASES: The scorer uses this for normalization. Copied from v1 since
the alias table itself is correct — it's the matching logic built on top of it
that was the problem. v2 extends beyond these aliases via semantic embeddings.

Everything else (role profiles, weight bands, evidence multipliers) lives in
scorer.py as constants — no reason to separate static data that only one
module uses.
"""
from __future__ import annotations

SKILL_ALIASES: dict[str, str] = {
    # JS / Node
    "nodejs": "node", "reactjs": "react", "vuejs": "vue", "angularjs": "angular",
    "expressjs": "express", "nextjs": "next", "nuxtjs": "nuxt", "tailwindcss": "tailwind",
    "typescriptlang": "typescript", "js": "javascript", "ts": "typescript",
    "es6": "javascript", "ecmascript": "javascript",
    # Python
    "py": "python", "djangorest": "django", "djangorestframework": "django",
    "flaskapi": "flask", "fastapiframework": "fastapi",
    # Java
    "springboot": "spring", "springframework": "spring", "hibernateorm": "hibernate",
    "javaee": "java", "corejava": "java", "javafundamentals": "java",
    # Databases
    "postgresql": "postgres", "pgsql": "postgres", "mongodb": "mongo",
    "mongoose": "mongo", "elasticsearchdb": "elasticsearch", "opensearch": "elasticsearch",
    "mssql": "sqlserver", "microsoftsqlserver": "sqlserver", "mariadb": "mysql",
    "cassandradb": "cassandra",
    # Cloud
    "amazonaws": "aws", "amazonwebservices": "aws", "awscloud": "aws",
    "googlecloud": "gcp", "googlecloudplatform": "gcp", "microsoftazure": "azure",
    "azurecloud": "azure", "azuredevops": "azure",
    # DevOps
    "kubernetes": "k8s", "k8": "k8s", "dockercontainer": "docker", "dockercompose": "docker",
    "githubactions": "cicd", "gitlabcicd": "cicd", "gitlabci": "cicd", "circleci": "cicd",
    "jenkin": "jenkins", "jenkinsci": "jenkins", "terraformiac": "terraform",
    "linuxadmin": "linux", "ubuntu": "linux", "centos": "linux",
    # AI/ML
    "machinelearning": "ml", "artificialintelligence": "ai", "deeplearning": "dl",
    "naturallanguageprocessing": "nlp", "largelanguagemodel": "llm", "llms": "llm",
    "generativeai": "genai", "aiml": "ml", "datascience": "datascience",
    "apachespark": "spark", "pyspark": "spark", "apachekafka": "kafka",
    "apacheairflow": "airflow", "scikit": "scikitlearn", "scikitlearn": "scikitlearn",
    # BI
    "powerbi": "powerbi", "msexcel": "excel", "microsoftexcel": "excel",
    "googleanalytics": "googleanalytics", "ga4": "googleanalytics",
    # Mobile
    "reactnative": "reactnative", "flutterdev": "flutter", "swiftui": "swift",
    "kotlinandroid": "kotlin", "androiddev": "android", "iosdev": "ios",
    # CRM/Marketing
    "hubspotcrm": "hubspot", "salesforcecrm": "salesforce",
    "googleads": "googleads", "googleadwords": "googleads",
    "metaads": "metaads", "facebookads": "metaads",
    # API
    "restapi": "rest", "restapis": "rest", "restfulapi": "rest", "restful": "rest",
    "graphqlapi": "graphql", "grpcapi": "grpc", "websocket": "websockets",
    # DSA/CS
    "datastructuresandalgorithms": "dsa", "datastructures": "dsa",
    "algorithmsanddatastructures": "dsa", "algorithms": "dsa",
    "objectoriented": "oop", "objectorientedprogramming": "oop", "oops": "oop",
    # VCS / Testing
    "versioncontrol": "git", "sourcecontrol": "git",
    "github": "git", "gitlab": "git", "bitbucket": "git",
    "jestjs": "jest", "pytestframework": "pytest", "cypressio": "cypress",
    "playwrighttest": "playwright", "unittesting": "testing", "integrationtesting": "testing",
    # Messaging
    "rabbitmq": "rabbitmq", "amazonsqs": "sqs", "awssqs": "sqs",
    "amazoneventbridge": "eventbridge",
    # Automation
    "n8n": "n8n", "zapier": "zapier", "makecom": "make", "integromat": "make",
}
