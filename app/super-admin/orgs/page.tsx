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

    const fetchOrgs = async () => {
        try {
            const res = await fetch("/api/super-admin/orgs");
            const data = await res.json();
            setOrgs(data);
        } catch (error) {
            console.error("Error fetching orgs:", error);
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
        if (!confirm(`Are you sure you want to delete ${org.name}? This action is irreversible.`)) return;
        try {
            const res = await fetch(`/api/super-admin/orgs/${org.id}`, { method: "DELETE" });
            if (res.ok) fetchOrgs();
        } catch (error) {
            console.error("Error deleting org:", error);
        }
    };

    return (
        <div className="min-h-screen bg-white p-8 lg:p-12 space-y-12 animate-fade-slide text-gray-900 font-medium pb-24">
            
            {/* Master Header with Screenshot 1/2 Accent Style */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 px-1">
                <div className="space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-1.25 bg-[#F97316] rounded-full" />
                        <h1 className="text-4xl font-black text-gray-950 tracking-tighter uppercase italic leading-none">Organizations</h1>
                    </div>
                </div>
                <Link
                    href="/super-admin/orgs/new"
                    className="flex items-center gap-2 px-8 py-3.5 bg-gray-950 text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg shadow-gray-200 hover:bg-[#F97316] transition-all active:scale-95"
                >
                    <Plus className="h-4 w-4" />
                    Onboard Partner
                </Link>
            </div>

            {/* Registry Search Container matching Pic 2 */}
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-1">
                     <div className="flex items-center gap-3">
                        <div className="h-6 w-1 bg-[#F97316] rounded-full" />
                        <h2 className="text-[11px] font-black text-gray-950 uppercase tracking-widest italic">Partner Registry</h2>
                     </div>
                     <div className="relative group">
                        <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300 group-focus-within:text-gray-950 transition-colors" />
                        <input
                            type="text"
                            placeholder="Search by name, role, or slug..."
                            className="h-14 w-[450px] pl-14 pr-8 bg-gray-50/50 border border-gray-100 rounded-2xl text-[11px] font-black uppercase tracking-widest text-gray-950 outline-none focus:bg-white focus:ring-4 focus:ring-gray-900/5 transition-all"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="py-40 text-center flex flex-col items-center justify-center gap-4">
                        <Loader2 className="h-10 w-10 text-[#F97316] animate-spin opacity-20" />
                        <p className="text-gray-300 text-[10px] font-black uppercase tracking-widest tracking-[0.3em] animate-pulse">Syncing Portal Context</p>
                    </div>
                ) : (
                    <div className="bg-white border border-gray-100 rounded-[3rem] shadow-[0_20px_80px_rgba(0,0,0,0.015)] overflow-hidden">
                        {/* Table Header matching Pic 2 Table Structure */}
                        <div className="grid grid-cols-[2.5fr_1.5fr_1fr_1fr_1.5fr_1.2fr] gap-4 px-12 py-10 border-b border-gray-50 text-[10px] font-black text-gray-300 uppercase tracking-[0.2em] bg-gray-50/5">
                            <span>ORGANIZATION</span>
                            <span>IDENTIFIER</span>
                            <span className="text-center">ADMINS</span>
                            <span className="text-center">DRIVES</span>
                            <span className="text-center">STATUS</span>
                            <span className="text-right">ACTIONS</span>
                        </div>

                        <div className="divide-y divide-gray-50/50">
                            {orgs.map((can) => (
                                <div key={can.id} className="grid grid-cols-[2.5fr_1.5fr_1fr_1fr_1.5fr_1.2fr] gap-4 px-12 py-6 items-center hover:bg-gray-50/50 transition-all group">
                                    {/* Circular Avatar + Info Block from Pic 2 */}
                                    <div className="flex items-center gap-6">
                                        <div className="h-14 w-14 rounded-full bg-gray-950 text-white flex flex-shrink-0 items-center justify-center font-black text-xl shadow-lg group-hover:scale-105 group-hover:bg-[#F97316] transition-all">
                                            {can.name[0].toUpperCase()}
                                        </div>
                                        <div className="flex flex-col gap-1 truncate">
                                            <p className="text-gray-950 font-black text-base tracking-tight truncate uppercase leading-none italic">{can.name}</p>
                                            <p className="text-gray-400 text-[10px] font-black truncate lowercase tracking-widest opacity-60 leading-none">{can.plan} Protocol</p>
                                        </div>
                                    </div>

                                    {/* Identifier/Slug */}
                                    <div className="flex flex-col gap-1 truncate">
                                        <div className="flex items-center gap-2">
                                             <Globe className="h-3 w-3 text-gray-200 group-hover:text-[#F97316] transition-colors" />
                                             <p className="text-gray-400 font-bold text-[11px] uppercase tracking-widest opacity-60 truncate">/{can.slug}</p>
                                        </div>
                                        <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mt-1 opacity-50 px-5 leading-none">External Link</p>
                                    </div>

                                    {/* Stats matching table numbers */}
                                    <div className="text-center font-black text-gray-950 text-base tabular-nums tracking-tighter">
                                        {can._count.users}
                                    </div>

                                    <div className="text-center font-black text-gray-950 text-base tabular-nums tracking-tighter">
                                        {can._count.drives}
                                    </div>

                                    {/* Status matching Pic 2 (REJECTED style pill) */}
                                    <div className="text-center">
                                        <span className={`px-5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] italic border inline-flex items-center gap-2 ${can.isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-100/50' : 'bg-red-50 text-red-600 border-red-100/50'}`}>
                                            <div className={`h-1.5 w-1.5 rounded-full ${can.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                                            {can.isActive ? "OPERATIONAL" : "SUSPENDED"}
                                        </span>
                                    </div>

                                    {/* Actions matching "View Profile" link style in Pic 2 */}
                                    <div className="flex items-center justify-end gap-5">
                                        <Link 
                                            href={`/super-admin/orgs/${can.id}/view`}
                                            className="text-[10px] font-black text-[#F97316] uppercase tracking-widest hover:translate-x-1 transition-all underline underline-offset-4 decoration-2"
                                        >
                                            View Profile
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
                        
                        {/* Table Footer matching Pic 2 (SHOWING 1 OF 1 style) */}
                        <div className="px-12 py-10 bg-gray-50/5 flex items-center justify-between border-t border-gray-50">
                             <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.3em] italic leading-none flex items-center gap-3">
                                <Layers className="h-4 w-4" />
                                SHOWING {orgs.length} OF {orgs.length} PARTNERS
                             </p>
                             <div className="flex items-center gap-3">
                                <button className="px-8 py-3.5 bg-gray-50 text-gray-200 font-black text-[10px] uppercase tracking-widest rounded-xl opacity-40 cursor-not-allowed border border-white">Previous</button>
                                <button className="px-8 py-3.5 bg-white border border-gray-100 text-gray-950 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-gray-50 shadow-sm transition-all hover:shadow-gray-200">Next</button>
                             </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
