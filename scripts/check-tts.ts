import { prisma } from "../lib/prisma";
async function main() {
    const orgs = await prisma.organizationDetails.findMany({
        select: { id: true, name: true, defaultVoiceId: true, allowedVoiceIds: true }
    });
    console.log(JSON.stringify(orgs, null, 2));
    await prisma.$disconnect();
}
main().catch(console.error);
