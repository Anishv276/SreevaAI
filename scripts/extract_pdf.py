"""
extract_pdf.py -- Production entry point for the HR Agent pipeline.
This is a drop-in replacement for the old monolithic script.
It uses the modular hr_agent package for all logic.
"""
import sys
import os

# Ensure the scripts directory is in the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from extraction_resume_JD_score_report.pipeline import main

if __name__ == "__main__":
    main()
