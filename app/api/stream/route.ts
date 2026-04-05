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
                    // Optimization: Performance take limit
                    const newApps = await prisma.application.findMany({
                        where: { createdAt: { gt: lastCheck } },
                        include: { drive: { select: { title: true } } },
                        orderBy: { createdAt: "desc" },
                        take: 5
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
                } catch (e) {
                    // Ignore errors during high load
                }
            };

            // START: Fire and forget initial check to avoid blocking the stream response
            checkForUpdates();
            
            // Poll every 30 seconds
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
