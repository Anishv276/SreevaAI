"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Lock, ArrowRight } from "lucide-react";

import { useJobs } from "@/context/jobs-context";
import { cn } from "@/lib/utils";
import { getActiveDriveCount, isDriveCreationLocked } from "@/lib/drive-limits";
import { getInterviewQuotaSupportMessage, getSupportComposeUrl, isInterviewQuotaLocked, isOrgRestrictedStatus } from "@/lib/interview-quota";

import { DateFilter, type DateRange } from "@/components/admin/date-filter";
import { StatsGrid } from "@/components/admin/stats-grid";
import { HiringFunnel } from "@/components/admin/hiring-funnel";
import { ScoreDistribution } from "@/components/admin/score-distribution";
import { ActiveDrivesSummary } from "@/components/admin/active-drives-summary";
import { TopCandidates } from "@/components/admin/top-candidates";
import { LiveFeed } from "@/components/admin/live-feed";
import { useAdminOrg } from "@/context/admin-org-context";

export default function DashboardPage() {
    const [dateRange, setDateRange] = useState<DateRange>({ type: "month" });

    // ⚡ Read from shared context — no fetch needed (was 2 API calls per load)
    const adminOrg = useAdminOrg();
    const quotaLocked = isInterviewQuotaLocked(adminOrg ?? {});
    const orgStatus = String(adminOrg?.status || "ACTIVE").toUpperCase();

    const { jobs, organization } = useJobs();
    const hasNoDrives = jobs.length === 0;
    const activeDriveCount = organization?.activeDriveCount ?? getActiveDriveCount(jobs);
    const isSuspended = isOrgRestrictedStatus(orgStatus);
    const driveCreationLocked = isDriveCreationLocked(organization?.maxActiveDrives, activeDriveCount) || quotaLocked || isSuspended;

    return (
        <div className="space-y-10 pb-12 animate-fade-slide" style={{ zoom: 0.88, transformOrigin: "top center" }}>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="group flex items-center gap-5">
                    <div className="h-14 w-1.5 rounded-full bg-slate-900 shadow-[0_0_15px_rgba(15,23,42,0.15)] transition-all duration-500 group-hover:h-16" />
                    <div className="space-y-1">
                        <h1 className="text-4xl font-black leading-none tracking-tighter text-slate-950 text-premium sm:text-5xl">
                            Dashboard
                        </h1>
                        <div className="flex items-center gap-3">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" />
                            <p className="text-[13px] font-bold uppercase tracking-[0.2em] text-slate-400">
                                Hiring Pulse ·{" "}
                                {new Date().toLocaleDateString(undefined, {
                                    weekday: "long",
                                    day: "numeric",
                                    month: "short",
                                })}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-3">
                    <DateFilter value={dateRange} onChange={setDateRange} />

                    {driveCreationLocked ? (
                        <div className="flex items-center gap-3">
                            <button
                                className="cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-[13.5px] font-semibold text-slate-400 shadow-sm"
                                disabled
                                title={quotaLocked || isSuspended ? getInterviewQuotaSupportMessage("interviews") : "Drive limit reached"}
                            >
                                <span className="flex items-center gap-2">
                                    <Lock className="h-4 w-4" />
                                    {quotaLocked || isSuspended ? "Create Locked" : "Create New Drive"}
                                </span>
                            </button>
                            {quotaLocked || isSuspended ? (
                                <a
                                    href={getSupportComposeUrl({
                                        subject: "Interview quota support request",
                                        body: "Hi support team,\n\nPlease help us restore interview access for our account.\n",
                                    })}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-slate-700 hover:text-slate-950"
                                >
                                    Contact Support <ArrowRight className="h-3.5 w-3.5" />
                                </a>
                            ) : (
                                <Link
                                    href="/admin/billing"
                                    className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-slate-700 hover:text-slate-950"
                                >
                                    Go to Billing <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            )}
                        </div>
                    ) : (
                        <Link
                            href="/admin/create-drive"
                            className="btn-shimmer flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-sm shadow-slate-900/10 transition-all duration-150 hover:bg-slate-800 hover:shadow-md"
                        >
                            <Plus className="h-4 w-4" />
                            Create New Drive
                        </Link>
                    )}
                </div>
            </div>

            <StatsGrid dateRange={dateRange} />

            <div className="space-y-12">
                <section className="animate-fade-slide [animation-delay:100ms]">
                    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
                        <HiringFunnel dateRange={dateRange} />
                        <ScoreDistribution dateRange={dateRange} />
                    </div>
                </section>

                <section className="animate-fade-slide [animation-delay:300ms]">
                    <div
                        className={cn(
                            "grid items-start gap-6",
                            hasNoDrives ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"
                        )}
                    >
                        <ActiveDrivesSummary dateRange={dateRange} />
                        {!hasNoDrives && <TopCandidates dateRange={dateRange} />}
                    </div>
                </section>

                <div className="animate-fade-slide [animation-delay:400ms]">
                    <LiveFeed dateRange={dateRange} />
                </div>
            </div>
        </div>
    );
}
