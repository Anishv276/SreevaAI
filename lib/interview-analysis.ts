import OpenAI from "openai";

export async function generateInterviewReport(params: {
  transcript: string;
  resumeText: string;
  jdText: string;
  role: string;
  candidateName: string;
  durationSeconds: number;
  proctoringEvents: any[];
  orgId?: string;
}) {
  const {
    transcript,
    resumeText,
    jdText,
    role,
    candidateName,
    durationSeconds,
    proctoringEvents,
  } = params;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === "dummy-key-for-mock-mode") {
    console.warn("[INTERVIEW_ANALYSIS] OPENAI_API_KEY is missing or dummy. Using fallback report.");
    return { data: generateFallbackReport(candidateName, role), usage: null };
  }

  const openai = new OpenAI({ apiKey });

  const prompt = `
You are a senior technical recruiter and behavioral analyst reviewing an AI-led interview.

CANDIDATE: ${candidateName}
ROLE: ${role}
DURATION: ${Math.round(durationSeconds / 60)} minutes
PROCTORING EVENTS: ${JSON.stringify(proctoringEvents || [])}

[RESUME TEXT]
${resumeText || "No resume provided."}

[JOB DESCRIPTION]
${jdText || "No JD provided."}

[INTERVIEW TRANSCRIPT]
${transcript}

---
TASK:
Analyze the transcript and produce a structured JSON report.
Be objective, specific, and evidence-backed. Never invent moments — cite the transcript.

OUTPUT SCHEMA (strict JSON, all fields required):
{
  "_meta": {
    "is_fallback": false,
    "generated_at": "ISO timestamp string"
  },

  "scores": {
    "combined_score": number (0-100, overall interview performance weighted across technical + communication + behavioral),
    "technical_score": number (0-100, quality of technical/domain answers),
    "communication_score": number (0-100, clarity, fluency, grammar, confidence combined),
    "behavioral_score": number (0-100, engagement, consistency, integrity signals)
  },

  "qa_blocks": [
    {
      "q": number (1-based index),
      "question": "Full question text as asked by the interviewer",
      "answer_summary": "50-80 word neutral summary of what the candidate actually said",
      "title": "2-4 word topic label (e.g. 'React Hooks', 'System Design')",
      "tags": ["skill1", "skill2"],
      "score": "X/10",
      "verdict": "Specific reasoning: what was asked, what candidate said, why the score. Cite the transcript. No generic phrases.",
      "confidence": "High" | "Medium" | "Low",
      "score_breakdown": {
        "clarity": number (0-10),
        "depth": number (0-10),
        "fluency": number (0-10),
        "confidence": number (0-10)
      }
    }
  ],

  "recording": {
    "summary": "1-2 sentence summary of overall session quality"
  },

  "communication": {
    "pronunciation": number (0-100),
    "grammar": number (0-100),
    "fluency": number (0-100),
    "confidence": number (0-100),
    "summary": "One specific sentence about communication quality based on the transcript — cite a pattern"
  },

  "cognitive_insights": {
    "clarity": number (0-100),
    "clarity_earned": "One sentence — specific transcript moment that raised the clarity score",
    "clarity_missed": "One sentence — specific moment that lowered the clarity score",
    "depth_of_knowledge": number (0-100),
    "depth_earned": "One sentence — what showed genuine depth",
    "depth_missed": "One sentence — where depth was missing",
    "problem_solving": number (0-100),
    "problem_solving_earned": "One sentence — what showed structured problem-solving",
    "problem_solving_missed": "One sentence — what was missing",
    "logical_thinking": number (0-100),
    "logical_thinking_earned": "One sentence — where reasoning was coherent",
    "logical_thinking_missed": "One sentence — where reasoning broke down",
    "fluency": number (0-100),
    "fluency_earned": "One sentence — what made delivery fluent",
    "fluency_missed": "One sentence — what disrupted fluency",
    "confidence": number (0-100),
    "confidence_earned": "One sentence — where candidate was assertive",
    "confidence_missed": "One sentence — where confidence dropped",
    "summary": "2-3 sentence synthesis of cognitive strengths and gaps"
  },

  "behavioral_analysis": {
    "overview": "2-3 sentence high-level behavioral summary for the hiring decision",
    "engagement_signals": [
      "Specific observation about focus, attention, participation — cite timing or topic"
    ],
    "consistency_signals": [
      "Resume claim vs interview answer — specific mismatch or confirmation with evidence"
    ],
    "communication_patterns": [
      "How candidate structured responses — specific pattern with transcript example"
    ],
    "confidence_indicators": [
      "Evidence of genuine or false confidence — specific example from transcript"
    ],
    "integrity_flags": [
      "Proctoring correlation or behavioral red flag — cite event + question topic"
    ],
    "strengths_observed": [
      "Specific capability demonstrated — cite the question/topic and what they did"
    ],
    "concerns_noted": [
      "Specific gap, evasion, or pattern — cite the question/topic where it occurred"
    ],
    "summary": "2-3 sentence overall behavioral assessment for hiring decision"
  },

  "verdict": {
    "summary": "200-300 word detailed overall assessment. Cover: technical depth, communication quality, behavioral signals, consistency with resume, and specific evidence from the interview. End with a clear hiring recommendation rationale.",
    "recommendation": "Strong Yes" | "Yes" | "Maybe" | "No",
    "recommendation_reason": "1-2 sentence primary reason for this recommendation, citing specific evidence"
  },

  "strategic_verdict": {
    "decision": "Hire" | "Maybe" | "Do Not Hire",
    "summary": "2-3 sentence strategic overview for leadership",
    "rationale": ["Specific point 1 with evidence", "Specific point 2 with evidence"],
    "next_actions": ["Specific next action — e.g. 'Schedule technical deep-dive on system design'"]
  },

  "integrity": {
    "score": number (0-100, 100 = perfectly clean session),
    "summary": "Specific summary of proctoring events and behavioral integrity — cite event counts and correlation with answer quality"
  },

  "skills_proof": [
    {
      "skill": "Specific skill name (e.g. Python, REST APIs, React, System Design)",
      "status": "PROVED" | "PARTIAL" | "NOT PROVED" | "NOT TESTED",
      "score": "X/10",
      "evidence": "Specific quote or paraphrase from transcript showing mastery or gap"
    }
  ]
}

RULES:
1. QA_BLOCKS: Map EVERY interviewer question as a separate block. Include full question text and answer_summary. score_breakdown is required for every block.
2. SCORES: combined_score = weighted average (technical 40%, communication 35%, behavioral 25%). All scores 0-100.
3. SKILLS_PROOF: Only skills actually discussed. status must reflect actual performance.
4. BEHAVIORAL_ANALYSIS: 4-8 bullets per section minimum. Cite the transcript specifically.
5. VERDICT SUMMARY: 200-300 words, specific, evidence-backed. No generic praise.
6. INTEGRITY: Score 100 if no proctoring events. Deduct for tab switches (5pts each), face not detected (10pts), multiple devices (15pts). Correlate with answer quality.
7. COGNITIVE INSIGHTS: All _earned/_missed fields required. Cite specific questions/answers.
8. recommendation: "Strong Yes" only for exceptional candidates. "No" for clear failures. Be honest.
9. _meta.is_fallback must always be false in a real response.
10. Do NOT write generic phrases like "showed knowledge", "good answer", "demonstrated skill". Be specific.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a professional recruitment AI. Output ONLY valid JSON matching the exact schema provided. All fields are required." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error("Empty response from OpenAI");

    const data = JSON.parse(content);
    // Ensure _meta is always present and not fallback
    if (!data._meta) data._meta = { is_fallback: false, generated_at: new Date().toISOString() };
    data._meta.is_fallback = false;

    console.log(`[INTERVIEW_ANALYSIS] Successfully generated report for ${candidateName}`);
    return {
      data,
      usage: {
        model: response.model || "gpt-4o",
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
        cachedInputTokens: (response.usage as any)?.prompt_tokens_details?.cached_tokens || 0,
      },
    };
  } catch (error: any) {
    console.error("[INTERVIEW_ANALYSIS_FATAL]:", error.message);
    return { data: generateFallbackReport(candidateName, role, "AI analysis encountered an error."), usage: null };
  }
}

function generateFallbackReport(name: string, role: string, reason = "Internal processing error.") {
  return {
    _meta: {
      is_fallback: true,
      generated_at: new Date().toISOString(),
      reason,
    },
    scores: {
      combined_score: 0,
      technical_score: 0,
      communication_score: 0,
      behavioral_score: 0,
    },
    qa_blocks: [],
    recording: { summary: "Transcript captured. AI analysis unavailable — manual review required." },
    communication: {
      pronunciation: 0,
      grammar: 0,
      fluency: 0,
      confidence: 0,
      summary: "Communication evaluation pending — manual review of recording recommended.",
    },
    cognitive_insights: {
      clarity: 0,
      clarity_earned: "Unable to evaluate — AI analysis failed.",
      clarity_missed: "Unable to evaluate — AI analysis failed.",
      depth_of_knowledge: 0,
      depth_earned: "Unable to evaluate — AI analysis failed.",
      depth_missed: "Unable to evaluate — AI analysis failed.",
      problem_solving: 0,
      problem_solving_earned: "Unable to evaluate — AI analysis failed.",
      problem_solving_missed: "Unable to evaluate — AI analysis failed.",
      logical_thinking: 0,
      logical_thinking_earned: "Unable to evaluate — AI analysis failed.",
      logical_thinking_missed: "Unable to evaluate — AI analysis failed.",
      fluency: 0,
      fluency_earned: "Unable to evaluate — AI analysis failed.",
      fluency_missed: "Unable to evaluate — AI analysis failed.",
      confidence: 0,
      confidence_earned: "Unable to evaluate — AI analysis failed.",
      confidence_missed: "Unable to evaluate — AI analysis failed.",
      summary: "Cognitive evaluation requires manual review.",
    },
    behavioral_analysis: {
      overview: "Automated behavioral analysis unavailable. Manual review of interview recording and transcript is required before making a hiring decision.",
      engagement_signals: [],
      consistency_signals: [],
      communication_patterns: [],
      confidence_indicators: [],
      integrity_flags: [],
      strengths_observed: [],
      concerns_noted: [],
      summary: "This interview requires human assessment. AI analysis failed to complete.",
    },
    verdict: {
      summary: `AI analysis for ${name} (${role}) could not be completed. ${reason} Manual review of the interview transcript and recording is required before making a hiring decision.`,
      recommendation: "Maybe",
      recommendation_reason: "Manual review required — automated analysis was unavailable for this session.",
    },
    strategic_verdict: {
      decision: "Maybe",
      summary: "Automated analysis failed. Human review required before any hiring decision.",
      rationale: ["AI report generation failed — transcript is available for manual review."],
      next_actions: ["Review interview recording and transcript manually", "Conduct follow-up interview to assess candidate"],
    },
    integrity: {
      score: 100,
      summary: "No automated integrity analysis available. Review proctoring events manually if this session had flags.",
    },
    skills_proof: [],
  };
}