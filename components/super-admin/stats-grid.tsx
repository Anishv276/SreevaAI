"use client";

import { useEffect, useState } from "react";
import { Users, Building2, Briefcase, Zap, Globe, Target, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface SuperAdminStats {
    totalOrgs: number;
    activeOrgs: number;
    suspendedOrgs: number;
    closedOrgs: number;
    totalAdmins: number;
    totalDrives: number;
    totalCandidates: number;
    totalCreditsUsed: number;
    platformHealth: number;
    engagedOrgs: number;
    trends: { orgs: number; admins: number; drives: number; candidates: number };
}

export function SuperAdminStatsGrid() {
    const [stats, setStats] = useState<SuperAdminStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryKey, setRetryKey] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;

        setLoading(true);
        setError(null);

        fetch("/api/super-admin/stats", { signal })
            .then(async (res) => {
                if (!signal.aborted) {
                    if (res.ok) setStats(await res.json());
                    else setError("Failed to load stats.");
                }
            })
            .catch((err) => {
                if (!signal.aborted && err.name !== "AbortError") setError("Network error.");
            })
            .finally(() => { if (!signal.aborted) setLoading(false); });

        return () => controller.abort();
    }, [retryKey]);

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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-28 rounded-2xl bg-gray-100 animate-pulse" />
                ))}
            </div>
        );
    }

    const s = stats;
    const activePercentage = s.platformHealth ?? (s.totalOrgs > 0 ? Math.round((s.activeOrgs / s.totalOrgs) * 100) : 0);

    const cards = [
        {
            label: "Organizations",
            value: s.totalOrgs,
            trend: s.trends?.orgs ?? 0,
            icon: Building2,
            color: "text-orange-600",
            iconBg: "bg-orange-50",
        },
        {
            label: "Platform Admins",
            value: s.totalAdmins,
            trend: s.trends?.admins ?? 0,
            icon: Users,
            color: "text-blue-600",
            iconBg: "bg-blue-50",
        },
        {
            label: "Global Jobs",
            value: s.totalDrives,
            trend: s.trends?.drives ?? 0,
            icon: Briefcase,
            color: "text-violet-600",
            iconBg: "bg-violet-50",
        },
        {
            label: "Candidates",
            value: s.totalCandidates,
            trend: s.trends?.candidates ?? 0,
            icon: Target,
            color: "text-pink-600",
            iconBg: "bg-pink-50",
        },
        {
            label: "Credits Used",
            value: Math.round(s.totalCreditsUsed),
            trend: 0,
            icon: Zap,
            color: "text-emerald-600",
            iconBg: "bg-emerald-50",
        },
        {
            label: "Platform Health",
            value: `${activePercentage}%`,
            trend: 0,
            icon: Globe,
            color: activePercentage > 90 ? "text-emerald-600" : activePercentage > 70 ? "text-amber-600" : "text-red-500",
            iconBg: activePercentage > 90 ? "bg-emerald-50" : activePercentage > 70 ? "bg-amber-50" : "bg-red-50",
            sub: `${s.activeOrgs} active · ${s.suspendedOrgs} paused · ${s.engagedOrgs ?? 0} engaged/30d`,
        },
    ];

    return (
        <motion.div
            initial="hidden"
            animate="show"
            variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } }}
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4"
        >
            {cards.map((card, idx) => (
                <motion.div
                    key={idx}
                    variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as any } } }}
                    className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-3 hover:border-gray-300 hover:shadow-sm transition-all duration-200"
                >
                    <div className="flex items-start justify-between">
                        <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center", card.iconBg)}>
                            <card.icon className={cn("h-4 w-4", card.color)} />
                        </div>
                        {card.trend !== 0 && (
                            <span className={cn(
                                "text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5",
                                card.trend > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                            )}>
                                {card.trend > 0
                                    ? <TrendingUp className="h-2.5 w-2.5" />
                                    : <TrendingDown className="h-2.5 w-2.5" />}
                                {Math.abs(card.trend)}%
                            </span>
                        )}
                    </div>
                    <div>
                        <p className={cn("text-xl font-bold tabular-nums tracking-tight", card.color)}>
                            {card.value}
                        </p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                            {card.label}
                        </p>
                        {card.sub && (
                            <p className="text-[10px] text-gray-400 mt-1">{card.sub}</p>
                        )}
                    </div>
                </motion.div>
            ))}
        </motion.div>
    );
}
