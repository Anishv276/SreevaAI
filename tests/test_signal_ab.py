"""
test_signal_ab.py
A/B comparison on the SAME 10 turns:
  Approach A — LLM directly classifies into 1 of 7 signals (single call).
  Approach B — LLM extracts 11 boolean features; Python resolves the signal.

Both use the same model and the same answers. Prints per-turn results and
a final score for each approach. Run:  python tests/test_signal_ab.py
"""
from __future__ import annotations
import asyncio
import json
import os
import textwrap

from dotenv import load_dotenv
load_dotenv()

from openai import AsyncOpenAI
from interview.agent_scoring import _resolve_signal, FEATURE_KEYS

MODEL = "gpt-4.1-mini"   # testing whether a stronger model closes the gap
client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])

SIGNAL_NAMES = [
    "example_evaded", "depth_ceiling_hit", "ownership_ambiguous",
    "explanation_shallow", "tool_named_not_used", "tech_choice_unjustified",
    "scenario_untested",
]

# Same 10 turns as the e2e test, with the human-expected signal.
TURNS = [
    ("RAG Copilot", "Walk me through what you personally built in this project.",
     "Entire functionality is completely built by me. It's a RAG-based system.", "explanation_shallow"),
    ("RAG Copilot", "How does the retrieval part actually work inside your system?",
     "We built the retrieval pipeline and the team set up the vector store and the indexing was handled by the backend team.", "ownership_ambiguous"),
    ("Vector Database", "Which vector database did you use and how did you use it?",
     "Vector database — ChromaDB, FAISS, Pinecone.", "tool_named_not_used"),
    ("LangChain", "How did you set up the LangChain pipeline end to end?",
     "Embedding goes into chunks, chunks become vectors, vectors go into the store, then similarity search retrieves the top results.", "scenario_untested"),
    ("ChromaDB vs FAISS", "You used ChromaDB for the project — why ChromaDB specifically?",
     "I stored the embeddings in ChromaDB and queried them through LangChain. It worked fine for the project.", "tech_choice_unjustified"),
    ("Sentiment Model", "Tell me about a time your model gave wrong predictions and how you fixed it.",
     "Usually when a model gives wrong predictions I check the training data first and then tune the hyperparameters and retrain it.", "example_evaded"),
    ("FAISS Indexing", "Walk me through how you set up the FAISS index and what embedding model you used.",
     "For FAISS... I don't really have a lot of idea about how exactly the indexing works.", "depth_ceiling_hit"),
    ("Prompt Engineering", "What makes a good prompt and how did you design yours for this project?",
     "I'm really strong at prompt engineering. I always write the best prompts and my prompts always give accurate outputs every time.", "explanation_shallow"),
    ("Three.js", "What specific parts of Three.js were challenging for you?",
     "Didn't know Three.js before this. Teammates faced difficulties too. We learned it together during the project.", "ownership_ambiguous"),
    ("FastAPI", "How did you structure the FastAPI routes and handle request validation?",
     "FastAPI is a Python framework for building APIs. It uses decorators like @app.get and @app.post to define endpoints and it's very fast.", "tool_named_not_used"),
]


# ---------------------------------------------------------------------------
# APPROACH A -- LLM classifies the signal directly
# ---------------------------------------------------------------------------
A_SYSTEM = textwrap.dedent("""
    You are an expert interviewer. Read the question and answer, then identify the ONE
    most important gap and name it with exactly one signal (or null if the answer is sufficient).

    SIGNALS:
    - example_evaded: question asked for a real past instance, answer is a general habit ("usually I...").
    - depth_ceiling_hit: they tried but ran out of knowledge (trailed off, one-word, "don't have much idea").
    - ownership_ambiguous: "we/team/they" throughout, no personal "I did/built/decided".
    - explanation_shallow: bold personal claim ("I built it all", "I'm great at X") but hollow explanation.
    - tool_named_not_used: a specific tool is named but no evidence they operated it.
    - tech_choice_unjustified: they clearly used a tool but never said why that one over alternatives.
    - scenario_untested: correct but textbook description, no friction, no specific tool to chase, no personal claim.

    Output ONLY JSON: {"signal": "<one name or null>", "signal_reason": "<3-12 word quote or null>"}
""").strip()


async def approach_a(question: str, answer: str) -> str | None:
    resp = await client.chat.completions.create(
        model=MODEL, temperature=0.0, max_tokens=80,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": A_SYSTEM},
            {"role": "user", "content": f"QUESTION: {question}\n\nANSWER: {answer}"},
        ],
    )
    data = json.loads(resp.choices[0].message.content)
    sig = data.get("signal")
    return sig if sig in SIGNAL_NAMES else None


# ---------------------------------------------------------------------------
# APPROACH B -- LLM extracts features, Python resolves the signal
# ---------------------------------------------------------------------------
B_SYSTEM = textwrap.dedent("""
    Read the question and answer, then report simple true/false observations about the ANSWER.
    Judge each independently. Be literal — report what is actually there.

    Output ONLY JSON with a "features" object. Each feature is true or false:
      ran_out: they tried but trailed off / one-word / "don't have much idea" after attempting.
      question_wanted_instance: the QUESTION asked for a specific past time/example/story.
      answer_is_general_pattern: the ANSWER is a general habit/rule ("usually", "normally", "I always").
      gave_real_instance: the answer has at least one real specific event with concrete detail.
      team_language_only: every action is we/team/they, NO personal "I did/built/decided/handled".
      bold_self_claim: strong personal ability/ownership claim ("I built it all", "I'm really strong at X").
      explanation_has_substance: contains a real decision, constraint, mechanism, number, or outcome.
      tool_named: a specific tool/technology/framework/method is named.
      tool_usage_shown: an operational verb ties them to the tool ("I stored X in it", "I queried it", "I built with it").
      choice_reason_given: they gave a reason WHY they chose this tool/approach over alternatives.
      is_correct_but_generic: technically correct but textbook/frictionless — no specific event, no tool to chase, no personal claim.

    Also include "signal_reason": a 3-12 word exact quote capturing the main gap, or null.
""").strip()


async def approach_b(question: str, answer: str) -> str | None:
    resp = await client.chat.completions.create(
        model=MODEL, temperature=0.0, max_tokens=200,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": B_SYSTEM},
            {"role": "user", "content": f"QUESTION: {question}\n\nANSWER: {answer}"},
        ],
    )
    data = json.loads(resp.choices[0].message.content)
    features = data.get("features", {})
    return _resolve_signal(features)


# ---------------------------------------------------------------------------
async def run():
    print("\nA/B test — LLM-classifies (A) vs LLM-observes + code-resolves (B)\n")
    print(f"Model: {MODEL}\n")

    rows = []
    a_correct = b_correct = 0

    for i, (topic, q, a, expected) in enumerate(TURNS, 1):
        sig_a, sig_b = await asyncio.gather(approach_a(q, a), approach_b(q, a))
        a_ok = (sig_a == expected)
        b_ok = (sig_b == expected)
        a_correct += a_ok
        b_correct += b_ok
        rows.append((i, topic, expected, sig_a, a_ok, sig_b, b_ok))
        print(f"  Turn {i:2d}  expected={expected:<22} "
              f"A={str(sig_a):<22}{'OK ' if a_ok else 'X  '} "
              f"B={str(sig_b):<22}{'OK' if b_ok else 'X'}")

    print("\n" + "=" * 110)
    print(f"{'TRN':<4}{'EXPECTED':<24}{'A (classify)':<24}{'':<4}{'B (features)':<24}{''}")
    print("=" * 110)
    for i, topic, expected, sig_a, a_ok, sig_b, b_ok in rows:
        print(f"{i:<4}{expected:<24}{str(sig_a):<24}{'OK' if a_ok else 'X':<4}{str(sig_b):<24}{'OK' if b_ok else 'X'}")
    print("=" * 110)
    print(f"\n  APPROACH A (LLM classifies directly):     {a_correct}/10")
    print(f"  APPROACH B (LLM observes, code resolves): {b_correct}/10\n")


if __name__ == "__main__":
    asyncio.run(run())
