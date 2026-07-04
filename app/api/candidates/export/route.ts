import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        const { searchParams } = new URL(request.url);
        const driveId = searchParams.get("driveId");
        // -- TENANT ISOLATION: only a SUPER_ADMIN may export another org via the
        // query string. A regular admin is locked to their own session org -- 
        // otherwise ?orgId=<victim_org> would dump every other tenant's candidate
        // PII (name, email, phone, scores) as a CSV.
        const orgId =
            session.role === "SUPER_ADMIN"
                ? (searchParams.get("orgId") || session.orgId)
                : session.orgId;
        if (!orgId) {
            return NextResponse.json({ error: "Organization required" }, { status: 400 });
        }
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
            orderBy: { updatedAt: "desc" }
        });
        // -- CSV INJECTION DEFENSE ------------------------------------------
        // Candidate-controlled fields (name, email, phone) can begin with a
        // formula trigger (= + - @, or tab/CR). Spreadsheet apps execute those
        // on open. Neutralize by prefixing a single quote, then wrap/escape for
        // CSV quoting. A candidate named =HYPERLINK("http://evil","x") becomes
        // an inert string instead of a live formula in the HR admin's Excel.
        const csvCell = (value: unknown) => {
            let s = value === null || value === undefined ? "" : String(value);
            if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
            return `"${s.replace(/"/g, '""')}"`;
        };
        // Convert to CSV
        const headers = ["Candidate ID", "Name", "Email", "Phone", "Role", "AI Score", "Resume Status", "Interview Status"];
        const rows = candidates.map((c: (typeof candidates)[number]) => [
            csvCell(c.id),
            csvCell(c.fullName),
            csvCell(c.email),
            csvCell(c.phone),
            csvCell(c.drive?.title || "Unknown"),
            c.aiScore || 0,
            csvCell(c.resumeStatus || "pending"),
            csvCell(c.interviewStatus || "pending")
        ]);
        const csvContent = [headers.join(","), ...rows.map((r: (typeof rows)[number]) => r.join(","))].join("\n");
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
