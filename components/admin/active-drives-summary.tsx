"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, ChevronRight, Plus, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { type DateRange } from "./date-filter";

interface DriveSummary {
    id: string;
    title: string;
    screeningThreshold: number;
    screeningPct: number;
    applied: number;
    screened: number;
    interviewed: number;
    shortlisted: number;
}

function barColor(pct: number, threshold: number) {
    if (pct >= threshold) return "#10B981";
    if (pct >= threshold * 0.75) return "#475569";
    return "#CBD5E1";
}

interface ActiveDrivesSummaryProps {
    dateRange: DateRange;
}

export function ActiveDrivesSummary({ dateRange }: ActiveDrivesSummaryProps) {
    const [drives, setDrives] = useState<DriveSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryKey, setRetryKey] = useState(0);
    const router = useRouter();

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;

        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        if (dateRange.type === "custom") {
            params.set("range", "custom");
            params.set("from", dateRange.from);
            params.set("to", dateRange.to);
        } else {
            params.set("range", dateRange.type);
        }
        params.set("limit", "3");

        fetch(`/api/admin/drives-summary?${params.toString()}`, { signal })
            .then(async (res) => {
                if (!signal.aborted) {
                    if (res.ok) setDrives((await res.json()).drives ?? []);
                    else setError("Failed to load active jobs.");
                }
            })
            .catch((err) => {
                if (!signal.aborted && err.name !== "AbortError") setError("Network error.");
            })
            .finally(() => { if (!signal.aborted) setLoading(false); });

        return () => controller.abort();
    }, [dateRange, retryKey]);

    return (
        <div className="bg-white rounded-2xl border border-gray-200 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                <div>
                    <h3 className="text-base font-bold text-gray-900 tracking-tight">Active Jobs</h3>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Top 3 open positions</p>
                </div>
                <Link
                    href="/admin/drives"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 border border-gray-200 rounded-xl px-3 py-1.5 hover:border-gray-300 hover:text-gray-900 transition-all uppercase tracking-widest"
                >
                    View All Jobs <ArrowRight className="h-3 w-3" />
                </Link>
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
                ) : drives.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center justify-center h-44"
                    >
                        <Link href="/admin/create-drive" className="group flex flex-col items-center gap-3 text-center">
                            <div className="h-12 w-12 rounded-2xl bg-gray-100 flex items-center justify-center group-hover:bg-gray-900 transition-colors duration-200">
                                <Plus className="h-6 w-6 text-gray-500 group-hover:text-white transition-colors" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-700">Create your first job</p>
                                <p className="text-xs text-gray-400 mt-0.5">Start hiring with AI screening</p>
                            </div>
                        </Link>
                    </motion.div>
                ) : (
                    <motion.div
                        initial="hidden"
                        animate="visible"
                        variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.07 } } }}
                        className="space-y-3"
                    >
                        {drives.slice(0, 3).map((drive) => {
                            const color = barColor(drive.screeningPct, drive.screeningThreshold);
                            return (
                                <motion.div
                                    key={drive.id}
                                    variants={{ hidden: { opacity: 0, x: -8 }, visible: { opacity: 1, x: 0 } }}
                                    onClick={() => router.push(`/admin/candidates/drive/${drive.id}`)}
                                    className="group p-4 rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-sm bg-gray-50/40 hover:bg-white transition-all duration-200 cursor-pointer"
                                >
                                    {/* Title row */}
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-bold text-gray-800 truncate group-hover:text-gray-950">
                                                {drive.title}
                                            </h4>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Open</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); router.push(`/admin/candidates/drive/${drive.id}`); }}
                                            className="ml-3 shrink-0 inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-bold text-gray-600 hover:border-gray-300 hover:text-gray-900 transition-all uppercase tracking-widest"
                                        >
                                            View <ChevronRight className="h-3 w-3" />
                                        </button>
                                    </div>

                                    {/* Metrics */}
                                    <div className="grid grid-cols-4 gap-2 mb-3">
                                        {[
                                            { label: "Applied",     value: drive.applied },
                                            { label: "Screened",    value: drive.screened },
                                            { label: "Interviewed", value: drive.interviewed },
                                            { label: "Shortlisted", value: drive.shortlisted },
                                        ].map((stat) => (
                                            <div key={stat.label}>
                                                <p className="text-base font-bold text-gray-900 tabular-nums leading-none">{stat.value}</p>
                                                <p className="text-[9px] font-bold text-gray-400 mt-0.5 uppercase tracking-widest">{stat.label}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Progress bar */}
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${Math.min(drive.screeningPct, 100)}%` }}
                                            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                                            className="h-full rounded-full"
                                            style={{ backgroundColor: color }}
                                        />
                                    </div>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1.5">
                                        Screening <span className="text-gray-600">{drive.screeningPct}%</span>
                                    </p>
                                </motion.div>
                            );
                        })}
                    </motion.div>
                )}
            </div>
        </div>
    );
}
