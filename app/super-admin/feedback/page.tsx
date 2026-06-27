"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, Loader2, Mail, MessageSquare, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
type CandidateRating = {
    overallFeeling: string | null;
    aiQuestions: string[];
    understanding: string | null;
    notes: string;
};
type InterviewFeedbackRow = {
    id: string;
    applicationId: string;
    status: string;
    completedAt: string | null;
    updatedAt: string;
    createdAt: string;
    interviewDuration: number | null;
    interviewRecordingUrl: string | null;
    recordingStatus: string | null;
    recordingCompletedAt: string | null;
    candidateFeedback: string | null;
    candidateRating: unknown;
    application: {
        id: string;
        fullName: string;
        email: string;
        phone: string;
        drive?: {
            id: string;
            title: string;
            role: string | null;
            organization?: {
                id: string;
                name: string;
                slug: string;
                plan: string;
            } | null;
        } | null;
    } | null;
};
type OverallMeta = {
    label: string;
    tone: string;
    badgeClass: string;
};
function parseCandidateRating(value: unknown): CandidateRating {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { overallFeeling: null, aiQuestions: [], understanding: null, notes: "" };
    }
    const source = value as Record<string, unknown>;
    const overallFeeling = typeof source.overallFeeling === "string" ? source.overallFeeling.trim() : null;
    const aiQuestions = Array.isArray(source.aiQuestions)
        ? source.aiQuestions.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
        : [];
    const understanding = typeof source.understanding === "string" ? source.understanding.trim() : null;
    const notes = typeof source.notes === "string" ? source.notes.trim() : "";
    return { overallFeeling, aiQuestions, understanding, notes };
}
function formatDateTime(value: string | null | undefined) {
    if (!value) return "N/A";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "N/A";
    return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}
function formatDuration(seconds: number | null) {
    if (!seconds || seconds <= 0) return "N/A";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${String(secs).padStart(2, "0")}s`;
}
function overallMeta(label: string | null): OverallMeta {
    const normalized = label?.trim().toLowerCase() || "";
    switch (normalized) {
        case "terrible":
            return { label: "Terrible", tone: "text-red-700", badgeClass: "bg-red-50 text-red-700 border-red-100" };
        case "okay":
            return { label: "Okay", tone: "text-amber-700", badgeClass: "bg-amber-50 text-amber-700 border-amber-100" };
        case "good":
            return { label: "Good", tone: "text-blue-700", badgeClass: "bg-blue-50 text-blue-700 border-blue-100" };
        case "great":
            return { label: "Great", tone: "text-emerald-700", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-100" };
        case "loved it":
            return { label: "Loved it", tone: "text-violet-700", badgeClass: "bg-violet-50 text-violet-700 border-violet-100" };
        default:
            return { label: "Not rated", tone: "text-gray-500", badgeClass: "bg-gray-50 text-gray-500 border-gray-100" };
    }
}
function candidateName(row: InterviewFeedbackRow) {
    return row.application?.fullName?.trim() || "Unknown candidate";
}
function candidateEmail(row: InterviewFeedbackRow) {
    return row.application?.email?.trim() || "Unknown email";
}
function orgName(row: InterviewFeedbackRow) {
    return row.application?.drive?.organization?.name?.trim() || "No organization";
}
function jobTitle(row: InterviewFeedbackRow) {
    return row.application?.drive?.title?.trim() || "Interview";
}
export default function SuperAdminFeedbackPage() {
    const [feedbacks, setFeedbacks] = useState<InterviewFeedbackRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [stats, setStats] = useState({ total: 0, withNotesCount: 0, withRatingCount: 0, todayCount: 0 });
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [viewFeedback, setViewFeedback] = useState<InterviewFeedbackRow | null>(null);
    const fetchFeedback = async (currentPage = page, currentSearch = search) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(currentPage),
                limit: "20",
                ...(currentSearch ? { q: currentSearch } : {}),
            });
            const res = await fetch(`/api/super-admin/interview-feedback?${params.toString()}`);
            const data = await res.json();
            if (res.ok) {
                setFeedbacks(Array.isArray(data.feedbacks) ? data.feedbacks : []);
                setTotalPages(Number(data.pagination?.totalPages || 1));
                setStats(data.stats || { total: 0, withNotesCount: 0, withRatingCount: 0, todayCount: 0 });
            } else {
                setFeedbacks([]);
            }
        } catch (error) {
            console.error("Interview feedback fetch failed", error);
            setFeedbacks([]);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        void fetchFeedback();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, search]);
    const visibleStats = useMemo(
        () => [
            { label: "Total Feedback", value: stats.total, icon: MessageSquare, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "With Rating", value: stats.withRatingCount, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "With Notes", value: stats.withNotesCount, icon: Mail, color: "text-violet-600", bg: "bg-violet-50" },
            { label: "Today", value: stats.todayCount, icon: Clock3, color: "text-gray-700", bg: "bg-gray-100" },
        ],
        [stats]
    );
    return (
        <div className="space-y-6 pb-10 animate-in fade-in duration-500">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between animate-fade-slide">
                <div className="flex items-center gap-3 group">
                    <div className="h-8 w-1 bg-[#7C3AED] rounded-full" />
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Candidate Feedback</h1>
                        <p className="text-gray-400 font-medium text-[10px] uppercase tracking-wider">Review post-interview responses in detail</p>
                    </div>
                </div>
                <Link href="/super-admin">
                    <button className="flex items-center gap-1.5 bg-white border border-gray-100 hover:border-gray-200 text-gray-500 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all">
                        <ArrowRight className="h-3 w-3 rotate-180" />
                        Overview
                    </button>
                </Link>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {visibleStats.map((item) => (
                    <div key={item.label} className="flex items-center gap-3 p-3.5 bg-white rounded-xl border border-gray-100 shadow-sm transition-all hover:border-gray-200">
                        <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0 shadow-sm", item.bg, item.color)}>
                            <item.icon className="h-4.5 w-4.5" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide leading-none mb-1">{item.label}</span>
                            <span className="text-lg font-black text-gray-900 tabular-nums leading-none">{item.value?.toLocaleString?.() || item.value || 0}</span>
                        </div>
                    </div>
                ))}
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h2 className="text-sm font-bold text-gray-900">Recent Feedback</h2>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                            <Input
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") setSearch(searchInput.trim());
                                }}
                                placeholder="Search candidate, email, org..."
                                className="pl-8 h-8 w-48 text-xs rounded-lg border-gray-200 bg-gray-50/50"
                            />
                        </div>
                        <Button
                            onClick={() => {
                                setSearch(searchInput.trim());
                                setPage(1);
                                void fetchFeedback(1, searchInput.trim());
                            }}
                            className="h-8 px-4 rounded-lg bg-gray-900 text-white hover:bg-gray-800 text-[11px] font-bold"
                        >
                            Filter
                        </Button>
                    </div>
                </div>
                {loading ? (
                    <div className="py-16 flex justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                    </div>
                ) : feedbacks.length === 0 ? (
                    <div className="py-16 text-center space-y-4">
                        <div className="h-16 w-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto text-gray-300">
                            <Sparkles className="h-8 w-8" />
                        </div>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No feedback found</p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50/30">
                                        <th className="pl-5 py-3 text-left font-bold text-[10px] text-gray-400 uppercase tracking-wider">Candidate</th>
                                        <th className="px-4 py-3 text-left font-bold text-[10px] text-gray-400 uppercase tracking-wider">Application ID</th>
                                        <th className="px-4 py-3 text-left font-bold text-[10px] text-gray-400 uppercase tracking-wider">Organization</th>
                                        <th className="px-4 py-3 text-left font-bold text-[10px] text-gray-400 uppercase tracking-wider">Job</th>
                                        <th className="px-4 py-3 text-center font-bold text-[10px] text-gray-400 uppercase tracking-wider">Submitted At</th>
                                        <th className="pr-5 py-3 text-right font-bold text-[10px] text-gray-400 uppercase tracking-wider">View</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {feedbacks.map((feedback) => {
                                        return (
                                            <tr key={feedback.id} className="hover:bg-gray-50/80 transition-colors">
                                                <td className="pl-5 py-4">
                                                    <div className="flex flex-col min-w-[150px]">
                                                        <span className="text-gray-900 font-bold text-[12px] truncate">{candidateName(feedback)}</span>
                                                        <span className="text-[10px] text-gray-400 truncate">{candidateEmail(feedback)}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <span
                                                        className="text-[10px] font-medium text-gray-500 tabular-nums truncate whitespace-nowrap max-w-[180px] inline-block"
                                                        title={feedback.applicationId}
                                                    >
                                                        {feedback.applicationId}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <span className="text-[11px] font-bold text-gray-700 truncate max-w-[140px] inline-block">
                                                        {orgName(feedback)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <span className="text-[10px] font-medium text-gray-400 truncate uppercase max-w-[140px] inline-block">
                                                        {jobTitle(feedback)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 text-center">
                                                    <div className="flex flex-col items-center min-w-[120px]">
                                                        <span className="text-[10px] font-bold text-gray-700 tabular-nums">
                                                            {formatDateTime(feedback.updatedAt)}
                                                        </span>
                                                        <span className="text-[9px] text-gray-400 font-medium tabular-nums">
                                                            {feedback.completedAt ? "Interview completed" : "Feedback updated"}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="pr-5 py-4 text-right">
                                                    <button
                                                        onClick={() => setViewFeedback(feedback)}
                                                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase border bg-white border-gray-200 text-gray-700 shadow-sm transition-all hover:bg-violet-50 hover:text-violet-600 hover:border-violet-100 active:scale-[0.98]"
                                                    >
                                                        View Details
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/20 flex items-center justify-between">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                Page <span className="text-gray-900">{page}</span> of <span className="text-gray-900">{totalPages}</span>
                            </p>
                            <div className="flex items-center gap-1.5">
                                <button
                                    disabled={page <= 1}
                                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                                    className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-all"
                                >
                                    Previous
                                </button>
                                <button
                                    disabled={page >= totalPages}
                                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                                    className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-all"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
            <Dialog open={!!viewFeedback} onOpenChange={(open) => !open && setViewFeedback(null)}>
                <DialogContent className="max-w-4xl rounded-[2rem] border border-gray-100 bg-white p-0 shadow-2xl overflow-hidden">
                    <div className="max-h-[88vh] overflow-y-auto">
                        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 backdrop-blur px-8 py-6">
                        <DialogHeader>
                            <DialogTitle className="text-lg font-bold text-gray-900">Feedback Details</DialogTitle>
                            <DialogDescription className="text-sm text-gray-500">
                                {viewFeedback
                                    ? `${candidateName(viewFeedback)} - ${candidateEmail(viewFeedback)}`
                                    : "Detailed candidate feedback submission"}
                            </DialogDescription>
                        </DialogHeader>
                        </div>
                        <div className="px-8 py-6">
                            {viewFeedback && (() => {
                                const parsed = parseCandidateRating(viewFeedback.candidateRating);
                                const meta = overallMeta(parsed.overallFeeling);
                                const notes = (parsed.notes || viewFeedback.candidateFeedback || "").trim();
                                return (
                                    <div className="space-y-6">
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Candidate</p>
                                                <p className="mt-1 text-sm font-bold text-gray-900">{candidateName(viewFeedback)}</p>
                                                <p className="text-xs text-gray-500">{candidateEmail(viewFeedback)}</p>
                                                <p className="mt-2 text-xs text-gray-500">{viewFeedback.application?.phone?.trim() || "No phone on file"}</p>
                                            </div>
                                            <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Interview Context</p>
                                                <p className="mt-1 text-sm font-bold text-gray-900">{orgName(viewFeedback)}</p>
                                                <p className="text-xs text-gray-500">{jobTitle(viewFeedback)}</p>
                                                <p className="mt-2 text-xs text-gray-500 tabular-nums">Application: {viewFeedback.applicationId}</p>
                                            </div>
                                        </div>
                                        <div className="grid gap-3 sm:grid-cols-3">
                                            <div className="rounded-2xl border border-gray-100 bg-white p-4">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Overall Feeling</p>
                                                <div className={cn("mt-2 inline-flex items-center rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest", meta.badgeClass)}>
                                                    {meta.label}
                                                </div>
                                            </div>
                                            <div className="rounded-2xl border border-gray-100 bg-white p-4">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Understanding</p>
                                                <p className="mt-2 text-sm font-bold text-gray-900">
                                                    {parsed.understanding || "Not provided"}
                                                </p>
                                            </div>
                                            <div className="rounded-2xl border border-gray-100 bg-white p-4">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Timing</p>
                                                <p className="mt-2 text-sm font-bold text-gray-900">
                                                    {formatDateTime(viewFeedback.updatedAt)}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {viewFeedback.completedAt ? `Completed at ${formatDateTime(viewFeedback.completedAt)}` : "Completed time not recorded"}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="rounded-3xl border border-gray-100 bg-gray-50/50 p-5">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">AI Questions</p>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {parsed.aiQuestions.length > 0 ? (
                                                    parsed.aiQuestions.map((chip) => (
                                                        <span
                                                            key={chip}
                                                            className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1.5 text-[11px] font-semibold text-violet-700"
                                                        >
                                                            {chip}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className="text-sm text-gray-500">No question tags were submitted.</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="rounded-3xl border border-gray-100 bg-white p-5">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Candidate Notes</p>
                                            <div className="mt-3 rounded-2xl bg-gray-50/70 border border-gray-100 p-4">
                                                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                                                    {notes || "No written notes were submitted."}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="grid gap-3 sm:grid-cols-3">
                                            <div className="rounded-2xl border border-gray-100 bg-white p-4">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Interview ID</p>
                                                <p className="mt-2 text-sm font-bold text-gray-900">{viewFeedback.id}</p>
                                            </div>
                                            <div className="rounded-2xl border border-gray-100 bg-white p-4">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Interview Status</p>
                                                <p className="mt-2 text-sm font-bold text-gray-900">{viewFeedback.status || "UNKNOWN"}</p>
                                            </div>
                                            <div className="rounded-2xl border border-gray-100 bg-white p-4">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Duration</p>
                                                <p className="mt-2 text-sm font-bold text-gray-900">{formatDuration(viewFeedback.interviewDuration)}</p>
                                            </div>
                                        </div>
                                        <div className="flex justify-end pt-2">
                                            <Button
                                                onClick={() => setViewFeedback(null)}
                                                className="bg-gray-900 text-white hover:bg-gray-800 rounded-xl font-bold text-xs px-8 h-10 shadow-sm"
                                            >
                                                Close
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
