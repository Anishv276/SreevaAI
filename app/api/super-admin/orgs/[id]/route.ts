import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

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
            name, plan, status, logoUrl, slug, 
            ttsProvider, cartesiaVoiceId, sarvamModel, sarvamVoice,
            sttProvider, deepgramModel, sarvamSttModel,
            llmProvider, llmModel, llmTemperature,
            cartesiaModel, location
        } = body;

        // Build update data with exclusivity
        const updateData: any = {
            ...(name !== undefined && { name }),
            ...(plan !== undefined && { plan }),
            ...(status !== undefined && { status }),
            ...(logoUrl !== undefined && { logoUrl }),
            ...(slug !== undefined && { slug }),
            ...(ttsProvider !== undefined && { ttsProvider }),
            ...(sttProvider !== undefined && { sttProvider }),
            ...(location !== undefined && { location }),
        };

        // TTS Hierarchy
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

        // STT Hierarchy
        if (sttProvider === "DEEPGRAM") {
            updateData.deepgramModel = deepgramModel || "nova-3-general";
            updateData.sarvamSttModel = null;
        } else if (sttProvider === "SARVAM") {
            updateData.sarvamSttModel = sarvamSttModel || "saaras:v3";
            updateData.deepgramModel = null;
        }

        // LLM Hierarchy
        if (llmProvider !== undefined) updateData.llmProvider = llmProvider || "OPENAI";
        if (llmModel !== undefined) updateData.llmModel = llmModel || "gpt-4o";
        if (llmTemperature !== undefined) updateData.llmTemperature = Number(llmTemperature);

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

        // 1. Get all drives to find associated applications and interviews
        const drives = await prisma.drive.findMany({ where: { orgId: id }, select: { id: true } });
        const driveIds = drives.map(d => d.id);

        // 2. Get all application IDs for these drives
        const applications = await prisma.application.findMany({
            where: { driveId: { in: driveIds } },
            select: { id: true }
        });
        const appIds = applications.map(app => app.id);

        // 3. Perform manual cascade deletion in the correct order
        await prisma.$transaction([
            // Delete interviews linked to these applications
            prisma.interview.deleteMany({ where: { applicationId: { in: appIds } } }),
            // Delete applications linked to these drives
            prisma.application.deleteMany({ where: { driveId: { in: driveIds } } }),
            // Delete drives
            prisma.drive.deleteMany({ where: { orgId: id } }),
            // Delete org invites (references BOTH User and Organization — must go before users)
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
