"use client";

import { useState, useEffect } from "react";
import {
    UserPlus, FileCheck, XCircle,
    Sparkles, TriangleAlert, ChevronRight, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { ErrorState } from "./error-state";
import { type DateRange } from "./date-filter";

/* ── Activity types ──────────────────────────────────── */
type ActivityType = "application" | "interview_completed" | "rejection";

interface FeedItem {
    id: string;
    type: ActivityType;
    action: string;
    drive: string;
    time: string;
    timestamp: number;
    isDemo?: boolean;
}

function getIconProps(type: ActivityType) {
    switch (type) {
        case "application":
            return { icon: UserPlus, color: "#F97316", bg: "bg-orange-500/10", border: "border-orange-500/20" };
        case "interview_completed":
            return { icon: FileCheck, color: "#10B981", bg: "bg-emerald-500/10", border: "border-emerald-500/20" };
        case "rejection":
            return { icon: XCircle, color: "#EF4444", bg: "bg-red-500/10", border: "border-red-500/20" };
    }
}

function useActivityFeed(dateRange: DateRange) {
    const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    async function fetchFeed() {
        setError(null);
        try {
            const params = new URLSearchParams();
            if (dateRange.type === "custom") {
                params.set("range", "custom");
                params.set("from", dateRange.from);
                params.set("to", dateRange.to);
            } else {
                params.set("range", dateRange.type);
            }

            const res = await fetch(`/api/admin/activity?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setFeedItems(data.feed ?? []);
            } else {
                setError("Activity sync failed.");
            }
        } catch {
            setError("Network protocol failure.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchFeed();
        const interval = setInterval(fetchFeed, 30_000); // refresh every 30s
        return () => clearInterval(interval);
    }, [dateRange]);

    return { feedItems, loading, error, fetchFeed };
}

const insights = [
    {
        id: 1,
        text: "Candidates from IIT campuses score 22% higher on technical rounds for your Backend Engineer drive.",
        drive: "Backend Engineer",
    },
    {
        id: 2,
        text: "Top 5 AI-shortlisted candidates for Product Designer have been waiting 4+ days for review.",
        drive: "Product Designer",
    },
    {
        id: 3,
        text: "Application conversion is 2× higher from your careers page vs LinkedIn referrals this month.",
        drive: "All Drives",
    },
];

const alerts = [
    {
        id: 1,
        text: "Drive closing in 5 days",
        meta: "Product Designer · 23 candidates pending",
        time: "5d left",
        level: "amber",
    },
    {
        id: 2,
        text: "2 candidates dropped off during interview",
        meta: "Backend Engineer · interview timeout",
        time: "3h ago",
        level: "red",
    },
    {
        id: 3,
        text: "Interview feedback pending from 2 managers",
        meta: "Senior Frontend Engineer",
        time: "1d ago",
        level: "amber",
    },
];

interface LiveFeedProps {
    dateRange: DateRange;
}

export function LiveFeed({ dateRange }: LiveFeedProps) {
    const { feedItems, loading, error, fetchFeed } = useActivityFeed(dateRange);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-12">
            {/* ── ACTIVITY FEED ─────────────────────────── */}
            <div className="flex flex-col h-[520px] bg-white/40 backdrop-blur-xl rounded-[2.5rem] border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.06)] transition-all duration-700 overflow-hidden">
                <div className="py-6 px-8 border-b border-gray-100/50 flex flex-row items-center justify-between bg-white/20">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-2xl bg-orange-500/10 flex items-center justify-center text-[#F97316] border border-orange-500/20">
                            <UserPlus className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-gray-900 tracking-tight leading-none">Recent Activity</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Real-time Synchronization</p>
                        </div>
                    </div>
                    {loading && <Loader2 className="h-4 w-4 text-orange-400 animate-spin" />}
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
                    {error ? (
                        <div className="flex items-center justify-center h-full">
                            <ErrorState 
                                message={error} 
                                onRetry={fetchFeed} 
                                compact 
                                className="bg-transparent border-none shadow-none"
                            />
                        </div>
                    ) : !loading && feedItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-3">
                            <div className="h-12 w-12 rounded-full bg-gray-50 flex items-center justify-center">
                                <UserPlus className="h-6 w-6" />
                            </div>
                            <p className="text-[11px] font-black uppercase tracking-widest">Awaiting Pulse...</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {feedItems.map((item, idx) => {
                                const { icon: Icon, color, bg, border } = getIconProps(item.type);
                                return (
                                    <motion.div
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        key={item.id}
                                        className="p-4 rounded-[1.75rem] flex items-center gap-4 bg-white/50 border border-white hover:bg-white hover:border-orange-100 hover:shadow-sm transition-all duration-300 group"
                                    >
                                        <div className={cn("h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 border transition-transform group-hover:scale-110", bg, border)}>
                                            <Icon className="h-4 w-4" style={{ color }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <p className="text-[13px] font-black text-gray-900 truncate leading-none">{item.action}</p>
                                                {item.isDemo && (
                                                    <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-gray-100 text-[8px] font-black text-gray-400 uppercase tracking-widest border border-gray-200/50">
                                                        System
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight truncate">{item.drive}</span>
                                                <span className="h-1 w-1 rounded-full bg-gray-200" />
                                                <span className="text-[10px] font-black text-gray-300 uppercase shrink-0">{item.time}</span>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ── AI INSIGHTS ─────────────────────── */}
            <div className="flex flex-col h-[520px] bg-white/40 backdrop-blur-xl rounded-[2.5rem] border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_60px_rgba(249,115,22,0.06)] transition-all duration-700 overflow-hidden group">
                <div className="py-6 px-8 border-b border-gray-100/50 flex flex-row items-center justify-between bg-white/20">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-2xl bg-orange-500 flex items-center justify-center text-white shadow-[0_0_15px_rgba(249,115,22,0.4)] animate-pulse">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-gray-900 tracking-tight leading-none">AI Insights</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Strategic Analysis</p>
                        </div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 custom-scrollbar">
                    {insights.map((ins, idx) => (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            key={ins.id}
                            className="p-5 rounded-[2rem] border border-gray-100/50 bg-white/80 hover:bg-white hover:border-[#F97316]/30 hover:shadow-md transition-all duration-500"
                        >
                            <div className="flex items-start gap-4 mb-3">
                                <div className="h-1.5 w-1.5 rounded-full bg-[#F97316] mt-2 shrink-0" />
                                <p className="text-[12.5px] font-bold text-gray-800 leading-relaxed">{ins.text}</p>
                            </div>
                            <div className="flex items-center justify-between pl-5">
                                <span className="text-[10px] font-black text-[#F97316] uppercase tracking-widest">{ins.drive}</span>
                                <ChevronRight className="h-4 w-4 text-gray-200" />
                            </div>
                        </motion.div>
                    ))}
                    <div className="pt-2 px-5">
                        <div className="h-px bg-gradient-to-r from-transparent via-gray-100 to-transparent w-full" />
                        <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.3em] text-center mt-6">End of Neural Loop</p>
                    </div>
                </div>
            </div>

            {/* ── ALERTS CARD ─────────────────────────── */}
            <div className="flex flex-col h-[520px] bg-white/40 backdrop-blur-xl rounded-[2.5rem] border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_60px_rgba(239,68,68,0.06)] transition-all duration-700 overflow-hidden">
                <div className="py-6 px-8 border-b border-gray-100/50 flex flex-row items-center justify-between bg-white/20">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20">
                            <TriangleAlert className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-gray-900 tracking-tight leading-none">Matrix Alerts</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Anomaly Detection</p>
                        </div>
                    </div>
                    {alerts.length > 0 && (
                        <div className="h-6 w-6 rounded-lg bg-red-500 text-white text-[11px] font-black flex items-center justify-center shadow-lg shadow-red-500/20">{alerts.length}</div>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
                    <div className="space-y-4">
                        {alerts.map((alert, idx) => (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: idx * 0.1 }}
                                key={alert.id} 
                                className="px-6 py-5 rounded-[2rem] flex items-start gap-4 bg-white/50 border border-white hover:bg-white hover:border-red-100 transition-all duration-300"
                            >
                                <span
                                    className={cn(
                                        "h-2 w-2 rounded-full flex-shrink-0 mt-1.5 shadow-[0_0_8px_currentColor]",
                                        alert.level === "red" ? "text-red-500 shadow-red-500/50" : "text-amber-500 shadow-amber-500/50"
                                    )}
                                    style={{ backgroundColor: "currentColor" }}
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-black text-gray-900 leading-tight mb-2">{alert.text}</p>
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter truncate max-w-[150px]">{alert.meta}</p>
                                        <span className="text-[10px] font-black text-gray-300 uppercase">{alert.time}</span>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
