"use client";

import { useState } from "react";
import {
    UserPlus, FileCheck, Calendar, XCircle,
    Sparkles, TriangleAlert, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

/* ── Feed data ──────────────────────────────────── */
const feedItems = [
    {
        id: 1, action: "15 new applications",
        drive: "Backend Engineer", time: "2m ago",
        icon: UserPlus, color: "#F97316", bg: "#FFF7ED", // orange-50
    },
    {
        id: 2, action: "AI assessment completed · Score 87%",
        drive: "Product Designer", time: "1h ago",
        icon: FileCheck, color: "#22C55E", bg: "#F0FDF4", // green-50
    },
    {
        id: 3, action: "Interview scheduled with 3 candidates",
        drive: "Senior Frontend Engineer", time: "3h ago",
        icon: Calendar, color: "#3B82F6", bg: "#EFF6FF", // blue-50
    },
    {
        id: 4, action: "AI screening done for 8 candidates",
        drive: "Data Analyst", time: "5h ago",
        icon: FileCheck, color: "#22C55E", bg: "#F0FDF4",
    },
    {
        id: 5, action: "12 rejection emails sent",
        drive: "Backend Engineer", time: "1d ago",
        icon: XCircle, color: "#EF4444", bg: "#FEF2F2", // red-50
    },
    {
        id: 6, action: "8 new applications",
        drive: "Data Analyst", time: "1d ago",
        icon: UserPlus, color: "#F97316", bg: "#FFF7ED",
    },
];

const insights = [
    {
        id: 1,
        text: "Candidates from IIT campuses score 22% higher on technical rounds for your Backend Engineer drive.",
        drive: "Backend Engineer",
    },
    {
        id: 2,
        text: "Top 5 AI-shortlisted candidates for Product Designer have been waiting 4+ days for review.",
        drive: "Product Designer",
    },
    {
        id: 3,
        text: "Application conversion is 2× higher from your careers page vs LinkedIn referrals this month.",
        drive: "All Drives",
    },
];

const alerts = [
    {
        id: 1,
        text: "Drive closing in 5 days",
        meta: "Product Designer · 23 candidates pending",
        time: "5d left",
        level: "amber",
    },
    {
        id: 2,
        text: "2 candidates dropped off during assessment",
        meta: "Backend Engineer · assessment timeout",
        time: "3h ago",
        level: "red",
    },
    {
        id: 3,
        text: "Interview feedback pending from 2 managers",
        meta: "Senior Frontend Engineer",
        time: "1d ago",
        level: "amber",
    },
];

const TABS = ["Activity", "AI Insights", "Alerts"] as const;
type Tab = typeof TABS[number];

export function LiveFeed() {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-8">
            {/* ── ACTIVITY CARD ─────────────────────────── */}
            <Card className="flex flex-col h-[500px] bg-white/80 backdrop-blur-sm border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.06)] transition-all duration-500 rounded-2xl overflow-hidden">
                <CardHeader className="py-5 px-6 border-b border-gray-50 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-orange-50 flex items-center justify-center text-[#F97316] shadow-sm">
                            <UserPlus className="h-5 w-5" />
                        </div>
                        <h3 className="font-bold text-gray-900 tracking-tight">Activity</h3>
                    </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-0 scrollbar-hide">
                    <div className="divide-y divide-gray-50">
                        {feedItems.map((item) => {
                            const Icon = item.icon;
                            return (
                                <div
                                    key={item.id}
                                    className="px-6 py-4 flex items-start gap-4 hover:bg-orange-50/30 transition-colors"
                                >
                                    <div className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: item.bg }}>
                                        <Icon className="h-3.5 w-3.5" style={{ color: item.color }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-gray-900 truncate leading-snug">{item.action}</p>
                                        <p className="text-[11px] font-bold text-gray-400 mt-0.5">{item.drive}</p>
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-300 mt-1">{item.time}</span>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* ── AI INSIGHTS CARD ─────────────────────── */}
            <Card className="flex flex-col h-[500px] bg-white/80 backdrop-blur-sm border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_12px_40px_rgba(249,115,22,0.06)] transition-all duration-500 rounded-2xl overflow-hidden border-t-2 border-t-[#F97316]">
                <CardHeader className="py-5 px-6 border-b border-gray-50 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-orange-100 flex items-center justify-center text-[#F97316] shadow-sm animate-pulse">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <h3 className="font-bold text-gray-900 tracking-tight">AI Insights</h3>
                    </div>
                    <span className="text-[10px] font-black uppercase text-[#F97316] tracking-widest px-2 py-0.5 bg-orange-50 rounded-full">New</span>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-5 space-y-4">
                    {insights.map((ins) => (
                        <div
                            key={ins.id}
                            className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:border-orange-100 transition-all shadow-sm"
                        >
                            <p className="text-xs font-bold text-gray-700 leading-relaxed line-clamp-3">{ins.text}</p>
                            <div className="flex items-center justify-between mt-3">
                                <span className="text-[10px] font-black text-[#F97316] uppercase">{ins.drive}</span>
                                <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>

            {/* ── ALERTS CARD ─────────────────────────── */}
            <Card className="flex flex-col h-[500px] bg-white/80 backdrop-blur-sm border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_12px_40px_rgba(239,68,68,0.06)] transition-all duration-500 rounded-2xl overflow-hidden">
                <CardHeader className="py-5 px-6 border-b border-gray-50 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-red-50 flex items-center justify-center text-red-500 shadow-sm">
                            <TriangleAlert className="h-5 w-5" />
                        </div>
                        <h3 className="font-bold text-gray-900 tracking-tight">Active Alerts</h3>
                    </div>
                    {alerts.length > 0 && (
                        <span className="h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">{alerts.length}</span>
                    )}
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-0 scrollbar-hide">
                    <div className="divide-y divide-gray-50">
                        {alerts.map((alert) => (
                            <div key={alert.id} className="px-6 py-5 flex items-start gap-4 hover:bg-red-50/30 transition-colors">
                                <span
                                    className="h-2 w-2 rounded-full flex-shrink-0 mt-1.5 shadow-[0_0_8px_currentColor]"
                                    style={{ color: alert.level === "red" ? "#EF4444" : "#F59E0B", backgroundColor: "currentColor" }}
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-gray-900 leading-tight">{alert.text}</p>
                                    <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-tighter">{alert.meta}</p>
                                </div>
                                <span className="text-[10px] font-bold text-gray-300 mt-0.5 whitespace-nowrap">{alert.time}</span>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
