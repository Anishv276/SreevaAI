"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, Lock, ArrowRight, BarChart2, Users, Briefcase, Zap } from "lucide-react";
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
                    {driveCreationLocked ? (
                        <div className="flex items-center gap-2.5">
                            <button
                                disabled
                                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-medium text-gray-400 cursor-not-allowed"
                                style={{ background: "#F5F3FF", border: "1px solid #E9E7FF" }}
                                title={quotaLocked || isSuspended ? getInterviewQuotaSupportMessage("interviews") : "Drive limit reached"}
                            >
                                <Lock className="h-3.5 w-3.5" />
                                {quotaLocked || isSuspended ? "Locked" : "New Drive"}
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
                            href="/admin/create-drive"
                            className="btn-shimmer inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-medium text-white transition-all"
                            style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" }}
                        >
                            <Plus className="h-4 w-4" />
                            New Drive
                        </Link>
                    )}
                </div>
            </div>

            {/* ── KPI Stats ── */}
            <StatsGrid dateRange={dateRange} />

            {/* ── Charts Row ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <HiringFunnel dateRange={dateRange} />
                <ScoreDistribution dateRange={dateRange} />
            </div>

            {/* ── Action + Talent Row ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <NeedsAction />
                <TopCandidates dateRange={dateRange} />
            </div>

            {/* ── Activity Feed ── */}
            <LiveFeed dateRange={dateRange} />
        </div>
    );
}
