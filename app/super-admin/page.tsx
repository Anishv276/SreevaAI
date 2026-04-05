import { prisma } from "@/lib/prisma";
import Link from "next/link";

async function getStats() {
    const [orgCount, driveCount, candidateCount, userCount] = await Promise.all([
        prisma.organization.count(),
        prisma.drive.count(),
        prisma.application.count(),
        prisma.user.count({ where: { role: "ORG_ADMIN" } }),
    ]);

    const recentOrgs = await prisma.organization.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { _count: { select: { users: true, drives: true } } },
    });

    return { orgCount, driveCount, candidateCount, userCount, recentOrgs };
}

export default async function SuperAdminDashboard() {
    const { orgCount, driveCount, candidateCount, userCount, recentOrgs } = await getStats();

    const stats = [
        { label: "TOTAL CLIENTS", value: orgCount, sub: "Organizations Network", context: "All active client entities" },
        { label: "ACTIVE PERSONNEL", value: userCount, sub: "Verified Personnel", context: "Multi-tenant administrators" },
        { label: "ACTIVE DRIVES", value: driveCount, sub: "Open Recruitment", context: "Global job postings live" },
        { label: "CANDIDATES", value: candidateCount, sub: "Talent Repository", context: "Total platform applications" },
    ];

    return (
        <div className="min-h-screen bg-[#F7F6F3] p-8 space-y-12 animate-fade-slide">
            {/* Header Mirroring Admin Dash Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-center gap-4 group">
                    <div className="h-12 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full shadow-[0_0_12px_rgba(249,115,22,0.4)] transition-all duration-300 group-hover:h-14" />
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight tracking-tight uppercase">
                            Master Command
                        </h1>
                        <p className="text-gray-500 font-medium mt-1 text-base uppercase tracking-widest text-[10px]">
                            Operational Pulse · {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Link href="/super-admin/orgs/new">
                        <button className="btn-shimmer flex items-center gap-2 bg-[#F97316] hover:bg-orange-600 text-white text-[12px] font-black uppercase tracking-widest px-6 py-3 rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95">
                            + CREATE CLIENT PORTAL
                        </button>
                    </Link>
                </div>
            </div>

            {/* Stats Grid - Exact 'StatsGrid' DNA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((s, i) => (
                    <div key={s.label} className="group relative rounded-2xl p-6 transition-all duration-500 bg-white border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_15px_35px_rgba(249,115,22,0.1)] hover:border-orange-100 overflow-hidden cursor-default">
                        {/* Interactive Border Glow */}
                        <div className="absolute top-0 left-0 w-1 h-full bg-[#F97316] opacity-0 group-hover:opacity-100 transition-all duration-500" />
                        
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-[10px] font-black text-gray-400 tracking-[0.2em] uppercase">
                                {s.label}
                            </p>
                            <div className="h-1.5 w-1.5 rounded-full bg-orange-100 group-hover:bg-[#F97316] transition-colors" />
                        </div>

                        <div className="flex items-baseline gap-1">
                            <p className="text-5xl font-black text-gray-900 leading-none tabular-nums tracking-tighter group-hover:text-[#F97316] transition-colors">
                                {s.value}
                            </p>
                        </div>

                        <div className="mt-6 pt-4 border-t border-gray-50 flex items-center gap-2">
                             <div className="h-1.5 w-1.5 rounded-full bg-green-500 drive-active-dot" />
                             <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-none">{s.sub}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Organizations List - Exact 'Drive List' Style */}
            <div className="space-y-8">
                <div className="flex items-center gap-3 group">
                    <div className="h-8 w-1 bg-[#F97316] rounded-full shadow-[0_0_8px_rgba(249,115,22,0.4)] transition-all duration-300 group-hover:h-10" />
                    <h2 className="text-xl font-bold text-gray-900 tracking-tight uppercase">Recent Partnerships</h2>
                </div>
                
                <div className="grid gap-4">
                    {recentOrgs.length === 0 ? (
                        <div className="p-20 text-center rounded-2xl bg-white border border-dashed border-gray-200">
                            <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">No active partner networks detected.</p>
                        </div>
                    ) : (
                        recentOrgs.map((org) => (
                            <div key={org.id} className="group relative rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 transition-all duration-500 bg-white border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_15px_35px_rgba(249,115,22,0.1)] hover:border-orange-100 overflow-hidden cursor-pointer">
                                {/* Interactive Border Glow */}
                                <div className="absolute top-0 left-0 w-1 h-full bg-[#F97316] opacity-0 group-hover:opacity-100 transition-all duration-500" />
                                
                                <div className="flex items-center gap-5">
                                    <div className="h-14 w-14 rounded-xl bg-gray-50 text-gray-900 flex items-center justify-center font-black text-xl border border-gray-100 group-hover:bg-[#F97316] group-hover:text-white group-hover:border-[#F97316] transition-all shadow-sm">
                                        {org.name[0].toUpperCase()}
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-gray-900 font-black text-base tracking-tight leading-none group-hover:text-[#F97316] transition-colors">{org.name.toUpperCase()}</p>
                                        <div className="flex items-center gap-3 mt-1">
                                            <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest opacity-60">/{org.slug}</p>
                                            <div className="h-1 w-1 rounded-full bg-gray-200" />
                                            <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest opacity-60">{org.plan} PLAN</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-10">
                                    <div className="text-right">
                                        <p className="text-gray-900 font-black text-base leading-none tabular-nums group-hover:text-[#F97316] transition-colors">{org._count.drives}</p>
                                        <p className="text-gray-400 text-[9px] font-black uppercase tracking-widest mt-1">DRIVES</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-gray-900 font-black text-base leading-none tabular-nums group-hover:text-[#F97316] transition-colors">{org._count.users}</p>
                                        <p className="text-gray-400 text-[9px] font-black uppercase tracking-widest mt-1">ADMINS</p>
                                    </div>
                                    <div className="flex items-center gap-4 pl-4">
                                        <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm transition-all ${org.isActive ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-700 border-red-100"}`}>
                                            {org.isActive ? "ACTIVE" : "SUSPENDED"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
