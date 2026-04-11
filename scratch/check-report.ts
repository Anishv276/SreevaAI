import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const latestApp = await prisma.application.findFirst({
    where: { aiReport: { not: null } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, aiReport: true }
  });

  if (!latestApp) {
    console.log('No applications with AI reports found.');
    return;
  }

  console.log('--- Latest Application Report ---');
  console.log('ID:', latestApp.id);
  try {
    const report = JSON.parse(latestApp.aiReport || '{}');
    console.log('Fields present:', Object.keys(report));
    console.log('Seniority Alignment:', report.seniority_alignment);
    console.log('Career Progression:', report.career_progression_details);
  } catch (e) {
    console.log('Failed to parse AI report:', latestApp.aiReport);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
