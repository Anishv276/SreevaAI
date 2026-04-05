"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Org {
    id: string;
    name: string;
    slug: string;
    plan: string;
    isActive: boolean;
    createdAt: string;
    adminCount: number;
    driveCount: number;
    candidateCount: number;
}

const PLAN_COLORS: Record<string, string> = {
    STARTER: "bg-gray-100 text-gray-700 border-gray-200",
    PRO: "bg-blue-50 text-blue-700 border-blue-100",
    ENTERPRISE: "bg-purple-50 text-purple-700 border-purple-100",
};

export default function OrgsPage() {
    const [orgs, setOrgs] = useState<Org[]>([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);

    const fetchOrgs = () => {
        setLoading(true);
        fetch("/api/super-admin/orgs")
            .then(r => r.json())
            .then(setOrgs)
            .finally(() => setLoading(false));
    };

    useEffect(() => { fetchOrgs(); }, []);

    const toggleSuspend = async (org: Org) => {
        setUpdating(org.id);
        await fetch(`/api/super-admin/orgs/${org.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: !org.isActive }),
        });
        fetchOrgs();
        setUpdating(null);
    };

    const changePlan = async (org: Org, plan: string) => {
        setUpdating(org.id);
        await fetch(`/api/super-admin/orgs/${org.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plan }),
        });
        fetchOrgs();
        setUpdating(null);
    };

    const deleteOrg = async (org: Org) => {
        if (!confirm(`Delete "${org.name}" and ALL its data? This cannot be undone.`)) return;
        setUpdating(org.id);
        await fetch(`/api/super-admin/orgs/${org.id}`, { method: "DELETE" });
        fetchOrgs();
        setUpdating(null);
    };

    return (
        <div className="p-8 space-y-10 text-gray-900">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Organizations</h1>
                    <p className="text-gray-400 font-bold mt-1 uppercase tracking-widest text-[10px]">{orgs.length} clients on Lumoscale</p>
                </div>
                <Link
                    href="/super-admin/orgs/new"
                    className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white font-black text-xs rounded-xl shadow-xl hover:bg-[#F97316] transition-all hover:-translate-y-0.5 active:scale-95"
                >
                    + ADD NEW CLIENT
                </Link>
            </div>

            {/* Table */}
            <div className="bg-white border border-gray-100 rounded-[2.5rem] shadow-sm overflow-hidden">
                {/* Table Header */}
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-8 py-5 border-b border-gray-50 text-[10px] font-black text-gray-900 uppercase tracking-[0.2em] bg-gray-50/50">
                    <span>Organization</span>
                    <span>Plan</span>
                    <span>Admins</span>
                    <span>Drives</span>
                    <span>Candidates</span>
                    <span>Status</span>
                    <span>Actions</span>
                </div>

                {loading ? (
                    <div className="p-20 text-center text-gray-400 font-black uppercase tracking-widest">Loading...</div>
                ) : orgs.length === 0 ? (
                    <div className="p-20 text-center space-y-4">
                        <p className="text-gray-400 font-black uppercase tracking-widest text-xs">No organizations yet.</p>
                        <Link href="/super-admin/orgs/new" className="text-[#F97316] font-black text-xs tracking-widest uppercase hover:underline">
                            Add your first client →
                        </Link>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {orgs.map((org) => (
                            <div
                                key={org.id}
                                className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-8 py-6 items-center hover:bg-gray-50/50 transition-all group ${updating === org.id ? "opacity-50 pointer-events-none" : ""}`}
                            >
                                {/* Name + Slug */}
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-900 flex items-center justify-center font-black text-sm border border-gray-200 group-hover:bg-[#F97316] group-hover:text-white group-hover:border-[#F97316] transition-all flex-shrink-0">
                                        {org.name[0].toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="text-gray-900 font-black text-sm tracking-tight">{org.name}</p>
                                        <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-0.5">/{org.slug}</p>
                                    </div>
                                </div>

                                {/* Plan Dropdown */}
                                <div>
                                    <select
                                        value={org.plan}
                                        onChange={e => changePlan(org, e.target.value)}
                                        className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all cursor-pointer ${PLAN_COLORS[org.plan] || PLAN_COLORS.STARTER}`}
                                    >
                                        <option value="STARTER">Starter</option>
                                        <option value="PRO">Pro</option>
                                        <option value="ENTERPRISE">Enterprise</option>
                                    </select>
                                </div>

                                {/* Counts */}
                                <span className="text-gray-900 font-black text-xs">{org.adminCount}</span>
                                <span className="text-gray-900 font-black text-xs">{org.driveCount}</span>
                                <span className="text-gray-900 font-black text-xs">{org.candidateCount}</span>

                                {/* Status */}
                                <span className={`inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${org.isActive ? "text-green-600" : "text-red-600"}`}>
                                    <span className={`w-2 h-2 rounded-full ${org.isActive ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]"}`} />
                                    {org.isActive ? "Active" : "Suspended"}
                                </span>

                                {/* Actions */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => toggleSuspend(org)}
                                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${org.isActive ? "border-red-100 text-red-600 hover:bg-red-50" : "border-green-100 text-green-600 hover:bg-green-50"}`}
                                    >
                                        {org.isActive ? "Suspend" : "Activate"}
                                    </button>
                                    <button
                                        onClick={() => deleteOrg(org)}
                                        className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-gray-100 text-gray-400 hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
