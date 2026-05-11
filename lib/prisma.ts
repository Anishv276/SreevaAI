import { PrismaClient } from '@prisma/client'

function createPrismaClient() {
    return new PrismaClient({
        log: ['error', 'warn'],
    }).$extends({
        query: {
            async $allOperations({ model, operation, args, query }) {
                const TIMEOUT_MS = 5000;
                let timeoutId: ReturnType<typeof setTimeout> | undefined;

                const timeoutPromise = new Promise((_, reject) => {
                    timeoutId = setTimeout(() => {
                        reject(new Error(`Database Timeout: ${model ? `${model}.` : ''}${operation} exceeded ${TIMEOUT_MS}ms`));
                    }, TIMEOUT_MS);
                });

                try {
                    const result = await Promise.race([query(args), timeoutPromise]);
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    return result;
                } catch (err) {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    throw err;
                }
            },
        },
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


