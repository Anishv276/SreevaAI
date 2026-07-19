"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, LifeBuoy, Search, Loader2, MessageSquare, Clock3, Building2, Mail, User, CheckCircle2, CircleDot, ArrowRight, ShieldAlert, Check, MoreVertical, Eye, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast-custom";
import { reportClientError } from "@/lib/client-error-reporter";
type SupportTicket = {
    id: string;
    reporterName: string;
    reporterEmail: string;
    issueDescription: string;
    ticketStatus: "OPEN" | "RESOLVED" | "CLOSED" | string;
    ticketCreatedAt: string;
    ticketResolvedAt?: string | null;
    interviewId?: string | null;
    applicationId?: string | null;
    interview?: {
        id: string;
        application?: {
            id: string;
            fullName: string;
            email: string;
            job?: {
                id: string;
                title: string;
                organization?: { id: string; name: string; slug: string; plan: string } | null;
            } | null;
        } | null;
    } | null;
};
export default function SuperAdminSupportPage() {
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [stats, setStats] = useState({ total: 0, openCount: 0, resolvedCount: 0, closedCount: 0 });
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("ALL");
    const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
    const [viewTicket, setViewTicket] = useState<SupportTicket | null>(null);
    const handleUpdateStatus = async (id: string, newStatus: string) => {
        const ticket = tickets.find(t => t.id === id);
        if (!ticket || ticket.ticketStatus === newStatus) return;
        setUpdatingStatus(id);
        try {
            const res = await fetch("/api/super-admin/support-tickets", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, status: newStatus }),
            });
            if (res.ok) {
                setTickets(prev => prev.map(t => t.id === id ? { ...t, ticketStatus: newStatus } : t));
                toast.success(`Ticket status updated to ${newStatus}`);
                // Refresh stats
                void fetchTickets(page, search, status);
            } else {
                toast.error("Failed to update status");
            }
        } catch (error) {
            console.error("Status update error:", error);
            toast.error("An error occurred while updating status");
            reportClientError(error, { action: "update_support_ticket_status" });
        } finally {
            setUpdatingStatus(null);
        }
    };
    const fetchTickets = async (currentPage = page, currentSearch = search, currentStatus = status) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(currentPage),
                limit: "20",
                ...(currentSearch ? { q: currentSearch } : {}),
                ...(currentStatus ? { status: currentStatus } : {}),
            });
            const res = await fetch(`/api/super-admin/support-tickets?${params.toString()}`);
            const data = await res.json();
            if (res.ok) {
                setTickets(Array.isArray(data.tickets) ? data.tickets : []);
                setTotalPages(Number(data.pagination?.totalPages || 1));
                setStats(data.stats || { total: 0, openCount: 0, resolvedCount: 0, closedCount: 0 });
            } else {
                setTickets([]);
            }
        } catch (error) {
            console.error("Support ticket fetch failed", error);
            setTickets([]);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        void fetchTickets();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, search, status]);
    const statusColor = (ticketStatus: string) => ({
        OPEN: "bg-amber-50 text-amber-700 border-amber-100",
        RESOLVED: "bg-emerald-50 text-emerald-700 border-emerald-100",
        CLOSED: "bg-gray-50 text-gray-600 border-gray-200",
    }[ticketStatus] || "bg-gray-50 text-gray-500 border-gray-100");
    const candidateName = (ticket: SupportTicket) =>
        ticket.interview?.application?.fullName?.trim() || ticket.reporterName || "Unknown candidate";
    const candidateEmail = (ticket: SupportTicket) =>
        ticket.interview?.application?.email?.trim() || ticket.reporterEmail || "Unknown email";
    const orgName = (ticket: SupportTicket) =>
        ticket.interview?.application?.job?.organization?.name?.trim() || "No organization";
    const orgSlug = (ticket: SupportTicket) =>
        ticket.interview?.application?.job?.organization?.slug?.trim() || "";
    const jobTitle = (ticket: SupportTicket) =>
        ticket.interview?.application?.job?.title?.trim() || "Interview";
    const visibleStats = useMemo(() => ([
        { label: "Total Tickets", value: stats.total, icon: MessageSquare, color: "text-blue-600", bg: "bg-blue-50" },
        { label: "Open", value: stats.openCount, icon: CircleDot, color: "text-amber-600", bg: "bg-amber-50" },
        { label: "Resolved", value: stats.resolvedCount, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
        { label: "Closed", value: stats.closedCount, icon: ShieldAlert, color: "text-gray-600", bg: "bg-gray-100" },
    ]), [stats]);
    return (
        <div className="space-y-6 pb-10 animate-in fade-in duration-500">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Support Tickets</h1>
                    <p className="text-sm text-gray-400 mt-0.5">Manage interview help requests</p>
                </div>
                <Link href="/super-admin">
                    <button className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-white text-sm font-medium text-gray-500 hover:text-violet-600 hover:bg-violet-50 transition-all" style={{ border: "1px solid #E9E7FF" }}>
                        <ArrowRight className="h-3.5 w-3.5 rotate-180" />
                        Overview
                    </button>
                </Link>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {visibleStats.map((item) => (
                    <div key={item.label} className="flex items-center gap-3 p-3.5 bg-white rounded-xl border border-gray-100 shadow-sm transition-all hover:border-gray-200">
                        <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0 shadow-sm", item.bg, item.color)}>
                            <item.icon className="h-4.5 w-4.5" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide leading-none mb-1">{item.label}</span>
                            <span className="text-lg font-black text-gray-900 tabular-nums leading-none">{item.value?.toLocaleString?.() || item.value || 0}</span>
                        </div>
                    </div>
                ))}
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h2 className="text-sm font-bold text-gray-900">Recent Tickets</h2>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                            <Input
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") setSearch(searchInput.trim());
                                }}
                                placeholder="Search..."
                                className="pl-8 h-8 w-48 text-xs rounded-lg border-gray-200 bg-gray-50/50"
                            />
                        </div>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-[11px] font-bold text-gray-800 outline-none focus:border-violet-500 transition-colors"
                        >
                            <option value="ALL">Status: All</option>
                            <option value="OPEN">Open</option>
                            <option value="RESOLVED">Resolved</option>
                            <option value="CLOSED">Closed</option>
                        </select>
                        <Button
                            onClick={() => {
                                setSearch(searchInput.trim());
                                void fetchTickets(1, searchInput.trim(), status);
                                setPage(1);
                            }}
                            className="h-8 px-4 rounded-lg bg-gray-900 text-white hover:bg-gray-800 text-[11px] font-bold"
                        >
                            Filter
                        </Button>
                    </div>
                </div>
                {loading ? (
                    <div className="py-16 flex justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                    </div>
                ) : tickets.length === 0 ? (
                    <div className="py-16 text-center space-y-4">
                        <div className="h-16 w-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto text-gray-300">
                            <LifeBuoy className="h-8 w-8" />
                        </div>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No support tickets found</p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50/30">
                                        <th className="pl-5 py-3 text-left font-bold text-[10px] text-gray-400 uppercase tracking-wider">Candidate</th>
                                        <th className="px-4 py-3 text-left font-bold text-[10px] text-gray-400 uppercase tracking-wider">Application ID</th>
                                        <th className="px-4 py-3 text-left font-bold text-[10px] text-gray-400 uppercase tracking-wider">Organization</th>
                                        <th className="px-4 py-3 text-left font-bold text-[10px] text-gray-400 uppercase tracking-wider">Job</th>
                                        <th className="px-4 py-3 text-left font-bold text-[10px] text-gray-400 uppercase tracking-wider">Issue</th>
                                        <th className="px-4 py-3 text-center font-bold text-[10px] text-gray-400 uppercase tracking-wider">Reported At</th>
                                        <th className="pr-5 py-3 text-right font-bold text-[10px] text-gray-400 uppercase tracking-wider">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {tickets.map((ticket) => (
                                        <tr key={ticket.id} className="hover:bg-gray-50/80 transition-colors">
                                            <td className="pl-5 py-4">
                                                <div className="flex flex-col min-w-[140px]">
                                                    <span className="text-gray-900 font-bold text-[12px] truncate">{candidateName(ticket)}</span>
                                                    <span className="text-[10px] text-gray-400 truncate">{candidateEmail(ticket)}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span 
                                                    className="text-[10px] font-medium text-gray-500 tabular-nums truncate whitespace-nowrap max-w-[180px] inline-block"
                                                    title={ticket.applicationId || ticket.interviewId || "N/A"}
                                                >
                                                    {ticket.applicationId || ticket.interviewId || "N/A"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="text-[11px] font-bold text-gray-700 truncate max-w-[120px]">
                                                    {orgName(ticket)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="text-[10px] font-medium text-gray-400 truncate uppercase max-w-[120px]">
                                                    {jobTitle(ticket)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-2 group/issue min-w-[150px]">
                                                    <p className="text-[11px] text-gray-600 line-clamp-1">
                                                        {ticket.issueDescription}
                                                    </p>
                                                    <button 
                                                        onClick={() => setViewTicket(ticket)}
                                                        className="text-gray-300 hover:text-violet-500 transition-colors shrink-0"
                                                    >
                                                        <Eye className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <div className="flex flex-col items-center min-w-[90px]">
                                                    <span className="text-[10px] font-bold text-gray-700 tabular-nums">
                                                        {new Date(ticket.ticketCreatedAt).toLocaleDateString()}
                                                    </span>
                                                    <span className="text-[9px] text-gray-400 font-medium tabular-nums">
                                                        {new Date(ticket.ticketCreatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="pr-5 py-4 text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <button 
                                                            disabled={updatingStatus === ticket.id}
                                                            className={cn(
                                                                "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase border shadow-sm transition-all hover:bg-white active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
                                                                (ticket.ticketStatus || "OPEN") === "OPEN" ? "bg-amber-50 border-amber-200 text-amber-700" :
                                                                (ticket.ticketStatus || "OPEN") === "RESOLVED" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
                                                                "bg-gray-50 border-gray-200 text-gray-600"
                                                            )}
                                                        >
                                                            <div className={cn("h-1.5 w-1.5 rounded-full", ticket.ticketStatus === 'OPEN' ? "bg-amber-500" : ticket.ticketStatus === 'RESOLVED' ? "bg-emerald-500" : "bg-gray-400")} />
                                                            {ticket.ticketStatus}
                                                            <ChevronDown className="h-3 w-3 opacity-50" />
                                                        </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-40 rounded-xl border border-gray-200 bg-white p-2 shadow-2xl">
                                                        {["OPEN", "RESOLVED", "CLOSED"].map((s) => (
                                                            <DropdownMenuItem
                                                                key={s}
                                                                className={cn(
                                                                    "flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-[10px] font-bold",
                                                                    ticket.ticketStatus === s ? "bg-violet-50 text-violet-600" : "text-gray-700 hover:bg-gray-50"
                                                                )}
                                                                onClick={() => handleUpdateStatus(ticket.id, s)}
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <div className={cn("h-1.5 w-1.5 rounded-full", s === 'OPEN' ? "bg-amber-500" : s === 'RESOLVED' ? "bg-emerald-500" : "bg-gray-400")} />
                                                                    {s}
                                                                </div>
                                                                {ticket.ticketStatus === s && <Check className="h-3.5 w-3.5" />}
                                                            </DropdownMenuItem>
                                                        ))}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/20 flex items-center justify-between">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                Page <span className="text-gray-900">{page}</span> of <span className="text-gray-900">{totalPages}</span>
                            </p>
                            <div className="flex items-center gap-1.5">
                                <button
                                    disabled={page <= 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-all"
                                >
                                    Previous
                                </button>
                                <button
                                    disabled={page >= totalPages}
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-all"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
            <Dialog open={!!viewTicket} onOpenChange={(open) => !open && setViewTicket(null)}>
            <DialogContent className="max-w-xl rounded-[2rem] border border-gray-100 bg-white p-8 shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="text-lg font-bold text-gray-900 mb-4">Issue Description</DialogTitle>
                </DialogHeader>
                <div className="rounded-2xl bg-gray-50/50 border border-gray-100 p-6">
                        <p className="text-[15px] text-gray-700 leading-relaxed whitespace-pre-wrap font-medium">
                            {viewTicket?.issueDescription}
                        </p>
                    </div>
                    <div className="mt-6 flex justify-end">
                        <Button 
                            onClick={() => setViewTicket(null)}
                            className="bg-gray-900 text-white hover:bg-gray-800 rounded-xl font-bold text-xs px-8 h-10 shadow-sm"
                        >
                            Close
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
