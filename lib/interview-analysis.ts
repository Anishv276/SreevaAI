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
    "pronunciation": number (0-100, score ONLY on clarity of articulation from the transcript — did words come through clearly and without distortion? 85-100: crisp articulation throughout; 65-84: mostly clear with occasional mumbling; 40-64: frequent unclear words; below 40: hard to understand),
    "grammar": number (0-100, score ONLY on sentence structure from the transcript — complete sentences, correct tense, subject-verb agreement. 85-100: consistently well-formed sentences; 65-84: mostly correct with minor fragments; 40-64: notable fragments and tense errors; below 40: frequent structural errors that impede understanding),
    "fluency": number (0-100, score ONLY on smoothness of delivery — filler words (um, uh, like, you know, sort of), unnatural pauses, restarts, incomplete thoughts. 85-100: smooth delivery, minimal filler; 65-84: occasional filler or pauses; 40-64: frequent filler or hesitation; below 40: heavily disrupted delivery that hinders comprehension),
    "confidence": number (0-100, score ONLY on assertiveness and decisiveness — did the candidate state answers clearly without excessive hedging ('I think maybe', 'not sure', 'kind of')? Did tone stay steady under follow-up? 85-100: decisive, no hedging, held position under pressure; 65-84: mostly confident with occasional hedging; 40-64: frequent hedging, tone dropped under follow-up; below 40: consistently tentative, avoided direct answers),
    "summary": "One specific sentence citing a concrete pattern observed in the transcript — name the actual behavior (e.g. 'Candidate used filler words 12+ times across technical answers, dragging fluency down, but grammar was consistently strong'). No generic phrases."
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
    "overview": "2-3 sentence plain-English summary an HR manager can read in 10 seconds and know whether to advance. State the candidate's working style, attitude to role, and one decisive signal.",
    "engagement_signals": [
      "Write each bullet as a complete observation an HR manager can act on. Format: [What happened] → [What it signals]. E.g. 'Candidate asked two clarifying questions before answering the system design question → shows structured thinking and genuine engagement rather than rushing to answer.' Minimum 4 bullets, cite topic/timing."
    ],
    "consistency_signals": [
      "Compare resume claims to interview answers. Format: [Resume claim] vs [What they said in interview] → [Verdict: Confirmed / Partial / Not supported]. E.g. 'Resume lists 3 years React experience → answered hooks question confidently with real examples → Confirmed.' Minimum 4 bullets."
    ],
    "communication_patterns": [
      "Describe how the candidate communicated, not just that they did. Format: [Pattern observed] — [Specific example from transcript]. E.g. 'Used structured STAR responses for behavioral questions — when asked about a conflict, they named the stakeholder, described their action, and stated the outcome clearly.' Minimum 4 bullets."
    ],
    "confidence_indicators": [
      "Distinguish genuine confidence from performance. Format: [Signal type: Genuine/Surface/Low] — [Evidence]. E.g. 'Genuine: stated a strong opinion on architecture trade-offs and defended it when challenged.' or 'Surface: claimed expertise in Kubernetes but could not name a single kubectl command when asked.' Minimum 4 bullets."
    ],
    "integrity_flags": [
      "Only include if there is an actual flag. If none, write one bullet: 'No behavioral integrity concerns detected during this session.' If flags exist, format: [Flag type] at [question/topic] — [what was observed] — [HR implication]. E.g. 'Tab switch detected during the coding question — candidate's answer quality dropped noticeably after returning, suggesting possible reference lookup.'"
    ],
    "strengths_observed": [
      "Write each strength as a hiring argument, not a compliment. Format: [Skill/trait demonstrated] — [Specific moment from interview that proves it] — [Why it matters for this role]. E.g. 'Debugging mindset — when given a broken code snippet, immediately asked about the execution environment before reading the code → critical for a backend engineering role.' Minimum 4 bullets."
    ],
    "concerns_noted": [
      "Write each concern as a risk the hiring manager should weigh, with enough detail to decide. Format: [Concern] — [What the candidate said or did] — [Risk level: Low/Medium/High and why]. E.g. 'Shallow system design answers — described only happy-path flows with no mention of failure modes or scale — Medium risk for a senior backend role.' Minimum 4 bullets."
    ],
    "summary": "3-sentence final behavioral verdict. Sentence 1: working style and interpersonal signals. Sentence 2: the single strongest evidence point for hiring. Sentence 3: the single biggest risk or open question. Write for a hiring manager making a final call."
  },

  "verdict": {
    "summary": "200-300 word detailed overall assessment. Cover: technical depth, communication quality, behavioral signals, consistency with resume, and specific evidence from the interview. End with a clear hiring recommendation rationale.",
    "recommendation": "Strong Yes" | "Yes" | "Maybe" | "No",
    "recommendation_reason": "1-2 sentence primary reason for this recommendation, citing specific evidence",
    "ai_summary_concise": "Exactly 4 sentences. Each sentence is critical and decisive. Bold the key words that HR must see (wrap in **word** format). Sentence 1: Overall fit and recommendation. Sentence 2: Primary technical strength or weakness. Sentence 3: Critical communication or behavioral signal. Sentence 4: Any major red flag or exceptional strength. Make every word count."
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
4. BEHAVIORAL_ANALYSIS: Minimum 4 bullets per section. Every bullet must follow the format described in the schema — [observed fact] → [what it signals for hiring]. Never write generic bullets like "showed good communication" or "was engaged." Write bullets an HR manager can quote in a debrief meeting.
5. VERDICT SUMMARY: 200-300 words, specific, evidence-backed. No generic praise.
6. AI_SUMMARY_CONCISE: Exactly 4 sentences. Each sentence is critical information an HR manager needs. Bold (**word**) key metrics, names, and decisions. Never filler. Example: "**Senior React Developer** with **7 years** experience. **Strong** system design answers but **weak** on **database optimization**. Shows **genuine confidence** but **occasional hedging** under pressure. **Clear hire** for frontend team if backend skills improve."
7. INTEGRITY: Score 100 if no proctoring events. Deduct for tab switches (5pts each), face not detected (10pts), multiple devices (15pts). Correlate with answer quality.
8. COGNITIVE INSIGHTS: All _earned/_missed fields required. Cite specific questions/answers.
9. recommendation: "Strong Yes" only for exceptional candidates. "No" for clear failures. Be honest.
10. _meta.is_fallback must always be false in a real response.
11. Do NOT write generic phrases like "showed knowledge", "good answer", "demonstrated skill". Be specific.
12. COMMUNICATION SCORES: Each score must be independently derived from transcript evidence. Do NOT average them together or give all four the same score. Score each dimension separately based only on what you can observe in the text: grammar from sentence structure, fluency from filler/pause patterns, confidence from hedging language, pronunciation from clarity of words. If the transcript shows clear evidence of weakness in one dimension and strength in another, scores should diverge — a score spread of 20+ points across dimensions is expected when the candidate has mixed communication patterns.
13. TECHNICAL_SCORE: Must be calculated from actual Q&A performance (score_breakdown clarity, depth from qa_blocks). Not arbitrary. Show why: "Question X tested Y skill: candidate scored 8/10 (strong depth, weak edge cases)" = technical strength. Average all Q scores for technical_score.
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