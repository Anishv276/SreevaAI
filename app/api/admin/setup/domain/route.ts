import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const { domain } = await request.json();
        if (!domain) return NextResponse.json({ error: "Domain is required" }, { status: 400 });

        // 1. Create domain in Resend
        const { data, error } = await resend.domains.create({ name: domain });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        // 2. Update Organization in Prisma
        await prisma.organization.update({
            where: { id: session.orgId as string },
            data: {
                customDomain: domain,
                resendDomainId: data?.id,
                isDomainVerified: false
            } as any
        });

        return NextResponse.json({ 
            id: data?.id, 
            records: data?.records 
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const org = await prisma.organization.findUnique({
            where: { id: session.orgId as string },
            select: { resendDomainId: true, customDomain: true }
        });

        if (!org?.resendDomainId) return NextResponse.json({ error: "No domain registration found." }, { status: 404 });

        // Check Resend Status
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
