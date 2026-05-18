"use client";

import { useState, useEffect } from "react";
import { SuperAdminStatsGrid } from "@/components/super-admin/stats-grid";
import { OrgCreditPieChart, OrgQuotaConsumption, OrgInterviewPieChart } from "@/components/super-admin/credit-charts";
import { RecentActivity } from "@/components/super-admin/recent-activity";
import { Plus, ArrowRight, Building2, Loader2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface Org {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
    logoUrl?: string | null;
    interviewQuotaTotal?: number;
    interviewQuotaUsed?: number;
}

interface ChartStats {
    orgCreditStats: { name: string; creditsUsed: number }[];
    orgInterviewStats: { name: string; count: number }[];
    orgQuotaStats: { name: string; used: number; total: number }[];
}

function getStatusBadge(org: Org) {
    const quotaTotal = Number(org.interviewQuotaTotal || 0);
    const quotaUsed = Number(org.interviewQuotaUsed || 0);
    const isQuotaExhausted = quotaTotal > 0 && quotaUsed >= quotaTotal;

    if (org.status === "ACTIVE") {
        return { label: "Active", dot: "bg-emerald-500 animate-pulse", cls: "bg-emerald-50 text-emerald-600 border-emerald-100" };
    }
    if (org.status === "CLOSED") {
        return { label: "Closed", dot: "bg-gray-400", cls: "bg-gray-100 text-gray-500 border-gray-200" };
    }
    if (isQuotaExhausted) {
        return { label: "Quota", dot: "bg-amber-500", cls: "bg-amber-50 text-amber-700 border-amber-100" };
    }
    return { label: "Suspended", dot: "bg-red-400", cls: "bg-red-50 text-red-600 border-red-100" };
}

export default function SuperAdminDashboard() {
    const [mounted, setMounted] = useState(false);
    const [orgs, setOrgs] = useState<Org[]>([]);
    const [chartStats, setChartStats] = useState<ChartStats>({ orgCreditStats: [], orgInterviewStats: [], orgQuotaStats: [] });
    const [orgsLoading, setOrgsLoading] = useState(true);
    const [chartsLoading, setChartsLoading] = useState(true);

    useEffect(() => {
        setMounted(true);

        // Fetch recent orgs separately — lightweight
        fetch("/api/super-admin/orgs?limit=6")
            .then(async (res) => {
                if (res.ok) setOrgs((await res.json()).orgs ?? []);
            })
            .catch(() => {})
            .finally(() => setOrgsLoading(false));

        // Fetch chart stats from dedicated endpoint
        fetch("/api/super-admin/stats")
            .then(async (res) => {
                if (res.ok) {
                    const data = await res.json();
                    setChartStats({
                        orgCreditStats: data.orgCreditStats ?? [],
                        orgInterviewStats: data.orgInterviewStats ?? [],
                        orgQuotaStats: data.orgQuotaStats ?? [],
                    });
                }
            })
            .catch(() => {})
            .finally(() => setChartsLoading(false));
    }, []);

    if (!mounted) return <DashboardSkeleton />;

    return (
        <div className="space-y-7 pb-10 animate-in fade-in duration-700" style={{ zoom: 0.78, transformOrigin: "top center" }}>
            {/* Header */}
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between mb-8">
                <div className="flex items-center gap-5">
                    <div className="h-12 w-1.5 bg-orange-600 rounded-full shadow-[0_0_15px_rgba(234,88,12,0.3)]" />
                    <div className="space-y-1">
                        <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
                        <div className="flex items-center gap-3">
                            <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
                            <p className="text-gray-400 font-bold text-[11px] uppercase tracking-widest">
                                Platform Pulse · {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    <Link href="/super-admin/voices">
                        <button className="flex items-center gap-2 border border-gray-200 bg-white text-gray-700 text-sm font-bold px-4 py-2.5 rounded-2xl hover:border-orange-200 hover:text-orange-600 transition-all">
                            Voice Engine
                        </button>
                    </Link>
                    <Link href="/super-admin/orgs/new">
                        <button className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold px-4 py-2.5 rounded-2xl transition-colors shadow-sm">
                            <Plus className="h-4 w-4" />
                            Add Client
                        </button>
                    </Link>
                </div>
            </div>

            {/* Stats Cards */}
            <SuperAdminStatsGrid />

            {/* Active Orgs + Interview Split */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Active Organizations */}
                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h2 className="text-base font-bold text-gray-900 tracking-tight">Active Organizations</h2>
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Recently added clients</p>
                        </div>
                        <Link href="/super-admin/orgs" className="h-9 w-9 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 hover:text-orange-600 hover:bg-orange-50 hover:border-orange-100 transition-all">
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>

                    {orgsLoading ? (
                        <div className="flex justify-center py-10">
                            <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                        </div>
                    ) : orgs.length === 0 ? (
                        <div className="flex flex-col items-center py-10 gap-3">
                            <div className="h-12 w-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-300 border border-gray-100">
                                <Building2 className="h-6 w-6" />
                            </div>
                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No clients yet</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {orgs.map((org) => {
                                const badge = getStatusBadge(org);
                                return (
                                    <Link key={org.id} href={`/super-admin/orgs/${org.id}`}>
                                        <div className="group flex items-center justify-between p-3.5 rounded-xl border border-gray-100 bg-gray-50/30 hover:border-orange-100 hover:bg-white hover:shadow-sm transition-all duration-200">
                                            <div className="flex items-center gap-3">
                                                {org.logoUrl ? (
                                                    <div className="h-9 w-9 rounded-xl border border-gray-100 bg-white p-1.5 flex items-center justify-center shrink-0">
                                                        <img src={org.logoUrl} alt={org.name} className="h-full w-full object-contain" />
                                                    </div>
                                                ) : (
                                                    <div className="h-9 w-9 rounded-xl bg-gray-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
                                                        {org.name[0]}
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="text-sm font-bold text-gray-900 group-hover:text-orange-600 transition-colors leading-tight">{org.name}</p>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{org.plan || "Scale"}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase flex items-center gap-1 border", badge.cls)}>
                                                    <span className={cn("h-1 w-1 rounded-full", badge.dot)} />
                                                    {badge.label}
                                                </span>
                                                <ArrowRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-orange-400 transition-colors" />
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Interview Split */}
                <OrgInterviewPieChart stats={chartStats.orgInterviewStats} loading={chartsLoading} />
            </div>

            {/* Credit Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <OrgCreditPieChart stats={chartStats.orgCreditStats} loading={chartsLoading} />
                <OrgQuotaConsumption stats={chartStats.orgQuotaStats} loading={chartsLoading} />
            </div>

            {/* Global Activity */}
            <RecentActivity />
        </div>
    );
}

function DashboardSkeleton() {
    return (
        <div className="space-y-7 pb-10 animate-pulse" style={{ zoom: 0.78, transformOrigin: "top center" }}>
            <div className="flex items-center gap-5">
                <div className="h-12 w-1.5 bg-gray-200 rounded-full" />
                <div className="space-y-2">
                    <div className="h-9 w-40 bg-gray-200 rounded-xl" />
                    <div className="h-3 w-28 bg-gray-100 rounded-lg" />
                </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {[...Array(6)].map((_, i) => <div key={i} className="h-28 bg-gray-100 rounded-2xl" />)}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="h-80 bg-gray-100 rounded-2xl" />
                <div className="h-80 bg-gray-100 rounded-2xl" />
            </div>
        </div>
    );
}
