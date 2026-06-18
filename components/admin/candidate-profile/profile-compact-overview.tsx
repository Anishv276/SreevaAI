"use client";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
export type MetricTileVariant = "amber" | "white" | "emerald" | "sky" | "violet";
const tileVariantClass: Record<MetricTileVariant, string> = {
  amber: "bg-amber-50/95 border-amber-100/90",
  white: "bg-white border-slate-200/90",
  emerald: "bg-emerald-50/95 border-emerald-100/90",
  sky: "bg-sky-50/90 border-sky-100/90",
  violet: "bg-violet-50/90 border-violet-100/80",
};
export function ProfileHeroShell({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "overflow-hidden rounded-2xl border border-[#DDE1E5] bg-white shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}
export function ProfileAccentHeading({
  title,
  subtitle,
  micro,
}: {
  title: string;
  subtitle?: string;
  micro?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-9 w-1 rounded-full bg-gradient-to-b from-orange-400 to-orange-600 shrink-0" aria-hidden />
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          {subtitle ? <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p> : null}
          {micro ? <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{micro}</p> : null}
        </div>
      </div>
    </div>
  );
}
export function MetricTileRow({
  tiles,
}: {
  tiles: {
    key: string;
    icon: LucideIcon;
    label: string;
    value: string;
    hint?: string;
    variant: MetricTileVariant;
  }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 lg:gap-3">
      {tiles.map((t) => (
        <div
          key={t.key}
          className={cn(
            "flex flex-col rounded-xl border px-3 py-3 sm:px-4 sm:py-3.5 transition-shadow hover:shadow-sm",
            tileVariantClass[t.variant]
          )}
        >
          <div className="flex items-center gap-2 text-slate-500">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/80 text-slate-600 shadow-sm ring-1 ring-slate-200/60">
              <t.icon className="h-3.5 w-3.5" strokeWidth={2} />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">{t.label}</span>
          </div>
          <p className="mt-2 text-xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-2xl">{t.value}</p>
          {t.hint ? <p className="mt-1 text-[10px] font-medium text-slate-500">{t.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}
export function ReadinessProgressBar({
  left,
  right,
  pct,
  trackClassName,
}: {
  left: string;
  right: string;
  pct: number;
  trackClassName?: string;
}) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="space-y-1.5">
      <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100", trackClassName)}>
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-[width] duration-500 ease-out"
          style={{ width: `${w}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] font-semibold text-slate-500">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}
export function TripleInsightRow({
  items,
}: {
  items: {
    key: string;
    icon: LucideIcon;
    eyebrow: string;
    value: string;
    detail: string;
    tone: "amber" | "sky" | "violet";
  }[];
}) {
  const ring: Record<"amber" | "sky" | "violet", string> = {
    amber: "bg-amber-100 text-amber-700",
    sky: "bg-sky-100 text-sky-700",
    violet: "bg-violet-100 text-violet-700",
  };
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
      {items.map((it) => (
        <div
          key={it.key}
          className="flex flex-col rounded-xl border border-slate-200/80 bg-slate-50/40 p-4 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", ring[it.tone])}>
              <it.icon className="h-4 w-4" strokeWidth={2} />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">{it.eyebrow}</p>
              <p className="text-base font-bold leading-snug text-slate-900">{it.value}</p>
              <p className="text-xs leading-relaxed text-slate-500 line-clamp-3">{it.detail}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
