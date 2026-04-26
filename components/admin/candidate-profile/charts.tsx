"use client";

import { memo, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export const CircularProgress = memo(function CircularProgress({
    value,
    max = 100,
    label,
    size = "md",
    color = "blue",
    master = false
}: {
    value: number;
    max?: number;
    label: string;
    size?: "sm" | "md" | "lg";
    color?: string;
    master?: boolean;
}) {
    const percentage = Math.min((value / max) * 100, 100);
    const radius = master ? 48 : 38;
    const strokeWidth = master ? 12 : 9;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    const sizeClass = size === "sm" ? "h-20 w-20" : size === "md" ? "h-28 w-28" : "h-36 w-36";
    const colors: Record<string, [string, string]> = {
        blue: ["#60A5FA", "#3B82F6"],
        slate: ["#94A3B8", "#64748B"],
        indigo: ["#818CF8", "#6366F1"],
        emerald: ["#34D399", "#10B981"]
    };

    const gradientId = `grad-${color}-${master ? 'master' : 'child'}`;
    const [startColor, endColor] = colors[color] || colors.blue;

    return (
        <div className={cn("relative flex flex-col items-center gap-3", master ? "scale-105" : "")}>
            <div className={cn("relative flex items-center justify-center", sizeClass)}>
                <svg className="h-full w-full transform -rotate-90 overflow-visible">
                    <defs>
                        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor={startColor} />
                            <stop offset="100%" stopColor={endColor} />
                        </linearGradient>
                    </defs>
                    <circle
                        cx="50%"
                        cy="50%"
                        r={radius}
                        stroke="currentColor"
                        strokeWidth={strokeWidth}
                        fill="transparent"
                        className="text-slate-100/80"
                    />
                    <circle
                        cx="50%"
                        cy="50%"
                        r={radius}
                        stroke={`url(#${gradientId})`}
                        strokeWidth={strokeWidth}
                        strokeDasharray={circumference}
                        style={{ strokeDashoffset: offset }}
                        strokeLinecap="round"
                        fill="transparent"
                        className="transition-all ease-out drop-shadow-sm"
                    />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                    <div className="flex items-baseline gap-0.5">
                        <span className={cn("font-bold text-slate-900 leading-none", master ? "text-3xl" : "text-2xl")}>{value}</span>
                        {max !== 100 && <span className="text-[10px] font-semibold text-slate-400">/{max}</span>}
                    </div>
                </div>
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] text-center max-w-[90px] leading-tight">
                {label}
            </span>
        </div>
    );
});

export const SegmentedProgress = memo(function SegmentedProgress({ candValue, jdValue, label, unit = "YRS" }: { candValue: number; jdValue: number; label: string; unit?: string }) {
    const totalBlocks = Math.max(candValue, jdValue, 8);
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-end">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] leading-none">{label}</span>
                <div className="flex items-baseline gap-1">
                    <span className="text-sm font-bold text-slate-900 leading-none">{candValue}</span>
                    <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-tighter">/ {jdValue} {unit}</span>
                </div>
            </div>
            <div className="flex gap-1.5 h-2.5">
                {Array.from({ length: totalBlocks }).map((_, i) => (
                    <div
                        key={i}
                        className={cn(
                            "flex-1 rounded-sm border transition-all",
                            i < candValue ? "bg-blue-600 border-blue-600 shadow-sm" : "bg-transparent border-slate-200"
                        )}
                    />
                ))}
            </div>
        </div>
    );
});

export const CommunicationDonutChart = memo(function CommunicationDonutChart({ metrics }: { metrics: { label: string; value: number; color: string }[] }) {
    const [hovered, setHovered] = useState<number | null>(null);
    const [animProgress, setAnimProgress] = useState(0);

    useEffect(() => {
        let start: number | null = null;
        const duration = 1200;
        const ease = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        const step = (ts: number) => {
            if (!start) start = ts;
            const p = Math.min((ts - start) / duration, 1);
            setAnimProgress(ease(p));
            if (p < 1) requestAnimationFrame(step);
        };
        const raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, []);

    const size = 220;
    const cx = size / 2;
    const cy = size / 2;
    const R = 80;
    const r = 52;
    const gap = 3;

    const total = metrics.reduce((s, m) => s + m.value, 0);
    const avg = Math.round(metrics.reduce((s, m) => s + m.value, 0) / metrics.length);

    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const pt = (rad: number, radius: number) => ({
        x: cx + radius * Math.cos(rad),
        y: cy + radius * Math.sin(rad),
    });

    let cursor = -90;
    const slices = metrics.map((m) => {
        const sliceDeg = (m.value / total) * 360 - gap;
        const startDeg = cursor + gap / 2;
        const endDeg = startDeg + sliceDeg * animProgress;
        cursor += (m.value / total) * 360;

        const startRad = toRad(startDeg);
        const endRad = toRad(endDeg);
        const largeArc = sliceDeg * animProgress > 180 ? 1 : 0;

        const o1 = pt(startRad, R);
        const o2 = pt(endRad, R);
        const i1 = pt(endRad, r);
        const i2 = pt(startRad, r);

        const path = [
            `M ${o1.x} ${o1.y}`,
            `A ${R} ${R} 0 ${largeArc} 1 ${o2.x} ${o2.y}`,
            `L ${i1.x} ${i1.y}`,
            `A ${r} ${r} 0 ${largeArc} 0 ${i2.x} ${i2.y}`,
            `Z`,
        ].join(' ');

        const midRad = toRad(startDeg + (sliceDeg * animProgress) / 2);
        const labelR = R + 14;
        const labelPt = pt(midRad, labelR);

        return { path, color: m.color, label: m.label, value: m.value, labelPt, midRad };
    });

    const active = hovered !== null ? metrics[hovered] : null;

    return (
        <div className="grid w-full grid-cols-1 items-start gap-5 py-1 sm:grid-cols-[min(220px,42vw)_minmax(0,1fr)] sm:items-center sm:gap-6 lg:grid-cols-[220px_1fr] lg:gap-8">
            <div
                className="relative mx-auto shrink-0 sm:mx-0"
                style={{ width: size, height: size }}
            >
                <svg width={size} height={size} className="overflow-visible">
                    <defs>
                        <filter id="slice-shadow" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#00000022" />
                        </filter>
                    </defs>
                    {slices.map((s, i) => (
                        <g key={s.label}>
                            <path
                                d={s.path}
                                fill={s.color}
                                opacity={hovered === null ? 1 : hovered === i ? 1 : 0.3}
                                style={{
                                    transform: hovered === i ? `translate(${Math.cos(s.midRad) * 5}px, ${Math.sin(s.midRad) * 5}px)` : "none",
                                    transition: "opacity 0.2s ease, transform 0.2s ease",
                                    cursor: "pointer",
                                    filter: hovered === i ? "url(#slice-shadow)" : "none",
                                }}
                                onMouseEnter={() => setHovered(i)}
                                onMouseLeave={() => setHovered(null)}
                            />
                        </g>
                    ))}
                </svg>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
                    <span
                        className="font-bold leading-none tabular-nums transition-all"
                        style={{ fontSize: active ? 36 : 28, color: active ? active.color : "#111827" }}
                    >
                        {active ? active.value : avg}
                    </span>
                    <span
                        className="mt-1.5 min-h-[2.25em] text-[9px] font-bold uppercase leading-tight tracking-[0.16em] transition-all"
                        style={{ color: active ? active.color : "#6B7280" }}
                    >
                        {active ? active.label : "Overall"}
                    </span>
                </div>
            </div>
            <div className="flex min-w-0 flex-col justify-center sm:min-h-0">
                <p className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">Dimensions</p>
                <p className="mb-2 text-[10px] leading-snug text-slate-500">Score shows in the chart center when you hover a segment or a row.</p>
                <ul className="flex flex-col gap-1.5" role="list">
                    {metrics.map((m, i) => (
                        <li key={m.label} className="list-none">
                            <button
                                type="button"
                                className="group flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-lg border border-transparent bg-transparent px-1 py-1.5 text-left transition-colors hover:border-slate-200 hover:bg-slate-50/80"
                                onMouseEnter={() => setHovered(i)}
                                onMouseLeave={() => setHovered(null)}
                                onFocus={() => setHovered(i)}
                                onBlur={() => setHovered(null)}
                            >
                                <div
                                    className="h-2.5 w-2.5 shrink-0 rounded-full transition-transform group-hover:scale-125"
                                    style={{ backgroundColor: m.color }}
                                    aria-hidden
                                />
                                <span className="min-w-0 text-[10px] font-bold uppercase leading-normal tracking-wide text-slate-600 sm:text-[11px]">
                                    {m.label}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
});
