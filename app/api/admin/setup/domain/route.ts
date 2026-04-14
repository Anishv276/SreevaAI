import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const { domain: rawDomain } = await request.json();
        if (!rawDomain) return NextResponse.json({ error: "Domain is required" }, { status: 400 });
        // Strip www. prefix — Resend registers the apex domain
        const domain = rawDomain.trim().toLowerCase().replace(/^www\./, "");

        // 1. Check if this org already registered this domain through our platform
        const org = await prisma.organization.findUnique({
            where: { id: session.orgId as string },
            select: { customDomain: true, resendDomainId: true, isDomainVerified: true }
        });

        if (org?.customDomain === domain && org?.resendDomainId) {
            // Registered through our platform — just return current status so UI can resume
            return NextResponse.json({
                registeredOnPlatform: true,
                isVerified: org.isDomainVerified
            });
        }

        // 2. Check if domain exists in Resend (may have been registered outside our platform)
        const { data: listData } = await resend.domains.list();
        const existing = (listData as any)?.data?.find((d: any) => d.name === domain);

        if (existing) {
            // Domain exists in Resend under our API key — claim it by saving the ID to DB
            await prisma.organization.update({
                where: { id: session.orgId as string },
                data: {
                    customDomain: domain,
                    resendDomainId: existing.id,
                    isDomainVerified: existing.status === "verified"
                }
            });
                return NextResponse.json({ fresh: true });
        }

        // 3. Brand new — create in Resend and save to DB
        const { data, error } = await resend.domains.create({ name: domain });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        await prisma.organization.update({
            where: { id: session.orgId as string },
            data: {
                customDomain: domain,
                resendDomainId: data!.id,
                isDomainVerified: false
            }
        });

        return NextResponse.json({ fresh: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function GET() {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const org = await prisma.organization.findUnique({
            where: { id: session.orgId as string },
            select: { resendDomainId: true, customDomain: true }
        });

        if (!org?.resendDomainId) return NextResponse.json({ error: "No domain registration found." }, { status: 404 });

        // Get latest status directly — do NOT call verify() before get(),
        // as verify() is async and resets all record statuses to "pending" while processing.
        const { data, error } = await resend.domains.get(org.resendDomainId);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        if (data?.status === "verified") {
            await prisma.organization.update({
                where: { id: session.orgId as string },
                data: { isDomainVerified: true } as any
            });
        }

        return NextResponse.json({ 
            status: data?.status, 
            records: data?.records,
            customDomain: org.customDomain 
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
