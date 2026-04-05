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
    const [orgCount, driveCount, candidateCount, totalInterviews] = await Promise.all([
        prisma.organization.count(),
        prisma.drive.count(),
        prisma.application.count(),
        prisma.interview.count(),
    ]);

    const activeDrives = await prisma.drive.findMany({
        where: { status: "ACTIVE" },
        take: 2,
        include: { _count: { select: { applications: true } } }
    });

    return { orgCount, driveCount, candidateCount, totalInterviews, activeDrives };
}

export default async function SuperAdminDashboard() {
    const { orgCount, driveCount, candidateCount, totalInterviews, activeDrives } = await getStats();

    const stats = [
        { label: "ACTIVE ORGANIZATIONS", value: orgCount, sub: `${orgCount} portals live and active`, icon: Building2 },
        { label: "TOTAL CANDIDATES", value: candidateCount, sub: "New applications this week", icon: Users },
        { label: "ACTIVE DRIVES", value: driveCount, sub: "Jobs currently accepting", icon: Zap },
        { label: "COMPLETED INTERVIEWS", value: totalInterviews, sub: "Interviews processed to date", icon: Activity },
    ];

    return (
        <div className="min-h-screen bg-white p-6 lg:p-10 space-y-12 animate-fade-slide text-gray-900 font-medium">
            
            {/* Header section from Pic 1 */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div className="space-y-1">
                    <div className="flex items-center gap-4">
                        <div className="h-8 w-1 bg-[#F97316] rounded-full" />
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight leading-none">Dashboard</h1>
                    </div>
                    <p className="text-gray-400 font-bold ml-5 text-sm">Hiring Pulse · {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</p>
                </div>
                <Link
                    href="/super-admin/orgs/new"
                    className="flex items-center gap-2 px-6 py-3 bg-[#F97316] text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-orange-100 hover:bg-orange-600 transition-all active:scale-95"
                >
                    <Plus className="h-4 w-4" />
                    Create New Organization
                </Link>
            </div>

            {/* KPI Grid from Pic 1 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((s) => (
                    <div key={s.label} className="bg-white border border-gray-100 rounded-3xl p-8 space-y-6 shadow-[0_10px_40px_rgba(0,0,0,0.02)]">
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">{s.label}</p>
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg">
                                <TrendingUp className="h-3 w-3" />
                                <span className="text-[9px] font-black tracking-tight">Active</span>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <p className="text-5xl font-black text-gray-900 tracking-tighter tabular-nums">{s.value}</p>
                            <div className="flex items-center gap-2">
                                <div className="h-1.5 w-1.5 rounded-full bg-orange-200" />
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{s.sub}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Active Drives Section from Pic 1 */}
            <div className="space-y-8">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="h-6 w-1 bg-[#F97316] rounded-full" />
                        <h2 className="text-2xl font-black text-gray-900 tracking-tight">Active Partners</h2>
                    </div>
                    <Link href="/super-admin/orgs" className="text-[11px] font-black text-[#F97316] uppercase tracking-widest flex items-center gap-1 hover:gap-2 transition-all">
                        View All <ArrowRight className="h-3 w-3" />
                    </Link>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                    {activeDrives.map((drive) => (
                        <div key={drive.id} className="bg-white border border-gray-100 rounded-3xl p-8 space-y-8 group hover:shadow-xl hover:shadow-gray-100 transition-all">
                            <div className="flex items-start justify-between">
                                <div className="space-y-2">
                                    <h3 className="text-xl font-black text-gray-900 tracking-tight uppercase tracking-tight">{drive.title}</h3>
                                    <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">{drive.department}</p>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-500 rounded-full font-black text-[9px] uppercase tracking-widest shadow-sm">
                                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                    Active
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-6 pb-6 border-b border-dashed border-gray-100">
                                <div className="flex items-center gap-2 text-gray-400">
                                    <Briefcase className="h-4 w-4" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Posted {new Date(drive.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                </div>
                                <div className="flex items-center gap-2 text-[#F97316]">
                                    <Users className="h-4 w-4" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">{drive._count.applications} Applicants</span>
                                </div>
                            </div>

                            <Link 
                                href={`/super-admin/orgs/${drive.orgId}/view`}
                                className="w-full py-4 bg-gray-950 text-white rounded-2xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest shadow-xl shadow-gray-200 hover:bg-[#F97316] transition-all"
                            >
                                View Candidates <ArrowRight className="h-4 w-4" />
                            </Link>
                        </div>
                    ))}
                </div>
            </div>

            {/* Bottom Section Layout from Pic 1 */}
            <div className="space-y-8 pt-8">
                <div className="flex items-center gap-4">
                    <div className="h-6 w-1 bg-[#F97316] rounded-full" />
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight italic uppercase">Recent Activity</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="bg-gray-50/50 border border-gray-100 rounded-3xl p-10 flex flex-col items-center justify-center text-center space-y-4">
                         <Activity className="h-10 w-10 text-orange-200" />
                         <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Activity Module Synchronized</p>
                    </div>
                    <div className="bg-gray-50/50 border border-gray-100 rounded-3xl p-10 flex flex-col items-center justify-center text-center space-y-4">
                         <Zap className="h-10 w-10 text-orange-200" />
                         <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">AI Insights Ready</p>
                    </div>
                    <div className="bg-gray-50/50 border border-gray-100 rounded-3xl p-10 flex flex-col items-center justify-center text-center space-y-4">
                         <Activity className="h-10 w-10 text-orange-200" />
                         <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Active Alerts: 0</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
