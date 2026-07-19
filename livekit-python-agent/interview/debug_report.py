"""
debug_report.py
Builds a per-turn debug PDF for a local test interview (AI question, candidate
answer, scores, signal, decision, probe directive) and posts it to Slack.

Only ever called for local test sessions (isTest=true) — see agent_runtime.py.

Env vars (set in .env — see .env.example for instructions):
  SLACK_BOT_TOKEN     — xoxb-... Bot User OAuth Token (needs files:write scope)
  SLACK_DEBUG_CHANNEL — Channel ID (e.g. C01234ABCDE) where PDFs are posted

Both env vars are required — there is no fallback. If either is missing,
debug PDF posting is skipped with a logged error.
"""
from __future__ import annotations

import io
import logging
import os
from typing import Any, Optional

# Load .env first so SLACK_BOT_TOKEN / SLACK_DEBUG_CHANNEL are present
from dotenv import load_dotenv
load_dotenv(override=False)

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)

logger = logging.getLogger("interview-agent")

SLACK_BOT_TOKEN = os.environ.get("SLACK_BOT_TOKEN", "").strip()
SLACK_DEBUG_CHANNEL = os.environ.get("SLACK_DEBUG_CHANNEL", "").strip()


def _styles() -> dict:
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("Mono", parent=ss["Code"], fontSize=8, leading=10))
    ss.add(ParagraphStyle("Small", parent=ss["BodyText"], fontSize=9, leading=12, alignment=TA_LEFT))
    return ss


def _esc(text: Any) -> str:
    return (str(text) if text is not None else "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def build_debug_pdf(
    *,
    app_id: str,
    candidate_name: str,
    job_title: str,
    answer_scores: list[dict],
    topic_pool: list[Any],
    covered_topics: Optional[list[dict]] = None,
    topic_records: Optional[list[dict]] = None,
) -> bytes:
    """Renders the full per-turn debug trace + topic pool + coverage state to a PDF, returns bytes."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=LETTER,
        topMargin=0.6 * inch, bottomMargin=0.6 * inch,
        leftMargin=0.6 * inch, rightMargin=0.6 * inch,
    )
    ss = _styles()
    story: list[Any] = []

    story.append(Paragraph(f"Interview Debug Report — {_esc(candidate_name)}", ss["Title"]))
    story.append(Paragraph(f"App ID: {_esc(app_id)} | Job Title: {_esc(job_title)} | Turns: {len(answer_scores)}", ss["Normal"]))
    story.append(Spacer(1, 0.2 * inch))

    # -- Topic pool (full brief) ------------------------------------------------
    story.append(Paragraph("1. Topic Pool (Interview Brief)", ss["Heading2"]))
    pool_rows = [["#", "Title", "Type", "Probe Focus", "Probe Avoid"]]
    for i, t in enumerate(topic_pool or [], 1):
        pool_rows.append([
            str(i),
            Paragraph(_esc(getattr(t, "title", "")), ss["Small"]),
            _esc(getattr(t, "topic_type", "")),
            Paragraph(_esc(", ".join(getattr(t, "probe_focus", []) or [])), ss["Small"]),
            Paragraph(_esc(", ".join(getattr(t, "probe_avoid", []) or [])), ss["Small"]),
        ])
    pool_table = Table(pool_rows, colWidths=[0.3 * inch, 1.8 * inch, 0.8 * inch, 1.8 * inch, 1.8 * inch])
    pool_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), "#dddddd"),
        ("GRID", (0, 0), (-1, -1), 0.5, "#999999"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(pool_table)
    story.append(Spacer(1, 0.2 * inch))

    # -- Covered topics (CoveredTopics store -- gist + forbidden questions) -----
    story.append(Paragraph("2. Covered Topics", ss["Heading2"]))
    if covered_topics:
        cov_rows = [["Title", "Source", "Via Topic", "Gist", "Questions Asked"]]
        for c in covered_topics:
            cov_rows.append([
                Paragraph(_esc(c.get("display_title")), ss["Small"]),
                _esc(c.get("source")),
                Paragraph(_esc(c.get("via_topic") or "—"), ss["Small"]),
                Paragraph(_esc(c.get("gist") or "—"), ss["Small"]),
                Paragraph(_esc(" | ".join(c.get("questions_asked") or [])), ss["Small"]),
            ])
        cov_table = Table(cov_rows, colWidths=[1.3 * inch, 0.7 * inch, 1.0 * inch, 1.5 * inch, 2.0 * inch])
        cov_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), "#dddddd"),
            ("GRID", (0, 0), (-1, -1), 0.5, "#999999"),
            ("FONTSIZE", (0, 0), (-1, -1), 7.5),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(cov_table)
    else:
        story.append(Paragraph("(none)", ss["Small"]))
    story.append(Spacer(1, 0.2 * inch))

    # -- Topic records (per-topic outcome: exit reason, probe count, avg scores)
    story.append(Paragraph("3. Topic Coverage Outcomes", ss["Heading2"]))
    if topic_records:
        tr_rows = [["Topic", "Type", "Exit Reason", "Probes", "Avg Overall", "Avg Depth", "Denied"]]
        for r in topic_records:
            scores = r.get("scores") or {}
            tr_rows.append([
                Paragraph(_esc(r.get("topic")), ss["Small"]),
                _esc(r.get("topic_type")),
                _esc(r.get("exit_reason")),
                str(r.get("probe_count", 0)),
                str(scores.get("avg_overall", "—")),
                str(scores.get("avg_depth", "—")),
                str(r.get("denied", False)),
            ])
        tr_table = Table(tr_rows, colWidths=[1.8 * inch, 0.7 * inch, 0.9 * inch, 0.6 * inch, 0.8 * inch, 0.8 * inch, 0.6 * inch])
        tr_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), "#dddddd"),
            ("GRID", (0, 0), (-1, -1), 0.5, "#999999"),
            ("FONTSIZE", (0, 0), (-1, -1), 7.5),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(tr_table)
    else:
        story.append(Paragraph("(none)", ss["Small"]))
    story.append(PageBreak())

    story.append(Paragraph("4. Per-Turn Trace", ss["Heading2"]))
    story.append(Spacer(1, 0.1 * inch))

    # -- Per-turn trace ---------------------------------------------------------
    for qr in answer_scores:
        if qr.get("is_warmup"):
            continue
        turn = qr.get("turn", "?")
        story.append(Paragraph(f"TURN {turn}", ss["Heading2"]))
        story.append(Paragraph(f"<b>Topic:</b> {_esc(qr.get('topic'))}", ss["Small"]))
        story.append(Paragraph(f"<b>AI Question:</b> {_esc(qr.get('question'))}", ss["Small"]))
        story.append(Paragraph(f"<b>Candidate Answer:</b> {_esc(qr.get('answer'))}", ss["Small"]))
        story.append(Spacer(1, 0.05 * inch))

        score_rows = [["Clarity", "Depth", "Specificity", "Grounding", "Overall"], [
            qr.get("clarity"), qr.get("depth"), qr.get("specificity"),
            qr.get("grounding"), qr.get("overall"),
        ]]
        score_table = Table(score_rows, colWidths=[1.1 * inch] * 5)
        score_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), "#eeeeee"),
            ("GRID", (0, 0), (-1, -1), 0.5, "#999999"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
        ]))
        story.append(score_table)
        story.append(Spacer(1, 0.05 * inch))

        sat_score = qr.get("topic_saturation_score", 0)
        sat_thresh = qr.get("topic_saturation_threshold", 0)
        pct = f"{100 * sat_score / sat_thresh:.0f}%" if sat_thresh else "n/a"
        story.append(Paragraph(
            f"<b>Topic Saturation:</b> {sat_score:.1f} / {sat_thresh:.1f} ({pct})", ss["Small"]))
        story.append(Paragraph(
            f"<b>Signals Fired:</b> signal={_esc(qr.get('signal') or 'none')}, "
            f"saturated={qr.get('is_saturated')}, weak_exit={qr.get('weak_exit')}, dry_topic={qr.get('dry_topic')}",
            ss["Small"]))
        story.append(Paragraph(f"<b>Agent Pacing Decision:</b> {_esc(qr.get('action'))}", ss["Small"]))
        story.append(Paragraph(f"<b>Signal Reason:</b> {_esc(qr.get('signal_reason') or '—')}", ss["Small"]))
        story.append(Paragraph(f"<b>Band:</b> {_esc(qr.get('band'))} | <b>Topic Follow-ups:</b> {qr.get('topic_follow_ups', 0)}", ss["Small"]))
        story.append(Paragraph(f"<b>Response Latency:</b> {qr.get('response_latency_sec', 'n/a')}s", ss["Small"]))

        directive = qr.get("directive_text")
        if directive:
            story.append(Spacer(1, 0.05 * inch))
            story.append(Paragraph("<b>Next-Turn Directive (AI Internal Instructions):</b>", ss["Small"]))
            story.append(Paragraph(_esc(directive).replace("\n", "<br/>"), ss["Mono"]))

        story.append(Spacer(1, 0.25 * inch))

    doc.build(story)
    return buf.getvalue()


async def post_pdf_to_slack(pdf_bytes: bytes, filename: str, title: str) -> bool:
    """
    Uploads the debug PDF to Slack using the files.getUploadURLExternal → upload → complete flow.
    Requires SLACK_BOT_TOKEN (xoxb-..., files:write scope) and SLACK_DEBUG_CHANNEL (channel ID).
    No-op with a clear warning if either env var is missing.
    Returns True only on confirmed delivery -- False on every failure path, so the
    caller can alert instead of the failure being visible only in worker logs.
    """
    # Re-read env at call time so tokens set after module import are picked up.
    bot_token = os.environ.get("SLACK_BOT_TOKEN", "").strip()
    channel_id = os.environ.get("SLACK_DEBUG_CHANNEL", "").strip()

    if not bot_token:
        logger.error(
            "[DEBUG_REPORT] SLACK_BOT_TOKEN is not set — "
            "PDF will NOT be sent. See .env.example for setup instructions."
        )
        return False
    if not channel_id:
        logger.error(
            "[DEBUG_REPORT] SLACK_DEBUG_CHANNEL is not set — "
            "PDF will NOT be sent. See .env.example for setup instructions."
        )
        return False

    logger.info(
        "[DEBUG_REPORT] Uploading PDF to Slack | file=%s bytes=%d channel=%s",
        filename, len(pdf_bytes), channel_id,
    )

    import aiohttp

    _timeout = aiohttp.ClientTimeout(total=300)
    auth_headers = {"Authorization": f"Bearer {bot_token}"}

    try:
        async with aiohttp.ClientSession(headers=auth_headers, timeout=_timeout) as http:
            # -- Step 1: Get a pre-signed upload URL ------------------------
            logger.debug("[DEBUG_REPORT] Step 1: Requesting upload URL from Slack...")
            async with http.post(
                "https://slack.com/api/files.getUploadURLExternal",
                data={"filename": filename, "length": str(len(pdf_bytes))},
            ) as resp:
                url_resp = await resp.json()

            if not url_resp.get("ok"):
                logger.error(
                    "[DEBUG_REPORT] Step 1 FAILED — files.getUploadURLExternal error: %s | "
                    "Check that your bot token has the 'files:write' OAuth scope.",
                    url_resp,
                )
                return False

            upload_url: str = url_resp["upload_url"]
            file_id: str = url_resp["file_id"]
            logger.debug("[DEBUG_REPORT] Step 1 OK — file_id=%s upload_url=%s", file_id, upload_url[:60])

            # -- Step 2: Upload the raw PDF bytes to the pre-signed URL -----
            logger.debug("[DEBUG_REPORT] Step 2: Uploading PDF bytes to pre-signed URL...")
            form = aiohttp.FormData()
            form.add_field(
                "file", pdf_bytes,
                filename=filename,
                content_type="application/pdf",
            )
            # Upload URL is unauthenticated -- do NOT send the Authorization header
            async with aiohttp.ClientSession(timeout=_timeout) as upload_http:
                async with upload_http.post(upload_url, data=form) as up_resp:
                    up_body = await up_resp.text()
                    if up_resp.status not in (200, 204):
                        logger.error(
                            "[DEBUG_REPORT] Step 2 FAILED — upload status %d body=%s",
                            up_resp.status, up_body[:200],
                        )
                        return False
            logger.debug("[DEBUG_REPORT] Step 2 OK — PDF bytes uploaded successfully")

            # -- Step 3: Complete the upload and share to channel -----------
            logger.debug("[DEBUG_REPORT] Step 3: Completing upload and posting to channel...")
            initial_comment = (
                f"📋 *Interview Debug Report*\n"
                f"*{title}*\n"
                f"Turns: {len(pdf_bytes) // 1024}KB PDF attached"
            )
            async with http.post(
                "https://slack.com/api/files.completeUploadExternal",
                json={
                    "files": [{"id": file_id, "title": title}],
                    "channel_id": channel_id,
                    "initial_comment": initial_comment,
                },
            ) as comp_resp:
                complete = await comp_resp.json()

            if not complete.get("ok"):
                logger.error(
                    "[DEBUG_REPORT] Step 3 FAILED — files.completeUploadExternal error: %s | "
                    "Check that the bot is invited to the channel (channel_id=%s).",
                    complete, channel_id,
                )
                return False

            logger.info(
                "[DEBUG_REPORT] ✅ PDF uploaded to Slack successfully | file=%s channel=%s",
                filename, channel_id,
            )
            return True

    except aiohttp.ClientError as net_err:
        logger.error("[DEBUG_REPORT] Network error during Slack upload: %s", net_err, exc_info=True)
        return False
    except Exception as exc:
        logger.error("[DEBUG_REPORT] Unexpected error during Slack upload: %s", exc, exc_info=True)
        return False


async def generate_and_send_debug_report(
    *,
    app_id: str,
    candidate_name: str,
    job_title: str,
    answer_scores: list[dict],
    topic_pool: list[Any],
    covered_topics: Optional[list[dict]] = None,
    topic_records: Optional[list[dict]] = None,
) -> None:
    """
    Builds the per-turn debug PDF and posts it to Slack.
    Called at interview completion for test sessions (isTest=True).
    All exceptions are caught and logged — never raises to the caller.
    """
    logger.info(
        "[DEBUG_REPORT] Generating interview debug PDF | app_id=%s candidate=%s turns=%d",
        app_id, candidate_name, len(answer_scores),
    )
    try:
        pdf_bytes = build_debug_pdf(
            app_id=app_id,
            candidate_name=candidate_name,
            job_title=job_title,
            answer_scores=answer_scores,
            topic_pool=topic_pool,
            covered_topics=covered_topics,
            topic_records=topic_records,
        )
        logger.info("[DEBUG_REPORT] PDF built — size=%d bytes", len(pdf_bytes))
        filename = f"interview_debug_{app_id}.pdf"
        title = f"Interview Debug — {candidate_name} ({len(answer_scores)} turns) — {app_id}"
        sent = await post_pdf_to_slack(pdf_bytes, filename, title)
        if not sent:
            await _alert_debug_report_failure(app_id, candidate_name, "post_pdf_to_slack returned False -- see logs above for the specific step that failed")
    except Exception as e:
        logger.error(
            "[DEBUG_REPORT] Failed to generate/send debug report for %s: %s",
            app_id, e, exc_info=True,
        )
        await _alert_debug_report_failure(app_id, candidate_name, str(e))


async def _alert_debug_report_failure(app_id: str, candidate_name: str, error: str) -> None:
    """Debug-PDF failures used to be visible only in worker logs -- silent from
    the outside, so missing test-session PDFs went unnoticed. Routes through the
    same worker-error Slack alert as other background-job failures."""
    try:
        from interview.slack_error_logger import log_worker_error
        await log_worker_error(
            error=error,
            reason="Debug PDF failed to reach Slack for a test session",
            context={"appId": app_id, "candidateName": candidate_name},
        )
    except Exception:
        pass  # alerting must never mask the original failure

