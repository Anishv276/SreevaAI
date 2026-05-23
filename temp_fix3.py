# -*- coding: utf-8 -*-
from pathlib import Path
path = Path(r"components/admin/candidate-profile/interview-report-sreevaai.tsx")
text = path.read_text(encoding="utf-8")
repls = {
    'const out: string[] = [`Score: ${score}/100`, `a" ${earned}`, `a- ${missed}`];': 'const out: string[] = [`Score: ${score}/100`, `- ${earned}`, `- ${missed}`];',
    '      details.push(`a- ${display.why}`);': '      details.push(`- ${display.why}`);',
    '      if (count >= 3) details.push(`a- Occurred ${count} times a" high frequency. Strongly recommend reviewing recording timestamps.`);': '      if (count >= 3) details.push(`- Occurred ${count} times - high frequency. Strongly recommend reviewing recording timestamps.`);',
    '      else if (count === 2) details.push(`a- Occurred twice a" review both incidents in the recording before deciding.`);': '      else if (count === 2) details.push(`- Occurred twice - review both incidents in the recording before deciding.`);',
    '      else details.push(`a" Occurred once a" isolated event, review the recording at this point to confirm context.`);': '      else details.push(`- Occurred once - isolated event, review the recording at this point to confirm context.`);',
    '      ? ["a" Session shows no significant integrity concerns.", "a" All proctoring signals are within acceptable range."]': '      ? ["Session shows no significant integrity concerns.", "All proctoring signals are within acceptable range."]',
    '        ? ["a- Some proctoring events were detected.", "a" No high-severity flags raised a" review flagged signals and cross-reference with the recording before deciding."]': '        ? ["Some proctoring events were detected.", "No high-severity flags raised - review flagged signals and cross-reference with the recording before deciding."]',
    '        : ["a- Multiple integrity flags raised in this session.", "a- Manual review of the recording is strongly recommended before relying on this interview alone."],': '        : ["Multiple integrity flags raised in this session.", "Manual review of the recording is strongly recommended before relying on this interview alone."],',
    '      details: ["a" No proctoring events raised during this session.", "a" Candidate completed the interview without any integrity flags."],': '      details: ["No proctoring events raised during this session.", "Candidate completed the interview without any integrity flags."],',
    '  const withoutRisk = raw.replace(/[a"a"]\\s*(Low|Medium|High)\\s+risk[^a"a"]*/gi, "").trim();': '  const withoutRisk = raw.replace(/[\\-\\u2014\\u2013]\\s*(Low|Medium|High)\\s+risk[^\\n]*/gi, "").trim();',
    '  const firstClause = withoutRisk.split(/\\s*[a"a"]\\s*/)[0].trim();': '  const firstClause = withoutRisk.split(/\\s*[\\-\\u2014\\u2013]\\s*/)[0].trim();',
}
for old, new in repls.items():
    if old not in text:
        print('MISSING:', old)
    text = text.replace(old, new)
path.write_text(text, encoding="utf-8")
