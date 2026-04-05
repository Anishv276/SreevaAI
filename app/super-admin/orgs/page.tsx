"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { 
    MoreVertical, 
    Edit2, 
    PauseCircle, 
    PlayCircle, 
    Trash2, 
    Plus, 
    Users, 
    Briefcase, 
    UserCheck,
    Search,
    Eye,
    Building2,
    ArrowRight,
    Loader2,
    ChevronRight,
    Layers,
    Globe
} from "lucide-react";
import { ActionConfirmModal } from "@/components/ui/action-confirm-modal";

interface Org {
    id: string;
    name: string;
    slug: string;
    plan: string;
    isActive: boolean;
    _count: {
        users: number;
        drives: number;
    };
}

export default function OrgsPage() {
    const [orgs, setOrgs] = useState<Org[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    
    // Modal State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [orgToDelete, setOrgToDelete] = useState<Org | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const fetchOrgs = async () => {
        try {
            const res = await fetch("/api/super-admin/orgs");
            const data = await res.json();
            setOrgs(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Error fetching orgs:", error);
            setOrgs([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrgs();
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setActiveMenu(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const toggleSuspend = async (org: Org) => {
        try {
            const res = await fetch(`/api/super-admin/orgs/${org.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !org.isActive }),
            });
            if (res.ok) fetchOrgs();
        } catch (error) {
            console.error("Error toggling status:", error);
        }
    };

    const deleteOrg = async (org: Org) => {
        setOrgToDelete(org);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!orgToDelete) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/super-admin/orgs/${orgToDelete.id}`, { method: "DELETE" });
            if (res.ok) {
                fetchOrgs();
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
                        <p className="text-gray-500 font-medium mt-1 text-base">Partner registry · {orgs.length} organizations</p>
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
                            className="h-10 w-[300px] pl-10 pr-4 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-[#F97316]/30 focus:border-[#F97316] transition-all"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="py-40 text-center flex flex-col items-center justify-center gap-4">
                        <Loader2 className="h-10 w-10 text-[#F97316] animate-spin opacity-20" />
                        <p className="text-gray-300 text-[10px] font-black uppercase tracking-widest tracking-[0.3em] animate-pulse">Syncing Portal Context</p>
                    </div>
                ) : (
                    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                        {/* Table Header */}
                        <div className="grid grid-cols-[2.5fr_1.5fr_1fr_1fr_1.5fr_1.2fr] gap-4 px-6 py-4 border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/50">
                            <span>ORGANIZATION</span>
                            <span>IDENTIFIER</span>
                            <span className="text-center">ADMINS</span>
                            <span className="text-center">DRIVES</span>
                            <span className="text-center">STATUS</span>
                            <span className="text-right">ACTIONS</span>
                        </div>

                        <div className="divide-y divide-gray-100">
                            {orgs.map((can) => (
                                <div key={can.id} className="grid grid-cols-[2.5fr_1.5fr_1fr_1fr_1.5fr_1.2fr] gap-4 px-6 py-4 items-center hover:bg-gray-50 transition-all group">
                                    {/* Sidebar Circle + Info Block */}
                                    <div className="flex items-center gap-4">
                                        <div className="h-10 w-10 rounded-full bg-gray-900 text-white flex flex-shrink-0 items-center justify-center font-bold text-sm shadow-sm group-hover:scale-105 transition-transform">
                                            {can.name[0].toUpperCase()}
                                        </div>
                                        <div className="flex flex-col truncate">
                                            <p className="text-gray-900 font-bold text-[14.5px] truncate">{can.name}</p>
                                            <p className="text-gray-500 text-[11px] font-medium truncate uppercase tracking-widest leading-tight">{can.plan} Protocol</p>
                                        </div>
                                    </div>

                                    {/* Identifier/Slug */}
                                    <div className="flex flex-col gap-1.5 truncate">
                                        <div className="flex items-center gap-2">
                                             <Globe className="h-3.5 w-3.5 text-gray-400 group-hover:text-[#F97316] transition-colors" />
                                             <p className="text-gray-700 font-bold text-[11.5px] uppercase tracking-widest truncate">/{can.slug}</p>
                                        </div>
                                        <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest ml-5.5 leading-none">Internal ID</p>
                                    </div>

                                    {/* Stats matching table numbers */}
                                    <div className="text-center font-black text-gray-950 text-base tabular-nums tracking-tighter">
                                        {can._count.users}
                                    </div>

                                    <div className="text-center font-black text-gray-950 text-base tabular-nums tracking-tighter">
                                        {can._count.drives}
                                    </div>

                                    <div className="text-center">
                                        <span className={`px-4 py-1.5 rounded-full text-[9.5px] font-bold uppercase tracking-widest border inline-flex items-center gap-2 ${can.isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-100/50' : 'bg-red-50 text-red-600 border-red-100/50'}`}>
                                            <div className={`h-1.5 w-1.5 rounded-full ${can.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                                            {can.isActive ? "ACTIVE" : "SUSPENDED"}
                                        </span>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center justify-end gap-3">
                                        <Link 
                                            href={`/super-admin/orgs/${can.id}/view`}
                                            className="h-9 w-9 flex items-center justify-center rounded-lg bg-gray-50 text-gray-400 hover:text-[#F97316] hover:bg-orange-50 transition-all border border-transparent hover:border-orange-100 shadow-sm"
                                            title="View Profile"
                                        >
                                            <Eye className="h-4 w-4" />
                                        </Link>
                                        
                                        <div className="relative overflow-visible" ref={activeMenu === can.id ? menuRef : null}>
                                            <button 
                                                onClick={() => setActiveMenu(activeMenu === can.id ? null : can.id)}
                                                className="h-10 w-10 flex items-center justify-center rounded-xl bg-gray-50 text-gray-300 hover:text-gray-950 hover:bg-gray-100 transition-all active:scale-90"
                                            >
                                                <MoreVertical className="h-4.5 w-4.5" />
                                            </button>

                                            {activeMenu === can.id && (
                                                <div className="absolute right-0 top-12 w-56 bg-white border border-gray-100 rounded-[1.5rem] shadow-[0_20px_60px_rgba(0,0,0,0.1)] p-2 z-[100] animate-in-up duration-200">
                                                    <Link
                                                        href={`/super-admin/orgs/${can.id}`}
                                                        className="flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-gray-50 text-gray-900 transition-colors group/item"
                                                    >
                                                        <Edit2 className="h-4 w-4 text-gray-400 group-hover/item:text-[#F97316]" />
                                                        <span className="text-[10px] font-black uppercase tracking-widest">Edit Records</span>
                                                    </Link>
                                                    <button
                                                        onClick={() => toggleSuspend(can)}
                                                        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all text-left ${can.isActive ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                                                    >
                                                        {can.isActive ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                                                        <span className="text-[10px] font-black uppercase tracking-widest">{can.isActive ? "Force Suspend" : "Restore Access"}</span>
                                                    </button>
                                                    <div className="h-px bg-gray-50 my-1 mx-2" />
                                                    <button
                                                        onClick={() => deleteOrg(can)}
                                                        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-red-50 text-red-600 transition-all text-left"
                                                    >
                                                        <Trash2 className="h-4 w-4 opacity-70" />
                                                        <span className="text-[10px] font-black uppercase tracking-widest">Terminate Org</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        {/* Pagination */}
                        <div className="px-6 py-4 bg-gray-50/50 flex items-center justify-between border-t border-gray-100">
                             <p className="text-gray-400 text-[11px] font-semibold uppercase tracking-widest flex items-center gap-3">
                                <Layers className="h-4 w-4" />
                                SHOWING {orgs.length} OF {orgs.length} PARTNERS
                             </p>
                             <div className="flex items-center gap-2">
                                <button className="h-9 px-4 bg-gray-100 text-gray-400 font-bold text-[11px] uppercase tracking-widest rounded-lg opacity-50 cursor-not-allowed">Previous</button>
                                <button className="h-9 px-4 bg-white border border-gray-200 text-gray-900 font-bold text-[11px] uppercase tracking-widest rounded-lg hover:bg-gray-50 shadow-sm transition-all">Next</button>
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
