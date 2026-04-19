import { PrismaClient } from "@prisma/client";
import { generateId } from "../lib/ids";
const prisma = new PrismaClient();

async function restore() {
    const res = await prisma.interview.upsert({
        where: { applicationId: 'cmnpvrbwt000311x3ehtyxytw' },
        update: { status: 'PENDING' },
        create: {
            id: generateId("int", "restore-candidate"),
            applicationId: 'cmnpvrbwt000311x3ehtyxytw',
            status: 'PENDING'
        }
    });
    console.log("Restored Interview Record:", res);
}

restore().finally(() => prisma.$disconnect());
