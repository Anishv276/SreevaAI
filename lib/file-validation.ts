// Validates uploaded files are actually PDFs before they're stored and served
// back out (via public R2 URLs) as application/pdf. Client-declared MIME type
// and file extension are trivially spoofable, so this checks the real file
// signature (magic bytes) too -- the one thing an attacker can't fake without
// the upload no longer being a valid PDF at all.

export const MAX_RESUME_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const PDF_MAGIC = Buffer.from("%PDF-");

export function isPdfExtension(fileName: string): boolean {
    return /\.pdf$/i.test(fileName);
}

export function hasPdfMagicBytes(buffer: Buffer): boolean {
    return buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);
}

export function validatePdfUpload(file: { name: string; type?: string; size: number }, buffer: Buffer): string | null {
    if (file.size > MAX_RESUME_FILE_BYTES) {
        return `File too large (max ${MAX_RESUME_FILE_BYTES / (1024 * 1024)}MB)`;
    }
    if (!isPdfExtension(file.name)) {
        return "Only .pdf files are accepted";
    }
    if (!hasPdfMagicBytes(buffer)) {
        return "File is not a valid PDF";
    }
    return null;
}
