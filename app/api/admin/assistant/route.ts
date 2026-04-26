import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { recordOrgBillingUsage } from "@/lib/usage-metrics";
import { getOpenAIClient } from "@/lib/openai";

async function getOrgOpenAIModel(orgId: string): Promise<string> {
    const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { llmProvider: true, llmModel: true },
    });
    if ((org?.llmProvider || "OPENAI") === "OPENAI" && org?.llmModel) {
        return org.llmModel;
    }
    return "gpt-4o-mini";
}

function detectIntent(message: string): string {
    const lower = message.toLowerCase();
    
    // Handle specific count queries
    if (lower.includes('how many') || lower.includes('count') || lower.includes('total') || lower.includes('number of')) {
        return 'count_query';
    }

    // Handle "show candidates", "any n8n developers", "who is react dev" etc.
    if (
        lower.includes('show') || lower.includes('list') || lower.includes('get') || lower.includes('find') || 
        lower.includes('search') || lower.includes('any') || lower.includes('who') || lower.includes('have') || 
        lower.includes('has') || lower.includes('look for')
    ) {
        if (lower.includes('candidate') || lower.includes('application') || lower.includes('applicant') || lower.includes('hire') || lower.includes('everyone') || lower.includes('somebody') || lower.includes('developer') || lower.includes('engineer') || lower.includes('expert')) {
            return 'search_candidates';
        }
        if (lower.includes('drive') || lower.includes('job') || lower.includes('position')) {
            return 'get_drives';
        }
        if (lower.includes('interview')) {
            return 'get_interviews';
        }
    }
    
    if (lower.includes('score') || lower.includes('rank') || lower.includes('top') || lower.includes('highest') || lower.includes('best')) {
        return 'filter_by_score';
    }
    
    if (lower.includes('status') || lower.includes('shortlisted') || lower.includes('rejected') || lower.includes('pending') || lower.includes('hired')) {
        return 'filter_by_status';
    }
    
    if (lower.includes('today') || lower.includes('yesterday') || lower.includes('this week') || lower.includes('recent')) {
        return 'filter_by_date';
    }
    
    if (lower.includes('summarize') || lower.includes('tell me about') || lower.includes('profile') || lower.includes('details about') || lower.includes('skill') || lower.includes('experience')) {
        return 'summarize_candidate';
    }
    
    if (lower.includes('for ') || lower.includes('in ') || lower.includes('applied to')) {
        return 'filter_by_drive';
    }
    
    if (lower.includes(' vs ') || lower.includes('compared') || lower.includes('better')) {
        return 'compare_candidates';
    }
    
    // Default to search candidates for common queries
    if (lower.includes('candidate') || lower.includes('applicant') || lower.includes('everyone') || lower.includes('all') || lower.includes('developer') || lower.includes('engineer')) {
        return 'search_candidates';
    }
    
    return 'general';
}

function extractName(message: string, history: any[] = []): string | null {
    const patterns = [
        /about\s+(\w+\s+\w+)/i,
        /for\s+(\w+\s+\w+)/i,
        /summarize\s+(\w+\s+\w+)/i,
        /tell me about\s+(\w+\s+\w+)/i,
        /profile of\s+(\w+\s+\w+)/i,
    ];
    
    for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match) return match[1].trim();
    }
    
    const singleMatch = message.match(/(?:find|show|search|list)\s+(?:me\s+)?(\w+)$/i);
    if (singleMatch && singleMatch[1].length > 2) {
        return singleMatch[1].trim();
    }
    
    // Check history for context if this is a follow-up (e.g., "what skills he has")
    if (history.length > 0) {
        for (let i = history.length - 1; i >= 0; i--) {
            const h = history[i];
            if (h.role === 'user') {
                const hName = extractName(h.content, []); // recursive call without history
                if (hName) return hName;
            }
            // Also check assistant responses for names mentioned in bold
            if (h.role === 'assistant') {
                const boldMatch = h.content.match(/\*\*([\w\s]+)\*\*/);
                if (boldMatch) return boldMatch[1].trim();
            }
        }
    }
    
    return null;
}

function extractScoreThreshold(message: string): { min?: number; max?: number } {
    const lower = message.toLowerCase();
    
    const greaterMatch = lower.match(/(?:score|scores?)\s*(?:>|above|over|more than)\s*(\d+)/);
    if (greaterMatch) return { min: parseInt(greaterMatch[1]) };
    
    const lessMatch = lower.match(/(?:score|scores?)\s*(?:<|below|under|less than)\s*(\d+)/);
    if (lessMatch) return { max: parseInt(lessMatch[1]) };
    
    return {};
}

function extractStatus(message: string): string | null {
    const lower = message.toLowerCase();
    
    const statusMap: Record<string, string> = {
        'shortlisted': 'Shortlisted',
        'rejected': 'Rejected',
        'pending': 'APPLIED',
        'applied': 'APPLIED',
        'hired': 'Hired',
        'interview': 'INTERVIEW',
        'interviewing': 'INTERVIEW',
    };
    
    for (const [key, value] of Object.entries(statusMap)) {
        if (lower.includes(key)) return value;
    }
    
    return null;
}

function extractDriveName(message: string): string | null {
    const patterns = [
        /for\s+(?:the\s+)?(?:(\w+)\s+)?drive/gi,
        /in\s+(?:the\s+)?(\w+)\s+drive/gi,
        /applied to\s+(?:the\s+)?(\w+(?:\s+\w+)?)/gi,
    ];
    
    for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
            const val = match[1].trim().toLowerCase();
            if (['active', 'all', 'recent', 'new'].includes(val)) continue;
            return val;
        }
    }
    
    // Match "X developer", "X expert", "any X", "who has X"
    const roleMatch = message.match(/(?:show|list|find|get|any|have|has|has|who\s+is|who\s+has|search|look\s+for)\s+(?:me\s+)?(?:all\s+)?(?:in\s+)?([\w\-\.]+)(?:\s+(?:candidates?|developers?|engineers?|experts?|specialists?))?/i);
    if (roleMatch && roleMatch[1]) {
        const val = roleMatch[1].trim().toLowerCase();
        if (['active', 'all', 'recent', 'new', 'some', 'me', 'the', 'my', 'any'].includes(val)) return null;
        return val;
    }
    
    return null;
}

function extractDateRange(message: string): { from: Date; to: Date } {
    const now = new Date();
    const lower = message.toLowerCase();
    
    if (lower.includes('today')) {
        const start = new Date(now.setHours(0, 0, 0, 0));
        return { from: start, to: new Date() };
    }
    
    if (lower.includes('yesterday')) {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        const end = new Date(yesterday);
        end.setHours(23, 59, 59, 999);
        return { from: yesterday, to: end };
    }
    
    if (lower.includes('this week')) {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        return { from: startOfWeek, to: new Date() };
    }
    
    if (lower.includes('this month')) {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return { from: startOfMonth, to: new Date() };
    }
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return { from: thirtyDaysAgo, to: new Date() };
}

async function searchCandidates(message: string, orgId: string) {
    const name = extractName(message);
    const skill = extractDriveName(message);
    
    // Handle "show active candidates" - return all candidates sorted by score
    if (!name && !skill) {
        const candidates = await prisma.application.findMany({
            where: { drive: { orgId } },
            take: 15,
            orderBy: { aiScore: 'desc' },
            select: {
                id: true,
                fullName: true,
                email: true,
                aiScore: true,
                resumeStatus: true,
                hiringStatus: true,
                createdAt: true,
                drive: { select: { title: true } }
            }
        });
        
        if (candidates.length === 0) {
            return { type: 'list', message: "No candidates found in your organization." };
        }
        
        const list = candidates.map((c: any) => 
            `• **${c.fullName}** - Score: ${c.aiScore || 'N/A'} - ${c.hiringStatus !== 'pending' ? c.hiringStatus : c.resumeStatus} - ${c.drive.title}`
        ).join('\n');
        
        return {
            type: 'list',
            title: `All Candidates (${candidates.length})`,
            message: list,
            action: "Ask me to filter by score, status, or search by name!"
        };
    }
    
    const where: any = { drive: { orgId } };
    
    // For skill search like "n8n" - search in resume skills, summary, and drive
    if (skill || name) {
        const searchTerm = (skill || name)!.toLowerCase();
        
        // Get all candidates and filter locally (Prisma JSON filtering is limited)
        const allCandidates = await prisma.application.findMany({
            where: { drive: { orgId } },
            take: 50,
            orderBy: { aiScore: 'desc' },
            select: {
                id: true,
                fullName: true,
                email: true,
                aiScore: true,
                resumeStatus: true,
                hiringStatus: true,
                createdAt: true,
                structuredResume: true,
                drive: { select: { title: true } }
            }
        });
        
        // Filter candidates who have the skill in their resume
        const filtered = allCandidates.filter((c: any) => {
            const resume = c.structuredResume ? (typeof c.structuredResume === 'string' ? JSON.parse(c.structuredResume) : c.structuredResume) : null;
            if (!resume) return false;
            
            // Check skills array
            const skills = resume.skills || [];
            if (skills.some((s: string) => s.toLowerCase().includes(searchTerm) || searchTerm.includes(s.toLowerCase()))) return true;
            
            // Check summary
            const summary = (resume.summary || '').toLowerCase();
            if (summary.includes(searchTerm)) return true;
            
            // Check work experience
            const workExp = resume.workExperience || [];
            if (workExp.some((w: any) => (w.title || '').toLowerCase().includes(searchTerm) || (w.description || '').toLowerCase().includes(searchTerm))) return true;
            
            // Check drive title too
            if (c.drive.title.toLowerCase().includes(searchTerm)) return true;

            return false;
        });
        
        if (filtered.length === 0) {
            return { type: 'list', message: `No candidates found with "${skill || name}" in their skills or experience.` };
        }
        
        const list = filtered.slice(0, 10).map((c: any) => 
            `• **${c.fullName}** - Score: ${c.aiScore || 'N/A'} - ${c.hiringStatus !== 'pending' ? c.hiringStatus : c.resumeStatus} - ${c.drive.title}`
        ).join('\n');
        
        return {
            type: 'list',
            title: `Found ${filtered.length} candidate(s) with "${skill || name}" skills`,
            message: list,
            action: "Want more details? Ask me to summarize any candidate!"
        };
    }
    
    const candidates = await prisma.application.findMany({
        where,
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            fullName: true,
            email: true,
            aiScore: true,
            resumeStatus: true,
            hiringStatus: true,
            createdAt: true,
            drive: { select: { title: true } }
        }
    });
    
    if (candidates.length === 0) {
        return { type: 'list', message: "No candidates found matching your query." };
    }
    
    const list = candidates.map((c: any) => {
        const time = new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `• **${c.fullName}** - Score: ${c.aiScore || 'N/A'} - ${c.hiringStatus !== 'pending' ? c.hiringStatus : c.resumeStatus} - ${c.drive.title} (${time})`;
    }).join('\n');
    
    return {
        type: 'list',
        title: `Found ${candidates.length} candidate(s)`,
        message: list,
        action: "Ask me for more details about any candidate!"
    };
}

async function filterByScore(message: string, orgId: string) {
    const { min, max } = extractScoreThreshold(message);
    
    const where: any = { drive: { orgId } };
    
    if (min !== undefined) where.aiScore = { gte: min };
    if (max !== undefined) where.aiScore = { ...where.aiScore, lte: max };
    
    const lower = message.toLowerCase();
    const isTop = lower.includes('top') || lower.includes('highest') || lower.includes('best');
    const take = isTop ? 5 : 20;
    
    const candidates = await prisma.application.findMany({
        where,
        take,
        orderBy: { aiScore: 'desc' },
        select: {
            id: true,
            fullName: true,
            aiScore: true,
            resumeStatus: true,
            hiringStatus: true,
            drive: { select: { title: true } }
        }
    });
    
    if (candidates.length === 0) {
        return { type: 'list', message: "No candidates found with that score range." };
    }
    
    const prefix = isTop ? '🏆 ' : '• ';
    const list = candidates.map((c: any, i: number) => 
        `${prefix}${i + 1}. **${c.fullName}** - ${c.aiScore}/100 - ${c.drive.title}`
    ).join('\n');
    
    return {
        type: 'list',
        title: isTop ? `Top ${candidates.length} Performers` : `Candidates matching score criteria`,
        message: list,
        action: "Want to see more candidates or filter by another criteria?"
    };
}

async function filterByStatus(message: string, orgId: string) {
    const status = extractStatus(message);
    
    if (!status) {
        return { type: 'general', message: "I couldn't understand the status. Try 'shortlisted', 'rejected', or 'pending'." };
    }
    
    const field = (status.toLowerCase().includes('hired') || status.toLowerCase().includes('not')) ? 'hiringStatus' : 'resumeStatus';
    
    const candidates = await prisma.application.findMany({
        where: { drive: { orgId }, [field]: { equals: status, mode: 'insensitive' } },
        take: 15,
        orderBy: { aiScore: 'desc' },
        select: {
            fullName: true,
            aiScore: true,
            resumeStatus: true,
            hiringStatus: true,
            createdAt: true,
            drive: { select: { title: true } }
        }
    });
    
    if (candidates.length === 0) {
        return { type: 'list', message: `No candidates found with status: ${status}` };
    }
    
    const list = candidates.map((c: any) => 
        `• **${c.fullName}** - Score: ${c.aiScore || 'N/A'} - Applied: ${new Date(c.createdAt).toLocaleDateString()}`
    ).join('\n');
    
    return {
        type: 'list',
        title: `${candidates.length} ${status} Candidates`,
        message: list,
        action: "Would you like to take action on any of these candidates?"
    };
}

async function filterByDate(message: string, orgId: string) {
    const { from, to } = extractDateRange(message);
    
    const candidates = await prisma.application.findMany({
        where: {
            drive: { orgId },
            createdAt: { gte: from, lte: to }
        },
        take: 20,
        orderBy: { createdAt: 'desc' },
        select: {
            fullName: true,
            aiScore: true,
            resumeStatus: true,
            hiringStatus: true,
            createdAt: true,
            drive: { select: { title: true } }
        }
    });
    
    const count = await prisma.application.count({
        where: { drive: { orgId }, createdAt: { gte: from, lte: to } }
    });
    
    if (count === 0) {
        return { type: 'count', message: "No applications found for this period." };
    }
    
    const periodLabel = message.toLowerCase().includes('today') ? 'today' : 
                       message.toLowerCase().includes('yesterday') ? 'yesterday' : 
                       message.toLowerCase().includes('week') ? 'this week' : 'this period';
    
    const list = candidates.slice(0, 10).map((c: any) => {
        const time = new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `• **${c.fullName}** - ${c.drive.title} (at ${time})`;
    }).join('\n');
    
    return {
        type: 'count',
        title: `${count} candidates ${periodLabel}`,
        message: list + (count > 10 ? `\n...and ${count - 10} more` : ''),
        action: "Want to see more details?"
    };
}

async function getDrives(orgId: string) {
        const drives = await prisma.drive.findMany({
            where: { orgId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                title: true,
                department: true,
                createdAt: true,
                _count: { select: { applications: true } }
            }
    });
    
    if (drives.length === 0) {
        return { type: 'list', message: "No recruitment drives found. Create one to get started!" };
    }
    
    let response = `**Drives (${drives.length}):**\n`;
    response += drives.slice(0, 5).map((d: any) => 
        `• **${d.title}** (${d._count.applications} candidates) - ${d.department}`
    ).join('\n');
    
    return {
        type: 'list',
        title: `${drives.length} Total Drives`,
        message: response,
        action: "Want details on a specific drive? Just ask!"
    };
}

async function filterByDrive(message: string, orgId: string) {
    const driveName = extractDriveName(message);
    
    if (!driveName) {
        return { type: 'general', message: "Which drive should I search for? Try 'for React drive' or 'for Software Engineer'." };
    }
    
    const drive = await prisma.drive.findFirst({
        where: { 
            orgId,
            OR: [
                { title: { contains: driveName, mode: 'insensitive' } },
                { department: { contains: driveName, mode: 'insensitive' } }
            ]
        }
    });
    
    if (!drive) {
        return { type: 'list', message: `No drive found matching '${driveName}'. Try a different name.` };
    }
    
    const candidates = await prisma.application.findMany({
        where: { driveId: drive.id },
        take: 15,
        orderBy: { aiScore: 'desc' },
        select: {
            fullName: true,
            aiScore: true,
            resumeStatus: true,
            hiringStatus: true,
            createdAt: true
        }
    });
    
    const count = await prisma.application.count({ where: { driveId: drive.id } });
    
    if (count === 0) {
        return { type: 'list', message: `No candidates applied to ${drive.title} yet.` };
    }
    
    const list = candidates.map((c: any) => 
        `• **${c.fullName}** - Score: ${c.aiScore || 'N/A'} - ${c.hiringStatus !== 'pending' ? c.hiringStatus : c.resumeStatus}`
    ).join('\n');
    
    return {
        type: 'list',
        title: `${count} candidates for ${drive.title}`,
        message: list,
        action: "Want to see more or filter by score?"
    };
}

async function summarizeCandidate(message: string, orgId: string, history: any[] = []) {
    const name = extractName(message, history);
    
    if (!name) {
        return { type: 'general', message: "Which candidate? Try 'summarize John' or 'profile of John Smith'." };
    }
    
    const candidate = await prisma.application.findFirst({
        where: { 
            drive: { orgId },
            OR: [
                { fullName: { contains: name, mode: 'insensitive' } },
                { email: { contains: name, mode: 'insensitive' } }
            ]
        },
        include: {
            drive: { select: { title: true, description: true } },
            interview: true
        }
    });
    
    if (!candidate) {
        return { type: 'list', message: `No candidate found matching '${name}'. Try a different name.` };
    }
    
    let aiReport: any = null;
    let resumeData: any = null;
    
    try {
        if (candidate.aiReport) aiReport = JSON.parse(candidate.aiReport);
        if (candidate.structuredResume) resumeData = JSON.parse(candidate.structuredResume);
    } catch (e) {}
    
    const skills = resumeData?.skills || [];
    const experience = resumeData?.workExperience || [];
    
    let summary = `**${candidate.fullName}**\n`;
    summary += `📧 ${candidate.email}\n`;
    summary += `💼 Applied for: ${candidate.drive.title}\n`;
    summary += `📊 AI Score: ${candidate.aiScore || 'N/A'}/100\n`;
    summary += `📌 Status: ${candidate.hiringStatus !== 'pending' ? candidate.hiringStatus : candidate.resumeStatus}\n`;
    summary += `📅 Applied: ${new Date(candidate.createdAt).toLocaleDateString()} at ${new Date(candidate.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n`;
    
    if (skills.length > 0) {
        summary += `\n🛠️ **Technical Skills:** ${skills.slice(0, 10).join(', ')}`;
    }

    if (experience.length > 0) {
        const latest = experience[0];
        summary += `\n🏗️ **Experience:** ${latest.title} at ${latest.company}`;
    }

    if (aiReport?.recruiter_snapshot) {
        summary += `\n\n🎯 **AI Insight:** ${aiReport.recruiter_snapshot}`;
    }
    
    if (aiReport?.strengths?.length > 0) {
        summary += `\n\n✅ **Strengths:**\n`;
        summary += aiReport.strengths.slice(0, 3).map((s: string) => `• ${s}`).join('\n');
    }
    
    if (candidate.interview) {
        summary += `\n🎙️ Interview: ${candidate.interview.status} - Duration: ${candidate.interview.interviewDuration || 'N/A'} min`;
    }
    
    return {
        type: 'summary',
        title: `Candidate Profile: ${candidate.fullName}`,
        message: summary,
        action: "I can help move this candidate to 'Shortlisted' or send the interview link again."
    };
}

async function countQuery(message: string, orgId: string) {
    const lower = message.toLowerCase();
    const { from, to } = extractDateRange(message);
    
    // Support "how many drives"
    if (lower.includes('drive') || lower.includes('position')) {
        const count = await prisma.drive.count({ where: { orgId } });
        return { type: 'count', message: `📊 **${count}** recruitment drives active in your organization.` };
    }

    if (lower.includes('total') || lower.includes('all')) {
        const count = await prisma.application.count({ where: { drive: { orgId } } });
        return { type: 'count', message: `📊 **${count}** total applications in your organization.` };
    }
    
    const status = extractStatus(lower);
    if (status) {
        const field = (status.toLowerCase().includes('hired') || status.toLowerCase().includes('not')) ? 'hiringStatus' : 'resumeStatus';
        const count = await prisma.application.count({ where: { drive: { orgId }, [field]: { equals: status, mode: 'insensitive' } } });
        return { type: 'count', message: `📊 **${count}** candidates with status: ${status}` };
    }
    
    const count = await prisma.application.count({
        where: { drive: { orgId }, createdAt: { gte: from, lte: to } }
    });
    
    const periodLabel = lower.includes('today') ? 'today' : 
                       lower.includes('yesterday') ? 'yesterday' : 
                       lower.includes('week') ? 'this week' : 'this period';
    
    return { type: 'count', message: `📊 **${count}** applications ${periodLabel}.` };
}

async function compareCandidates(message: string, orgId: string) {
    const match = message.match(/(?:vs|and|compare)\s+(\w+)\s+(?:and\s+)?(\w+)/i);
    
    if (!match) {
        return { type: 'general', message: "Try format: 'Compare John and Mike' or 'John vs Mike'" };
    }
    
    const name1 = match[1];
    const name2 = match[2];
    
    const [c1, c2] = await Promise.all([
        prisma.application.findFirst({
            where: { drive: { orgId }, fullName: { contains: name1, mode: 'insensitive' } },
            select: { fullName: true, aiScore: true, resumeStatus: true, hiringStatus: true, drive: { select: { title: true } } }
        }),
        prisma.application.findFirst({
            where: { drive: { orgId }, fullName: { contains: name2, mode: 'insensitive' } },
            select: { fullName: true, aiScore: true, resumeStatus: true, hiringStatus: true, drive: { select: { title: true } } }
        })
    ]);
    
    if (!c1 || !c2) {
        return { type: 'list', message: "Could not find both candidates. Check the names and try again." };
    }
    
    const score1 = c1.aiScore || 0;
    const score2 = c2.aiScore || 0;
    const winner = score1 > score2 ? c1.fullName : score2 > score1 ? c2.fullName : 'Tie';
    
    let comparison = `📊 **Comparison: ${c1.fullName} vs ${c2.fullName}**\n\n`;
    comparison += `| Metric | ${c1.fullName} | ${c2.fullName} |\n`;
    comparison += `|--------|---------------|\n`;
    comparison += `| **AI Score** | ${score1}/100 | ${score2}/100 |\n`;
    comparison += `| **Status** | ${c1.hiringStatus !== 'pending' ? c1.hiringStatus : c1.resumeStatus} | ${c2.hiringStatus !== 'pending' ? c2.hiringStatus : c2.resumeStatus} |\n`;
    comparison += `| **Applied For** | ${c1.drive.title} | ${c2.drive.title} |\n`;
    comparison += `\n🏆 **Winner:** ${winner}`;
    
    return {
        type: 'comparison',
        title: `${c1.fullName} vs ${c2.fullName}`,
        message: comparison,
        action: "Want more details on either candidate?"
    };
}

async function useGPTFallback(message: string, context: string) {
    const openai = getOpenAIClient();

    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: context },
            { role: "user", content: message }
        ],
        temperature: 0.7,
        stream: true,
    });

    const stream = new ReadableStream({
        async start(controller) {
            for await (const chunk of response) {
                const content = chunk.choices[0]?.delta?.content || "";
                if (content) {
                    controller.enqueue(new TextEncoder().encode(content));
                }
            }
            controller.close();
        },
    });

    return { type: 'stream', stream };
}

export async function POST(request: Request) {
    try {
        const openai = getOpenAIClient();

        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { message, history = [] } = await request.json();
        const orgId = session.orgId;
        const orgOpenAIModel = await getOrgOpenAIModel(orgId);

        const intent = detectIntent(message);
        console.log(`[LUMO] Intent: ${intent} | Message: "${message}"`);

        let result;

        // For simple greetings, respond without database
        const lowerMessage = message.toLowerCase().trim();
        if (lowerMessage === 'hi' || lowerMessage === 'hello' || lowerMessage === 'hey' || lowerMessage === 'hii') {
            const greetingStream = new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode("👋 Hi there! I'm **Ishita**, your recruitment assistant. Try asking me:\n\n• 'Show all candidates'\n• 'Top performers'\n• 'How many hired this month?'\n• 'Summarize [candidate name]'"));
                    controller.close();
                },
            });
            return new Response(greetingStream, {
                headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
        }

        switch (intent) {
            case 'search_candidates':
                result = await searchCandidates(message, orgId);
                break;
            case 'filter_by_score':
                result = await filterByScore(message, orgId);
                break;
            case 'filter_by_status':
                result = await filterByStatus(message, orgId);
                break;
            case 'filter_by_date':
                result = await filterByDate(message, orgId);
                break;
            case 'get_drives':
                result = await getDrives(orgId);
                break;
            case 'filter_by_drive':
                result = await filterByDrive(message, orgId);
                break;
            case 'summarize_candidate':
                result = await summarizeCandidate(message, orgId, history);
                break;
            case 'count_query':
                result = await countQuery(message, orgId);
                break;
            case 'compare_candidates':
                result = await compareCandidates(message, orgId);
                break;
            default:
                result = null;
        }

        if (result && (result as any).type !== 'stream') {
            const data = result as any;
            const gptContext = `
You are 'Ishita', a Premium AI Recruitment Assistant. 
Format the following data into a friendly, helpful response:

${data.title ? `**${data.title}**\n\n` : ''}
${data.message}

${data.action ? `\n\n💡 ${data.action}` : ''}

Keep responses concise and use bold for important info. Always sign off as Ishita.
            `;
            
            const gptResponse = await openai.chat.completions.create({
                model: orgOpenAIModel,
                messages: [
                    { role: "system", content: gptContext },
                    { role: "user", content: "Format this as a natural response" }
                ],
                temperature: 0.7,
                stream: true,
                stream_options: { include_usage: true },
            });

            const stream = new ReadableStream({
                async start(controller) {
                    let promptTokens = 0;
                    let completionTokens = 0;
                    let cachedTokens = 0;
                    for await (const chunk of gptResponse) {
                        if ((chunk as any).usage) {
                            const usage = (chunk as any).usage;
                            promptTokens = usage.prompt_tokens ?? promptTokens;
                            completionTokens = usage.completion_tokens ?? completionTokens;
                            cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? cachedTokens;
                        }
                        const content = chunk.choices[0]?.delta?.content || "";
                        if (content) {
                            controller.enqueue(new TextEncoder().encode(content));
                        }
                    }
                    if (promptTokens > 0 || completionTokens > 0) {
                        await recordOrgBillingUsage({
                            orgId,
                            feature: "chatbot",
                            usage: {
                                model: orgOpenAIModel,
                                inputTokens: promptTokens,
                                outputTokens: completionTokens,
                                cachedInputTokens: cachedTokens,
                            },
                        });
                    }
                    controller.close();
                },
            });

            return new Response(stream, {
                headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
        }

        // Fallback: Get basic stats without date filters to avoid Prisma issues
        const [
            totalApps,
            activeDrives,
            hiredThisMonth,
            recentApps
        ] = await Promise.all([
            prisma.application.count({ where: { drive: { orgId } } }),
            prisma.drive.count({ where: { orgId } }),
            prisma.application.count({ where: { hiringStatus: 'hired', drive: { orgId } } }),
            prisma.application.findMany({
                where: { drive: { orgId } },
                take: 5,
                orderBy: { createdAt: 'desc' },
                select: { fullName: true, aiScore: true, resumeStatus: true, hiringStatus: true, createdAt: true, drive: { select: { title: true } } }
            })
        ]);

        const systemContext = `
You are 'Ishita', the Premium AI Recruitment Assistant for Sreeva AI.
Your tone is professional, efficient, and proactive.

CURRENT PLATFORM STATUS:
- Total Applications: ${totalApps}
- Active Drives: ${activeDrives}
- Hired This Month: ${hiredThisMonth}

RECENT APPLICATIONS:
${recentApps.map((a: any) => `- ${a.fullName}: Score ${a.aiScore || 'N/A'}, Status: ${a.hiringStatus !== 'pending' ? a.hiringStatus : a.resumeStatus}, Applied: ${new Date(a.createdAt).toLocaleString()}, Drive: ${a.drive.title}`).join('\n')}

Be concise and helpful. Use bold for names and scores. Always provide exact times if available in context.
        `;

        const gptResponse = await openai.chat.completions.create({
            model: orgOpenAIModel,
            messages: [
                { role: "system", content: systemContext },
                ...history.slice(-3),
                { role: "user", content: message }
            ],
            temperature: 0.7,
            stream: true,
            stream_options: { include_usage: true },
        });

        const stream = new ReadableStream({
            async start(controller) {
                let promptTokens = 0;
                let completionTokens = 0;
                let cachedTokens = 0;
                for await (const chunk of gptResponse) {
                    if ((chunk as any).usage) {
                        const usage = (chunk as any).usage;
                        promptTokens = usage.prompt_tokens ?? promptTokens;
                        completionTokens = usage.completion_tokens ?? completionTokens;
                        cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? cachedTokens;
                    }
                    const content = chunk.choices[0]?.delta?.content || "";
                    if (content) {
                        controller.enqueue(new TextEncoder().encode(content));
                    }
                }
                if (promptTokens > 0 || completionTokens > 0) {
                    await recordOrgBillingUsage({
                        orgId,
                        feature: "chatbot",
                        usage: {
                            model: orgOpenAIModel,
                            inputTokens: promptTokens,
                            outputTokens: completionTokens,
                            cachedInputTokens: cachedTokens,
                        },
                    });
                }
                controller.close();
            },
        });

        return new Response(stream, {
            headers: { "Content-Type": "text/plain; charset=utf-8" },
        });

    } catch (error: any) {
        console.error("Ishita AI Error:", error);
        console.error("Error stack:", error.stack);
        
        // Return a friendly error message instead of crashing
        const errorStream = new ReadableStream({
            start(controller) {
                const msg = "⚠️ I encountered an issue. Please try again in a moment. If the problem persists, check the server logs.";
                controller.enqueue(new TextEncoder().encode(msg));
                controller.close();
            },
        });
        
        return new Response(errorStream, {
            headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
    }
}
