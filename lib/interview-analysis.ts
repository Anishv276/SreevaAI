import OpenAI from "openai";

/**
 * Generates a comprehensive interview analysis report using OpenAI.
 * This function takes the interview transcript, candidate details, and job requirements
 * to produce a structured analysis of the candidate's performance.
 */
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
You are a senior technical recruiter and behavioral analyst. 
You are analyzing a transcript of an AI-led interview.

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
Analyze the transcript and generate a structured JSON report. 
Your analysis must be objective, deep, and focus on both technical skills and behavioral signals.

OUTPUT SCHEMA (JSON):
{
  "qa_blocks": [
    {
      "q": number,
      "title": "string (Short question summary)",
      "tags": ["string"],
      "score": "X/10",
      "scoreColor": "text-orange-500",
      "verdict": "detailed reasoning for this specific answer",
      "confidence": "High" | "Medium" | "Low"
    }
  ],
  "recording": {
    "summary": "1-2 sentence summary of the interview audio/video performance"
  },
  "communication": {
    "pronunciation": number (0-100, how clearly and understandably the candidate spoke — accent is fine as long as it is easy to understand),
    "grammar": number (0-100, sentence structure and grammatical correctness — do not penalise minor natural speech errors),
    "fluency": number (0-100, smooth conversational flow — minor fillers like 'um' and 'uh' are normal, only penalise if they heavily disrupt understanding),
    "confidence": number (0-100, how assertive and certain the candidate sounded — penalise heavy hedging like 'I think maybe' or 'I'm not sure but'),
    "summary": "One sentence describing overall communication quality based on what was actually said in the interview"
  },
  "cognitive_insights": {
    "clarity": number (0-100, how clearly the candidate expressed and articulated ideas across all answers),
    "depth_of_knowledge": number (0-100, level of technical depth, detail, and understanding demonstrated in answers),
    "problem_solving": number (0-100, quality of approach to solving technical problems — methodology, step-by-step reasoning, consideration of edge cases),
    "logical_thinking": number (0-100, structure, coherence, and consistency of reasoning across responses),
    "summary": "Brief summary of candidate's cognitive strengths and gaps based on interview performance"
  },
  "behavioral_analysis": {
    "overview": "High-level summary of candidate's behavior and engagement during interview",
    "engagement_signals": [
      "Specific observations about focus, attention, interaction (e.g., 'Asked 3 clarifying questions showing genuine interest', 'Showed fatigue signs in final 20 minutes')",
      "Include positive engagement and areas of disengagement with specific timing/context"
    ],
    "consistency_signals": [
      "Resume claim vs. interview answer validation with specific examples (e.g., 'Claims 5 years React but struggled with basic hooks question')",
      "Contradiction detection with evidence (e.g., 'Said led architecture, later attributed to team')",
      "Exaggeration patterns if detected"
    ],
    "communication_patterns": [
      "How candidate structured responses, clarity pattern (e.g., 'Vague first answers, became specific when probed')",
      "Observable patterns in speech (hedging, confidence, articulation) with examples from transcript",
      "Changes in communication style across interview"
    ],
    "confidence_indicators": [
      "Evidence of genuine confidence: specific examples, step-by-step thinking, defending positions",
      "Evidence of false confidence: hedging, backtracking, giving up when challenged",
      "Pattern over time: Did confidence increase, decrease, or remain stable?"
    ],
    "integrity_flags": [
      "Proctoring signals correlated with answer quality (e.g., 'Checked tabs 7 times during technical Q, which were weakest answers')",
      "Behavioral red flags from interview content (evasion, inconsistency, note-checking indicators)",
      "Clear integrity concerns vs. benign explanations"
    ],
    "strengths_observed": [
      "Areas of genuine capability demonstrated through interview (e.g., 'Showed systematic problem-solving on debugging scenarios')",
      "Positive behaviors (e.g., 'Acknowledged knowledge gaps rather than guessing')",
      "Recovery patterns and growth within interview"
    ],
    "concerns_noted": [
      "Knowledge/experience gaps vs. claimed level (e.g., 'Avoids specific examples 4 times despite claiming specialization')",
      "Behavioral red flags (evasion, inconsistency, dishonesty indicators)",
      "Patterns that repeat across multiple questions/topics"
    ],
    "summary": "Concise overall assessment (2-3 sentences) synthesizing all signals into hiring decision context"
  },
  "verdict": {
    "summary": "Detailed overall summary of the candidate's performance (200-300 words)",
    "recommendation": "Strong Yes" | "Yes" | "Maybe" | "No",
    "recommendation_reason": "Primary reason for this recommendation"
  },
  "strategic_verdict": {
    "decision": "Hire" | "Maybe" | "Do Not Hire",
    "summary": "Strategic overview for leadership",
    "rationale": ["point 1", "point 2"],
    "next_actions": ["action 1"]
  },
  "integrity": {
    "score": number (0-100),
    "summary": "Summary of proctoring and behavioral integrity"
  },
  "skills_proof": [
    {
      "skill": "string (specific skill name, e.g., 'Python', 'REST APIs', 'React', 'System Design')",
      "status": "PROVED" | "PARTIAL" | "NOT PROVED" | "NOT TESTED",
      "score": "string (X/10, based on interview performance for this specific skill)",
      "evidence": "string (specific quote or example from transcript showing skill mastery/weakness, e.g., 'When asked about async/await, candidate correctly explained event loop and provided working code example')"
    }
  ]
}

Guidelines:
1. QA_BLOCKS (CRITICAL - Every question MUST have score and detailed reasoning):
   - Map EVERY question-answer pair from the transcript as a separate qa_block
   - For each Q&A:
     * title: 1-2 word summary of what the question tested (e.g., "React Hooks", "Problem Solving", "Leadership")
     * tags: ["skill1", "skill2"] - what technical/behavioral skills this tested
     * score: Rate 0-10 based on answer quality. 8-10 = strong/correct, 5-7 = partial/some gaps, 0-4 = weak/incorrect
     * verdict: SPECIFIC reasoning explaining WHY this score. Must include:
       - What the question asked for
       - What the candidate actually answered
       - Why it was good/bad (specific strengths or gaps shown)
       - Example from transcript: "When asked about async/await, candidate said '...'. This shows [strength/gap]."
     * confidence: High (clear answer), Medium (partially clear), Low (vague/incomplete)
   - Do NOT write generic verdicts like "Good answer" or "Showed knowledge". Be specific about what they demonstrated.
   - Example (GOOD): "Asked to explain database indexing. Candidate correctly described B-tree structure, trade-offs, and when to use. Shows strong database fundamentals."
   - Example (BAD): "The answer was good and showed technical knowledge."

2. Recommendation: Use "Strong Yes" only for exceptional candidates. Use "No" for clear failures.
3. Integrity: Factor in proctoring events (tab switching, face detection issues).
4. Logic: Ensure the rationale directly cites evidence from the transcript.
5. Communication: Score based ONLY on what the candidate actually said in the transcript. Do not penalise accents, natural pauses, or occasional fillers. The goal is whether HR can easily understand this person and whether communication issues affected answer quality.
6. Cognitive Insights:
   - Clarity: Rate how well ideas were expressed. Did the candidate articulate concepts clearly and concisely?
   - Depth of knowledge: Did answers show sufficient technical understanding? Did they go deep or stay surface-level?
   - Problem solving: How did they approach technical challenges? Did they break down problems, consider edge cases, explain reasoning?
   - Logical thinking: Were responses structured logically? Did ideas flow coherently? Was reasoning consistent across answers?
   - All cognitive scores should be 0-100 and based ONLY on evidence from the interview transcript.

7. Behavioral Analysis (CRITICAL - Comprehensive Signal Synthesis):
   CRITICAL: This is NOT a score or metric. Synthesize ALL behavioral and intelligence signals into a narrative that explains WHAT HAPPENED during the interview.

   For each section, follow these rules:

   ENGAGEMENT SIGNALS:
   - What was the candidate's demeanor? Focused, distracted, engaged, tired?
   - Did they ask clarifying questions, show genuine interest, or remain passive?
   - Track engagement changes over time (e.g., started strong, faded in final 20 min)
   - Example (GOOD): "Asked 3 clarifying questions about team structure, showing preparation. Showed fatigue in final 15 minutes with shorter responses."
   - Example (BAD): "Engagement was average"

   CONSISTENCY SIGNALS (Resume ↔ Interview):
   - For each major resume claim (skills, experience, role), compare with interview answers
   - Did they prove the claim? Can they explain it? Do examples match their level?
   - Flag mismatches, exaggerations, or inconsistencies with SPECIFIC EVIDENCE
   - Example (GOOD): "Claims '5 years React expertise' but couldn't explain hooks without guidance. Later said 'My team handled state management', contradicting earlier claim of leading architecture."
   - Example (BAD): "Resume doesn't match interview answers"

   COMMUNICATION PATTERNS:
   - How did they structure responses? Vague → specific? Rambling? Concise?
   - Hedging language pattern ("maybe", "I think", "probably") - is it scattered or concentrated on certain topics?
   - Did clarity improve when probed, or stay the same/worse?
   - Example (GOOD): "First answers were vague ('I've worked with APIs'), but when asked for specific examples, gave detailed explanation of REST vs GraphQL tradeoffs."
   - Example (BAD): "Communication was unclear"

   CONFIDENCE INDICATORS:
   - Genuine confidence: Specific examples, step-by-step reasoning, defending position when challenged
   - False confidence: Surface polish that crumbles under probing, hedging on claimed specialties
   - Did confidence increase (showed thinking), decrease (got stuck), or stay flat?
   - Correlate with topic: Was confidence high only on easy questions?
   - Example (GOOD): "Confident on debugging (gave specific examples, explained reasoning), but became uncertain when asked about architectural decisions despite claiming expertise."
   - Example (BAD): "Confidence level was medium"

   INTEGRITY FLAGS & PROCTORING SIGNALS:
   - Correlate proctoring signals (tab switches, face detection, audio issues) with answer quality/topics
   - Behavioral red flags: Evasion, repeated inability to provide examples, inconsistent stories
   - Example (GOOD): "Checked browser tabs 7 times during technical questions (claimed areas of expertise), but 0 times during behavioral questions. Pattern suggests looking up answers for weak areas."
   - Example (BAD): "Tab switching detected"

   STRENGTHS OBSERVED:
   - Where did they genuinely shine? Specific examples + evidence
   - Recovery patterns: Did they think through problems when given time/guidance?
   - Positive behaviors: Acknowledging gaps, asking follow-up questions, showing methodology
   - Example (GOOD): "When given debugging scenario, showed systematic troubleshooting approach. Explained assumptions before asking clarifying questions, indicating genuine problem-solving skill."
   - Example (BAD): "Showed strength in some areas"

   CONCERNS NOTED:
   - Knowledge gaps vs. claimed expertise level
   - Repeated patterns (e.g., avoids giving examples, evasive on certain topics)
   - Behavioral concerns (exaggeration, inconsistency, note-checking indicators)
   - Example (GOOD): "Avoided providing specific examples 4 times when asked directly. Particularly evasive on topics listed as specialties. Raises authenticity concerns."
   - Example (BAD): "Has some concerns"

   SYNTHESIS RULES:
   - Use specific examples from the transcript ("When asked about X, answered Y")
   - Connect patterns to hiring relevance ("This matters because...")
   - Avoid generic observations; be precise about what happened and why
   - Each bullet point should enable HR to understand behavior without seeing transcript
   - 5-8 bullets per category minimum for depth and accuracy
   - FINAL SUMMARY (2-3 sentences): Synthesize all signals into overall behavioral assessment for hiring decision

8. SKILLS PROOF (CRITICAL - Must be based on actual interview performance):
   - ONLY list skills that were actually discussed/tested in the interview
   - For each skill: Extract the skill name (e.g., 'Python', 'React', 'REST APIs', 'Leadership')
   - STATUS:
     * "PROVED" = Candidate demonstrated clear capability with specific examples or correct answers
     * "PARTIAL" = Candidate showed some understanding but with gaps or hesitation
     * "NOT PROVED" = Candidate claimed skill but could not demonstrate it
     * "NOT TESTED" = Skill was listed in JD/resume but never discussed in interview
   - SCORE: Rate 1-10 based on depth, clarity, and accuracy of answers. Score must directly reflect interview performance.
   - EVIDENCE: Quote specific example from transcript (e.g., "When asked about async/await, candidate explained: '...'. This demonstrates strong understanding.") OR "Candidate avoided answering when asked about X, claiming 'I haven't used it much'."
   - Do NOT invent skills or overstate performance. Be conservative and evidence-based.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a professional recruitment AI. Output ONLY valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error("Empty response from OpenAI");

    const data = JSON.parse(content);
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

/**
 * Returns a minimal valid report structure if the AI analysis fails.
 */
function generateFallbackReport(name: string, role: string, reason = "Internal processing error.") {
  return {
    qa_blocks: [],
    recording: { summary: "Transcript captured successfully." },
    communication: {
      pronunciation: 50,
      grammar: 50,
      fluency: 50,
      confidence: 50,
      summary: "Communication evaluation pending — manual review recommended."
    },
    cognitive_insights: {
      clarity: 50,
      depth_of_knowledge: 50,
      problem_solving: 50,
      logical_thinking: 50,
      summary: "Cognitive evaluation pending — manual review recommended."
    },
    behavioral_analysis: {
      overview: "Behavioral analysis could not be completed due to processing error. Manual review of interview recording and transcript recommended.",
      engagement_signals: [
        "Automated engagement analysis unavailable — review interview recording for focus, participation level, and demeanor changes over time."
      ],
      consistency_signals: [
        "Compare resume claims against interview responses manually to assess accuracy and experience level authenticity."
      ],
      communication_patterns: [
        "Review transcript for communication style — clarity, structure, hedging patterns, and coherence changes during interview."
      ],
      confidence_indicators: [
        "Assess confidence through interview evidence: specific examples, reasoning quality, handling of challenges, and topic-dependent variations."
      ],
      integrity_flags: [
        "Review proctoring log for suspicious patterns (tab switching, face detection issues) correlated with question topics and answer quality."
      ],
      strengths_observed: [
        "Identify areas where candidate demonstrated genuine capability through specific examples and systematic thinking."
      ],
      concerns_noted: [
        "Identify patterns of evasion, inconsistency, knowledge gaps vs. claims, or authenticity concerns."
      ],
      summary: "Behavioral analysis requires manual review due to system limitation. This interview requires human assessment for hiring decision."
    },
    verdict: {
      summary: `Basic analysis for ${name} for ${role}. ${reason}`,
      recommendation: "Maybe",
      recommendation_reason: "Manual review required due to processing failure."
    },
    strategic_verdict: {
      decision: "Maybe",
      summary: "Requires manual oversight.",
      rationale: ["Automated analysis failed"],
      next_actions: ["Review transcript manually"]
    },
    integrity: { score: 100, summary: "No automated integrity flags." },
    skills_proof: []
  };
}
