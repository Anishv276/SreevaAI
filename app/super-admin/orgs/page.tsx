"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { 
    Edit2, 
    Plus, 
    Users, 
    Briefcase, 
    Search,
    Eye,
    Loader2,
    Layers,
    Globe,
} from "lucide-react";
import { Skeleton as Shimmer } from "@/components/ui/skeleton";
import { ActionConfirmModal } from "@/components/ui/action-confirm-modal";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast-custom";

interface Org {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
    adminCount: number;
    driveCount: number;
    candidateCount: number;
    _count?: {
        users: number;
        drives: number;
    };
}

export default function OrgsPage() {
    const [orgs, setOrgs] = useState<Org[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    
    // Pagination & Search state
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const limit = 20;

    // Modal State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [orgToDelete, setOrgToDelete] = useState<Org | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [syncingOrgs, setSyncingOrgs] = useState<Set<string>>(new Set());

    const fetchOrgs = async (currentPage = page, query = search) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(currentPage),
                limit: String(limit),
                ...(query ? { q: query } : {}),
            });
            const res = await fetch(`/api/super-admin/orgs?${params}`);
            const data = await res.json();
            if (data.orgs) {
                setOrgs(data.orgs);
                setTotal(data.pagination.total);
                setTotalPages(data.pagination.totalPages);
            } else {
                setOrgs([]);
            }
        } catch (error) {
            console.error("Error fetching orgs:", error);
            setOrgs([]);
        } finally {
            setLoading(false);
        }
    };

    // Debounced search — waits 300ms after user stops typing before hitting the API
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchInput);
            setPage(1);
        }, 200);
        return () => clearTimeout(timer);
    }, [searchInput]);

    useEffect(() => {
        fetchOrgs(page, search);
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setActiveMenu(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, search]);


    const deleteOrg = async (org: Org) => {
        setOrgToDelete(org);
        setIsDeleteModalOpen(true);
    };

    const handleStatusChange = async (orgId: string, newStatus: string) => {
        const previousOrg = orgs.find(o => o.id === orgId);
        if (!previousOrg || previousOrg.status === newStatus) return;

        // OPTIMISTIC UPDATE: Change UI instantly
        setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, status: newStatus } : o));
        setSyncingOrgs(prev => new Set(prev).add(orgId));

        try {
            const res = await fetch(`/api/super-admin/orgs/${orgId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });
            
            if (!res.ok) {
                throw new Error("Failed to update status");
            }
            toast.success(`${previousOrg.name} status updated to ${newStatus.toLowerCase()}`);
        } catch (error) {
            // ROLLBACK: Revert to previous state on failure
            setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, status: previousOrg.status } : o));
            toast.error("Cloud sync failed. Reverting status.");
        } finally {
            setSyncingOrgs(prev => {
                const updated = new Set(prev);
                updated.delete(orgId);
                return updated;
            });
        }
    };

    const confirmDelete = async () => {
        if (!orgToDelete) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/super-admin/orgs/${orgToDelete.id}`, { method: "DELETE" });
            if (res.ok) {
                fetchOrgs(page, search);
                setIsDeleteModalOpen(false);
                setOrgToDelete(null);
            }
        } catch (error) {
            console.error("Error deleting org:", error);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-8 pb-12 animate-in-fade">
            
            {/* Header Area */}
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-center gap-4 group">
                    <div className="h-12 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full shadow-[0_0_12px_rgba(249,115,22,0.4)] transition-all duration-300 group-hover:h-14" />
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Organizations</h1>
                        <p className="text-gray-500 font-medium mt-1 text-base">Partner registry · {total} organizations</p>
                    </div>
                </div>
                <Link
                    href="/super-admin/orgs/new"
                    className="flex items-center gap-2 bg-[#F97316] hover:bg-orange-600 text-white text-[13.5px] font-medium px-4 py-2 rounded-lg transition-all duration-150 shadow-sm hover:shadow-md"
                >
                    <Plus className="h-4 w-4" />
                    Onboard Partner
                </Link>
            </div>

            {/* Search Section */}
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="h-6 w-1 bg-[#F97316] rounded-full" />
                        <h2 className="text-lg font-bold text-gray-900">Partner Registry</h2>
                    </div>
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-gray-900" />
                        <input
                            type="text"
                            placeholder="Search organizations..."
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            className="h-10 w-[300px] pl-10 pr-4 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-[#F97316]/30 focus:border-[#F97316] transition-all"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden animate-in-fade">
                        <div className="grid grid-cols-[2.5fr_1.5fr_1fr_1fr_1.5fr_1.2fr] gap-4 px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                             {Array(6).fill(0).map((_, i) => <Shimmer key={i} className="h-4 w-20 rounded-md" />)}
                        </div>
                        <div className="divide-y divide-gray-100">
                             {Array(5).fill(0).map((_, i) => (
                                <div key={i} className="grid grid-cols-[2.5fr_1.5fr_1fr_1fr_1.5fr_1.2fr] gap-4 px-6 py-6 items-center">
                                    <div className="flex items-center gap-4">
                                        <Shimmer className="h-10 w-10 rounded-full flex-shrink-0" />
                                        <div className="space-y-2">
                                            <Shimmer className="h-4 w-32" />
                                            <Shimmer className="h-3 w-20" />
                                        </div>
                                    </div>
                                    <Shimmer className="h-4 w-24" />
                                    <Shimmer className="h-6 w-8 mx-auto" />
                                    <Shimmer className="h-6 w-8 mx-auto" />
                                    <Shimmer className="h-8 w-24 mx-auto rounded-full" />
                                    <Shimmer className="h-10 w-10 ml-auto rounded-xl" />
                                </div>
                             ))}
                        </div>
                    </div>
                ) : (
                    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                        {/* Table Header */}
                        <div className="grid grid-cols-[2.2fr_1.2fr_0.8fr_0.8fr_1fr_1.2fr_1.2fr] gap-4 px-6 py-4 border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/50">
                            <span>ORGANIZATION</span>
                            <span>IDENTIFIER</span>
                            <span className="text-center">ADMINS</span>
                            <span className="text-center">DRIVES</span>
                            <span className="text-center">CANDIDATES</span>
                            <span className="text-center">STATUS</span>
                            <span className="text-right">ACTIONS</span>
                        </div>

                        <div className="divide-y divide-gray-100">
                            {orgs.map((org) => (
                                <div key={org.id} className="grid grid-cols-[2.2fr_1.2fr_0.8fr_0.8fr_1fr_1.2fr_1.2fr] gap-4 px-6 py-4 items-center hover:bg-gray-50 transition-all group">
                                    {/* Sidebar Circle + Info Block */}
                                    <div className="flex items-center gap-4">
                                        <div className="h-10 w-10 rounded-full bg-gray-900 text-white flex flex-shrink-0 items-center justify-center font-bold text-sm shadow-sm group-hover:scale-105 transition-transform">
                                            {org.name[0].toUpperCase()}
                                        </div>
                                        <div className="flex flex-col truncate">
                                            <p className="text-gray-900 font-bold text-[14.5px] truncate">{org.name}</p>
                                            <p className="text-gray-500 text-[11px] font-medium truncate uppercase tracking-widest leading-tight">{org.plan} Protocol</p>
                                        </div>
                                    </div>

                                    {/* Identifier/Slug */}
                                    <div className="flex flex-col gap-1.5 truncate">
                                        <div className="flex items-center gap-2">
                                             <Globe className="h-3.5 w-3.5 text-gray-400 group-hover:text-[#F97316] transition-colors" />
                                             <p className="text-gray-700 font-bold text-[11.5px] uppercase tracking-widest truncate">/{org.slug}</p>
                                        </div>
                                        <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest ml-5.5 leading-none">Internal ID</p>
                                    </div>

                                    <div className="text-center font-black text-gray-950 text-base tabular-nums tracking-tighter">
                                        {org.adminCount ?? org._count?.users ?? 0}
                                    </div>

                                    <div className="text-center font-black text-gray-950 text-base tabular-nums tracking-tighter">
                                        {org.driveCount ?? org._count?.drives ?? 0}
                                    </div>

                                    <div className="text-center font-black text-[#F97316] text-base tabular-nums tracking-tighter">
                                        {org.candidateCount || 0}
                                    </div>

                                    <div className="flex justify-center">
                                        <div className="relative group/status">
                                            <Select 
                                                value={org.status || "ACTIVE"} 
                                                onValueChange={(val) => handleStatusChange(org.id, val)}
                                                disabled={syncingOrgs.has(org.id)}
                                            >
                                                <SelectTrigger className={`h-8 w-[110px] rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all duration-300 shadow-sm hover:shadow-md focus:ring-0 focus:ring-offset-0 ${
                                                    (org.status || "ACTIVE") === "ACTIVE" 
                                                    ? 'bg-emerald-50/50 border-emerald-100 text-emerald-700 hover:bg-emerald-100/50' 
                                                    : (org.status || "ACTIVE") === "SUSPENDED"
                                                    ? 'bg-amber-50/50 border-amber-100 text-amber-700 hover:bg-amber-100/50'
                                                    : 'bg-rose-50/50 border-rose-100 text-rose-700 hover:bg-rose-100/50'
                                                }`}>
                                                    <div className="flex items-center gap-2 w-full">
                                                        {syncingOrgs.has(org.id) ? (
                                                            <Loader2 className="h-2.5 w-2.5 animate-spin text-gray-400" />
                                                        ) : (
                                                            <div className={`h-1.5 w-1.5 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(0,0,0,0.1)] ${
                                                                (org.status || "ACTIVE") === "ACTIVE" 
                                                                ? 'bg-emerald-500 shadow-emerald-200 animate-pulse' 
                                                                : (org.status || "ACTIVE") === "SUSPENDED"
                                                                ? 'bg-amber-500 shadow-amber-200'
                                                                : 'bg-rose-500 shadow-rose-200'
                                                            }`} />
                                                        )}
                                                        <SelectValue />
                                                    </div>
                                                </SelectTrigger>
                                                <SelectContent className="rounded-xl border-gray-100 shadow-[0_10px_40px_rgba(0,0,0,0.08)] p-1.5 min-w-[130px] animate-in zoom-in-95 duration-200">
                                                    <SelectItem value="ACTIVE" className="rounded-lg font-bold uppercase text-[9px] tracking-widest text-emerald-600 focus:bg-emerald-50 focus:text-emerald-700 py-2.5 mb-0.5 cursor-pointer">
                                                        <span className="flex items-center gap-2">
                                                            <div className="h-1 w-1 rounded-full bg-emerald-500" />
                                                            Active
                                                        </span>
                                                    </SelectItem>
                                                    <SelectItem value="SUSPENDED" className="rounded-lg font-bold uppercase text-[9px] tracking-widest text-amber-600 focus:bg-amber-50 focus:text-amber-700 py-2.5 mb-0.5 cursor-pointer">
                                                        <span className="flex items-center gap-2">
                                                            <div className="h-1 w-1 rounded-full bg-amber-500" />
                                                            Suspend
                                                        </span>
                                                    </SelectItem>
                                                    <SelectItem value="CLOSED" className="rounded-lg font-bold uppercase text-[9px] tracking-widest text-rose-600 focus:bg-rose-50 focus:text-rose-700 py-2.5 cursor-pointer">
                                                        <span className="flex items-center gap-2">
                                                            <div className="h-1 w-1 rounded-full bg-rose-500" />
                                                            Close
                                                        </span>
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                            
                                            {/* Sync status tooltip indicator */}
                                            {syncingOrgs.has(org.id) && (
                                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[8px] font-black uppercase px-2 py-0.5 rounded shadow-xl animate-bounce">
                                                    Syncing
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center justify-end gap-2">
                                        {/* View Dropdown */}
                                        <div className="relative overflow-visible" ref={(el) => {
                                            if (el && activeMenu === org.id) {
                                                // @ts-ignore
                                                menuRef.current = el;
                                            }
                                        }}>
                                            <button 
                                                onClick={() => setActiveMenu(activeMenu === org.id ? null : org.id)}
                                                className="h-9 flex items-center gap-2 px-4 rounded-lg bg-gray-50 text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-all border border-transparent hover:border-gray-200 shadow-sm text-[11px] font-bold uppercase tracking-widest active:scale-95"
                                            >
                                                <Eye className="h-3.5 w-3.5" />
                                                View
                                            </button>

                                            {activeMenu === org.id && (
                                                <div className="absolute right-0 top-11 w-52 bg-white border border-gray-100 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.1)] p-2 z-[100] animate-in-up duration-200">
                                                    <Link
                                                        href={`/super-admin/orgs/${org.id}/view?tab=drives`}
                                                        onClick={() => setActiveMenu(null)}
                                                        className="flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-blue-50 text-gray-900 transition-colors group/item"
                                                    >
                                                        <Briefcase className="h-4 w-4 text-gray-400 group-hover/item:text-blue-600" />
                                                        <span className="text-[10px] font-bold uppercase tracking-widest">Drives</span>
                                                    </Link>
                                                    <Link
                                                        href={`/super-admin/orgs/${org.id}/view?tab=candidates`}
                                                        onClick={() => setActiveMenu(null)}
                                                        className="flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-indigo-50 text-gray-900 transition-colors group/item"
                                                    >
                                                        <Users className="h-4 w-4 text-gray-400 group-hover/item:text-indigo-600" />
                                                        <span className="text-[10px] font-bold uppercase tracking-widest">Candidates</span>
                                                    </Link>
                                                </div>
                                            )}
                                        </div>

                                        {/* Edit Button */}
                                        <Link 
                                            href={`/super-admin/orgs/${org.id}`}
                                            className="h-9 flex items-center gap-2 px-4 rounded-lg bg-gray-50 text-gray-500 hover:text-[#F97316] hover:bg-orange-50 transition-all border border-transparent hover:border-orange-100 shadow-sm text-[11px] font-bold uppercase tracking-widest"
                                            title="Edit Configuration"
                                        >
                                            <Edit2 className="h-3.5 w-3.5" />
                                            Edit
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        {/* Pagination */}
                        <div className="px-6 py-4 bg-gray-50/50 flex items-center justify-between border-t border-gray-100">
                             <p className="text-gray-400 text-[11px] font-semibold uppercase tracking-widest flex items-center gap-3">
                                <Layers className="h-4 w-4" />
                                SHOWING {orgs.length} OF {total} PARTNERS · PAGE {page} OF {totalPages || 1}
                             </p>
                             <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page <= 1}
                                    className="h-9 px-4 bg-gray-100 text-gray-400 font-bold text-[11px] uppercase tracking-widest rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-200 transition-all"
                                >Previous</button>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages}
                                    className="h-9 px-4 bg-white border border-gray-200 text-gray-900 font-bold text-[11px] uppercase tracking-widest rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 shadow-sm transition-all"
                                >Next</button>
                             </div>
                        </div>
                    </div>
                )}
            </div>

            <ActionConfirmModal 
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Terminate Organization"
                description={`Are you sure you want to terminate ${orgToDelete?.name}? This will permanently remove all data, recruitment drives, and candidates associated with this portal. This action is irreversible.`}
                confirmText="Confirm Termination"
                isLoading={isDeleting}
            />
        </div>
    );
}
