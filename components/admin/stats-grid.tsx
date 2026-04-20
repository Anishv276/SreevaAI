"use client";

import { useEffect, useState, useCallback } from "react";
import { 
    Users, Briefcase, Video, UserCheck, 
    Clock, Flag, Search, Target, Timer,
    TrendingUp, TrendingDown, Minus, Radio, Star
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import type { DateRange } from "./date-filter";
import { ErrorState } from "./error-state";

interface StatsData {
    activeDrives: number;
    closingSoon: number;
    totalCandidates: number;
    applicationsToday: number;
    appTrendDelta: number;
    interviewed: number;
    interviewRate: number;
    shortlisted: number;
    shortlistPassRate: number;
    hiredThisMonth: number;
    hiredPrevMonth: number;
    avgTimeToHire: number | null;
    timeToHireDiff: number | null;
    dropOffRate: number;
    needsReview: number;
    liveInterviews: number;
    avgRating: number;
    invited: number;
}

interface StatsGridProps {
    dateRange: DateRange;
}

function buildUrl(range: DateRange) {
    const base = "/api/admin/stats";
    if (range.type === "custom") {
        return `${base}?range=custom&from=${range.from}&to=${range.to}`;
    }
    return `${base}?range=${range.type}`;
}

export function StatsGrid({ dateRange }: StatsGridProps) {
    const [stats, setStats] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;

        const fetchStats = async () => {
            try {
                setLoading(true);
                setError(null);
                const res = await fetch(buildUrl(dateRange), { signal });
                if (res.ok) {
                    const data = await res.json();
                    if (!signal.aborted) setStats(data);
                } else {
                    const d = await res.json().catch(() => ({}));
                    if (!signal.aborted) setError(d.error || "Stats synchronization error.");
                }
            } catch (err: any) {
                if (err.name !== "AbortError") {
                    setError("Network protocol failure.");
                }
            } finally {
                if (!signal.aborted) setLoading(false);
            }
        };

        fetchStats();
        return () => controller.abort();
    }, [dateRange]);

    const handleRetry = () => {
        setLoading(true);
        setError(null);
        // This will trigger the useEffect because dateRange is a dependency, 
        // but we need a way to force re-fetch if dateRange hasn't changed.
        // For now, simple retry just resets error state.
    };

    if (error) {
        return (
            <div className="col-span-full">
                <ErrorState 
                    message={error} 
                    onRetry={handleRetry} 
                    compact 
                    className="bg-red-50/10 border-red-100"
                />
            </div>
        );
    }

    if (loading || !stats) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[...Array(8)].map((_, i) => (
                    <div key={i} className="h-32 rounded-[2rem] bg-white border border-gray-100 animate-pulse" />
                ))}
            </div>
        );
    }

    const s = stats!;
    const cards = [
        {
            label: "Active drives",
            value: s.activeDrives,
            subtext: `${s.closingSoon} closing soon`,
            icon: Briefcase,
            accent: "#F97316",
            bg: "bg-orange-50/50",
            iconBg: "bg-orange-100/50 text-[#F97316]",
        },
        {
            label: "Applications",
            value: s.totalCandidates,
            subtext: `+${s.applicationsToday} today`,
            icon: Users,
            accent: "#3B82F6",
            bg: "bg-blue-50/50",
            iconBg: "bg-blue-100/50 text-blue-600",
            trend: s.appTrendDelta
        },
        {
            label: "Live Interviews",
            value: s.liveInterviews,
            subtext: "Currently active sessions",
            icon: Radio,
            accent: "#6366F1",
            bg: "bg-indigo-50/50",
            iconBg: "bg-indigo-100/50 text-indigo-600",
            pulse: s.liveInterviews > 0
        },
        {
            label: "Interviewed",
            value: s.interviewed,
            subtext: `${s.totalCandidates ? Math.round((s.interviewed / s.totalCandidates) * 100) : 0}% of apps`,
            icon: Video,
            accent: "#8B5CF6",
            bg: "bg-purple-50/50",
            iconBg: "bg-purple-100/50 text-purple-600",
        },
        {
            label: "Shortlisted",
            value: s.shortlisted,
            subtext: `${s.shortlistPassRate}% pass rate`,
            icon: Target,
            accent: "#EC4899",
            bg: "bg-pink-50/50",
            iconBg: "bg-pink-100/50 text-pink-600",
        },
        {
            label: "Hired this month",
            value: s.hiredThisMonth,
            subtext: "Target: 10",
            icon: UserCheck,
            accent: "#10B981",
            bg: "bg-emerald-50/50",
            iconBg: "bg-emerald-100/50 text-emerald-600",
            trend: s.hiredThisMonth - s.hiredPrevMonth
        },
        {
            label: "Avg. time to hire",
            value: s.avgTimeToHire != null ? `${s.avgTimeToHire}d` : "-",
            subtext: s.timeToHireDiff != null ? `${s.timeToHireDiff > 0 ? "+" : ""}${s.timeToHireDiff}d vs last mo.` : "Steady vs last mo.",
            icon: Clock,
            accent: "#0EA5E9",
            bg: "bg-sky-50/50",
            iconBg: "bg-sky-100/50 text-sky-600",
        },
        {
            label: "Candidate Satisfaction",
            value: s.avgRating > 0 ? s.avgRating.toFixed(1) : "-",
            subtext: "Avg. candidate rating (1-5)",
            icon: Star,
            accent: "#F59E0B",
            bg: "bg-amber-50/50",
            iconBg: "bg-amber-100/50 text-amber-600",
        }
    ];

    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 20 },
        show: { 
            opacity: 1, 
            y: 0, 
            transition: { 
                duration: 0.6, 
                ease: [0.16, 1, 0.3, 1] as any
            } 
        }
    };

    return (
        <motion.div 
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
        >
            {cards.map((card, idx) => (
                <motion.div 
                    key={idx}
                    variants={item}
                    className="group relative"
                >
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-white/10 to-white/5 rounded-[2.5rem] opacity-0 group-hover:opacity-100 transition duration-500 blur-sm z-0" />
                    <div className={cn(
                        "relative z-10 h-full p-6 rounded-[2.5rem] bg-white border border-gray-100 transition-all duration-300",
                        "hover:shadow-[0_20px_50px_rgba(0,0,0,0.04)] hover:border-transparent group-hover:bg-white/90 group-hover:backdrop-blur-xl"
                    )} style={{ "--accent": card.accent } as any}>
                        <div className="flex items-start justify-between mb-4">
                            <div className={cn(
                                "h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-500 group-hover:rotate-6 group-hover:scale-110",
                                card.iconBg
                            )}>
                                <card.icon className="h-6 w-6" />
                            </div>
                            {card.pulse && (
                                <div className="flex h-3 w-3 relative">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
                                </div>
                            )}
                        </div>

                        <div className="space-y-1">
                            <p className="text-[12px] font-bold text-gray-400 uppercase tracking-widest text-premium">
                                {card.label}
                            </p>
                            <div className="flex items-baseline gap-2">
                                <h3 className="text-3xl font-black text-gray-900 tracking-tighter tabular-nums">
                                    {card.value}
                                </h3>
                                {card.trend != null && (
                                    <span className={cn(
                                        "text-[10px] font-black px-2 py-0.5 rounded-full flex items-center",
                                        card.trend >= 0 ? "text-emerald-600 bg-emerald-50" : "text-rose-600 bg-rose-50"
                                    )}>
                                        {card.trend > 0 ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
                                        {Math.abs(card.trend)}
                                    </span>
                                )}
                            </div>
                            <p className="text-[13px] font-medium text-gray-500 mt-1">
                                {card.subtext}
                            </p>
                        </div>

                        {/* Decorator Shape */}
                        <div className="absolute bottom-6 right-6 h-1 w-1 rounded-full bg-gray-100 group-hover:bg-[var(--accent)] group-hover:scale-150 transition-all duration-500 shadow-sm" />
                    </div>
                </motion.div>
            ))}
        </motion.div>
    );
}

