"use client";

import { useJobs } from "@/context/jobs-context";
import { cn } from "@/lib/utils";
import { TrendingUp } from "lucide-react";

const statsConfig = [
    {
        label: "ACTIVE DRIVES",
        defaultValue: "4",
        trendLabel: "↑ 2",
        trendPositive: true,
        context: "2 drives live and accepting candidates",
    },
    {
        label: "TOTAL CANDIDATES",
        defaultValue: "238",
        trendLabel: "↑ 12%",
        trendPositive: true,
        context: "34 new applications this week",
    },
    {
        label: "AI ASSESSMENTS",
        defaultValue: "184",
        trendLabel: "↑ 8%",
        trendPositive: true,
        context: "Avg AI score 74% · 6 pending review",
    },
    {
        label: "HIRED THIS MONTH",
        defaultValue: "11",
        trendLabel: "—",
        trendPositive: false,
        context: "Up from 8 last month",
    },
];

export function StatsGrid() {
    const { jobs } = useJobs();

    return (
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {statsConfig.map((stat, i) => {
                const value = i === 0 ? jobs.length.toString() : stat.defaultValue;
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
                                {value}
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
