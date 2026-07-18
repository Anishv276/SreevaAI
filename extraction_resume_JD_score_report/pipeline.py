"""
pipeline.py v2 â€” Production entry point for the HR Agent pipeline.

CLI contract (called by worker.ts via scripts/extract_pdf.py):
  python extract_pdf.py <file_path> JD               <model>          â†’ {text, data, usage}
  python extract_pdf.py <file_path> RESUME           <model>          â†’ {text, data, usage}
  python extract_pdf.py <file_path> RESUME_AND_SCORE <model> <model>  â†’ {text, data, score, usage_extract, usage_score}
    RESUME_AND_SCORE reads JD payload JSON from stdin:
      {jd, jd_raw_text, threshold, screening_criteria}

model is required -- always the org's DB-configured llmResumeExtraction /
llmJdExtraction / llmResumeReport value, passed through by worker.ts.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

_repo_root = Path(__file__).resolve().parents[1]
if str(_repo_root) not in sys.path:
    sys.path.insert(0, str(_repo_root))


# -- Text extraction from file -------------------------------------------------

def _extract_text(file_path: str) -> str:
    """Extract plain text from PDF or text file."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    suffix = path.suffix.lower()

    if suffix == ".pdf":
        try:
            import pdfplumber
            with pdfplumber.open(str(path)) as pdf:
                pages = [p.extract_text() or "" for p in pdf.pages]
            text = "\n".join(pages).strip()
            if text:
                return text
        except Exception:
            pass
        # pypdf fallback
        try:
            from pypdf import PdfReader
            reader = PdfReader(str(path))
            text = "\n".join(p.extract_text() or "" for p in reader.pages).strip()
            if text:
                return text
        except Exception:
            pass
        raise RuntimeError("Could not extract text from PDF â€” file may be scanned/image-only.")

    # Plain text / markdown / json
    return path.read_text(encoding="utf-8", errors="replace").strip()


# -- Pipeline ------------------------------------------------------------------

class Pipeline:
    def run_jd(self, file_path: str, model: str) -> dict:
        sys.stderr.write("--- [20%] Extracting JD text... ---\n"); sys.stderr.flush()
        raw_text = _extract_text(file_path)
        if len(raw_text.strip()) < 20:
            return {"error": "JD appears empty or unreadable.", "code": "EMPTY_DOCUMENT_ERROR"}

        sys.stderr.write("--- [50%] Parsing JD structure... ---\n"); sys.stderr.flush()
        from extraction_resume_JD_score_report.parser import DocumentParser
        result = DocumentParser().parse(raw_text, "JD", model_override=model)
        if result.get("error"):
            return result

        sys.stderr.write("--- [100%] JD extraction complete. ---\n"); sys.stderr.flush()
        return {"text": raw_text, "data": result["data"], "usage": result.get("usage", {})}

    def run_resume(self, file_path: str, model: str) -> dict:
        sys.stderr.write("--- [20%] Extracting resume text... ---\n"); sys.stderr.flush()
        raw_text = _extract_text(file_path)
        if len(raw_text.strip()) < 50:
            return {"error": "Resume appears empty or unreadable.", "code": "EMPTY_DOCUMENT_ERROR"}

        sys.stderr.write("--- [50%] Parsing resume structure... ---\n"); sys.stderr.flush()
        from extraction_resume_JD_score_report.parser import DocumentParser
        result = DocumentParser().parse(raw_text, "RESUME", model_override=model)
        if result.get("error"):
            return result

        usage = result.get("usage", {})
        sys.stderr.write(f"--- [AI Usage] Model: {usage.get('model')} | Tokens: {usage.get('inputTokens')} in, {usage.get('outputTokens')} out ---\n")
        sys.stderr.write("--- [100%] Resume extraction complete. ---\n"); sys.stderr.flush()
        return {"text": raw_text, "data": result["data"], "usage": usage, "usages": result.get("usages", [])}

    def run_resume_and_score(self, file_path: str, jd_payload: dict, extract_model: str, score_model: str) -> dict:
        # Step 1: extract text
        sys.stderr.write("--- [15%] Extracting resume text... ---\n"); sys.stderr.flush()
        raw_text = _extract_text(file_path)
        if len(raw_text.strip()) < 50:
            return {"error": "Resume appears empty or unreadable.", "code": "EMPTY_DOCUMENT_ERROR"}

        # Step 2: parse resume (two-pass, JD-aware)
        sys.stderr.write("--- [35%] Parsing resume (pass 1 + 2)... ---\n"); sys.stderr.flush()
        from extraction_resume_JD_score_report.parser import DocumentParser, _normalise_jd
        jd_data = _normalise_jd(jd_payload.get("jd") or {})
        jd_criteria = jd_data.get("criteria", [])
        parser = DocumentParser()
        resume_result = parser.parse_resume_with_jd(raw_text, jd_criteria, model_override=extract_model)
        if resume_result.get("error"):
            return resume_result
        structured_resume = resume_result["data"]
        usage_extract = resume_result.get("usage", {})
        usages_extract = resume_result.get("usages", [])
        sys.stderr.write(f"--- [AI Extract] Model: {usage_extract.get('model')} | Tokens: {usage_extract.get('inputTokens')} in, {usage_extract.get('outputTokens')} out ---\n")

        # Step 3: score + report
        sys.stderr.write("--- [60%] Scoring and generating report... ---\n"); sys.stderr.flush()
        score_payload = json.dumps({
            "resume": structured_resume,
            "jd": jd_data,
            "resume_raw_text": raw_text,
            "jd_raw_text": jd_payload.get("jd_raw_text", ""),
            "threshold": jd_payload.get("threshold", 70),
            "screening_criteria": jd_payload.get("screening_criteria") or {},
        })
        score_result = parser.parse(score_payload, "SCORE", model_override=score_model)
        if score_result.get("error"):
            return score_result

        sys.stderr.write("--- [100%] Complete! ---\n"); sys.stderr.flush()
        return {
            "text": raw_text,
            "data": structured_resume,
            "score": score_result.get("data", {}),
            "usage_extract": usage_extract,
            "usage_score": score_result.get("usage", {}),
            # Per-call breakdown behind each merged total above: usages_extract is
            # the 2 resume-extraction LLM calls, usages_score is the report LLM
            # call + the previously-untracked embeddings call.
            "usages_extract": usages_extract,
            "usages_score": score_result.get("usages", []),
        }


# -- CLI entry point -----------------------------------------------------------

def main():
    args = sys.argv[1:]
    if len(args) < 3:
        print(json.dumps({"error": "Usage: extract_pdf.py <file> <JD|RESUME> <model>  OR  extract_pdf.py <file> RESUME_AND_SCORE <extract_model> <score_model>"}))
        sys.exit(1)

    file_path = args[0]
    doc_type  = args[1].upper()

    pipeline = Pipeline()

    try:
        if doc_type == "JD":
            result = pipeline.run_jd(file_path, args[2])
        elif doc_type == "RESUME":
            result = pipeline.run_resume(file_path, args[2])
        elif doc_type == "RESUME_AND_SCORE":
            if len(args) < 4:
                print(json.dumps({"error": "RESUME_AND_SCORE requires <extract_model> <score_model>"}))
                sys.exit(1)
            raw_stdin = sys.stdin.read().strip()
            if not raw_stdin:
                print(json.dumps({"error": "RESUME_AND_SCORE requires JD payload on stdin"}))
                sys.exit(1)
            jd_payload = json.loads(raw_stdin)
            result = pipeline.run_resume_and_score(file_path, jd_payload, args[2], args[3])
        else:
            result = {"error": f"Unknown doc_type: {doc_type}", "code": "UNKNOWN_DOC_TYPE"}
    except FileNotFoundError as e:
        result = {"error": str(e), "code": "FILE_NOT_FOUND"}
    except Exception as e:
        result = {"error": str(e), "code": "PIPELINE_ERROR"}

    print(json.dumps(result))


if __name__ == "__main__":
    main()
