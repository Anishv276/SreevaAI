"use client";

import { useEffect, useState } from "react";
import { Loader2, ChevronRight, Plus } from "lucide-react";
import { ErrorState } from "./error-state";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { type DateRange } from "./date-filter";

interface DriveSummary {
    id: string;
    title: string;
    department: string;
    workMode: string;
    screeningThreshold: number;
    screeningPct: number;
    applied: number;
    screened: number;
    interviewed: number;
    shortlisted: number;
}

// Bar color based on threshold proximity
function barColor(pct: number, threshold: number) {
    if (pct >= threshold) return "#10B981";
    if (pct >= threshold * 0.75) return "#F97316";
    return "#F59E0B";
}

interface ActiveDrivesSummaryProps {
    dateRange: DateRange;
}

export function ActiveDrivesSummary({ dateRange }: ActiveDrivesSummaryProps) {
    const [drives, setDrives] = useState<DriveSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;

        const fetchDrives = async () => {
            setLoading(true);
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

                const res = await fetch(`/api/admin/drives-summary?${params.toString()}`, { signal });
                if (res.ok) {
                    const data = await res.json();
                    if (!signal.aborted) setDrives(data.drives ?? []);
                } else if (!signal.aborted) {
                    setError("Neural pipeline sync failed.");
                }
            } catch (err: any) {
                if (err.name !== "AbortError") {
                    setError("Network connectivity issue.");
                }
            } finally {
                if (!signal.aborted) setLoading(false);
            }
        };

        fetchDrives();
        return () => controller.abort();
    }, [dateRange]);

    const handleRetry = () => {
        setLoading(true);
        setError(null);
    };

    return (
        <div className="bg-white/40 backdrop-blur-xl rounded-[2.5rem] border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.02)] flex flex-col h-full overflow-hidden hover:shadow-[0_20px_60px_rgba(0,0,0,0.06)] transition-all duration-700">
            {/* Header */}
            <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100/50">
                <div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight text-premium">Drives</h3>
                    <p className="text-[11px] font-bold text-gray-400 mt-1 uppercase tracking-[0.2em]">Neural Pipeline Sync</p>
                </div>
                <Link href="/admin/drives">
                    <button className="text-[11px] font-black text-gray-400 border border-gray-100 rounded-xl px-5 py-2 hover:border-orange-200 hover:text-orange-500 hover:bg-white transition-all shadow-sm uppercase tracking-widest">
                        View All Drives
                    </button>
                </Link>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
                {loading ? (
                    <div className="flex items-center justify-center h-48">
                        <Loader2 className="h-8 w-8 text-orange-200 animate-spin" />
                    </div>
                ) : error ? (
                    <div className="flex items-center justify-center h-48 py-8">
                        <ErrorState
                            message={error}
                            onRetry={handleRetry}
                            compact
                            className="bg-transparent border-none shadow-none"
                        />
                    </div>
                ) : (
                    <div className="flex flex-col h-full">
                        {drives.length === 0 ? (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center justify-center h-full py-12"
                            >
                                {/* Card 1: Create Drive */}
                                <Link href="/admin/create-drive" className="group/card w-full max-w-md">
                                    <div className="h-full min-h-[220px] p-8 rounded-[2.5rem] border-2 border-dashed border-gray-100 bg-gray-50/30 flex flex-col items-center justify-center text-center gap-4 group-hover/card:border-orange-300 group-hover/card:bg-orange-50/30 transition-all duration-500">
                                        <div className="h-16 w-16 rounded-[1.5rem] bg-orange-100/50 flex items-center justify-center text-[#F97316] group-hover/card:scale-110 group-hover/card:rotate-6 transition-all duration-500">
                                            <Plus className="h-8 w-8" />
                                        </div>
                                        <div>
                                            <h4 className="text-[14px] font-black text-gray-900 uppercase tracking-tight mb-1">Create Drive</h4>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed px-4">
                                                Initialize your first AI-driven recruitment pipeline
                                            </p>
                                        </div>
                                        <div className="mt-2 px-6 py-2 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest group-hover/card:bg-[#F97316] group-hover/card:shadow-lg group-hover/card:shadow-orange-500/20 transition-all">
                                            Get Started
                                        </div>
                                    </div>
                                </Link>
                            </motion.div>
                        ) : (
                            <motion.div
                                initial="hidden"
                                animate="visible"
                                variants={{
                                    hidden: { opacity: 0 },
                                    visible: {
                                        opacity: 1,
                                        transition: { staggerChildren: 0.1 },
                                    },
                                }}
                                className="space-y-4"
                            >
                                {drives.map((drive) => {
                                    const color = barColor(drive.screeningPct, drive.screeningThreshold);

                                    return (
                                        <motion.div
                                            key={drive.id}
                                            variants={{
                                                hidden: { opacity: 0, x: -10 },
                                                visible: { opacity: 1, x: 0 },
                                            }}
                                            className="p-5 rounded-[2rem] bg-white border border-gray-50/50 hover:border-orange-100 hover:shadow-[0_15px_40px_rgba(0,0,0,0.03)] transition-all duration-500 cursor-pointer group"
                                            onClick={() => router.push(`/admin/candidates/drive/${drive.id}`)}
                                        >
                                            {/* Title row */}
                                            <div className="flex items-start justify-between gap-4 mb-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h4 className="text-[15px] font-black text-gray-800 group-hover:text-orange-600 transition-colors truncate tracking-tight">
                                                            {drive.title}
                                                        </h4>
                                                    </div>
                                                    <p className="text-[11px] font-bold text-gray-400 flex items-center gap-2 uppercase tracking-wider">
                                                        {drive.department}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Metrics Grid */}
                                            <div className="grid grid-cols-4 gap-4 mb-5">
                                                {[
                                                    { label: "Pool", value: drive.applied },
                                                    { label: "Check", value: drive.screened },
                                                    { label: "Live", value: drive.interviewed },
                                                    { label: "Pick", value: drive.shortlisted },
                                                ].map((stat) => (
                                                    <div key={stat.label} className="flex flex-col">
                                                        <span className="text-xl font-black text-gray-900 leading-none tracking-tighter tabular-nums">
                                                            {stat.value}
                                                        </span>
                                                        <span className="text-[9px] font-bold text-gray-400 mt-1 uppercase tracking-widest">
                                                            {stat.label}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Neural Progress Bar */}
                                            <div className="relative h-2 bg-gray-50 rounded-full overflow-hidden border border-gray-100/50">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${Math.min(drive.screeningPct, 100)}%` }}
                                                    transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                                                    className="h-full rounded-full relative z-10"
                                                    style={{ backgroundColor: color }}
                                                >
                                                    <div className="absolute top-0 left-0 right-0 h-1/2 bg-white/20 rounded-t-full" />
                                                </motion.div>
                                            </div>

                                            <div className="flex items-center justify-between mt-2.5">
                                                <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">
                                                    Efficiency: <span className="text-gray-600">{drive.screeningPct}%</span>
                                                </span>
                                                <ChevronRight className="h-4 w-4 text-gray-200 group-hover:text-orange-400 group-hover:translate-x-1 transition-all" />
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </motion.div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

