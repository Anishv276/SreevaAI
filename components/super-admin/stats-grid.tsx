"use client";

import { useEffect, useState } from "react";
import { 
    Users, Building2, Briefcase, Video, 
    Coins, Zap, Activity, Globe,
    TrendingUp, TrendingDown, Target, Star
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface SuperAdminStats {
    totalOrgs: number;
    activeOrgs: number;
    suspendedOrgs: number;
    totalAdmins: number;
    totalDrives: number;
    totalCandidates: number;
    totalCreditsAllocated: number;
    totalCreditsConsumed: number;
    trends: {
        orgs: number;
        admins: number;
        drives: number;
        candidates: number;
        credits: number;
    };
}

export function SuperAdminStatsGrid() {
    const [stats, setStats] = useState<SuperAdminStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                setLoading(true);
                const res = await fetch("/api/super-admin/orgs?limit=1");
                if (res.ok) {
                    const data = await res.json();
                    setStats(data.stats);
                } else {
                    setError("Stats synchronization error.");
                }
            } catch (err) {
                setError("Network protocol failure.");
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    if (loading || !stats) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[...Array(8)].map((_, i) => (
                    <div key={i} className="h-32 rounded-[2rem] bg-white border border-gray-100 animate-pulse" />
                ))}
            </div>
        );
    }

    const s = stats;
    const remainingCredits = Math.max(0, s.totalCreditsAllocated - s.totalCreditsConsumed);
    const activePercentage = s.totalOrgs > 0 ? Math.round((s.activeOrgs / s.totalOrgs) * 100) : 0;

    const cards = [
        {
            label: "Total Organizations",
            value: s.totalOrgs,
            trend: s.trends?.orgs || 0,
            icon: Building2,
            accent: "#F97316",
            bg: "bg-orange-50/50",
            iconBg: "bg-orange-100/50 text-[#F97316]",
        },
        {
            label: "Platform Admins",
            value: s.totalAdmins,
            trend: s.trends?.admins || 0,
            icon: Users,
            accent: "#3B82F6",
            bg: "bg-blue-50/50",
            iconBg: "bg-blue-100/50 text-blue-600",
        },
        {
            label: "Global Drives",
            value: s.totalDrives,
            trend: s.trends?.drives || 0,
            icon: Briefcase,
            accent: "#8B5CF6",
            bg: "bg-purple-50/50",
            iconBg: "bg-purple-100/50 text-purple-600",
        },
        {
            label: "Global Candidates",
            value: s.totalCandidates,
            trend: s.trends?.candidates || 0,
            icon: Target,
            accent: "#EC4899",
            bg: "bg-pink-50/50",
            iconBg: "bg-pink-100/50 text-pink-600",
        },
        {
            label: "Allocated Credits",
            value: Math.round(s.totalCreditsAllocated),
            trend: 0,
            icon: Coins,
            accent: "#F59E0B",
            bg: "bg-amber-50/50",
            iconBg: "bg-amber-100/50 text-amber-600",
        },
        {
            label: "Consumed Credits",
            value: Math.round(s.totalCreditsConsumed),
            trend: 0,
            icon: Zap,
            accent: "#10B981",
            bg: "bg-emerald-50/50",
            iconBg: "bg-emerald-100/50 text-emerald-600",
        },
        {
            label: "Remaining Balance",
            value: Math.round(remainingCredits),
            trend: 0,
            icon: Activity,
            accent: "#0EA5E9",
            bg: "bg-sky-50/50",
            iconBg: "bg-sky-100/50 text-sky-600",
        },
        {
            label: "Platform Health",
            value: `${activePercentage}%`,
            trend: activePercentage > 90 ? 2 : -1,
            icon: Globe,
            accent: "#6366F1",
            bg: "bg-indigo-50/50",
            iconBg: "bg-indigo-100/50 text-indigo-600",
            pulse: activePercentage > 90
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
                            {card.trend !== 0 && (
                                <div className={cn(
                                    "flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold",
                                    card.trend > 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                                )}>
                                    {card.trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                    {Math.abs(card.trend)}%
                                </div>
                            )}
                        </div>

                        <div className="space-y-1">
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.12em]">
                                {card.label}
                            </p>
                            <div className="flex items-baseline gap-2">
                                <h3 className="text-3xl font-bold text-gray-950 tracking-tight tabular-nums">
                                    {card.value}
                                </h3>
                            </div>
                        </div>

                        <div className="absolute bottom-6 right-6 h-1 w-1 rounded-full bg-gray-100 group-hover:bg-[var(--accent)] group-hover:scale-150 transition-all duration-500 shadow-sm" />
                    </div>
                </motion.div>
            ))}
        </motion.div>
    );
}
