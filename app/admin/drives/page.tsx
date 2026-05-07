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
} from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
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
import { getInterviewQuotaSupportMessage, getSupportComposeUrl, isInterviewQuotaLocked } from "@/lib/interview-quota";
import Link from "next/link";

export default function DrivesPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const orgId = searchParams.get("orgId");
    const { jobs, pagination, deleteJob, fetchJobs, organization } = useJobs();
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [orgStatus, setOrgStatus] = useState<string>("ACTIVE");
    const [typeFilter, setTypeFilter] = useState("all");
    const [timeline, setTimeline] = useState<DateRange>({ type: "month" });

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [driveToDelete, setDriveToDelete] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [quotaLocked, setQuotaLocked] = useState(false);

    useEffect(() => {
        const fetchOrgStatus = async () => {
            try {
                const res = await fetch("/api/admin/organization");
                if (res.ok) {
                    const data = await res.json();
                    setOrgStatus(data.status || "ACTIVE");
                }
                const billingRes = await fetch("/api/admin/credits");
                if (billingRes.ok) {
                    const billing = await billingRes.json();
                    setQuotaLocked(isInterviewQuotaLocked(billing));
                }
            } catch (error) {
                console.error("Failed to fetch organization status:", error);
            }
        };
        fetchOrgStatus();
    }, []);

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

            fetchJobs(1, pagination.limit, searchQuery, "all", typeFilter, startDate, endDate).finally(() => setIsLoading(false));
        }, 300);

        return () => clearTimeout(handler);
    }, [searchQuery, typeFilter, timeline, pagination.limit]);

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

            fetchJobs(newPage, pagination.limit, searchQuery, "all", typeFilter, startDate, endDate).finally(() => setIsLoading(false));
        }
    };

    const isSuspended = orgStatus === "SUSPENDED" || orgStatus === "CLOSED";
    const activeDriveCount = organization?.activeDriveCount ?? getActiveDriveCount(jobs);
    const driveCreationLocked = isDriveCreationLocked(organization?.maxActiveDrives, activeDriveCount) || quotaLocked;

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
                    <div className="h-12 w-1.5 bg-slate-900 rounded-full shadow-[0_0_15px_rgba(15,23,42,0.15)]" />
                    <div className="space-y-1">
                        <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">Drives</h1>
                        <div className="flex items-center gap-3">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" />
                            <p className="text-gray-400 font-bold text-[11px] uppercase tracking-widest">{pagination.total || 0} Total Campaigns</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    {isSuspended ? (
                        <Button disabled className="bg-gray-100/50 border border-gray-200 text-gray-400 h-12 px-6 font-bold rounded-2xl cursor-not-allowed opacity-70">
                            <Lock className="h-4 w-4 mr-2" />
                            New Drive
                        </Button>
                    ) : driveCreationLocked ? (
                        <div className="flex items-center gap-3">
                            <button disabled className="bg-gray-100 text-gray-400 border border-gray-200 h-12 px-6 font-bold rounded-2xl cursor-not-allowed opacity-70 flex items-center gap-2">
                                <Lock className="h-4 w-4" />
                                {quotaLocked ? "Drive Locked" : "New Drive"}
                            </button>
                            {quotaLocked ? (
                                <a
                                    href={getSupportComposeUrl({
                                        subject: "Interview quota support request",
                                        body: "Hi support team,\n\nPlease help us restore interview access for our account.\n",
                                    })}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[12px] font-bold text-slate-700 hover:text-slate-900 uppercase tracking-widest"
                                >
                                    Contact Support
                                </a>
                            ) : (
                                <Link href="/admin/billing" className="text-[12px] font-bold text-slate-700 hover:text-slate-900 uppercase tracking-widest">
                                    Go to Billing
                                </Link>
                            )}
                        </div>
                    ) : (
                        <Link href="/admin/create-drive">
                            <Button className="bg-slate-950 hover:bg-slate-800 transition-all duration-300 h-12 px-6 font-bold rounded-2xl text-white shadow-lg shadow-slate-900/10">
                                <Plus className="h-5 w-5 mr-2" />
                                New Drive
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
                            placeholder="Search by role, department or title..."
                            className="pl-11 h-11 border-slate-200 bg-slate-50 rounded-2xl focus:bg-white focus:border-slate-300 focus:ring-4 focus:ring-slate-100 transition-all font-semibold text-sm shadow-inner"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <DateFilter value={timeline} onChange={setTimeline} />
                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                            <SelectTrigger className="h-11 min-w-[140px] px-5 border-slate-200 rounded-2xl bg-slate-50 text-slate-600 font-medium shadow-inner">
                                <SelectValue placeholder="Job Type" />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-slate-200">
                                <SelectItem value="all">All Types</SelectItem>
                                <SelectItem value="Full-time">Full-time</SelectItem>
                                <SelectItem value="Internship">Internship</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Cards Grid */}
            <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[repeat(2,480px)] justify-start">
                {isLoading ? (
                    <div className="col-span-full flex w-full flex-col items-center justify-center py-24 min-h-[320px]">
                        <Loader2 className="h-10 w-10 text-slate-500 animate-spin mb-3" />
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading drives...</p>
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="col-span-full">
                        <div className="flex flex-col items-center justify-center py-24 px-4">
                            <div className="h-20 w-20 bg-slate-50 text-slate-600 rounded-3xl flex items-center justify-center mb-8 shadow-sm border border-slate-200">
                                <Rocket className="h-10 w-10" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 tracking-tight mb-2">Create your first recruitment drive</h3>
                            <p className="text-gray-500 font-medium text-sm mb-10 leading-relaxed max-w-sm text-center">
                                Post a job role to start screening candidates with AI. Upload resumes in bulk and configure screening rules.
                            </p>
                            {driveCreationLocked ? (
                                <div className="flex flex-col items-center gap-3">
                                    <Button disabled className="bg-gray-100 text-gray-400 transition-all duration-300 h-14 px-10 font-bold rounded-2xl border border-gray-200 cursor-not-allowed gap-3">
                                        <Lock className="h-5 w-5" />
                                        {quotaLocked ? "Drive Locked" : "Create Locked"}
                                    </Button>
                                    {quotaLocked ? (
                                        <a
                                            href={getSupportComposeUrl({
                                                subject: "Interview quota support request",
                                                body: "Hi support team,\n\nPlease help us restore interview access for our account.\n",
                                            })}
                                            target="_blank"
                                            rel="noreferrer"
                                        className="text-[12px] font-bold text-slate-700 hover:text-slate-900 uppercase tracking-widest"
                                        >
                                            Contact Support
                                        </a>
                                    ) : (
                                        <Link href="/admin/billing" className="text-[12px] font-bold text-slate-700 hover:text-slate-900 uppercase tracking-widest">
                                            Go to Billing
                                        </Link>
                                    )}
                                </div>
                            ) : (
                                <Link href="/admin/create-drive">
                                    <Button className="bg-slate-950 hover:bg-slate-800 transition-all duration-300 h-14 px-10 font-bold rounded-2xl text-white shadow-lg shadow-slate-900/10 gap-3 group">
                                        <Plus className="h-5 w-5" />
                                        Create New Drive
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

                        return (
                            <div
                                key={drive.id}
                                className="group cursor-pointer w-full"
                            >
                                <div className="relative h-full overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_18px_44px_rgba(15,23,42,0.10)] flex flex-col">
                                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900" />

                                    {/* Card Header */}
                                    <div className="relative p-4 pb-3.5">
                                        <div className="mb-4 flex items-start justify-between gap-3">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 shadow-[0_6px_20px_rgba(15,23,42,0.06)] transition-transform group-hover:scale-105">
                                                <Briefcase className="h-4.5 w-4.5" />
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="secondary" size="icon" className="h-8.5 w-8.5 rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:text-slate-800">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-[220px] p-2 rounded-2xl bg-white/95 backdrop-blur-2xl border border-slate-200 shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
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

                                        <h3 className="text-[16px] font-extrabold leading-snug tracking-tight text-slate-950 mb-2 line-clamp-2 group-hover:text-slate-700 transition-colors">
                                            {drive.title}
                                        </h3>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                Drive
                                            </span>
                                        </div>
                                    </div>

                                    {/* Card Body */}
                                    <div className="relative px-4 pb-3.5 space-y-3 flex-1">
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400 mb-1.5">Role</p>
                                            <p className="text-[12px] font-semibold text-slate-800 leading-relaxed line-clamp-2">
                                                {drive.role || "Not specified"}
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2.5">
                                            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_2px_10px_rgba(15,23,42,0.03)]">
                                                <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.22em] text-slate-400 mb-1.5">
                                                    <Users className="h-3 w-3 text-slate-500" />
                                                    Candidates
                                                </div>
                                                <p className="text-[20px] font-black text-slate-950 leading-none">{applicants}</p>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_2px_10px_rgba(15,23,42,0.03)]">
                                                <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.22em] text-slate-400 mb-1.5">
                                                    <Target className="h-3 w-3 text-slate-500" />
                                                    Created
                                                </div>
                                                <p className="text-[13px] font-bold text-slate-800 leading-tight">
                                                    {createdAt}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Card Footer */}
                                    <div className="relative p-4 pt-0 mt-auto">
                                        <div className="mb-3 h-px bg-gradient-to-r from-slate-200 via-slate-100 to-transparent" />
                                        <div className="grid grid-cols-1 gap-3">
                                            <Button
                                                size="sm"
                                                className="h-9 rounded-xl bg-slate-950 text-white font-bold shadow-[0_10px_20px_rgba(15,23,42,0.14)] transition-all hover:bg-slate-800 hover:shadow-[0_14px_30px_rgba(15,23,42,0.18)] text-[13px]"
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
                            </div>
                        );
                    })
                )}
            </div>

            {/* Pagination */}
            {!isLoading && jobs.length > 0 && (
                <div className="flex items-center justify-between px-4 py-6 border-t border-slate-200 bg-white rounded-2xl shadow-sm">
                    <p className="text-[13px] font-medium text-gray-500">
                        Showing <span className="text-gray-900 font-bold">{(pagination.page - 1) * pagination.limit + 1}</span> to <span className="text-gray-900 font-bold">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> of <span className="text-gray-900 font-bold">{pagination.total}</span> drives
                    </p>
                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-10 px-6 rounded-xl border-slate-200 bg-white text-slate-500 font-bold hover:bg-slate-50 hover:text-slate-900 disabled:opacity-30 transition-all"
                            disabled={pagination.page <= 1 || isLoading}
                            onClick={() => handlePageChange(pagination.page - 1)}
                        >
                            <ChevronRight className="h-4 w-4 mr-2 rotate-180" /> Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-10 px-6 rounded-xl border-slate-200 bg-white text-slate-500 font-bold hover:bg-slate-50 hover:text-slate-900 disabled:opacity-30 transition-all"
                            disabled={pagination.page >= pagination.totalPages || isLoading}
                            onClick={() => handlePageChange(pagination.page + 1)}
                        >
                            Next <ChevronRight className="h-4 w-4 ml-2" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Delete Modal */}
            <ActionConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Drive"
                description="Are you sure you want to delete this drive? This will permanently remove all candidates and data."
                confirmText="Confirm Delete"
                isLoading={isDeleting}
            />
        </div>
    );
}
