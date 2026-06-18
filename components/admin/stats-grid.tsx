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
    hiredThisMonth: number;
    hiredPrevMonth: number;
    avgTimeToHire: number | null;
    timeToHireDiff: number | null;
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[...Array(8)].map((_, i) => (
                    <div key={i} className="h-28 rounded-2xl bg-gray-100 animate-pulse" />
                ))}
            </div>
        );
    }
    const s = stats;
    const hiredDelta = s.hiredThisMonth - s.hiredPrevMonth;
    const cards = [
        {
            label: "Active Jobs",
            value: s.activeDrives,
            sub: "Open positions",
            icon: Briefcase,
            color: "text-gray-700",
            iconBg: "bg-gray-100",
        },
        {
            label: "Uploaded",
            value: s.totalCandidates,
            sub: `+${s.applicationsToday} today`,
            icon: Users,
            color: "text-blue-700",
            iconBg: "bg-blue-50",
            badge: s.appTrendDelta !== 0
                ? { label: `${s.appTrendDelta > 0 ? "+" : ""}${s.appTrendDelta}`, up: s.appTrendDelta >= 0 }
                : undefined,
        },
        {
            label: "Live Now",
            value: s.liveInterviews,
            sub: "Active sessions",
            icon: Radio,
            color: "text-indigo-700",
            iconBg: "bg-indigo-50",
            pulse: s.liveInterviews > 0,
        },
        {
            label: "Interviewed",
            value: s.interviewed,
            sub: s.totalCandidates
                ? `${Math.round((s.interviewed / s.totalCandidates) * 100)}% of uploaded`
                : "of uploaded",
            icon: Video,
            color: "text-violet-700",
            iconBg: "bg-violet-50",
        },
        {
            label: "Shortlisted",
            value: s.shortlisted,
            sub: `${s.shortlistPassRate}% pass rate`,
            icon: Target,
            color: "text-pink-700",
            iconBg: "bg-pink-50",
        },
        {
            label: "Hired",
            value: s.hiredThisMonth,
            sub: s.hiredPrevMonth > 0
                ? `${hiredDelta >= 0 ? "+" : ""}${hiredDelta} vs last period`
                : "This period",
            icon: UserCheck,
            color: "text-emerald-700",
            iconBg: "bg-emerald-50",
            badge: s.hiredPrevMonth > 0
                ? { label: `${hiredDelta >= 0 ? "+" : ""}${hiredDelta}`, up: hiredDelta >= 0 }
                : undefined,
        },
        {
            label: "Avg. Time to Hire",
            value: s.avgTimeToHire != null ? `${s.avgTimeToHire}d` : "—",
            sub: s.timeToHireDiff != null
                ? `${s.timeToHireDiff > 0 ? "+" : ""}${s.timeToHireDiff}d vs last period`
                : s.avgTimeToHire != null ? "Stable" : "No hires yet",
            icon: Clock,
            color: "text-sky-700",
            iconBg: "bg-sky-50",
        },
        {
            label: "Candidate Rating",
            value: s.avgRating > 0 ? s.avgRating.toFixed(1) : "—",
            sub: s.avgRating > 0 ? "Avg. experience (1–5)" : "No ratings yet",
            icon: Star,
            color: "text-amber-700",
            iconBg: "bg-amber-50",
        },
    ];
    return (
        <motion.div
            initial="hidden"
            animate="show"
            variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-4"
        >
            {cards.map((card, idx) => (
                <motion.div
                    key={idx}
                    variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as any } } }}
                    className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-3 hover:border-gray-300 hover:shadow-sm transition-all duration-200"
                >
                    <div className="flex items-start justify-between">
                        <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center", card.iconBg)}>
                            <card.icon className={cn("h-4 w-4", card.color)} />
                        </div>
                        <div className="flex items-center gap-2">
                            {card.pulse && (
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
                                </span>
                            )}
                            {card.badge && (
                                <span className={cn(
                                    "text-[10px] font-bold px-1.5 py-0.5 rounded-md",
                                    card.badge.up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                                )}>
                                    {card.badge.label}
                                </span>
                            )}
                        </div>
                    </div>
                    <div>
                        <p className={cn("text-2xl font-bold tabular-nums tracking-tight", card.color)}>
                            {card.value}
                        </p>
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                            {card.label}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                    </div>
                </motion.div>
            ))}
        </motion.div>
    );
}
