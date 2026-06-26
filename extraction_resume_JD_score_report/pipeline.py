"""
pipeline.py — Orchestrates the full extraction → parse → score → report flow.

This is the LangGraph-inspired state machine. Each step is isolated and
the state dict flows through, making failures easy to trace and recover.
"""
from __future__ import annotations
import json
import os
import sys
from typing import TypedDict, Optional

# Ensure the parent `scripts/` directory is on sys.path so sibling packages resolve
_scripts_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _scripts_dir not in sys.path:
    sys.path.insert(0, _scripts_dir)

from extraction_resume_JD_score_report.extractor import DocumentExtractor
from extraction_resume_JD_score_report.parser import DocumentParser
# reporter.py exposes generate_report_inline() — called internally via DocumentParser.
# No class-level import needed here.


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

    def run_resume_and_score(
        self,
        file_path: str,
        jd_payload: dict,
        extract_model: str | None = None,
        report_model: str | None = None,
    ) -> dict:
        """
        Combined mode: extract + parse resume, then immediately score against JD —
        all in one subprocess so there's no cold-start penalty between the two steps.

        jd_payload must contain: jd, jd_raw_text, threshold, screening_criteria
        Returns: {text, data (structured resume), score (full score result), usage_extract, usage_score}
        """
        # Step 1: extract text from PDF
        sys.stderr.write("--- [20%] Extracting resume text... ---\n")
        sys.stderr.flush()
        state: PipelineState = {
            "file_path": file_path,
            "doc_type": "RESUME",
            "model_override": extract_model,
        }
        state = _step_extract(state)
        if state.get("error"):
            return {"error": state["error"]}

        raw_text = state["raw_text"]
        if not raw_text or len(raw_text.strip()) < 50:
            return {"error": "The document appears to be empty or contains unreadable content.", "code": "EMPTY_DOCUMENT_ERROR"}

        # Step 2: parse resume via LLM
        sys.stderr.write("--- [40%] Parsing resume structure... ---\n")
        sys.stderr.flush()
        state = _step_parse(state)
        if state.get("error"):
            return {"error": state["error"]}

        structured_resume = state["parsed_data"]
        usage_extract = state.get("usage", {})
        sys.stderr.write(f"--- [AI Extract] Model: {usage_extract.get('model')} | Tokens: {usage_extract.get('inputTokens')} in, {usage_extract.get('outputTokens')} out ---\n")

        # Step 3: score + report (reuse the SCORE pipeline with the already-parsed resume)
        sys.stderr.write("--- [60%] Scoring and generating report... ---\n")
        sys.stderr.flush()
        score_payload = json.dumps({
            "resume": structured_resume,
            "jd": jd_payload.get("jd", {}),
            "resume_raw_text": raw_text,
            "jd_raw_text": jd_payload.get("jd_raw_text", ""),
            "threshold": jd_payload.get("threshold", 70),
            "screening_criteria": jd_payload.get("screening_criteria", {}),
        })
        score_result = self.run_score(score_payload, model_override=report_model)
        if score_result.get("error"):
            return {"error": score_result["error"]}

        sys.stderr.write("--- [100%] Complete! ---\n")
        sys.stderr.flush()
        return {
            "text": raw_text,
            "data": structured_resume,
            "score": score_result.get("data", {}),
            "usage_extract": usage_extract,
            "usage_score": score_result.get("usage", {}),
        }

    def run_score(
        self,
        json_text: str,
        model_override: str | None = None,
    ) -> dict:
        """Handle SCORE mode → returns {data, usage}."""
        sys.stderr.write("--- [25%] Initializing scoring engine... ---\n")
        sys.stderr.flush()
        
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
                "model": "gpt-5.4-mini",
                "inputTokens": 0,
                "outputTokens": 0,
                "cachedInputTokens": 0,
            }),
        }
        
        sys.stderr.write("--- [100%] Scoring complete! ---\n")
        sys.stderr.flush()
        return final_res


# ---------------------------------------------------------------------------
# CLI entry point — called by extract_pdf.py via `from pipeline import main`
# Mirrors the exact stdout JSON contract the Node.js worker expects.
# ---------------------------------------------------------------------------

def main() -> None:
    """
    CLI entry point. Reads arguments from sys.argv, delegates to HRPipeline,
    and prints the result as JSON to stdout.

    Usage (called by the Node worker via subprocess):
        python extract_pdf.py <file_path> <doc_type> [model_override] [screening_criteria_json]

    Doc types:
        JD      → Extract and parse a Job Description PDF.
        RESUME  → Extract and parse a Resume PDF.
        SCORE   → Score a candidate against a JD (input is JSON text, not a file).
    """
    import json as _json

    args = sys.argv[1:]
    if len(args) < 2:
        _json.dump({"error": "Usage: extract_pdf.py <file_path> <doc_type> [extract_model] [report_model]"}, sys.stdout)
        sys.exit(1)

    file_path = args[0]
    doc_type = args[1].upper()
    model_override = args[2] if len(args) > 2 and args[2] else None

    pipeline = HRPipeline()

    if doc_type == "RESUME_AND_SCORE":
        # JD payload is passed via stdin as JSON to avoid a temp file round-trip.
        # argv[2] = extract_model, argv[3] = report_model
        extract_model = args[2] if len(args) > 2 and args[2] else None
        report_model  = args[3] if len(args) > 3 and args[3] else None
        try:
            jd_payload = _json.loads(sys.stdin.read())
        except Exception as e:
            _json.dump({"error": f"Failed to read JD payload from stdin: {e}"}, sys.stdout)
            sys.exit(1)
        result = pipeline.run_resume_and_score(
            file_path=file_path,
            jd_payload=jd_payload,
            extract_model=extract_model,
            report_model=report_model,
        )
    elif doc_type == "SCORE":
        # file_path is actually the raw JSON text for SCORE mode.
        result = pipeline.run_score(
            json_text=file_path,
            model_override=model_override,
        )
    else:
        result = pipeline.run_jd_or_resume(
            file_path=file_path,
            doc_type=doc_type,
            model_override=model_override,
        )

    if result.get("error"):
        sys.stderr.write(f"[PIPELINE ERROR] {result['error']}\n")
        sys.stderr.flush()
        _json.dump(result, sys.stdout)
        sys.exit(1)

    _json.dump(result, sys.stdout)
    sys.stdout.flush()
