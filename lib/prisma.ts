import { PrismaClient } from '@prisma/client'

const globalForPrisma = global as unknown as { prisma: PrismaClient }

const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        log: ['error', 'warn'],
    }).$extends({
        query: {
            async $allOperations({ model, operation, args, query }) {
                const TIMEOUT_MS = 20000;
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

export { prisma };

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma
}


