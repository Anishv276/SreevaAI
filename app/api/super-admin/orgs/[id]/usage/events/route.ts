import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";

/**
 * GET /api/super-admin/orgs/[id]/usage/events?section=<s>&cursor=<id>&limit=<n>
 *
 * UsageEvent is now an entity-level ledger: ONE row per jd:{jobId} |
 * resume:{applicationId} | interview:{applicationId|interviewId}, holding a
 * `usage` JSON with a per-sub-feature, per-model breakdown (see
 * prisma/schema.prisma's UsageEvent doc comment for the exact shape).
 *
 * Each section here pulls ONE sub-feature key out of that JSON (e.g. "jd"
 * reads usage.jdExtraction.llm[], "interview-eval" reads usage.eval.llm[])
 * and expands every (entity, model) combination into its own display row —
 * the UI still renders a flat table, this route just synthesizes it from the
 * nested per-entity storage instead of reading flat per-call rows.
 */

type SubFeature =
  | { kind: "llm"; path: string } // usage[path].llm[]
  | { kind: "audio"; path: "tts" | "stt" }; // usage.tts|stt.byModel[]

const SECTION_MAP: Record<string, { feature: string; sub: SubFeature }> = {
  jd: { feature: "jdExtraction", sub: { kind: "llm", path: "jdExtraction" } },
  resume: { feature: "resumeExtraction", sub: { kind: "llm", path: "resumeExtraction" } },
  "resume-report": { feature: "resumeExtraction", sub: { kind: "llm", path: "resumeReport" } },
  report: { feature: "interview", sub: { kind: "llm", path: "report" } },
  "interview-tts": { feature: "interview", sub: { kind: "audio", path: "tts" } },
  "interview-stt": { feature: "interview", sub: { kind: "audio", path: "stt" } },
  "interview-generation": { feature: "interview", sub: { kind: "llm", path: "llmGeneration" } },
  "interview-eval": { feature: "interview", sub: { kind: "llm", path: "eval" } },
};

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
const round = (v: number) => Math.round(v * 1e6) / 1e6;

type EntityRow = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  usage: unknown;
  jobTitle: string | null;
  candidateName: string | null;
};

type DisplayRow = {
  id: string;
  createdAt: string;
  feature: string;
  kind: "llm" | "tts" | "stt" | "embedding";
  provider: string;
  model: string;
  calls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  ttsCharacters: number;
  sttAudioSeconds: number;
  costUsd: number;
  jobTitle: string | null;
  candidateName: string | null;
  label: string | null;
  source: "live" | "backfill";
};

/** Expand one entity row's usage[sub] fragment into per-model display rows. */
function expandRow(entity: EntityRow, sub: SubFeature): DisplayRow[] {
  const usage = (entity.usage && typeof entity.usage === "object") ? (entity.usage as Record<string, any>) : {};
  const bucket = usage[sub.path];
  if (!bucket || typeof bucket !== "object") return [];

  if (sub.kind === "llm") {
    const arr = Array.isArray(bucket.llm) ? bucket.llm : [];
    if (arr.length === 0) return [];

    // resumeReport's llm[] mixes the report-writing chat call with a scoring
    // embedding call -- shown to the org as one "Resume Report" line item, not
    // a per-model breakdown (the split still lives in the stored usage JSON).
    if (sub.path === "resumeReport") {
      const merged = arr.reduce((acc: any, m: any) => ({
        calls: acc.calls + n(m.calls),
        inputTokens: acc.inputTokens + n(m.inputTokens),
        cachedInputTokens: acc.cachedInputTokens + n(m.cachedInputTokens),
        outputTokens: acc.outputTokens + n(m.outputTokens),
        costUsd: acc.costUsd + n(m.costUsd),
      }), { calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0 });
      const primary = arr.reduce((best: any, m: any) => (n(m.costUsd) > n(best?.costUsd ?? -1) ? m : best), null);
      return [{
        id: `${entity.id}:${sub.path}`,
        createdAt: entity.createdAt.toISOString(),
        feature: sub.path,
        kind: "llm",
        provider: String(primary?.provider || "openai"),
        model: String(primary?.model || "unknown"),
        calls: merged.calls,
        inputTokens: merged.inputTokens,
        cachedInputTokens: merged.cachedInputTokens,
        outputTokens: merged.outputTokens,
        ttsCharacters: 0,
        sttAudioSeconds: 0,
        costUsd: round(merged.costUsd),
        jobTitle: entity.jobTitle,
        candidateName: entity.candidateName,
        label: null,
        source: "live",
      }];
    }

    return arr.map((m: any, i: number): DisplayRow => ({
      id: `${entity.id}:${sub.path}:${i}`,
      createdAt: entity.createdAt.toISOString(),
      feature: sub.path,
      kind: "llm",
      provider: String(m.provider || "openai"),
      model: String(m.model || "unknown"),
      calls: n(m.calls),
      inputTokens: n(m.inputTokens),
      cachedInputTokens: n(m.cachedInputTokens),
      outputTokens: n(m.outputTokens),
      ttsCharacters: 0,
      sttAudioSeconds: 0,
      costUsd: round(n(m.costUsd)),
      jobTitle: entity.jobTitle,
      candidateName: entity.candidateName,
      label: null,
      source: "live",
    }));
  }

  // audio (tts/stt)
  const arr = Array.isArray(bucket.byModel) ? bucket.byModel : [];
  const unitKey = sub.path === "tts" ? "characters" : "seconds";
  return arr.map((m: any, i: number): DisplayRow => ({
    id: `${entity.id}:${sub.path}:${i}`,
    createdAt: entity.createdAt.toISOString(),
    feature: "interview",
    kind: sub.path,
    provider: String(m.provider || "unknown"),
    model: String(m.model || "unknown"),
    calls: n(m.calls),
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    ttsCharacters: sub.path === "tts" ? n(m[unitKey]) : 0,
    sttAudioSeconds: sub.path === "stt" ? n(m[unitKey]) : 0,
    costUsd: round(n(m.costUsd)),
    jobTitle: entity.jobTitle,
    candidateName: entity.candidateName,
    label: null,
    source: "live",
  }));
}

function subCostUsd(entity: EntityRow, sub: SubFeature): number {
  const usage = (entity.usage && typeof entity.usage === "object") ? (entity.usage as Record<string, any>) : {};
  const bucket = usage[sub.path];
  if (!bucket || typeof bucket !== "object") return 0;
  if (sub.kind === "llm") {
    const arr = Array.isArray(bucket.llm) ? bucket.llm : [];
    return arr.reduce((s: number, m: any) => s + n(m.costUsd), 0);
  }
  return n(bucket.costUsd);
}

// One merged row per interview:{appId|interviewId} entity — every sub-feature's
// calls/cost side by side, instead of expanding per (entity, model) like the
// single-sub-feature sections above. Powers the "Interview Sessions" table.
function expandInterviewRow(entity: EntityRow): InterviewDisplayRow {
  const usage = (entity.usage && typeof entity.usage === "object") ? (entity.usage as Record<string, any>) : {};
  const arr = (v: any) => (Array.isArray(v) ? v : []);
  const llmCost = (path: string) => arr(usage[path]?.llm).reduce((s: number, m: any) => s + n(m.costUsd), 0);
  const llmCalls = (path: string) => arr(usage[path]?.llm).reduce((s: number, m: any) => s + n(m.calls), 0);
  const evalCost = llmCost("eval"), evalCalls = llmCalls("eval");
  const genCost = llmCost("llmGeneration"), genCalls = llmCalls("llmGeneration");
  const ttsCost = n(usage.tts?.costUsd), ttsCharacters = arr(usage.tts?.byModel).reduce((s: number, m: any) => s + n(m.characters), 0);
  const sttCost = n(usage.stt?.costUsd), sttAudioSeconds = arr(usage.stt?.byModel).reduce((s: number, m: any) => s + n(m.seconds), 0);
  const totalCost = evalCost + genCost + ttsCost + sttCost;
  return {
    id: entity.id,
    createdAt: entity.createdAt.toISOString(),
    jobTitle: entity.jobTitle,
    candidateName: entity.candidateName,
    evalRuns: evalCalls, evalCostUsd: round(evalCost),
    generationRuns: genCalls, generationCostUsd: round(genCost),
    ttsCharacters, ttsCostUsd: round(ttsCost),
    sttAudioSeconds, sttCostUsd: round(sttCost),
    totalCostUsd: round(totalCost),
  };
}

type InterviewDisplayRow = {
  id: string;
  createdAt: string;
  jobTitle: string | null;
  candidateName: string | null;
  evalRuns: number; evalCostUsd: number;
  generationRuns: number; generationCostUsd: number;
  ttsCharacters: number; ttsCostUsd: number;
  sttAudioSeconds: number; sttCostUsd: number;
  totalCostUsd: number;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
    }
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const section = searchParams.get("section") || "";
    const cursor = searchParams.get("cursor");
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 25, 1), 100);

    if (section === "interview-all") {
      const entities = await prisma.usageEvent.findMany({
        where: { organizationId: id, feature: "interview", isTest: false },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: { id: true, createdAt: true, updatedAt: true, usage: true, jobTitle: true, candidateName: true },
      });
      let nextCursor: string | null = null;
      if (entities.length > limit) {
        const extra = entities.pop()!;
        nextCursor = extra.id;
      }
      const rows = entities.map(expandInterviewRow);
      const totalCostUsd = round(rows.reduce((s, r) => s + r.totalCostUsd, 0));
      return NextResponse.json({ rows, nextCursor, totalCostUsd });
    }

    const map = SECTION_MAP[section];
    if (!map) return NextResponse.json({ error: `Unknown section '${section}'` }, { status: 400 });

    // Entity rows are fetched newest-first and expanded into display rows
    // in-memory (one entity -> 0..N per-model rows for this sub-feature).
    // Pagination cursors on the entity id; a page may return fewer than
    // `limit` display rows if entities have few models, which is fine —
    // the "Load more" button just fetches the next entity page.
    const entities = await prisma.usageEvent.findMany({
      where: { organizationId: id, feature: map.feature, isTest: false },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, createdAt: true, updatedAt: true, usage: true, jobTitle: true, candidateName: true },
    });

    let nextCursor: string | null = null;
    if (entities.length > limit) {
      const extra = entities.pop()!;
      nextCursor = extra.id;
    }

    const rows = entities.flatMap((e) => expandRow(e, map.sub));

    // Section totals: sum this sub-feature's cost across ALL entities (not just this page).
    const allEntities = await prisma.usageEvent.findMany({
      where: { organizationId: id, feature: map.feature, isTest: false },
      select: { id: true, createdAt: true, updatedAt: true, usage: true, jobTitle: true, candidateName: true },
    });
    let ledgerCost = 0;
    let callCount = 0;
    let rowCount = 0;
    for (const e of allEntities) {
      ledgerCost += subCostUsd(e, map.sub);
      const expanded = expandRow(e, map.sub);
      rowCount += expanded.length;
      callCount += expanded.reduce((s, r) => s + r.calls, 0);
    }
    ledgerCost = round(ledgerCost);
    const sectionTotals = { costUsd: ledgerCost, calls: callCount, rows: rowCount };

    // UsageEvent is the sole source of truth now — there is no blob remainder,
    // so `legacy` is always null (the UI's "Legacy" footer row simply never shows).
    return NextResponse.json({ rows, nextCursor, sectionTotals, legacy: null });
  } catch (error) {
    return apiErrorResponse({
      route: "/api/super-admin/orgs/[id]/usage/events",
      method: "GET",
      error,
      body: { error: "Failed to fetch usage events" },
      status: 500,
      logLabel: "Error fetching org usage events:",
    });
  }
}
