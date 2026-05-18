"use client";

import { useState } from "react";
import { Loader2, Coins, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

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

// Shared donut chart renderer
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
    const size = 200;
    const center = size / 2;
    const radius = 78;
    const strokeWidth = 22;
    const circumference = 2 * Math.PI * radius;

    let offset = 0;
    const arcs = segments.map((seg) => {
        const pct = total > 0 ? seg.value / total : 0;
        const dash = `${pct * circumference} ${circumference}`;
        const dashOffset = -offset * circumference;
        offset += pct;
        return { ...seg, dash, dashOffset };
    });

    return (
        <div className="flex flex-col items-center gap-6">
            <div className="relative h-[200px] w-[200px]">
                <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90 w-full h-full">
                    {/* Track */}
                    <circle cx={center} cy={center} r={radius} fill="transparent" stroke="#F3F4F6" strokeWidth={strokeWidth} />
                    {arcs.map((arc, i) => (
                        <motion.circle
                            key={arc.name}
                            cx={center}
                            cy={center}
                            r={radius}
                            fill="transparent"
                            stroke={arc.color}
                            strokeWidth={activeIdx === i ? strokeWidth + 4 : strokeWidth}
                            strokeDasharray={arc.dash}
                            strokeDashoffset={arc.dashOffset}
                            strokeLinecap="butt"
                            className="transition-all duration-200 cursor-pointer"
                            onMouseEnter={() => setActiveIdx(i)}
                            onMouseLeave={() => setActiveIdx(null)}
                            initial={{ pathLength: 0, opacity: 0 }}
                            animate={{ pathLength: 1, opacity: 1 }}
                            transition={{ duration: 1.2, ease: "easeOut", delay: i * 0.1 }}
                        />
                    ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{centerLabel}</span>
                    <span className="text-2xl font-bold text-gray-900 tabular-nums">
                        {activeIdx !== null ? arcs[activeIdx].value : total}
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

export function OrgCreditBarGraph({ stats = [], loading = false }: { stats?: OrgCreditStat[]; loading?: boolean }) {
    const maxCr = Math.max(...stats.map((s) => s.creditsUsed), 1);

    return (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col">
            <div className="flex items-start justify-between mb-5">
                <div>
                    <h3 className="text-base font-bold text-gray-900 tracking-tight">Credit Usage by Org</h3>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Volume per organization</p>
                </div>
                <div className="h-9 w-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100">
                    <Coins className="h-4 w-4" />
                </div>
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 text-orange-500 animate-spin" />
                </div>
            ) : (
                <div className="flex flex-col justify-end flex-1">
                    <div className="flex items-end gap-3 h-44 px-1">
                        {stats.map((org, i) => {
                            const pct = (org.creditsUsed / maxCr) * 100;
                            const color = getColor(i, org.name);
                            return (
                                <div key={org.name} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group/bar">
                                    <div className="relative w-full flex justify-end flex-col h-full">
                                        <motion.div
                                            initial={{ height: 0 }}
                                            animate={{ height: `${pct}%` }}
                                            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: i * 0.05 }}
                                            className="w-full rounded-t-xl absolute bottom-0 left-0"
                                            style={{ backgroundColor: color }}
                                        >
                                            <div className="absolute top-0 left-0 right-0 h-1/3 bg-white/15 rounded-t-xl" />
                                        </motion.div>
                                        {/* Tooltip */}
                                        <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100 transition-opacity bg-gray-900 text-white text-[9px] font-bold px-2 py-1 rounded-lg whitespace-nowrap pointer-events-none z-10">
                                            {Math.round(org.creditsUsed)} credits
                                        </div>
                                    </div>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter truncate w-full text-center">
                                        {org.name === "Other" ? "Other" : org.name.split(" ")[0]}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-2 pt-3 border-t border-gray-100 mt-3">
                        <div className="h-2 w-2 rounded-full bg-amber-400" />
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Credits used</span>
                    </div>
                </div>
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
