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
import { getActiveDriveCount, isDriveCreationLocked } from "@/lib/drive-limits";
import { isInterviewQuotaLocked, isOrgRestrictedStatus } from "@/lib/interview-quota";
import Link from "next/link";
import { useAdminOrg } from "@/context/admin-org-context";
import { ALL_VOICES } from "@/lib/constants/voices";
import { cn } from "@/lib/utils";

export default function DrivesPage() {
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
    const [driveToDelete, setDriveToDelete] = useState<string | null>(null);
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
    const activeDriveCount = adminOrg?.activeDriveCount ?? getActiveDriveCount(jobs);
    const interviewAccessLocked = quotaLocked || isSuspended;
    const driveCreationLocked = isDriveCreationLocked(adminOrg?.maxActiveDrives, activeDriveCount) || interviewAccessLocked;

    const confirmDelete = async () => {
        if (!driveToDelete) return;
        setIsDeleting(true);
        try {
            await deleteJob(driveToDelete);
            setIsDeleteModalOpen(false);
            setDriveToDelete(null);
        } catch {
            toast.error("Failed to delete drive");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50/70 pb-16 animate-in fade-in duration-500">

            {/* ── Page header ── */}
            <div className="px-6 lg:px-10 pt-8 pb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h1 className="text-[26px] font-extrabold text-gray-900 tracking-tight">Active Jobs</h1>
                    <p className="text-[13px] text-gray-400 mt-0.5 font-medium">
                        {pagination.total} {pagination.total === 1 ? "job" : "jobs"} · Updated just now
                    </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                        <Input
                            placeholder="Search jobs..."
                            className="pl-10 h-9 w-52 border-gray-200 bg-white rounded-full text-[13px] shadow-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-200"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <DateFilter value={timeline} onChange={setTimeline} />
                    {driveCreationLocked ? (
                        <button disabled className="h-9 px-4 rounded-full bg-gray-100 text-gray-400 font-semibold text-[13px] flex items-center gap-1.5 cursor-not-allowed border border-gray-200">
                            <Lock className="h-3.5 w-3.5" /> {interviewAccessLocked ? "Locked" : "New Job"}
                        </button>
                    ) : (
                        <Link href="/admin/create-drive">
                            <button className="h-9 px-5 rounded-full bg-[#F97316] hover:bg-orange-600 text-white font-bold text-[13px] flex items-center gap-1.5 shadow-sm transition-colors">
                                <Plus className="h-4 w-4" /> New Job
                            </button>
                        </Link>
                    )}
                </div>
            </div>

            {/* ── Cards grid ── */}
            <div className="px-6 lg:px-10">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-36">
                        <Loader2 className="h-9 w-9 text-[#F97316] animate-spin mb-3" />
                        <p className="text-[12px] font-bold text-gray-400 uppercase tracking-widest">Loading jobs...</p>
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-36 text-center max-w-xs mx-auto">
                        <div className="h-16 w-16 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center mb-4">
                            <Briefcase className="h-7 w-7 text-[#F97316]" />
                        </div>
                        <h3 className="text-[16px] font-bold text-gray-800 mb-1.5">No active jobs yet</h3>
                        <p className="text-[13px] text-gray-400 mb-6 leading-relaxed">
                            Create your first job and candidates will appear automatically.
                        </p>
                        {!driveCreationLocked && (
                            <Link href="/admin/create-drive">
                                <button className="h-9 px-5 rounded-full bg-[#F97316] hover:bg-orange-600 text-white font-bold text-[13px] flex items-center gap-1.5 shadow-sm transition-colors">
                                    <Plus className="h-4 w-4" /> Create First Job
                                </button>
                            </Link>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                        {jobs.map((drive) => {
                            const applicants = Number(drive.applicants || 0);
                            const deadlineText = drive.deadline
                                ? new Date(drive.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                                : null;
                            const isExpired = drive.deadline ? new Date(drive.deadline) < new Date() : false;
                            const voice = ALL_VOICES.find(v => v.id === drive.voiceId);
                            const language = drive.interviewLanguage || "English";
                            const isInterviewOnly = (drive as any).interviewMode === "interview-only";

                            return (
                                <div
                                    key={drive.id}
                                    onClick={() => router.push(`/admin/candidates/drive/${encodeURIComponent(drive.id)}`)}
                                    className="group relative bg-white rounded-2xl border border-gray-100 shadow-[0_1px_8px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.10)] hover:border-orange-200/60 transition-all duration-250 cursor-pointer flex flex-col overflow-hidden"
                                >
                                    {/* Orange top accent line */}
                                    <div className="h-[3px] w-full bg-[#F97316]" />

                                    {/* ── Card header ── */}
                                    <div className="px-5 pt-4 pb-4 flex items-start justify-between gap-3">
                                        <div className="flex items-start gap-3 min-w-0">
                                            {/* Icon */}
                                            <div className="h-10 w-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0 mt-0.5">
                                                <Briefcase className="h-4.5 w-4.5 text-[#F97316]" />
                                            </div>
                                            <div className="min-w-0">
                                                {/* Mode pill */}
                                                <span className={cn(
                                                    "inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full mb-1.5",
                                                    isInterviewOnly
                                                        ? "bg-orange-50 text-[#F97316] border border-orange-200"
                                                        : "bg-gray-50 text-gray-500 border border-gray-200"
                                                )}>
                                                    {isInterviewOnly
                                                        ? <><Zap className="h-2.5 w-2.5" /> Interview Only</>
                                                        : <><SlidersHorizontal className="h-2.5 w-2.5" /> Scoring + Interview</>
                                                    }
                                                </span>
                                                {/* Title */}
                                                <h3 className="text-[15px] font-extrabold text-gray-900 leading-snug tracking-tight line-clamp-2">
                                                    {drive.title}
                                                </h3>
                                                {/* Role */}
                                                {drive.role && drive.role !== drive.title && (
                                                    <p className="text-[12px] text-gray-400 font-medium mt-0.5 truncate">{drive.role}</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Menu */}
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                                                <button className="h-8 w-8 rounded-lg border border-gray-100 bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-700 flex items-center justify-center transition-colors shrink-0">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48 p-1.5 rounded-xl bg-white border border-gray-100 shadow-xl">
                                                <DropdownMenuItem
                                                    className="rounded-lg py-2 px-3 text-gray-700 font-semibold text-[13px] cursor-pointer"
                                                    onClick={(e) => { e.stopPropagation(); router.push(`/admin/create-drive?id=${drive.id}&mode=edit${orgId ? `&orgId=${orgId}` : ""}`); }}
                                                >
                                                    <Edit className="h-3.5 w-3.5 mr-2 text-gray-400" /> Edit Details
                                                </DropdownMenuItem>
                                                <div className="h-px bg-gray-100 my-1 mx-1" />
                                                <DropdownMenuItem
                                                    className="rounded-lg py-2 px-3 text-red-600 font-semibold text-[13px] cursor-pointer focus:bg-red-50"
                                                    onClick={(e) => { e.stopPropagation(); setDriveToDelete(drive.id); setIsDeleteModalOpen(true); }}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>

                                    {/* ── Stats strip ── */}
                                    <div className="mx-5 mb-4 grid grid-cols-3 rounded-xl border border-gray-100 bg-gray-50/60 divide-x divide-gray-100 overflow-hidden">
                                        <div className="px-3 py-2.5 text-center">
                                            <p className="text-[20px] font-black text-gray-900 leading-none">{applicants}</p>
                                            <p className="text-[10px] text-gray-400 font-semibold mt-0.5 flex items-center justify-center gap-1">
                                                <Users className="h-2.5 w-2.5" /> Candidates
                                            </p>
                                        </div>
                                        <div className="px-3 py-2.5 text-center">
                                            <p className={cn(
                                                "text-[12px] font-bold leading-tight",
                                                deadlineText ? (isExpired ? "text-red-500" : "text-gray-900") : "text-gray-300"
                                            )}>
                                                {deadlineText ?? "—"}
                                            </p>
                                            <p className={cn(
                                                "text-[10px] font-semibold mt-0.5 flex items-center justify-center gap-1",
                                                isExpired ? "text-red-400" : "text-gray-400"
                                            )}>
                                                <Calendar className="h-2.5 w-2.5" />
                                                {deadlineText ? (isExpired ? "Expired" : "Deadline") : "No deadline"}
                                            </p>
                                        </div>
                                        <div className="px-3 py-2.5 text-center">
                                            <p className="text-[12px] font-bold text-gray-900 leading-tight truncate">{language}</p>
                                            <p className="text-[10px] text-gray-400 font-semibold mt-0.5 flex items-center justify-center gap-1">
                                                <Globe className="h-2.5 w-2.5" /> Language
                                            </p>
                                        </div>
                                    </div>

                                    {/* ── Voice row ── */}
                                    <div className="mx-5 mb-4 flex items-center gap-2.5 rounded-xl border border-gray-100 bg-gray-50/60 px-3.5 py-2.5">
                                        <div className="h-7 w-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                                            <Mic className="h-3.5 w-3.5 text-[#F97316]" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[12px] font-bold text-gray-800 truncate">{voice?.name ?? "Default Voice"}</p>
                                            <p className="text-[10px] text-gray-400 font-medium">{voice?.provider ?? "Cartesia"}</p>
                                        </div>
                                        {deadlineText && !isExpired && (
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 shrink-0">
                                                Open
                                            </span>
                                        )}
                                        {isExpired && (
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-100 shrink-0">
                                                Expired
                                            </span>
                                        )}
                                    </div>

                                    {/* ── CTA ── */}
                                    <div className="px-5 pb-4 mt-auto">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); router.push(`/admin/candidates/drive/${encodeURIComponent(drive.id)}`); }}
                                            className="w-full h-10 rounded-xl bg-gray-900 hover:bg-[#F97316] text-white font-bold text-[13px] flex items-center justify-center gap-2 transition-colors duration-200 group/btn"
                                        >
                                            View Candidates
                                            <ArrowUpRight className="h-3.5 w-3.5 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
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
                <div className="px-6 lg:px-10 mt-10 flex items-center justify-between">
                    <p className="text-[12px] text-gray-400 font-medium">
                        Showing <span className="font-bold text-gray-700">{(pagination.page - 1) * pagination.limit + 1}</span>–<span className="font-bold text-gray-700">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> of <span className="font-bold text-gray-700">{pagination.total}</span>
                    </p>
                    <div className="flex gap-2">
                        <button
                            disabled={pagination.page <= 1 || isLoading}
                            onClick={() => handlePageChange(pagination.page - 1)}
                            className="h-9 px-5 rounded-full border border-gray-200 bg-white text-[13px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-colors flex items-center gap-1.5"
                        >
                            <ChevronRight className="h-4 w-4 rotate-180" /> Previous
                        </button>
                        <button
                            disabled={pagination.page >= pagination.totalPages || isLoading}
                            onClick={() => handlePageChange(pagination.page + 1)}
                            className="h-9 px-5 rounded-full border border-gray-200 bg-white text-[13px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-colors flex items-center gap-1.5"
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
