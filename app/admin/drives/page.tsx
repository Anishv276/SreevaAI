"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/components/ui/toast-custom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Search,
    Filter,
    MoreHorizontal,
    Plus,
    Briefcase,
    Users,
    Calendar,
    Trash2,
    Edit,
    Eye,
    Loader2,
    ChevronRight,
    X,
    ExternalLink,
    Copy,
    CheckCircle2,
    DollarSign,
    Clock,
    MapPin,
    AlertCircle,
    FileText,
    Laptop,
    Check,
    Link as LinkIcon,
    Bot,
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import { useJobs } from "@/context/jobs-context";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ActionConfirmModal } from "@/components/ui/action-confirm-modal";
import { motion, AnimatePresence } from "framer-motion";
import { DateFilter, type DateRange } from "@/components/admin/date-filter";

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
};

const item = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    show: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: {
            ease: [0.16, 1, 0.3, 1] as any,
            duration: 0.8
        }
    }
};

export default function DrivesPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const orgId = searchParams.get("orgId");
    const { jobs, pagination, deleteJob, fetchJobs, toggleDriveStatus, bulkDeleteJobs } = useJobs();
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Organization Status
    const [orgStatus, setOrgStatus] = useState<string>("ACTIVE");
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
    const isSuspended = orgStatus === "SUSPENDED" || orgStatus === "CLOSED";

    // Filters State
    const [statusFilter, setStatusFilter] = useState("all");
    const [typeFilter, setTypeFilter] = useState("all");
    const [timeline, setTimeline] = useState<DateRange>({ type: "month" });

    // Detailed View State
    const [previewDriveId, setPreviewDriveId] = useState<string | null>(null);
    const [copySuccess, setCopySuccess] = useState(false);

    // Modal State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [driveToDelete, setDriveToDelete] = useState<string | null>(null);
    const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Status Toggle Modal
    const [statusModalDrive, setStatusModalDrive] = useState<{ id: string; currentStatus: string } | null>(null);
    const [isTogglingStatus, setIsTogglingStatus] = useState(false);

    // Fresh Data for Preview
    const [freshDriveDetails, setFreshDriveDetails] = useState<any>(null);
    const [isFetchingFresh, setIsFetchingFresh] = useState(false);

    // Candidate Portal Preview Modal
    const [candidatePreviewSlug, setCandidatePreviewSlug] = useState<string | null>(null);

    const cachedDrive = jobs.find(j => j.id === previewDriveId);
    const selectedDrive = freshDriveDetails && freshDriveDetails.id === previewDriveId
        ? freshDriveDetails
        : cachedDrive;

    // Fetch fresh data when preview is opened
    useEffect(() => {
        if (!previewDriveId) {
            setFreshDriveDetails(null);
            return;
        }

        const fetchFresh = async () => {
            // Only show full-screen overlay if we don't have job data yet
            setIsFetchingFresh(true);
            try {
                const res = await fetch(`/api/drives/${previewDriveId}`);
                if (res.ok) {
                    const data = await res.json();
                    setFreshDriveDetails(data);
                }
            } catch (err) {
                console.error("Failed to fetch fresh drive details:", err);
            } finally {
                setIsFetchingFresh(false);
            }
        };

        fetchFresh();
    }, [previewDriveId]);

    // Initial load and Filter Sync
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
        }, 300); // 300ms Search Debounce

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

    const handleDelete = async (id: string) => {
        setDriveToDelete(id);
        setIsDeleteModalOpen(true);
    };

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

    const filteredDrives = jobs;

    const toggleSelection = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredDrives.length && filteredDrives.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredDrives.map(drive => drive.id)));
        }
    };

    const handleBulkDelete = async () => {
        if (!isSelectionMode) {
            setIsSelectionMode(true);
            return;
        }

        if (selectedIds.size === 0) {
            setIsSelectionMode(false);
            return;
        }

        setIsBulkDeleteModalOpen(true);
    };

    const confirmBulkDelete = async () => {
        setIsDeleting(true);
        try {
            await bulkDeleteJobs(Array.from(selectedIds));
            setSelectedIds(new Set());
            setIsSelectionMode(false);
            setIsBulkDeleteModalOpen(false);
        } catch (error) {
            toast.error("Failed to delete drives");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-8 pb-12 animate-in fade-in duration-700 font-sans">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between mb-10">
                <div className="flex items-center gap-5 group">
                    <div className="h-14 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-500 rounded-full shadow-[0_0_15px_rgba(249,115,22,0.4)] transition-all duration-500 group-hover:h-16" />
                    <div className="space-y-1">
                        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
                            Drives
                        </h1>
                        <div className="flex items-center gap-3">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#F97316] animate-pulse" />
                            <p className="text-gray-400 font-bold text-[12px] uppercase tracking-widest">
                                {pagination.total || 0} Total Campaigns
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                    <Button
                        variant="outline"
                        onClick={handleBulkDelete}
                        className={cn(
                            "h-12 px-6 rounded-2xl font-bold transition-all flex items-center gap-2 border-white/40 bg-white/40 backdrop-blur-md shadow-sm",
                            isSelectionMode ? "bg-red-50 text-red-600 border-red-200" : "text-gray-500 hover:text-red-600 hover:border-red-100"
                        )}
                    >
                        {isSelectionMode ? (
                            selectedIds.size > 0 ? `Delete (${selectedIds.size})` : "Cancel"
                        ) : (
                            <><Trash2 className="h-4 w-4" /> Delete</>
                        )}
                    </Button>
                    {isSuspended ? (
                        <Button
                            disabled
                            className="bg-gray-100/50 hover:bg-gray-100/50 border border-gray-200 text-gray-400 h-12 px-6 font-bold rounded-2xl cursor-not-allowed opacity-70"
                            title="Action disabled: Organization restricted"
                        >
                            <Lock className="h-4 w-4 mr-2" />
                            New Drive
                        </Button>
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
            <div className="bg-white/40 backdrop-blur-xl p-3 rounded-[2rem] border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.03)] transition-all duration-700 hover:shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
                <div className="flex flex-col lg:flex-row items-center justify-between gap-6 w-full">
                    <div className="relative flex-1 max-w-2xl w-full group/search">
                        <Search className="absolute left-4 top-3.5 h-4 w-4 text-gray-400 group-focus-within/search:text-[#F97316] transition-colors" />
                        <Input
                            placeholder="Search by role, department or title..."
                            className="pl-11 h-12 border-transparent bg-white/60 rounded-2xl focus:bg-white focus:border-orange-200 focus:ring-8 focus:ring-orange-50/50 transition-all font-bold text-sm shadow-inner"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-4 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 no-scrollbar">
                        <DateFilter
                            value={timeline}
                            onChange={setTimeline}
                        />

                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="h-12 min-w-[140px] px-5 border-transparent rounded-2xl bg-white/60 text-gray-500 font-medium transition-all shadow-inner">
                                <div className="flex items-center gap-2">
                                    <Filter className="h-4 w-4" />
                                    <SelectValue placeholder="Status" />
                                </div>
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-gray-100 shadow-2xl">
                                <SelectItem value="all" className="rounded-xl font-bold uppercase text-[10px] tracking-widest">All Status</SelectItem>
                                <SelectItem value="ACTIVE" className="rounded-xl font-bold uppercase text-[10px] tracking-widest text-green-600">Active</SelectItem>
                                <SelectItem value="CLOSED" className="rounded-xl font-bold uppercase text-[10px] tracking-widest text-red-500">Closed</SelectItem>
                                <SelectItem value="EXPIRED" className="rounded-xl font-bold uppercase text-[10px] tracking-widest text-orange-500">Expired</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                            <SelectTrigger className="h-12 min-w-[140px] px-5 border-transparent rounded-2xl bg-white/60 text-gray-500 font-medium transition-all shadow-inner">
                                <SelectValue placeholder="Job Type" />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-gray-100 shadow-2xl">
                                <SelectItem value="all" className="rounded-xl font-bold uppercase text-[10px] tracking-widest">All Types</SelectItem>
                                <SelectItem value="Full-time" className="rounded-xl font-bold uppercase text-[10px] tracking-widest text-blue-600">Full-time</SelectItem>
                                <SelectItem value="Internship" className="rounded-xl font-bold uppercase text-[10px] tracking-widest text-purple-600">Internship</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Drives List View */}
            <div className="group relative bg-white/40 backdrop-blur-xl rounded-[2.5rem] border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.03)] overflow-hidden transition-all duration-700 hover:shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
                {/* Decorative top accent */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-400/0 via-[#F97316]/40 to-orange-400/0" />

                <div className="relative w-full overflow-auto">
                    <Table>
                        <TableHeader className="bg-gray-50/50">
                            <TableRow className="border-b border-gray-100 hover:bg-transparent">
                                <TableHead className="w-[60px] pl-8 font-bold uppercase tracking-wider text-[11px] text-gray-500">#</TableHead>
                                {isSelectionMode && (
                                    <TableHead className="w-[50px]">
                                        <Checkbox
                                            checked={selectedIds.size === filteredDrives.length && filteredDrives.length > 0}
                                            onCheckedChange={toggleSelectAll}
                                        />
                                    </TableHead>
                                )}
                                <TableHead className={cn("w-[220px] h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500", !isSelectionMode && "pl-4")}>Drive / Campaign</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Role</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Deadline</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Status</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Candidates</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Details</TableHead>
                                <TableHead className="text-right pr-8 h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500">More</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="[&_tr:last-child]:border-0">
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={isSelectionMode ? 9 : 8} className="py-20 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <Loader2 className="h-10 w-10 text-orange-500 animate-spin" />
                                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Synchronizing recruitment drives...</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                             ) : filteredDrives.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={isSelectionMode ? 9 : 8} className="py-24 text-center">
                                        <div className="flex flex-col items-center max-w-sm mx-auto">
                                            <div className="h-20 w-20 bg-orange-50 text-orange-500 rounded-3xl flex items-center justify-center mb-8 shadow-sm">
                                                <Rocket className="h-10 w-10" />
                                            </div>
                                            <h3 className="text-2xl font-bold text-gray-900 tracking-tight mb-2">Create your first recruitment drive</h3>
                                            <p className="text-gray-500 font-medium text-sm mb-10 leading-relaxed">
                                                Post a job role to start screening candidates with AI. You can customize the interview flow and evaluation criteria.
                                            </p>
                                            <Link href="/admin/create-drive">
                                                <Button className="bg-[#F97316] hover:bg-black transition-all duration-300 h-14 px-10 font-bold rounded-2xl text-white shadow-lg shadow-orange-500/20 gap-3 group">
                                                    <Plus className="h-5 w-5" />
                                                    <span>Create New Drive</span>
                                                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                                </Button>
                                            </Link>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredDrives.map((drive, index) => {
                                    // Status Logic: ACTIVE, CLOSED, EXPIRED
                                    // CLOSED = manually closed; EXPIRED = deadline passed; ACTIVE = otherwise
                                    const effectiveExpired = drive.deadline && new Date(drive.deadline) < new Date();
                                    let statusLabel = "Active";
                                    let statusColor = "text-green-600";
                                    let dotColor = "bg-green-500 animate-pulse";
                                    let statusBadgeBg = "bg-green-50/50";
                                    let statusBadgeBorder = "border-green-100/50";

                                    if (drive.status === "CLOSED") {
                                        statusLabel = "Closed";
                                        statusColor = "text-red-600";
                                        dotColor = "bg-red-500";
                                        statusBadgeBg = "bg-red-50";
                                        statusBadgeBorder = "border-red-100";
                                    } else if (effectiveExpired) {
                                        statusLabel = "Expired";
                                        statusColor = "text-orange-600";
                                        dotColor = "bg-orange-500";
                                        statusBadgeBg = "bg-orange-50";
                                        statusBadgeBorder = "border-orange-100";
                                    }

                                    return (
                                        <TableRow
                                            key={drive.id}
                                            onClick={() => isSelectionMode && toggleSelection(drive.id)}
                                            className={cn(
                                                "group border-b border-white/20 hover:bg-white/40 transition-all duration-500",
                                                isSelectionMode && "cursor-pointer",
                                                selectedIds.has(drive.id) && "bg-orange-50/30"
                                            )}
                                        >
                                            <TableCell className="pl-8 py-5 text-[12px] font-bold text-gray-400 tabular-nums">
                                                {index + 1 + (pagination.page - 1) * pagination.limit}
                                            </TableCell>
                                            {isSelectionMode && (
                                                <TableCell className="py-5">
                                                    <Checkbox
                                                        checked={selectedIds.has(drive.id)}
                                                        onCheckedChange={() => toggleSelection(drive.id)}
                                                    />
                                                </TableCell>
                                            )}
                                            <TableCell className={cn("py-5", !isSelectionMode && "pl-4")}>
                                                <div className="flex flex-col">
                                                    <span className="text-gray-900 font-bold text-[15px] leading-tight transition-colors">{drive.title}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-5 text-center">
                                                <Badge variant="secondary" className="px-3 py-1 rounded-lg bg-gray-50/50 text-gray-700 text-[11px] font-bold uppercase tracking-wider border border-gray-100/30">
                                                    {drive.role || "Not Specified"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-5 text-center">
                                                <div className="flex flex-col items-center">
                                                    <span className={cn(
                                                        "text-[12px] font-bold tracking-tight",
                                                        effectiveExpired ? "text-red-500" : "text-gray-700"
                                                    )}>
                                                        {drive.deadline ? new Date(drive.deadline).toLocaleDateString() : "No Deadline"}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mt-1">Due Date</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-5 text-center">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <button
                                                            className={cn(
                                                                "flex items-center gap-2.5 px-4 py-2 rounded-xl border-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer mx-auto shadow-sm",
                                                                statusBadgeBg === "bg-green-50/50" ? "bg-green-50 border-green-200" :
                                                                    statusBadgeBg === "bg-red-50" ? "bg-red-50 border-red-200" :
                                                                        "bg-orange-50 border-orange-200"
                                                            )}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <div className={cn("h-2 w-2 rounded-full", dotColor)} />
                                                            <span className={cn("text-[11px] font-inter font-bold uppercase tracking-wider", statusColor)}>
                                                                {statusLabel}
                                                            </span>
                                                        </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="center" className="w-52 p-2 rounded-2xl shadow-xl border-gray-100 bg-white/95 backdrop-blur-xl">
                                                        <div className="px-3 py-2 border-b border-gray-50 mb-1">
                                                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Change Status</p>
                                                        </div>
                                                        <DropdownMenuItem
                                                            className={cn(
                                                                "rounded-xl px-3 py-2.5 font-bold text-xs cursor-pointer gap-2",
                                                                statusLabel === "Active" ? "bg-green-50 text-green-700" : "text-gray-600 hover:bg-gray-50"
                                                            )}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (statusLabel !== "Active") setStatusModalDrive({ id: drive.id, currentStatus: statusLabel === "Expired" ? "Expired" : "Closed" });
                                                            }}
                                                        >
                                                            <div className={cn("h-1.5 w-1.5 rounded-full", statusLabel === "Active" ? "bg-green-500" : "bg-gray-300")} />
                                                            Mark as Live (Active)
                                                            {statusLabel === "Active" && <Check className="ml-auto h-3.5 w-3.5" />}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            className={cn(
                                                                "rounded-xl px-3 py-2.5 font-bold text-xs cursor-pointer gap-2",
                                                                statusLabel === "Closed" ? "bg-red-50 text-red-700" : "text-gray-600 hover:bg-gray-50"
                                                            )}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (statusLabel !== "Closed") setStatusModalDrive({ id: drive.id, currentStatus: "Active" });
                                                            }}
                                                        >
                                                            <div className={cn("h-1.5 w-1.5 rounded-full", statusLabel === "Closed" ? "bg-red-500" : "bg-gray-300")} />
                                                            Mark as Closed
                                                            {statusLabel === "Closed" && <Check className="ml-auto h-3.5 w-3.5" />}
                                                        </DropdownMenuItem>

                                                        {statusLabel === "Expired" && (
                                                            <>
                                                                <div className="h-px bg-gray-50 my-1 mx-2" />
                                                                <DropdownMenuItem
                                                                    className="rounded-xl px-3 py-2.5 text-orange-600 font-bold text-xs cursor-pointer focus:bg-orange-50 focus:text-orange-700 gap-2"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setStatusModalDrive({ id: drive.id, currentStatus: "Expired" });
                                                                    }}
                                                                >
                                                                    <Clock className="h-3.5 w-3.5" />
                                                                    Extend Deadline
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                            <TableCell className="py-5 text-center">
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    className="h-9 px-4 rounded-xl text-blue-600 hover:bg-blue-50 font-bold text-[11px] uppercase tracking-widest gap-2 group/btn transition-all mx-auto"
                                                    onClick={() => {
                                                        if (isSelectionMode) return;
                                                        router.push(`/admin/candidates?driveId=${drive.id}${orgId ? `&orgId=${orgId}` : ''}`);
                                                    }}
                                                >
                                                    <Users className="h-4 w-4" />
                                                    Candidates ({drive.applicants || 0})
                                                </Button>
                                            </TableCell>

                                            <TableCell className="py-5 text-center">
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    className="h-9 px-4 rounded-xl text-[#F97316] hover:bg-orange-50 font-bold text-[11px] uppercase tracking-widest gap-2 group/btn transition-all mx-auto"
                                                    onClick={() => {
                                                        if (isSelectionMode) return;
                                                        setPreviewDriveId(drive.id);
                                                    }}
                                                >
                                                    Details
                                                    <ChevronRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                                                </Button>
                                            </TableCell>

                                            <TableCell className="py-5 pr-8 text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="secondary" size="icon" className="h-9 w-9 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-[240px] p-2 rounded-[24px] bg-white/90 backdrop-blur-2xl border border-white/60 shadow-[0_20px_60px_rgba(0,0,0,0.1)] z-[60] animate-in fade-in zoom-in-95 duration-200 font-inter">
                                                        <div className="px-3 pt-2 pb-3 mb-1">
                                                            <p className="text-[11px] font-bold text-gray-400/80 uppercase tracking-widest pl-1">Quick Actions</p>
                                                        </div>
                                                        <DropdownMenuItem
                                                            className="cursor-pointer rounded-2xl py-2.5 px-3 focus:bg-gray-50/80 text-gray-700 focus:text-gray-900 font-medium text-[14px] leading-none transition-all duration-200 group flex items-center"
                                                            onClick={() => setCandidatePreviewSlug(drive.slug || drive.id)}
                                                        >
                                                            <div className="mr-3.5 h-8 w-8 rounded-xl bg-gray-50 border border-gray-100 text-gray-400 group-hover:bg-white group-hover:text-[#F97316] group-focus:border-orange-100/50 group-hover:shadow-sm flex items-center justify-center transition-all duration-200">
                                                                <Eye className="h-4 w-4" />
                                                            </div>
                                                            Preview Portal
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            className="cursor-pointer rounded-2xl py-2.5 px-3 focus:bg-gray-50/80 text-gray-700 focus:text-gray-900 font-medium text-[14px] leading-none transition-all duration-200 group flex items-center mt-1"
                                                            onClick={() => router.push(`/admin/create-drive?id=${drive.id}${orgId ? `&orgId=${orgId}` : ''}`)}
                                                        >
                                                            <div className="mr-3.5 h-8 w-8 rounded-xl bg-gray-50 border border-gray-100 text-gray-400 group-hover:bg-white group-hover:text-[#F97316] group-focus:border-orange-100/50 group-hover:shadow-sm flex items-center justify-center transition-all duration-200">
                                                                <Edit className="h-4 w-4" />
                                                            </div>
                                                            Edit Details
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            className="cursor-pointer rounded-2xl py-2.5 px-3 focus:bg-gray-50/80 text-gray-700 focus:text-gray-900 font-medium text-[14px] leading-none transition-all duration-200 group flex items-center mt-1"
                                                            onClick={async () => {
                                                                const link = `${window.location.origin}/careers/jobs/${drive.slug || drive.id}`;
                                                                await navigator.clipboard.writeText(link);
                                                                toast.success("Link copied!");
                                                            }}
                                                        >
                                                            <div className="mr-3.5 h-8 w-8 rounded-xl bg-gray-50 border border-gray-100 text-gray-400 group-hover:bg-white group-hover:text-[#F97316] group-focus:border-orange-100/50 group-hover:shadow-sm flex items-center justify-center transition-all duration-200">
                                                                <LinkIcon className="h-4 w-4" />
                                                            </div>
                                                            Copy Link
                                                        </DropdownMenuItem>
                                                        <div className="h-px bg-gray-100/80 my-2 mx-3" />
                                                        <DropdownMenuItem
                                                            className="cursor-pointer rounded-2xl py-2.5 px-3 focus:bg-red-50/50 text-red-600 focus:text-red-700 font-medium text-[14px] leading-none transition-all duration-200 group flex items-center"
                                                            onClick={() => handleDelete(drive.id)}
                                                        >
                                                            <div className="mr-3.5 h-8 w-8 rounded-xl bg-red-50 border border-red-100/50 text-red-400 group-hover:bg-white group-hover:text-red-600 group-hover:border-red-200 group-hover:shadow-sm flex items-center justify-center transition-all duration-200">
                                                                <Trash2 className="h-4 w-4" />
                                                            </div>
                                                            Delete Drive
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Pagination Footer */}
                <div className="flex items-center justify-between px-8 py-6 border-t border-white/20 bg-white/10">
                    <p className="text-[13px] font-medium text-gray-500">
                        Showing <span className="text-gray-900 font-bold">{(pagination.page - 1) * pagination.limit + 1}</span> to <span className="text-gray-900 font-bold">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> of <span className="text-gray-900 font-bold">{pagination.total}</span> drives
                    </p>
                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-10 px-6 rounded-xl border-white/40 bg-white/40 backdrop-blur-md text-gray-500 font-bold hover:bg-white hover:text-[#F97316] disabled:opacity-30 transition-all shadow-sm"
                            disabled={pagination.page <= 1 || isLoading}
                            onClick={() => handlePageChange(pagination.page - 1)}
                        >
                            <ChevronRight className="h-4 w-4 mr-2 rotate-180" /> Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-10 px-6 rounded-xl border-white/40 bg-white/40 backdrop-blur-md text-gray-500 font-bold hover:bg-white hover:text-[#F97316] disabled:opacity-30 transition-all shadow-sm"
                            disabled={pagination.page >= pagination.totalPages || isLoading}
                            onClick={() => handlePageChange(pagination.page + 1)}
                        >
                            Next <ChevronRight className="h-4 w-4 ml-2" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Premium Job Details Modal Popup */}
            {selectedDrive && (
                <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 sm:p-6">
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-300"
                        onClick={() => setPreviewDriveId(null)}
                    />
                    <div
                        className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-[3rem] shadow-[0_32px_120px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col animate-in-zoom"
                    >
                        {/* Modal Header */}
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
                            <div className="flex items-center gap-5">
                                <div className="h-12 w-12 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 border border-gray-100">
                                    <Briefcase className="h-6 w-6" />
                                </div>
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-xl font-bold text-gray-900 tracking-tight">{selectedDrive.title}</h2>
                                        <div className={cn(
                                            "h-5 px-2 rounded-md font-inter font-bold text-[9px] uppercase tracking-wider flex items-center border",
                                            selectedDrive.status === "CLOSED" ? "bg-red-50 text-red-500 border-red-100" :
                                                (selectedDrive.deadline && new Date(selectedDrive.deadline) < new Date()) ? "bg-orange-50 text-orange-500 border-orange-100" :
                                                    "bg-green-50 text-green-600 border-green-100"
                                        )}>
                                            {selectedDrive.status === "CLOSED" ? "Closed" :
                                                (selectedDrive.deadline && new Date(selectedDrive.deadline) < new Date()) ? "Expired" : "Active"}
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{selectedDrive.role || "Job Description"} • {selectedDrive.department || "General"}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setPreviewDriveId(null)}
                                className="h-10 w-10 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-50 transition-colors border border-gray-100"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="flex-1 overflow-y-auto p-10 space-y-12 custom-scrollbar bg-white">
                            {isFetchingFresh && (
                                <div className="absolute top-8 right-24 z-50">
                                    <div className="bg-white/90 backdrop-blur-sm border border-gray-100 rounded-full px-4 py-1.5 flex items-center gap-2 shadow-sm">
                                        <Loader2 className="h-3 w-3 text-orange-500 animate-spin" />
                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Syncing...</span>
                                    </div>
                                </div>
                            )}

                            {/* Section 1: Job Metadata (Simple) */}
                            <div className="flex flex-wrap gap-x-12 gap-y-6">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Work Mode</p>
                                    <p className="text-[16px] font-bold text-gray-900">{selectedDrive.workMode || "Not specified"}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Location</p>
                                    <p className="text-[16px] font-bold text-gray-900">{selectedDrive.location || ""}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Expected Salary</p>
                                    <p className="text-[16px] font-bold text-gray-900">{selectedDrive.salary || "As per policy"}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Experience</p>
                                    <p className="text-[16px] font-bold text-gray-900">{selectedDrive.experience || "Not specified"}</p>
                                </div>
                            </div>

                            {/* Section 2: Public Job Link (Simple) */}
                            <div className="space-y-4 pt-6 border-t border-gray-50">
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em]">Application Link</p>
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <div className="flex-1 bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 flex items-center overflow-hidden">
                                        <span className="text-sm font-medium text-gray-500 truncate select-all">
                                            {`${typeof window !== 'undefined' ? window.location.origin : ''}/careers/jobs/${selectedDrive.slug || selectedDrive.id}`}
                                        </span>
                                    </div>
                                    <Button
                                        variant="outline"
                                        className="h-auto py-4 px-8 rounded-2xl border-gray-200 text-gray-900 hover:bg-gray-50 font-bold text-xs gap-2 transition-all active:scale-95 shadow-sm"
                                        onClick={async () => {
                                            const link = `${window.location.origin}/careers/jobs/${selectedDrive.slug || selectedDrive.id}`;
                                            await navigator.clipboard.writeText(link);
                                            setCopySuccess(true);
                                            setTimeout(() => setCopySuccess(false), 2000);
                                        }}
                                    >
                                        {copySuccess ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-gray-400" />}
                                        {copySuccess ? "Copied" : "Copy Link"}
                                    </Button>
                                </div>
                            </div>

                            {/* Section 3: Job Description */}
                            <div className="space-y-6 pt-8 border-t border-gray-100 w-full">
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em]">About the Role</p>
                                <div className="text-[16px] font-medium text-gray-600 leading-relaxed whitespace-pre-wrap w-full">
                                    {selectedDrive.description}
                                </div>
                            </div>

                            {/* Section 4: Responsibilities */}
                            {selectedDrive.responsibilities && (
                                <div className="space-y-6 pt-6 border-t border-gray-50">
                                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em]">Key Responsibilities</p>
                                    <ul className="space-y-4">
                                        {selectedDrive.responsibilities.split('\n').map((line: string, i: number) => line.trim() && (
                                            <li key={i} className="flex gap-4">
                                                <div className="h-2 w-2 rounded-full bg-gray-200 mt-2 shrink-0" />
                                                <span className="text-[15px] text-gray-600 font-medium leading-relaxed">{line.trim()}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Section 5: Skills */}
                            {selectedDrive.skills && (
                                <div className="space-y-6 pt-6 border-t border-gray-50">
                                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em]">Required Expertise</p>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedDrive.skills.split(',').map((s: string, i: number) => (
                                            <span key={i} className="px-4 py-2 rounded-xl bg-gray-50 text-gray-600 border border-gray-200 font-bold text-[11px] uppercase tracking-wider">
                                                {s.trim()}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-8 border-t border-gray-100 flex gap-4 bg-gray-50/50 shrink-0">
                            <Button
                                className="flex-1 h-14 bg-gray-900 hover:bg-black text-white rounded-xl font-bold uppercase text-[11px] tracking-widest shadow-sm"
                                onClick={() => router.push(`/admin/candidates?driveId=${selectedDrive.id}${orgId ? `&orgId=${orgId}` : ''}`)}
                            >
                                <Users className="h-4 w-4 mr-3" />
                                Talent Pipeline ({selectedDrive.applicants || 0})
                            </Button>
                            <Button
                                variant="outline"
                                className="h-14 px-8 rounded-xl border-gray-200 text-gray-900 hover:bg-white font-bold text-[11px] uppercase tracking-widest transition-all shadow-sm"
                                onClick={() => setCandidatePreviewSlug(selectedDrive.slug || selectedDrive.id)}
                            >
                                <Eye className="h-4 w-4" />
                                Portal View
                            </Button>
                            <Button
                                variant="outline"
                                className="h-14 w-14 rounded-xl flex items-center justify-center p-0 border-gray-200 text-gray-400 hover:text-gray-900 hover:bg-white transition-all shadow-sm"
                                onClick={() => router.push(`/admin/create-drive?id=${selectedDrive.id}${orgId ? `&orgId=${orgId}` : ''}`)}
                            >
                                <Edit className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Candidate Portal Preview Modal */}
            {candidatePreviewSlug && (
                <div className="fixed inset-0 z-[200] flex flex-col bg-black/60 backdrop-blur-sm">
                    {/* Browser-chrome header */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-white/10 shrink-0">
                        {/* Traffic lights */}
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => setCandidatePreviewSlug(null)}
                                className="h-3.5 w-3.5 rounded-full bg-red-500 hover:bg-red-400 transition-colors flex items-center justify-center group"
                                title="Close preview"
                            >
                                <X className="h-2 w-2 text-red-900 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                            <div className="h-3.5 w-3.5 rounded-full bg-yellow-400/60" />
                            <div className="h-3.5 w-3.5 rounded-full bg-green-500/60" />
                        </div>
                        {/* URL bar */}
                        <div className="flex-1 flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5 mx-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-green-400" />
                            <span className="text-[11px] text-gray-400 font-sans truncate select-none">
                                {typeof window !== "undefined" ? window.location.origin : ""}/careers/jobs/{candidatePreviewSlug}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-400">
                                Preview as Candidate
                            </span>
                            <button
                                onClick={() => window.open(`/careers/jobs/${candidatePreviewSlug}`, '_blank')}
                                className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                title="Open in new tab"
                            >
                                <ExternalLink className="h-4 w-4" />
                            </button>
                            <button
                                onClick={() => setCandidatePreviewSlug(null)}
                                className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                title="Close"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                    {/* iframe */}
                    <iframe
                        key={candidatePreviewSlug}
                        src={`/careers/jobs/${candidatePreviewSlug}`}
                        className="flex-1 w-full border-0 bg-white"
                        title="Candidate Portal Preview"
                    />
                </div>
            )}

            {/* Status Toggle Modal */}
            {statusModalDrive && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm mx-4 space-y-6">
                        {statusModalDrive.currentStatus === "Expired" ? (
                            <>
                                <div className="flex flex-col items-center gap-3 text-center">
                                    <div className="h-14 w-14 rounded-2xl bg-orange-50 flex items-center justify-center">
                                        <Clock className="h-7 w-7 text-orange-500" />
                                    </div>
                                    <h2 className="text-xl font-black text-gray-900">Drive Expired</h2>
                                    <p className="text-sm text-gray-500 font-medium leading-relaxed">
                                        This drive has passed its deadline. To reopen it, please edit the drive and set a new deadline.
                                    </p>
                                </div>
                                <div className="flex gap-3">
                                    <Button variant="outline" className="flex-1 rounded-2xl font-bold" onClick={() => setStatusModalDrive(null)}>
                                        Cancel
                                    </Button>
                                    <Button
                                        className="flex-1 rounded-2xl font-bold bg-gradient-to-r from-[#F97316] to-orange-500 text-white"
                                        onClick={() => {
                                            setStatusModalDrive(null);
                                            router.push(`/admin/create-drive?id=${statusModalDrive.id}${orgId ? `&orgId=${orgId}` : ''}`);
                                        }}
                                    >
                                        Edit Drive
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex flex-col items-center gap-3 text-center">
                                    <div className={cn(
                                        "h-14 w-14 rounded-2xl flex items-center justify-center",
                                        statusModalDrive.currentStatus === "Active" ? "bg-red-50" : "bg-green-50"
                                    )}>
                                        <AlertCircle className={cn("h-7 w-7", statusModalDrive.currentStatus === "Active" ? "text-red-500" : "text-green-500")} />
                                    </div>
                                    <h2 className="text-xl font-black text-gray-900">
                                        {statusModalDrive.currentStatus === "Active" ? "Close Drive?" : "Reopen Drive?"}
                                    </h2>
                                    <p className="text-sm text-gray-500 font-medium leading-relaxed">
                                        {statusModalDrive.currentStatus === "Active"
                                            ? "Closing this drive will stop accepting new applications. You can reopen it anytime."
                                            : "Reopening this drive will allow candidates to apply again."
                                        }
                                    </p>
                                </div>
                                <div className="flex gap-3">
                                    <Button variant="outline" className="flex-1 rounded-2xl font-bold" onClick={() => setStatusModalDrive(null)} disabled={isTogglingStatus}>
                                        Cancel
                                    </Button>
                                    <Button
                                        className={cn(
                                            "flex-1 rounded-2xl font-bold text-white",
                                            statusModalDrive.currentStatus === "Active"
                                                ? "bg-gradient-to-r from-red-500 to-red-600"
                                                : "bg-gradient-to-r from-green-500 to-green-600"
                                        )}
                                        disabled={isTogglingStatus}
                                        onClick={async () => {
                                            setIsTogglingStatus(true);
                                            try {
                                                const newStatus = statusModalDrive.currentStatus === "Active" ? "CLOSED" : "ACTIVE";
                                                await toggleDriveStatus(statusModalDrive.id, newStatus);
                                                toast.success(`Drive ${newStatus === "ACTIVE" ? "reopened" : "closed"} successfully`);
                                                setStatusModalDrive(null);
                                            } catch {
                                                toast.error("Failed to update drive status");
                                            } finally {
                                                setIsTogglingStatus(false);
                                            }
                                        }}
                                    >
                                        {isTogglingStatus ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : statusModalDrive.currentStatus === "Active" ? "Yes, Close It" : "Yes, Reopen It"}
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Confirmation Modals */}
            <ActionConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Drive"
                description="Are you sure you want to delete this drive? This will permanently remove all candidates and data associated with it."
                confirmText="Confirm Delete"
                isLoading={isDeleting}
            />

            <ActionConfirmModal
                isOpen={isBulkDeleteModalOpen}
                onClose={() => setIsBulkDeleteModalOpen(false)}
                onConfirm={confirmBulkDelete}
                title="Bulk Delete Drives"
                description={`Are you sure you want to delete ${selectedIds.size} selected drives and all their associated data? This action cannot be undone.`}
                confirmText={`Delete ${selectedIds.size} Drives`}
                isLoading={isDeleting}
            />
        </div>
    );
}