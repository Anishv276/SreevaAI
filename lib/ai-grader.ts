import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface AssessmentGradingReport {
    // Top Level
    overallScore: number;
    decision: "Shortlisted" | "Borderline" | "Rejected";
    executiveSummary: string;
    finalVerdict: string;
    timeTaken: string;

    // Type Analysis
    typeAnalysis: {
        mcq: number;
        text: number;
        coding: number;
    };

    // Skill Matrix
    skillsAnalysis: Array<{
        skill: string;
        score: number,
        level: "Strong" | "Average" | "Weak";
    }>;

    // Quality Dimensions
    qualityDimensions: {
        logic: number;
        technicalDepth: number;
        communication: number;
        codeQuality: number | null;
    };

    // New Intelligence Areas
    patternAnalysis: {
        behavior: "Guessing" | "Vague" | "Strong" | "Inconsistent";
        notes: string;
    };

    hiringRisk: {
        level: "Low" | "Medium" | "High";
        reasons: string[];
    };

    strengths: string[];
    weaknesses: string[];

    // Granular Breakdown (from Pass 1)
    questionBreakdown: Array<{
        questionText: string;
        type: string;
        candidateAnswer: string;
        correctAnswer?: string;
        evaluation: "Correct" | "Partial" | "Incorrect";
        score: number;
        reason: string;
        expectedThinking: string;
        gap: string;
    }>;
}

interface QAInput {
    text: string;
    type: string;
    correctAnswer?: string;
    options?: string[];
    answer: string; // candidate's submitted answer
}

export async function gradeAssessment({
    questions,
    startedAt,
    completedAt,
    jdText,
}: {
    questions: QAInput[];
    startedAt?: Date | null;
    completedAt?: Date | null;
    jdText?: string;
}): Promise<AssessmentGradingReport> {

    // Calculate time taken
    let timeTaken = "N/A";
    if (startedAt && completedAt) {
        const diffSeconds = Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000);
        const mins = Math.floor(diffSeconds / 60);
        const secs = diffSeconds % 60;
        timeTaken = `${mins} min ${secs} sec`;
    }

    const questionsBlock = questions
        .map((q, i) =>
            `Q${i + 1} [${q.type}]: ${q.text}
${q.options ? `Options: ${q.options.join(" | ")}` : ""}
${q.correctAnswer ? `Correct Answer: ${q.correctAnswer}` : ""}
Candidate's Answer: ${q.answer || "(No answer provided)"}`
        )
        .join("\n\n");

    // --- PASS 1: INDIVIDUAL EVALUATION ---
    const evalPrompt = `You are a Strict Senior Technical Evaluator. Your job is to evaluate EACH answer individually with extreme precision.

### JOB CONTEXT:
${jdText || "General Technical Role"}

### QUESTIONS + CANDIDATE ANSWERS:
${questionsBlock}

---

### STRICT SCORING RULES:
- Incorrect / Nonsensical → score 0–2
- Vague / generic answer → max score 3
- Partially correct → max score 5
- Correct but shallow → max score 7
- Fully correct with strong reasoning → 8–10

---

### EVALUATION RULES:
1. Do NOT assume intent or give benefit of doubt.
2. Evaluate ONLY what is written.
3. If they didn't write it, they don't know it.

---

### OUTPUT FORMAT (STRICT JSON):
{
  "questionBreakdown": [
    {
      "questionText": "string",
      "type": "MCQ" | "MAQ" | "TEXT" | "CODING",
      "candidateAnswer": "string",
      "correctAnswer": "string | null",
      "score": number (0-10),
      "evaluation": "Correct" | "Partial" | "Incorrect",
      "reason": "Exact technical reason for this score",
      "expectedThinking": "What a top-tier candidate should have demonstrated",
      "gap": "Precisely what was missing or incorrect"
    }
  ]
}`;

    const evalCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: "Expert evaluator. Return JSON only." }, { role: "user", content: evalPrompt }],
        response_format: { type: "json_object" }
    });

    const breakdown = JSON.parse(evalCompletion.choices[0].message.content!).questionBreakdown;

    // --- PASS 2: STRATEGIC HIRING REPORT ---
    const reportPrompt = `You are a Senior Hiring Evaluator. Your job is to convert detailed answer evaluations into a final hiring decision report.

### JOB CONTEXT:
${jdText || "General Technical Role"}

### QUESTION BREAKDOWN (DATA SOURCE):
${JSON.stringify(breakdown, null, 2)}

---

### REPORT OBJECTIVE:
- Be extremely honest and strict. Focus on hiring decision, not politeness.
- Identify patterns (guessing, vagueness, fundamentals).
- If must-have skills are weak → force "Rejected".

---

### SCORING LOGIC:
- Weight: MCQ/MAQ (40%), TEXT (30%), CODING (30%).
- Decision Rules: < 50 (Rejected), 50–69 (Borderline), ≥ 70 (Shortlisted).

---

### OUTPUT FORMAT (STRICT JSON):
{
  "overall_score": number,
  "decision": "Shortlisted" | "Borderline" | "Rejected",
  "executive_summary": "2-3 sentences stating Acceptance/Rejection logic.",
  "type_analysis": { "mcq": number, "text": number, "coding": number },
  "skills_analysis": [
    { "skill": "string", "score": number, "level": "Strong" | "Average" | "Weak" }
  ],
  "quality_dimensions": {
    "logic": number, "technical_depth": number, "communication": number, "code_quality": number | null
  },
  "pattern_analysis": {
    "behavior": "Guessing" | "Vague" | "Strong" | "Inconsistent",
    "notes": "Evidence for this behavior."
  },
  "strengths": ["string"],
  "weaknesses": ["string"],
  "hiring_risk": { "level": "Low" | "Medium" | "High", "reasons": ["string"] },
  "final_verdict": "Clear recommendation with reasoning."
}`;

    const reportCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "system", content: "Senior Hiring Strategic Advisor. Return JSON only." }, { role: "user", content: reportPrompt }],
        response_format: { type: "json_object" }
    });

    const report = JSON.parse(reportCompletion.choices[0].message.content!);

    return {
        overallScore: report.overall_score,
        decision: report.decision,
        executiveSummary: report.executive_summary,
        finalVerdict: report.final_verdict,
        timeTaken,
        typeAnalysis: report.type_analysis,
        skillsAnalysis: report.skills_analysis,
        qualityDimensions: report.quality_dimensions,
        patternAnalysis: report.pattern_analysis,
        hiringRisk: report.hiring_risk,
        strengths: report.strengths,
        weaknesses: report.weaknesses,
        questionBreakdown: breakdown
    };
}

