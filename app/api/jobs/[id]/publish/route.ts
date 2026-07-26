import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";

/**
 * POST /api/jobs/[id]/publish
 *
 * Page 3 "Next" action -- the sole state transition GENERATED -> PUBLISHED.
 * Accepts must-have skills and (for "ats" mode jobs) the resume screening
 * threshold. Kept as a dedicated route so the general PATCH handler never
 * has to special-case the state machine.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    let jobId = "";
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        const { id } = await params;
        jobId = id;

        let body: any = {};
        try {
            const rawBody = await request.text();
            body = rawBody.trim() ? JSON.parse(rawBody) : {};
        } catch {
            return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: { organizationId: true, status: true, interviewMode: true },
        });
        if (!job) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }
        const isSuperAdmin = session.role === "SUPER_ADMIN";
        if (!isSuperAdmin && job.organizationId !== session.orgId) {
            return NextResponse.json({ error: "Access Denied: Ownership required to publish job" }, { status: 403 });
        }
        if (job.status !== "GENERATED") {
            return NextResponse.json(
                { error: `Job cannot be published from status "${job.status}" -- must be "GENERATED"` },
                { status: 409 }
            );
        }

        const mustHaveSkills = Array.isArray(body.mustHaveSkills)
            ? body.mustHaveSkills.filter((s: unknown) => typeof s === "string" && s.trim()).map((s: string) => s.trim())
            : [];

        const updateData: Record<string, unknown> = {
            status: "PUBLISHED",
            mustHaveSkills,
        };

        // Resume threshold only meaningful in "ats" mode; ignored (never forced)
        // for "interview-only" jobs.
        if (job.interviewMode !== "interview-only" && typeof body.resumeScreeningThreshold === "number") {
            updateData.resumeScreeningThreshold = body.resumeScreeningThreshold;
        }

        const updated = await prisma.job.update({
            where: { id: jobId },
            data: updateData,
        });

        return NextResponse.json(updated);
    } catch (error: any) {
        return apiErrorResponse({
            route: "/api/jobs/[id]/publish",
            method: "POST",
            error,
            body: { error: "Failed to publish job" },
            status: 500,
            logLabel: "[PUBLISH_JOB_ERROR]:",
        });
    }
}
