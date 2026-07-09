"use client";
import { useEffect, useState } from "react";
import { Loader2, ArrowRight, ClipboardList, Users, Clock, Send } from "lucide-react";
import Link from "next/link";
import { ErrorState } from "./error-state";

interface NeedsActionData {
    upcomingActivity: {
        reportsReadyForReview: number;
        candidatesYetToStart: number;
        jobsExpiringSoon: number;
        invitesSentLast24h: number;
    };
}

interface UpcomingActivityProps {
    initialData?: NeedsActionData | null;
}

export function UpcomingActivity({ initialData }: UpcomingActivityProps = {}) {
    const [data, setData] = useState<NeedsActionData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryKey, setRetryKey] = useState(0);

    useEffect(() => {
        if (initialData) {
            setData(initialData);
            setLoading(false);
            setError(null);
            return;
        }
        const controller = new AbortController();
        const { signal } = controller;

        const loadNeedsAction = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch("/api/admin/needs-action", { signal });
                if (signal.aborted) return;
                if (res.ok) {
                    setData(await res.json());
                } else {
                    setError("Failed to load upcoming activity.");
                }
            } catch (err: any) {
                if (!signal.aborted && err.name !== "AbortError") setError("Network error.");
            } finally {
                if (!signal.aborted) setLoading(false);
            }
        };

        void loadNeedsAction();
        return () => controller.abort();
    }, [retryKey]);

    const handleRetry = () => {
        setRetryKey(k => k + 1);
    };

    const activities = data ? [
        {
            label: "Reports ready for review",
            value: data.upcomingActivity.reportsReadyForReview,
            icon: ClipboardList,
            bg: "bg-orange-50",
            text: "text-orange-500",
        },
        {
            label: "Candidates yet to start interview",
            value: data.upcomingActivity.candidatesYetToStart,
            icon: Users,
            bg: "bg-green-50",
            text: "text-green-500",
        },
        {
            label: "Jobs expiring in 3 days",
            value: data.upcomingActivity.jobsExpiringSoon,
            icon: Clock,
            bg: "bg-purple-50",
            text: "text-purple-500",
        },
        {
            label: "Invites sent in last 24 hours",
            value: data.upcomingActivity.invitesSentLast24h,
            icon: Send,
            bg: "bg-pink-50",
            text: "text-pink-500",
        },
    ] : [];

    return (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col h-full">
            {/* Header */}
            <div className="flex flex-col mb-6">
                <h3 className="text-lg font-bold text-gray-900 tracking-tight">Upcoming Activity</h3>
                <p className="text-xs text-gray-500 mt-1">What's happening next</p>
            </div>

            {/* Body */}
            <div className="flex-1">
                {loading ? (
                    <div className="flex items-center justify-center h-full min-h-[200px]">
                        <Loader2 className="h-6 w-6 text-gray-300 animate-spin" />
                    </div>
                ) : error ? (
                    <div className="flex-1 flex items-center justify-center h-full min-h-[200px]">
                        <ErrorState 
                            message={error} 
                            onRetry={handleRetry} 
                            compact 
                            className="bg-transparent border-none shadow-none"
                        />
                    </div>
                ) : (
                    <div className="space-y-4">
                        {activities.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between group py-2">
                                <div className="flex items-center gap-3">
                                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${item.bg}`}>
                                        <item.icon className={`h-5 w-5 ${item.text}`} />
                                    </div>
                                    <h4 className="text-sm font-semibold text-gray-800">{item.label}</h4>
                                </div>
                                <span className="text-sm font-black text-gray-900 tabular-nums">
                                    {item.value}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="pt-5 mt-auto text-center border-t border-gray-100">
                <Link
                    href="/admin/candidates"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 hover:text-purple-700 transition-colors"
                >
                    View candidates <ArrowRight className="h-3.5 w-3.5" />
                </Link>
            </div>
        </div>
    );
}
