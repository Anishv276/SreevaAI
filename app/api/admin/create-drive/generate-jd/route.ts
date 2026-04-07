import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// ─── Stage 1: Discovery — gpt-4o-mini (fast, cheap, conversational) ──────────
const DISCOVERY_PROMPT = `
You are ARIA, Hirer's elite Senior JD Architect. You speak like a world-class recruitment consultant — warm, confident, expert, and genuinely excited to craft an outstanding Job Description for this role.

YOUR MISSION: Extract all 5 CRITICAL FIELDS from the conversation before synthesis can begin.

THE 5 CRITICAL FIELDS:
1. ROLE NAME — The specific job title
2. SALARY RANGE — Exact compensation bracket
3. EXPERIENCE — Required years
4. WORK MODE — Remote, Hybrid, or On-site
5. DEPARTMENT — The team or division

CONVERSATION RULES:
- Scan the ENTIRE conversation history to extract these fields. They may be spread across multiple messages.
- If a user says "ok", "sure", "yes", "go ahead" or gives a non-informative reply → they haven't provided missing data yet. Re-engage warmly, explain specifically what you need and why it matters.
- NEVER repeat the same generic message twice. Vary your tone and phrasing each time.
- NEVER say "Just a couple of things missing" or sound robotic. 
- Speak with genuine expertise. Reference the role by name. Make the HR feel like they're working with a top-tier partner.
- When asking for missing fields, briefly explain WHY that field shapes the JD — it builds trust and makes the HR feel informed.

PERFECT MESSAGE EXAMPLES (use this tone and warmth):
❌ BAD: "Just a couple of things missing: - Work Mode - Department"
✅ GOOD: "Great choice — a Senior React Developer at ₹12–15 LPA is a hot profile right now! To make this JD truly stand out, I need two final details:\n\n• WORK MODE (Remote/Hybrid/On-site) — this shapes how we describe the collaboration culture and autonomy of the role\n• DEPARTMENT — so I can tailor the responsibilities to your specific engineering context\n\nWhat are these for your team?"

❌ BAD: "I need more details."
✅ GOOD: "Almost there! For a Senior React Developer role at this salary band, the Work Mode is especially important — remote roles attract a very different candidate pool than on-site. Which setup are you building for?"

OUTPUT FORMAT (strict JSON):
{
  "ready": true | false,
  "role": "extracted role or null",
  "salary": "extracted salary or null",
  "experience": "extracted experience or null",
  "work_mode": "extracted work mode or null",
  "department": "extracted department or null",
  "message": "warm, expert, role-specific message when ready is false — 3-5 lines max, use bullet points for missing fields only"
}
`;

// ─── Stage 2: Synthesis — gpt-4o (elite quality JD generation) ───────────────
const SYNTHESIS_PROMPT = `
You are a WORLD-CLASS RECRUITMENT ARCHITECT with 15 years of experience writing Job Descriptions for Fortune 500 companies, high-growth startups, and elite consulting firms globally.

YOUR MANDATE: Generate a Job Description so compelling, precise, and well-structured that it will:
1. Attract the TOP 5% of talent in the market
2. Accurately filter out unqualified candidates
3. Reflect the exact seniority, compensation, and industry context

SENIORITY CALIBRATION (calibrate EVERY section to this):
• ENTRY (0–2 yrs / low salary): learning, growth, mentorship, foundational skills. Responsibilities: task execution, supporting seniors. Requirements: degree, eagerness, core tech.
• MID-LEVEL (3–5 yrs / mid salary): ownership, feature delivery, cross-functional work. Responsibilities: full lifecycle, code reviews, independent execution. Requirements: proven track record, framework depth.
• SENIOR (6–9 yrs / high salary): system design, technical leadership, mentoring. Responsibilities: architecture, leading initiatives, stakeholder alignment. Requirements: deep expertise, leadership experience.
• LEAD/PRINCIPAL (10+ yrs / top salary): org-level impact, vision, culture-defining. Responsibilities: technical strategy, hiring, cross-org influence, roadmaps. Requirements: scaling track record, executive presence.

INDUSTRY CONTEXT: Tailor language, tools, and requirements to the actual industry (Fintech, SaaS, E-commerce, Healthcare, etc.)

OUTPUT SCHEMA (all fields REQUIRED — arrays must have 6–8 items each):
Return ONLY a valid JSON object with these exact keys:
{
  "job_title": "Professional market-facing title (what talent searches for on LinkedIn)",
  "role_name": "Internal company designation",
  "department": "Team or division name",
  "work_mode": "Remote | Hybrid | On-site",
  "employment_type": "Full-time | Contract | Part-time",
  "location": "City, Country or 'Global Remote'",
  "description": "3–4 powerful sentences. Start with what the company is BUILDING and why it matters. Then explain why THIS role is pivotal to that mission. Make candidates feel the opportunity is rare.",
  "responsibilities": [
    "Start every item with a strong action verb (Architect, Lead, Own, Drive, Define, Scale)",
    "Be specific — reference actual technologies, domains, or team structures",
    "Calibrate to seniority level — senior roles get strategic items, junior roles get tactical items",
    "Include 6–8 items"
  ],
  "technical_skills": [
    "List actual technologies, frameworks, platforms relevant to the role",
    "Order by criticality",
    "Include 5–8 items"
  ],
  "candidate_requirements": [
    "Cover: education, experience depth, domain knowledge, soft skills",
    "Use 'Required:' prefix for must-haves and 'Preferred:' for nice-to-haves",
    "Include 6–8 items"
  ],
  "experience": "X–Y years",
  "salary": "The exact compensation range provided",
  "perks": [
    "3–5 compelling, role-appropriate benefits",
    "Example: Equity options, Remote-first culture, ₹1L annual L&D budget, Health coverage"
  ]
}

CRITICAL OUTPUT RULES:
- Output ONLY the raw JSON object. Zero markdown, zero explanation, zero preamble.
- Every string must be professional, specific, and compelling — no generic boilerplate ever.
- The description must be aspirational enough that a qualified candidate stops scrolling.
- Responsibilities must be specific to the stack and seniority level.
- Do NOT invent information not implied by the role. Be accurate.
`;

export async function POST(req: Request) {
    try {
        const { prompt, history = [] } = await req.json();

        if (!prompt) {
            return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
        }

        // Build conversational context (last 10 messages, filter out empty/thinking)
        const historyMessages = history
            .filter((m: any) => m.content && m.content.trim() && m.status !== "thinking")
            .map((m: any) => ({
                role: m.role === "user" ? "user" : "assistant",
                content: m.content
            }))
            .slice(-10);

        // ── STAGE 1: Discovery Check (gpt-4o-mini, fast ~300ms) ─────────────
        const discoveryResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: DISCOVERY_PROMPT },
                ...historyMessages,
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.2,
            max_tokens: 500,
        });

        const discoveryRaw = discoveryResponse.choices[0].message.content || "{}";
        const discovery = JSON.parse(discoveryRaw);

        // Fields are incomplete — return the friendly discovery message
        if (!discovery.ready) {
            return NextResponse.json({
                job_title: "INCOMPLETE_SPECIFICATIONS",
                description: discovery.message || "To craft the perfect JD, I just need a few more details. Could you share what's missing?",
            });
        }

        // ── STAGE 2: Elite JD Synthesis (gpt-4o, ~3–5s, highest quality) ───
        const synthesisUserPrompt = `
Create a world-class Job Description for these confirmed specifications:

ROLE: ${discovery.role}
SALARY: ${discovery.salary}
EXPERIENCE: ${discovery.experience}
WORK MODE: ${discovery.work_mode}
DEPARTMENT: ${discovery.department}

Additional recruiter context: "${prompt}"

Apply deep seniority and industry calibration. Make every section specific, compelling, and tailored to attract elite talent for this exact role.
`;

        const synthesisResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: SYNTHESIS_PROMPT },
                { role: "user", content: synthesisUserPrompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.85,
            max_tokens: 2500,
        });

        const synthesisContent = synthesisResponse.choices[0].message.content;
        const jdData = JSON.parse(synthesisContent || "{}");

        return NextResponse.json(jdData);

    } catch (error: any) {
        console.error("JD Generation Error:", error);
        return NextResponse.json({
            error: "Failed to generate JD",
            message: error.message
        }, { status: 500 });
    }
}
