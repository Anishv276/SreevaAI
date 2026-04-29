"use client";

import { useState, useEffect } from "react";
import { SuperAdminStatsGrid } from "@/components/super-admin/stats-grid";
import { OrgCreditPieChart, OrgCreditBarGraph, OrgInterviewPieChart } from "@/components/super-admin/credit-charts";
import { RecentActivity } from "@/components/super-admin/recent-activity";
import { Plus, ArrowRight, Building2, Users, Briefcase, Zap, Search, Activity, Loader2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export default function SuperAdminDashboard() {
    const [mounted, setMounted] = useState(false);
    const [orgs, setOrgs] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setMounted(true);
        const fetchRecentOrgs = async () => {
            try {
                const res = await fetch("/api/super-admin/orgs?limit=6");
                if (res.ok) {
                    const data = await res.json();
                    setOrgs(data.orgs);
                    setStats(data.stats);
                }
            } catch (err) {
                console.error("Failed to fetch recent orgs", err);
            } finally {
                setLoading(false);
            }
        };
        fetchRecentOrgs();
    }, []);

    if (!mounted) {
        return <DashboardSkeleton />;
    }

    return (
        <div className="space-y-8 pb-12">
            {/* Header: Astral Chrome Architecture */}
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between animate-fade-slide">
                <div className="flex items-center gap-5 group">
                    <div className="h-14 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-500 rounded-full shadow-[0_0_15px_rgba(249,115,22,0.5)] transition-all duration-500 group-hover:h-16 group-hover:shadow-[0_0_25px_rgba(249,115,22,0.6)]" />
                    <div className="space-y-1">
                        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-none tracking-tight">
                            Dashboard
                        </h1>
                        <div className="flex items-center gap-3">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#F97316] animate-pulse" />
                            <p className="text-gray-400 font-bold text-[12px] uppercase tracking-[0.15em]">
                                Platform Pulse · {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0 flex-wrap justify-end">
                    <Link href="/super-admin/orgs/new">
                        <button className="btn-shimmer flex items-center gap-2 bg-[#F97316] hover:bg-orange-600 text-white text-[13.5px] font-semibold px-4 py-2.5 rounded-xl transition-all duration-150 shadow-sm hover:shadow-md">
                            <Plus className="h-4 w-4" />
                            Provision Organization
                        </button>
                    </Link>
                </div>
            </div>

            {/* Stat Cards */}
            <SuperAdminStatsGrid />

            {/* Row 2: Active Registries & Interview Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <section className="animate-fade-slide [animation-delay:100ms]">
                    <div className="bg-white border border-gray-100 rounded-[2.5rem] p-8 shadow-sm h-full space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <h2 className="text-xl font-bold text-gray-900 tracking-tight">Active Registries</h2>
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Recently provisioned portals</p>
                            </div>
                            <Link href="/super-admin/orgs">
                                <button className="p-2.5 rounded-xl bg-gray-50 text-gray-400 hover:text-[#F97316] hover:bg-orange-50 transition-all">
                                    <ArrowRight className="h-5 w-5" />
                                </button>
                            </Link>
                        </div>

                        <div className="space-y-3">
                            {loading ? (
                                <div className="py-12 flex justify-center">
                                    <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
                                </div>
                            ) : orgs.length === 0 ? (
                                <div className="py-12 text-center space-y-4">
                                    <div className="h-16 w-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto text-gray-300">
                                        <Building2 className="h-8 w-8" />
                                    </div>
                                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No organizations provisioned</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-3">
                                    {orgs.map((org) => (
                                        <Link key={org.id} href={`/super-admin/orgs/${org.id}`}>
                                            <div className="flex items-center justify-between p-4 rounded-2xl border border-gray-100 bg-gray-50/30 hover:border-orange-200 hover:bg-white hover:shadow-[0_10px_30px_rgba(0,0,0,0.03)] transition-all duration-300 group">
                                                <div className="flex items-center gap-4">
                                                    {org.logoUrl ? (
                                                        <div className="h-10 w-10 rounded-xl border border-gray-100 bg-white p-1.5 shadow-sm flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-500">
                                                            <img src={org.logoUrl} alt={org.name} className="h-full w-full object-contain" />
                                                        </div>
                                                    ) : (
                                                        <div className="h-10 w-10 rounded-xl bg-gray-900 text-white flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0">
                                                            {org.name[0]}
                                                        </div>
                                                    )}

                                                    <div className="space-y-0.5">
                                                        <h3 className="text-sm font-bold text-gray-900 group-hover:text-[#F97316] transition-colors line-clamp-1">{org.name}</h3>
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{org.slug}</p>
                                                            <span className="h-0.5 w-0.5 rounded-full bg-gray-200" />
                                                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{org.plan || 'Scale'}</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-4">
                                                    <div className={cn(
                                                        "px-2 py-0.5 rounded-full text-[8px] font-bold tracking-widest uppercase flex items-center gap-1.5 border",
                                                        org.status === "ACTIVE" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-gray-100 text-gray-400 border-gray-200"
                                                    )}>
                                                        <div className={cn("h-1 w-1 rounded-full", org.status === "ACTIVE" ? "bg-emerald-500 animate-pulse" : "bg-gray-400")} />
                                                        {org.status}
                                                    </div>
                                                    <div className="h-7 w-7 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-orange-50 group-hover:text-[#F97316] transition-all">
                                                        <ArrowRight className="h-3.5 w-3.5" />
                                                    </div>
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                <section className="animate-fade-slide [animation-delay:200ms]">
                    <OrgInterviewPieChart stats={stats?.orgInterviewStats || []} loading={loading} />
                </section>
            </div>

            {/* Row 3: Credit Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <section className="animate-fade-slide [animation-delay:300ms]">
                    <OrgCreditPieChart stats={stats?.orgCreditStats || []} loading={loading} />
                </section>

                <section className="animate-fade-slide [animation-delay:400ms]">
                    <OrgCreditBarGraph stats={stats?.orgCreditStats || []} loading={loading} />
                </section>
            </div>

            {/* Row 4: Global Activity Stream */}
            <RecentActivity />
        </div>
    );
}


function DashboardSkeleton() {
    return (
        <div className="space-y-8 pb-12 animate-pulse">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-3">
                    <div className="h-10 w-48 bg-gray-100 rounded-xl" />
                    <div className="h-4 w-32 bg-gray-50 rounded-lg" />
                </div>
                <div className="h-12 w-48 bg-gray-200 rounded-lg" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                    <div key={i} className="h-32 bg-white/60 border border-white/80 rounded-[2rem]" />
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="h-[400px] bg-white/40 border border-white/60 rounded-[2.5rem]" />
                <div className="h-[400px] bg-white/40 border border-white/60 rounded-[2.5rem]" />
                <div className="h-[400px] bg-white/40 border border-white/60 rounded-[2.5rem]" />
                <div className="h-[400px] bg-white/40 border border-white/60 rounded-[2.5rem]" />
            </div>
        </div>
    );
}
