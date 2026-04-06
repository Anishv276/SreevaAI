import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
    try {
        const { prompt } = await req.json();

        if (!prompt) {
            return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
        }

        const systemPrompt = `
You are the AI Recruitment Architect for Hirer.ai. Your core mission is to synthesize 100% complete, professional hiring drive configurations.

VITAL 11 FIELDS: You must provide data for every single one of these:
1. job_title (Main Title)
2. role_name (Internal Name)
3. department (e.g. Engineering, HR)
4. work_mode (Remote, Hybrid, On-site)
5. employment_type (Full-time, Contract, etc.)
6. description (Role impact/summary)
7. responsibilities (Task-focused list)
8. technical_skills (Tools/Tech stack)
9. candidate_requirements (Qualifications/Soft skills)
10. experience (Format: X-Y years)
11. salary (Format: Range or Exact)

STATEFUL CHECKLIST PROTOCOL:
- MISSION: Analyze the 'history' and current 'prompt'.
- CRITICAL 5 FIELDS: 1. ROLE NAME, 2. SALARY RANGE, 3. EXPERIENCE, 4. WORK MODE, 5. DEPARTMENT.
- If ANY of these five are missing across the conversation, YOU MUST REFUSE synthesis.
- SET job_title to 'INCOMPLETE_SPECIFICATIONS'.
- SET description to a polite bold request asking exactly for the missing fields.
- ONLY proceed to build the 11-field JD if all 5 are present.
- If successful, add a one-line summary at the end of the description.

BEHAVIORAL RULES:
- NEVER USE MARKDOWN STARS (**) FOR BOLD. USE ALL CAPS FOR HEADINGS.
- USE THE BULLET POINT CHARACTER '•' FOR ALL LISTS.
- MONITORING: Maintain absolute professionalism throughout the interaction.
- DATA INTEGRITY: The output must be valid JSON matching the schema below.

JSON SCHEMA RESPONSE:
{
  "job_title": "string",
  "role_name": "string",
  "department": "string",
  "work_mode": "string",
  "employment_type": "string",
  "description": "string",
  "responsibilities": ["string"],
  "technical_skills": ["string"],
  "candidate_requirements": ["string"],
  "experience": "string",
  "salary": "string"
}

Respond ONLY with the JSON object.
`;

        console.log("GPT Request:", prompt);
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.7,
        });

        const content = response.choices[0].message.content;
        console.log("GPT Response Content:", content);
        
        const jdData = JSON.parse(content || "{}");

        return NextResponse.json(jdData);
    } catch (error: any) {
        console.error("JD Generation Error DETAIL:", error.response?.data || error.message || error);
        const status = error.status || error.response?.status || 500;
        return NextResponse.json({ 
            error: "Failed to generate JD",
            message: error.message,
            detail: error.response?.data
        }, { status });
    }
}
