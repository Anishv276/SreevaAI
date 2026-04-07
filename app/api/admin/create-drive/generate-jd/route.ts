import { NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// ─── Stage 1: Discovery — gpt-4o-mini (fast, conversational) ─────────────────
const DISCOVERY_PROMPT = `
You are ARIA, Hirer's elite Senior JD Architect. You speak like a world-class recruitment consultant — warm, confident, expert, genuinely excited to craft an outstanding Job Description.

YOUR MISSION: Extract 5 CRITICAL FIELDS before synthesis begins. Company context is automatically provided from the organization profile — you do NOT need to ask for it.

THE 5 CRITICAL FIELDS (must have all 5):
1. ROLE NAME — The specific job title
2. SALARY RANGE — Exact compensation bracket
3. EXPERIENCE — Required years
4. WORK MODE — Remote, Hybrid, or On-site
5. DEPARTMENT — The team or division

CONVERSATION RULES:
- Scan the ENTIRE conversation history. Fields may appear across multiple messages.
- If a user says "ok", "sure", "yes", "go ahead" without providing missing data: re-engage warmly.
- NEVER repeat the same message twice. Vary your tone each time.
- NEVER say "Just a couple of things missing" — sounds robotic.
- Reference the role by name. Make HR feel like they're working with an expert partner.
- Briefly explain WHY each missing field shapes the JD — builds trust.
- Once all 5 fields are confirmed, set ready to true immediately.

EXAMPLE (use this tone):
"Great choice — a Senior React Developer at 12-15 LPA is a hot profile! To make this JD stand out, I need:\n\n• WORK MODE (Remote/Hybrid/On-site) — shapes how we describe collaboration culture\n• DEPARTMENT — so I can tailor responsibilities to your specific context\n\nWhat are these for your team?"

OUTPUT FORMAT (strict JSON only):
{
  "ready": true | false,
  "role": "extracted role or null",
  "salary": "extracted salary or null",
  "experience": "extracted experience or null",
  "work_mode": "extracted work mode or null",
  "department": "extracted department or null",
  "message": "warm expert message when ready is false — 3-5 lines, bullet points for missing fields only"
}
`;

// ─── Stage 2: Synthesis — gpt-4o (elite JD generation) ───────────────────────
const SYNTHESIS_PROMPT = `
You are a WORLD-CLASS RECRUITMENT ARCHITECT with 15 years of experience writing Job Descriptions for Fortune 500 companies, high-growth startups, and elite consulting firms globally.

YOUR MANDATE: Write a Job Description that attracts the TOP 5% of talent. You have been provided complete company intelligence — use it to make every section specific, credible, and compelling.

SENIORITY CALIBRATION (apply to EVERY section):
- ENTRY (0-2 yrs): foundational skills, learning mindset, task execution, supporting seniors.
- MID-LEVEL (3-5 yrs): ownership, independent execution, cross-functional work, full feature lifecycle.
- SENIOR (6-9 yrs): system design, technical leadership, mentoring, stakeholder alignment.
- LEAD/PRINCIPAL (10+ yrs): org-level impact, hiring, technical strategy, culture-defining.

WRITING RULES — STRICTLY ENFORCED:
- BANNED PHRASES: "dynamic team", "revolutionize", "passionate", "cutting-edge", "fast-paced", "synergy", "leverage", "innovative solutions", "empower", "game-changing", "join our journey", "world-class team"
- Description must NOT start with "Join our" or "We are looking for"
- USE THE COMPANY CONTEXT PROVIDED — reference the company name, industry, location, and size to write a description that feels authentic and specific to this exact organization
- Every responsibility must start with a strong action verb: Architect, Lead, Own, Build, Define, Drive, Scale, Optimize, Establish, Analyze

OUTPUT SCHEMA (all fields REQUIRED — arrays: 6-8 items each):
Return ONLY a valid JSON object:
{
  "job_title": "Professional LinkedIn-searchable title",
  "role_name": "Internal designation",
  "department": "Team or division",
  "work_mode": "Remote | Hybrid | On-site",
  "employment_type": "Full-time | Contract | Part-time",
  "location": "Use the company location if available, otherwise Global Remote",
  "description": "3-4 sentences using company context. What does THIS company specifically build or do? Why does this role exist right now in their growth? What will the hire own or drive? Make it feel like a real, specific opportunity.",
  "responsibilities": ["6-8 action-verb-led, role-specific items calibrated to seniority — reference the company's industry context where relevant"],
  "technical_skills": ["5-8 specific tools, frameworks, platforms ordered by importance for this role and industry"],
  "candidate_requirements": ["6-8 bullets with Required:/Preferred: prefixes — education, experience, domain expertise, soft skills"],
  "experience": "VERBATIM from recruiter input — do not rephrase or change",
  "salary": "VERBATIM from recruiter input — do not rephrase or change",
  "perks": ["3-5 role-appropriate specific benefits — calibrate to work mode and company size"]
}

CRITICAL RULES:
- Output ONLY raw JSON. No markdown, no explanation, no preamble.
- Experience and salary must exactly match recruiter input — verbatim.
- No clichés. Every sentence earns its place.
- The description must be specific to this company — not a generic template.
`;

export async function POST(req: Request) {
    try {
        const { prompt, history = [] } = await req.json();

        if (!prompt) {
            return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
        }

        // ── Fetch organization context from DB ────────────────────────────────
        let orgContext = "";
        try {
            const session = await getSession();
            if (session?.orgId) {
                const org = await prisma.organization.findUnique({
                    where: { id: session.orgId },
                    select: {
                        name: true,
                        industry: true,
                        size: true,
                        website: true,
                        location: true,
                    },
                });

                if (org) {
                    const parts = [
                        `Company Name: ${org.name}`,
                        org.industry ? `Industry: ${org.industry}` : null,
                        org.size ? `Company Size: ${org.size} employees` : null,
                        org.location ? `HQ Location: ${org.location}` : null,
                        org.website ? `Website: ${org.website}` : null,
                    ].filter(Boolean);
                    orgContext = parts.join("\n");
                }
            }
        } catch (e) {
            // Non-blocking — if org fetch fails, continue without it
            console.warn("Could not fetch org context:", e);
        }

        // ── Build conversational history ──────────────────────────────────────
        const historyMessages = history
            .filter((m: any) => m.content && m.content.trim() && m.status !== "thinking")
            .map((m: any) => ({
                role: m.role === "user" ? "user" : "assistant",
                content: m.content,
            }))
            .slice(-10);

        // ── STAGE 1: Discovery Check (gpt-4o-mini, fast ~300ms) ──────────────
        const discoveryResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: DISCOVERY_PROMPT },
                ...historyMessages,
                { role: "user", content: prompt },
            ],
            response_format: { type: "json_object" },
            temperature: 0.2,
            max_tokens: 500,
        });

        const discoveryRaw = discoveryResponse.choices[0].message.content || "{}";
        const discovery = JSON.parse(discoveryRaw);

        // Not all fields collected yet — return friendly discovery message
        if (!discovery.ready) {
            return NextResponse.json({
                job_title: "INCOMPLETE_SPECIFICATIONS",
                description: discovery.message || "To craft the perfect JD, I just need a few more details.",
            });
        }

        // ── STAGE 2: Elite JD Synthesis (gpt-4o, ~4-6s, highest quality) ────
        const synthesisUserPrompt = `
Create a world-class Job Description using the following confirmed specifications and company intelligence:

=== ROLE SPECIFICATIONS ===
ROLE: ${discovery.role}
SALARY: ${discovery.salary}
EXPERIENCE: ${discovery.experience}
WORK MODE: ${discovery.work_mode}
DEPARTMENT: ${discovery.department}

=== COMPANY INTELLIGENCE (use this to make the JD specific and authentic) ===
${orgContext || "Company context not available — write a credible role-focused description without fabricating company details."}

=== ADDITIONAL RECRUITER CONTEXT ===
"${prompt}"

Apply deep seniority calibration. Use the company intelligence to make the executive summary, responsibilities, and perks feel specific to this organization — not generic. Experience and salary must appear verbatim.
`;

        const synthesisResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: SYNTHESIS_PROMPT },
                { role: "user", content: synthesisUserPrompt },
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
            message: error.message,
        }, { status: 500 });
    }
}
