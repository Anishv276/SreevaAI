"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/components/ui/toast-custom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Search,
    MoreHorizontal,
    Plus,
    Briefcase,
    Users,
    Trash2,
    Edit,
    Loader2,
    ChevronRight,
    Lock,
    Rocket,
    Target,
    ArrowUpRight,
    Globe,
    Mic,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useJobs } from "@/context/jobs-context";
import { ActionConfirmModal } from "@/components/ui/action-confirm-modal";
import { DateFilter, type DateRange } from "@/components/admin/date-filter";
import { getActiveDriveCount, isDriveCreationLocked } from "@/lib/drive-limits";
import { getSupportComposeUrl, isInterviewQuotaLocked, isOrgRestrictedStatus } from "@/lib/interview-quota";
import Link from "next/link";
import { useAdminOrg } from "@/context/admin-org-context";
import { ALL_VOICES } from "@/lib/constants/voices";
export default function DrivesPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const orgId = searchParams.get("orgId");
    const { jobs, pagination, deleteJob, fetchJobs, organization } = useJobs();
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const adminOrg = useAdminOrg();
    const [timeline, setTimeline] = useState<DateRange>({ type: "month" });
    // ⚡ Read from shared context — no fetch needed (was 2 API calls per load)
    const orgStatus = String(adminOrg?.status || "ACTIVE").toUpperCase();
    const quotaLocked = isInterviewQuotaLocked(adminOrg ?? {});
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [driveToDelete, setDriveToDelete] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    useEffect(() => {
        const handler = setTimeout(() => {
            let startDate: string | undefined;
            let endDate: string | undefined;
            if (timeline.type === "today") {
                startDate = new Date().toISOString().split("T")[0];
                endDate = startDate;
            } else if (timeline.type === "week") {
                const date = new Date();
                date.setDate(date.getDate() - 7);
                startDate = date.toISOString().split("T")[0];
            } else if (timeline.type === "month") {
                const date = new Date();
                date.setMonth(date.getMonth() - 1);
                startDate = date.toISOString().split("T")[0];
            } else if (timeline.type === "custom") {
                startDate = timeline.from;
                endDate = timeline.to;
            }
            fetchJobs(1, pagination.limit, searchQuery, startDate, endDate).finally(() => setIsLoading(false));
        }, 300);
        return () => clearTimeout(handler);
    }, [searchQuery, timeline, pagination.limit]);
    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= pagination.totalPages) {
            setIsLoading(true);
            let startDate: string | undefined;
            let endDate: string | undefined;
            if (timeline.type === "today") {
                startDate = new Date().toISOString().split("T")[0];
                endDate = startDate;
            } else if (timeline.type === "week") {
                const date = new Date();
                date.setDate(date.getDate() - 7);
                startDate = date.toISOString().split("T")[0];
            } else if (timeline.type === "month") {
                const date = new Date();
                date.setMonth(date.getMonth() - 1);
                startDate = date.toISOString().split("T")[0];
            } else if (timeline.type === "custom") {
                startDate = timeline.from;
                endDate = timeline.to;
            }
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
        } catch (error) {
            console.error("Error deleting drive:", error);
            toast.error("Failed to delete drive");
        } finally {
            setIsDeleting(false);
        }
    };
    return (
        <div className="space-y-7 pb-10 animate-in fade-in duration-700" style={{ zoom: 0.78, transformOrigin: "top center" }}>
            {/* Header */}
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between mb-8">
                <div className="flex items-center gap-5 group">
                    <div className="h-12 w-1.5 bg-orange-600 rounded-full shadow-[0_0_15px_rgba(234,88,12,0.3)]" />
                    <div className="space-y-1">
                        <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">Active Jobs</h1>
                        <div className="flex items-center gap-3">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" />
                            <p className="text-gray-400 font-bold text-[11px] uppercase tracking-widest">{pagination.total || 0} Total Jobs</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {driveCreationLocked ? (
                        <div className="flex items-center gap-3">
                            <button disabled className="bg-gray-100 text-gray-400 border border-gray-200 h-12 px-6 font-bold rounded-2xl cursor-not-allowed opacity-70 flex items-center gap-2">
                                <Lock className="h-4 w-4" />
                                {interviewAccessLocked ? "Job Locked" : "New Job"}
                            </button>
                            {interviewAccessLocked ? (
                                <a
                                    href={getSupportComposeUrl({
                                        subject: "Interview quota support request",
                                        body: isSuspended
                                            ? "Hi support team,\n\nOur account is suspended by Super Admin. Please help us restore access.\n"
                                            : "Hi support team,\n\nPlease help us restore interview access for our account.\n",
                                    })}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[12px] font-bold text-slate-700 hover:text-slate-900 uppercase tracking-widest"
                                >
                                    Contact Support
                                </a>
                            ) : (
                                <a
                                    href={getSupportComposeUrl({
                                        subject: "Upgrade plan request",
                                        body: "Hi support team,\n\nWe would like to upgrade our plan to create more jobs.\n",
                                    })}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[12px] font-bold text-slate-700 hover:text-slate-900 uppercase tracking-widest"
                                >
                                    Contact Support
                                </a>
                            )}
                        </div>
                    ) : (
                        <Link href="/admin/create-drive">
                            <Button className="bg-orange-600 hover:bg-orange-700 transition-all duration-300 h-12 px-6 font-bold rounded-2xl text-white shadow-lg shadow-orange-600/10">
                                <Plus className="h-5 w-5 mr-2" />
                                New Job
                            </Button>
                        </Link>
                    )}
                </div>
            </div>
            {/* Filters */}
            <div className="bg-white p-3 rounded-[1.75rem] border border-slate-200 shadow-sm">
                <div className="flex flex-col lg:flex-row items-center justify-between gap-6 w-full">
                    <div className="relative flex-1 max-w-2xl w-full group/search">
                        <Search className="absolute left-4 top-3.5 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Search by role or title..."
                            className="pl-11 h-11 border-slate-200 bg-slate-50 rounded-2xl focus:bg-white focus:border-slate-300 focus:ring-4 focus:ring-slate-100 transition-all font-semibold text-sm shadow-inner"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <DateFilter value={timeline} onChange={setTimeline} />
                    </div>
                </div>
            </div>
            {/* Cards Grid */}
            <div className="grid w-full grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoading ? (
                    <div className="col-span-full flex w-full flex-col items-center justify-center py-24 min-h-[320px]">
                        <Loader2 className="h-10 w-10 text-slate-500 animate-spin mb-3" />
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading jobs...</p>
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="col-span-full">
                        <div className="flex flex-col items-center justify-center py-24 px-4">
                            <div className="h-20 w-20 bg-slate-50 text-slate-600 rounded-3xl flex items-center justify-center mb-8 shadow-sm border border-slate-200">
                                <Rocket className="h-10 w-10" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 tracking-tight mb-2">Create your first recruitment job</h3>
                            <p className="text-gray-500 font-medium text-sm mb-10 leading-relaxed max-w-sm text-center">
                                Post a job role to start screening candidates with AI. Upload resumes in bulk and configure screening rules.
                            </p>
                            {driveCreationLocked ? (
                                <div className="flex flex-col items-center gap-3">
                                    <Button disabled className="bg-gray-100 text-gray-400 transition-all duration-300 h-14 px-10 font-bold rounded-2xl border border-gray-200 cursor-not-allowed gap-3">
                                        <Lock className="h-5 w-5" />
                                        {interviewAccessLocked ? "Job Locked" : "Create Locked"}
                                    </Button>
                                    {interviewAccessLocked ? (
                                        <a
                                            href={getSupportComposeUrl({
                                                subject: "Interview quota support request",
                                                body: isSuspended
                                                    ? "Hi support team,\n\nOur account is suspended by Super Admin. Please help us restore access.\n"
                                                    : "Hi support team,\n\nPlease help us restore interview access for our account.\n",
                                            })}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-[12px] font-bold text-slate-700 hover:text-slate-900 uppercase tracking-widest"
                                        >
                                            Contact Support
                                        </a>
                                    ) : (
                                        <a
                                            href={getSupportComposeUrl({
                                                subject: "Upgrade plan request",
                                                body: "Hi support team,\n\nWe would like to upgrade our plan to create more jobs.\n",
                                            })}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-[12px] font-bold text-slate-700 hover:text-slate-900 uppercase tracking-widest"
                                        >
                                            Contact Support
                                        </a>
                                    )}
                                </div>
                            ) : (
                                <Link href="/admin/create-drive">
                                    <Button className="bg-orange-600 hover:bg-orange-700 transition-all duration-300 h-14 px-10 font-bold rounded-2xl text-white shadow-lg shadow-orange-600/10 gap-3 group">
                                        <Plus className="h-5 w-5" />
                                        Create New Job
                                        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                    </Button>
                                </Link>
                            )}
                        </div>
                    </div>
                ) : (
                    jobs.map((drive) => {
                        const applicants = Number(drive.applicants || 0);
                        const createdAt = drive.createdAt ? new Date(drive.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                        }) : "Unknown";
                        const deadlineText = drive.deadline
                            ? new Date(drive.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                            : null;
                        const isExpired = drive.deadline ? new Date(drive.deadline) < new Date() : false;
                        const voice = ALL_VOICES.find(v => v.id === drive.voiceId);
                        const language = drive.interviewLanguage || "English";
                        return (
                            <div key={drive.id} className="group cursor-pointer w-full">
                                <div className="relative h-full flex flex-col rounded-[1.75rem] border border-slate-100 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(15,23,42,0.11)] hover:border-slate-200 overflow-hidden">
                                    {/* Top accent bar */}
                                    <div className="h-1 w-full bg-gradient-to-r from-orange-400 via-orange-500 to-orange-300 rounded-t-[1.75rem]" />
                                    {/* Header */}
                                    <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 border border-orange-100">
                                                <Briefcase className="h-4 w-4 text-orange-500" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Active Job</p>
                                                <h3 className="text-[15px] font-extrabold text-slate-900 tracking-tight leading-snug line-clamp-1 mt-0.5">
                                                    {drive.title}
                                                </h3>
                                            </div>
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl shrink-0 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-[200px] p-2 rounded-2xl bg-white/95 backdrop-blur-2xl border border-slate-200 shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
                                                <DropdownMenuItem
                                                    className="rounded-xl py-2.5 px-3 focus:bg-slate-100 text-slate-700 font-medium text-[13px]"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        router.push(`/admin/create-drive?id=${drive.id}&mode=edit${orgId ? `&orgId=${orgId}` : ""}`);
                                                    }}
                                                >
                                                    <Edit className="h-4 w-4 mr-2" />
                                                    Edit Details
                                                </DropdownMenuItem>
                                                <div className="h-px bg-slate-100 my-1.5 mx-2" />
                                                <DropdownMenuItem
                                                    className="rounded-xl py-2.5 px-3 focus:bg-red-50 text-red-600 font-medium text-[13px]"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDriveToDelete(drive.id);
                                                        setIsDeleteModalOpen(true);
                                                    }}
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                    {/* Role tile */}
                                    <div className="px-5 pb-3">
                                        <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3">
                                            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400 mb-1">Role</p>
                                            <p className="text-[13px] font-semibold text-slate-800 line-clamp-2 leading-snug">
                                                {drive.role || drive.title}
                                            </p>
                                        </div>
                                    </div>
                                    {/* Bento stats grid */}
                                    <div className="px-5 pb-3 flex-1 space-y-2.5">
                                        {/* Row 1: Candidates + Deadline */}
                                        <div className="grid grid-cols-2 gap-2.5">
                                            {/* Candidates tile */}
                                            <div className="rounded-2xl bg-white border border-slate-100 shadow-[0_2px_8px_rgba(15,23,42,0.04)] px-4 py-3 flex flex-col gap-1">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="h-5 w-5 rounded-lg bg-blue-50 flex items-center justify-center">
                                                        <Users className="h-3 w-3 text-blue-500" />
                                                    </div>
                                                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Candidates</p>
                                                </div>
                                                <p className="text-[26px] font-black text-slate-900 leading-none tracking-tight">{applicants}</p>
                                                <p className="text-[9px] font-semibold text-slate-400">Total applied</p>
                                            </div>
                                            {/* Deadline / Created tile */}
                                            <div className="rounded-2xl bg-white border border-slate-100 shadow-[0_2px_8px_rgba(15,23,42,0.04)] px-4 py-3 flex flex-col gap-1">
                                                <div className="flex items-center gap-1.5">
                                                    <div className={`h-5 w-5 rounded-lg flex items-center justify-center ${deadlineText ? (isExpired ? "bg-red-50" : "bg-emerald-50") : "bg-slate-50"}`}>
                                                        <Target className={`h-3 w-3 ${deadlineText ? (isExpired ? "text-red-500" : "text-emerald-500") : "text-slate-400"}`} />
                                                    </div>
                                                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
                                                        {deadlineText ? "Deadline" : "Created"}
                                                    </p>
                                                </div>
                                                <p className={`text-[13px] font-bold leading-tight mt-1 ${deadlineText && isExpired ? "text-red-500" : "text-slate-800"}`}>
                                                    {deadlineText ?? createdAt}
                                                </p>
                                                {deadlineText && (
                                                    <p className="text-[9px] font-semibold text-slate-400">{isExpired ? "Expired" : "Open"}</p>
                                                )}
                                            </div>
                                        </div>
                                        {/* Row 2: Voice + Language */}
                                        <div className="grid grid-cols-2 gap-2.5">
                                            {/* Voice tile */}
                                            <div className="rounded-2xl bg-white border border-slate-100 shadow-[0_2px_8px_rgba(15,23,42,0.04)] px-4 py-3 flex flex-col gap-1">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="h-5 w-5 rounded-lg bg-orange-50 flex items-center justify-center">
                                                        <Mic className="h-3 w-3 text-orange-500" />
                                                    </div>
                                                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Voice</p>
                                                </div>
                                                <p className="text-[13px] font-bold text-slate-800 leading-tight mt-1 truncate">
                                                    {voice?.name ?? "Default"}
                                                </p>
                                                <p className="text-[9px] font-semibold text-slate-400 truncate">{voice?.provider ?? "Cartesia"}</p>
                                            </div>
                                            {/* Language tile */}
                                            <div className="rounded-2xl bg-white border border-slate-100 shadow-[0_2px_8px_rgba(15,23,42,0.04)] px-4 py-3 flex flex-col gap-1">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="h-5 w-5 rounded-lg bg-purple-50 flex items-center justify-center">
                                                        <Globe className="h-3 w-3 text-purple-500" />
                                                    </div>
                                                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Language</p>
                                                </div>
                                                <p className="text-[13px] font-bold text-slate-800 leading-tight mt-1 truncate">
                                                    {language}
                                                </p>
                                                <p className="text-[9px] font-semibold text-slate-400">Interview lang</p>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Footer CTA */}
                                    <div className="px-5 pb-5 pt-1">
                                        <Button
                                            className="w-full h-10 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-[12px] tracking-wide shadow-[0_4px_14px_rgba(15,23,42,0.18)] transition-all duration-200 hover:shadow-[0_8px_20px_rgba(15,23,42,0.22)]"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                router.push(`/admin/candidates/drive/${encodeURIComponent(drive.id)}`);
                                            }}
                                        >
                                            View Candidates
                                            <ArrowUpRight className="ml-2 h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
            {/* Pagination */}
            {!isLoading && jobs.length > 0 && (
                <div className="mt-10 py-6 border-t border-slate-200">
                    <div className="flex items-center justify-center gap-4 mb-6">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-10 px-8 rounded-xl border-slate-200 bg-white text-slate-600 font-bold hover:bg-slate-50 disabled:opacity-30 transition-all"
                            disabled={pagination.page <= 1 || isLoading}
                            onClick={() => handlePageChange(pagination.page - 1)}
                        >
                            <ChevronRight className="h-4 w-4 mr-2 rotate-180" /> Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-10 px-8 rounded-xl border-slate-200 bg-white text-slate-600 font-bold hover:bg-slate-50 disabled:opacity-30 transition-all"
                            disabled={pagination.page >= pagination.totalPages || isLoading}
                            onClick={() => handlePageChange(pagination.page + 1)}
                        >
                            Next <ChevronRight className="h-4 w-4 ml-2" />
                        </Button>
                    </div>
                    <p className="text-center text-[12px] font-medium text-gray-400">
                        Showing <span className="text-gray-900 font-bold">{(pagination.page - 1) * pagination.limit + 1}</span> to <span className="text-gray-900 font-bold">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> of <span className="text-gray-900 font-bold">{pagination.total}</span> jobs
                    </p>
                </div>
            )}
            {/* Delete Modal */}
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
