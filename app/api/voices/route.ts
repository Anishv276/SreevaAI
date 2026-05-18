import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listSelectableVoices } from "@/lib/engine-voices";

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
    console.error("List voices error:", error);
    return NextResponse.json({ error: "Failed to load voices" }, { status: 500 });
  }
}

