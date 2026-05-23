# -*- coding: utf-8 -*-
from pathlib import Path
path = Path(r"components/admin/candidate-profile/interview-report-sreevaai.tsx")
text = path.read_text(encoding="utf-8")
text = text.replace('<span className="mt-[3px] shrink-0 text-emerald-600 text-[13px] font-black">a"</span>', '<span className="mt-[3px] shrink-0 text-emerald-600 text-[13px] font-black">-</span>')
text = text.replace('{earned.replace(/^a"\s*/, "")}', '{earned.replace(/^[-]\s*/, "")}')
text = text.replace('const earned = row.details?.find(d => d.startsWith("-")) || "";', 'const earned = row.details?.find(d => d.startsWith("-")) || row.details?.find(d => d.startsWith("a\"")) || "";')
path.write_text(text, encoding="utf-8")
