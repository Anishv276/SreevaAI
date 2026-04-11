import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrate() {
    console.log('Starting migration: INR LPA -> LPA INR');

    // 1. Update Drive.salary
    const drives = await prisma.drive.findMany({
        where: {
            salary: { contains: 'LPA', mode: 'insensitive' }
        }
    });

    console.log(`Checking ${drives.length} drives for salary format...`);
    for (const drive of drives) {
        if (!drive.salary) continue;

        // Pattern: [Numbers][Dash][Numbers] INR LPA
        // Supported dashes: - (hyphen), – (en-dash), — (em-dash)
        const regex = /(\d+(?:\s*[–—-]\s*\d+)?)\s*INR\s*LPA/gi;
        
        if (regex.test(drive.salary)) {
            const newSalary = drive.salary.replace(regex, '$1 LPA INR');
            console.log(`Updating Drive ${drive.id}: "${drive.salary}" -> "${newSalary}"`);
            await prisma.drive.update({
                where: { id: drive.id },
                data: { salary: newSalary }
            });
        }
    }

    // 2. Update Drive.extractedDetails (JSON string or object)
    // Some records might have it inside JSON
    const drivesWithDetails = await prisma.drive.findMany({
        where: {
            extractedDetails: { not: null }
        }
    });

    for (const drive of drivesWithDetails) {
        let details = drive.extractedDetails;
        if (!details) continue;

        let detailsStr = typeof details === 'string' ? details : JSON.stringify(details);
        const regex = /(\d+(?:\s*[–—-]\s*\d+)?)\s*INR\s*LPA/gi;

        if (regex.test(detailsStr)) {
            const newDetailsStr = detailsStr.replace(regex, '$1 LPA INR');
            console.log(`Updating Drive ${drive.id} extractedDetails...`);
            await prisma.drive.update({
                where: { id: drive.id },
                data: { extractedDetails: JSON.parse(newDetailsStr) }
            });
        }
    }

    // 3. Update Application.submissionData (Json)
    const applications = await prisma.application.findMany();

    console.log(`Checking ${applications.length} applications for submissionData...`);
    for (const app of applications) {
        let data = app.submissionData;
        if (!data) continue;

        let dataStr = JSON.stringify(data);
        const regex = /(\d+(?:\s*[–—-]\s*\d+)?)\s*INR\s*LPA/gi;

        if (regex.test(dataStr)) {
            const newDataStr = dataStr.replace(regex, '$1 LPA INR');
            console.log(`Updating Application ${app.id} submissionData...`);
            await prisma.application.update({
                where: { id: app.id },
                data: { submissionData: JSON.parse(newDataStr) }
            });
        }
    }

    console.log('Migration complete!');
}

migrate()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
