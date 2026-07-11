import "dotenv/config";
import bcrypt from "bcryptjs";
import * as readline from "readline";
import { generateId } from "../lib/ids";
import { normalizeEmail } from "../lib/email";
import { normalizeOrgPlan, DEFAULT_ORG_PLAN } from "../lib/org-plans";
import { prisma } from "../lib/prisma";

const SUPER_ADMIN_EMAIL = "support@sreeevaai.com";
const SUPER_ADMIN_PASSWORD = "Sreeva@2034";
const SUPER_ADMIN_NAME = "Sreeva Super Admin";

function prompt(rl: readline.Interface, question: string): Promise<string> {
    return new Promise((resolve) => rl.question(question, resolve));
}

async function ensureSuperAdmin(): Promise<void> {
    const email = normalizeEmail(SUPER_ADMIN_EMAIL);
    const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);

    await prisma.superAdmin.upsert({
        where: { email },
        update: { password: hashedPassword, name: SUPER_ADMIN_NAME },
        create: { email, password: hashedPassword, name: SUPER_ADMIN_NAME },
    });

    // Also ensure OrganizationCredentials record exists for session auth
    await prisma.organizationCredentials.upsert({
        where: { email },
        update: { password: hashedPassword, name: SUPER_ADMIN_NAME, platformRole: "SUPER_ADMIN" },
        create: {
            id: generateId("usr", SUPER_ADMIN_NAME),
            email,
            password: hashedPassword,
            name: SUPER_ADMIN_NAME,
            platformRole: "SUPER_ADMIN",
        },
    });

    console.log(`\n✅ Super Admin ready: ${email}`);
}

async function createOrg(rl: readline.Interface): Promise<void> {
    console.log("\n--- Create New Organization ---");

    const orgName = (await prompt(rl, "Organization name: ")).trim();
    if (!orgName) {
        console.error("❌ Organization name is required.");
        return;
    }

    const rawSlug = (await prompt(rl, "URL slug (e.g. acme-corp): ")).trim();
    const urlSlug = rawSlug.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (!urlSlug) {
        console.error("❌ URL slug is required.");
        return;
    }

    const existing = await prisma.organizationDetails.findUnique({ where: { urlSlug } });
    if (existing) {
        console.error(`❌ Slug "${urlSlug}" is already taken. Choose another.`);
        return;
    }

    const adminEmail = normalizeEmail(await prompt(rl, "Admin email for this org: "));
    if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
        console.error("❌ Invalid email address.");
        return;
    }

    const existingUser = await prisma.organizationCredentials.findFirst({
        where: { email: { equals: adminEmail, mode: "insensitive" } },
        select: { id: true },
    });
    if (existingUser) {
        console.error(`❌ Email "${adminEmail}" is already in use.`);
        return;
    }

    const adminPassword = (await prompt(rl, "Admin password (min 8 chars): ")).trim();
    if (!adminPassword || adminPassword.length < 8) {
        console.error("❌ Password must be at least 8 characters.");
        return;
    }

    const planInput = (await prompt(rl, "Plan [STARTER/PRO/BUSINESS/ENTERPRISE] (default: STARTER): ")).trim();
    const plan = normalizeOrgPlan(planInput) || DEFAULT_ORG_PLAN;

    const quotaInput = (await prompt(rl, "Interview quota (number of interviews allowed, default 0): ")).trim();
    const totalInterviewsAllowed = Math.max(0, parseInt(quotaInput) || 0);

    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const org = await prisma.organizationDetails.create({
        data: {
            id: generateId("org", orgName),
            name: orgName,
            urlSlug,
            billingPlan: plan,
            totalInterviewsAllowed,
            billingCreditsUsed: 0,
            platformUsageMetrics: {},
            isOnboardingComplete: true,
        },
    });

    const admin = await prisma.organizationCredentials.create({
        data: {
            id: generateId("usr", adminEmail.split("@")[0]),
            email: adminEmail,
            name: orgName,
            password: hashedPassword,
            platformRole: "ADMIN",
            organizationId: org.id,
        },
    });

    console.log("\n✅ Organization created successfully!");
    console.log(`   Org ID    : ${org.id}`);
    console.log(`   Name      : ${org.name}`);
    console.log(`   Slug      : ${org.urlSlug}`);
    console.log(`   Plan      : ${org.billingPlan}`);
    console.log(`   Quota     : ${org.totalInterviewsAllowed} interviews`);
    console.log(`   Admin     : ${admin.email}`);
}

async function listOrgs(): Promise<void> {
    const orgs = await prisma.organizationDetails.findMany({
        where: { isDeleted: false },
        orderBy: { orgCreatedAt: "desc" },
        select: {
            id: true,
            name: true,
            urlSlug: true,
            billingPlan: true,
            orgStatus: true,
            totalInterviewsAllowed: true,
            totalInterviewsUsed: true,
            orgCreatedAt: true,
        },
    });

    if (orgs.length === 0) {
        console.log("\n  No organizations found.");
        return;
    }

    console.log(`\n  ${"ID".padEnd(30)} ${"Name".padEnd(25)} ${"Slug".padEnd(20)} ${"Plan".padEnd(12)} ${"Quota".padEnd(8)} Status`);
    console.log("  " + "-".repeat(110));
    for (const org of orgs) {
        const quota = `${org.totalInterviewsUsed}/${org.totalInterviewsAllowed}`;
        console.log(
            `  ${org.id.padEnd(30)} ${org.name.padEnd(25)} ${org.urlSlug.padEnd(20)} ${org.billingPlan.padEnd(12)} ${quota.padEnd(8)} ${org.orgStatus}`
        );
    }
}

async function main(): Promise<void> {
    console.log("\n========================================");
    console.log("  SreevaAI Super Admin Management CLI");
    console.log("========================================");

    console.log("\nEnsuring Super Admin account...");
    await ensureSuperAdmin();

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    let running = true;
    while (running) {
        console.log("\nWhat would you like to do?");
        console.log("  1. Create a new organization");
        console.log("  2. List all organizations");
        console.log("  3. Exit");

        const choice = (await prompt(rl, "\nChoice [1/2/3]: ")).trim();

        switch (choice) {
            case "1":
                await createOrg(rl);
                break;
            case "2":
                await listOrgs();
                break;
            case "3":
            case "":
                running = false;
                break;
            default:
                console.log("  Invalid choice. Enter 1, 2, or 3.");
        }
    }

    rl.close();
    console.log("\nDone.\n");
}

main()
    .catch((e) => {
        console.error("❌ ERROR:", e.message);
        process.exit(1);
    });
