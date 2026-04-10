import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkOrgs() {
    try {
        const apps = await prisma.application.findMany({
            include: { drive: true }
        });
        
        console.log("Application Organization Linkage:");
        apps.forEach(a => {
            console.log(`- App ID: ${a.id}, Status: ${a.status}, Drive OrgId: ${a.drive.orgId}`);
        });

        const orgs = await prisma.organization.findMany();
        console.log("\nExisting Organizations:");
        orgs.forEach(o => console.log(`- Org ID: ${o.id}, Name: ${o.name}`));

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

checkOrgs();
