"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Lock, ArrowRight } from "lucide-react";

import { useJobs } from "@/context/jobs-context";
import { cn } from "@/lib/utils";
import { getActiveDriveCount, isDriveCreationLocked } from "@/lib/drive-limits";
import { getInterviewQuotaSupportMessage, getSupportComposeUrl, isInterviewQuotaLocked } from "@/lib/interview-quota";

import { DateFilter, type DateRange } from "@/components/admin/date-filter";
import { StatsGrid } from "@/components/admin/stats-grid";
import { HiringFunnel } from "@/components/admin/hiring-funnel";
import { ScoreDistribution } from "@/components/admin/score-distribution";
import { ActiveDrivesSummary } from "@/components/admin/active-drives-summary";
import { TopCandidates } from "@/components/admin/top-candidates";
import { LiveFeed } from "@/components/admin/live-feed";

export default function DashboardPage() {
    const [dateRange, setDateRange] = useState<DateRange>({ type: "month" });
    const [quotaLocked, setQuotaLocked] = useState(false);

    const { jobs, organization } = useJobs();
    const hasNoDrives = jobs.length === 0;
    const activeDriveCount = organization?.activeDriveCount ?? getActiveDriveCount(jobs);
    const driveCreationLocked = isDriveCreationLocked(organization?.maxActiveDrives, activeDriveCount) || quotaLocked;

    useEffect(() => {
        let cancelled = false;
        const loadQuota = async () => {
            try {
                const res = await fetch("/api/admin/credits", { cache: "no-store" });
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled) setQuotaLocked(isInterviewQuotaLocked(data));
            } catch {
                // ignore
            }
        };
        loadQuota();
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className="space-y-8 pb-12" style={{ zoom: 0.88, transformOrigin: "top center" }}>
            <div className="animate-fade-slide flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="group flex items-center gap-5">
                    <div className="h-14 w-1.5 rounded-full bg-gradient-to-b from-[#F97316] to-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.5)] transition-all duration-500 group-hover:h-16 group-hover:shadow-[0_0_25px_rgba(249,115,22,0.6)]" />
                    <div className="space-y-1">
                        <h1 className="text-4xl font-black leading-none tracking-tighter text-gray-900 text-premium sm:text-5xl">
                            Dashboard
                        </h1>
                        <div className="flex items-center gap-3">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#F97316] animate-pulse" />
                            <p className="text-[13px] font-bold uppercase tracking-[0.2em] text-gray-400">
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
                                className="cursor-not-allowed rounded-lg border border-gray-200 bg-gray-100 px-4 py-2 text-[13.5px] font-medium text-gray-400 shadow-sm"
                                disabled
                                title={quotaLocked ? getInterviewQuotaSupportMessage("interviews") : "Drive limit reached"}
                            >
                                <span className="flex items-center gap-2">
                                    <Lock className="h-4 w-4" />
                                    {quotaLocked ? "Create Locked" : "Create New Drive"}
                                </span>
                            </button>
                            {quotaLocked ? (
                                <a
                                    href={getSupportComposeUrl({
                                        subject: "Interview quota support request",
                                        body: "Hi support team,\n\nPlease help us restore interview access for our account.\n",
                                    })}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-[#F97316] hover:text-orange-700"
                                >
                                    Contact Support <ArrowRight className="h-3.5 w-3.5" />
                                </a>
                            ) : (
                                <Link
                                    href="/admin/billing"
                                    className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-[#F97316] hover:text-orange-700"
                                >
                                    Go to Billing <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            )}
                        </div>
                    ) : (
                        <Link
                            href="/admin/create-drive"
                            className="btn-shimmer flex items-center gap-2 rounded-lg bg-[#F97316] px-4 py-2 text-[13.5px] font-medium text-white shadow-sm transition-all duration-150 hover:bg-orange-600 hover:shadow-md"
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
