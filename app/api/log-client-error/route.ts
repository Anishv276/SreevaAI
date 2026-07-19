import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { alertError } from "@/lib/slack-error-logger";

// Client-side errors (modal failures, failed delete/create fetches, uncaught
// React exceptions) never hit instrumentation.ts -- that only fires for
// server-side Next.js errors. The browser reporter (lib/client-error-reporter.ts)
// POSTs here so they reach Slack through the same alertError path as API routes.
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { message, stack, source, url, context } = body || {};
        if (!message || typeof message !== "string") {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        const session = await getSession().catch(() => null);
        let orgName: string | undefined;
        if (session?.orgId) {
            const org = await prisma.organizationDetails.findUnique({
                where: { id: session.orgId },
                select: { name: true },
            });
            orgName = org?.name;
        }

        const error = stack ? Object.assign(new Error(message), { stack }) : message;

        await alertError({
            type: "api",
            orgName,
            userId: session?.userId,
            error,
            reason: `Client-side error (${source || "unknown"}) at ${url || "unknown URL"}`,
            context,
            timestamp: new Date(),
        });

        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error("[log-client-error] failed to process report:", e);
        return NextResponse.json({ ok: false }, { status: 200 }); // never let error reporting itself break the client
    }
}
