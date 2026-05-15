"""
pipeline.py — Orchestrates the full extraction → parse → score → report flow.

This is the LangGraph-inspired state machine. Each step is isolated and
the state dict flows through, making failures easy to trace and recover.
"""
from __future__ import annotations
import json
import sys
from typing import TypedDict, Optional

from extraction_resume_JD_score_report.extractor import DocumentExtractor
from extraction_resume_JD_score_report.parser import DocumentParser
from extraction_resume_JD_score_report.scorer import ScoringEngine
from extraction_resume_JD_score_report.reporter import ReportGenerator


# ---------------------------------------------------------------------------
# Pipeline state — flows through every step
# ---------------------------------------------------------------------------
class PipelineState(TypedDict, total=False):
    file_path: str
    doc_type: str                # "JD" | "RESUME" | "SCORE"
    model_override: Optional[str]
    screening_criteria: Optional[dict]

    # Set by extractor
    raw_text: str

    # Set by parser
    parsed_data: dict
    usage: dict

    # Set by scorer (SCORE mode)
    score_result: dict

    # Set by reporter (SCORE mode)
    report: dict
    report_usage: dict

    # Final output (mirrors extract_pdf.py stdout JSON exactly)
    output: dict
    error: Optional[str]


# ---------------------------------------------------------------------------
# Pipeline steps (each step returns an updated state)
# ---------------------------------------------------------------------------

def _step_extract(state: PipelineState) -> PipelineState:
    """Step 1: Extract text from file."""
    sys.stderr.write(f"--- [25%] Extracting text from {state.get('doc_type', 'document')}... ---\n")
    sys.stderr.flush()
    
    extractor = DocumentExtractor()
    try:
        state["raw_text"] = extractor.extract(state["file_path"], state["doc_type"])
    except RuntimeError as exc:
        state["error"] = str(exc)
    return state


def _step_parse(state: PipelineState) -> PipelineState:
    """Step 2: Parse text via LLM."""
    if state.get("error"):
        return state
    
    sys.stderr.write(f"--- [50%] Running AI {state.get('doc_type', 'document')} analysis... ---\n")
    sys.stderr.flush()
    
    parser = DocumentParser()
    result = parser.parse(
        state["raw_text"],
        state["doc_type"],
        state.get("model_override"),
    )
    state["parsed_data"] = result.get("data", result)
    state["usage"] = result.get("usage", {})
    return state


# ---------------------------------------------------------------------------
# Pipeline runner
# ---------------------------------------------------------------------------

class HRPipeline:
    """
    Main pipeline orchestrator. Mirrors the __main__ block of extract_pdf.py
    but as a clean, testable class.

    Returns the same JSON dict that the old script printed to stdout.
    """

    def run_jd_or_resume(
        self,
        file_path: str,
        doc_type: str,
        model_override: str | None = None,
    ) -> dict:
        """Handle JD or RESUME file → returns {text, data, usage}."""
        state: PipelineState = {
            "file_path": file_path,
            "doc_type": doc_type,
            "model_override": model_override,
        }
        
        state = _step_extract(state)
        if state.get("error"):
            return {"error": state["error"]}

        raw_text = state["raw_text"]
        if not raw_text or len(raw_text.strip()) < 50:
            return {
                "error": "The document appears to be empty or contains unreadable content.",
                "code": "EMPTY_DOCUMENT_ERROR",
            }

        state = _step_parse(state)
        if state.get("error"):
            return {"error": state["error"]}

        sys.stderr.write("--- [75%] Finalizing structured output... ---\n")
        usage = state.get("usage", {})
        sys.stderr.write(f"--- [AI Usage] Model: {usage.get('model')} | Tokens: {usage.get('inputTokens')} in, {usage.get('outputTokens')} out ---\n")
        sys.stderr.flush()

        res = {
            "text": raw_text,
            "data": state["parsed_data"],
            "usage": state["usage"],
        }
        
        sys.stderr.write("--- [100%] Process complete! ---\n")
        sys.stderr.flush()
        return res

    def run_score(
        self,
        json_text: str,
        model_override: str | None = None,
        screening_criteria: dict | None = None,
    ) -> dict:
        """Handle SCORE mode → returns {data, usage}."""
        sys.stderr.write("--- [25%] Initializing scoring engine... ---\n")
        sys.stderr.flush()
        
        state: PipelineState = {
            "file_path": "",
            "doc_type": "SCORE",
            "model_override": model_override,
            "screening_criteria": screening_criteria,
            "raw_text": json_text,
        }
        
        sys.stderr.write("--- [50%] Running deterministic scoring & AI report generation... ---\n")
        sys.stderr.flush()
        
        # For SCORE, parse the JSON payload directly (this internally runs scoring + reporting)
        parser = DocumentParser()
        result = parser.parse(json_text, "SCORE", model_override)
        
        sys.stderr.write("--- [75%] Compiling final candidate assessment... ---\n")
        usage = result.get("usage", {})
        sys.stderr.write(f"--- [AI Usage] Model: {usage.get('model')} | Tokens: {usage.get('inputTokens')} in, {usage.get('outputTokens')} out ---\n")
        sys.stderr.flush()
        
        final_res = {
            "data": result.get("data", result),
            "usage": result.get("usage", {
                "model": "gpt-4o-mini",
                "inputTokens": 0,
                "outputTokens": 0,
                "cachedInputTokens": 0,
            }),
        }
        
        sys.stderr.write("--- [100%] Scoring complete! ---\n")
        sys.stderr.flush()
        return final_res
