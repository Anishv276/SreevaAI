"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateFilter, type DateRange } from "@/components/admin/date-filter";
import { PremiumFilter } from "@/components/admin/premium-filter";
import { useCandidates } from "@/context/candidates-context";
import { useJobs } from "@/context/jobs-context";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast-custom";
import {
    AlertCircle,
    Eye,
    FileText,
    Loader2,
    Mail,
    Search,
    ChevronDown,
    Target,
    UserX,
    MoreHorizontal,
    Lock,
    XCircle,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function formatCandidateStatusLabel(value?: string) {
    const normalized = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
    if (!normalized) return "Pending";
    if (normalized === "inprogress" || normalized === "in progress") return "In Progress";
    if (normalized === "finished" || normalized === "completed") return "Completed";
    if (normalized === "shortlisted") return "Shortlisted";
    if (normalized === "rejected") return "Rejected";
    if (normalized === "not shortlisted") return "Not Shortlisted";
    if (normalized === "not hired") return "Not Hired";
    if (normalized === "not qualified") return "Not Qualified";
    return normalized.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function normalizeStatusKey(value?: string) {
    return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
}

export function DriveCandidatesTable({ driveId }: { driveId: string }) {
    const { candidates, pagination, isLoading, error, fetchCandidates, clearError } = useCandidates();
    const { jobs } = useJobs();
    const [searchTerm, setSearchTerm] = useState("");
    const [resumeFilter, setResumeFilter] = useState("all");
    const [timeline, setTimeline] = useState<DateRange>({ type: "all" });
    const [scoreSort, setScoreSort] = useState<"default" | "score_desc" | "score_asc">("default");

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

            fetchCandidates(1, pagination.limit, driveId, resumeFilter, undefined, undefined, startDate, endDate, searchTerm, scoreSort);
        }, 200);

        return () => clearTimeout(handler);
    }, [driveId, resumeFilter, timeline, searchTerm, pagination.limit, fetchCandidates, scoreSort]);

    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > pagination.totalPages) return;

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

        fetchCandidates(newPage, pagination.limit, driveId, resumeFilter, undefined, undefined, startDate, endDate, searchTerm, scoreSort);
    };

    const handleUpdateStatus = async (applicationId: string, statusUpdate: { resumeStatus?: string; hiringStatus?: string }, successMsg: string) => {
        try {
            const res = await fetch(`/api/candidates/${applicationId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(statusUpdate),
            });
            if (res.ok) {
                toast.success(successMsg);
                fetchCandidates(pagination.page, pagination.limit, driveId, resumeFilter, undefined, undefined, undefined, undefined, searchTerm, scoreSort);
            } else {
                toast.error("Failed to update status");
            }
        } catch {
            toast.error("Failed to update status");
        }
    };

    const filteredCandidates = candidates;
    const driveTitle = jobs.find((job) => job.id === driveId)?.title || "Drive";

    return (
        <div className="space-y-6">
            <div className="rounded-[2rem] border border-white/40 bg-white/50 p-3 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.03)]">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="relative flex-1 max-w-2xl w-full">
                        <Search className="absolute left-4 top-3.5 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder={`Search candidates in ${driveTitle}...`}
                            className="pl-11 h-12 border-transparent bg-white/60 rounded-2xl focus:bg-white focus:border-orange-200 focus:ring-8 focus:ring-orange-50/50 transition-all font-bold text-sm shadow-inner"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-4 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 no-scrollbar">
                        <DateFilter value={timeline} onChange={setTimeline} />
                        <PremiumFilter
                            value={resumeFilter}
                            onChange={setResumeFilter}
                            icon={Target}
                            placeholder="Resume"
                            options={[
                                { value: "all", label: "All Status" },
                                { value: "shortlisted", label: "Shortlisted", colorClass: "text-emerald-600" },
                                { value: "rejected", label: "Rejected", colorClass: "text-rose-600" },
                                { value: "pending", label: "Pending", colorClass: "text-slate-600" },
                            ]}
                        />
                    </div>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center justify-between animate-in slide-in-from-top-4">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <span className="text-xs font-bold text-red-900 uppercase tracking-tighter">Sync Error: {error}</span>
                    </div>
                    <button onClick={clearError} className="text-red-600 hover:text-red-800 transition-colors">
                        <XCircle className="h-4 w-4" />
                    </button>
                </div>
            )}

            <div className="group relative bg-white/40 backdrop-blur-xl rounded-[2.5rem] border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.03)] overflow-hidden transition-all duration-700 hover:shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-400/0 via-[#F97316]/40 to-orange-400/0" />
                <div className="relative w-full overflow-auto">
                    <Table>
                        <TableHeader className="bg-gray-50/50">
                            <TableRow className="border-b border-gray-100 hover:bg-transparent">
                                <TableHead className="w-[60px] pl-8 font-bold uppercase tracking-wider text-[11px] text-gray-500">#</TableHead>
                                <TableHead className="w-[320px] h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 pl-4">Candidate</TableHead>
                        <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">
                            <div className="flex items-center justify-center gap-1">
                                <span>Score</span>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            type="button"
                                            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:text-[#F97316] transition-colors"
                                            aria-label="Sort score"
                                        >
                                            <ChevronDown className="h-3.5 w-3.5" />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="center" className="w-48 p-2 rounded-xl shadow-xl border-gray-100 bg-white">
                                        <DropdownMenuLabel className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
                                            Sort by score
                                        </DropdownMenuLabel>
                                        <DropdownMenuItem
                                            onClick={() => setScoreSort("default")}
                                            className="rounded-lg px-3 py-2 font-bold cursor-pointer transition-colors"
                                        >
                                            Normal
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => setScoreSort("score_desc")}
                                            className="rounded-lg px-3 py-2 font-bold cursor-pointer transition-colors"
                                        >
                                            Top scorers
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => setScoreSort("score_asc")}
                                            className="rounded-lg px-3 py-2 font-bold cursor-pointer transition-colors"
                                        >
                                            Lowest scorers
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Resume</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Interview</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Hiring</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Resume Report</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Interview Report</TableHead>
                                <TableHead className="text-right pr-8 h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="[&_tr:last-child]:border-0">
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="py-12 text-center text-sm font-bold text-gray-400">
                                        Loading candidates...
                                    </TableCell>
                                </TableRow>
                            ) : filteredCandidates.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="py-12 text-center text-sm font-bold text-gray-400">
                                        No candidates found for this drive
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredCandidates.map((candidate: any, index: number) => {
                                    const statusValue = candidate.resumeStatus || candidate.status;
                                    const statusKey = normalizeStatusKey(statusValue) || "pending";
                                    const statusLabel = formatCandidateStatusLabel(statusValue);
                                    const interviewStatusValue = candidate.interviewStatus;
                                    const interviewStatusKey = normalizeStatusKey(interviewStatusValue) || "pending";
                                    const interviewStatusLabel = formatCandidateStatusLabel(interviewStatusValue);
                                    const hiringStatusValue = candidate.hiringStatus;
                                    const hiringStatusKey = normalizeStatusKey(hiringStatusValue) || "pending";
                                    const hiringStatusLabel = formatCandidateStatusLabel(hiringStatusValue);
                                    const score = Number(candidate.score ?? candidate.aiScore ?? 0);

                                    return (
                                        <TableRow key={candidate.id} className="group border-b border-white/20 hover:bg-white/40 transition-all duration-500">
                                            <TableCell className="pl-8 py-5 text-[12px] font-bold text-gray-400 tabular-nums">
                                                {index + 1 + (pagination.page - 1) * pagination.limit}
                                            </TableCell>
                                            <TableCell className="py-5 pl-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="relative group/avatar">
                                                        <Avatar className="h-11 w-11 border-2 border-white shadow-sm ring-1 ring-gray-100 group-hover/avatar:scale-105 transition-transform duration-300">
                                                            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${candidate.name}`} />
                                                            <AvatarFallback>{candidate.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                                        </Avatar>
                                                    </div>
                                                    <div className="flex flex-col relative">
                                                        <span className="text-gray-900 font-extrabold text-[15px] leading-tight group-hover:text-[#F97316] transition-colors">{candidate.name}</span>
                                                        <span className="text-[11px] text-gray-400 font-bold mt-0.5">{candidate.email}</span>
                                                    </div>
                                                </div>
                                            </TableCell>

                                            <TableCell className="py-5 text-center">
                                                <div className="flex justify-center">
                                                    <Badge className={cn(
                                                        "rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border-0 shadow-sm",
                                                        score >= 80 ? "bg-emerald-50 text-emerald-700" :
                                                        score >= 50 ? "bg-amber-50 text-amber-700" :
                                                        "bg-rose-50 text-rose-700"
                                                    )}>
                                                        {score ? `${score}%` : "No score"}
                                                    </Badge>
                                                </div>
                                            </TableCell>

                                            <TableCell className="py-5 text-center">
                                                <div className="flex justify-center items-center h-full">
                                                    <Badge variant="secondary" className={cn(
                                                        "rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border-0 shadow-sm transition-all",
                                                        statusKey === "rejected" ? "bg-rose-50 text-rose-700" :
                                                        statusKey === "shortlisted" ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-500"
                                                    )}>
                                                        {statusKey === "rejected" ? "Rejected" : statusKey === "shortlisted" ? "Shortlisted" : statusLabel}
                                                    </Badge>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-5 text-center">
                                                <div className="flex justify-center items-center h-full">
                                                    <Badge variant="secondary" className={cn(
                                                        "rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border-0 shadow-sm transition-all",
                                                        interviewStatusKey === "completed" || interviewStatusKey === "finished" ? "bg-indigo-50 text-indigo-700" :
                                                        interviewStatusKey === "in progress" ? "bg-blue-50 text-blue-700" :
                                                        interviewStatusKey === "pending" ? "bg-slate-50 text-slate-500" :
                                                        "bg-amber-50 text-amber-700"
                                                    )}>
                                                        {interviewStatusLabel}
                                                    </Badge>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-5 text-center">
                                                <div className="flex justify-center items-center h-full">
                                                    <Badge variant="secondary" className={cn(
                                                        "rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border-0 shadow-sm transition-all",
                                                        hiringStatusKey === "hired" ? "bg-emerald-50 text-emerald-700" :
                                                        hiringStatusKey === "not hired" ? "bg-rose-50 text-rose-700" :
                                                        hiringStatusKey === "not shortlisted" ? "bg-amber-50 text-amber-700" :
                                                        "bg-slate-50 text-slate-500"
                                                    )}>
                                                        {hiringStatusLabel}
                                                    </Badge>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-5 text-center">
                                                <Link
                                                    href={`/admin/candidates/${candidate.id}?report=resume&back=${encodeURIComponent(`/admin/candidates/drive/${driveId}`)}`}
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#F97316] transition-colors hover:bg-orange-50"
                                                    title="Open resume report"
                                                    aria-label="Open resume report"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Link>
                                            </TableCell>
                                            <TableCell className="py-5 text-center">
                                                {interviewStatusKey === "pending" ? (
                                                    <span
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-300"
                                                        title="Interview report is locked until the interview happens"
                                                        aria-label="Interview report locked"
                                                    >
                                                        <Lock className="h-4 w-4" />
                                                    </span>
                                                ) : (
                                                    <Link
                                                        href={`/admin/candidates/${candidate.id}?back=${encodeURIComponent(`/admin/candidates/drive/${driveId}`)}`}
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#0D4D2E] transition-colors hover:bg-emerald-50"
                                                        title="Open interview report"
                                                        aria-label="Open interview report"
                                                    >
                                                        <FileText className="h-4 w-4" />
                                                    </Link>
                                                )}
                                            </TableCell>
                                            <TableCell className="py-5 pr-8 text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-gray-50 transition-colors">
                                                            <MoreHorizontal className="h-4 w-4 text-gray-400" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-64 p-2 rounded-xl shadow-xl border-gray-100 bg-white">
                                                        <DropdownMenuLabel className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Shortlist</DropdownMenuLabel>
                                                        <DropdownMenuItem onClick={() => handleUpdateStatus(candidate.id, { resumeStatus: "shortlisted" }, `${candidate.name} shortlisted`)} className="rounded-lg px-3 py-2 font-bold text-emerald-600 cursor-pointer focus:text-emerald-700 focus:bg-emerald-50 transition-colors">
                                                            <Target className="h-4 w-4 mr-2" />
                                                            Shortlist Candidate
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleUpdateStatus(candidate.id, { resumeStatus: "rejected" }, `${candidate.name} rejected`)} className="rounded-lg px-3 py-2 font-bold text-rose-600 cursor-pointer focus:text-rose-700 focus:bg-rose-50 transition-colors">
                                                            <UserX className="h-4 w-4 mr-2" />
                                                            Reject Candidate
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => window.location.href = `mailto:${candidate.email}`} className="rounded-lg px-3 py-2 font-bold cursor-pointer transition-colors text-blue-600 focus:text-blue-700 focus:bg-blue-50">
                                                            <Mail className="h-4 w-4 mr-2" />
                                                            Send Mail
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
            </div>

            <div className="flex items-center justify-between px-4 py-6 border-t border-white/20 bg-white/20 backdrop-blur-xl rounded-2xl">
                <p className="text-[13px] font-medium text-gray-500">
                    Showing <span className="text-gray-900 font-bold">{(pagination.page - 1) * pagination.limit + 1}</span> to <span className="text-gray-900 font-bold">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> of <span className="text-gray-900 font-bold">{pagination.total}</span> candidates
                </p>
                <div className="flex gap-3">
                    <Button variant="outline" size="sm" className="h-10 px-6 rounded-xl border-white/40 bg-white/40 backdrop-blur-md text-gray-500 font-bold hover:bg-white hover:text-[#F97316] disabled:opacity-30 transition-all" disabled={pagination.page <= 1 || isLoading} onClick={() => handlePageChange(pagination.page - 1)}>
                        Previous
                    </Button>
                    <Button variant="outline" size="sm" className="h-10 px-6 rounded-xl border-white/40 bg-white/40 backdrop-blur-md text-gray-500 font-bold hover:bg-white hover:text-[#F97316] disabled:opacity-30 transition-all" disabled={pagination.page >= pagination.totalPages || isLoading} onClick={() => handlePageChange(pagination.page + 1)}>
                        Next
                    </Button>
                </div>
            </div>
        </div>
    );
}
