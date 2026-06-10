import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
    const orgId = "sreeva-org-id";
    const email = "support@sreevaai.com";
    // Never hardcode the credential. Supply it at run time:
    //   SUPERADMIN_PASSWORD='...' npx tsx scripts/bootstrap_new_account.ts
    const password = process.env.SUPERADMIN_PASSWORD?.trim();
    if (!password || password.length < 12) {
        console.error("❌ SUPERADMIN_PASSWORD env var is required (min 12 chars). Aborting.");
        process.exit(1);
    }

    console.log("🚀 Performing full database wipe...");

    // 0. Clear existing data
    await prisma.superAdmin.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.organization.deleteMany({});
    console.log("✅ Database cleared.");

    const hashedPassword = await bcrypt.hash(password, 10);

    // 1. Create SuperAdmin Profille
    const superAdmin = await prisma.superAdmin.upsert({
        where: { email },
        update: {
            password: hashedPassword,
            name: "Sreeva Super Admin",
        },
        create: {
            email,
            password: hashedPassword,
            name: "Sreeva Super Admin",
        }
    });
    console.log("✅ SuperAdmin profile created:", email);

    // 2. Create Organization
    const org = await prisma.organization.upsert({
        where: { id: orgId },
        update: {
            name: "Sreeva AI",
            slug: "sreeva",
        },
        create: {
            id: orgId,
            name: "Sreeva AI",
            slug: "sreeva",
            onboardingComplete: true,
        }
    });
    console.log("✅ Organization created:", org.name);

    // 3. Create Admin User (for the organization)
    const user = await prisma.user.upsert({
        where: { email },
        update: {
            password: hashedPassword,
            role: "ADMIN",
            orgId: org.id,
            name: "Sreeva Admin",
        },
        create: {
            id: "admin-user-id",
            email,
            password: hashedPassword,
            role: "ADMIN",
            orgId: org.id,
            name: "Sreeva Admin",
        }
    });
    console.log("✅ Organization Admin user created:", user.email);
    console.log("\n--- LOGIN CREDENTIALS ---");
    console.log(`Email: ${email}`);
    console.log(`Password: (set from SUPERADMIN_PASSWORD env var)`);
    console.log("---------------------------\n");
}

main()
    .catch((e) => {
        console.error("❌ ERROR during bootstrap:", e.message);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
