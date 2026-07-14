"use client";
import React from "react";

// Hand-rolled SVG donut (codebase convention — no chart lib). Palette validated
// for CVD via the dataviz skill; slices always ship a legend + numeric values so
// identity is never colour-alone (contrast-relief requirement).

export type DonutSlice = { value: number; color: string; label: string };

export function DonutChart({
  data,
  total,
  size = "md",
  fmt,
  centerLabel = "Total",
}: {
  data: DonutSlice[];
  total: number;
  size?: "sm" | "md" | "lg";
  fmt: (usd: number) => string;
  centerLabel?: string;
}) {
  const dim = size === "lg" ? "w-56 h-56" : size === "sm" ? "w-36 h-36" : "w-44 h-44";
  const safeTotal = total > 0 ? total : 1;
  const coords = (pct: number) => [Math.cos(2 * Math.PI * pct), Math.sin(2 * Math.PI * pct)];

  const hasData = data.some((d) => d.value > 0);

  // Precompute each slice's cumulative start offset (pure — no render-time mutation).
  const offsets: number[] = [];
  data.reduce((acc, s) => {
    offsets.push(acc);
    return acc + Math.max(0, s.value) / safeTotal;
  }, 0);

  return (
    <div className={`relative ${dim} mx-auto flex items-center justify-center`}>
      <svg viewBox="-1.2 -1.2 2.4 2.4" className="w-full h-full -rotate-90" role="img" aria-label={`${centerLabel} ${fmt(total)}`}>
        {!hasData && <circle cx="0" cy="0" r="1" fill="none" stroke="#E9E7FF" strokeWidth="0.28" />}
        {data.map((slice, i) => {
          if (slice.value <= 0) return null;
          const start = offsets[i];
          const [sx, sy] = coords(start);
          const [ex, ey] = coords(start + slice.value / safeTotal);
          const largeArc = slice.value / safeTotal > 0.5 ? 1 : 0;
          return (
            <path
              key={i}
              d={`M ${sx} ${sy} A 1 1 0 ${largeArc} 1 ${ex} ${ey}`}
              fill="none"
              stroke={slice.color}
              strokeWidth="0.3"
              className="transition-all hover:stroke-[0.35]"
            >
              <title>{`${slice.label}: ${fmt(slice.value)} (${((slice.value / safeTotal) * 100).toFixed(1)}%)`}</title>
            </path>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{centerLabel}</span>
        <span className="text-lg font-black text-gray-900">{fmt(total)}</span>
      </div>
    </div>
  );
}

export function DonutLegend({
  data,
  total,
  fmt,
}: {
  data: DonutSlice[];
  total: number;
  fmt: (usd: number) => string;
}) {
  const safeTotal = total > 0 ? total : 1;
  return (
    <ul className="space-y-2">
      {data.map((d, i) => (
        <li key={i} className="flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2 min-w-0">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: d.color }} />
            <span className="truncate text-gray-600">{d.label}</span>
          </span>
          <span className="shrink-0 font-semibold text-gray-900 tabular-nums">
            {fmt(d.value)}
            <span className="ml-1.5 text-[11px] font-medium text-gray-400">
              {((d.value / safeTotal) * 100).toFixed(0)}%
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
