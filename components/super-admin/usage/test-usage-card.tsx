"use client";
import React from "react";
import { FlaskConical, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Internal test-session spend (not customer usage). Sourced from /api/test/billing,
// which reads UsageEvent rows with isTest=true — the same entity ledger real
// billing uses, just excluded from real cost totals everywhere else.
type TestBillingRow = {
  id: string;
  candidate: string;
  job: string;
  date: string;
  ttsCharacters: number;
  sttAudioSeconds: number;
  ttsCost: number;
  sttCost: number;
  evalCost: number;
  evalCalls: number;
  generationCost: number;
  generationCalls: number;
  briefCost: number;
  briefCalls: number;
  reportCost: number;
  reportCalls: number;
  totalCost: number;
};
type TestBilling = {
  rows: TestBillingRow[];
  count: number;
  totals: {
    ttsCost: number; sttCost: number; evalCost: number;
    generationCost: number; briefCost: number; reportCost: number; totalCost: number;
  };
};

export function TestUsageCard({ orgId, fmt }: { orgId: string; fmt: (usd: number) => string }) {
  const [data, setData] = React.useState<TestBilling | null>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/test/billing?orgId=${encodeURIComponent(orgId)}`, { cache: "no-store" });
        if (res.ok && !cancelled) setData(await res.json());
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (!data) return null;
  const t = data.totals;

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm" style={{ border: "1px solid #FDE8CC" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4"
        style={{ background: "#FFFBF3" }}
      >
        <span className="flex items-center gap-2 text-sm font-bold text-amber-800">
          <FlaskConical className="h-4 w-4 text-amber-500" />
          Internal test usage
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-700">
            TEST
          </span>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
            {data.count} sessions · {fmt(t.totalCost)}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-amber-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="grid grid-cols-3 gap-3 border-t border-amber-100 p-5 sm:grid-cols-6">
            {[
              ["TTS", t.ttsCost],
              ["STT", t.sttCost],
              ["Eval", t.evalCost],
              ["Generation", t.generationCost],
              ["Brief", t.briefCost],
              ["Report", t.reportCost],
            ].map(([label, val]) => (
              <div key={label as string} className="rounded-xl bg-amber-50/50 p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-500">{label}</p>
                <p className="mt-1 text-base font-black text-amber-900">{fmt(val as number)}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto border-t border-amber-100">
            <table className="w-full text-left text-sm">
              <thead style={{ background: "#FFFBF3" }}>
                <tr>
                  {["Date", "Interviewer / Job", "Candidate", "TTS", "STT", "LLM Eval", "Generation", "Brief", "Report", "Total"].map((h) => (
                    <th
                      key={h}
                      className={`whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-amber-500 ${h === "Total" ? "text-right" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-50">
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-xs text-amber-400">
                      No test sessions recorded yet.
                    </td>
                  </tr>
                )}
                {data.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-amber-50/40">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-amber-700">
                      {new Date(r.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-amber-900">{r.job}</td>
                    <td className="px-4 py-3 text-amber-900">{r.candidate}</td>
                    <td className="px-4 py-3 tabular-nums text-amber-600">
                      {r.ttsCost > 0 ? fmt(r.ttsCost) : <span className="text-amber-300">—</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-amber-600">
                      {r.sttCost > 0 ? fmt(r.sttCost) : <span className="text-amber-300">—</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-amber-600">
                      {r.evalCalls > 0 ? fmt(r.evalCost) : <span className="text-amber-300">—</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-amber-600">
                      {r.generationCalls > 0 ? fmt(r.generationCost) : <span className="text-amber-300">—</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-amber-600">
                      {r.briefCalls > 0 ? fmt(r.briefCost) : <span className="text-amber-300">—</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-amber-600">
                      {r.reportCalls > 0 ? fmt(r.reportCost) : <span className="text-amber-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-amber-900">{fmt(r.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
