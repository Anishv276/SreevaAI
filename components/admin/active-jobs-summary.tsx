"use client";
import { useEffect, useState, useCallback } from "react";
import { Loader2, ChevronRight, Plus, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { type DateRange } from "./date-filter";
interface JobSummary {
    id: string;
    title: string;
    role: string | null;
    screeningThreshold: number;
    screeningPct: number;
    applied: number;
    screened: number;
    interviewed: number;
    shortlisted: number;
}
function getInitials(title: string) {
    if (!title) return "JD";
    const parts = title.split(" ").filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return title.substring(0, 2).toUpperCase();
}

function getAvatarColor(index: number) {
    const colors = [
        { bg: "#F3E8FF", text: "#7C3AED" }, // Purple
        { bg: "#E0F2FE", text: "#0284C7" }, // Blue
        { bg: "#FFEDD5", text: "#EA580C" }, // Orange
        { bg: "#E0E7FF", text: "#4F46E5" }, // Indigo
        { bg: "#FCE7F3", text: "#DB2777" }, // Pink
    ];
    return colors[index % colors.length];
}
interface ActiveJobsSummaryProps {
    dateRange: DateRange;
    initialData?: { jobs: JobSummary[] } | null;
}
export function ActiveJobsSummary({ dateRange, initialData }: ActiveJobsSummaryProps) {
    const [jobs, setJobs] = useState<JobSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryKey, setRetryKey] = useState(0);
    const router = useRouter();
    useEffect(() => {
        if (initialData) {
            setJobs(initialData.jobs ?? []);
            setLoading(false);
            setError(null);
            return;
        }
        const controller = new AbortController();
        const { signal } = controller;
        const loadJobs = async () => {
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
            try {
                const res = await fetch(`/api/admin/jobs-summary?${params.toString()}`, { signal });
                if (signal.aborted) return;
                if (res.ok) {
                    setJobs((await res.json()).jobs ?? []);
                } else {
                    setError("Failed to load active jobs.");
                }
            } catch (err: any) {
                if (!signal.aborted && err.name !== "AbortError") setError("Network error.");
            } finally {
                if (!signal.aborted) setLoading(false);
            }
        };
        void loadJobs();
        return () => controller.abort();
    }, [dateRange, retryKey]);
    return (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 flex flex-col h-full shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 tracking-tight">Job Overview</h3>
                    <p className="text-xs text-gray-500 mt-1">Overview of all job jobs</p>
                </div>
                <span className="text-xs font-medium text-gray-500 bg-gray-50 px-2.5 py-1 rounded-md border border-gray-200">
                    {dateRange.type === "month" ? "This month" : "Custom"}
                </span>
            </div>
            {/* Body */}
            <div className="flex-1 overflow-y-auto min-h-[250px] pr-2 -mr-2">
                {loading ? (
                    <div className="flex items-center justify-center h-full min-h-[200px]">
                        <Loader2 className="h-6 w-6 text-gray-300 animate-spin" />
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-2">
                        <p className="text-sm font-semibold text-gray-500">{error}</p>
                        <button
                            onClick={() => setRetryKey((k) => k + 1)}
                            className="text-xs font-bold text-gray-600 underline underline-offset-2 hover:text-gray-900"
                        >
                            Retry
                        </button>
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-gray-400">
                        <p className="text-sm font-medium">No jobs found.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {jobs.slice(0, 5).map((job, idx) => {
                            const { bg, text } = getAvatarColor(idx);
                            const roleName = job.role || job.title;
                            return (
                                <div key={job.id} className="flex items-center justify-between group py-2">
                                    <div className="flex items-center gap-3">
                                        <div 
                                            className="h-10 w-10 rounded-xl flex items-center justify-center font-bold text-sm"
                                            style={{ backgroundColor: bg, color: text }}
                                        >
                                            {getInitials(roleName)}
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-gray-900">{roleName}</h4>
                                            <p className="text-[11px] text-gray-500">{job.applied} Candidates</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <div className="text-center">
                                            <p className="text-[10px] font-bold text-gray-500 mb-0.5 uppercase">Interviewed</p>
                                            <p className="text-sm font-black text-gray-900">{job.interviewed}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[10px] font-bold text-gray-500 mb-0.5 uppercase">Shortlisted</p>
                                            <p className="text-sm font-black text-gray-900">{job.shortlisted}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="pt-5 mt-auto text-center border-t border-gray-100">
                <Link
                    href="/admin/jobs"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 hover:text-purple-700 transition-colors"
                >
                    View all jobs <ArrowRight className="h-3.5 w-3.5" />
                </Link>
            </div>
        </div>
    );
}
