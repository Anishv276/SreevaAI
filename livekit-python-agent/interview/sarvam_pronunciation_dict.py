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


async def _validate_sarvam_api_key(api_key: str) -> bool:
    """Test if the Sarvam API key is valid by doing a lightweight request."""
    if not api_key or len(api_key) < 10:
        logger.warning("[SARVAM_DICT] API key missing or too short (len=%d)", len(api_key or ""))
        return False

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Try a simple GET to the list endpoint -- doesn't require a dict, just validates auth
            resp = await client.get(
                _BASE_URL,
                headers={"api-subscription-key": api_key},
            )
            if resp.status_code == 200:
                logger.info("[SARVAM_DICT] API key validated (200 OK)")
                return True
            elif resp.status_code == 401:
                logger.error("[SARVAM_DICT] API key is invalid or expired (401 Unauthorized)")
                return False
            elif resp.status_code == 400:
                logger.warning("[SARVAM_DICT] API key validation returned 400 — might be quota/plan limit")
                return False  # ponytail: 400 on list = auth or quota issue
            else:
                logger.warning("[SARVAM_DICT] API key validation returned %d (unexpected)", resp.status_code)
                return False
    except Exception as e:
        logger.error("[SARVAM_DICT] API key validation failed: %s", e)
        return False

# -- Base dictionary: universal tech terms all interviews share -----------------
# These are words Sarvam's engine consistently mispronounces even with
# enable_preprocessing on. Human-curated, rarely changes.
_BASE_PRONUNCIATIONS: dict[str, str] = {
    # Critical infrastructure
    "kubernetes":    "koo ber neh teez",
    "kafka":         "kaf kah",
    "prometheus":    "proh mee thee us",
    "terraform":     "terra form",
    # Essential databases
    "postgresql":    "post gres Q L",
    "mongodb":       "mongo D B",
    "dynamodb":      "dynamo D B",
    # ML / AI core
    "pytorch":       "pie torch",
    "numpy":         "num pie",
    "sklearn":       "S K learn",
    "langchain":     "lang chain",
    "openai":        "open A I",
    # Popular frameworks
    "fastapi":       "fast A P I",
    "django":        "jango",
    "nextjs":        "next J S",
    "nestjs":        "nest J S",
    "vuejs":         "vue J S",
    # Key platforms
    "vercel":        "ver sel",
    "heroku":        "heh roh koo",
    "datadog":       "data dog",
    "jira":          "jee rah",
    # Formats / protocols
    "graphql":       "graph Q L",
    "oauth":         "oh auth",
    "yaml":          "yam ul",
    # Common tech terms
    "devops":        "dev ops",
    "n8n":           "n eight n",
    "vscode":        "V S code",
    "regex":         "reg ex",
    # Cloud
    "azure":         "ay zhur",
    "lambda":        "lam dah",
}

# Conversational interviews are SALES interviews (interview/conversational/* --
# quota, deals, objections, MEDDIC). A salesperson never says "kubernetes" or
# "pytorch", so tech terms waste dict slots here. This is the sales vocabulary
# Sarvam mispronounces -- CRM tools + qualification methodologies. Terms Sarvam
# already reads fine (crm, saas, roi) are left out on purpose, same rule as
# _SARVAM_READS_OK. The prompt already spells acronyms ("C R M") -- this backs
# that up at the TTS layer for the ones the LLM leaves whole.
_CONVERSATIONAL_BASE_PRONUNCIATIONS: dict[str, str] = {
    # CRM / sales-engagement tools
    "salesforce":  "sales force",
    "hubspot":     "hub spot",
    "outreach":    "out reach",
    "salesloft":   "sales loft",
    "gong":        "gong",
    "chorus":      "kor us",
    "apollo":      "ah pol oh",
    "zoominfo":    "zoom info",
    "clari":       "klar ee",
    "pipedrive":   "pipe drive",
    # Qualification methodologies
    "meddic":      "med ick",
    "meddpicc":    "med pick",
    "bant":        "bant",
    "spin":        "spin",
    # Sales-role acronyms Sarvam garbles
    "sdr":         "S D R",
    "bdr":         "B D R",
    "ae":          "A E",
    "revops":      "rev ops",
    "arr":         "A R R",
    "mrr":         "M R R",
    "mql":         "M Q L",
    "sql":         "S Q L",  # sales-qualified lead here, not the database
    "icp":         "I C P",
}

# Per-mode cap on the merged (base + session) dict. Sarvam's hard limit is 100.
# Tech fills the full 100; conversational reserves fewer so it stays lean.
_MODE_WORD_CAP: dict[str, int] = {"tech": 100, "conversational": 80}


def _base_pronunciations_for(mode: str) -> dict[str, str]:
    """Base pronunciation table for the interview mode. Tech gets the infra/ML
    table; conversational (sales) gets the sales-tool/methodology table."""
    if mode == "conversational":
        return _CONVERSATIONAL_BASE_PRONUNCIATIONS
    return _BASE_PRONUNCIATIONS


def _word_cap_for(mode: str) -> int:
    return _MODE_WORD_CAP.get(mode, 100)


# -- Auto-pronunciation engine --------------------------------------------------
# For any word extracted from a candidate's resume/JD that is NOT in the base
# dict, we auto-generate a pronunciation. Rules applied in order:

# Words Sarvam reads correctly without help -- skip them
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

    # Word is all-lowercase or mixed -- let Sarvam handle it
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


# -- Sarvam API helpers ---------------------------------------------------------

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
            # List of dicts with {id/dictionary_id} or list of strings
            return [
                (d.get("dictionary_id") or d.get("id") or "") if isinstance(d, dict) else str(d)
                for d in data
            ]
        dicts = data.get("dictionaries", [])
        return [
            (d.get("dictionary_id") or d.get("id") or "") if isinstance(d, dict) else str(d)
            for d in dicts
        ]


async def _create_dict(api_key: str, pronunciations: dict[str, str]) -> str:
    """Create a pronunciation dict using multipart (Sarvam's required format)."""
    payload = _build_payload(pronunciations)
    async with httpx.AsyncClient(timeout=30) as client:
        logger.debug(
            "[SARVAM_DICT_DEBUG] Creating dict with %d pronunciations | payload_size=%d bytes",
            len(pronunciations), len(payload)
        )
        try:
            # ponytail: Sarvam requires multipart form-data, not raw JSON.
            # POST returns 400 with JSON content-type; 200 with form upload.
            resp = await client.post(
                _BASE_URL,
                headers={"api-subscription-key": api_key},
                files={"file": ("pronunciations.json", io.BytesIO(payload), "application/json")},
            )
            logger.debug("[SARVAM_DICT_DEBUG] POST (multipart) status=%d", resp.status_code)
            resp.raise_for_status()
        except Exception as e:
            logger.error("[SARVAM_DICT] POST failed: %s | status=%s | body=%s",
                        e, getattr(resp, 'status_code', '?'), getattr(resp, 'text', '')[:500])
            raise

        data = resp.json()
        # Sarvam API returns either {"dictionary_id": "..."} or {"id": "..."}
        if isinstance(data, dict):
            dict_id = data.get("dictionary_id") or data.get("id") or ""
        else:
            dict_id = str(data or "")
        if not dict_id:
            raise RuntimeError(f"Sarvam create dict returned no ID: {data!r}")
        return dict_id


async def _update_dict(api_key: str, dict_id: str, pronunciations: dict[str, str]) -> None:
    """Update a pronunciation dict using multipart (Sarvam's required format)."""
    payload = _build_payload(pronunciations)
    async with httpx.AsyncClient(timeout=30) as client:
        logger.debug(
            "[SARVAM_DICT_DEBUG] Updating dict %s with %d pronunciations",
            dict_id, len(pronunciations)
        )
        try:
            # ponytail: Sarvam requires multipart form-data, not raw JSON.
            # PUT returns 400 with JSON content-type; 200 with form upload.
            resp = await client.put(
                _BASE_URL,
                params={"dict_id": dict_id},
                headers={"api-subscription-key": api_key},
                files={"file": ("pronunciations.json", io.BytesIO(payload), "application/json")},
            )
            logger.debug("[SARVAM_DICT_DEBUG] PUT (multipart) status=%d", resp.status_code)
            resp.raise_for_status()
        except Exception as e:
            logger.error("[SARVAM_DICT] PUT failed: %s | status=%s | body=%s",
                        e, getattr(resp, 'status_code', '?'), getattr(resp, 'text', '')[:500])
            raise


async def _delete_dict(api_key: str, dict_id: str) -> None:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.delete(
            _BASE_URL,
            params={"dict_id": dict_id},
            headers={"api-subscription-key": api_key},
        )
        # 404 is fine -- already deleted
        if resp.status_code not in (200, 204, 404):
            resp.raise_for_status()


# -- Public API -----------------------------------------------------------------

async def get_or_create_base_dict_id(api_key: str, mode: str = "tech") -> Optional[str]:
    """Return the base pronunciation dict ID for the interview mode, creating it
    if needed.

    Tech and conversational (sales) have different base tables, so they cache
    under different env keys -- one base dict per mode, reused indefinitely.
    If account is at dict limit, skip creation — session dicts will handle it.
    """
    base_pronunciations = _base_pronunciations_for(mode)
    env_key = _BASE_ENV_KEY if mode == "tech" else f"{_BASE_ENV_KEY}_{mode.upper()}"

    existing = os.environ.get(env_key, "").strip()
    if existing:
        return existing

    # Validate API key first
    if not await _validate_sarvam_api_key(api_key):
        logger.warning("[SARVAM_DICT] API key validation failed — skipping base dict creation")
        return None

    try:
        # Check if account is at dict limit before trying to create
        existing_ids = await _list_dicts(api_key)
        if len(existing_ids) >= 10:
            logger.info("[SARVAM_DICT] Account at 10-dict limit (%d dicts) — skipping base dict creation, will use session dicts",
                       len(existing_ids))
            return None

        dict_id = await _create_dict(api_key, base_pronunciations)
        os.environ[env_key] = dict_id
        logger.info("[SARVAM_DICT] Created %s base dict %s (%d words)", mode, dict_id, len(base_pronunciations))
        return dict_id
    except Exception as exc:
        logger.warning("[SARVAM_DICT] Failed to create base dict: %s (type=%s) — interviews continue without pronunciation dict",
                      exc, type(exc).__name__, exc_info=True)
        return None


async def get_session_dict_id(
    api_key: str,
    keywords: list[str],
    *,
    base_dict_id: Optional[str] = None,
    mode: str = "tech",
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

    # Merge: mode's base first, session words override on conflict, cap by mode
    base_pronunciations = _base_pronunciations_for(mode)
    cap = _word_cap_for(mode)
    merged = {**base_pronunciations}
    for k, v in session_words.items():
        if k not in merged:
            merged[k] = v
        if len(merged) >= cap:
            break

    logger.info(
        "[SARVAM_DICT] Session dict (%s): %d base + %d session = %d merged words (cap %d)",
        mode, len(base_pronunciations), len(session_words), len(merged), cap,
    )

    try:
        # If we have a base dict and merged set fits, just update it in-place.
        # This avoids consuming extra dict slots when session words are few.
        if base_dict_id and len(merged) <= cap:
            await _update_dict(api_key, base_dict_id, merged)
            logger.info("[SARVAM_DICT] Updated base dict %s with session words", base_dict_id)
            return base_dict_id

        # Need a new dict slot -- check if we're at the cap
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
        logger.warning("[SARVAM_DICT] Session dict failed: %s (exc_type=%s) — falling back to base dict", exc, type(exc).__name__, exc_info=True)
        return base_dict_id


# -- Legacy compat (keep old callers working) -----------------------------------

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
