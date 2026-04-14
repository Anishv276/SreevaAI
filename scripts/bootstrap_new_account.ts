import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
    const orgId = "lumoscale-org-id";
    const email = "lumoscale@gmail.com";
    const password = "Lumoscale@123";

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
            name: "Lumoscale Super Admin",
        },
        create: {
            email,
            password: hashedPassword,
            name: "Lumoscale Super Admin",
        }
    });
    console.log("✅ SuperAdmin profile created:", email);

    // 2. Create Organization
    const org = await prisma.organization.upsert({
        where: { id: orgId },
        update: {
            name: "Lumoscale",
            slug: "lumoscale",
        },
        create: {
            id: orgId,
            name: "Lumoscale",
            slug: "lumoscale",
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
            name: "Lumoscale Admin",
        },
        create: {
            id: "admin-user-id",
            email,
            password: hashedPassword,
            role: "ADMIN",
            orgId: org.id,
            name: "Lumoscale Admin",
        }
    });
    console.log("✅ Organization Admin user created:", user.email);
    console.log("\n--- LOGIN CREDENTIALS ---");
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
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
