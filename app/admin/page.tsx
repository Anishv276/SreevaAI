"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Lock, ArrowRight, Loader2 } from "lucide-react";
import { useJobs } from "@/context/jobs-context";
import { getActiveJobCount, isJobCreationLocked } from "@/lib/job-limits";
import { getInterviewQuotaSupportMessage, getSupportComposeUrl, isInterviewQuotaLocked, isOrgRestrictedStatus } from "@/lib/interview-quota";
import { DateFilter, type DateRange } from "@/components/admin/date-filter";
import { StatsGrid } from "@/components/admin/stats-grid";
import { HiringFunnel } from "@/components/admin/hiring-funnel";
import { ScoreDistribution } from "@/components/admin/score-distribution";
import { ActiveJobsSummary } from "@/components/admin/active-jobs-summary";
import { NeedsAction } from "@/components/admin/needs-action";
import { UpcomingActivity } from "@/components/admin/upcoming-activity";
import { TopCandidates } from "@/components/admin/top-candidates";
import { LiveFeed } from "@/components/admin/live-feed";
import { useAdminOrg } from "@/context/admin-org-context";

export default function DashboardPage() {
    const [dateRange, setDateRange] = useState<DateRange>({ type: "month" });
    const adminOrg = useAdminOrg();
    const quotaLocked = isInterviewQuotaLocked(adminOrg ?? {});
    const orgStatus = String(adminOrg?.status || "ACTIVE").toUpperCase();
    const { jobs } = useJobs();
    const activeJobCount = adminOrg?.activeJobCount ?? getActiveJobCount(jobs);
    const isSuspended = isOrgRestrictedStatus(orgStatus);
    const jobCreationLocked = isJobCreationLocked(adminOrg?.maxActiveJobs, activeJobCount) || quotaLocked || isSuspended;

    const [dashboardData, setDashboardData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;
        
        const loadDashboardData = async () => {
            setLoading(true);
            setError(null);
            try {
                let url = "/api/admin/dashboard";
                if (dateRange.type === "custom" && "from" in dateRange) {
                    url += `?range=custom&from=${(dateRange as any).from}&to=${(dateRange as any).to}`;
                } else {
                    url += `?range=${dateRange.type}`;
                }
                const res = await fetch(url, { signal });
                if (signal.aborted) return;
                
                if (res.ok) {
                    setDashboardData(await res.json());
                } else {
                    setError("Failed to load dashboard data.");
                }
            } catch (err: any) {
                if (!signal.aborted && err.name !== "AbortError") {
                    setError("Network error loading dashboard.");
                }
            } finally {
                if (!signal.aborted) setLoading(false);
            }
        };

        loadDashboardData();
        return () => controller.abort();
    }, [dateRange]);

    return (
        <div className="space-y-6 pb-10 animate-in fade-in duration-500">

            {/* ── Page Header ── */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Dashboard</h1>
                    <p className="text-sm text-gray-400 mt-0.5">
                        {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    <DateFilter value={dateRange} onChange={setDateRange} />
                    {jobCreationLocked ? (
                        <div className="flex items-center gap-2.5">
                            <button
                                disabled
                                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-medium text-gray-400 cursor-not-allowed"
                                style={{ background: "#F5F3FF", border: "1px solid #E9E7FF" }}
                                title={quotaLocked || isSuspended ? getInterviewQuotaSupportMessage("interviews") : "Job limit reached"}
                            >
                                <Lock className="h-3.5 w-3.5" />
                                {quotaLocked || isSuspended ? "Locked" : "New Job"}
                            </button>
                            {(quotaLocked || isSuspended) ? (
                                <a
                                    href={getSupportComposeUrl({ subject: "Interview quota support request", body: "Hi support team,\n\nPlease help us restore interview access for our account.\n" })}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-violet-600 transition-colors"
                                >
                                    Contact Support <ArrowRight className="h-3.5 w-3.5" />
                                </a>
                            ) : (
                                <Link href="/admin/billing" className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-violet-600 transition-colors">
                                    Billing <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            )}
                        </div>
                    ) : (
                        <Link
                            href="/admin/create-job"
                            className="btn-shimmer inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-medium text-white transition-all"
                            style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" }}
                        >
                            <Plus className="h-4 w-4" />
                            New Job
                        </Link>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                    <Loader2 className="h-8 w-8 animate-spin mb-4" />
                    <p className="text-sm font-medium">Loading dashboard...</p>
                </div>
            ) : error ? (
                <div className="rounded-2xl border border-red-100 bg-red-50 p-6 flex flex-col items-center text-center">
                    <p className="text-red-600 font-semibold mb-2">{error}</p>
                    <button onClick={() => setDateRange({...dateRange})} className="text-sm text-red-500 hover:text-red-700 underline">Try again</button>
                </div>
            ) : (
                <>
                    {/* ── KPI Stats ── */}
                    <StatsGrid dateRange={dateRange} initialData={dashboardData?.stats} />

                    {/* ── Charts Row ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        <HiringFunnel dateRange={dateRange} initialData={dashboardData?.stats} />
                        <ScoreDistribution dateRange={dateRange} initialData={dashboardData?.scoreDistribution} />
                        <ActiveJobsSummary dateRange={dateRange} initialData={dashboardData?.jobsSummary} />
                    </div>

                    {/* ── Action + Talent Row ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        <NeedsAction initialData={dashboardData?.needsAction} />
                        <UpcomingActivity initialData={dashboardData?.needsAction} />
                        <TopCandidates dateRange={dateRange} initialData={dashboardData?.topCandidates} />
                    </div>

                    {/* ── Activity Feed ── */}
                    <LiveFeed dateRange={dateRange} initialData={dashboardData?.activity} />
                </>
            )}
        </div>
    );
}
