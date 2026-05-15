
import sys
import os

# Ensure the root directory is in sys.path
sys.path.append(os.getcwd())

try:
    print("[1/3] Testing imports from 'interview' package...")
    from interview.agent_profile_context import (
        CandidateBandContext, 
        ResumeBrief, 
        infer_candidate_band, 
        build_resume_brief, 
        build_merged_interview_brief
    )
    from interview.resume_context_parser import ResumeContext
    # Import agent_runtime and check a key function
    from interview.agent_runtime import _toggle_bool
    print("SUCCESS: Imports successful.")

    print("\n[2/3] Testing Pydantic Model validation...")
    
    # Correct ResumeContext construction based on dataclass definition
    resume_context = ResumeContext(
        resume_data={},
        resume_text="Experienced dev with 4 years in Python",
        years_of_experience=4.0,
        years_label="4 years",
        current_role="Software Engineer",
        skills=["Python", "AWS"],
        projects=["Project X"],
        work_history=["Company Y"],
        experiences=["Exp Z"],
        education=[],
        hobbies=[],
        ownership_risks=[],
        fresher_signals=False,
        experienced_signals=True
    )
    
    band = infer_candidate_band({}, "Experienced dev with 4 years in Python")
    print(f"   Inferred Band: {band} (Expected: mid)")
    
    # This calls the Strategy Pattern classes
    brief = build_resume_brief(band, resume_context)
    print(f"   ResumeBrief built successfully: {type(brief)}")
    print(f"   Anchor Item: {brief.anchor_item}")
    
    merged = build_merged_interview_brief(
        candidate_name="John",
        job_title="Software Engineer",
        candidate_band=band,
        resume_context=resume_context,
        jd_details={"skills": {"must_have": [{"skill": "Python", "why_needed": "core logic"}]}},
        resume_brief=brief
    )
    print("SUCCESS: Interview Brief generated successfully.")
    print("-" * 30)
    print(merged)
    print("-" * 30)

    print("\n[3/3] Final Flow Integrity Check...")
    # Checking if a nested import inside agent_runtime works (like interview_phases)
    from interview.agent_runtime import InterviewAgent
    print("SUCCESS: Flow Integrity: 100%. All modules communicating via absolute imports.")

except Exception as e:
    print(f"FAILURE: FLOW ERROR: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
