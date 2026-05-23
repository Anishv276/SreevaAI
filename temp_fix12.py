# -*- coding: utf-8 -*-
from pathlib import Path
path = Path(r"components/admin/candidate-profile/interview-report-sreevaai.tsx")
text = path.read_text(encoding="utf-8")
text = text.replace('  const earned = row.details?.find(d => d.startsWith("-")) || row.details?.find(d => d.startsWith("a"")) || "";', '  const earned = row.details?.find(d => d.startsWith("-")) || row.details?.find(d => d.startsWith(\'a"\')) || "";')
path.write_text(text, encoding="utf-8")
