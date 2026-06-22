import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
    const candidates = await prisma.application.findMany({
        where: {
            isDeleted: false,
            resumeData: { not: null },
            OR: [
                { email: "" },
                { phone: "" },
            ],
        },
        select: { id: true, fullName: true, email: true, phone: true, resumeData: true },
    });

    console.log(`Found ${candidates.length} candidates to backfill`);

    let updated = 0;
    let skipped = 0;

    for (const c of candidates) {
        let parsed: any = null;
        try {
            const rd = JSON.parse(c.resumeData!);
            parsed = rd?.parsed ?? null;
        } catch {
            skipped++;
            continue;
        }

        if (!parsed) { skipped++; continue; }

        const newName  = parsed.full_name?.trim() || "";
        const newEmail = parsed.email?.trim()     || "";
        const newPhone = parsed.phone?.trim()     || "";

        const data: any = {};
        if (newName  && c.fullName !== newName)  data.fullName = newName;
        if (newEmail && c.email   !== newEmail)  data.email    = newEmail;
        if (newPhone && c.phone   !== newPhone)  data.phone    = newPhone;

        if (Object.keys(data).length === 0) { skipped++; continue; }

        await prisma.application.update({ where: { id: c.id }, data });
        console.log(`  Updated ${c.id}: ${JSON.stringify(data)}`);
        updated++;
    }

    console.log(`\nDone — updated: ${updated}, skipped: ${skipped}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
