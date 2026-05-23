# -*- coding: utf-8 -*-
from pathlib import Path
path = Path(r"components/admin/candidate-profile/interview-report-sreevaai.tsx")
text = path.read_text(encoding="utf-8")
text = text.replace('existing.scoreLabel = existing.scoreLabel !== "a"" ? existing.scoreLabel : scoreLabel;', 'existing.scoreLabel = existing.scoreLabel || scoreLabel;')
text = text.replace('const scoreLabel = String(s?.score || "").trim() || "a"";', 'const scoreLabel = String(s?.score || "").trim() || "N/A";')
text = text.replace('scoreLabel: "a""', 'scoreLabel: "N/A"')
text = text.replace('time: "a""', 'time: undefined')
text = text.replace(': "a"";', ': "--";')
text = text.replace('d.startsWith("a"")', 'd.startsWith("-")')
path.write_text(text, encoding="utf-8")
