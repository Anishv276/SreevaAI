import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
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

            const checkForUpdates = async () => {
                if (closed) return;
                
                try {
                    // Check for NEW applications
                    const newApps = await prisma.application.findMany({
                        where: { createdAt: { gt: lastCheck } },
                        select: { id: true, fullName: true, email: true, createdAt: true },
                        orderBy: { createdAt: "desc" },
                        take: 5
                    });

                    // Check for UPDATED applications (status changes by AI worker etc.)
                    const updatedApps = await prisma.application.findMany({
                        where: {
                            updatedAt: { gt: lastCheck },
                            createdAt: { lte: lastCheck } // exclude newly created (already caught above)
                        },
                        select: { id: true, resumeStatus: true, interviewStatus: true, hiringStatus: true, updatedAt: true },
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

            // START: Fire and forget initial check to avoid blocking the stream response
            checkForUpdates();
            
            // Poll every 30 seconds to reduce DB connection pool pressure
            const interval = setInterval(checkForUpdates, 30000);

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
