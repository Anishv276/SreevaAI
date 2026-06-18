export function normalizeEmail(value: string | null | undefined): string {
    return String(value ?? "").trim().toLowerCase();
}
