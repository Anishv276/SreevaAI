"""
extract_pdf.py -- Production entry point for the HR Agent pipeline.
This is a drop-in replacement for the old monolithic script.
It uses the modular hr_agent package for all logic.
"""
from pathlib import Path
import sys
# Ensure the repository root is importable when this script is run directly
# from the `scripts/` directory by the worker process.
_repo_root = Path(__file__).resolve().parents[1]
if str(_repo_root) not in sys.path:
    sys.path.insert(0, str(_repo_root))
from extraction_resume_JD_score_report.pipeline import main
if __name__ == "__main__":
    main()