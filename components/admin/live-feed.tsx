"use client";
import { useEffect, useRef, useState } from "react";
import { UserPlus, FileCheck, XCircle, TriangleAlert, ChevronRight, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
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
            return { icon: UserPlus,   color: "#475569", bg: "bg-gray-100",   border: "border-gray-200" };
        case "interview_completed":
            return { icon: FileCheck,  color: "#10B981", bg: "bg-emerald-50",  border: "border-emerald-100" };
        case "rejection":
            return { icon: XCircle,    color: "#EF4444", bg: "bg-red-50",      border: "border-red-100" };
    }
}
function useActivityFeed(dateRange: DateRange) {
    const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const fetchRef = useRef<(() => Promise<void>) | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;
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
                    setError("Failed to load activity.");
                }
            } catch (err: unknown) {
                if (!(err instanceof DOMException && err.name === "AbortError")) {
                    setError("Network error.");
                }
            } finally {
                if (!signal.aborted) setLoading(false);
            }
        };
        fetchRef.current = fetchFeed;
        fetchFeed();
        // Pause polling when tab is hidden
        const interval = setInterval(() => {
            if (!document.hidden) fetchFeed();
        }, 30_000);
        return () => {
            controller.abort();
            clearInterval(interval);
        };
    }, [dateRange]);
    return { feedItems, loading, error, retry: () => fetchRef.current?.() };
}
function summarize(items: FeedItem[]) {
    return {
        uploads:    items.filter((i) => i.type === "application").length,
        interviews: items.filter((i) => i.type === "interview_completed").length,
        rejections: items.filter((i) => i.type === "rejection").length,
    };
}
interface LiveFeedProps {
    dateRange: DateRange;
}
export function LiveFeed({ dateRange }: LiveFeedProps) {
    const { feedItems, loading, error, retry } = useActivityFeed(dateRange);
    const summary = summarize(feedItems);
    return (
        <div className="premium-card overflow-hidden">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-6 py-5 border-b border-gray-100">
                <div>
                    <h3 className="text-base font-bold text-gray-900 tracking-tight">Recent Activity</h3>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Live recruiting pulse</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                        {summary.uploads} uploads
                    </span>
                    <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-600">
                        {summary.interviews} interviews
                    </span>
                    <span className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-red-600">
                        {summary.rejections} rejections
                    </span>
                    {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
                </div>
            </div>
            {/* Feed */}
            <div className="px-5 py-4 max-h-[420px] overflow-y-auto">
                {error ? (
                    <div className="flex flex-col items-center justify-center h-32 gap-2">
                        <p className="text-sm font-semibold text-gray-500">{error}</p>
                        <button
                            onClick={retry}
                            className="text-xs font-bold text-gray-600 underline underline-offset-2 hover:text-gray-900"
                        >
                            Retry
                        </button>
                    </div>
                ) : !loading && feedItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 gap-2 text-center">
                        <TriangleAlert className="h-6 w-6 text-gray-200" />
                        <p className="text-sm font-bold text-gray-500">No recent activity</p>
                        <p className="text-xs text-gray-400">Uploads, interviews and outcomes will appear here.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {feedItems.map((item, idx) => {
                            const { icon: Icon, color, bg, border } = getIconProps(item.type);
                            return (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.04 }}
                                    className="group flex items-center gap-4 rounded-2xl border border-gray-100 bg-gray-50/40 px-4 py-3 hover:border-gray-200 hover:bg-white hover:shadow-sm transition-all duration-200"
                                    style={{ borderLeft: `3px solid ${color}` }}
                                >
                                    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-transform group-hover:scale-105", bg, border)}>
                                        <Icon className="h-4 w-4" style={{ color }} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <p className="truncate text-sm font-bold text-gray-900 group-hover:text-gray-700">
                                                {item.action}
                                            </p>
                                            {item.isDemo && (
                                                <span className="shrink-0 rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-gray-400">
                                                    System
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="truncate text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                                {item.drive}
                                            </span>
                                            <span className="h-1 w-1 rounded-full bg-gray-200" />
                                            <span className="shrink-0 text-[10px] font-bold uppercase text-gray-300">
                                                {item.time}
                                            </span>
                                        </div>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-gray-200 transition-all group-hover:translate-x-0.5 group-hover:text-gray-500" />
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
