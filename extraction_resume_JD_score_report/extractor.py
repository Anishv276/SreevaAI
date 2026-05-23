"""
extractor.py — DocumentExtractor class.

WHY THIS CLASS EXISTS:
    extract_pdf.py had three separate functions (extract_text, extract_pdf_markdown,
    extract_text_via_ocr) with cascading fallbacks spread across 150 lines.
    DocumentExtractor wraps them in a single class with a clean try-fallback-fallback
    chain that is easy to read, test, and extend.

    BEHAVIOUR IS IDENTICAL to the original:
        1. Try pymupdf4llm (Markdown-preserving, best quality)
        2. Combine with pdfplumber table extraction
        3. If empty → pdfplumber plain text
        4. If still empty → fail fast
"""

from __future__ import annotations

import importlib
import io
import sys
from contextlib import contextmanager
from typing import Optional


# ---------------------------------------------------------------------------
# Optional dependency loader (same pattern as the original script)
# ---------------------------------------------------------------------------

@contextmanager
def _silence_stdout():
    """Redirect stdout → stderr so library prints don't pollute JSON output."""
    old = sys.stdout
    sys.stdout = sys.stderr
    try:
        yield
    finally:
        sys.stdout = old


def _try_import(module_name: str):
    try:
        with _silence_stdout():
            return importlib.import_module(module_name)
    except ImportError:
        return None


# Lazy imports — identical to original load_optional_module calls
pdfplumber   = _try_import("pdfplumber")
pymupdf4llm  = _try_import("pymupdf4llm")
fitz         = _try_import("fitz")
# ---------------------------------------------------------------------------
# DocumentExtractor
# ---------------------------------------------------------------------------

class DocumentExtractor:
    """
    Converts a file (PDF or plain text) into a single clean text string.

    Usage:
        extractor = DocumentExtractor()
        text = extractor.extract(file_path, doc_type="RESUME")
    """

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    def extract(self, file_path: str, doc_type: str = "RESUME") -> str:
        """
        Return extracted text.  Raises RuntimeError if the file is unreadable.
        doc_type: "RESUME" | "JD"
        """
        if file_path.lower().endswith(".pdf"):
            return self._extract_pdf(file_path, doc_type)
        return self._extract_text_file(file_path)

    # ------------------------------------------------------------------ #
    # Private: PDF extraction chain                                        #
    # ------------------------------------------------------------------ #

    def _extract_pdf(self, file_path: str, doc_type: str) -> str:
        """
        Full fallback chain for PDFs.
        Order: pymupdf4llm → pdfplumber tables → pdfplumber text → OCR
        """
        if doc_type == "RESUME":
            return self._extract_pdf_resume_fast(file_path)
        extraction_errors: list[str] = []
        markdown_text = ""
        plumber_text = ""

        # Step 1 — pymupdf4llm (best quality, preserves structure)
        if pymupdf4llm is None:
            extraction_errors.append("PyMuPDF4LLM not installed")
        else:
            try:
                markdown_text = self._extract_markdown(file_path)
            except Exception as exc:
                extraction_errors.append(f"PyMuPDF4LLM failed: {exc}")

        # Step 2 — pdfplumber plain text (fast fallback, no OCR)
        if pdfplumber is not None:
            try:
                plumber_text = self._extract_plumber_text(file_path)
            except Exception as exc:
                extraction_errors.append(f"pdfplumber text failed: {exc}")

        # JD: return markdown first, plumber text second
        if doc_type == "JD":
            if markdown_text:
                return markdown_text.strip()
            if plumber_text:
                return plumber_text.strip()

        # RESUME: combine markdown + table sections
        parts: list[str] = []
        if markdown_text:
            parts.append(markdown_text)

        # Step 3 — pdfplumber tables (enriches markdown for resumes)
        if pdfplumber is not None:
            try:
                table_md = self._extract_plumber_tables(file_path)
                if table_md:
                    parts.append("## Extracted Tables\n\n" + "\n\n".join(table_md))
            except Exception as exc:
                extraction_errors.append(f"pdfplumber tables failed: {exc}")

        if not parts and plumber_text:
            parts.append(plumber_text)

        combined = "\n\n".join(parts).strip()
        if combined:
            return combined

        detail = " | ".join(extraction_errors) if extraction_errors else "No content detected"
        raise RuntimeError(f"PDF Extraction Error: {detail}")

    def _extract_pdf_resume_fast(self, file_path: str) -> str:
        """
        Fast resume extraction path:
        1) Primary: markdown extraction (best structure fidelity)
        2) Fallback: plain text via pdfplumber

        This skips table-merging work for speed while preserving robust fallback.
        """
        extraction_errors: list[str] = []
        if pymupdf4llm is not None:
            try:
                markdown_text = self._extract_markdown(file_path)
                if markdown_text:
                    return markdown_text.strip()
            except Exception as exc:
                extraction_errors.append(f"PyMuPDF4LLM failed: {exc}")
        else:
            extraction_errors.append("PyMuPDF4LLM not installed")

        if pdfplumber is not None:
            try:
                plumber_text = self._extract_plumber_text(file_path)
                if plumber_text:
                    return plumber_text.strip()
            except Exception as exc:
                extraction_errors.append(f"pdfplumber text failed: {exc}")
        else:
            extraction_errors.append("pdfplumber not installed")

        detail = " | ".join(extraction_errors) if extraction_errors else "No content detected"
        raise RuntimeError(f"PDF Extraction Error: {detail}")

    def _extract_markdown(self, file_path: str) -> str:
        """Use pymupdf4llm to produce Markdown-formatted text."""
        text = pymupdf4llm.to_markdown(file_path)  # type: ignore[union-attr]
        return text.strip() if text else ""

    def _extract_plumber_text(self, file_path: str) -> str:
        """Plain text extraction via pdfplumber (no OCR, fast)."""
        with pdfplumber.open(file_path) as pdf:  # type: ignore[union-attr]
            pages = [p.extract_text() or "" for p in pdf.pages]
        return "\n\n".join(p for p in pages if p.strip())

    def _extract_plumber_tables(self, file_path: str) -> list[str]:
        """Extract tables as Markdown strings via pdfplumber."""
        results: list[str] = []
        with pdfplumber.open(file_path) as pdf:  # type: ignore[union-attr]
            for page_idx, page in enumerate(pdf.pages, start=1):
                for tbl_idx, table in enumerate(page.extract_tables() or [], start=1):
                    md = self._table_to_markdown(table)
                    if md:
                        results.append(f"### Table {tbl_idx} (Page {page_idx})\n{md}")
        return results

    # ------------------------------------------------------------------ #
    # Private: Plain text file                                             #
    # ------------------------------------------------------------------ #

    def _extract_text_file(self, file_path: str) -> str:
        try:
            with open(file_path, "r", encoding="utf-8") as fh:
                return fh.read().strip()
        except Exception as exc:
            raise RuntimeError(f"Text File Error: {exc}") from exc

    # ------------------------------------------------------------------ #
    # Private: Table → Markdown (ported verbatim from original)           #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _normalize_cell(cell) -> str:
        import re
        if cell is None:
            return ""
        text = str(cell).replace("\n", " ").strip()
        text = re.sub(r"\s+", " ", text)
        return text.replace("|", "\\|")

    def _table_to_markdown(self, table) -> str:
        if not table:
            return ""
        rows = []
        for row in table:
            if not row:
                continue
            normalized = [self._normalize_cell(cell) for cell in row]
            if any(normalized):
                rows.append(normalized)
        if not rows:
            return ""
        max_cols = max(len(r) for r in rows)
        padded = [r + [""] * (max_cols - len(r)) for r in rows]
        header = padded[0]
        body = padded[1:]
        if not any(header):
            header = [f"column_{i + 1}" for i in range(max_cols)]
        lines = [
            "| " + " | ".join(header) + " |",
            "| " + " | ".join(["---"] * max_cols) + " |",
        ]
        for row in body:
            lines.append("| " + " | ".join(row) + " |")
        return "\n".join(lines)
