import { PrismaClient } from '@prisma/client'

const globalForPrisma = global as unknown as { prisma: PrismaClient }

const basePrisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        log: ['error', 'warn'],
    })

const extendedPrisma = basePrisma.$extends({
    query: {
        async $allOperations({ model, operation, args, query }) {
            const TIMEOUT_MS = 20000;
            let timeoutId: any;

            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() =>
                    reject(new Error(`Database Timeout: ${model ? `${model}.` : ''}${operation} exceeded ${TIMEOUT_MS}ms`)),
                    TIMEOUT_MS
                );
            });

            try {
                const result = await Promise.race([query(args), timeoutPromise]);
                clearTimeout(timeoutId);
                return result;
            } catch (err) {
                clearTimeout(timeoutId);
                throw err;
            }
        },
    },
})

export const prisma = extendedPrisma as unknown as PrismaClient

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = basePrisma
}


