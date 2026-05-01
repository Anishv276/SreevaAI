"use client";



import { useState } from "react";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Badge } from "@/components/ui/badge";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { Search, MoreHorizontal, Download, ChevronLeft, ChevronRight, SlidersHorizontal, Trash2, X, Briefcase, AlertCircle, UserX, Radio, Target, ShieldCheck, Award, Clock, Mail, Loader2, Lock, FileText, Eye } from "lucide-react";

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
import { getInterviewActionBlockedMessage, getInterviewQuotaSupportMessage, isInterviewQuotaLocked } from "@/lib/interview-quota";



import { DateFilter, type DateRange } from "@/components/admin/date-filter";

import { motion } from "framer-motion";

import { PremiumFilter } from "@/components/admin/premium-filter";



//  Email Composer Modal 

const VARIABLES = [

    { label: "{{name}}", desc: "Candidate full name" },

    { label: "{{role}}", desc: "Job title" },

    { label: "{{email}}", desc: "Candidate email" },

];



function EmailComposer({

    candidate,

    onClose,
    isBlocked,
    blockedMessage,

}: {

    candidate: { id: string; name: string; email: string; role: string } | null;

    onClose: () => void;

    isBlocked: boolean;

    blockedMessage: string;

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
        if (isBlocked) { toast.error(blockedMessage); return; }

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

                        disabled={sending || isBlocked}

                        className="h-10 px-6 rounded-2xl border border-gray-200 bg-white text-gray-900 font-bold flex items-center gap-2 shadow-sm hover:bg-gray-50"

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

    const { stats, isLoading, error } = useCandidates();



    const kpis = [

        { label: "Shortlisted", value: stats.shortlisted, icon: Target, color: "text-gray-900", bg: "bg-gray-100" },

        { label: "Hired", value: stats.hired, icon: Award, color: "text-gray-900", bg: "bg-gray-100" },

        { label: "Rejected", value: stats.rejected, icon: UserX, color: "text-rose-600", bg: "bg-rose-50" },

        { label: "Live", value: stats.interviewRunning, icon: Radio, color: "text-gray-900", bg: "bg-gray-100", pulse: stats.interviewRunning > 0 },

        { label: "Pending", value: stats.interviewPending, icon: Clock, color: "text-gray-500", bg: "bg-gray-50" },

        { label: "Completed", value: stats.interviewCompleted, icon: ShieldCheck, color: "text-gray-900", bg: "bg-gray-100" },

    ];



    if (error) {

        return (

            <div className="w-full h-24 rounded-2xl bg-red-50/50 border border-red-100/50 flex flex-col items-center justify-center gap-1.5 animate-in fade-in">

                <div className="flex items-center gap-2 text-red-600">

                    <AlertCircle className="h-4 w-4" />

                    <span className="text-sm font-bold">Failed to load statistics</span>

                </div>

                <p className="text-xs text-red-500 font-medium">{error}</p>

            </div>

        );

    }



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

                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gray-400 opacity-75"></span>

                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-500"></span>

                                </span>

                            )}

                        </div>

                    </div>

                </motion.div>

            ))}

        </div>

    );

}

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



export default function CandidatesPage() {

    const { candidates, pagination, isLoading, error, fetchCandidates, clearError } = useCandidates();

    const { jobs } = useJobs();

    const [searchTerm, setSearchTerm] = useState("");

    const [resumeFilter, setResumeFilter] = useState("all");

    const [interviewFilter, setInterviewFilter] = useState("all");

    const [hiringFilter, setHiringFilter] = useState("all");

    const [roleFilter, setRoleFilter] = useState("all");

    const [isSelectionMode, setIsSelectionMode] = useState(true);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [isActionModalOpen, setIsActionModalOpen] = useState(false);

    const [isExporting, setIsExporting] = useState(false);

    const [pendingAction, setPendingAction] = useState<"hire" | "reject" | "delete" | "shortlist" | "not_hired" | null>(null);

    const [isBulkLoading, setIsBulkLoading] = useState(false);

    const [emailCandidate, setEmailCandidate] = useState<{ id: string; name: string; email: string; role: string } | null>(null);

    const [timeline, setTimeline] = useState<DateRange>({ type: "all" });

    const searchParams = useSearchParams();

    const router = useRouter();

    const driveIdParam = searchParams.get("driveId");
    const orgIdParam = searchParams.get("orgId");

    // Organization Status
    const [orgStatus, setOrgStatus] = useState<string>("ACTIVE");
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
    const isSuspended = orgStatus === "SUSPENDED" || orgStatus === "CLOSED";
    const isInterviewActionBlocked = isSuspended || quotaLocked;
    const interviewActionBlockedMessage = getInterviewActionBlockedMessage(isSuspended);



    useEffect(() => {
        setRoleFilter(driveIdParam || "all");
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



    const handleMoveToDrive = (candidateDriveId?: string | null) => {
        if (!candidateDriveId) {
            toast.error("This candidate is not linked to a drive yet.");
            return;
        }

        const href = orgIdParam
            ? `/admin/candidates/drive/${encodeURIComponent(candidateDriveId)}?orgId=${encodeURIComponent(orgIdParam)}`
            : `/admin/candidates/drive/${encodeURIComponent(candidateDriveId)}`;

        router.push(href);
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



    const handleBulkAction = (action: "hire" | "reject" | "delete" | "shortlist" | "not_hired") => {

        if (selectedIds.size === 0) return;

        setPendingAction(action);

        setIsActionModalOpen(true);

    };



    const confirmBulkAction = async () => {

        if (!pendingAction) return;

        if (isSuspended && (pendingAction === "hire" || pendingAction === "shortlist" || pendingAction === "reject" || pendingAction === "not_hired")) {
            toast.error("Actions are restricted. Please resolve your account status.");
            setIsActionModalOpen(false);
            setPendingAction(null);
            return;
        }

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

            setIsSelectionMode(true);

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

            const msg = pendingAction === "hire" ? `${count} candidate(s) hired - emails sent`

                : pendingAction === "reject" ? `${count} candidate(s) marked as not hired - emails sent`

                    : pendingAction === "shortlist" ? `${count} candidate(s) shortlisted - interview emails sent`

                        : pendingAction === "not_hired" ? `${count} candidate(s) marked as not hired`

                            : `${count} candidate(s) deleted`;

            toast.success(msg);

        } catch {

            toast.error(`Failed to ${pendingAction} candidates`);

        } finally {

            setIsBulkLoading(false);

            setPendingAction(null);

        }

    };

    const handleBulkSendEmail = async (
        emailType: "screening" | "hiring",
        targetAction?: "shortlist" | "reject" | "hire" | "nothired"
    ) => {
        if (selectedIds.size === 0) return;
        setIsBulkLoading(true);
        try {
            const res = await fetch("/api/candidates/bulk-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: Array.from(selectedIds), emailType, targetAction }),
            });
            const data = await res.json().catch(() => null);
            if (res.ok) {
                toast.success(data?.message || "Emails sent");
                setSelectedIds(new Set());
                setIsSelectionMode(true);
                return;
            }
            toast.error(data?.error || "Failed to send emails");
        } catch {
            toast.error("Failed to send emails");
        } finally {
            setIsBulkLoading(false);
        }
    };



    return (
        <div className="space-y-8 pb-10 animate-in fade-in duration-700 font-sans" style={{ zoom: 0.7, transformOrigin: "top center" }}>

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

                                {pagination.total ?? 0} Total Candidates

                            </p>

                        </div>

                    </div>

                </div>



                <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                        <Button

                        variant="outline"

                        disabled={isExporting}

                        onClick={async () => {

                            try {

                                setIsExporting(true);

                                let url = `/api/candidates/export?page=1&limit=1000`;

                                if (roleFilter !== "all") url += `&driveId=${roleFilter}`;

                                if (resumeFilter !== "all") url += `&resumeStatus=${resumeFilter}`;

                                if (interviewFilter !== "all") url += `&interviewStatus=${interviewFilter}`;

                                if (hiringFilter !== "all") url += `&hiringStatus=${hiringFilter}`;



                                const res = await fetch(url);

                                if (!res.ok) {

                                    const errData = await res.json().catch(() => null);

                                    throw new Error(errData?.error || "Failed to export candidates");

                                }



                                const blob = await res.blob();

                                const downloadUrl = window.URL.createObjectURL(blob);

                                const a = document.createElement('a');

                                a.href = downloadUrl;

                                a.download = `candidates_export_${new Date().toISOString().split('T')[0]}.csv`;

                                document.body.appendChild(a);

                                a.click();

                                a.remove();

                                window.URL.revokeObjectURL(downloadUrl);

                                toast.success("Export successful - Your CSV file has been downloaded.");

                            } catch (err: any) {

                                console.error("Export error:", err);

                                toast.error(`Export Failed: ${err.message || "Failed to download export."}`);

                            } finally {

                                setIsExporting(false);

                            }

                        }}

                        className="h-12 px-6 rounded-2xl border-white/40 bg-white/40 backdrop-blur-md text-gray-600 font-bold hover:bg-white hover:text-[#F97316] transition-all shadow-sm"

                    >

                        {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}

                        {isExporting ? "Exporting..." : "Export"}

                    </Button>

                </div>

            </div>



            {/*  KPI Stats Row  */}

            <CandidateStatsRow />



            {/*  Bulk Action Bar  */}

            {selectedIds.size > 0 && (
                <div className="rounded-2xl border border-gray-200 bg-white/60 backdrop-blur-xl p-4 shadow-sm space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                            {selectedIds.size} selected
                        </span>
                    </div>

                    <div className="rounded-2xl border border-red-100 bg-red-50/40 px-3 py-2.5">
                        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-red-500 mb-2">Remove</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleBulkAction("delete")} className="h-8 px-3 rounded-xl border-red-200 text-red-600 hover:bg-red-50 font-bold text-xs flex items-center gap-1.5">
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                            </Button>
                        </div>
                    </div>
                </div>
            )}



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



            <div className="group relative bg-white/40 backdrop-blur-xl rounded-[2.5rem] border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.03)] overflow-hidden transition-all duration-700 hover:shadow-[0_20px_60px_rgba(0,0,0,0.08)] mt-10">

                {/* Decorative top accent */}

                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-400/0 via-[#F97316]/40 to-orange-400/0" />

                <div className="p-3 border-b border-white/40 bg-white/20">

                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">

                        <div className="relative flex-1 max-w-2xl w-full group/search">

                            <Search className="absolute left-4 top-3.5 h-4 w-4 text-gray-400 group-focus-within/search:text-black transition-colors" />

                            <Input

                                placeholder="Search by name, role, or email..."

                                className="pl-11 h-12 border-transparent bg-white/60 rounded-2xl focus:bg-white focus:border-gray-200 focus:ring-8 focus:ring-gray-50/50 transition-all font-bold text-sm shadow-inner"

                                value={searchTerm}

                                onChange={(e) => setSearchTerm(e.target.value)}

                            />

                        </div>

                        <div className="flex items-center gap-4 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 no-scrollbar">

                            <DateFilter

                                value={timeline}

                                onChange={setTimeline}

                            />



                            <PremiumFilter

                                value={interviewFilter}

                                onChange={setInterviewFilter}

                                icon={Radio}

                                placeholder="Interview"

                                options={[

                                    { value: "all", label: "All Interview" },

                                    { value: "pending", label: "Pending", colorClass: "text-amber-600" },

                                    { value: "inprogress", label: "In Progress", colorClass: "text-orange-600" },

                                    { value: "finished", label: "Completed", colorClass: "text-indigo-600" },

                                ]}

                            />



                            <PremiumFilter

                                value={roleFilter}

                                onChange={setRoleFilter}

                                icon={Briefcase}

                                placeholder="All Job Roles"

                                options={[

                                    { value: "all", label: "All Job Roles" },

                                    ...jobs.map(job => ({

                                        value: job.id.toString(),

                                        label: job.role || job.title || "Unknown Job"

                                    }))

                                ]}

                            />

                        </div>

                    </div>

                </div>



                <div className="relative w-full overflow-auto">

                    <Table className="table-fixed">

                        <TableHeader className="bg-gray-50/50">

                            <TableRow className="border-b border-gray-100 hover:bg-transparent">

                                <TableHead className="w-[60px] pl-8 font-bold uppercase tracking-wider text-[11px] text-gray-500">#</TableHead>

                                {isSelectionMode && (

                                    <TableHead className="w-[50px]">

                                        <Checkbox

                                            checked={selectedIds.size === filteredCandidates.length && filteredCandidates.length > 0}

                                            onCheckedChange={toggleSelectAll}

                                        />

                                    </TableHead>

                                )}

                                <TableHead className={cn("w-[240px] h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500", !isSelectionMode && "pl-3")}>Candidate</TableHead>

                                <TableHead className="w-[220px] h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500">Job Role</TableHead>

                                <TableHead className="w-[120px] h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Status</TableHead>

                                <TableHead className="w-[120px] h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Interview</TableHead>

                                <TableHead className="w-[120px] h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Decision</TableHead>

                                <TableHead className="w-[90px] h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Resume Report</TableHead>

                                <TableHead className="w-[110px] h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Interview Report</TableHead>

                                <TableHead className="w-[88px] text-right pr-8 h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500">Actions</TableHead>

                            </TableRow>

                        </TableHeader>

                        <tbody className="[&_tr:last-child]:border-0">

                            {isLoading ? (

                                <TableRow>

                                    <TableCell colSpan={isSelectionMode ? 10 : 9} className="py-12 text-center text-sm font-bold text-gray-400">

                                        Loading candidates...

                                    </TableCell>

                                </TableRow>

                            ) : filteredCandidates.length === 0 ? (

                                <TableRow>

                                    <TableCell colSpan={isSelectionMode ? 10 : 9} className="py-12 text-center text-sm font-bold text-gray-400">

                                        No candidates found for selected filters

                                    </TableCell>

                                </TableRow>

                            ) : (

                                filteredCandidates.map((candidate: any, index: number) => {

                                    const mainStatus = normalizeStatusKey(candidate.status) || "pending";
                                    const mainStatusLabel = formatCandidateStatusLabel(candidate.status);

                                    const interviewStage = normalizeStatusKey(candidate.interviewStatus) || "pending";
                                    const interviewStageLabel = formatCandidateStatusLabel(candidate.interviewStatus);

                                    const hiringDecision = normalizeStatusKey(candidate.hiringStatus) || "pending";
                                    const hiringDecisionLabel = formatCandidateStatusLabel(candidate.hiringStatus);



                                    const isHiredResult = hiringDecision === 'hired';

                                    const isNotHiredResult = hiringDecision === 'not hired';



                                    return (

                                        <tr

                                            key={candidate.id}

                                            onClick={() => isSelectionMode && toggleSelection(candidate.id)}

                                            className={cn(

                                                "group border-b border-white/20 hover:bg-white/40 transition-all duration-500",

                                                isSelectionMode && "cursor-pointer",

                                                selectedIds.has(candidate.id) && "bg-gray-100/50"

                                            )}

                                        >

                                            <TableCell className="pl-8 py-5 text-[12px] font-bold text-gray-400 tabular-nums">

                                                {index + 1 + (pagination.page - 1) * pagination.limit}

                                            </TableCell>

                                            {isSelectionMode && (

                                                <TableCell className="py-5">

                                                    <Checkbox

                                                        checked={selectedIds.has(candidate.id)}

                                                        onCheckedChange={() => toggleSelection(candidate.id)}

                                                    />

                                                </TableCell>

                                            )}

                                            <TableCell className={cn("py-5", !isSelectionMode && "pl-3")}>

                                                <div className="flex items-center gap-3">

                                                    <div className="relative group/avatar">

                                                        <Avatar className="h-11 w-11 border-2 border-white shadow-sm ring-1 ring-gray-100 group-hover/avatar:scale-105 transition-transform duration-300">

                                                            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${candidate.name}`} />

                                                            <AvatarFallback>{candidate.name.substring(0, 2).toUpperCase()}</AvatarFallback>

                                                        </Avatar>

                                                        <div className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-green-500" />

                                                    </div>

                                                    <div className="flex flex-col relative">

                                                        <span className="text-gray-900 font-extrabold text-[15px] leading-tight group-hover:text-black transition-colors">{candidate.name}</span>

                                                        <span className="text-[11px] text-gray-400 font-bold mt-0.5">{candidate.email}</span>

                                                    </div>

                                                </div>

                                            </TableCell>

                                            <TableCell className="py-5 w-[220px]">

                                                <div className="flex flex-col max-w-[220px]">

                                                    <span className="text-sm font-bold text-gray-700">{candidate.role}</span>

                                                    {candidate.location && candidate.location !== "-" && (

                                                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-tighter mt-0.5">{candidate.location}</span>

                                                    )}

                                                </div>

                                            </TableCell>

                                            <TableCell className="pt-3 pb-5 text-center align-top">

                                                <div className="flex flex-col items-center gap-1.5">

                                                    <div className="h-4 flex items-center justify-center">

                                                        {candidate.score > 0 && (

                                                            <div className={cn(

                                                                "text-[11px] font-black tracking-tight",

                                                                candidate.score >= 80 ? "text-emerald-600" :

                                                                    candidate.score >= 50 ? "text-amber-500" :

                                                                        "text-rose-500"

                                                            )}>

                                                                {candidate.score}%

                                                            </div>

                                                        )}

                                                    </div>

                                                    <Badge variant="secondary" className={cn(
                                                        "rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border shadow-sm transition-all",
                                                        mainStatus === 'shortlisted'
                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                            : mainStatus === 'rejected'
                                                                ? 'bg-rose-50 text-rose-700 border-rose-100'
                                                                : 'bg-slate-50 text-slate-600 border-slate-100'
                                                    )}>
                                                        {mainStatusLabel}
                                                    </Badge>

                                                </div>

                                            </TableCell>

                                            <TableCell className="py-5 text-center">

                                                <div className="flex justify-center items-center h-full">

                                                    <Badge variant="outline" className={cn(
                                                        "rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest shadow-sm transition-all border",
                                                        interviewStageKey === "in progress"
                                                            ? "bg-blue-50 text-blue-700 border-blue-100"
                                                            : interviewStageKey === "completed" || interviewStageKey === "finished"
                                                                ? "bg-indigo-50 text-indigo-700 border-indigo-100"
                                                                : interviewStageKey === "pending"
                                                                    ? "bg-slate-50 text-slate-500 border-slate-100"
                                                                    : "bg-white text-gray-700 border-gray-100"
                                                    )}>
                                                        {interviewStageLabel.length > 20 ? (
                                                            <span title={interviewStageLabel}>
                                                                {interviewStageLabel.substring(0, 17)}...
                                                            </span>
                                                        ) : (
                                                            interviewStageLabel
                                                        )}
                                                    </Badge>

                                                </div>

                                            </TableCell>

                                            <TableCell className="py-5 text-center">

                                                <div className="flex justify-center items-center h-full">

                                                    {isHiredResult ? (
                                                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest shadow-sm">
                                                            {hiringDecisionLabel}
                                                        </Badge>
                                                    ) : isNotHiredResult ? (
                                                        <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-100 rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest shadow-sm">
                                                            {hiringDecisionLabel}
                                                        </Badge>
                                                    ) : hiringDecision === 'not shortlisted' ? (
                                                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-100 rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest shadow-sm">
                                                            {hiringDecisionLabel}
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-100 rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest">
                                                            {hiringDecisionLabel}
                                                        </Badge>
                                                    )}

                                                </div>

                                            </TableCell>

                                            <TableCell className="py-5 text-center w-[90px]" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-center">
                                                    <Link
                                                        href={
                                                            orgIdParam
                                                                ? `/admin/candidates/${candidate.id}?report=resume&orgId=${encodeURIComponent(orgIdParam)}`
                                                                : `/admin/candidates/${candidate.id}?report=resume`
                                                        }
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#F97316] transition-colors hover:bg-orange-50"
                                                        title="Open resume report"
                                                        aria-label="Open resume report"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Link>
                                                </div>
                                            </TableCell>

                                            <TableCell className="py-5 text-center w-[110px]" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-center">
                                                    {interviewStage === "pending" ? (
                                                        <span
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-300"
                                                            title="Interview report is locked until the interview happens"
                                                            aria-label="Interview report locked"
                                                        >
                                                            <Lock className="h-4 w-4" />
                                                        </span>
                                                    ) : (
                                                        <Link
                                                            href={
                                                                orgIdParam
                                                                    ? `/admin/candidates/${candidate.id}?orgId=${encodeURIComponent(orgIdParam)}`
                                                                    : `/admin/candidates/${candidate.id}`
                                                            }
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#0D4D2E] transition-colors hover:bg-emerald-50"
                                                            title="Open interview report"
                                                            aria-label="Open interview report"
                                                        >
                                                            <FileText className="h-4 w-4" />
                                                        </Link>
                                                    )}
                                                </div>
                                            </TableCell>

                                            <TableCell className="py-5 pr-8 text-right">

                                                <div onClick={(e) => isSelectionMode && e.stopPropagation()}>

                                                    <DropdownMenu>

                                                        <DropdownMenuTrigger asChild>

                                                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-gray-50 transition-colors">

                                                                <MoreHorizontal className="h-4 w-4 text-gray-400" />

                                                            </Button>

                                                        </DropdownMenuTrigger>

                                                        <DropdownMenuContent align="end" className="w-64 p-2 rounded-xl shadow-xl border-gray-100 bg-white">
                                                            {/* Email Group */}
                                                            <DropdownMenuLabel className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Email</DropdownMenuLabel>
                                                            <DropdownMenuItem
                                                                onClick={() => {
                                                                    if (isInterviewActionBlocked) {
                                                                        toast.error(interviewActionBlockedMessage);
                                                                        return;
                                                                    }
                                                                    setEmailCandidate({ id: candidate.id, name: candidate.name, email: candidate.email, role: candidate.role });
                                                                }}
                                                                disabled={isInterviewActionBlocked}
                                                                className={cn("rounded-lg px-3 py-2 font-bold cursor-pointer transition-colors", isInterviewActionBlocked ? "text-gray-400 opacity-70" : "text-blue-600 focus:text-blue-700 focus:bg-blue-50")}
                                                            >
                                                                {isInterviewActionBlocked ? <Lock className="h-4 w-4 mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                                                                Send Mail
                                                            </DropdownMenuItem>

                                                            <DropdownMenuSeparator className="my-1 bg-gray-50" />

                                                            {/* Drive Group */}
                                                            <DropdownMenuLabel className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Drive</DropdownMenuLabel>
                                                            <DropdownMenuItem
                                                                onClick={() => handleMoveToDrive(candidate.driveId)}
                                                                disabled={!candidate.driveId}
                                                                className={cn(
                                                                    "rounded-lg px-3 py-2 font-bold cursor-pointer transition-colors",
                                                                    candidate.driveId ? "text-gray-700 focus:text-gray-900 focus:bg-gray-50" : "text-gray-400 opacity-70"
                                                                )}
                                                            >
                                                                <Briefcase className="h-4 w-4 mr-2" />
                                                                Move to Drive
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

                        pendingAction === "shortlist" ? "Shortlist Candidates" :

                            pendingAction === "not_hired" ? "Mark as Not Hired" :

                                pendingAction === "reject" ? "Mark as Not Hired" :

                                    "Delete Candidates"

                }

                description={

                    pendingAction === "hire"

                        ? `Hire ${selectedIds.size} selected candidate(s)? A hire confirmation email will be sent to each.`

                        : pendingAction === "shortlist"

                            ? `Shortlist ${selectedIds.size} selected candidate(s)? An interview invitation email will be sent to each.`

                            : pendingAction === "not_hired" || pendingAction === "reject"

                                ? `Mark ${selectedIds.size} selected candidate(s) as Not Hired? A rejection email will be sent to each.`

                                : `Permanently delete ${selectedIds.size} selected candidate(s)? This cannot be undone.`

                }

                confirmText={

                    pendingAction === "hire" ? `Confirm Hire (${selectedIds.size})` :

                        pendingAction === "shortlist" ? `Shortlist (${selectedIds.size})` :

                            pendingAction === "not_hired" || pendingAction === "reject" ? `Not Hired (${selectedIds.size})` :

                                `Confirm Delete (${selectedIds.size})`

                }

                isLoading={isBulkLoading}

            />

            {/* AI Assistant */}





            {/* Email Composer */}

            <EmailComposer
                candidate={emailCandidate}
                onClose={() => setEmailCandidate(null)}
                isBlocked={isInterviewActionBlocked}
                blockedMessage={interviewActionBlockedMessage}
            />

        </div>

    );

}
