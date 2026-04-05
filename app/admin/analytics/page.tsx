"use client";

import { useEffect, useState } from "react";
import { 
    Users, 
    Briefcase, 
    FileText, 
    CheckCircle2, 
    Clock, 
    XCircle,
    Calendar,
    TrendingUp,
    TrendingDown,
    ArrowUpRight,
    ArrowDownRight
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AnalyticsData {
    overview: {
        totalApplications: number;
        activeDrives: number;
        pendingApplications: number;
        rejectedApplications: number;
        interviewsScheduled: number;
        interviewsCompleted: number;
        hiredThisMonth: number;
        avgResponseTime: number;
        avgAIScore: number;
        passRate: number;
        totalInterviews: number;
        completedInterviews: number;
    };
    funnel: {
        applied: number;
        shortlisted: number;
        interview: number;
        offer: number;
        hired: number;
    };
    trends: {
        labels: string[];
        applications: number[];
        hired: number[];
    };
    scores: {
        range: string;
        count: number;
    }[];
    drives: {
        id: number;
        title: string;
        department: string;
        type: string;
        applications: number;
        hired: number;
        interviewComplete: number;
        pending: number;
        conversionRate: number;
        status: string;
        deadline: string | null;
        createdAt: Date;
    }[];
    statusBreakdown: { status: string; count: number }[];
    departments: { department: string; count: number }[];
    deadlines: { id: number; title: string; deadline: string; positions: number }[];
}

export default function AnalyticsPage() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                const res = await fetch("/api/admin/analytics");
                if (res.ok) {
                    const json = await res.json();
                    setData(json);
                }
            } catch (error) {
                console.error("Failed to fetch analytics", error);
            } finally {
                setLoading(false);
            }
        };
        fetchAnalytics();
    }, []);

    if (loading) {
        return (
            <div className="space-y-8">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full animate-pulse" />
                    <div className="h-10 w-48 bg-gray-200 rounded animate-pulse" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[1,2,3,4,5,6,7,8].map(i => (
                        <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    if (!data) return null;

    const statsConfig = [
        { label: "TOTAL APPS", value: data.overview.totalApplications, icon: FileText, color: "text-blue-500", bg: "bg-blue-50" },
        { label: "ACTIVE DRIVES", value: data.overview.activeDrives, icon: Briefcase, color: "text-[#F97316]", bg: "bg-orange-50" },
        { label: "PENDING", value: data.overview.pendingApplications, icon: Clock, color: "text-yellow-500", bg: "bg-yellow-50" },
        { label: "REJECTED", value: data.overview.rejectedApplications, icon: XCircle, color: "text-red-500", bg: "bg-red-50" },
        { label: "INTERVIEWS", value: data.overview.completedInterviews, icon: Users, color: "text-emerald-500", bg: "bg-emerald-50" },
        { label: "HIRED", value: data.overview.hiredThisMonth, icon: CheckCircle2, color: "text-purple-500", bg: "bg-purple-50" },
        { label: "AVG AI SCORE", value: data.overview.avgAIScore || 0, icon: TrendingUp, color: "text-cyan-500", bg: "bg-cyan-50" },
        { label: "PASS RATE", value: data.overview.passRate || 0, suffix: "%", icon: CheckCircle2, color: "text-green-500", bg: "bg-green-50" },
    ];

    const maxFunnel = Math.max(data.funnel.applied, data.funnel.shortlisted, data.funnel.interview, data.funnel.offer, data.funnel.hired) || 1;

    return (
        <div className="space-y-8 pb-12">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-center gap-4 group">
                    <div className="h-12 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full shadow-[0_0_12px_rgba(249,115,22,0.4)] transition-all duration-300 group-hover:h-14" />
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Analytics</h1>
                        <p className="text-gray-500 font-medium mt-1 text-base">Hiring performance and insights</p>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {statsConfig.map((stat, i) => (
                    <div key={i} className="group relative rounded-xl p-4 transition-all duration-300 bg-white border border-gray-100 shadow-sm hover:shadow-md hover:border-orange-100">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{stat.label}</p>
                            <div className={cn("p-1.5 rounded-lg", stat.bg)}>
                                <stat.icon className={cn("h-3.5 w-3.5", stat.color)} />
                            </div>
                        </div>
                        <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Funnel & Status */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Hiring Funnel */}
                <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-8 w-1 bg-[#F97316] rounded-full" />
                        <h2 className="text-lg font-bold text-gray-900">Hiring Funnel</h2>
                    </div>
                    <div className="space-y-4">
                        {[
                            { label: "Applied", value: data.funnel.applied, color: "bg-gray-900" },
                            { label: "Shortlisted", value: data.funnel.shortlisted, color: "bg-blue-500" },
                            { label: "Interview", value: data.funnel.interview, color: "bg-[#F97316]" },
                            { label: "Offer", value: data.funnel.offer, color: "bg-emerald-500" },
                            { label: "Hired", value: data.funnel.hired, color: "bg-green-500" },
                        ].map((item, i) => {
                            const percentage = (item.value / maxFunnel) * 100;
                            return (
                                <div key={i} className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-gray-600">{item.label}</span>
                                        <span className="text-sm font-bold text-gray-900">{item.value}</span>
                                    </div>
                                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className={cn("h-full rounded-full transition-all", item.color)} style={{ width: `${percentage}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Status Breakdown */}
                <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-8 w-1 bg-[#F97316] rounded-full" />
                        <h2 className="text-lg font-bold text-gray-900">Application Status</h2>
                    </div>
                    <div className="space-y-3">
                        {data.statusBreakdown.map((item, i) => {
                            const max = Math.max(...data.statusBreakdown.map(s => s.count)) || 1;
                            const pct = (item.count / max) * 100;
                            return (
                                <div key={i} className="flex items-center gap-3">
                                    <div className="w-28 text-sm font-medium text-gray-600 truncate">{item.status}</div>
                                    <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-[#F97316] rounded-full" style={{ width: `${pct}%` }} />
                                    </div>
                                    <div className="w-12 text-right text-sm font-bold text-gray-900">{item.count}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Score Distribution */}
                <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-8 w-1 bg-[#F97316] rounded-full" />
                        <h2 className="text-lg font-bold text-gray-900">AI Score Distribution</h2>
                    </div>
                    <div className="flex items-end justify-between h-32 gap-2">
                        {data.scores.map((score, i) => {
                            const maxCount = Math.max(...data.scores.map(s => s.count)) || 1;
                            const height = (score.count / maxCount) * 100;
                            return (
                                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                                    <div className="w-full bg-gradient-to-t from-[#F97316] to-orange-400 rounded-t-md" style={{ height: `${height}%` }} />
                                    <span className="text-[10px] font-medium text-gray-500">{score.range}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Weekly Trends */}
                <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-8 w-1 bg-[#F97316] rounded-full" />
                        <h2 className="text-lg font-bold text-gray-900">Weekly Trends</h2>
                    </div>
                    <div className="h-32 flex items-end justify-between gap-2">
                        {data.trends.labels.map((label, i) => {
                            const maxApps = Math.max(...data.trends.applications) || 1;
                            const appHeight = (data.trends.applications[i] / maxApps) * 100;
                            const hiredHeight = data.trends.hired[i] > 0 ? 30 : 0;
                            return (
                                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                                    <div className="w-full flex items-end justify-center gap-1 h-24">
                                        <div className="w-2 bg-gray-300 rounded-t" style={{ height: `${appHeight}%` }} />
                                        <div className="w-2 bg-[#F97316] rounded-t" style={{ height: `${hiredHeight}%` }} />
                                    </div>
                                    <span className="text-[10px] font-medium text-gray-500">{label}</span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex items-center justify-center gap-4 mt-3">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 bg-gray-300 rounded-full" />
                            <span className="text-xs font-medium text-gray-500">Applications</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 bg-[#F97316] rounded-full" />
                            <span className="text-xs font-medium text-gray-500">Hired</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Drive Performance Table */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-1 bg-[#F97316] rounded-full" />
                        <h2 className="text-lg font-bold text-gray-900">Drive Performance</h2>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50">
                                <th className="text-left px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Drive</th>
                                <th className="text-center px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Dept</th>
                                <th className="text-center px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Apps</th>
                                <th className="text-center px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Pending</th>
                                <th className="text-center px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Interview</th>
                                <th className="text-center px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Hired</th>
                                <th className="text-center px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">%</th>
                                <th className="text-center px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {data.drives.map((drive, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                    <td className="px-5 py-3">
                                        <span className="text-sm font-bold text-gray-900">{drive.title}</span>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        <span className="text-xs font-medium text-gray-500">{drive.department}</span>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        <span className="text-sm font-bold text-gray-900">{drive.applications}</span>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        <span className="text-sm font-medium text-yellow-600">{drive.pending}</span>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        <span className="text-sm font-medium text-blue-600">{drive.interviewComplete}</span>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        <span className="text-sm font-bold text-emerald-600">{drive.hired}</span>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        <span className={cn("text-xs font-bold px-2 py-0.5 rounded", 
                                            drive.conversionRate >= 5 ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500")}>
                                            {drive.conversionRate}%
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
                                            drive.status === 'ACTIVE' ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500")}>
                                            {drive.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Department Stats */}
            <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                    <div className="h-8 w-1 bg-[#F97316] rounded-full" />
                    <h2 className="text-lg font-bold text-gray-900">Top Departments</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {data.departments.map((dept, i) => (
                        <div key={i} className="p-4 bg-gray-50 rounded-xl text-center">
                            <p className="text-2xl font-bold text-gray-900">{dept.count}</p>
                            <p className="text-xs font-medium text-gray-500 mt-1">{dept.department}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Upcoming Deadlines */}
            {data.deadlines && data.deadlines.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-8 w-1 bg-[#F97316] rounded-full" />
                        <h2 className="text-lg font-bold text-gray-900">Upcoming Deadlines</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {data.deadlines.map((dl, i) => (
                            <div key={i} className="p-4 border border-orange-100 bg-orange-50/50 rounded-xl">
                                <p className="text-sm font-bold text-gray-900 truncate">{dl.title}</p>
                                <div className="flex items-center gap-2 mt-2">
                                    <Calendar className="h-3.5 w-3.5 text-[#F97316]" />
                                    <span className="text-xs font-medium text-gray-500">
                                        {dl.deadline ? new Date(dl.deadline).toLocaleDateString() : 'No deadline'}
                                    </span>
                                </div>
                                <p className="text-xs font-bold text-[#F97316] mt-1">{dl.positions} positions</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}