"""
interview/tech/resume_match.py
==============================
Resume-grounded follow-up sourcing for the PROBE path.

ONE job: given the skill the current question thread is testing, decide whether
the candidate's resume contains a GENUINE, high-confidence instance of that skill
in a NAMED project. That decision picks which of two follow-up branches runs:

  Branch A (match)    -> follow_up_source="resume_project". The directive names the
                         project verbatim and asks a verification question about a
                         decision/metric/tradeoff/failure-mode inside it.
  Branch B (no match) -> follow_up_source="concept_probe". The directive is exactly
                         what it was before this module existed -- the signal's own
                         mechanism/step-through probe, untouched.

Why the matching is deterministic (no LLM call)
-----------------------------------------------
The probe directive is built synchronously -- _build_probe_directive in
agent_runtime.py takes no client and makes no awaits, deliberately (it collapsed
3 LLM calls/turn down to 2). Adding an LLM call for match detection would put a
third call back on the critical path of every turn, and a timeout there would
stall the interviewer mid-conversation. So the match is scored arithmetically
here, and only the QUESTION WORDING is left to the LLM that already runs.

The confidence gate is the whole design
---------------------------------------
A shared buzzword is not a match. "Docker" appearing in a project's tech list
does not mean the project exercised "container orchestration at scale"; a project
described as "REST API for reporting" does not evidence "CI/CD" just because
somebody deployed it somewhere. Overclaiming a match is the expensive failure
mode: the candidate hears their own project named, recognises the question
assumes work they never did, and stops trusting the interview. A missed match
just falls back to the mechanism probe, which is what shipped before and is
already good. The gate is therefore asymmetric on purpose -- it must clear
_MIN_CONFIDENCE on real evidence, and everything ambiguous resolves to no-match.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("interview-agent")


# ---------------------------------------------------------------------------
# Tokenisation
# ---------------------------------------------------------------------------
# Words that carry no discriminating signal. A match resting only on these is a
# buzzword collision, not evidence -- "system", "data" and "using" appear in
# almost every project description ever written, so they must never be able to
# clear the gate on their own.
_STOPWORDS: frozenset[str] = frozenset({
    "a", "an", "and", "the", "for", "with", "using", "used", "use", "via", "of",
    "to", "in", "on", "at", "by", "from", "into", "over", "under", "across",
    "system", "systems", "service", "services", "app", "application", "platform",
    "project", "based", "built", "build", "building", "implemented", "developed",
    "created", "designed", "work", "worked", "working", "data", "code", "tool",
    "tools", "new", "end", "full", "stack", "real", "time", "high", "low", "best",
    "practices", "various", "multiple", "different", "several", "some", "other",
    "it", "its", "this", "that", "these", "those", "was", "were", "is", "are",
    "be", "been", "has", "have", "had", "as", "or", "but", "not", "no", "all",
    "team", "teams", "company", "client", "clients", "user", "users", "product",
})

_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9+#.\-]*")

# Bare LANGUAGE names are not evidence of any particular competency within that
# language. "Python" on a project's tech list does not mean the project exercised
# lazy iteration, descriptors, or the GIL -- it means the project was written in
# Python, which is true of every Python project on the resume.
#
# Caught in a dry run: a "Generators / memory-efficient lazy iteration" topic
# matched an LSTM sentiment project at exact_tool tier purely on the shared token
# "python", which is the spec's own example of a case that must fall to Branch B.
# These are therefore barred from the exact-tool tier. They still contribute as
# ordinary description/technique vocabulary, so a genuine language-mechanics match
# can still be made on real overlap -- it just cannot rest on the language alone.
_GENERIC_LANGUAGE_TOKENS: frozenset[str] = frozenset({
    "python", "java", "javascript", "typescript", "c", "c++", "c#", "go",
    "golang", "ruby", "php", "rust", "scala", "kotlin", "swift", "r",
    "perl", "bash", "shell", "html", "css",
})


def _tokens(text: str) -> set[str]:
    """Content-bearing lowercase tokens. Keeps '+'/'#'/'.'/'-' so 'c++',
    'c#', 'node.js' and 'scikit-learn' survive as single tokens."""
    raw = _TOKEN_RE.findall(str(text or "").lower())
    return {t for t in raw if len(t) > 1 and t not in _STOPWORDS}


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).strip()


# ---------------------------------------------------------------------------
# Technique / category families.
#
# Priority-2 matching ("category/technique match") needs to know that an LSTM IS
# deep learning and that Redis IS caching -- a token-overlap test can never
# discover that, because "LSTM" and "Deep Learning" share no characters. This is
# the lookup that encodes it.
#
# Each entry maps a family name to the concrete members that EVIDENCE that
# family. Deliberately curated rather than exhaustive: an unknown tool simply
# doesn't match by category and falls through to Branch B, which is the safe
# outcome. Adding a wrong member here is far more expensive than omitting one.
# ---------------------------------------------------------------------------
_TECHNIQUE_FAMILIES: dict[str, frozenset[str]] = {
    "deep learning": frozenset({
        "lstm", "gru", "rnn", "cnn", "transformer", "transformers", "bert",
        "resnet", "attention", "neural", "neural network", "neural networks",
        "pytorch", "tensorflow", "keras", "autoencoder", "gan", "embeddings",
        "fine-tuning", "fine-tune", "backpropagation",
    }),
    "machine learning": frozenset({
        "scikit-learn", "sklearn", "xgboost", "lightgbm", "random forest",
        "logistic regression", "linear regression", "svm", "clustering",
        "kmeans", "k-means", "classification", "regression", "feature engineering",
        "gradient boosting", "decision tree", "naive bayes",
    }),
    "nlp": frozenset({
        "nltk", "spacy", "tokenization", "tokenizer", "word2vec", "tf-idf",
        "tfidf", "sentiment", "named entity", "ner", "bert", "transformers",
        "embeddings", "text classification", "lemmatization", "stemming",
    }),
    "caching": frozenset({
        "redis", "memcached", "cache", "caching", "cdn", "varnish",
        "ehcache", "hazelcast", "ttl", "lru",
    }),
    # Packaging an app into an image is NOT the same competency as orchestrating
    # a fleet of them, so these two families are kept disjoint. Overlapping them
    # (Kubernetes listed under both) made a Dockerfile on a resume "evidence" of
    # pod-autoscaling experience -- a real false positive caught in testing, and
    # exactly the overclaim the confidence gate exists to prevent.
    "containerization": frozenset({
        "docker", "dockerfile", "containers", "container", "podman", "buildpack",
    }),
    "orchestration": frozenset({
        "kubernetes", "k8s", "helm", "airflow", "prefect", "dagster",
        "argo", "nomad", "ecs", "eks", "fargate", "autoscaling", "hpa",
    }),
    "ci/cd": frozenset({
        "jenkins", "github actions", "gitlab ci", "circleci", "travis",
        "argocd", "spinnaker", "azure devops", "teamcity", "bamboo",
        "pipeline", "pipelines",
    }),
    "message queue": frozenset({
        "kafka", "rabbitmq", "sqs", "pubsub", "pub/sub", "nats", "activemq",
        "celery", "redis streams", "kinesis", "event bus",
    }),
    # Bare "sql" and bare "api" are deliberately NOT members of these families:
    # they appear in so many resume lines that either one alone would make almost
    # every project a category match for almost every data/backend skill.
    "relational database": frozenset({
        "postgres", "postgresql", "mysql", "sqlite", "oracle", "sql server",
        "mariadb", "rdbms", "joins", "query plan", "indexes", "indexing",
    }),
    "nosql": frozenset({
        "mongodb", "mongo", "dynamodb", "cassandra", "couchbase", "firestore",
        "neo4j", "elasticsearch", "hbase", "redis",
    }),
    "api development": frozenset({
        "rest", "restful", "fastapi", "flask", "express", "graphql", "grpc",
        "django rest", "openapi", "swagger", "endpoints",
    }),
    "frontend": frozenset({
        "react", "vue", "angular", "svelte", "next.js", "nextjs", "redux",
        "tailwind", "css", "html", "typescript", "javascript", "jsx",
    }),
    "cloud": frozenset({
        "aws", "gcp", "azure", "s3", "ec2", "lambda", "cloudformation",
        "terraform", "cloud run", "app engine", "modal",
    }),
    "observability": frozenset({
        "prometheus", "grafana", "datadog", "opentelemetry", "jaeger",
        "sentry", "cloudwatch", "elk", "kibana", "logging", "tracing", "metrics",
    }),
    "concurrency": frozenset({
        "threads", "threading", "asyncio", "async", "goroutines", "mutex",
        "locks", "parallel", "multiprocessing", "race condition", "semaphore",
    }),
    "vector search": frozenset({
        "pinecone", "faiss", "weaviate", "qdrant", "chroma", "milvus",
        "embeddings", "rag", "semantic search", "similarity search",
    }),
    "streaming": frozenset({
        "kafka", "flink", "spark streaming", "kinesis", "websockets",
        "webrtc", "sse", "server-sent events",
    }),
    "big data": frozenset({
        "spark", "pyspark", "hadoop", "hive", "databricks", "emr",
        "dbt", "snowflake", "bigquery", "redshift", "etl",
    }),
}


def _families_for(text: str) -> set[str]:
    """Which technique families this text evidences, by member mention."""
    blob = _norm(text)
    if not blob:
        return set()
    padded = f" {blob} "
    hits: set[str] = set()
    for family, members in _TECHNIQUE_FAMILIES.items():
        if f" {family} " in padded:
            hits.add(family)
            continue
        for m in members:
            if f" {_norm(m)} " in padded:
                hits.add(family)
                break
    return hits


# ---------------------------------------------------------------------------
# Match result
# ---------------------------------------------------------------------------
@dataclass
class ResumeMatch:
    """One candidate project weighed against the skill under test."""
    project_title: str
    skill: str
    confidence: float
    tier: str                      # exact_tool | technique | domain | none
    evidence: str                  # what actually overlapped, for the log + prompt
    tech: list[str] = field(default_factory=list)
    description: str = ""
    metrics: list[str] = field(default_factory=list)

    @property
    def is_match(self) -> bool:
        return self.tier != "none" and self.confidence >= _MIN_CONFIDENCE


_NO_MATCH = ResumeMatch(project_title="", skill="", confidence=0.0, tier="none", evidence="")


# The gate. Tuned so that:
#   - an exact tool/library hit inside a named project clears it outright,
#   - a technique-family hit clears it only with corroborating description overlap,
#   - a bare domain/keyword brush never clears it.
_MIN_CONFIDENCE: float = 0.60

_TIER_BASE: dict[str, float] = {
    "exact_tool": 0.72,
    # A shared technique family is strong evidence on its own: the families are
    # curated so that membership means the concrete thing genuinely exercises the
    # abstract skill (LSTM really is deep learning, Redis really is caching). One
    # family hit therefore clears the gate at 0.61, which is the spec's priority-2
    # case -- JD "Deep Learning" against a resume project using LSTM, where the two
    # strings share no characters and description overlap may be near zero. Set
    # lower than this, that canonical example silently falls through to Branch B.
    "technique":  0.52,
    "domain":     0.30,
}


# ---------------------------------------------------------------------------
# Metric extraction -- only ever REPORTS numbers the resume actually states.
#
# Guardrail: the follow-up may cite a metric only if the candidate claimed it.
# When this returns nothing, the Branch A directive explicitly instructs the LLM
# to ask the candidate to supply their own number instead of naming one, because
# a fabricated "you reported 89.5% accuracy" is the single most damaging thing
# this feature could produce -- it invents a resume claim to the candidate's face.
# ---------------------------------------------------------------------------
_METRIC_RE = re.compile(
    r"""(
        \d+(?:\.\d+)?\s*%                              # 89.5%
      | \d+(?:[.,]\d+)?\s*(?:k|m|b|bn)\b               # 50K, 1.2M
      | \d+(?:[.,]\d+)?\s*(?:ms|s|sec|secs|seconds|
            min|mins|minutes|hrs|hours|days)\b         # 200ms, 8s
      | \d+(?:[.,]\d+)?\s*(?:x)\b                      # 3x
      | \d+(?:[.,]\d+)?\s*(?:rps|qps|tps|req/s|
            requests?/s|users?|rows?|records?|
            images?|reviews?|docs?|documents?)\b        # 50K+ reviews, 10k rps
    )""",
    re.IGNORECASE | re.VERBOSE,
)


def _extract_metrics(text: str) -> list[str]:
    out: list[str] = []
    for m in _METRIC_RE.finditer(str(text or "")):
        val = " ".join(m.group(0).split())
        if val.lower() not in {v.lower() for v in out}:
            out.append(val)
    return out[:4]


# ---------------------------------------------------------------------------
# Step 1 -- extract the tested skill
# ---------------------------------------------------------------------------
# The competency, not the keyword. The spec's example: "why generator over list
# comprehension" is testing memory-efficient lazy iteration, and the resume
# search must run against THAT, not against the token "generator".
#
# The topic brief is the authority here, in this order:
#   probe_focus     -- the admin-authored statement of what this topic is FOR.
#                      This is the closest thing in the repo to a written-down
#                      "tested skill", so it wins when present.
#   title + tech    -- what the topic is nominally about.
# The last question's text is deliberately NOT used as the primary source: a
# single question phrasing is a narrow slice of the topic ("why generator over
# list comprehension") and matching on it alone reintroduces exactly the
# keyword-level matching this step exists to avoid.
def extract_tested_skill(
    *,
    topic_item: Any | None,
    active_topic: str = "",
    prev_question: str = "",
) -> str:
    """The competency the current thread is testing, as a short phrase."""
    if topic_item is not None:
        focus = str(getattr(topic_item, "probe_focus", "") or "").strip()
        title = str(getattr(topic_item, "title", "") or "").strip()
        if title and focus:
            return f"{title} — {focus}"[:300]
        if title:
            return title[:300]
        if focus:
            return focus[:300]
    topic = str(active_topic or "").split(" — ")[0].split(" - ")[0].split("|")[0].strip()
    return (topic or str(prev_question or "").strip())[:300]


def _skill_surface(topic_item: Any | None, tested_skill: str) -> tuple[set[str], set[str]]:
    """(tokens, families) describing the skill under test.

    tech_stack entries are folded in because they are the topic's concrete
    tools -- a topic titled "Deep Learning" with tech_stack ["PyTorch","LSTM"]
    must be matchable against a resume project that names LSTM.
    """
    blob = tested_skill
    if topic_item is not None:
        stack = list(getattr(topic_item, "tech_stack", None) or [])
        desc = str(getattr(topic_item, "full_description", "") or "")
        blob = f"{blob} {' '.join(str(s) for s in stack)} {desc}"
    return _tokens(blob), _families_for(blob)


def _tech_surface(topic_item: Any | None, tested_skill: str) -> set[str]:
    """Just the concrete tool names for the skill -- used for the exact-tool
    tier, where a title/description word must NOT be able to count as a tool."""
    out: set[str] = set()
    if topic_item is not None:
        for s in (getattr(topic_item, "tech_stack", None) or []):
            out |= _tokens(str(s))
    # A topic with no tech_stack still has a title that may itself name a tool
    # ("Redis", "Kafka"), so fold the title's tokens in as a fallback only.
    if not out:
        out = _tokens(str(getattr(topic_item, "title", "") or "") or tested_skill)
    return out


# ---------------------------------------------------------------------------
# Step 2 -- search the resume for a genuine match
# ---------------------------------------------------------------------------
def find_resume_match(
    *,
    resume_json: dict | None,
    tested_skill: str,
    topic_item: Any | None = None,
) -> ResumeMatch:
    """Best genuine project match for the skill under test, or _NO_MATCH.

    Priority order per the spec: exact tool/library, then technique/category
    family, then domain implication. Only NAMED projects are eligible -- work
    history is intentionally excluded, because Branch A must name a project
    title as it appears on the resume and "Backend Engineer at Acme" is a role,
    not a thing the candidate can be asked implementation questions about.
    """
    if not isinstance(resume_json, dict) or not resume_json:
        return _NO_MATCH

    try:
        from interview.tech.brief_extraction import RawResumeJSON  # noqa: PLC0415
        raw = RawResumeJSON.model_validate(resume_json)
    except Exception:
        logger.info("[RESUME_MATCH] resume JSON did not validate -- Branch B")
        return _NO_MATCH

    skill_tokens, skill_families = _skill_surface(topic_item, tested_skill)
    skill_tech = _tech_surface(topic_item, tested_skill)
    if not skill_tokens and not skill_families:
        return _NO_MATCH

    best = _NO_MATCH
    for proj in raw.get_projects():
        title = str(proj.resolved_title or "").strip()
        if not title or title.lower() == "unnamed project":
            # Branch A must name the project verbatim. A project with no real
            # title cannot satisfy that, so it is not eligible however well it
            # otherwise matches.
            continue

        tech = [str(t).strip() for t in proj.resolved_tech if str(t).strip()]
        desc = str(proj.full_description or "")
        tech_tokens = _tokens(" ".join(tech))
        desc_tokens = _tokens(desc)
        proj_families = _families_for(f"{title} {' '.join(tech)} {desc}")

        cand = _score_project(
            title=title,
            tech=tech,
            desc=desc,
            tech_tokens=tech_tokens,
            desc_tokens=desc_tokens,
            proj_families=proj_families,
            skill_tokens=skill_tokens,
            skill_tech=skill_tech,
            skill_families=skill_families,
            tested_skill=tested_skill,
        )
        if cand.confidence > best.confidence:
            best = cand

    if best.is_match:
        logger.info(
            "[RESUME_MATCH] MATCH tier=%s conf=%.2f | skill=%r -> project=%r | evidence=%s",
            best.tier, best.confidence, best.skill[:60], best.project_title, best.evidence,
        )
        return best

    logger.info(
        "[RESUME_MATCH] no genuine match (best conf=%.2f tier=%s) | skill=%r -- Branch B",
        best.confidence, best.tier, (tested_skill or "")[:60],
    )
    return _NO_MATCH


def _score_project(
    *,
    title: str,
    tech: list[str],
    desc: str,
    tech_tokens: set[str],
    desc_tokens: set[str],
    proj_families: set[str],
    skill_tokens: set[str],
    skill_tech: set[str],
    skill_families: set[str],
    tested_skill: str,
) -> ResumeMatch:
    """Confidence for one project against the skill. Higher tier wins; within a
    tier, corroborating description overlap breaks the tie."""
    title_tokens = _tokens(title)
    project_all = tech_tokens | desc_tokens | title_tokens

    # -- Tier 1: exact tool/library. The skill's own tool appears in the
    # project's tech list (or its title/description). Strongest evidence there is.
    # Bare language names are excluded: see _GENERIC_LANGUAGE_TOKENS.
    _eligible_tech = skill_tech - _GENERIC_LANGUAGE_TOKENS
    exact = _eligible_tech & (tech_tokens | title_tokens)
    if not exact:
        exact = _eligible_tech & desc_tokens
    if exact:
        conf = _TIER_BASE["exact_tool"] + 0.06 * min(3, len(exact))
        # Corroboration: the described work also shares vocabulary with the
        # skill, so this isn't just the tool name sitting in a tech list
        # detached from anything the project actually did.
        corrob = (skill_tokens & desc_tokens) - exact
        if corrob:
            conf += 0.08
        return ResumeMatch(
            project_title=title, skill=tested_skill, confidence=min(0.98, conf),
            tier="exact_tool",
            evidence=f"exact tool match on {', '.join(sorted(exact))}",
            tech=tech, description=desc, metrics=_extract_metrics(desc),
        )

    # -- Tier 2: technique/category family. "Deep Learning" <-> a project using
    # LSTM. Requires the family to be shared AND real description overlap --
    # family membership alone is too coarse to name a project on.
    shared_families = skill_families & proj_families
    if shared_families:
        conf = _TIER_BASE["technique"] + 0.09 * min(3, len(shared_families))
        overlap = skill_tokens & project_all
        conf += 0.055 * min(4, len(overlap))
        return ResumeMatch(
            project_title=title, skill=tested_skill, confidence=min(0.95, conf),
            tier="technique",
            evidence=(
                f"technique family {', '.join(sorted(shared_families))}"
                + (f" (shared: {', '.join(sorted(overlap)[:4])})" if overlap else "")
            ),
            tech=tech, description=desc, metrics=_extract_metrics(desc),
        )

    # -- Tier 3: domain implication. No exact tool and no known family -- only
    # raw vocabulary overlap between the skill and what the project describes.
    # This tier exists for skills outside _TECHNIQUE_FAMILIES, and it is
    # deliberately hard to clear: a single shared content word is a buzzword
    # collision, which the spec says to treat as no-match.
    overlap = skill_tokens & project_all
    if len(overlap) >= 3:
        conf = _TIER_BASE["domain"] + 0.11 * min(4, len(overlap))
        return ResumeMatch(
            project_title=title, skill=tested_skill, confidence=min(0.88, conf),
            tier="domain",
            evidence=f"domain overlap on {', '.join(sorted(overlap)[:4])}",
            tech=tech, description=desc, metrics=_extract_metrics(desc),
        )

    return ResumeMatch(
        project_title=title, skill=tested_skill,
        confidence=0.11 * len(overlap), tier="none",
        evidence="no genuine overlap", tech=tech, description=desc,
    )


# ---------------------------------------------------------------------------
# Step 3 / Branch A -- the resume-grounded directive block.
#
# This REPLACES the signal's mechanism-probe framing for this one turn. It does
# not append to it: the spec forbids blending the branches, and an appended
# block would leave both "drill into their answer" and "ask about their project"
# live in the same prompt, which produces a compound question.
# ---------------------------------------------------------------------------
def render_resume_grounded_probe(match: ResumeMatch, *, signal: str | None = None) -> str:
    """Branch A directive: name the project, verify one specific thing in it."""
    tech_line = ", ".join(match.tech[:8]) if match.tech else "(none listed)"
    desc = match.description.strip()
    desc_line = (desc[:400].rstrip() + "…") if len(desc) > 400 else (desc or "(no description on resume)")

    if match.metrics:
        metric_rule = (
            f"STATED METRICS (verbatim from their resume — these are the ONLY numbers you may "
            f"cite): {', '.join(match.metrics)}\n"
            f"  You may name one of these and ask how it was derived, measured, or validated.\n"
            f"  Do NOT alter, round, or combine them, and do NOT introduce any other number.\n"
            f"  Only reach for a metric if it actually belongs to the skill being tested. If the\n"
            f"  only stated numbers measure a DIFFERENT dimension of the project than the skill\n"
            f"  under test (e.g. the skill is retrieval quality but the only number is a latency),\n"
            f"  do NOT bend the question toward that number just because it exists — ask about a\n"
            f"  decision, tradeoff, or edge case in the skill instead. Chasing an off-topic metric\n"
            f"  is topic drift, which this directive forbids."
        )
    else:
        metric_rule = (
            "STATED METRICS: none on the resume for this project.\n"
            "  You therefore may NOT cite any number at all. If you want to go at measurement, ask "
            "THEM to supply their own figure ('what did that get you?', 'how did you know it "
            "worked?') — never assert a metric they did not claim."
        )

    return f"""\
FOLLOW-UP SOURCE: RESUME PROJECT (this turn is resume-grounded, not answer-grounded)

The skill you are testing is something this candidate claims to have actually BUILT. Their
resume names a project that genuinely exercises it, so the highest-value question this turn
is a verification question about that project — not another mechanism drill on their answer.

  PROJECT (use this title EXACTLY as written, verbatim): "{match.project_title}"
  TECH LISTED ON IT: {tech_line}
  WHAT THE RESUME SAYS IT WAS: {desc_line}
  SKILL BEING TESTED (do not drift off it): {match.skill}
  WHY THIS MATCHED: {match.evidence}

{metric_rule}

ASK EXACTLY ONE OF THESE FOUR SHAPES — pick the one this project best supports:
  1. IMPLEMENTATION DECISION — a specific choice inside the build, and why that way.
  2. METRIC DERIVATION — how a stated number was measured, validated, or trusted.
  3. TRADEOFF / ALTERNATIVE — what else they considered and what the choice cost them.
  4. FAILURE MODE / EDGE CASE — what broke, degraded, or had to be handled.

GIVE THE QUESTION ONE CONCRETE ANCHOR — NOT A BARE ASK:
  A question that's just "on your {match.project_title}, what tradeoffs did you consider?"
  is too thin — it doesn't say what part of the project you're even asking about, so it reads
  as generic despite naming the project. Fold in ONE piece of real detail from TECH LISTED ON
  IT / WHAT THE RESUME SAYS IT WAS / STATED METRICS above — the specific tool, the scale
  number, the other piece of the pipeline it fed into — so the question is clearly about a
  real system, not an abstract prompt with a project name pasted onto it.
    Too bare:   "On your InsightRAG project, what tradeoffs did you consider with reranking?"
    Right size: "On your InsightRAG project, you reranked before generation over twelve
                 thousand documents — what made you add that step instead of relying on
                 Pinecone's similarity search alone?"
  One added clause of real detail is enough. Do NOT stack a second constraint on top of it,
  and do NOT restate the whole project description — that tips it back into too long.

HARD REQUIREMENTS:
  - Name the project explicitly. "{match.project_title}" must appear in your question.
    Say the name the way a person says it in conversation — "on your {match.project_title}
    project", "back in {match.project_title}". Do NOT wrap it in quotation marks: this is
    spoken aloud, and quoting the title makes it sound like you're reading off a document.
  - Stay on the SAME skill the thread has been testing ({match.skill}). Naming their project
    is a change of GROUNDING, never a change of subject.
  - Only someone who actually built it can answer. If a candidate who merely read the resume
    line could answer it, the question is too generic — make it sharper.
  - ONE question. One question mark. No compound "and what about..." tail.
  - HARD LENGTH CAP: reaction + question together, under 40 words. The one concrete anchor
    above may use a few of those words — that's what it's for — but nothing past it. If you
    notice you're describing the whole project instead of asking about one piece of it, cut
    back to the anchor and the question.
  - Keep the interviewer voice already established: a "You mentioned X —" / "You said you'd
    reach for X —" framing, redirected at the project instead of at their last sentence.

FORBIDDEN THIS TURN:
  - Any tech, metric, or detail not present in the resume block above. Never invent one.
  - "Tell me about your project" / "walk me through the project" — generic, unverifiable.
  - Behavioural framing: no "tell me about a time", no "how did you handle the team".
    This stays technical and verifiable.
  - Asking them to restate what the resume already says. Probe a decision, a number, or an
    edge case INSIDE the project.
  - Do NOT also run the answer-drill probe from the signal — that is the other branch, and
    blending the two produces a two-part question. This turn is the project question only.
"""


# ---------------------------------------------------------------------------
# Downstream schema block -- logging/analytics fields carried on the eval result.
# ---------------------------------------------------------------------------
def follow_up_provenance(match: ResumeMatch | None) -> dict[str, Any]:
    """The three fields the spec adds to the follow-up decision record.

    Always all three keys, always present on every PROBE turn, so a consumer
    never has to distinguish "Branch B" from "field missing".
    """
    if match is not None and match.is_match:
        return {
            "follow_up_source": "resume_project",
            "referenced_project": match.project_title,
            "skill_matched": match.skill,
        }
    return {
        "follow_up_source": "concept_probe",
        "referenced_project": None,
        "skill_matched": None,
    }
