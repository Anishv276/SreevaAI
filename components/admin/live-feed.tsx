"use client";

import { useEffect, useRef, useState } from "react";
import {
    UserPlus,
    FileCheck,
    XCircle,
    Sparkles,
    TriangleAlert,
    ChevronRight,
    Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ErrorState } from "./error-state";
import { type DateRange } from "./date-filter";

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
            return { icon: UserPlus, color: "#475569", bg: "bg-slate-500/10", border: "border-slate-500/20" };
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
    const fetchRef = useRef<(() => Promise<void>) | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;

        const fetchFeed = async () => {
            setError(null);
            setLoading(true);
            try {
                const params = new URLSearchParams();
                if (dateRange.type === "custom") {
                    params.set("range", "custom");
                    params.set("from", dateRange.from);
                    params.set("to", dateRange.to);
                } else {
                    params.set("range", dateRange.type);
                }

                const res = await fetch(`/api/admin/activity?${params.toString()}`, { signal });
                if (res.ok) {
                    const data = await res.json();
                    if (!signal.aborted) setFeedItems(data.feed ?? []);
                } else if (!signal.aborted) {
                    setError("Activity sync failed.");
                }
            } catch (err: unknown) {
                if (!(err instanceof DOMException && err.name === "AbortError")) {
                    setError("Activity stream unavailable.");
                }
            } finally {
                if (!signal.aborted) setLoading(false);
            }
        };

        fetchRef.current = fetchFeed;
        fetchFeed();
        const interval = setInterval(fetchFeed, 30_000);

        return () => {
            controller.abort();
            clearInterval(interval);
        };
    }, [dateRange]);

    return {
        feedItems,
        loading,
        error,
        fetchFeed: () => fetchRef.current?.(),
    };
}

function summarizeFeed(feedItems: FeedItem[]) {
    return {
        applications: feedItems.filter((item) => item.type === "application").length,
        interviews: feedItems.filter((item) => item.type === "interview_completed").length,
        rejections: feedItems.filter((item) => item.type === "rejection").length,
    };
}

interface LiveFeedProps {
    dateRange: DateRange;
}

export function LiveFeed({ dateRange }: LiveFeedProps) {
    const { feedItems, loading, error, fetchFeed } = useActivityFeed(dateRange);
    const summary = summarizeFeed(feedItems);

    return (
        <div className="pb-12">
            <div className="flex h-[600px] flex-col overflow-hidden rounded-[2.5rem] border border-white/60 bg-white/45 shadow-[0_8px_32px_rgba(0,0,0,0.02)] backdrop-blur-xl transition-all duration-700 hover:shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
                <div className="border-b border-gray-100/60 bg-white/30 px-8 py-6">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center gap-4">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-500/20 bg-slate-500/10 text-slate-700">
                                <Sparkles className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black tracking-tight text-gray-900">Recent Activity</h3>
                                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                    Live recruiting pulse
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-600">
                                {summary.applications} uploads
                            </span>
                            <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-600">
                                {summary.interviews} interviews
                            </span>
                            <span className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-red-600">
                                {summary.rejections} rejections
                            </span>
                            {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">
                    {error ? (
                        <div className="flex h-full items-center justify-center">
                            <ErrorState
                                message={error}
                                onRetry={fetchFeed}
                                compact
                                className="border-none bg-transparent shadow-none"
                            />
                        </div>
                    ) : !loading && feedItems.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-300">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-50">
                                <TriangleAlert className="h-6 w-6 text-gray-300" />
                            </div>
                            <div className="text-center">
                                <p className="text-[11px] font-black uppercase tracking-widest text-gray-500">
                                    No recent activity
                                </p>
                                <p className="mt-1 text-[12px] text-gray-400">
                                    New uploads, interviews, and outcomes will appear here.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {feedItems.map((item, idx) => {
                                const { icon: Icon, color, bg, border } = getIconProps(item.type);

                                return (
                                    <motion.div
                                        key={item.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="group relative flex items-center gap-5 rounded-[2rem] border border-white bg-white/60 px-5 py-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-200 hover:bg-white hover:shadow-[0_15px_30px_rgba(15,23,42,0.04)]"
                                        style={{ borderLeft: `4px solid ${color}` }}
                                    >
                                        <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition-transform group-hover:scale-110", bg, border)}>
                                            <Icon className="h-5 w-5" style={{ color }} />
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="mb-1 flex items-center gap-2">
                                                <p className="truncate text-[14px] font-black leading-none text-gray-900 group-hover:text-slate-700">
                                                    {item.action}
                                                </p>
                                                {item.isDemo && (
                                                    <span className="shrink-0 rounded-md border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-gray-400">
                                                        System
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="truncate text-[11px] font-bold uppercase tracking-widest text-gray-400">
                                                    {item.drive}
                                                </span>
                                                <span className="h-1 w-1 rounded-full bg-gray-200" />
                                                <span className="shrink-0 text-[10px] font-black uppercase text-gray-300">
                                                    {item.time}
                                                </span>
                                            </div>
                                        </div>

                                        <ChevronRight className="h-5 w-5 text-gray-200 transition-all group-hover:translate-x-1 group-hover:text-slate-700" />
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
