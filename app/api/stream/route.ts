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
                    const newApps = await prisma.application.findMany({
                        where: { createdAt: { gt: lastCheck } },
                        include: { drive: { select: { title: true } } },
                        orderBy: { createdAt: "desc" }
                    });

                    if (newApps.length > 0) {
                        send({
                            type: "NEW_APPLICATIONS",
                            data: newApps.map(app => ({
                                id: app.id,
                                name: app.fullName,
                                email: app.email,
                                role: app.drive?.title || "Unknown",
                                status: app.status,
                                date: app.createdAt
                            }))
                        });
                        lastCheck = new Date();
                    }

                    // Check for status updates
                    const updatedApps = await prisma.application.findMany({
                        where: { updatedAt: { gt: lastCheck } },
                        include: { 
                            drive: { select: { title: true } },
                            interview: { select: { status: true } }
                        },
                        orderBy: { updatedAt: "desc" }
                    });

                    if (updatedApps.length > 0) {
                        send({
                            type: "UPDATED_APPLICATIONS",
                            data: updatedApps.map(app => ({
                                id: app.id,
                                name: app.fullName,
                                email: app.email,
                                role: app.drive?.title || "Unknown",
                                status: app.status,
                                interviewStatus: app.interview?.status
                            }))
                        });
                    }
                } catch (e) {
                    // DB error, don't crash
                }
            };

            // Initial check
            await checkForUpdates();

            // Poll every 25 seconds to avoid DB connection exhaustion (pool limit is 25)
            const interval = setInterval(checkForUpdates, 25000);

            // Cleanup on close
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
