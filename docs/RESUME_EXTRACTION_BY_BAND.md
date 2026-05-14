# Resume Extraction Strategy by Candidate Band

## Band Definitions
```python
fresher:     < 1.5 years experience
mid:         1.5 - 5 years experience  
experienced: > 5 - 10 years (inclusive of 10)
senior:      > 10 years experience
```

---

## FRESHER (< 1.5 years)

### What to Extract from Resume
```
✅ KEEP:
  - Current role (if any)
  - Education (college, degree, graduation year)
  - College projects (2-3 most technical)
  - Internships (latest, if any)
  - Core skills claimed (3-5)
  - Notable coursework or certifications

❌ REMOVE:
  - Years of experience (they have < 1.5 yrs)
  - Team size managed
  - Company scale/revenue/impact
  - Leadership experience
  - Complex system architectures
```

### Resume Context Object (Fresher)
```python
ResumeContext(
    years_of_experience: 0.8,  # ~ months in decimal
    years_label: "< 1 year" / "8 months" / "1.2 years",
    current_role: "Intern at TechCorp" OR "Recent Graduate",
    
    # FOCUS HERE
    education: [
        "B.Tech Computer Science - IIT Delhi (2024)",
        "B.S. Engineering - Stanford (2023)"
    ],
    
    # FOCUS HERE
    projects: [
        "ChatBot Project - Built a Python chatbot using NLP [Python, NLP, Flask]",
        "E-Commerce Website - Full-stack app with React & Node [React, Node, MongoDB]",
        "ML Image Classifier - CNN for digit recognition [Python, TensorFlow, Keras]"
    ],
    
    # FOCUS HERE (if internships)
    work_history: [
        "Intern at TechCorp (May-July 2023)",
        "Summer Intern at StartupXYZ (Jun-Aug 2024)"
    ],
    
    # FOCUS HERE
    skills: [
        "Python", "JavaScript", "React", "Node.js", "SQL", "Git",
        "Data Structures", "OOP", "Web Development"
    ],
    
    # DON'T NEED (they likely don't have significant ones)
    hobbies: [...],
    ownership_risks: [
        "Verify actual project ownership vs coursework",
        "Check if they understand frameworks or just used templates"
    ]
)
```

### Stage-Specific Resume Anchors (Fresher)
**Pick first college project** → Ask what they built, why, what they learned

---

## MID-LEVEL (1.5 - 5 years)

### What to Extract from Resume
```
✅ KEEP:
  - Years of experience (in range 1.5-5)
  - Current role and company
  - Latest 2-3 work experiences
  - 5-7 technical skills (prioritize claimed expertise)
  - Recent projects (if any side projects)
  - Key technologies/tools they've used
  - Education (degree only, not detailed coursework)

❌ REMOVE/DEPRIORITIZE:
  - Detailed coursework
  - GPA or academic honors
  - Very old internships (> 2 years ago)
  - Hobbies/interests
  - Certifications (unless highly relevant)
```

### Resume Context Object (Mid)
```python
ResumeContext(
    years_of_experience: 3.2,  # 3-4 years is typical
    years_label: "3+ years",
    current_role: "Senior Software Engineer at TechCorp",  # FOCUS
    
    # FOCUS HERE (latest roles only)
    work_history: [
        "Senior Engineer at TechCorp (Jan 2023 - Present)",
        "Software Engineer at StartupABC (Jun 2021 - Dec 2022)",
        "Junior Developer at Agency (Mar 2021 - May 2021)"
    ],
    
    # FOCUS HERE if they exist (personal projects, side work)
    projects: [
        "High-throughput API service in Go [Go, PostgreSQL, Redis]",
        "Open source library contributor [Python, FastAPI]"
    ],
    
    # FOCUS HERE (top technical skills they've demonstrated)
    skills: [
        "Python", "Go", "PostgreSQL", "Redis", "Kubernetes", "Docker",
        "System Design", "REST APIs", "AWS", "Git", "Agile"
    ],
    
    # LIGHTER TOUCH
    education: [
        "B.Tech Computer Science - IIT Delhi (2021)"
    ],
    
    # TRACK but don't emphasize
    ownership_risks: [
        "Verify personal contributions vs team achievements",
        "Clarify ownership on claimed technical decisions"
    ]
)
```

### Stage-Specific Resume Anchors (Mid)
**Pick latest work experience** → Ask what they personally owned there, impact, decisions made

---

## EXPERIENCED (> 5 to 10 years)

### What to Extract from Resume
```
✅ KEEP:
  - Years of experience (5-10 range)
  - Current role, company, and seniority level
  - Latest 2-3 roles showing progression
  - Major technical achievements/impact (with metrics if available)
  - Leadership experiences (team lead, mentorship)
  - Key technologies at depth (not breadth)
  - Complex system work (architecture, scalability, etc.)

❌ REMOVE/DEPRIORITIZE:
  - Very old roles (> 5-7 years ago)
  - Junior or entry-level positions
  - Educational details beyond degree
  - Coursework, projects, hobbies
  - Unrelated skills
```

### Resume Context Object (Experienced)
```python
ResumeContext(
    years_of_experience: 7.5,  # 6-10 years typical
    years_label: "7+ years",
    current_role: "Engineering Lead at TechCorp",  # FOCUS - shows seniority
    
    # FOCUS HERE (progression, leadership, complexity)
    work_history: [
        "Engineering Lead at TechCorp (Feb 2022 - Present) - Led 5-person team",
        "Senior Engineer at Company2 (Aug 2019 - Jan 2022) - Designed microservices",
        "Software Engineer at Company1 (May 2017 - Jul 2019) - Built backend APIs"
    ],
    
    # FOCUS HERE (what systems they built/owned)
    projects: [
        "Payment Processing Microservice - Owned end-to-end, 10k req/s [Go, gRPC, PostgreSQL]",
        "Real-time Analytics Platform - Designed architecture for 100M events/day [Python, Kafka, ClickHouse]"
    ],
    
    # FOCUS HERE (depth, not breadth - what they're REALLY good at)
    skills: [
        "System Design", "Microservices Architecture", "Go", "Python", "PostgreSQL",
        "Distributed Systems", "Cloud Infrastructure (AWS)", "Team Leadership",
        "Performance Optimization", "Security Best Practices"
    ],
    
    # DE-EMPHASIZE
    education: [
        "B.Tech Computer Science (2017)"  # Just mention it, don't detail
    ],
    
    # IMPORTANT - track what they've done
    ownership_risks: [
        "Clarify actual team size led and personal impact",
        "Verify system design decisions vs inherited architecture"
    ]
)
```

### Stage-Specific Resume Anchors (Experienced)
**Pick most complex/impactful project** → Ask about end-to-end ownership, tradeoffs, constraints

---

## SENIOR (> 10 years)

### What to Extract from Resume
```
✅ KEEP:
  - Years of experience (10+ years)
  - Current role with clear seniority title (Principal, Director, Staff, VP, etc.)
  - 2-3 most recent roles showing progression to seniority
  - Major strategic/architectural decisions made
  - Scope: team size led, org impact, business metrics
  - Mentorship, cross-team influence, direction-setting
  - Technology depth in specialized areas
  - Awards, speaking, publications (if notable)

❌ REMOVE/DEPRIORITIZE:
  - Roles > 7 years old (unless pivotal/foundational)
  - Junior level work
  - Purely technical deep-dives (they should be strategic)
  - Educational details
  - Generic skills lists
```

### Resume Context Object (Senior)
```python
ResumeContext(
    years_of_experience: 14.0,  # 10+ years
    years_label: "14 years",
    current_role: "Principal Engineer at TechCorp OR Engineering Manager OR CTO",  # FOCUS - clearly senior
    
    # FOCUS HERE (trajectory to leadership/seniority)
    work_history: [
        "Principal Engineer at TechCorp (Jan 2021 - Present) - Lead 15-person org, $10M impact",
        "Staff Engineer at Company2 (Jun 2018 - Dec 2020) - Designed backend platform",
        "Engineering Manager at Company1 (Mar 2016 - May 2018) - Built team from 3→12",
        "Senior Engineer at StartupXYZ (Jul 2013 - Feb 2016) - Employee #5, scaled to 100 engineers"
    ],
    
    # FOCUS HERE (strategic initiatives, not technical projects)
    projects: [
        "Backend Platform Redesign - Led $50M+ revenue system refactor [12 engineers, 18mo]",
        "Engineering Culture Program - Established hiring, onboarding, mentorship for 100+ team"
    ],
    
    # FOCUS HERE (strategic expertise, not tooling)
    skills: [
        "Strategic Architecture", "Engineering Leadership", "Scaling Organizations",
        "System Design at Scale", "Team Building & Mentorship", "Cross-functional Leadership",
        "Technical Vision & Direction", "Risk Management", "Performance Engineering"
    ],
    
    # NOT NEEDED
    education: [
        "M.Tech Computer Science (2010)"  # Just acknowledge it
    ],
    
    # CRITICAL - verify legitimacy
    ownership_risks: [
        "Verify team size and business impact claimed",
        "Confirm strategic decisions weren't inherited from predecessors"
    ]
)
```

### Stage-Specific Resume Anchors (Senior)
**Pick flagship initiative** → Ask about strategic decisions, business impact, how they influenced others

---

## COMPARISON TABLE: What to Extract by Band

| Data Point | Fresher | Mid | Experienced | Senior |
|---|---|---|---|---|
| **Years of Experience** | Show it | Focus | Focus | Focus |
| **Current Role** | Light | Focus | Focus | Focus |
| **Work History** | Latest 1 | Latest 2-3 | Latest 2-3 | Latest 2-3 (strategic) |
| **Projects/Experience** | College projects | Latest projects | Complex systems | Flagship initiatives |
| **Skills** | Breadth (learning) | Depth in used techs | Depth + architecture | Strategic/leadership |
| **Education** | Full details | Degree only | Degree only | Mention only |
| **Hobbies/Interests** | Include | Skip | Skip | Skip |
| **Metrics/Impact** | Learning outcomes | Metrics on projects | Business impact | Org-level impact |
| **Team Leadership** | N/A | Skip | Highlight | Highlight heavily |
| **Red Flags** | Verify understanding | Verify ownership | Verify end-to-end | Verify leadership legitimacy |

---

## HOW THIS MAPS TO STAGE GENERATION

### Stage 1: Background & Experience
**All bands use resume to anchor the first question:**
- **Fresher:** "Tell me about that college project you built..."
- **Mid:** "I see you were Senior Engineer at TechCorp - what was your day-to-day focus?"
- **Experienced:** "You led a major system redesign at Company2. Walk me through that end-to-end."
- **Senior:** "You went from employee #5 to scaling an org of 100. How did you approach that?"

### Stage 2: Technical Depth
**Use extracted skills to probe:**
- **Fresher:** "You mentioned Python - walk me through a Python project where you had to debug something tricky."
- **Mid:** "You listed System Design as a skill. Describe the most complex system you've designed."
- **Experienced:** "What was your deepest technical contribution in that microservices platform?"
- **Senior:** "What's your architectural philosophy when designing systems at scale?"

### Stage 3: Problem Solving / Decision Making
**Use projects/scale to create scenarios:**
- **Fresher:** "Imagine you're building your first production service. Walk me through your approach."
- **Mid:** "Your work included performance optimization. Give me a real example where you made a trade-off."
- **Experienced:** "Tell me about a time you made a technical decision that affected the whole architecture."
- **Senior:** "Describe a strategic decision you made that impacted the business - what were the trade-offs?"

### Stage 4: Growth & Collaboration
**Use their trajectory:**
- **Fresher:** "How do you approach learning new technologies? Give an example."
- **Mid:** "Tell me about a time you influenced a technical decision that was outside your role."
- **Experienced:** "How did you mentor or develop other engineers? Specific example?"
- **Senior:** "How do you set technical direction across teams that report to you?"

### Stage 5: Closing
**Same for all - wrap up**

---

## Implementation: `build_resume_brief(band, resume_context) → dict`

```python
def build_resume_brief(band: str, resume_context: ResumeContext) -> dict:
    """
    Extract only the resume data relevant to the candidate's band.
    Used by stage_generator to create band-specific opening questions.
    """
    
    if band == "fresher":
        return {
            "education": resume_context.education[:2],  # Top 2 degrees
            "projects": resume_context.projects[:3],    # Top 3 projects
            "internships": resume_context.work_history[:2] if resume_context.work_history else [],  # Recent internships
            "skills": resume_context.skills[:5],        # Top 5 skills
            "strengths": extract_strengths_from_projects(resume_context.projects),
            "weaknesses": ["Limited production experience", "May not understand scale"],
            "anchor_item": resume_context.projects[0] if resume_context.projects else resume_context.education[0]
        }
    
    elif band == "mid":
        return {
            "current_role": resume_context.current_role,                # Emphasize current
            "years": resume_context.years_label,
            "work_history": resume_context.work_history[:3],            # Top 3 roles
            "projects": resume_context.projects[:2],                    # Notable projects
            "skills": resume_context.skills[:7],                        # Top 7 skills
            "strengths": extract_strengths_from_roles(resume_context.work_history),
            "weaknesses": ["Verify actual ownership", "May not have end-to-end experience"],
            "anchor_item": resume_context.work_history[0] if resume_context.work_history else resume_context.current_role
        }
    
    elif band == "experienced":
        return {
            "current_role": resume_context.current_role,                # Current + seniority
            "years": resume_context.years_label,
            "work_history": resume_context.work_history[:3],            # Progression path
            "major_projects": resume_context.projects[:2],              # Complex systems
            "leadership": extract_leadership_from_roles(resume_context.work_history),
            "skills": resume_context.skills[:5],                        # Depth, not breadth
            "strengths": extract_impact_from_experience(resume_context),
            "weaknesses": ["Verify end-to-end ownership", "May delegate vs hands-on"],
            "anchor_item": resume_context.projects[0] if resume_context.projects else resume_context.work_history[0]
        }
    
    elif band == "senior":
        return {
            "current_role": resume_context.current_role,                # Must show seniority
            "years": resume_context.years_label,
            "career_trajectory": resume_context.work_history[:3],       # Path to seniority
            "flagship_initiatives": resume_context.projects[:2],        # Major initiatives
            "leadership_scope": extract_scope(resume_context),          # Team size, org impact
            "strategic_focus": resume_context.skills[:4],              # Strategic areas
            "strengths": extract_strategic_impact(resume_context),
            "weaknesses": ["Verify business impact claims", "Verify strategy vs inherited"],
            "anchor_item": resume_context.projects[0] if resume_context.projects else extract_flagship_role(resume_context.work_history)
        }
```

---

## Key Takeaway

**For each band, we extract different data:**

- **Fresher:** Education + Projects → Ask about learning & understanding
- **Mid:** Recent roles + Technical skills → Ask about ownership & decisions
- **Experienced:** Major systems + Leadership → Ask about end-to-end complexity
- **Senior:** Strategic initiatives + Org impact → Ask about vision & influence

This way, the stage generator can create **5 highly targeted stages** based on what they've actually done, not a generic template.
