import { readFileSync } from "fs"
import { join } from "path"
import { NextResponse } from "next/server"

export const dynamic = "force-static"

export function GET() {
  const html = readFileSync(join(process.cwd(), "public", "index.html"), "utf-8")
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}
