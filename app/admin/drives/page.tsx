"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/components/ui/toast-custom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Search,
    Filter,
    MoreHorizontal,
    Plus,
    Briefcase,
    Users,
    Trash2,
    Edit,
    Loader2,
    ChevronRight,
    X,
    Upload,
    Settings,
    Lock,
    Rocket
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
import { cn } from "@/lib/utils";
import { ActionConfirmModal } from "@/components/ui/action-confirm-modal";
import { DateFilter, type DateRange } from "@/components/admin/date-filter";
import { getActiveDriveCount, isDriveCreationLocked } from "@/lib/drive-limits";
import Link from "next/link";

export default function DrivesPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const orgId = searchParams.get("orgId");
    const { jobs, pagination, deleteJob, fetchJobs, toggleDriveStatus, organization } = useJobs();
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [orgStatus, setOrgStatus] = useState<string>("ACTIVE");
    const [statusFilter, setStatusFilter] = useState("all");
    const [typeFilter, setTypeFilter] = useState("all");
    const [timeline, setTimeline] = useState<DateRange>({ type: "month" });

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [driveToDelete, setDriveToDelete] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isTogglingStatus, setIsTogglingStatus] = useState(false);
    const [statusModalDrive, setStatusModalDrive] = useState<{ id: string; currentStatus: string } | null>(null);

    useEffect(() => {
        const fetchOrgStatus = async () => {
            try {
                const res = await fetch("/api/admin/organization");
                if (res.ok) {
                    const data = await res.json();
                    setOrgStatus(data.status || "ACTIVE");
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

            fetchJobs(1, pagination.limit, searchQuery, statusFilter, typeFilter, startDate, endDate).finally(() => setIsLoading(false));
        }, 300);

        return () => clearTimeout(handler);
    }, [searchQuery, statusFilter, typeFilter, timeline, pagination.limit]);

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

            fetchJobs(newPage, pagination.limit, searchQuery, statusFilter, typeFilter, startDate, endDate).finally(() => setIsLoading(false));
        }
    };

    const isSuspended = orgStatus === "SUSPENDED" || orgStatus === "CLOSED";
    const activeDriveCount = organization?.activeDriveCount ?? getActiveDriveCount(jobs);
    const driveCreationLocked = isDriveCreationLocked(organization?.maxActiveDrives, activeDriveCount);

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
        <div className="space-y-8 pb-12 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between mb-10">
                <div className="flex items-center gap-5 group">
                    <div className="h-14 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-500 rounded-full shadow-[0_0_15px_rgba(249,115,22,0.4)]" />
                    <div className="space-y-1">
                        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Drives</h1>
                        <div className="flex items-center gap-3">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#F97316] animate-pulse" />
                            <p className="text-gray-400 font-bold text-[12px] uppercase tracking-widest">{pagination.total || 0} Total Campaigns</p>
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
                                New Drive
                            </button>
                            <Link href="/admin/billing" className="text-[12px] font-bold text-[#F97316] hover:text-orange-700 uppercase tracking-widest">
                                Go to Billing
                            </Link>
                        </div>
                    ) : (
                        <Link href="/admin/create-drive">
                            <Button className="bg-gradient-to-r from-[#F97316] to-orange-500 hover:shadow-orange-500/25 hover:shadow-xl transition-all duration-300 h-12 px-6 font-bold rounded-2xl text-white shadow-lg">
                                <Plus className="h-5 w-5 mr-2" />
                                New Drive
                            </Button>
                        </Link>
                    )}
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white/40 backdrop-blur-xl p-3 rounded-[2rem] border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.03)]">
                <div className="flex flex-col lg:flex-row items-center justify-between gap-6 w-full">
                    <div className="relative flex-1 max-w-2xl w-full group/search">
                        <Search className="absolute left-4 top-3.5 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Search by role, department or title..."
                            className="pl-11 h-12 border-transparent bg-white/60 rounded-2xl focus:bg-white focus:border-orange-200 focus:ring-8 focus:ring-orange-50/50 transition-all font-bold text-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <DateFilter value={timeline} onChange={setTimeline} />
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="h-12 min-w-[140px] px-5 border-transparent rounded-2xl bg-white/60 text-gray-500 font-medium">
                                <div className="flex items-center gap-2">
                                    <Filter className="h-4 w-4" />
                                    <SelectValue placeholder="Status" />
                                </div>
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl">
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="ACTIVE">Active</SelectItem>
                                <SelectItem value="CLOSED">Closed</SelectItem>
                                <SelectItem value="EXPIRED">Expired</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                            <SelectTrigger className="h-12 min-w-[140px] px-5 border-transparent rounded-2xl bg-white/60 text-gray-500 font-medium">
                                <SelectValue placeholder="Job Type" />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl">
                                <SelectItem value="all">All Types</SelectItem>
                                <SelectItem value="Full-time">Full-time</SelectItem>
                                <SelectItem value="Internship">Internship</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoading ? (
                    <div className="col-span-full flex flex-col items-center justify-center py-24">
                        <Loader2 className="h-10 w-10 text-orange-500 animate-spin mb-3" />
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading drives...</p>
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="col-span-full">
                        <div className="flex flex-col items-center justify-center py-24 px-4">
                            <div className="h-20 w-20 bg-orange-50 text-orange-500 rounded-3xl flex items-center justify-center mb-8 shadow-sm">
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
                                        Create Locked
                                    </Button>
                                    <Link href="/admin/billing" className="text-[12px] font-bold text-[#F97316] hover:text-orange-700 uppercase tracking-widest">
                                        Go to Billing
                                    </Link>
                                </div>
                            ) : (
                                <Link href="/admin/create-drive">
                                    <Button className="bg-[#F97316] hover:bg-black transition-all duration-300 h-14 px-10 font-bold rounded-2xl text-white shadow-lg shadow-orange-500/20 gap-3 group">
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
                        const effectiveExpired = drive.deadline && new Date(drive.deadline) < new Date();
                        let statusLabel = "Active";
                        let statusColor = "text-green-600";
                        let dotColor = "bg-green-500 animate-pulse";

                        if (drive.status === "CLOSED") {
                            statusLabel = "Closed";
                            statusColor = "text-red-600";
                            dotColor = "bg-red-500";
                        } else if (effectiveExpired) {
                            statusLabel = "Expired";
                            statusColor = "text-orange-600";
                            dotColor = "bg-orange-500";
                        }

                        return (
                            <div
                                key={drive.id}
                                className="group cursor-pointer"
                            >
                                <div className="h-full bg-white/50 backdrop-blur-xl rounded-2xl border border-white/60 shadow-[0_4px_24px_rgba(0,0,0,0.05)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.1)] transition-all duration-300 overflow-hidden hover:border-white/80 flex flex-col">
                                    {/* Card Header */}
                                    <div className="p-6 border-b border-white/20">
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="h-10 w-10 rounded-lg bg-orange-50/80 flex items-center justify-center text-orange-500 border border-orange-100/30 group-hover:scale-110 transition-transform">
                                                <Briefcase className="h-5 w-5" />
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="secondary" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-[200px] p-2 rounded-2xl bg-white/90 backdrop-blur-2xl border border-white/60 shadow-[0_20px_60px_rgba(0,0,0,0.1)]">
                                                    <DropdownMenuItem
                                                        className="rounded-xl py-2.5 px-3 focus:bg-gray-50 text-gray-700 font-medium text-[13px]"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            router.push(`/admin/create-drive?id=${drive.id}${orgId ? `&orgId=${orgId}` : ''}`);
                                                        }}
                                                    >
                                                        <Edit className="h-4 w-4 mr-2" />
                                                        Edit Details
                                                    </DropdownMenuItem>
                                                    <div className="h-px bg-gray-100 my-1.5 mx-2" />
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

                                        <h3 className="text-[16px] font-bold text-gray-900 mb-2 truncate group-hover:text-[#F97316] transition-colors">{drive.title}</h3>
                                        <div className="flex items-center gap-2">
                                            <div className={cn("h-2 w-2 rounded-full", dotColor)} />
                                            <span className={cn("text-[12px] font-bold uppercase tracking-wider", statusColor)}>{statusLabel}</span>
                                        </div>
                                    </div>

                                    {/* Card Body */}
                                    <div className="p-6 space-y-4 flex-1">
                                        <div className="space-y-2">
                                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Role</p>
                                            <p className="text-[14px] font-medium text-gray-700">{drive.role || "Not specified"}</p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Candidates</p>
                                                <p className="text-[18px] font-bold text-gray-900">{drive.applicants || 0}</p>
                                            </div>
                                            <div className="space-y-2">
                                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Deadline</p>
                                                <p className="text-[13px] font-medium text-gray-700">{drive.deadline ? new Date(drive.deadline).toLocaleDateString() : "None"}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Card Footer */}
                                    <div className="p-6 border-t border-white/20 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            size="sm"
                                            className="flex-1 h-10 text-[12px] font-bold rounded-lg bg-[#F97316] hover:bg-orange-600 text-white uppercase tracking-wider gap-2"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                router.push(`/admin/drives/${drive.id}${orgId ? `?orgId=${orgId}` : ''}`);
                                            }}
                                        >
                                            <Briefcase className="h-4 w-4" />
                                            Details
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-10 px-3 text-[12px] font-bold rounded-lg border-gray-200 text-gray-700 uppercase tracking-wider gap-2"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                router.push(`/admin/candidates?driveId=${drive.id}${orgId ? `&orgId=${orgId}` : ''}`);
                                            }}
                                        >
                                            <Users className="h-4 w-4" />
                                            View
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
                <div className="flex items-center justify-between px-4 py-6 border-t border-white/20 bg-white/20 backdrop-blur-xl rounded-2xl">
                    <p className="text-[13px] font-medium text-gray-500">
                        Showing <span className="text-gray-900 font-bold">{(pagination.page - 1) * pagination.limit + 1}</span> to <span className="text-gray-900 font-bold">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> of <span className="text-gray-900 font-bold">{pagination.total}</span> drives
                    </p>
                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-10 px-6 rounded-xl border-white/40 bg-white/40 backdrop-blur-md text-gray-500 font-bold hover:bg-white hover:text-[#F97316] disabled:opacity-30 transition-all"
                            disabled={pagination.page <= 1 || isLoading}
                            onClick={() => handlePageChange(pagination.page - 1)}
                        >
                            <ChevronRight className="h-4 w-4 mr-2 rotate-180" /> Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-10 px-6 rounded-xl border-white/40 bg-white/40 backdrop-blur-md text-gray-500 font-bold hover:bg-white hover:text-[#F97316] disabled:opacity-30 transition-all"
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
