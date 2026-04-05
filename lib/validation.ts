import { z } from "zod";

export const driveIdSchema = z.object({
  id: z.string().min(1, "Drive ID is required"),
});

export const createDriveSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional().default(""),
  department: z.string().min(1, "Department is required"),
  employmentType: z.enum(["Full-time", "Part-time", "Contract", "Internship", "Freelance"]).optional(),
  type: z.enum(["Full-time", "Part-time", "Contract", "Internship", "Freelance"]).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "CLOSED"]).optional(),
  workMode: z.enum(["Remote", "Hybrid", "On-site"]).optional(),
  positions: z.coerce.number().int().min(1).optional(),
  deadline: z.string().nullable().optional(), // Relaxed validation to accept YYYY-MM-DD or ISO
  salary: z.string().optional(),
  experience: z.string().optional(),
  skills: z.string().optional(),
  responsibilities: z.string().optional(),
  aiScreening: z.object({
    enabled: z.boolean().optional()
  }).optional(),
  registrationFields: z.array(z.any()).optional(),
  extractedDetails: z.record(z.string(), z.any()).optional(),
  location: z.string().optional(),
});

export const updateDriveSchema = createDriveSchema.partial();

export const bulkDeleteSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, "At least one ID required"),
});

export const candidateIdSchema = z.object({
  id: z.string().min(1, "Candidate ID is required"),
});

export const createCandidateSchema = z.object({
  driveId: z.coerce.number().int().positive("Valid drive ID required"),
  fullName: z.string().min(1, "Full name is required").max(100),
  email: z.string().email("Valid email required"),
  phone: z.string().min(1, "Phone is required").max(20),
  resumeUrl: z.string().optional(), // Relaxed for mocks/internal paths
  resumeText: z.string().optional(),
  structuredResume: z.any().optional(),
  portfolio: z.string().optional(), // Relaxed
  currentCompany: z.string().optional(),
  experience: z.string().optional(), // Added alias for frontend compatibility
  experienceYears: z.coerce.number().optional(),
  ctc: z.string().optional(),
  currentCtc: z.string().optional(), // Added alias for frontend compatibility
  expectedCtc: z.string().optional(),
  noticePeriod: z.string().optional(),
  coverLetter: z.string().optional(),
});

export const bulkDeleteCandidatesSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "At least one ID required"),
});

export const interviewTokenSchema = z.object({
  applicationId: z.string().min(1, "Application ID required"),
  participantName: z.string().min(1, "Participant name required").max(100),
});

export const presignedUrlSchema = z.object({
  fileName: z.string().min(1, "File name required").max(255),
  fileType: z.string().min(1, "File type required").regex(/^[\w-]+\/[\w-]+$/, "Invalid MIME type"),
  driveId: z.coerce.number().int().positive().optional(),
});

export const extractSchema = z.object({
  type: z.enum(["JD", "RESUME"]),
  url: z.string().url().optional(),
});

export const driveQuerySchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "CLOSED"]).nullish().transform(v => v ?? undefined),
});

export const candidateQuerySchema = z.object({
  driveId: z.preprocess(
    v => (v === null || v === "" || v === undefined ? undefined : v),
    z.coerce.number().int().positive().optional()
  ),
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
