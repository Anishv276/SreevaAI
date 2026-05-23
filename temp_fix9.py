# -*- coding: utf-8 -*-
from pathlib import Path
path = Path(r"components/admin/candidate-profile/interview-report-sreevaai.tsx")
text = path.read_text(encoding="utf-8")
text = text.replace('          };          };', '          };')
start = text.index('            const WHY: Record<string, { what: string; scored: string }> = {', text.index('        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 px-2">'))
end = text.index('            const scoreColor = m.value >= 75 ? "text-emerald-600" : m.value >= 55 ? "text-amber-600" : "text-rose-600";', start)
new_block = '''            const WHY: Record<string, { what: string; scored: string }> = {
              clarity: {
                what: "Did the candidate's answers have a logical structure - opening point, supporting reasoning, conclusion? Were ideas immediately understandable or did they require re-reading?",
                scored: m.value >= 75
                  ? `${m.value}/100 - Candidate structured answers with a clear point first, supported by reasoning. Ideas were easy to follow on first listen.`
                  : m.value >= 50
                  ? `${m.value}/100 - Answers were generally understandable but occasionally drifted before landing on the key point. Some re-listening needed.`
                  : `${m.value}/100 - Answers frequently lacked structure. Key points were buried or unclear, requiring significant effort to follow.`,
              },
              fluency: {
                what: "How smooth was the delivery? Counted against filler words, long unnatural pauses, repeated restarts, and incomplete sentences.",
                scored: m.value >= 75
                  ? `${m.value}/100 - Delivery was smooth with minimal filler. Thoughts connected naturally with consistent pacing throughout.`
                  : m.value >= 50
                  ? `${m.value}/100 - Noticeable filler words or pauses in several answers, but speech remained followable. Moderate disruption to delivery.`
                  : `${m.value}/100 - Frequent filler words, restarts, or long pauses significantly disrupted speech flow. Listener effort was high.`,
              },
              grammar: {
                what: "Sentence-level correctness - complete sentences, correct subject-verb agreement, and no structural fragments. Assessed from transcribed speech patterns.",
                scored: m.value >= 75
                  ? `${m.value}/100 - Consistently used complete, well-formed sentences. Very few grammatical fragments or structural errors detected in the transcript.`
                  : m.value >= 50
                  ? `${m.value}/100 - Mostly correct grammar with some sentence fragments or tense inconsistencies, typical of spoken language under pressure.`
                  : `${m.value}/100 - Frequent grammatical errors or fragmented sentences throughout. May affect professional credibility in client-facing or written communication roles.`,
              },
              confidence: {
                what: "Assertiveness of delivery - did the candidate state positions clearly, or hedge with 'I think maybe', 'not sure', 'kind of'? Did they maintain tone under follow-up questions?",
                scored: m.value >= 75
                  ? `${m.value}/100 - Candidate stated answers decisively. Minimal hedging language. Tone remained steady even when challenged or probed.`
                  : m.value >= 50
                  ? `${m.value}/100 - Generally confident with occasional hedging. Some answers became tentative under follow-up but recovered.`
                  : `${m.value}/100 - Frequent use of hedging language ('I think', 'maybe', 'not entirely sure'). Tone dropped under follow-up questions, signalling low assertiveness.`,
              },
            };'''
text = text[:start] + new_block + text[end:]
path.write_text(text, encoding="utf-8")
