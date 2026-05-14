/**
 * Interpreter for `scripts/extract_pdf.py` (resume screening, extract API, worker).
 * Order: PYTHON_BIN → `python3` / `python` on PATH.
 *
 * Important: avoid hard-referencing the repo `.venv` from the app bundle.
 * Turbopack can try to trace that symlink during build and fail if it points
 * outside the project root.
 */
export function getPythonExecutable(): string {
    const fromEnv = process.env.PYTHON_BIN?.trim();
    if (fromEnv) return fromEnv;
    return process.platform === "win32" ? "python" : "python3";
}
