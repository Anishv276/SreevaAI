import OpenAI from "openai";
import { recordOrgBillingFromOpenAICompletion } from "@/lib/usage-metrics";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * Full structured interview report -- covers all 9 UI sections.
 * Stored as Interview.interviewReport (JSONB).
 */
export interface InterviewReport {
  //  Section 2: Performance Scorecards 
  scores: {
    interview_score: number;          // 0--10, one decimal
    interview_label: string;          // "Poor" | "Below Average" | "Average" | "Good" | "Excellent"
    cefr_level: string;               // "A1" | "A2" | "B1" | "B2" | "C1" | "C2"
    cefr_label: string;               // "Basic" | "Elementary" | "Intermediate" | etc.
    combined_score: number;           // 0--100 aggregate
  };

  recording?: {
    duration_seconds: number;
    duration_label: string;
    word_count: number;
    summary: string; // Keep to 3-4 short lines in the UI summary box.
  };

  //  Section 3: Interview Performance Verdict 
  verdict: {
    summary: string;                  // 3-5 sentence AI synthesis
    recommendation: "Strong Yes" | "Yes" | "Maybe" | "No";
    recommendation_reason: string;
  };

  strategic_verdict?: {
    decision: "Hire" | "Do Not Hire" | "Maybe";
    summary: string;
    rationale: string[];
    next_actions: string[];
  };

  //  Section 4: Communication Breakdown 
  communication: {
    clarity: number;                  // 0--100
    fluency: number;
    grammar: number;
    depth: number;
    cefr_analysis: string;            // paragraph explaining the CEFR rating
  };

  //  Section 6: JD Skills Proof Checklist 
  skills_proof: Array<{
    title: string;                    // skill name from JD
    note: string;                     // direct quote or observation
    confidence: string;               // e.g. "Confidence: High -- self-declared"
    status: "Proved" | "Not proved" | "Partial" | "Not tested";
    score: string;                    // e.g. "8/10" or "--"
    color: string;                    // Tailwind classes for badge
  }>;

  //  Section 7: Session Transcript Q&A 
  qa_blocks: Array<{
    q: number;
    title: string;
    tags: string[];
    score: string;                    // e.g. "7/10" or "--"
    scoreColor: string;               // Tailwind class
    verdict: string;
    confidence: string;
  }>;

  session_log?: Array<{
    q: number;
    question: string;
    reasoning: string;
    score: string;
    confidence: string;
  }>;

  //  Section 8: Consistency Check (Resume vs Interview) 
  consistency: Array<{
    claim: string;                    // what resume says
    sub: string;                      // e.g. "Claimed: GTM strategy"
    proof: string;                    // what interview showed
    status: "Verified" | "Mismatch" | "Contradicted" | "Not tested" | "Weak signal";
    statusColor: string;              // Tailwind classes
  }>;

  //  Section 9: Key Moments Timeline 
  key_moments: Array<{
    time: string;                     // e.g. "1:32"
    tag: "Context" | "Flag" | "Critical" | "Positive";
    tagColor: string;                 // Tailwind classes
    title: string;
    note: string;
  }>;

  //  Meta 
  generated_at: string;               // ISO timestamp
  model: string;
}

//  Colour helpers (kept server-side so UI stays in sync) 
function skillColor(status: string): string {
  switch (status) {
    case "Proved":     return "text-emerald-600 bg-emerald-50 border-emerald-100";
    case "Partial":    return "text-orange-500 bg-orange-50 border-orange-100";
    case "Not tested": return "text-gray-500 bg-gray-50 border-gray-100";
    default:           return "text-red-500 bg-red-50 border-red-100";  // Not proved
  }
}

function consistencyColor(status: string): string {
  switch (status) {
    case "Verified":    return "text-emerald-600 bg-emerald-50 border-emerald-100";
    case "Not tested":  return "text-[#8B5E3C] bg-[#FDF9F3] border-[#F5E6D3]";
    case "Weak signal": return "text-[#8B5E3C] bg-[#FDF9F3] border-[#F5E6D3]";
    default:            return "text-[#E63946] bg-red-50 border-red-100";  // Mismatch / Contradicted
  }
}

function momentColor(tag: string): string {
  switch (tag) {
    case "Critical": return "text-[#E63946] bg-red-50 border-red-100";
    case "Flag":     return "text-[#8B5E3C] bg-[#FDF9F3] border-[#F5E6D3]";
    case "Positive": return "text-emerald-600 bg-emerald-50 border-emerald-100";
    default:         return "text-indigo-600 bg-indigo-50 border-indigo-100";  // Context
  }
}

function scoreColor(score: string): string {
  if (score === "--") return "text-gray-300";
  const n = parseFloat(score);
  if (n >= 7) return "text-emerald-600";
  if (n >= 4) return "text-orange-500";
  return "text-[#E63946]";
}

//  Main export 
export async function generateInterviewReport(opts: {
  transcript: string;
  resumeText: string;
  jdText: string;                     // drive.description + requirements
  role: string;
  candidateName: string;
  durationSeconds: number;
  proctoringEvents?: any[];
  orgId?: string;
}): Promise<InterviewReport> {
  const {
    transcript, resumeText, jdText, role,
    candidateName, durationSeconds, proctoringEvents = [],
    orgId,
  } = opts;

  const durationMin = Math.round(durationSeconds / 60);
  const wordCount = transcript.split(/\s+/).filter(Boolean).length;

  const systemPrompt = `You are a senior technical recruiter and psycholinguist producing a confidential, bias-free post-interview evaluation report. You analyse the interview transcript rigorously and produce structured JSON output that powers a hiring dashboard. Every field must be grounded in direct transcript evidence. Never fabricate quotes -- use paraphrase when exact wording is unavailable. Be brutally honest but professional. Always populate ALL arrays fully -- never return empty arrays if there is any data to work with. Every section must be filled.`;

  const userPrompt = `
## CANDIDATE
Name: ${candidateName}
Role applied for: ${role}

## SESSION META
Duration: ${durationMin} minutes (${durationSeconds}s)
Word count spoken by candidate: ${wordCount}
Proctoring events: ${JSON.stringify(proctoringEvents)}

## JOB DESCRIPTION / REQUIREMENTS
${jdText.slice(0, 3000)}

## RESUME TEXT
${resumeText.slice(0, 3000)}

## INTERVIEW TRANSCRIPT
${transcript.slice(0, 10000)}

---

Produce a JSON object matching EXACTLY this TypeScript interface (no extra keys, no markdown fences).
This report must power these UI sections:
- Header score cards: "scores"
- Interview Recording card and summary box: "recording"
- Communication Analysis: "communication"
- Did the Interview Prove JD Skills?: "skills_proof"
- Full Session Log: "session_log" and "qa_blocks"
- Resume claims vs Interview proof: "consistency"
- Key Moments From Session: "key_moments"

Rules:
- Base every field on transcript evidence, resume text, job description, duration, and proctoring events only.
- Do not hardcode placeholder values or generic defaults when evidence exists.
- Keep the four score cards internally consistent with each other.
- Make the strategic verdict decisive and evidence-backed. If the answer is hire or no hire, say it plainly.
- Ground the strategic verdict in the interview content, resume claims, AND proctoring signals together.
- The rationale array must have 3-5 bullets, each referencing specific interview evidence, resume claims, or proctoring signals.
- The next_actions array must have 2-4 concrete, actionable bullets specific to this candidate and role.
- When the transcript is short or sparse, lower confidence and say so directly.
- Use precise, recruiter-grade language, not vague fluff.
- Prefer concrete examples, exact tool names, and specific interview moments.
- skills_proof MUST have 5-8 items covering all major JD skills -- pull skill names directly from the JD text.
- session_log MUST have one entry per distinct question the AI asked in the transcript.
- qa_blocks MUST mirror session_log topics with expanded verdict text.
- consistency MUST check 3-5 specific resume claims against what the interview revealed.
- key_moments MUST have 4-7 chronological entries: best answer, biggest gap, notable behaviour, session quality.

{
  "scores": {
    "interview_score": number,          // 0.0--10.0, one decimal, based on transcript evidence only
    "interview_label": string,          // "Poor" | "Below Average" | "Average" | "Good" | "Excellent"
    "cefr_level": string,               // "A1"|"A2"|"B1"|"B2"|"C1"|"C2"
    "cefr_label": string,               // single word: "Basic"|"Elementary"|"Intermediate"|"Upper-Intermediate"|"Advanced"|"Proficient"
    "combined_score": number            // 0--100 weighted: technical, communication, engagement, and proctoring signals
  },

  "recording": {
    "duration_seconds": number,
    "duration_label": string,
    "word_count": number,
    "summary": string
  },

  "verdict": {
    "summary": string,                  // 3-5 sentences: concise executive summary for the interview report
    "recommendation": "Strong Yes"|"Yes"|"Maybe"|"No",
    "recommendation_reason": string     // 1 sentence justification
  },

  "strategic_verdict": {
    "decision": "Hire"|"Do Not Hire"|"Maybe",
    "summary": string,                  // 2-4 sentences: decisive hire / no-hire summary
    "rationale": string[],              // 3-5 bullets: interview evidence, resume proof, proctoring context
    "next_actions": string[]            // 2-4 bullets: follow-up or close-out actions
  },

  "communication": {
    "clarity": number,                  // 0--100
    "fluency": number,                  // 0--100
    "grammar": number,                  // 0--100
    "depth": number,                    // 0--100 (technical detail level)
    "cefr_analysis": string             // 2--3 sentences explaining the CEFR rating with transcript evidence
  },

  "skills_proof": [                     // one entry per major JD skill/requirement (4--7 items)
    {
      "title": string,                  // skill name
      "note": string,                   // transcript evidence or "Not reached -- session ended early"
      "confidence": string,             // e.g. "Confidence: High -- self-declared"
      "status": "Proved"|"Not proved"|"Partial"|"Not tested",
      "score": string,                  // e.g. "7/10" or "--"
      "color": string                   // leave as "" -- will be set server-side
    }
  ],

  "qa_blocks": [                        // one per interview question asked (1--4 items)
    {
      "q": number,
      "title": string,                  // question title / topic
      "tags": string[],                 // 2--4 skill tags e.g. ["Algorithm Design", "Problem Solving"]
      "score": string,                  // e.g. "6/10" or "--"
      "scoreColor": string,             // leave as "" -- will be set server-side
      "verdict": string,                // 2--4 sentences: what candidate did/said, quality of answer
      "confidence": string              // e.g. "Confidence level: High -- sufficient session data"
    }
  ],

  "session_log": [
    {
      "q": number,
      "question": string,
      "reasoning": string,
      "score": string,
      "confidence": string
    }
  ],

  "consistency": [                      // one per key resume claim (3--5 items)
    {
      "claim": string,                  // exact claim from resume
      "sub": string,                    // e.g. "Claimed: GTM strategy"
      "proof": string,                  // what interview revealed
      "status": "Verified"|"Mismatch"|"Contradicted"|"Not tested"|"Weak signal",
      "statusColor": string             // leave as "" -- will be set server-side
    }
  ],

  "key_moments": [                      // 4--7 timestamped behavioral observations
    {
      "time": string,                   // estimate from transcript position e.g. "1:32"
      "tag": "Context"|"Flag"|"Critical"|"Positive",
      "tagColor": string,               // leave as "" -- will be set server-side
      "title": string,                  // short descriptive title
      "note": string                    // 1--2 sentences with direct evidence
    }
  ],

  "generated_at": "",
  "model": ""
}

Rules:
- skills_proof color, consistency statusColor, key_moments tagColor, qa_blocks scoreColor → leave as "" (populated post-parse)
- recording.duration_label should be human-readable and compact, e.g. "5 min" or "12 min"
- recording.word_count must reflect the transcript length as closely as possible
  - recording.summary should be the short AI summary box displayed below the video, written in 3-4 lines only
  - Keep the summary concise, direct, and skimmable; do not write a long paragraph
- All scores must reflect ONLY what is in the transcript, resume text, JD text, duration, and proctoring events -- do not extrapolate
- If transcript is very short (<200 words), mark most skills as "Not tested" and lower scores accordingly
- Key moments must be in chronological order
- qa_blocks: if a question was never reached, set score "--" and verdict "Not reached -- session ended before this question"
- session_log should contain the full session trace with question, reasoning, and score for each major question
- consistency should use concrete resume claims from the resume and what the interview proved or contradicted
- key_moments should capture the strongest interview moments, including the best proof, biggest concern, and turning points
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.15,
    max_tokens: 5000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ],
  });
  if (orgId) {
    await recordOrgBillingFromOpenAICompletion({
      orgId,
      feature: "interviewReport",
      completion: response,
    });
  }

  const raw = JSON.parse(response.choices[0].message.content!);

  //  Post-parse: inject colour tokens 
  raw.skills_proof = (raw.skills_proof || []).map((s: any) => ({
    ...s,
    color: skillColor(s.status),
  }));

  raw.qa_blocks = (raw.qa_blocks || []).map((b: any) => ({
    ...b,
    scoreColor: scoreColor(b.score),
  }));

  raw.consistency = (raw.consistency || []).map((c: any) => ({
    ...c,
    statusColor: consistencyColor(c.status),
  }));

  raw.key_moments = (raw.key_moments || []).map((m: any) => ({
    ...m,
    tagColor: momentColor(m.tag),
  }));

  raw.generated_at = new Date().toISOString();
  raw.model = "gpt-4o";

  return raw as InterviewReport;
}



