
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDb() {
  try {
    const orgCount = await prisma.organization.count();
    const userCount = await prisma.user.count();
    
    console.log('--- DATABASE STATUS ---');
    console.log(`Total Organizations: ${orgCount}`);
    console.log(`Total Platform Admins: ${userCount}`);
    console.log('-----------------------');
    
    const recentOrgs = await prisma.organization.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { name: true, slug: true, createdAt: true }
    });
    
    console.log('\n--- 5 MOST RECENT ORGANIZATIONS ---');
    recentOrgs.forEach(o => {
      console.log(`- ${o.name} (${o.slug}) created on ${o.createdAt.toLocaleString()}`);
    });

  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

checkDb();
