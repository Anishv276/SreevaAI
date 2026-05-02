"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { ErrorState } from "./error-state";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { type DateRange } from "./date-filter";

interface TopCandidate {
    id: string;
    name: string;
    initials: string;
    role: string;
    driveTitle: string;
    interviewScore: number | null;
    resumeScore: number | null;
    status: string;
}

const AVATAR_AURA = [
    "from-blue-400 to-indigo-500",
    "from-emerald-400 to-teal-500",
    "from-slate-500 to-slate-700",
    "from-purple-400 to-fuchsia-500",
    "from-rose-400 to-pink-500",
];

const STATUS_GLOW: Record<string, string> = {
    Shortlisted:  "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]",
    Hired:        "bg-slate-500 shadow-[0_0_12px_rgba(100,116,139,0.25)]",
    Reviewing:    "bg-gray-400 shadow-[0_0_12px_rgba(156,163,175,0.2)]",
    "In progress":"bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.3)]",
};

interface TopCandidatesProps {
    dateRange: DateRange;
}

export function TopCandidates({ dateRange }: TopCandidatesProps) {
    const [candidates, setCandidates] = useState<TopCandidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const fetchCandidates = useCallback(async (signal?: AbortSignal) => {
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

            const res = await fetch(`/api/admin/top-candidates?${params.toString()}`, { signal });
            if (res.ok) {
                const data = await res.json();
                if (!signal?.aborted) setCandidates(data.candidates ?? []);
            } else {
                if (!signal?.aborted) setError("Talent sync failed.");
            }
        } catch (err: unknown) {
            if (!(err instanceof DOMException && err.name === "AbortError")) {
                setError("Talent stream unavailable.");
            }
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [dateRange]);

    useEffect(() => {
        const controller = new AbortController();
        fetchCandidates(controller.signal);
        return () => controller.abort();
    }, [fetchCandidates]);

    return (
        <div className="bg-white/40 backdrop-blur-xl rounded-[2.5rem] border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.02)] flex flex-col h-full overflow-hidden hover:shadow-[0_20px_60px_rgba(0,0,0,0.06)] transition-all duration-700">
            {/* Header */}
            <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100/50">
                <div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight text-premium">Top Talent</h3>
                    <p className="text-[11px] font-bold text-gray-400 mt-1 uppercase tracking-[0.2em]">Neural Match Index</p>
                </div>
                <Link href="/admin/candidates">
                    <button className="text-[11px] font-black text-gray-400 border border-gray-100 rounded-xl px-4 py-2 hover:border-slate-300 hover:text-slate-950 transition-all uppercase tracking-widest bg-white shadow-sm">
                        Database
                    </button>
                </Link>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
                {loading ? (
                    <div className="flex items-center justify-center h-48">
                        <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
                    </div>
                ) : error ? (
                    <div className="flex items-center justify-center h-48 py-8">
                        <ErrorState 
                            message={error} 
                            onRetry={fetchCandidates} 
                            compact 
                            className="bg-transparent border-none shadow-none"
                        />
                    </div>
                ) : candidates.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-[12px] font-bold text-gray-500 uppercase tracking-widest">
                        Zero matches processed
                    </div>
                ) : (
                    <motion.div 
                        initial="hidden"
                        animate="visible"
                        variants={{
                            hidden: { opacity: 0 },
                            visible: {
                                opacity: 1,
                                transition: { staggerChildren: 0.1 }
                            }
                        }}
                        className="space-y-3"
                    >
                        {candidates.map((c, i) => (
                            <motion.div
                                key={c.id}
                                variants={{
                                    hidden: { opacity: 0, scale: 0.95 },
                                    visible: { opacity: 1, scale: 1 }
                                }}
                                className="group flex items-center gap-4 p-4 rounded-[1.75rem] border border-gray-50/50 hover:border-slate-200 hover:bg-white transition-all duration-500 cursor-pointer shadow-sm hover:shadow-[0_15px_30px_rgba(15,23,42,0.04)]"
                                onClick={() => router.push(`/admin/candidates/${c.id}`)}
                            >
                                {/* Avatar with Aura */}
                                <div className="relative shrink-0">
                                    <div className={cn(
                                        "h-11 w-11 rounded-2xl bg-gradient-to-br flex items-center justify-center text-[13px] font-black text-white shadow-lg transition-transform group-hover:scale-110",
                                        AVATAR_AURA[i % AVATAR_AURA.length]
                                    )}>
                                        {c.initials}
                                    </div>
                                    {/* Indicator Dot */}
                                    <div className={cn(
                                        "absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white transition-all",
                                        STATUS_GLOW[c.status] ?? STATUS_GLOW["Reviewing"]
                                    )} />
                                </div>

                                {/* Identity */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline justify-between mb-0.5">
                                        <p className="text-[14px] font-black text-gray-900 leading-tight group-hover:text-slate-700 transition-colors truncate">
                                            {c.name}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            {c.interviewScore != null && (
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[11px] font-black text-gray-900 tracking-tighter tabular-nums">IV {c.interviewScore}</span>
                                                    <div className="h-0.5 w-6 bg-slate-400 rounded-full" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest leading-none mt-1">
                                        {c.role}
                                    </p>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </div>
        </div>
    );
}

