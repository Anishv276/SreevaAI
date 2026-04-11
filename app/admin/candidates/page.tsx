"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, MoreHorizontal, Download, ChevronLeft, ChevronRight, SlidersHorizontal, Trash2, X, RefreshCw, Briefcase, AlertCircle, UserX, Radio, Target, ShieldCheck, Award, Clock, Mail, CheckSquare, Square, Send } from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast-custom";
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
import { useEffect, useRef } from "react";
import { RecruiterAssistant } from "@/components/admin/RecruiterAssistant";
import { DateFilter, type DateRange } from "@/components/admin/date-filter";
import { motion } from "framer-motion";

// ── Email Composer Modal ───────────────────────────────────────────────
const VARIABLES = [
    { label: "{{name}}", desc: "Candidate full name" },
    { label: "{{role}}", desc: "Job title" },
    { label: "{{email}}", desc: "Candidate email" },
];

function EmailComposer({
    candidate,
    onClose,
}: {
    candidate: { id: string; name: string; email: string; role: string } | null;
    onClose: () => void;
}) {
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [sending, setSending] = useState(false);
    const bodyRef = useRef<HTMLTextAreaElement>(null);

    const insertVariable = (v: string) => {
        const el = bodyRef.current;
        if (!el) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const newBody = body.slice(0, start) + v + body.slice(end);
        setBody(newBody);
        setTimeout(() => { el.selectionStart = el.selectionEnd = start + v.length; el.focus(); }, 0);
    };

    const handleSend = async () => {
        if (!subject.trim() || !body.trim()) { toast.error("Subject and message are required"); return; }
        setSending(true);
        try {
            const res = await fetch(`/api/candidates/${candidate!.id}/send-email`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject, body }),
            });
            if (res.ok) { toast.success(`Email sent to ${candidate!.name}`); onClose(); }
            else { const d = await res.json(); toast.error(d.error || "Failed to send email"); }
        } catch { toast.error("Failed to send email"); }
        finally { setSending(false); }
    };

    if (!candidate) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-50">
                    <div>
                        <h2 className="text-lg font-black text-gray-900 tracking-tight">Compose Email</h2>
                        <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">To: {candidate.name} · {candidate.email}</p>
                    </div>
                    <button onClick={onClose} className="h-8 w-8 rounded-xl flex items-center justify-center hover:bg-gray-100 text-gray-400 transition-colors">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="px-6 pt-4 pb-2 space-y-3">
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1 block">Subject</label>
                        <input
                            className="w-full h-11 px-4 rounded-2xl border border-gray-100 bg-gray-50 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-200 transition-all"
                            placeholder="Email subject..."
                            value={subject}
                            onChange={e => setSubject(e.target.value)}
                        />
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Message</label>
                            <div className="flex gap-1.5">
                                {VARIABLES.map(v => (
                                    <button
                                        key={v.label}
                                        title={v.desc}
                                        onClick={() => insertVariable(v.label)}
                                        className="text-[10px] font-black px-2 py-1 rounded-lg bg-orange-50 text-[#F97316] hover:bg-orange-100 transition-colors"
                                    >
                                        {v.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <textarea
                            ref={bodyRef}
                            rows={8}
                            className="w-full px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-200 transition-all resize-none"
                            placeholder={`Hi {{name}},\n\nWrite your message here...`}
                            value={body}
                            onChange={e => setBody(e.target.value)}
                        />
                        <p className="text-[10px] text-gray-400 font-bold mt-1">Click variable buttons to insert at cursor position</p>
                    </div>
                </div>
                <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50/50 border-t border-gray-50">
                    <Button variant="ghost" onClick={onClose} className="h-10 px-5 rounded-2xl font-bold text-gray-500">Cancel</Button>
                    <Button
                        onClick={handleSend}
                        disabled={sending}
                        className="h-10 px-6 rounded-2xl bg-[#F97316] hover:bg-orange-600 text-white font-bold flex items-center gap-2"
                    >
                        <Send className="h-4 w-4" />
                        {sending ? "Sending..." : "Send Email"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function CandidateStatsRow() {
    const { stats, isLoading } = useCandidates();

    const kpis = [
        { label: "Shortlisted", value: stats.shortlisted, icon: Target, color: "text-blue-600", bg: "bg-blue-50" },
        { label: "Hired", value: stats.hired, icon: Award, color: "text-emerald-600", bg: "bg-emerald-50" },
        { label: "Rejected", value: stats.rejected, icon: UserX, color: "text-rose-600", bg: "bg-rose-50" },
        { label: "Live", value: stats.interviewRunning, icon: Radio, color: "text-orange-600", bg: "bg-orange-50", pulse: stats.interviewRunning > 0 },
        { label: "Pending", value: stats.interviewPending, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
        { label: "Completed", value: stats.interviewCompleted, icon: ShieldCheck, color: "text-indigo-600", bg: "bg-indigo-50" },
    ];

    if (isLoading && stats.shortlisted === 0) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-20 rounded-2xl bg-white/40 animate-pulse border border-white/20" />
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {kpis.map((kpi, idx) => (
                <motion.div
                    key={kpi.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="group relative flex items-center gap-3 p-4 bg-white/40 backdrop-blur-xl rounded-2xl border border-white/40 shadow-sm hover:shadow-md transition-all duration-300"
                >
                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110", kpi.bg, kpi.color)}>
                        <kpi.icon className={cn("h-5 w-5", kpi.pulse && "animate-pulse")} />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 truncate">{kpi.label}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xl font-black text-gray-900 tabular-nums">{kpi.value}</span>
                            {kpi.pulse && (
                                <span className="flex h-2 w-2 relative">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                                </span>
                            )}
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    );
}

export default function CandidatesPage() {
    const { candidates, pagination, isLoading, error, fetchCandidates, clearError } = useCandidates();
    const { jobs } = useJobs();
    const [searchTerm, setSearchTerm] = useState("");
    const [resumeFilter, setResumeFilter] = useState("all");
    const [interviewFilter, setInterviewFilter] = useState("all");
    const [hiringFilter, setHiringFilter] = useState("all");
    const [roleFilter, setRoleFilter] = useState("all");
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [resendingId, setResendingId] = useState<string | null>(null);
    const [isActionModalOpen, setIsActionModalOpen] = useState(false);
    const [pendingAction, setPendingAction] = useState<"hire" | "reject" | "delete" | null>(null);
    const [isBulkLoading, setIsBulkLoading] = useState(false);
    const [emailCandidate, setEmailCandidate] = useState<{ id: string; name: string; email: string; role: string } | null>(null);
    const [timeline, setTimeline] = useState<DateRange>({ type: "all" });
    const searchParams = useSearchParams();
    const router = useRouter();
    const driveIdParam = searchParams.get("driveId");

    // Initialize role filter from URL if present
    useEffect(() => {
        if (driveIdParam) {
            setRoleFilter(driveIdParam);
        }
    }, [driveIdParam]);

    // Refetch when filters or search changes
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

            fetchCandidates(1, pagination.limit, roleFilter, resumeFilter, interviewFilter, hiringFilter, startDate, endDate, searchTerm);
        }, 200); // 200ms Search Debounce

        return () => clearTimeout(handler);
    }, [resumeFilter, interviewFilter, hiringFilter, roleFilter, timeline, searchTerm, pagination.limit]);

    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= pagination.totalPages) {
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

            fetchCandidates(newPage, pagination.limit, roleFilter, resumeFilter, interviewFilter, hiringFilter, startDate, endDate, searchTerm);
        }
    };

    const handleResendInterview = async (candidate: { id: string; interviewStatus?: string }) => {
        const status = (candidate.interviewStatus || "").toLowerCase();
        if (status !== "pending" && status !== "in progress" && status !== "interview pending" && status !== "interview in progress") {
            toast.error("Interview link can only be resent for candidates with Pending or In Progress interview status");
            return;
        }
        setResendingId(candidate.id);
        try {
            const res = await fetch(`/api/candidates/${candidate.id}/resend-interview`, { method: "POST" });
            const data = await res.json();
            if (res.ok) toast.success("Interview link resent — email delivered successfully");
            else toast.error(data.error || "Failed to resend interview link");
        } catch { toast.error("Failed to resend interview link"); }
        finally { setResendingId(null); }
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

                fetchCandidates(pagination.page, pagination.limit, roleFilter, resumeFilter, interviewFilter, hiringFilter, startDate, endDate, searchTerm);
            } else {
                toast.error("Failed to update status");
            }
        } catch { toast.error("Failed to update status"); }
    };

    const filteredCandidates = candidates;

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

    const handleBulkAction = (action: "hire" | "reject" | "delete") => {
        if (selectedIds.size === 0) return;
        setPendingAction(action);
        setIsActionModalOpen(true);
    };

    const confirmBulkAction = async () => {
        if (!pendingAction) return;
        setIsBulkLoading(true);
        try {
            const res = await fetch("/api/candidates/bulk-action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: Array.from(selectedIds), action: pendingAction }),
            });
            if (!res.ok) throw new Error();
            const count = selectedIds.size;
            setSelectedIds(new Set());
            setIsSelectionMode(false);
            setIsActionModalOpen(false);
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

            fetchCandidates(pagination.page, pagination.limit, roleFilter, resumeFilter, interviewFilter, hiringFilter, startDate, endDate, searchTerm);
            const msg = pendingAction === "hire" ? `${count} candidate(s) hired — emails sent` : pendingAction === "reject" ? `${count} candidate(s) rejected — emails sent` : `${count} candidate(s) deleted`;
            toast.success(msg);
        } catch {
            toast.error(`Failed to ${pendingAction} candidates`);
        } finally {
            setIsBulkLoading(false);
            setPendingAction(null);
        }
    };

    return (
        <div className="space-y-8 pb-12 animate-in-fade">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between mb-2">
                <div className="flex items-center gap-5 group">
                    <div className="h-14 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-500 rounded-full shadow-[0_0_15px_rgba(249,115,22,0.4)] transition-all duration-500 group-hover:h-16" />
                    <div className="space-y-1">
                        <h1 className="text-4xl sm:text-5xl font-black text-gray-900 leading-none tracking-tighter">
                            Candidates
                        </h1>
                        <div className="flex items-center gap-3">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#F97316] animate-pulse" />
                            <p className="text-gray-400 font-bold text-[13px] uppercase tracking-[0.2em]">
                                {pagination.total ?? 0} Global Applicants
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                    <Button
                        variant="outline"
                        onClick={() => {
                            if (isSelectionMode) {
                                setIsSelectionMode(false);
                                setSelectedIds(new Set());
                            } else {
                                setIsSelectionMode(true);
                            }
                        }}
                        className={cn(
                            "h-12 px-6 rounded-2xl font-bold transition-all flex items-center gap-2 border-white/40 bg-white/40 backdrop-blur-md shadow-sm",
                            isSelectionMode ? "bg-orange-50 text-[#F97316] border-orange-200" : "text-gray-500 hover:text-[#F97316] hover:border-orange-100"
                        )}
                    >
                        {isSelectionMode ? <><X className="h-4 w-4" /> Cancel</> : <><CheckSquare className="h-4 w-4" /> Select</>}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => {
                            let url = `/api/candidates/export?page=1&limit=1000`;
                            if (roleFilter !== "all") url += `&driveId=${roleFilter}`;
                            if (resumeFilter !== "all") url += `&resumeStatus=${resumeFilter}`;
                            if (interviewFilter !== "all") url += `&interviewStatus=${interviewFilter}`;
                            if (hiringFilter !== "all") url += `&hiringStatus=${hiringFilter}`;
                            window.location.href = url;
                        }}
                        className="h-12 px-6 rounded-2xl border-white/40 bg-white/40 backdrop-blur-md text-gray-600 font-bold hover:bg-white hover:text-[#F97316] transition-all shadow-sm"
                    >
                        <Download className="h-4 w-4 mr-2" /> Export
                    </Button>
                </div>
            </div>

            {/* ── Bulk Action Bar ─────────────────────────────────── */}
            {isSelectionMode && (
                <div className="flex items-center gap-3 flex-wrap p-4 bg-white/60 backdrop-blur-xl rounded-2xl border border-white/40 shadow-sm">
                    <button
                        onClick={toggleSelectAll}
                        className="flex items-center gap-2 text-[12px] font-black uppercase tracking-widest text-gray-500 hover:text-[#F97316] transition-colors"
                    >
                        {selectedIds.size === filteredCandidates.length && filteredCandidates.length > 0
                            ? <><Square className="h-4 w-4" /> Deselect All</>
                            : <><CheckSquare className="h-4 w-4" /> Select All</>
                        }
                    </button>
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                        {selectedIds.size} selected
                    </span>
                    {selectedIds.size > 0 && (
                        <>
                            <div className="h-4 w-px bg-gray-200 mx-1" />
                            <Button
                                size="sm"
                                onClick={() => handleBulkAction("hire")}
                                className="h-9 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs flex items-center gap-1.5"
                            >
                                <Award className="h-3.5 w-3.5" /> Hire ({selectedIds.size})
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => handleBulkAction("reject")}
                                className="h-9 px-4 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs flex items-center gap-1.5"
                            >
                                <UserX className="h-3.5 w-3.5" /> Reject ({selectedIds.size})
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleBulkAction("delete")}
                                className="h-9 px-4 rounded-xl border-red-200 text-red-600 hover:bg-red-50 font-bold text-xs flex items-center gap-1.5"
                            >
                                <Trash2 className="h-3.5 w-3.5" /> Delete ({selectedIds.size})
                            </Button>
                        </>
                    )}
                </div>
            )}

            {/* ── KPI Stats Row ─────────────────────────────────── */}
            <CandidateStatsRow />

            {error && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center justify-between animate-in slide-in-from-top-4">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <span className="text-xs font-bold text-red-900 uppercase tracking-tighter">
                            Sync Error: {error}
                        </span>
                    </div>
                    <button
                        onClick={clearError}
                        className="text-red-600 hover:text-red-800 transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            <div className="group relative bg-white/40 backdrop-blur-xl rounded-[2.5rem] border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.03)] overflow-hidden transition-all duration-700 hover:shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
                {/* Decorative top accent */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-400/0 via-[#F97316]/40 to-orange-400/0" />
                <div className="p-3 border-b border-white/40 bg-white/20">
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
                        <div className="relative flex-1 max-w-2xl w-full group/search">
                            <Search className="absolute left-4 top-3.5 h-4 w-4 text-gray-400 group-focus-within/search:text-[#F97316] transition-colors" />
                            <Input
                                placeholder="Search by name, role, or email..."
                                className="pl-11 h-12 border-transparent bg-white/60 rounded-2xl focus:bg-white focus:border-orange-200 focus:ring-8 focus:ring-orange-50/50 transition-all font-bold text-sm shadow-inner"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-4 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 no-scrollbar">
                            <DateFilter
                                value={timeline}
                                onChange={setTimeline}
                            />

                            <Select value={resumeFilter} onValueChange={setResumeFilter}>
                                <SelectTrigger className="h-12 min-w-[150px] px-5 border-transparent rounded-2xl bg-white/60 text-gray-500 font-bold hover:text-[#F97316] transition-all shadow-inner">
                                    <div className="flex items-center gap-2">
                                        <Target className="h-4 w-4" />
                                        <SelectValue placeholder="Resume" />
                                    </div>
                                </SelectTrigger>
                                <SelectContent className="rounded-2xl border-gray-100 shadow-2xl">
                                    <SelectItem value="all" className="rounded-xl font-bold uppercase text-[10px] tracking-widest">All Resume</SelectItem>
                                    <SelectItem value="pending" className="rounded-xl font-bold uppercase text-[10px] tracking-widest text-amber-600">Pending</SelectItem>
                                    <SelectItem value="shortlisted" className="rounded-xl font-bold uppercase text-[10px] tracking-widest text-emerald-600">Shortlisted</SelectItem>
                                    <SelectItem value="rejected" className="rounded-xl font-bold uppercase text-[10px] tracking-widest text-rose-600">Rejected</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={interviewFilter} onValueChange={setInterviewFilter}>
                                <SelectTrigger className="h-12 min-w-[160px] px-5 border-transparent rounded-2xl bg-white/60 text-gray-500 font-bold hover:text-[#F97316] transition-all shadow-inner">
                                    <div className="flex items-center gap-2">
                                        <Radio className="h-4 w-4" />
                                        <SelectValue placeholder="Interview" />
                                    </div>
                                </SelectTrigger>
                                <SelectContent className="rounded-2xl border-gray-100 shadow-2xl">
                                    <SelectItem value="all" className="rounded-xl font-bold uppercase text-[10px] tracking-widest">All Interview</SelectItem>
                                    <SelectItem value="pending" className="rounded-xl font-bold uppercase text-[10px] tracking-widest text-amber-600">Pending</SelectItem>
                                    <SelectItem value="inprogress" className="rounded-xl font-bold uppercase text-[10px] tracking-widest text-orange-600">In Progress</SelectItem>
                                    <SelectItem value="finished" className="rounded-xl font-bold uppercase text-[10px] tracking-widest text-indigo-600">Finished</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={hiringFilter} onValueChange={setHiringFilter}>
                                <SelectTrigger className="h-12 min-w-[150px] px-5 border-transparent rounded-2xl bg-white/60 text-gray-500 font-bold hover:text-[#F97316] transition-all shadow-inner">
                                    <div className="flex items-center gap-2">
                                        <Award className="h-4 w-4" />
                                        <SelectValue placeholder="Hiring" />
                                    </div>
                                </SelectTrigger>
                                <SelectContent className="rounded-2xl border-gray-100 shadow-2xl">
                                    <SelectItem value="all" className="rounded-xl font-bold uppercase text-[10px] tracking-widest">All Hiring</SelectItem>
                                    <SelectItem value="pending" className="rounded-xl font-bold uppercase text-[10px] tracking-widest text-amber-600">Decision Pending</SelectItem>
                                    <SelectItem value="hired" className="rounded-xl font-bold uppercase text-[10px] tracking-widest text-emerald-600">Hired</SelectItem>
                                    <SelectItem value="not hired" className="rounded-xl font-bold uppercase text-[10px] tracking-widest text-rose-600">Not Hired</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={roleFilter} onValueChange={setRoleFilter}>
                                <SelectTrigger className="h-12 min-w-[180px] px-5 border-transparent rounded-2xl bg-white/60 text-gray-500 font-bold hover:text-[#F97316] transition-all shadow-inner">
                                    <div className="flex items-center gap-2">
                                        <Briefcase className="h-4 w-4" />
                                        <SelectValue placeholder="All Job Roles" />
                                    </div>
                                </SelectTrigger>
                                <SelectContent className="rounded-2xl border-gray-100 shadow-2xl">
                                    <SelectItem value="all" className="rounded-xl font-bold">All Job Roles</SelectItem>
                                    {jobs.map(job => (
                                        <SelectItem key={job.id} value={job.id.toString()} className="rounded-xl font-bold">{job.role || job.title}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

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
                                <TableHead className="h-14 font-black uppercase tracking-[0.15em] text-[10px] text-gray-400">Job Role</TableHead>
                                <TableHead className="h-14 font-black uppercase tracking-[0.15em] text-[10px] text-gray-400 text-center">Status</TableHead>
                                <TableHead className="h-14 font-black uppercase tracking-[0.15em] text-[10px] text-gray-400 text-center">Interview</TableHead>
                                <TableHead className="h-14 font-black uppercase tracking-[0.15em] text-[10px] text-gray-400 text-center">Decision</TableHead>
                                <TableHead className="h-14 font-black uppercase tracking-[0.15em] text-[10px] text-gray-400 text-center">Applied Date</TableHead>
                                <TableHead className="h-14 font-black uppercase tracking-[0.15em] text-[10px] text-gray-400 text-center">Reports</TableHead>
                                <TableHead className="text-right pr-8 h-14 font-black uppercase tracking-[0.15em] text-[10px] text-gray-400">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <tbody className="[&_tr:last-child]:border-0">
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={isSelectionMode ? 9 : 8} className="py-12 text-center text-sm font-bold text-gray-400">
                                        Loading candidates...
                                    </TableCell>
                                </TableRow>
                            ) : filteredCandidates.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={isSelectionMode ? 9 : 8} className="py-12 text-center text-sm font-bold text-gray-400">
                                        No candidates found for selected filters
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredCandidates.map((candidate: any) => {
                                    const mainStatus = candidate.status?.toLowerCase() || "pending";
                                    const interviewStage = candidate.interviewStatus?.toLowerCase() || "pending";
                                    const hiringDecision = candidate.hiringStatus?.toLowerCase() || "pending";

                                    const isHiredResult = hiringDecision === 'hired';
                                    const isNotHiredResult = hiringDecision === 'not hired';

                                    return (
                                        <tr
                                            key={candidate.id}
                                            onClick={() => isSelectionMode && toggleSelection(candidate.id)}
                                            className={cn(
                                                "group border-b border-white/20 hover:bg-white/40 transition-all duration-500",
                                                isSelectionMode && "cursor-pointer",
                                                selectedIds.has(candidate.id) && "bg-orange-50/30"
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
                                            <TableCell className="py-5 text-center">
                                                <div className="flex justify-center items-center h-full">
                                                    <Badge variant="secondary" className={cn(
                                                        "rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest border-0 shadow-sm",
                                                        mainStatus === 'rejected' ? 'bg-rose-50 text-rose-700' :
                                                            mainStatus === 'shortlisted' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                                                    )}>
                                                        {mainStatus}
                                                    </Badge>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-5 text-center">
                                                <div className="flex justify-center items-center h-full">
                                                    <Badge variant="outline" className={cn(
                                                        "rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest border-gray-100 shadow-sm transition-all",
                                                        interviewStage === 'finished' ? 'text-indigo-600 bg-indigo-50/20 shadow-none border-indigo-100' :
                                                            interviewStage === 'inprogress' ? 'text-blue-600 bg-blue-50/20 shadow-none border-blue-100' :
                                                                interviewStage === 'pending' ? 'text-amber-600 bg-amber-50/20 shadow-none border-amber-100' : 'text-gray-500 bg-gray-50'
                                                    )}>
                                                        {interviewStage.length > 20 ? (
                                                            <span title={interviewStage}>
                                                                {interviewStage.substring(0, 17)}...
                                                            </span>
                                                        ) : (
                                                            interviewStage
                                                        )}
                                                    </Badge>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-5 text-center">
                                                <div className="flex justify-center items-center h-full">
                                                    {isHiredResult ? (
                                                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest shadow-sm">
                                                            Hired
                                                        </Badge>
                                                    ) : isNotHiredResult ? (
                                                        <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200 rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest shadow-sm">
                                                            Not Hired
                                                        </Badge>
                                                    ) : hiringDecision === 'not shortlisted' ? (
                                                        <Badge variant="outline" className="bg-rose-50 text-rose-600 border-rose-200 rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest shadow-sm">
                                                            Not Shortlisted
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest italic">Pending</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-5 text-[12px] font-bold text-gray-400 text-center">
                                                {candidate.date}
                                            </TableCell>
                                            <TableCell className="py-5 text-center">
                                                <Link href={`/admin/candidates/${candidate.id}`} onClick={(e) => isSelectionMode && e.stopPropagation()}>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-9 px-4 rounded-lg text-[#F97316] font-extrabold hover:bg-orange-50 transition-all mx-auto flex"
                                                    >
                                                        View Reports
                                                    </Button>
                                                </Link>
                                            </TableCell>
                                            <TableCell className="py-5 pr-8 text-right">
                                                <div onClick={(e) => isSelectionMode && e.stopPropagation()}>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-gray-50 transition-colors">
                                                                <MoreHorizontal className="h-4 w-4 text-gray-400" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl shadow-xl border-gray-100">
                                                            <DropdownMenuLabel className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Quick Actions</DropdownMenuLabel>

                                                            <DropdownMenuItem
                                                                onClick={() => handleResendInterview({ id: candidate.id, interviewStatus: candidate.interviewStatus })}
                                                                disabled={resendingId === candidate.id}
                                                                className="rounded-lg px-3 py-2 font-bold cursor-pointer transition-colors"
                                                            >
                                                                <RefreshCw className={cn("h-4 w-4 mr-2", resendingId === candidate.id && "animate-spin")} />
                                                                {resendingId === candidate.id ? "Sending..." : "Resend Interview Link"}
                                                            </DropdownMenuItem>

                                                            <DropdownMenuItem
                                                                onClick={() => handleUpdateStatus(candidate.id, { hiringStatus: "hired" }, `${candidate.name} hired — confirmation email sent`)}
                                                                className="rounded-lg px-3 py-2 font-bold cursor-pointer text-emerald-600 focus:text-emerald-700 focus:bg-emerald-50 transition-colors"
                                                            >
                                                                <Award className="h-4 w-4 mr-2" />
                                                                Hire this person
                                                            </DropdownMenuItem>

                                                            <DropdownMenuItem
                                                                onClick={() => setEmailCandidate({ id: candidate.id, name: candidate.name, email: candidate.email, role: candidate.role })}
                                                                className="rounded-lg px-3 py-2 font-bold cursor-pointer transition-colors text-blue-600 focus:text-blue-700 focus:bg-blue-50"
                                                            >
                                                                <Mail className="h-4 w-4 mr-2" />
                                                                Send Email
                                                            </DropdownMenuItem>

                                                            <DropdownMenuItem
                                                                onClick={() => handleUpdateStatus(candidate.id, { hiringStatus: "not hired" }, `${candidate.name} marked as Not Hired — email sent`)}
                                                                className="rounded-lg px-3 py-2 font-bold cursor-pointer text-gray-600 focus:text-gray-900 focus:bg-gray-50 transition-colors"
                                                            >
                                                                <UserX className="h-4 w-4 mr-2" />
                                                                Mark as Not Hired
                                                            </DropdownMenuItem>

                                                            <DropdownMenuSeparator className="my-1 bg-gray-50" />
                                                            <DropdownMenuItem
                                                                onClick={() => handleUpdateStatus(candidate.id, { resumeStatus: "rejected" }, `${candidate.name} rejected`)}
                                                                className="rounded-lg px-3 py-2 font-bold text-red-600 cursor-pointer focus:text-red-700 focus:bg-red-50 transition-colors"
                                                            >
                                                                Reject Candidate
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onClick={() => handleUpdateStatus(candidate.id, { resumeStatus: "shortlisted" }, `${candidate.name} shortlisted`)}
                                                                className="rounded-lg px-3 py-2 font-bold text-emerald-600 cursor-pointer focus:text-emerald-700 focus:bg-emerald-50 transition-colors"
                                                            >
                                                                Shortlist Candidate
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </TableCell>
                                        </tr>
                                    );
                                }))}
                        </tbody>
                    </Table>
                </div>
            </div>

            <div className="px-8 py-6 border-t border-gray-50 flex items-center justify-between bg-gray-50/30">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    Showing <span className="text-gray-900">{pagination.total > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0}</span> to <span className="text-gray-900">{Math.min(pagination.page * pagination.limit, pagination.total || 0)}</span> of <span className="text-gray-900">{pagination.total || 0}</span> candidates
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
                isOpen={isActionModalOpen}
                onClose={() => { setIsActionModalOpen(false); setPendingAction(null); }}
                onConfirm={confirmBulkAction}
                title={
                    pendingAction === "hire" ? "Hire Candidates" :
                        pendingAction === "reject" ? "Reject Candidates" :
                            "Delete Candidates"
                }
                description={
                    pendingAction === "hire"
                        ? `Hire ${selectedIds.size} selected candidate(s)? A hire confirmation email will be sent to each.`
                        : pendingAction === "reject"
                            ? `Reject ${selectedIds.size} selected candidate(s)? A rejection email with careers page link will be sent to each.`
                            : `Permanently delete ${selectedIds.size} selected candidate(s)? This cannot be undone.`
                }
                confirmText={
                    pendingAction === "hire" ? `Confirm Hire (${selectedIds.size})` :
                        pendingAction === "reject" ? `Confirm Reject (${selectedIds.size})` :
                            `Confirm Delete (${selectedIds.size})`
                }
                isLoading={isBulkLoading}
            />

            {/* AI Assistant */}
            <RecruiterAssistant />

            {/* Email Composer */}
            <EmailComposer candidate={emailCandidate} onClose={() => setEmailCandidate(null)} />
        </div>
    );
}
