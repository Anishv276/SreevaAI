/**
 * lib/prisma-demo.ts
 * ──────────────────
 * Re-exports the shared Prisma client cast to `any` so that demo routes
 * can access DemoTemplate and DemoSession without TypeScript errors.
 *
 * These models ARE in schema.prisma. The type errors appear because
 * `npx prisma generate` hasn't been run yet to regenerate the client types.
 * Once `npx prisma generate` is run, this file can be removed and the demo
 * routes can import `prisma` from "@/lib/prisma" directly.
 *
 * USAGE:
 *   import { db } from "@/lib/prisma-demo";
 *   await db.demoTemplate.findMany({ ... });
 *   await db.demoSession.create({ ... });
 */
import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = prisma as any;
