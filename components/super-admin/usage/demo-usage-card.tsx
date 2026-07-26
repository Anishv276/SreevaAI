"use client";
import React from "react";
import { Sparkles, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Demo-interview billing (/demo page sessions). Sourced from
// DemoTemplate.usageJson (one-time JD extraction cost per template)
// and DemoSession.usageJson (per-session live/eval/llmGeneration/TTS/STT
// cost) via /api/super-admin/billing/demo and
// /api/super-admin/billing/demo/sessions. Demo sessions have no
// OrganizationDetails row, so this is entirely separate from UsageEvent/org
// billing -- shown as its own card, not scoped to the selected org.

type DemoTotals = {
    jdExtractionCost: number; liveCost: number;
    evalCost: number; llmGenerationCost: number; ttsCost: number; sttCost: number;
    totalCost: number;
};
type DemoOverview = { templateCount: number; sessionCount: number; totals: DemoTotals };
type DemoSessionRow = {
    id: string; clientName: string; clientEmail: string; templateTitle: string; roleTitle: string;
    status: string; startedAt: string; isFirstSessionForTemplate: boolean;
    jdExtractionCost: number;
    liveCost: number; liveCalls: number;
    evalCost: number; evalCalls: number;
    llmGenerationCost: number; llmGenerationCalls: number;
    ttsCost: number; ttsCharacters: number;
    sttCost: number; sttAudioSeconds: number;
    totalCost: number;
};

export function DemoUsageCard({ fmt }: { fmt: (usd: number) => string }) {
    const [overview, setOverview] = React.useState<DemoOverview | null>(null);
    const [rows, setRows] = React.useState<DemoSessionRow[] | null>(null);
    const [open, setOpen] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/super-admin/billing/demo", { cache: "no-store" });
                if (res.ok && !cancelled) setOverview(await res.json());
            } catch {
                /* ignore */
            }
        })();
        return () => { cancelled = true; };
    }, []);

    React.useEffect(() => {
        if (!open || rows) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/super-admin/billing/demo/sessions", { cache: "no-store" });
                if (res.ok && !cancelled) setRows((await res.json()).rows);
            } catch {
                /* ignore */
            }
        })();
        return () => { cancelled = true; };
    }, [open, rows]);

    if (!overview) return null;
    const t = overview.totals;

    return (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm" style={{ border: "1px solid #E9E7FF" }}>
            <button
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center justify-between px-5 py-4"
                style={{ background: "#F9F8FF" }}
            >
                <span className="flex items-center gap-2 text-sm font-bold text-violet-800">
                    <Sparkles className="h-4 w-4 text-violet-500" />
                    Demo interview usage
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-violet-700">
                        DEMO
                    </span>
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-600">
                        {overview.sessionCount} sessions · {overview.templateCount} templates · {fmt(t.totalCost)}
                    </span>
                </span>
                <ChevronDown className={cn("h-4 w-4 text-violet-400 transition-transform", open && "rotate-180")} />
            </button>
            {open && (
                <>
                    <div className="grid grid-cols-3 gap-3 border-t p-5 sm:grid-cols-6" style={{ borderColor: "#F0EEF8" }}>
                        {[
                            ["JD Extraction", t.jdExtractionCost],
                            ["Live", t.liveCost],
                            ["Eval", t.evalCost],
                            ["Question Gen", t.llmGenerationCost],
                            ["TTS", t.ttsCost],
                            ["STT", t.sttCost],
                        ].map(([label, val]) => (
                            <div key={label as string} className="rounded-xl p-3 text-center" style={{ background: "#F9F8FF" }}>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-violet-400">{label}</p>
                                <p className="mt-1 text-base font-black text-violet-900">{fmt(val as number)}</p>
                            </div>
                        ))}
                    </div>
                    <div className="overflow-x-auto border-t" style={{ borderColor: "#F0EEF8" }}>
                        <table className="w-full text-left text-sm">
                            <thead style={{ background: "#F9F8FF" }}>
                                <tr>
                                    {["Date", "Candidate", "Template", "JD Extraction", "Live", "Eval", "Question Gen", "TTS", "STT", "Total"].map((h) => (
                                        <th
                                            key={h}
                                            className={`whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-violet-400 ${h === "Total" ? "text-right" : ""}`}
                                        >
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y" style={{ borderColor: "#F0EEF8" }}>
                                {rows === null && (
                                    <tr>
                                        <td colSpan={10} className="px-4 py-8 text-center text-xs text-violet-400">Loading…</td>
                                    </tr>
                                )}
                                {rows?.length === 0 && (
                                    <tr>
                                        <td colSpan={10} className="px-4 py-8 text-center text-xs text-violet-400">No demo sessions recorded yet.</td>
                                    </tr>
                                )}
                                {rows?.map((r) => {
                                    const templateCost = r.jdExtractionCost;
                                    return (
                                        <tr key={r.id} className="hover:bg-violet-50/40">
                                            <td className="whitespace-nowrap px-4 py-3 text-xs text-violet-700">
                                                {new Date(r.startedAt).toLocaleDateString()}
                                            </td>
                                            <td className="px-4 py-3 text-violet-900">
                                                <div className="font-medium">{r.clientName}</div>
                                                <div className="text-xs text-violet-400">{r.clientEmail}</div>
                                            </td>
                                            <td className="px-4 py-3 text-violet-900">{r.templateTitle}</td>
                                            <td className="px-4 py-3 tabular-nums text-violet-600">
                                                {templateCost > 0 ? (
                                                    <span title="One-time template cost, shown on this template's first session only">
                                                        {fmt(templateCost)}
                                                    </span>
                                                ) : (
                                                    <span className="text-violet-300">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 tabular-nums text-violet-600">
                                                {r.liveCalls > 0 ? `${fmt(r.liveCost)} · ${r.liveCalls}` : <span className="text-violet-300">—</span>}
                                            </td>
                                            <td className="px-4 py-3 tabular-nums text-violet-600">
                                                {r.evalCalls > 0 ? `${fmt(r.evalCost)} · ${r.evalCalls}` : <span className="text-violet-300">—</span>}
                                            </td>
                                            <td className="px-4 py-3 tabular-nums text-violet-600">
                                                {r.llmGenerationCalls > 0 ? `${fmt(r.llmGenerationCost)} · ${r.llmGenerationCalls}` : <span className="text-violet-300">—</span>}
                                            </td>
                                            <td className="px-4 py-3 tabular-nums text-violet-600">
                                                {r.ttsCost > 0 ? fmt(r.ttsCost) : <span className="text-violet-300">—</span>}
                                            </td>
                                            <td className="px-4 py-3 tabular-nums text-violet-600">
                                                {r.sttCost > 0 ? fmt(r.sttCost) : <span className="text-violet-300">—</span>}
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold tabular-nums text-violet-900">{fmt(r.totalCost)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
