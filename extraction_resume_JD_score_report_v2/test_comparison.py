"""
test_comparison.py -- Side-by-side evaluation of v1 vs v2 scoring.

Runs 4 test cases covering:
  A. Strong match (should score 80+)
  B. Borderline candidate (should score 55-70)
  C. Clear mismatch (should score <50)
  D. Career changer with transferable skills (v1 typically under-scores these)

Each case uses pre-built structured JD + resume dicts (no API calls for extraction)
so we isolate the SCORING logic. The report LLM call is optional (--with-report flag).

Usage:
  python test_comparison.py
  python test_comparison.py --with-report   # also runs LLM report, costs tokens
"""
from __future__ import annotations

import json
import sys
import os
import argparse

# Add parent dir to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from extraction_resume_JD_score_report.scorer import compute_score as score_v1
from extraction_resume_JD_score_report_v2.scorer import compute_score as score_v2

# -- Test fixtures -------------------------------------------------------------

# Case A: Strong Senior Backend Engineer
JD_BACKEND_SENIOR = {
    "job_title": "Senior Backend Engineer",
    "role_level": "senior",
    "experience": {"min_years": 5, "max_years": 9},
    "criteria": [
        {"id": "c1", "category": "skill", "name": "Node.js", "priority": "critical", "priority_rank": 1, "weight": 22, "evidence_required": "work_history", "source_text": "5+ years Node.js in production"},
        {"id": "c2", "category": "skill", "name": "PostgreSQL", "priority": "critical", "priority_rank": 2, "weight": 18, "evidence_required": "any", "source_text": "PostgreSQL required"},
        {"id": "c3", "category": "skill", "name": "AWS", "priority": "high", "priority_rank": 1, "weight": 14, "evidence_required": "any", "source_text": "AWS experience"},
        {"id": "c4", "category": "responsibility", "name": "Design and own microservices architecture", "priority": "high", "priority_rank": 2, "weight": 12, "evidence_required": "work_history", "source_text": "own services end to end"},
        {"id": "c5", "category": "skill", "name": "Redis", "priority": "medium", "priority_rank": 1, "weight": 8, "evidence_required": "any", "source_text": "Redis nice to have"},
        {"id": "c6", "category": "skill", "name": "Docker", "priority": "medium", "priority_rank": 2, "weight": 7, "evidence_required": "any", "source_text": "Docker preferred"},
        {"id": "c7", "category": "experience", "name": "5+ years backend experience", "priority": "critical", "priority_rank": 3, "weight": 19, "evidence_required": "any", "source_text": "5+ years backend"},
    ],
    "scoring_hints": {
        "green_flags_to_reward": ["open source contributor", "high-scale system", "mentored engineers"],
        "red_flags_to_watch": ["only frontend experience", "no production deployments"],
    },
    "has_technical_requirements": True,
    "keywords": ["backend", "APIs", "microservices", "fintech", "payment systems"],
}

RESUME_STRONG_BACKEND = {
    "full_name": "Arjun Mehta",
    "experience": {"total_years": 6.5, "seniority_level": "senior"},
    "work_history": [
        {
            "id": "wh1", "company": "Razorpay", "role": "Senior Software Engineer",
            "start_date": "2021-03", "end_date": "Present", "duration_months": 39,
            "is_current": True,
            "technologies_used": ["Node.js", "PostgreSQL", "Redis", "AWS", "Docker", "Kafka"],
            "responsibilities": [
                "Architected and owned the payments settlement microservice handling Rs.500Cr/day",
                "Led migration from monolith to microservices, reducing p99 latency by 40%",
                "Designed schema for multi-tenant PostgreSQL database serving 12M merchants",
            ],
            "impact_signals": [
                "Reduced p99 API latency by 40% via Redis caching layer",
                "Settlement service processes Rs.500Cr/day with 99.99% uptime",
                "Reduced infra cost by 22% after Kubernetes migration",
            ],
            "ownership_level": "owner",
            "impact_strength": "high",
            "business_domain": "fintech",
        },
        {
            "id": "wh2", "company": "Freshworks", "role": "Software Engineer",
            "start_date": "2018-07", "end_date": "2021-02", "duration_months": 31,
            "is_current": False,
            "technologies_used": ["Node.js", "MySQL", "AWS", "React"],
            "responsibilities": [
                "Built REST API layer for CRM product used by 40,000 businesses",
                "Contributed to background job processing system using Bull queue",
            ],
            "impact_signals": ["CRM REST APIs serve 40,000 business accounts"],
            "ownership_level": "contributor",
            "impact_strength": "medium",
            "business_domain": "B2B SaaS",
        },
    ],
    "projects": [],
    "evidence_items": [
        {
            "id": "ev1", "type": "work_history",
            "source_ref_id": "wh1", "source_company": "Razorpay", "source_role": "Senior Software Engineer",
            "text": "Architected and owned the payments settlement microservice handling Rs.500Cr/day, reduced p99 latency by 40%",
            "proves": ["Node.js", "microservices", "architecture", "PostgreSQL"],
            "evidence_level": 5, "ownership": "owner", "has_metric": True,
            "metric": "Rs.500Cr/day throughput, 40% latency reduction", "confidence": 0.95,
        },
        {
            "id": "ev2", "type": "work_history",
            "source_ref_id": "wh1", "source_company": "Razorpay", "source_role": "Senior Software Engineer",
            "text": "Designed schema for multi-tenant PostgreSQL database serving 12M merchants",
            "proves": ["PostgreSQL", "database design"],
            "evidence_level": 5, "ownership": "owner", "has_metric": True,
            "metric": "12M merchants", "confidence": 0.9,
        },
        {
            "id": "ev3", "type": "work_history",
            "source_ref_id": "wh1", "source_company": "Razorpay",
            "text": "Reduced infra cost by 22% after Kubernetes migration on AWS EKS",
            "proves": ["AWS", "Docker", "Kubernetes"],
            "evidence_level": 4, "ownership": "owner", "has_metric": True,
            "metric": "22% cost reduction", "confidence": 0.85,
        },
        {
            "id": "ev4", "type": "work_history",
            "source_ref_id": "wh2", "source_company": "Freshworks",
            "text": "Built REST API layer for CRM product used by 40,000 businesses",
            "proves": ["Node.js", "REST APIs"],
            "evidence_level": 3, "ownership": "contributor", "has_metric": True,
            "metric": "40,000 businesses", "confidence": 0.8,
        },
    ],
    "skills": {
        "technical": [
            {"skill": "Node.js", "evidence": "Razorpay + Freshworks", "evidence_level": 5, "years_of_use": 6, "source_strength": "work_history_outcome"},
            {"skill": "PostgreSQL", "evidence": "Razorpay", "evidence_level": 5, "years_of_use": 3, "source_strength": "work_history_outcome"},
            {"skill": "Redis", "evidence": "Razorpay", "evidence_level": 5, "years_of_use": 3, "source_strength": "work_history_outcome"},
        ],
        "tools": [
            {"tool": "AWS", "category": "cloud", "evidence": "Razorpay + Freshworks", "evidence_level": 4, "source_strength": "work_history_outcome", "confidence": "high"},
            {"tool": "Docker", "category": "devops", "evidence": "Razorpay", "evidence_level": 4, "source_strength": "work_history", "confidence": "high"},
            {"tool": "Kafka", "category": "messaging", "evidence": "Razorpay", "evidence_level": 3, "source_strength": "work_history", "confidence": "high"},
        ],
        "domain_skills": ["payment processing", "microservices", "fintech", "APIs", "backend systems"],
    },
    "career_timeline": {"job_hopping_risk": "none", "progression_pattern": "growing"},
    "red_flags": [],
    "core_claims": [
        {"claim": "Built and owned settlement microservice at Razorpay scale", "evidence": "ev1", "confidence": "high"},
    ],
    "candidate_summary": "Senior backend engineer with 6.5 years building payment and CRM systems. Owns and architects production microservices at Razorpay processing Rs.500Cr/day.",
    "keywords": ["backend", "Node.js", "PostgreSQL", "fintech", "microservices", "payment processing"],
}

# Case B: Borderline Mid-Level Developer (has skills, weak evidence depth)
JD_FULLSTACK_MID = {
    "job_title": "Full Stack Developer",
    "role_level": "mid",
    "experience": {"min_years": 3, "max_years": 6},
    "criteria": [
        {"id": "c1", "category": "skill", "name": "React", "priority": "critical", "priority_rank": 1, "weight": 22, "evidence_required": "any", "source_text": "React required"},
        {"id": "c2", "category": "skill", "name": "Node.js", "priority": "critical", "priority_rank": 2, "weight": 18, "evidence_required": "any", "source_text": "Node.js backend"},
        {"id": "c3", "category": "skill", "name": "PostgreSQL", "priority": "high", "priority_rank": 1, "weight": 14, "evidence_required": "any", "source_text": "SQL database"},
        {"id": "c4", "category": "responsibility", "name": "Build and ship product features end to end", "priority": "high", "priority_rank": 2, "weight": 12, "evidence_required": "any", "source_text": "own features"},
        {"id": "c5", "category": "skill", "name": "TypeScript", "priority": "medium", "priority_rank": 1, "weight": 10, "evidence_required": "any", "source_text": "TypeScript preferred"},
        {"id": "c6", "category": "experience", "name": "3+ years full-stack experience", "priority": "critical", "priority_rank": 3, "weight": 24, "evidence_required": "any", "source_text": "3+ years"},
    ],
    "scoring_hints": {
        "green_flags_to_reward": ["shipped to real users", "startup experience"],
        "red_flags_to_watch": ["only tutorial projects", "no production deployments"],
    },
    "has_technical_requirements": True,
    "keywords": ["product", "SaaS", "full-stack", "startup"],
}

RESUME_BORDERLINE_FULLSTACK = {
    "full_name": "Sneha Kapoor",
    "experience": {"total_years": 3.2, "seniority_level": "mid"},
    "work_history": [
        {
            "id": "wh1", "company": "TechStartup Pvt Ltd", "role": "Software Developer",
            "start_date": "2021-06", "end_date": "Present", "duration_months": 30,
            "is_current": True,
            "technologies_used": ["React", "Node.js", "MySQL", "AWS S3"],
            "responsibilities": [
                "Built dashboard features for internal analytics tool",
                "Integrated third-party payment API into checkout flow",
                "Worked on improving page load speed",
            ],
            "impact_signals": [],  # no quantified outcomes
            "ownership_level": "contributor",
            "impact_strength": "low",
            "business_domain": "B2B SaaS",
        },
        {
            "id": "wh2", "company": "Freelance", "role": "Web Developer",
            "start_date": "2020-07", "end_date": "2021-05", "duration_months": 10,
            "is_current": False,
            "technologies_used": ["React", "PHP", "MySQL"],
            "responsibilities": ["Built client websites using React and PHP backend"],
            "impact_signals": [],
            "ownership_level": "owner",
            "impact_strength": "low",
            "business_domain": "freelance",
        },
    ],
    "projects": [
        {
            "id": "p1", "name": "Personal Portfolio", "type": "personal",
            "technologies": ["React", "TypeScript", "Node.js"],
            "description": "Portfolio site with blog and contact form",
            "impact_signals": [], "ownership_level": "owner", "impact_strength": "low",
        }
    ],
    "evidence_items": [
        {
            "id": "ev1", "type": "work_history",
            "source_ref_id": "wh1", "source_company": "TechStartup Pvt Ltd",
            "text": "Built dashboard features for internal analytics tool using React",
            "proves": ["React", "Build product features end to end"],
            "evidence_level": 3, "ownership": "contributor", "has_metric": False,
            "metric": None, "confidence": 0.7,
        },
        {
            "id": "ev2", "type": "work_history",
            "source_ref_id": "wh1", "source_company": "TechStartup Pvt Ltd",
            "text": "Integrated third-party payment API into checkout flow using Node.js",
            "proves": ["Node.js", "REST APIs"],
            "evidence_level": 3, "ownership": "contributor", "has_metric": False,
            "metric": None, "confidence": 0.65,
        },
        {
            "id": "ev3", "type": "project",
            "source_ref_id": "p1", "source_company": None,
            "text": "Personal portfolio with TypeScript and Node.js",
            "proves": ["TypeScript", "Node.js"],
            "evidence_level": 2, "ownership": "owner", "has_metric": False,
            "metric": None, "confidence": 0.5,
        },
    ],
    "skills": {
        "technical": [
            {"skill": "React", "evidence": "TechStartup", "evidence_level": 3, "years_of_use": 3, "source_strength": "work_history"},
            {"skill": "Node.js", "evidence": "TechStartup", "evidence_level": 3, "years_of_use": 2, "source_strength": "work_history"},
            {"skill": "TypeScript", "evidence": "personal project", "evidence_level": 2, "years_of_use": None, "source_strength": "project"},
        ],
        "tools": [
            {"tool": "MySQL", "category": "database", "evidence": "TechStartup", "evidence_level": 3, "source_strength": "work_history", "confidence": "medium"},
            {"tool": "AWS S3", "category": "cloud", "evidence": "TechStartup", "evidence_level": 2, "source_strength": "work_history", "confidence": "medium"},
        ],
        "domain_skills": ["SaaS", "product development"],
    },
    "career_timeline": {"job_hopping_risk": "low", "progression_pattern": "lateral"},
    "red_flags": [
        {"flag": "vague_descriptions", "severity": "medium", "detail": "No quantified outcomes across all roles"},
    ],
    "core_claims": [],
    "candidate_summary": "Full-stack developer with 3 years building product features in React and Node.js. No quantified outcomes on resume.",
    "keywords": ["React", "Node.js", "full-stack", "SaaS"],
}

# Case C: Clear mismatch -- Java JD, Python candidate
JD_JAVA_BACKEND = {
    "job_title": "Java Backend Developer",
    "role_level": "mid",
    "experience": {"min_years": 3, "max_years": 6},
    "criteria": [
        {"id": "c1", "category": "skill", "name": "Java", "priority": "critical", "priority_rank": 1, "weight": 25, "evidence_required": "work_history", "source_text": "Java required", "is_table_stakes": True},
        {"id": "c2", "category": "skill", "name": "Spring Boot", "priority": "critical", "priority_rank": 2, "weight": 20, "evidence_required": "work_history", "source_text": "Spring Boot microservices"},
        {"id": "c3", "category": "skill", "name": "PostgreSQL", "priority": "high", "priority_rank": 1, "weight": 14, "evidence_required": "any", "source_text": "PostgreSQL"},
        {"id": "c4", "category": "skill", "name": "Docker", "priority": "high", "priority_rank": 2, "weight": 12, "evidence_required": "any", "source_text": "Docker"},
        {"id": "c5", "category": "experience", "name": "3+ years Java backend", "priority": "critical", "priority_rank": 3, "weight": 29, "evidence_required": "any", "source_text": "3+ years Java"},
    ],
    "scoring_hints": {
        "green_flags_to_reward": ["Spring ecosystem expert", "JVM tuning experience"],
        "red_flags_to_watch": ["Python only", "no Java experience"],
    },
    "has_technical_requirements": True,
    "keywords": ["backend", "Java", "microservices", "enterprise"],
}

RESUME_PYTHON_MISMATCH = {
    "full_name": "Rahul Sharma",
    "experience": {"total_years": 4.0, "seniority_level": "mid"},
    "work_history": [
        {
            "id": "wh1", "company": "DataCo", "role": "Backend Engineer",
            "start_date": "2020-06", "end_date": "Present", "duration_months": 48,
            "is_current": True,
            "technologies_used": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker"],
            "responsibilities": [
                "Built data pipeline APIs in FastAPI processing 2M records/day",
                "Owned PostgreSQL schema design for analytics platform",
            ],
            "impact_signals": ["APIs process 2M records/day"],
            "ownership_level": "owner",
            "impact_strength": "high",
            "business_domain": "data analytics",
        },
    ],
    "projects": [],
    "evidence_items": [
        {
            "id": "ev1", "type": "work_history",
            "source_ref_id": "wh1", "source_company": "DataCo",
            "text": "Built data pipeline APIs in FastAPI processing 2M records/day",
            "proves": ["Python", "FastAPI", "REST APIs", "PostgreSQL"],
            "evidence_level": 5, "ownership": "owner", "has_metric": True,
            "metric": "2M records/day", "confidence": 0.9,
        },
    ],
    "skills": {
        "technical": [
            {"skill": "Python", "evidence": "DataCo", "evidence_level": 5, "years_of_use": 4, "source_strength": "work_history_outcome"},
            {"skill": "FastAPI", "evidence": "DataCo", "evidence_level": 5, "years_of_use": 3, "source_strength": "work_history_outcome"},
        ],
        "tools": [
            {"tool": "PostgreSQL", "category": "database", "evidence": "DataCo", "evidence_level": 4, "source_strength": "work_history_outcome", "confidence": "high"},
            {"tool": "Docker", "category": "devops", "evidence": "DataCo", "evidence_level": 3, "source_strength": "work_history", "confidence": "high"},
        ],
        "domain_skills": ["data pipelines", "analytics", "backend APIs"],
    },
    "career_timeline": {"job_hopping_risk": "none", "progression_pattern": "growing"},
    "red_flags": [],
    "core_claims": [],
    "candidate_summary": "Backend engineer with 4 years in Python/FastAPI. No Java or Spring Boot experience.",
    "keywords": ["Python", "FastAPI", "PostgreSQL", "data pipelines"],
}

# Case D: Career changer -- analyst moving to data engineering (v1 typically under-scores)
JD_DATA_ENGINEER = {
    "job_title": "Data Engineer",
    "role_level": "mid",
    "experience": {"min_years": 2, "max_years": 5},
    "criteria": [
        {"id": "c1", "category": "skill", "name": "Python", "priority": "critical", "priority_rank": 1, "weight": 20, "evidence_required": "any", "source_text": "Python required"},
        {"id": "c2", "category": "skill", "name": "SQL", "priority": "critical", "priority_rank": 2, "weight": 18, "evidence_required": "work_history", "source_text": "SQL mandatory"},
        {"id": "c3", "category": "skill", "name": "Apache Spark", "priority": "high", "priority_rank": 1, "weight": 15, "evidence_required": "any", "source_text": "Spark preferred"},
        {"id": "c4", "category": "responsibility", "name": "Build and maintain ETL pipelines", "priority": "high", "priority_rank": 2, "weight": 14, "evidence_required": "any", "source_text": "own pipelines"},
        {"id": "c5", "category": "skill", "name": "Airflow", "priority": "medium", "priority_rank": 1, "weight": 10, "evidence_required": "any", "source_text": "Airflow nice to have"},
        {"id": "c6", "category": "domain", "name": "data warehousing or analytics engineering", "priority": "medium", "priority_rank": 2, "weight": 9, "evidence_required": "any", "source_text": "analytics background"},
        {"id": "c7", "category": "experience", "name": "2+ years working with data", "priority": "critical", "priority_rank": 3, "weight": 14, "evidence_required": "any", "source_text": "2+ years data"},
    ],
    "scoring_hints": {
        "green_flags_to_reward": ["dbt experience", "built pipelines from scratch", "analytics engineering"],
        "red_flags_to_watch": ["no coding experience", "only Excel analytics"],
    },
    "has_technical_requirements": True,
    "keywords": ["data engineering", "ETL", "pipelines", "analytics", "SQL"],
}

# Candidate: Business analyst who taught themselves Python and built pipelines
RESUME_CAREER_CHANGER = {
    "full_name": "Priya Nair",
    "experience": {"total_years": 4.0, "seniority_level": "mid"},
    "work_history": [
        {
            "id": "wh1", "company": "Meesho", "role": "Business Analyst",
            "start_date": "2020-07", "end_date": "Present", "duration_months": 48,
            "is_current": True,
            "technologies_used": ["Python", "SQL", "PostgreSQL", "Tableau", "dbt"],
            "responsibilities": [
                "Built automated Python scripts replacing 3 manual weekly reports",
                "Wrote complex SQL queries against 50M+ row PostgreSQL tables for business insights",
                "Owned dbt models for the revenue analytics data mart",
                "Reduced reporting cycle time from 3 days to 4 hours via pipeline automation",
            ],
            "impact_signals": [
                "Reduced reporting cycle from 3 days to 4 hours via Python automation",
                "Owned dbt models serving 50M+ row PostgreSQL analytics mart",
            ],
            "ownership_level": "owner",
            "impact_strength": "high",
            "business_domain": "e-commerce analytics",
        },
    ],
    "projects": [
        {
            "id": "p1", "name": "Personal ETL Pipeline", "type": "personal",
            "technologies": ["Python", "Apache Airflow", "PostgreSQL"],
            "description": "Built end-to-end Airflow DAG to pull, transform, and load public e-commerce data",
            "impact_signals": [], "ownership_level": "owner", "impact_strength": "low",
        }
    ],
    "evidence_items": [
        {
            "id": "ev1", "type": "work_history",
            "source_ref_id": "wh1", "source_company": "Meesho",
            "text": "Reduced reporting cycle from 3 days to 4 hours by building automated Python data pipelines",
            "proves": ["Python", "Build and maintain ETL pipelines", "data engineering"],
            "evidence_level": 5, "ownership": "owner", "has_metric": True,
            "metric": "3 days -> 4 hours (87% reduction)", "confidence": 0.9,
        },
        {
            "id": "ev2", "type": "work_history",
            "source_ref_id": "wh1", "source_company": "Meesho",
            "text": "Owned dbt models for revenue analytics data mart on 50M+ row PostgreSQL tables",
            "proves": ["SQL", "dbt", "data warehousing or analytics engineering", "PostgreSQL"],
            "evidence_level": 5, "ownership": "owner", "has_metric": True,
            "metric": "50M+ rows", "confidence": 0.85,
        },
        {
            "id": "ev3", "type": "project",
            "source_ref_id": "p1", "source_company": None,
            "text": "Built Airflow DAG for end-to-end ETL pipeline on public e-commerce dataset",
            "proves": ["Apache Spark", "Airflow", "ETL pipelines"],
            "evidence_level": 2, "ownership": "owner", "has_metric": False,
            "metric": None, "confidence": 0.6,
        },
    ],
    "skills": {
        "technical": [
            {"skill": "Python", "evidence": "Meesho", "evidence_level": 5, "years_of_use": 3, "source_strength": "work_history_outcome"},
            {"skill": "SQL", "evidence": "Meesho", "evidence_level": 5, "years_of_use": 4, "source_strength": "work_history_outcome"},
            {"skill": "dbt", "evidence": "Meesho", "evidence_level": 5, "years_of_use": 2, "source_strength": "work_history_outcome"},
        ],
        "tools": [
            {"tool": "PostgreSQL", "category": "database", "evidence": "Meesho", "evidence_level": 5, "source_strength": "work_history_outcome", "confidence": "high"},
            {"tool": "Tableau", "category": "BI", "evidence": "Meesho", "evidence_level": 3, "source_strength": "work_history", "confidence": "high"},
            {"tool": "Apache Airflow", "category": "orchestration", "evidence": "personal project", "evidence_level": 2, "source_strength": "project", "confidence": "medium"},
        ],
        "domain_skills": ["data analytics", "ETL", "data warehousing", "analytics engineering", "e-commerce", "business intelligence"],
    },
    "career_timeline": {"job_hopping_risk": "none", "progression_pattern": "growing"},
    "red_flags": [],
    "core_claims": [
        {"claim": "Built production Python data pipelines at Meesho reducing reporting cycle by 87%", "evidence": "ev1", "confidence": "high"},
    ],
    "candidate_summary": "Business analyst at Meesho with 4 years of hands-on Python, SQL, and dbt work building data pipelines and analytics models at scale.",
    "keywords": ["Python", "SQL", "dbt", "ETL", "data analytics", "analytics engineering", "data warehousing"],
}


# -- Runner --------------------------------------------------------------------

CASES = [
    {
        "id": "A",
        "label": "Strong Senior Backend (Node.js/PostgreSQL at Razorpay)",
        "expected_range": (78, 100),
        "expected_status": "Shortlisted",
        "jd": JD_BACKEND_SENIOR,
        "resume": RESUME_STRONG_BACKEND,
    },
    {
        "id": "B",
        "label": "Borderline Full-Stack (React/Node.js, weak evidence depth)",
        "expected_range": (52, 72),
        "expected_status": "Borderline",
        "jd": JD_FULLSTACK_MID,
        "resume": RESUME_BORDERLINE_FULLSTACK,
    },
    {
        "id": "C",
        "label": "Clear Mismatch (Python dev vs Java JD)",
        "expected_range": (0, 48),
        "expected_status": "Rejected",
        "jd": JD_JAVA_BACKEND,
        "resume": RESUME_PYTHON_MISMATCH,
    },
    {
        "id": "D",
        "label": "Career Changer (Analyst -> Data Engineer, real pipeline work)",
        "expected_range": (65, 85),
        "expected_status": "Shortlisted",
        "jd": JD_DATA_ENGINEER,
        "resume": RESUME_CAREER_CHANGER,
    },
]

PASS_MARK = "PASS"
FAIL_MARK = "FAIL"
WARN_MARK = "~"

def _in_range(score: int, lo: int, hi: int) -> bool:
    return lo <= score <= hi

def _verdict(score: int, status: str, expected_range: tuple, expected_status: str) -> str:
    score_ok = _in_range(score, *expected_range)
    status_ok = status == expected_status
    if score_ok and status_ok:
        return PASS_MARK
    if score_ok or status_ok:
        return WARN_MARK
    return FAIL_MARK


def run_tests() -> list[dict]:
    results = []
    for case in CASES:
        v1 = score_v1(case["jd"], case["resume"])
        v2 = score_v2(case["jd"], case["resume"])

        v1_verdict = _verdict(v1["score"], v1["status"], case["expected_range"], case["expected_status"])
        v2_verdict = _verdict(v2["score"], v2["status"], case["expected_range"], case["expected_status"])

        # Criterion-level analysis
        v1_meets = sum(1 for c in v1.get("criteria_results", []) if c.get("result") == "meets")
        v2_meets = sum(1 for c in v2.get("criteria_results", []) if isinstance(c, dict) and c.get("result") == "meets")
        v2_semantic = v2.get("semantic_matches", [])

        results.append({
            "id": case["id"],
            "label": case["label"],
            "expected_range": f"{case['expected_range'][0]}-{case['expected_range'][1]}",
            "expected_status": case["expected_status"],
            "v1_score": v1["score"],
            "v1_status": v1["status"],
            "v1_verdict": v1_verdict,
            "v1_breakdown": v1["breakdown"],
            "v1_criteria_meets": v1_meets,
            "v2_score": v2["score"],
            "v2_status": v2["status"],
            "v2_verdict": v2_verdict,
            "v2_breakdown": v2["breakdown"],
            "v2_criteria_meets": v2_meets,
            "v2_semantic_matches": v2_semantic,
            "v2_human_adjustment": v2["human_layer"].get("human_adjustment", 0),
            "v2_hard_rejected": v2.get("hard_rejected", False),
            "v2_matched_must": v2["skill_matching"]["matched_must"],
            "v2_missing_must": v2["skill_matching"]["missing_must"],
        })
    return results


def print_report(results: list[dict]) -> None:
    divider = "=" * 100

    print("\n" + "=" * 100)
    print("  ATS PIPELINE v1 vs v2 -- SCORING COMPARISON")
    print("=" * 100)

    v1_pass = sum(1 for r in results if r["v1_verdict"] == PASS_MARK)
    v2_pass = sum(1 for r in results if r["v2_verdict"] == PASS_MARK)

    for r in results:
        print(f"\n{'-'*100}")
        print(f"  Case {r['id']}: {r['label']}")
        print(f"  Expected: {r['expected_status']} | Score {r['expected_range']}")
        print(f"{'-'*100}")
        print(f"  {'':30s}  {'V1':>20s}  {'V2':>20s}  {'CHANGE':>12s}")
        print(f"  {'Score':30s}  {r['v1_score']:>20d}  {r['v2_score']:>20d}  {r['v2_score']-r['v1_score']:>+12d}")
        print(f"  {'Status':30s}  {r['v1_status']:>20s}  {r['v2_status']:>20s}")
        print(f"  {'Verdict':30s}  {r['v1_verdict']:>20s}  {r['v2_verdict']:>20s}")
        print(f"  {'Criteria met (must-have)':30s}  {r['v1_criteria_meets']:>20d}  {r['v2_criteria_meets']:>20d}")
        print(f"  {'Skills score':30s}  {r['v1_breakdown']['skills_score']:>17d}/50  {r['v2_breakdown']['skills_score']:>17d}/50")
        print(f"  {'Exp score':30s}  {r['v1_breakdown']['exp_score']:>17d}/15  {r['v2_breakdown']['exp_score']:>17d}/15")
        print(f"  {'Career score':30s}  {r['v1_breakdown']['career_score']:>17d}/15  {r['v2_breakdown']['career_score']:>17d}/15")
        print(f"  {'Human adjustment':30s}  {'n/a':>20s}  {r['v2_human_adjustment']:>+20d}")
        print(f"  {'Hard rejected':30s}  {'n/a':>20s}  {str(r['v2_hard_rejected']):>20s}")

        if r["v2_semantic_matches"]:
            print(f"\n  Semantic matches used by v2:")
            for sm in r["v2_semantic_matches"][:3]:
                print(f"    '{sm['criterion']}' -> '{sm['matched_to']}' (sim={sm['similarity']:.2f}) -> {sm['result']}")

        if r["v2_missing_must"]:
            print(f"\n  v2 missing must-have: {r['v2_missing_must'][:4]}")

    print(f"\n{'='*100}")
    print(f"  SUMMARY: v1 passed {v1_pass}/{len(results)} cases | v2 passed {v2_pass}/{len(results)} cases")
    print()

    # Overall assessment table
    print("  ARCHITECTURE COMPARISON")
    print(f"  {'Dimension':<40s} {'v1':>20s} {'v2':>20s}")
    print(f"  {divider[:80]}")
    rows = [
        ("Resume extraction passes", "1 (combined)", "2 (structural + semantic)"),
        ("Evidence level 5 requires metric+owner", "No (any owner)", "Yes (enforced)"),
        ("Skill source tied to evidence_items", "No (job-level)", "Yes (per-skill)"),
        ("Skill matching beyond exact+aliases", "Static dict (200 entries)", "Semantic embeddings"),
        ("Criterion weight computation", "LLM arithmetic (unreliable)", "Rank-based deterministic"),
        ("Hard rejection threshold", "All critical fail", "≥60% critical fail"),
        ("Cross-validation of total_years", "No", "Yes (from work_history)"),
        ("Criterion-level MatchSource trace", "No", "Yes (every criterion)"),
        ("Report grounding verification", "No", "Yes (company name check)"),
        ("Bias preprocessing", "No", "Graduation year redaction"),
    ]
    for label, v1val, v2val in rows:
        print(f"  {label:<40s} {v1val:>20s} {v2val:>20s}")
    print(f"{'='*100}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="Output raw JSON results")
    args = parser.parse_args()

    results = run_tests()

    if args.json:
        print(json.dumps(results, indent=2, default=str))
    else:
        print_report(results)

