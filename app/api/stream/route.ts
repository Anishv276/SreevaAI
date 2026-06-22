import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
    // -- AUTH + TENANT SCOPE -----------------------------------------------
    // This SSE stream broadcasts new/updated application activity. Without a
    // session + org scope it leaks candidate PII (name, email) across every
    // organization to any unauthenticated caller.
    const session = await getSession();
    if (!session) {
        return new Response(JSON.stringify({ error: "Not authorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }
    // SUPER_ADMIN has no single org; the activity feed is an org-scoped feature,
    // so a non-org session simply gets an empty (heartbeat-only) stream.
    const sessionOrgId = session.role === "SUPER_ADMIN" ? null : (session.orgId ?? null);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: any) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                } catch (e) {
                    // Stream closed
                }
            };
            let lastCheck = new Date();
            let closed = false;
            // Open the SSE connection immediately so the client gets a stable stream.
            send({ type: "CONNECTED" });
            const checkForUpdates = async () => {
                if (closed) return;
                try {
                    // A SUPER_ADMIN (no single org) gets a heartbeat-only stream;
                    // everyone else is scoped strictly to their own org's drives.
                    if (!sessionOrgId) return;
                    const orgScope = { drive: { orgId: sessionOrgId } };
                    // Check for NEW applications
                    const newApps = await prisma.application.findMany({
                        where: { ...orgScope, createdAt: { gt: lastCheck } },
                        select: { id: true, fullName: true, email: true, createdAt: true },
                        orderBy: { createdAt: "desc" },
                        take: 5
                    });
                    // Check for UPDATED applications (status changes by AI worker etc.)
                    const updatedApps = await prisma.application.findMany({
                        where: {
                            ...orgScope,
                            updatedAt: { gt: lastCheck },
                            createdAt: { lte: lastCheck } // exclude newly created (already caught above)
                        },
                        select: { id: true, resumeStatus: true, interviewStatus: true, updatedAt: true },
                        orderBy: { updatedAt: "desc" },
                        take: 10
                    });
                    if (newApps.length > 0) {
                        send({ type: "NEW_APPLICATIONS", count: newApps.length });
                    }
                    if (updatedApps.length > 0) {
                        send({ type: "UPDATED_APPLICATIONS", count: updatedApps.length });
                    }
                    if (newApps.length > 0 || updatedApps.length > 0) {
                        lastCheck = new Date();
                    }
                } catch (e) {
                    // Ignore errors during high load
                }
            };
            // Fire immediately on connect so the client is in sync right away.
            checkForUpdates();
            // Poll every 3 seconds while connection is open.
            // This is the only mechanism the frontend has to learn about worker completion —
            // the worker updates DB and this poll detects the updatedAt change.
            const interval = setInterval(checkForUpdates, 3000);
            request.signal.addEventListener("abort", () => {
                closed = true;
                clearInterval(interval);
            });
        }
    });
    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    });
}
