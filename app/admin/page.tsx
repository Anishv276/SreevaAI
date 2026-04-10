"use client";

import { useState } from "react";
import { StatsGrid } from "@/components/admin/stats-grid";
import { HiringFunnel } from "@/components/admin/hiring-funnel";
import { ScoreDistribution } from "@/components/admin/score-distribution";
import { SessionIntegrity } from "@/components/admin/session-integrity";
import { ActiveDrivesSummary } from "@/components/admin/active-drives-summary";
import { TopCandidates } from "@/components/admin/top-candidates";
import { LiveFeed } from "@/components/admin/live-feed";
import { DateFilter, type DateRange } from "@/components/admin/date-filter";
import { Plus } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
    const [dateRange, setDateRange] = useState<DateRange>({ type: "month" });

    return (
        <div className="space-y-8 pb-12">
            {/* ── Header: Astral Chrome Architecture ──────────────── */}
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between animate-fade-slide">
                <div className="flex items-center gap-5 group">
                    <div className="h-14 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-500 rounded-full shadow-[0_0_15px_rgba(249,115,22,0.5)] transition-all duration-500 group-hover:h-16 group-hover:shadow-[0_0_25px_rgba(249,115,22,0.6)]" />
                    <div className="space-y-1">
                        <h1 className="text-4xl sm:text-5xl font-black text-gray-900 leading-none tracking-tighter text-premium">
                            Dashboard
                        </h1>
                        <div className="flex items-center gap-3">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#F97316] animate-pulse" />
                            <p className="text-gray-400 font-bold text-[13px] uppercase tracking-[0.2em]">
                                Hiring Pulse · {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0 flex-wrap justify-end">
                    <DateFilter value={dateRange} onChange={setDateRange} />
                    <Link href="/admin/create-drive">
                        <button className="btn-shimmer flex items-center gap-2 bg-[#F97316] hover:bg-orange-600 text-white text-[13.5px] font-medium px-4 py-2 rounded-lg transition-all duration-150 shadow-sm hover:shadow-md">
                            <Plus className="h-4 w-4" />
                            Create New Drive
                        </button>
                    </Link>
                </div>
            </div>

            {/* ── Stat Cards ─────────────────────────────── */}
            <StatsGrid dateRange={dateRange} />

            {/* ── Dashboard Sections ─────────────────── */}
            <div className="space-y-12">
                {/* Section 2: Hiring Funnel + Score Distribution */}
                <section className="animate-fade-slide [animation-delay:100ms]">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        <HiringFunnel dateRange={dateRange} />
                        <ScoreDistribution dateRange={dateRange} />
                    </div>
                </section>

                {/* Section 3: Session Integrity */}
                <section className="animate-fade-slide [animation-delay:200ms]">
                    <SessionIntegrity dateRange={dateRange} />
                </section>

                {/* Section 4: Active Drives Summary + Top Candidates */}
                <section className="animate-fade-slide [animation-delay:300ms]">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        <ActiveDrivesSummary />
                        <TopCandidates />
                    </div>
                </section>

                <div className="animate-fade-slide [animation-delay:400ms]">
                    <LiveFeed />
                </div>
            </div>
        </div>
    );
}
