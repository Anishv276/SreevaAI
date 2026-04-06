import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { 
    Plus,
    Building2, 
    ArrowRight,
    Briefcase,
    Users,
    Activity,
    Zap,
    TrendingUp
} from "lucide-react";

async function getStats() {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Single consolidated query — fetches all KPI counts in one DB round-trip
    const [statsResult, activeOrgs] = await Promise.all([
        prisma.$queryRaw<[{
            org_count: bigint;
            active_org_count: bigint;
            drive_count: bigint;
            candidate_count: bigint;
            new_candidates_this_week: bigint;
            total_interviews: bigint;
        }]>`
            SELECT
                (SELECT COUNT(*) FROM "Organization") AS org_count,
                (SELECT COUNT(*) FROM "Organization" WHERE "isActive" = true) AS active_org_count,
                (SELECT COUNT(*) FROM "Drive") AS drive_count,
                (SELECT COUNT(*) FROM "Application") AS candidate_count,
                (SELECT COUNT(*) FROM "Application" WHERE "createdAt" >= ${oneWeekAgo}) AS new_candidates_this_week,
                (SELECT COUNT(*) FROM "Interview") AS total_interviews
        `,
        prisma.organization.findMany({
            where: { isActive: true },
            orderBy: { createdAt: "desc" },
            take: 3,
            include: { 
                _count: { 
                    select: { 
                        users: true,
                        drives: true 
                    } 
                } 
            }
        })
    ]);

    const s = statsResult[0];
    return {
        orgCount: Number(s.org_count),
        activeOrgCount: Number(s.active_org_count),
        driveCount: Number(s.drive_count),
        candidateCount: Number(s.candidate_count),
        newCandidatesThisWeek: Number(s.new_candidates_this_week),
        totalInterviews: Number(s.total_interviews),
        activeOrgs,
    };
}

export default async function SuperAdminDashboard() {
    const { orgCount, activeOrgCount, driveCount, candidateCount, newCandidatesThisWeek, totalInterviews, activeOrgs } = await getStats();

    const stats = [
        { label: "ACTIVE ORGANIZATIONS", value: activeOrgCount, sub: `${activeOrgCount} out of ${orgCount} portals active`, icon: Building2 },
        { label: "TOTAL CANDIDATES", value: candidateCount, sub: `+${newCandidatesThisWeek} new applications this week`, icon: Users },
        { label: "ACTIVE DRIVES", value: driveCount, sub: "Jobs currently accepting", icon: Zap },
        { label: "COMPLETED INTERVIEWS", value: totalInterviews, sub: "Interviews processed to date", icon: Activity },
    ];

    return (
        <div className="space-y-8 pb-12 animate-fade-slide">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-center gap-4 group">
                    <div className="h-12 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full shadow-[0_0_12px_rgba(249,115,22,0.4)] transition-all duration-300 group-hover:h-14" />
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                            Dashboard
                        </h1>
                        <p className="text-gray-500 font-medium mt-1 text-base">
                            Hiring Pulse · {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
                        </p>
                    </div>
                </div>
                <Link
                    href="/super-admin/orgs/new"
                    className="flex items-center gap-2 bg-[#F97316] hover:bg-orange-600 text-white text-[13.5px] font-medium px-4 py-2 rounded-lg transition-all duration-150 shadow-sm hover:shadow-md"
                >
                    <Plus className="h-4 w-4" />
                    Create New Organization
                </Link>
            </div>

            {/* KPI Grid - smaller cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((s) => (
                    <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-6 space-y-4 shadow-sm">
                        <div className="flex items-center justify-between">
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{s.label}</p>
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg">
                                <TrendingUp className="h-3 w-3" />
                                <span className="text-[9px] font-bold">Active</span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <p className="text-4xl font-extrabold text-gray-900 tracking-tight tabular-nums">{s.value}</p>
                            <div className="flex items-center gap-2">
                                <div className="h-1.5 w-1.5 rounded-full bg-orange-200" />
                                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-widest">{s.sub}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            {/* Organizations Section - High Fidelity */}
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 group">
                        <div className="h-8 w-1 bg-[#F97316] rounded-full" />
                        <h2 className="text-xl font-bold text-gray-900 tracking-tight">Active Organizations</h2>
                    </div>
                    <Link href="/super-admin/orgs" className="flex items-center gap-1 text-sm font-bold text-[#F97316] hover:text-orange-700 transition-all hover:gap-2">
                        View All <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>
                {activeOrgs.length === 0 ? (
                    <div className="bg-white rounded-2xl border-dashed border-2 border-gray-100 p-12 flex flex-col items-center text-center gap-4 group">
                        <div className="h-16 w-16 rounded-2xl bg-orange-50 flex items-center justify-center text-[#F97316]">
                            <Building2 className="h-8 w-8" />
                        </div>
                        <div>
                            <p className="text-lg font-bold text-gray-900">No organizations found</p>
                            <p className="text-sm text-gray-400 mt-1">Ready to onboard your first organization.</p>
                        </div>
                        <Link href="/super-admin/orgs/new">
                            <button className="bg-[#F97316] hover:bg-orange-600 text-white font-bold rounded-xl px-6 py-2.5 shadow-lg transition-all">
                                <Plus className="h-4 w-4 mr-2 inline" /> Add Organization
                            </button>
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {activeOrgs.map((org) => (
                            <div
                                key={org.id}
                                className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_12px_30px_rgba(0,0,0,0.06)] hover:border-orange-100 transition-all duration-300 group flex flex-col justify-between h-full cursor-pointer relative overflow-hidden"
                            >
                                <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-transparent via-orange-400 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                
                                <div>
                                    <div className="flex justify-between items-start gap-4 mb-3">
                                        <h3 className="text-lg font-extrabold text-gray-900 group-hover:text-[#F97316] transition-colors leading-tight line-clamp-2">
                                            {org.name}
                                        </h3>
                                        <div className="flex-shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-full bg-orange-50 border border-orange-100 text-[#F97316]">
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#F97316]"></span>
                                            </span>
                                            <span className="text-[9px] font-bold text-[#F97316] uppercase tracking-wider">{org.plan}</span>
                                        </div>
                                    </div>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6 truncate">
                                        {org.industry || "Corporate Partner"}
                                    </p>
                                </div>
                                <div className="mt-auto space-y-5">
                                    <div className="flex items-center justify-between border-t border-dashed border-gray-100 pt-4">
                                        <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400">
                                            <Users className="h-3.5 w-3.5" />
                                            <span>{org._count.users} Users</span>
                                        </div>
                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-50 border border-orange-100 text-[#F97316]">
                                            <Briefcase className="h-3.5 w-3.5" />
                                            <span className="text-xs font-bold">{org._count.drives} Active Drives</span>
                                        </div>
                                    </div>
                                    <Link 
                                        href={`/super-admin/orgs/${org.id}/view`}
                                        className="w-full rounded-xl bg-gray-900 hover:bg-[#F97316] text-white font-bold h-10 shadow-sm transition-all group-hover:shadow-md flex items-center justify-center gap-2"
                                    >
                                        View Portal Profile <ArrowRight className="h-3.5 w-3.5" />
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>


            {/* Recent Activity */}
            <div className="space-y-6">
                <div className="flex items-center gap-3 group">
                    <div className="h-8 w-1 bg-[#F97316] rounded-full" />
                    <h2 className="text-xl font-bold text-gray-900 tracking-tight">Recent Activity</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-3">
                        <Activity className="h-8 w-8 text-orange-200" />
                        <p className="text-[10px] font-medium text-gray-400 uppercase tracking-widest">Activity Module Synchronized</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-3">
                        <Zap className="h-8 w-8 text-orange-200" />
                        <p className="text-[10px] font-medium text-gray-400 uppercase tracking-widest">AI Insights Ready</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-3">
                        <Activity className="h-8 w-8 text-orange-200" />
                        <p className="text-[10px] font-medium text-gray-400 uppercase tracking-widest">Active Alerts: 0</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
