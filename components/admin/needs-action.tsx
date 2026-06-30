"use client";
import { useEffect, useState } from "react";
import { Loader2, ChevronRight, AlertTriangle, Clock, Users, FileWarning, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ErrorState } from "./error-state";

interface NeedsActionData {
    awaitingReview: any[];
    inviteNotSent: any[];
    shortlistedNoDecision: any[];
    upcomingActivity: {
        reportsReadyForReview: number;
        candidatesYetToStart: number;
        drivesExpiringSoon: number;
        invitesSentLast24h: number;
    };
}

interface NeedsActionProps {
    initialData?: NeedsActionData | null;
}

export function NeedsAction({ initialData }: NeedsActionProps = {}) {
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
                    setError("Failed to load action items.");
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

    const actions = data ? [
        {
            title: `${data.awaitingReview.length} interviews need review`,
            sub: "Completed interviews awaiting your feedback",
            icon: AlertTriangle,
            bg: "bg-red-50",
            text: "text-red-500",
            href: "/admin/candidates?status=completed",
        },
        {
            title: `${data.shortlistedNoDecision.length} reports pending`,
            sub: "AI reports ready for your review",
            icon: Clock,
            bg: "bg-orange-50",
            text: "text-orange-500",
            href: "/admin/candidates?status=shortlisted",
        },
        {
            title: `${data.inviteNotSent.length} candidates waiting`,
            sub: "Invited candidates yet to start interview",
            icon: Users,
            bg: "bg-blue-50",
            text: "text-blue-500",
            href: "/admin/candidates?status=invited",
        },
        {
            title: `${data.upcomingActivity.drivesExpiringSoon} drives expiring soon`,
            sub: "Drives expiring in the next 3 days",
            icon: FileWarning,
            bg: "bg-purple-50",
            text: "text-purple-500",
            href: "/admin/drives",
        },
    ] : [];

    const total = data ? data.awaitingReview.length + data.shortlistedNoDecision.length + data.inviteNotSent.length : 0;

    return (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <h3 className="text-lg font-bold text-gray-900 tracking-tight">Needs Your Attention</h3>
                {!loading && total > 0 && (
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-red-50 text-red-500 text-[11px] font-bold">
                        {total}
                    </span>
                )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto pr-2 -mr-2">
                {loading ? (
                    <div className="flex items-center justify-center h-full min-h-[200px]">
                        <Loader2 className="h-6 w-6 text-gray-300 animate-spin" />
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-2">
                        <ErrorState 
                            message={error} 
                            onRetry={handleRetry} 
                            compact 
                            className="bg-transparent border-none shadow-none"
                        />
                    </div>
                ) : total === 0 && data?.upcomingActivity.drivesExpiringSoon === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-2 text-center">
                        <div className="h-10 w-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
                            <Clock className="h-5 w-5 text-emerald-500" />
                        </div>
                        <p className="text-sm font-bold text-gray-700">All caught up!</p>
                        <p className="text-xs text-gray-400">No pending actions right now.</p>
                    </div>
                ) : (
                    <motion.div
                        initial="hidden"
                        animate="visible"
                        variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } }}
                        className="space-y-4"
                    >
                        {actions.map((item, idx) => {
                            if (idx < 3 && total === 0 && item.title.startsWith("0")) return null;
                            if (idx === 3 && data?.upcomingActivity.drivesExpiringSoon === 0) return null;
                            
                            return (
                                <motion.div
                                    key={idx}
                                    variants={{ hidden: { opacity: 0, x: -6 }, visible: { opacity: 1, x: 0 } }}
                                >
                                    <Link
                                        href={item.href}
                                        className="group flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:border-gray-200 hover:shadow-sm transition-all duration-200"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center ${item.bg}`}>
                                                <item.icon className={`h-5 w-5 ${item.text}`} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-gray-900 group-hover:text-purple-600 transition-colors">
                                                    {item.title}
                                                </p>
                                                <p className="text-[11px] font-medium text-gray-500 mt-0.5">
                                                    {item.sub}
                                                </p>
                                            </div>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-purple-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                                    </Link>
                                </motion.div>
                            );
                        })}
                    </motion.div>
                )}
            </div>

            {/* Footer */}
            <div className="pt-5 mt-auto text-center border-t border-gray-100">
                <Link
                    href="/admin/candidates"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 hover:text-purple-700 transition-colors"
                >
                    View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
            </div>
        </div>
    );
}
