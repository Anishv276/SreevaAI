import { existsSync } from "fs";
import { join } from "path";

/**
 * Interpreter for `scripts/extract_pdf.py` (resume screening, extract API, worker).
 * Order: PYTHON_BIN → repo `.venv` → `python3` / `python` on PATH.
 */
export function getPythonExecutable(): string {
    const fromEnv = process.env.PYTHON_BIN?.trim();
    if (fromEnv) return fromEnv;

    const root = process.cwd();
    const unixPy3 = join(root, ".venv", "bin", "python3");
    if (existsSync(unixPy3)) return unixPy3;
    const unixPy = join(root, ".venv", "bin", "python");
    if (existsSync(unixPy)) return unixPy;

    const winPy = join(root, ".venv", "Scripts", "python.exe");
    if (existsSync(winPy)) return winPy;

    return process.platform === "win32" ? "python" : "python3";
}
