import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

function createPrismaClient() {
    // Supabase recommends using the direct/session connection for persistent
    // app servers and reserving the transaction pooler for transient/serverless
    // traffic. Prefer DIRECT_URL here because this Next dev server keeps
    // long-lived connections open across many admin requests.
    const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL
    if (!databaseUrl) {
        throw new Error('DIRECT_URL or DATABASE_URL is not set')
    }

    const connectionUrl = new URL(databaseUrl)
    connectionUrl.searchParams.set('uselibpqcompat', 'true')
    connectionUrl.searchParams.set('sslmode', 'require')
    // Move pool tuning out of the URL so we can control Prisma's pool directly.
    connectionUrl.searchParams.delete('connect_timeout')
    connectionUrl.searchParams.delete('connection_limit')

    const adapter = new PrismaPg({
        connectionString: connectionUrl.toString(),
        connectionTimeoutMillis: 10_000,
        max: 10,
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
