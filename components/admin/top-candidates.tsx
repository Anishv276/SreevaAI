"use client";
import { useEffect, useState, useCallback } from "react";
import { Loader2, ArrowRight, Trophy } from "lucide-react";
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
const AVATAR_COLORS = [
    { bg: "bg-purple-100", text: "text-purple-600" },
    { bg: "bg-blue-100", text: "text-blue-600" },
    { bg: "bg-emerald-100", text: "text-emerald-600" },
    { bg: "bg-orange-100", text: "text-orange-600" },
    { bg: "bg-pink-100", text: "text-pink-600" },
];
interface TopCandidatesProps {
    dateRange: DateRange;
    initialData?: { candidates: TopCandidate[] } | null;
}
export function TopCandidates({ dateRange, initialData }: TopCandidatesProps) {
    const [candidates, setCandidates] = useState<TopCandidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryKey, setRetryKey] = useState(0);
    const router = useRouter();
    useEffect(() => {
        if (initialData) {
            setCandidates(initialData.candidates ?? []);
            setLoading(false);
            setError(null);
            return;
        }
        const controller = new AbortController();
        const { signal } = controller;
        const loadCandidates = async () => {
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
            try {
                const res = await fetch(`/api/admin/top-candidates?${params.toString()}`, { signal });
                if (signal.aborted) return;
                if (res.ok) {
                    setCandidates((await res.json()).candidates ?? []);
                } else {
                    setError("Failed to load top candidates.");
                }
            } catch (err: any) {
                if (!signal.aborted && err.name !== "AbortError") setError("Network error.");
            } finally {
                if (!signal.aborted) setLoading(false);
            }
        };
        void loadCandidates();
        return () => controller.abort();
    }, [dateRange, retryKey]);
    return (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col h-full">
            {/* Header */}
            <div className="flex flex-col mb-6">
                <h3 className="text-lg font-bold text-gray-900 tracking-tight">Top Candidates</h3>
                <p className="text-xs text-gray-500 mt-1">Top performers across all roles</p>
            </div>
            {/* Body */}
            {/* Body */}
            <div className="flex-1 overflow-y-auto pr-2 -mr-2">
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
                ) : candidates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-2 text-center text-gray-400">
                        <Trophy className="h-8 w-8 text-gray-200" />
                        <p className="text-sm font-medium">No candidates yet</p>
                    </div>
                ) : (
                    <motion.div
                        initial="hidden"
                        animate="visible"
                        variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } }}
                        className="space-y-4"
                    >
                        {candidates.slice(0, 5).map((c, i) => {
                            const colors = AVATAR_COLORS[i % AVATAR_COLORS.length];
                            const score = c.interviewScore ?? 0;
                            return (
                                <motion.div
                                    key={c.id}
                                    variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                                    onClick={() => router.push(`/admin/candidates/${c.id}`)}
                                    className="group flex items-center justify-between py-2 hover:bg-gray-50/50 rounded-xl transition-all duration-200 cursor-pointer -mx-2 px-2"
                                >
                                    {/* Avatar + Info */}
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={cn(
                                            "h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-sm font-bold",
                                            colors.bg, colors.text
                                        )}>
                                            {c.initials}
                                        </div>
                                        <div className="min-w-0 pr-4">
                                            <p className="text-sm font-bold text-gray-900 truncate group-hover:text-purple-600 transition-colors">
                                                {c.name}
                                            </p>
                                            <p className="text-xs font-medium text-gray-500 truncate mt-0.5">
                                                {c.role || c.driveTitle}
                                            </p>
                                        </div>
                                    </div>
                                    {/* Score */}
                                    {c.interviewScore != null && (
                                        <div className="text-right shrink-0">
                                            <p className="text-base font-black text-gray-900 leading-none">{score}</p>
                                            <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase">AI Score</p>
                                        </div>
                                    )}
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
                    View all candidates <ArrowRight className="h-3.5 w-3.5" />
                </Link>
            </div>
        </div>
    );
}
