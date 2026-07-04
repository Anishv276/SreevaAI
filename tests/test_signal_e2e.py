"""
test_signal_e2e.py
End-to-end test: 10 scripted answers -> signal detection -> follow-up question generation.
Uses real OpenAI calls. Prints a single table: Turn | Signal Fired | Question Asked | Answer.

Run:  python -m tests.test_signal_e2e
"""
from __future__ import annotations
import asyncio
import json
import os
import sys
import textwrap

from dotenv import load_dotenv
load_dotenv()

from openai import AsyncOpenAI
from interview.agent_scoring import evaluate_answer, SIGNAL_DEFINITIONS
from interview.probe_strategy import get_probe_context, QUESTION_GENERATION_SYSTEM

MODEL_EVAL = "gpt-4.1-nano"
MODEL_QG   = "gpt-4.1-mini"   # question generation — slightly smarter

client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])

# ---------------------------------------------------------------------------
# 10 scripted turns — each designed to hit a specific signal.
# topic, question, answer, expected_signal (for reference only, not enforced)
# ---------------------------------------------------------------------------
TURNS = [
    {
        "topic":           "RAG-Based Research Copilot",
        "question":        "Walk me through what you personally built in this project.",
        "answer":          "Entire functionality is completely built by me. It's a RAG-based system.",
        "expected_signal": "explanation_shallow",
    },
    {
        "topic":           "RAG-Based Research Copilot",
        "question":        "How does the retrieval part actually work inside your system?",
        "answer":          "We built the retrieval pipeline and the team set up the vector store and the indexing was handled by the backend team.",
        "expected_signal": "ownership_ambiguous",
    },
    {
        "topic":           "Vector Database",
        "question":        "Which vector database did you use and how did you use it?",
        "answer":          "Vector database — ChromaDB, FAISS, Pinecone.",
        "expected_signal": "tool_named_not_used",
    },
    {
        "topic":           "LangChain Integration",
        "question":        "How did you set up the LangChain pipeline end to end?",
        "answer":          "Embedding goes into chunks, chunks become vectors, vectors go into the store, then similarity search retrieves the top results.",
        "expected_signal": "scenario_untested",
    },
    {
        "topic":           "ChromaDB vs FAISS",
        "question":        "You used ChromaDB for the project — why ChromaDB specifically?",
        "answer":          "I stored the embeddings in ChromaDB and queried them through LangChain. It worked fine for the project.",
        "expected_signal": "tech_choice_unjustified",
    },
    {
        "topic":           "Sentiment Analysis Model",
        "question":        "Tell me about a time your model gave wrong predictions and how you fixed it.",
        "answer":          "Usually when a model gives wrong predictions I check the training data first and then tune the hyperparameters and retrain it.",
        "expected_signal": "example_evaded",
    },
    {
        "topic":           "FAISS Indexing",
        "question":        "Walk me through how you set up the FAISS index and what embedding model you used.",
        "answer":          "For FAISS... I don't really have a lot of idea about how exactly the indexing works.",
        "expected_signal": "depth_ceiling_hit",
    },
    {
        "topic":           "Prompt Engineering",
        "question":        "What makes a good prompt and how did you design yours for this project?",
        "answer":          "I'm really strong at prompt engineering. I always write the best prompts and my prompts always give accurate outputs every time.",
        "expected_signal": "explanation_shallow",
    },
    {
        "topic":           "Three.js 3D Visualisation",
        "question":        "What specific parts of Three.js were challenging for you?",
        "answer":          "Didn't know Three.js before this. Teammates faced difficulties too. We learned it together during the project.",
        "expected_signal": "ownership_ambiguous",
    },
    {
        "topic":           "FastAPI Backend",
        "question":        "How did you structure the FastAPI routes and handle request validation?",
        "answer":          "FastAPI is a Python framework for building APIs. It uses decorators like @app.get and @app.post to define endpoints and it's very fast.",
        "expected_signal": "tool_named_not_used",
    },
]

# ---------------------------------------------------------------------------
# Question generation — given signal + probe context, generate a real question
# ---------------------------------------------------------------------------
async def generate_question(
    topic: str,
    prev_question: str,
    prev_answer: str,
    signal: str | None,
    signal_reason: str | None,
    band: str = "fresher",
    topic_follow_ups: int = 1,
) -> str:
    probe_ctx = get_probe_context(
        signal=signal,
        signal_reason=signal_reason,
        band=band,
        topic_follow_ups=topic_follow_ups,
        topic_denied=False,
        prev_answer=prev_answer,
    )

    system = QUESTION_GENERATION_SYSTEM + f"\n\nCurrent topic: {topic}"

    user = textwrap.dedent(f"""
        PREVIOUS QUESTION: {prev_question}

        CANDIDATE ANSWER: {prev_answer}

        PROBE DIRECTIVE:
        {probe_ctx}

        Write your follow-up question now.
    """).strip()

    resp = await client.chat.completions.create(
        model=MODEL_QG,
        temperature=0.4,
        max_tokens=120,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
    )
    return resp.choices[0].message.content.strip()


# ---------------------------------------------------------------------------
# Main runner
# ---------------------------------------------------------------------------
async def run_test():
    print("\nRunning 10-turn signal + question generation test...\n")

    results = []

    for i, turn in enumerate(TURNS, 1):
        # 1. Signal detection
        eval_result = await evaluate_answer(
            candidate_answer=turn["answer"],
            last_question=turn["question"],
            topic_follow_up_count=i,
            transcript_lines=[
                f"Interviewer: {turn['question']}",
                f"Candidate: {turn['answer']}",
            ],
            client=client,
            llm_model=MODEL_EVAL,
            candidate_band="fresher",
            active_topic=turn["topic"],
            topic_importance="HIGH",
            topic_tag="RESUME_TOPIC",
            signals_already_fired=[],
        )

        signal        = eval_result.get("signal") or "null"
        signal_reason = eval_result.get("signal_reason") or ""
        expected      = turn["expected_signal"]
        match         = "OK" if signal == expected else f"MISS (expected {expected})"

        # 2. Question generation
        next_q = await generate_question(
            topic=turn["topic"],
            prev_question=turn["question"],
            prev_answer=turn["answer"],
            signal=signal if signal != "null" else None,
            signal_reason=signal_reason,
            band="fresher",
            topic_follow_ups=i,
        )

        results.append({
            "turn":    i,
            "topic":   turn["topic"],
            "answer":  turn["answer"],
            "signal":  signal,
            "match":   match,
            "next_q":  next_q,
        })

        print(f"  Turn {i:2d} done — signal: {signal} {match}")

    # ---------------------------------------------------------------------------
    # Print table
    # ---------------------------------------------------------------------------
    print("\n" + "=" * 120)
    print(f"{'TRN':<4} {'TOPIC':<28} {'ANSWER (truncated)':<42} {'SIGNAL FIRED':<25} {'NEXT QUESTION GENERATED'}")
    print("=" * 120)
    for r in results:
        topic  = r["topic"][:27]
        answer = r["answer"][:40] + ("..." if len(r["answer"]) > 40 else "")
        signal = r["signal"][:24]
        qlines = textwrap.wrap(r["next_q"], width=50)
        print(f"{r['turn']:<4} {topic:<28} {answer:<42} {signal:<25} {qlines[0] if qlines else ''}")
        for extra in qlines[1:]:
            print(f"{'':4} {'':28} {'':42} {'':25} {extra}")
        print(f"     Match: {r['match']}")
        print()

    print("=" * 120)

    # Summary
    correct = sum(1 for r in results if "âœ“" in r["match"])
    print(f"\nSignal accuracy: {correct}/10 matched expected")
    print("Note: 'expected' is human judgment — a different valid signal is not necessarily wrong.\n")


if __name__ == "__main__":
    asyncio.run(run_test())


