"use client";
import React from "react";
import { FlaskConical, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Internal test-session spend (not customer usage). Sourced from /api/test/billing.
type TestBilling = {
  count: number;
  totals: { llmCost: number; ttsCost: number; sttCost: number; reportCost: number; totalCost: number };
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

  if (!data || data.count === 0) return null;
  const t = data.totals;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-gray-700">
          <FlaskConical className="h-4 w-4 text-gray-400" />
          Internal test usage
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
            {data.count} sessions · {fmt(t.totalCost)}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-3 border-t border-gray-100 p-5 sm:grid-cols-4">
          {[
            ["LLM", t.llmCost],
            ["TTS", t.ttsCost],
            ["STT", t.sttCost],
            ["Report", t.reportCost],
          ].map(([label, val]) => (
            <div key={label as string} className="rounded-xl bg-gray-50 p-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
              <p className="mt-1 text-base font-black text-gray-800">{fmt(val as number)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
