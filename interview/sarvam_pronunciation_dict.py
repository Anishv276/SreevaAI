"""
sarvam_pronunciation_dict.py
============================
Two-dict strategy for Sarvam bulbul:v3 pronunciation.

DICT 1 — Base dict (SARVAM_DICT_ID env var)
  Permanent. Contains infra/framework terms that are universal across all
  interviews. Created once per deployment, never changed at runtime.
  ~80 words of shared tech vocabulary.

DICT 2 — Session dict (created fresh per interview, from candidate resume/JD)
  Per-session. Contains words extracted from this specific candidate's resume
  and job description. Auto-generated pronunciations — no human maintenance.
  Created at session start, reused for the session, then abandoned (Sarvam
  auto-cleans dicts older than 30 days; we also clean up on next session start
  if we hit the 10-dict cap).

Why two dicts:
  Sarvam hard limit is 100 words per dict, 10 dicts per account, 1 per call.
  We can't merge session words into the base dict mid-session because TTS calls
  are already in flight. Instead we pick whichever dict is more useful for this
  session: if the candidate has lots of unique tech terms, prefer the session
  dict (it contains both base + session words merged); otherwise use base dict.

Auto-pronunciation rules (no human needed):
  - ALL-CAPS 3-6 letters: "RAG" → "R A G", "CICD" → "C I C D"
  - Known-pronunciation table for terms Sarvam consistently gets wrong
  - CamelCase terms: passed as-is (the client-side normalizer handles splitting)
  - Unknown words: passed through (Sarvam's enable_preprocessing handles most)
"""
from __future__ import annotations

import io
import json
import logging
import os
import re
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.sarvam.ai/text-to-speech/pronunciation-dictionary"

# ── Base dictionary: universal tech terms all interviews share ─────────────────
# These are words Sarvam's engine consistently mispronounces even with
# enable_preprocessing on. Human-curated, rarely changes.
_BASE_PRONUNCIATIONS: dict[str, str] = {
    # Infrastructure
    "kubernetes":    "koo ber neh teez",
    "kubectl":       "kube control",
    "nginx":         "engine x",
    "traefik":       "traf ik",
    "istio":         "iss tee oh",
    "kafka":         "kaf kah",
    "rabbitmq":      "rabbit M Q",
    "prometheus":    "proh mee thee us",
    "grafana":       "grah fah nah",
    "kibana":        "kih bah nah",
    "terraform":     "terra form",
    "ansible":       "ann sih bul",
    # Databases
    "postgresql":    "post gres Q L",
    "mysql":         "my S Q L",
    "sqlite":        "S Q lite",
    "mongodb":       "mongo D B",
    "couchdb":       "couch D B",
    "dynamodb":      "dynamo D B",
    "supabase":      "soo pah base",
    "prisma":        "priz mah",
    # ML / AI libraries
    "pytorch":       "pie torch",
    "scipy":         "sigh pie",
    "numpy":         "num pie",
    "matplotlib":    "mat plot lib",
    "sklearn":       "S K learn",
    "scikit":        "sigh kit",
    "spacy":         "spay see",
    "tesseract":     "tess er act",
    "lora":          "low rah",
    "qlora":         "Q low rah",
    # Frameworks / libraries
    "fastapi":       "fast A P I",
    "django":        "jango",
    "nextjs":        "next J S",
    "nuxtjs":        "nuxt J S",
    "nestjs":        "nest J S",
    "vuejs":         "vue J S",
    "svelte":        "svelt",
    "langchain":     "lang chain",
    "langgraph":     "lang graph",
    "llamaindex":    "llama index",
    "openai":        "open A I",
    "huggingface":   "hugging face",
    "shadcn":        "shad C N",
    "tailwindcss":   "tailwind C S S",
    # Tools / platforms
    "vercel":        "ver sel",
    "netlify":       "net lih fy",
    "heroku":        "heh roh koo",
    "datadog":       "data dog",
    "jira":          "jee rah",
    "confluence":    "con floo ence",
    "swagger":       "swag er",
    "webpack":       "web pack",
    "vite":          "veet",
    "esbuild":       "E S build",
    "turborepo":     "turbo repo",
    "pnpm":          "P N P M",
    "livekit":       "live kit",
    "twilio":        "twil ee oh",
    "zapier":        "zay pee er",
    "notion":        "no shun",
    "heyreach":      "hey reach",
    # Protocols / formats
    "graphql":       "graph Q L",
    "grpc":          "G R P C",
    "oauth":         "oh auth",
    "yaml":          "yam ul",
    "toml":          "tom ul",
    # Common tech words Sarvam gets wrong
    "pipeline":      "pipe line",
    "nosql":         "no sequel",
    "devops":        "dev ops",
    "devsecops":     "dev sec ops",
    "vscode":        "V S code",
    "nvim":          "N vim",
    "regex":         "reg ex",
    "cron":          "kron",
    "n8n":           "n eight n",
    "make.com":      "make dot com",
    "n8n.io":        "n eight n dot io",
    # Cloud
    "azure":         "ay zhur",
    "lambda":        "lam dah",
}

# ── Auto-pronunciation engine ──────────────────────────────────────────────────
# For any word extracted from a candidate's resume/JD that is NOT in the base
# dict, we auto-generate a pronunciation. Rules applied in order:

# Words Sarvam reads correctly without help — skip them
_SARVAM_READS_OK: frozenset[str] = frozenset({
    "sql", "aws", "gcp", "git", "ssh", "pdf", "url", "http", "html", "css",
    "json", "yaml", "rest", "crud", "cors", "uuid", "gpu", "cpu", "ram",
    "api", "sdk", "cli", "ide", "ui", "ux", "ai", "ml", "cv",
})

# Words where we know the correct pronunciation explicitly
_KNOWN_PRONUNCIATIONS: dict[str, str] = {
    "rag":       "rag",
    "llm":       "L L M",
    "llms":      "L L M s",
    "nlp":       "N L P",
    "cicd":      "C I C D",
    "orm":       "O R M",
    "cdn":       "C D N",
    "dns":       "D N S",
    "jwt":       "J W T",
    "k8s":       "kubernetes",
    "eks":       "E K S",
    "ecs":       "E C S",
    "rds":       "R D S",
    "s3":        "S 3",
    "ec2":       "E C 2",
    "gke":       "G K E",
    "aks":       "A K S",
    "mlops":     "M L ops",
    "llmops":    "L L M ops",
    "genai":     "gen A I",
    "langsmith": "lang smith",
    "pinecone":  "pine cone",
    "qdrant":    "Q drant",
    "weaviate":  "wee vee ate",
    "chroma":    "kro mah",
    "milvus":    "mil vus",
    "autogen":   "auto gen",
    "crewai":    "crew A I",
    "dspy":      "D S Pie",
    "pydantic":  "pie dan tick",
    "celery":    "sel er ee",
    "redis":     "red is",
    "elasticsearch": "elastic search",
    "opensearch": "open search",
    "airflow":   "air flow",
    "prefect":   "pre fect",
    "dagster":   "dag ster",
    "dbt":       "D B T",
    "looker":    "look er",
    "tableau":   "tab loh",
    "powerbi":   "power B I",
    "snowflake": "snow flake",
    "databricks": "data bricks",
    "pyspark":   "pie spark",
    "hadoop":    "hay doop",
    "hive":      "hive",
    "flink":     "flink",
    "trino":     "tree no",
    "clickhouse": "click house",
    "druid":     "droo id",
    "nifi":      "ni fi",
    "debezium":  "de bee zee um",
    "keycloak":  "key cloak",
    "oauth2":    "oh auth 2",
    "saml":      "sam ul",
    "ldap":      "L dap",
    "scim":      "skim",
    "webauthn":  "web auth N",
    "grpc":      "G R P C",
    "protobuf":  "proto buf",
    "avro":      "av roh",
    "parquet":   "par kay",
    "orc":       "orc",
}

# ALL-CAPS acronym pattern: 2–6 uppercase letters
_CAPS_RE = re.compile(r"^([A-Z]{2,6})(s?)$")


def _auto_pronounce(word: str) -> Optional[str]:
    """Generate a pronunciation for a single word with no known entry.

    Returns None if Sarvam should handle it as-is (no entry needed).
    """
    key = word.lower()

    # Skip words Sarvam reads fine
    if key in _SARVAM_READS_OK:
        return None

    # Check known-pronunciation table first
    if key in _KNOWN_PRONUNCIATIONS:
        return _KNOWN_PRONUNCIATIONS[key]

    # Check base dict
    if key in _BASE_PRONUNCIATIONS:
        return None  # already in base dict, no session entry needed

    # ALL-CAPS acronym: "RAG" → "R A G", "APIs" → "A P I s"
    m = _CAPS_RE.match(word)
    if m:
        letters = m.group(1)
        plural = m.group(2)
        if len(letters) >= 3:
            spaced = " ".join(letters)
            return (spaced + " " + plural) if plural else spaced

    # Word is all-lowercase or mixed — let Sarvam handle it
    return None


def build_session_pronunciations(keywords: list[str]) -> dict[str, str]:
    """Generate a pronunciation dict from candidate resume/JD keywords.

    Takes the raw keyword list extracted from the candidate's resume and JD,
    filters to words that need a custom pronunciation, auto-generates the
    pronunciation, and returns up to 100 entries (Sarvam limit).

    This requires zero human input — works for any tech stack, any candidate.
    """
    result: dict[str, str] = {}

    for word in keywords:
        word = word.strip()
        if not word or len(word) > 40:
            continue
        key = word.lower()
        if key in result:
            continue

        pronunciation = _auto_pronounce(word)
        if pronunciation:
            result[key] = pronunciation

        if len(result) >= 100:
            break

    return result


# ── Sarvam API helpers ─────────────────────────────────────────────────────────

_BASE_ENV_KEY = "SARVAM_DICT_ID"


def _build_payload(pronunciations: dict[str, str]) -> bytes:
    return json.dumps({
        "pronunciations": {
            "en-IN": pronunciations,
            "hi-IN": {},
        }
    }, ensure_ascii=False).encode("utf-8")


async def _list_dicts(api_key: str) -> list[str]:
    """Return list of existing dict_ids for this account."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            _BASE_URL,
            headers={"api-subscription-key": api_key},
        )
        resp.raise_for_status()
        data = resp.json()
        # Response is either {"dictionaries": [...]} or a list directly
        if isinstance(data, list):
            return [d.get("dictionary_id") or d.get("id") or "" for d in data]
        dicts = data.get("dictionaries", [])
        return [d.get("dictionary_id") or d.get("id") or "" for d in dicts]


async def _create_dict(api_key: str, pronunciations: dict[str, str]) -> str:
    payload = _build_payload(pronunciations)
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            _BASE_URL,
            headers={"api-subscription-key": api_key},
            files={"file": ("pronunciations.json", io.BytesIO(payload), "application/json")},
        )
        resp.raise_for_status()
        return resp.json()["dictionary_id"]


async def _update_dict(api_key: str, dict_id: str, pronunciations: dict[str, str]) -> None:
    payload = _build_payload(pronunciations)
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.put(
            _BASE_URL,
            params={"dict_id": dict_id},
            headers={"api-subscription-key": api_key},
            files={"file": ("pronunciations.json", io.BytesIO(payload), "application/json")},
        )
        resp.raise_for_status()


async def _delete_dict(api_key: str, dict_id: str) -> None:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.delete(
            _BASE_URL,
            params={"dict_id": dict_id},
            headers={"api-subscription-key": api_key},
        )
        # 404 is fine — already deleted
        if resp.status_code not in (200, 204, 404):
            resp.raise_for_status()


# ── Public API ─────────────────────────────────────────────────────────────────

async def get_or_create_base_dict_id(api_key: str) -> Optional[str]:
    """Return the base pronunciation dict ID, creating it if needed.

    The base dict contains universal tech terms shared across all sessions.
    It is created once and reused indefinitely (env var cached).
    """
    existing = os.environ.get(_BASE_ENV_KEY, "").strip()
    if existing:
        return existing
    try:
        dict_id = await _create_dict(api_key, _BASE_PRONUNCIATIONS)
        os.environ[_BASE_ENV_KEY] = dict_id
        logger.info("[SARVAM_DICT] Created base dict %s (%d words)", dict_id, len(_BASE_PRONUNCIATIONS))
        return dict_id
    except Exception as exc:
        logger.warning("[SARVAM_DICT] Failed to create base dict: %s", exc)
        return None


async def get_session_dict_id(
    api_key: str,
    keywords: list[str],
    *,
    base_dict_id: Optional[str] = None,
) -> Optional[str]:
    """Build a per-session pronunciation dict from candidate resume/JD keywords.

    Strategy:
    1. Auto-generate pronunciations for all keywords.
    2. Merge with base pronunciations (session words take priority on conflict).
    3. If the merged set fits in 100 words, update the base dict in-place and
       return its ID (saves a dict slot).
    4. If session words would overflow or conflict, create a new dict for this
       session. If we're at the 10-dict cap, delete the oldest non-base dict
       first to free a slot.
    5. Returns None on any error — TTS degrades gracefully without dict_id.

    The session dict lives only for the interview duration. We don't clean it
    up immediately (fire-and-forget), relying on Sarvam's 30-day auto-expiry
    and next-session cleanup.
    """
    if not keywords:
        return base_dict_id

    session_words = build_session_pronunciations(keywords)
    if not session_words:
        logger.info("[SARVAM_DICT] No session-specific pronunciations needed")
        return base_dict_id

    # Merge: base first, session words override on conflict, cap at 100
    merged = {**_BASE_PRONUNCIATIONS}
    for k, v in session_words.items():
        if k not in merged:
            merged[k] = v
        if len(merged) >= 100:
            break

    logger.info(
        "[SARVAM_DICT] Session dict: %d base + %d session = %d merged words",
        len(_BASE_PRONUNCIATIONS), len(session_words), len(merged),
    )

    try:
        # If we have a base dict and merged set fits, just update it in-place.
        # This avoids consuming extra dict slots when session words are few.
        if base_dict_id and len(merged) <= 100:
            await _update_dict(api_key, base_dict_id, merged)
            logger.info("[SARVAM_DICT] Updated base dict %s with session words", base_dict_id)
            return base_dict_id

        # Need a new dict slot — check if we're at the cap
        existing_ids = await _list_dicts(api_key)
        non_base = [d for d in existing_ids if d and d != base_dict_id]

        if len(existing_ids) >= 10 and non_base:
            # Delete the first non-base dict to free a slot
            victim = non_base[0]
            await _delete_dict(api_key, victim)
            logger.info("[SARVAM_DICT] Freed slot by deleting old session dict %s", victim)

        dict_id = await _create_dict(api_key, merged)
        logger.info("[SARVAM_DICT] Created session dict %s (%d words)", dict_id, len(merged))
        return dict_id

    except Exception as exc:
        logger.warning("[SARVAM_DICT] Session dict failed (%s) — falling back to base dict", exc)
        return base_dict_id


# ── Legacy compat (keep old callers working) ───────────────────────────────────

async def get_or_create_dict_id(api_key: str) -> Optional[str]:
    """Backward-compat wrapper. Returns base dict ID."""
    return await get_or_create_base_dict_id(api_key)


async def sync_pronunciations(api_key: str, dict_id: str, extra: dict[str, str] | None = None) -> None:
    """Push the full base set (plus any extras) to an existing dict."""
    merged = {**_BASE_PRONUNCIATIONS, **(extra or {})}
    if len(merged) > 100:
        merged = dict(list(merged.items())[:100])
    try:
        await _update_dict(api_key, dict_id, merged)
    except Exception as exc:
        logger.warning("[SARVAM_DICT] sync_pronunciations failed: %s", exc)
