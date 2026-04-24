import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { deleteOrgEmbeddings } from "@/lib/pinecone";
import { deleteUrlTargets } from "@/lib/delete-utils";
import { isOrgPlan, normalizeOrgPlan } from "@/lib/org-plans";
import { normalizeProctoringSignals } from "@/lib/proctoring-signals";

// GET /api/super-admin/orgs/[id] - fetch org for editing
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
        const creditRows = await prisma.$queryRaw<Array<{ creditsTotal: number | null; creditsUsed: number | null }>>(
            Prisma.sql`
                SELECT "creditsTotal", "creditsUsed"
                FROM "Organization"
                WHERE id = ${id}
                LIMIT 1
            `
        );

        if (!org) {
            return NextResponse.json({ error: "Organization not found" }, { status: 404 });
        }

        return NextResponse.json({
            ...org,
            creditsTotal: creditRows[0]?.creditsTotal ?? 0,
            creditsUsed: creditRows[0]?.creditsUsed ?? 0,
        });
    } catch (error) {
        console.error("Error fetching org:", error);
        return NextResponse.json({ error: "Failed to fetch organization" }, { status: 500 });
    }
}

// PATCH /api/super-admin/orgs/[id] - update org (suspend, change plan, etc.)
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
            name, plan, status, logoUrl, slug, location, maxActiveDrives, maxTeamMembers,
            proctoringSignals,
            adminName, adminEmail,
            ttsProvider, cartesiaVoiceId, cartesiaModel, sarvamModel, sarvamVoice,
            sttProvider, deepgramModel, sarvamSttModel,
            llmProvider, llmModel, llmTemperature,
            usageMetrics,
            creditsTotal,
        } = body;
        const parsedCreditsTotal =
            creditsTotal !== undefined ? parseFloat(creditsTotal) : undefined;

        // -- INPUT VALIDATION --------------------------------
        if (plan && !isOrgPlan(plan)) {
            return NextResponse.json({ error: "Invalid organization plan" }, { status: 400 });
        }
        if (status && !["ACTIVE", "SUSPENDED", "PENDING", "DEACTIVATED", "CLOSED"].includes(status)) {
            return NextResponse.json({ error: "Invalid organization status" }, { status: 400 });
        }
        if (usageMetrics) {
            if (typeof usageMetrics !== "object" && typeof usageMetrics !== "string") {
                return NextResponse.json({ error: "usageMetrics must be an object or JSON string" }, { status: 400 });
            }
        }

        // Build update - only write fields that were sent
        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (plan !== undefined) updateData.plan = normalizeOrgPlan(plan) || plan;
        if (maxActiveDrives !== undefined) updateData.maxActiveDrives = Math.max(0, Number(maxActiveDrives) || 0);
        if (maxTeamMembers !== undefined) updateData.maxTeamMembers = Math.max(0, Number(maxTeamMembers) || 0);
        if (proctoringSignals !== undefined) updateData.proctoringSignals = normalizeProctoringSignals(proctoringSignals);
        if (status !== undefined) updateData.status = status;
        if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
        if (slug !== undefined) updateData.slug = slug;
        if (location !== undefined) updateData.location = location;

        // TTS - save exact values the user chose, null out the other provider's fields
        if (ttsProvider !== undefined) {
            updateData.ttsProvider = ttsProvider;
            if (ttsProvider === "CARTESIA") {
                updateData.cartesiaVoiceId = cartesiaVoiceId || "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc";
                updateData.cartesiaModel = cartesiaModel || "cartesia/sonic-3";
                updateData.sarvamModel = null;
                updateData.sarvamVoice = null;
            } else if (ttsProvider === "SARVAM") {
                updateData.sarvamModel = sarvamModel || "bulbul:v3";
                updateData.sarvamVoice = sarvamVoice || "shubh";
                updateData.cartesiaVoiceId = null;
                updateData.cartesiaModel = null;
            }
        }

        // STT - save exact values the user chose
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

        // Credits billing — dedicated columns, never touch usageMetrics
        const shouldUpdateCreditsTotal =
            parsedCreditsTotal !== undefined && !isNaN(parsedCreditsTotal) && parsedCreditsTotal >= 0;

        // Usage metrics — internal API cost tracking, untouched by billing
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

        // -- EMAIL CONFLICT CHECK ----------------------------
        if (adminEmail) {
            const normalizedEmail = adminEmail.toLowerCase().trim();
            const existingUser = await prisma.user.findUnique({
                where: { email: normalizedEmail }
            });

            if (existingUser) {
                // Find the actual primary admin for this org
                const currentAdmin = await prisma.user.findFirst({
                    where: { orgId: id, role: "ORG_ADMIN" },
                    orderBy: { createdAt: "asc" }
                });

                // Conflict: Email belongs to SOMEONE ELSE
                if (currentAdmin && existingUser.id !== currentAdmin.id) {
                    return NextResponse.json({ 
                        error: `The email "${normalizedEmail}" is already registered with another account. Please use a different one.` 
                    }, { status: 400 });
                }
            }
        }

        // -- TRANSACTION: Update Org & Admin ------------------
        const updated = await prisma.$transaction(async (tx) => {
            // 1. Update Org
            const org = await tx.organization.update({
                where: { id },
                data: updateData,
            });

            if (shouldUpdateCreditsTotal) {
                await tx.$executeRaw(
                    Prisma.sql`
                        UPDATE "Organization"
                        SET "creditsTotal" = ${parsedCreditsTotal}
                        WHERE id = ${id}
                    `
                );
            }

            // 2. Update Primary Admin if name/email provided
            if (adminName !== undefined || adminEmail !== undefined) {
                // Find the first ORG_ADMIN
                const admin = await tx.user.findFirst({
                    where: { orgId: id, role: "ORG_ADMIN" },
                    orderBy: { createdAt: "asc" }
                });

                if (admin) {
                    const adminUpdate: any = {};
                    if (adminName) adminUpdate.name = adminName;
                    if (adminEmail) adminUpdate.email = adminEmail.toLowerCase().trim();

                    await tx.user.update({
                        where: { id: admin.id },
                        data: adminUpdate
                    });
                }
            }

            const creditRows = await tx.$queryRaw<Array<{ creditsTotal: number | null; creditsUsed: number | null }>>(
                Prisma.sql`
                    SELECT "creditsTotal", "creditsUsed"
                    FROM "Organization"
                    WHERE id = ${id}
                    LIMIT 1
                `
            );

            return {
                ...org,
                creditsTotal: creditRows[0]?.creditsTotal ?? 0,
                creditsUsed: creditRows[0]?.creditsUsed ?? 0,
            };
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error("Error updating org:", error);
        return NextResponse.json({ error: "Failed to update organization" }, { status: 500 });
    }
}

// DELETE /api/super-admin/orgs/[id] - remove org and all its data
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

        // -- STEP 1: DISCOVERY (Find all associated assets) ------------------

        // 1. Get Organization for Logo
        const org = await prisma.organization.findUnique({
            where: { id },
            select: { logoUrl: true }
        });

        // 2. Get all drives to find associated applications and interviews
        const drives = await prisma.drive.findMany({ 
            where: { orgId: id }, 
            select: { id: true, jdPreviewUrl: true } 
        });
        const driveIds = drives.map((d: (typeof drives)[number]) => d.id);

        // 3. Get all applications and their files
        const applications = await prisma.application.findMany({
            where: { driveId: { in: driveIds } },
            select: { id: true, resumeUrl: true, passportUrl: true }
        });
        const appIds = applications.map((app: (typeof applications)[number]) => app.id);

        // 4. Get all interviews and recordings
        const interviews = await prisma.interview.findMany({
            where: { applicationId: { in: appIds } },
            select: { interviewRecordingUrl: true, snapshots: true }
        });

        // -- STEP 2: EXTERNAL ASSET CLEANUP (R2 & PINECONE) -------------------

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

        await deleteUrlTargets(fileUrlsToDelete);

        // Trigger Pinecone Cleanup
        try {
            await deleteOrgEmbeddings(id);
        } catch (pineconeError) {
            console.error("Failed to clear Pinecone embeddings for org:", id, pineconeError);
        }

        // -- STEP 3: DATABASE CLEANUP (Cascading) ---------------------------
        
        await prisma.$transaction(async (tx) => {
            await tx.interview.deleteMany({
                where: { application: { drive: { orgId: id } } }
            });
            await tx.application.deleteMany({
                where: { drive: { orgId: id } }
            });
            await tx.drive.deleteMany({
                where: { orgId: id }
            });
            await tx.orgInvite.deleteMany({
                where: { orgId: id }
            });
            await tx.user.deleteMany({
                where: { orgId: id }
            });
            await tx.organization.delete({
                where: { id }
            });
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting org:", error);
        return NextResponse.json({ error: "Failed to delete organization" }, { status: 500 });
    }
}
