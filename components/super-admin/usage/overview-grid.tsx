"use client";
import React from "react";
import { FileSearch, FileText, Video, ClipboardCheck, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SectionKey, UsageOverview } from "./usage-types";
import { DonutChart, DonutLegend, type DonutSlice } from "./donut-chart";

// Section identity palette (validated for CVD via the dataviz skill).
export const SECTION_STYLE: Record<
  SectionKey,
  { color: string; icon: LucideIcon; iconBg: string; iconFg: string; hoverBorder: string; hoverText: string }
> = {
  jdExtraction: { color: "#10b981", icon: FileSearch, iconBg: "bg-emerald-50", iconFg: "text-emerald-600", hoverBorder: "hover:border-emerald-200", hoverText: "group-hover:text-emerald-600" },
  resumeExtraction: { color: "#3b82f6", icon: FileText, iconBg: "bg-blue-50", iconFg: "text-blue-600", hoverBorder: "hover:border-blue-200", hoverText: "group-hover:text-blue-600" },
  interview: { color: "#7c3aed", icon: Video, iconBg: "bg-violet-50", iconFg: "text-violet-600", hoverBorder: "hover:border-violet-200", hoverText: "group-hover:text-violet-600" },
  finalReport: { color: "#f97316", icon: ClipboardCheck, iconBg: "bg-orange-50", iconFg: "text-orange-600", hoverBorder: "hover:border-orange-200", hoverText: "group-hover:text-orange-600" },
};

export function OverviewGrid({
  data,
  fmt,
  onOpenSection,
}: {
  data: UsageOverview;
  fmt: (usd: number) => string;
  onOpenSection: (key: SectionKey) => void;
}) {
  const slices: DonutSlice[] = data.overview.map((o) => ({
    value: o.costUsd,
    color: SECTION_STYLE[o.key as SectionKey]?.color || "#9ca3af",
    label: o.label,
  }));

  // Highlight the highest-cost section.
  const topKey = [...data.sections].sort((a, b) => b.costUsd - a.costUsd)[0]?.key;

  return (
    <div className="space-y-6">
      {/* Grand total header + overview donut */}
      <div className="grid gap-6 rounded-3xl border border-[#E9E7FF] bg-white p-6 shadow-sm md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Cost by section</p>
          <h2 className="mt-1 text-3xl font-black tracking-tight text-gray-900">{fmt(data.org.totalCostUsd)}</h2>
          <p className="mt-1 text-sm text-gray-500">
            Cumulative spend across extraction, interviews, and reports.
          </p>
          <div className="mt-4 max-w-xs">
            <DonutLegend data={slices} total={data.org.totalCostUsd} fmt={fmt} />
          </div>
        </div>
        <DonutChart data={slices} total={data.org.totalCostUsd} fmt={fmt} size="md" centerLabel="Total" />
      </div>

      {/* Section cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {data.sections.map((s) => {
          const st = SECTION_STYLE[s.key];
          const Icon = st.icon;
          const isTop = s.key === topKey && s.costUsd > 0;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onOpenSection(s.key)}
              className={cn(
                "group relative flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 text-left transition-all hover:shadow-lg",
                st.hoverBorder
              )}
            >
              {isTop && (
                <span className="absolute right-0 top-0 rounded-bl-xl bg-violet-600 px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-white">
                  Highest cost
                </span>
              )}
              <div className="mb-4 flex items-center justify-between">
                <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl transition-transform group-hover:scale-110", st.iconBg, st.iconFg)}>
                  <Icon className="h-6 w-6" />
                </div>
                <ChevronRight className={cn("h-5 w-5 text-gray-300", st.hoverText)} />
              </div>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{s.label}</h3>
              <p className="mt-1 text-3xl font-black text-gray-900">{fmt(s.costUsd)}</p>
              <p className="mt-1 text-sm text-gray-500">
                {s.runs > 0 ? `${s.runs.toLocaleString()} runs` : "No runs yet"}
                {s.primaryModel ? ` · ${s.primaryModel}` : ""}
              </p>
              <span className={cn("mt-4 text-sm font-semibold text-gray-400", st.hoverText)}>
                View details →
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
