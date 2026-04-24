"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, LifeBuoy, Search, Loader2, MessageSquare, Clock3, Building2, Mail, User, CheckCircle2, CircleDot, ArrowRight, ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SupportTicket = {
    id: string;
    name: string;
    email: string;
    issueAbout: string;
    status: "OPEN" | "RESOLVED" | "CLOSED" | string;
    createdAt: string;
    resolvedAt?: string | null;
    interviewId?: string | null;
    applicationId?: string | null;
    interview?: {
        id: string;
        application?: {
            id: string;
            fullName: string;
            email: string;
            drive?: {
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
        ticket.interview?.application?.fullName?.trim() || ticket.name || "Unknown candidate";

    const candidateEmail = (ticket: SupportTicket) =>
        ticket.interview?.application?.email?.trim() || ticket.email || "Unknown email";

    const orgName = (ticket: SupportTicket) =>
        ticket.interview?.application?.drive?.organization?.name?.trim() || "No organization";

    const orgSlug = (ticket: SupportTicket) =>
        ticket.interview?.application?.drive?.organization?.slug?.trim() || "";

    const driveTitle = (ticket: SupportTicket) =>
        ticket.interview?.application?.drive?.title?.trim() || "Interview";

    const visibleStats = useMemo(() => ([
        { label: "Total Tickets", value: stats.total, icon: MessageSquare, color: "text-blue-600", bg: "bg-blue-50" },
        { label: "Open", value: stats.openCount, icon: CircleDot, color: "text-amber-600", bg: "bg-amber-50" },
        { label: "Resolved", value: stats.resolvedCount, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
        { label: "Closed", value: stats.closedCount, icon: ShieldAlert, color: "text-gray-600", bg: "bg-gray-100" },
    ]), [stats]);

    return (
        <div className="space-y-8 pb-12">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between animate-fade-slide">
                <div className="flex items-center gap-5 group">
                    <div className="h-14 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-500 rounded-full shadow-[0_0_15px_rgba(249,115,22,0.5)] transition-all duration-500 group-hover:h-16" />
                    <div className="space-y-1">
                        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-none tracking-tight">
                            Support Tickets
                        </h1>
                        <div className="flex items-center gap-3">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#F97316] animate-pulse" />
                            <p className="text-gray-400 font-bold text-[12px] uppercase tracking-[0.15em]">
                                Candidate issues and interview help requests
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap justify-end">
                    <Link href="/super-admin">
                        <button className="flex items-center gap-2 bg-white border border-gray-200 hover:border-orange-200 text-gray-700 text-[13px] font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm">
                            <ArrowRight className="h-4 w-4 rotate-180" />
                            Back to Dashboard
                        </button>
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {visibleStats.map((item) => (
                    <div key={item.label} className="group relative flex flex-col gap-2 p-5 bg-white/70 backdrop-blur-xl rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-orange-500/5 transition-all duration-500 hover:-translate-y-1">
                        <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-500 group-hover:scale-110 shadow-sm", item.bg, item.color)}>
                            <item.icon className="h-6 w-6" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">{item.label}</span>
                        <span className="text-2xl font-black text-gray-900 tabular-nums tracking-tighter">{item.value?.toLocaleString?.() || item.value || 0}</span>
                    </div>
                ))}
            </div>

            <div className="bg-white border border-gray-100 rounded-[2.5rem] p-8 shadow-sm space-y-6">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
                    <div className="space-y-1">
                        <h2 className="text-xl font-bold text-gray-900 tracking-tight">Ticket Queue</h2>
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">View and manage support requests from interview sessions</p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative min-w-[260px]">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") setSearch(searchInput.trim());
                                }}
                                placeholder="Search by name, email, org, or issue..."
                                className="pl-11 h-11 rounded-xl border-gray-200 bg-gray-50/40"
                            />
                        </div>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-700"
                        >
                            <option value="ALL">All statuses</option>
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
                            className="h-11 rounded-xl bg-[#F97316] text-white hover:bg-orange-600 font-bold"
                        >
                            Filter
                        </Button>
                    </div>
                </div>

                {loading ? (
                    <div className="py-16 flex justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
                    </div>
                ) : tickets.length === 0 ? (
                    <div className="py-16 text-center space-y-4">
                        <div className="h-16 w-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto text-gray-300">
                            <LifeBuoy className="h-8 w-8" />
                        </div>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No support tickets found</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                        {tickets.map((ticket) => (
                            <div key={ticket.id} className="rounded-[2rem] border border-gray-100 bg-gray-50/30 p-5 hover:border-orange-100 hover:bg-white hover:shadow-[0_10px_30px_rgba(0,0,0,0.03)] transition-all">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-4 min-w-0">
                                        <div className="h-11 w-11 rounded-xl bg-gray-900 text-white flex items-center justify-center font-black text-sm shadow-sm shrink-0">
                                            {candidateName(ticket)[0]?.toUpperCase() || "?"}
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-base font-bold text-gray-900 truncate">{candidateName(ticket)}</h3>
                                            <p className="text-sm text-gray-500 flex items-center gap-2 truncate">
                                                <Mail className="h-3.5 w-3.5" />
                                                {candidateEmail(ticket)}
                                            </p>
                                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Clock3 className="h-3 w-3" />
                                                    {new Date(ticket.createdAt).toLocaleString()}
                                                </span>
                                                {ticket.interview?.application?.drive?.organization?.name && (
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <Building2 className="h-3 w-3" />
                                                        {orgName(ticket)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <span className={cn("px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] border", statusColor(ticket.status))}>
                                        {ticket.status}
                                    </span>
                                </div>

                                <div className="mt-5 rounded-2xl bg-white border border-gray-100 p-4">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Issue About</p>
                                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                                        {ticket.issueAbout}
                                    </p>
                                </div>

                                <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                    {ticket.interviewId && <span className="rounded-full bg-gray-100 px-3 py-1">Interview: {ticket.interviewId}</span>}
                                    {ticket.applicationId && <span className="rounded-full bg-gray-100 px-3 py-1">Application: {ticket.applicationId}</span>}
                                    {ticket.interview?.application?.drive?.title && (
                                        <span className="rounded-full bg-gray-100 px-3 py-1">Drive: {driveTitle(ticket)}</span>
                                    )}
                                    {orgSlug(ticket) && <span className="rounded-full bg-orange-50 text-[#F97316] px-3 py-1">/{orgSlug(ticket)}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex items-center justify-between gap-4 pt-4 border-t border-gray-100">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                        Page {page} of {totalPages}
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            className="h-10 rounded-xl"
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            className="h-10 rounded-xl"
                        >
                            Next
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
