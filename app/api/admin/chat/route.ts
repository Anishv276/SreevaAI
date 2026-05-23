import { NextRequest, NextResponse } from "next/server";
import { getEmbedding } from "@/lib/openai";
import { queryCandidates } from "@/lib/pinecone";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordOrgBillingFromOpenAICompletion } from "@/lib/usage-metrics";
import { getOpenAIClient } from "@/lib/openai";
import { canUseRecruiterAssistant } from "@/lib/org-plans";
import type OpenAI from "openai";

// ---------------------------------------------------------------------------
// STATUS NORMALISATION - exact DB casing
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Fuzzy name match — splits query into tokens, ALL must appear somewhere in fullName
// "vamsi dakka" matches "Vamsi Krishna Dakka"
// ---------------------------------------------------------------------------
function buildFuzzyNameWhere(name: string, orgId: string) {
  const tokens = name.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;

  // If single token — simple contains
  if (tokens.length === 1) {
    return {
      drive: { orgId },
      fullName: { contains: tokens[0], mode: "insensitive" as const },
    };
  }

  // Multi-token: every token must match somewhere in the name
  return {
    drive: { orgId },
    AND: tokens.map((token) => ({
      fullName: { contains: token, mode: "insensitive" as const },
    })),
  };
}

// ---------------------------------------------------------------------------
// Parse resume JSON blob → readable object
// ---------------------------------------------------------------------------
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
      careerProgression:
        sr.career_progression?.analysis ??
        (sr.career_timeline
          ? `Progression: ${sr.career_timeline.progression_pattern ?? "unknown"}; job hopping risk: ${sr.career_timeline.job_hopping_risk ?? "unknown"}`
          : null),
    };
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Parse interview report → full structured object the LLM can reason over
// ---------------------------------------------------------------------------
function parseInterviewReport(raw: string | object | null | undefined) {
  if (!raw) return null;
  try {
    const r = typeof raw === "string" ? JSON.parse(raw) : raw;

    const qaSource = Array.isArray(r.question_by_question_analysis)
      ? r.question_by_question_analysis
      : Array.isArray(r.qa_blocks_all)
        ? r.qa_blocks_all
        : Array.isArray(r.qa_blocks)
          ? r.qa_blocks
          : [];

    const qa = qaSource.map((q: any) => ({
      question:      q.ai_question ?? q.question,
      answerSummary: q.candidate_answer ?? q.answer ?? q.answer_summary,
      score:         q.overall != null ? `${q.overall}/10` : q.score,
      verdict:       q.verdict ?? q.status ?? null,
      confidence:    q.confidence ?? null,
      tags:          q.tags ?? q.signals ?? [],
      scoreBreakdown: q.score_breakdown ?? null,
      isWarmup:      q.is_warmup ?? q.isWarmup ?? false,
    }));

    const skillsProof = Array.isArray(r.skills_proof) ? r.skills_proof.map((s: any) => ({
      skill:    s.skill,
      status:   s.status,
      score:    s.score,
      evidence: s.evidence,
    })) : [];

    return {
      scores: {
        combined:      r.combined_score ?? null,
        technical:     r.technical_score ?? null,
        communication: r.communicationScore ?? r.communication_score ?? r.scores?.communication ?? null,
        behavioral:    r.behavioral_score ?? null,
      },
      integrity: {
        score:   r.integrity?.score ?? null,
        summary: r.integrity?.summary ?? null,
      },
      communication: r.communication_analysis ?? r.communication ?? null,
      cognitive:     r.cognitiveInsights ?? r.cognitive_insights ?? r.cognitive ?? null,
      behavioral:    r.behavioralSignalsAnalysis ?? r.behavioral_analysis ?? r.behavior_signals ?? null,
      verdict: {
        summary:           r.verdict?.summary ?? null,
        recommendation:    r.verdict?.recommendation ?? null,
        recommendationReason: r.verdict?.recommendation_reason ?? null,
        concise:           r.verdict?.ai_summary_concise ?? null,
      },
      qa,
      skillsProof,
      generatedAt: r.generated_at ?? null,
    };
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    const openai = getOpenAIClient();

    // -- 1. Auth --------------------------------------------------------------
    const session = await getSession();
    if (!session?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const orgId = session.orgId;

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, industry: true, size: true, plan: true },
    });
    if (!canUseRecruiterAssistant(org?.plan)) {
      return NextResponse.json(
        { error: "Recruiter Assistant is not available on the Starter plan." },
        { status: 403 }
      );
    }
    const orgOpenAIModel = "gpt-4o-mini";

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
      const matches = await queryCandidates(queryVector, 20, { orgId: { $eq: orgId } });

      // Group by candidate so we surface the richest context per person
      const byCandidate: Record<string, { meta: any; chunks: Array<{ type: string; content: string; score: number }> }> = {};
      for (const match of matches) {
        const meta = match.metadata as any;
        const appId = meta.applicationId;
        if (!appId) continue;
        if (!byCandidate[appId]) {
          byCandidate[appId] = { meta, chunks: [] };
        }
        byCandidate[appId].chunks.push({
          type: meta.type,
          content: meta.contentChunk ?? "",
          score: match.score ?? 0,
        });
      }

      semanticContext = Object.values(byCandidate).map(({ meta, chunks }) => {
        const sections = chunks.map((c) => `  [${c.type.toUpperCase()}]: ${c.content}`).join("\n");
        return `CANDIDATE: ${meta.fullName} | Role: ${meta.jobTitle} | Score: ${meta.aiScore}/100 | AppID: ${meta.applicationId}\n${sections}`;
      }).join("\n---\n");
    } catch { /* Pinecone optional */ }

    // -- 3. Tool Definitions --------------------------------------------------
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "get_recruitment_stats",
          description: "Get real-time TOTAL counts: total candidates, drives, live interviews, completed interviews, shortlisted, rejected, hired, pending. Call for ANY question about counts, totals, 'how many', pipeline overview, or dashboard summary.",
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
          description: "List all recruitment drives with title, role, screening threshold, and application count. Use for 'show drives', 'all jobs', 'open positions', or drive-level summaries.",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function",
        function: {
          name: "get_drive_by_name",
          description: "Search for a specific drive by title/name. Use when recruiter mentions a job title or drive name like 'Oracle Fusion drive', 'Backend Engineer role'.",
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
          description: "Get all candidates for a specific drive by drive ID or drive name.",
          parameters: {
            type: "object",
            properties: {
              driveId:   { type: "string", description: "Drive ID (uuid). Use if known." },
              driveName: { type: "string", description: "Drive title/name to search candidates by." },
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
          description: "Find a candidate by name — supports partial and fuzzy matching so 'vamsi dakka' finds 'Vamsi Krishna Dakka'. Use for ANY question mentioning a person's name: profile, skills, score, application date, resume, status, etc. Returns full profile + interview summary.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "Full or partial candidate name. Even 2 words from a full name work." },
            },
            required: ["name"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_candidate_interview_report",
          description: "Get the FULL interview report for a candidate: all scores (combined, technical, communication, behavioral), integrity score, Q&A blocks with individual question scores and verdicts, skills proof, cognitive insights, behavioral analysis, and final hiring recommendation. Use when recruiter asks about interview performance, specific scores, integrity, behavioral signals, or detailed assessment of a named candidate.",
          parameters: {
            type: "object",
            properties: {
              applicationId: { type: "string", description: "The application ID of the candidate." },
              name:          { type: "string", description: "Candidate name (partial OK) — used if applicationId not known." },
            },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "search_candidates_by_skill",
          description: "Find candidates who have a specific skill, technology, or tool. Use for 'who knows Python', 'find Java developers', 'candidates with AWS experience'.",
          parameters: {
            type: "object",
            properties: {
              skill: { type: "string", description: "Skill, technology, language, or tool name." },
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
          description: "Full profile of a candidate by application ID: score, statuses, parsed resume skills/education/experience/projects, interview summary.",
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
          description: "Get average AI scores, score distribution, and performance statistics. Use for 'average score', 'score distribution', 'how are candidates performing', 'pass rate'.",
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
    const systemPrompt = `You are Ishita Intelligence — the AI recruitment assistant for **${org?.name ?? "this organization"}**.
You have complete, real-time access to the organization's hiring database and every candidate's interview report.
Every answer is based on LIVE data from tools — never from memory or assumptions.

### ORGANIZATION:
- Name: ${org?.name ?? "Unknown"} | Industry: ${org?.industry ?? "N/A"} | Size: ${org?.size ?? "N/A"} | Plan: ${org?.plan ?? "STARTER"}

---

### TOOL ROUTING — CALL THE RIGHT TOOL FOR EVERY QUESTION:

**PIPELINE & COUNTS:**
| Question | Tool |
|---|---|
| How many candidates? / Total count / Dashboard summary | get_recruitment_stats |
| How many shortlisted / rejected / hired / pending? | get_candidate_counts_by_status |
| Hiring funnel / pipeline breakdown | get_candidate_counts_by_status |

**DRIVES / JOBS:**
| Question | Tool |
|---|---|
| Show all drives / all jobs / open positions | get_drives_overview |
| Tell me about the [role] drive | get_drive_by_name |
| How many applied for [role]? / Candidates for [drive] | get_candidates_for_drive |

**CANDIDATE PROFILE (name lookup):**
| Question | Tool |
|---|---|
| Tell me about [Name] / profile / skills / status | search_candidates_by_name |
| [Name]'s score / resume / application date | search_candidates_by_name |
| Find [partial name] — 'vamsi dakka' matches 'Vamsi Krishna Dakka' | search_candidates_by_name |

**INTERVIEW REPORT (scores, integrity, behavioral, Q&A):**
| Question | Tool |
|---|---|
| How did [Name] perform in the interview? | get_candidate_interview_report |
| What is [Name]'s integrity score / technical score / communication score? | get_candidate_interview_report |
| Show [Name]'s Q&A / question-level performance | get_candidate_interview_report |
| What are [Name]'s behavioral signals / cognitive insights? | get_candidate_interview_report |
| Should we hire [Name]? / What is the verdict? | get_candidate_interview_report |
| Show [Name]'s skills proof / which skills did they prove? | get_candidate_interview_report |

**SKILLS SEARCH:**
| Question | Tool |
|---|---|
| Who knows [Python / Java / AWS / Oracle]? | search_candidates_by_skill |
| Find candidates with [skill] | search_candidates_by_skill |

**STATUS FILTERS:**
| Question | Tool |
|---|---|
| Show shortlisted / rejected / pending candidates | get_candidates_by_status |
| Who completed the interview? / Who was hired? | get_candidates_by_status |

**RANKINGS & PERFORMANCE:**
| Question | Tool |
|---|---|
| Top candidates / Best scores / Highest rated | get_top_candidates |
| Average score / Pass rate / Score distribution | get_avg_scores |
| Full profile for AppID [id] | get_candidate_detail |

---

### PIPELINE STAGES:
1. **Applied** → Candidate submits resume
2. **AI Screened** → Scored 0–100 vs JD → SHORTLISTED or REJECTED (resumeStatus)
3. **Interview** → Shortlisted get AI voice interview → PENDING → IN_PROGRESS → COMPLETED
4. **Decision** → Recruiter sets hiringStatus: Hired / Not Hired

### EXACT DB STATUS VALUES:
- resumeStatus: "pending" | "SHORTLISTED" | "REJECTED"
- interviewStatus: "pending" | "IN_PROGRESS" | "COMPLETED" | "Not Qualified"
- hiringStatus: "pending" | "Shortlisted" | "Not Shortlisted" | "Hired" | "Not Hired"
- aiScore: 0–100

### RESPONSE RULES:
- ALWAYS cite **Candidate Name (App ID: xxx)** when referring to a person
- Show scores as numbers: "Integrity: 85/100", "Technical: 72/100" — never vague
- Show aiScore as "XX/100" — if null, say "Not yet screened"
- Use ### Headings and bullet points — no long unbroken paragraphs
- ALWAYS show resumeUrl as a direct URL when present
- ALWAYS show createdAt as a readable date (e.g. "April 10, 2026")
- If a candidate has an interview report, proactively surface key scores when asked about their performance
- Be warm, professional, and concise — this is a personal HR intelligence tool

### SEMANTIC CONTEXT (most relevant candidates for this query):
${semanticContext || "No semantic matches found — rely on tools for accurate data."}
`;

    // -- 5. First LLM call ----------------------------------------------------
    const response = await openai.chat.completions.create({
      model: orgOpenAIModel,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      tools,
      tool_choice: "auto",
      temperature: 0.2,
    });
    await recordOrgBillingFromOpenAICompletion({ orgId, feature: "chatbot", completion: response });

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
              id: true, title: true, role: true,
              screeningThreshold: true, createdAt: true,
              _count: { select: { applications: true } },
            },
            orderBy: { createdAt: "desc" },
          });
          result = JSON.stringify(drives.map((d) => ({
            ...d, applicationCount: d._count.applications, _count: undefined,
          })));

        // -- get_drive_by_name ----------------------------------------------
        } else if (fn === "get_drive_by_name") {
          const drives = await prisma.drive.findMany({
            where: { orgId, title: { contains: args.name, mode: "insensitive" } },
            select: {
              id: true, title: true, role: true,
              screeningThreshold: true, createdAt: true,
              _count: { select: { applications: true } },
            },
            take: 3,
          });
          result = JSON.stringify(drives.map((d) => ({
            ...d, applicationCount: d._count.applications, _count: undefined,
          })));

        // -- get_candidates_for_drive ---------------------------------------
        } else if (fn === "get_candidates_for_drive") {
          const limit = Math.min(args.limit ?? 20, 50);
          let driveId = args.driveId;
          if (!driveId && args.driveName) {
            const drive = await prisma.drive.findFirst({
              where: { orgId, title: { contains: args.driveName, mode: "insensitive" } },
              select: { id: true },
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
                aiScore: true, resumeStatus: true, hiringStatus: true, interviewStatus: true,
                createdAt: true, resumeUrl: true,
                drive: { select: { title: true } },
              },
              orderBy: { aiScore: "desc" },
              take: limit,
            });
            result = JSON.stringify(candidates);
          }

        // -- get_top_candidates ---------------------------------------------
        } else if (fn === "get_top_candidates") {
          const whereClause: any = { drive: { orgId }, aiScore: { not: null } };
          if (args.driveId && args.driveId !== "all") whereClause.driveId = args.driveId;
          const candidates = await prisma.application.findMany({
            where: whereClause,
            select: {
              id: true, fullName: true, email: true,
              aiScore: true, resumeStatus: true, hiringStatus: true, interviewStatus: true,
              createdAt: true, resumeUrl: true,
              drive: { select: { title: true } },
            },
            orderBy: { aiScore: "desc" },
            take: Math.min(args.limit ?? 10, 25),
          });
          result = JSON.stringify(candidates);

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
              aiScore: true, resumeStatus: true, hiringStatus: true, interviewStatus: true,
              createdAt: true, resumeUrl: true,
              drive: { select: { title: true } },
            },
            orderBy: { createdAt: "desc" },
            take: Math.min(args.limit ?? 20, 50),
          });
          result = JSON.stringify(candidates);

        // -- search_candidates_by_name --------------------------------------
        } else if (fn === "search_candidates_by_name") {
          const whereClause = buildFuzzyNameWhere(args.name, orgId);
          if (!whereClause) {
            result = JSON.stringify({ error: "Please provide a candidate name." });
          } else {
            const candidates = await prisma.application.findMany({
              where: whereClause,
              select: {
                id: true, fullName: true, email: true, phone: true,
                aiScore: true, resumeStatus: true, hiringStatus: true, interviewStatus: true,
                createdAt: true, resumeUrl: true,
                resumeData: true,
                drive: { select: { id: true, title: true } },
                interview: {
                  select: {
                    id: true, status: true, aiSummary: true, completedAt: true, interviewDuration: true,
                  },
                },
              },
              orderBy: { createdAt: "desc" },
              take: 10,
            });
            result = JSON.stringify(candidates.map((c) => ({
              ...c,
              parsedResume: parseStructuredResume(c.resumeData as string | null),
              resumeData: undefined,
            })));
          }

        // -- get_candidate_interview_report ---------------------------------
        } else if (fn === "get_candidate_interview_report") {
          let appId = args.applicationId;

          // If no appId, find candidate by name first
          if (!appId && args.name) {
            const whereClause = buildFuzzyNameWhere(args.name, orgId);
            if (whereClause) {
              const found = await prisma.application.findFirst({
                where: whereClause,
                select: { id: true, fullName: true },
                orderBy: { createdAt: "desc" },
              });
              appId = found?.id;
            }
          }

          if (!appId) {
            result = JSON.stringify({ error: "Candidate not found. Try providing the application ID or a more specific name." });
          } else {
            const candidate: any = await prisma.application.findUnique({
              where: { id: appId },
              select: {
                id: true, fullName: true, email: true,
                aiScore: true, resumeStatus: true, hiringStatus: true, interviewStatus: true,
                drive: { select: { title: true, orgId: true } },
                interview: {
                  select: {
                    id: true, status: true,
                    skillRatings: true,
                    communicationScore: true,
                    cognitiveInsights: true,
                    behaviorSignals: true,
                    behavioralSignalsAnalysis: true,
                    interviewTranscript: true,
                    aiSummary: true,
                    completedAt: true,
                    interviewDuration: true,
                    questionByQuestionAnalysis: true,
                    integritySignals: true,
                  },
                } as any,
              },
            } as any);

            if (!candidate || candidate.drive.orgId !== orgId) {
              result = JSON.stringify({ error: "Candidate not found in this organization." });
            } else if (!candidate.interview || candidate.interview.status !== "COMPLETED") {
              result = JSON.stringify({
                candidateName: candidate.fullName,
                applicationId: candidate.id,
                interviewStatus: candidate.interviewStatus,
                message: "Interview not yet completed — no report available.",
              });
            } else {
              const mergedReport = {
                ...(candidate.interview.skillRatings as any),
                communication_score: candidate.interview.communicationScore ?? null,
                cognitive_insights: candidate.interview.cognitiveInsights ?? null,
                integrity_signals: candidate.interview.integritySignals ?? null,
                behavior_signals: candidate.interview.behaviorSignals ?? null,
                behavioral_signals_analysis: candidate.interview.behavioralSignalsAnalysis ?? null,
                question_by_question_analysis: candidate.interview.questionByQuestionAnalysis ?? null,
              };
              const report = parseInterviewReport(mergedReport as any);
              result = JSON.stringify({
                candidateName:    candidate.fullName,
                applicationId:    candidate.id,
                aiScore:          candidate.aiScore,
                hiringStatus:     candidate.hiringStatus,
                drive:            candidate.drive.title,
                interviewStatus:  candidate.interviewStatus,
                completedAt:      candidate.interview.completedAt,
                interviewDuration: candidate.interview.interviewDuration,
                aiSummary:        candidate.interview.aiSummary,
                report,
              });
            }
          }

        // -- search_candidates_by_skill -------------------------------------
        } else if (fn === "search_candidates_by_skill") {
          const skill = args.skill?.trim() ?? "";
          // Try shortlisted first, fall back to all
          let candidates = await prisma.application.findMany({
            where: { drive: { orgId }, resumeText: { contains: skill, mode: "insensitive" }, resumeStatus: "SHORTLISTED" },
            select: {
              id: true, fullName: true, email: true,
              aiScore: true, resumeStatus: true, hiringStatus: true, interviewStatus: true,
              createdAt: true, resumeUrl: true,
              drive: { select: { title: true } },
            },
            orderBy: { aiScore: "desc" },
            take: Math.min(args.limit ?? 10, 25),
          });
          if (!candidates.length) {
            candidates = await prisma.application.findMany({
              where: { drive: { orgId }, resumeText: { contains: skill, mode: "insensitive" } },
              select: {
                id: true, fullName: true, email: true,
                aiScore: true, resumeStatus: true, hiringStatus: true, interviewStatus: true,
                createdAt: true, resumeUrl: true,
                drive: { select: { title: true } },
              },
              orderBy: { aiScore: "desc" },
              take: Math.min(args.limit ?? 10, 25),
            });
          }
          result = JSON.stringify(candidates);

        // -- get_candidate_detail -------------------------------------------
        } else if (fn === "get_candidate_detail") {
          const candidate = await prisma.application.findUnique({
            where: { id: args.applicationId },
            select: {
              id: true, fullName: true, email: true, phone: true,
              aiScore: true, aiReport: true, resumeData: true,
              resumeStatus: true, hiringStatus: true, interviewStatus: true,
              createdAt: true, resumeUrl: true,
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
                const parsed = JSON.parse(candidate.aiReport as string);
                reportSummary = {
                  recruiterSnapshot:    parsed.recruiter_snapshot,
                  decisionReason:       parsed.decision_reason,
                  strengths:            parsed.strengths?.slice(0, 5),
                  concerns:             parsed.concerns?.slice(0, 5),
                  candidatePotential:   parsed.candidate_potential,
                  hiringRecommendation: parsed.hiring_recommendation,
                };
              }
            } catch { /* ignore */ }
            result = JSON.stringify({
              ...candidate,
              aiReport: reportSummary,
              parsedResume: parseStructuredResume(candidate.resumeData as string | null),
              resumeData: undefined,
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
            prisma.$queryRaw`
              SELECT
                COUNT(*) FILTER (WHERE "aiScore" >= 90)::INT AS "excellent",
                COUNT(*) FILTER (WHERE "aiScore" >= 70 AND "aiScore" < 90)::INT AS "good",
                COUNT(*) FILTER (WHERE "aiScore" >= 50 AND "aiScore" < 70)::INT AS "average",
                COUNT(*) FILTER (WHERE "aiScore" < 50)::INT AS "below_average"
              FROM "Application" a
              JOIN "Drive" d ON d.id = a."driveId"
              WHERE d."orgId" = ${orgId}
              AND a."aiScore" IS NOT NULL
            ` as Promise<Array<{ excellent: number; good: number; average: number; below_average: number }>>,
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
      await recordOrgBillingFromOpenAICompletion({ orgId, feature: "chatbot", completion: secondResponse });
      return NextResponse.json(secondResponse.choices[0].message);
    }

    return NextResponse.json(responseMessage);

  } catch (error: any) {
    console.error("[RECRUITER_CHAT_ERROR]:", error.message, error.stack);
    return NextResponse.json({ error: "Assistant failed. Please try again." }, { status: 500 });
  }
}
