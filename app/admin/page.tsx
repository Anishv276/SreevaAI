"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, Lock, ArrowRight } from "lucide-react";
import { useJobs } from "@/context/jobs-context";
import { getActiveDriveCount, isDriveCreationLocked } from "@/lib/drive-limits";
import { getInterviewQuotaSupportMessage, getSupportComposeUrl, isInterviewQuotaLocked, isOrgRestrictedStatus } from "@/lib/interview-quota";
import { DateFilter, type DateRange } from "@/components/admin/date-filter";
import { StatsGrid } from "@/components/admin/stats-grid";
import { HiringFunnel } from "@/components/admin/hiring-funnel";
import { ScoreDistribution } from "@/components/admin/score-distribution";
import { NeedsAction } from "@/components/admin/needs-action";
import { TopCandidates } from "@/components/admin/top-candidates";
import { LiveFeed } from "@/components/admin/live-feed";
import { useAdminOrg } from "@/context/admin-org-context";
export default function DashboardPage() {
    const [dateRange, setDateRange] = useState<DateRange>({ type: "month" });
    const adminOrg = useAdminOrg();
    const quotaLocked = isInterviewQuotaLocked(adminOrg ?? {});
    const orgStatus = String(adminOrg?.status || "ACTIVE").toUpperCase();
    const { jobs } = useJobs();
    const activeDriveCount = adminOrg?.activeDriveCount ?? getActiveDriveCount(jobs);
    const isSuspended = isOrgRestrictedStatus(orgStatus);
    const driveCreationLocked = isDriveCreationLocked(adminOrg?.maxActiveDrives, activeDriveCount) || quotaLocked || isSuspended;
    return (
        <div className="space-y-7 pb-10 animate-in fade-in duration-700" style={{ zoom: 0.78, transformOrigin: "top center" }}>
            {/* Header — matches other admin pages */}
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between mb-8">
                <div className="flex items-center gap-5">
                    <div className="h-12 w-1.5 bg-orange-600 rounded-full shadow-[0_0_15px_rgba(234,88,12,0.3)]" />
                    <div className="space-y-1">
                        <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
                        <div className="flex items-center gap-3">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" />
                            <p className="text-gray-400 font-bold text-[11px] uppercase tracking-widest">
                                {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <DateFilter value={dateRange} onChange={setDateRange} />
                    {driveCreationLocked ? (
                        <div className="flex items-center gap-3">
                            <button
                                disabled
                                className="bg-gray-100 text-gray-400 border border-gray-200 h-10 px-5 font-bold rounded-2xl cursor-not-allowed opacity-70 flex items-center gap-2 text-sm"
                                title={quotaLocked || isSuspended ? getInterviewQuotaSupportMessage("interviews") : "Drive limit reached"}
                            >
                                <Lock className="h-4 w-4" />
                                {quotaLocked || isSuspended ? "Locked" : "New Drive"}
                            </button>
                            {quotaLocked || isSuspended ? (
                                <a
                                    href={getSupportComposeUrl({
                                        subject: "Interview quota support request",
                                        body: "Hi support team,\n\nPlease help us restore interview access for our account.\n",
                                    })}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-gray-900 uppercase tracking-widest"
                                >
                                    Contact Support <ArrowRight className="h-3.5 w-3.5" />
                                </a>
                            ) : (
                                <Link
                                    href="/admin/billing"
                                    className="flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-gray-900 uppercase tracking-widest"
                                >
                                    Billing <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            )}
                        </div>
                    ) : (
                        <Link
                            href="/admin/create-drive"
                            className="flex items-center gap-2 h-10 px-5 bg-gray-900 text-white text-sm font-bold rounded-2xl hover:bg-gray-800 transition-colors"
                        >
                            <Plus className="h-4 w-4" />
                            New Drive
                        </Link>
                    )}
                </div>
            </div>
            {/* Stats Cards */}
            <StatsGrid dateRange={dateRange} />
            {/* Funnel + Score Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <HiringFunnel dateRange={dateRange} />
                <ScoreDistribution dateRange={dateRange} />
            </div>
            {/* Needs Action + Top Talent */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <NeedsAction />
                <TopCandidates dateRange={dateRange} />
            </div>
            {/* Activity Feed */}
            <LiveFeed dateRange={dateRange} />
        </div>
    );
}
