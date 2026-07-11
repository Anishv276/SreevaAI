"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/components/ui/toast-custom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Search, MoreHorizontal, Plus, Briefcase, Users,
    Trash2, Edit, Loader2, ChevronRight, Lock,
    ArrowUpRight, Globe, Mic, Calendar,
    Zap, SlidersHorizontal,
} from "lucide-react";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useJobs } from "@/context/jobs-context";
import { ActionConfirmModal } from "@/components/ui/action-confirm-modal";
import { DateFilter, type DateRange } from "@/components/admin/date-filter";
import { getActiveJobCount, isJobCreationLocked } from "@/lib/job-limits";
import { isInterviewQuotaLocked, isOrgRestrictedStatus } from "@/lib/interview-quota";
import Link from "next/link";
import { useAdminOrg } from "@/context/admin-org-context";
import { ALL_VOICES } from "@/lib/constants/voices";
import { cn } from "@/lib/utils";

export default function JobsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const orgId = searchParams.get("orgId");
    const { jobs, pagination, deleteJob, fetchJobs } = useJobs();
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const adminOrg = useAdminOrg();
    const [timeline, setTimeline] = useState<DateRange>({ type: "month" });
    const orgStatus = String(adminOrg?.status || "ACTIVE").toUpperCase();
    const quotaLocked = isInterviewQuotaLocked(adminOrg ?? {});
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [jobToDelete, setJobToDelete] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        const handler = setTimeout(() => {
            let startDate: string | undefined;
            let endDate: string | undefined;
            if (timeline.type === "today") { startDate = new Date().toISOString().split("T")[0]; endDate = startDate; }
            else if (timeline.type === "week") { const d = new Date(); d.setDate(d.getDate() - 7); startDate = d.toISOString().split("T")[0]; }
            else if (timeline.type === "month") { const d = new Date(); d.setMonth(d.getMonth() - 1); startDate = d.toISOString().split("T")[0]; }
            else if (timeline.type === "custom") { startDate = timeline.from; endDate = timeline.to; }
            fetchJobs(1, pagination.limit, searchQuery, startDate, endDate).finally(() => setIsLoading(false));
        }, 300);
        return () => clearTimeout(handler);
    }, [searchQuery, timeline, pagination.limit]);

    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= pagination.totalPages) {
            setIsLoading(true);
            let startDate: string | undefined; let endDate: string | undefined;
            if (timeline.type === "today") { startDate = new Date().toISOString().split("T")[0]; endDate = startDate; }
            else if (timeline.type === "week") { const d = new Date(); d.setDate(d.getDate() - 7); startDate = d.toISOString().split("T")[0]; }
            else if (timeline.type === "month") { const d = new Date(); d.setMonth(d.getMonth() - 1); startDate = d.toISOString().split("T")[0]; }
            else if (timeline.type === "custom") { startDate = timeline.from; endDate = timeline.to; }
            fetchJobs(newPage, pagination.limit, searchQuery, startDate, endDate).finally(() => setIsLoading(false));
        }
    };

    const isSuspended = isOrgRestrictedStatus(orgStatus);
    const activeJobCount = adminOrg?.activeJobCount ?? getActiveJobCount(jobs);
    const interviewAccessLocked = quotaLocked || isSuspended;
    const jobCreationLocked = isJobCreationLocked(adminOrg?.maxActiveJobs, activeJobCount) || interviewAccessLocked;

    const confirmDelete = async () => {
        if (!jobToDelete) return;
        setIsDeleting(true);
        try {
            await deleteJob(jobToDelete);
            setIsDeleteModalOpen(false);
            setJobToDelete(null);
        } catch {
            toast.error("Failed to delete job");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-6 pb-10 animate-in fade-in duration-500">

            {/* ── Page header ── */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Active Jobs</h1>
                    <p className="text-sm text-gray-400 mt-0.5">
                        {pagination.total} {pagination.total === 1 ? "job" : "jobs"} · Updated just now
                    </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                        <Input
                            placeholder="Search jobs..."
                            className="pl-10 h-9 w-52 bg-white rounded-xl text-sm shadow-none focus:ring-1 focus:ring-violet-400"
                            style={{ border: "1px solid #E9E7FF" }}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <DateFilter value={timeline} onChange={setTimeline} />
                    {jobCreationLocked ? (
                        <button disabled className="h-9 px-4 rounded-xl text-gray-400 font-medium text-sm flex items-center gap-1.5 cursor-not-allowed" style={{ background: "#F5F3FF", border: "1px solid #E9E7FF" }}>
                            <Lock className="h-3.5 w-3.5" /> {interviewAccessLocked ? "Locked" : "New Job"}
                        </button>
                    ) : (
                        <Link href="/admin/create-job">
                            <button className="btn-shimmer h-9 px-5 rounded-xl text-white font-semibold text-sm flex items-center gap-1.5 transition-all" style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" }}>
                                <Plus className="h-4 w-4" /> New Job
                            </button>
                        </Link>
                    )}
                </div>
            </div>

            {/* ── Cards grid ── */}
            <div>
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-36">
                        <Loader2 className="h-8 w-8 text-violet-500 animate-spin mb-3" />
                        <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">Loading jobs...</p>
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-36 text-center max-w-xs mx-auto">
                        <div className="h-16 w-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.12)" }}>
                            <Briefcase className="h-7 w-7 text-violet-600" />
                        </div>
                        <h3 className="text-base font-semibold text-gray-800 mb-1.5">No active jobs yet</h3>
                        <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                            Create your first job and candidates will appear automatically.
                        </p>
                        {!jobCreationLocked && (
                            <Link href="/admin/create-job">
                                <button className="btn-shimmer h-9 px-5 rounded-xl text-white font-semibold text-sm flex items-center gap-1.5" style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" }}>
                                    <Plus className="h-4 w-4" /> Create First Job
                                </button>
                            </Link>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                        {jobs.map((job) => {
                            const applicants = Number(job.applicants || 0);
                            const deadlineText = job.applicationDeadline
                                ? new Date(job.applicationDeadline).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                                : null;
                            const isExpired = job.applicationDeadline ? new Date(job.applicationDeadline) < new Date() : false;
                            const voice = ALL_VOICES.find(v => v.id === job.aiInterviewerVoiceId);
                            const isInterviewOnly = (job as any).interviewMode === "interview-only";

                            return (
                                <div
                                    key={job.id}
                                    onClick={() => router.push(`/admin/candidates/job/${encodeURIComponent(job.id)}`)}
                                    className="group relative bg-white rounded-2xl cursor-pointer flex flex-col overflow-hidden transition-all duration-200"
                                    style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 4px rgba(124,58,237,0.04)" }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#C4B5FD"; (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 24px rgba(124,58,237,0.1)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#E9E7FF"; (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 4px rgba(124,58,237,0.04)"; (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
                                >
                                    {/* Violet top accent line */}
                                    <div className="h-[3px] w-full" style={{ background: "linear-gradient(90deg, #8B5CF6, #3B82F6)" }} />

                                    {/* ── Card header ── */}
                                    <div className="px-5 pt-4 pb-4 flex items-start justify-between gap-3">
                                        <div className="flex items-start gap-3 min-w-0">
                                            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.12)" }}>
                                                <Briefcase className="h-4.5 w-4.5 text-violet-600" />
                                            </div>
                                            <div className="min-w-0">
                                                <span className={cn(
                                                    "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full mb-1.5",
                                                    isInterviewOnly
                                                        ? "bg-violet-50 text-violet-600 border border-violet-200"
                                                        : "bg-gray-50 text-gray-500 border border-gray-200"
                                                )}>
                                                    {isInterviewOnly
                                                        ? <><Zap className="h-2.5 w-2.5" /> Interview Only</>
                                                        : <><SlidersHorizontal className="h-2.5 w-2.5" /> Scoring + Interview</>
                                                    }
                                                </span>
                                                <h3 className="text-[15px] font-semibold text-gray-900 leading-snug tracking-tight line-clamp-2">
                                                    {job.title}
                                                </h3>
                                                {job.jobRole && job.jobRole !== job.title && (
                                                    <p className="text-xs text-gray-400 font-medium mt-0.5 truncate">{job.jobRole}</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Menu */}
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                                                <button className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors shrink-0 text-gray-400 hover:text-gray-700 hover:bg-gray-50" style={{ border: "1px solid #E9E7FF" }}>
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48 p-1.5 rounded-xl bg-white shadow-xl" style={{ border: "1px solid #E9E7FF" }}>
                                                <DropdownMenuItem
                                                    className="rounded-lg py-2 px-3 text-gray-700 font-medium text-sm cursor-pointer"
                                                    onClick={(e) => { e.stopPropagation(); router.push(`/admin/create-job?id=${job.id}&mode=edit${orgId ? `&orgId=${orgId}` : ""}`); }}
                                                >
                                                    <Edit className="h-3.5 w-3.5 mr-2 text-gray-400" /> Edit Details
                                                </DropdownMenuItem>
                                                <div className="h-px bg-gray-100 my-1 mx-1" />
                                                <DropdownMenuItem
                                                    className="rounded-lg py-2 px-3 text-red-600 font-medium text-sm cursor-pointer focus:bg-red-50"
                                                    onClick={(e) => { e.stopPropagation(); setJobToDelete(job.id); setIsDeleteModalOpen(true); }}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>

                                    {/* ── Stats strip ── */}
                                    <div className="mx-5 mb-4 grid grid-cols-2 rounded-xl divide-x divide-[#F0EEF8] overflow-hidden" style={{ border: "1px solid #F0EEF8", background: "#FAFAFC" }}>
                                        <div className="px-3 py-2.5 text-center">
                                            <p className="text-xl font-bold text-gray-900 leading-none tabular-nums">{applicants}</p>
                                            <p className="text-[10px] text-gray-400 font-medium mt-0.5 flex items-center justify-center gap-1">
                                                <Users className="h-2.5 w-2.5" /> Candidates
                                            </p>
                                        </div>
                                        <div className="px-3 py-2.5 text-center" style={{ borderLeft: "1px solid #F0EEF8" }}>
                                            <p className={cn(
                                                "text-xs font-semibold leading-tight",
                                                deadlineText ? (isExpired ? "text-red-500" : "text-gray-900") : "text-gray-300"
                                            )}>
                                                {deadlineText ?? "—"}
                                            </p>
                                            <p className={cn(
                                                "text-[10px] font-medium mt-0.5 flex items-center justify-center gap-1",
                                                isExpired ? "text-red-400" : "text-gray-400"
                                            )}>
                                                <Calendar className="h-2.5 w-2.5" />
                                                {deadlineText ? (isExpired ? "Expired" : "Deadline") : "No deadline"}
                                            </p>
                                        </div>
                                    </div>

                                    {/* ── Voice row ── */}
                                    <div className="mx-5 mb-4 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5" style={{ border: "1px solid #F0EEF8", background: "#FAFAFC" }}>
                                        <div className="h-7 w-7 rounded-lg bg-white flex items-center justify-center shrink-0" style={{ border: "1px solid #E9E7FF" }}>
                                            <Mic className="h-3.5 w-3.5 text-violet-500" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-semibold text-gray-800 truncate">{voice?.name ?? "Default Voice"}</p>
                                            <p className="text-[10px] text-gray-400 font-medium">{voice?.provider ?? "Cartesia"}</p>
                                        </div>
                                        {deadlineText && !isExpired && (
                                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 shrink-0">
                                                Open
                                            </span>
                                        )}
                                        {isExpired && (
                                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-100 shrink-0">
                                                Expired
                                            </span>
                                        )}
                                    </div>

                                    {/* ── CTA ── */}
                                    <div className="px-5 pb-5 mt-auto">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); router.push(`/admin/candidates/job/${encodeURIComponent(job.id)}`); }}
                                            className="btn-shimmer w-full h-10 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                                            style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.2)" }}
                                        >
                                            View Candidates
                                            <ArrowUpRight className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Pagination ── */}
            {!isLoading && jobs.length > 0 && pagination.totalPages > 1 && (
                <div className="mt-10 flex items-center justify-between">
                    <p className="text-xs text-gray-400 font-medium">
                        Showing <span className="font-semibold text-gray-700">{(pagination.page - 1) * pagination.limit + 1}</span>–<span className="font-semibold text-gray-700">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> of <span className="font-semibold text-gray-700">{pagination.total}</span>
                    </p>
                    <div className="flex gap-2">
                        <button
                            disabled={pagination.page <= 1 || isLoading}
                            onClick={() => handlePageChange(pagination.page - 1)}
                            className="h-9 px-5 rounded-xl bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-colors flex items-center gap-1.5"
                            style={{ border: "1px solid #E9E7FF" }}
                        >
                            <ChevronRight className="h-4 w-4 rotate-180" /> Previous
                        </button>
                        <button
                            disabled={pagination.page >= pagination.totalPages || isLoading}
                            onClick={() => handlePageChange(pagination.page + 1)}
                            className="h-9 px-5 rounded-xl bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-colors flex items-center gap-1.5"
                            style={{ border: "1px solid #E9E7FF" }}
                        >
                            Next <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}

            <ActionConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Job"
                description="Are you sure you want to delete this job? This will permanently remove all candidates and data."
                confirmText="Confirm Delete"
                isLoading={isDeleting}
            />
        </div>
    );
}
