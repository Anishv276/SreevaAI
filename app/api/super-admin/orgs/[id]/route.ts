import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { deleteObject, getKeyFromUrl } from "@/lib/s3";
import { deleteOrgEmbeddings } from "@/lib/pinecone";

// GET /api/super-admin/orgs/[id] — fetch org for editing
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
        }

        const { id } = await params;
        const org = await prisma.organization.findUnique({
            where: { id },
            include: {
                users: {
                    where: { role: "ORG_ADMIN" },
                    select: { id: true, name: true, email: true }
                }
            }
        });

        if (!org) {
            return NextResponse.json({ error: "Organization not found" }, { status: 404 });
        }

        return NextResponse.json(org);
    } catch (error) {
        console.error("Error fetching org:", error);
        return NextResponse.json({ error: "Failed to fetch organization" }, { status: 500 });
    }
}

// PATCH /api/super-admin/orgs/[id] — update org (suspend, change plan, etc.)
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
        }

        const { id } = await params;
        const body = await request.json();
        const {
            name, plan, status, logoUrl, slug, location,
            phone, expectedDrives, expectedCandidates, expectedInterviews,
            ttsProvider, cartesiaVoiceId, cartesiaModel, sarvamModel, sarvamVoice,
            sttProvider, deepgramModel, sarvamSttModel,
            llmProvider, llmModel, llmTemperature,
            usageMetrics,
        } = body;

        // ── INPUT VALIDATION ────────────────────────────────
        if (plan && !["STARTER", "PROFESSIONAL", "ENTERPRISE", "TRIAL", "ENTERPRISE_CUSTOM"].includes(plan)) {
            return NextResponse.json({ error: "Invalid organization plan" }, { status: 400 });
        }
        if (status && !["ACTIVE", "SUSPENDED", "PENDING", "DEACTIVATED"].includes(status)) {
            return NextResponse.json({ error: "Invalid organization status" }, { status: 400 });
        }
        if (usageMetrics) {
            if (typeof usageMetrics !== "object" && typeof usageMetrics !== "string") {
                return NextResponse.json({ error: "usageMetrics must be an object or JSON string" }, { status: 400 });
            }
        }

        // Build update — only write fields that were sent
        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (plan !== undefined) updateData.plan = plan;
        if (status !== undefined) updateData.status = status;
        if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
        if (slug !== undefined) updateData.slug = slug;
        if (location !== undefined) updateData.location = location;
        if (phone !== undefined) updateData.phone = phone || null;
        if (expectedDrives !== undefined) updateData.expectedDrives = expectedDrives !== "" ? parseInt(expectedDrives) : null;
        if (expectedCandidates !== undefined) updateData.expectedCandidates = expectedCandidates !== "" ? parseInt(expectedCandidates) : null;
        if (expectedInterviews !== undefined) updateData.expectedInterviews = expectedInterviews !== "" ? parseInt(expectedInterviews) : null;

        // TTS — save exact values the user chose, null out the other provider's fields
        if (ttsProvider !== undefined) {
            updateData.ttsProvider = ttsProvider;
            if (ttsProvider === "CARTESIA") {
                updateData.cartesiaVoiceId = cartesiaVoiceId || "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc";
                updateData.cartesiaModel = cartesiaModel || "sonic-english";
                updateData.sarvamModel = null;
                updateData.sarvamVoice = null;
            } else if (ttsProvider === "SARVAM") {
                updateData.sarvamModel = sarvamModel || "bulbul:v3";
                updateData.sarvamVoice = sarvamVoice || "shubh";
                updateData.cartesiaVoiceId = null;
                updateData.cartesiaModel = null;
            }
        }

        // STT — save exact values the user chose
        if (sttProvider !== undefined) {
            updateData.sttProvider = sttProvider;
            if (sttProvider === "DEEPGRAM") {
                updateData.deepgramModel = deepgramModel || "nova-3-general";
                updateData.sarvamSttModel = null;
            } else if (sttProvider === "SARVAM") {
                updateData.sarvamSttModel = sarvamSttModel || "saaras:v3";
                updateData.deepgramModel = null;
            }
        }

        // LLM
        if (llmProvider !== undefined) updateData.llmProvider = llmProvider;
        if (llmModel !== undefined) updateData.llmModel = llmModel;
        if (llmTemperature !== undefined) updateData.llmTemperature = Number(llmTemperature);

        // Billing / usage metrics are stored as JSON
        if (usageMetrics !== undefined) {
            if (typeof usageMetrics === "string") {
                const trimmed = usageMetrics.trim();
                if (!trimmed) {
                    updateData.usageMetrics = {};
                } else {
                    try {
                        updateData.usageMetrics = JSON.parse(trimmed);
                    } catch {
                        return NextResponse.json({ error: "usageMetrics must be valid JSON" }, { status: 400 });
                    }
                }
            } else {
                updateData.usageMetrics = usageMetrics ?? {};
            }
        }

        const updated = await prisma.organization.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error("Error updating org:", error);
        return NextResponse.json({ error: "Failed to update organization" }, { status: 500 });
    }
}

// DELETE /api/super-admin/orgs/[id] — remove org and all its data
export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
        }

        const { id } = await params;

        // ── STEP 1: DISCOVERY (Find all associated assets) ──────────────────

        // 1. Get Organization for Logo
        const org = await prisma.organization.findUnique({ where: { id }, select: { logoUrl: true } });

        // 2. Get all drives to find associated applications and interviews
        const drives = await prisma.drive.findMany({ 
            where: { orgId: id }, 
            select: { id: true, jdPreviewUrl: true } 
        });
        const driveIds = drives.map(d => d.id);

        // 3. Get all applications and their files
        const applications = await prisma.application.findMany({
            where: { driveId: { in: driveIds } },
            select: { id: true, resumeUrl: true, passportUrl: true }
        });
        const appIds = applications.map(app => app.id);

        // 4. Get all interviews and recordings
        const interviews = await prisma.interview.findMany({
            where: { applicationId: { in: appIds } },
            select: { interviewRecordingUrl: true, snapshots: true }
        });

        // ── STEP 2: EXTERNAL ASSET CLEANUP (R2 & PINECONE) ───────────────────

        const fileUrlsToDelete: string[] = [];
        
        // Collect all file URLs
        if (org?.logoUrl) fileUrlsToDelete.push(org.logoUrl);
        drives.forEach(d => { if (d.jdPreviewUrl) fileUrlsToDelete.push(d.jdPreviewUrl); });
        applications.forEach(app => {
            if (app.resumeUrl) fileUrlsToDelete.push(app.resumeUrl);
            if (app.passportUrl) fileUrlsToDelete.push(app.passportUrl);
        });
        interviews.forEach(intv => {
            if (intv.interviewRecordingUrl) fileUrlsToDelete.push(intv.interviewRecordingUrl);
            if (intv.snapshots && Array.isArray(intv.snapshots)) {
                fileUrlsToDelete.push(...intv.snapshots);
            }
        });

        // Trigger R2 Deletions (Parallel-ish but safe)
        // Note: We don't block the whole process if one deletion fails, but we log it.
        await Promise.allSettled(fileUrlsToDelete.map(async (url) => {
            const key = getKeyFromUrl(url);
            if (!key) return;

            // Determine bucket from URL or key heuristics
            let bucket = process.env.R2_RESUMES_BUCKET || "resumes";
            if (url.includes("logo")) bucket = process.env.R2_LOGOS_BUCKET || "logos";
            else if (url.includes("jd")) bucket = process.env.R2_JDS_BUCKET || "jds";
            else if (url.includes("passport")) bucket = process.env.R2_PASSPORTS_BUCKET || "passports";
            else if (url.includes("interview")) bucket = process.env.R2_INTERVIEW_BUCKET || "interviews";

            return deleteObject(bucket, key);
        }));

        // Trigger Pinecone Cleanup
        try {
            await deleteOrgEmbeddings(id);
        } catch (pineconeError) {
            console.error("Failed to clear Pinecone embeddings for org:", id, pineconeError);
        }

        // ── STEP 3: DATABASE CLEANUP (Transaction) ──────────────────────────

        await prisma.$transaction([
            // Delete interviews linked to these applications
            prisma.interview.deleteMany({ where: { applicationId: { in: appIds } } }),
            // Delete applications linked to these drives
            prisma.application.deleteMany({ where: { driveId: { in: driveIds } } }),
            // Delete drives
            prisma.drive.deleteMany({ where: { orgId: id } }),
            // Delete org invites
            prisma.orgInvite.deleteMany({ where: { orgId: id } }),
            // Delete users linked to this org
            prisma.user.deleteMany({ where: { orgId: id } }),
            // Finally delete the organization itself
            prisma.organization.delete({ where: { id } }),
        ]);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting org:", error);
        return NextResponse.json({ error: "Failed to delete organization" }, { status: 500 });
    }
}
