"use client";
import { useEffect, useState, useCallback } from "react";
import {
    Users, Briefcase, Video, UserCheck,
    Clock, Target, Radio, Star
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import type { DateRange } from "./date-filter";
interface StatsData {
    activeDrives: number;
    totalCandidates: number;
    applicationsToday: number;
    appTrendDelta: number;
    interviewed: number;
    shortlisted: number;
    shortlistPassRate: number;
    liveInterviews: number;
    avgRating: number;
}
interface StatsGridProps {
    dateRange: DateRange;
}
function buildUrl(range: DateRange) {
    const base = "/api/admin/stats";
    if (range.type === "custom") return `${base}?range=custom&from=${range.from}&to=${range.to}`;
    return `${base}?range=${range.type}`;
}
export function StatsGrid({ dateRange }: StatsGridProps) {
    const [stats, setStats] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryKey, setRetryKey] = useState(0);
    useEffect(() => {
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
    const cards = [
        {
            label: "Active Jobs",
            value: s.activeDrives,
            sub: "Open positions",
            icon: Briefcase,
            iconStyle: { background: "linear-gradient(135deg, rgba(124,58,237,0.1), rgba(59,130,246,0.08))" },
            iconColor: "text-violet-600",
            valueColor: "text-gray-900",
        },
        {
            label: "Uploaded",
            value: s.totalCandidates,
            sub: `+${s.applicationsToday} today`,
            icon: Users,
            iconStyle: { background: "rgba(59,130,246,0.1)" },
            iconColor: "text-blue-600",
            valueColor: "text-gray-900",
            badge: s.appTrendDelta !== 0
                ? { label: `${s.appTrendDelta > 0 ? "+" : ""}${s.appTrendDelta}`, up: s.appTrendDelta >= 0 }
                : undefined,
        },
        {
            label: "Live Now",
            value: s.liveInterviews,
            sub: "Active sessions",
            icon: Radio,
            iconStyle: { background: "rgba(139,92,246,0.1)" },
            iconColor: "text-violet-600",
            valueColor: "text-gray-900",
            pulse: s.liveInterviews > 0,
        },
        {
            label: "Interviewed",
            value: s.interviewed,
            sub: s.totalCandidates
                ? `${Math.round((s.interviewed / s.totalCandidates) * 100)}% of uploaded`
                : "of uploaded",
            icon: Video,
            iconStyle: { background: "rgba(109,40,217,0.1)" },
            iconColor: "text-violet-700",
            valueColor: "text-gray-900",
        },
        {
            label: "Shortlisted",
            value: s.shortlisted,
            sub: `${s.shortlistPassRate}% pass rate`,
            icon: Target,
            iconStyle: { background: "rgba(96,165,250,0.12)" },
            iconColor: "text-blue-500",
            valueColor: "text-gray-900",
        },
        {
            label: "Candidate Rating",
            value: s.avgRating > 0 ? s.avgRating.toFixed(1) : "—",
            sub: s.avgRating > 0 ? "Avg. experience (1–5)" : "No ratings yet",
            icon: Star,
            iconStyle: { background: "rgba(245,158,11,0.1)" },
            iconColor: "text-amber-500",
            valueColor: "text-gray-900",
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
                            {card.pulse && (
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
                                </span>
                            )}
                            {card.badge && (
                                <span className={cn(
                                    "text-[10px] font-semibold px-1.5 py-0.5 rounded-md",
                                    card.badge.up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                                )}>
                                    {card.badge.label}
                                </span>
                            )}
                        </div>
                    </div>
                    {/* Bottom: value + label + sub */}
                    <div>
                        <p className={cn("text-2xl font-bold tabular-nums tracking-tight leading-none", card.valueColor)}>
                            {card.value}
                        </p>
                        <p className="text-xs font-semibold text-gray-500 mt-1.5 leading-tight">
                            {card.label}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{card.sub}</p>
                    </div>
                </motion.div>
            ))}
        </motion.div>
    );
}
