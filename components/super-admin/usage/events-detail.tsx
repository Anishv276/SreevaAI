"use client";
import React from "react";
import { Activity, Loader2 } from "lucide-react";
import type { EventsSectionSlug, UsageEventRow, UsageEventsResponse } from "./usage-types";

// Paginated per-item detail table for one section, backed by the UsageEvent
// ledger (.../usage/events?section=). Renders a "Legacy (before detailed
// tracking)" footer row for the blob-minus-ledger remainder so the section
// total reconciles with the org aggregate shown in the overview.

type ColKey = "job" | "candidate" | "model" | "calls" | "tokens" | "tts" | "stt" | "cost";

const COLUMN_PRESETS: Record<string, ColKey[]> = {
  jd: ["job", "model", "calls", "tokens", "cost"],
  resume: ["candidate", "job", "model", "calls", "tokens", "cost"],
  "resume-report": ["candidate", "job", "model", "calls", "tokens", "cost"],
  report: ["candidate", "job", "model", "calls", "tokens", "cost"],
  "interview-tts": ["job", "candidate", "model", "calls", "tts", "cost"],
  "interview-stt": ["candidate", "job", "model", "calls", "stt", "cost"],
  "interview-generation": ["candidate", "job", "model", "calls", "tokens", "cost"],
  "interview-eval": ["candidate", "job", "model", "calls", "tokens", "cost"],
};

const COL_LABEL: Record<ColKey, string> = {
  job: "Job",
  candidate: "Candidate",
  model: "Model",
  calls: "Calls",
  tokens: "Tokens",
  tts: "Characters",
  stt: "Audio (s)",
  cost: "Cost",
};

function cell(row: UsageEventRow, col: ColKey, fmt: (n: number) => string): React.ReactNode {
  switch (col) {
    case "job":
      return row.jobTitle || row.label || <span className="text-gray-300">—</span>;
    case "candidate":
      return row.candidateName || <span className="text-gray-300">—</span>;
    case "model":
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="font-medium text-gray-800">{row.model}</span>
          <span className="text-[10px] uppercase tracking-wide text-gray-400">{row.provider}</span>
          {row.kind === "embedding" && (
            <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-600">
              Embedding
            </span>
          )}
          {/* Distinguishes the 2 real LLM calls behind one resume extraction/report
              (structural + semantic pass; report generation + semantic matching) --
              row.label carries the call name for these rows since jobTitle already
              covers the "job" column for them. */}
          {row.jobTitle && row.label && (
            <span className="text-[10px] italic text-gray-400">{row.label}</span>
          )}
        </span>
      );
    case "calls":
      return <span className="tabular-nums">{row.calls.toLocaleString()}</span>;
    case "tokens":
      return (
        <span className="tabular-nums text-gray-500">
          {(row.inputTokens + row.outputTokens).toLocaleString()}
        </span>
      );
    case "tts":
      return <span className="tabular-nums text-gray-500">{row.ttsCharacters.toLocaleString()}</span>;
    case "stt":
      return <span className="tabular-nums text-gray-500">{Math.round(row.sttAudioSeconds).toLocaleString()}</span>;
    case "cost":
      return <span className="font-bold text-gray-900 tabular-nums">{fmt(row.costUsd)}</span>;
  }
}

export function EventsDetail({
  orgId,
  section,
  fmt,
  accent = "#7C3AED",
}: {
  orgId: string;
  section: EventsSectionSlug;
  fmt: (n: number) => string;
  accent?: string;
}) {
  const [rows, setRows] = React.useState<UsageEventRow[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [totals, setTotals] = React.useState<UsageEventsResponse["sectionTotals"] | null>(null);
  const [legacy, setLegacy] = React.useState<UsageEventsResponse["legacy"]>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const cols = COLUMN_PRESETS[section] || ["model", "calls", "cost"];

  const load = React.useCallback(
    async (cur: string | null, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const url = `/api/super-admin/orgs/${orgId}/usage/events?section=${section}&limit=25${cur ? `&cursor=${cur}` : ""}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        const data: UsageEventsResponse = await res.json();
        setRows((prev) => (append ? [...prev, ...data.rows] : data.rows));
        setCursor(data.nextCursor);
        setTotals(data.sectionTotals);
        setLegacy(data.legacy);
      } catch {
        setError("Unable to load usage details.");
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [orgId, section]
  );

  React.useEffect(() => {
    setRows([]);
    setCursor(null);
    load(null, false);
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading details…
      </div>
    );
  }
  if (error) {
    return <div className="py-8 text-center text-sm text-gray-500">{error}</div>;
  }

  const grandTotal = (totals?.costUsd || 0) + (legacy?.costUsd || 0);

  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm" style={{ border: "1px solid #E9E7FF" }}>
      <table className="w-full text-left text-sm">
        <thead style={{ background: "#F9F8FF", borderBottom: "1px solid #F0EEF8" }}>
          <tr>
            <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</th>
            {cols.map((c) => (
              <th
                key={c}
                className={`px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 ${c === "cost" ? "text-right" : ""}`}
              >
                {COL_LABEL[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: "#F0EEF8" }}>
          {rows.length === 0 && !legacy && (
            <tr>
              <td colSpan={cols.length + 1} className="px-4 py-8 text-center text-gray-400">
                No usage recorded yet for this section.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="transition-colors hover:bg-violet-50/40">
              <td className="whitespace-nowrap px-5 py-3.5 text-xs text-gray-500">
                {new Date(r.createdAt).toLocaleDateString()}
                {r.source === "backfill" && (
                  <span className="ml-2 rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-400">
                    history
                  </span>
                )}
              </td>
              {cols.map((c) => (
                <td key={c} className={`px-5 py-3.5 ${c === "cost" ? "text-right" : ""}`}>
                  {cell(r, c, fmt)}
                </td>
              ))}
            </tr>
          ))}
          {legacy && (
            <tr className="bg-amber-50/30">
              <td className="px-5 py-3.5 text-xs font-medium text-amber-700" colSpan={cols.length}>
                Legacy (before detailed tracking)
              </td>
              <td className="px-5 py-3.5 text-right font-semibold text-amber-800 tabular-nums">{fmt(legacy.costUsd)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr style={{ background: "#FAFAFC", borderTop: "2px solid #E9E7FF" }}>
            <td className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-gray-600" colSpan={cols.length}>
              <span className="inline-flex items-center gap-1.5">
                <Activity className="h-4 w-4" style={{ color: accent }} />
                Section total ({totals?.rows ?? rows.length} events{totals?.calls ? ` · ${totals.calls.toLocaleString()} calls` : ""})
              </span>
            </td>
            <td className="px-5 py-4 text-right text-base font-black tabular-nums" style={{ color: accent }}>
              {fmt(grandTotal)}
            </td>
          </tr>
        </tfoot>
      </table>

      {cursor && (
        <div className="flex justify-center border-t border-gray-100 p-3">
          <button
            type="button"
            onClick={() => load(cursor, true)}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
