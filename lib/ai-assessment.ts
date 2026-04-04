import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export interface GeneratedQuestion {
    text: string;
    type: "MCQ" | "MAQ" | "TEXT" | "CODING";
    intent?: string;
    options?: string[];
    correctAnswer?: string;
    starterCode?: string;
    testCases?: string;
}

export async function generatePersonalizedAssessment({
    resumeData,
    jdData,
    count = 5,
    difficulty = "Medium",
    types = "MIXED"
}: {
    resumeData: any;
    jdData: any;
    count?: number;
    difficulty?: string;
    types?: string;
}): Promise<GeneratedQuestion[]> {
    console.log(`[AI-ASSESSMENT] Generating ${count} questions (${difficulty}) for candidate.`);

    const isNonCoding = types === 'TEXT' || types === 'MCQ';
    
    const prompt = `
You are a senior technical interviewer at a top-tier engineering company.

Your goal is NOT to generate generic questions.
Your goal is to DESIGN an interview that exposes the candidate's real ability.

---

### JOB REQUIREMENTS:
${JSON.stringify(jdData, null, 2)}

### CANDIDATE PROFILE:
${JSON.stringify(resumeData, null, 2)}

---

### INTERNAL ANALYSIS (DO NOT OUTPUT):

Silently identify:
- Top 3 critical skills from JD (must_have)
- Candidate strengths (matching skills/projects)
- Candidate gaps (missing or weak areas)

Use this analysis to design the interview.

---

### INTERVIEW DESIGN STRATEGY:

You must behave like a real interviewer who:

1. Identifies:
   - What the job truly demands
   - What the candidate CLAIMS to know
   - Where the gaps likely exist

2. Designs questions that:
   - Validate real experience (not theory)
   - Break shallow understanding
   - Force reasoning, not memorization
   - Simulate real-world scenarios

---

### QUESTION DISTRIBUTION (STRICT):

Generate EXACTLY:
- ${Math.floor(count * 0.7)} MCQ/MAQ questions
- ${Math.max(1, Math.floor(count * 0.2))} TEXT questions
- ${isNonCoding ? 0 : Math.max(1, count - Math.floor(count * 0.7) - Math.max(1, Math.floor(count * 0.2)))} CODING questions

Do NOT deviate from this distribution.

---

### QUESTION QUALITY RULES:

- Every question must feel personalized to this candidate.
- Difficulty Target: Calibrated for ${jdData?.experience?.min_years || 0} years experience (${difficulty}).
- Avoid generic textbook questions.

Prefer:
- "Why did you…"
- "What would happen if…"
- "How would you handle…"

---

### DIFFICULTY CALIBRATION (STRICT):

Difficulty level: ${difficulty}

Apply these definitions strictly:

- EASY:
  - Focus on fundamentals and clarity
  - Questions must be direct and guided
  - No complex edge cases or system design
  - MCQs should test basic understanding

- MEDIUM:
  - Focus on real-world application
  - Include debugging scenarios and tradeoffs
  - Require applied knowledge, not definitions
  - MCQs must include scenario-based reasoning

- HARD:
  - Focus on system design, scalability, and architecture
  - Include edge cases, failure handling, and tradeoffs
  - Require deep reasoning and multi-step thinking
  - MCQs must simulate real production scenarios

IMPORTANT:
- Every question MUST strictly match the selected difficulty.
- If a question is too easy or too hard, adjust it before output.

---

### PERSONALIZATION ENFORCEMENT:

- At least 2 questions MUST reference:
  - candidate skills OR
  - candidate projects

- At least 1 TEXT question MUST reference a specific project from the candidate's projects.

---

### MUST-HAVE SKILL COVERAGE:

- At least 50% of questions must target:
${jdData?.skills?.must_have?.join(', ') || 'Core Role Skills'}

---

### GAP EXPOSURE:

- If a must-have skill is missing:
→ Generate a question to test conceptual understanding

---

### MCQ / MAQ QUALITY RULES (STRICT):

- Must NOT be definition-based.
- Must test:
  - real-world scenarios
  - edge cases
  - decision-making

- At least 2 MCQs must follow formats like:
  "What would happen if..."
  "Which scenario is most likely..."

Bad example:
❌ What is Node.js?

Good example:
✅ Which scenario would most likely cause a memory leak in a Node.js application?

---

### MCQ SIGNAL STRENGTH (CRITICAL):

- Each MCQ must have ONLY ONE clearly correct answer.
- Wrong options must be realistic and confusing (not obvious).
- At least 2 options should represent common mistakes developers make.

---

### CODING QUESTIONS (IF INCLUDED):

- Must align with JD must-have technologies.
- Must simulate real job tasks (API, backend, data flow).

Each coding question MUST include:
- Problem statement
- Constraints or expectations
- starterCode
- EXACTLY 3 testCases

testCases MUST be valid JSON string:
[
  { "input": "...", "expectedOutput": "..." },
  { "input": "...", "expectedOutput": "..." },
  { "input": "...", "expectedOutput": "..." }
]

---

### OUTPUT FORMAT (STRICT JSON):

{
  "questions": [
    {
      "text": string,
      "type": "MCQ" | "MAQ" | "TEXT" | "CODING",
      "intent": "What this question is testing and why",
      "difficulty": "${difficulty}",
      "options": string[] | null,
      "correctAnswer": string | null,
      "starterCode": string | null,
      "testCases": string | null
    }
  ]
}

---

### VALIDATION CHECK (MANDATORY):

Before returning:
- Ensure distribution is EXACT.
- Ensure personalization is present.
- Ensure MCQs are non-trivial.
- Ensure no generic questions exist.

If any condition fails, regenerate internally.

---

### FINAL INSTRUCTION:

Ask yourself:
“If I were hiring for this role, would these questions help me confidently decide?”

If not, improve them.

Return ONLY valid JSON.
`;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a specialized hiring assistant that generates personalized, high-quality technical and role-specific assessment questions." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content;
        if (!content) throw new Error("Empty AI response");

        const parsed = JSON.parse(content);
        // The AI might return { "questions": [...] } or just [...]
        const questions = Array.isArray(parsed) ? parsed : (parsed.questions || []);
        
        return questions.slice(0, count);

    } catch (error) {
        console.error("[AI-ASSESSMENT ERROR]:", error);
        // Return fallback questions if AI fails
        return [
            {
                text: "Based on the job description, what is your approach to handling high-pressure project deadlines?",
                type: "TEXT"
            },
            {   
                text: "Describe a complex technical challenge you faced in your previous role and how you overcame it.",
                type: "TEXT"
            }
        ];
    }
}
