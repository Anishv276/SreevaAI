# -*- coding: utf-8 -*-
from pathlib import Path
path = Path(r"components/admin/candidate-profile/interview-report-sreevaai.tsx")
text = path.read_text(encoding="utf-8")
repls = {
    '      low:  "Overall performance below the bar a" significant gaps across multiple dimensions.",': '      low:  "Overall performance below the bar - significant gaps across multiple dimensions.",',
    '      mid:  "Moderate performance a" some strong areas with clear gaps to address.",': '      mid:  "Moderate performance - some strong areas with clear gaps to address.",',
    '      low:  "Limited hands-on knowledge a" mostly theoretical, couldn\'t explain implementation details when probed.",': '      low:  "Limited hands-on knowledge - mostly theoretical, could not explain implementation details when probed.",',
    '      mid:  "Moderate competency a" real experience with some gaps. Knows vocabulary but struggles with depth.",': '      mid:  "Moderate competency - real experience with some gaps. Knows vocabulary but struggles with depth.",',
    '      high: "Strong demonstrated competency a" specific project details, real trade-offs, confident implementation knowledge.",': '      high: "Strong demonstrated competency - specific project details, real trade-offs, confident implementation knowledge.",',
    '      high: "Systematic thinker a" clearly stated assumptions, explored trade-offs, handled follow-up probing well.",': '      high: "Systematic thinker - clearly stated assumptions, explored trade-offs, handled follow-up probing well.",',
    '      low:  "Significant mismatch a" skills and experience don\'t yet meet the role\'s core requirements.",': '      low:  "Significant mismatch - skills and experience do not yet meet the role\'s core requirements.",',
    '      high: "Strong fit a" experience, demonstrated skills, and thinking style align well with role expectations.",': '      high: "Strong fit - experience, demonstrated skills, and thinking style align well with role expectations.",',
    '      low:  "Low engagement a" answers inconsistent with resume, evasive under follow-up, limited ownership signals.",': '      low:  "Low engagement - answers inconsistent with resume, evasive under follow-up, limited ownership signals.",',
    '      mid:  "Mostly engaged with some inconsistencies a" generally participated well but lapses in conviction.",': '      mid:  "Mostly engaged with some inconsistencies - generally participated well but lapses in conviction.",',
    '      high: "Highly engaged a" consistent, ownership-oriented, genuine enthusiasm for the role and problems.",': '      high: "Highly engaged - consistent, ownership-oriented, genuine enthusiasm for the role and problems.",',
}
for old, new in repls.items():
    if old not in text:
        print('MISSING:', old)
    text = text.replace(old, new)
path.write_text(text, encoding="utf-8")
