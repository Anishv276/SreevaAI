import { randomInt } from "node:crypto";
/**
 * Generates a human-readable ID: {prefix}-{name-slug}-{4-digit-rand}
 * e.g. org-sreeva-3910, drv-software-engineer-7743, app-john-doe-6612
 */
export function generateId(prefix: string, name: string): string {
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24);
    const rand = randomInt(1000, 10000); // inclusive start, exclusive end
    return `${prefix}-${slug}-${rand}`;
}
