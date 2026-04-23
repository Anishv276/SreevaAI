import re
from typing import Optional

def detect_role_category(job_title: str) -> str:
    """
    Classifies a job title into one of 5 role categories.
    Engineering is checked first so 'Solutions Engineer' maps to engineering not sales.
    Falls back to 'operations' (generalist) - never crashes.
    """
    if not job_title:
        return "operations"
    title = job_title.lower().strip()

    ENGINEERING = [
        "engineer", "developer", "dev", "software", "backend", "frontend",
        "full stack", "fullstack", "sre", "devops", "platform", "infrastructure",
        "data engineer", "ml engineer", "machine learning", "ai engineer",
        "cloud", "architect", "embedded", "firmware", "android", "ios",
        "mobile", "web developer", "python", "java", "golang", "rust",
        "security engineer", "qa engineer", "test engineer", "sdet",
        "data scientist", "tech lead", "engineering manager", "staff engineer",
        "principal engineer", "solutions engineer",
    ]
    SALES = [
        "sales", "account executive", " ae ", "business development", "bdr",
        "sdr", "account manager", "revenue", "closing", "quota", "pipeline",
        "enterprise sales", "inside sales", "field sales", "commercial",
        "partnerships", "channel", "pre-sales",
    ]
    CUSTOMER_SUCCESS = [
        "customer success", "csm", "client success", "account success",
        "customer experience", " cx ", "onboarding", "implementation",
        "customer support", "support engineer", "technical support",
        "client services", "renewal", "retention", "churn", "post-sales",
    ]
    MARKETING = [
        "marketing", "growth", "demand generation", "demand gen",
        "content", " seo", " sem", "paid media", "brand", "product marketing",
        "pmm", "performance marketing", "digital marketing", "social media",
        "communications", " pr ", "campaign", "copywriter", "email marketing",
    ]

    for kw in ENGINEERING:
        if kw in title:
            return "engineering"
    for kw in SALES:
        if kw in title:
            return "sales"
    for kw in CUSTOMER_SUCCESS:
        if kw in title:
            return "customer_success"
    for kw in MARKETING:
        if kw in title:
            return "marketing"
    return "operations"

def detect_role_subtype(job_title: str, role_category: str) -> str:
    """
    Returns a more specific subtype within a role category.
    Used to further personalise the role layer (e.g. backend vs frontend vs data).
    Falls back to 'general' if no subtype matched.
    """
    if not job_title:
        return "general"
    title = job_title.lower().strip()

    if role_category == "engineering":
        if any(k in title for k in ["data scientist", "data engineer", "ml ", "machine learning", "ai ", "analytics engineer"]):
            return "data"
        if any(k in title for k in ["devops", "sre", "platform", "infrastructure", "cloud", "devsecops"]):
            return "devops"
        if any(k in title for k in ["frontend", "front end", "react", "vue", "angular", "ui engineer"]):
            return "frontend"
        if any(k in title for k in ["android", "ios", "mobile", "flutter", "react native"]):
            return "mobile"
        if any(k in title for k in ["qa", "test engineer", "sdet", "quality"]):
            return "qa"
        if any(k in title for k in ["full stack", "fullstack"]):
            return "fullstack"
        if any(k in title for k in ["solutions", "gtm", "presales", "pre-sales", "field engineer"]):
            return "solutions"
        return "backend"

    if role_category == "sales":
        if any(k in title for k in ["sdr", "bdr", "outbound", "prospecting"]):
            return "sdr"
        if any(k in title for k in ["account executive", " ae ", "closing", "enterprise sales"]):
            return "ae"
        if any(k in title for k in ["account manager", "account management", "renewal"]):
            return "account_management"
        return "general"

    if role_category == "marketing":
        if any(k in title for k in ["performance", "paid", "sem", "seo", "growth"]):
            return "performance"
        if any(k in title for k in ["content", "copywriter", "editorial"]):
            return "content"
        if any(k in title for k in ["product marketing", "pmm"]):
            return "product_marketing"
        if any(k in title for k in ["brand", "communications", "pr"]):
            return "brand"
        return "general"

    return "general"

def build_role_layer(role_category: str, role_subtype: str, candidate_band: str) -> str:
    """
    Returns a compact role-specific principles block injected into the system prompt.
    Use it as a thinking framework, not a script.
    """
    # -- ENGINEERING ----------------------------------------------------------
    engineering_base = """
ROLE INTELLIGENCE - ENGINEERING
Focus: real decisions, not tool lists.

Evaluate:
- constraint awareness
- failure/debugging literacy
- tradeoffs and system thinking
- ownership ("I" vs "we")
- measurable impact

Strong signals:
- names a real constraint, failure, or metric
- explains why a choice was made
- compares alternatives honestly
- says what they would change now

Weak signals:
- tool dumping with no story
- vague wins with no numbers
- no failure or rollback story
- polished STAR answers with no real detail

Probe harder when they mention:
- a tool
- a success
- an ownership claim
- a vague result

Ask for:
- the constraint
- the tradeoff
- the before/after
- what broke
- what they personally owned
"""

    engineering_subtypes = {
        "backend": """
BACKEND: API design, data modeling, concurrency, production failures.
Probe: ask for the hardest tradeoff, the real incident, and what they would redesign now.
""",
        "frontend": """
FRONTEND: performance, state, accessibility, real user impact.
Probe: ask for a slow UI, a design pushback, and a choice they would not repeat.
""",
        "data": """
DATA: pipeline reliability, data quality, business impact.
Probe: ask what broke, who noticed first, and how the decision changed.
""",
        "devops": """
DEVOPS: incident ownership, on-call, deploys, reliability tradeoffs.
Probe: ask for the worst incident, the rollback, and alerting choices.
""",
        "mobile": """
MOBILE: device fragmentation, app-store constraints, offline behavior.
Probe: ask for a device-specific bug and the battery/network tradeoff.
""",
        "qa": """
QA: test strategy, risk prioritization, release judgment.
Probe: ask what they would not test, what they blocked, and why.
""",
        "fullstack": """
FULLSTACK: end-to-end ownership, seam handling, honest strengths.
Probe: ask for one feature from DB to UI and where it was hardest.
""",
        "solutions": """
SOLUTIONS: technical-to-business translation, customer escalation, PoC thinking.
Probe: ask when they pushed back, saved the deal, or explained ROI to a non-technical leader.
""",
    }

    # -- SALES -----------------------------------------------------------------
    sales_base = """
ROLE INTELLIGENCE - SALES
Focus: numbers, deal judgment, rejection, and process.

Evaluate:
- quota and attainment
- losses and self-awareness
- multi-stakeholder deal handling
- repeatable process
- coachability

Strong signals:
- gives numbers naturally
- explains why they won or lost
- names a real objection or decision point
- shows what they personally did

Weak signals:
- only win stories
- no numbers
- generic process language
- no friction or failure

Probe harder when they mention:
- quota
- a win
- a loss
- an objection
- a relationship change
"""

    sales_subtypes = {
        "sdr": """
SDR: prospecting quality, sequence changes, ICP judgment.
Probe: ask what they changed, what response improved, and why.
""",
        "ae": """
AE: qualification, deal judgment, competitive losses.
Probe: ask when they walked away and why they knew it would not close.
""",
        "account_management": """
ACCOUNT MANAGEMENT: renewals, expansion, churn risk, account growth.
Probe: ask for a save, an expansion, and the turning point.
""",
    }

    # -- CUSTOMER SUCCESS ------------------------------------------------------
    customer_success_layer = """
ROLE INTELLIGENCE - CUSTOMER SUCCESS
Focus: churn risk, account health, stakeholder movement, and business value.

Evaluate:
- at-risk account judgment
- stakeholder navigation
- value articulation
- escalation timing
- metrics and retention thinking

Strong signals:
- names specific accounts and turning points
- gives metrics
- explains cross-functional influence
- shows what changed the outcome

Weak signals:
- only happy stories
- no numbers
- no conflict
- generic relationship language
"""

    # -- MARKETING ------------------------------------------------------------
    marketing_base = """
ROLE INTELLIGENCE - MARKETING
Focus: metrics, audience insight, ownership, and what failed.

Evaluate:
- metrics and attribution
- audience understanding
- ownership vs agency/team
- experiments that failed
- sales alignment

Strong signals:
- gives numbers
- names a real audience
- explains what changed the result
- admits what did not work

Weak signals:
- strategy without execution
- no numbers
- only win stories
- agency credit with no personal ownership
"""

    marketing_subtypes = {
        "performance": """
PERFORMANCE: bidding, attribution, channel mix, diagnosis.
Probe: ask what broke, what they tested, and why the model was weak.
""",
        "content": """
CONTENT: distribution, performance, insight-to-brief thinking.
Probe: ask why a piece worked, what did not, and how they chose the topic.
""",
        "product_marketing": """
PRODUCT MARKETING: positioning, research, launches, messaging validation.
Probe: ask how they validated messaging and what surprised them.
""",
        "brand": """
BRAND: business impact, consistency, tension with commercial pressure.
Probe: ask how they defended a brand decision and measured effect.
""",
    }

    # -- OPERATIONS -----------------------------------------------------------
    operations_layer = """
ROLE INTELLIGENCE - OPERATIONS / GENERALIST
Focus: systems, ambiguity, stakeholder influence, and prioritization.

Evaluate:
- root cause thinking
- influence without authority
- prioritization
- documentation
- ambiguity handling

Strong signals:
- names a broken process
- shows the conflict or tradeoff
- explains what changed
- shows what lasted after they left

Weak signals:
- frameworks with no conflict
- no tradeoff
- no resistance
- vague efficiency claims
"""

    # -- ASSEMBLE THE LAYER ----------------------------------------------------
    if role_category == "engineering":
        subtype_note = engineering_subtypes.get(role_subtype, engineering_subtypes["backend"])
        role_text = engineering_base + subtype_note
    elif role_category == "sales":
        subtype_note = sales_subtypes.get(role_subtype, sales_subtypes.get("general", ""))
        role_text = sales_base + subtype_note
    elif role_category == "customer_success":
        role_text = customer_success_layer
    elif role_category == "marketing":
        subtype_note = marketing_subtypes.get(role_subtype, marketing_subtypes.get("general", ""))
        role_text = marketing_base + subtype_note
    else:
        role_text = operations_layer

    # Seniority addendum - appended to every role layer
    if candidate_band == "fresher":
        band_note = """
SENIORITY NOTE FOR THIS ROLE (FRESHER / EARLY CAREER):
  Prioritise potential and reasoning over domain track record.
  Ask "how would you approach" and "what have you learned" more than "walk me through what you delivered."
  Be patient with vocabulary - they may not know industry jargon yet.
  Probe learning speed and genuine curiosity rather than scale or ownership.
  Do not penalise them for not knowing things an experienced hire would know.
"""
    elif candidate_band == "senior":
        band_note = """
SENIORITY NOTE FOR THIS ROLE (SENIOR):
  Expect deep ownership, clear strategic judgment, and evidence of impact across scope and time.
  Do not stay at project summaries - go after tradeoffs, influence, scale, and decisions made under constraint.
  Ask what they would change architecturally or operationally if they owned the system/team today.
  Probe mentorship, cross-functional leadership, and how they set direction for others.
"""
    elif candidate_band == "experienced":
        band_note = """
SENIORITY NOTE FOR THIS ROLE (EXPERIENCED / SENIOR):
  Expect ownership language, scale experience, and strategic thinking.
  If answers feel junior - no metrics, no ownership, no tradeoffs - probe harder. That is a signal.
  Do not accept vague answers at this level. An experienced person should have a story for everything.
  Push to depth spiral level 4, 5, 6 on the strongest topics.
  Ask about failures, hard decisions, and things they would do differently.
"""
    else:
        band_note = """
SENIORITY NOTE FOR THIS ROLE (MID-LEVEL):
  Expect some real domain experience but not necessarily strategic depth yet.
  Probe for learning velocity - do they know what they do not know?
  Balance breadth of skills with depth on the things they claim to know best.
  Look for growth trajectory - are they getting better, or plateauing?
"""

    return role_text + band_note

def build_coverage_checklist(candidate_band: str) -> list[str]:
    common = [
        "Validate 2-3 core skills from the resume with one concrete example each.",
        "Ask for measurable outcomes, not just tool names.",
        "Cover one communication or collaboration moment from real work.",
    ]
    if candidate_band == "fresher":
        return [
            "Deep-dive one academic/internship project end-to-end (problem, build, result).",
            "Check fundamentals behind tools they mentioned (what they configured, why, what failed).",
            "Ask one college/teamwork story (ownership, deadlines, conflicts, learning).",
            "Assess learning speed: what they learned recently and how.",
        ] + common
    if candidate_band == "senior":
        return [
            "Deep-dive one flagship initiative for scope, strategic choices, and measurable business impact.",
            "Probe how they influenced direction across teams, not just what they delivered personally.",
            "Assess decisions under constraint, tradeoffs, and what they would redesign today.",
            "Verify leadership, mentoring, and judgment on difficult ambiguous problems.",
        ] + common
    if candidate_band == "experienced":
        return [
            "Deep-dive one recent role with scope, ownership, and business impact.",
            "Probe decision-making, tradeoffs, and stakeholder management.",
            "Assess leadership/mentoring/process ownership with a specific example.",
            "Verify advanced role-critical skills with architecture-level depth.",
        ] + common
    return [
        "Cover one strong project story and one role experience story.",
        "Probe execution details and impact across both project and work experience.",
        "Validate breadth and depth of claimed tools/skills.",
        "Ask one growth/career reflection (what changed from college/projects to real-world work).",
    ] + common
