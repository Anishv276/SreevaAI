"use client";
import { useEffect, useState, useCallback } from "react";
import {
    Users, Briefcase, ClipboardCheck, Star,
    XCircle, TrendingUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import type { DateRange } from "./date-filter";

interface StatsData {
    activeJobs: number;
    totalCandidates: number;
    applicationsToday: number;
    appTrendDelta: number;
    interviewedDelta: number;
    shortlistedDelta: number;
    rejectedDelta: number;
    interviewed: number;
    shortlisted: number;
    rejected: number;
    avgScore: number;
}
interface StatsGridProps {
    dateRange: DateRange;
    initialData?: StatsData | null;
}
function buildUrl(range: DateRange) {
    const base = "/api/admin/stats";
    if (range.type === "custom") return `${base}?range=custom&from=${range.from}&to=${range.to}`;
    return `${base}?range=${range.type}`;
}
export function StatsGrid({ dateRange, initialData }: StatsGridProps) {
    const [stats, setStats] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryKey, setRetryKey] = useState(0);
    useEffect(() => {
        if (initialData) {
            setStats(initialData);
            setLoading(false);
            setError(null);
            return;
        }
        const controller = new AbortController();
        const { signal } = controller;
        const loadStats = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(buildUrl(dateRange), { signal });
                if (signal.aborted) return;
                if (res.ok) {
                    setStats(await res.json());
                } else {
                    setError("Failed to load stats.");
                }
            } catch (err: any) {
                if (!signal.aborted && err.name !== "AbortError") setError("Network error.");
            } finally {
                if (!signal.aborted) setLoading(false);
            }
        };
        void loadStats();
        return () => controller.abort();
    }, [dateRange, retryKey]);
    if (error) {
        return (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-6 py-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-red-600">{error}</p>
                <button
                    onClick={() => setRetryKey((k) => k + 1)}
                    className="text-xs font-bold text-red-700 underline underline-offset-2 hover:text-red-900"
                >
                    Retry
                </button>
            </div>
        );
    }
    if (loading || !stats) {
        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-28 rounded-2xl bg-gray-100 animate-pulse" />
                ))}
            </div>
        );
    }
    const s = stats;

    function deltaSub(delta: number | undefined, unit = "") {
        if (delta == null) return "No previous data";
        const abs = Math.abs(delta);
        const up = delta >= 0;
        const arrow = up ? "\u2191" : "\u2193";
        const label = `${arrow} ${abs}${unit} vs prior period`;
        return label;
    }
    function deltaColor(delta: number | undefined, isInverted = false) {
        if (delta == null || delta === 0) return "text-gray-400";
        const positive = delta > 0;
        return (positive !== isInverted) ? "text-green-500" : "text-red-500";
    }

    const cards = [
        {
            label: "Active Jobs",
            value: s.activeJobs,
            sub: "All non-deleted jobs",
            icon: Briefcase,
            iconStyle: { background: "#F3E8FF" },
            iconColor: "text-purple-600",
            valueColor: "text-gray-900",
            subColor: "text-gray-400",
        },
        {
            label: "Total Candidates",
            value: s.totalCandidates,
            sub: deltaSub(s.appTrendDelta),
            icon: Users,
            iconStyle: { background: "#E0F2FE" },
            iconColor: "text-blue-500",
            valueColor: "text-gray-900",
            subColor: deltaColor(s.appTrendDelta),
        },
        {
            label: "Interviews Completed",
            value: s.interviewed,
            sub: deltaSub(s.interviewedDelta),
            icon: ClipboardCheck,
            iconStyle: { background: "#DCFCE7" },
            iconColor: "text-green-500",
            valueColor: "text-gray-900",
            subColor: deltaColor(s.interviewedDelta),
        },
        {
            label: "Shortlisted",
            value: s.shortlisted,
            sub: deltaSub(s.shortlistedDelta),
            icon: Star,
            iconStyle: { background: "#FEF3C7" },
            iconColor: "text-amber-500",
            valueColor: "text-gray-900",
            subColor: deltaColor(s.shortlistedDelta),
        },
        {
            label: "Rejected",
            value: s.rejected || 0,
            sub: deltaSub(s.rejectedDelta),
            icon: XCircle,
            iconStyle: { background: "#FEE2E2" },
            iconColor: "text-red-500",
            valueColor: "text-gray-900",
            subColor: deltaColor(s.rejectedDelta, true),
        },
        {
            label: "Avg. Interview Score",
            value: `${s.avgScore || 0}%`,
            sub: "Across completed interviews",
            icon: TrendingUp,
            iconStyle: { background: "#F3E8FF" },
            iconColor: "text-purple-600",
            valueColor: "text-gray-900",
            subColor: "text-gray-400",
        },
    ];
    return (
        <motion.div
            initial="hidden"
            animate="show"
            variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } }}
            className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4"
        >
            {cards.map((card, idx) => (
                <motion.div
                    key={idx}
                    variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as any } } }}
                    className="bg-white rounded-2xl p-5 flex flex-col justify-between min-h-[120px] transition-all duration-200"
                    style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}
                    onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = "#C4B5FD";
                        (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(124,58,237,0.08)";
                        (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = "#E9E7FF";
                        (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 3px rgba(124,58,237,0.04)";
                        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                    }}
                >
                    {/* Top row: icon + badge/pulse */}
                    <div className="flex items-start justify-between mb-3">
                        <div className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0" style={card.iconStyle}>
                            <card.icon className={cn("h-4 w-4", card.iconColor)} strokeWidth={1.75} />
                        </div>
                        <div className="flex items-center gap-2">
                        </div>
                    </div>
                    {/* Bottom: value + label + sub */}
                    <div>
                        <div className="flex items-center gap-2 mb-1.5">
                            <p className="text-xs font-semibold text-gray-500 leading-tight">
                                {card.label}
                            </p>
                        </div>
                        <p className={cn("text-3xl font-bold tabular-nums tracking-tight leading-none mb-2", card.valueColor)}>
                            {card.value}
                        </p>
                        <p className={cn("text-[11px] font-medium leading-tight", card.subColor)}>{card.sub}</p>
                    </div>
                </motion.div>
            ))}
        </motion.div>
    );
}
