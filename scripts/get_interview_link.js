const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { v4: uuidv4 } = require('uuid');

async function main() {
    const targetName = process.argv[2];
    let app;

    if (targetName) {
        console.log(`Searching for candidate: "${targetName}"...`);
        app = await prisma.application.findFirst({
            where: {
                fullName: {
                    contains: targetName,
                    mode: 'insensitive'
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    if (!app && !targetName) {
        app = await prisma.application.findFirst({
            where: { hiringStatus: 'SHORTLISTED' },
            orderBy: { createdAt: 'desc' }
        });

        if (!app) {
            app = await prisma.application.findFirst({
                where: { hiringStatus: { in: ['ACCEPTED', 'shortlisted'] } },
                orderBy: { createdAt: 'desc' }
            });
        }

        if (!app) {
            app = await prisma.application.findFirst({
                orderBy: { createdAt: 'desc' }
            });
        }
    }

    if (!app && targetName) {
        console.log(`Candidate "${targetName}" not found. Creating a test application...`);
        
        // Find a drive to attach to
        let drive = await prisma.drive.findFirst({
            where: { status: 'ACTIVE' },
            select: { id: true }
        });

        if (!drive) {
            drive = await prisma.drive.findFirst({ select: { id: true } });
        }

        if (!drive) {
            // Create a dummy drive if none exist
            const org = await prisma.organization.findFirst({ select: { id: true } });
            const user = await prisma.user.findFirst({ select: { id: true } });
            
            if (!org || !user) {
                console.error("Cannot create test application: No Organization or User found in DB to link to.");
                return;
            }

            drive = await prisma.drive.create({
                data: {
                    id: uuidv4(),
                    title: "Test Drive",
                    description: "Automatically created for testing",
                    department: "Engineering",
                    creatorId: user.id,
                    orgId: org.id,
                    status: 'ACTIVE'
                },
                select: { id: true }
            });
        }

        app = await prisma.application.create({
            data: {
                id: uuidv4(),
                fullName: targetName,
                email: `${targetName.replace(/\s+/g, '.').toLowerCase()}@example.com`,
                phone: "1234567890",
                resumeUrl: "https://example.com/resume.pdf",
                driveId: drive.id,
                hiringStatus: 'shortlisted',
                interviewStatus: 'pending'
            }
        });
    }

    if (app) {
        // Ensure an Interview record exists for this application
        let interview = await prisma.interview.findUnique({
            where: { applicationId: app.id }
        });

        if (!interview) {
            interview = await prisma.interview.create({
                data: {
                    id: uuidv4(),
                    applicationId: app.id,
                    status: 'PENDING'
                }
            });
        }

        console.log(`\nInterview Link for ${app.fullName}:`);
        console.log(`https://sreevaai.com/interview/${app.id}`);
    } else {
        console.log("No candidates found or could be created.");
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
