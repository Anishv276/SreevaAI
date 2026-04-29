"use client";

import { useEffect, useState } from "react";
import { Loader2, Coins, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface OrgCreditStat {
    name: string;
    creditsTotal: number;
    creditsUsed: number;
}

export function OrgCreditPieChart({ stats = [], loading = false }: { stats?: OrgCreditStat[], loading?: boolean }) {
    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    const totalUsed = stats.reduce((acc, curr) => acc + curr.creditsUsed, 0);

    // SVG Pie Chart Logic
    const size = 200;
    const center = size / 2;
    const radius = 80;
    const strokeWidth = 24;
    const circumference = 2 * Math.PI * radius;

    let cumulativePct = 0;

    return (
        <div className="bg-white border border-gray-100 rounded-[2.5rem] p-8 shadow-sm h-full flex flex-col group hover:shadow-[0_20px_60px_rgba(0,0,0,0.04)] transition-all duration-500">
            <div className="flex items-start justify-between mb-6">
                <div className="space-y-1">
                    <h3 className="text-xl font-bold text-gray-900 tracking-tight">Credit Split</h3>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Global usage distribution</p>
                </div>
                <div className="h-10 w-10 rounded-2xl bg-orange-50 flex items-center justify-center text-[#F97316]">
                    <TrendingUp className="h-5 w-5" />
                </div>
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
                </div>
            ) : stats.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm font-bold uppercase tracking-widest">
                    No credit data
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-8">
                    {/* SVG Donut */}
                    <div className="relative h-[200px] w-[200px] flex items-center justify-center">
                        <svg viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90 w-full h-full">
                            {stats.map((org, i) => {
                                const pct = totalUsed > 0 ? (org.creditsUsed / totalUsed) : 0;
                                const strokeDasharray = `${pct * circumference} ${circumference}`;
                                const strokeDashoffset = -cumulativePct * circumference;
                                cumulativePct += pct;

                                const colors = ["#F97316", "#3B82F6", "#8B5CF6", "#EC4899", "#10B981"];
                                const color = colors[i % colors.length];

                                return (
                                    <motion.circle
                                        key={org.name}
                                        cx={center}
                                        cy={center}
                                        r={radius}
                                        fill="transparent"
                                        stroke={color}
                                        strokeWidth={activeIndex === i ? strokeWidth + 4 : strokeWidth}
                                        strokeDasharray={strokeDasharray}
                                        strokeDashoffset={strokeDashoffset}
                                        strokeLinecap="round"
                                        className="transition-all duration-300 cursor-pointer"
                                        onMouseEnter={() => setActiveIndex(i)}
                                        onMouseLeave={() => setActiveIndex(null)}
                                        initial={{ pathLength: 0 }}
                                        animate={{ pathLength: 1 }}
                                        transition={{ duration: 1.5, ease: "easeOut", delay: i * 0.1 }}
                                    />
                                );
                            })}
                        </svg>
                        
                        {/* Center Text */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Used</span>
                            <span className="text-3xl font-black text-gray-900 tracking-tighter tabular-nums">{Math.round(totalUsed)}</span>
                        </div>
                    </div>

                    {/* Legend */}
                    <div className="w-full grid grid-cols-2 gap-x-4 gap-y-3">
                        {stats.slice(0, 4).map((org, i) => {
                            const colors = ["#F97316", "#3B82F6", "#8B5CF6", "#EC4899", "#10B981"];
                            return (
                                <div 
                                    key={org.name} 
                                    className={cn(
                                        "flex items-center gap-2 transition-opacity duration-300",
                                        activeIndex !== null && activeIndex !== i ? "opacity-30" : "opacity-100"
                                    )}
                                >
                                    <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} />
                                    <span className="text-[10px] font-bold text-gray-600 uppercase tracking-tighter truncate">{org.name}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

export function OrgCreditBarGraph({ stats = [], loading = false }: { stats?: OrgCreditStat[], loading?: boolean }) {

    return (
        <div className="bg-white border border-gray-100 rounded-[2.5rem] p-8 shadow-sm h-full flex flex-col group hover:shadow-[0_20px_60px_rgba(0,0,0,0.04)] transition-all duration-500">
            <div className="flex items-start justify-between mb-8">
                <div className="space-y-1">
                    <h3 className="text-xl font-bold text-gray-900 tracking-tight">Credit Balance Matrix</h3>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Allocated vs Remaining per org</p>
                </div>
                <div className="h-10 w-10 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
                    <Coins className="h-5 w-5" />
                </div>
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
                </div>
            ) : (
                <div className="flex-1 flex flex-col justify-end space-y-8">
                    <div className="flex items-end gap-4 h-48 px-2">
                        {stats.map((org, i) => {
                            const maxCr = Math.max(...stats.map(s => s.creditsTotal), 1);
                            const allocatedH = (org.creditsTotal / maxCr) * 100;
                            const remaining = Math.max(0, org.creditsTotal - org.creditsUsed);
                            const remainingH = (remaining / org.creditsTotal) * 100;

                            return (
                                <div key={org.name} className="flex-1 flex flex-col items-center gap-3 h-full justify-end group/bar">
                                    <div className="relative w-full flex flex-col justify-end h-full max-w-[40px]">
                                        {/* Total Allocated Bar (Background) */}
                                        <motion.div
                                            initial={{ height: 0 }}
                                            animate={{ height: `${allocatedH}%` }}
                                            className="w-full bg-gray-100 rounded-t-xl absolute bottom-0 left-0"
                                        />
                                        {/* Remaining Bar (Foreground) */}
                                        <motion.div
                                            initial={{ height: 0 }}
                                            animate={{ height: `${(remaining / maxCr) * 100}%` }}
                                            className="w-full bg-amber-500 rounded-t-xl absolute bottom-0 left-0 z-10 shadow-lg"
                                        >
                                            <div className="absolute top-0 left-0 right-0 h-1/2 bg-white/20 rounded-t-xl" />
                                        </motion.div>

                                        {/* Hover Tooltip */}
                                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100 transition-opacity bg-gray-900 text-white text-[9px] font-bold px-2 py-1 rounded-lg z-20 whitespace-nowrap pointer-events-none">
                                            {Math.round(remaining)} / {Math.round(org.creditsTotal)}
                                        </div>
                                    </div>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter truncate w-full text-center">
                                        {org.name.split(' ')[0]}
                                    </p>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex items-center gap-4 pt-4 border-t border-gray-100">
                        <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-gray-200" />
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Allocated</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-amber-500" />
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Remaining</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
interface OrgInterviewStat {
    name: string;
    count: number;
}

export function OrgInterviewPieChart({ stats = [], loading = false }: { stats?: OrgInterviewStat[], loading?: boolean }) {
    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    const totalInterviews = stats.reduce((acc, curr) => acc + curr.count, 0);

    // SVG Pie Chart Logic
    const size = 200;
    const center = size / 2;
    const radius = 80;
    const strokeWidth = 24;
    const circumference = 2 * Math.PI * radius;

    let cumulativePct = 0;

    return (
        <div className="bg-white border border-gray-100 rounded-[2.5rem] p-8 shadow-sm h-full flex flex-col group hover:shadow-[0_20px_60px_rgba(0,0,0,0.04)] transition-all duration-500">
            <div className="flex items-start justify-between mb-6">
                <div className="space-y-1">
                    <h3 className="text-xl font-bold text-gray-900 tracking-tight">Interview Split</h3>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Global engagement volume</p>
                </div>
                <div className="h-10 w-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                    <TrendingUp className="h-5 w-5" />
                </div>
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                </div>
            ) : stats.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm font-bold uppercase tracking-widest">
                    No session data
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-8">
                    {/* SVG Donut */}
                    <div className="relative h-[200px] w-[200px] flex items-center justify-center">
                        <svg viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90 w-full h-full">
                            {stats.map((org, i) => {
                                const pct = totalInterviews > 0 ? (org.count / totalInterviews) : 0;
                                const strokeDasharray = `${pct * circumference} ${circumference}`;
                                const strokeDashoffset = -cumulativePct * circumference;
                                cumulativePct += pct;

                                const colors = ["#3B82F6", "#8B5CF6", "#EC4899", "#F97316", "#10B981"];
                                const color = colors[i % colors.length];

                                return (
                                    <motion.circle
                                        key={org.name}
                                        cx={center}
                                        cy={center}
                                        r={radius}
                                        fill="transparent"
                                        stroke={color}
                                        strokeWidth={activeIndex === i ? strokeWidth + 4 : strokeWidth}
                                        strokeDasharray={strokeDasharray}
                                        strokeDashoffset={strokeDashoffset}
                                        strokeLinecap="round"
                                        className="transition-all duration-300 cursor-pointer"
                                        onMouseEnter={() => setActiveIndex(i)}
                                        onMouseLeave={() => setActiveIndex(null)}
                                        initial={{ pathLength: 0 }}
                                        animate={{ pathLength: 1 }}
                                        transition={{ duration: 1.5, ease: "easeOut", delay: i * 0.1 }}
                                    />
                                );
                            })}
                        </svg>
                        
                        {/* Center Text */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total</span>
                            <span className="text-3xl font-black text-gray-900 tracking-tighter tabular-nums">{totalInterviews}</span>
                        </div>
                    </div>

                    {/* Legend */}
                    <div className="w-full grid grid-cols-2 gap-x-4 gap-y-3">
                        {stats.slice(0, 4).map((org, i) => {
                            const colors = ["#3B82F6", "#8B5CF6", "#EC4899", "#F97316", "#10B981"];
                            return (
                                <div 
                                    key={org.name} 
                                    className={cn(
                                        "flex items-center gap-2 transition-opacity duration-300",
                                        activeIndex !== null && activeIndex !== i ? "opacity-30" : "opacity-100"
                                    )}
                                >
                                    <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} />
                                    <span className="text-[10px] font-bold text-gray-600 uppercase tracking-tighter truncate">{org.name}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
