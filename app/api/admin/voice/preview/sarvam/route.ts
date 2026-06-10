import { NextRequest } from "next/server";
import { createVoicePreviewResponse } from "@/lib/voice-preview";
import { getSession, isAdminRole, isSuperAdminRole } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (!isAdminRole(session.role) && !isSuperAdminRole(session.role))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { voiceId, transcript, orgId } = await req.json();
    const billingOrgId = isAdminRole(session.role)
      ? session.orgId || null
      : typeof orgId === "string" ? orgId.trim() : null;

    return await createVoicePreviewResponse({ voiceId, transcript, orgId: billingOrgId });
  } catch (err) {
    console.error("[SarvamVoicePreview] Internal error:", err);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
