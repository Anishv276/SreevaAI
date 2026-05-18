"use client";

import { useEffect, useState } from "react";
import { Loader2, Clock, MailOpen, CheckCircle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

interface ActionItem {
    id: string;
    name: string;
    role: string;
    driveTitle: string;
    score?: number | null;
    daysWaiting: number;
}

interface NeedsActionData {
    awaitingReview: ActionItem[];
    inviteNotSent: ActionItem[];
    shortlistedNoDecision: ActionItem[];
}

const SECTIONS = [
    {
        key: "awaitingReview" as const,
        label: "Awaiting Review",
        sub: "Interview done — no decision yet",
        icon: Clock,
        dot: "bg-red-500",
        badge: "bg-red-50 text-red-600 border-red-100",
        accent: "#EF4444",
        dayLabel: (n: number) => `${n}d waiting`,
    },
    {
        key: "inviteNotSent" as const,
        label: "Invite Not Sent",
        sub: "Uploaded — never received interview link",
        icon: MailOpen,
        dot: "bg-amber-500",
        badge: "bg-amber-50 text-amber-700 border-amber-100",
        accent: "#F59E0B",
        dayLabel: (n: number) => `Uploaded ${n}d ago`,
    },
    {
        key: "shortlistedNoDecision" as const,
        label: "Shortlisted — No Decision",
        sub: "Waiting on hire / reject call",
        icon: CheckCircle,
        dot: "bg-blue-500",
        badge: "bg-blue-50 text-blue-700 border-blue-100",
        accent: "#3B82F6",
        dayLabel: (n: number) => `${n}d since shortlist`,
    },
] as const;

function initials(name: string) {
    return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function NeedsAction() {
    const [data, setData] = useState<NeedsActionData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryKey, setRetryKey] = useState(0);
    const router = useRouter();

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;

        setLoading(true);
        setError(null);

        fetch("/api/admin/needs-action", { signal })
            .then(async (res) => {
                if (!signal.aborted) {
                    if (res.ok) setData(await res.json());
                    else setError("Failed to load action items.");
                }
            })
            .catch((err) => {
                if (!signal.aborted && err.name !== "AbortError") setError("Network error.");
            })
            .finally(() => { if (!signal.aborted) setLoading(false); });

        return () => controller.abort();
    }, [retryKey]);

    const total = data
        ? data.awaitingReview.length + data.inviteNotSent.length + data.shortlistedNoDecision.length
        : 0;

    return (
        <div className="bg-white rounded-2xl border border-gray-200 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                <div>
                    <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-gray-900 tracking-tight">Needs Action</h3>
                        {!loading && total > 0 && (
                            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                                {total}
                            </span>
                        )}
                    </div>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Your daily action list</p>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 px-5 py-4">
                {loading ? (
                    <div className="flex items-center justify-center h-44">
                        <Loader2 className="h-6 w-6 text-gray-300 animate-spin" />
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-44 gap-2">
                        <p className="text-sm font-semibold text-gray-500">{error}</p>
                        <button
                            onClick={() => setRetryKey((k) => k + 1)}
                            className="text-xs font-bold text-gray-600 underline underline-offset-2 hover:text-gray-900"
                        >
                            Retry
                        </button>
                    </div>
                ) : total === 0 ? (
                    <div className="flex flex-col items-center justify-center h-44 gap-2 text-center">
                        <div className="h-10 w-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
                            <CheckCircle className="h-5 w-5 text-emerald-500" />
                        </div>
                        <p className="text-sm font-bold text-gray-700">All caught up!</p>
                        <p className="text-xs text-gray-400">No pending actions right now.</p>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {SECTIONS.map((section) => {
                            const items = data![section.key];
                            if (items.length === 0) return null;

                            return (
                                <div key={section.key}>
                                    {/* Section header */}
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={cn("h-2 w-2 rounded-full shrink-0", section.dot)} />
                                        <p className="text-[11px] font-bold text-gray-600 uppercase tracking-widest">
                                            {section.label}
                                        </p>
                                        <span className={cn(
                                            "text-[9px] font-bold px-1.5 py-0.5 rounded-full border",
                                            section.badge
                                        )}>
                                            {items.length}
                                        </span>
                                    </div>

                                    {/* Items */}
                                    <motion.div
                                        initial="hidden"
                                        animate="visible"
                                        variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } }}
                                        className="space-y-1.5"
                                    >
                                        {items.map((item) => (
                                            <motion.div
                                                key={item.id}
                                                variants={{ hidden: { opacity: 0, x: -6 }, visible: { opacity: 1, x: 0 } }}
                                                onClick={() => router.push(`/admin/candidates/${item.id}`)}
                                                className="group flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 bg-gray-50/40 hover:bg-white hover:border-gray-200 hover:shadow-sm transition-all duration-150 cursor-pointer"
                                            >
                                                {/* Avatar */}
                                                <div
                                                    className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-[11px] font-bold text-white"
                                                    style={{ backgroundColor: section.accent }}
                                                >
                                                    {initials(item.name)}
                                                </div>

                                                {/* Info */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-gray-900 truncate leading-tight group-hover:text-gray-700">
                                                        {item.name}
                                                    </p>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">
                                                        {item.role} · {item.driveTitle}
                                                    </p>
                                                </div>

                                                {/* Right side */}
                                                <div className="shrink-0 flex items-center gap-2">
                                                    {item.score != null && (
                                                        <span className="text-[10px] font-bold text-gray-500 tabular-nums">
                                                            {item.score}
                                                        </span>
                                                    )}
                                                    <span className={cn(
                                                        "text-[9px] font-bold px-1.5 py-0.5 rounded-md border whitespace-nowrap",
                                                        item.daysWaiting >= 3
                                                            ? "bg-red-50 text-red-600 border-red-100"
                                                            : "bg-gray-50 text-gray-500 border-gray-100"
                                                    )}>
                                                        {section.dayLabel(item.daysWaiting)}
                                                    </span>
                                                    <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all" />
                                                </div>
                                            </motion.div>
                                        ))}
                                    </motion.div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
