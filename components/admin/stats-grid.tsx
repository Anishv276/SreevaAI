"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, Loader2 } from "lucide-react";

interface StatsData {
    activeDrives: number;
    totalCandidates: number;
    aiInterviews: number;
    hiredThisMonth: number;
}

export function StatsGrid() {
    const [stats, setStats] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStats = async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch("/api/admin/stats");
            
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            } else {
                const errorData = await res.json().catch(() => ({}));
                setError(errorData.error || "Analytics connection timeout.");
            }
        } catch (error) {
            console.error("Failed to fetch dashboard stats", error);
            setError("Network protocol failure. Please verify connection.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    if (error) {
        return (
            <div className="bg-orange-50/50 border border-orange-100 rounded-[2rem] p-8 flex flex-col md:flex-row items-center justify-between gap-6 mb-8 group overflow-hidden relative">
                <div className="absolute top-0 right-0 h-32 w-32 bg-orange-100/30 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-orange-200/40 transition-all duration-700" />
                <div className="flex items-start gap-5 relative">
                    <div className="h-12 w-12 rounded-2xl bg-white border border-orange-200 flex items-center justify-center text-[#F97316] shadow-sm shrink-0">
                        <TrendingUp className="h-6 w-6 opacity-30" />
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-gray-900 font-black text-lg tracking-tight">Analytics Offline</h3>
                        <p className="text-gray-500 text-sm font-medium leading-relaxed max-w-md">
                            {error}. Your core data is safe—our telemetry system just needs a quick nudge to reconnect.
                        </p>
                    </div>
                </div>
                <button 
                    onClick={fetchStats}
                    className="relative px-6 py-2.5 bg-gray-900 text-white font-black text-xs uppercase tracking-[0.15em] rounded-xl hover:bg-[#F97316] transition-all transform hover:scale-[1.03] active:scale-[0.98] shadow-lg shadow-gray-200"
                >
                    Retry Connection
                </button>
            </div>
        );
    }

    const statsConfig = [
        {
            label: "ACTIVE DRIVES",
            value: stats?.activeDrives ?? 0,
            trendLabel: "Live",
            trendPositive: true,
            context: `${stats?.activeDrives || 0} recruitment cycles in progress`,
        },
        {
            label: "TOTAL CANDIDATES",
            value: stats?.totalCandidates ?? 0,
            trendLabel: "Synced",
            trendPositive: true,
            context: `${stats?.totalCandidates || 0} applications processed`,
        },
        {
            label: "AI INTERVIEWS",
            value: stats?.aiInterviews ?? 0,
            trendLabel: "Success",
            trendPositive: true,
            context: `${stats?.aiInterviews || 0} completed screening sessions`,
        },
        {
            label: "HIRED THIS MONTH",
            value: stats?.hiredThisMonth ?? 0,
            trendLabel: "Goal",
            trendPositive: false,
            context: `Target: 10+ recruits monthly`,
        },
    ];

    if (loading) {
        return (
            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-44 rounded-2xl bg-white border border-gray-100 shadow-sm animate-pulse flex items-center justify-center">
                        <Loader2 className="h-6 w-6 text-gray-200 animate-spin" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {statsConfig.map((stat, i) => {
                return (
                    <div
                        key={i}
                        className="group relative rounded-2xl p-6 transition-all duration-500 bg-white border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_15px_35px_rgba(249,115,22,0.1)] hover:border-orange-100 overflow-hidden"
                    >
                        {/* Interactive Border Glow */}
                        <div className="absolute top-0 left-0 w-1 h-full bg-[#F97316] opacity-0 group-hover:opacity-100 transition-opacity" />
                        
                        {/* Label + trend */}
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-[10px] font-black text-gray-400 tracking-[0.15em] uppercase">
                                {stat.label}
                            </p>
                            <span
                                className={cn(
                                    "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-tighter transition-colors",
                                    stat.trendPositive
                                        ? "bg-green-50 text-green-600 border border-green-100"
                                        : "bg-gray-50 text-gray-400 border border-gray-100"
                                )}
                            >
                                {stat.trendPositive && <TrendingUp className="h-3 w-3" />}
                                {stat.trendLabel}
                            </span>
                        </div>

                        {/* Hero number */}
                        <div className="flex items-baseline gap-1">
                            <p className="text-5xl font-black text-gray-900 leading-none tabular-nums tracking-tighter group-hover:text-[#F97316] transition-colors">
                                {stat.value}
                            </p>
                        </div>

                        {/* Context */}
                        <div className="mt-4 pt-4 border-t border-gray-50 flex items-center gap-2">
                             <div className="h-1.5 w-1.5 rounded-full bg-orange-200" />
                             <p className="text-xs font-bold text-gray-500 leading-none">{stat.context}</p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
