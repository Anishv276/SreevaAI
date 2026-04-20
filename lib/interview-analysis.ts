import OpenAI from "openai";
import { recordOrgBillingFromOpenAICompletion } from "@/lib/usage-metrics";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * Full structured interview report -- covers all UI sections.
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

  //  Section 5: Integrity and Proctoring 
  integrity?: {
    score: number;                    // 0--100
    label: string;                    // Clean | Monitor | Risk
    summary: string;                  // concise integrity verdict
    risk_factors: string[];           // telemetry risk drivers
    recovery_factors: string[];       // clean / de-escalating signals
    trend: string;                    // stable | improving | declining | collapsing
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
    case "Proved": return "text-emerald-600 bg-emerald-50 border-emerald-100";
    case "Partial": return "text-orange-500 bg-orange-50 border-orange-100";
    case "Not tested": return "text-gray-500 bg-gray-50 border-gray-100";
    default: return "text-red-500 bg-red-50 border-red-100";  // Not proved
  }
}

function consistencyColor(status: string): string {
  switch (status) {
    case "Verified": return "text-emerald-600 bg-emerald-50 border-emerald-100";
    case "Not tested": return "text-[#8B5E3C] bg-[#FDF9F3] border-[#F5E6D3]";
    case "Weak signal": return "text-[#8B5E3C] bg-[#FDF9F3] border-[#F5E6D3]";
    default: return "text-[#E63946] bg-red-50 border-red-100";  // Mismatch / Contradicted
  }
}

function momentColor(tag: string): string {
  switch (tag) {
    case "Critical": return "text-[#E63946] bg-red-50 border-red-100";
    case "Flag": return "text-[#8B5E3C] bg-[#FDF9F3] border-[#F5E6D3]";
    case "Positive": return "text-emerald-600 bg-emerald-50 border-emerald-100";
    default: return "text-indigo-600 bg-indigo-50 border-indigo-100";  // Context
  }
}

function scoreColor(score: string): string {
  if (score === "--") return "text-gray-300";
  const n = parseFloat(score);
  if (n >= 7) return "text-emerald-600";
  if (n >= 4) return "text-orange-500";
  return "text-[#E63946]";
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function capitalizeWords(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferInterviewLabel(score: number): "Poor" | "Below Average" | "Average" | "Good" | "Excellent" {
  if (score >= 8.5) return "Excellent";
  if (score >= 7) return "Good";
  if (score >= 4.5) return "Average";
  if (score >= 2.5) return "Below Average";
  return "Poor";
}

function inferCefr(score: number, wordCount: number): { level: string; label: string } {
  if (wordCount < 80 || score < 2.5) return { level: "A1", label: "Basic" };
  if (wordCount < 160 || score < 4) return { level: "A2", label: "Elementary" };
  if (wordCount < 280 || score < 5.5) return { level: "B1", label: "Intermediate" };
  if (wordCount < 420 || score < 7) return { level: "B2", label: "Upper-Intermediate" };
  if (score < 8.5) return { level: "C1", label: "Advanced" };
  return { level: "C2", label: "Proficient" };
}

function deriveTranscriptTurns(transcript: string): Array<{ question: string; answer: string }> {
  const turns: Array<{ question: string; answer: string }> = [];
  const lines = transcript.split(/\r?\n/);
  let question = "";
  let answer = "";
  let currentRole: "ai" | "candidate" | null = null;

  const flush = () => {
    const q = cleanText(question);
    const a = cleanText(answer);
    if (q || a) turns.push({ question: q, answer: a });
    question = "";
    answer = "";
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const interviewerMatch = line.match(/^Interviewer:\s*(.*)$/i);
    const candidateMatch = line.match(/^Candidate:\s*(.*)$/i);

    if (interviewerMatch) {
      if (currentRole === "candidate") flush();
      currentRole = "ai";
      question = question ? `${question} ${interviewerMatch[1] || ""}` : (interviewerMatch[1] || "");
      continue;
    }

    if (candidateMatch) {
      currentRole = "candidate";
      answer = answer ? `${answer} ${candidateMatch[1] || ""}` : (candidateMatch[1] || "");
      continue;
    }
    if (currentRole === "candidate") {
      answer = answer ? `${answer} ${line}` : line;
    } else {
      question = question ? `${question} ${line}` : line;
    }
  }

  flush();
  return turns;
}

function pickJdSkills(jdText: string): string[] {
  const raw = jdText
    .split(/\r?\n|,|;|\u2022|-/)
    .map((part) => cleanText(part))
    .filter(Boolean)
    .filter((part) => part.length >= 3);

  const filtered = raw.filter((part) => {
    const lower = part.toLowerCase();
    return !["job description", "requirements", "role applied for", "responsibilities"].includes(lower);
  });

  const deduped = Array.from(new Set(filtered.map((part) => part.replace(/^[-*]\s*/, ""))));
  return deduped.slice(0, 6).map((skill) => capitalizeWords(skill));
}

function inferIntegrityLabel(score: number): "Clean" | "Monitor" | "Risk" {
  if (score >= 85) return "Clean";
  if (score >= 70) return "Monitor";
  return "Risk";
}

function buildIntegritySummary(score: number, high: number, medium: number, low: number, events: any[]): string {
  if (!events.length) {
    return "No proctoring signals were recorded. Integrity looks clean for this session.";
  }
  if (high > 0) {
    return `High-risk telemetry is present with ${high} high-severity signal(s). Review the recording and transcript before making a final integrity call.`;
  }
  if (medium > 0) {
    return `The session contains ${medium} medium-severity signal(s) and ${low} low-severity event(s). The telemetry does not prove misconduct, but it should be reviewed in context.`;
  }
  return `The session looks mostly clean with ${low} low-severity signal(s). The integrity score remains strong at ${score}/100.`;
}

function buildIntegritySignals(events: any[]): { risk_factors: string[]; recovery_factors: string[] } {
  const riskFactors = Array.from(new Set(
    events
      .map((ev: any) => {
        const event = String(ev?.event || ev?.eventType || "").trim();
        const severity = String(ev?.severity || "").trim();
        if (!event) return "";
        return severity ? `${event} (${severity})` : event;
      })
      .filter(Boolean)
  )).slice(0, 6);
  return {
    risk_factors: riskFactors.length > 0 ? riskFactors : ["No recorded integrity risks"],
    recovery_factors: events.length === 0 ? ["Clean session telemetry"] : [],
  };
}

function buildFallbackInterviewReport(opts: {
  transcript: string;
  resumeText: string;
  jdText: string;
  role: string;
  candidateName: string;
  durationSeconds: number;
  proctoringEvents?: any[];
}): InterviewReport {
  const { transcript, resumeText, jdText, role, candidateName, durationSeconds, proctoringEvents = [] } = opts;
  const wordCount = transcript.split(/\s+/).filter(Boolean).length;
  const turns = deriveTranscriptTurns(transcript);
  const skills = pickJdSkills(jdText);
  const durationLabel = durationSeconds >= 60 ? `${Math.max(1, Math.round(durationSeconds / 60))} min` : `${durationSeconds}s`;
  const sparse = wordCount < 120 || turns.length <= 2;
  const lowConfidence = sparse ? "Confidence: Low -- short transcript" : "Confidence: Medium -- transcript available";
  const candidateAnswerSignals = turns.map((turn) => turn.answer.toLowerCase());
  const knowsNothingCount = candidateAnswerSignals.filter((answer) => /don't know|do not know|not sure|no idea|i don't|i do not|not good at|nothing/.test(answer)).length;
  const proctoringHigh = proctoringEvents.filter((ev: any) => String(ev?.severity || "").toLowerCase() === "high").length;
  const proctoringMedium = proctoringEvents.filter((ev: any) => String(ev?.severity || "").toLowerCase() === "medium").length;
  const proctoringLow = proctoringEvents.filter((ev: any) => String(ev?.severity || "").toLowerCase() === "low").length;
  const interviewScore = Math.max(
    0,
    Math.min(
      10,
      sparse ? 2 : 4 - knowsNothingCount * 0.35 - proctoringHigh * 0.15 - proctoringMedium * 0.05 + Math.min(2, wordCount / 250)
    )
  );
  const interviewLabel = inferInterviewLabel(interviewScore);
  const cefr = inferCefr(interviewScore, wordCount);
  const combinedScore = Math.max(0, Math.min(100, Math.round(interviewScore * 10 - proctoringHigh * 5 - proctoringMedium * 2)));
  const summaryLines = [
    `${candidateName} completed a ${durationLabel} interview for ${role}.`,
    sparse
      ? "The transcript is short and the candidate gave limited technical detail."
      : "The candidate answered some prompts but did not demonstrate sustained depth.",
    proctoringEvents.length > 0
      ? `Telemetry recorded ${proctoringEvents.length} proctoring event(s), including ${proctoringHigh} high-severity signal(s).`
      : "No proctoring signals were recorded."
  ];
  const summary = summaryLines.join(" ");

  const qaBlocks = (turns.length > 0 ? turns : [{
    question: "Interview transcript unavailable",
    answer: "No question/answer turns were captured for this session.",
  }]).map((turn, idx) => ({
    q: idx + 1,
    title: turn.question.slice(0, 64) || `Question ${idx + 1}`,
    tags: ["Interview", "Transcript"],
    score: idx === 0 && knowsNothingCount === 0 ? "3/10" : "0/10",
    scoreColor: idx === 0 && knowsNothingCount === 0 ? "text-orange-500" : "text-[#E63946]",
    verdict: turn.answer || "Not enough detail to assess.",
    confidence: lowConfidence,
  }));

  const skillRows = (skills.length > 0 ? skills : ["Communication", "Role Knowledge", "Problem Solving", "Tooling", "Execution"]).map((skill, idx) => {
    const isTested = !sparse && idx === 0;
    return {
      title: skill,
      note: isTested
        ? (turns[0]?.answer || "Candidate offered limited evidence.")
        : "Not tested -- transcript did not provide enough evidence.",
      confidence: isTested ? "Confidence: Medium -- limited evidence" : lowConfidence,
      status: isTested ? "Partial" : "Not tested",
      score: isTested ? "3/10" : "--",
      color: "",
    } as InterviewReport["skills_proof"][number];
  });

  const consistencySeeds = [
    { claim: "Resume experience", sub: "Experience claims", proof: sparse ? "Interview did not surface enough evidence to verify the claim." : "Interview evidence was limited and did not fully verify the claim.", status: "Weak signal" as const },
    { claim: "Technical depth", sub: "Practical depth", proof: sparse ? "The candidate provided minimal technical detail." : "The candidate did not sustain technical depth across the session.", status: "Mismatch" as const },
    { claim: "Communication", sub: "Clarity", proof: sparse ? "Answers were brief and often non-specific." : "Communication was polite but shallow.", status: "Weak signal" as const },
  ];

  const keyMomentSeeds = turns.slice(0, 5);
  while (keyMomentSeeds.length < 4) {
    keyMomentSeeds.push({
      question: keyMomentSeeds.length === 0 ? "Interview opening" : `Session note ${keyMomentSeeds.length + 1}`,
      answer: keyMomentSeeds.length === 0
        ? "Transcript was too sparse to capture a stronger behavioral moment."
        : "No additional structured evidence was captured for this portion of the interview.",
    });
  }
  const keyMoments = keyMomentSeeds.map((turn, idx) => ({
    time: `${Math.max(0, idx * 0.5).toFixed(1)} min`,
    tag: idx === 0 ? "Context" : knowsNothingCount > 0 && idx < 3 ? "Flag" : "Context",
    tagColor: idx === 0 ? momentColor("Context") : knowsNothingCount > 0 && idx < 3 ? momentColor("Flag") : momentColor("Context"),
    title: turn.question ? `Question ${idx + 1}` : `Turn ${idx + 1}`,
    note: turn.answer || "Candidate response was not detailed enough to support a stronger observation.",
  })) as InterviewReport["key_moments"];

  const strategicDecision =
    interviewScore >= 7 ? "Hire" :
      interviewScore >= 4 ? "Maybe" :
        "Do Not Hire";

  const strategicSummary =
    interviewScore >= 7
      ? "The interview provides enough evidence to proceed positively, though the report is conservative because it was generated from limited transcript depth."
      : interviewScore >= 4
        ? "The interview is inconclusive. The candidate showed some responsiveness, but the session did not surface enough evidence for a confident hire decision."
        : "The interview does not demonstrate enough role-specific depth or confidence to support hiring at this stage.";

  const strategicRationale = [
    sparse
      ? "The transcript is short, so the model should treat most detailed categories as low-confidence."
      : "The transcript contains limited role-specific depth and several brief or non-committal answers.",
    proctoringEvents.length > 0
      ? `Telemetry includes ${proctoringEvents.length} proctoring event(s), including ${proctoringHigh} high-severity signal(s).`
      : "No proctoring events were present, so the decision is based mainly on transcript evidence.",
    `Observed ${turns.length} question/answer turn(s) from the interview transcript.`,
  ];

  const integrityScore = Math.max(0, Math.min(100, Math.round(100 - (proctoringHigh * 22) - (proctoringMedium * 10) - (proctoringLow * 4))));
  const integritySignals = buildIntegritySignals(proctoringEvents);

  const nextActions = strategicDecision === "Hire"
    ? ["Proceed to the next hiring stage.", "Use the detailed interview recording for final calibration."]
    : [
      "Use a follow-up interview with more role-specific questions.",
      "Request direct evidence for the missing skills before moving forward.",
    ];

  return {
    scores: {
      interview_score: Number(interviewScore.toFixed(1)),
      interview_label: interviewLabel,
      cefr_level: cefr.level,
      cefr_label: cefr.label,
      combined_score: combinedScore,
    },
    recording: {
      duration_seconds: durationSeconds,
      duration_label: durationLabel,
      word_count: wordCount,
      summary,
    },
    verdict: {
      summary,
      recommendation: interviewScore >= 7 ? "Yes" : interviewScore >= 4 ? "Maybe" : "No",
      recommendation_reason: sparse
        ? "The transcript is too limited to support a strong positive recommendation."
        : "The candidate did not provide enough role-specific evidence to justify a stronger recommendation.",
    },
    strategic_verdict: {
      decision: strategicDecision,
      summary: strategicSummary,
      rationale: strategicRationale,
      next_actions: nextActions,
    },
    communication: {
      clarity: sparse ? 28 : 42,
      fluency: sparse ? 25 : 38,
      grammar: sparse ? 45 : 50,
      depth: sparse ? 10 : 20,
      cefr_analysis: sparse
        ? `The session reads at a low-confidence ${cefr.level} level because the candidate gave very brief answers and the transcript does not show sustained elaboration.`
        : `The session reads at a ${cefr.level} level because the candidate answered briefly and did not sustain deep technical explanation.`,
    },
    integrity: {
      score: integrityScore,
      label: inferIntegrityLabel(integrityScore),
      summary: buildIntegritySummary(integrityScore, proctoringHigh, proctoringMedium, proctoringLow, proctoringEvents),
      risk_factors: integritySignals.risk_factors,
      recovery_factors: integritySignals.recovery_factors,
      trend: proctoringEvents.length > 0 ? "declining" : "stable",
    },
    skills_proof: skillRows,
    qa_blocks: qaBlocks,
    consistency: consistencySeeds.map((item) => ({
      ...item,
      statusColor: consistencyColor(item.status),
    })),
    key_moments: keyMoments,
    generated_at: new Date().toISOString(),
    model: "fallback-rule-based",
  };
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
  const fallbackReport = () => buildFallbackInterviewReport(opts);

  const systemPrompt = `You are a senior interviewer with many years of experience assessing candidates across technical, behavioral, and operational roles. Your job is to produce the sharpest possible post-interview evaluation report for hiring decisions. Read the transcript like an expert assessor: extract every meaningful signal, identify strengths, gaps, contradictions, confidence level, integrity risk, and hiring risk. Be direct, crisp, and evidence-led. Never invent facts, quotes, questions, or achievements. When evidence is weak, say so plainly. When evidence is strong, be decisive. Output valid JSON only.`;

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

Return JSON only. No markdown. No code fences. No commentary.

The JSON must match the TypeScript interface exactly and must power these sections:
- "scores"
- "recording"
- "verdict"
- "strategic_verdict"
- "communication"
- "integrity"
- "skills_proof"
- "qa_blocks"
- "consistency"
- "key_moments"

How to think:
- Read like a senior interviewer who is separating real evidence from noise.
- Extract the exact signal the candidate gave, not a generic summary.
- Capture practical depth, confidence, hesitation, non-answers, contradictions, and strong signals.
- Be fair, ruthless on evidence, and never flattering by default.
- If the transcript is short, say it is short. If the evidence is weak, say it is weak.
- If the evidence is strong, make the report decisive and specific.
- Do not invent questions, answers, moments, skills, or claims that are not supported.
- Use concise recruiter language. No fluff. No repetition. No generic AI phrasing.
- Prefer concrete nouns, tools, examples, and observable behavior.

Section rules:
- "scores" should be internally consistent across interview score, CEFR, and combined score.
- "recording.summary" should be 3-4 short, sharp lines maximum.
- "verdict.summary" should be a concise executive summary for HR.
- "strategic_verdict.rationale" must contain 3-5 bullets tied to evidence.
- "strategic_verdict.next_actions" must contain 2-4 concrete next steps or close-out actions.
- "communication.cefr_analysis" must explain the CEFR level using transcript evidence.
- "skills_proof" should include the major JD skills that matter for this role, but only if they are actually relevant.
- "qa_blocks" should contain one entry per meaningful interview question and should summarize the answer quality, not the raw transcript.
- "consistency" should compare 3-5 concrete resume claims against what the interview actually showed.
- "key_moments" should contain 4-7 chronological moments: strongest proof, biggest gap, notable behavior, and session quality.

Accuracy rules:
- Base every field only on transcript evidence, resume text, job description, duration, and proctoring events.
- Never fabricate direct quotes.
- When exact wording is unavailable, paraphrase faithfully.
- If evidence is missing, use "Not tested", "--", or a neutral low-confidence statement.
- When a question was never reached, set its score to "--" and explain that it was not reached or not assessable.
- Do not force extra items just to make arrays look full.
- Do not repeat the same conclusion in multiple sections with different wording unless the section demands it.
- Keep the report crisp enough that a hiring manager can scan it in under a minute, but rich enough that nothing important is missed.

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

  "integrity": {
    "score": number,                    // 0--100 based on proctoring telemetry
    "label": "Clean"|"Monitor"|"Risk",
    "summary": string,                  // concise integrity verdict
    "risk_factors": string[],           // main telemetry risk drivers
    "recovery_factors": string[],       // any clean / de-escalating signals
    "trend": string                     // stable | improving | declining | collapsing
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
- skills_proof color, consistency statusColor, key_moments tagColor, qa_blocks scoreColor -> leave as "" (populated post-parse)
- recording.duration_label should be human-readable and compact, e.g. "5 min" or "12 min"
- recording.word_count must reflect the transcript length as closely as possible
  - recording.summary should be the short AI summary box displayed below the video, written in 3-4 lines only
  - Keep the summary concise, direct, and skimmable; do not write a long paragraph
- All scores must reflect ONLY what is in the transcript, resume text, JD text, duration, and proctoring events -- do not extrapolate
- If transcript is very short (<200 words), mark most skills as "Not tested" and lower scores accordingly
- Key moments must be in chronological order
- qa_blocks: if a question was never reached, set score "--" and verdict "Not reached -- session ended before this question"
  - qa_blocks should contain the full session trace with question, reasoning, and score for each major question
- consistency should use concrete resume claims from the resume and what the interview proved or contradicted
- key_moments should capture the strongest interview moments, including the best proof, biggest concern, and turning points
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.15,
      max_tokens: 5000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
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
    const hasRequiredStructure =
      raw &&
      typeof raw === "object" &&
      raw.scores &&
      raw.verdict &&
      raw.communication &&
      Array.isArray(raw.skills_proof) &&
      Array.isArray(raw.qa_blocks) &&
      Array.isArray(raw.consistency) &&
      Array.isArray(raw.key_moments);

    if (!hasRequiredStructure) {
      return fallbackReport();
    }

    const fallback = fallbackReport();

    //  Post-parse: inject colour tokens 
    raw.scores = raw.scores || fallback.scores;
    raw.recording = raw.recording || fallback.recording;
    raw.verdict = raw.verdict || fallback.verdict;
    raw.strategic_verdict = raw.strategic_verdict || fallback.strategic_verdict;
    raw.communication = raw.communication || fallback.communication;
    raw.integrity = raw.integrity || fallback.integrity;

    if (!Array.isArray(raw.skills_proof) || raw.skills_proof.length === 0) {
      raw.skills_proof = fallback.skills_proof;
    }
    if (!Array.isArray(raw.qa_blocks) || raw.qa_blocks.length === 0) {
      raw.qa_blocks = fallback.qa_blocks;
    }
    if (!Array.isArray(raw.consistency) || raw.consistency.length === 0) {
      raw.consistency = fallback.consistency;
    }
    if (!Array.isArray(raw.key_moments) || raw.key_moments.length < 4) {
      raw.key_moments = fallback.key_moments;
    }

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
  } catch (error) {
    console.error("[INTERVIEW ANALYSIS] Falling back to rule-based report", error);
    return fallbackReport();
  }
}




