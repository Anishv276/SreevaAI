"use client";
import { useState, useEffect } from "react";
import { SuperAdminStatsGrid } from "@/components/super-admin/stats-grid";
import { OrgCreditPieChart, OrgQuotaConsumption, OrgInterviewPieChart } from "@/components/super-admin/credit-charts";
import { RecentActivity } from "@/components/super-admin/recent-activity";
import { Plus, ArrowRight, Building2, Loader2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
interface Org {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
    interviewQuotaTotal?: number;
    interviewQuotaUsed?: number;
}
interface ChartStats {
    orgCreditStats: { name: string; creditsUsed: number }[];
    orgInterviewStats: { name: string; count: number }[];
    orgQuotaStats: { name: string; used: number; total: number }[];
}
interface DashboardStats extends ChartStats {
    totalOrgs: number;
    activeOrgs: number;
    suspendedOrgs: number;
    closedOrgs: number;
    totalAdmins: number;
    totalDrives: number;
    totalCandidates: number;
    totalCreditsUsed: number;
    platformHealth: number;
    engagedOrgs: number;
    trends: { orgs: number; admins: number; drives: number; candidates: number };
    recentActivity: { type: "ORG" | "DRIVE" | "CANDIDATE" | "INTERVIEW"; detail: string; org: string; at: string }[];
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
    const [orgs, setOrgs] = useState<Org[]>([]);
    const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(true);
    const [statsError, setStatsError] = useState<string | null>(null);
    const [orgsLoading, setOrgsLoading] = useState(true);
    const loadDashboardStats = async (signal?: AbortSignal) => {
        setStatsLoading(true);
        setStatsError(null);
        try {
            const res = await fetch("/api/super-admin/stats", signal ? { signal } : undefined);
            if (!res.ok) {
                setStatsError("Failed to load dashboard stats.");
                return;
            }
            const data = await res.json();
            setDashboardStats({
                ...data,
                orgCreditStats: data.orgCreditStats ?? [],
                orgInterviewStats: data.orgInterviewStats ?? [],
                orgQuotaStats: data.orgQuotaStats ?? [],
                recentActivity: data.recentActivity ?? [],
            });
        } catch (err: unknown) {
            if (!(err instanceof Error) || err.name !== "AbortError") {
                setStatsError("Network error.");
            }
        } finally {
            if (!signal?.aborted) {
                setStatsLoading(false);
            }
        }
    };
    useEffect(() => {
        fetch("/api/super-admin/orgs?limit=6")
            .then(async (res) => {
                if (res.ok) setOrgs((await res.json()).orgs ?? []);
            })
            .catch(() => {})
            .finally(() => setOrgsLoading(false));
        const controller = new AbortController();
        void loadDashboardStats(controller.signal);
        return () => controller.abort();
    }, []);
    return (
        <div className="space-y-6 pb-10 animate-in fade-in duration-500">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Dashboard</h1>
                    <p className="text-sm text-gray-400 mt-0.5">Platform overview · {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <Link href="/super-admin/voices">
                        <button className="flex items-center gap-2 border text-gray-600 text-sm font-semibold px-4 h-10 rounded-xl hover:text-violet-600 hover:bg-violet-50 hover:border-violet-200 transition-all bg-white" style={{ borderColor: "#E9E7FF" }}>
                            Voice Engine
                        </button>
                    </Link>
                    <Link href="/super-admin/orgs/new">
                        <button className="btn-shimmer flex items-center gap-2 text-white text-sm font-semibold px-4 h-10 rounded-xl transition-all" style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.28)" }}>
                            <Plus className="h-4 w-4" />
                            Add Client
                        </button>
                    </Link>
                </div>
            </div>
            <SuperAdminStatsGrid
                stats={dashboardStats}
                loading={statsLoading}
                error={statsError}
                onRetry={() => { void loadDashboardStats(); }}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-2xl p-6" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h2 className="text-base font-semibold text-gray-900 tracking-tight">Active Organizations</h2>
                            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mt-0.5">Recently added clients</p>
                        </div>
                        <Link href="/super-admin/orgs" className="h-9 w-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-all" style={{ border: "1px solid #E9E7FF" }}>
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                    {orgsLoading ? (
                        <div className="flex justify-center py-10">
                            <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
                        </div>
                    ) : orgs.length === 0 ? (
                        <div className="flex flex-col items-center py-10 gap-3">
                            <div className="h-12 w-12 rounded-2xl flex items-center justify-center text-gray-300" style={{ background: "#F5F3FF", border: "1px solid #E9E7FF" }}>
                                <Building2 className="h-6 w-6" />
                            </div>
                            <p className="text-sm font-medium text-gray-400 uppercase tracking-widest">No clients yet</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {orgs.map((org) => {
                                const badge = getStatusBadge(org);
                                return (
                                    <Link key={org.id} href={`/super-admin/orgs/${org.id}`}>
                                        <div className="group flex items-center justify-between p-3.5 rounded-xl transition-all duration-150" style={{ border: "1px solid #F0EEF8", background: "#FAFAFC" }}
                                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#C4B5FD"; (e.currentTarget as HTMLElement).style.background = "#FFFFFF"; (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(124,58,237,0.06)"; }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#F0EEF8"; (e.currentTarget as HTMLElement).style.background = "#FAFAFC"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-xl text-white flex items-center justify-center font-bold text-sm shrink-0" style={{ background: "linear-gradient(135deg, #7C3AED, #3B82F6)" }}>
                                                    {org.name[0]}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-900 group-hover:text-violet-600 transition-colors leading-tight">{org.name}</p>
                                                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-widest">{org.plan || "Scale"}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-semibold tracking-widest uppercase flex items-center gap-1 border", badge.cls)}>
                                                    <span className={cn("h-1 w-1 rounded-full", badge.dot)} />
                                                    {badge.label}
                                                </span>
                                                <ArrowRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-violet-400 transition-colors" />
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>
                <OrgInterviewPieChart stats={dashboardStats?.orgInterviewStats ?? []} loading={statsLoading} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <OrgCreditPieChart stats={dashboardStats?.orgCreditStats ?? []} loading={statsLoading} />
                <OrgQuotaConsumption stats={dashboardStats?.orgQuotaStats ?? []} loading={statsLoading} />
            </div>
            <RecentActivity
                activities={dashboardStats?.recentActivity ?? null}
                loading={statsLoading}
                error={statsError}
                onRetry={() => { void loadDashboardStats(); }}
            />
        </div>
    );
}
