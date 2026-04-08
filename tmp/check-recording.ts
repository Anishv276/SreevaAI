import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function check() {
    const applicationId = "cmnpvrbwt000311x3ehtyxytw";
    const interview = await prisma.interview.findUnique({
        where: { applicationId }
    });
    console.log("Interview Record:", JSON.stringify(interview, null, 2));

    const application = await prisma.application.findUnique({
        where: { id: applicationId },
        select: { status: true, fullName: true }
    });
    console.log("Application Record:", JSON.stringify(application, null, 2));
}

check().finally(() => prisma.$disconnect());
