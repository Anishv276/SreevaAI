"""
test_signal_roles.py
4 roles x 10 turns each. Proves the signals are domain-agnostic.
For each role: runs signal detection + question generation on real OpenAI calls,
prints one table per role plus a per-role and overall accuracy score.

Run:  python tests/test_signal_roles.py
"""
from __future__ import annotations
import asyncio
import os
import textwrap

from dotenv import load_dotenv
load_dotenv()

from openai import AsyncOpenAI
from interview.agent_scoring import evaluate_answer
from interview.probe_strategy import get_probe_context, QUESTION_GENERATION_SYSTEM

MODEL_EVAL = "gpt-4.1-mini"
MODEL_QG   = "gpt-4.1-mini"
client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])

# Each turn: (topic, question, answer, expected_signal)
ROLES: dict[str, list[tuple]] = {

    "AI/ML Engineer": [
        ("Recommendation Engine", "Walk me through what you personally built in this project.",
         "The entire recommendation engine was built by me end to end. It's a deep learning system.", "explanation_shallow"),
        ("Data Pipeline", "How did the data pipeline come together?",
         "We built the data pipeline, the team handled feature engineering, and they deployed it to production.", "ownership_ambiguous"),
        ("Vector Store", "Which vector store did you use and how?",
         "For the vector store we used Pinecone, FAISS, and Weaviate.", "tool_named_not_used"),
        ("Model Training", "Why did you pick that training framework?",
         "I trained the model in PyTorch and ran all the experiments on it. It worked well.", "tech_choice_unjustified"),
        ("ML Workflow", "How do you approach building a model end to end?",
         "You collect the data, clean it, split into train and test, train the model, then evaluate on the test set.", "scenario_untested"),
        ("Overfitting", "Tell me about a time your model overfit and what you did.",
         "Usually when my model overfits I just add dropout and regularization and it's fine.", "example_evaded"),
        ("Transformers", "Walk me through the attention mechanism in your model.",
         "I've heard of transformers but I don't really have much idea about the attention mechanism.", "depth_ceiling_hit"),
        ("MLOps", "How do you handle deployment and monitoring?",
         "I'm really strong at MLOps. I always set up the best pipelines and they never break.", "explanation_shallow"),
        ("Experiment Tracking", "How did you track your experiments?",
         "We used MLflow for experiment tracking. It's a platform for managing the ML lifecycle.", "tool_named_not_used"),
        ("Deployment", "Why did you choose that deployment approach?",
         "I deployed the model using FastAPI and containerized it with Docker.", "tech_choice_unjustified"),
    ],

    "Sales Representative": [
        ("Enterprise Deal", "Tell me about your biggest win and what you did.",
         "I closed the entire enterprise deal completely on my own. It was a six-figure contract.", "explanation_shallow"),
        ("Deal Process", "How did that deal come together across the team?",
         "Our team ran the discovery calls, we built the proposal together, and the account exec handled the close.", "ownership_ambiguous"),
        ("Sales Stack", "What tools did you work with?",
         "We used Salesforce, Outreach, and Gong in our sales stack.", "tool_named_not_used"),
        ("CRM Usage", "Why did you choose that CRM workflow?",
         "I used Salesforce to track all my pipeline and log every call. It kept me organized.", "tech_choice_unjustified"),
        ("Sales Cycle", "Walk me through your sales process.",
         "You prospect the lead, qualify them, do discovery, present the solution, handle objections, then close.", "scenario_untested"),
        ("Stalled Deal", "Tell me about a specific deal that stalled and how you handled it.",
         "Usually when a deal stalls I just follow up persistently and offer a discount.", "example_evaded"),
        ("Forecasting", "Walk me through how you built your pipeline forecast.",
         "I've done some forecasting but I'm honestly not too sure how the pipeline weighting worked.", "depth_ceiling_hit"),
        ("Closing Skill", "What makes you effective at closing?",
         "I'm really strong at closing. I always read the client perfectly and I never lose a deal I want.", "explanation_shallow"),
        ("Qualification", "What qualification method did you use?",
         "We used the MEDDIC framework for qualification. It stands for Metrics, Economic buyer, Decision criteria, and so on.", "tool_named_not_used"),
        ("Quota", "How did the quarter go for your team?",
         "The team hit quota, we crushed the quarter, and everyone contributed to the number.", "ownership_ambiguous"),
    ],

    "HR / Recruiter": [
        ("Onboarding Program", "Tell me about the onboarding work you led.",
         "I designed the entire onboarding program myself. It covers everything a new hire needs.", "explanation_shallow"),
        ("Hiring Decision", "How did the hiring decisions get made?",
         "The hiring committee made the decision, we interviewed the candidates together, and the panel scored them.", "ownership_ambiguous"),
        ("Recruiting Stack", "What systems did you work in?",
         "We used Greenhouse, Lever, and Workday in our recruiting stack.", "tool_named_not_used"),
        ("Sourcing Tool", "Why did you choose that sourcing approach?",
         "I ran all our job postings through LinkedIn Recruiter and sourced candidates with it.", "tech_choice_unjustified"),
        ("Hiring Process", "Walk me through your end-to-end hiring process.",
         "You write the job description, post it, screen the resumes, do phone screens, then onsite interviews, then offer.", "scenario_untested"),
        ("Candidate Ghosting", "Tell me about a specific time a candidate dropped out and how you handled it.",
         "Usually when a candidate ghosts I just send a couple follow-ups and move to the next one.", "example_evaded"),
        ("Comp Benchmarking", "Walk me through how you set the compensation bands.",
         "I've looked at compensation benchmarking but I don't really know how the band calculations worked.", "depth_ceiling_hit"),
        ("Assessing Talent", "What makes you good at assessing candidates?",
         "I'm really strong at assessing talent. I always know within five minutes if someone's a fit.", "explanation_shallow"),
        ("Interview Method", "What interview method did you use?",
         "We used structured interviewing with a competency framework. It's a standardized evaluation method.", "tool_named_not_used"),
        ("Scorecards", "Why did you build the scorecard system that way?",
         "I built the whole interview scorecard system in Greenhouse and rolled it out to the team.", "tech_choice_unjustified"),
    ],

    "Marketing Manager": [
        ("Rebrand Campaign", "Tell me about the rebrand and your role in it.",
         "I ran the entire rebrand campaign single-handedly. It transformed our whole market presence.", "explanation_shallow"),
        ("Campaign Team", "How did the campaign come together across teams?",
         "We planned the campaign, the design team made the creatives, and they handled the ad buys.", "ownership_ambiguous"),
        ("Martech Stack", "What tools were in your stack?",
         "Our martech stack was HubSpot, Marketo, and Google Analytics.", "tool_named_not_used"),
        ("Email Platform", "Why did you choose that email platform?",
         "I ran all our email campaigns through HubSpot and tracked the open rates there.", "tech_choice_unjustified"),
        ("Campaign Process", "Walk me through how you run a campaign.",
         "You define the audience, set the goal, create the content, launch the campaign, then measure the ROI.", "scenario_untested"),
        ("Underperforming Campaign", "Tell me about a specific campaign that flopped and what you did.",
         "Usually when a campaign underperforms I just adjust the targeting and refresh the creative.", "example_evaded"),
        ("Attribution", "Walk me through how your attribution model worked.",
         "I've worked with attribution models but I'm not really sure how the multi-touch weighting was calculated.", "depth_ceiling_hit"),
        ("Brand Strategy", "What makes you strong at brand strategy?",
         "I'm really strong at brand strategy. I always nail the positioning and our messaging always lands.", "explanation_shallow"),
        ("Funnel Framework", "What framework did you use for the funnel?",
         "We used the AARRR framework for our funnel. It stands for Acquisition, Activation, Retention, Referral, Revenue.", "tool_named_not_used"),
        ("Lead Growth", "How did the team grow the pipeline?",
         "The team grew the pipeline, we doubled the leads, and marketing and sales aligned on the numbers.", "ownership_ambiguous"),
    ],
}


async def detect_signal(topic, question, answer):
    res = await evaluate_answer(
        candidate_answer=answer, last_question=question, topic_follow_up_count=1,
        transcript_lines=[f"Interviewer: {question}", f"Candidate: {answer}"],
        client=client, llm_model=MODEL_EVAL, candidate_band="mid",
        active_topic=topic, topic_importance="HIGH", topic_tag="RESUME_TOPIC",
        signals_already_fired=[],
    )
    return res.get("signal") or "null", res.get("signal_reason") or ""


async def gen_question(topic, question, answer, signal, signal_reason):
    probe_ctx = get_probe_context(
        signal=signal if signal != "null" else None, signal_reason=signal_reason,
        band="mid", topic_follow_ups=1, topic_denied=False, prev_answer=answer,
    )
    user = textwrap.dedent(f"""
        PREVIOUS QUESTION: {question}
        CANDIDATE ANSWER: {answer}
        PROBE DIRECTIVE:
        {probe_ctx}
        Write your follow-up question now.
    """).strip()
    resp = await client.chat.completions.create(
        model=MODEL_QG, temperature=0.7, max_tokens=120,
        messages=[
            {"role": "system", "content": QUESTION_GENERATION_SYSTEM + f"\n\nCurrent topic: {topic}"},
            {"role": "user", "content": user},
        ],
    )
    return resp.choices[0].message.content.strip()


async def run():
    print("\n4 ROLES x 10 TURNS — domain-agnostic signal detection + question framing\n")
    print(f"Eval model: {MODEL_EVAL} | QG model: {MODEL_QG}\n")

    overall_correct = overall_total = 0
    role_summaries = []

    for role, turns in ROLES.items():
        rows = []
        for i, (topic, q, a, expected) in enumerate(turns, 1):
            signal, reason = await detect_signal(topic, q, a)
            nextq = await gen_question(topic, q, a, signal, reason)
            ok = (signal == expected)
            rows.append((i, topic, a, expected, signal, ok, nextq))
            print(f"  [{role}] turn {i:2d}: {signal:<24} {'OK' if ok else 'MISS->'+expected}")

        correct = sum(1 for r in rows if r[5])
        overall_correct += correct
        overall_total += len(rows)
        role_summaries.append((role, correct, len(rows), rows))

    # Tables
    for role, correct, total, rows in role_summaries:
        print("\n" + "=" * 122)
        print(f"  ROLE: {role}   —   SIGNAL ACCURACY: {correct}/{total}")
        print("=" * 122)
        print(f"{'TRN':<4}{'ANSWER (truncated)':<46}{'SIGNAL':<24}{'OK':<5}{'NEXT QUESTION'}")
        print("-" * 122)
        for i, topic, a, expected, signal, ok, nextq in rows:
            ans = (a[:43] + "...") if len(a) > 43 else a
            qline = textwrap.wrap(nextq, width=44)
            print(f"{i:<4}{ans:<46}{signal:<24}{'OK' if ok else 'X':<5}{qline[0] if qline else ''}")
            for extra in qline[1:]:
                print(f"{'':4}{'':46}{'':24}{'':5}{extra}")
            if not ok:
                print(f"{'':79}(expected: {expected})")
        print()

    print("=" * 122)
    print(f"\n  OVERALL SIGNAL ACCURACY: {overall_correct}/{overall_total} "
          f"({100*overall_correct//overall_total}%)\n")


if __name__ == "__main__":
    asyncio.run(run())
