"use client";
import { useEffect, useState, use, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    Search, ChevronLeft, ChevronRight, X, Briefcase, AlertCircle,
    Radio, Target, ShieldCheck, UserX, Clock, Loader2, Lock,
    FileText, Eye, ArrowLeft, MoreHorizontal, RefreshCw, CheckCircle2,
} from "lucide-react";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast-custom";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateFilter, type DateRange } from "@/components/admin/date-filter";
import { motion } from "framer-motion";
import { PremiumFilter } from "@/components/admin/premium-filter";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Candidate {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    aiScore: number | null;
    resumeStatus: string;
    interviewStatus: string;
    createdAt: string;
    driveId: string;
    driveTitle: string | null;
    driveRole: string | null;
    interview: { status: string; completedAt: string | null; inviteSentAt: string | null } | null;
}
interface Drive { id: string; title: string; role: string | null; }
interface Pagination { total: number; page: number; limit: number; totalPages: number; }
interface Stats {
    shortlisted: number;
    rejected: number;
    interviewRunning: number;
    interviewPending: number;
    interviewCompleted: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function normalizeStatusKey(v?: string | null) {
    return String(v || "").trim().toLowerCase().replace(/[_-]+/g, " ");
}
function formatStatusLabel(v?: string | null) {
    const n = normalizeStatusKey(v);
    if (!n) return "Pending";
    if (n === "inprogress" || n === "in progress") return "In Progress";
    if (n === "finished" || n === "completed") return "Completed";
    if (n === "shortlisted") return "Shortlisted";
    if (n === "rejected") return "Rejected";
    if (n === "not shortlisted") return "Not Shortlisted";
    return n.replace(/\b\w/g, ch => ch.toUpperCase());
}

// ── Stats row (same as admin) ──────────────────────────────────────────────────
function CandidateStatsRow({ stats, isLoading }: { stats: Stats; isLoading: boolean }) {
    const kpis = [
        { label: "Shortlisted",  value: stats.shortlisted,       icon: Target,     color: "text-emerald-600", bg: "bg-emerald-50" },
        { label: "Rejected",     value: stats.rejected,           icon: UserX,      color: "text-rose-600",    bg: "bg-rose-50" },
        { label: "Live",         value: stats.interviewRunning,   icon: Clock,      color: "text-blue-600",    bg: "bg-blue-50",    pulse: stats.interviewRunning > 0 },
        { label: "Pending",      value: stats.interviewPending,   icon: Clock,      color: "text-gray-500",   bg: "bg-violet-50" },
        { label: "Completed",    value: stats.interviewCompleted, icon: ShieldCheck,color: "text-emerald-600", bg: "bg-emerald-50" },
    ];
    if (isLoading && stats.shortlisted === 0) return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[...Array(5)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-white/40 animate-pulse border border-white/20" />)}
        </div>
    );
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {kpis.map((kpi, idx) => (
                <motion.div key={kpi.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                    className="group relative flex items-center gap-3 p-4 bg-white/40 backdrop-blur-xl rounded-2xl border border-white/40 shadow-sm hover:shadow-md transition-all duration-300">
                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110", kpi.bg, kpi.color)}>
                        <kpi.icon className={cn("h-5 w-5", (kpi as any).pulse && "animate-pulse")} />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 truncate">{kpi.label}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xl font-black text-gray-900 tabular-nums">{kpi.value}</span>
                            {(kpi as any).pulse && kpi.value > 0 && (
                                <span className="flex h-2 w-2 relative">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                                </span>
                            )}
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function OrgCandidatesPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: orgId } = use(params);
    const router = useRouter();

    const [orgName,       setOrgName]       = useState("");
    const [candidates,    setCandidates]    = useState<Candidate[]>([]);
    const [drives,        setDrives]        = useState<Drive[]>([]);
    const [drivesLoaded,  setDrivesLoaded]  = useState(false);
    const [pagination,    setPagination]    = useState<Pagination>({ total: 0, page: 1, limit: 20, totalPages: 1 });
    const [stats,         setStats]         = useState<Stats>({ shortlisted: 0, rejected: 0, interviewRunning: 0, interviewPending: 0, interviewCompleted: 0 });
    const [isLoading,     setIsLoading]     = useState(true);
    const [error,         setError]         = useState<string | null>(null);
    const [isCandidatesTableReady, setIsCandidatesTableReady] = useState(false);
    const [sendingId,     setSendingId]     = useState<string | null>(null);
    const [confirmedId,   setConfirmedId]   = useState<string | null>(null);
    const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string } | null>(null);

    const [searchTerm,      setSearchTerm]      = useState("");
    const [resumeFilter,    setResumeFilter]    = useState("all");
    const [interviewFilter, setInterviewFilter] = useState("all");
    const [driveFilter,     setDriveFilter]     = useState("all");
    const [timeline,        setTimeline]        = useState<DateRange>({ type: "all" });
    const [pageSize,        setPageSize]        = useState(20);
    const [currentPage,     setCurrentPage]     = useState(1);

    const pageSizeRef = useRef(pageSize);

    const getDateRange = useCallback(() => {
        let startDate: string | undefined, endDate: string | undefined;
        if (timeline.type === "today") { startDate = new Date().toISOString().split("T")[0]; endDate = startDate; }
        else if (timeline.type === "week") { const d = new Date(); d.setDate(d.getDate() - 7); startDate = d.toISOString().split("T")[0]; }
        else if (timeline.type === "month") { const d = new Date(); d.setMonth(d.getMonth() - 1); startDate = d.toISOString().split("T")[0]; }
        else if (timeline.type === "custom") { startDate = timeline.from; endDate = timeline.to; }
        return { startDate, endDate };
    }, [timeline]);

    const fetchCandidates = useCallback(async (page: number, opts: {
        search?: string; driveId?: string; resumeStatus?: string; interviewStatus?: string;
        limit?: number; startDate?: string; endDate?: string;
    } = {}) => {
        try {
            const p = new URLSearchParams({ page: String(page), limit: String(opts.limit ?? pageSize) });
            if (opts.search)                                             p.set("search",          opts.search);
            if (opts.driveId         && opts.driveId !== "all")         p.set("driveId",          opts.driveId);
            if (opts.resumeStatus    && opts.resumeStatus !== "all")    p.set("resumeStatus",     opts.resumeStatus);
            if (opts.interviewStatus && opts.interviewStatus !== "all") p.set("interviewStatus",  opts.interviewStatus);
            if (opts.startDate) p.set("startDate", opts.startDate);
            if (opts.endDate)   p.set("endDate",   opts.endDate);

            const res = await fetch(`/api/super-admin/orgs/${orgId}/candidates?${p}`);
            if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `${res.status}`); }
            const data = await res.json();
            setCandidates(data.candidates ?? []);
            setPagination(data.pagination);
            if (data.stats) setStats(data.stats);
            if (!drivesLoaded && data.drives?.length) { setDrives(data.drives); setDrivesLoaded(true); }
            setError(null);
        } catch (e: any) {
            setError(e.message || "Failed to load candidates");
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orgId, pageSize, drivesLoaded]);

    // Initial org name fetch
    useEffect(() => {
        fetch(`/api/super-admin/orgs/${orgId}`)
            .then(r => r.ok ? r.json() : ({} as any))
            .then(d => setOrgName(d?.name ?? ""))
            .catch(() => {});
    }, [orgId]);

    // Filter/search change → debounced refetch
    useEffect(() => {
        setIsCandidatesTableReady(false);
        const { startDate, endDate } = getDateRange();
        const t = setTimeout(() => {
            setCurrentPage(1);
            fetchCandidates(1, { search: searchTerm, driveId: driveFilter, resumeStatus: resumeFilter, interviewStatus: interviewFilter, startDate, endDate, limit: pageSize })
                .finally(() => setIsCandidatesTableReady(true));
        }, 200);
        return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm, resumeFilter, interviewFilter, driveFilter, timeline]);

    // Initial load
    useEffect(() => {
        setIsLoading(true);
        fetchCandidates(1).finally(() => { setIsLoading(false); setIsCandidatesTableReady(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orgId]);

    // Page size change
    useEffect(() => {
        if (pageSizeRef.current === pageSize) return;
        pageSizeRef.current = pageSize;
        const { startDate, endDate } = getDateRange();
        fetchCandidates(1, { search: searchTerm, driveId: driveFilter, resumeStatus: resumeFilter, interviewStatus: interviewFilter, startDate, endDate, limit: pageSize });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageSize]);

    const handleResendLink = async (candidateId: string, displayName: string) => {
        setConfirmTarget(null);
        try {
            setSendingId(candidateId);
            const res = await fetch(`/api/candidates/${candidateId}/send-interview-link`, { method: "POST" });
            const data = await res.json().catch(() => null);
            if (res.ok) {
                toast.success(data?.message || `Interview link sent to ${displayName}`);
                setConfirmedId(candidateId);
                setTimeout(() => setConfirmedId(null), 3000);
            } else {
                toast.error(data?.error || "Failed to send interview link");
            }
        } catch { toast.error("Failed to send interview link"); }
        finally { setSendingId(null); }
    };

    const handlePageChange = (p: number) => {
        if (p < 1 || p > pagination.totalPages) return;
        setCurrentPage(p);
        const { startDate, endDate } = getDateRange();
        fetchCandidates(p, { search: searchTerm, driveId: driveFilter, resumeStatus: resumeFilter, interviewStatus: interviewFilter, startDate, endDate, limit: pageSize });
    };

    const tableIsLoading = isLoading || !isCandidatesTableReady;

    return (
        <div className="flex flex-col min-h-[135vh] space-y-8 pb-10 animate-in fade-in duration-700 font-sans" >

            {/* Header */}
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between mb-12">
                <div className="flex flex-col gap-4">
                    <button
                        onClick={() => router.back()}
                        className="group flex items-center gap-2 text-gray-400 hover:text-gray-900 text-[10px] font-black uppercase tracking-[0.2em] transition-all w-fit"
                    >
                        <ArrowLeft className="h-3 w-3 group-hover:-translate-x-1 transition-transform" />
                        Back to Organizations
                    </button>
                    <div className="flex items-center gap-5 group">
                        <div  />
                        <div className="space-y-1">
                            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Candidates</h1>
                            <div className="flex items-center gap-3">
                                <span className="h-1.5 w-1.5 rounded-full bg-[#7C3AED] animate-pulse" />
                                <p className="text-gray-400 font-bold text-[13px] uppercase tracking-[0.2em]">
                                    {orgName && <><span className="text-[#7C3AED]">{orgName}</span> · </>}
                                    {pagination.total} Total Candidates
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <CandidateStatsRow stats={stats} isLoading={isLoading} />

            {/* Error */}
            {error && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center justify-between animate-in slide-in-from-top-4">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <span className="text-xs font-bold text-red-900 uppercase tracking-tighter">{error}</span>
                    </div>
                    <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800 transition-colors"><X className="h-4 w-4" /></button>
                </div>
            )}

            {/* Table card */}
            <div className="group relative bg-white/40 backdrop-blur-xl rounded-[2.5rem] border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.03)] overflow-hidden transition-all duration-700 hover:shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-violet-400/0 via-[#7C3AED]/40 to-blue-400/0" />

                {/* Filter bar */}
                <div className="p-3 border-b border-white/40 bg-white/20">
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
                        <div className="relative flex-1 max-w-2xl w-full group/search">
                            <Search className="absolute left-4 top-3.5 h-4 w-4 text-gray-400 group-focus-within/search:text-black transition-colors" />
                            <Input
                                placeholder="Search by name, role, or email..."
                                className="pl-11 h-12 border-transparent bg-white/60 rounded-2xl focus:bg-white focus:border-gray-200 focus:ring-8 focus:ring-gray-50/50 transition-all font-bold text-sm shadow-inner"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                            {searchTerm && (
                                <button onClick={() => setSearchTerm("")} className="absolute right-4 top-3.5 text-gray-400 hover:text-gray-700">
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-2.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 no-scrollbar">
                            <DateFilter value={timeline} onChange={setTimeline} />
                            <PremiumFilter value={resumeFilter} onChange={setResumeFilter} icon={Target} placeholder="Resume"
                                options={[
                                    { value: "all",         label: "All Status" },
                                    { value: "shortlisted", label: "Shortlisted", colorClass: "text-emerald-600" },
                                    { value: "rejected",    label: "Rejected",    colorClass: "text-rose-600" },
                                    { value: "pending",     label: "Pending",     colorClass: "text-gray-600" },
                                ]} />
                            <PremiumFilter value={interviewFilter} onChange={setInterviewFilter} icon={Radio} placeholder="Interview"
                                options={[
                                    { value: "all",        label: "All Interview" },
                                    { value: "pending",    label: "Pending",     colorClass: "text-amber-600" },
                                    { value: "inprogress", label: "In Progress", colorClass: "text-blue-600" },
                                    { value: "finished",   label: "Completed",   colorClass: "text-emerald-600" },
                                ]} />
                            <PremiumFilter value={driveFilter} onChange={setDriveFilter} icon={Briefcase} placeholder="All Job Roles"
                                options={[
                                    { value: "all", label: "All Job Roles" },
                                    ...drives.map(d => ({ value: d.id, label: d.title || d.role || d.id })),
                                ]} />
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="relative w-full overflow-auto max-h-[86vh]">
                    <Table>
                        <TableHeader className="bg-gray-50/50 sticky top-0 z-10 backdrop-blur-md">
                            <TableRow className="border-b border-gray-100 hover:bg-transparent">
                                <TableHead className="w-[52px] pl-6 font-bold uppercase tracking-wider text-[11px] text-gray-500">#</TableHead>
                                <TableHead className="w-[240px] h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500">Candidate</TableHead>
                                <TableHead className="w-[180px] h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500">Job Role</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Resume</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Interview</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Resume Report</TableHead>
                                <TableHead className="h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500 text-center">Interview Report</TableHead>
                                <TableHead className="text-right pr-8 h-14 font-bold uppercase tracking-wider text-[11px] text-gray-500">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="[&_tr:last-child]:border-0">
                            {tableIsLoading ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="py-12 text-center text-sm font-bold text-gray-400">
                                        Loading candidates...
                                    </TableCell>
                                </TableRow>
                            ) : candidates.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="py-12 text-center text-sm font-bold text-gray-400">
                                        No candidates found for selected filters
                                    </TableCell>
                                </TableRow>
                            ) : candidates.map((c, index) => {
                                const displayName    = c.fullName || "Unknown";
                                const mainStatus     = normalizeStatusKey(c.resumeStatus) || "pending";
                                const mainStatusLabel = formatStatusLabel(c.resumeStatus);
                                const interviewStage = normalizeStatusKey(c.interview?.status ?? c.interviewStatus) || "pending";
                                const interviewLabel = formatStatusLabel(c.interview?.status ?? c.interviewStatus);
                                const interviewDone  = interviewStage === "completed" || interviewStage === "finished";
                                const resumeScore    = Number(c.aiScore ?? 0);

                                return (
                                    <TableRow key={c.id}
                                        className="group border-b border-white/20 hover:bg-white/40 transition-all duration-500">
                                        <TableCell className="pl-6 py-5 text-[12px] font-bold text-gray-400 tabular-nums">
                                            {index + 1 + (pagination.page - 1) * pageSize}
                                        </TableCell>
                                        <TableCell className="py-5">
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-11 w-11 border-2 border-white shadow-sm ring-1 ring-gray-100">
                                                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`} />
                                                    <AvatarFallback>{displayName.substring(0, 2).toUpperCase()}</AvatarFallback>
                                                </Avatar>
                                                <div className="flex flex-col">
                                                    <span className="text-gray-900 font-extrabold text-[15px] leading-tight">{displayName}</span>
                                                    <span className="text-[11px] text-gray-400 font-bold mt-0.5">{c.email}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-5">
                                            <div className="flex flex-col max-w-[180px]">
                                                <span className="text-sm font-bold text-gray-700 truncate">{c.driveTitle || c.driveRole || "—"}</span>
                                                {c.driveRole && c.driveTitle && (
                                                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-tighter mt-0.5 truncate">{c.driveRole}</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-5 text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                {resumeScore > 0 && (
                                                    <span className={cn("text-[11px] font-black tracking-tight",
                                                        resumeScore >= 80 ? "text-emerald-600" : resumeScore >= 50 ? "text-amber-500" : "text-rose-500")}>
                                                        {resumeScore}%
                                                    </span>
                                                )}
                                                <Badge variant="secondary" className={cn(
                                                    "rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border-0 shadow-sm pointer-events-none",
                                                    mainStatus === "shortlisted" ? "bg-emerald-50 text-emerald-700" :
                                                    mainStatus === "rejected"    ? "bg-rose-50 text-rose-700" :
                                                                                   "bg-violet-50 text-gray-500"
                                                )}>
                                                    {mainStatusLabel}
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-5 text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                <Badge variant="secondary" className={cn(
                                                    "rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border-0 shadow-sm pointer-events-none",
                                                    interviewDone                    ? "bg-emerald-50 text-emerald-700" :
                                                    interviewStage === "in progress" ? "bg-blue-50 text-blue-700" :
                                                    interviewStage === "pending"     ? "bg-violet-50 text-gray-500" :
                                                                                       "bg-amber-50 text-amber-700"
                                                )}>
                                                    {interviewLabel}
                                                </Badge>
                                                {c.interview?.completedAt && (
                                                    <span className="text-[10px] text-gray-400 font-medium">
                                                        {new Date(c.interview.completedAt).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-5 text-center">
                                            <Link
                                                href={`/super-admin/orgs/${orgId}/candidates/${c.id}?report=resume`}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#7C3AED] transition-colors hover:bg-violet-50"
                                                title="Open resume report"
                                            >
                                                <Eye className="h-4 w-4" />
                                            </Link>
                                        </TableCell>
                                        <TableCell className="py-5 text-center">
                                            {interviewDone ? (
                                                <Link
                                                    href={`/super-admin/orgs/${orgId}/candidates/${c.id}`}
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#0D4D2E] transition-colors hover:bg-emerald-50"
                                                    title="Open interview report"
                                                >
                                                    <FileText className="h-4 w-4" />
                                                </Link>
                                            ) : (
                                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-300" title="Interview not yet completed">
                                                    <Lock className="h-4 w-4" />
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="py-5 pr-8 text-right">
                                            {confirmedId === c.id ? (
                                                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-emerald-500">
                                                    <CheckCircle2 className="h-5 w-5" />
                                                </span>
                                            ) : (
                                                <DropdownMenu modal={false}>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-gray-50 transition-colors">
                                                            {sendingId === c.id
                                                                ? <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
                                                                : <MoreHorizontal className="h-4 w-4 text-gray-400" />}
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" side="bottom" sideOffset={8} collisionPadding={12}
                                                        className="w-52 p-2 rounded-2xl shadow-xl border-gray-100 bg-white">
                                                        <DropdownMenuItem
                                                            disabled={sendingId === c.id}
                                                            onClick={() => setConfirmTarget({ id: c.id, name: displayName })}
                                                            className="rounded-xl px-2.5 py-2 text-sm font-semibold cursor-pointer text-blue-600 focus:text-blue-700 focus:bg-blue-50">
                                                            <RefreshCw className="h-4 w-4 mr-2 shrink-0" />
                                                            Resend Schedule Link
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Pagination */}
            <div className="mt-auto flex flex-col gap-4 border-t border-white/20 bg-white/20 px-4 py-5 backdrop-blur-xl rounded-2xl lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                    <p className="text-[13px] font-medium text-gray-500">
                        Showing{" "}
                        <span className="text-gray-900 font-bold">{pagination.total > 0 ? (pagination.page - 1) * pageSize + 1 : 0}</span>
                        {" "}to{" "}
                        <span className="text-gray-900 font-bold">{Math.min(pagination.page * pageSize, pagination.total)}</span>
                        {" "}of{" "}
                        <span className="text-gray-900 font-bold">{pagination.total}</span> candidates
                    </p>
                    <div className="h-4 w-px bg-gray-200 hidden sm:block" />
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">Rows</span>
                        <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
                            <SelectTrigger className="h-9 w-[120px] rounded-xl border-gray-200 bg-white text-sm font-bold text-gray-700 shadow-none focus:ring-2 focus:ring-violet-100">
                                <SelectValue placeholder="Rows" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-gray-100">
                                {[20, 50, 100, 250, 500].map(o => (
                                    <SelectItem key={o} value={String(o)} className="rounded-lg font-semibold">{o} / page</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" size="sm"
                        disabled={pagination.page <= 1 || isLoading}
                        onClick={() => handlePageChange(pagination.page - 1)}
                        className="h-10 px-6 rounded-xl border-gray-200 bg-white text-gray-500 font-bold hover:bg-gray-50 hover:text-[#7C3AED] disabled:opacity-30 transition-all shadow-none">
                        <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                    </Button>
                    <Button variant="outline" size="sm"
                        disabled={pagination.page >= pagination.totalPages || isLoading}
                        onClick={() => handlePageChange(pagination.page + 1)}
                        className="h-10 px-6 rounded-xl border-gray-200 bg-white text-gray-500 font-bold hover:bg-gray-50 hover:text-[#7C3AED] disabled:opacity-30 transition-all shadow-none">
                        Next <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                </div>
            </div>

            {/* Resend Interview Link Confirmation */}
            {confirmTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="px-6 pt-6 pb-4">
                            <h2 className="text-lg font-black text-gray-900 tracking-tight">Resend Schedule Link?</h2>
                            <p className="mt-2 text-sm text-gray-600">
                                Send a new schedule link to{" "}
                                <span className="font-bold text-gray-900">{confirmTarget.name}</span>?
                                Any previously sent link will be replaced.
                            </p>
                        </div>
                        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50/50 border-t border-gray-100">
                            <button
                                onClick={() => setConfirmTarget(null)}
                                className="h-10 px-5 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={() => handleResendLink(confirmTarget.id, confirmTarget.name)}
                                disabled={sendingId === confirmTarget.id}
                                className="h-10 px-6 rounded-2xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center gap-2">
                                {sendingId === confirmTarget.id
                                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
                                    : <><RefreshCw className="h-4 w-4" /> Send Link</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
