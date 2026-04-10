import { NextRequest, NextResponse } from "next/server";
import { getEmbedding } from "@/lib/openai";
import { queryCandidates } from "@/lib/pinecone";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

const openai = new OpenAI();

export async function POST(req: NextRequest) {
    try {
        // 1. Authenticate and get Org Context
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const orgId = session.orgId;

        const { messages } = await req.json();
        const userMessage = messages[messages.length - 1].content;

        console.log(`[RECRUITER_CHAT]: Org: ${orgId} | User queried: "${userMessage}"`);

        // 2. Generate embedding using last 3 messages for context
        // Prevents "tell me more about him" type queries from failing vector search
        const recentContext = messages
            .slice(-3)
            .map((m: any) => `${m.role === "user" ? "Recruiter" : "Assistant"}: ${m.content}`)
            .join("\n");
        const queryVector = await getEmbedding(recentContext);
        const matches = await queryCandidates(queryVector, 15, { orgId: { "$eq": orgId } });

        // 3. Construct a context block from semantic search
        const context = matches
            .map((match: any) => {
                const meta = match.metadata;
                return `
Candidate: ${meta.fullName}
Role: ${meta.jobTitle}
Data Type: ${meta.type} (Application ID: ${meta.applicationId})
Content: ${meta.contentChunk}
---`;
            })
            .join("\n");

        // 4. Define Tools (Functions) for DB access
        const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
            {
                type: "function",
                function: {
                    name: "get_recruitment_stats",
                    description: "Get high-level counts of drives, live interviews, completed interviews, shortlisted and hired candidates for the organization.",
                    parameters: { type: "object", properties: {} }
                }
            },
            {
                type: "function",
                function: {
                    name: "get_drives_overview",
                    description: "Get all recruitment drives with their status and application counts.",
                    parameters: { type: "object", properties: {} }
                }
            },
            {
                type: "function",
                function: {
                    name: "get_top_candidates",
                    description: "Get the top scoring candidates for a specific drive, sorted by AI score descending.",
                    parameters: {
                        type: "object",
                        properties: {
                            driveId: { type: "string", description: "The drive ID to fetch candidates for. Use 'all' for all drives." },
                            limit: { type: "number", description: "Number of top candidates to return (default 10)" }
                        },
                        required: ["driveId"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "get_candidates_by_status",
                    description: "Get candidates filtered by hiring status or resume status.",
                    parameters: {
                        type: "object",
                        properties: {
                            hiringStatus: { type: "string", enum: ["pending", "shortlisted", "rejected", "hired", "not hired"], description: "Filter by hiring status" },
                            resumeStatus: { type: "string", enum: ["pending", "shortlisted", "rejected"], description: "Filter by resume/AI screening status" },
                            driveId: { type: "string", description: "Optional: filter to a specific drive" }
                        }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "get_candidate_detail",
                    description: "Get full details of a specific candidate by application ID including score, statuses, and interview info.",
                    parameters: {
                        type: "object",
                        properties: {
                            applicationId: { type: "string", description: "The application ID" }
                        },
                        required: ["applicationId"]
                    }
                }
            }
        ];

        const systemPrompt = `You are Ishita Intelligence — an elite AI recruiter assistant built for this organization's hiring team.
Your goal is to help recruiters find the best candidates, track their pipeline, and make faster hiring decisions.

### PIPELINE STAGES (how this system works):
1. **Applied** → Candidate submits application with resume
2. **AI Screened** → Resume scored 0–100 against JD. Above threshold = Shortlisted, below = Rejected (resumeStatus)
3. **Interview** → Shortlisted candidates get an AI video interview link (interviewStatus: pending → in_progress → finished)
4. **Hired / Not Hired** → Recruiter makes final decision (hiringStatus)

### STATUS VALUES:
- resumeStatus: "pending" | "shortlisted" | "rejected"
- interviewStatus: "pending" | "inprogress" | "finished"
- hiringStatus: "pending" | "shortlisted" | "rejected" | "hired" | "not hired"
- aiScore: 0–100 (AI screening score vs job requirements)

### CAPABILITIES:
1. **Semantic Search**: You have resume text, interview transcripts, AI summaries, and AI reports indexed for all candidates.
2. **Live DB Tools**: Use tools to get real-time stats, top candidates, pipeline counts, and candidate details.

### RESPONSE RULES:
- Use bold headings for every section (### Heading)
- Use bullet points for lists, never long paragraphs
- Always cite Candidate Name + Application ID when referring to a person
- If asked about scores, always show the number (e.g. "Score: 78/100")
- If no data found, say so clearly — never make up candidate info

### DATA ISOLATION:
You are strictly scoped to Organization ID: ${orgId}. Never reference data outside this org.

### SEMANTIC CONTEXT (most relevant candidates for this query):
${context || "No direct semantic matches found for this query."}
`;

        // 5. initial LLM Call
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                ...messages
            ],
            tools,
            temperature: 0.5,
        });

        const responseMessage = response.choices[0].message;

        // 6. Handle Tool Calls if any
        if (responseMessage.tool_calls) {
            const toolMessages = [
                { role: "system", content: systemPrompt },
                ...messages,
                responseMessage
            ];

            for (const toolCall of responseMessage.tool_calls) {
                const functionName = (toolCall as any).function.name;
                let toolResult = "";

                console.log(`[CHAT_TOOLS]: Executing ${functionName} for Org ${orgId}`);

                if (functionName === "get_recruitment_stats") {
                    const driveCount = await prisma.drive.count({ where: { orgId } });
                    const liveInterviewCount = await prisma.interview.count({ 
                        where: { status: "IN_PROGRESS", application: { drive: { orgId } } } 
                    });
                    const completedInterviewCount = await prisma.interview.count({ 
                        where: { status: "COMPLETED", application: { drive: { orgId } } } 
                    });
                    toolResult = JSON.stringify({ 
                        totalDrives: driveCount, 
                        liveInterviews: liveInterviewCount, 
                        completedInterviews: completedInterviewCount 
                    });
                } else if (functionName === "get_drives_overview") {
                    const drives = await prisma.drive.findMany({
                        where: { orgId },
                        select: {
                            id: true,
                            title: true,
                            status: true,
                            deadline: true,
                            createdAt: true,
                            _count: { select: { applications: true } }
                        },
                        orderBy: { createdAt: "desc" }
                    });
                    toolResult = JSON.stringify(drives);

                } else if (functionName === "get_top_candidates") {
                    const args = JSON.parse((toolCall as any).function.arguments || "{}");
                    const limit = args.limit || 10;
                    const whereClause: any = {
                        drive: { orgId },
                        aiScore: { not: null }
                    };
                    if (args.driveId && args.driveId !== "all") {
                        whereClause.driveId = args.driveId;
                    }
                    const candidates = await prisma.application.findMany({
                        where: whereClause,
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                            aiScore: true,
                            resumeStatus: true,
                            hiringStatus: true,
                            interviewStatus: true,
                            drive: { select: { title: true } }
                        },
                        orderBy: { aiScore: "desc" },
                        take: limit
                    });
                    toolResult = JSON.stringify(candidates);

                } else if (functionName === "get_candidates_by_status") {
                    const args = JSON.parse((toolCall as any).function.arguments || "{}");
                    const whereClause: any = { drive: { orgId } };
                    if (args.hiringStatus) whereClause.hiringStatus = args.hiringStatus;
                    if (args.resumeStatus) whereClause.resumeStatus = args.resumeStatus;
                    if (args.driveId) whereClause.driveId = args.driveId;
                    const candidates = await prisma.application.findMany({
                        where: whereClause,
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                            aiScore: true,
                            resumeStatus: true,
                            hiringStatus: true,
                            interviewStatus: true,
                            drive: { select: { title: true } }
                        },
                        orderBy: { createdAt: "desc" },
                        take: 20
                    });
                    toolResult = JSON.stringify(candidates);

                } else if (functionName === "get_candidate_detail") {
                    const args = JSON.parse((toolCall as any).function.arguments || "{}");
                    const candidate = await prisma.application.findUnique({
                        where: { id: args.applicationId },
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                            phone: true,
                            aiScore: true,
                            resumeStatus: true,
                            hiringStatus: true,
                            interviewStatus: true,
                            experienceYears: true,
                            relevantYears: true,
                            createdAt: true,
                            drive: { select: { title: true, orgId: true } },
                            interview: {
                                select: {
                                    status: true,
                                    aiSummary: true,
                                    completedAt: true
                                }
                            }
                        }
                    });
                    // Security: ensure candidate belongs to this org
                    if (candidate && candidate.drive.orgId !== orgId) {
                        toolResult = JSON.stringify({ error: "Not found" });
                    } else {
                        toolResult = JSON.stringify(candidate);
                    }
                }

                toolMessages.push({
                    role: "tool" as any,
                    tool_call_id: toolCall.id,
                    content: toolResult
                });
            }

            const secondResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: toolMessages as any,
                temperature: 0.5,
            });

            return NextResponse.json(secondResponse.choices[0].message);
        }

        return NextResponse.json(responseMessage);

    } catch (error: any) {
        console.error("[RECRUITER_CHAT_ERROR]:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
