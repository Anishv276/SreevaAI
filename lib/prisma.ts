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
    // Move pool tuning out of the URL so we can control Prisma's pool directly.
    connectionUrl.searchParams.delete('connect_timeout')
    connectionUrl.searchParams.delete('connection_limit')

    const adapter = new PrismaPg({
        connectionString: connectionUrl.toString(),
        connectionTimeoutMillis: 5000,
        max: 5,
        min: 1,
        idleTimeoutMillis: 60000,
        allowExitOnIdle: false,
        ssl: { rejectUnauthorized: false }, // Supabase uses self-signed cert in chain
    })
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
