import { StatsGrid } from "@/components/admin/stats-grid";
import { DriveList } from "@/components/admin/drive-list";
import { LiveFeed } from "@/components/admin/live-feed";
import { Plus } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
    return (
        <div className="space-y-8 pb-12">
            {/* ── Header ─────────────────────────────────── */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-fade-slide">
                <div className="flex items-center gap-4 group">
                    <div className="h-12 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full shadow-[0_0_12px_rgba(249,115,22,0.4)] transition-all duration-300 group-hover:h-14" />
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight tracking-tight">
                            Dashboard
                        </h1>
                        <p className="text-gray-500 font-medium mt-1 text-base">
                            Hiring Pulse · {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Create drive */}
                    <Link href="/admin/create-drive">
                        <button className="btn-shimmer flex items-center gap-2 bg-[#F97316] hover:bg-orange-600 text-white text-[13.5px] font-medium px-4 py-2 rounded-lg transition-all duration-150 shadow-sm hover:shadow-md">
                            <Plus className="h-4 w-4" />
                            Create New Drive
                        </button>
                    </Link>
                </div>
            </div>

            {/* ── Stat Cards ─────────────────────────────── */}
            <StatsGrid />

            {/* ── Dashboard Sections ─────────────────── */}
            <div className="space-y-12">
                <section className="animate-fade-slide [animation-delay:100ms]">
                    <DriveList />
                </section>
                
                <section className="animate-fade-slide [animation-delay:200ms]">
                    <div className="flex items-center gap-3 group mb-6">
                        <div className="h-8 w-1 bg-[#F97316] rounded-full shadow-[0_0_8px_rgba(249,115,22,0.4)] transition-all duration-300 group-hover:h-10" />
                        <h2 className="text-xl font-bold text-gray-900 tracking-tight">Recent Activity</h2>
                    </div>
                    <LiveFeed />
                </section>
            </div>
        </div>
    );
}
