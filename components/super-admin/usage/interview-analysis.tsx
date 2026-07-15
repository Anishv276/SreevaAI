"use client";
import React from "react";
import { ArrowLeft, Volume2, Mic, BrainCircuit, FileCheck2, MessageSquare } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InterviewSubKey, UsageOverview, EventsSectionSlug } from "./usage-types";
import { DonutChart, DonutLegend, type DonutSlice } from "./donut-chart";
import { EventsDetail } from "./events-detail";

// Sub-section identity palette (validated for CVD via the dataviz skill).
const SUB_STYLE: Record<InterviewSubKey, { color: string; icon: LucideIcon; ring: string; text: string; slug: EventsSectionSlug }> = {
  tts: { color: "#6366f1", icon: Volume2, ring: "ring-indigo-400", text: "text-indigo-600", slug: "interview-tts" },
  stt: { color: "#f43f5e", icon: Mic, ring: "ring-rose-400", text: "text-rose-600", slug: "interview-stt" },
  generation: { color: "#0ea5e9", icon: BrainCircuit, ring: "ring-sky-400", text: "text-sky-600", slug: "interview-generation" },
  eval: { color: "#10b981", icon: FileCheck2, ring: "ring-emerald-400", text: "text-emerald-600", slug: "interview-eval" },
  brief: { color: "#8b5cf6", icon: MessageSquare, ring: "ring-violet-400", text: "text-violet-600", slug: "interview-brief" },
};

// Per-model pie palette (fixed categorical order; folds overflow into "Other").
const MODEL_COLORS = ["#7c3aed", "#3b82f6", "#10b981", "#f97316", "#f43f5e", "#6366f1"];

export function InterviewAnalysis({
  orgId,
  data,
  fmt,
  activeSub,
  onBack,
  onSelectSub,
}: {
  orgId: string;
  data: UsageOverview["interview"];
  fmt: (usd: number) => string;
  activeSub: InterviewSubKey | null;
  onBack: () => void;
  onSelectSub: (k: InterviewSubKey | null) => void;
}) {
  // Build per-model pie data (top 5 + Other).
  const modelSlices: DonutSlice[] = React.useMemo(() => {
    const sorted = [...data.byModel].sort((a, b) => b.costUsd - a.costUsd);
    const top = sorted.slice(0, MODEL_COLORS.length - 1);
    const rest = sorted.slice(MODEL_COLORS.length - 1);
    const slices: DonutSlice[] = top.map((m, i) => ({
      value: m.costUsd,
      color: MODEL_COLORS[i],
      label: m.provider ? `${m.model} · ${m.provider} (${m.kind.toUpperCase()})` : `${m.model} (${m.kind.toUpperCase()})`,
    }));
    const otherTotal = rest.reduce((s, m) => s + m.costUsd, 0);
    if (otherTotal > 0) slices.push({ value: otherTotal, color: "#9ca3af", label: "Other" });
    return slices;
  }, [data.byModel]);

  const activeStyle = activeSub ? SUB_STYLE[activeSub] : null;

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <button
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-violet-600 hover:text-violet-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to overview
      </button>

      <div className="rounded-3xl border border-violet-100 bg-white p-6 shadow-md">
        <h2 className="text-2xl font-black text-gray-900">Interview Sessions — Full Breakdown</h2>
        <p className="mt-1 text-sm text-gray-500">
          STT, TTS, Generation, Eval and Brief costs. Click a card for per-candidate detail.
        </p>

        {/* Total + sub-cards */}
        <div className="mt-6 rounded-2xl border border-violet-100 bg-violet-50/60 p-6">
          <p className="text-[11px] font-bold uppercase tracking-widest text-violet-600">Total interview cost</p>
          <p className="mt-1 text-4xl font-black text-violet-900">{fmt(data.totalCostUsd)}</p>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {data.subSections.map((sub) => {
              const st = SUB_STYLE[sub.key];
              const Icon = st.icon;
              const isActive = activeSub === sub.key;
              return (
                <button
                  key={sub.key}
                  onClick={() => onSelectSub(isActive ? null : sub.key)}
                  className={cn(
                    "rounded-xl border bg-white p-4 text-center shadow-sm transition-all",
                    isActive ? cn("ring-2", st.ring) : "border-violet-100 hover:border-violet-200"
                  )}
                >
                  <Icon className={cn("mx-auto mb-2 h-6 w-6", st.text)} />
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{sub.label}</p>
                  <p className="text-lg font-black text-gray-900">{fmt(sub.costUsd)}</p>
                </button>
              );
            })}
          </div>

          {/* Selected sub-section detail */}
          {activeSub && activeStyle && (
            <div className="mt-6 animate-in fade-in slide-in-from-top-2">
              <EventsDetail orgId={orgId} section={activeStyle.slug} fmt={fmt} accent={activeStyle.color} />
            </div>
          )}
        </div>

        {/* Per-model pie */}
        <div className="mt-8 grid gap-8 lg:grid-cols-[280px_1fr] lg:items-center">
          <div>
            <h3 className="mb-3 border-b border-gray-100 pb-2 text-base font-bold text-gray-900">
              Cost by model
            </h3>
            <DonutChart data={modelSlices} total={data.totalCostUsd} fmt={fmt} size="md" centerLabel="Interview" />
          </div>
          <div>
            <h3 className="mb-3 border-b border-gray-100 pb-2 text-base font-bold text-gray-900">
              Which model cost how much
            </h3>
            {modelSlices.length === 0 ? (
              <p className="text-sm text-gray-400">No model cost recorded yet.</p>
            ) : (
              <DonutLegend data={modelSlices} total={data.totalCostUsd} fmt={fmt} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
