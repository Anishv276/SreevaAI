import "dotenv/config"
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

function createPrismaClient() {
    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) {
        throw new Error('DATABASE_URL is not set')
    }

    const connectionUrl = new URL(databaseUrl)
    connectionUrl.searchParams.set('uselibpqcompat', 'true')
    connectionUrl.searchParams.set('sslmode', 'require')

    const adapter = new PrismaPg(connectionUrl.toString())
    return new PrismaClient({
        adapter,
        log: ['error', 'warn'],
    })
}

const globalForPrisma = global as unknown as {
    prisma?: ReturnType<typeof createPrismaClient>
}

const prisma = globalForPrisma.prisma ?? createPrismaClient()

export { prisma };

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma
}
