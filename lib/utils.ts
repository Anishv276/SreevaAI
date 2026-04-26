import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Basic HTML tag stripping to prevent XSS.
 * For production, consider a more robust library like DOMPurify.
 */
export function sanitize(input: string): string {
    if (!input || typeof input !== "string") return input;
    return input.replace(/<[^>]*>?/gm, "").trim();
}

/**
 * Recursively sanitizes all string properties in an object.
 */
export function sanitizeObject<T>(obj: T): T {
    if (!obj || typeof obj !== "object") return obj;
    
    // Create new object/array to maintain immutability where possible
    const result: any = Array.isArray(obj) ? [] : {};
    
    for (const [key, value] of Object.entries(obj as any)) {
        if (typeof value === "string") {
            result[key] = sanitize(value);
        } else if (value && typeof value === "object") {
            result[key] = sanitizeObject(value);
        } else {
            result[key] = value;
        }
    }
    
    return result as T;
}

export function safeJsonParse<T>(value: unknown, fallback: T): T {
    if (value === null || value === undefined || value === "") {
        return fallback;
    }

    if (typeof value !== "string") {
        return value as T;
    }

    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}
