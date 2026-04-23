import os
import sys
import asyncio
from contextvars import ContextVar

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
import random
import logging
import json
import time
import asyncpg
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Optional, Any
import uuid
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse
import re
import traceback
from openai import AsyncOpenAI
from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    JobProcess,
    inference,
    TurnHandlingOptions,
    WorkerOptions,
    cli,
    llm,
    text_transforms,
    tts as lk_tts,
)
from livekit.agents.metrics import AgentSessionUsage
from livekit.agents.voice.events import ConversationItemAddedEvent
from livekit.agents.voice import room_io
from livekit.agents.voice.turn import EndpointingOptions, InterruptionOptions
from livekit.plugins import openai, deepgram, silero, sarvam

try:
    from livekit.plugins import ai_coustics
except ImportError:  # pragma: no cover - optional plugin
    ai_coustics = None
from turn_evaluator import run_turn_evaluation
from trust_engine import apply_turn_decision, apply_proctoring_event, apply_contradiction_resolved, finalize_trust_state
from contradiction_state import init_contradiction_state, advance_contradiction_state, summarize_contradiction_state
from session_state import init_trust_state
from recruiter_summary import build_recruiter_summary
from prompt_layers import (
    build_voice_layer_prompt,
    build_evaluation_layer_prompt,
    build_system_prompt,
)
from turn_decision import classify_short_utterance
from probe_strategy import build_short_utterance_directive


load_dotenv()

logger = logging.getLogger("interview-agent")
logger.setLevel(logging.INFO)


class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "module": record.module,
            "line": record.lineno,
        }
        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)

        # Add any extra attributes passed to the logger
        for key, value in record.__dict__.items():
            if key not in [
                "args",
                "asctime",
                "created",
                "exc_info",
                "exc_text",
                "filename",
                "funcName",
                "levelname",
                "levelno",
                "lineno",
                "module",
                "msecs",
                "message",
                "msg",
                "name",
                "pathname",
                "process",
                "processName",
                "relativeCreated",
                "stack_info",
                "thread",
                "threadName",
            ]:
                log_record[key] = value

        return json.dumps(log_record)


# Clear existing handlers
for handler in logger.handlers[:]:
    logger.removeHandler(handler)

# Add JSON handler to stdout/stderr
handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
logger.addHandler(handler)
logger.propagate = False  # Prevent double logging if root logger is configured


_LOG_CONTEXT_FIELDS: ContextVar[dict[str, Any]] = ContextVar("log_context_fields", default={})


class _SessionLogContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        for key, value in _LOG_CONTEXT_FIELDS.get({}).items():
            if not hasattr(record, key):
                setattr(record, key, value)
        return True


handler.addFilter(_SessionLogContextFilter())


class _RuntimeWarningSampler(logging.Filter):
    """
    Rate-limit noisy warnings instead of hiding them.
    Keeps logs readable while preserving the exact signals needed for debugging.
    """
    def __init__(self) -> None:
        super().__init__()
        self._last_seen: dict[str, float] = {}
        self._interval_seconds = 30.0

        self._drop_always = (
            "flush_done",
            "re-using existing connection",
            "unexpected response: type=text",
        )

        self._sampled = (
            "unexpected message",
            "audio stream queue overflow",
            "inference is slower than realtime",
            "connectionreseterror",
            "duplexclosed",
            "final transcript not received after timeout",
            "speech scheduling is paused",
        )

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage().lower()

        if any(pattern in msg for pattern in self._drop_always):
            return False

        for pattern in self._sampled:
            if pattern in msg:
                now = time.time()
                last = self._last_seen.get(pattern, 0.0)
                if now - last < self._interval_seconds:
                    return False
                self._last_seen[pattern] = now
                record.runtime_warning = pattern
                record.runtime_warning_sampled = True
                return True

        return True


for logger_name in ("livekit.plugins.cartesia", "livekit.plugins.silero", "livekit"):
    _logger = logging.getLogger(logger_name)
    _logger.addFilter(_RuntimeWarningSampler())

# --- Configuration ---
# Reverted to nova-3-general and sonic-3 due to Deepgram project access tier limits
STT_MODEL = "nova-3"  # deepgram model
CARTESIA_MODEL = "cartesia/sonic-3"  # Cartesia model via LiveKit Inference
CARTESIA_VOICE_ID = "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"  # "Jacqueline - Reassuring Agent" (verified on account)
LLM_MODEL = "gpt-4o-mini"  # LLM model - upgraded for richer conversational quality
DATABASE_URL = os.environ.get("DATABASE_URL")
AGENT_NAME = os.environ.get("LIVEKIT_AGENT_NAME", "ai_interviewer")
APP_BASE_URL = (
    os.environ.get("APP_URL")
    or os.environ.get("NEXT_PUBLIC_APP_URL")
    or "http://localhost:3000"
).rstrip("/")

_DB_POOL: asyncpg.Pool | None = None
_DB_POOL_INIT_TASK: asyncio.Task[asyncpg.Pool] | None = None

# Follow-up depth is now a fixed internal default.
# Actual probing is controlled per-turn by evaluate_answer_and_decide().

_TOOL_ALIAS_CATALOG: dict[str, list[str]] = {
    "n8n": ["n8n", "nh10", "n h 10", "en 8 en", "nan"],
    "Apollo.io": ["apollo", "apolo", "apollo io"],
    "LeadMagic": ["leadmagic", "lead magic", "lead magik"],
    "Zoho Bigin": ["bigin", "begin", "big in", "zoho begin", "zoho bigin"],
    "Zoho CRM": ["zoho crm", "joho crm", "zohho crm"],
    "HubSpot": ["hubspot", "hub spot"],
    "Salesforce": ["salesforce", "sales farce", "sales force"],
    "Instantly": ["instantly", "instant ly"],
    "Clay": ["clay", "kley"],
}

# --- Proctoring Risk Weights (Phase 5) ---
# Browser-side proctoring signals sent via LiveKit data channel
PROCTORING_WEIGHTS: dict[str, int] = {
    "tab_switch": 5,           # candidate switched to another tab
    "face_absent": 3,          # weak unless repeated/prolonged
    "gaze_violation": 0,       # supporting context only; excluded from core trust math
    "multiple_faces": 30,      # multiple people detected (suspicious)
    "clipboard_paste": 15,     # detected clipboard paste event
    "background_voice": 25,    # second speaker diarized by Deepgram Nova-3
    "audio_leak": 8,           # helper phrase detected in transcript; strongest when corroborated
}

_COMPOSITE_RISK_WEIGHTS = {
    "integrity": 0.60,
    "depth": 0.40,
}

_MODE_SWITCH_WEIGHTS = {
    "integrity": 0.70,
    "depth": 0.30,
}


def compose_risk_score(
    integrity_risk: int,
    depth_risk: int,
) -> int:
    weighted = (
        integrity_risk * _COMPOSITE_RISK_WEIGHTS["integrity"]
        + depth_risk * _COMPOSITE_RISK_WEIGHTS["depth"]
    )
    return max(0, min(100, int(round(weighted))))


def compose_mode_risk_score(
    integrity_risk: int,
    depth_risk: int,
) -> int:
    weighted = (
        integrity_risk * _MODE_SWITCH_WEIGHTS["integrity"]
        + depth_risk * _MODE_SWITCH_WEIGHTS["depth"]
    )
    if integrity_risk >= 15:
        weighted += 8
    elif integrity_risk >= 8:
        weighted += 4
    return max(0, min(100, int(round(weighted))))

# --- Audio Proctoring: Keyterms for Nova-3 boost + helper-phrase patterns ---
# Keyterms tell Deepgram Nova-3 to specifically "listen out" for these words.
# Even quiet whispers are more likely to be captured accurately.
DEEPGRAM_KEYTERMS: list[str] = [
    "the answer is",
    "tell her",
    "tell him",
    "tell them",
    "say that",
    "just say",
    "repeat after me",
    "you should say",
]

# Regex patterns that indicate a third party is providing answers (helper instructions).
# Applied to candidate transcript segments in real-time.
import re as _re
_HELPER_PHRASE_PATTERNS: list[_re.Pattern] = [
    _re.compile(r"\bthe answer is\b", _re.IGNORECASE),
    _re.compile(r"\btell (her|him|them)\b", _re.IGNORECASE),
    _re.compile(r"\bjust say\b", _re.IGNORECASE),
    _re.compile(r"\bsay that\b", _re.IGNORECASE),
    _re.compile(r"\brepeat after me\b", _re.IGNORECASE),
    _re.compile(r"\byou should say\b", _re.IGNORECASE),
]


async def _single_question_transform(text_stream):
    """
    TTS text transform: buffers the full LLM output and:
    1. Drops everything after the first complete question (sentence ending in '?')
    2. Strips the <wait for response> marker so it's not spoken
    Prevents Ishita from asking two questions in one turn.
    """
    buffer = ""
    async for chunk in text_stream:
        buffer += chunk

    # Strip the wait marker before processing questions
    result = buffer.replace("<wait for response>", "").strip()

    # Find the first sentence that ends with '?'
    # Split on sentence boundaries but keep delimiters
    sentence_pattern = re.compile(r'[^.!?]*[.!?]')
    sentences = sentence_pattern.findall(result)

    question_count = 0
    cutoff = 0
    pos = 0
    for s in sentences:
        pos += len(s)
        if s.rstrip().endswith('?'):
            question_count += 1
            if question_count == 1:
                cutoff = pos
    # If there's a second question mark anywhere after cutoff, truncate
    if cutoff > 0 and '?' in result[cutoff:]:
        result = result[:cutoff].rstrip()
        logger.debug(f"[SINGLE_Q] Truncated double question. Original: {buffer[:120]!r}")

    # Yield the cleaned result
    if result:
        yield result


def build_term_alias_hints(*text_blocks: str, max_lines: int = 10) -> str:
    combined = " ".join(block for block in text_blocks if isinstance(block, str)).lower()
    lines: list[str] = []
    for canonical, aliases in _TOOL_ALIAS_CATALOG.items():
        matched = [a for a in aliases if a in combined]
        if not matched:
            continue
        unique_aliases = sorted(set(matched))
        lines.append(f"- {', '.join(unique_aliases[:3])} -> {canonical}")
        if len(lines) >= max_lines:
            break

    if not lines:
        return "- No strong alias hints from context. If unclear, confirm once, then move on."
    return "\n".join(lines)


def _safe_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        text = str(value).strip()
        if not text:
            return None
        return float(text)
    except Exception:
        return None


def safe_parse(val: Any, fallback: str = "Not provided") -> str:
    if val is None or val in ("{}", "[]", "null", "None"):
        return fallback
    try:
        if isinstance(val, str):
            parsed = json.loads(val)
        elif isinstance(val, (dict, list)):
            parsed = val
        else:
            return str(val).strip() or fallback

        if isinstance(parsed, dict):
            return "\n".join(f"  {k}: {v}" for k, v in parsed.items() if v)
        if isinstance(parsed, list):
            return "\n".join(f"  - {item}" for item in parsed if item)
        if isinstance(parsed, str):
            text = parsed.strip()
            return text or fallback
        return fallback
    except Exception:
        return str(val).strip() or fallback


def parse_dispatch_metadata(metadata: Any) -> dict[str, Any]:
    if not metadata:
        return {}
    try:
        parsed = _coerce_jsonish(metadata)
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _compact_optional(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return text


def infer_candidate_band(structured_resume_raw: Any, resume_text_block: str) -> str:
    """
    Infer interview mode from structured resume + free text:
    Fixed ranges:
    - fresher: < 1.5 years
    - mid: 1.5 to 5 years, inclusive
    - experienced: > 5 to 10 years, inclusive of 10
    - senior: > 10 years
    """
    context = _ensure_resume_context(structured_resume_raw, resume_text_block)

    if context.years_of_experience is not None:
        if context.years_of_experience < 1.5:
            return "fresher"
        if context.years_of_experience > 10:
            return "senior"
        if context.years_of_experience > 5:
            return "experienced"
        # 1.5 <= years <= 5 falls here
        return "mid"

    text = context.resume_text.lower()

    if context.fresher_signals or any(sig in text for sig in ("fresher", "entry level", "student", "final year", "internship", "intern", "graduate")):
        return "fresher"
    if context.experienced_signals or any(sig in text for sig in ("senior", "lead", "manager", "head of", "director", "staff engineer", "principal")):
        if any(sig in text for sig in ("senior", "staff engineer", "principal", "director", "head of")):
            return "senior"
        return "experienced"
    return "mid"


def build_interview_turns(transcript_lines: list[Any]) -> list[dict[str, Any]]:
    """Group raw transcript lines into question/answer turns."""
    blocks: list[dict[str, Any]] = []

    def _append_block(speaker: str, text: str) -> None:
        text = (text or "").strip()
        if not text:
            return
        if blocks and blocks[-1]["speaker"] == speaker:
            blocks[-1]["text"] = f'{blocks[-1]["text"]} {text}'.strip()
        else:
            blocks.append({"speaker": speaker, "text": text})

    for raw_line in transcript_lines or []:
        if not isinstance(raw_line, str):
            continue
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("Interviewer:"):
            _append_block("Interviewer", line[len("Interviewer:"):].strip())
        elif line.startswith("Candidate:"):
            _append_block("Candidate", line[len("Candidate:"):].strip())
        else:
            _append_block("Interviewer", line)

    turns: list[dict[str, Any]] = []
    current_question: Optional[str] = None
    current_answer_parts: list[str] = []
    turn_index = 0

    def _flush_turn() -> None:
        nonlocal current_question, current_answer_parts, turn_index
        question = (current_question or "").strip()
        answer = " ".join(part.strip() for part in current_answer_parts if part.strip()).strip()
        if question or answer:
            turn_index += 1
            turns.append({
                "turn": turn_index,
                "question": question,
                "answer": answer,
                "questionSpeaker": "Interviewer",
                "answerSpeaker": "Candidate" if answer else None,
            })
        current_question = None
        current_answer_parts = []

    for block in blocks:
        speaker = block["speaker"]
        text = block["text"]
        if speaker == "Interviewer":
            if current_question is not None or current_answer_parts:
                _flush_turn()
            current_question = text
        else:
            if current_question is None:
                current_question = ""
            current_answer_parts.append(text)

    if current_question is not None or current_answer_parts:
        _flush_turn()

    return turns


def detect_role_category(job_title: str) -> str:
    """
    Classifies a job title into one of 5 role categories.
    Engineering is checked first so 'Solutions Engineer' maps to engineering not sales.
    Falls back to 'operations' (generalist) - never crashes.
    """
    if not job_title:
        return "operations"
    title = job_title.lower().strip()

    ENGINEERING = [
        "engineer", "developer", "dev", "software", "backend", "frontend",
        "full stack", "fullstack", "sre", "devops", "platform", "infrastructure",
        "data engineer", "ml engineer", "machine learning", "ai engineer",
        "cloud", "architect", "embedded", "firmware", "android", "ios",
        "mobile", "web developer", "python", "java", "golang", "rust",
        "security engineer", "qa engineer", "test engineer", "sdet",
        "data scientist", "tech lead", "engineering manager", "staff engineer",
        "principal engineer", "solutions engineer",
    ]
    SALES = [
        "sales", "account executive", " ae ", "business development", "bdr",
        "sdr", "account manager", "revenue", "closing", "quota", "pipeline",
        "enterprise sales", "inside sales", "field sales", "commercial",
        "partnerships", "channel", "pre-sales",
    ]
    CUSTOMER_SUCCESS = [
        "customer success", "csm", "client success", "account success",
        "customer experience", " cx ", "onboarding", "implementation",
        "customer support", "support engineer", "technical support",
        "client services", "renewal", "retention", "churn", "post-sales",
    ]
    MARKETING = [
        "marketing", "growth", "demand generation", "demand gen",
        "content", " seo", " sem", "paid media", "brand", "product marketing",
        "pmm", "performance marketing", "digital marketing", "social media",
        "communications", " pr ", "campaign", "copywriter", "email marketing",
    ]

    for kw in ENGINEERING:
        if kw in title:
            return "engineering"
    for kw in SALES:
        if kw in title:
            return "sales"
    for kw in CUSTOMER_SUCCESS:
        if kw in title:
            return "customer_success"
    for kw in MARKETING:
        if kw in title:
            return "marketing"
    return "operations"


def detect_role_subtype(job_title: str, role_category: str) -> str:
    """
    Returns a more specific subtype within a role category.
    Used to further personalise the role layer (e.g. backend vs frontend vs data).
    Falls back to 'general' if no subtype matched.
    """
    if not job_title:
        return "general"
    title = job_title.lower().strip()

    if role_category == "engineering":
        if any(k in title for k in ["data scientist", "data engineer", "ml ", "machine learning", "ai ", "analytics engineer"]):
            return "data"
        if any(k in title for k in ["devops", "sre", "platform", "infrastructure", "cloud", "devsecops"]):
            return "devops"
        if any(k in title for k in ["frontend", "front end", "react", "vue", "angular", "ui engineer"]):
            return "frontend"
        if any(k in title for k in ["android", "ios", "mobile", "flutter", "react native"]):
            return "mobile"
        if any(k in title for k in ["qa", "test engineer", "sdet", "quality"]):
            return "qa"
        if any(k in title for k in ["full stack", "fullstack"]):
            return "fullstack"
        if any(k in title for k in ["solutions", "gtm", "presales", "pre-sales", "field engineer"]):
            return "solutions"
        return "backend"

    if role_category == "sales":
        if any(k in title for k in ["sdr", "bdr", "outbound", "prospecting"]):
            return "sdr"
        if any(k in title for k in ["account executive", " ae ", "closing", "enterprise sales"]):
            return "ae"
        if any(k in title for k in ["account manager", "account management", "renewal"]):
            return "account_management"
        return "general"

    if role_category == "marketing":
        if any(k in title for k in ["performance", "paid", "sem", "seo", "growth"]):
            return "performance"
        if any(k in title for k in ["content", "copywriter", "editorial"]):
            return "content"
        if any(k in title for k in ["product marketing", "pmm"]):
            return "product_marketing"
        if any(k in title for k in ["brand", "communications", "pr"]):
            return "brand"
        return "general"

    return "general"


def first_name_from_full_name(full_name: str) -> str:
    if not full_name:
        return ""
    cleaned = " ".join(str(full_name).strip().split())
    if not cleaned:
        return ""
    return cleaned.split(" ", 1)[0]


def build_role_layer(role_category: str, role_subtype: str, candidate_band: str) -> str:
    """
    Returns a compact role-specific principles block injected into the system prompt.
    Use it as a thinking framework, not a script.
    """
    # -- ENGINEERING ----------------------------------------------------------
    engineering_base = """
ROLE INTELLIGENCE - ENGINEERING
Focus: real decisions, not tool lists.

Evaluate:
- constraint awareness
- failure/debugging literacy
- tradeoffs and system thinking
- ownership ("I" vs "we")
- measurable impact

Strong signals:
- names a real constraint, failure, or metric
- explains why a choice was made
- compares alternatives honestly
- says what they would change now

Weak signals:
- tool dumping with no story
- vague wins with no numbers
- no failure or rollback story
- polished STAR answers with no real detail

Probe harder when they mention:
- a tool
- a success
- an ownership claim
- a vague result

Ask for:
- the constraint
- the tradeoff
- the before/after
- what broke
- what they personally owned
"""

    engineering_subtypes = {
        "backend": """
BACKEND: API design, data modeling, concurrency, production failures.
Probe: ask for the hardest tradeoff, the real incident, and what they would redesign now.
""",
        "frontend": """
FRONTEND: performance, state, accessibility, real user impact.
Probe: ask for a slow UI, a design pushback, and a choice they would not repeat.
""",
        "data": """
DATA: pipeline reliability, data quality, business impact.
Probe: ask what broke, who noticed first, and how the decision changed.
""",
        "devops": """
DEVOPS: incident ownership, on-call, deploys, reliability tradeoffs.
Probe: ask for the worst incident, the rollback, and alerting choices.
""",
        "mobile": """
MOBILE: device fragmentation, app-store constraints, offline behavior.
Probe: ask for a device-specific bug and the battery/network tradeoff.
""",
        "qa": """
QA: test strategy, risk prioritization, release judgment.
Probe: ask what they would not test, what they blocked, and why.
""",
        "fullstack": """
FULLSTACK: end-to-end ownership, seam handling, honest strengths.
Probe: ask for one feature from DB to UI and where it was hardest.
""",
        "solutions": """
SOLUTIONS: technical-to-business translation, customer escalation, PoC thinking.
Probe: ask when they pushed back, saved the deal, or explained ROI to a non-technical leader.
""",
    }

    # -- SALES -----------------------------------------------------------------
    sales_base = """
ROLE INTELLIGENCE - SALES
Focus: numbers, deal judgment, rejection, and process.

Evaluate:
- quota and attainment
- losses and self-awareness
- multi-stakeholder deal handling
- repeatable process
- coachability

Strong signals:
- gives numbers naturally
- explains why they won or lost
- names a real objection or decision point
- shows what they personally did

Weak signals:
- only win stories
- no numbers
- generic process language
- no friction or failure

Probe harder when they mention:
- quota
- a win
- a loss
- an objection
- a relationship change
"""

    sales_subtypes = {
        "sdr": """
SDR: prospecting quality, sequence changes, ICP judgment.
Probe: ask what they changed, what response improved, and why.
""",
        "ae": """
AE: qualification, deal judgment, competitive losses.
Probe: ask when they walked away and why they knew it would not close.
""",
        "account_management": """
ACCOUNT MANAGEMENT: renewals, expansion, churn risk, account growth.
Probe: ask for a save, an expansion, and the turning point.
""",
    }

    # -- CUSTOMER SUCCESS ------------------------------------------------------
    customer_success_layer = """
ROLE INTELLIGENCE - CUSTOMER SUCCESS
Focus: churn risk, account health, stakeholder movement, and business value.

Evaluate:
- at-risk account judgment
- stakeholder navigation
- value articulation
- escalation timing
- metrics and retention thinking

Strong signals:
- names specific accounts and turning points
- gives metrics
- explains cross-functional influence
- shows what changed the outcome

Weak signals:
- only happy stories
- no numbers
- no conflict
- generic relationship language
"""

    # -- MARKETING ------------------------------------------------------------
    marketing_base = """
ROLE INTELLIGENCE - MARKETING
Focus: metrics, audience insight, ownership, and what failed.

Evaluate:
- metrics and attribution
- audience understanding
- ownership vs agency/team
- experiments that failed
- sales alignment

Strong signals:
- gives numbers
- names a real audience
- explains what changed the result
- admits what did not work

Weak signals:
- strategy without execution
- no numbers
- only win stories
- agency credit with no personal ownership
"""

    marketing_subtypes = {
        "performance": """
PERFORMANCE: bidding, attribution, channel mix, diagnosis.
Probe: ask what broke, what they tested, and why the model was weak.
""",
        "content": """
CONTENT: distribution, performance, insight-to-brief thinking.
Probe: ask why a piece worked, what did not, and how they chose the topic.
""",
        "product_marketing": """
PRODUCT MARKETING: positioning, research, launches, messaging validation.
Probe: ask how they validated messaging and what surprised them.
""",
        "brand": """
BRAND: business impact, consistency, tension with commercial pressure.
Probe: ask how they defended a brand decision and measured effect.
""",
    }

    # -- OPERATIONS -----------------------------------------------------------
    operations_layer = """
ROLE INTELLIGENCE - OPERATIONS / GENERALIST
Focus: systems, ambiguity, stakeholder influence, and prioritization.

Evaluate:
- root cause thinking
- influence without authority
- prioritization
- documentation
- ambiguity handling

Strong signals:
- names a broken process
- shows the conflict or tradeoff
- explains what changed
- shows what lasted after they left

Weak signals:
- frameworks with no conflict
- no tradeoff
- no resistance
- vague efficiency claims
"""

    # -- ASSEMBLE THE LAYER ----------------------------------------------------
    if role_category == "engineering":
        subtype_note = engineering_subtypes.get(role_subtype, engineering_subtypes["backend"])
        role_text = engineering_base + subtype_note
    elif role_category == "sales":
        subtype_note = sales_subtypes.get(role_subtype, sales_subtypes.get("general", ""))
        role_text = sales_base + subtype_note
    elif role_category == "customer_success":
        role_text = customer_success_layer
    elif role_category == "marketing":
        subtype_note = marketing_subtypes.get(role_subtype, marketing_subtypes.get("general", ""))
        role_text = marketing_base + subtype_note
    else:
        role_text = operations_layer

    # Seniority addendum - appended to every role layer
    if candidate_band == "fresher":
        band_note = """
SENIORITY NOTE FOR THIS ROLE (FRESHER / EARLY CAREER):
  Prioritise potential and reasoning over domain track record.
  Ask "how would you approach" and "what have you learned" more than "walk me through what you delivered."
  Be patient with vocabulary - they may not know industry jargon yet.
  Probe learning speed and genuine curiosity rather than scale or ownership.
  Do not penalise them for not knowing things an experienced hire would know.
"""
    elif candidate_band == "senior":
        band_note = """
SENIORITY NOTE FOR THIS ROLE (SENIOR):
  Expect deep ownership, clear strategic judgment, and evidence of impact across scope and time.
  Do not stay at project summaries - go after tradeoffs, influence, scale, and decisions made under constraint.
  Ask what they would change architecturally or operationally if they owned the system/team today.
  Probe mentorship, cross-functional leadership, and how they set direction for others.
"""
    elif candidate_band == "experienced":
        band_note = """
SENIORITY NOTE FOR THIS ROLE (EXPERIENCED / SENIOR):
  Expect ownership language, scale experience, and strategic thinking.
  If answers feel junior - no metrics, no ownership, no tradeoffs - probe harder. That is a signal.
  Do not accept vague answers at this level. An experienced person should have a story for everything.
  Push to depth spiral level 4, 5, 6 on the strongest topics.
  Ask about failures, hard decisions, and things they would do differently.
"""
    else:
        band_note = """
SENIORITY NOTE FOR THIS ROLE (MID-LEVEL):
  Expect some real domain experience but not necessarily strategic depth yet.
  Probe for learning velocity - do they know what they do not know?
  Balance breadth of skills with depth on the things they claim to know best.
  Look for growth trajectory - are they getting better, or plateauing?
"""

    return role_text + band_note


def build_coverage_checklist(candidate_band: str) -> list[str]:
    common = [
        "Validate 2-3 core skills from the resume with one concrete example each.",
        "Ask for measurable outcomes, not just tool names.",
        "Cover one communication or collaboration moment from real work.",
    ]
    if candidate_band == "fresher":
        return [
            "Deep-dive one academic/internship project end-to-end (problem, build, result).",
            "Check fundamentals behind tools they mentioned (what they configured, why, what failed).",
            "Ask one college/teamwork story (ownership, deadlines, conflicts, learning).",
            "Assess learning speed: what they learned recently and how.",
        ] + common
    if candidate_band == "senior":
        return [
            "Deep-dive one flagship initiative for scope, strategic choices, and measurable business impact.",
            "Probe how they influenced direction across teams, not just what they delivered personally.",
            "Assess decisions under constraint, tradeoffs, and what they would redesign today.",
            "Verify leadership, mentoring, and judgment on difficult ambiguous problems.",
        ] + common
    if candidate_band == "experienced":
        return [
            "Deep-dive one recent role with scope, ownership, and business impact.",
            "Probe decision-making, tradeoffs, and stakeholder management.",
            "Assess leadership/mentoring/process ownership with a specific example.",
            "Verify advanced role-critical skills with architecture-level depth.",
        ] + common
    return [
        "Cover one strong project story and one role experience story.",
        "Probe execution details and impact across both project and work experience.",
        "Validate breadth and depth of claimed tools/skills.",
        "Ask one growth/career reflection (what changed from college/projects to real-world work).",
    ] + common


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return [value]


def _compact_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        text = value.strip()
    else:
        text = str(value).strip()
    return re.sub(r"\s+", " ", text).strip()


def _first_text(*values: Any) -> str:
    for value in values:
        text = _compact_text(value)
        if text:
            return text
    return ""


def _deep_get(source: Any, path: str) -> Any:
    current = source
    for key in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(key)
        if current is None:
            return None
    return current


def _extract_text_items(items: Any, fields: tuple[str, ...] = ()) -> list[str]:
    extracted: list[str] = []
    for item in _as_list(items):
        text = ""
        if isinstance(item, dict):
            if fields:
                text = _first_text(*(item.get(field) for field in fields))
            else:
                text = _first_text(
                    item.get("name"),
                    item.get("title"),
                    item.get("skill"),
                    item.get("tool"),
                    item.get("role"),
                    item.get("company"),
                    item.get("description"),
                    item.get("summary"),
                    item.get("condition"),
                    item.get("reason"),
                    item.get("area"),
                    item.get("what_to_probe"),
                    item.get("why_it_matters"),
                    item.get("claim"),
                    item.get("proof"),
                    item.get("note"),
                    item.get("message"),
                    item.get("status"),
                    item.get("value"),
                )
        else:
            text = _first_text(item)

        if text:
            extracted.append(text)

    unique: list[str] = []
    seen: set[str] = set()
    for text in extracted:
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(text)
    return unique


def _join_items(items: list[str], max_items: int) -> str:
    return ", ".join(items[:max_items]) if items else "Not available"


def _format_compact_section(title: str, lines: list[str]) -> str:
    clean_lines = [line for line in lines if _compact_text(line)]
    if not clean_lines:
        clean_lines = ["Not available"]
    body = "\n".join(f"- {line}" for line in clean_lines)
    return f"{title}\n{body}"


def _normalize_cartesia_model(model: str) -> str:
    model = _compact_text(model)
    if not model:
        return CARTESIA_MODEL
    if model.startswith("cartesia/"):
        return model
    return f"cartesia/{model}"


def truncate_to_tokens(text: str, max_tokens: int) -> str:
    """
    Rough token-aware truncation using a 4 chars/token estimate.
    Preserves whole lines by cutting at the last newline before the limit.
    """
    if not text or max_tokens <= 0:
        return ""

    max_chars = max_tokens * 4
    if len(text) <= max_chars:
        return text

    cutoff = text.rfind("\n", 0, max_chars)
    if cutoff < 0:
        cutoff = max_chars
    return text[:cutoff].rstrip()


@dataclass(slots=True)
class ResumeContext:
    resume_data: dict[str, Any]
    resume_text: str
    years_of_experience: Optional[float]
    years_label: str
    current_role: str
    skills: list[str]
    projects: list[str]
    work_history: list[str]
    experiences: list[str]
    education: list[str]
    hobbies: list[str]
    ownership_risks: list[str]
    fresher_signals: bool
    experienced_signals: bool


@dataclass(slots=True)
class CandidateBandContext:
    candidate_band: str
    role_category: str
    role_subtype: str
    coverage_items: list[str]
    candidate_summary_block: str = ""
    jd_summary_block: str = ""
    screening_summary_block: str = ""
    role_layer: str = ""
    term_alias_hints: str = ""
    role_intelligence_block: str = ""
    candidate_brief_block: str = ""
    smart_opening_question: str = ""
    short_coverage_block: str = ""
    live_prompt_context: str = ""
    questions_list: str = ""
    depth_instruction: str = ""
    initial_context_injected: bool = False
    full_brief_injected: bool = False


def parse_resume_context(resume_data: Any, resume_text: str) -> ResumeContext:
    if isinstance(resume_data, ResumeContext):
        return resume_data

    parsed_resume = _coerce_jsonish(resume_data)
    resume_text = resume_text or ""

    years: Optional[float] = None
    years = _safe_float(_deep_get(parsed_resume, "experience.total_years"))
    if years is None:
        years = _safe_float(_deep_get(parsed_resume, "experienceYears"))
    if years is None:
        years = _safe_float(_deep_get(parsed_resume, "experience_years"))
    if years is None:
        lower = resume_text.lower()
        match = re.search(r"(\d+(?:\.\d+)?)\s*\+?\s*(?:years|year|yrs|yr)\b", lower)
        if match:
            years = _safe_float(match.group(1))

    if years is None:
        years_label = "Not stated"
    elif float(years).is_integer():
        years_label = f"{int(years)} years"
    else:
        years_label = f"{years:.1f} years"

    current_role = _first_text(
        _deep_get(parsed_resume, "experience.currentRole"),
        _deep_get(parsed_resume, "experience.current_role"),
        parsed_resume.get("current_role"),
        parsed_resume.get("currentRole"),
    )
    current_company = _first_text(
        _deep_get(parsed_resume, "experience.currentCompany"),
        _deep_get(parsed_resume, "experience.current_company"),
        parsed_resume.get("current_company"),
        parsed_resume.get("currentCompany"),
    )
    if current_role and current_company:
        current_role_label = f"{current_role} at {current_company}"
    elif current_role:
        current_role_label = current_role
    elif current_company:
        current_role_label = current_company
    else:
        current_role_label = "Not stated"

    skills = _extract_text_items(_deep_get(parsed_resume, "skills.technical"), ("skill", "name", "value"))
    skills += _extract_text_items(_deep_get(parsed_resume, "skills.tools"), ("tool", "name", "value", "skill"))
    skills += _extract_text_items(_deep_get(parsed_resume, "skills.domain_skills"), ("skill", "name", "value"))
    skills += _extract_text_items(_deep_get(parsed_resume, "keywords"))
    skills = _extract_text_items(skills)

    projects: list[str] = []
    for project in _as_list(_deep_get(parsed_resume, "projects")):
        if not isinstance(project, dict):
            text = _first_text(project)
            if text:
                projects.append(text)
            continue

        name = _first_text(project.get("name"), project.get("title"))
        description = _first_text(project.get("description"), project.get("summary"))
        technologies = _extract_text_items(project.get("technologies"), ("skill", "tool", "name", "value"))
        parts = [name, description]
        compact = " - ".join(part for part in parts if part)
        if technologies:
            compact = f"{compact} [{_join_items(technologies, 3)}]" if compact else _join_items(technologies, 3)
        if compact:
            projects.append(compact)

    education: list[str] = []
    for item in _as_list(
        _deep_get(parsed_resume, "education")
        or _deep_get(parsed_resume, "academics")
        or _deep_get(parsed_resume, "qualifications")
    ):
        if isinstance(item, dict):
            school = _first_text(item.get("school"), item.get("institution"), item.get("college"), item.get("university"))
            degree = _first_text(item.get("degree"), item.get("qualification"), item.get("course"), item.get("program"))
            field = _first_text(item.get("field"), item.get("branch"), item.get("major"), item.get("specialization"))
            year = _first_text(item.get("year"), item.get("graduation_year"), item.get("passing_year"))
            parts = [degree, field, school]
            compact = " - ".join(part for part in parts if part)
            if year:
                compact = f"{compact} ({year})" if compact else year
            if compact:
                education.append(compact)
        else:
            text = _first_text(item)
            if text:
                education.append(text)

    hobbies: list[str] = []
    for item in _as_list(
        _deep_get(parsed_resume, "hobbies")
        or _deep_get(parsed_resume, "interests")
        or _deep_get(parsed_resume, "extra_activities")
        or _deep_get(parsed_resume, "extracurriculars")
        or _deep_get(parsed_resume, "activities")
    ):
        if isinstance(item, dict):
            text = _first_text(item.get("name"), item.get("title"), item.get("activity"), item.get("description"))
        else:
            text = _first_text(item)
        if text:
            hobbies.append(text)

    work_history: list[str] = []
    for role in _as_list(_deep_get(parsed_resume, "work_history")):
        if not isinstance(role, dict):
            text = _first_text(role)
            if text:
                work_history.append(text)
            continue

        company = _first_text(role.get("company"), role.get("organization"))
        role_name = _first_text(role.get("role"), role.get("title"))
        duration = _first_text(role.get("duration"), role.get("period"))
        text = " - ".join(part for part in [role_name, company] if part)
        if duration:
            text = f"{text} ({duration})" if text else duration
        if text:
            work_history.append(text)

    experiences = _extract_text_items(projects + work_history)
    ownership_risks = _extract_text_items(
        _deep_get(parsed_resume, "red_flags")
        or _deep_get(parsed_resume, "ownership_risks")
        or _deep_get(parsed_resume, "scoring_hints.red_flags_to_watch")
    )
    if len(ownership_risks) < 2:
        for item in experiences:
            ownership_risks.append(f"Verify personal ownership in {item}")
            if len(ownership_risks) >= 2:
                break
    ownership_risks = _extract_text_items(ownership_risks)[:2]

    lower_text = resume_text.lower()
    fresher_signals = any(
        sig in lower_text
        for sig in ("fresher", "entry level", "student", "final year", "internship", "intern", "graduate")
    )
    experienced_signals = any(
        sig in lower_text
        for sig in ("senior", "lead", "manager", "head of", "director", "staff engineer", "principal")
    )

    return ResumeContext(
        resume_data=parsed_resume,
        resume_text=resume_text,
        years_of_experience=years,
        years_label=years_label,
        current_role=current_role_label,
        skills=skills,
        projects=projects,
        work_history=work_history,
        experiences=experiences,
        education=_extract_text_items(education),
        hobbies=_extract_text_items(hobbies),
        ownership_risks=ownership_risks,
        fresher_signals=fresher_signals,
        experienced_signals=experienced_signals,
    )


def _ensure_resume_context(resume_data: Any, resume_text: str = "") -> ResumeContext:
    return parse_resume_context(resume_data, resume_text)


def _extract_years_of_experience(resume_data: dict[str, Any], resume_text: str) -> str:
    return _ensure_resume_context(resume_data, resume_text).years_label


def build_candidate_summary(structured_resume: Any, resume_text: str = "") -> str:
    context = _ensure_resume_context(structured_resume, resume_text)

    lines = [
        f"Current role: {context.current_role}",
        f"Years of experience: {context.years_label}",
        f"Core skills: {_join_items(context.skills, 5)}",
        f"Projects: {_join_items(context.projects, 3)}",
        f"Work history: {_join_items(context.work_history, 3)}",
        f"Education: {_join_items(context.education, 3)}" if context.education else "Education: Not stated",
        f"Hobbies / extra activities: {_join_items(context.hobbies, 3)}" if context.hobbies else "Hobbies / extra activities: Not stated",
        f"Key projects/experiences: {_join_items(context.experiences, 3)}",
        f"Ownership risks to verify: {_join_items(context.ownership_risks, 2)}",
    ]
    return _format_compact_section("CANDIDATE SUMMARY", lines)


def _build_context_vars_block(*, org_name: str = "", org_location: str = "", drive_location: str = "", ai_name: str = "", candidate_first_name: str = "", candidate_name: str = "", job_title: str = "", interview_lang: str = "") -> str:
    lines = []
    if candidate_first_name:
        lines.append(f"- Candidate first name: {candidate_first_name}")
    elif candidate_name:
        lines.append(f"- Candidate name: {candidate_name}")
    if job_title:
        lines.append(f"- Role: {job_title}")
    if ai_name:
        lines.append(f"- AI interviewer name: {ai_name}")
    if org_name:
        lines.append(f"- Organization: {org_name}")
    if org_location:
        lines.append(f"- Organization location: {org_location}")
    if drive_location:
        lines.append(f"- Drive location: {drive_location}")
    if interview_lang:
        lines.append(f"- Interview language: {interview_lang}")
    return "\n".join(lines)


def _extract_jd_must_haves(jd_data: dict[str, Any], jd_text: str) -> list[str]:
    must_have_entries = _as_list(_deep_get(jd_data, "skills.must_have"))
    capabilities: list[str] = []

    for item in must_have_entries:
        if isinstance(item, dict):
            skill = _first_text(item.get("skill"))
            why = _first_text(item.get("why_needed"))
            if skill and why:
                capabilities.append(f"{skill} ({why})")
            elif skill:
                capabilities.append(skill)
            elif why:
                capabilities.append(why)
        else:
            text = _first_text(item)
            if text:
                capabilities.append(text)

    if not capabilities:
        requirements = _extract_text_items(_deep_get(jd_data, "requirements"))
        capabilities.extend(requirements)

    if not capabilities and jd_text:
        for line in re.split(r"[\n•\-]+", jd_text):
            text = _compact_text(line)
            if text:
                capabilities.append(text)
            if len(capabilities) >= 5:
                break

    return _extract_text_items(capabilities)[:5]


def build_jd_summary(jd_details: Any, jd_text: str = "") -> str:
    jd_data = _coerce_jsonish(jd_details)
    target_seniority = _first_text(
        _deep_get(jd_data, "role_context.seniority"),
        _deep_get(jd_data, "experience.preferred_background"),
    )
    if not target_seniority:
        min_years = _safe_float(_deep_get(jd_data, "experience.min_years"))
        max_years = _safe_float(_deep_get(jd_data, "experience.max_years"))
        if min_years is not None and max_years is not None:
            target_seniority = f"{min_years:g}-{max_years:g} years"
        elif min_years is not None:
            target_seniority = f"{min_years:g}+ years"

    must_prove = _extract_jd_must_haves(jd_data, jd_text)
    risks = _extract_text_items(
        _deep_get(jd_data, "scoring_hints.red_flags_to_watch")
        or _deep_get(jd_data, "deal_breakers")
        or _deep_get(jd_data, "interview_signals")
    )
    if len(risks) < 3:
        for item in must_prove:
            risks.append(f"Risk if missing: no clear evidence of {item}")
            if len(risks) >= 3:
                break
    risks = _extract_text_items(risks)[:3]

    lines = [
        f"Target seniority: {target_seniority or 'Not stated'}",
        f"Must-prove capabilities: {_join_items(must_prove, 5)}",
        f"Major gaps or risks if missing: {_join_items(risks, 3)}",
    ]
    return _format_compact_section("JD SUMMARY", lines)


def build_screening_summary(ai_report: Any, ai_report_text: str = "") -> str:
    screening_data = _coerce_jsonish(ai_report)
    strengths = _extract_text_items(
        _deep_get(screening_data, "strengths")
        or _deep_get(screening_data, "green_flags")
        or _deep_get(screening_data, "highlights")
        or _deep_get(screening_data, "summary")
    )
    gaps = _extract_text_items(
        _deep_get(screening_data, "gaps")
        or _deep_get(screening_data, "concerns")
        or _deep_get(screening_data, "red_flags")
        or _deep_get(screening_data, "watch_outs")
        or _deep_get(screening_data, "watch-outs")
    )
    contradictions = _extract_text_items(
        _deep_get(screening_data, "contradictions")
        or _deep_get(screening_data, "inconsistencies")
        or _deep_get(screening_data, "watch_outs")
    )
    confidence = _first_text(
        _deep_get(screening_data, "confidence"),
        _deep_get(screening_data, "confidence_note"),
        _deep_get(screening_data, "overall_confidence"),
        _deep_get(screening_data, "notes"),
    )
    if not confidence and ai_report_text:
        confidence = _compact_text(ai_report_text[:200])

    lines = [
        f"Top strengths: {_join_items(strengths, 3)}",
        f"Top gaps: {_join_items(gaps, 3)}",
        f"Top contradictions or watch-outs: {_join_items(contradictions, 3)}",
        f"Confidence notes: {confidence or 'Treat screening as directional, not final.'}",
    ]
    return _format_compact_section("SCREENING SUMMARY", lines)


def build_live_prompt_context(context: CandidateBandContext) -> str:
    coverage_block = (
        context.short_coverage_block.strip()
        if context.short_coverage_block and context.short_coverage_block.strip()
        else "- Not available"
    )
    brief_block = context.candidate_brief_block.strip() if context.candidate_brief_block and context.candidate_brief_block.strip() else "No brief available - use the summaries below as the primary context and keep probing grounded in them."

    return (
        "PRIMARY GUIDANCE ORDER:\n"
        "- Use the candidate brief first.\n"
        "- Use the summaries below to confirm, compress, and prioritize.\n"
        "- Use the coverage list to avoid blind spots.\n\n"
        "SOURCE EXTRACTION RULES:\n"
        "- Read the candidate summary, JD summary, and screening summary as source documents.\n"
        "- Extract concrete facts before deciding what to probe next.\n"
        "- Prefer the most specific source when the same fact appears in more than one place.\n"
        "- Never invent skills, projects, titles, or risks that are not supported by the summaries.\n\n"
        f"ROLE INTELLIGENCE\n{context.role_intelligence_block.strip()}\n\n"
        f"{context.candidate_summary_block.strip()}\n\n"
        f"{context.jd_summary_block.strip()}\n\n"
        f"{context.screening_summary_block.strip()}\n\n"
        f"PERSONALIZED INTERVIEW BRIEF\n{brief_block}\n\n"
        f"SHORT MANDATORY COVERAGE LIST\n{coverage_block}"
    )


def refresh_candidate_band_context(context: CandidateBandContext) -> CandidateBandContext:
    context.term_alias_hints = build_term_alias_hints(
        context.candidate_summary_block,
        context.jd_summary_block,
        context.screening_summary_block,
        context.candidate_brief_block,
    )
    context.role_intelligence_block = context.role_layer
    if context.term_alias_hints:
        context.role_intelligence_block = (
            f"{context.role_layer}\n\nTERM RECOGNITION HINTS:\n{context.term_alias_hints}"
        )
    context.live_prompt_context = build_live_prompt_context(context)
    return context


def extract_brief_section(brief_text: str, section_title: str) -> str:
    lines = brief_text.splitlines()
    target = section_title.strip().upper().rstrip(":")
    capture = False
    collected: list[str] = []

    for line in lines:
        stripped = line.strip()
        normalized = stripped.rstrip(":").upper()

        if not capture:
            if normalized == target:
                capture = True
                if ":" in stripped:
                    inline_value = stripped.split(":", 1)[1].strip()
                    if inline_value:
                        collected.append(inline_value)
            continue

        if stripped and stripped.endswith(":") and stripped.upper() == stripped and normalized != target:
            break

        if capture:
            collected.append(line.rstrip())

    return "\n".join(collected).strip()


def extract_smart_opening_question(brief_text: str) -> str:
    opening = extract_brief_section(brief_text, "SMART OPENING QUESTION")
    if opening:
        return opening
    return ""


def build_candidate_context_ready_message(
    *,
    context: CandidateBandContext,
    smart_opening_question: str,
) -> str:
    summary_block = context.candidate_summary_block.strip() or "Not available"
    opening_question = smart_opening_question.strip()
    opening_section = (
        f"SMART OPENING QUESTION:\n{opening_question}\n\n" if opening_question else ""
    )
    return (
        "[CANDIDATE CONTEXT READY]\n"
        "CANDIDATE PROFILE SUMMARY:\n"
        f"{summary_block}\n\n"
        f"{opening_section}"
        "Use this to shape the first real interview question naturally. "
        "Do not mention this note aloud."
    )


def remove_system_messages(chat_ctx, marker: str) -> None:
    messages = chat_ctx.messages() if callable(getattr(chat_ctx, "messages", None)) else chat_ctx.messages
    for old_msg in list(messages):
        if getattr(old_msg, "role", "") == "system" and marker in (getattr(old_msg, "content", "") or ""):
            try:
                messages.remove(old_msg)
            except (ValueError, AttributeError):
                pass


def build_cartesia_tts(
    language: str = "en",
    model: str = CARTESIA_MODEL,
    voice_id: str = CARTESIA_VOICE_ID,
    extra_kwargs: Optional[dict[str, Any]] = None,
):
    api_key = os.getenv("CARTESIA_API_KEY")
    if not api_key:
        raise RuntimeError("CARTESIA_API_KEY is not set")

    # Use LiveKit Inference Cartesia TTS and pass model-specific controls via
    # extra_kwargs, matching the documented Python API shape.
    tts_kwargs: dict[str, Any] = {
        "model": _normalize_cartesia_model(model),
        "voice": voice_id,
        "language": language,
        "api_key": api_key,
        "extra_kwargs": {
            "speed": 1.0,
            **(extra_kwargs or {}),
        },
    }
    return inference.TTS(**tts_kwargs)


def build_tts(
    language: str = "en", model: str = CARTESIA_MODEL, voice_id: str = CARTESIA_VOICE_ID
):
    primary_tts = build_cartesia_tts(language=language, model=model, voice_id=voice_id)
    fallback_tts = build_sarvam_tts(language=language)
    return lk_tts.FallbackAdapter([primary_tts, fallback_tts], max_retry_per_tts=1)


def build_sarvam_tts(
    language: str = "en-IN", model: str = "bulbul:v3", voice_id: str = "shubh"
):
    api_key = os.getenv("SARVAM_API_KEY")
    if not api_key:
        raise RuntimeError("SARVAM_API_KEY is not set")

    lang_map = {"hi": "hi-IN", "en": "en-IN"}
    mapped_lang = lang_map.get(language, language)

    tts_kwargs: dict = {
        "target_language_code": mapped_lang,
        "model": model,
        "speaker": voice_id,
        "api_key": api_key,
        # pace: valid for both v2 (0.3-3.0) and v3 (0.5-2.0). 1.0 = natural speed.
        "pace": 1.1,
        "speech_sample_rate": 22050,
        "output_audio_bitrate": "128k",
        "min_buffer_size": 50,
        "max_chunk_length": 150,
    }

    # bulbul:v2-only parameters - DO NOT pass these to v3, they will cause errors
    if "v2" in model:
        # pitch: -0.75 (deeper) to 0.75 (sharper). 0.0 = neutral.
        tts_kwargs["pitch"] = 0.0
        # loudness: 0.1 (quietest) to 3.0 (loudest). 1.0 = normal volume.
        tts_kwargs["loudness"] = 1.0
        # enable_preprocessing: expands numbers, dates, currencies for natural pronunciation.
        tts_kwargs["enable_preprocessing"] = True
    else:
        tts_kwargs["temperature"] = 0.6

    return sarvam.TTS(**tts_kwargs)


def build_stt(language_code: str = "en", model: str = STT_MODEL):
    """Build Deepgram Nova-3 STT with diarization and keyterm detection.

    - enable_diarization: Labels each speech segment with a speaker_id (e.g. 0, 1).
      If speaker_id > 0 appears during the candidate's turn it means a second
      person is speaking in the room - triggers a 'background_voice' proctor event.
    - keyterm: Deepgram Nova-3 specific feature that boosts transcription accuracy
      for these phrases. Even quiet whispers of "the answer is..." are captured.
    """
    stt_kwargs: dict[str, Any] = {
        "model": model,
        "smart_format": True,
        "language": language_code,
        "interim_results": True,
        "punctuate": True,
    }

    # Add diarization and keyterms only for Nova-3 models (not Sarvam/legacy).
    if "nova" in model.lower():
        stt_kwargs["keyterm"] = DEEPGRAM_KEYTERMS
        # Note: enable_diarization may not be supported in all livekit-plugins-deepgram
        # versions. We add it defensively and fall back gracefully if rejected.
        stt_kwargs["enable_diarization"] = True

    # livekit.plugins.deepgram versions differ in endpointing keyword support.
    # Try modern kwarg first, fall back to legacy, then fall back without diarization.
    for attempt in range(3):
        try:
            attempt_kwargs = dict(stt_kwargs)
            if attempt == 0:
                attempt_kwargs["endpointing_ms"] = 300
                logger.info(
                    "[STT] Building Deepgram STT with diarization + keyterms + endpointing_ms"
                )
            elif attempt == 1:
                attempt_kwargs["endpointing"] = 300
                logger.info(
                    "[STT] Falling back to Deepgram STT with diarization + keyterms + endpointing"
                )
            else:
                # Final fallback: strip diarization in case it's unsupported
                attempt_kwargs.pop("enable_diarization", None)
                attempt_kwargs.pop("keyterm", None)
                attempt_kwargs["endpointing_ms"] = 300
                logger.info(
                    "[STT] Final fallback: Deepgram STT without diarization/keyterms + endpointing_ms"
                )
            stt = deepgram.STT(**attempt_kwargs)
            logger.info(
                "[STT] Active Deepgram config: model=%s language=%s diarization=%s keyterms=%s endpointing=%s endpointing_ms=%s",
                attempt_kwargs.get("model"),
                attempt_kwargs.get("language"),
                bool(attempt_kwargs.get("enable_diarization", False)),
                bool(attempt_kwargs.get("keyterm")),
                attempt_kwargs.get("endpointing"),
                attempt_kwargs.get("endpointing_ms"),
            )
            return stt
        except TypeError as e:
            logger.warning(
                "[STT] Deepgram constructor rejected attempt %s with TypeError: %s",
                attempt + 1,
                e,
            )
            if attempt == 2:
                raise
            continue
        except Exception as e:
            logger.warning(
                "[STT] Deepgram constructor failed attempt %s with %s: %s",
                attempt + 1,
                type(e).__name__,
                e,
            )
            if attempt == 2:
                raise
            continue
    # Should be unreachable
    return deepgram.STT(**{"model": model, "language": language_code})


def build_sarvam_stt(language: str = "en-IN", model: str = "saaras:v3"):
    lang_map = {"hi": "hi-IN", "en": "en-IN", "en-US": "en-IN", "hi-IN": "hi-IN"}
    mapped_lang = lang_map.get(language, language)
    return sarvam.STT(language=mapped_lang, model=model)


def build_llm(model: str = LLM_MODEL, temperature: float = 0.6):
    # Temperature 0.6: produces more natural conversational variation while still respecting
    # accuracy discipline rules. Raised from 0.4 with the gpt-4o upgrade for warmer, more
    # human-feeling responses. Do not exceed 0.7 - hallucination risk increases above that.
    return openai.LLM(model=model, temperature=temperature)


def build_sarvam_llm(model: str = "sarvam-30b"):
    return sarvam.LLM(model=model)


def build_vad():
    return silero.VAD.load()


def prewarm(proc: JobProcess):
    logger.info("Prewarming worker process...")
    # Load VAD model (ONNX) - heaviest startup cost, must be synchronous
    proc.userdata["vad"] = build_vad()
    logger.info("VAD model prewarmed.")

    # Turn detector requires session context in some runtime modes.
    # Keep startup noise low and initialize it lazily in-session if needed.
    proc.userdata["turn_detector"] = None

    # Pre-instantiate default STT/TTS plugins so their internal HTTP sessions
    # and model configs are warm before the first job arrives.
    try:
        proc.userdata["default_stt"] = build_stt()
        logger.info("Default STT prewarmed.")
    except Exception as e:
        logger.warning(f"Failed to prewarm default STT: {e}")
    try:
        proc.userdata["default_tts"] = build_tts()
        logger.info("Default TTS prewarmed.")
    except Exception as e:
        logger.warning(f"Failed to prewarm default TTS: {e}")

    try:
        loop = asyncio.get_running_loop()
        db_pool_task = loop.create_task(_create_db_pool())
        proc.userdata["db_pool_init_task"] = db_pool_task

        def _store_db_pool(task: asyncio.Task[asyncpg.Pool]) -> None:
            try:
                proc.userdata["db_pool"] = task.result()
            except Exception as task_err:
                logger.warning(f"Database pool warmup failed: {task_err}")

        db_pool_task.add_done_callback(_store_db_pool)
        global _DB_POOL_INIT_TASK
        _DB_POOL_INIT_TASK = db_pool_task
        logger.info("Database pool warmup scheduled.")
    except RuntimeError:
        logger.info("No running event loop in prewarm; DB pool will initialize lazily.")


def normalize_postgres_dsn(conn_str: str) -> str:
    if conn_str.startswith("postgres://"):
        conn_str = conn_str.replace("postgres://", "postgresql://", 1)

    parsed = urlparse(conn_str)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))

    # psycopg2 doesn't support several Prisma/Neon query flags.
    for key in ("pgbouncer", "connection_limit", "pool_timeout", "schema"):
        query.pop(key, None)

    return urlunparse(parsed._replace(query=urlencode(query)))


async def _create_db_pool() -> asyncpg.Pool:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set")

    conn_str = normalize_postgres_dsn(DATABASE_URL)
    return await asyncpg.create_pool(
        conn_str,
        ssl=False,
        statement_cache_size=0,
        min_size=2,
        max_size=5,
    )


async def get_db_pool() -> asyncpg.Pool:
    global _DB_POOL, _DB_POOL_INIT_TASK

    if _DB_POOL is not None:
        return _DB_POOL

    if _DB_POOL_INIT_TASK is None:
        _DB_POOL_INIT_TASK = asyncio.create_task(_create_db_pool())

    try:
        _DB_POOL = await _DB_POOL_INIT_TASK
        return _DB_POOL
    except Exception:
        _DB_POOL_INIT_TASK = None
        raise


_USAGE_BUCKET_FIELDS: dict[str, tuple[tuple[str, str], ...]] = {
    "llm": (
        ("input_tokens", "inputTokens"),
        ("input_cached_tokens", "inputCachedTokens"),
        ("input_audio_tokens", "inputAudioTokens"),
        ("input_cached_audio_tokens", "inputCachedAudioTokens"),
        ("input_text_tokens", "inputTextTokens"),
        ("input_cached_text_tokens", "inputCachedTextTokens"),
        ("input_image_tokens", "inputImageTokens"),
        ("input_cached_image_tokens", "inputCachedImageTokens"),
        ("output_tokens", "outputTokens"),
        ("output_audio_tokens", "outputAudioTokens"),
        ("output_text_tokens", "outputTextTokens"),
        ("session_duration", "sessionDuration"),
    ),
    "tts": (
        ("input_tokens", "inputTokens"),
        ("output_tokens", "outputTokens"),
        ("characters_count", "charactersCount"),
        ("audio_duration", "audioDuration"),
    ),
    "stt": (
        ("input_tokens", "inputTokens"),
        ("output_tokens", "outputTokens"),
        ("audio_duration", "audioDuration"),
    ),
    "interruption": (("total_requests", "totalRequests"),),
}

_USAGE_TYPE_TO_BUCKET = {
    "llm_usage": "llm",
    "tts_usage": "tts",
    "stt_usage": "stt",
    "interruption_usage": "interruption",
}


def _empty_usage_bucket(kind: str) -> dict[str, Any]:
    return {
        "sessions": 0,
        "totals": {public_name: 0 for _, public_name in _USAGE_BUCKET_FIELDS[kind]},
        "byModel": {},
    }


def _coerce_jsonish(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


def summarize_session_usage(session_usage: AgentSessionUsage | None) -> dict[str, Any]:
    summary: dict[str, Any] = {
        kind: _empty_usage_bucket(kind) for kind in _USAGE_BUCKET_FIELDS
    }
    if not session_usage:
        return summary

    seen_kinds: set[str] = set()
    for item in getattr(session_usage, "model_usage", []) or []:
        kind = _USAGE_TYPE_TO_BUCKET.get(getattr(item, "type", ""))
        if not kind:
            continue

        seen_kinds.add(kind)
        provider = str(getattr(item, "provider", "") or "unknown")
        model = str(getattr(item, "model", "") or "unknown")
        model_key = f"{provider}:{model}"
        bucket = summary[kind]
        bucket["sessions"] = 1

        model_bucket = bucket["byModel"].setdefault(
            model_key,
            {
                "provider": provider,
                "model": model,
                "sessions": 0,
                **{public_name: 0 for _, public_name in _USAGE_BUCKET_FIELDS[kind]},
            },
        )
        model_bucket["sessions"] = 1

        for source_name, public_name in _USAGE_BUCKET_FIELDS[kind]:
            value = getattr(item, source_name, 0) or 0
            bucket["totals"][public_name] += value
            model_bucket[public_name] += value

    for kind in seen_kinds:
        summary[kind]["sessions"] = 1

    return summary


_OPENAI_MODEL_RATES: dict[str, dict[str, float]] = {
    "gpt-4o-mini": {"input": 0.15, "cached_input": 0.075, "output": 0.6},
    "gpt-4.1-mini": {"input": 0.4, "cached_input": 0.1, "output": 1.6},
    "gpt-4o": {"input": 2.5, "cached_input": 1.25, "output": 10.0},
    "gpt-4.1": {"input": 2.0, "cached_input": 0.5, "output": 8.0},
}

# TTS pricing controls (editable):
# - Sarvam: INR rates from provider docs, converted to USD using BILLING_INR_PER_USD.
# - Cartesia: default estimate in USD per 1M characters. Update via env as needed.
_BILLING_INR_PER_USD = float(os.environ.get("BILLING_INR_PER_USD", "83.0"))
_SARVAM_TTS_INR_PER_10K_CHARS: dict[str, float] = {
    "bulbul:v3": 30.0,
    "bulbul:v2": 15.0,
}
_CARTESIA_TTS_DEFAULT_USD_PER_MILLION_CHARS = float(
    os.environ.get("CARTESIA_TTS_USD_PER_MILLION_CHARS", "30.0")
)
_SARVAM_STT_INR_PER_HOUR: dict[str, float] = {
    "saaras:v3": 30.0,
}
_DEEPGRAM_STT_USD_PER_MIN: dict[str, float] = {
    "nova-3": 0.0077,
    "nova-3-general": 0.0077,
}


def _empty_billing_feature() -> dict[str, Any]:
    return {
        "runs": 0,
        "inputTokens": 0,
        "cachedInputTokens": 0,
        "outputTokens": 0,
        "sessionDuration": 0,
        "costUsd": 0.0,
        "ttsRuns": 0,
        "ttsCharacters": 0,
        "ttsCostUsd": 0.0,
        "sttRuns": 0,
        "sttAudioSeconds": 0.0,
        "sttCostUsd": 0.0,
        "byModel": {},
        "ttsByModel": {},
        "sttByModel": {},
    }


def _coerce_billing_metrics(value: Any) -> dict[str, Any]:
    features = [
        "interview",
        "resumeExtraction",
        "jdExtraction",
        "chatbot",
        "resumeReport",
        "interviewReport",
        "general",
    ]
    out = {feature: _empty_billing_feature() for feature in features}
    incoming = _coerce_jsonish(value)
    for feature in features:
        src = _coerce_jsonish(incoming.get(feature))
        if not src:
            continue
        dst = out[feature]
        dst["runs"] = int(src.get("runs", 0))
        dst["inputTokens"] = int(src.get("inputTokens", 0))
        dst["cachedInputTokens"] = int(src.get("cachedInputTokens", 0))
        dst["outputTokens"] = int(src.get("outputTokens", 0))
        dst["sessionDuration"] = float(src.get("sessionDuration", 0))
        dst["costUsd"] = float(src.get("costUsd", 0))
        dst["ttsRuns"] = int(src.get("ttsRuns", 0))
        dst["ttsCharacters"] = int(src.get("ttsCharacters", 0))
        dst["ttsCostUsd"] = float(src.get("ttsCostUsd", 0))
        dst["sttRuns"] = int(src.get("sttRuns", 0))
        dst["sttAudioSeconds"] = float(src.get("sttAudioSeconds", 0))
        dst["sttCostUsd"] = float(src.get("sttCostUsd", 0))
        by_model = _coerce_jsonish(src.get("byModel"))
        dst["byModel"] = by_model
        tts_by_model = _coerce_jsonish(src.get("ttsByModel"))
        dst["ttsByModel"] = tts_by_model
        stt_by_model = _coerce_jsonish(src.get("sttByModel"))
        dst["sttByModel"] = stt_by_model
    return out


def _estimate_openai_cost(model_name: str, input_tokens: int, cached_tokens: int, output_tokens: int) -> float:
    rates = _OPENAI_MODEL_RATES.get(model_name.strip().lower())
    if not rates:
        return 0.0

    input_tokens = max(0, int(input_tokens or 0))
    output_tokens = max(0, int(output_tokens or 0))
    cached_tokens = max(0, min(int(cached_tokens or 0), input_tokens))
    uncached_tokens = max(0, input_tokens - cached_tokens)

    return (
        (uncached_tokens / 1_000_000.0) * rates["input"]
        + (cached_tokens / 1_000_000.0) * rates["cached_input"]
        + (output_tokens / 1_000_000.0) * rates["output"]
    )


def _normalize_tts_model_name(model_name: str) -> str:
    return str(model_name or "").strip().lower()


def _estimate_tts_cost_usd(provider_name: str, model_name: str, characters: int) -> float:
    chars = max(0, int(characters or 0))
    if chars <= 0:
        return 0.0

    provider = str(provider_name or "").strip().upper()
    normalized_model = _normalize_tts_model_name(model_name)

    if provider == "SARVAM":
        inr_per_10k = _SARVAM_TTS_INR_PER_10K_CHARS.get(normalized_model)
        if inr_per_10k is None:
            # Fallback to the latest default when an unknown Bulbul variant is configured.
            inr_per_10k = _SARVAM_TTS_INR_PER_10K_CHARS["bulbul:v3"]
        inr_cost = (chars / 10_000.0) * inr_per_10k
        return inr_cost / max(_BILLING_INR_PER_USD, 1e-6)

    if provider == "CARTESIA":
        return (chars / 1_000_000.0) * _CARTESIA_TTS_DEFAULT_USD_PER_MILLION_CHARS

    return 0.0


def _normalize_stt_model_name(model_name: str) -> str:
    return str(model_name or "").strip().lower()


def _estimate_stt_cost_usd(provider_name: str, model_name: str, audio_seconds: float) -> float:
    seconds = max(0.0, float(audio_seconds or 0.0))
    if seconds <= 0:
        return 0.0

    provider = str(provider_name or "").strip().upper()
    normalized_model = _normalize_stt_model_name(model_name)

    if provider == "SARVAM":
        inr_per_hour = _SARVAM_STT_INR_PER_HOUR.get(normalized_model)
        if inr_per_hour is None:
            inr_per_hour = _SARVAM_STT_INR_PER_HOUR["saaras:v3"]
        inr_cost = (seconds / 3600.0) * inr_per_hour
        return inr_cost / max(_BILLING_INR_PER_USD, 1e-6)

    if provider == "DEEPGRAM":
        usd_per_min = _DEEPGRAM_STT_USD_PER_MIN.get(normalized_model)
        if usd_per_min is None:
            # Default to Nova-3 monolingual pricing for now.
            usd_per_min = _DEEPGRAM_STT_USD_PER_MIN["nova-3"]
        return (seconds / 60.0) * usd_per_min

    return 0.0


def merge_interview_billing(
    existing: dict[str, Any],
    session_summary: dict[str, Any],
    tts_config: Optional[dict[str, Any]] = None,
    stt_config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    merged = dict(existing)
    billing = _coerce_billing_metrics(merged.get("billing"))

    llm_summary = _coerce_jsonish(session_summary.get("llm"))
    llm_totals = _coerce_jsonish(llm_summary.get("totals"))
    llm_by_model = _coerce_jsonish(llm_summary.get("byModel"))
    tts_summary = _coerce_jsonish(session_summary.get("tts"))
    tts_totals = _coerce_jsonish(tts_summary.get("totals"))
    tts_by_model = _coerce_jsonish(tts_summary.get("byModel"))
    stt_summary = _coerce_jsonish(session_summary.get("stt"))
    stt_totals = _coerce_jsonish(stt_summary.get("totals"))
    stt_by_model = _coerce_jsonish(stt_summary.get("byModel"))

    llm_has_usage = bool(llm_by_model) or bool(llm_totals)
    tts_total_chars = int(
        tts_totals.get("charactersCount", 0) or tts_totals.get("inputTokens", 0) or 0
    )
    tts_has_usage = bool(tts_by_model) or tts_total_chars > 0
    stt_total_audio_seconds = float(stt_totals.get("audioDuration", 0) or 0.0)
    stt_has_usage = bool(stt_by_model) or stt_total_audio_seconds > 0
    if not llm_has_usage and not tts_has_usage and not stt_has_usage:
        merged["billing"] = billing
        return merged

    interview_bucket = billing["interview"]

    if llm_has_usage:
        interview_bucket["runs"] = int(interview_bucket.get("runs", 0)) + 1
        interview_bucket["inputTokens"] = int(interview_bucket.get("inputTokens", 0)) + int(
            llm_totals.get("inputTokens", 0) or 0
        )
        interview_bucket["cachedInputTokens"] = int(
            interview_bucket.get("cachedInputTokens", 0)
        ) + int(llm_totals.get("inputCachedTokens", 0) or 0)
        interview_bucket["outputTokens"] = int(interview_bucket.get("outputTokens", 0)) + int(
            llm_totals.get("outputTokens", 0) or 0
        )
        interview_bucket["sessionDuration"] = float(
            interview_bucket.get("sessionDuration", 0)
        ) + float(llm_totals.get("sessionDuration", 0) or 0)

        by_model = _coerce_jsonish(interview_bucket.get("byModel"))
        session_cost = 0.0
        for model_key, raw in llm_by_model.items():
            model_row = _coerce_jsonish(raw)
            model_name = str(model_row.get("model", "") or "unknown").strip()
            input_tokens = int(model_row.get("inputTokens", 0) or 0)
            cached_tokens = int(model_row.get("inputCachedTokens", 0) or 0)
            output_tokens = int(model_row.get("outputTokens", 0) or 0)
            session_duration = float(model_row.get("sessionDuration", 0) or 0)
            model_cost = _estimate_openai_cost(
                model_name, input_tokens, cached_tokens, output_tokens
            )
            session_cost += model_cost

            current = _coerce_jsonish(by_model.get(model_key))
            current["runs"] = int(current.get("runs", 0)) + 1
            current["inputTokens"] = int(current.get("inputTokens", 0)) + input_tokens
            current["cachedInputTokens"] = int(current.get("cachedInputTokens", 0)) + cached_tokens
            current["outputTokens"] = int(current.get("outputTokens", 0)) + output_tokens
            current["sessionDuration"] = float(current.get("sessionDuration", 0)) + session_duration
            current["costUsd"] = float(current.get("costUsd", 0.0)) + model_cost
            by_model[model_key] = current

        interview_bucket["byModel"] = by_model
        interview_bucket["costUsd"] = float(interview_bucket.get("costUsd", 0.0)) + session_cost

    session_tts_chars = 0
    session_tts_cost = 0.0
    tts_by_model_bucket = _coerce_jsonish(interview_bucket.get("ttsByModel"))
    default_tts_provider = str((tts_config or {}).get("provider", "") or "").strip().upper()
    default_tts_model = str((tts_config or {}).get("model", "") or "").strip()

    for _, raw in tts_by_model.items():
        model_row = _coerce_jsonish(raw)
        provider = str(model_row.get("provider", "") or default_tts_provider).strip().upper()
        model_name = str(model_row.get("model", "") or default_tts_model).strip()
        if provider not in {"SARVAM", "CARTESIA"} and default_tts_provider in {"SARVAM", "CARTESIA"}:
            provider = default_tts_provider
        if (not model_name or model_name == "unknown") and default_tts_model:
            model_name = default_tts_model
        chars = int(model_row.get("charactersCount", 0) or model_row.get("inputTokens", 0) or 0)
        if chars <= 0:
            continue
        session_tts_chars += chars
        model_cost = _estimate_tts_cost_usd(provider, model_name, chars)
        session_tts_cost += model_cost

        model_key = f"{provider.lower() or 'unknown'}:{_normalize_tts_model_name(model_name) or 'unknown'}"
        current = _coerce_jsonish(tts_by_model_bucket.get(model_key))
        current["provider"] = provider or "UNKNOWN"
        current["model"] = model_name or "unknown"
        current["runs"] = int(current.get("runs", 0)) + 1
        current["characters"] = int(current.get("characters", 0)) + chars
        current["costUsd"] = float(current.get("costUsd", 0.0)) + model_cost
        tts_by_model_bucket[model_key] = current

    if session_tts_chars == 0:
        fallback_chars = int(
            tts_totals.get("charactersCount", 0) or tts_totals.get("inputTokens", 0) or 0
        )
        if fallback_chars > 0:
            session_tts_chars = fallback_chars
            provider = default_tts_provider or "UNKNOWN"
            model_name = default_tts_model or "unknown"
            model_cost = _estimate_tts_cost_usd(provider, model_name, fallback_chars)
            session_tts_cost += model_cost

            model_key = (
                f"{provider.lower() or 'unknown'}:{_normalize_tts_model_name(model_name) or 'unknown'}"
            )
            current = _coerce_jsonish(tts_by_model_bucket.get(model_key))
            current["provider"] = provider
            current["model"] = model_name
            current["runs"] = int(current.get("runs", 0)) + 1
            current["characters"] = int(current.get("characters", 0)) + fallback_chars
            current["costUsd"] = float(current.get("costUsd", 0.0)) + model_cost
            tts_by_model_bucket[model_key] = current

    if session_tts_chars > 0:
        interview_bucket["ttsRuns"] = int(interview_bucket.get("ttsRuns", 0)) + 1
        interview_bucket["ttsCharacters"] = int(interview_bucket.get("ttsCharacters", 0)) + session_tts_chars
        interview_bucket["ttsCostUsd"] = float(interview_bucket.get("ttsCostUsd", 0.0)) + session_tts_cost
        interview_bucket["ttsByModel"] = tts_by_model_bucket

    session_stt_seconds = 0.0
    session_stt_cost = 0.0
    stt_by_model_bucket = _coerce_jsonish(interview_bucket.get("sttByModel"))
    default_stt_provider = str((stt_config or {}).get("provider", "") or "").strip().upper()
    default_stt_model = str((stt_config or {}).get("model", "") or "").strip()

    for _, raw in stt_by_model.items():
        model_row = _coerce_jsonish(raw)
        provider = str(model_row.get("provider", "") or default_stt_provider).strip().upper()
        model_name = str(model_row.get("model", "") or default_stt_model).strip()
        if provider not in {"SARVAM", "DEEPGRAM"} and default_stt_provider in {"SARVAM", "DEEPGRAM"}:
            provider = default_stt_provider
        if (not model_name or model_name == "unknown") and default_stt_model:
            model_name = default_stt_model

        seconds = float(model_row.get("audioDuration", 0) or 0.0)
        if seconds <= 0:
            continue

        session_stt_seconds += seconds
        model_cost = _estimate_stt_cost_usd(provider, model_name, seconds)
        session_stt_cost += model_cost

        model_key = f"{provider.lower() or 'unknown'}:{_normalize_stt_model_name(model_name) or 'unknown'}"
        current = _coerce_jsonish(stt_by_model_bucket.get(model_key))
        current["provider"] = provider or "UNKNOWN"
        current["model"] = model_name or "unknown"
        current["runs"] = int(current.get("runs", 0)) + 1
        current["audioSeconds"] = float(current.get("audioSeconds", 0.0)) + seconds
        current["costUsd"] = float(current.get("costUsd", 0.0)) + model_cost
        stt_by_model_bucket[model_key] = current

    if session_stt_seconds == 0 and stt_total_audio_seconds > 0:
        session_stt_seconds = stt_total_audio_seconds
        provider = default_stt_provider or "UNKNOWN"
        model_name = default_stt_model or "unknown"
        model_cost = _estimate_stt_cost_usd(provider, model_name, stt_total_audio_seconds)
        session_stt_cost += model_cost

        model_key = f"{provider.lower() or 'unknown'}:{_normalize_stt_model_name(model_name) or 'unknown'}"
        current = _coerce_jsonish(stt_by_model_bucket.get(model_key))
        current["provider"] = provider
        current["model"] = model_name
        current["runs"] = int(current.get("runs", 0)) + 1
        current["audioSeconds"] = float(current.get("audioSeconds", 0.0)) + stt_total_audio_seconds
        current["costUsd"] = float(current.get("costUsd", 0.0)) + model_cost
        stt_by_model_bucket[model_key] = current

    if session_stt_seconds > 0:
        interview_bucket["sttRuns"] = int(interview_bucket.get("sttRuns", 0)) + 1
        interview_bucket["sttAudioSeconds"] = float(interview_bucket.get("sttAudioSeconds", 0.0)) + session_stt_seconds
        interview_bucket["sttCostUsd"] = float(interview_bucket.get("sttCostUsd", 0.0)) + session_stt_cost
        interview_bucket["sttByModel"] = stt_by_model_bucket

    billing["interview"] = interview_bucket
    merged["billing"] = billing
    return merged


def _extract_openai_completion_usage(completion: Any) -> dict[str, Any]:
    usage = getattr(completion, "usage", None)
    prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
    completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
    prompt_details = getattr(usage, "prompt_tokens_details", None)
    cached_tokens = int(getattr(prompt_details, "cached_tokens", 0) or 0)
    model_name = str(getattr(completion, "model", "") or LLM_MODEL)
    return {
        "model": model_name,
        "inputTokens": prompt_tokens,
        "cachedInputTokens": cached_tokens,
        "outputTokens": completion_tokens,
    }


def merge_manual_billing_usage(
    existing: dict[str, Any], feature: str, usage: dict[str, Any]
) -> dict[str, Any]:
    merged = dict(existing)
    billing = _coerce_billing_metrics(merged.get("billing"))
    if feature not in billing:
        feature = "general"

    model_name = str(usage.get("model", "unknown") or "unknown")
    model_key = f"openai:{model_name}"
    input_tokens = int(usage.get("inputTokens", 0) or 0)
    cached_tokens = int(usage.get("cachedInputTokens", 0) or 0)
    output_tokens = int(usage.get("outputTokens", 0) or 0)
    session_duration = float(usage.get("sessionDuration", 0) or 0)
    model_cost = _estimate_openai_cost(model_name, input_tokens, cached_tokens, output_tokens)

    bucket = billing[feature]
    bucket["runs"] = int(bucket.get("runs", 0)) + 1
    bucket["inputTokens"] = int(bucket.get("inputTokens", 0)) + input_tokens
    bucket["cachedInputTokens"] = int(bucket.get("cachedInputTokens", 0)) + cached_tokens
    bucket["outputTokens"] = int(bucket.get("outputTokens", 0)) + output_tokens
    bucket["sessionDuration"] = float(bucket.get("sessionDuration", 0)) + session_duration
    bucket["costUsd"] = float(bucket.get("costUsd", 0.0)) + model_cost

    by_model = _coerce_jsonish(bucket.get("byModel"))
    current = _coerce_jsonish(by_model.get(model_key))
    current["runs"] = int(current.get("runs", 0)) + 1
    current["inputTokens"] = int(current.get("inputTokens", 0)) + input_tokens
    current["cachedInputTokens"] = int(current.get("cachedInputTokens", 0)) + cached_tokens
    current["outputTokens"] = int(current.get("outputTokens", 0)) + output_tokens
    current["sessionDuration"] = float(current.get("sessionDuration", 0)) + session_duration
    current["costUsd"] = float(current.get("costUsd", 0.0)) + model_cost
    by_model[model_key] = current

    bucket["byModel"] = by_model
    billing[feature] = bucket
    merged["billing"] = billing
    return merged


async def persist_org_manual_billing_usage(
    org_id: Optional[str], feature: str, usage: dict[str, Any]
) -> None:
    if not org_id or not DATABASE_URL:
        return
    if not usage:
        return

    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    """
                    SELECT COALESCE("usageMetrics", '{}'::jsonb) AS "usageMetrics"
                    FROM "Organization"
                    WHERE id = $1
                    FOR UPDATE
                    """,
                    org_id,
                )
                if not row:
                    return

                existing_metrics = _coerce_jsonish(row["usageMetrics"])
                merged_metrics = merge_manual_billing_usage(existing_metrics, feature, usage)
                await conn.execute(
                    """
                    UPDATE "Organization"
                    SET "usageMetrics" = $1::jsonb,
                        "updatedAt" = NOW()
                    WHERE id = $2
                    """,
                    json.dumps(merged_metrics),
                    org_id,
                )
    except Exception as e:
        logger.error(f"[USAGE] Failed to save manual billing usage for {org_id}: {e}")


async def persist_org_usage_metrics(
    org_id: Optional[str],
    session_usage: AgentSessionUsage | None,
    tts_provider: Optional[str] = None,
    tts_model: Optional[str] = None,
    stt_provider: Optional[str] = None,
    stt_model: Optional[str] = None,
):
    if not org_id or not DATABASE_URL or session_usage is None:
        return

    session_summary = summarize_session_usage(session_usage)
    if not any(bucket.get("sessions") for bucket in session_summary.values()):
        return

    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    """
                    SELECT COALESCE("usageMetrics", '{}'::jsonb) AS "usageMetrics"
                    FROM "Organization"
                    WHERE id = $1
                    FOR UPDATE
                    """,
                    org_id,
                )
                if not row:
                    logger.warning(f"[USAGE] No organization found for usage metrics save: {org_id}")
                    return

                existing_metrics = _coerce_jsonish(row["usageMetrics"])
                merged_metrics = dict(existing_metrics)
                merged_livekit = _coerce_jsonish(merged_metrics.get("livekit"))
                for kind, kind_summary in session_summary.items():
                    if not isinstance(kind_summary, dict):
                        continue

                    existing_bucket = _coerce_jsonish(merged_livekit.get(kind))
                    if not existing_bucket:
                        existing_bucket = _empty_usage_bucket(kind)

                    existing_bucket["sessions"] = int(existing_bucket.get("sessions", 0)) + int(
                        kind_summary.get("sessions", 0)
                    )

                    existing_totals = existing_bucket.setdefault(
                        "totals", {public_name: 0 for _, public_name in _USAGE_BUCKET_FIELDS[kind]}
                    )
                    source_totals = kind_summary.get("totals", {})
                    for _, public_name in _USAGE_BUCKET_FIELDS[kind]:
                        existing_totals[public_name] = existing_totals.get(public_name, 0) + source_totals.get(
                            public_name, 0
                        )

                    existing_by_model = existing_bucket.setdefault("byModel", {})
                    for model_key, model_summary in kind_summary.get("byModel", {}).items():
                        current_model = _coerce_jsonish(existing_by_model.get(model_key))
                        if not current_model:
                            current_model = {
                                "provider": model_summary.get("provider", "unknown"),
                                "model": model_summary.get("model", "unknown"),
                                "sessions": 0,
                                **{public_name: 0 for _, public_name in _USAGE_BUCKET_FIELDS[kind]},
                            }

                        current_model["sessions"] = int(current_model.get("sessions", 0)) + int(
                            model_summary.get("sessions", 0)
                        )
                        for _, public_name in _USAGE_BUCKET_FIELDS[kind]:
                            current_model[public_name] = current_model.get(public_name, 0) + model_summary.get(
                                public_name, 0
                            )
                        existing_by_model[model_key] = current_model

                    existing_bucket["updatedAt"] = time.time()
                    merged_livekit[kind] = existing_bucket

                merged_metrics["livekit"] = merged_livekit
                merged_metrics["updatedAt"] = time.time()
                merged_metrics = merge_interview_billing(
                    merged_metrics,
                    session_summary,
                    tts_config={"provider": tts_provider or "", "model": tts_model or ""},
                    stt_config={"provider": stt_provider or "", "model": stt_model or ""},
                )

                await conn.execute(
                    """
                    UPDATE "Organization"
                    SET "usageMetrics" = $1::jsonb,
                        "updatedAt" = NOW()
                    WHERE id = $2
                    """,
                    json.dumps(merged_metrics),
                    org_id,
                )

            logger.info(
                f"[USAGE] Saved LiveKit usage for org {org_id} "
                f"(llm={session_summary['llm']['totals'].get('inputTokens', 0) + session_summary['llm']['totals'].get('outputTokens', 0)} tokens, "
                f"stt={session_summary['stt']['totals'].get('audioDuration', 0)}s audio, "
                f"tts={session_summary['tts']['totals'].get('audioDuration', 0)}s audio; "
                f"billingInterviewCost~${merge_interview_billing({}, session_summary, {'provider': tts_provider or '', 'model': tts_model or ''}, {'provider': stt_provider or '', 'model': stt_model or ''}).get('billing', {}).get('interview', {}).get('costUsd', 0):.4f})"
            )
    except Exception as e:
        logger.error(f"[USAGE] Failed to save org usage metrics for {org_id}: {e}")


async def get_interview_context(app_id: str):
    """Fetches Candidate and Job Description context from PostgreSQL via asyncpg."""
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set")

    query = """
    SELECT a."fullName", d.title, d.role AS "role", d.description, d.skills, d."orgId" AS "orgId",
           d.location AS "driveLocation", d."interviewLanguage", d."interviewTime", d."interviewQuestions",
           COALESCE(d."ttsProvider", o."ttsProvider") AS "ttsProvider",
           COALESCE(d."cartesiaVoiceId", o."cartesiaVoiceId") AS "cartesiaVoiceId", o."cartesiaModel",
           o."sarvamModel", COALESCE(d."sarvamVoice", o."sarvamVoice") AS "sarvamVoice",
           COALESCE(d."aiName", 'Ishitha') AS "aiName", o.name AS "orgName", o.location AS "orgLocation",
           o."sttProvider", o."deepgramModel", o."sarvamSttModel",
           o."llmProvider", o."llmModel", o."llmTemperature"
    FROM "Application" a
    JOIN "Drive" d ON a."driveId" = d.id
    LEFT JOIN "Organization" o ON d."orgId" = o.id
    WHERE a.id = $1
    LIMIT 1
    """

    last_error: Exception | None = None
    for attempt in range(1, 6):
        try:
            pool = await get_db_pool()
            async with pool.acquire() as conn:
                row = await conn.fetchrow(query, app_id)
            if not row:
                raise RuntimeError(
                    f"No interview context found in DB for application {app_id}"
                )

            # Parse questions from JSON string if needed
            questions_raw = row["interviewQuestions"]
            questions = []
            if questions_raw:
                try:
                    questions = (
                        json.loads(questions_raw)
                        if isinstance(questions_raw, str)
                        else questions_raw
                    )
                except Exception:
                    questions = []

            return {
                "fullName": row["fullName"],
                "jobTitle": row["role"] or row["title"],
                "driveTitle": row["title"],
                "jd": f"Description: {row['description']}\nSkills: {row['skills']}",
                "orgId": row["orgId"],
                "orgName": row["orgName"],
                "orgLocation": row["orgLocation"],
                "driveLocation": row["driveLocation"],
                "language": row["interviewLanguage"],
                "timeLimit": row["interviewTime"],
                "questions": questions if isinstance(questions, list) else [],
                # Org model settings (DB only, no fallback defaults)
                "ttsProvider": row["ttsProvider"],
                "cartesiaVoiceId": row["cartesiaVoiceId"],
                "cartesiaModel": row["cartesiaModel"],
                "sarvamModel": row["sarvamModel"],
                "sarvamVoice": row["sarvamVoice"],
                "aiName": row["aiName"],
                "sttProvider": row["sttProvider"],
                "deepgramModel": row["deepgramModel"],
                "sarvamSttModel": row["sarvamSttModel"],
                "llmProvider": row["llmProvider"],
                "llmModel": row["llmModel"],
                "llmTemperature": row["llmTemperature"],
            }
        except Exception as e:
            last_error = e
            logger.error(
                f"Database error during context fetch (attempt {attempt}/5): {e}"
            )
            if attempt < 5:
                await asyncio.sleep(0.4 * attempt)

    raise RuntimeError(f"Failed to fetch interview context from DB: {last_error}")


async def persist_transcript(
    app_id: str,
    transcript_lines: list,
    start_time: Optional[float],
    proctoring_data: Optional[dict] = None,
    final_status: str = "COMPLETED",
    recruiter_summary: Optional[dict] = None,
):
    """Save transcript + duration + proctoring report to Interview table via asyncpg.

    Args:
        app_id: Application ID
        transcript_lines: List of transcript line strings
        start_time: Session start time (perf_counter)
        proctoring_data: Dict with role_category, candidate_band, suspicion_score, events, etc.
        final_status: Interview status ('COMPLETED', 'NO_SHOW', 'ABANDONED')
    """
    if not transcript_lines and final_status != "NO_SHOW":
        logger.info(
            "[TRANSCRIPT] No lines captured - skipping save to avoid overwriting existing data"
        )
        return

    if not DATABASE_URL:
        logger.warning("[TRANSCRIPT] No DATABASE_URL - skipping save")
        return
    try:
        full_text = "\n".join(transcript_lines) if transcript_lines else ""
        duration = int(time.time() - start_time) if start_time else 0
        interview_turns = build_interview_turns(transcript_lines)

        # Build proctoring report (Phase 5 audit trail)
        proctor_report = None
        if proctoring_data:
            proctor_report = {
                "role_category": proctoring_data.get("role_category"),
                "candidate_band": proctoring_data.get("candidate_band"),
                "total_turns": proctoring_data.get("total_turns", 0),
                "final_suspicion_score": proctoring_data.get("suspicion_score", 0),
                "final_mode": proctoring_data.get("current_mode", "normal"),
                "exit_reason": proctoring_data.get("exit_reason", "normal_completion"),
                "events": proctoring_data.get("events", []),
                "contradictions": proctoring_data.get("contradictions", []),
                "claim_index": proctoring_data.get("claim_index", {}),
                "contradiction_state": proctoring_data.get("contradiction_state", {}),
                "trust": recruiter_summary if recruiter_summary else {},
            }

        pool = await get_db_pool()
        async with pool.acquire() as conn:
            # Update Interview table with transcript, duration, status, and proctoring report
            await conn.execute(
                """
                UPDATE "Interview"
                SET
                    "interviewTranscript" = $1,
                    "interviewDuration"   = $2,
                    status                = $3,
                    "proctoringReport"    = $4,
                    "interviewTurns"      = $5,
                    "completedAt"         = NOW(),
                    "updatedAt"           = NOW()
                WHERE "applicationId" = $6
                """,
                full_text,
                duration,
                final_status,
                json.dumps(proctor_report) if proctor_report else None,
                json.dumps(interview_turns),
                app_id,
            )
            logger.info(
                f"[TRANSCRIPT] Saved {len(transcript_lines)} lines, "
                f"{duration}s duration, {len(interview_turns)} turn(s), status={final_status} for app {app_id}"
            )
    except Exception as e:
        logger.error(f"[TRANSCRIPT] DB save failed: {e}")


async def mark_interview_started(app_id: str):
    """Marks the application and interview as IN_PROGRESS via asyncpg."""
    if not DATABASE_URL:
        return
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            # Update Interview status
            await conn.execute(
                'UPDATE "Interview" SET status = $1, "startedAt" = NOW() WHERE "applicationId" = $2',
                "IN_PROGRESS",
                app_id,
            )
            await conn.execute(
                'UPDATE "Application" SET "interviewStatus" = $1, "updatedAt" = NOW() WHERE id = $2',
                "IN_PROGRESS",
                app_id,
            )
            logger.info(f"[INTERVIEW] App {app_id} marked as IN_PROGRESS.")
    except Exception as e:
        logger.error(f"[INTERVIEW] Failed to update application status to started: {e}")


async def persist_answer_scores(app_id: str, answer_scores: list[dict]) -> None:
    """Save structured answer quality scores to Interview.answerScores JSONB."""
    if not app_id or not DATABASE_URL or not answer_scores:
        return
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            # Compute aggregate metrics
            total_answers = len(answer_scores)
            avg_clarity = sum(s.get("clarity", 5) for s in answer_scores) / max(total_answers, 1)
            avg_depth = sum(s.get("depth", 5) for s in answer_scores) / max(total_answers, 1)
            avg_specificity = sum(s.get("specificity", 5) for s in answer_scores) / max(total_answers, 1)
            avg_grounding = sum(s.get("grounding", 5) for s in answer_scores) / max(total_answers, 1)
            avg_overall = sum(s.get("overall", 5) for s in answer_scores) / max(total_answers, 1)

            # Count signal/concern occurrences
            all_signals = {}
            all_concerns = {}
            for score in answer_scores:
                for sig in score.get("signals", []):
                    all_signals[sig] = all_signals.get(sig, 0) + 1
                for concern in score.get("concerns", []):
                    all_concerns[concern] = all_concerns.get(concern, 0) + 1

            answer_scores_payload = {
                "totalAnswers": total_answers,
                "averages": {
                    "clarity": round(avg_clarity, 2),
                    "depth": round(avg_depth, 2),
                    "specificity": round(avg_specificity, 2),
                    "grounding": round(avg_grounding, 2),
                    "overall": round(avg_overall, 2),
                },
                "signalCounts": all_signals,
                "concernCounts": all_concerns,
                "allAnswers": answer_scores,
            }

            await conn.execute(
                """
                UPDATE "Interview"
                SET "answerScores" = $1::jsonb,
                    "updatedAt" = NOW()
                WHERE "applicationId" = $2
                """,
                json.dumps(answer_scores_payload),
                app_id,
            )
            logger.info(
                f"[SCORE] Saved {total_answers} answer scores for {app_id}: "
                f"clarity={avg_clarity:.1f}, depth={avg_depth:.1f}, specificity={avg_specificity:.1f}, "
                f"grounding={avg_grounding:.1f}"
            )
    except Exception as e:
        logger.error(f"[SCORE] Failed to persist answer scores for {app_id}: {e}")


async def update_interview_status(app_id: str):
    """Marks the application as COMPLETED via asyncpg."""
    if not DATABASE_URL:
        return
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                'UPDATE "Application" SET "interviewStatus" = $1, "updatedAt" = NOW() WHERE id = $2',
                "COMPLETED",
                app_id,
            )
            await conn.execute(
                'UPDATE "Interview" SET status = $1, "completedAt" = NOW() WHERE "applicationId" = $2',
                "COMPLETED",
                app_id,
            )
            logger.info(f"[INTERVIEW] App {app_id} marked as COMPLETED.")
    except Exception as e:
        logger.error(f"[INTERVIEW] Failed to update interview status: {e}")


async def generate_interview_summary(
    app_id: str,
    transcript_lines: list,
    job_title: str,
    org_id: Optional[str] = None,
    llm_model: str = LLM_MODEL,
):
    """Generate a high-quality AI narrative summary after the interview completes."""
    if not transcript_lines or not os.environ.get("OPENAI_API_KEY") or not DATABASE_URL:
        logger.warning(
            "[SUMMARY] Skipping: missing transcript, OPENAI_API_KEY, or DATABASE_URL"
        )
        return

    try:
        client = AsyncOpenAI()
        transcript_text = "\n".join(transcript_lines)
        transcript_text = truncate_to_tokens(transcript_text, 2500)

        logger.info(f"[SUMMARY] Generating narrative summary for {app_id}...")
        completion = await client.chat.completions.create(
            model=llm_model,
            temperature=0.2,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a senior talent partner writing a confidential post-interview evaluation for the hiring team. "
                        "Your language must be professional, bias-free, and constructive at all times - never dismissive or harsh. "
                        "Analyze the provided interview transcript for the role of '{job_title}'. "
                        "Write a structured narrative evaluation (2-3 sentences) that covers: "
                        "(1) The candidate's key strengths with specific evidence from the conversation. "
                        "(2) Any gaps or areas of concern, written constructively - framed as 'areas to explore further' rather than weaknesses. "
                        "(3) How well the candidate's communication style, depth of knowledge, and attitude fit the role. "
                        "(4) A clear, final hiring recommendation (Strong Yes / Yes / Maybe / No) with a one-sentence justification. "
                        "RULES: Do not use JSON. Do not use numeric scores. Do not reveal the AI screening score. "
                        "Never use gender-biased language. Never make personal remarks. Focus only on professional evidence from the conversation."
                    ).format(job_title=job_title),
                },
                {"role": "user", "content": f"Interview Transcript:\n{transcript_text}"},
            ],
        )
        await persist_org_manual_billing_usage(
            org_id, "interview", _extract_openai_completion_usage(completion)
        )

        raw_summary = completion.choices[0].message.content
        summary_text = raw_summary.strip() if isinstance(raw_summary, str) else ""
        if not summary_text:
            logger.warning(
                f"[SUMMARY] Empty summary generated for {app_id}; skipping save"
            )
            return

        # Save to DB via shared pool
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE "Interview"
                SET "aiSummary" = $1
                WHERE "applicationId" = $2
                """,
                summary_text,
                app_id,
            )

        logger.info(f"[SUMMARY] Generated summary for {app_id}")

    except Exception as e:
        logger.error(f"[SUMMARY] Generation failed for {app_id}: {e}")


async def generate_interview_state_summary(
    transcript_lines: list,
    questions_list: str,
    candidate_name: str,
    job_title: str,
    client,
    org_id: Optional[str] = None,
    turn_count: int = 0,
    total_turns_expected: int = 20,
    llm_model: str = LLM_MODEL,
) -> str:
    """
    Generates a concise mid-interview state summary for dynamic context injection.
    Tells Ishita what she has covered, what gaps remain, and critically - whether
    she needs to move to a new topic NOW.
    Runs every 3 assistant turns as a background task.
    """
    if len(transcript_lines) < 4:
        return ""

    # Use the recent transcript for coverage/pace and the last 12 lines for stuck detection.
    last_lines = transcript_lines[-12:]
    transcript_text = "\n".join(transcript_lines[-40:])

    pct_done = int((turn_count / max(total_turns_expected, 1)) * 100)

    try:
        completion = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=0.1,
                max_tokens=500,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an interview supervisor monitoring a live AI interview. "
                            "Your job is to give Ishita (the AI interviewer) a DIRECT, ACTIONABLE status update. "
                            "Be blunt - this is an internal coaching note, not a polite summary. "
                            "Write in second person to Ishita. No filler. No pleasantries.\n\n"
                            "ALWAYS include ALL of these sections:\n\n"
                            "1. TOPIC STATUS: List each mandatory area as [COVERED], [THIN], or [UNTOUCHED]. "
                            "COVERED = candidate gave a substantive answer (3+ sentences or a specific real example with details). "
                            "THIN = topic was raised but answer was vague or surface-level. "
                            "UNTOUCHED = never raised.\n\n"
                            "2. STUCK ALERT: If Ishita has asked 3 or more follow-ups on the SAME topic without moving on, "
                            "say: 'MOVE ON NOW - too long on [topic]. Go to [next untouched area] immediately.'\n\n"
                            "3. NEXT ACTION: One specific instruction - exactly what Ishita should do or ask next. "
                            "If the last answer was DEEP (had real specifics, numbers, or tradeoffs), say 'DEPTH SIGNAL - go one level deeper on [topic] before moving on.' "
                            "If the last answer was SURFACE (vague, no specifics, no numbers), say 'SURFACE ANSWER - push specificity probe on [topic] before moving.' "
                            "Otherwise give standard coverage guidance.\n\n"
                            "4. PACE WARNING: If more than 60% of the interview is done and fewer than half the areas are covered, "
                            "say 'PACE CRITICAL - accelerate now.'\n\n"
                            "5. ANSWER DEPTH: Rate the candidate's most recent answer as one of: "
                            "[SURFACE] = generic, no specifics, no numbers, no proper nouns; "
                            "[SPECIFIC] = named a real project/tool/company OR gave a number; "
                            "[DEEP] = named specifics AND explained reasoning, tradeoff, or failure. "
                            "Output on its own line: 'ANSWER_DEPTH: [SURFACE|SPECIFIC|DEEP]'"
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"MANDATORY AREAS:\n{questions_list}\n\n"
                            f"CANDIDATE: {candidate_name} | ROLE: {job_title}\n"
                            f"INTERVIEW PROGRESS: ~{pct_done}% done (turn {turn_count})\n\n"
                            f"RECENT TRANSCRIPT (last 40 lines, for coverage/pace):\n{transcript_text}\n\n"
                            f"LAST 12 LINES (for stuck detection):\n{chr(10).join(last_lines)}"
                        ),
                    },
                ],
            ),
            timeout=10.0,
        )
        await persist_org_manual_billing_usage(
            org_id, "interview", _extract_openai_completion_usage(completion)
        )
        return completion.choices[0].message.content or ""
    except Exception as e:
        logger.warning(f"[STATE_INJECT] State summary generation failed: {e}")
        return ""


async def generate_candidate_brief(
    candidate_name: str,
    job_title: str,
    jd_block: str,
    resume_block: str,
    ai_report_block: str,
    questions_list: str,
    time_limit_mins: int,
    client,
    org_id: Optional[str] = None,
    llm_model: str = LLM_MODEL,
) -> str:
    """
    Pre-interview: generate a personalized interview plan from the candidate's actual
    resume, the JD, and the AI screening report. This becomes Ishita's private briefing -
    telling her exactly what to ask, in what order, tailored to this specific person.

    Returns a formatted brief string to inject into the system prompt.
    Falls back to empty string on failure (interview still works, just less personalized).
    """
    if resume_block == "No resume data provided." and ai_report_block == "No prior screening data.":
        return ""  # No data to work with - skip

    seniority_hint = ""
    resume_lower = resume_block.lower()
    years_patterns = ["fresher", "0 years", "0-1 year", "no experience", "final year", "graduate"]
    senior_patterns = ["5+ years", "7+ years", "10+ years", "senior", "lead", "manager", "head of", "director"]
    if any(p in resume_lower for p in years_patterns):
        seniority_hint = "This appears to be a FRESHER or early-career candidate. Prioritize academic projects, internships, and reasoning ability over real-world scale."
    elif any(p in resume_lower for p in senior_patterns):
        seniority_hint = "This is an EXPERIENCED candidate. Focus on scale, ownership, technical depth, and cross-functional impact. Skip basics."
    else:
        seniority_hint = "Mid-level candidate. Balance technical depth with growth trajectory and ownership."

    try:
        completion = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=0.2,
                max_tokens=1400,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a senior interview coach preparing a personalized interview brief for an AI interviewer named Ishita. "
                            "Your output is Ishita's private prep sheet - it tells her exactly what to ask, how to probe, and what hidden gaps to verify. "
                            "Be specific and direct. Reference actual items from the resume. Every section must be grounded in the real data provided.\n\n"
                            "Output format (use this exact structure, all sections required):\n\n"
                            "CANDIDATE PROFILE SUMMARY:\n"
                            "2-3 sentences: who this person is, their seniority level, and what stands out most (positive or concerning).\n\n"
                            "SMART OPENING QUESTION:\n"
                            "One highly specific question grounded in their actual resume - a real project, company, or skill they listed. "
                            "Not 'tell me about yourself'. Not generic. Reference something real from their background that connects to the JD.\n\n"
                            "INTERVIEW PLAN (ordered by priority):\n"
                            "List 4-6 specific questions Ishita should ask, each tied to either:\n"
                            "  (a) a skill/project/company from the resume vs. a JD requirement, or\n"
                            "  (b) a gap or thin area in the AI screening report.\n"
                            "Format each as: [TOPIC]: [specific question]. Vary types - technical depth, situational, ownership probe, behavioural.\n\n"
                            "RESUME-JD GAPS (hidden agenda - Ishita must never reveal these directly):\n"
                            "For each place where the JD requires something the resume does not clearly show:\n"
                            "  - JD requires: [what the role needs]\n"
                            "  - Resume shows: [what candidate has, or 'not mentioned']\n"
                            "  - Sideways probe: [a scenario or question that reveals depth WITHOUT asking directly. e.g. not 'do you know Kubernetes?' but 'walk me through how you would handle zero-downtime deploys across 10 services']\n"
                            "  - Strong answer sounds like: [what genuine knowledge would include - specific terms, constraints, tradeoffs]\n"
                            "  - Red flag answer: [what a name-dropper or faker would say]\n"
                            "List every significant gap. These are Ishita's hidden verification agenda.\n\n"
                            "PERSONALITY AND INTEREST SIGNALS:\n"
                            "Look for hobbies, side projects, volunteer work, or non-work activities in the resume. For each:\n"
                            "  - Signal: [what they listed]\n"
                            "  - Bridge question: [a natural question that connects this to a work insight - must sound like genuine curiosity, not a test]\n"
                            "  - Reveals: [what work trait or thinking style this may expose]\n"
                            "Example: chess -> 'when you are designing a system, do you find yourself thinking ahead to states that haven't happened yet?' -> reveals systems thinking and anticipation.\n"
                            "If no hobbies or interests are listed, skip this section.\n\n"
                            "TOOL/TECH VALIDATION FLAGS:\n"
                            "For each tool, platform, or technology the candidate claims to know:\n"
                            "  - Tool: [name]\n"
                            "  - Validation question: [one specific question that proves real depth vs name-dropping - must require hands-on experience to answer well]\n"
                            "If a tool sounds like a mispronunciation of a known tool, note the likely intended tool.\n\n"
                            "WATCH-OUTS:\n"
                            "2-3 red flags or thin areas from the resume or report that Ishita must probe carefully. Be blunt.\n\n"
                            "OWNERSHIP RISKS:\n"
                            "Note any resume language that suggests inflated ownership - exclusive use of 'we', no personal verbs, vague contribution descriptions, "
                            "titles that do not match the scope described. For each risk: name the claim and suggest the ownership probe question."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"CANDIDATE: {candidate_name}\n"
                            f"ROLE: {job_title}\n"
                            f"SENIORITY: {seniority_hint}\n"
                            f"TIME: {time_limit_mins} minutes\n\n"
                            f"JOB DESCRIPTION / REQUIREMENTS:\n{jd_block}\n\n"
                            f"CANDIDATE RESUME:\n{resume_block}\n\n"
                            f"AI SCREENING REPORT:\n{ai_report_block}\n\n"
                            f"MANDATORY AREAS TO COVER:\n{questions_list}"
                        ),
                    },
                ],
            ),
            timeout=12.0,
        )
        await persist_org_manual_billing_usage(
            org_id, "interview", _extract_openai_completion_usage(completion)
        )
        brief = completion.choices[0].message.content or ""
        return brief.strip()
    except Exception as e:
        logger.warning(f"[BRIEF] Candidate brief generation failed: {e}")
        return ""


async def score_answer_quality(
    candidate_answer: str,
    last_question: str,
    transcript_lines: list,
    client,
    org_id: Optional[str] = None,
    llm_model: str = LLM_MODEL,
) -> dict:
    """
    Structured answer quality scorer. Runs after every candidate response.
    Returns numeric and categorical scores across 4 dimensions.

    Score fields (0-10 each):
      clarity: How easy is the answer to understand? (0=confusing/rambling, 10=crystal clear)
      depth: How much reasoning/detail? (0=surface/generic, 10=deep thinking evident)
      specificity: Named things, numbers, dates, real examples? (0=all generic, 10=highly specific)
      grounding: Tied to real work/experience vs theory? (0=theoretical, 10=from lived experience)

    Additional fields:
      overall: Average of the four scores (0-10)
      signals: ["has_numbers", "has_names", "has_reasoning", "has_failure", "has_tradeoff"]
      concerns: ["vague", "rehearsed", "ownership_unclear", "contradiction", "incomplete"]
    """
    if not candidate_answer or not candidate_answer.strip():
        return {
            "clarity": 2, "depth": 0, "specificity": 0, "grounding": 0, "overall": 0.5,
            "signals": [], "concerns": ["empty_answer"],
            "turn": 0,
        }

    recent_context = "\n".join(transcript_lines[-8:]) if transcript_lines else ""

    try:
        completion = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=0.0,
                max_tokens=200,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Score a candidate's interview answer on 4 dimensions (0-10 each).\n"
                            "Output ONLY valid JSON with these exact fields:\n"
                            '{\n'
                            '  "clarity": 0-10,\n'
                            '  "depth": 0-10,\n'
                            '  "specificity": 0-10,\n'
                            '  "grounding": 0-10,\n'
                            '  "signals": ["list", "of", "observed", "strengths"],\n'
                            '  "concerns": ["list", "of", "observed", "weaknesses"]\n'
                            '}\n\n'
                            "SCORING GUIDE:\n"
                            "clarity (0-10): How easy to understand?\n"
                            "  0-2: Rambling, incoherent, hard to follow\n"
                            "  3-5: Somewhat clear but could be more direct\n"
                            "  6-8: Clear and well-structured\n"
                            "  9-10: Crystal clear, perfectly articulated\n\n"
                            "depth (0-10): How much reasoning/thinking shown?\n"
                            "  0-2: Surface-level, pure facts\n"
                            "  3-5: Some reasoning, but shallow\n"
                            "  6-8: Good reasoning, explores tradeoffs\n"
                            "  9-10: Deep thinking, systems thinking, anticipates implications\n\n"
                            "specificity (0-10): Real names, numbers, dates, examples?\n"
                            "  0-2: All generic, no proper nouns or numbers\n"
                            "  3-5: Some specifics but could be more concrete\n"
                            "  6-8: Named real projects, companies, or numbers\n"
                            "  9-10: Heavily grounded in specific details\n\n"
                            "grounding (0-10): Tied to real experience vs theory?\n"
                            "  0-2: Sounds theoretical, no lived experience evident\n"
                            "  3-5: Mix of theory and real experience\n"
                            "  6-8: Clearly from real work\n"
                            "  9-10: Rich, textured description of lived experience\n\n"
                            "signals: Strengths observed. Pick from:\n"
                            '  "has_numbers", "has_names", "has_reasoning", "has_failure", '
                            '"has_tradeoff", "has_ownership", "has_emotion", "has_learning"\n\n'
                            "concerns: Weaknesses observed. Pick from:\n"
                            '  "vague", "rehearsed", "ownership_unclear", "contradiction", '
                            '"incomplete", "generic", "bragging", "overly_cautious"'
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"QUESTION: {last_question}\n\n"
                            f"CANDIDATE ANSWER: {candidate_answer}\n\n"
                            f"RECENT CONTEXT:\n{recent_context}"
                        ),
                    },
                ],
            ),
            timeout=3.0,
        )
        await persist_org_manual_billing_usage(
            org_id, "interview", _extract_openai_completion_usage(completion)
        )
        raw = completion.choices[0].message.content or ""
        parsed = json.loads(raw.strip())
        # Validate and clamp scores
        for key in ("clarity", "depth", "specificity", "grounding"):
            parsed[key] = max(0, min(10, int(parsed.get(key, 5))))
        parsed["overall"] = (parsed["clarity"] + parsed["depth"] + parsed["specificity"] + parsed["grounding"]) / 4.0
        parsed["signals"] = parsed.get("signals", [])
        parsed["concerns"] = parsed.get("concerns", [])
        return parsed
    except asyncio.TimeoutError:
        logger.debug("[SCORE] Answer scorer timed out - returning neutral scores")
        return {
            "clarity": 5, "depth": 5, "specificity": 5, "grounding": 5, "overall": 5.0,
            "signals": [], "concerns": ["timeout"],
        }
    except Exception as e:
        logger.debug(f"[SCORE] Answer scorer failed: {e}")
        return {
            "clarity": 5, "depth": 5, "specificity": 5, "grounding": 5, "overall": 5.0,
            "signals": [], "concerns": ["error"],
        }


async def evaluate_answer_and_decide(
    candidate_answer: str,
    last_question: str,
    topic_follow_up_count: int,
    transcript_lines: list,
    client,
    org_id: Optional[str] = None,
    llm_model: str = LLM_MODEL,
) -> dict:
    """
    Per-turn answer evaluator. Runs after every candidate response, before Ishita speaks.
    Returns a structured decision: probe deeper OR move to next topic.

    Decision fields:
      action: "PROBE" | "MOVE_ON"
      probe_mode: "ownership" | "evidence" | "compression" | "depth" | "verification" |
                  "clarification" | "specificity" | "contradiction" | None
      reason: short internal note (not shown to candidate)
      depth_signal: "SURFACE" | "SPECIFIC" | "DEEP"
    """
    if not candidate_answer or not candidate_answer.strip():
        return {"action": "MOVE_ON", "probe_mode": None, "reason": "empty answer", "depth_signal": "SURFACE"}

    recent_context = "\n".join(transcript_lines[-10:]) if transcript_lines else ""

    try:
        completion = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=0.0,
                max_tokens=120,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an interview quality evaluator. Analyze a candidate's answer and decide "
                            "whether the interviewer should probe deeper or move to the next topic.\n\n"
                            "Output ONLY valid JSON with these exact fields:\n"
                            '{"action": "PROBE" or "MOVE_ON", '
                            '"probe_mode": "ownership" | "evidence" | "compression" | "depth" | "verification" | '
                            '"clarification" | "specificity" | "contradiction" | null, '
                            '"reason": "one short sentence", '
                            '"depth_signal": "SURFACE" | "SPECIFIC" | "DEEP"}\n\n'
                            "MOVE_ON when: answer has real specifics (names/numbers/dates), clear reasoning, "
                            "OR topic already had 3+ follow-ups, OR candidate said I don't know twice.\n"
                            "PROBE when: answer is vague, generic, no real example, no numbers, "
                            "uses only 'we' with no personal ownership, or sounds rehearsed.\n"
                            "probe_mode:\n"
                            "  ownership = 'we did' but unclear what they personally did\n"
                            "  evidence = missing concrete example, named project, or proof\n"
                            "  compression = answer collapses on a follow-up or loses sequence\n"
                            "  depth = has facts but no reasoning/tradeoff\n"
                            "  clarification = conflicts with something said earlier\n"
                            "  verification = polished answer, probe memory of the exact moment\n"
                            "  specificity = generic answer missing names/numbers/dates\n"
                            "  contradiction = alias for clarification when a mismatch is explicit\n"
                            "depth_signal: SURFACE=generic/vague, SPECIFIC=named real thing, DEEP=specifics+reasoning"
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"QUESTION ASKED: {last_question}\n\n"
                            f"CANDIDATE ANSWER: {candidate_answer}\n\n"
                            f"FOLLOW-UPS ALREADY ASKED ON THIS TOPIC: {topic_follow_up_count}\n\n"
                            f"RECENT CONVERSATION:\n{recent_context}"
                        ),
                    },
                ],
            ),
            timeout=4.0,
        )
        await persist_org_manual_billing_usage(
            org_id, "interview", _extract_openai_completion_usage(completion)
        )
        raw = completion.choices[0].message.content or ""
        parsed = json.loads(raw.strip())
        # Validate required fields
        if parsed.get("action") not in ("PROBE", "MOVE_ON"):
            parsed["action"] = "MOVE_ON"
        if parsed.get("depth_signal") not in ("SURFACE", "SPECIFIC", "DEEP"):
            parsed["depth_signal"] = "SURFACE"
        return parsed
    except asyncio.TimeoutError:
        logger.debug("[EVAL] Per-turn evaluator timed out - defaulting to MOVE_ON")
        return {"action": "MOVE_ON", "probe_mode": None, "reason": "timeout", "depth_signal": "SURFACE"}
    except Exception as e:
        logger.debug(f"[EVAL] Per-turn evaluator failed: {e}")
        return {"action": "MOVE_ON", "probe_mode": None, "reason": str(e), "depth_signal": "SURFACE"}


async def extract_claims(
    candidate_answer: str,
    turn: int,
    client,
    org_id: Optional[str] = None,
    llm_model: str = LLM_MODEL,
) -> list[dict]:
    """
    Extract verifiable factual claims from a single candidate answer.
    Returns a list of structured claim objects for cross-turn contradiction checking.

    Claim schema:
      {type, value, turn, quote, context}

    Tracked claim types:
      team_size            - number of people on the team
      years_experience     - total years in field/role
      tenure_at_company    - how long at a specific company
      role_title           - job title claimed
      project_ownership    - solo vs team, degree of ownership
      reporting_structure  - reports to / managed N people
      outcome_metric       - a specific result/number claimed
      tech_stack           - primary tools/stack claimed
      company_name         - employer or client name
      timeline             - when something happened
    """
    if not candidate_answer or len(candidate_answer.strip()) < 20:
        return []

    try:
        completion = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=0.0,
                max_tokens=300,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Extract verifiable factual claims from an interview answer. "
                            "Only extract claims that are specific and checkable - skip vague statements.\n\n"
                            "Output a JSON array. Each item has:\n"
                            '  "type": one of [team_size, years_experience, tenure_at_company, role_title, '
                            "project_ownership, reporting_structure, outcome_metric, tech_stack, company_name, timeline]\n"
                            '  "value": the specific claim value as a short string (e.g. "2 people", "5 years", "solo")\n'
                            '  "quote": the exact phrase from the answer that contains this claim (max 15 words)\n'
                            '  "context": which company/project this refers to (or "general" if unclear)\n\n'
                            "RULES:\n"
                            "- Only extract claims with specific values. Skip: 'a small team', 'a few years'.\n"
                            "- Include: 'team of 2', '5 years', 'I was the only engineer'.\n"
                            "- If no specific claims, return [].\n"
                            "- Maximum 5 claims per answer."
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"CANDIDATE ANSWER (turn {turn}):\n{candidate_answer}",
                    },
                ],
            ),
            timeout=3.0,
        )
        await persist_org_manual_billing_usage(
            org_id, "interview", _extract_openai_completion_usage(completion)
        )
        raw = completion.choices[0].message.content or "[]"
        claims = json.loads(raw.strip())
        if not isinstance(claims, list):
            return []
        # Attach turn number to each claim
        for claim in claims:
            claim["turn"] = turn
        return claims[:5]
    except Exception as e:
        logger.debug(f"[CLAIMS] Claim extraction failed at turn {turn}: {e}")
        return []


def check_contradiction(
    new_claim: dict,
    existing_claims_by_type: dict[str, list[dict]],
) -> Optional[dict]:
    """
    Compare a new claim against existing claims of the same type and context.
    Returns a contradiction dict if a conflict is found, else None.

    Contradiction conditions by type:
      team_size            - different numbers for same project/company
      years_experience     - values differ by >2 years
      tenure_at_company    - different durations for same company
      project_ownership    - "solo" vs "team" for same project
      reporting_structure  - different headcount for same role
      outcome_metric       - conflicting numbers for same metric
    """
    claim_type = new_claim.get("type")
    new_value = str(new_claim.get("value", "")).lower().strip()
    new_context = str(new_claim.get("context", "general")).lower().strip()
    new_turn = new_claim.get("turn", 0)

    if not claim_type or not new_value:
        return None

    for old in existing_claims_by_type.get(claim_type, []):
        old_context = str(old.get("context", "general")).lower().strip()
        # Only compare claims about the same context (same company/project)
        if new_context != "general" and old_context != "general" and new_context != old_context:
            continue

        old_value = str(old.get("value", "")).lower().strip()
        old_turn = old.get("turn", 0)

        if old_value == new_value:
            continue  # same claim, consistent

        # Extract numbers from values for numeric comparison
        def _extract_number(s: str) -> Optional[float]:
            m = re.search(r"(\d+(?:\.\d+)?)", s)
            return float(m.group(1)) if m else None

        new_num = _extract_number(new_value)
        old_num = _extract_number(old_value)

        is_contradiction = False

        if claim_type == "team_size":
            if new_num is not None and old_num is not None and abs(new_num - old_num) >= 3:
                is_contradiction = True
        elif claim_type == "years_experience":
            if new_num is not None and old_num is not None and abs(new_num - old_num) > 2:
                is_contradiction = True
        elif claim_type == "project_ownership":
            solo_words = {"solo", "alone", "only", "just me", "myself"}
            team_words = {"team", "we", "group", "together", "collective"}
            new_is_solo = any(w in new_value for w in solo_words)
            new_is_team = any(w in new_value for w in team_words)
            old_is_solo = any(w in old_value for w in solo_words)
            old_is_team = any(w in old_value for w in team_words)
            if (new_is_solo and old_is_team) or (new_is_team and old_is_solo):
                is_contradiction = True
        elif claim_type in ("tenure_at_company", "reporting_structure", "outcome_metric", "timeline"):
            if new_num is not None and old_num is not None and abs(new_num - old_num) / max(old_num, 1) > 0.4:
                is_contradiction = True
        else:
            # For role_title, tech_stack, company_name - flag only clear mismatches
            if new_value != old_value and new_num is None and old_num is None:
                # Only flag if values are clearly different (not just phrased differently)
                if len(set(new_value.split()) & set(old_value.split())) == 0:
                    is_contradiction = True

        if is_contradiction:
            return {
                "type": claim_type,
                "context": new_context,
                "old_turn": old_turn,
                "old_value": old.get("value"),
                "old_quote": old.get("quote", ""),
                "new_turn": new_turn,
                "new_value": new_claim.get("value"),
                "new_quote": new_claim.get("quote", ""),
                "detected_at": time.time(),
            }

    return None


async def notify_sync_engine(app_id: str):
    """
    Calls the Next.js API to trigger Pinecone indexing for this candidate.
    """
    try:
        # We use the internal URL. Localhost is fine for dev.
        url = f"{APP_BASE_URL}/api/admin/candidates/{app_id}/sync"

        def _post_sync_request() -> tuple[int, str]:
            request = urllib.request.Request(
                url,
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "hr-updates-agent/1.0",
                },
                data=b"{}",
            )
            with urllib.request.urlopen(request, timeout=10) as response:
                status = int(getattr(response, "status", response.getcode()))
                body = response.read().decode("utf-8", errors="replace")
                return status, body

        status, body = await asyncio.to_thread(_post_sync_request)
        logger.info(f"[SYNC] Notified sync engine for {app_id} status={status}")
        if body.strip():
            logger.debug(f"[SYNC] Response body for {app_id}: {body[:500]}")
    except Exception as e:
        logger.warning(f"[SYNC_ERROR] Failed to notify sync engine: {e}")


async def entrypoint(ctx: JobContext):
    entry_started_at = time.perf_counter()
    logger.info(f"Connecting to room {ctx.room.name}")

    # PRE-START CHECK: Do not join if another agent is already here
    for p in ctx.room.remote_participants.values():
        is_agent = (
            p.identity.startswith("AW_")
            or "agent" in p.identity.lower()
            or "agent" in (p.name or "").lower()
        )
        if is_agent:
            logger.warning(
                f"Another agent ({p.identity}) is already in the room. Self-destructing."
            )
            return

    # --- Fix 1: Session State ---
    transcript_lines: list[str] = []
    session_start_time: Optional[float] = None
    background_tasks: set[asyncio.Task[Any]] = set()

    def spawn_background_task(coro, label: str) -> asyncio.Task[Any]:
        task = asyncio.create_task(coro)
        background_tasks.add(task)

        def _on_done(done_task: asyncio.Task[Any]) -> None:
            background_tasks.discard(done_task)
            if done_task.cancelled():
                return
            try:
                err = done_task.exception()
            except Exception:
                return
            if err:
                logger.warning(f"[TASK] Background task '{label}' failed: {err}")

        task.add_done_callback(_on_done)
        return task

    def append_transcript_line(speaker: str, text: str) -> None:
        # Strip SSML-like tags (e.g., <emotion />, <prosody>) from the transcript
        text = re.sub(r"<[^>]+>", "", text).strip()

        clean = " ".join(text.split()).strip()
        if not clean:
            return
        line = f"{speaker}: {clean}"

        if not transcript_lines:
            transcript_lines.append(line)
            logger.debug(f"Transcript: {line}")
            return

        prev = transcript_lines[-1]
        if prev == line:
            return

        same_speaker_prefix = f"{speaker}: "
        if prev.startswith(same_speaker_prefix):
            prev_text = prev[len(same_speaker_prefix) :]
            if clean.startswith(prev_text) or prev_text.startswith(clean):
                # Replace evolving duplicate fragments with the longer final line.
                transcript_lines[-1] = line if len(clean) >= len(prev_text) else prev
                return

        transcript_lines.append(line)
        logger.debug(f"Transcript: {line}")

    # Room name is available before connecting - derive app_id early so we can
    # fire the DB fetch in parallel with the room connect handshake.
    app_id = ctx.room.name.replace("interview_", "")
    dispatch_metadata = parse_dispatch_metadata(getattr(ctx.job, "metadata", ""))
    session_log_context: dict[str, Any] = {
        "app_id": app_id,
        "room_name": ctx.room.name,
    }
    if dispatch_metadata:
        session_log_context.update({
            "dispatch_application_id": dispatch_metadata.get("applicationId", app_id),
            "dispatch_candidate_name": dispatch_metadata.get("candidateName"),
            "dispatch_role_label": dispatch_metadata.get("roleLabel"),
            "dispatch_time_limit_mins": dispatch_metadata.get("timeLimitMins"),
            "dispatch_room_name": dispatch_metadata.get("roomName", ctx.room.name),
        })
    ctx.log_context_fields = session_log_context
    _LOG_CONTEXT_FIELDS.set(session_log_context)

    # --- Real-time Proctoring Sync Helpers ---
    async def _report_proctoring_realtime(evt_type: str, reason: str, score_delta: int, sev: str = "medium"):
        """Persist a single violation to the DB in real-time."""
        if not DATABASE_URL: return
        try:
            pool = await get_db_pool()
            async with pool.acquire() as conn:
                # Append the new event to the existing proctoringReport.events JSONB array
                await conn.execute(
                    """
                    UPDATE "Interview"
                    SET "proctoringReport" = jsonb_set(
                        COALESCE("proctoringReport", '{"events": []}'::jsonb),
                        '{events}',
                        COALESCE("proctoringReport"->'events', '[]'::jsonb) || $1::jsonb
                    ),
                    "updatedAt" = NOW()
                    WHERE "applicationId" = $2
                    """,
                    json.dumps({
                        "eventType": evt_type,
                        "reason": reason,
                        "timestamp": int(time.time() * 1000),
                        "severity": sev,
                        "score_delta": score_delta
                    }),
                    app_id
                )
        except Exception as e:
            logger.warning(f"[PROCTOR] Real-time persistence failed: {e}")

    async def _signal_client_proctoring_violation(evt_type: str, reason: str, sev: str = "medium"):
        """Send a data packet back to the candidate UI to trigger a toast."""
        if not ctx.room.local_participant: return
        try:
            payload = json.dumps({
                "type": "proctoring_violation",
                "eventType": evt_type,
                "reason": reason,
                "severity": sev,
                "timestamp": int(time.time() * 1000)
            }).encode("utf-8")
            await ctx.room.local_participant.publish_data(payload, reliable=True)
        except Exception as e:
            logger.warning(f"[PROCTOR] Client signaling failed: {e}")

    async def _signal_client_interview_terminated(reason: str) -> None:
        """Tell the candidate UI to exit the live room and open the feedback screen."""
        if not ctx.room.local_participant:
            return
        try:
            payload = json.dumps({
                "type": "interview_terminated",
                "reason": reason,
                "timestamp": int(time.time() * 1000),
            }).encode("utf-8")
            await ctx.room.local_participant.publish_data(payload, reliable=True)
            logger.info(f"[INTERVIEW_END] termination signal sent: {reason}")
        except Exception as e:
            logger.warning(f"[INTERVIEW_END] Client termination signal failed: {e}")


    # Parallelize network-bound work: room connect + DB fetch run concurrently.
    async def connect_with_retry():
        for attempt in range(3):
            try:
                await ctx.connect()
                return None
            except Exception as e:
                if attempt == 2:
                    return e
                logger.warning(f"Connection attempt {attempt + 1} failed: {e}. Retrying in 2s...")
                await asyncio.sleep(2)
        return RuntimeError("Failed to connect after 3 attempts")

    connect_task = asyncio.create_task(connect_with_retry())
    context_task = asyncio.create_task(get_interview_context(app_id))
    connect_result, context_result = await asyncio.gather(
        connect_task,
        context_task,
        return_exceptions=True,
    )

    if isinstance(connect_result, Exception):
        raise connect_result

    if isinstance(context_result, Exception):
        logger.error(f"Failed to load interview context from DB: {context_result}")
        return

    if not isinstance(context_result, dict):
        logger.error(f"Invalid DB context payload type: {type(context_result)}")
        return

    context: dict[str, Any] = context_result

    # Read Room Metadata Context (available after connect)
    room_meta = {}
    try:
        if ctx.room.metadata:
            room_meta = json.loads(ctx.room.metadata)
    except Exception as e:
        logger.error(f"Failed to parse room metadata: {e}")

    extracted_details = room_meta.get("extractedDetails", "{}")
    structured_resume = room_meta.get("structuredResume", "{}")
    ai_report = room_meta.get("aiReport", "{}")

    def require_db_value(key: str, default: Any = None, required: bool = True):
        value = context.get(key)
        if value is None:
            if not required:
                return default
            raise RuntimeError(f"Missing required DB field: {key}")
        if isinstance(value, str) and not value.strip():
            if not required:
                return default
            raise RuntimeError(f"Missing required DB field: {key}")
        return value

    candidate_name = require_db_value("fullName")
    candidate_first_name = first_name_from_full_name(candidate_name)
    job_title = require_db_value("jobTitle")
    job_details = require_db_value("jd")
    interview_lang = require_db_value("language")
    time_limit_mins = int(require_db_value("timeLimit"))
    follow_up_depth = 3
    questions_raw = context.get("questions")
    custom_questions: list[Any] = (
        questions_raw if isinstance(questions_raw, list) else []
    )
    org_id = context.get("orgId")
    session_log_context.update(
        {
            "org_id": org_id,
            "org_name": _compact_optional(context.get("orgName")),
            "org_location": _compact_optional(context.get("orgLocation")),
            "drive_location": _compact_optional(context.get("driveLocation")),
            "candidate": candidate_name,
            "candidate_first_name": candidate_first_name,
            "job_title": job_title,
            "time_limit_mins": time_limit_mins,
        }
    )
    ctx.log_context_fields = session_log_context
    _LOG_CONTEXT_FIELDS.set(session_log_context)

    started_at = time.perf_counter()

    async def _log_shutdown(reason: str = "") -> None:
        elapsed_sec = round(time.perf_counter() - started_at, 1)
        logger.info(
            json.dumps(
                {
                    "event": "job_shutdown",
                    "reason": reason or "unknown",
                    "app_id": app_id,
                    "room_name": ctx.room.name,
                    "candidate": candidate_name,
                    "job_title": job_title,
                    "org_id": org_id,
                    "elapsed_sec": elapsed_sec,
                },
                sort_keys=True,
            )
        )

    ctx.add_shutdown_callback(_log_shutdown)


    # Org-specific model settings (strictly DB driven)
    org_tts_provider = str(require_db_value("ttsProvider")).upper()
    org_stt_provider = str(require_db_value("sttProvider")).upper()
    org_llm_provider = str(require_db_value("llmProvider")).upper()

    org_cartesia_model: Optional[str] = None
    org_cartesia_voice: Optional[str] = None
    org_sarvam_model: Optional[str] = None
    org_sarvam_voice: Optional[str] = None

    org_deepgram_model: Optional[str] = None
    org_sarvam_stt_model: Optional[str] = None

    org_llm_model = require_db_value("llmModel")
    org_llm_temperature = float(require_db_value("llmTemperature"))

    if org_tts_provider == "CARTESIA":
        org_cartesia_model = str(require_db_value("cartesiaModel"))
        org_cartesia_voice = str(require_db_value("cartesiaVoiceId"))
    elif org_tts_provider == "SARVAM":
        org_sarvam_model = str(require_db_value("sarvamModel"))
        org_sarvam_voice = str(require_db_value("sarvamVoice"))
    else:
        raise RuntimeError(f"Unsupported DB ttsProvider: {org_tts_provider}")

    if org_stt_provider == "DEEPGRAM":
        org_deepgram_model = str(require_db_value("deepgramModel"))
    elif org_stt_provider == "SARVAM":
        org_sarvam_stt_model = str(require_db_value("sarvamSttModel"))
    else:
        raise RuntimeError(f"Unsupported DB sttProvider: {org_stt_provider}")

    if org_llm_provider not in {"OPENAI", "SARVAM"}:
        raise RuntimeError(f"Unsupported DB llmProvider: {org_llm_provider}")
    analysis_openai_model = org_llm_model if org_llm_provider == "OPENAI" else LLM_MODEL

    logger.info(
        f"Org models -> STT: {org_deepgram_model if org_stt_provider != 'SARVAM' else org_sarvam_stt_model}, TTS: {org_cartesia_model if org_tts_provider != 'SARVAM' else org_sarvam_model} "
        f"voice={org_cartesia_voice if org_tts_provider != 'SARVAM' else org_sarvam_voice}, LLM: {org_llm_model} ({org_llm_provider})"
    )

    # Keep custom question text only; we will combine it with a mandatory
    # candidate-band checklist after parsing resume context.
    custom_questions_list = "\n".join([f"- {q}" for q in custom_questions])

    # Language Mapping for STT and TTS
    LANGUAGE_MAPPING = {
        "English": {"stt": "en-US", "tts": "en"},
        "Hindi": {"stt": "hi", "tts": "hi"},
        "Spanish": {"stt": "es", "tts": "es"},
        "French": {"stt": "fr", "tts": "fr"},
        "German": {"stt": "de", "tts": "de"},
        "Mandarin": {"stt": "zh", "tts": "zh"},
        "Japanese": {"stt": "ja", "tts": "ja"},
        "Korean": {"stt": "ko", "tts": "ko"},
        "Arabic": {"stt": "ar", "tts": "ar"},
        "Portuguese": {"stt": "pt", "tts": "pt"},
        "Russian": {"stt": "ru", "tts": "ru"},
    }

    lang_codes = LANGUAGE_MAPPING.get(interview_lang)
    if not lang_codes:
        raise RuntimeError(f"Unsupported interview language in DB: {interview_lang}")
    logger.info(
        f"Preparing interview with {candidate_name} for {job_title} in {interview_lang}"
    )

    resume_block = safe_parse(structured_resume, "No resume data provided.")
    ai_report_block = safe_parse(ai_report, "No prior screening data.")
    resume_context = parse_resume_context(structured_resume, resume_block)

    jd_block = build_jd_summary(extracted_details, job_details or "General professional role.")

    session_context = CandidateBandContext(
        candidate_band=infer_candidate_band(resume_context, resume_block),
        role_category=detect_role_category(job_title),
        role_subtype="",
        coverage_items=[],
        depth_instruction=(
            "Balance breadth and depth. Two follow-ups per key topic. Probe for reasoning but stay warm."
        ),
    )
    session_context.role_subtype = detect_role_subtype(job_title, session_context.role_category)
    session_context.coverage_items = build_coverage_checklist(session_context.candidate_band)
    session_context.short_coverage_block = "\n".join(
        f"- {item}" for item in session_context.coverage_items[:5]
    )
    if custom_questions_list:
        session_context.questions_list = f"{session_context.short_coverage_block}\n{custom_questions_list}"
    else:
        session_context.questions_list = session_context.short_coverage_block

    # Generate personalized candidate brief in the background.
    # We wait only briefly so first greeting is not blocked by this network call.
    oai_client_brief = AsyncOpenAI()
    candidate_brief_task = spawn_background_task(
        generate_candidate_brief(
            candidate_name=candidate_first_name or candidate_name,
            job_title=job_title,
            jd_block=jd_block,
            resume_block=resume_block,
            ai_report_block=ai_report_block,
            questions_list=session_context.questions_list,
            time_limit_mins=time_limit_mins,
            client=oai_client_brief,
            org_id=org_id,
            llm_model=analysis_openai_model,
        ),
        "candidate_brief_generation",
    )
    logger.info(
        "[BRIEF] Candidate brief generation started in background; greeting will not wait for it"
    )

    session_context.candidate_summary_block = build_candidate_summary(resume_context)
    session_context.jd_summary_block = build_jd_summary(extracted_details, jd_block)
    session_context.screening_summary_block = build_screening_summary(ai_report, ai_report_block)
    session_context.role_layer = build_role_layer(
        session_context.role_category, session_context.role_subtype, session_context.candidate_band
    )
    refresh_candidate_band_context(session_context)
    voice_layer_prompt = build_voice_layer_prompt(
        candidate_name=candidate_first_name or candidate_name,
        job_title=job_title,
        time_limit_mins=time_limit_mins,
        depth_instruction=session_context.depth_instruction,
        candidate_band=session_context.candidate_band,
        ai_name=_compact_optional(context.get("aiName")),
        org_name=_compact_optional(context.get("orgName")),
        org_location=_compact_optional(context.get("orgLocation")),
        drive_location=_compact_optional(context.get("driveLocation")),
    )
    evaluation_layer_prompt = build_evaluation_layer_prompt(
        live_prompt_context=session_context.live_prompt_context,
        candidate_name=candidate_first_name or candidate_name,
        job_title=job_title,
        time_limit_mins=time_limit_mins,
        depth_instruction=session_context.depth_instruction,
        candidate_band=session_context.candidate_band,
        ai_name=_compact_optional(context.get("aiName")),
        org_name=_compact_optional(context.get("orgName")),
        org_location=_compact_optional(context.get("orgLocation")),
        drive_location=_compact_optional(context.get("driveLocation")),
    )
    system_prompt = build_system_prompt(
        voice_layer_prompt=voice_layer_prompt,
        evaluation_layer_prompt=evaluation_layer_prompt,
    )

    chat_ctx = llm.ChatContext()
    chat_ctx.add_message(role="system", content=system_prompt)
    ctx.proc.userdata["candidate_band_context"] = session_context

    async def attach_brief_when_ready():
        if session_context.full_brief_injected:
            return
        try:
            delayed_brief = await candidate_brief_task
        except Exception as brief_err:
            logger.warning(f"[BRIEF] Deferred brief generation failed: {brief_err}")
            return

        if not delayed_brief or delayed_brief == session_context.candidate_brief_block:
            return

        session_context.candidate_brief_block = delayed_brief
        session_context.smart_opening_question = extract_smart_opening_question(delayed_brief)
        refresh_candidate_band_context(session_context)
        remove_system_messages(chat_ctx, "[CANDIDATE CONTEXT READY]")
        remove_system_messages(chat_ctx, "[PERSONALIZED INTERVIEW PLAN UPDATE]")
        chat_ctx.add_message(
            role="system",
            content=(
                "[PERSONALIZED INTERVIEW PLAN UPDATE]\n"
                f"{delayed_brief}\n"
                "Use this updated brief from now on. Do not reference this note aloud."
            ),
        )
        session_context.full_brief_injected = True
        logger.info(
            f"[BRIEF] Deferred brief attached to chat context ({len(delayed_brief)} chars)"
        )

    spawn_background_task(attach_brief_when_ready(), "attach_brief_when_ready")

    vad_instance = ctx.proc.userdata.get("vad") or build_vad()

    if org_stt_provider == "SARVAM":
        if org_sarvam_stt_model is None:
            raise RuntimeError("DB config missing sarvamSttModel for SARVAM")
        stt_plugin = build_sarvam_stt(
            language=lang_codes["stt"], model=org_sarvam_stt_model
        )
    else:
        if org_deepgram_model is None:
            raise RuntimeError("DB config missing deepgramModel for DEEPGRAM")
        stt_plugin = build_stt(
            language_code=lang_codes["stt"], model=org_deepgram_model
        )

    if org_tts_provider == "SARVAM":
        if org_sarvam_model is None or org_sarvam_voice is None:
            raise RuntimeError("DB config missing sarvamModel/sarvamVoice for SARVAM")
        sarvam_tts = build_sarvam_tts(
            language=lang_codes["tts"],
            model=org_sarvam_model,
            voice_id=org_sarvam_voice,
        )
        # Keep a Cartesia fallback ready so a Sarvam websocket hiccup does not
        # tear down the whole interview session.
        if org_cartesia_model is not None and org_cartesia_voice is not None:
            cartesia_tts = build_cartesia_tts(
                language=lang_codes["tts"],
                model=org_cartesia_model,
                voice_id=org_cartesia_voice,
            )
            tts_plugin = lk_tts.FallbackAdapter(
                [sarvam_tts, cartesia_tts], max_retry_per_tts=1
            )
        else:
            tts_plugin = sarvam_tts
    else:
        if org_cartesia_model is None or org_cartesia_voice is None:
            raise RuntimeError(
                "DB config missing cartesiaModel/cartesiaVoiceId for CARTESIA"
            )
        tts_plugin = build_tts(
            language=lang_codes["tts"],
            model=org_cartesia_model,
            voice_id=org_cartesia_voice,
    )

    if org_llm_provider == "SARVAM":
        llm_plugin = build_sarvam_llm(model=org_llm_model)
    else:
        llm_plugin = build_llm(model=org_llm_model, temperature=org_llm_temperature)

    turn_detector = ctx.proc.userdata.get("turn_detector")
    latest_session_usage: Optional[AgentSessionUsage] = None

    session = AgentSession(
        vad=vad_instance,
        stt=stt_plugin,
        llm=llm_plugin,
        tts=tts_plugin,
        turn_handling=TurnHandlingOptions(
            turn_detection=turn_detector,
            endpointing=EndpointingOptions(
                # Slightly longer endpointing to avoid cutting candidates mid-thought.
                min_delay=1.5,
                max_delay=3.0,
                mode="dynamic",
            ),
            interruption=InterruptionOptions(
                enabled=True,
                mode="adaptive",
                # Sensitivity tuning: ignore short noises/backchannels.
                # Only stop if candidate speaks for > 1.5s and > 4 words.
                min_duration=1.5,
                min_words=4,
                # Keep buffered speech during AEC warmup to avoid dropping input.
                discard_audio_if_uninterruptible=False,
                resume_false_interruption=True,
                false_interruption_timeout=3.0,
            ),
        ),
        use_tts_aligned_transcript=True,
        tts_text_transforms=[
            "filter_emoji",
            "filter_markdown",
            _single_question_transform,
            text_transforms.replace({
                "HR": "H R",
                "SaaS": "sass",
                "API": "A P I",
                "SQL": "sequel",
                "URL": "U R L",
                "UI": "U I",
                "UX": "U X",
                "DevOps": "dev ops",
                "LiveKit": "Live Kit",
            }),
        ],
        # Increased warmup ensures AEC and audio transport are stable before greeting.
        aec_warmup_duration=2.5,
    )

    @session.on("session_usage_updated")
    def on_session_usage_updated(event) -> None:
        nonlocal latest_session_usage
        latest_session_usage = event.usage
        logger.debug(
            f"[USAGE] Session usage updated (model buckets={len(event.usage.model_usage)})"
        )

    agent = Agent(instructions=system_prompt, chat_ctx=chat_ctx)

    participant: Optional[Any] = None
    disconnect_event = asyncio.Event()
    interview_finished_event = asyncio.Event()
    interview_marked_finished = False
    turn_count = 0           # counts assistant turns for state injection cadence
    last_injection_turn = 0  # tracks which turn last received a state injection
    environment_risk = 0     # browser-side proctoring signals
    integrity_risk = 0       # audio leak / helper voice / background voice
    depth_risk = 0           # surface answers / compression failures
    suspicion_score = 0      # composite risk score used only for mode switching
    current_interview_mode = "normal"  # normal / pressure / verification / deep
    proctoring_events: list = []       # timeline of risk signals for final report
    _face_absent_streak = 0            # repeated absence is stronger than a single blip
    ready_event = asyncio.Event()
    ready_signal_received_at: Optional[float] = None

    # Per-turn decision engine state
    _last_interviewer_question = ""   # most recent question Ishita asked
    _topic_follow_up_count = 0        # consecutive follow-ups on same topic
    _oai_eval_client = AsyncOpenAI()  # reused client for per-turn evaluations
    answer_scores: list[dict] = []    # log of all answer quality scores for final DB save
    _topic_depth_history: list[float] = []  # depth scores per answer on current topic (reset on MOVE_ON)
    _collapse_stage: int = 0               # 0=none, 1=first probe issued, 2+=repeated collapse (hard flag)
    _trust_state = init_trust_state()  # session-level trust engine state
    _contradiction_state = init_contradiction_state()  # explicit contradiction lifecycle state

    # Cross-turn consistency engine state
    _claim_index: dict[str, list[dict]] = {}  # claims indexed by type for contradiction checks
    _contradictions_found: list[dict] = [] # all detected contradictions for final report

    def refresh_composite_risk() -> int:
        nonlocal suspicion_score
        suspicion_score = compose_risk_score(integrity_risk, depth_risk)
        return suspicion_score

    @ctx.room.on("disconnected")
    def on_disconnected(reason):
        disconnect_event.set()

    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(disconnected_participant):
        if participant and disconnected_participant.identity == participant.identity:
            if not ready_event.is_set() and not interview_marked_finished:
                # Ignore transient reconnects before candidate explicitly starts.
                logger.debug(
                    "Candidate disconnected before ready; waiting for reconnect"
                )
                return

            logger.info("Candidate participant disconnected")

            if interview_marked_finished:
                # Candidate explicitly finished the interview; shutdown immediately.
                disconnect_event.set()
                return

            # No grace period after readiness: disconnect immediately.
            disconnect_event.set()

    @ctx.room.on("participant_connected")
    def on_participant_connected(connected_participant):
        if participant and connected_participant.identity == participant.identity:
            if ready_event.is_set() or interview_marked_finished:
                logger.info("Candidate participant connected/reconnected")

    @ctx.room.on("data_received")
    def on_data_received(*event_args):
        nonlocal \
            interview_marked_finished, \
            ready_signal_received_at, \
            environment_risk, \
            integrity_risk, \
            depth_risk, \
            suspicion_score, \
            proctoring_events, \
            _trust_state
        try:
            raw_data = None
            
            # Helper functions moved to entrypoint scope to prevent NameError

            if not event_args:
                return

            # Compatibility across LiveKit Python event shapes:
            # - bytes payload directly
            # - object with .data bytes field
            # - tuple with payload in any position
            for arg in event_args:
                if isinstance(arg, (bytes, bytearray)):
                    raw_data = bytes(arg)
                    break
                if isinstance(arg, memoryview):
                    raw_data = arg.tobytes()
                    break
                maybe = getattr(arg, "data", None)
                if isinstance(maybe, (bytes, bytearray)):
                    raw_data = bytes(maybe)
                    break
                if isinstance(maybe, memoryview):
                    raw_data = maybe.tobytes()
                    break

            if raw_data is None:
                logger.debug(
                    "data_received had no bytes payload",
                    extra={"arg_types": [type(a).__name__ for a in event_args]},
                )
                return

            payload = json.loads(raw_data.decode("utf-8"))
            if payload.get("type") == "user_ready":
                if not ready_event.is_set():
                    ready_signal_received_at = time.perf_counter()
                    logger.info(
                        f"Candidate is ready signal received (attempt={payload.get('attempt')})"
                    )
                ready_event.set()

            elif payload.get("type") == "interview_finished":
                logger.info("Candidate marked interview as finished")
                interview_marked_finished = True
                interview_finished_event.set()
                disconnect_event.set()  # Resolve hang

            elif payload.get("type") == "proctor_event":
                # Phase 5: Browser-side proctoring signals (tab switch, face absent, etc.)
                event_name = payload.get("event")
                event_weight = PROCTORING_WEIGHTS.get(event_name, 0)
                if event_name == "face_absent":
                    _face_absent_streak += 1
                    if _face_absent_streak < 2:
                        event_weight = 0
                elif event_name != "face_absent":
                    _face_absent_streak = 0

                if event_weight > 0:
                    environment_risk = min(100, environment_risk + event_weight)
                    refresh_composite_risk()
                    _evt = {
                        "event": event_name,
                        "timestamp": time.time(),
                        "risk_bucket": "environment",
                        "score_delta": event_weight,
                        "score_after": suspicion_score,
                    }
                    proctoring_events.append(_evt)
                    _trust_state = apply_proctoring_event(_trust_state, _evt)
                    logger.info(
                        f"[PROCTOR] {event_name} from browser. score={suspicion_score}"
                    )
        except Exception as e:
            logger.debug(f"Ignored malformed data packet: {e}")
            return

    # Pre-start all background processing while user is on hardware check.
    audio_input_options = {}
    if ai_coustics is not None:
        audio_input_options["noise_cancellation"] = ai_coustics.audio_enhancement(
            model=ai_coustics.EnhancerModel.QUAIL_VF_L
        )

    await session.start(
        agent=agent,
        room=ctx.room,
        room_options=room_io.RoomOptions(
            close_on_disconnect=False,
            audio_input=room_io.AudioInputOptions(**audio_input_options),
        ),
    )

    # --- Real-time Transcript Streaming is handled by LiveKit automatically ---

    async def _process_user_conversation_item(
        event,
        content: str,
        role: str,
        turn_snapshot: int,
    ) -> None:
        nonlocal suspicion_score, proctoring_events, _last_interviewer_question, \
            _topic_follow_up_count, current_interview_mode, answer_scores, \
            _claim_index, _contradictions_found, \
            _topic_depth_history, _trust_state, _contradiction_state
        try:
            if not content or role != "user":
                return

            async def _inject_candidate_context_before_first_question() -> None:
                if session_context.full_brief_injected:
                    session_context.initial_context_injected = True
                    return

                if session_context.initial_context_injected:
                    return

                session_context.initial_context_injected = True
                brief_text = session_context.candidate_brief_block.strip()

                if not brief_text:
                    if candidate_brief_task.done():
                        try:
                            brief_text = (candidate_brief_task.result() or "").strip()
                        except Exception:
                            brief_text = ""
                    if not brief_text:
                        try:
                            brief_text = (
                                await asyncio.wait_for(
                                    asyncio.shield(candidate_brief_task),
                                    timeout=1.5,
                                )
                                or ""
                            ).strip()
                        except asyncio.TimeoutError:
                            brief_text = ""
                        except Exception as brief_err:
                            logger.warning(
                                f"[BRIEF] First-question brief wait failed: {brief_err}"
                            )
                            brief_text = ""

                if brief_text:
                    session_context.candidate_brief_block = brief_text
                    session_context.smart_opening_question = extract_smart_opening_question(
                        brief_text
                    )
                    refresh_candidate_band_context(session_context)
                    remove_system_messages(chat_ctx, "[CANDIDATE CONTEXT READY]")
                    remove_system_messages(chat_ctx, "[PERSONALIZED INTERVIEW PLAN UPDATE]")
                    chat_ctx.add_message(
                        role="system",
                        content=(
                            "[PERSONALIZED INTERVIEW PLAN UPDATE]\n"
                            f"{brief_text}\n"
                            "Use this updated brief from now on. Do not reference this note aloud."
                        ),
                    )
                    session_context.full_brief_injected = True
                    logger.info(
                        f"[BRIEF] Full brief injected before first substantive question ({len(brief_text)} chars)"
                    )
                    return

                remove_system_messages(chat_ctx, "[CANDIDATE CONTEXT READY]")
                chat_ctx.add_message(
                    role="system",
                    content=build_candidate_context_ready_message(
                        context=session_context,
                        smart_opening_question=session_context.smart_opening_question,
                    ),
                )
                logger.info(
                    "[BRIEF] Lightweight candidate context injected before first substantive question"
                )

            # --- STT text cleanup / noise suppression ---
            def _clean_stt_text(raw_text: str) -> str:
                text = re.sub(r"\s+", " ", (raw_text or "").strip())
                if not text:
                    return ""

                if text.lower().strip(" .!?") == "candidate response unavailable":
                    return ""

                tokens = [t for t in text.split(" ") if t]
                cleaned_tokens: list[str] = []
                for token in tokens:
                    alpha = re.sub(r"[^a-zA-Z]", "", token).lower()
                    # RELAXED: Only drop very short consonant-only fragments if they look like filler.
                    # "thr" or "qu" might be part of "through" or "quite" being evolving.
                    if alpha and len(alpha) <= 2 and not re.search(r"[aeiou]", alpha):
                        continue
                    if cleaned_tokens and cleaned_tokens[-1].lower() == token.lower():
                        # Collapse immediate duplicates like "name name", "a a a".
                        continue
                    cleaned_tokens.append(token)

                return re.sub(r"\s+", " ", " ".join(cleaned_tokens)).strip()

            content = _clean_stt_text(content)
            if not content:
                return

            # During the first few seconds after Ishita's opening greeting, short
            # echo-like fragments ("hi", "hello", "okay") are often the AI's own
            # voice leaking back into STT rather than a real candidate turn.
            # Suppress only tiny, greeting-like fragments here so we keep the
            # first transcript anchored to the interviewer greeting.
            if first_agent_turn_committed_at is not None:
                since_first_ai_turn = time.monotonic() - first_agent_turn_committed_at
                if since_first_ai_turn <= greeting_echo_suppression_secs:
                    echo_like = re.compile(
                        r"^\s*(?:hi|hello|hey|okay|ok|yeah|yes|yep|mmhmm|mhm|good morning|good afternoon)\s*$",
                        re.IGNORECASE,
                    )
                    if echo_like.match(content) or len(content.split()) <= 2:
                        logger.debug(
                            f"[TRANSCRIPT] Suppressing early greeting echo fragment: '{content[:60]}'"
                        )
                        return

            # --- STT Spam / Hallucination Filter ---
            # Sarvam (and some Deepgram models) hallucinate the same word repeatedly
            # when they detect silence or background noise. Discard these before they
            # pollute the transcript or distort the LLM context.
            words = content.strip().split()
            if len(words) >= 10:
                unique_words = set(w.lower().strip(".,!?") for w in words)
                if len(unique_words) <= 3:
                    logger.warning(
                        f"[TRANSCRIPT] Discarding hallucinated STT spam ({len(words)} words, "
                        f"{len(unique_words)} unique): '{content[:60]}...'"
                    )
                    return
            if len(words) >= 4:
                unique_words = set(w.lower().strip(".,!?") for w in words)
                if len(unique_words) <= max(1, int(len(words) * 0.35)):
                    logger.warning(
                        f"[TRANSCRIPT] Discarding low-diversity STT noise ({len(words)} words, "
                        f"{len(unique_words)} unique): '{content[:60]}...'"
                    )
                    return

            # --- Deepgram Diarization: Secondary Speaker Detection ---
            # When diarization is enabled, Deepgram labels segments with a speaker_id.
            # Any segment with speaker_id > 0 during a candidate turn means a second
            # person is speaking - this is our "background_voice" proctoring signal.
            try:
                speaker_id = None
                raw_event = getattr(event, "item", event)
                # Deepgram speaker info may surface in alternatives or metadata
                for attr in ("speaker", "speaker_id", "channel"):
                    speaker_id = getattr(raw_event, attr, None)
                    if speaker_id is not None:
                        break

                if speaker_id is not None and int(speaker_id) > 0:
                    # A second speaker (speaker_id >= 1) was detected
                    delta = PROCTORING_WEIGHTS["background_voice"]
                    integrity_risk = min(100, integrity_risk + delta)
                    refresh_composite_risk()
                    reason = f"Multiple speakers detected in session (Speaker ID: {speaker_id})"
                    proctoring_events.append({
                        "event": "background_voice",
                        "timestamp": time.time(),
                        "risk_bucket": "integrity",
                        "speaker_id": int(speaker_id),
                        "score_delta": delta,
                        "score_after": suspicion_score,
                        "snippet": content[:80],
                    })
                    logger.warning(
                        f"[PROCTOR] background_voice detected: speaker_id={speaker_id} "
                        f"score={suspicion_score} snippet='{content[:60]}'"
                    )
                    # Sync real-time
                    spawn_background_task(_report_proctoring_realtime("background_voice", reason, delta), "report_bg_voice")
                    spawn_background_task(_signal_client_proctoring_violation("background_voice", "Background voice detected. Please ensure you are in a quiet, private space."), "signal_bg_voice")
            except Exception:
                pass  # Diarization metadata not available - silent skip

            # --- Audio Leak: Helper Phrase Detection ---
            # Scan every transcribed segment for phrases that indicate a third party
            # is providing answers (e.g. "the answer is X", "tell her to say...").
            # This catches cases where the candidate's mic picks up a roommate
            # whispering instructions that Deepgram can transcribe.
            for pattern in _HELPER_PHRASE_PATTERNS:
                if pattern.search(content):
                    delta = PROCTORING_WEIGHTS["audio_leak"]
                    integrity_risk = min(100, integrity_risk + delta)
                    refresh_composite_risk()
                    reason = f"Helper phrase detected via Deepgram: '{content[:50]}...'"
                    proctoring_events.append({
                        "event": "audio_leak",
                        "timestamp": time.time(),
                        "risk_bucket": "integrity",
                        "matched_pattern": pattern.pattern,
                        "score_delta": delta,
                        "score_after": suspicion_score,
                        "snippet": content[:120],
                    })
                    logger.warning(
                        f"[PROCTOR] audio_leak detected: pattern='{pattern.pattern}' "
                        f"score={suspicion_score} snippet='{content[:80]}'"
                    )
                    # Sync real-time
                    spawn_background_task(_report_proctoring_realtime("audio_leak", reason, delta, sev="high"), "report_audio_leak")
                    spawn_background_task(_signal_client_proctoring_violation("audio_leak", "Sound anomaly detected. Please ensure you are performing the interview without external assistance.", sev="high"), "signal_audio_leak")
                    break  # one flag per segment is enough

            # Ignore tiny fragments unless they match an explicit short-answer pattern.
            # This cuts down on STT hallucinations, echo bleed, and half-words like
            # "bu", "thr", or "qu" being treated as real candidate turns.
            short_classification = classify_short_utterance(content)
            word_count = len([w for w in content.strip().split() if w])
            if short_classification is None and word_count <= 2:
                logger.debug(
                    f"[TRANSCRIPT] Ignoring probable STT fragment ({word_count} words): '{content[:60]}'"
                )
                return

            # Pure acknowledgments and answer_starts — don't log to transcript or trigger LLM.
            # Acknowledgment: "ok/yeah/sure" — pure filler, discard silently.
            # Answer_start: "so basically/well/um" — candidate mid-thought, don't interrupt.
            if short_classification and short_classification["response_class"] in ("acknowledgment", "answer_start"):
                if not session_context.initial_context_injected:
                    await _inject_candidate_context_before_first_question()
                short_directive = build_short_utterance_directive(
                    "acknowledgment",
                    short_classification["evidence"],
                )
                remove_system_messages(chat_ctx, "[SHORT_RESPONSE_DIRECTIVE")
                chat_ctx.add_message(role="system", content=short_directive)
                logger.debug(
                    f"[SHORT_REPLY] dropping acknowledgment filler: '{content[:60]}'"
                )
                return

            speaker = "Candidate"
            append_transcript_line(speaker, content)
            logger.info(f"[TRANSCRIPT] {speaker}: {content[:60]}...")

            if not session_context.initial_context_injected:
                await _inject_candidate_context_before_first_question()
            if short_classification:
                short_class = short_classification["response_class"]
                short_directive = build_short_utterance_directive(
                    short_class,
                    short_classification["evidence"],
                )
                remove_system_messages(chat_ctx, "[SHORT_RESPONSE_DIRECTIVE")
                chat_ctx.add_message(role="system", content=short_directive)
                logger.info(
                    f"[SHORT_REPLY] class={short_class} words={short_classification['token_count']} "
                    f"text='{short_classification['evidence'][:60]}'"
                )
                return

            # --- Per-Turn Answer Evaluator (Decision Engine) ---
            # Fires on every candidate response. Evaluates answer quality in real-time
            # and injects a NEXT_TURN_DIRECTIVE before Ishita generates her next response.
            # Decision: PROBE (which mode) or MOVE_ON - fully signal-driven, no fixed depth.
            if _last_interviewer_question and turn_snapshot > 1:
                answer_snap = content
                question_snap = _last_interviewer_question
                follow_up_snap = _topic_follow_up_count
                lines_snap_eval = list(transcript_lines)
                depth_snap = list(_topic_depth_history)
                collapse_stage_snap = _collapse_stage

                async def _evaluate_and_inject(
                    answer=answer_snap,
                    question=question_snap,
                    follow_ups=follow_up_snap,
                    lines=lines_snap_eval,
                    turn=turn_snapshot,
                    depth_hist=depth_snap,
                    collapse_stage=collapse_stage_snap,
                ):
                    nonlocal _topic_follow_up_count, environment_risk, integrity_risk, depth_risk, suspicion_score, current_interview_mode, \
                        answer_scores, _claim_index, _contradictions_found, \
                        _topic_depth_history, _trust_state, _contradiction_state, _collapse_stage
                    try:
                        # Step 1: Extract claims and check consistency (before quality eval)
                        new_claims = await extract_claims(
                            candidate_answer=answer,
                            turn=turn,
                            client=_oai_eval_client,
                            org_id=org_id,
                            llm_model=analysis_openai_model,
                        )
                        contradiction_alert: Optional[dict] = None
                        for claim in new_claims:
                            claim_type = str(claim.get("type", "") or "").strip()
                            if not claim_type:
                                continue

                            contradiction = check_contradiction(claim, _claim_index)
                            if contradiction and not contradiction_alert:
                                contradiction_alert = contradiction
                                _contradictions_found.append(contradiction)
                                logger.warning(
                                    f"[CONSISTENCY] Contradiction: {contradiction['type']} "
                                    f"turn {contradiction['old_turn']} ({contradiction['old_value']!r}) "
                                    f"vs turn {turn} ({contradiction['new_value']!r})"
                                )
                            _claim_index.setdefault(claim_type, []).append(claim)

                        # Step 2: Run TurnDecision pipeline (quality + signals + routing)
                        td, directive = await run_turn_evaluation(
                            candidate_answer=answer,
                            last_question=question,
                            topic_follow_up_count=follow_ups,
                            transcript_lines=lines,
                            depth_history=depth_hist,
                            contradiction_detected=contradiction_alert is not None,
                            client=_oai_eval_client,
                            org_id=org_id,
                            llm_model=analysis_openai_model,
                            score_answer_quality_fn=score_answer_quality,
                            evaluate_answer_and_decide_fn=evaluate_answer_and_decide,
                            collapse_stage=collapse_stage,
                        )

                        action = td["decision"]["action"]
                        signal_events = td.get("signal_events", [])
                        depth_signal = "SURFACE"
                        quality_avg = (
                            td["quality"]["clarity"] + td["quality"]["depth"] +
                            td["quality"]["specificity"] + td["quality"]["grounding"]
                        ) / 4.0
                        if quality_avg >= 7.0:
                            depth_signal = "DEEP"
                        elif quality_avg >= 4.5:
                            depth_signal = "SPECIFIC"

                        # Log quality score for DB persistence
                        quality_record = {
                            "clarity": td["quality"]["clarity"],
                            "depth": td["quality"]["depth"],
                            "specificity": td["quality"]["specificity"],
                            "grounding": td["quality"]["grounding"],
                            "overall": quality_avg,
                            "signals": [event["signal_name"] for event in signal_events if event.get("signal_name")],
                            "concerns": [event["signal_name"] for event in signal_events if event.get("score_delta", 0.0) < 0],
                            "turn": turn,
                            "question": question,
                        }
                        answer_scores.append(quality_record)

                        # Update depth history and follow-up counter
                        _topic_depth_history.append(td["quality"]["depth"])
                        collapse_fired = any(
                            ev.get("signal_name") == "follow_up_collapse"
                            for ev in signal_events
                        )
                        if action in ("PROBE", "VERIFY"):
                            _topic_follow_up_count += 1
                            if collapse_fired:
                                # Probe issued for collapse — advance stage so next turn escalates
                                _collapse_stage += 1
                            elif _collapse_stage > 0 and not collapse_fired:
                                # No collapse this follow-up — candidate recovered, reduce stage
                                _collapse_stage = max(0, _collapse_stage - 1)
                        else:
                            _topic_follow_up_count = 0
                            _topic_depth_history = []
                            _collapse_stage = 0

                        # Update the canonical TrustState only. Trust deltas are folded into the
                        # single structured engine so we do not maintain a second trust line.
                        _trust_state = apply_turn_decision(_trust_state, td)

                        # Record the signal contract in one place and keep the legacy risk meter aligned.
                        for event in signal_events:
                            event_delta = float(event.get("score_delta", 0.0) or 0.0)
                            legacy_delta = int(round(max(0.0, -event_delta) * 100))
                            signal_layer = str(event.get("signal_layer", "") or "")
                            if legacy_delta:
                                if signal_layer == "hard_integrity":
                                    integrity_risk = min(100, integrity_risk + legacy_delta)
                                else:
                                    depth_risk = min(100, depth_risk + legacy_delta)
                                refresh_composite_risk()
                            proctoring_events.append({
                                "event": event["signal_name"],
                                "signal_name": event["signal_name"],
                                "signal_layer": event["signal_layer"],
                                "risk_bucket": "integrity" if signal_layer == "hard_integrity" else "depth",
                                "confidence": event["confidence"],
                                "evidence": event["evidence"],
                                "trust_bucket_affected": event["trust_bucket_affected"],
                                "score_delta": event_delta,
                                "probe_mode": event["probe_mode"],
                                "recoverable": event["recoverable"],
                                "recruiter_visible": event["recruiter_visible"],
                                "turn": turn,
                                "score_after": suspicion_score,
                            })
                            logger.info(
                                f"[SIGNAL] {event['signal_name']} layer={event['signal_layer']} "
                                f"confidence={event['confidence']:.2f} trust_delta={event_delta:+.2f} "
                                f"visible={event['recruiter_visible']} turn={turn}"
                            )

                        # Contradiction recovery: if last turn surfaced a contradiction and
                        # this turn the candidate moved on cleanly with decent quality,
                        # treat it as resolved and restore hard_integrity.
                        quality_avg_for_recovery = (
                            td["quality"]["clarity"] + td["quality"]["depth"] +
                            td["quality"]["specificity"] + td["quality"]["grounding"]
                        ) / 4.0
                        _contradiction_state, contradiction_state_event = advance_contradiction_state(
                            _contradiction_state,
                            contradiction_alert,
                            turn=turn,
                            action=action,
                            quality_avg=quality_avg_for_recovery,
                        )
                        if contradiction_state_event:
                            proctoring_events.append({
                                "event": contradiction_state_event["event"],
                                "source": contradiction_state_event["source"],
                                "status": contradiction_state_event["status"],
                                "turn": contradiction_state_event["turn"],
                                "surfaced_turn": contradiction_state_event["surfaced_turn"],
                                "repeat_count": contradiction_state_event["repeat_count"],
                                "probe_type": contradiction_state_event["probe_type"],
                                "recovery_path": contradiction_state_event["recovery_path"],
                                "recruiter_note": contradiction_state_event["recruiter_note"],
                                "trust_delta": contradiction_state_event["trust_delta"],
                                "score_delta": 0,
                                "score_after": suspicion_score,
                                "evidence": contradiction_state_event.get("evidence", ""),
                                "contradiction_type": contradiction_state_event.get("contradiction_type", ""),
                            })
                            logger.info(
                                f"[CONTRADICTION] status={contradiction_state_event['status']} "
                                f"source={contradiction_state_event['source']} turn={turn} "
                                f"trust_delta={contradiction_state_event['trust_delta']:+.2f}"
                            )
                            if contradiction_state_event["status"] == "candidate_clarified":
                                _trust_state = apply_contradiction_resolved(_trust_state)
                                logger.info("[TRUST] Contradiction resolved by candidate - hard_integrity restored")
                        # Feed depth signal into suspicion scoring
                        if depth_signal == "SURFACE":
                            depth_risk = min(100, depth_risk + 3)
                            refresh_composite_risk()
                        elif depth_signal == "DEEP" and current_interview_mode == "normal":
                            current_interview_mode = "deep"

                        # Append contradiction context to directive if needed
                        contradiction_summary = summarize_contradiction_state(_contradiction_state)
                        evidence = contradiction_summary["evidence"]
                        old_t = evidence.get("oldTurn", 0)
                        old_v = evidence.get("oldValue", "")
                        new_v = evidence.get("newValue", "")
                        claim_t = contradiction_summary["contradictionType"].replace("_", " ") or "contradiction"
                        if contradiction_summary["active"]:
                            directive = (
                                f"[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
                                f"DECISION: CONTRADICTION {contradiction_summary['status'].upper()}\n"
                                f"INCONSISTENCY DETECTED: {claim_t}\n"
                                f"  Earlier (turn {old_t}): '{old_v}'\n"
                                f"  Just now (turn {turn}): '{new_v}'\n"
                                f"ACTION: Surface this with genuine confusion - not accusation."
                                f"Say something like: 'wait, I want to make sure I understood this right -" 
                                f"earlier it sounded like {old_v}, but just now it sounds more like {new_v}. "
                                f"Help me connect those two.' "
                                f"If they clarify convincingly, accept it and move on. "
                                f"If they stall or contradict again, note it internally and continue."
                            )

                        # Remove previous directive to keep context clean
                        messages = chat_ctx.messages() if callable(getattr(chat_ctx, "messages", None)) else chat_ctx.messages
                        for old_msg in list(messages):
                            if getattr(old_msg, "role", "") == "system" and "[NEXT_TURN_DIRECTIVE" in (getattr(old_msg, "content", "") or ""):
                                try:
                                    messages.remove(old_msg)
                                except (ValueError, AttributeError):
                                    pass

                        chat_ctx.add_message(role="system", content=directive)
                    except Exception as e:
                        logger.debug(f"[EVAL] Evaluator injection failed: {e}")

                spawn_background_task(_evaluate_and_inject(), f"eval_turn_{turn_snapshot}")
        except Exception as e:
            logger.debug(f"[TRANSCRIPT] User item processing failed: {e}")

    @session.on("conversation_item_added")
    def on_conversation_item_added(event) -> None:
        nonlocal session_start_time, turn_count, last_injection_turn, \
            _last_interviewer_question, _topic_follow_up_count
        try:
            item = event.item
            role = getattr(item, "role", None)
            content = item.text_content
            if not content or not role:
                return
            if role == "user":
                turn_snapshot = turn_count
                spawn_background_task(
                    _process_user_conversation_item(event, content, role, turn_snapshot),
                    f"process_user_turn_{turn_snapshot}",
                )
                return
            speaker = "Interviewer" if role == "assistant" else "Candidate"
            # Strip the <wait for response> marker from transcript (it's an internal signal, not dialogue)
            clean_content = content.replace("<wait for response>", "").strip()
            append_transcript_line(speaker, clean_content)
            logger.info(f"[TRANSCRIPT] {speaker}: {clean_content[:60]}...")

            # --- Track last Ishita question (for per-turn evaluator) ---
            if role == "assistant":
                # Extract the last sentence ending in "?" as the question
                sentences = [s.strip() for s in clean_content.split("?") if s.strip()]
                if sentences:
                    _last_interviewer_question = sentences[-1] + "?"

            # --- Per-Turn Answer Evaluator (Decision Engine) ---
            # Fires on every candidate response. Evaluates answer quality in real-time
            # and injects a NEXT_TURN_DIRECTIVE before Ishita generates her next response.
            # Decision: PROBE (which mode) or MOVE_ON - fully signal-driven, no fixed depth.
            # --- Dynamic Interview State Injection (every 3 assistant turns) ---
            # Every 3 turns, a lightweight gpt-4o-mini call generates a coverage + pace summary
            # and injects it as a system message so Ishita knows what she's covered, what's
            # thin/untouched, and whether she needs to move on immediately.
            if role == "assistant":
                turn_count += 1
                if turn_count % 3 == 0 and turn_count != last_injection_turn:
                    last_injection_turn = turn_count
                    lines_snap = list(transcript_lines)
                    current_turn = turn_count
                    q_list_snap = session_context.questions_list
                    # Estimate total expected turns from time limit (avg ~2 turns/min)
                    expected_total = max(time_limit_mins * 2, 10)

                    mode_snap = current_interview_mode

                    async def _inject_state(
                        snap=lines_snap, q_list=q_list_snap, t=current_turn, exp=expected_total,
                        mode=mode_snap
                    ):
                        nonlocal environment_risk, integrity_risk, depth_risk, suspicion_score, current_interview_mode
                        try:
                            oai_client = AsyncOpenAI()
                            state = await generate_interview_state_summary(
                                snap,
                                q_list,
                                candidate_name,
                                job_title,
                                oai_client,
                                org_id=org_id,
                                turn_count=t,
                                total_turns_expected=exp,
                                llm_model=analysis_openai_model,
                            )
                            if state:
                                # --- Parse proctoring signals from state text ---
                                if "CONTRADICTION DETECTED" in state:
                                    proctoring_events.append({
                                        "event": "contradiction_detected",
                                        "turn": t,
                                        "score_delta": 0,
                                        "score_after": suspicion_score,
                                        "note": "state summary surfaced a contradiction; trust handled in formal state machine",
                                    })
                                    logger.info(f"[PROCTOR] contradiction_detected turn={t} (formal state handles trust)")

                                depth_match = re.search(r"ANSWER_DEPTH:\s*\[(SURFACE|SPECIFIC|DEEP)\]", state)
                                if depth_match:
                                    depth_level = depth_match.group(1)
                                    if depth_level == "SURFACE":
                                        depth_risk = min(100, depth_risk + 5)
                                        refresh_composite_risk()
                                        proctoring_events.append({
                                            "event": "answer_surface",
                                            "turn": t,
                                            "risk_bucket": "depth",
                                            "score_delta": 5,
                                            "score_after": suspicion_score,
                                        })
                                    logger.info(f"[PROCTOR] answer_depth={depth_level} turn={t} score={suspicion_score}")

                                if "MOVE ON NOW" in state:
                                    proctoring_events.append({
                                        "event": "stuck_alert",
                                        "turn": t,
                                        "score_delta": 0,
                                        "score_after": suspicion_score,
                                    })
                                    logger.info(f"[PROCTOR] stuck_alert turn={t}")

                                if "PACE CRITICAL" in state:
                                    proctoring_events.append({
                                        "event": "pace_critical",
                                        "turn": t,
                                        "score_delta": 0,
                                        "score_after": suspicion_score,
                                    })

                                # --- Determine interview mode from proctoring risk only ---
                                mode_risk_score = compose_mode_risk_score(
                                    integrity_risk,
                                    depth_risk,
                                )
                                if integrity_risk >= 15 or mode_risk_score >= 28:
                                    new_mode = "verification"
                                elif mode_risk_score >= 16 or depth_risk >= 18:
                                    new_mode = "pressure"
                                else:
                                    new_mode = mode  # keep existing (could be "deep" from genuine depth)

                                if new_mode != current_interview_mode:
                                    logger.info(
                                        f"[PROCTOR] mode_change {current_interview_mode}->{new_mode} "
                                        f"proctoring_score={mode_risk_score} "
                                        f"env={environment_risk} integrity={integrity_risk} depth={depth_risk} turn={t}"
                                    )
                                    current_interview_mode = new_mode
                                    proctoring_events.append({
                                        "event": "mode_change",
                                        "turn": t,
                                        "from": mode,
                                        "to": new_mode,
                                        "score": mode_risk_score,
                                    })

                                # --- Remove old state injections - keep only the latest 2 ---
                                messages = chat_ctx.messages() if callable(getattr(chat_ctx, "messages", None)) else chat_ctx.messages
                                state_msgs = [
                                    m
                                    for m in messages
                                    if getattr(m, "role", "") == "system"
                                    and "[INTERVIEW STATE UPDATE" in (
                                        getattr(m, "content", "") or ""
                                    )
                                ]
                                if len(state_msgs) >= 2:
                                    for old_msg in state_msgs[:-1]:
                                        try:
                                            messages.remove(old_msg)
                                        except (ValueError, AttributeError):
                                            pass

                                injection_text = (
                                    f"[INTERVIEW STATE UPDATE - Turn {t}]\n"
                                    f"ISHITA_MODE: {current_interview_mode.upper()}\n"
                                    f"COMPOSITE_RISK: {suspicion_score}\n"
                                    f"{state}\n"
                                    "Use this to guide your next 3-4 exchanges. "
                                    "Do not reference this note aloud."
                                )
                                chat_ctx.add_message(
                                    role="system", content=injection_text
                                )
                                logger.info(
                                    f"[STATE_INJECT] Injected state at turn {t} "
                                    f"mode={current_interview_mode} composite_risk={suspicion_score}: "
                                    f"{state[:80]}..."
                                )
                        except Exception as e:
                            logger.warning(
                                f"[STATE_INJECT] Injection failed at turn {t}: {e}"
                            )

                    spawn_background_task(_inject_state(), f"inject_state_turn_{current_turn}")

            # --- Periodic auto-save every 5 turns to prevent data loss ---
            if len(transcript_lines) > 0 and len(transcript_lines) % 5 == 0:
                start_t = session_start_time
                lines_snapshot = list(transcript_lines)
                app_id_snap = app_id

                async def _periodic_save():
                    try:
                        await persist_transcript(app_id_snap, lines_snapshot, start_t)
                        logger.info(
                            f"[TRANSCRIPT] Periodic auto-save at {len(lines_snapshot)} lines"
                        )
                    except Exception as save_err:
                        logger.warning(f"[TRANSCRIPT] Periodic save failed: {save_err}")

                spawn_background_task(
                    _periodic_save(),
                    f"periodic_save_{len(lines_snapshot)}_lines",
                )

        except Exception as e:
            logger.warning(f"[TRANSCRIPT] Event parse error: {e}")

    # --- Thinking Filler Logic ---
    # NOTE: session.say() fillers are intentionally disabled.
    # When filler audio and the LLM TTS reply fire at near-simultaneous times
    # (~700ms window), they create two competing audio streams which causes
    # voice breakup / choppy audio on the candidate's side.
    # The LLM pipeline already has low enough latency that fillers add more
    # harm (audio conflict) than benefit (perceived naturalness).
    is_agent_speaking = False
    is_candidate_speaking = False
    awaiting_candidate_response = False
    awaiting_candidate_since: float | None = None
    inactivity_nudge_sent_for_current_prompt = False
    inactivity_warning_sent_for_current_prompt = False
    first_agent_turn_committed_at: float | None = None
    greeting_echo_suppression_secs = 6.0

    def reset_inactivity_clock(start_waiting: bool) -> None:
        nonlocal awaiting_candidate_response, awaiting_candidate_since, \
            inactivity_nudge_sent_for_current_prompt, inactivity_warning_sent_for_current_prompt
        awaiting_candidate_response = start_waiting
        awaiting_candidate_since = time.monotonic() if start_waiting else None
        inactivity_nudge_sent_for_current_prompt = False
        inactivity_warning_sent_for_current_prompt = False
        if start_waiting:
            logger.debug("[NUDGE] Inactivity clock started (awaiting candidate response)")
        else:
            logger.debug("[NUDGE] Inactivity clock cleared")

    @session.on("user_speech_started")
    def on_user_speech_started():
        nonlocal is_candidate_speaking
        is_candidate_speaking = True
        # User started speaking: clear inactivity window immediately.
        reset_inactivity_clock(start_waiting=False)

    @session.on("user_speech_committed")
    def on_user_speech_committed(_msg):
        nonlocal is_candidate_speaking
        is_candidate_speaking = False
        # Keep inactivity clock cleared until AI asks/speaks again.
        reset_inactivity_clock(start_waiting=False)

    @session.on("agent_speech_started")
    def on_agent_speech_started():
        nonlocal is_agent_speaking
        is_agent_speaking = True
        # AI is speaking: do not count inactivity against candidate.
        reset_inactivity_clock(start_waiting=False)

    @session.on("agent_speech_committed")
    def on_agent_speech_committed(_msg):
        nonlocal is_agent_speaking, first_agent_turn_committed_at
        is_agent_speaking = False
        if first_agent_turn_committed_at is None:
            first_agent_turn_committed_at = time.monotonic()
        # Timer starts only when AI has finished speaking and candidate is expected to respond.
        reset_inactivity_clock(start_waiting=True)
        logger.debug("[NUDGE] AI finished speaking; starting inactivity countdown")

    # Wait for participant to join so we have their identity for tracking.
    # Keep waiting during hardware check and handle room-disconnect gracefully.
    async def wait_for_human_participant(max_wait_seconds: int = 600):
        deadline = time.monotonic() + max_wait_seconds
        while time.monotonic() < deadline:
            if disconnect_event.is_set():
                return None
            try:
                return await asyncio.wait_for(ctx.wait_for_participant(), timeout=20)
            except asyncio.TimeoutError:
                continue
            except RuntimeError as e:
                msg = str(e).lower()
                if "room disconnected" in msg:
                    logger.warning(
                        "Room disconnected while waiting for participant; ending job cleanly"
                    )
                    disconnect_event.set()
                    return None
                logger.warning(f"Transient participant wait runtime error: {e}")
                await asyncio.sleep(0.2)
            except Exception as e:
                logger.warning(f"Transient participant wait error: {e}")
                await asyncio.sleep(0.2)

        logger.warning(f"Did not find a human participant within {max_wait_seconds}s")
        return None

    # FIX: Increased to 300s (5 mins) to allow for hardware checks.
    # If nobody joins in 5 minutes, free the process slot.
    participant = await wait_for_human_participant(max_wait_seconds=300)
    if not participant:
        logger.warning(
            f"[TIMEOUT] No candidate joined room for app {app_id} within 300s. Recording NO_SHOW."
        )
        # Phase 5: Mark interview as NO_SHOW in database
        try:
            proctoring_data = {
                "role_category": session_context.role_category,
                "candidate_band": session_context.candidate_band,
                "total_turns": turn_count,
                "suspicion_score": suspicion_score,
                "environment_risk": environment_risk,
                "integrity_risk": integrity_risk,
                "depth_risk": depth_risk,
                "composite_risk": suspicion_score,
                "current_mode": current_interview_mode,
                "exit_reason": "no_show_timeout",
                "events": proctoring_events,
                "contradiction_state": summarize_contradiction_state(_contradiction_state),
            }
            await persist_transcript(
                app_id,
                [],
                session_start_time,
                proctoring_data=proctoring_data,
                final_status="NO_SHOW",
            )
        except Exception as e:
            logger.error(f"[TRANSCRIPT] Failed to record NO_SHOW status: {e}")

        disconnect_event.set()
        try:
            await session.aclose()
        except Exception:
            pass
        return

    # PREWARM: Remove the wait for 'user_ready' signal. 
    # Greet the candidate as soon as they are physically in the room.
    if not disconnect_event.is_set():
        ready_signal_received_at = time.perf_counter()
        ready_event.set()
        logger.info(f"Pre-warming greeting for app {app_id} immediately after participant join")

    async def _warm_greeting_tts(plugin) -> None:
        warmup_method = getattr(plugin, "warmup", None)
        if callable(warmup_method):
            try:
                result = warmup_method()
                if asyncio.iscoroutine(result):
                    await result
                logger.info("[GREETING] TTS warmup completed before greeting")
            except Exception as e:
                logger.warning(f"[GREETING] TTS warmup failed before greeting: {e}")

    await _warm_greeting_tts(tts_plugin)

    if ready_event.is_set() and not disconnect_event.is_set():
        session_start_time = time.time()

        ai_name = context.get("aiName") or "Ishita"
        # Dynamic, personalized, warm greeting - adapted per language
        # The greeting avoids robotic openers and uses natural warmth.
        WELCOME_MESSAGES = {
            "English": (
                f"Hey {candidate_first_name or candidate_name}, welcome! Really glad you could make it today. "
                f"I'm {ai_name}, and I'll be having a conversation with you about the {job_title} role. "
                f"How are you doing? How's the day been so far?"
            ),
        }
        welcome_text = WELCOME_MESSAGES.get(
            interview_lang,
            (
                f"Hey {candidate_first_name or candidate_name}, welcome and thanks for joining today. "
                f"I'm {ai_name}, and I'll be speaking with you about the {job_title} role. "
                f"Before we dive in - how are you doing? Ready to get started?"
            ),
        )

        # Mark as started in DB while greeting starts immediately.
        spawn_background_task(mark_interview_started(app_id), "mark_interview_started")

        try:
            startup_latency_ms = int((time.perf_counter() - entry_started_at) * 1000)
            if ready_signal_received_at is not None:
                ready_to_greeting_ms = int(
                    (time.perf_counter() - ready_signal_received_at) * 1000
                )
                logger.info(
                    f"[GREETING] Starting welcome (boot={startup_latency_ms}ms, ready_to_greeting={ready_to_greeting_ms}ms)"
                )
            else:
                logger.info(
                    f"[GREETING] Starting welcome (boot={startup_latency_ms}ms)"
                )

            # Only deliver scripted welcome if the LLM hasn't already spoken
            # (prevents double-greeting when candidate says hello first)
            llm_already_spoke = any(
                line.startswith("Interviewer:") for line in transcript_lines
            )
            if llm_already_spoke:
                logger.info(
                    "[GREETING] LLM already responded to candidate - skipping scripted welcome to avoid double-greeting"
                )
            else:
                # Retry loop: Sarvam TTS WebSocket can fail on the very first
                # synthesis call if the connection was recycled during startup.
                # We retry up to 3 times with a short backoff before giving up.
                greeting_delivered = False
                for _attempt in range(3):
                    try:
                        # Small delay after AEC warmup to ensure clear start
                        await asyncio.sleep(0.5)
                        # allow_interruptions=False for greeting prevents 'break voice' from echo bleed
                        await session.say(welcome_text, allow_interruptions=False)
                        greeting_delivered = True
                        logger.info(
                            f"[GREETING] Welcome message delivered (attempt {_attempt + 1})"
                        )
                        break
                    except Exception as _tts_err:
                        err_str = str(_tts_err).lower()
                        is_transport_err = any(
                            pat in err_str
                            for pat in (
                                "closing transport",
                                "connection error",
                                "apiconnectionerror",
                                "send task failed",
                            )
                        )
                        if is_transport_err and _attempt < 2:
                            logger.warning(
                                f"[GREETING] TTS transport error on attempt {_attempt + 1}, "
                                f"retrying in 1s: {_tts_err}"
                            )
                            await asyncio.sleep(1.0)
                        else:
                            raise
                if not greeting_delivered:
                    logger.error("[GREETING] All TTS retry attempts failed for greeting")
        except Exception as e:
            logger.error(f"[GREETING] Failed to deliver greeting: {e}")

    # CRITICAL: Start inactivity clock after greeting finishes (or is skipped).
    # session.say() is a scripted call - it does NOT fire agent_speech_committed, so the
    # normal "AI finished speaking" hook may not run for this scripted audio.
    reset_inactivity_clock(start_waiting=True)
    logger.debug("[NUDGE] Inactivity clock started after greeting delivery")

    # Wait for either explicit finish signal OR disconnect OR hard timeout,
    # while also firing timed mid-session nudges (candidate-questions prompt, final goodbye).
    finished_task = asyncio.create_task(interview_finished_event.wait())
    disconnected_task = asyncio.create_task(disconnect_event.wait())
    total_seconds = time_limit_mins * 60

    # Timed intervention flags
    candidate_questions_asked = False
    wrap_up_signal_sent = False

    # How many seconds before the end to trigger each nudge
    # Scale based on total duration (e.g., last 20% of the session, capped at 2.5 mins)
    CANDIDATE_Q_TRIGGER_SECS = min(150, max(10, int(total_seconds * 0.2)))
    FINAL_THANKS_TRIGGER_SECS = max(8, min(15, int(total_seconds * 0.1)))
    MIN_CANDIDATE_LINES_FOR_WRAPUP = 3

    # Warm inactivity nudges. Keep them short, varied, and situation-aware.
    _nudge_pool = [
        "If you're thinking aloud, feel free to keep going - that helps me follow your reasoning.",
        "Take your time, {name}. I can wait while you gather your thoughts.",
        "Just a reminder that I'm here whenever you're ready to share your thoughts.",
        "If you went quiet because you were mid-thought, you can continue right from there.",
        "You can also answer with one concrete example if that is easier than a broad explanation.",
    ]
    inactivity_nudge_count = 0

    async def _deliver_nudge(text: str) -> None:
        await session.say(text, allow_interruptions=True)
        # Scripted speech doesn't fire agent_speech_committed, manually restart clock.
        # Preserve the nudge/warning flags so they don't fire again for this prompt.
        nonlocal awaiting_candidate_response, awaiting_candidate_since
        awaiting_candidate_response = True
        awaiting_candidate_since = time.monotonic()

    async def _send_termination_signal():
        try:
            import json
            payload = json.dumps({"type": "interview_terminated"}).encode("utf-8")
            await ctx.room.local_participant.publish_data(payload, reliable=True)
            logger.info("[NUDGE] Sent termination signal to frontend")
        except Exception as e:
            logger.warning(f"Failed to send termination signal: {e}")

    def _pick_nudge() -> str:
        """Return the next configured inactivity nudge in round-robin order."""
        if not _nudge_pool:
            return "Could you share one specific example from your work?"
        return _nudge_pool[inactivity_nudge_count % len(_nudge_pool)].format(
            name=candidate_first_name or candidate_name
        )

    session_loop_start = time.monotonic()

    while True:
        elapsed = time.monotonic() - session_loop_start
        remaining = total_seconds - elapsed

        if finished_task.done() or disconnected_task.done():
            break

        if remaining <= 0:
            break

        # --- 2-3 min remaining: wrap-up / candidate questions nudge ---
        # Fire when close to the end. Tailor text based on how much the candidate said.
        candidate_line_count = sum(
            1 for line in transcript_lines if line.startswith("Candidate:")
        )
        if (
            not candidate_questions_asked
            and remaining <= CANDIDATE_Q_TRIGGER_SECS
        ):
            candidate_questions_asked = True
            if not wrap_up_signal_sent:
                wrap_up_signal_sent = True
                chat_ctx.add_message(
                    role="system",
                    content="[SYSTEM ALERT: TIME LOW] The interview is approaching the time limit. Please conclude the current topic and transition to closing. Do not start new technical questions."
                )
            if candidate_line_count >= MIN_CANDIDATE_LINES_FOR_WRAPUP:
                # Normal wrapup - we had a real conversation
                candidate_q_text = (
                    f"We are coming up on time, {candidate_first_name or candidate_name}. "
                    "Before we wrap up - is there anything you want to make sure you have said, "
                    "or anything you want to ask me about the role?"
                )
            else:
                # Short/thin session - do not pretend we covered a lot
                candidate_q_text = (
                    f"We are nearly at time, {candidate_first_name or candidate_name}. "
                    "Is there anything you would like to add, or anything you want to ask me?"
                )
            try:
                await session.say(candidate_q_text)
                logger.info(
                    f"[TIMING] Candidate-questions nudge delivered (candidate_lines={candidate_line_count})"
                )
            except Exception as e:
                logger.warning(
                    f"[TIMING] Failed to deliver candidate-questions nudge: {e}"
                )

        # --- 5 seconds remaining: warm thank-you ---
        if remaining <= FINAL_THANKS_TRIGGER_SECS:
            break

        # --- Strict Inactivity Handling ---
        # Suppressed after wrap-up nudge to avoid piling on messages near end.
        # 1. 30s: Initial warm nudge
        # 2. 60s: Termination warning
        # 3. 70s: Final exit
        if candidate_questions_asked:
            await asyncio.sleep(1)
            continue

        inactivity_elapsed = (
            (time.monotonic() - awaiting_candidate_since)
            if awaiting_candidate_response and awaiting_candidate_since is not None
            else 0.0
        )

        # -- Stage 1: 30s Nudge --
        if (
            not is_agent_speaking
            and not is_candidate_speaking
            and awaiting_candidate_response
            and not inactivity_nudge_sent_for_current_prompt
            and inactivity_elapsed >= 30
        ):
            nudge_text = _pick_nudge()
            try:
                spawn_background_task(_deliver_nudge(nudge_text), "inactivity_nudge")
                inactivity_nudge_sent_for_current_prompt = True
                inactivity_nudge_count += 1
                logger.info(f"[NUDGE] 30s inactivity nudge delivered: '{nudge_text[:40]}...'")
            except Exception as e:
                logger.warning(f"[NUDGE] Failed to deliver 30s nudge: {e}")

        # -- Stage 2: 60s Termination Warning --
        if (
            not is_agent_speaking
            and not is_candidate_speaking
            and awaiting_candidate_response
            and not inactivity_warning_sent_for_current_prompt
            and inactivity_elapsed >= 60
        ):
            try:
                inactivity_warning_sent_for_current_prompt = True
                warning_text = (
                    f"I haven't heard from you in a minute, {candidate_first_name or candidate_name}. "
                    "If you're still there, please say something, otherwise I will have to end the call in 10 seconds."
                )
                spawn_background_task(_deliver_nudge(warning_text), "inactivity_warning")
                logger.info("[NUDGE] 60s termination warning delivered")
            except Exception as e:
                logger.warning(f"[NUDGE] Failed to deliver 60s warning: {e}")

        # -- Stage 3: 70s Final Termination --
        if (
            not is_agent_speaking
            and not is_candidate_speaking
            and awaiting_candidate_response
            and inactivity_warning_sent_for_current_prompt
            and inactivity_elapsed >= 70
        ):
            logger.info(
                f"[NUDGE] Ending interview due to final inactivity timeout ({int(inactivity_elapsed)}s)"
            )
            await _send_termination_signal()
            interview_marked_finished = True
            interview_finished_event.set()
            disconnect_event.set()
            break

        await asyncio.sleep(1)

    # Check if we exited because of finish/disconnect or because time ran out
    time_expired = not finished_task.done() and not disconnected_task.done()

    if time_expired:
        # Tailor the goodbye to how much content was actually exchanged.
        # Avoid "we covered a lot" if the candidate barely spoke.
        candidate_turns_final = sum(
            1 for line in transcript_lines if line.startswith("Candidate:")
        )
        if candidate_turns_final >= 4:
            goodbye_text = (
                f"Thanks so much for your time today, {candidate_first_name or candidate_name}."
                "It was genuinely great speaking with you. Take care, and all the best!"
            )
        else:
            goodbye_text = (
                f"Thanks for joining today, {candidate_first_name or candidate_name}. "
                "Really appreciate you being here. Take care, and all the best!"
            )

        try:
            await session.say(goodbye_text)
            await asyncio.sleep(3.0)  # wait for TTS to fully play before disconnecting
        except Exception:
            pass

        # FORCE DISCONNECT ROOM
        logger.info(f"Session hard-terminated due to time limit ({time_limit_mins}m)")
        await _send_termination_signal()
        interview_marked_finished = True
        interview_finished_event.set()
        disconnect_event.set()

    # Cancel pending tasks
    for task in [finished_task, disconnected_task]:
        if not task.done():
            task.cancel()

    # --- Grace Period: Wait for final STT results to arrive (Deepgram/LiveKit tail) ---
    logger.info(
        f"Interview ended (finished={finished_task.done()}, time_expired={time_expired}). Waiting 2s for final transcripts..."
    )
    await asyncio.sleep(2)

    # ✅ Final definitive save - Phase 5 includes proctoring report + answer scores
    proctoring_data = {
        "role_category": session_context.role_category,
        "candidate_band": session_context.candidate_band,
        "total_turns": turn_count,
        "suspicion_score": suspicion_score,
        "environment_risk": environment_risk,
        "integrity_risk": integrity_risk,
        "depth_risk": depth_risk,
        "composite_risk": suspicion_score,
        "current_mode": current_interview_mode,
        "exit_reason": "time_expired" if time_expired else "interview_finished",
        "events": proctoring_events,
        "contradictions": _contradictions_found,
        "claim_index": _claim_index,
        "contradiction_state": summarize_contradiction_state(_contradiction_state),
    }
    # Finalize Trust Engine and build recruiter summary before persisting
    _trust_state = finalize_trust_state(_trust_state)
    recruiter_summary = build_recruiter_summary(
        trust_state=_trust_state,
        answer_scores=answer_scores,
        contradictions_found=_contradictions_found,
        total_turns=turn_count,
        candidate_name=candidate_name,
        job_title=job_title,
        contradiction_state=_contradiction_state,
        proctoring_profile=proctoring_data,
    )
    logger.info(
        f"[TRUST] final score={_trust_state['trust_score']} "
        f"integrity={_trust_state['integrity_band']} "
        f"quality={_trust_state['quality_band']} "
        f"trend={_trust_state['trend']} "
        f"recommendation={recruiter_summary['recommendation']}"
    )

    await persist_transcript(
        app_id,
        transcript_lines,
        session_start_time,
        proctoring_data=proctoring_data,
        final_status="COMPLETED",
        recruiter_summary=recruiter_summary,
    )

    # Save answer quality scores
    await persist_answer_scores(app_id, answer_scores)

    selected_tts_model = org_sarvam_model if org_tts_provider == "SARVAM" else org_cartesia_model
    selected_stt_model = org_sarvam_stt_model if org_stt_provider == "SARVAM" else org_deepgram_model
    await persist_org_usage_metrics(
        org_id,
        latest_session_usage or session.usage,
        tts_provider=org_tts_provider,
        tts_model=selected_tts_model,
        stt_provider=org_stt_provider,
        stt_model=selected_stt_model,
    )

    # 🤖 AI Scorecard (NEW)
    if session_start_time:
        try:
            await asyncio.wait_for(
                generate_interview_summary(
                    app_id,
                    transcript_lines,
                    job_title,
                    org_id=org_id,
                    llm_model=analysis_openai_model,
                ),
                timeout=8,
            )
        except asyncio.TimeoutError:
            logger.warning(f"[SUMMARY] Timed out for {app_id}; skipped after 8s")
        except Exception as e:
            logger.error(f"[SUMMARY] Failed post-interview for {app_id}: {e}")

    # Sync with dashboard: Application COMPLETED
    if finished_task.done():
        await update_interview_status(app_id)
        # ⚡ Trigger Pinecone Sync immediately
        await notify_sync_engine(app_id)

    # Cancel any leftover fire-and-forget work so job teardown is instant.
    if background_tasks:
        logger.debug(f"[SHUTDOWN] Cancelling {len(background_tasks)} background task(s)")
        for bg_task in list(background_tasks):
            if not bg_task.done():
                bg_task.cancel()
        await asyncio.gather(*list(background_tasks), return_exceptions=True)
        background_tasks.clear()

    # Allow session to close
    logger.info("Final save complete. Closing job process.")
    try:
        session.shutdown(drain=True)
    except Exception:
        try:
            session.shutdown(drain=False)
        except Exception:
            pass


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            agent_name=AGENT_NAME,
            num_idle_processes=max(1, int(os.getenv("LIVEKIT_IDLE_PROCESSES", "8"))),
        )
    )
