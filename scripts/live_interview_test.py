"""
Live interview test for the current probe_strategy.py (post-optimization).
Single anchor topic, 8 live turns: real signal detection -> real question
generation -> a persona LLM plays the candidate reacting to that live question.
Nothing after turn 1 is fixed in advance.

Run: python scripts/live_interview_test.py
Requires OPENAI_API_KEY in env (.env is loaded automatically).
"""
from __future__ import annotations
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from openai import AsyncOpenAI

from interview.agent_scoring import evaluate_answer
from interview.probe_strategy import get_probe_context, QUESTION_GENERATION_SYSTEM, _strip_leaked_meta

LLM_MODEL = os.environ.get("TEST_LLM_MODEL", "gpt-4.1-mini")

ANCHOR_TOPIC = "RAG pipeline you built"
OPENING_QUESTION = "Tell me about the RAG pipeline you mentioned on your resume."

CANDIDATE_PERSONA_SYSTEM = """\
You are a candidate in a live technical interview for a GTM Engineer role. You claimed a RAG
pipeline on your resume, but your actual experience is uneven: you copy-pasted a lot from
tutorials, understand the high-level flow but not the internals, worked mostly in a team where
credit is blurry, and occasionally don't remember exact numbers or specifics. You are not lying
outright, but you oversell in your first answer on a topic and get vaguer under pressure.
Answer in 1-3 sentences, like real spoken interview language (not polished writing). Stay
consistent with whatever you've said in earlier turns of this same conversation.
"""


async def simulate_candidate_answer(client: AsyncOpenAI, history: list[dict]) -> str:
    convo = []
    for h in history[:-1]:
        convo.append(f"Interviewer: {h['question']}")
        convo.append(f"You: {h['answer']}")
    convo.append(f"Interviewer: {history[-1]['question']}")
    resp = await client.chat.completions.create(
        model=LLM_MODEL,
        temperature=0.8,
        max_tokens=100,
        messages=[
            {"role": "system", "content": CANDIDATE_PERSONA_SYSTEM},
            {"role": "user", "content": "\n".join(convo) + "\nYou:"},
        ],
    )
    return (resp.choices[0].message.content or "").strip()


async def gen_next_question(client: AsyncOpenAI, *, signal, signal_reason, follow_ups, prev_answer, signals_history, prev_question, recent_patterns, declined_facts) -> str:
    probe_ctx = get_probe_context(
        signal=signal,
        signal_reason=signal_reason,
        band="mid",
        topic_follow_ups=follow_ups,
        topic_denied=False,
        prev_answer=prev_answer,
        signals_history=signals_history,
        active_topic=ANCHOR_TOPIC,
        prev_question=prev_question,
        recent_question_patterns="\n".join(recent_patterns[-6:]) or "(none yet)",
        declined_facts="\n".join(f"  - {f}" for f in declined_facts) or "(none yet)",
    )
    resp = await client.chat.completions.create(
        model=LLM_MODEL,
        temperature=0.7,
        max_tokens=150,
        messages=[
            {"role": "system", "content": QUESTION_GENERATION_SYSTEM},
            {"role": "user", "content": (
                f"PROBE DIRECTIVE:\n{probe_ctx}\n\n"
                f"YOUR LAST QUESTION: {prev_question}\n"
                f"CANDIDATE'S ANSWER: {prev_answer}\n\n"
                "Write your next turn now."
            )},
        ],
    )
    raw = (resp.choices[0].message.content or "").strip()
    return _strip_leaked_meta(raw)


async def main():
    client = AsyncOpenAI()
    transcript: list[str] = []
    signals_history: list[str] = []
    history: list[dict] = []
    recent_patterns: list[str] = []
    declined_facts: list[str] = []
    rows = []

    question = OPENING_QUESTION
    for turn in range(1, 9):
        history.append({"question": question, "answer": None})
        answer = await simulate_candidate_answer(client, history)
        history[-1]["answer"] = answer

        eval_result = await evaluate_answer(
            candidate_answer=answer,
            last_question=question,
            topic_follow_up_count=turn - 1,
            transcript_lines=transcript,
            client=client,
            llm_model=LLM_MODEL,
            candidate_band="mid",
            active_topic=ANCHOR_TOPIC,
            topic_importance="HIGH",
            topic_tag="RESUME_TOPIC",
            job_title="GTM Engineer",
            signals_already_fired=signals_history,
        )
        signal = eval_result.get("signal")
        signal_reason = eval_result.get("signal_reason")
        signals_history.append(signal)

        transcript.append(f"Interviewer: {question}")
        transcript.append(f"Candidate: {answer}")

        next_question = await gen_next_question(
            client, signal=signal, signal_reason=signal_reason,
            follow_ups=turn, prev_answer=answer, signals_history=signals_history,
            prev_question=question,
            recent_patterns=recent_patterns, declined_facts=declined_facts,
        )

        recent_patterns.append(f"turn {turn}: {next_question[:80]}")
        if any(p in answer.lower() for p in ("don't remember", "dont remember", "not sure", "no exact")):
            declined_facts.append(f"specific detail declined at turn {turn}")

        rows.append({
            "turn": turn, "question": question, "answer": answer,
            "signal": signal, "next_question": next_question,
        })

        question = next_question

    print("\n" + "=" * 100)
    print(f"LIVE INTERVIEW TEST -- anchor: {ANCHOR_TOPIC} -- model={LLM_MODEL}")
    print("=" * 100)
    for r in rows:
        print(f"\n--- Turn {r['turn']} | signal: {r['signal']} ---")
        print(f"  Q: {r['question']}")
        print(f"  A: {r['answer']}")
        print(f"  NEXT Q: {r['next_question']}")

    print("\n\n" + "=" * 100)
    print("MARKDOWN TABLE")
    print("=" * 100)
    print("| Turn | Signal | Question Asked | Candidate Answer | Next Question |")
    print("|---|---|---|---|---|")
    for r in rows:
        def esc(s): return (s or "").replace("|", "\\|").replace("\n", " ")
        print(f"| {r['turn']} | {r['signal']} | {esc(r['question'])} | {esc(r['answer'])} | {esc(r['next_question'])} |")


if __name__ == "__main__":
    asyncio.run(main())
