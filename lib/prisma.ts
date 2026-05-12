import { PrismaClient } from '@prisma/client'

function createPrismaClient() {
    return new PrismaClient({
        log: ['error', 'warn'],
    });
}

const globalForPrisma = global as unknown as {
    prisma?: ReturnType<typeof createPrismaClient>
}

const prisma = globalForPrisma.prisma ?? createPrismaClient()

export { prisma };

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma
}
