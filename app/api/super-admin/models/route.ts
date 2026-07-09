import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_ORG_AI_CONFIG, LLM_MODELS, STT_MODELS, TTS_MODELS, ALL_VOICES } from "@/lib/ai-models-config";

const ALLOWED_LLM_IDS = new Set(LLM_MODELS.map(m => m.id));
const ALLOWED_STT_IDS = new Set(STT_MODELS.map(m => m.id));
const ALLOWED_TTS_IDS = new Set(TTS_MODELS.map(m => m.id));
const ALLOWED_VOICE_IDS = new Set(ALL_VOICES.map(v => v.id));

function isSuperAdmin(role: string | undefined) {
  return role === "SUPER_ADMIN";
}

// GET /api/super-admin/models?orgId=xxx -- returns org's current AI config
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) {
    // Return all orgs with their AI config
    const orgs = await prisma.organizationDetails.findMany({
      where: { isDeleted: false },
      select: {
        id: true,
        name: true,
        urlSlug: true,
        sttModel: true,
        ttsProvider: true,
        ttsModel: true,
        defaultVoiceId: true,
        allowedVoiceIds: true,
        llmResumeExtraction: true,
        llmJdExtraction: true,
        llmResumeReport: true,
        llmInterviewLive: true,
        llmInterviewEval: true,
        llmInterviewBrief: true,
        llmInterviewReport: true,
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({
      orgs: orgs.map(({ defaultVoiceId, allowedVoiceIds, urlSlug, ...rest }) => ({
        ...rest,
        slug: urlSlug,
        voiceId: defaultVoiceId,
        allowedVoices: allowedVoiceIds,
      })),
    });
  }

  const org = await prisma.organizationDetails.findFirst({
    where: { id: orgId, isDeleted: false },
    select: {
      id: true,
      name: true,
      urlSlug: true,
      sttModel: true,
      ttsProvider: true,
      ttsModel: true,
      defaultVoiceId: true,
      allowedVoiceIds: true,
      llmResumeExtraction: true,
      llmJdExtraction: true,
      llmResumeReport: true,
      llmInterviewLive: true,
      llmInterviewEval: true,
      llmInterviewBrief: true,
      llmInterviewReport: true,
    },
  });
  if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });
  const { defaultVoiceId, allowedVoiceIds, urlSlug, ...rest } = org;
  return NextResponse.json({
    org: { ...rest, slug: urlSlug, voiceId: defaultVoiceId, allowedVoices: allowedVoiceIds },
  });
}

// PATCH /api/super-admin/models -- update org's AI config
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { orgId, ...fields } = body;
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  // Validate all provided model IDs
  const errors: string[] = [];
  if (fields.sttModel && !ALLOWED_STT_IDS.has(fields.sttModel)) errors.push(`Invalid sttModel: ${fields.sttModel}`);
  if (fields.ttsProvider && !["ELEVENLABS", "CARTESIA", "SARVAM"].includes(fields.ttsProvider)) errors.push(`Invalid ttsProvider: ${fields.ttsProvider}`);
  if (fields.ttsModel && !ALLOWED_TTS_IDS.has(fields.ttsModel)) errors.push(`Invalid ttsModel: ${fields.ttsModel}`);
  if (fields.voiceId && !ALLOWED_VOICE_IDS.has(fields.voiceId)) errors.push(`Invalid voiceId: ${fields.voiceId}`);
  for (const llmField of ["llmResumeExtraction","llmJdExtraction","llmResumeReport","llmInterviewLive","llmInterviewEval","llmInterviewBrief","llmInterviewReport"] as const) {
    if (fields[llmField] && !ALLOWED_LLM_IDS.has(fields[llmField])) errors.push(`Invalid ${llmField}: ${fields[llmField]}`);
  }
  if (errors.length) return NextResponse.json({ error: errors.join("; ") }, { status: 400 });

  // Only update the fields that were sent. Request/response wire contract keeps
  // the old field names (voiceId/allowedVoices); map to the renamed DB columns here.
  const updateData: Record<string, string | string[]> = {};
  const allowedFields = [
    "sttModel","ttsProvider","ttsModel",
    "llmResumeExtraction","llmJdExtraction","llmResumeReport",
    "llmInterviewLive","llmInterviewEval","llmInterviewBrief","llmInterviewReport",
  ];
  for (const f of allowedFields) {
    if (fields[f] !== undefined) updateData[f] = fields[f];
  }
  if (fields.voiceId !== undefined) updateData.defaultVoiceId = fields.voiceId;
  if (fields.allowedVoices !== undefined) updateData.allowedVoiceIds = fields.allowedVoices;

  const updated = await prisma.organizationDetails.update({
    where: { id: orgId },
    data: updateData,
    select: {
      id: true, sttModel: true, ttsProvider: true, ttsModel: true, defaultVoiceId: true, allowedVoiceIds: true,
      llmResumeExtraction: true, llmJdExtraction: true, llmResumeReport: true,
      llmInterviewLive: true, llmInterviewEval: true, llmInterviewBrief: true, llmInterviewReport: true,
    },
  });
  const { defaultVoiceId, allowedVoiceIds, ...rest } = updated;
  return NextResponse.json({ org: { ...rest, voiceId: defaultVoiceId, allowedVoices: allowedVoiceIds } });
}
