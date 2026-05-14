from resume_context_parser import build_interview_turns, parse_resume_context


def test_parse_resume_context_normalizes_core_fields():
    context = parse_resume_context(
        {
            "experience": {"total_years": 3},
            "currentRole": "Software Engineer",
            "currentCompany": "Acme",
            "skills": {"technical": [{"skill": "Python"}, {"skill": "SQL"}]},
            "projects": [{"name": "Billing", "description": "Payment orchestration"}],
            "work_history": [{"role": "Engineer", "company": "Acme", "duration": "2 years"}],
        },
        "",
    )

    assert context.years_of_experience == 3.0
    assert context.years_label == "3 years"
    assert context.current_role == "Software Engineer at Acme"
    assert context.skills == ["Python", "SQL"]
    assert context.projects == ["Billing - Payment orchestration"]
    assert context.work_history == ["Engineer - Acme (2 years)"]


def test_parse_resume_context_uses_text_fallback_for_years():
    context = parse_resume_context({}, "I have 4+ years in backend systems")
    assert context.years_of_experience == 4.0
    assert context.years_label == "4 years"


def test_build_interview_turns_groups_lines_into_turns():
    turns = build_interview_turns(
        [
            "Interviewer: Tell me about your latest project.",
            "Candidate: I led the migration.",
            "Candidate: We cut latency by 30 percent.",
            "Interviewer: What was your role?",
            "Candidate: Design and rollout ownership.",
        ]
    )

    assert turns == [
        {
            "turn": 1,
            "question": "Tell me about your latest project.",
            "answer": "I led the migration. We cut latency by 30 percent.",
            "questionSpeaker": "Interviewer",
            "answerSpeaker": "Candidate",
        },
        {
            "turn": 2,
            "question": "What was your role?",
            "answer": "Design and rollout ownership.",
            "questionSpeaker": "Interviewer",
            "answerSpeaker": "Candidate",
        },
    ]
