import { NextRequest, NextResponse } from "next/server";
import { getEmbedding } from "@/lib/openai";
import { queryCandidates } from "@/lib/pinecone";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordOrgBillingFromOpenAICompletion } from "@/lib/usage-metrics";
import OpenAI from "openai";

const openai = new OpenAI();

// -----------------------------------------------------------------------------
// STATUS NORMALISATION - exact DB casing
// -----------------------------------------------------------------------------
function normalizeResumeStatus(s: string): string {
  const map: Record<string, string> = {
    pending: "pending", shortlisted: "SHORTLISTED", rejected: "REJECTED",
  };
  return map[s.toLowerCase()] ?? s;
}
function normalizeHiringStatus(s: string): string {
  const map: Record<string, string> = {
    pending: "pending", shortlisted: "Shortlisted",
    "not shortlisted": "Not Shortlisted", hired: "Hired", "not hired": "Not Hired",
  };
  return map[s.toLowerCase()] ?? s;
}

// -----------------------------------------------------------------------------
// parseStructuredResume - converts raw JSON blob to clean LLM-readable object
// -----------------------------------------------------------------------------
function parseStructuredResume(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    const sr = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      technicalSkills: sr.skills?.technical?.map((s: any) => s.skill).filter(Boolean) ?? [],
      tools:           sr.skills?.tools?.map((t: any) => t.tool).filter(Boolean) ?? [],
      domainSkills:    sr.skills?.domain_skills?.map((d: any) => d.skill ?? d).filter(Boolean) ?? [],
      softSkills:      sr.skills?.soft_skills?.map((s: any) => s.skill ?? s).filter(Boolean) ?? [],
      keywords:        sr.keywords ?? [],
      experience: {
        totalYears:     sr.experience?.total_years,
        seniorityLevel: sr.experience?.seniority_level,
        currentRole:    sr.current_role,
        currentCompany: sr.current_company,
      },
      education: sr.education?.map((e: any) => ({
        degree: e.degree, field: e.field, institution: e.institution, year: e.year,
      })) ?? [],
      projects: sr.projects?.map((p: any) => ({
        name: p.name, description: p.description, technologies: p.technologies,
      })) ?? [],
      workHistory: sr.work_history?.map((w: any) => ({
        company: w.company, role: w.role, duration: w.duration,
      })) ?? [],
      careerSummary: sr.candidate_summary,
      location: sr.location
        ? `${sr.location.city ?? ""}, ${sr.location.state ?? ""}, ${sr.location.country ?? ""}`.replace(/^,\s*|,\s*$/g, "").trim()
        : null,
      redFlags: sr.red_flags ?? [],
      careerProgression: sr.career_progression?.analysis,
    };
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    // -- 1. Auth --------------------------------------------------------------
    const session = await getSession();
    if (!session?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const orgId = session.orgId;

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        name: true,
        industry: true,
        size: true,
        plan: true,
        llmProvider: true,
        llmModel: true,
      },
    });
    const orgOpenAIModel =
      (org?.llmProvider || "OPENAI") === "OPENAI" && org?.llmModel
        ? org.llmModel
        : "gpt-4o-mini";

    const { messages } = await req.json();
    const userMessage = messages[messages.length - 1]?.content ?? "";
    console.log(`[RECRUITER_CHAT]: Org: ${org?.name ?? orgId} | Query: "${userMessage}"`);

    // -- 2. Semantic Search (Pinecone) ----------------------------------------
    let semanticContext = "";
    try {
      const recentContext = messages.slice(-3)
        .map((m: any) => `${m.role === "user" ? "Recruiter" : "Assistant"}: ${m.content}`)
        .join("\n");
      const queryVector = await getEmbedding(recentContext);
      const matches = await queryCandidates(queryVector, 15, { orgId: { $eq: orgId } });
      semanticContext = matches.map((match: any) => {
        const meta = match.metadata;
        return `Candidate: ${meta.fullName} | Role: ${meta.jobTitle} | Type: ${meta.type} | AppID: ${meta.applicationId}\nContent: ${meta.contentChunk}\n---`;
      }).join("\n");
    } catch { /* Pinecone optional */ }

    // -- 3. Tool Definitions --------------------------------------------------
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "get_recruitment_stats",
          description: "Get real-time TOTAL counts: total candidates, drives, live interviews, completed interviews, shortlisted, rejected, hired, pending. Call this for ANY question about counts, totals, 'how many', pipeline overview, or dashboard summary.",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function",
        function: {
          name: "get_candidate_counts_by_status",
          description: "Detailed breakdown: resumeStatus, interviewStatus, and hiringStatus counts. Use for funnel analysis, 'how many shortlisted', 'how many passed AI screen', 'how many hired'.",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function",
        function: {
          name: "get_drives_overview",
          description: "List all recruitment drives with title, department, status, deadline, screening threshold, interview enabled flag, and application count. Use for 'show drives', 'active jobs', 'open positions', 'which drives are closing'.",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function",
        function: {
          name: "get_drive_by_name",
          description: "Search for a specific drive by title/name. Use when recruiter mentions a job title or drive name like 'Oracle Fusion drive', 'Backend Engineer role', etc.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "Drive title or partial name to search for." },
            },
            required: ["name"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_candidates_for_drive",
          description: "Get all candidates for a specific drive by drive ID or drive name. Use when recruiter asks 'who applied for [role]', 'candidates for oracle drive', etc.",
          parameters: {
            type: "object",
            properties: {
              driveId:   { type: "string", description: "Drive ID (uuid). Use if known." },
              driveName: { type: "string", description: "Drive title/name to search candidates by. Use if driveId is unknown." },
              limit:     { type: "number", description: "Max candidates to return (default 20)." },
            },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_top_candidates",
          description: "Get highest AI-scoring candidates sorted by aiScore descending. Use for 'top candidates', 'best scores', 'highest rated', 'who performed best', 'rank candidates'.",
          parameters: {
            type: "object",
            properties: {
              driveId: { type: "string", description: "Drive ID to filter by, or 'all'." },
              limit:   { type: "number", description: "How many (default 10, max 25)." },
            },
            required: ["driveId"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_candidates_by_status",
          description: "Filter candidates by resumeStatus and/or hiringStatus. Use for 'show shortlisted', 'show rejected', 'who is pending', 'show hired candidates'.",
          parameters: {
            type: "object",
            properties: {
              resumeStatus: { type: "string", description: "pending | shortlisted | rejected" },
              hiringStatus:  { type: "string", description: "pending | shortlisted | not shortlisted | hired | not hired" },
              driveId:       { type: "string", description: "Optional drive ID." },
              limit:         { type: "number", description: "Max records (default 20)." },
            },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "search_candidates_by_name",
          description: "Find a candidate by name. Use for ANY question mentioning a person's name: 'tell me about Durga', 'Durga's skills', 'when did Priya apply', 'show resume of Ravi', 'what is Arjun's score'.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "Full or partial candidate name." },
            },
            required: ["name"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "search_candidates_by_skill",
          description: "Find candidates who have a specific skill, technology, or tool. Use for 'who knows Python', 'find Java developers', 'candidates with AWS experience', 'who has Oracle HCM skills', 'find candidates with SQL'.",
          parameters: {
            type: "object",
            properties: {
              skill: { type: "string", description: "Skill, technology, language, or tool name to search for." },
              limit: { type: "number", description: "Max results (default 10)." },
            },
            required: ["skill"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_candidate_detail",
          description: "Full profile of a candidate by application ID: score, statuses, skills, education, projects, experience, interview summary, AI report.",
          parameters: {
            type: "object",
            properties: {
              applicationId: { type: "string", description: "The cuid application ID." },
            },
            required: ["applicationId"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_avg_scores",
          description: "Get average AI scores, score distribution, and performance statistics. Use for 'average score', 'score distribution', 'how are candidates performing', 'what is the pass rate', 'average interview score'.",
          parameters: {
            type: "object",
            properties: {
              driveId: { type: "string", description: "Optional drive ID to scope. Omit for all drives." },
            },
          },
        },
      },
    ];

    // -- 4. System Prompt -----------------------------------------------------
    const systemPrompt = `You are Ishita Intelligence - the AI recruitment assistant for **${org?.name ?? "this organization"}**.
You have complete, real-time access to the organization's hiring database. Every answer you give is based on LIVE data from tools - never from memory or assumptions.

### ORGANIZATION:
- Name: ${org?.name ?? "Unknown"} | Industry: ${org?.industry ?? "N/A"} | Size: ${org?.size ?? "N/A"} | Plan: ${org?.plan ?? "STARTER"}

---

### TOOL ROUTING - CALL THE RIGHT TOOL FOR EVERY QUESTION:

**PIPELINE & COUNTS:**
| Question | Tool |
|---|---|
| How many candidates? / Total count / Dashboard summary | get_recruitment_stats |
| How many shortlisted / rejected / hired / pending? | get_candidate_counts_by_status |
| Show hiring funnel / pipeline breakdown | get_candidate_counts_by_status |
| What is the interview completion rate? | get_recruitment_stats |

**DRIVES / JOBS:**
| Question | Tool |
|---|---|
| Show all drives / active jobs / open positions | get_drives_overview |
| Which drives are closing soon? / Upcoming deadlines | get_drives_overview |
| Tell me about the [Oracle / Backend / etc.] drive | get_drive_by_name |
| How many applied for [role]? / Candidates for [drive] | get_candidates_for_drive |
| What are the drive requirements / threshold? | get_drive_by_name |

**CANDIDATE SEARCH:**
| Question | Tool |
|---|---|
| Tell me about [Name] / [Name]'s profile | search_candidates_by_name |
| What are [Name]'s skills / education / experience? | search_candidates_by_name |
| When did [Name] apply? / [Name]'s application date | search_candidates_by_name |
| Show [Name]'s resume / resume link | search_candidates_by_name |
| What is [Name]'s score? / Did [Name] pass? | search_candidates_by_name |
| [Name]'s interview status / hiring status | search_candidates_by_name |
| What projects has [Name] done? | search_candidates_by_name |
| Show full details for application ID [id] | get_candidate_detail |

**SKILLS & TECHNOLOGY SEARCH:**
| Question | Tool |
|---|---|
| Who knows [Python / Java / AWS / Oracle]? | search_candidates_by_skill |
| Find candidates with [skill] experience | search_candidates_by_skill |
| Who has [technology] skills? | search_candidates_by_skill |
| Show me [skill] developers | search_candidates_by_skill |

**STATUS FILTERS:**
| Question | Tool |
|---|---|
| Show shortlisted candidates | get_candidates_by_status (resumeStatus=shortlisted) |
| Show rejected candidates | get_candidates_by_status (resumeStatus=rejected) |
| Who is pending screening? | get_candidates_by_status (resumeStatus=pending) |
| Who completed the interview? | get_candidates_by_status (interviewStatus=COMPLETED) |
| Show hired candidates | get_candidates_by_status (hiringStatus=hired) |
| Who was not shortlisted? | get_candidates_by_status (hiringStatus=not shortlisted) |

**RANKINGS & PERFORMANCE:**
| Question | Tool |
|---|---|
| Top candidates / Best scores / Highest rated | get_top_candidates |
| Average score / Pass rate / Score distribution | get_avg_scores |
| Best candidate for [drive] | get_top_candidates (with driveId) |
| Who performed best in interviews? | get_top_candidates |

---

### PIPELINE STAGES:
1. **Applied** -> Candidate submits resume
2. **AI Screened** -> Resume scored 0–100 vs JD -> SHORTLISTED or REJECTED (resumeStatus)
3. **Interview** -> Shortlisted get AI voice interview link -> PENDING -> IN_PROGRESS -> COMPLETED
4. **Decision** -> Recruiter sets hiringStatus: Hired / Not Hired

### EXACT DB STATUS VALUES:
- resumeStatus: "pending" | "SHORTLISTED" | "REJECTED"
- interviewStatus (Application): "pending" | "IN_PROGRESS" | "COMPLETED" | "Not Qualified"
- Interview.status: "PENDING" | "IN_PROGRESS" | "COMPLETED"
- hiringStatus: "pending" | "Shortlisted" | "Not Shortlisted" | "Hired" | "Not Hired"
- aiScore: 0–100

### CANDIDATE DATA FIELDS (from parsedResume):
- technicalSkills -> programming languages (Java, Python, SQL ...)
- tools -> platforms and tools (AWS, Oracle HCM, Excel ...)
- education -> [{degree, field, institution, year}]
- projects -> [{name, description, technologies}]
- experience -> {totalYears, currentRole, currentCompany}
- careerSummary -> one-paragraph AI-generated candidate summary
- location, workHistory, redFlags, keywords

### RESPONSE RULES:
- ALWAYS cite **Candidate Name (App ID: xxx)** when referring to a person
- ALWAYS show resumeUrl as a direct URL when present - NEVER say "not available"
- ALWAYS show createdAt as a readable date (e.g. "April 10, 2026") - NEVER say "not specified"
- ALWAYS read skills from parsedResume.technicalSkills + parsedResume.tools - NEVER say "not listed"
- Show aiScore as "XX/100" - if null, say "Not yet screened"
- Use ### Headings and bullet points - no long paragraphs
- Be warm, professional, and concise
- If 0 results, say exactly that - never say "data unavailable"

### SEMANTIC CONTEXT (most relevant candidates for this query):
${semanticContext || "No semantic matches found - rely on tools for accurate data."}
`;

    // -- 5. First LLM call ----------------------------------------------------
    const response = await openai.chat.completions.create({
      model: orgOpenAIModel,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      tools,
      tool_choice: "auto",
      temperature: 0.2,
    });
    await recordOrgBillingFromOpenAICompletion({
      orgId,
      feature: "chatbot",
      completion: response,
    });

    const responseMessage = response.choices[0].message;

    // -- 6. Execute Tools -----------------------------------------------------
    if (responseMessage.tool_calls?.length) {
      const toolMessages: any[] = [
        { role: "system", content: systemPrompt },
        ...messages,
        responseMessage,
      ];

      for (const toolCall of responseMessage.tool_calls) {
        const fn   = (toolCall as any).function.name;
        const args = JSON.parse((toolCall as any).function.arguments || "{}");
        let result = "";

        console.log(`[CHAT_TOOL]: ${fn}`, args);

        // -- get_recruitment_stats ------------------------------------------
        if (fn === "get_recruitment_stats") {
          const [total, drives, liveInterviews, completedInterviews, shortlisted, rejected, hired, pendingScreening] =
            await Promise.all([
              prisma.application.count({ where: { drive: { orgId } } }),
              prisma.drive.count({ where: { orgId } }),
              prisma.interview.count({ where: { status: "IN_PROGRESS", application: { drive: { orgId } } } }),
              prisma.interview.count({ where: { status: "COMPLETED",   application: { drive: { orgId } } } }),
              prisma.application.count({ where: { drive: { orgId }, resumeStatus: "SHORTLISTED" } }),
              prisma.application.count({ where: { drive: { orgId }, resumeStatus: "REJECTED"    } }),
              prisma.application.count({ where: { drive: { orgId }, hiringStatus: "Hired"        } }),
              prisma.application.count({ where: { drive: { orgId }, resumeStatus: "pending"      } }),
            ]);
          result = JSON.stringify({ totalCandidates: total, totalDrives: drives, liveInterviews, completedInterviews, shortlisted, rejected, hired, pendingScreening });

        // -- get_candidate_counts_by_status ---------------------------------
        } else if (fn === "get_candidate_counts_by_status") {
          const [
            total,
            rPending, rShortlisted, rRejected,
            iPending, iInProgress, iCompleted, iNotQualified,
            hPending, hShortlisted, hNotShortlisted, hHired, hNotHired,
          ] = await Promise.all([
            prisma.application.count({ where: { drive: { orgId } } }),
            prisma.application.count({ where: { drive: { orgId }, resumeStatus: "pending"       } }),
            prisma.application.count({ where: { drive: { orgId }, resumeStatus: "SHORTLISTED"   } }),
            prisma.application.count({ where: { drive: { orgId }, resumeStatus: "REJECTED"      } }),
            prisma.application.count({ where: { drive: { orgId }, interviewStatus: "pending"       } }),
            prisma.application.count({ where: { drive: { orgId }, interviewStatus: "IN_PROGRESS"   } }),
            prisma.application.count({ where: { drive: { orgId }, interviewStatus: "COMPLETED"     } }),
            prisma.application.count({ where: { drive: { orgId }, interviewStatus: "Not Qualified" } }),
            prisma.application.count({ where: { drive: { orgId }, hiringStatus: "pending"         } }),
            prisma.application.count({ where: { drive: { orgId }, hiringStatus: "Shortlisted"     } }),
            prisma.application.count({ where: { drive: { orgId }, hiringStatus: "Not Shortlisted" } }),
            prisma.application.count({ where: { drive: { orgId }, hiringStatus: "Hired"           } }),
            prisma.application.count({ where: { drive: { orgId }, hiringStatus: "Not Hired"       } }),
          ]);
          result = JSON.stringify({
            totalCandidates: total,
            resumeStatus:    { pending: rPending, shortlisted: rShortlisted, rejected: rRejected },
            interviewStatus: { pending: iPending, inProgress: iInProgress, completed: iCompleted, notQualified: iNotQualified },
            hiringStatus:    { pending: hPending, shortlisted: hShortlisted, notShortlisted: hNotShortlisted, hired: hHired, notHired: hNotHired },
          });

        // -- get_drives_overview --------------------------------------------
        } else if (fn === "get_drives_overview") {
          const drives = await prisma.drive.findMany({
            where: { orgId },
            select: {
              id: true, title: true, department: true, role: true,
              status: true, deadline: true, screeningThreshold: true,
              positions: true, workMode: true,
              createdAt: true,
              _count: { select: { applications: true } },
            },
            orderBy: { createdAt: "desc" },
          });
          const now = new Date();
          result = JSON.stringify(drives.map((d: (typeof drives)[number]) => ({
            ...d,
            applicationCount: d._count.applications,
            daysLeft: d.deadline
              ? Math.max(0, Math.ceil((new Date(d.deadline).getTime() - now.getTime()) / 86400000))
              : null,
            isExpired: d.deadline ? new Date(d.deadline) < now : false,
            _count: undefined,
          })));

        // -- get_drive_by_name ----------------------------------------------
        } else if (fn === "get_drive_by_name") {
          const drives = await prisma.drive.findMany({
            where: {
              orgId,
              title: { contains: args.name, mode: "insensitive" },
            },
            select: {
              id: true, title: true, department: true, role: true,
              description: true, status: true, deadline: true,
              screeningThreshold: true,
              positions: true, workMode: true, salary: true,
              experience: true, skills: true, requirements: true,
              createdAt: true,
              _count: { select: { applications: true } },
            },
            take: 3,
          });
          result = JSON.stringify(drives.map((d: (typeof drives)[number]) => ({
            ...d,
            applicationCount: d._count.applications,
            _count: undefined,
          })));

        // -- get_candidates_for_drive ---------------------------------------
        } else if (fn === "get_candidates_for_drive") {
          const limit = Math.min(args.limit ?? 20, 50);
          let driveId = args.driveId;

          // If driveId not given, find by name
          if (!driveId && args.driveName) {
            const drive = await prisma.drive.findFirst({
              where: { orgId, title: { contains: args.driveName, mode: "insensitive" } },
              select: { id: true, title: true },
            });
            driveId = drive?.id;
          }
          if (!driveId) {
            result = JSON.stringify({ error: "Drive not found. Please provide the exact drive name or ID." });
          } else {
            const candidates = await prisma.application.findMany({
              where: { drive: { orgId }, driveId },
              select: {
                id: true, fullName: true, email: true,
                aiScore: true, resumeStatus: true, hiringStatus: true,
                interviewStatus: true, experienceYears: true,
                createdAt: true, resumeUrl: true, structuredResume: true,
                drive: { select: { title: true } },
              },
              orderBy: { aiScore: "desc" },
              take: limit,
            });
            result = JSON.stringify(candidates.map((c: (typeof candidates)[number]) => ({
              ...c,
              parsedResume: parseStructuredResume(c.structuredResume),
              structuredResume: undefined,
            })));
          }

        // -- get_top_candidates ---------------------------------------------
        } else if (fn === "get_top_candidates") {
          const whereClause: any = { drive: { orgId }, aiScore: { not: null } };
          if (args.driveId && args.driveId !== "all") whereClause.driveId = args.driveId;
          const candidates = await prisma.application.findMany({
            where: whereClause,
            select: {
              id: true, fullName: true, email: true,
              aiScore: true, resumeStatus: true, hiringStatus: true,
              interviewStatus: true, experienceYears: true,
              createdAt: true, resumeUrl: true, structuredResume: true,
              drive: { select: { title: true } },
            },
            orderBy: { aiScore: "desc" },
            take: Math.min(args.limit ?? 10, 25),
          });
          result = JSON.stringify(candidates.map((c: (typeof candidates)[number]) => ({
            ...c,
            parsedResume: parseStructuredResume(c.structuredResume),
            structuredResume: undefined,
          })));

        // -- get_candidates_by_status ---------------------------------------
        } else if (fn === "get_candidates_by_status") {
          const whereClause: any = { drive: { orgId } };
          if (args.resumeStatus) whereClause.resumeStatus = normalizeResumeStatus(args.resumeStatus);
          if (args.hiringStatus)  whereClause.hiringStatus  = normalizeHiringStatus(args.hiringStatus);
          if (args.driveId)       whereClause.driveId       = args.driveId;
          const candidates = await prisma.application.findMany({
            where: whereClause,
            select: {
              id: true, fullName: true, email: true,
              aiScore: true, resumeStatus: true, hiringStatus: true,
              interviewStatus: true, experienceYears: true,
              createdAt: true, resumeUrl: true, structuredResume: true,
              drive: { select: { title: true } },
            },
            orderBy: { createdAt: "desc" },
            take: Math.min(args.limit ?? 20, 50),
          });
          result = JSON.stringify(candidates.map((c: (typeof candidates)[number]) => ({
            ...c,
            parsedResume: parseStructuredResume(c.structuredResume),
            structuredResume: undefined,
          })));

        // -- search_candidates_by_name --------------------------------------
        } else if (fn === "search_candidates_by_name") {
          const candidates = await prisma.application.findMany({
            where: {
              drive: { orgId },
              fullName: { contains: args.name, mode: "insensitive" },
            },
            select: {
              id: true, fullName: true, email: true, phone: true,
              aiScore: true, resumeStatus: true, hiringStatus: true,
              interviewStatus: true, experienceYears: true,
              createdAt: true, resumeUrl: true, structuredResume: true,
              drive: { select: { title: true } },
              interview: { select: { status: true, aiSummary: true, completedAt: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          });
          result = JSON.stringify(candidates.map((c: (typeof candidates)[number]) => ({
            ...c,
            parsedResume: parseStructuredResume(c.structuredResume),
            structuredResume: undefined,
          })));

        // -- search_candidates_by_skill -------------------------------------
        } else if (fn === "search_candidates_by_skill") {
          // Search in structuredResume JSON using Postgres ILIKE on text column
          const skill = args.skill?.trim() ?? "";
          const candidates = await prisma.application.findMany({
            where: {
              drive: { orgId },
              structuredResume: { contains: skill, mode: "insensitive" },
              resumeStatus: "SHORTLISTED", // Only shortlisted are worth surfacing
            },
            select: {
              id: true, fullName: true, email: true,
              aiScore: true, resumeStatus: true, hiringStatus: true,
              interviewStatus: true, experienceYears: true,
              createdAt: true, resumeUrl: true, structuredResume: true,
              drive: { select: { title: true } },
            },
            orderBy: { aiScore: "desc" },
            take: Math.min(args.limit ?? 10, 25),
          });

          // If no shortlisted results, search all
          const allCandidates = candidates.length > 0 ? candidates :
            await prisma.application.findMany({
              where: {
                drive: { orgId },
                structuredResume: { contains: skill, mode: "insensitive" },
              },
              select: {
                id: true, fullName: true, email: true,
                aiScore: true, resumeStatus: true, hiringStatus: true,
                interviewStatus: true, experienceYears: true,
                createdAt: true, resumeUrl: true, structuredResume: true,
                drive: { select: { title: true } },
              },
              orderBy: { aiScore: "desc" },
              take: Math.min(args.limit ?? 10, 25),
            });

          result = JSON.stringify(allCandidates.map((c: (typeof allCandidates)[number]) => ({
            ...c,
            parsedResume: parseStructuredResume(c.structuredResume),
            structuredResume: undefined,
          })));

        // -- get_candidate_detail -------------------------------------------
        } else if (fn === "get_candidate_detail") {
          const candidate = await prisma.application.findUnique({
            where: { id: args.applicationId },
            select: {
              id: true, fullName: true, email: true, phone: true,
              aiScore: true, aiReport: true,
              resumeStatus: true, hiringStatus: true, interviewStatus: true,
              experienceYears: true, createdAt: true, resumeUrl: true,
              structuredResume: true,
              drive: { select: { title: true, orgId: true, screeningThreshold: true } },
              interview: {
                select: { status: true, aiSummary: true, completedAt: true, interviewDuration: true },
              },
            },
          });
          if (!candidate || candidate.drive.orgId !== orgId) {
            result = JSON.stringify({ error: "Candidate not found in this organization." });
          } else {
            let reportSummary: any = null;
            try {
              if (candidate.aiReport) {
                const parsed = JSON.parse(candidate.aiReport);
                reportSummary = {
                  recruiterSnapshot:  parsed.recruiter_snapshot,
                  aiVerdict:          parsed.ai_verdict,
                  strengths:          parsed.strengths?.slice(0, 5),
                  concerns:           parsed.concerns?.slice(0, 5),
                  candidatePotential: parsed.candidate_potential,
                  hiringRecommendation: parsed.hiring_recommendation,
                };
              }
            } catch { /* ignore */ }
            result = JSON.stringify({
              ...candidate,
              aiReport: reportSummary,
              parsedResume: parseStructuredResume(candidate.structuredResume),
              structuredResume: undefined,
            });
          }

        // -- get_avg_scores -------------------------------------------------
        } else if (fn === "get_avg_scores") {
          const where: any = { drive: { orgId }, aiScore: { not: null } };
          if (args.driveId) where.driveId = args.driveId;

          const [scoreStats, distribution] = await Promise.all([
            prisma.application.aggregate({
              where,
              _avg: { aiScore: true },
              _max: { aiScore: true },
              _min: { aiScore: true },
              _count: { aiScore: true },
            }),
            prisma.$queryRaw<any[]>`
              SELECT
                COUNT(*) FILTER (WHERE "aiScore" >= 90)::INT AS "excellent",
                COUNT(*) FILTER (WHERE "aiScore" >= 70 AND "aiScore" < 90)::INT AS "good",
                COUNT(*) FILTER (WHERE "aiScore" >= 50 AND "aiScore" < 70)::INT AS "average",
                COUNT(*) FILTER (WHERE "aiScore" < 50)::INT AS "below_average"
              FROM "Application" a
              JOIN "Drive" d ON d.id = a."driveId"
              WHERE d."orgId" = ${orgId}
              AND a."aiScore" IS NOT NULL
              ${args.driveId ? prisma.$queryRaw`AND a."driveId" = ${args.driveId}::uuid` : prisma.$queryRaw``}
            `,
          ]);

          result = JSON.stringify({
            averageScore: scoreStats._avg.aiScore ? Math.round(scoreStats._avg.aiScore) : null,
            highestScore:  scoreStats._max.aiScore,
            lowestScore:   scoreStats._min.aiScore,
            totalScored:   scoreStats._count.aiScore,
            distribution: distribution[0] ?? {},
          });
        }

        toolMessages.push({
          role: "tool" as any,
          tool_call_id: toolCall.id,
          content: result || JSON.stringify({ error: "Tool returned no data." }),
        });
      }

      // -- 7. Second LLM call with tool results ------------------------------
      const secondResponse = await openai.chat.completions.create({
        model: orgOpenAIModel,
        messages: toolMessages,
        temperature: 0.2,
      });
      await recordOrgBillingFromOpenAICompletion({
        orgId,
        feature: "chatbot",
        completion: secondResponse,
      });

      return NextResponse.json(secondResponse.choices[0].message);
    }

    return NextResponse.json(responseMessage);

  } catch (error: any) {
    console.error("[RECRUITER_CHAT_ERROR]:", error.message, error.stack);
    return NextResponse.json({ error: "Assistant failed. Please try again." }, { status: 500 });
  }
}
