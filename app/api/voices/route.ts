import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listSelectableVoices } from "@/lib/engine-voices";
import { apiErrorResponse } from "@/lib/slack-error-logger";
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const voices = await listSelectableVoices();
    return NextResponse.json({ voices }, {
      headers: { 'Cache-Control': 'private, max-age=600' }
    });
  } catch (error) {
    return apiErrorResponse({
      route: "/api/voices",
      method: "GET",
      error,
      body: { error: "Failed to load voices" },
      status: 500,
      logLabel: "List voices error:",
    });
  }
}
