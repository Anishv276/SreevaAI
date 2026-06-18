"use client";
import { useState, useEffect, useRef } from "react";
import { Loader2, Coins, TrendingUp, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
// 5 named colours + gray for "Other"
const COLORS = ["#F97316", "#3B82F6", "#8B5CF6", "#EC4899", "#10B981", "#9CA3AF"];
function getColor(index: number, name: string) {
    if (name === "Other") return "#9CA3AF";
    return COLORS[index % COLORS.length];
}
interface OrgCreditStat {
    name: string;
    creditsUsed: number;
}
interface OrgInterviewStat {
    name: string;
    count: number;
}
interface OrgQuotaStat {
    name: string;
    used: number;
    total: number;
}
// Animated donut chart — animates strokeDashoffset from 0 to final value on mount
function DonutChart({
    segments,
    total,
    centerLabel,
}: {
    segments: { name: string; value: number; color: string }[];
    total: number;
    centerLabel: string;
}) {
    const [activeIdx, setActiveIdx] = useState<number | null>(null);
    const [animated, setAnimated] = useState(false);
    const size = 200;
    const center = size / 2;
    const radius = 78;
    const strokeWidth = 22;
    const circumference = 2 * Math.PI * radius;
    useEffect(() => {
        const t = requestAnimationFrame(() => setAnimated(true));
        return () => cancelAnimationFrame(t);
    }, []);
    const arcs = segments.map((seg, index) => {
        const offsetPct = segments
            .slice(0, index)
            .reduce((sum, segment) => sum + (total > 0 ? segment.value / total : 0), 0);
        const pct = total > 0 ? seg.value / total : 0;
        const dashLen = pct * circumference;
        // strokeDasharray: [filled portion, gap]
        // strokeDashoffset: rotates start position
        const dashArray = `${dashLen} ${circumference - dashLen}`;
        const dashOffset = -offsetPct * circumference;
        return { ...seg, dashArray, dashOffset };
    });
    return (
        <div className="flex flex-col items-center gap-6">
            <div className="relative h-[200px] w-[200px]">
                <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90 w-full h-full">
                    {/* Track */}
                    <circle cx={center} cy={center} r={radius} fill="transparent" stroke="#F3F4F6" strokeWidth={strokeWidth} />
                    {arcs.map((arc, i) => (
                        <circle
                            key={arc.name}
                            cx={center}
                            cy={center}
                            r={radius}
                            fill="transparent"
                            stroke={arc.color}
                            strokeWidth={activeIdx === i ? strokeWidth + 4 : strokeWidth}
                            strokeDasharray={animated ? arc.dashArray : `0 ${circumference}`}
                            strokeDashoffset={arc.dashOffset}
                            strokeLinecap="butt"
                            className="transition-all duration-700 ease-out cursor-pointer"
                            style={{ transitionDelay: animated ? `${i * 80}ms` : "0ms" }}
                            onMouseEnter={() => setActiveIdx(i)}
                            onMouseLeave={() => setActiveIdx(null)}
                        />
                    ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{centerLabel}</span>
                    <span className="text-2xl font-bold text-gray-900 tabular-nums">
                        {activeIdx !== null ? arcs[activeIdx].value.toLocaleString() : total.toLocaleString()}
                    </span>
                    {activeIdx !== null && (
                        <span className="text-[10px] font-bold text-gray-500 truncate max-w-[80px] text-center">
                            {arcs[activeIdx].name}
                        </span>
                    )}
                </div>
            </div>
            {/* Legend */}
            <div className="w-full grid grid-cols-2 gap-x-4 gap-y-2">
                {segments.map((seg, i) => (
                    <div
                        key={seg.name}
                        className={cn(
                            "flex items-center gap-2 transition-opacity duration-200",
                            activeIdx !== null && activeIdx !== i ? "opacity-30" : "opacity-100"
                        )}
                    >
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-tighter truncate">{seg.name}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
export function OrgCreditPieChart({ stats = [], loading = false }: { stats?: OrgCreditStat[]; loading?: boolean }) {
    const total = Math.round(stats.reduce((s, o) => s + o.creditsUsed, 0));
    const segments = stats.map((o, i) => ({ name: o.name, value: Math.round(o.creditsUsed), color: getColor(i, o.name) }));
    return (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col">
            <div className="flex items-start justify-between mb-5">
                <div>
                    <h3 className="text-base font-bold text-gray-900 tracking-tight">Credit Usage Split</h3>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Global usage distribution</p>
                </div>
                <div className="h-9 w-9 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 border border-orange-100">
                    <TrendingUp className="h-4 w-4" />
                </div>
            </div>
            {loading ? (
                <div className="flex-1 flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 text-orange-500 animate-spin" />
                </div>
            ) : stats.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-12 text-sm font-bold text-gray-400 uppercase tracking-widest">
                    No credit data
                </div>
            ) : (
                <DonutChart segments={segments} total={total} centerLabel="Credits" />
            )}
        </div>
    );
}
export function OrgInterviewPieChart({ stats = [], loading = false }: { stats?: OrgInterviewStat[]; loading?: boolean }) {
    const total = stats.reduce((s, o) => s + o.count, 0);
    const segments = stats.map((o, i) => ({ name: o.name, value: o.count, color: getColor(i, o.name) }));
    return (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col">
            <div className="flex items-start justify-between mb-5">
                <div>
                    <h3 className="text-base font-bold text-gray-900 tracking-tight">Interview Split</h3>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Global engagement volume</p>
                </div>
                <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
                    <TrendingUp className="h-4 w-4" />
                </div>
            </div>
            {loading ? (
                <div className="flex-1 flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
                </div>
            ) : stats.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-12 text-sm font-bold text-gray-400 uppercase tracking-widest">
                    No interview data
                </div>
            ) : (
                <DonutChart segments={segments} total={total} centerLabel="Total" />
            )}
        </div>
    );
}
// Quota consumption: horizontal progress bars per org
export function OrgQuotaConsumption({ stats = [], loading = false }: { stats?: OrgQuotaStat[]; loading?: boolean }) {
    const [animated, setAnimated] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setAnimated(true), 80);
        return () => clearTimeout(t);
    }, [stats]);
    return (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col">
            <div className="flex items-start justify-between mb-5">
                <div>
                    <h3 className="text-base font-bold text-gray-900 tracking-tight">Quota Consumption</h3>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Interview quota used per org</p>
                </div>
                <div className="h-9 w-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100">
                    <Activity className="h-4 w-4" />
                </div>
            </div>
            {loading ? (
                <div className="flex-1 flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 text-orange-500 animate-spin" />
                </div>
            ) : stats.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-12 text-sm font-bold text-gray-400 uppercase tracking-widest">
                    No quota data
                </div>
            ) : (
                <div className="flex flex-col gap-3.5 flex-1 justify-center">
                    {stats.map((org, i) => {
                        const pct = org.total > 0 ? Math.round((org.used / org.total) * 100) : 0;
                        const color =
                            pct >= 90 ? "#EF4444" :
                            pct >= 70 ? "#F97316" :
                            pct >= 40 ? "#3B82F6" :
                            "#10B981";
                        return (
                            <div key={org.name} className="group">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[11px] font-bold text-gray-700 truncate max-w-[140px]">
                                        {org.name}
                                    </span>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[10px] font-bold text-gray-400 tabular-nums">
                                            {org.used}/{org.total}
                                        </span>
                                        <span
                                            className="text-[10px] font-bold tabular-nums min-w-[32px] text-right"
                                            style={{ color }}
                                        >
                                            {pct}%
                                        </span>
                                    </div>
                                </div>
                                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-700 ease-out"
                                        style={{
                                            width: animated ? `${pct}%` : "0%",
                                            backgroundColor: color,
                                            transitionDelay: `${i * 60}ms`,
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
