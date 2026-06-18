import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function run() {
    console.log('--- SUPERADMIN TABLE ---');
    const superAdmins = await p.superAdmin.findMany();
    console.log(JSON.stringify(superAdmins, null, 2));
    console.log('\n--- USERS WITH SUPER_ADMIN ROLE ---');
    const users = await p.user.findMany({
        where: { role: 'SUPER_ADMIN' }
    });
    console.log(JSON.stringify(users, null, 2));
}
run()
    .catch(console.error)
    .finally(() => p.$disconnect());
