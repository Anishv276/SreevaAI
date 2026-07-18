import { Prisma, PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { readFileSync } from 'fs'
import { join } from 'path'

// Supabase's Postgres endpoints present a cert chain rooted at Supabase's own
// CA (not a public CA), so Node's default trust store can't verify it. Pin
// that root explicitly instead of disabling verification.
const SUPABASE_CA = readFileSync(join(process.cwd(), 'certs', 'supabase-root-ca.pem'), 'utf8')
const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1'])

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
    // sslmode is intentionally NOT set here -- pg-connection-string treats it as
    // an alias that overrides the explicit `ssl` option below with a bare
    // `rejectUnauthorized: true` (no CA), which then fails to verify Supabase's
    // self-signed root. TLS is still enforced via the `ssl` option itself.
    connectionUrl.searchParams.delete('sslmode')
    // Move pool tuning out of the URL so we can control Prisma's pool directly.
    connectionUrl.searchParams.delete('connect_timeout')
    connectionUrl.searchParams.delete('connection_limit')
    // Local Docker Postgres (used in dev via .env.local) doesn't support SSL at
    // all, unlike Supabase. Only pin the Supabase CA when we're actually talking
    // to a remote host.
    const isLocalDb = LOCAL_DB_HOSTS.has(connectionUrl.hostname)
    const adapter = new PrismaPg({
        connectionString: connectionUrl.toString(),
        connectionTimeoutMillis: 10_000,
        max: 10,
        min: 1,
        idleTimeoutMillis: 60000,
        allowExitOnIdle: false,
        ssl: isLocalDb ? false : { rejectUnauthorized: true, ca: SUPABASE_CA },
    })
    const baseClient = new PrismaClient({
        adapter,
        log: ['error', 'warn'],
    });
    const modelsWithIsDeleted = new Set(
        Prisma.dmmf.datamodel.models
            .filter(m => m.fields.some(f => f.name === 'isDeleted'))
            .map(m => m.name)
    );
    return baseClient.$extends({
        query: {
            $allModels: {
                async findMany({ model, args, query }) {
                    if (modelsWithIsDeleted.has(model)) {
                        args.where = { isDeleted: false, ...(args.where as any) } as any;
                    }
                    return query(args);
                },
                async findFirst({ model, args, query }) {
                    if (modelsWithIsDeleted.has(model)) {
                        args.where = { isDeleted: false, ...(args.where as any) } as any;
                    }
                    return query(args);
                },
                async findFirstOrThrow({ model, args, query }) {
                    if (modelsWithIsDeleted.has(model)) {
                        args.where = { isDeleted: false, ...(args.where as any) } as any;
                    }
                    return query(args);
                },
                async findUnique({ model, args, query }) {
                    if (modelsWithIsDeleted.has(model)) {
                        return (baseClient as any)[model].findFirst({
                            ...args,
                            where: { isDeleted: false, ...(args.where as any) }
                        });
                    }
                    return query(args);
                },
                async findUniqueOrThrow({ model, args, query }) {
                    if (modelsWithIsDeleted.has(model)) {
                        return (baseClient as any)[model].findFirstOrThrow({
                            ...args,
                            where: { isDeleted: false, ...(args.where as any) }
                        });
                    }
                    return query(args);
                },
                async count({ model, args, query }) {
                    if (modelsWithIsDeleted.has(model)) {
                        args.where = { isDeleted: false, ...(args.where as any) } as any;
                    }
                    return query(args);
                },
                async aggregate({ model, args, query }) {
                    if (modelsWithIsDeleted.has(model)) {
                        args.where = { isDeleted: false, ...(args.where as any) } as any;
                    }
                    return query(args);
                }
            }
        }
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
