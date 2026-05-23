from pathlib import Path
path = Path(r"components/admin/candidate-profile/interview-report-sreevaai.tsx")
text = path.read_text(encoding="utf-8")
text = text.replace('};\n};\n\nfunction buildIntegritySignals(', '};\n\nfunction buildIntegritySignals(')
path.write_text(text, encoding="utf-8")
