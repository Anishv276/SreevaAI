"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import type { DateRange } from "./date-filter";
import { ErrorState } from "./error-state";

interface FunnelData {
    activeDrives: number;
    totalCandidates: number;
    invited: number;
    interviewed: number;
    shortlisted: number;
    hiredThisMonth: number;
    shortlistPassRate: number;
}

interface HiringFunnelProps {
    dateRange: DateRange;
}

function buildUrl(range: DateRange) {
    const base = "/api/admin/stats";
    if (range.type === "custom" && "from" in range) return `${base}?range=custom&from=${(range as any).from}&to=${(range as any).to}`;
    return `${base}?range=${range.type}`;
}

function rangeLabel(range: DateRange) {
    if (range.type === "today") return "Today";
    if (range.type === "week") return "This week";
    if (range.type === "month") return "This month";
    return "from" in range ? `${(range as any).from} – ${(range as any).to}` : "Custom";
}

const STAGES = [
    { key: "applied",      label: "Applied",      color: "#3B82F6", darkColor: "#2563EB" },
    { key: "invited",      label: "Invited",       color: "#1D4ED8", darkColor: "#1E40AF" },
    { key: "interviewed",  label: "Interviewed",   color: "#16A34A", darkColor: "#15803D" },
    { key: "shortlisted",  label: "Shortlisted",   color: "#15803D", darkColor: "#166534" },
    { key: "hired",        label: "Hired",         color: "#EA580C", darkColor: "#C2410C" },
] as const;

export function HiringFunnel({ dateRange }: HiringFunnelProps) {
    const [data, setData] = useState<FunnelData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(buildUrl(dateRange), { signal });
                if (res.ok) {
                    const data = await res.json();
                    if (!signal.aborted) setData(data);
                } else {
                    if (!signal.aborted) setError("Analytics synchronization failed.");
                }
            } catch (err: any) {
                if (err.name !== "AbortError") {
                    setError("Network connectivity issue.");
                }
            } finally {
                if (!signal.aborted) setLoading(false);
            }
        };

        fetchData();
        return () => controller.abort();
    }, [dateRange]);

    const handleRetry = () => {
        setLoading(true);
        setError(null);
    };

    const stages = data ? [
        { key: "applied",     label: "Applied",     value: data.totalCandidates },
        { key: "invited",     label: "Invited",      value: data.invited },
        { key: "interviewed", label: "Interviewed",  value: data.interviewed },
        { key: "shortlisted", label: "Shortlisted",  value: data.shortlisted },
        { key: "hired",       label: "Hired",        value: data.hiredThisMonth },
    ] : [];

    const maxVal = stages.length ? Math.max(...stages.map(s => s.value), 1) : 1;

    const passRate = data
        ? data.totalCandidates > 0
            ? ((data.hiredThisMonth / data.totalCandidates) * 100).toFixed(1)
            : "0.0"
        : null;

    return (
        <div className="bg-white/40 backdrop-blur-xl rounded-[2.5rem] border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.03)] p-8 flex flex-col h-full group hover:shadow-[0_20px_60px_rgba(0,0,0,0.08)] transition-all duration-700">
            {/* Header */}
            <div className="flex items-start justify-between mb-8">
                <div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight text-premium">Hiring Funnel</h3>
                    <p className="text-[12px] font-bold text-gray-400 mt-1 uppercase tracking-widest">
                        {data
                            ? `${rangeLabel(dateRange)} · ${data.activeDrives} active drives`
                            : rangeLabel(dateRange)}
                    </p>
                </div>
                {passRate !== null && (
                    <div className="text-right">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Total Pass</p>
                        <div className="flex items-baseline justify-end gap-1">
                            <span className="text-2xl font-black text-[#F97316] tracking-tighter">{passRate}%</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Funnel bars */}
            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 text-gray-200 animate-spin" />
                </div>
            ) : error ? (
                <div className="flex-1 flex items-center justify-center">
                    <ErrorState 
                        message={error} 
                        onRetry={handleRetry} 
                        compact 
                        className="bg-transparent border-none shadow-none"
                    />
                </div>
            ) : (
                <div className="flex-1 space-y-4">
                    {stages.map((stage, i) => {
                        const pct = Math.round((stage.value / maxVal) * 100);
                        const prevVal = i > 0 ? stages[i - 1].value : null;
                        const convRate = prevVal && prevVal > 0
                            ? Math.round((stage.value / prevVal) * 100)
                            : null;
                        const accentColor = STAGES[i].color;

                        return (
                            <div key={stage.key} className="flex items-center gap-4 group/item">
                                {/* Label */}
                                <div className="w-[100px] shrink-0">
                                    <p className="text-[12px] font-bold text-gray-400 group-hover/item:text-gray-900 transition-colors">
                                        {stage.label}
                                    </p>
                                </div>

                                {/* Bar track */}
                                <div className="flex-1 bg-gray-50/50 rounded-2xl h-10 overflow-hidden relative border border-gray-100/50">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.max(pct, 4)}%` }}
                                        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] as any, delay: i * 0.1 }}
                                        className="h-full rounded-2xl flex items-center px-4 relative z-10"
                                        style={{ backgroundColor: accentColor }}
                                    >
                                        <div className="absolute top-0 left-0 right-0 h-1/2 bg-white/20 rounded-t-2xl" />
                                        <span className="text-[12px] font-black text-white relative z-20 tabular-nums">
                                            {stage.value}
                                        </span>
                                    </motion.div>
                                    
                                    {/* Glass Highlight */}
                                    <div className="absolute top-0 right-0 h-full w-24 bg-gradient-to-l from-white/10 to-transparent pointer-none" />
                                </div>

                                {/* Conversion rate */}
                                <div className="w-12 shrink-0 flex justify-end">
                                    {convRate != null ? (
                                        <span className="text-[11px] font-black text-gray-400 group-hover/item:text-orange-400 transition-colors">
                                            {convRate}%
                                        </span>
                                    ) : (
                                        <div className="h-1 w-1 rounded-full bg-gray-200" />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
