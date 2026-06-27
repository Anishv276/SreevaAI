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
// Top 3 get rank badges; all get distinct avatar colours
const AVATAR_COLORS = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-violet-500",
    "bg-pink-500",
    "bg-amber-500",
    "bg-violet-500",
];
const RANK_BADGE: Record<number, { bg: string; text: string; label: string }> = {
    0: { bg: "bg-amber-100",  text: "text-amber-700",  label: "#1" },
    1: { bg: "bg-gray-100",  text: "text-gray-600",  label: "#2" },
    2: { bg: "bg-violet-100", text: "text-violet-700", label: "#3" },
};
const STATUS_CONFIG: Record<string, { dot: string; text: string; bg: string; label: string }> = {
    Shortlisted:   { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50",  label: "Shortlisted" },
    Reviewing:     { dot: "bg-amber-500",   text: "text-amber-700",   bg: "bg-amber-50",    label: "Reviewing" },
    "In progress": { dot: "bg-blue-500",    text: "text-blue-700",    bg: "bg-blue-50",     label: "In Progress" },
    Pending:       { dot: "bg-gray-300",    text: "text-gray-500",    bg: "bg-gray-50",     label: "Pending" },
    Rejected:      { dot: "bg-red-400",     text: "text-red-600",     bg: "bg-red-50",      label: "Rejected" },
};
function scoreLabel(score: number) {
    if (score >= 80) return { text: "Excellent", color: "text-emerald-600" };
    if (score >= 60) return { text: "Good",      color: "text-blue-600" };
    if (score >= 40) return { text: "Average",   color: "text-amber-600" };
    return                  { text: "Below Avg", color: "text-red-500" };
}
function scoreBarColor(score: number) {
    if (score >= 80) return "#10B981";
    if (score >= 60) return "#3B82F6";
    if (score >= 40) return "#F59E0B";
    return "#F87171";
}
interface TopCandidatesProps {
    dateRange: DateRange;
}
export function TopCandidates({ dateRange }: TopCandidatesProps) {
    const [candidates, setCandidates] = useState<TopCandidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryKey, setRetryKey] = useState(0);
    const router = useRouter();
    useEffect(() => {
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
        <div className="premium-card flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                <div>
                    <h3 className="text-base font-bold text-gray-900 tracking-tight">Top Talent</h3>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Ranked by interview score</p>
                </div>
                <Link
                    href="/admin/candidates"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 border border-gray-200 rounded-xl px-3 py-1.5 hover:border-gray-300 hover:text-gray-900 transition-all uppercase tracking-widest"
                >
                    All Candidates <ArrowRight className="h-3 w-3" />
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
                ) : candidates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-44 gap-2 text-center">
                        <Trophy className="h-8 w-8 text-gray-200" />
                        <p className="text-sm font-bold text-gray-500">No completed interviews yet</p>
                        <p className="text-xs text-gray-400">Top candidates appear here after interviews finish</p>
                    </div>
                ) : (
                    <motion.div
                        initial="hidden"
                        animate="visible"
                        variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.07 } } }}
                        className="space-y-2"
                    >
                        {candidates.map((c, i) => {
                            const rank = RANK_BADGE[i];
                            const status = STATUS_CONFIG[c.status] ?? STATUS_CONFIG["Reviewing"];
                            const score = c.interviewScore ?? 0;
                            const sl = scoreLabel(score);
                            return (
                                <motion.div
                                    key={c.id}
                                    variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                                    onClick={() => router.push(`/admin/candidates/${c.id}`)}
                                    className="group flex items-center gap-3 p-3 rounded-2xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50/50 hover:shadow-sm transition-all duration-200 cursor-pointer"
                                >
                                    {/* Avatar + rank badge */}
                                    <div className="relative shrink-0">
                                        <div className={cn(
                                            "h-10 w-10 rounded-xl flex items-center justify-center text-[12px] font-bold text-white",
                                            AVATAR_COLORS[i % AVATAR_COLORS.length]
                                        )}>
                                            {c.initials}
                                        </div>
                                        {rank && (
                                            <span className={cn(
                                                "absolute -top-1.5 -right-1.5 text-[8px] font-bold px-1 py-0.5 rounded-md border border-white",
                                                rank.bg, rank.text
                                            )}>
                                                {rank.label}
                                            </span>
                                        )}
                                    </div>
                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2 mb-0.5">
                                            <p className="text-sm font-bold text-gray-900 truncate group-hover:text-gray-700">
                                                {c.name}
                                            </p>
                                            {/* Status pill */}
                                            <span className={cn(
                                                "shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest",
                                                status.bg, status.text
                                            )}>
                                                <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
                                                {status.label}
                                            </span>
                                        </div>
                                        {/* Role · Drive */}
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate mb-1.5">
                                            {c.role} · {c.driveTitle}
                                        </p>
                                        {/* Score bar */}
                                        {c.interviewScore != null && (
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${score}%` }}
                                                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: i * 0.05 }}
                                                        className="h-full rounded-full"
                                                        style={{ backgroundColor: scoreBarColor(score) }}
                                                    />
                                                </div>
                                                <span className="text-[10px] font-bold text-gray-700 tabular-nums shrink-0">{score}</span>
                                                <span className={cn("text-[9px] font-bold shrink-0", sl.color)}>{sl.text}</span>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </motion.div>
                )}
            </div>
        </div>
    );
}
