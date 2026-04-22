import { prisma } from "../lib/prisma";

async function main() {
    const orgs = await prisma.organization.findMany({
        select: { id: true, name: true, ttsProvider: true, cartesiaVoiceId: true, sarvamVoice: true }
    });
    console.log(JSON.stringify(orgs, null, 2));
    await prisma.$disconnect();
}

main().catch(console.error);
