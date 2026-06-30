"""
slack_error_logger.py
Structured error alerting to Slack for backend/interview errors.
Mirrors the TypeScript slack-error-logger for consistency across the stack.

Usage:
    from interview.slack_error_logger import log_livekit_error, log_interview_error

    try:
        await session.start(agent, room)
    except Exception as e:
        await log_livekit_error(
            app_id=app_id,
            candidate_name=candidate_name,
            error=str(e),
            phase='session_start'
        )
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Any, Optional

logger = logging.getLogger("interview-agent")

SLACK_ERROR_WEBHOOK = os.environ.get("SLACK_ERROR_WEBHOOK_URL", "")
SLACK_ERROR_CHANNEL = os.environ.get("SLACK_ERROR_CHANNEL", "#debug-alerts")

TYPE_EMOJIS = {
    "login": "🔐",
    "resume_upload": "📄",
    "livekit": "🎙️",
    "drive": "💾",
    "api": "⚠️",
    "database": "🗄️",
    "interview": "🎤",
    "tts": "🔊",
    "stt": "🎧",
    "llm": "🧠",
    "redis": "🟥",
    "worker": "⚙️",
}


def _format_timestamp(dt: Optional[datetime] = None) -> str:
    """Format timestamp in IST."""
    if dt is None:
        dt = datetime.utcnow()
    return dt.strftime("%Y-%m-%d %H:%M:%S IST")


def _build_error_message(
    error_type: str,
    error: str,
    reason: Optional[str] = None,
    org_name: Optional[str] = None,
    drive_name: Optional[str] = None,
    candidate_name: Optional[str] = None,
    user_id: Optional[str] = None,
    context: Optional[dict[str, Any]] = None,
) -> str:
    """Build structured Slack message for error."""
    emoji = TYPE_EMOJIS.get(error_type, "❌")
    timestamp = _format_timestamp()

    details = f"```\n=======\n```\n"
    details += f"{emoji} **{error_type.upper()} ERROR**\n"
    details += f"_{timestamp}_\n\n"

    if org_name:
        details += f"🏢 **Org:** {org_name}\n"
    if drive_name:
        details += f"💾 **Drive:** {drive_name}\n"
    if candidate_name:
        details += f"👤 **Candidate:** {candidate_name}\n"
    if user_id:
        details += f"👨‍💼 **User ID:** {user_id}\n"

    details += f"\n**Error Message:**\n```\n{error}\n```\n"

    if reason:
        details += f"\n**Reason/Context:**\n{reason}\n"

    if context:
        details += "\n**Additional Context:**\n"
        for key, value in context.items():
            val = json.dumps(value) if isinstance(value, dict) else str(value)
            details += f"• **{key}:** {val}\n"

    details += f"\n```\n=======\n```\n"

    return details


async def _post_to_slack(message: str, error_type: str) -> None:
    """Post error message to Slack via webhook."""
    if not SLACK_ERROR_WEBHOOK:
        logger.error("[SLACK_ERROR_LOG] Webhook not configured. Error type: %s", error_type)
        return

    try:
        payload = {
            "channel": SLACK_ERROR_CHANNEL,
            "text": f"{error_type.upper()} ERROR",
            "blocks": [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": message,
                    },
                },
                {
                    "type": "context",
                    "elements": [
                        {
                            "type": "mrkdwn",
                            "text": f"Error logged at {datetime.utcnow().isoformat()}",
                        },
                    ],
                },
            ],
        }

        import aiohttp

        async with aiohttp.ClientSession() as session:
            async with session.post(
                SLACK_ERROR_WEBHOOK,
                json=payload,
                headers={"Content-Type": "application/json"},
            ) as resp:
                if not resp.ok:
                    logger.error("[SLACK_ERROR_LOG] Failed: %s", await resp.text())
    except Exception as e:
        logger.error("[SLACK_ERROR_LOG] Exception: %s", e, exc_info=True)


async def log_livekit_error(
    *,
    app_id: str,
    candidate_name: Optional[str] = None,
    org_name: Optional[str] = None,
    error: str,
    phase: Optional[str] = None,
    reason: Optional[str] = None,
) -> None:
    """Log LiveKit session error."""
    context = {"app_id": app_id, "phase": phase or "unknown"}
    message = _build_error_message(
        error_type="livekit",
        error=error,
        reason=reason or "LiveKit session failed",
        org_name=org_name,
        candidate_name=candidate_name,
        context=context,
    )
    await _post_to_slack(message, "livekit")


async def log_interview_error(
    *,
    app_id: str,
    candidate_name: Optional[str] = None,
    org_name: Optional[str] = None,
    error: str,
    reason: Optional[str] = None,
    phase: Optional[str] = None,
) -> None:
    """Log interview processing error."""
    context = {"app_id": app_id, "phase": phase or "interview_processing"}
    message = _build_error_message(
        error_type="interview",
        error=error,
        reason=reason or "Interview processing failed",
        org_name=org_name,
        candidate_name=candidate_name,
        context=context,
    )
    await _post_to_slack(message, "interview")


async def log_database_error(
    *,
    app_id: Optional[str] = None,
    operation: str,
    error: str,
    reason: Optional[str] = None,
) -> None:
    """Log database operation error."""
    context = {"operation": operation}
    message = _build_error_message(
        error_type="database",
        error=error,
        reason=reason or f"Database {operation} failed",
        context=context,
    )
    await _post_to_slack(message, "database")


async def log_resume_upload_error(
    *,
    org_name: str,
    drive_name: str,
    candidate_name: Optional[str] = None,
    error: str,
    reason: Optional[str] = None,
    file_size: Optional[int] = None,
) -> None:
    """Log resume upload error."""
    context = {"file_size": file_size}
    message = _build_error_message(
        error_type="resume_upload",
        error=error,
        reason=reason or "Resume upload processing failed",
        org_name=org_name,
        drive_name=drive_name,
        candidate_name=candidate_name,
        context=context,
    )
    await _post_to_slack(message, "resume_upload")


async def log_drive_error(
    *,
    org_name: str,
    drive_name: str,
    operation: str,
    error: str,
    reason: Optional[str] = None,
) -> None:
    """Log drive operation error."""
    context = {"operation": operation}
    message = _build_error_message(
        error_type="drive",
        error=error,
        reason=reason or f"Drive {operation} failed",
        org_name=org_name,
        drive_name=drive_name,
        context=context,
    )
    await _post_to_slack(message, "drive")


async def log_tts_error(
    *,
    org_name: Optional[str] = None,
    candidate_name: Optional[str] = None,
    provider: str,
    error: str,
    reason: Optional[str] = None,
    context: Optional[dict[str, Any]] = None,
) -> None:
    """Log TTS provider error."""
    ctx = {"provider": provider, **(context or {})}
    message = _build_error_message(
        error_type="tts",
        error=error,
        reason=reason or "TTS provider failed",
        org_name=org_name,
        candidate_name=candidate_name,
        context=ctx,
    )
    await _post_to_slack(message, "tts")


async def log_stt_error(
    *,
    org_name: Optional[str] = None,
    candidate_name: Optional[str] = None,
    provider: str,
    error: str,
    reason: Optional[str] = None,
    context: Optional[dict[str, Any]] = None,
) -> None:
    """Log STT provider error."""
    ctx = {"provider": provider, **(context or {})}
    message = _build_error_message(
        error_type="stt",
        error=error,
        reason=reason or "STT provider failed",
        org_name=org_name,
        candidate_name=candidate_name,
        context=ctx,
    )
    await _post_to_slack(message, "stt")


async def log_llm_error(
    *,
    app_id: Optional[str] = None,
    org_name: Optional[str] = None,
    candidate_name: Optional[str] = None,
    provider: str,
    error: str,
    reason: Optional[str] = None,
    context: Optional[dict[str, Any]] = None,
) -> None:
    """Log LLM provider error."""
    ctx = {"provider": provider, "app_id": app_id, **(context or {})}
    message = _build_error_message(
        error_type="llm",
        error=error,
        reason=reason or "LLM call failed",
        org_name=org_name,
        candidate_name=candidate_name,
        context=ctx,
    )
    await _post_to_slack(message, "llm")


async def log_redis_error(
    *,
    error: str,
    reason: Optional[str] = None,
    context: Optional[dict[str, Any]] = None,
) -> None:
    """Log Redis connection/operation error."""
    message = _build_error_message(
        error_type="redis",
        error=error,
        reason=reason or "Redis connection/operation failed",
        context=context,
    )
    await _post_to_slack(message, "redis")


async def log_worker_error(
    *,
    error: str,
    reason: Optional[str] = None,
    context: Optional[dict[str, Any]] = None,
) -> None:
    """Log background worker/job error."""
    message = _build_error_message(
        error_type="worker",
        error=error,
        reason=reason or "Background worker job failed",
        context=context,
    )
    await _post_to_slack(message, "worker")
