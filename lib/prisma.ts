import { Prisma, PrismaClient } from '@prisma/client'
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
