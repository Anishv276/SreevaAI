# -*- coding: utf-8 -*-
from pathlib import Path
path = Path(r"components/admin/candidate-profile/interview-report-sreevaai.tsx")
text = path.read_text(encoding="utf-8")
text = text.replace('      ? `${Math.max(1, Math.round((i.wordCount / 150) * 5))} mins (est.)` : "a"";', '      ? `${Math.max(1, Math.round((i.wordCount / 150) * 5))} mins (est.)` : "--";')
text = text.replace('  const missed = row.details?.find(d => d.startsWith("a-")) || "";', '  const missed = row.details?.find(d => d.startsWith("Risk:")) || "";')
text = text.replace('  const plainLines = row.details?.filter(d => !d.startsWith("?") && !d.startsWith("?")) || [];', '  const plainLines = row.details?.filter(d => !d.startsWith("-") && !d.startsWith("Risk:")) || [];')
path.write_text(text, encoding="utf-8")
