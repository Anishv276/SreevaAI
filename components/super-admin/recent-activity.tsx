"use client";
import { useEffect, useState } from "react";
import { Clock, Building2, Briefcase, UserCheck, Video, ChevronRight, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
interface Activity {
    type: "ORG" | "DRIVE" | "CANDIDATE" | "INTERVIEW";
    detail: string;
    org: string;
    at: string;
}
interface RecentActivityProps {
    activities?: Activity[] | null;
    loading?: boolean;
    error?: string | null;
    onRetry?: () => void;
}
const ACTIVITY_CONFIG: Record<Activity["type"], { label: string; icon: React.ElementType; style: string }> = {
    ORG: { label: "New Organization", icon: Building2, style: "bg-violet-50 text-violet-600 border-violet-100" },
    DRIVE: { label: "New Hiring Drive", icon: Briefcase, style: "bg-blue-50 text-blue-600 border-blue-100" },
    CANDIDATE: { label: "Candidate Applied", icon: UserCheck, style: "bg-emerald-50 text-emerald-600 border-emerald-100" },
    INTERVIEW: { label: "Interview Completed", icon: Video, style: "bg-violet-50 text-violet-600 border-violet-100" },
};
export function RecentActivity({
    activities: externalActivities,
    loading: externalLoading,
    error: externalError,
    onRetry,
}: RecentActivityProps) {
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryKey, setRetryKey] = useState(0);
    const useExternalData = externalActivities !== undefined;
    useEffect(() => {
        if (useExternalData) {
            return;
        }
        const controller = new AbortController();
        const { signal } = controller;
        const loadActivity = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch("/api/super-admin/stats", { signal });
                if (signal.aborted) return;
                if (res.ok) {
                    const data = await res.json();
                    setActivities(data.recentActivity || []);
                } else {
                    setError("Failed to load activity.");
                }
            } catch (err: unknown) {
                if (!signal.aborted && (!(err instanceof Error) || err.name !== "AbortError")) setError("Network error.");
            } finally {
                if (!signal.aborted) setLoading(false);
            }
        };
        void loadActivity();
        return () => controller.abort();
    }, [retryKey, useExternalData]);
    const resolvedActivities = useExternalData ? externalActivities ?? [] : activities;
    const resolvedLoading = useExternalData ? Boolean(externalLoading) : loading;
    const resolvedError = useExternalData ? externalError ?? null : error;
    return (
        <section>
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <h2 className="text-base font-bold text-gray-900 tracking-tight">Recent Activity</h2>
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Platform-wide event stream</p>
                    </div>
                    <div className="h-9 w-9 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 border border-gray-100">
                        <Clock className="h-4 w-4" />
                    </div>
                </div>
                {resolvedLoading ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
                    </div>
                ) : resolvedError ? (
                    <div className="flex flex-col items-center py-10 gap-2">
                        <p className="text-sm font-semibold text-gray-500">{resolvedError}</p>
                        <button
                            onClick={() => {
                                if (onRetry) {
                                    onRetry();
                                    return;
                                }
                                setRetryKey((k) => k + 1);
                            }}
                            className="text-xs font-bold text-gray-600 underline underline-offset-2 hover:text-gray-900"
                        >
                            Retry
                        </button>
                    </div>
                ) : resolvedActivities.length === 0 ? (
                    <div className="py-10 text-center">
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No recent activity</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {resolvedActivities.map((activity, i) => {
                            const cfg = ACTIVITY_CONFIG[activity.type];
                            const Icon = cfg.icon;
                            return (
                                <div
                                    key={i}
                                    className="group flex items-center gap-3 p-3.5 rounded-xl border border-gray-100 bg-gray-50/30 hover:bg-white hover:border-violet-100 hover:shadow-sm transition-all duration-200"
                                >
                                    <div className={cn("h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform", cfg.style)}>
                                        <Icon className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{cfg.label}</p>
                                            <p className="text-[10px] font-bold text-gray-300 tabular-nums shrink-0">
                                                {formatDistanceToNow(new Date(activity.at), { addSuffix: true })}
                                            </p>
                                        </div>
                                        <p className="text-sm font-bold text-gray-900 truncate group-hover:text-violet-600 transition-colors">{activity.detail}</p>
                                        {activity.org && (
                                            <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                                                at <span className="font-semibold text-gray-600">{activity.org}</span>
                                            </p>
                                        )}
                                    </div>
                                    <ChevronRight className="h-3.5 w-3.5 text-gray-200 group-hover:text-violet-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
}
