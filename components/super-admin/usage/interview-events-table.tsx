"use client";
import React from "react";
import { Activity, Loader2 } from "lucide-react";
import type { InterviewEventRow, InterviewEventsResponse } from "./usage-types";

// One row per interview, every sub-feature's runs/cost side by side —
// backed by .../usage/events?section=interview-all.
export function InterviewEventsTable({
  orgId,
  fmt,
  accent = "#7C3AED",
}: {
  orgId: string;
  fmt: (n: number) => string;
  accent?: string;
}) {
  const [rows, setRows] = React.useState<InterviewEventRow[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(
    async (cur: string | null, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const url = `/api/super-admin/orgs/${orgId}/usage/events?section=interview-all&limit=25${cur ? `&cursor=${cur}` : ""}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        const data: InterviewEventsResponse = await res.json();
        setRows((prev) => (append ? [...prev, ...data.rows] : data.rows));
        setCursor(data.nextCursor);
        setTotal(data.totalCostUsd);
      } catch {
        setError("Unable to load interview details.");
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [orgId]
  );

  React.useEffect(() => {
    setRows([]);
    setCursor(null);
    load(null, false);
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading interview details…
      </div>
    );
  }
  if (error) {
    return <div className="py-8 text-center text-sm text-gray-500">{error}</div>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm" style={{ border: "1px solid #E9E7FF" }}>
      <table className="w-full text-left text-sm">
        <thead style={{ background: "#F9F8FF", borderBottom: "1px solid #F0EEF8" }}>
          <tr>
            <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</th>
            <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Job</th>
            <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Candidate</th>
            <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">Eval Runs</th>
            <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">Eval Cost</th>
            <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">Gen Runs</th>
            <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">Gen Cost</th>
            <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">Brief Runs</th>
            <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">Brief Cost</th>
            <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">TTS (chars)</th>
            <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">TTS Cost</th>
            <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">STT (s)</th>
            <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">STT Cost</th>
            <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: "#F0EEF8" }}>
          {rows.length === 0 && (
            <tr>
              <td colSpan={14} className="px-4 py-8 text-center text-gray-400">
                No interview usage recorded yet.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="transition-colors hover:bg-violet-50/40">
              <td className="whitespace-nowrap px-5 py-3.5 text-xs text-gray-500">
                {new Date(r.createdAt).toLocaleDateString()}
              </td>
              <td className="px-5 py-3.5">{r.jobTitle || <span className="text-gray-300">—</span>}</td>
              <td className="px-5 py-3.5">{r.candidateName || <span className="text-gray-300">—</span>}</td>
              <td className="px-5 py-3.5 text-right tabular-nums">{r.evalRuns.toLocaleString()}</td>
              <td className="px-5 py-3.5 text-right tabular-nums">{fmt(r.evalCostUsd)}</td>
              <td className="px-5 py-3.5 text-right tabular-nums">{r.generationRuns.toLocaleString()}</td>
              <td className="px-5 py-3.5 text-right tabular-nums">{fmt(r.generationCostUsd)}</td>
              <td className="px-5 py-3.5 text-right tabular-nums">{r.briefRuns.toLocaleString()}</td>
              <td className="px-5 py-3.5 text-right tabular-nums">{fmt(r.briefCostUsd)}</td>
              <td className="px-5 py-3.5 text-right tabular-nums text-gray-500">{r.ttsCharacters.toLocaleString()}</td>
              <td className="px-5 py-3.5 text-right tabular-nums">{fmt(r.ttsCostUsd)}</td>
              <td className="px-5 py-3.5 text-right tabular-nums text-gray-500">{Math.round(r.sttAudioSeconds).toLocaleString()}</td>
              <td className="px-5 py-3.5 text-right tabular-nums">{fmt(r.sttCostUsd)}</td>
              <td className="px-5 py-3.5 text-right font-bold tabular-nums text-gray-900">{fmt(r.totalCostUsd)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: "#FAFAFC", borderTop: "2px solid #E9E7FF" }}>
            <td className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-gray-600" colSpan={13}>
              <span className="inline-flex items-center gap-1.5">
                <Activity className="h-4 w-4" style={{ color: accent }} />
                Total ({rows.length} interviews)
              </span>
            </td>
            <td className="px-5 py-4 text-right text-base font-black tabular-nums" style={{ color: accent }}>
              {fmt(total)}
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
