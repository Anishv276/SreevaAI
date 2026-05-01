import { z } from "zod";

export const driveIdSchema = z.object({
  id: z.string().min(1, "Drive ID is required"),
});

export const createDriveSchema = z.object({
  title: z.preprocess((val) => (typeof val === 'string' && val.trim() !== '') ? val : "Untitled Drive", z.string().min(1).max(200)),
  description: z.string().max(50000).optional().default(""),
  role: z.string().optional(),
  department: z.preprocess((val) => (typeof val === 'string' && val.trim() !== '') ? val : "General", z.string().min(1)),
  employmentType: z.preprocess((val) => {
    if (!val || val === "" || typeof val !== "string") return "Full-time";
    const lower = val.toLowerCase();
    if (lower.includes("full") || lower.includes("permanent")) return "Full-time";
    if (lower.includes("part")) return "Part-time";
    if (lower.includes("contract")) return "Contract";
    if (lower.includes("intern")) return "Internship";
    if (lower.includes("freelance")) return "Freelance";
    return "Full-time"; // Fallback to default
  }, z.string().optional()).default("Full-time"),
  type: z.preprocess((val) => {
    if (!val || val === "" || typeof val !== "string") return undefined;
    const lower = val.toLowerCase();
    if (lower.includes("full") || lower.includes("permanent")) return "Full-time";
    if (lower.includes("part")) return "Part-time";
    if (lower.includes("contract")) return "Contract";
    if (lower.includes("intern")) return "Internship";
    if (lower.includes("freelance")) return "Freelance";
    return val;
  }, z.string().optional()),
  workMode: z.preprocess((val) => {
    if (!val || val === "" || typeof val !== "string") return undefined;
    const lower = val.toLowerCase();
    if (lower.includes("remote")) return "Remote";
    if (lower.includes("hybrid")) return "Hybrid";
    if (lower.includes("site") || lower.includes("office") || lower.includes("present")) return "On-site";
    return val;
  }, z.string().optional()),
  location: z.string().optional(),
  positions: z.preprocess((val) => {
    if (val === null || val === undefined || val === "") return 1;
    const n = Number(val);
    return isNaN(n) ? 1 : n;
  }, z.coerce.number().int().min(1).optional()).default(1),
  salary: z.string().optional(),
  experience: z.string().optional(),
  skills: z.string().optional(),
  responsibilities: z.string().optional(),
  requirements: z.string().optional(),
  jdFileName: z.string().nullable().optional(),
  jdPreviewUrl: z.string().nullable().optional(),
  interviewLanguage: z.string().optional(),
  interviewAntiCheat: z.string().optional(),
  interviewQuestions: z.array(z.any()).optional(),
  ttsProvider: z.string().optional(),
  cartesiaVoiceId: z.string().nullable().optional(),
  sarvamVoice: z.string().nullable().optional(),
  sarvamModel: z.string().nullable().optional(),
  googleModel: z.string().nullable().optional(),
  googleVoiceName: z.string().nullable().optional(),
  aiName: z.string().optional(),
  registrationFields: z.array(z.any()).optional(),
  extractedDetails: z.record(z.string(), z.any()).optional(),
  screeningThreshold: z.coerce.number().int().optional(),
  screeningCriteria: z.union([z.string(), z.record(z.string(), z.any())]).optional(),
  inviteScheduleDays: z.preprocess((val) => {
    if (val === null || val === undefined || val === "") return undefined;
    const n = Number(val);
    return Number.isNaN(n) ? undefined : n;
  }, z.coerce.number().int().min(1).max(30).optional()),
  shortlistMode: z.enum(["automatic", "manual"]).optional(),
});

export const updateDriveSchema = createDriveSchema.partial();

export const bulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1, "At least one ID required"),
});

export const candidateIdSchema = z.object({
  id: z.string().min(1, "Candidate ID is required"),
});

export const createCandidateSchema = z.object({
  driveId: z.string().min(1, "Valid drive ID required"),
  fullName: z.string().min(1, "Full name is required").max(100),
  email: z.string().email("Valid email required"),
  phone: z.string()
    .min(1, "Phone is required")
    .max(25)
    .transform((val) => val.replace(/[\s\-().]/g, "")) // strip formatting chars
    .refine(
      (val) => /^\+?[1-9]\d{6,14}$/.test(val),
      "Please enter a valid international phone number (e.g. +919876543210 or +1 555-000-0000)"
    ),
  resumeUrl: z.string().optional(), // Relaxed for mocks/internal paths
  resumeText: z.string().optional(),
  structuredResume: z.any().optional(),
  portfolio: z.string().optional(), // Relaxed
  currentCompany: z.string().optional(),
  experience: z.coerce.string().optional(),
  experienceYears: z.coerce.number().optional(),
  ctc: z.coerce.string().optional(),
  currentCtc: z.coerce.string().optional(),
  expectedCtc: z.coerce.string().optional(),
  noticePeriod: z.coerce.string().optional(),
  coverLetter: z.coerce.string().optional(),
}).catchall(z.any());

export const bulkDeleteCandidatesSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "At least one ID required"),
});

export const interviewTokenSchema = z.object({
  applicationId: z.string().min(1, "Application ID required"),
  interviewToken: z.string().min(1, "Access token required"),
  participantName: z.string().min(1, "Participant name required").max(100),
});

export const interviewShutdownSchema = z.object({
  applicationId: z.string().min(1, "Application ID required"),
  interviewToken: z.string().min(1, "Security token required"),
});

export const presignedUrlSchema = z.object({
  fileName: z.string().min(1, "File name required").max(255),
  fileType: z.string().min(1, "File type required").regex(/^[\w-]+\/[\w-]+$/, "Invalid MIME type"),
  fileSize: z.number().max(10 * 1024 * 1024, "File size must be less than 10MB").optional(),
  driveId: z.string().optional(),
  type: z.enum(["JD", "RESUME"]).optional().default("RESUME"),
});

export const extractSchema = z.object({
  type: z.enum(["JD", "RESUME"]),
  url: z.string().url().optional(),
});

export const driveQuerySchema = z.object({
});

export const candidateQuerySchema = z.object({
  driveId: z.string().optional(),
});

export const interviewFinalizeSchema = z.object({
  applicationId: z.string().min(1, "Application ID required"),
  interviewToken: z.string().min(1, "Security token required"),
  interviewStatus: z.enum(["COMPLETED", "FAILED", "NO_SHOW"]).optional(),
  status: z.enum(["COMPLETED", "FAILED", "NO_SHOW"]).optional(), // Legacy support
  appStatus: z.string().optional(),
  recordingUrl: z.string().optional(),
  transcript: z.string().optional(),
  duration: z.coerce.number().optional(),
  snapshots: z.array(z.string()).optional(),
  recordingCompletedAt: z.preprocess((val) => (typeof val === 'string' && val ? new Date(val) : val), z.date().optional()),
  recordingDurationSec: z.coerce.number().optional(),
});

export const proctoringEventsSchema = z.object({
  events: z.array(z.object({
    eventType: z.string(),
    severity: z.string().optional(),
    reason: z.string().optional(),
    durationSeconds: z.number().optional(),
    metadata: z.any().optional(),
    timestamp: z.number().optional(),
  })),
});

export function withZod<T extends z.ZodTypeAny>(
  schema: T,
  handler: (data: z.infer<T>) => Promise<Response>
) {
  return async (request: Request) => {
    try {
      const body = await request.clone().json();
      const result = schema.safeParse(body);

      if (!result.success) {
        return Response.json(
          {
            error: "Validation failed",
            details: result.error.flatten().fieldErrors
          },
          { status: 400 }
        );
      }

      return handler(result.data);
    } catch (error) {
      if (error instanceof SyntaxError) {
        return Response.json({ error: "Invalid JSON" }, { status: 400 });
      }
      throw error;
    }
  };
}

export function withSearchParams<T extends z.ZodTypeAny>(
  schema: T,
  handler: (data: z.infer<T>) => Promise<Response>
) {
  return async (request: Request) => {
    const { searchParams } = new URL(request.url);
    const params: Record<string, string | null> = {};

    for (const [key, value] of searchParams) {
      params[key] = value;
    }

    const result = schema.safeParse(params);

    if (!result.success) {
      return Response.json(
        {
          error: "Invalid query parameters",
          details: result.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

    return handler(result.data);
  };
}

export const strongPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character");

export function validatePasswordStrength(password: string): { isValid: boolean; error?: string } {
  const result = strongPasswordSchema.safeParse(password);
  if (!result.success) {
    return {
      isValid: false,
      error: result.error.issues[0]?.message || "Validation failed"
    };
  }
  return { isValid: true };
}
