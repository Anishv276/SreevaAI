"""
sarvam_pronunciation_dict.py
============================
Manages a Sarvam pronunciation dictionary for bulbul:v3.

On first run (no SARVAM_DICT_ID env var) it creates a new dictionary from
_PRONUNCIATIONS and persists the returned dict_id to the env var so future
process restarts reuse the same dictionary instead of hitting the 10-dict cap.

Usage:
    from interview.sarvam_pronunciation_dict import get_or_create_dict_id
    dict_id = await get_or_create_dict_id(api_key)
    # pass dict_id to build_sarvam_tts(dict_id=dict_id)

The dictionary is created once per deployment; adding new pronunciations
calls update_dict() which PUTs to the existing dict_id.
"""
from __future__ import annotations

import io
import json
import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.sarvam.ai/text-to-speech/pronunciation-dictionary"

# All custom pronunciations sent to Sarvam server-side.
# Sarvam's enable_preprocessing already handles numbers and plain acronyms on v3;
# this dictionary covers words the server normalizer gets wrong or mispronounces.
_PRONUNCIATIONS: dict[str, str] = {
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
    # Languages / runtimes
    "pytorch":       "pie torch",
    "scipy":         "sigh pie",
    "numpy":         "num pie",
    "matplotlib":    "mat plot lib",
    "sklearn":       "S K learn",
    "scikit":        "sigh kit",
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
    # AI / ML
    "spacy":         "spay see",
    "tesseract":     "tess er act",
    "lora":          "low rah",
    "qlora":         "Q low rah",
    # Protocols / formats
    "graphql":       "graph Q L",
    "grpc":          "G R P C",
    "oauth":         "oh auth",
    "yaml":          "yam ul",
    "toml":          "tom ul",
    # Misc tech
    "postgresql":    "post gres Q L",
    "nosql":         "no sequel",
    "devops":        "dev ops",
    "devsecops":     "dev sec ops",
    "cicd":          "C I C D",
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

# Env var name where we persist the dict_id across restarts
_ENV_KEY = "SARVAM_DICT_ID"


def _build_file_payload(pronunciations: dict[str, str]) -> bytes:
    """Serialize pronunciations into the JSON file format Sarvam expects."""
    return json.dumps({
        "pronunciations": {
            "en-IN": pronunciations,
            "hi-IN": {},
        }
    }, ensure_ascii=False).encode("utf-8")


async def _create(api_key: str) -> str:
    """POST to create a new pronunciation dictionary. Returns dict_id."""
    payload = _build_file_payload(_PRONUNCIATIONS)
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            _BASE_URL,
            headers={"api-subscription-key": api_key},
            files={"file": ("pronunciations.json", io.BytesIO(payload), "application/json")},
        )
        resp.raise_for_status()
        dict_id: str = resp.json()["dictionary_id"]
    logger.info("[SARVAM_DICT] Created pronunciation dictionary dict_id=%s", dict_id)
    return dict_id


async def _update(api_key: str, dict_id: str, pronunciations: dict[str, str]) -> None:
    """PUT to add/replace rules in an existing dictionary."""
    payload = _build_file_payload(pronunciations)
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.put(
            _BASE_URL,
            params={"dict_id": dict_id},
            headers={"api-subscription-key": api_key},
            files={"file": ("pronunciations.json", io.BytesIO(payload), "application/json")},
        )
        resp.raise_for_status()
    logger.info("[SARVAM_DICT] Updated dictionary dict_id=%s (%d words)", dict_id, len(pronunciations))


async def get_or_create_dict_id(api_key: str) -> Optional[str]:
    """Return the Sarvam pronunciation dictionary ID, creating it if needed.

    1. If SARVAM_DICT_ID env var is set, return it directly (no API call).
    2. Otherwise POST to create a new dictionary from _PRONUNCIATIONS,
       write the returned id back into os.environ so it survives for the
       rest of the process lifetime, and return it.

    Returns None on any error so callers can degrade gracefully (TTS still
    works without dict_id, just without custom pronunciations).
    """
    existing = os.environ.get(_ENV_KEY, "").strip()
    if existing:
        logger.info("[SARVAM_DICT] Reusing dict_id=%s from env", existing)
        return existing

    try:
        dict_id = await _create(api_key)
        os.environ[_ENV_KEY] = dict_id
        return dict_id
    except Exception as exc:
        logger.warning(
            "[SARVAM_DICT] Failed to create pronunciation dictionary: %s — "
            "TTS will proceed without custom pronunciations",
            exc,
        )
        return None


async def sync_pronunciations(api_key: str, dict_id: str, extra: dict[str, str] | None = None) -> None:
    """Push the full pronunciation set (plus any session extras) to an existing dict.

    Call this when you want to add session-specific terms (e.g. company names from
    a candidate's resume) on top of the base _PRONUNCIATIONS.
    """
    merged = {**_PRONUNCIATIONS, **(extra or {})}
    # Sarvam cap: 100 words per dictionary
    if len(merged) > 100:
        merged = dict(list(merged.items())[:100])
        logger.warning("[SARVAM_DICT] Truncated to 100 words (Sarvam limit)")
    try:
        await _update(api_key, dict_id, merged)
    except Exception as exc:
        logger.warning("[SARVAM_DICT] sync_pronunciations failed: %s", exc)
