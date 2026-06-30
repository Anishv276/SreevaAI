"use client";
import React, { useEffect, useState } from "react";
import { Sparkles, Calendar, ChevronLeft, ChevronRight, Download, Users, Briefcase, Clock, TrendingUp, Search, CheckCircle2, BarChart3 } from "lucide-react";
import { formatOrgPlan } from "@/lib/org-plans";
import { getLandingPackageByName, getLandingPackageForOrgPlan } from "@/lib/landing-packages";
import { getSupportComposeUrl } from "@/lib/interview-quota";
import { DateFilter, type DateRange } from "@/components/admin/date-filter";

export function BillingContent(props?: any) {
    const creditsEndpoint = props?.creditsEndpoint || "/api/billing?";
    const historyEndpoint = props?.historyEndpoint || "/api/billing/history?";
    const [billingData, setBillingData] = useState<any>(null);
    const [historyData, setHistoryData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [trendTimeline, setTrendTimeline] = useState<DateRange>({ type: "month" });
    const [historyTimeline, setHistoryTimeline] = useState<DateRange>({ type: "all" });
    const [trendLoading, setTrendLoading] = useState(false);
    const [historySearch, setHistorySearch] = useState("");

    // Dynamic 'This Month' label
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthLabel = `This Month (${startOfMonth.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;

    useEffect(() => {
        let isMounted = true;
        setLoading(true);
        const query = new URLSearchParams();
        query.set("trendRange", trendTimeline.type);
        if (trendTimeline.type === 'custom') {
            query.set("customFrom", trendTimeline.from);
            query.set("customTo", trendTimeline.to);
        }

        const historyQuery = new URLSearchParams();
        historyQuery.set("dateRange", historyTimeline.type);
        if (historyTimeline.type === 'custom') {
            historyQuery.set("dateFrom", historyTimeline.from);
            historyQuery.set("dateTo", historyTimeline.to);
        }
        if (historySearch) {
            historyQuery.set("search", historySearch);
        }

        const creditsUrl = `${creditsEndpoint}${query.toString()}`;
        const historyUrl = `${historyEndpoint}${historyQuery.toString()}`;

        Promise.all([
            fetch(creditsUrl).then(res => {
                if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
                return res.json();
            }),
            fetch(historyUrl).then(res => {
                if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
                return res.json();
            })
        ]).then(([billing, history]) => {
            if (isMounted) {
                setBillingData(billing);
                setHistoryData(history);
                setLoading(false);
                setTrendLoading(false);
            }
        }).catch(err => {
            console.error("Billing fetch error:", creditsEndpoint, historyEndpoint, err);
            if (isMounted) {
                setLoading(false);
                setTrendLoading(false);
            }
        });
        return () => { isMounted = false; };
    }, [trendTimeline, historyTimeline, historySearch, creditsEndpoint, historyEndpoint]);

    const handleExportCSV = () => {
        if (!historyData?.history || historyData.history.length === 0) return;
        const rows = historyData.history;
        const headers = ["CANDIDATE", "ROLE", "INTERVIEWS", "DATE", "DURATION", "STATUS"];
        const csvContent = [
            headers.join(","),
            ...rows.map((row: any) => [
                `"${row.candidateName}"`,
                `"${row.role}"`,
                row.interviewsCount,
                `"${new Date(row.date).toLocaleDateString('en-US')} ${new Date(row.date).toLocaleTimeString('en-US')}"`,
                formatDuration(row.duration),
                row.status
            ].join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `interview_history_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading || !billingData) {
        return (
            <div className="flex justify-center py-20">
                <div className="animate-spin h-8 w-8 border-4 border-violet-500 border-t-transparent rounded-full"></div>
            </div>
        );
    }

    const { plan, usage } = billingData;
    const historyRows = historyData?.history || [];

    if (!plan) {
        return (
            <div className="flex justify-center py-20">
                <div className="text-red-600 font-semibold">Error loading billing data. Please refresh.</div>
            </div>
        );
    }

    const resolvedPlan = getLandingPackageForOrgPlan(plan.name) || getLandingPackageByName(formatOrgPlan(plan.name)) || getLandingPackageByName("Starter");

    const formatDuration = (sec: number) => {
        if (!sec) return "0m 0s";
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}m ${s}s`;
    };

    // Calculate dynamic trend polyline points
    const maxCount = Math.max(...(usage.trend || []).map((t: any) => t.count), 1);
    const trendPoints = (usage.trend || []).map((t: any, i: number, arr: any[]) => {
        const x = (i / Math.max(1, arr.length - 1)) * 100;
        const y = 80 - ((t.count / maxCount) * 60);
        return `${x},${y}`;
    }).join(" ");

    return (
        <div className="font-sans max-w-[1200px] w-full pt-2">
            {/* Header controls (Date Dropdown) */}
            <div className="flex justify-between items-center mb-6">
                <div className="border-b-2 border-violet-600 pb-2">
                    <span className="text-[14px] font-bold text-violet-700 px-2">Overview</span>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl bg-white text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 cursor-default">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    {thisMonthLabel}
                    <svg className="w-3.5 h-3.5 ml-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Left Content */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Usage Overview Section */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                        <div className="flex items-center gap-2 mb-4">
                            <h2 className="text-[15px] font-bold text-gray-900">Usage Overview</h2>
                            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {/* Card 1 */}
                            <div className="bg-violet-50/50 rounded-2xl p-4 border border-violet-100">
                                <div className="h-8 w-8 rounded-full bg-violet-100 flex items-center justify-center mb-3">
                                    <Users className="h-4 w-4 text-violet-600" />
                                </div>
                                <p className="text-[11px] font-semibold text-gray-500 mb-1">Interviews Completed</p>
                                <div className="flex items-baseline gap-1 mb-3">
                                    <span className="text-2xl font-black text-gray-900 leading-none">{usage.interviewsCompleted}</span>
                                    <span className="text-xs font-bold text-gray-400">/ {plan.interviewsTotal}</span>
                                </div>
                                <div className="h-1.5 w-full bg-violet-200/50 rounded-full mb-2 overflow-hidden">
                                    <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.min(100, (usage.interviewsCompleted / plan.interviewsTotal) * 100)}%` }} />
                                </div>
                                <p className="text-[10px] font-bold text-violet-700">{(usage.interviewsCompleted / plan.interviewsTotal * 100).toFixed(1)}% used</p>
                            </div>

                            {/* Card 2 */}
                            <div className="bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100">
                                <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                                    <Briefcase className="h-4 w-4 text-emerald-600" />
                                </div>
                                <p className="text-[11px] font-semibold text-gray-500 mb-1">Active Drives</p>
                                <div className="flex items-baseline gap-1 mb-3">
                                    <span className="text-2xl font-black text-gray-900 leading-none">{usage.activeDrives}</span>
                                    <span className="text-xs font-bold text-gray-400">/ {plan.maxActiveDrives}</span>
                                </div>
                                <div className="h-1.5 w-full bg-emerald-200/50 rounded-full mb-2 overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: plan.maxActiveDrives === 'Unlimited' ? '100%' : `${Math.min(100, (usage.activeDrives / plan.maxActiveDrives) * 100)}%` }} />
                                </div>
                                <p className="text-[10px] font-bold text-emerald-700">{plan.maxActiveDrives === 'Unlimited' ? 'Active' : `${(usage.activeDrives / plan.maxActiveDrives * 100).toFixed(0)}% used`}</p>
                            </div>

                            {/* Card 3 */}
                            <div className="bg-amber-50/50 rounded-2xl p-4 border border-amber-100 relative">
                                <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center mb-3">
                                    <Clock className="h-4 w-4 text-amber-600" />
                                </div>
                                <p className="text-[11px] font-semibold text-gray-500 mb-1">Total Interview Time</p>
                                <div className="flex items-baseline gap-1 mb-1">
                                    <span className="text-2xl font-black text-gray-900 leading-none">{formatDuration(usage.totalInterviewTime)}</span>
                                </div>
                                <p className="text-[10px] font-medium text-gray-400 mb-2">vs last month</p>
                                <div className="flex justify-between items-end">
                                    {/* Mock Sparkline */}
                                    <svg width="40" height="15" viewBox="0 0 40 15">
                                        <polyline points="0,15 10,10 20,12 30,5 40,2" fill="none" stroke="#F59E0B" strokeWidth="1.5" />
                                    </svg>
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700">↑ {usage.timeVsLastMonth}%</span>
                                </div>
                            </div>

                            {/* Card 4 */}
                            <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100 relative">
                                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center mb-3">
                                    <TrendingUp className="h-4 w-4 text-blue-600" />
                                </div>
                                <p className="text-[11px] font-semibold text-gray-500 mb-1">Usage vs Last Month</p>
                                <div className="flex items-baseline gap-1 mb-1">
                                    <span className="text-2xl font-black text-gray-900 leading-none">+{usage.usageVsLastMonth}%</span>
                                </div>
                                <p className="text-[10px] font-medium text-gray-400 mb-2">vs last month</p>
                                <div className="flex justify-between items-end">
                                    <svg width="40" height="15" viewBox="0 0 40 15">
                                        <polyline points="0,15 10,12 20,8 30,10 40,2" fill="none" stroke="#3B82F6" strokeWidth="1.5" />
                                    </svg>
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700">↑ {usage.usageVsLastMonth}%</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Trend Bar Chart */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-[15px] font-bold text-gray-900">Interview Usage Trend</h2>
                            <div className="flex items-center gap-2">
                                <DateFilter value={trendTimeline} onChange={setTrendTimeline} />
                            </div>
                        </div>
                        <div className={`h-56 relative w-full flex flex-col justify-end pt-4 transition-opacity duration-300 ${trendLoading ? 'opacity-50' : 'opacity-100'}`}>
                            <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                                <defs>
                                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#8B5CF6" /> {/* violet-500 */}
                                        <stop offset="100%" stopColor="#C4B5FD" /> {/* violet-300 */}
                                    </linearGradient>
                                    <linearGradient id="barGradientHover" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#7C3AED" /> {/* violet-600 */}
                                        <stop offset="100%" stopColor="#A78BFA" /> {/* violet-400 */}
                                    </linearGradient>
                                </defs>

                                {/* Grid lines */}
                                <line x1="0" y1="20" x2="100" y2="20" stroke="#F3F4F6" strokeWidth="0.5" strokeDasharray="2 2" />
                                <line x1="0" y1="50" x2="100" y2="50" stroke="#F3F4F6" strokeWidth="0.5" strokeDasharray="2 2" />
                                <line x1="0" y1="80" x2="100" y2="80" stroke="#F3F4F6" strokeWidth="0.5" strokeDasharray="2 2" />

                                {/* Bar Chart */}
                                {usage.trend && usage.trend.map((t: any, i: number, arr: any[]) => {
                                    const numBars = arr.length || 1;
                                    const barWidth = Math.min(60 / numBars, 8); // dynamic width, max 8
                                    const spacing = 100 / numBars;
                                    const x = (i * spacing) + (spacing / 2) - (barWidth / 2);

                                    const heightPercentage = t.count > 0 ? (t.count / maxCount) * 80 : 2; // min height 2 for visibility
                                    const y = 100 - heightPercentage;

                                    return (
                                        <g key={t.date} className="group cursor-pointer">
                                            {/* Hover backdrop track */}
                                            <rect x={x - 1} y="0" width={barWidth + 2} height="100" fill="#F3F4F6" opacity="0" className="group-hover:opacity-50 transition-opacity duration-300" rx="1" />
                                            {/* Actual Bar */}
                                            <rect
                                                x={x}
                                                y={y}
                                                width={barWidth}
                                                height={heightPercentage}
                                                fill="url(#barGradient)"
                                                className="group-hover:fill-[url(#barGradientHover)] transition-all duration-300 origin-bottom"
                                                rx={barWidth / 2}
                                            />
                                        </g>
                                    );
                                })}
                            </svg>
                            <div className="flex justify-between w-full text-[10px] text-gray-400 font-semibold mt-4 px-2">
                                {usage.trend && usage.trend.filter((_: any, i: number) => {
                                    if (trendTimeline.type === 'today' || (trendTimeline.type === 'custom' && trendTimeline.from === trendTimeline.to)) return i % Math.ceil(usage.trend.length / 6) === 0;
                                    if (trendTimeline.type === 'week') return true;
                                    return i % Math.ceil(usage.trend.length / 6) === 0;
                                }).map((t: any) => (
                                    <span key={t.date}>
                                        {(trendTimeline.type === 'today' || (trendTimeline.type === 'custom' && trendTimeline.from === trendTimeline.to))
                                            ? (t.date.split(' ')[1] + ' ' + (t.date.split(' ')[2] || ''))
                                            : new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Usage History Table */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-[15px] font-bold text-gray-900">Interview Usage History</h2>
                            <button onClick={handleExportCSV} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                                <Download className="w-3.5 h-3.5" /> Export CSV
                            </button>
                        </div>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="relative flex-1 max-w-[280px]">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search by candidate name, role or email..."
                                    value={historySearch}
                                    onChange={(e) => setHistorySearch(e.target.value)}
                                    className="w-full h-9 pl-9 pr-4 rounded-xl border border-gray-200 text-[13px] placeholder-gray-400 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                                />
                            </div>
                            <DateFilter value={historyTimeline} onChange={setHistoryTimeline} />
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-gray-100">
                                        <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-gray-400">CANDIDATE</th>
                                        <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-gray-400">ROLE</th>
                                        <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-gray-400">INTERVIEWS</th>
                                        <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-gray-400">DATE</th>
                                        <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-gray-400">DURATION</th>
                                        <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-gray-400">STATUS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historyRows.length > 0 ? historyRows.map((row: any) => (
                                        <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                                            <td className="py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-8 w-8 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold shrink-0">
                                                        {row.candidateName.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="text-[13px] font-bold text-gray-900">{row.candidateName}</p>
                                                        <p className="text-[11px] text-gray-400">{row.candidateEmail || "No email provided"}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-4 text-[13px] font-bold text-gray-700">{row.role}</td>
                                            <td className="py-4 text-[13px] font-bold text-gray-700">{row.interviewsCount}</td>
                                            <td className="py-4">
                                                <p className="text-[13px] font-bold text-gray-900">{new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                                <p className="text-[11px] text-gray-400">{new Date(row.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                                            </td>
                                            <td className="py-4 text-[13px] font-bold text-gray-700">{formatDuration(row.duration)}</td>
                                            <td className="py-4">
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-[11px] font-bold text-emerald-700">
                                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                    {row.status === "COMPLETED" ? "Completed" : row.status}
                                                </span>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={6} className="py-8 text-center text-[13px] text-gray-400">No interviews found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex items-center justify-between mt-4">
                            <p className="text-[12px] font-semibold text-gray-500">Showing {historyRows.length} of {historyData?.pagination?.total || 0} result</p>
                            <div className="flex gap-2">
                                <button className="h-7 w-7 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 hover:bg-gray-50">
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                </button>
                                <button className="h-7 w-7 flex items-center justify-center rounded-lg bg-violet-100 text-violet-700 font-bold text-xs">
                                    1
                                </button>
                                <button className="h-7 w-7 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 hover:bg-gray-50">
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sidebar (Right) */}
                <div className="space-y-6">
                    {/* Current Plan Card */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                        <div className="flex justify-between items-start mb-6">
                            <h2 className="text-[15px] font-bold text-gray-900">Current Plan</h2>
                            <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">Current Plan</span>
                        </div>
                        <div className="flex gap-4 items-start mb-6">
                            <div className="w-12 h-12 rounded-2xl bg-violet-600 flex items-center justify-center shrink-0">
                                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-gray-900 leading-none mb-1">{resolvedPlan?.name || plan.name}</h3>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-black text-gray-900">{resolvedPlan?.price || `$${plan.price}`}</span>
                                    <span className="text-xs font-semibold text-gray-500">{resolvedPlan?.suffix || "/ month"}</span>
                                </div>
                                <p className="text-[11px] font-semibold text-gray-500 mt-1">{resolvedPlan?.interviewsIncluded || `${plan.interviewsTotal} interviews included`}</p>
                            </div>
                        </div>
                        <div className="space-y-3 mb-8">
                            {(resolvedPlan?.features?.slice(0, 5) || [
                                `${plan.interviewsTotal} Interviews / month`,
                                `${plan.maxActiveDrives} Active drives`,
                                'Resume screening',
                                'Adaptive AI Interview',
                                'Priority support'
                            ]).map((feat: string, i: number) => (
                                <div key={i} className="flex items-center gap-3">
                                    <div className="w-4 h-4 rounded-full bg-violet-600 flex items-center justify-center shrink-0">
                                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    </div>
                                    <span className="text-[13px] font-bold text-gray-700">{feat}</span>
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-6 border-t border-gray-100">
                            <div>
                                <p className="text-[10px] font-semibold text-gray-400 mb-1">Next billing date</p>
                                <p className="text-[13px] font-bold text-gray-900">
                                    {new Date(plan.nextBillingDate).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] font-semibold text-gray-400 mb-1">Billing cycle</p>
                                <p className="text-[13px] font-bold text-gray-900">{plan.billingCycle}</p>
                            </div>
                        </div>
                    </div>

                    {/* Usage Summary */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                        <div className="flex items-center gap-2 mb-6">
                            <Sparkles className="h-4 w-4 text-violet-600" />
                            <h2 className="text-[14px] font-bold text-gray-900">Usage Summary</h2>
                        </div>
                        <div className="space-y-4">
                            <div className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 flex gap-3">
                                <div className="mt-0.5"><BarChart3 className="h-4 w-4 text-violet-600" /></div>
                                <div>
                                    <p className="text-[13px] font-bold text-gray-900 leading-tight">You've used {(usage.interviewsCompleted / plan.interviewsTotal * 100).toFixed(0)}% of your monthly interviews.</p>
                                    <p className="text-[12px] text-gray-500 mt-0.5">Plenty of room to grow!</p>
                                </div>
                            </div>
                            <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/30 flex gap-3">
                                <div className="mt-0.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /></div>
                                <div>
                                    <p className="text-[13px] font-bold text-gray-900 leading-tight">All systems operational</p>
                                    <p className="text-[12px] text-gray-500 mt-0.5">No usage or billing issues.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Support CTA */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                        <h3 className="text-[15px] font-bold text-gray-900 mb-2">Need more interviews?</h3>
                        <p className="text-[13px] text-gray-500 mb-5">Upgrade your plan or contact support to increase your quota.</p>
                        <a
                            href={getSupportComposeUrl({ subject: "Increase org quota request", body: "Hi support team,\n\nWe need more interviews. Please help us recharge.\n" })}
                            target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 transition-colors text-white text-[13px] font-bold"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                            Contact Support
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
