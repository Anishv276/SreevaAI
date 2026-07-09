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
    job: string;
    time: string;
    timestamp: number;
    isDemo?: boolean;
}
function getIconProps(type: ActivityType) {
    switch (type) {
        case "application":
            return { icon: UserPlus,   color: "#3B82F6", bg: "bg-blue-50",   title: "New application received" };
        case "interview_completed":
            return { icon: FileCheck,  color: "#10B981", bg: "bg-emerald-50",  title: "New interview completed" };
        case "rejection":
            return { icon: XCircle,    color: "#EF4444", bg: "bg-red-50",      title: "Application rejected" };
    }
}
function useActivityFeed(dateRange: DateRange, initialData?: { feed: FeedItem[] } | null) {
    const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const fetchRef = useRef<(() => Promise<void>) | null>(null);
    useEffect(() => {
        if (initialData) {
            setFeedItems(initialData.feed ?? []);
            setLoading(false);
            setError(null);
            return;
        }
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
    initialData?: { feed: FeedItem[] } | null;
}
export function LiveFeed({ dateRange, initialData }: LiveFeedProps) {
    const { feedItems, loading, error, retry } = useActivityFeed(dateRange, initialData);
    const summary = summarize(feedItems);
    return (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex flex-col mb-6">
                <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-gray-900 tracking-tight">Recent Activity</h3>
                    {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                </div>
                <p className="text-xs text-gray-500 mt-1">Real-time updates across all your jobs</p>
            </div>
            {/* Feed */}
            <div className="max-h-[420px] overflow-y-auto pr-2 -mr-2">
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
                    <div className="space-y-4">
                        {feedItems.map((item, idx) => {
                            const { icon: Icon, color, bg, title } = getIconProps(item.type);
                            return (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.04 }}
                                    className="group flex items-start gap-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 rounded-xl px-2 -mx-2 transition-colors cursor-pointer"
                                >
                                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", bg)}>
                                        <Icon className="h-5 w-5" style={{ color }} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-gray-900 group-hover:text-purple-600 transition-colors">
                                                    {title}
                                                </p>
                                                <p className="text-xs text-gray-500 mt-0.5 truncate">
                                                    {item.action}
                                                </p>
                                            </div>
                                            <span className="shrink-0 text-[11px] font-medium text-gray-400">
                                                {item.time}
                                            </span>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
