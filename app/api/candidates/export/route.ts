import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const driveIdStr = searchParams.get("driveId");
        const driveId = driveIdStr ? parseInt(driveIdStr) : null;
        const orgId = searchParams.get("orgId") || (session as any).orgId;

        // Fetch all candidates for the export
        const candidates = await prisma.application.findMany({
            where: {
                driveId: driveId || undefined,
                drive: { orgId }
            },
            include: {
                drive: {
                    select: { title: true }
                }
            },
            orderBy: { createdAt: "desc" }
        });

        // Convert to CSV
        const headers = ["Candidate ID", "Name", "Email", "Phone", "Role", "AI Score", "Status", "Applied Date"];
        const rows = candidates.map(c => [
            c.id,
            `"${c.fullName}"`,
            `"${c.email}"`,
            `"${c.phone}"`,
            `"${c.drive?.title || "Unknown"}"`,
            c.aiScore || 0,
            `"${c.status}"`,
            `"${new Date(c.createdAt).toLocaleDateString()}"`
        ]);

        const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");

        // Return as a downloadable CSV file
        return new Response(csvContent, {
            status: 200,
            headers: {
                "Content-Type": "text/csv",
                "Content-Disposition": `attachment; filename="candidates_export_${new Date().getTime()}.csv"`
            }
        });
    } catch (error) {
        console.error("Error exporting candidates:", error);
        return NextResponse.json({ error: "Failed to export candidates" }, { status: 500 });
    }
}
