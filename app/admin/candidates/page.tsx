"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Filter, MoreHorizontal, Eye, Download, ChevronLeft, ChevronRight, SlidersHorizontal, Trash2, X, RefreshCw, Briefcase, Calendar } from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { useCandidates } from "@/context/candidates-context";
import { useJobs } from "@/context/jobs-context";
import { ActionConfirmModal } from "@/components/ui/action-confirm-modal";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useEffect } from "react";

export default function CandidatesPage() {
    const { candidates, pagination, fetchCandidates, bulkDeleteCandidates } = useCandidates();
    const { jobs } = useJobs();
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [roleFilter, setRoleFilter] = useState("all");
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [resendingId, setResendingId] = useState<string | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [dateFilter, setDateFilter] = useState("all");
    const [customRange, setCustomRange] = useState({ start: "", end: "" });
    const searchParams = useSearchParams();
    const router = useRouter();
    const driveIdParam = searchParams.get("driveId");

    // Initialize role filter from URL if present
    useEffect(() => {
        if (driveIdParam) {
            setRoleFilter(driveIdParam);
        }
    }, [driveIdParam]);

    // Refetch when filters change
    useEffect(() => {
        let startDate: string | undefined;
        let endDate: string | undefined;

        if (dateFilter === "today") {
            startDate = new Date().toISOString().split("T")[0];
            endDate = startDate;
        } else if (dateFilter === "week") {
            const date = new Date();
            date.setDate(date.getDate() - 7);
            startDate = date.toISOString().split("T")[0];
        } else if (dateFilter === "month") {
            const date = new Date();
            date.setMonth(date.getMonth() - 1);
            startDate = date.toISOString().split("T")[0];
        } else if (dateFilter === "custom") {
            startDate = customRange.start || undefined;
            endDate = customRange.end || undefined;
        }

        fetchCandidates(1, pagination.limit, roleFilter, statusFilter, startDate, endDate);
    }, [statusFilter, roleFilter, dateFilter, customRange]);

    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= pagination.totalPages) {
            fetchCandidates(newPage, pagination.limit, roleFilter, statusFilter);
        }
    };

    const handleResendInterview = async (applicationId: string) => {
        setResendingId(applicationId);
        try {
            const res = await fetch(`/api/candidates/${applicationId}/resend-interview`, {
                method: "POST",
            });
            const data = await res.json();
            if (res.ok) {
                alert("Interview link resent successfully! New email sent.");
            } else {
                alert(data.error || "Failed to resend interview link");
            }
        } catch (error) {
            alert("Failed to resend interview link");
        } finally {
            setResendingId(null);
        }
    };

    const filteredCandidates = candidates.filter(candidate => {
        // First filter by drive/role
        const matchesRole = roleFilter === "all" || candidate.driveId === roleFilter;
        if (!matchesRole) return false;

        // Then filter by search term
        const search = searchTerm.toLowerCase();
        return candidate.name.toLowerCase().includes(search) ||
            candidate.role.toLowerCase().includes(search) ||
            candidate.email.toLowerCase().includes(search);
    });

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
        if (selectedIds.size === filteredCandidates.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredCandidates.map(c => c.id)));
        }
    };

    const handleDelete = async () => {
        if (!isSelectionMode) {
            setIsSelectionMode(true);
            return;
        }

        if (selectedIds.size === 0) {
            setIsSelectionMode(false);
            return;
        }

        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        setIsDeleting(true);
        try {
            await bulkDeleteCandidates(Array.from(selectedIds));
            setSelectedIds(new Set());
            setIsSelectionMode(false);
            setIsDeleteModalOpen(false);
        } catch (error) {
            alert("Failed to delete candidates");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-8 pb-12 animate-in-fade">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-center gap-4 group">
                    <div className="h-12 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full shadow-[0_0_12px_rgba(249,115,22,0.4)] transition-all duration-300 group-hover:h-14" />
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                            Candidates
                        </h1>
                        <div className="flex items-center gap-3 mt-1.5">
                            <p className="text-gray-500 font-medium text-base">
                                Talent pool • {pagination.total} applicants
                            </p>
                            {driveIdParam && jobs.find(j => j.id.toString() === driveIdParam) && (
                                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 border border-orange-100 text-[#F97316] text-[10px] font-black uppercase tracking-widest animate-in-fade">
                                    <span className="h-1 w-1 rounded-full bg-[#F97316]" />
                                    Drive: {jobs.find(j => j.id.toString() === driveIdParam)?.title}
                                    <button 
                                        onClick={() => {
                                            router.push("/admin/candidates");
                                            setRoleFilter("all");
                                        }}
                                        className="ml-1 hover:text-orange-700 p-0.5 hover:bg-orange-100 rounded-full transition-all"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Button 
                        variant={isSelectionMode ? "destructive" : "outline"}
                        onClick={handleDelete}
                        className={cn(
                            "h-11 px-6 rounded-xl font-bold transition-all flex items-center gap-2",
                            !isSelectionMode && "border-gray-200 text-red-500 hover:bg-red-50 hover:border-red-100"
                        )}
                    >
                        {isSelectionMode ? (
                            selectedIds.size > 0 ? `Confirm Delete (${selectedIds.size})` : "Cancel Selection"
                        ) : (
                            <><Trash2 className="h-4 w-4" /> Delete Candidates</>
                        )}
                    </Button>
                    {isSelectionMode && (
                        <Button 
                            variant="ghost" 
                            onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }}
                            className="h-11 px-4 rounded-xl text-gray-500 font-bold hover:bg-gray-100"
                        >
                            <X className="h-4 w-4 mr-2" /> Cancel
                        </Button>
                    )}
                    <Button 
                        variant="outline" 
                        onClick={() => {
                            let url = `/api/candidates/export?page=1&limit=1000`;
                            if (roleFilter !== "all") url += `&driveId=${roleFilter}`;
                            if (statusFilter !== "all") url += `&status=${statusFilter}`;
                            window.location.href = url;
                        }}
                        className="h-11 px-6 rounded-xl border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition-all"
                    >
                        <Download className="h-4 w-4 mr-2" /> Export CSV
                    </Button>
                </div>
            </div>

            <div className="group relative bg-white/80 backdrop-blur-md rounded-2xl border border-gray-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden transition-all duration-500">
                {/* Decorative top accent */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-400/20 via-[#F97316]/40 to-orange-400/20" />
                <div className="p-6 border-b border-gray-50 flex flex-col sm:flex-row gap-6 justify-between items-center bg-white/50">
                    <div className="relative w-full sm:max-w-lg group/search">
                        <Search className="absolute left-4 top-3 h-4 w-4 text-gray-400 group-focus-within/search:text-[#F97316] transition-colors" />
                        <Input
                            placeholder="Search by name, role, or email..."
                            className="pl-11 h-11 border-gray-100 bg-gray-50/50 rounded-xl focus:bg-white focus:border-orange-100 focus:ring-4 focus:ring-orange-50/50 transition-all font-bold text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="h-10 px-4 border-dashed rounded-lg border-gray-200 text-gray-400 font-bold hover:text-[#F97316] hover:border-orange-200 transition-all bg-transparent">
                                <SlidersHorizontal className="h-3.5 w-3.5 mr-2" />
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                <SelectItem value="Applied">New Applied</SelectItem>
                                <SelectItem value="Shortlisted">Shortlisted</SelectItem>
                                <SelectItem value="Interview Pending">Interview Pending</SelectItem>
                                <SelectItem value="Interview Completed">Interview Completed</SelectItem>
                                <SelectItem value="Rejected">Rejected</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={dateFilter} onValueChange={setDateFilter}>
                            <SelectTrigger className="h-10 px-4 border-dashed rounded-lg border-gray-200 text-gray-400 font-bold hover:text-[#F97316] hover:border-orange-200 transition-all bg-transparent w-[140px]">
                                <Calendar className="h-3.5 w-3.5 mr-2" />
                                <SelectValue placeholder="Date" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Time</SelectItem>
                                <SelectItem value="today">Today</SelectItem>
                                <SelectItem value="week">This Week</SelectItem>
                                <SelectItem value="month">This Month</SelectItem>
                                <SelectItem value="custom">Custom Range</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={roleFilter} onValueChange={setRoleFilter}>
                            <SelectTrigger className="h-10 px-4 border-dashed rounded-lg border-gray-200 text-gray-400 font-bold hover:text-[#F97316] hover:border-orange-200 transition-all bg-transparent w-[180px]">
                                <Briefcase className="h-3.5 w-3.5 mr-2" />
                                <SelectValue placeholder="All Drives" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Drives</SelectItem>
                                {jobs.map(job => (
                                    <SelectItem key={job.id} value={job.id.toString()}>{job.title}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {dateFilter === "custom" && (
                    <div className="px-6 py-4 border-b border-gray-50 bg-orange-50/20 animate-in-slide-down">
                        <div className="flex items-center gap-4">
                            <span className="text-[10px] font-black uppercase tracking-widest text-orange-600">Select Range:</span>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="date" 
                                    value={customRange.start}
                                    onChange={(e) => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
                                    className="bg-white border border-orange-100 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-200 transition-all"
                                />
                                <span className="text-gray-400 text-[10px] font-black">TO</span>
                                <input 
                                    type="date" 
                                    value={customRange.end}
                                    onChange={(e) => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
                                    className="bg-white border border-orange-100 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-200 transition-all"
                                />
                                {customRange.start && customRange.end && (
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => setCustomRange({ start: "", end: "" })}
                                        className="h-8 px-2 text-gray-400 hover:text-red-500"
                                    >
                                        <X className="h-3 w-3 mr-1" /> Clear
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <div className="relative w-full overflow-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-b border-gray-50 hover:bg-transparent">
                                {isSelectionMode && (
                                    <TableHead className="w-[50px] pl-8">
                                        <Checkbox 
                                            checked={selectedIds.size === filteredCandidates.length && filteredCandidates.length > 0}
                                            onCheckedChange={toggleSelectAll}
                                        />
                                    </TableHead>
                                )}
                                <TableHead className={cn("w-[280px] h-14 font-black uppercase tracking-[0.15em] text-[10px] text-gray-400", !isSelectionMode && "pl-8")}>Candidate</TableHead>
                                <TableHead className="h-14 font-black uppercase tracking-[0.15em] text-[10px] text-gray-400">Applied For</TableHead>
                                <TableHead className="h-14 font-black uppercase tracking-[0.15em] text-[10px] text-gray-400 text-center">AI Score</TableHead>
                                <TableHead className="h-14 font-black uppercase tracking-[0.15em] text-[10px] text-gray-400">Status</TableHead>
                                <TableHead className="h-14 font-black uppercase tracking-[0.15em] text-[10px] text-gray-400">Interview Status</TableHead>
                                <TableHead className="h-14 font-black uppercase tracking-[0.15em] text-[10px] text-gray-400">Applied Date</TableHead>
                                <TableHead className="text-right pr-8 h-14 font-black uppercase tracking-[0.15em] text-[10px] text-gray-400">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredCandidates.map((candidate) => (
                                (() => {
                                    const mainStatus =
                                        candidate.status === "Rejected"
                                            ? "Rejected"
                                            : candidate.status === "Borderline"
                                                ? "Borderline"
                                                : "Shortlisted";
                                    const interviewStage = candidate.interviewStatus || "Not Selected";

                                    return (
                                <TableRow 
                                    key={candidate.id} 
                                    onClick={() => isSelectionMode && toggleSelection(candidate.id)}
                                    className={cn(
                                        "group border-b border-gray-50/50 hover:bg-orange-50/30 transition-all duration-300",
                                        isSelectionMode && "cursor-pointer",
                                        selectedIds.has(candidate.id) && "bg-orange-50/50"
                                    )}
                                >
                                    {isSelectionMode && (
                                        <TableCell className="pl-8 py-5">
                                            <Checkbox 
                                                checked={selectedIds.has(candidate.id)}
                                                onCheckedChange={() => toggleSelection(candidate.id)}
                                            />
                                        </TableCell>
                                    )}
                                    <TableCell className={cn("py-5", !isSelectionMode && "pl-8")}>
                                        <div className="flex items-center gap-4">
                                            <div className="relative group/avatar">
                                                <Avatar className="h-11 w-11 border-2 border-white shadow-sm ring-1 ring-gray-100 group-hover/avatar:scale-105 transition-transform duration-300">
                                                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${candidate.name}`} />
                                                    <AvatarFallback>{candidate.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                                </Avatar>
                                                <div className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-green-500" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-gray-900 font-extrabold text-[15px] leading-tight group-hover:text-[#F97316] transition-colors">{candidate.name}</span>
                                                <span className="text-[11px] text-gray-400 font-bold mt-0.5">{candidate.email}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-5">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-gray-700">{candidate.role}</span>
                                            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-tighter mt-0.5">{candidate.location}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-5">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-orange-50 border border-orange-100 shadow-sm">
                                                <span className={cn(
                                                    "text-sm font-black transition-colors",
                                                    candidate.score >= 80 ? "text-green-600" : candidate.score >= 50 ? "text-orange-600" : "text-red-500"
                                                )}>
                                                    {candidate.score}
                                                </span>
                                            </div>
                                            <div className="h-1 w-12 rounded-full bg-gray-100 overflow-hidden">
                                                <div
                                                    className={cn(
                                                        "h-full transition-all duration-700",
                                                        candidate.score >= 80 ? "bg-green-500 shadow-[0_0_8px_#22C55E]" : candidate.score >= 50 ? "bg-orange-500 shadow-[0_0_8px_#F97316]" : "bg-red-500 shadow-[0_0_8px_#EF4444]"
                                                    )}
                                                    style={{ width: `${candidate.score}%` }}
                                                />
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-5">
                                        <Badge variant="secondary" className={cn(
                                            "rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border-0 shadow-sm",
                                            mainStatus === 'Shortlisted' ? 'bg-green-50 text-green-700' :
                                                mainStatus === 'Rejected' ? 'bg-red-50 text-red-700' :
                                                    'bg-amber-50 text-amber-700'
                                        )}>
                                            {mainStatus}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="py-5">
                                        <p className="text-[11px] font-bold text-gray-500">
                                            {interviewStage}
                                        </p>
                                    </TableCell>
                                    <TableCell className="py-5 text-[12px] font-bold text-gray-400">
                                        {candidate.date}
                                    </TableCell>
                                    <TableCell className="py-5 pr-8 text-right">
                                        <div className="flex items-center justify-end gap-3">
                                            <Link href={`/admin/candidates/${candidate.id}`} onClick={(e) => isSelectionMode && e.stopPropagation()}>
                                                <Button 
                                                    size="sm" 
                                                    variant="ghost" 
                                                    className="h-9 px-4 rounded-lg text-[#F97316] font-extrabold hover:bg-orange-50 transition-all"
                                                >
                                                    View Profile
                                                </Button>
                                            </Link>
                                            <div onClick={(e) => isSelectionMode && e.stopPropagation()}>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-gray-50 transition-colors">
                                                            <MoreHorizontal className="h-4 w-4 text-gray-400" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl shadow-xl border-gray-100">
                                                        <DropdownMenuLabel className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Quick Actions</DropdownMenuLabel>
                                                        {(candidate.status === "Shortlisted") && (
                                                            <DropdownMenuItem 
                                                                onClick={() => handleResendInterview(candidate.id)}
                                                                disabled={resendingId === candidate.id}
                                                                className="rounded-lg px-3 py-2 font-bold cursor-pointer transition-colors"
                                                            >
                                                                <RefreshCw className={cn("h-4 w-4 mr-2", resendingId === candidate.id && "animate-spin")} />
                                                                {resendingId === candidate.id ? "Sending..." : "Resend Interview Link"}
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuSeparator className="my-1 bg-gray-50" />
                                                        <DropdownMenuItem className="rounded-lg px-3 py-2 font-bold text-red-600 cursor-pointer focus:text-red-700 focus:bg-red-50 transition-colors">Reject Candidate</DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                                    );
                                })()
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <div className="px-8 py-6 border-t border-gray-50 flex items-center justify-between bg-gray-50/30">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    Showing <span className="text-gray-900">{(pagination.page - 1) * pagination.limit + 1}</span> to <span className="text-gray-900">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> of <span className="text-gray-900">{pagination.total}</span> candidates
                </p>
                <div className="flex gap-3">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-10 px-4 rounded-xl border-gray-200 text-gray-400 font-bold hover:text-gray-600 transition-all" 
                        disabled={pagination.page <= 1}
                        onClick={() => handlePageChange(pagination.page - 1)}
                    >
                        <ChevronLeft className="h-4 w-4 mr-2" /> Previous
                    </Button>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-10 px-4 rounded-xl border-gray-200 text-gray-400 font-bold hover:text-gray-600 transition-all" 
                        disabled={pagination.page >= pagination.totalPages}
                        onClick={() => handlePageChange(pagination.page + 1)}
                    >
                        Next <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                </div>
            </div>

            <ActionConfirmModal 
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Candidates"
                description={`Are you sure you want to delete ${selectedIds.size} selected candidates? This will permanently remove their application data and history.`}
                confirmText={`Confirm Delete (${selectedIds.size})`}
                isLoading={isDeleting}
            />
        </div>
    );
}
