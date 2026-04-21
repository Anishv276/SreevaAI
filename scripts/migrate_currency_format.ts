import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const salaryPattern = /(\d+(?:\s*[-–—]\s*\d+)?)\s*INR\s*LPA/gi;

async function migrate() {
    console.log("Starting migration: INR LPA -> LPA INR");

    const drives = await prisma.drive.findMany({
        where: {
            salary: { contains: "LPA", mode: "insensitive" }
        }
    });

    console.log(`Checking ${drives.length} drives for salary format...`);
    for (const drive of drives) {
        salaryPattern.lastIndex = 0;
        if (!drive.salary || !salaryPattern.test(drive.salary)) continue;

        const newSalary = drive.salary.replace(salaryPattern, "$1 LPA INR");
        console.log(`Updating Drive ${drive.id}: "${drive.salary}" -> "${newSalary}"`);
        await prisma.drive.update({
            where: { id: drive.id },
            data: { salary: newSalary }
        });
    }

    const drivesWithDetails = await prisma.drive.findMany({
        where: {
            extractedDetails: { not: null }
        }
    });

    for (const drive of drivesWithDetails) {
        const details = drive.extractedDetails;
        if (!details) continue;

        const detailsStr = typeof details === "string" ? details : JSON.stringify(details);
        salaryPattern.lastIndex = 0;
        if (!salaryPattern.test(detailsStr)) continue;

        const newDetailsStr = detailsStr.replace(salaryPattern, "$1 LPA INR");
        console.log(`Updating Drive ${drive.id} extractedDetails...`);
        await prisma.drive.update({
            where: { id: drive.id },
            data: { extractedDetails: JSON.parse(newDetailsStr) }
        });
    }

    const applications = await prisma.application.findMany();
    console.log(`Checking ${applications.length} applications for submissionData...`);

    for (const app of applications) {
        const data = app.submissionData;
        if (!data) continue;

        const dataStr = JSON.stringify(data);
        salaryPattern.lastIndex = 0;
        if (!salaryPattern.test(dataStr)) continue;

        const newDataStr = dataStr.replace(salaryPattern, "$1 LPA INR");
        console.log(`Updating Application ${app.id} submissionData...`);
        await prisma.application.update({
            where: { id: app.id },
            data: { submissionData: JSON.parse(newDataStr) }
        });
    }

    console.log("Migration complete!");
}

migrate()
    .catch((error) => console.error(error))
    .finally(async () => {
        await prisma.$disconnect();
    });
