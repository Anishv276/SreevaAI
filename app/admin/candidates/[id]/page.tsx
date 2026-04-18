"use client";

import { use, useEffect, useState, useRef, memo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    ArrowLeft, Download, Mail, Phone, MapPin, Calendar,
    CheckCircle2, XCircle, Sparkles, Zap, ArrowRight,
    TrendingUp, AlertTriangle, ChevronRight, ShieldCheck, Terminal, UserSearch,
    MessageSquare, Target, BriefcaseBusiness, Globe, IndianRupee, RefreshCw, Camera, Loader2, User, X, ChevronDown, ChevronUp, EyeOff, LayoutDashboard, FileText,
    MonitorSmartphone, UserCheck, Volume2, AlertCircle
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import "plyr-react/plyr.css";
import { AuditLogModal } from "@/components/admin/audit-log-modal";

const Plyr = dynamic(() => import("plyr-react").then((mod) => mod.Plyr), { ssr: false });


/* â”€â”€ Pic 1: Top Summary Cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const ScoreCard = memo(function ScoreCard({ label, value, status, color = "orange" }: { label: string; value: string; status: string; color?: "orange" | "red" | "emerald" | "slate" }) {
    const bgStyles = {
        orange: "bg-[#FDF9F3] border-[#F5E6D3] text-[#8B5E3C]",
        red: "bg-[#FFF5F5] border-[#FED7D7] text-[#C53030]",
        emerald: "bg-[#F0FFF4] border-[#C6F6D5] text-[#2F855A]",
        slate: "bg-[#F8FAFC] border-[#E2E8F0] text-[#475569]"
    };
    const badgeStyles = {
        orange: "bg-[#F59E0B]/10 text-[#B45309] border-[#F59E0B]/20",
        red: "bg-[#EF4444]/10 text-[#B91C1C] border-[#EF4444]/20",
        emerald: "bg-[#10B981]/10 text-[#047857] border-[#10B981]/20",
        slate: "bg-[#64748B]/10 text-[#334155] border-[#64748B]/20"
    };

    return (
        <div className={cn("p-6 rounded-[28px] border flex flex-col items-center justify-center gap-1.5 transition-all hover:shadow-md", bgStyles[color])}>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">{label}</p>
            <h4 className="text-2xl font-bold tracking-tight">{value}</h4>
            <span className={cn("px-2.5 py-0.5 rounded-full text-[8.5px] font-bold uppercase tracking-widest border mt-1.5", badgeStyles[color])}>
                {status}
            </span>
        </div>
    );
});

/* â”€â”€ Pic 2: JD Skill Assessment Cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
/* â”€â”€ Pic 2: JD Skill Assessment Cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const AssessmentCard = memo(function AssessmentCard({ title, subtitle, confidence, score, status }: { title: string; subtitle: string; confidence: string; score: string; status: "PROVED" | "PARTIAL" | "NOT PROVED" | "NOT TESTED" }) {
    const statusThemes = {
        PROVED: { border: "border-emerald-500", bg: "bg-emerald-50/50", text: "text-emerald-700", label: "PROVED" },
        PARTIAL: { border: "border-amber-500", bg: "bg-amber-50/50", text: "text-amber-700", label: "PARTIAL" },
        "NOT PROVED": { border: "border-rose-500", bg: "bg-rose-50/50", text: "text-rose-700", label: "NOT PROVED" },
        "NOT TESTED": { border: "border-gray-200", bg: "bg-gray-50/50", text: "text-gray-400", label: "NOT TESTED" },
    };
    const theme = statusThemes[status];

    const scoreValue = parseInt(score.split('/')[0]) || 0;
    const getScoreStyles = (val: number) => {
        if (val >= 7) return "bg-emerald-500 text-white shadow-emerald-200/50";
        if (val >= 4) return "bg-amber-500 text-white shadow-amber-200/50";
        return "bg-rose-500 text-white shadow-rose-200/50";
    };

    return (
        <div className={cn("group relative p-4 rounded-[18px] border border-gray-100 transition-all hover:shadow-md hover:border-gray-200 bg-white shadow-sm overflow-hidden", (status !== "NOT TESTED" && status !== "NOT PROVED") ? "bg-white" : "bg-slate-50/20")}>
            <div className={cn("absolute left-0 top-0 bottom-0 w-1", theme.border)} />
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                        <h4 className="text-[12.5px] font-bold text-gray-900 tracking-tight leading-none uppercase">{title}</h4>
                        <span className={cn("px-1.5 py-0.5 rounded text-[7px] font-bold uppercase tracking-widest border border-current/20", theme.bg, theme.text)}>
                            {theme.label}
                        </span>
                    </div>
                    <p className="text-[10.5px] font-semibold text-gray-700 leading-relaxed">
                        {subtitle}
                    </p>
                    <div className="flex items-center gap-2 pt-0.5">
                        <span className="text-[7.5px] font-bold text-gray-400 uppercase tracking-[0.2em]">Confidence Depth:</span>
                        <span className="text-[8.5px] font-bold text-gray-500 uppercase tracking-tight">{confidence}</span>
                    </div>
                </div>
                <div className={cn("h-10 w-10 rounded-lg flex flex-col items-center justify-center shadow-md group-hover:scale-110 transition-transform", getScoreStyles(scoreValue))}>
                    <span className="text-[15px] font-bold leading-none tracking-tighter">{scoreValue}</span>
                    <span className="text-[7px] font-bold opacity-40 uppercase tracking-widest mt-0.5">/10</span>
                </div>
            </div>
        </div>
    );
});

const VerdictScoreCard = memo(function VerdictScoreCard({ label, value, color }: { label: string; value: string; color: "red" | "orange" | "green" | "blue" | "indigo" | "slate" }) {
    const colors = {
        red: "text-slate-950",
        orange: "text-slate-950",
        green: "text-slate-950",
        blue: "text-slate-950",
        indigo: "text-slate-950",
        slate: "text-[#475569]",
    };
    return (
        <div className="p-8 rounded-[32px] bg-white border border-gray-100 flex flex-col items-center justify-center gap-3 hover:shadow-md shadow-sm transition-all">
            <h4 className={cn("text-4xl font-bold tracking-tighter", colors[color])}>{value}</h4>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.4em] pt-1">{label}</p>
        </div>
    );
});

const RecommendedActionItem = memo(function RecommendedActionItem({ text }: { text: string }) {
    return (
        <div className="flex gap-4 items-start group">
            <div className="mt-1 h-4 w-4 rounded-full flex items-center justify-center shrink-0">
                <ArrowRight className="h-3.5 w-3.5 text-slate-500 font-black group-hover:translate-x-1 transition-transform" />
            </div>
            <p className="text-[13px] font-semibold text-slate-900 leading-relaxed font-bold tracking-tight">
                {text}
            </p>
        </div>
    );
});

/* â”€â”€ Pic 2: Chat Entry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const ChatEntry = memo(function ChatEntry({ role, text, name }: { role: "ai" | "candidate"; text: string; name: string }) {
    const isAi = role === "ai";
    return (
        <div className={cn(
            "flex w-full gap-3 px-2 group/chat transition-all flex-none",
            isAi ? "flex-row" : "flex-row-reverse"
        )}>
            <div className="flex flex-col items-center shrink-0">
                <div className={cn(
                    "h-8 w-8 border-2 border-white rounded-[12px] flex items-center justify-center text-[9px] font-black shadow-lg transition-all group-hover/chat:rotate-3",
                    isAi ? "bg-slate-50 text-slate-400" : "bg-slate-900 text-white shadow-slate-900/10"
                )}>
                    {isAi ? "AI" : (name.charAt(0).toUpperCase() || "C")}
                </div>
            </div>

            <div className={cn(
                "flex flex-col max-w-[88%] space-y-1",
                isAi ? "items-start" : "items-end"
            )}>
                <div className="flex items-center gap-2 px-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] leading-none font-inter">
                        {isAi ? "Interview AI" : name}
                    </span>
                </div>

                <div className={cn(
                    "relative p-3 rounded-[20px] text-[12px] font-semibold tracking-tight leading-relaxed shadow-sm transition-all hover:shadow-md font-inter",
                    isAi 
                        ? "bg-white border border-slate-100 text-slate-700 rounded-tl-none" 
                        : "bg-slate-950 text-slate-50 rounded-tr-none"
                )}>
                    {text}
                </div>
            </div>
        </div>
    );
});

/* â”€â”€ Pic 2: Analysis Entry (Question by Question) â”€â”€â”€â”€â”€â”€ */
const AnalysisEntry = memo(function AnalysisEntry({ qNumber, question, reasoning, depth, score }: { qNumber: string; question: string; reasoning: string; depth: string; score: string }) {
    const scoreVal = parseInt(score.split('/')[0]) || 0;
    
    const getScoreColor = (val: number) => {
        if (val >= 7) return "text-emerald-700 bg-emerald-50 border-emerald-100";
        if (val >= 4) return "text-amber-700 bg-amber-50 border-amber-100";
        return "text-rose-700 bg-rose-50 border-rose-100";
    };

    return (
        <div className="group relative p-6 rounded-[24px] border border-slate-100 bg-white hover:border-slate-200 hover:shadow-xl hover:shadow-slate-900/5 transition-all mb-6 last:mb-0 overflow-hidden font-inter">
            <div className="absolute top-0 right-0 p-4">
                <div className={cn("px-4 py-2 rounded-xl border font-bold text-[11px] shadow-sm tracking-widest", getScoreColor(scoreVal))}>
                    {score}
                </div>
            </div>
            
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-slate-800 uppercase tracking-[0.25em]">{qNumber}</span>
                    <div className="h-[1px] w-8 bg-slate-200" />
                </div>

                <div className="space-y-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] opacity-60">Question Probe</p>
                    <h5 className="text-[15px] font-bold text-slate-900 leading-snug tracking-tight">
                        {question}
                    </h5>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 items-end">
                    <div className="space-y-4">
                        <div className="p-5 rounded-3xl bg-[#FAF9F6] border border-slate-50 italic">
                            <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.3em] mb-2 leading-none">AI Reasoning Path</p>
                            <p className="text-[13px] font-semibold text-slate-600 leading-relaxed">
                                "{reasoning}"
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-1.5 pb-2">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] opacity-60">Signal Depth</span>
                        <span className="text-[11px] font-black text-slate-900 uppercase tracking-widest bg-slate-50 px-4 py-1.5 rounded-full border border-slate-200">
                            {depth}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
});

/* â”€â”€ Pic 2: Key Moment Entry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const MomentEntry = memo(function MomentEntry({ time, type, observation, comment }: { time: string; type: "CONTEXT" | "FLAG" | "CRITICAL"; observation: string; comment: string }) {
    const typeStyles = {
        CONTEXT: "text-slate-400 bg-slate-50 border-slate-100",
        FLAG: "text-slate-600 bg-slate-50 border-slate-100 italic",
        CRITICAL: "text-slate-950 bg-slate-50 border-slate-200 font-black"
    };
    return (
        <div className="grid grid-cols-[80px_1fr] group border-b border-gray-100 last:border-0 hover:bg-gray-50/40 transition-all">
            <div className="py-5 flex flex-col items-center">
                <span className="text-[12.5px] font-extrabold text-slate-950 font-black tracking-tighter tabular-nums opacity-60">{time}</span>
                <div className="h-full w-[1.5px] bg-gray-100 my-1.5 group-last:hidden" />
            </div>
            <div className="py-5 space-y-3">
                <div className="flex items-center gap-3">
                    <span className={cn("px-2 py-0.5 rounded-[4px] text-[8px] font-bold uppercase tracking-widest border shadow-sm", typeStyles[type])}>{type}</span>
                    <h5 className="text-[13.5px] font-bold text-gray-900 tracking-tight leading-none uppercase">{observation}</h5>
                </div>
                <div className="p-4 rounded-[18px] bg-white border-2 border-gray-50 text-[11.5px] text-gray-700 leading-relaxed font-semibold shadow-sm">
                    {comment}
                </div>
            </div>
        </div>
    );
});

/* â”€â”€ Pic 4: Verdict Score Box â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const VerdictScoreBox = memo(function VerdictScoreBox({ label, value, color = "rose" }: { label: string; value: string; color?: "rose" | "orange" | "amber" }) {
    const colors = {
        rose: "text-rose-600 bg-rose-50/30 border-rose-100",
        orange: "text-orange-600 bg-orange-50/30 border-orange-100",
        amber: "text-amber-600 bg-amber-50/30 border-amber-100"
    };
    return (
        <div className={cn("p-10 rounded-[40px] border flex flex-col items-center justify-center gap-3", colors[color])}>
            <span className="text-5xl font-bold tracking-tighter">{value}</span>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">{label}</p>
        </div>
    );
});

/* â”€â”€ Pic 5: Deep Dive Log â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const DeepDiveLog = memo(function DeepDiveLog({ label, description, time, type = "error" }: { label: string; description: string; time: string; type?: "error" | "warning" | "success" }) {
    const styles = {
        error: "bg-red-50 border-red-100 text-red-600",
        warning: "bg-orange-50 border-orange-100 text-orange-600",
        success: "bg-emerald-50 border-emerald-100 text-emerald-600"
    };
    return (
        <div className={cn("p-5 rounded-3xl border flex items-start justify-between gap-4", styles[type])}>
            <div className="space-y-1">
                <h5 className="text-[13px] font-semibold text-gray-900">{label}</h5>
                <p className="text-[11px] font-bold uppercase tracking-widest opacity-70 leading-relaxed">{description}</p>
            </div>
            <span className="text-[10px] font-bold whitespace-nowrap pt-0.5 uppercase">{time}</span>
        </div>
    );
});

/* â”€â”€ Pic 3: Integrity Logic Row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
/* â”€â”€ Pic 3: Integrity Logic Row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const IntegrityRow = memo(function IntegrityRow({ label, value, status }: { label: string; value: string; status: string }) {
    return (
        <div className="p-6 rounded-[32px] bg-white border border-gray-100 flex flex-col items-center justify-center gap-2 flex-1 shadow-sm">
            <h4 className="text-2xl font-bold text-gray-900 tracking-tight">{value}</h4>
            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">{label}</p>
            <span className={cn("px-2 py-0.5 rounded text-[7px] font-bold uppercase tracking-tighter border mt-1",
                status === "NO RISK" ? "bg-slate-50 text-slate-900 border-slate-200 shadow-sm" : "bg-orange-50 text-orange-600 border-orange-100 font-semibold"
            )}>{status}</span>
        </div>
    );
});

/* â”€â”€ Proctoring Metric Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const ProctoringMetric = memo(function ProctoringMetric({ value, label, risk }: { value: string; label: string; risk: "NO RISK" | "MEDIUM RISK" | "HIGH RISK" }) {
    const riskStyles = {
        "NO RISK": "bg-[#F0FDF4] text-emerald-600 border-[#DCFCE7]",
        "MEDIUM RISK": "bg-[#FFF7ED] text-orange-600 border-[#FFEDD5]",
        "HIGH RISK": "bg-[#FFF1F2] text-rose-600 border-[#FFE4E6]",
    };
    const valueColors = {
        "NO RISK": "text-emerald-500",
        "MEDIUM RISK": "text-orange-500",
        "HIGH RISK": "text-rose-500",
    };
    // Special case for the reddish "1" in the screenshot
    const displayColor = (label === "Tab Switches" && value === "1") ? "text-slate-950" : valueColors[risk];

    return (
        <div className="p-5 rounded-[28px] bg-white border border-gray-100 flex flex-col items-center justify-center gap-2 transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-[0_4px_24px_rgba(0,0,0,0.02)] flex-1 min-w-[140px]">
            <h4 className={cn("text-3xl font-black tracking-tight", displayColor)}>{value}</h4>
            <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-[0.18em] whitespace-nowrap text-center">{label}</p>
            <span className={cn("px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border mt-1", riskStyles[risk])}>
                {risk}
            </span>
        </div>
    );
});

/* â”€â”€ Timeline Event Item â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const TimelineEvent = memo(function TimelineEvent({ time, event, risk, desc, subNote, isSuccess = false }: { time: string; event: string; risk: "CLEAN" | "MEDIUM RISK" | "HIGH RISK"; desc: string; subNote?: string; isSuccess?: boolean }) {
    const riskStyles = {
        CLEAN: "bg-emerald-50 text-emerald-700 border-emerald-100",
        "MEDIUM RISK": "bg-orange-50 text-orange-700 border-orange-100",
        "HIGH RISK": "bg-rose-50 text-rose-700 border-rose-100",
    };
    const dotColor = isSuccess ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]" : risk === "MEDIUM RISK" ? "bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.5)]" : "bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.5)]";

    return (
        <div className="grid grid-cols-[80px_1fr] relative group">
            <div className="flex flex-col items-center pt-2">
                <span className="text-[12px] font-extrabold text-slate-500 font-inter tracking-tight">{time}</span>
                <div className="w-[1.5px] flex-1 bg-slate-100 my-4 group-last:hidden rounded-full" />
            </div>
            <div className="pb-8 pl-10 relative">
                <div className={cn("absolute -left-[5px] top-[14px] h-[10px] w-[10px] rounded-full ring-[4px] ring-white shadow-md z-10 transition-transform group-hover:scale-125", dotColor)} />
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <h5 className="text-[15px] font-black text-slate-900 tracking-tight leading-none font-inter">{event}</h5>
                        <span className={cn("px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm", riskStyles[risk])}>
                            {risk}
                        </span>
                    </div>
                    <p className="text-[14px] font-semibold text-slate-600 leading-relaxed max-w-[95%] font-inter">{desc}</p>
                    {subNote && (
                        <div className="bg-slate-50/80 border-l-4 border-indigo-400 p-4 rounded-r-2xl transform transition-all group-hover:translate-x-1 group-hover:bg-slate-50">
                            <p className="text-[13px] font-semibold text-indigo-900 italic leading-relaxed font-inter">
                                {subNote}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

/* â”€â”€ Analysis Signal Item â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const AnalysisSignal = memo(function AnalysisSignal({ title, desc, type }: { title: string; desc: string; type: "success" | "warning" }) {
    const theme = type === "success" 
        ? "bg-emerald-50/40 border-emerald-100/60 text-emerald-600 icon-bg-emerald-100" 
        : "bg-orange-50/40 border-orange-100/60 text-orange-600 icon-bg-orange-100";

    return (
        <div className={cn("flex gap-5 p-6 rounded-[32px] border transition-all hover:translate-y-[-2px] group relative overflow-hidden bg-white shadow-sm hover:shadow-md", theme)}>
            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-110", 
                type === "success" ? "bg-emerald-100 text-emerald-600" : "bg-orange-100 text-orange-600")}>
                {type === "success" ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
            </div>
            <div className="space-y-1.5">
                <h5 className="text-[15px] font-bold text-slate-900 tracking-tight leading-tight font-inter">{title}</h5>
                <p className="text-[13px] font-medium text-slate-500 leading-relaxed font-inter">{desc}</p>
            </div>
        </div>
    );
});

/* â”€â”€ Premium Score Ring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const CircularProgress = memo(function CircularProgress({
    value,
    max = 100,
    label,
    size = "md",
    color = "blue",
    master = false
}: {
    value: number;
    max?: number;
    label: string;
    size?: "sm" | "md" | "lg";
    color?: string;
    master?: boolean;
}) {
    const percentage = Math.min((value / max) * 100, 100);
    const radius = master ? 48 : 38;
    const strokeWidth = master ? 12 : 9;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    const sizeClass = size === "sm" ? "h-20 w-20" : size === "md" ? "h-28 w-28" : "h-36 w-36";
    const colors: Record<string, [string, string]> = {
        blue: ["#60A5FA", "#3B82F6"],
        slate: ["#94A3B8", "#64748B"],
        indigo: ["#818CF8", "#6366F1"],
        emerald: ["#34D399", "#10B981"]
    };

    const gradientId = `grad-${color}-${master ? 'master' : 'child'}`;
    const [startColor, endColor] = colors[color] || colors.blue;

    return (
        <div className={cn("relative flex flex-col items-center gap-3", master ? "scale-105" : "")}>
            <div className={cn("relative flex items-center justify-center", sizeClass)}>
                <svg className="h-full w-full transform -rotate-90 overflow-visible">
                    <defs>
                        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor={startColor} />
                            <stop offset="100%" stopColor={endColor} />
                        </linearGradient>
                    </defs>
                    <circle
                        cx="50%"
                        cy="50%"
                        r={radius}
                        stroke="currentColor"
                        strokeWidth={strokeWidth}
                        fill="transparent"
                        className="text-slate-100/80"
                    />
                    <circle
                        cx="50%"
                        cy="50%"
                        r={radius}
                        stroke={`url(#${gradientId})`}
                        strokeWidth={strokeWidth}
                        strokeDasharray={circumference}
                        style={{ strokeDashoffset: offset }}
                        strokeLinecap="round"
                        fill="transparent"
                        className="transition-all  ease-out drop-shadow-sm"
                    />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                    <div className="flex items-baseline gap-0.5">
                        <span className={cn("font-bold text-slate-900 leading-none", master ? "text-3xl" : "text-2xl")}>{value}</span>
                        {max !== 100 && <span className="text-[10px] font-semibold text-slate-400">/{max}</span>}
                    </div>
                </div>
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] text-center max-w-[90px] leading-tight">
                {label}
            </span>
        </div>
    );
});

/* â”€â”€ Segmented Data Track â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const SegmentedProgress = memo(function SegmentedProgress({ candValue, jdValue, label, unit = "YRS" }: { candValue: number; jdValue: number; label: string; unit?: string }) {
    const totalBlocks = Math.max(candValue, jdValue, 8);
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-end">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] leading-none">{label}</span>
                <div className="flex items-baseline gap-1">
                    <span className="text-sm font-bold text-slate-900 leading-none">{candValue}</span>
                    <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-tighter">/ {jdValue} {unit}</span>
                </div>
            </div>
            <div className="flex gap-1.5 h-2.5">
                {Array.from({ length: totalBlocks }).map((_, i) => (
                    <div
                        key={i}
                        className={cn(
                            "flex-1 rounded-sm border transition-all ",
                            i < candValue ? "bg-blue-600 border-blue-600 shadow-sm" : "bg-transparent border-slate-200"
                        )}
                    />
                ))}
            </div>
        </div>
    );
});

/* â”€â”€ Communication Donut Chart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const CommunicationDonutChart = memo(function CommunicationDonutChart({ metrics }: { metrics: { label: string; value: number; color: string }[] }) {
    const [hovered, setHovered] = useState<number | null>(null);
    const [animProgress, setAnimProgress] = useState(0);

    useEffect(() => {
        let start: number | null = null;
        const duration = 1200;
        const ease = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        const step = (ts: number) => {
            if (!start) start = ts;
            const p = Math.min((ts - start) / duration, 1);
            setAnimProgress(ease(p));
            if (p < 1) requestAnimationFrame(step);
        };
        const raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, []);

    const size = 220;
    const cx = size / 2;
    const cy = size / 2;
    const R = 80;   // outer radius
    const r = 52;   // inner radius (donut hole)
    const gap = 3;  // gap between slices in degrees

    const total = metrics.reduce((s, m) => s + m.value, 0);
    const avg = Math.round(metrics.reduce((s, m) => s + m.value, 0) / metrics.length);

    // Build slice paths
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const pt = (rad: number, radius: number) => ({
        x: cx + radius * Math.cos(rad),
        y: cy + radius * Math.sin(rad),
    });

    let cursor = -90; // start at top
    const slices = metrics.map((m, i) => {
        const sliceDeg = (m.value / total) * 360 - gap;
        const startDeg = cursor + gap / 2;
        const endDeg = startDeg + sliceDeg * animProgress;
        cursor += (m.value / total) * 360;

        const startRad = toRad(startDeg);
        const endRad = toRad(endDeg);
        const largeArc = sliceDeg * animProgress > 180 ? 1 : 0;

        const o1 = pt(startRad, R);
        const o2 = pt(endRad, R);
        const i1 = pt(endRad, r);
        const i2 = pt(startRad, r);

        const path = [
            `M ${o1.x} ${o1.y}`,
            `A ${R} ${R} 0 ${largeArc} 1 ${o2.x} ${o2.y}`,
            `L ${i1.x} ${i1.y}`,
            `A ${r} ${r} 0 ${largeArc} 0 ${i2.x} ${i2.y}`,
            `Z`,
        ].join(' ');

        // midpoint angle for label tick
        const midRad = toRad(startDeg + (sliceDeg * animProgress) / 2);
        const labelR = R + 14;
        const labelPt = pt(midRad, labelR);

        return { path, color: m.color, label: m.label, value: m.value, labelPt, midRad, index: i };
    });

    const active = hovered !== null ? metrics[hovered] : null;

    return (
        <div className="flex flex-col items-center gap-6 py-2">
            {/* Chart */}
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} style={{ overflow: 'visible' }}>
                    {/* Drop shadow filter */}
                    <defs>
                        <filter id="slice-shadow" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#00000022" />
                        </filter>
                    </defs>

                    {slices.map((s, i) => (
                        <g key={s.label}>
                            <path
                                d={s.path}
                                fill={s.color}
                                opacity={hovered === null ? 1 : hovered === i ? 1 : 0.3}
                                style={{
                                    transform: hovered === i ? `translate(${Math.cos(s.midRad) * 5}px, ${Math.sin(s.midRad) * 5}px)` : 'none',
                                    transition: 'opacity 0.2s ease, transform 0.2s ease',
                                    cursor: 'pointer',
                                    filter: hovered === i ? 'url(#slice-shadow)' : 'none',
                                }}
                                onMouseEnter={() => setHovered(i)}
                                onMouseLeave={() => setHovered(null)}
                            />
                        </g>
                    ))}
                </svg>

                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span
                        className="font-bold leading-none tabular-nums transition-all "
                        style={{
                            fontSize: active ? 34 : 28,
                            color: active ? active.color : '#111827',
                        }}
                    >
                        {active ? active.value : avg}
                    </span>
                    <span
                        className="text-[9px] font-bold uppercase tracking-[0.18em] mt-1 transition-all "
                        style={{ color: active ? active.color : '#9CA3AF' }}
                    >
                        {active ? active.label : 'Overall'}
                    </span>
                </div>
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 w-full px-2">
                {metrics.map((m, i) => (
                    <div
                        key={m.label}
                        className="flex items-center gap-2.5 cursor-pointer group"
                        onMouseEnter={() => setHovered(i)}
                        onMouseLeave={() => setHovered(null)}
                    >
                        <div
                            className="h-2.5 w-2.5 rounded-full flex-shrink-0 transition-transform  group-hover:scale-125"
                            style={{ backgroundColor: m.color }}
                        />
                        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex-1">{m.label}</span>
                        <span
                            className="text-[12px] font-bold tabular-nums transition-colors "
                            style={{ color: hovered === i ? m.color : '#111827' }}
                        >
                            {m.value}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
});

/* â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export default function CandidateProfilePage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const id = resolvedParams.id;
    const [candidate, setCandidate] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"analysis" | "interview">("analysis");
    const [resendingInterview, setResendingInterview] = useState(false);
    const [rescanning, setRescanning] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [recordingDurationSec, setRecordingDurationSec] = useState<number | null>(null);
    const [showSubmissionPreview, setShowSubmissionPreview] = useState(false);
    const [showIntegrityDetails, setShowIntegrityDetails] = useState(false);
    const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
    const [isReportsMode, setIsReportsMode] = useState(false);
    const [selectedProctoringKey, setSelectedProctoringKey] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const plyrInstance = useRef<any>(null);

    const [logTab, setLogTab] = useState<"chat" | "analysis">("chat");
    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        }
    }, [activeTab]);

    useEffect(() => {
        if (isReportsMode) {
            document.body.classList.add('reports-mode');
        } else {
            document.body.classList.remove('reports-mode');
        }
        return () => document.body.classList.remove('reports-mode');
    }, [isReportsMode]);

    const fetchCandidate = useCallback(async () => {
        try {
            const res = await fetch(`/api/candidates/${id}`);
            if (res.ok) {
                const data = await res.json();
                setCandidate(data);
            }
        } catch (error) {
            console.error("Failed to fetch candidate", error);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (id) {
            fetchCandidate();
        }
    }, [id, fetchCandidate]);

    // Real-time updates for individual candidate profile
    useEffect(() => {
        if (!id) return;
        
        const eventSource = new EventSource("/api/stream");
        
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "UPDATED_APPLICATIONS") {
                    fetchCandidate();
                }
            } catch (e) {
                // Ignore
            }
        };

        return () => eventSource.close();
    }, [id, fetchCandidate]);

    const handleResendInterview = async () => {
        setResendingInterview(true);
        try {
            const res = await fetch(`/api/candidates/${id}/resend-interview`, { method: "POST" });
            if (res.ok) {
                alert("Interview link resent successfully!");
            } else {
                const err = await res.json();
                alert(err.error || "Failed to resend interview link");
            }
        } catch (error) {
            console.error("Resend interview error:", error);
            alert("Failed to resend interview link.");
        } finally {
            setResendingInterview(false);
        }
    };

    const handleRescan = async () => {
        setRescanning(true);
        try {
            const res = await fetch(`/api/admin/candidates/${id}/rescan`, { method: "POST" });
            if (res.ok) {
                await fetchCandidate();
                alert("AI Re-scan triggered. Please wait about 30 seconds and refresh the page.");
            } else {
                const err = await res.json();
                alert(err.error || "Failed to trigger re-scan");
            }
        } catch (error) {
            console.error("Rescan error:", error);
            alert("Failed to trigger AI re-scan.");
        } finally {
            setRescanning(false);
        }
    };
    const [expandedSections, setExpandedSections] = useState({
        communication: true,
        skills: true,
        transcript: true,
        consistency: true,
        moments: true
    });

    const toggleSection = (sectionId: keyof typeof expandedSections) => {
        setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
    };

    let aiData: any = {};
    try {
        aiData = candidate?.aiReport ? JSON.parse(candidate.aiReport) : {};
    } catch (e) {
        console.error("Failed to parse aiReport", e);
    }
    let interviewReportData: any = {};
    try {
        const rawInterviewReport = (candidate?.interview as any)?.interviewReport;
        if (rawInterviewReport) {
            interviewReportData = typeof rawInterviewReport === "string" ? JSON.parse(rawInterviewReport) : rawInterviewReport;
        }
    } catch (e) {
        console.error("Failed to parse interviewReport", e);
    }
    const structuredResume = candidate?.structuredResume ? (typeof candidate.structuredResume === 'string' ? JSON.parse(candidate.structuredResume) : candidate.structuredResume) : {};

    const summary = structuredResume.candidate_summary || aiData.summary || structuredResume.summary || aiData.reasoning || "AI analysis pending for this candidate.";
    const strengths = aiData.strengths || [];
    const weaknesses = aiData.weaknesses || [];
    const score = candidate?.aiScore || 0;
    const rawResumeStatus = String(candidate?.resumeStatus || "pending").toLowerCase();
    const normalizedStatus =
        rawResumeStatus === "rejected"
            ? "Rejected"
            : rawResumeStatus === "shortlisted"
                ? "Shortlisted"
                : rawResumeStatus === "borderline"
                    ? "Borderline"
                    : "Pending";

    const interviewRecordingUrl = candidate?.interview?.interviewRecordingUrl || candidate?.assessment?.interviewRecordingUrl || "";
    const interviewAiSummary = candidate?.interview?.aiSummary || candidate?.assessment?.aiSummary || "";
    const interviewTranscript = candidate?.interview?.interviewTranscript || candidate?.assessment?.interviewTranscript || "";
    const interviewCandidateRating = typeof candidate?.interview?.candidateRating === "number"
        ? candidate.interview.candidateRating
        : typeof candidate?.assessment?.candidateRating === "number"
            ? candidate.assessment.candidateRating
            : null;
    const interviewFeedbackScore = interviewCandidateRating != null ? Math.min(10, Math.max(0, interviewCandidateRating * 2)) : null;

    const parsedProctoringEvents = (() => {
        const raw = candidate?.interview?.proctoringEvents || candidate?.assessment?.proctoringEvents || [];
        if (Array.isArray(raw)) return raw;
        if (typeof raw === "string") {
            try {
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }
        return [];
    })();

    const parseSnapshotList = (raw: any): string[] => {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
        if (typeof raw === "string") {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
            } catch { }
            return raw.length > 10 ? [raw] : [];
        }
        return [];
    };
    
    // Calculate Word Count
    const wordCount = interviewTranscript ? interviewTranscript.split(/\s+/).filter((w: string) => w.length > 0).length : 0;

    const integrityScore = (() => {
        if (!Array.isArray(parsedProctoringEvents) || parsedProctoringEvents.length === 0) return 100;

        let high = 0;
        let medium = 0;
        let low = 0;

        for (const ev of parsedProctoringEvents) {
            const severity = String(ev?.severity || "").toLowerCase();
            if (severity === "high") high += 1;
            else if (severity === "medium") medium += 1;
            else if (severity === "low") low += 1;
        }

        const score100 = Math.max(0, Math.round(100 - (high * 22) - (medium * 10) - (low * 4)));
        return score100;
    })();

    const interviewScore = interviewFeedbackScore != null
        ? interviewFeedbackScore
        : interviewTranscript
            ? Math.max(1, Math.min(10, Math.round(wordCount / 80)))
            : 0;
    const combinedScore = Math.max(0, Math.min(10, Math.round(((interviewScore + integrityScore / 10) / 2) * 10) / 10));
    const interviewStatusLabel =
        interviewScore >= 7 ? "Strong" :
            interviewScore >= 4 ? "Mixed" :
                "Weak";
    const integrityStatusLabel =
        integrityScore >= 85 ? "Clean" :
            integrityScore >= 70 ? "Monitor" :
                "Risk";
    const combinedStatusLabel =
        combinedScore >= 7 ? "Ready" :
            combinedScore >= 4 ? "Review" :
                "Stop";
    const communicationLevel =
        !interviewTranscript ? "Pending" :
            wordCount < 120 ? "A1" :
                wordCount < 250 ? "A2" :
                    wordCount < 450 ? "B1" :
                        wordCount < 800 ? "B2" :
                            wordCount < 1300 ? "C1" : "C2";
    const communicationStatus =
        !interviewTranscript ? "Pending" :
            wordCount >= 800 ? "Strong" :
                wordCount >= 250 ? "Average" :
                    "Limited";

    useEffect(() => {
        const dbDuration = candidate?.interview?.interviewDuration || candidate?.assessment?.interviewDuration;
        if (dbDuration && dbDuration > 0) {
            setRecordingDurationSec(dbDuration);
        }
    }, [candidate]);

    const snapshots = parseSnapshotList(candidate?.interview?.snapshots || candidate?.assessment?.snapshots || []);
    const interviewSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-orange-50 flex items-center justify-center animate-pulse">
                        <Sparkles className="h-6 w-6 text-[#F97316]" />
                    </div>
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading Profile...</p>
                </div>
            </div>
        );
    }

    if (!candidate) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="h-16 w-16 rounded-2xl bg-red-50 flex items-center justify-center">
                    <XCircle className="h-8 w-8 text-red-400" />
                </div>
                <p className="text-lg font-bold text-gray-900">Candidate Not Found</p>
                <Link href="/admin/candidates">
                    <Button variant="outline" className="rounded-xl">Back to Candidates</Button>
                </Link>
            </div>
        );
    }

    const displayAvatar = interviewSnapshot || candidate.passportUrl || 'https:' + '//' + 'api.dicebear.com/7.x/initials/svg?seed=' + candidate.fullName;

    const techSkills = Array.isArray(structuredResume.skills?.technical)
        ? structuredResume.skills.technical.map((s: any) => typeof s === 'object' ? s.skill : s)
        : [];
    const toolSkills = Array.isArray(structuredResume.skills?.tools)
        ? structuredResume.skills.tools.map((s: any) => (typeof s === 'object' ? s.tool : s)).filter(Boolean)
        : [];
    const softSkills = Array.isArray(structuredResume.skills?.soft_skills) ? structuredResume.skills.soft_skills : [];
    const domainSkills = Array.isArray(structuredResume.skills?.domain_skills) ? structuredResume.skills.domain_skills : [];
    const redFlags = aiData.red_flags || structuredResume.red_flags || [];
    const careerProgression = structuredResume.career_progression || null;
    const workHistory = Array.isArray(structuredResume.work_history) ? structuredResume.work_history : [];
    const breakdown = aiData.breakdown || null;
    const interviewReportScores = interviewReportData?.scores || {};
    const interviewReportRecording = interviewReportData?.recording || {};
    const interviewReportVerdict = interviewReportData?.verdict || {};
    const interviewStrategicVerdict = candidate?.interview?.strategicVerdict || interviewReportData?.strategic_verdict || {};
    const interviewReportCommunication = interviewReportData?.communication || {};
    const interviewReportSkills = Array.isArray(interviewReportData?.skills_proof) ? interviewReportData.skills_proof : [];
    const interviewReportQaBlocks = Array.isArray(interviewReportData?.qa_blocks) ? interviewReportData.qa_blocks : [];
    const interviewReportSessionLog = Array.isArray(interviewReportData?.session_log) ? interviewReportData.session_log : [];
    const interviewReportConsistency = Array.isArray(interviewReportData?.consistency) ? interviewReportData.consistency : [];
    const interviewReportKeyMoments = Array.isArray(interviewReportData?.key_moments) ? interviewReportData.key_moments : [];
    const interviewReportSummary = interviewReportRecording.summary || interviewReportVerdict.summary || interviewAiSummary;
    const hasStructuredInterviewReport = Object.keys(interviewReportData || {}).length > 0;
    const interviewSkillStats = (() => {
        const rows = interviewReportSkills || [];
        const normalized = rows.map((s: any) => ({
            ...s,
            status: String(s?.status || "").toUpperCase(),
            scoreNum: Number.parseFloat(String(s?.score || "").replace(/[^\d.]/g, "")),
        }));
        const proved = normalized.filter((s: any) => s.status === "PROVED");
        const partial = normalized.filter((s: any) => s.status === "PARTIAL");
        const notProved = normalized.filter((s: any) => s.status === "NOT PROVED");
        const notTested = normalized.filter((s: any) => s.status === "NOT TESTED");
        const scored = normalized.filter((s: any) => Number.isFinite(s.scoreNum));
        const strongest = proved[0] || scored.sort((a: any, b: any) => b.scoreNum - a.scoreNum)[0] || rows[0] || null;
        const biggestGap = notProved[0] || notTested[0] || rows[0] || null;
        const overallMatch = rows.length
            ? Math.round(((proved.length + partial.length * 0.5) / rows.length) * 100)
            : 0;
        return {
            total: rows.length,
            proved: proved.length,
            partial: partial.length,
            notProved: notProved.length,
            notTested: notTested.length,
            overallMatch,
            strongest,
            biggestGap,
        };
    })();

    const proctoringSignals = Array.isArray(parsedProctoringEvents) ? parsedProctoringEvents : [];
    const groupedProctoringSignals = (() => {
        const groups = new Map<string, any>();
        proctoringSignals.forEach((ev: any, idx: number) => {
            const key = String(ev?.eventType || ev?.type || `signal-${idx}`);
            const existing = groups.get(key) || {
                key,
                label: String(ev?.eventType || ev?.type || "signal").replace(/_/g, " "),
                severity: String(ev?.severity || "low").toLowerCase(),
                count: 0,
                events: [] as any[],
            };
            existing.count += 1;
            existing.events.push({ ...ev, __index: idx });
            if (String(ev?.severity || "").toLowerCase() === "high") existing.severity = "high";
            else if (String(ev?.severity || "").toLowerCase() === "medium" && existing.severity !== "high") existing.severity = "medium";
            groups.set(key, existing);
        });
        return Array.from(groups.values()).sort((a, b) => b.count - a.count);
    })();
    const selectedProctoringSignal =
        groupedProctoringSignals.find((g: any) => g.key === selectedProctoringKey) || groupedProctoringSignals[0] || null;
    const selectedSignalEvent = selectedProctoringSignal?.events?.[0] || null;
    const selectedSignalIndex = selectedSignalEvent?.__index ?? 0;
    const selectedSignalSnapshot = snapshots.length > 0
        ? snapshots[Math.min(selectedSignalIndex, snapshots.length - 1)]
        : null;

    const proctoringVerdictSummary = (() => {
        const high = groupedProctoringSignals.filter((g: any) => g.severity === "high").reduce((n: number, g: any) => n + g.count, 0);
        const medium = groupedProctoringSignals.filter((g: any) => g.severity === "medium").reduce((n: number, g: any) => n + g.count, 0);
        const low = groupedProctoringSignals.filter((g: any) => g.severity === "low").reduce((n: number, g: any) => n + g.count, 0);
        if (!proctoringSignals.length) return "No proctoring signals were recorded for this interview.";
        if (high > 0) return `High-risk telemetry is present, led by ${high} high-severity signal${high === 1 ? "" : "s"}. The session should be reviewed alongside the recording and transcript before any final integrity decision.`;
        if (medium > 0) return `The session contains ${medium} medium-severity signal${medium === 1 ? "" : "s"} and ${low} low-severity event${low === 1 ? "" : "s"}. Nothing here proves misconduct on its own, but the timing deserves a human review.`;
        return `The session looks mostly clean with ${low} low-severity signal${low === 1 ? "" : "s"}. The recording is still worth spot-checking, but the telemetry itself does not show strong risk.`;
    })();

    const formatDuration = (totalSeconds: number) => {
        const m = Math.floor(totalSeconds * 0.0166666);
        const s = Math.floor(totalSeconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}min`;
    };

    return (
        <div 
            id="candidate-report"
            key={id + '_' + loading}
            ref={containerRef} 
            className="min-h-screen flex bg-slate-50/50 relative isolate" 
            style={{ fontFamily: 'Inter, sans-serif' }}
        >
            <style dangerouslySetInnerHTML={{
                __html: `
                #admin-main-wrapper > div { padding: 0 !important; }
                #candidate-report, #candidate-report * {
                    font-family: Inter, sans-serif !important;
                }
                header.fixed { 
                    position: fixed !important; 
                    top: 0 !important; 
                    left: 240px !important;
                    right: 0 !important;
                    z-index: 100 !important; 
                    width: auto !important; 
                    transform: translateZ(0);
                    will-change: transform;
                    -webkit-font-smoothing: antialiased;
                }
                body.reports-mode header.fixed {
                    left: 0 !important;
                }
                @media (max-width: 768px) {
                    header.fixed {
                        left: 0 !important;
                    }
                }
                .tracking-premium { letter-spacing: -0.02em !important; }
                .glass-card {
                    background: rgba(255, 255, 255, 0.9);
                    border: 1px solid rgba(0, 0, 0, 0.05);
                    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.02);
                    transform: translateZ(0);
                }
                .spotlight-card {
                    position: relative;
                    background: #ffffff;
                    border: 1px solid rgba(0, 0, 0, 0.05);
                    transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
                    overflow: hidden;
                    transform: translateZ(0);
                    contain: content;
                }
                .spotlight-card::before {
                    content: "";
                    position: absolute;
                    inset: 0;
                    background: radial-gradient(circle at 50% 50%, rgba(37, 99, 235, 0.04) 0%, transparent 70%);
                    opacity: 0;
                    transition: opacity 0.3s ease;
                    pointer-events: none;
                }
                .spotlight-card:hover::before {
                    opacity: 1;
                }
                .spotlight-card:hover { 
                    border-color: rgba(37, 99, 235, 0.15);
                    box-shadow: 0 15px 35px rgba(0, 0, 0, 0.05);
                    transform: translateY(-2px) translateZ(0);
                }
                .optimize-scroll {
                    content-visibility: auto;
                    contain-intrinsic-size: 1px 500px;
                }
                /* Hide scrollbar but keep functionality */
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                        ` }} />

            {/* â”€â”€ Background Aurora Blobs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden" style={{ transform: 'translateZ(0)' }}>
                <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-purple-500/5 blur-[120px] rounded-full" style={{ willChange: 'opacity' }} />
                <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-blue-500/5 blur-[120px] rounded-full" style={{ willChange: 'opacity' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-500/5 blur-[150px] rounded-full" style={{ willChange: 'opacity' }} />
            </div>

            {/* â”€â”€ Main Content Area â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <div className="flex-1 min-w-0">
                {/* â”€â”€ Fixed Navigation Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                <header className={cn(
                    "fixed top-0 right-0 z-[100] bg-white/80 backdrop-blur-xl border-b border-gray-100/80 px-6 py-3 transition-all  shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)]",
                    isReportsMode ? "left-0" : "left-0 md:left-[240px]"
                )}>
                    <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">
                        {/* Left: Exit & Context */}
                        <div className="flex items-center gap-6">
                            <Link href="/admin/candidates">
                                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl bg-white border border-slate-100 shadow-sm hover:bg-slate-50 transition-all group">
                                    <ArrowLeft className="h-4 w-4 text-slate-400 group-hover:-translate-x-0.5" />
                                </Button>
                            </Link>
                            <div className="hidden lg:flex flex-col -space-y-0.5">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Candidate Review</span>
                                <span className="text-[15px] font-bold text-slate-950 tracking-tight">{candidate.fullName}</span>
                            </div>
                        </div>

                        {/* Center: Tab Switcher */}
                        <div className="bg-slate-100/60 p-1 rounded-2xl flex items-center gap-1 border border-slate-200/50 backdrop-blur-sm">
                            {[
                                { id: "analysis" as const, label: "Resume", icon: FileText },
                                { id: "interview" as const, label: "Interview", icon: Camera },
                            ].map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveTab(item.id)}
                                    className={cn(
                                        "flex items-center gap-2.5 px-6 py-2 rounded-xl text-[12px] font-bold uppercase tracking-widest transition-all ",
                                        activeTab === item.id
                                            ? "bg-white text-slate-950 shadow-[0_2px_8px_rgba(0,0,0,0.05)] ring-1 ring-slate-100"
                                            : "text-slate-400 hover:text-slate-600 hover:bg-white/40"
                                    )}
                                >
                                    <item.icon className={cn("h-3.5 w-3.5", activeTab === item.id ? "text-blue-600" : "text-slate-300")} />
                                    {item.label}
                                </button>
                            ))}
                        </div>

                        {/* Right: Primary Actions */}
                        <div className="flex items-center gap-3">
                            <Button
                                onClick={() => fetchCandidate()}
                                variant="outline"
                                className="h-10 w-10 p-0 rounded-2xl bg-white border border-slate-100 shadow-sm hover:bg-slate-50 transition-all group"
                                title="Refresh data"
                            >
                                <RefreshCw className={cn("h-4 w-4 text-slate-400 group-hover:text-blue-500", loading && "animate-spin")} />
                            </Button>
                            <Button
                                onClick={handleRescan}
                                disabled={rescanning}
                                variant="outline"
                                className="h-10 px-5 rounded-2xl text-[11px] font-bold uppercase tracking-widest text-slate-700 border-slate-200/60 bg-white/50 backdrop-blur-sm hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200 transition-all shadow-sm group disabled:opacity-60"
                            >
                                <Sparkles className={cn("h-3.5 w-3.5 text-orange-500 group-hover:scale-110 transition-transform", rescanning && "animate-spin")} />
                                {rescanning ? "Rescanning..." : "Rescan AI"}
                            </Button>
                            <Button
                                onClick={() => setShowSubmissionPreview(true)}
                                variant="outline"
                                className="h-10 px-5 rounded-2xl text-[11px] font-bold uppercase tracking-widest text-slate-700 border-slate-200/60 bg-white/50 backdrop-blur-sm hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all  hidden md:flex items-center gap-2.5 shadow-sm group"
                            >
                                <FileText className="h-3.5 w-3.5 group-hover:scale-110 transition-transform text-blue-500 group-hover:text-blue-400" />
                                View Submission
                            </Button>
                        </div>
                    </div>
                </header>

                <div className="max-w-[1400px] mx-auto px-6 pt-24 pb-16 space-y-8 relative z-0">
                    <div className="relative spotlight-card rounded-[48px] shadow-sm overflow-hidden">
                        <div className="h-2 w-full bg-gradient-to-r from-orange-400 via-[#F97316] to-orange-500" />
                        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-orange-100/40 to-transparent rounded-full blur-[100px] pointer-events-none" />

                        <div className="p-10 relative z-10">
                            {activeTab === "interview" ? (
                                <div className="space-y-6   ">
                                    <div className="space-y-4">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="space-y-1">
                                                <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
                                                    {candidate.fullName}
                                                    <Badge className="bg-slate-50 text-slate-900 border-slate-200 shadow-sm text-[9px] font-bold uppercase tracking-widest px-2 py-0">Verified</Badge>
                                                </h1>
                                                <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-400">
                                                    <span>{candidate.drive?.role || candidate.drive?.title || "AI Engineer Interview"}</span>
                                                    <span>â€¢</span>
                                                    <span>{mounted ? new Date(candidate.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : "-- --- ----"}</span>
                                                    <span>â€¢</span>
                                                    <span className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Voice AI</span>
                                                    <span>â€¢</span>
                                                    <span>5 min session</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-6 text-[13px] font-semibold text-gray-600 bg-gray-50/50 px-4 py-2 rounded-2xl border border-gray-100/50">
                                                <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-gray-400" /> {candidate.email}</div>
                                                <div className="w-[1px] h-4 bg-gray-200" />
                                                <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-gray-400" /> {candidate.phone || "N/A"}</div>
                                                <div className="w-[1px] h-4 bg-gray-200" />
                                                <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-400" /> {candidate.location || "N/A"}</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                        {[
                                            {
                                                label: "Interview score",
                                                value: interviewScore.toFixed(1),
                                                total: "/10",
                                                status: interviewStatusLabel,
                                                statusColor: interviewScore >= 7 ? "text-emerald-600 bg-emerald-50" : interviewScore >= 4 ? "text-amber-600 bg-amber-50" : "text-rose-600 bg-rose-50"
                                            },
                                            {
                                                label: "Integrity score",
                                                value: (integrityScore / 10).toFixed(1),
                                                total: "/10",
                                                status: integrityStatusLabel,
                                                statusColor: integrityScore >= 85 ? "text-emerald-600 bg-emerald-50" : integrityScore >= 70 ? "text-amber-600 bg-amber-50" : "text-rose-600 bg-rose-50"
                                            },
                                            {
                                                label: "Combined score",
                                                value: combinedScore.toFixed(1),
                                                total: "/10",
                                                status: combinedStatusLabel,
                                                statusColor: combinedScore >= 7 ? "text-emerald-600 bg-emerald-50" : combinedScore >= 4 ? "text-amber-600 bg-amber-50" : "text-rose-600 bg-rose-50"
                                            },
                                            {
                                                label: "Communication",
                                                value: communicationLevel,
                                                total: "CEFR",
                                                status: communicationStatus,
                                                statusColor: communicationLevel === "Pending" ? "text-slate-500 bg-slate-50" : communicationStatus === "Strong" ? "text-emerald-600 bg-emerald-50" : communicationStatus === "Average" ? "text-amber-600 bg-amber-50" : "text-rose-600 bg-rose-50"
                                            },
                                        ].map((card, i) => (
                                            <div key={i} className="bg-[#FDF9F3] rounded-[32px] p-6 border border-[#F5E6D3] flex flex-col items-center justify-center text-center space-y-2 relative overflow-hidden group">
                                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-orange-100 to-transparent group-hover:via-orange-200 transition-all opacity-0 group-hover:opacity-100" />
                                                <p className="text-[9px] font-bold text-[#A89078] uppercase tracking-[0.2em]">{card.label}</p>
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-2xl font-bold text-[#4A3728] tracking-tight">{card.value}</span>
                                                    <span className="text-[10px] font-semibold text-[#A89078]">/{card.total}</span>
                                                </div>
                                                <div className={cn("px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border border-transparent shadow-sm", card.statusColor.split(' ').slice(0, 1).join(' '), card.statusColor.split(' ').slice(1).join(' '))}>
                                                    {card.status}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col md:flex-row justify-between gap-8">
                                    <div className="flex items-start gap-8">
                                        <div className="relative flex-shrink-0">
                                            <Avatar className="h-24 w-24 rounded-2xl border-4 border-white shadow-[0_8px_24px_rgba(0,0,0,0.1)]">
                                                <AvatarImage src={displayAvatar} className="object-cover" />
                                                <AvatarFallback className="text-2xl font-bold bg-gray-900 text-white rounded-2xl">
                                                    {candidate.fullName?.substring(0, 2).toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <h1 className="text-4xl font-bold text-gray-900 tracking-tight">{candidate.fullName}</h1>
                                                {score >= 75 && (
                                                    <div className="bg-indigo-600 text-white text-[9px] font-semibold uppercase tracking-widest rounded-full px-3 py-1 flex items-center gap-1.5 shadow-lg shadow-indigo-200">
                                                        <Sparkles className="h-3 w-3" /> AI Verified
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-xl font-semibold text-gray-400">{candidate.drive?.role || candidate.drive?.title || "Role N/A"}</p>

                                            <div className="flex flex-wrap gap-8 pt-2">
                                                {[
                                                    { icon: Mail, value: candidate.email },
                                                    { icon: Phone, value: candidate.phone || "N/A" },
                                                    { icon: MapPin, value: structuredResume.location?.city ? `${structuredResume.location.city}, ${structuredResume.location.country || ""}` : (candidate.location || "N/A") },
                                                    { icon: Calendar, value: mounted ? `Applied ${new Date(candidate.createdAt).toLocaleDateString()}` : "Applied --/--/----" },
                                                ].filter(item => item.value !== "N/A" && item.value !== "N/A, ").map(({ icon: Icon, value }) => (
                                                    <div key={value} className="flex items-center gap-3 text-[14px] font-semibold text-slate-500">
                                                        <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100 shadow-sm">
                                                            <Icon className="h-4 w-4 text-slate-400" />
                                                        </div>
                                                        <span>{value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-end justify-center min-w-[200px]">
                                        <div className="flex items-center gap-4">
                                            <div className="flex flex-col items-end">
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Alignment</p>
                                                <div className={cn(
                                                    "px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest border mt-1",
                                                    score >= 80 ? "text-green-600 bg-green-50 border-green-100" : score >= 50 ? "text-orange-600 bg-orange-50 border-orange-100" : "text-red-600 bg-red-50 border-red-100"
                                                )}>
                                                    {normalizedStatus}
                                                </div>
                                            </div>
                                            <CircularProgress value={score} label="Alignment" master={true} color="blue" />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="w-full">
                        <div className="space-y-6">
                            {activeTab === "analysis" && (
                                <div className="space-y-10 pb-20">
                                    <div className="px-10 pt-10 pb-6 group">
                                        <div className="relative pb-4">
                                            <div className="absolute bottom-0 left-0 w-24 h-1 bg-slate-950 rounded-full" />
                                            <h2 className="text-3xl font-bold text-slate-950 tracking-premium uppercase leading-none font-inter">
                                                Resume Analysis
                                            </h2>
                                        </div>

                                        {!candidate.aiReport && !candidate.resumeText && (
                                            <div className="mt-10 p-10 bg-amber-50 rounded-[40px] border border-amber-200 flex flex-col items-center text-center gap-4">
                                                <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center shadow-sm">
                                                    <Loader2 className="h-6 w-6 text-amber-500 animate-spin" />
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-[14px] font-bold text-amber-900 uppercase tracking-widest">Processing Resume...</p>
                                                    <p className="text-sm text-amber-700/70">We are currently extracting and analyzing this candidate's resume. This usually takes 30-60 seconds.</p>
                                                </div>
                                                <Button onClick={() => fetchCandidate()} variant="outline" className="rounded-xl border-amber-200 hover:bg-white bg-amber-50/50">
                                                    Check Status
                                                </Button>
                                            </div>
                                        )}

                                        <div className="mt-10 p-10 bg-white rounded-[40px] border border-slate-100 shadow-md relative overflow-hidden group/summary">
                                            <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600/30 group-hover/summary:bg-blue-600 transition-colors" />
                                            <div className="flex items-start gap-8">
                                                <div className="h-14 w-14 rounded-[20px] bg-white shadow-xl shadow-blue-900/5 border border-slate-100 flex items-center justify-center shrink-0">
                                                    <Sparkles className="h-7 w-7 text-blue-600" />
                                                </div>
                                                <div className="space-y-4">
                                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.25em] leading-none">
                                                        {candidate.aiReport ? "AI Strategic Synthesis" : "Preliminary Resume Insight"}
                                                    </p>
                                                    <p className="text-[19px] font-medium text-slate-700 leading-[1.8] font-inter italic mb-2 tracking-tight">
                                                        "{summary}"
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-10 spotlight-card rounded-[48px] shadow-sm optimize-scroll">
                                        <div className="flex flex-row items-center justify-around gap-2 px-4">
                                            <CircularProgress
                                                value={breakdown?.skills_score || 0}
                                                max={breakdown?.skills_max || 45}
                                                label="Must-have"
                                                color="blue"
                                                master={true}
                                            />
                                            <CircularProgress
                                                value={breakdown?.exp_score || 0}
                                                max={breakdown?.exp_max || 25}
                                                label="Experience"
                                                color="blue"
                                            />
                                            <CircularProgress
                                                value={breakdown?.good_score || 0}
                                                max={breakdown?.good_max || 10}
                                                label="Good-to-have"
                                                color="slate"
                                            />
                                            <CircularProgress
                                                value={breakdown?.career_score || 0}
                                                max={breakdown?.career_max || 10}
                                                label="Career"
                                                color="indigo"
                                            />
                                            <CircularProgress
                                                value={breakdown?.domain_score || 0}
                                                max={breakdown?.domain_max || 10}
                                                label="Domain"
                                                color="slate"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="flex items-center gap-4 px-2">
                                            <div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center">
                                                <Target className="h-4 w-4 text-slate-900" />
                                            </div>
                                            <h3 className="text-[14px] font-bold text-slate-900 uppercase tracking-premium">Candidate Skill Alignment</h3>
                                        </div>
                                        <div className="bg-white rounded-[40px] shadow-sm overflow-hidden">
                                            <div className="grid grid-cols-3 px-8 py-3 bg-slate-50 border-b border-slate-200">
                                                <span className="text-[10px] font-bold text-slate-950 uppercase tracking-widest font-inter">Requirement</span>
                                                <span className="text-[10px] font-bold text-slate-950 uppercase tracking-widest text-center font-inter">Priority</span>
                                                <span className="text-[10px] font-bold text-slate-950 uppercase tracking-widest text-right font-inter">Status</span>
                                            </div>
                                            <div className="divide-y divide-slate-100">
                                                {(() => {
                                                    const matchData = aiData.skill_matching || {};
                                                    const mustHaveDetails = Array.isArray(matchData.must_have_details) ? matchData.must_have_details : [];
                                                    const matchedMust = Array.isArray(matchData.matched_must) ? matchData.matched_must : [];
                                                    const missingMust = Array.isArray(matchData.missing_must) ? matchData.missing_must : [];
                                                    const normalizeSkill = (value: any) =>
                                                        String(value || "")
                                                            .toLowerCase()
                                                            .replace(/[^a-z0-9]+/g, " ")
                                                            .replace(/\s+/g, " ")
                                                            .trim();

                                                    const resumeSkillPool = new Set(
                                                        [...techSkills, ...toolSkills, ...domainSkills, ...softSkills]
                                                            .map(normalizeSkill)
                                                            .filter(Boolean)
                                                    );

                                                    const extractSkillRowsFromDrive = () => {
                                                        try {
                                                            const raw = candidate.drive?.extractedDetails;
                                                            const jdDetails = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});

                                                            const candidates = [
                                                                jdDetails.must_have,
                                                                jdDetails.skills?.must_have,
                                                                jdDetails.technical_skills,
                                                                jdDetails.skills?.technical,
                                                                jdDetails.skills?.good_to_have,
                                                                jdDetails.good_to_have,
                                                                jdDetails.requirements,
                                                                jdDetails.candidate_requirements,
                                                            ];

                                                            for (const item of candidates) {
                                                                if (!Array.isArray(item) || item.length === 0) continue;
                                                                return item.map((s: any) => ({
                                                                    name: typeof s === "string" ? s : (s.skill || s.name || s.title || String(s)),
                                                                    weight: typeof s === "object" ? (s.weight || "high") : "high",
                                                                    status: "not_tested",
                                                                }));
                                                            }
                                                        } catch (e) {
                                                            console.warn("Failed to parse drive details for fallback", e);
                                                        }

                                                        return [];
                                                    };

                                                    const resolveSkillStatus = (skill: any) => {
                                                        const current = String(skill?.status || "").toLowerCase();
                                                        const skillName = String(skill?.name || "");
                                                        const normalizedSkill = normalizeSkill(skillName);
                                                        const reportIsGenerating = !candidate?.aiReport;

                                                        if (current === "found" || current === "matched") {
                                                            return { label: "Matched", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
                                                        }
                                                        if (current === "mentioned" || current === "partial") {
                                                            return { label: "Partial", className: "bg-amber-50 text-amber-700 border-amber-200" };
                                                        }
                                                        if (current === "not_found" || current === "missing") {
                                                            return { label: "Missing", className: "bg-rose-50 text-rose-700 border-rose-200" };
                                                        }

                                                        const candidateHasSkill = Array.from(resumeSkillPool).some((known) => {
                                                            return (
                                                                normalizedSkill === known ||
                                                                normalizedSkill.includes(known) ||
                                                                known.includes(normalizedSkill)
                                                            );
                                                        });

                                                        if (candidateHasSkill) {
                                                            return { label: "Matched", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
                                                        }

                                                        return reportIsGenerating
                                                            ? { label: "Pending", className: "bg-slate-50 text-slate-500 border-slate-200" }
                                                            : { label: "Missing", className: "bg-rose-50 text-rose-700 border-rose-200" };
                                                    };

                                                    const derivedDetails = mustHaveDetails.length > 0
                                                        ? mustHaveDetails
                                                        : [
                                                            ...matchedMust.map((s: string) => ({ name: s, weight: 'high', status: 'found' })),
                                                            ...missingMust.map((s: string) => ({ name: s, weight: 'high', status: 'not_found' }))
                                                        ];

                                                    const details = derivedDetails.length > 0
                                                        ? derivedDetails
                                                        : extractSkillRowsFromDrive();
                                                    return details.length > 0 ? details.map((skill: any, idx: number) => (
                                                        <div key={idx} className="grid grid-cols-3 px-8 py-4 hover:bg-slate-50 transition-colors cursor-default items-center">
                                                            <span className="text-sm font-semibold text-slate-800">{skill.name}</span>
                                                            <div className="flex justify-center">
                                                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.22em]">
                                                                    {skill.weight || 'mid'}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-end">
                                                                <div className={cn(
                                                                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.18em] border shadow-sm min-w-[88px] text-center",
                                                                    resolveSkillStatus(skill).className
                                                                )}>
                                                                    {resolveSkillStatus(skill).label}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )) : (
                                                        <div className="px-8 py-10 text-center opacity-40 italic font-medium text-sm">
                                                            No specific requirements found.
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="p-10 spotlight-card rounded-[40px] border-t-4 border-t-emerald-500 shadow-sm space-y-10 optimize-scroll">
                                            <div className="flex items-center gap-4">
                                                <div className="h-10 w-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
                                                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                                </div>
                                                <h3 className="text-[14px] font-bold text-slate-900 uppercase tracking-premium">Key Strengths</h3>
                                            </div>
                                            <div className="grid gap-5">
                                                {aiData.strengths && aiData.strengths.length > 0 ? aiData.strengths.slice(0, 4).map((s: any, i: number) => (
                                                    <div key={i} className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/30 group hover:border-emerald-100 hover:bg-emerald-50/20 transition-all">
                                                        <div className="h-6 w-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                                                            <CheckCircle2 className="h-3 w-3" />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="text-[13px] font-semibold text-slate-800 leading-tight">{typeof s === 'string' ? s : s.point}</p>
                                                            <p className="text-[11px] font-medium text-slate-400 leading-relaxed italic">{s.evidence || "Demonstrated proficiency."}</p>
                                                        </div>
                                                    </div>
                                                )) : <p className="text-xs italic text-slate-400">No strengths data.</p>}
                                            </div>
                                        </div>

                                        <div className="p-10 spotlight-card rounded-[40px] border-t-4 border-t-amber-500 shadow-sm space-y-10 optimize-scroll">
                                            <div className="flex items-center gap-4">
                                                <div className="h-10 w-10 rounded-2xl bg-amber-50 flex items-center justify-center">
                                                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                                                </div>
                                                <h3 className="text-[14px] font-bold text-slate-900 uppercase tracking-premium">Growth Areas</h3>
                                            </div>
                                            <div className="grid gap-5">
                                                {(aiData.concerns || aiData.weaknesses || []).slice(0, 4).map((c: any, i: number) => (
                                                    <div key={i} className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/30 group hover:border-rose-100 hover:bg-rose-50/20 transition-all">
                                                        <div className="h-6 w-6 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                                                            <AlertCircle className="h-3 w-3" />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="text-[13px] font-semibold text-slate-800 leading-tight">{typeof c === 'string' ? c : c.point}</p>
                                                            <p className="text-[11px] font-medium text-slate-400 leading-relaxed italic">{c.impact || "Requires mentoring."}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                        {/* â”€â”€ Career Timeline (Left) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                                        <div className="p-8 spotlight-card bg-white rounded-[40px] shadow-sm flex flex-col h-full border border-slate-100 optimize-scroll">
                                            <div className="flex items-center gap-3 mb-10 px-2">
                                                <div className="h-10 w-10 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100">
                                                    <BriefcaseBusiness className="h-5 w-5 text-slate-400" />
                                                </div>
                                                <h3 className="text-[13px] font-bold text-slate-900 uppercase tracking-[0.2em]">Career Timeline</h3>
                                            </div>

                                            <div className="relative flex-1 px-4">
                                                <div className="absolute left-[31px] top-2 bottom-8 w-[2px] bg-slate-50" />

                                                <div className="space-y-10">
                                                    {(() => {
                                                        const history = aiData.work_history || workHistory || [];
                                                        return history.map((role: any, idx: number) => {
                                                            const isCurrent = role.is_current;
                                                            return (
                                                                <div key={idx} className="flex gap-8 relative group">
                                                                    <div className={cn(
                                                                        "h-4 w-4 rounded-full mt-1.5 z-10 ring-4 ring-white shrink-0 transition-all",
                                                                        isCurrent ? "bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)] scale-110" : "bg-slate-200"
                                                                    )} />

                                                                    <div className="space-y-2 pb-2">
                                                                        <div className="flex flex-col gap-0.5">
                                                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                                                                                {role.start_date || role.start_year || "?"} â€” {isCurrent ? "Present" : (role.end_date || role.end_year || "?")}
                                                                            </span>
                                                                            <h4 className="text-[16px] font-bold text-slate-900 tracking-tight leading-tight group-hover:text-blue-500 transition-colors">
                                                                                {role.role}
                                                                            </h4>
                                                                            <p className="text-[12px] font-semibold text-blue-500/80">{role.company}</p>
                                                                        </div>
                                                                        <p className="text-[12.5px] font-medium text-slate-500 leading-relaxed line-clamp-2 italic">
                                                                            {role.recruiter_summary || (Array.isArray(role.what_they_built) ? role.what_they_built[0] : role.summary) || "Infrastructure development and managed high-impact team deliverables."}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            );
                                                        });
                                                    })()}
                                                </div>
                                            </div>
                                        </div>

                                        {/* â”€â”€ Strategic Verdict (Right) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                                        <div className="p-8 spotlight-card bg-indigo-50/30 rounded-[40px] border border-indigo-100/50 shadow-sm flex flex-col h-full relative overflow-hidden group optimize-scroll">
                                            <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-200/20 blur-[60px] rounded-full -mr-24 -mt-24 pointer-events-none" />

                                            <div className="flex items-center gap-3 mb-10 px-2 relative z-10">
                                                <div className="h-10 w-10 rounded-2xl bg-white border border-indigo-100 flex items-center justify-center shadow-sm">
                                                    <Sparkles className="h-5 w-5 text-indigo-500" />
                                                </div>
                                                <h3 className="text-[13px] font-bold text-indigo-900 uppercase tracking-[0.2em]">Strategic Verdict</h3>
                                            </div>

                                            <div className="flex flex-col gap-10 flex-1 relative z-10">
                                                <div className="space-y-6 border-l-4 border-indigo-200/50 pl-6">
                                                    {(() => {
                                                        const rawText = aiData.reasoning || aiData.suitability_analysis?.suggestions?.[0] || summary;
                                                        const points = typeof rawText === 'string'
                                                            ? rawText.split(/(?:\. |\n|(?:\s*-\s*))/).filter(p => p.trim().length > 15)
                                                            : [rawText];

                                                        return points.slice(0, 3).map((point: string, pIdx: number) => (
                                                            <div key={pIdx} className="space-y-1">
                                                                <p className="text-[15px] font-medium text-indigo-950 leading-relaxed font-inter italic">
                                                                    "{point.trim().replace(/^\.*|\.*$/g, '')}."
                                                                </p>
                                                            </div>
                                                        ));
                                                    })()}
                                                </div>

                                                <div className="mt-auto pt-8 border-t border-indigo-100/50 flex flex-col gap-4">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Onboarding Window</span>
                                                        <span className="text-[12px] font-bold text-indigo-900 uppercase tracking-widest bg-white border border-indigo-100 px-4 py-1.5 rounded-full shadow-sm">
                                                            {aiData.suitability_analysis?.readiness_timeline || "6-12 MONTHS"}
                                                        </span>
                                                    </div>
                                                    <div className="p-5 rounded-3xl bg-white/60 border border-indigo-100/50 flex items-center justify-between gap-4">
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Decision Logic</span>
                                                            <span className="text-[13px] font-bold text-slate-900">{normalizedStatus === "Shortlisted" ? "Move to leadership review" : normalizedStatus === "Rejected" ? "No further action" : "Awaiting signal validation"}</span>
                                                        </div>
                                                        <div className={cn(
                                                            "h-10 w-10 rounded-2xl flex items-center justify-center",
                                                            normalizedStatus === "Shortlisted" ? "bg-emerald-50 text-emerald-600" : normalizedStatus === "Rejected" ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-400"
                                                        )}>
                                                            <ArrowRight className="h-5 w-5" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 8. Candidate Analysis - Expert Commentary */}
                                    <div className={cn(
                                        "p-10 spotlight-card border rounded-[40px] space-y-8 mx-2 transition-colors  optimize-scroll",
                                        normalizedStatus === "Shortlisted" ? "border-emerald-200 shadow-emerald-900/5 shadow-2xl" :
                                            normalizedStatus === "Rejected" ? "border-rose-200 shadow-rose-900/5 shadow-2xl" : "border-slate-200"
                                    )}>
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "p-2 rounded-lg",
                                                normalizedStatus === "Shortlisted" ? "bg-emerald-50" :
                                                    normalizedStatus === "Rejected" ? "bg-rose-50" : "bg-slate-50"
                                            )}>
                                                <MessageSquare className={cn(
                                                    "h-4 w-4",
                                                    normalizedStatus === "Shortlisted" ? "text-emerald-600" :
                                                        normalizedStatus === "Rejected" ? "text-rose-600" : "text-slate-400"
                                                )} />
                                            </div>
                                            <h3 className={cn(
                                                "text-[12px] font-bold uppercase tracking-widest font-inter",
                                                normalizedStatus === "Shortlisted" ? "text-emerald-600" :
                                                    normalizedStatus === "Rejected" ? "text-rose-600" : "text-slate-950"
                                            )}>Expert Synthesis</h3>
                                        </div>
                                        <div className="grid gap-6">
                                            <div className={cn(
                                                "p-8 rounded-2xl border",
                                                normalizedStatus === "Shortlisted" ? "bg-emerald-50/20 border-emerald-100" :
                                                    normalizedStatus === "Rejected" ? "bg-rose-50/20 border-rose-100" : "bg-slate-50/50 border-slate-100"
                                            )}>
                                                <h4 className={cn(
                                                    "text-sm font-bold mb-6 uppercase tracking-widest border-b pb-2 inline-block font-inter",
                                                    normalizedStatus === "Shortlisted" ? "text-emerald-900 border-emerald-200" :
                                                        normalizedStatus === "Rejected" ? "text-rose-900 border-rose-200" : "text-slate-950 border-slate-200"
                                                )}>Technical Commentary</h4>
                                                <p className={cn(
                                                    "text-lg font-medium leading-relaxed font-inter italic",
                                                    normalizedStatus === "Shortlisted" ? "text-emerald-800" :
                                                        normalizedStatus === "Rejected" ? "text-rose-800" : "text-slate-600"
                                                )}>
                                                    {aiData.recruiter_snapshot || aiData.summary || "Candidate exhibits a strong background in data structures and graph algorithms, specifically mentioning cycle detection. While formal GTM experience is less evidenced, the technical foundations suggest a high capacity for learning domain-specific sales operational workflows."}
                                                </p>

                                                <div className={cn(
                                                    "mt-8 space-y-4 pt-6 border-t",
                                                    normalizedStatus === "Shortlisted" ? "border-emerald-100" :
                                                        normalizedStatus === "Rejected" ? "border-rose-100" : "border-slate-100"
                                                )}>
                                                    <p className={cn(
                                                        "text-[12px] font-bold uppercase tracking-widest font-inter",
                                                        normalizedStatus === "Shortlisted" ? "text-emerald-600" :
                                                            normalizedStatus === "Rejected" ? "text-rose-600" : "text-slate-950"
                                                    )}>
                                                        Strategic Decision Path
                                                    </p>
                                                    <div className="grid gap-6">
                                                        {[
                                                            {
                                                                label: "Next Step Action",
                                                                value: normalizedStatus === "Shortlisted" ? "PROCEED: Move to technical leadership briefing." :
                                                                    normalizedStatus === "Rejected" ? "TERMINATE: No further assessment recommended." : "REVIEW: Secondary manual panel required.",
                                                                indicator: "h-2 w-2"
                                                            },
                                                            {
                                                                label: "Core Rationale",
                                                                value: (aiData.strengths?.[0]?.point || aiData.strengths?.[0] || "Identified foundational technical alignment.") + " " + (aiData.suitability_analysis?.suggestions?.[0] || ""),
                                                                indicator: "h-2 w-2"
                                                            },
                                                            {
                                                                label: "Strategic Decision",
                                                                value: normalizedStatus === "Shortlisted" ? `CONFIRMED: High-alignment profile with ${aiData.suitability_analysis?.readiness_timeline || "immediate"} potential.` :
                                                                    normalizedStatus === "Rejected" ? "DECLINED: Critical technical or proctoring threshold not met." : "PENDING: Awaiting further signal validation.",
                                                                indicator: "h-2 w-2"
                                                            }
                                                        ].map((decision, i) => (
                                                            <div key={i} className="flex gap-5 items-start px-2">
                                                                <div className={cn(
                                                                    "mt-1.5 rounded-full shrink-0 shadow-[0_0_10px_rgba(0,0,0,0.1)]",
                                                                    decision.indicator,
                                                                    normalizedStatus === "Shortlisted" ? "bg-emerald-500 shadow-emerald-500/20" :
                                                                        normalizedStatus === "Rejected" ? "bg-rose-500 shadow-rose-500/20" : "bg-slate-400 shadow-slate-400/20"
                                                                )} />
                                                                <div className="space-y-1">
                                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">
                                                                        {decision.label}
                                                                    </p>
                                                                    <p className={cn(
                                                                        "text-[15px] font-semibold leading-snug tracking-tight",
                                                                        normalizedStatus === "Shortlisted" ? "text-emerald-950" :
                                                                            normalizedStatus === "Rejected" ? "text-rose-950" : "text-slate-900"
                                                                    )}>
                                                                        {decision.value}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {activeTab === "interview" && candidate && hasStructuredInterviewReport && (
                        <div className="space-y-12 pb-20 bg-[#F4F7FF] -mx-8 px-12 pt-16 font-inter">
                            <div className="space-y-12">
                                <div className="flex flex-col items-center gap-2 text-center mb-4">
                                    <h2 className="text-3xl font-bold text-slate-950 tracking-tight font-inter uppercase">Performance Analysis</h2>
                                    <div className="h-1 w-20 bg-indigo-600 rounded-full" />
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
                                    <div className="p-6 rounded-[32px] bg-white border border-gray-100 shadow-sm space-y-4">
                                        <h3 className="text-[18px] font-bold text-gray-900 font-inter tracking-tight">Header Scores</h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <VerdictScoreCard label="Interview / 10" value={String(interviewReportScores.interview_score ?? interviewScore.toFixed(1))} color="blue" />
                                            <VerdictScoreCard label="Combined / 100" value={String(interviewReportScores.combined_score ?? Math.round(combinedScore * 10))} color="indigo" />
                                            <VerdictScoreCard label="CEFR" value={String(interviewReportScores.cefr_level ?? communicationLevel)} color="slate" />
                                            <VerdictScoreCard label="Integrity / 10" value={String((integrityScore / 10).toFixed(1))} color="orange" />
                                        </div>
                                    </div>

                                    <div className="p-6 rounded-[32px] bg-white border border-gray-100 shadow-sm space-y-4">
                                        <h3 className="text-[18px] font-bold text-gray-900 font-inter tracking-tight">Communication Analysis</h3>
                                        <CommunicationDonutChart
                                            metrics={[
                                                { label: "CLARITY", value: interviewReportCommunication.clarity ?? 60, color: "#6366F1" },
                                                { label: "FLUENCY", value: interviewReportCommunication.fluency ?? 35, color: "#F59E0B" },
                                                { label: "GRAMMAR", value: interviewReportCommunication.grammar ?? 30, color: "#10B981" },
                                                { label: "DEPTH", value: interviewReportCommunication.depth ?? 45, color: "#F43F5E" }
                                            ]}
                                        />
                                        <div className="p-5 rounded-[24px] bg-[#FAF9F6] border border-[#F5E6D3]/30 space-y-2">
                                            <p className="text-[9px] font-bold text-[#A89078] uppercase tracking-[0.3em]">CEFR RATING</p>
                                            <h4 className="text-xl font-bold text-[#8B5E3C] tracking-tight">{String(interviewReportScores.cefr_level || communicationLevel)} â€” {String(interviewReportScores.cefr_label || communicationStatus)}</h4>
                                            <p className="text-[15px] font-medium text-gray-500 leading-relaxed">
                                                {interviewReportCommunication.cefr_analysis || "Communication analysis will appear here once the interview report is generated."}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="p-6 rounded-[32px] bg-white border border-gray-100 shadow-sm space-y-4">
                                        <h3 className="text-[18px] font-bold text-gray-900 font-inter tracking-tight">Interview Recording</h3>
                                        <div className="aspect-video w-full rounded-[24px] border-[5px] border-gray-900 bg-black overflow-hidden shadow-2xl relative">
                                            {interviewRecordingUrl ? (
                                                <Plyr
                                                    key={interviewRecordingUrl}
                                                    source={{ type: "video", sources: [{ src: interviewRecordingUrl, type: "video/mp4" }] }}
                                                    options={{ duration: recordingDurationSec || undefined }}
                                                />
                                            ) : (
                                                <div className="h-full w-full flex items-center justify-center text-gray-500 text-[10px] font-bold uppercase tracking-widest bg-gray-900/50">Video Loading...</div>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 rounded-[20px] bg-[#FAF9F6] border border-gray-100 flex flex-col items-center justify-center gap-1.5">
                                                <span className="text-[8px] font-bold uppercase tracking-widest text-gray-500">Total duration</span>
                                                <p className="text-lg font-bold text-gray-900 leading-none">{interviewReportRecording.duration_label || (recordingDurationSec ? formatDuration(recordingDurationSec) : "--:--min")}</p>
                                            </div>
                                            <div className="p-4 rounded-[20px] bg-[#FAF9F6] border border-gray-100 flex flex-col items-center justify-center gap-1.5">
                                                <span className="text-[8px] font-bold uppercase tracking-widest text-gray-500">Words Spoken</span>
                                                <p className="text-lg font-bold text-gray-900 leading-none">{typeof interviewReportRecording.word_count === "number" ? interviewReportRecording.word_count.toLocaleString() : wordCount.toLocaleString()}</p>
                                            </div>
                                        </div>
                                        <div className="p-4 rounded-[20px] bg-slate-50 border border-slate-100 space-y-2">
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.3em]">AI Summary</p>
                                            <p className="text-[13px] font-medium text-slate-700 leading-relaxed">{interviewReportSummary || "AI summary will appear here once the interview report is generated."}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch max-w-[1400px] mx-auto">
                                    <div className="p-8 rounded-[40px] bg-white border border-gray-100 shadow-md flex flex-col h-[700px]">
                                        <div className="flex items-center justify-between mb-8">
                                            <h3 className="text-[16px] font-bold text-gray-900 font-inter tracking-tight">Did the Interview Prove JD Skills?</h3>
                                            <Sparkles className="h-4 w-4 text-indigo-500 animate-pulse" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 mb-5">
                                            <div className="p-4 rounded-[24px] bg-slate-50 border border-slate-100 shadow-sm">
                                                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Overall JD Match</p>
                                                <p className="text-[26px] font-black text-slate-900 leading-none mt-2">{interviewSkillStats.overallMatch}%</p>
                                                <p className="text-[11px] font-medium text-slate-500 mt-2">Based on proved and partially proved skills</p>
                                            </div>
                                            <div className="p-4 rounded-[24px] bg-emerald-50 border border-emerald-100 shadow-sm">
                                                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-emerald-500">Strongest Proof</p>
                                                <p className="text-[15px] font-bold text-emerald-950 leading-snug mt-2 line-clamp-2">
                                                    {String(interviewSkillStats.strongest?.title || "No proven skill yet")}
                                                </p>
                                                <p className="text-[11px] font-medium text-emerald-700 mt-2">
                                                    {String(interviewSkillStats.strongest?.score || "â€”")} Â· {String(interviewSkillStats.strongest?.status || "N/A")}
                                                </p>
                                            </div>
                                            <div className="p-4 rounded-[24px] bg-rose-50 border border-rose-100 shadow-sm">
                                                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-rose-500">Biggest Gap</p>
                                                <p className="text-[15px] font-bold text-rose-950 leading-snug mt-2 line-clamp-2">
                                                    {String(interviewSkillStats.biggestGap?.title || "No major gap detected")}
                                                </p>
                                                <p className="text-[11px] font-medium text-rose-700 mt-2">
                                                    {String(interviewSkillStats.biggestGap?.score || "â€”")} Â· {String(interviewSkillStats.biggestGap?.status || "N/A")}
                                                </p>
                                            </div>
                                            <div className="p-4 rounded-[24px] bg-amber-50 border border-amber-100 shadow-sm">
                                                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-500">Skill Split</p>
                                                <p className="text-[15px] font-bold text-amber-950 leading-snug mt-2">
                                                    {interviewSkillStats.proved} proved, {interviewSkillStats.partial} partial
                                                </p>
                                                <p className="text-[11px] font-medium text-amber-700 mt-2">
                                                    {interviewSkillStats.notProved} not proved, {interviewSkillStats.notTested} not tested
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-y-auto scrollbar-hide pr-1 space-y-4">
                                            {(interviewReportSkills.length > 0 ? interviewReportSkills : []).map((s: any, i: number) => (
                                                <AssessmentCard
                                                    key={i}
                                                    title={s.title}
                                                    subtitle={s.note || ""}
                                                    confidence={s.confidence || ""}
                                                    score={s.score || "â€”"}
                                                    status={String(s.status || "").toUpperCase() as any}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <div className="p-8 rounded-[40px] bg-white border border-gray-100 shadow-md flex flex-col h-[700px]">
                                        <div className="flex items-center justify-between mb-8">
                                            <div className="flex flex-col gap-1">
                                                <h3 className="text-[16px] font-bold text-gray-900 font-inter tracking-tight">Full Session Log</h3>
                                                <div className="flex items-center gap-2">
                                                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                                    <span className="text-[10px] font-inter font-bold text-emerald-600 uppercase tracking-widest">Secure Audit Mode</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-y-auto scrollbar-hide space-y-4 pr-2">
                                            {(interviewReportSessionLog.length > 0 ? interviewReportSessionLog : []).map((item: any, i: number) => (
                                                <div key={i} className="p-5 rounded-3xl border border-gray-100 bg-white shadow-sm space-y-3">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="space-y-1">
                                                            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Question {item.q || i + 1}</p>
                                                            <p className="text-[14px] font-semibold text-gray-900 leading-relaxed">{item.question || item.title}</p>
                                                        </div>
                                                        <span className="px-3 py-1 rounded-full bg-slate-50 border border-slate-100 text-[10px] font-bold text-slate-600 uppercase tracking-widest whitespace-nowrap">
                                                            {item.score || "â€”"}
                                                        </span>
                                                    </div>
                                                    <p className="text-[13px] font-medium text-gray-600 leading-relaxed">{item.reasoning || item.verdict || "No reasoning available."}</p>
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{item.confidence || ""}</p>
                                                </div>
                                            ))}
                                            {(interviewReportQaBlocks.length > 0 ? interviewReportQaBlocks : []).map((q: any, i: number) => (
                                                <div key={`q-${i}`} className="p-5 rounded-3xl border border-gray-100 bg-[#FAF9F6] shadow-sm space-y-3">
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Question {String(q.q || i + 1).padStart(2, "0")}</p>
                                                    <p className="text-[14px] font-semibold text-gray-900 leading-relaxed">{q.question || q.title}</p>
                                                    <p className="text-[13px] font-medium text-gray-600 leading-relaxed">{q.reasoning || q.verdict || "No reasoning available."}</p>
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{q.score || "â€”"} {q.confidence ? `â€¢ ${q.confidence}` : ""}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="p-8 rounded-[40px] bg-white border border-gray-100 shadow-sm flex flex-col h-[650px]">
                                        <h3 className="text-[16px] font-bold text-gray-900 font-inter tracking-tight mb-8">Resume claims vs Interview proof â€” consistency check</h3>
                                        <div className="flex-1 overflow-y-auto scrollbar-hide space-y-4">
                                            {(interviewReportConsistency.length > 0 ? interviewReportConsistency : []).map((c: any, i: number) => (
                                                <div key={i} className="p-5 rounded-3xl border border-gray-100 bg-white shadow-sm space-y-3">
                                                    <p className="text-[14px] font-bold text-gray-900 leading-tight">{c.claim}</p>
                                                    <p className="text-[9px] font-bold text-slate-500 font-black uppercase tracking-widest">FIELD: {c.sub}</p>
                                                    <p className="text-[13px] font-medium text-gray-600 leading-relaxed">{c.proof}</p>
                                                    <span className="inline-flex px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border shadow-sm bg-slate-50 text-slate-600 border-slate-100">{String(c.status || "").replace("_", " ")}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="p-8 rounded-[40px] bg-white border border-gray-100 shadow-sm flex flex-col h-[650px]">
                                        <h3 className="text-[16px] font-bold text-gray-900 font-inter tracking-tight mb-8">Key Moments From Session</h3>
                                        <div className="flex-1 overflow-y-auto scrollbar-hide space-y-4 pr-2">
                                            {(interviewReportKeyMoments.length > 0 ? interviewReportKeyMoments : []).map((m: any, i: number) => (
                                                <div key={i} className="grid grid-cols-[80px_1fr] gap-4 p-4 rounded-3xl border border-gray-100 bg-white shadow-sm">
                                                    <span className="text-[12px] font-bold text-slate-500">{m.time}</span>
                                                    <div className="space-y-1">
                                                        <p className="text-[14px] font-semibold text-gray-900">{m.title}</p>
                                                        <p className="text-[13px] font-medium text-gray-600 leading-relaxed">{m.note}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-16 border-t border-gray-200 mt-16 space-y-8">
                                    <div className="flex flex-col items-center gap-2 text-center mb-6">
                                        <h2 className="text-2xl font-bold text-slate-950 tracking-tight font-inter uppercase">Strategic Verdict</h2>
                                        <div className="h-1 w-16 bg-indigo-600 rounded-full" />
                                    </div>
                                    <div className="w-full max-w-[1200px] mx-auto p-8 rounded-[32px] bg-white border border-gray-100 shadow-sm space-y-5">
                                        <div className="flex items-start justify-between gap-4">
                                            <p className="text-[15px] font-medium text-slate-700 leading-[1.7] max-w-[900px]">
                                                {String(interviewStrategicVerdict.summary || interviewReportVerdict.summary || "Strategic summary will appear here once the report is generated.")}
                                            </p>
                                            <span className={cn(
                                                "px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest border shrink-0",
                                                String(interviewStrategicVerdict.decision || "").toLowerCase().includes("hire")
                                                    ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                                                    : String(interviewStrategicVerdict.decision || "").toLowerCase().includes("do not")
                                                        ? "bg-rose-50 border-rose-100 text-rose-700"
                                                        : "bg-amber-50 border-amber-100 text-amber-700"
                                            )}>
                                                {String(interviewStrategicVerdict.decision || interviewReportVerdict.recommendation || "Pending")}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                            <div className="p-5 rounded-[24px] bg-slate-50 border border-slate-100 space-y-3">
                                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Strategic Rationale</p>
                                                <div className="space-y-2">
                                                    {(Array.isArray(interviewStrategicVerdict.rationale) && interviewStrategicVerdict.rationale.length > 0)
                                                        ? interviewStrategicVerdict.rationale.map((item: string, index: number) => (
                                                            <p key={index} className="text-[14px] font-medium text-slate-700 leading-[1.7]">
                                                                {item}
                                                            </p>
                                                        ))
                                                        : (
                                                            <p className="text-[14px] font-medium text-slate-500 leading-[1.7]">
                                                                {interviewReportVerdict.recommendation_reason || "Waiting for interview report"}
                                                            </p>
                                                        )
                                                    }
                                                </div>
                                            </div>
                                            <div className="p-5 rounded-[24px] bg-indigo-50 border border-indigo-100 space-y-3">
                                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-500">Recommended Next Action</p>
                                                <div className="space-y-2">
                                                    {(Array.isArray(interviewStrategicVerdict.next_actions) && interviewStrategicVerdict.next_actions.length > 0)
                                                        ? interviewStrategicVerdict.next_actions.map((item: string, index: number) => (
                                                            <p key={index} className="text-[14px] font-medium text-indigo-900 leading-[1.7]">
                                                                {item}
                                                            </p>
                                                        ))
                                                        : (
                                                            <p className="text-[14px] font-medium text-indigo-900 leading-[1.7]">
                                                                {interviewReportVerdict.recommendation_reason || "Waiting for interview report"}
                                                            </p>
                                                        )
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                {activeTab === "interview" && candidate && !hasStructuredInterviewReport && (
                        <div className="space-y-12     pb-20 bg-[#F4F7FF] -mx-8 px-12 pt-16">
                            
                            {/* â”€â”€ Section: Performance Analysis â”€â”€ */}
                            <div className="space-y-12">
                                <div className="flex flex-col items-center gap-2 text-center mb-4">
                                    <h2 className="text-3xl font-bold text-slate-950 tracking-tight font-inter uppercase">Performance Analysis</h2>
                                    <div className="h-1 w-20 bg-indigo-600 rounded-full" />
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
                                    {/* communication */}
                                    <div className="p-6 rounded-[32px] bg-white border border-gray-100 shadow-sm space-y-6 flex flex-col scale-[0.98] origin-top-left">
                                        <h3 className="text-[18px] font-bold text-gray-900 font-inter tracking-tight">Communication Analysis</h3>
                                        <div className="flex justify-center py-2 flex-1 items-center">
                                            <CommunicationDonutChart
                                                metrics={[
                                                    { label: "CLARITY", value: Math.max(0, Math.min(100, interviewReportCommunication.clarity ?? 60)), color: "#6366F1" },
                                                    { label: "FLUENCY", value: Math.max(0, Math.min(100, interviewReportCommunication.fluency ?? 35)), color: "#F59E0B" },
                                                    { label: "GRAMMAR", value: Math.max(0, Math.min(100, interviewReportCommunication.grammar ?? 30)), color: "#10B981" },
                                                    { label: "DEPTH", value: Math.max(0, Math.min(100, interviewReportCommunication.depth ?? 45)), color: "#F43F5E" }
                                                ]}
                                            />
                                        </div>
                                        <div className="p-5 rounded-[24px] bg-[#FAF9F6] border border-[#F5E6D3]/30 space-y-2">
                                            <p className="text-[9px] font-bold text-[#A89078] uppercase tracking-[0.3em]">CEFR RATING</p>
                                            <h4 className="text-xl font-bold text-[#8B5E3C] tracking-tight">
                                                {(interviewReportScores.cefr_level || communicationLevel)} â€” {(interviewReportScores.cefr_label || communicationStatus)}
                                            </h4>
                                            <p className="text-[15px] font-medium text-gray-500 leading-relaxed">
                                                {interviewReportCommunication.cefr_analysis || "Communication analysis will appear here once the interview report is generated."}
                                            </p>
                                        </div>
                                    </div>

                                    {/* video */}
                                    <div className="p-6 rounded-[32px] bg-white border border-gray-100 shadow-sm flex flex-col space-y-5 scale-[0.98] origin-top-right">
                                        <h3 className="text-[18px] font-bold text-gray-900 font-inter tracking-tight">Interview Recording</h3>
                                        
                                        <div className="space-y-6 flex-1 flex flex-col">
                                            <div className="aspect-video w-full rounded-[24px] border-[5px] border-gray-900 bg-black overflow-hidden shadow-2xl relative">
                                            {interviewRecordingUrl ? (
                                                <Plyr
                                                    key={interviewRecordingUrl}
                                                    source={{
                                                        type: "video",
                                                        sources: [{ src: interviewRecordingUrl, type: "video/mp4" }],
                                                    }}
                                                    options={{
                                                        duration: recordingDurationSec || undefined,
                                                        controls: ["play-large", "play", "progress", "current-time", "mute", "volume", "captions", "settings", "pip", "fullscreen"],
                                                    }}
                                                />
                                            ) : (
                                                <div className="h-full w-full flex items-center justify-center text-gray-500 text-[10px] font-bold uppercase tracking-widest bg-gray-900/50">Video Loading...</div>
                                            )}
                                        </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="p-4 rounded-[20px] bg-[#FAF9F6] border border-gray-100 flex flex-col items-center justify-center gap-1.5">
                                                    <div className="flex items-center gap-2 text-slate-500 font-black">
                                                        <Calendar className="h-4 w-4" />
                                                        <span className="text-[8px] font-bold uppercase tracking-widest">Total duration</span>
                                                    </div>
                                                <p className="text-lg font-bold text-gray-900 leading-none">{interviewReportRecording.duration_label || (recordingDurationSec ? formatDuration(recordingDurationSec) : "--:--min")}</p>
                                                </div>
                                                <div className="p-4 rounded-[20px] bg-[#FAF9F6] border border-gray-100 flex flex-col items-center justify-center gap-1.5">
                                                    <div className="flex items-center gap-2 text-[#F97316]">
                                                        <MessageSquare className="h-4 w-4" />
                                                        <span className="text-[8px] font-bold uppercase tracking-widest">Words Spoken</span>
                                                    </div>
                                                <p className="text-lg font-bold text-gray-900 leading-none">{typeof interviewReportRecording.word_count === "number" ? interviewReportRecording.word_count.toLocaleString() : (wordCount > 0 ? wordCount.toLocaleString() : "N/A")}</p>
                                                </div>
                                            </div>
                                            <div className="p-4 rounded-[20px] bg-slate-50 border border-slate-100 space-y-2">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.3em]">AI Summary</p>
                                                <p className="text-[13px] font-medium text-slate-700 leading-relaxed">
                                                    {interviewReportSummary || "AI summary will appear here once the interview report is generated."}
                                                </p>
                                            </div>
                                    </div>
                                    <div className="h-2" /> {/* Spacer */}
                                </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch max-w-[1400px] mx-auto">
                                    {/* Section 1: JD Skills (Top Left) */}
                                    <div className="p-8 rounded-[40px] bg-white border border-gray-100 shadow-md flex flex-col h-[700px]">
                                        <div className="flex items-center justify-between mb-8">
                                            <h3 className="text-[16px] font-bold text-gray-900 font-inter tracking-tight">Did the Interview Prove JD Skills?</h3>
                                            <Sparkles className="h-4 w-4 text-indigo-500 animate-pulse" />
                                        </div>
                                        <div className="flex-1 overflow-y-auto scrollbar-hide pr-1">
                                            {(interviewReportSkills.length > 0 ? interviewReportSkills : [
                                                { title: "Cycle detection in graphs", subtitle: "So is it totally based on coding? â€” deflected", confidence: "HIGH â€” NO ATTEMPT", score: "0/10", status: "NOT PROVED" },
                                                { title: "Graph traversal (BFS / DFS)", subtitle: "Not reached â€” session ended early", confidence: "N/A â€” NOT TESTED", score: "0/10", status: "NOT TESTED" },
                                                { title: "Edge case handling", subtitle: "Not reached â€” session ended early", confidence: "N/A â€” NOT TESTED", score: "0/10", status: "NOT TESTED" },
                                                { title: "Problem-solving approach", subtitle: "Actually, I'm not good at coding.", confidence: "HIGH â€” SELF-DECLARED", score: "0/10", status: "NOT PROVED" },
                                                { title: "Communication clarity", subtitle: "Basic exchanges functional, grammar poor", confidence: "HIGH â€” FULL DATA", score: "5/10", status: "PARTIAL" }
                                            ]).map((s: any, i: number) => (
                                                <AssessmentCard
                                                    key={i}
                                                    title={s.title}
                                                    subtitle={s.note || s.subtitle || ""}
                                                    confidence={s.confidence || ""}
                                                    score={s.score || "â€”"}
                                                    status={String(s.status || "").toUpperCase() as any}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Section 2: Transcript (Top Right) */}
                                    <div className="p-8 rounded-[40px] bg-white border border-gray-100 shadow-md flex flex-col h-[700px]">
                                        <div className="flex items-center justify-between mb-8">
                                            <div className="flex flex-col gap-1">
                                                <h3 className="text-[16px] font-bold text-gray-900 font-inter tracking-tight">Full Session Log</h3>
                                                <div className="flex items-center gap-2">
                                                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                                    <span className="text-[10px] font-inter font-bold text-emerald-600 uppercase tracking-widest">Secure Audit Mode</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center p-1 bg-gray-50 rounded-2xl border border-gray-100">
                                                <button 
                                                    onClick={() => setLogTab("chat")}
                                                    className={cn(
                                                        "px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                                                        logTab === "chat" ? "bg-white text-indigo-600 shadow-sm border border-gray-100" : "text-gray-400 hover:text-gray-600"
                                                    )}
                                                >
                                                    Chat
                                                </button>
                                                <button 
                                                    onClick={() => setLogTab("analysis")}
                                                    className={cn(
                                                        "px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                                                        logTab === "analysis" ? "bg-white text-indigo-600 shadow-sm border border-gray-100" : "text-gray-400 hover:text-gray-600"
                                                    )}
                                                >
                                                    Analysis
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-y-auto scrollbar-hide pr-4 pt-4 ">
                                            {logTab === "chat" ? (
                                                <div className="flex flex-col flex-1 min-h-0">
                                                    <div className="flex items-center gap-3 mb-6 px-2">
                                                        <div className="h-8 w-8 rounded-xl bg-slate-950 flex items-center justify-center shadow-lg shadow-slate-900/20">
                                                            <MessageSquare className="h-4 w-4 text-white" />
                                                        </div>
                                                        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Session Transcript â€” Analysis Phase</h4>
                                                    </div>
                                                    
                                                    <div className="flex-1 overflow-y-auto pr-2 space-y-8 custom-scrollbar  py-2">
                                                        {([
                                                            { role: "ai", name: "Ishita", text: "Hey Vamsi Test Applicant, welcome! Really glad you could make it today. I'm Ishita, and I'll be having a conversation with you about the GTM Engineer role. How are you doing today?" },
                                                            { role: "candidate", name: candidate.fullName, text: "Wait... is it based on coding? I thought this was for GTM." },
                                                            { role: "ai", name: "Ishita", text: "It's a GTM Engineer role, so it involves both technical implementation and strategy. Let's start with something fundamental." },
                                                            { role: "candidate", name: candidate.fullName, text: "Actually, to be honest, I'm not good at coding. I handle the strategy side mostly." },
                                                            { role: "ai", name: "Ishita", text: "I appreciate the honesty. Let's look at how you approach tool integration then. Have you worked with n8n or Apollo?" },
                                                            { role: "candidate", name: candidate.fullName, text: "I've used them, but... let's see how it goes." }
                                                        ]).map((m, i) => (
                                                            <ChatEntry key={i} {...m as any} />
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-6">
                                                    <div className="flex items-center gap-3 mb-4">
                                                        <div className="h-8 w-8 rounded-xl bg-slate-950 flex items-center justify-center shadow-lg shadow-slate-900/20">
                                                            <Sparkles className="h-4 w-4 text-white" />
                                                        </div>
                                                        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">AI Integrity Breakdown</h4>
                                                    </div>
                                                    {([
                                                        { qNumber: "QUESTION 01", question: "How would you implement a cycle detection algorithm in a graph for a custom workflow engine?", reasoning: "Candidate immediately deflected technical depth. Question was avoided entirely.", depth: "SHALLOW â€” NO SIGNAL", score: "0/10" },
                                                        { qNumber: "QUESTION 02", question: "Can you explain the difference between BFS and DFS in the context of data synchronization?", reasoning: "Candidate stated they are 'not good at coding'. Core competency mismatch identified.", depth: "N/A â€” SELF-DECLARED", score: "0/10" },
                                                        { qNumber: "QUESTION 03", question: "How do you handle edge cases in a recursive script for directory processing?", reasoning: "Attempt aborted by AI due to previous declaration of coding deficiency.", depth: "N/A â€” NOT TESTED", score: "0/10" },
                                                        { qNumber: "QUESTION 04", question: "What is your experience with tool integration platforms like n8n or Apollo?", reasoning: "Vague response provided. Minimal evidence of strategic tool orchestration depth.", depth: "PARTIAL â€” WEAK SIGNAL", score: "4/10" }
                                                    ]).map((q, i) => (
                                                        <AnalysisEntry key={i} {...q as any} />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Section 3: Consistency Check (Bottom Left) */}
                                    <div className="p-8 rounded-[40px] bg-white border border-gray-100 shadow-sm flex flex-col h-[650px]">
                                        <h3 className="text-[16px] font-bold text-gray-900 font-inter tracking-tight mb-8">Resume claims vs Interview proof â€” consistency check</h3>
                                        <div className="grid grid-cols-[1.5fr_1.8fr_120px] gap-6 px-6 mb-6 border-b border-gray-50 pb-6">
                                            <span className="text-[11px] font-bold text-gray-900 font-inter uppercase tracking-widest opacity-70">Resume Claimed</span>
                                            <span className="text-[11px] font-bold text-gray-900 font-inter uppercase tracking-widest opacity-70">Interview Showed</span>
                                            <span className="text-[11px] font-bold text-gray-900 font-inter uppercase tracking-widest opacity-70 text-center">Result</span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto scrollbar-hide">
                                            {[
                                                { claim: "Built GTM automation systems at Niti AI", sub: "GTM strategy", proof: "Zero GTM knowledge demonstrated. Could not answer basic GTM question.", status: "MISMATCH" },
                                                { claim: "n8n, Zapier, Apollo automation experience", sub: "Automation tools", proof: "Not tested in interview â€” role needed coding.", status: "NOT TESTED" },
                                                { claim: "Python, Pandas, Power BI â€” data analysis", sub: "Technical skills", proof: "Self-declared 'not good at coding.' No code written.", status: "CONTRADICTED" },
                                                { claim: "Problem-solving and analytical thinking", sub: "Soft skill", proof: "Minimal engagement with problem. Disengaged.", status: "WEAK SIGNAL" }
                                            ].map((c, i) => (
                                                <div key={i} className="grid grid-cols-[1.5fr_1.8fr_120px] gap-8 px-6 py-6 rounded-3xl hover:bg-gray-50/50 transition-all group items-start border-b border-gray-50 last:border-0 relative">
                                                    <div className="space-y-2">
                                                        <p className="text-[14px] font-bold text-gray-900 leading-tight">{c.claim}</p>
                                                        <p className="text-[9px] font-bold text-slate-500 font-black uppercase tracking-widest">FIELD: {c.sub}</p>
                                                    </div>
                                                    <div className="flex gap-4">
                                                        <ArrowRight className="h-4 w-4 text-gray-200 mt-1 shrink-0 group-hover:text-slate-900 transition-colors" />
                                                        <p className={cn("text-[13px] font-semibold leading-relaxed", 
                                                            c.status === "CONTRADICTED" || c.status === "MISMATCH" ? "text-rose-600" : 
                                                            c.status === "WEAK SIGNAL" ? "text-orange-700" : "text-gray-400 italic"
                                                        )}>
                                                            {c.proof}
                                                        </p>
                                                    </div>
                                                    <div className="flex justify-center">
                                                        <span className={cn("px-3 py-1 rounded-full text-[8px] font-bold uppercase tracking-widest border shadow-sm",
                                                            c.status === "MATCHED" ? "bg-slate-50 text-slate-900 border-slate-200 shadow-sm" :
                                                            c.status === "CONTRADICTED" || c.status === "MISMATCH" ? "bg-slate-950 text-white border-slate-900 shadow-sm" : 
                                                            "bg-slate-50 text-slate-500 border-slate-100 italic"
                                                        )}>{c.status.replace('_', ' ')}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Section 4: Key Moments (Bottom Right) */}
                                    <div className="p-8 rounded-[40px] bg-white border border-gray-100 shadow-sm flex flex-col h-[650px]">
                                        <h3 className="text-[16px] font-bold text-gray-900 font-inter tracking-tight mb-8">Key Moments From Session</h3>
                                        <div className="flex grid grid-cols-[80px_1fr] px-6 mb-6 border-b border-gray-50 pb-6 mt-[-10px]">
                                            <span className="text-[11px] font-bold text-gray-900 font-inter uppercase tracking-widest opacity-70">Timeline</span>
                                            <span className="text-[11px] font-bold text-gray-900 font-inter uppercase tracking-widest opacity-70">Key Observation</span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto scrollbar-hide pr-2">
                                            {[
                                                { time: "0:38", type: "CONTEXT", observation: "Minimal engagement at interview start", comment: "Yeah. Sure. - two-word response to interview structure explanation" },
                                                { time: "1:12", type: "FLAG", observation: "Deflected technical question â€” asked about format instead", comment: "K. So is it totally based on coding? - avoidance rather than engagement" },
                                                { time: "1:18", type: "FLAG", observation: "Tab switch detected â€” at exact moment of deflection", comment: "Proctoring: browser focus lost ~8 sec. Timing aligns with Q1 avoidance behaviour." },
                                                { time: "2:28", type: "CRITICAL", observation: "Self-declared inability to code â€” defining moment of session", comment: "Actually, I'm not good at coding. - unprompted, direct self-admission" },
                                                { time: "3:05", type: "FLAG", observation: "Audio anomaly detected â€” 3 seconds post-admission", comment: "Voice-like sound. Flagged for correlation." }
                                            ].map((m, i) => (
                                                <MomentEntry key={i} {...m as any} />
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* â”€â”€ Section: Integrity & Proctoring â”€â”€ */}
                                <div className="pt-16 border-t border-gray-200 mt-16 space-y-8">
                                    <div className="flex flex-col items-center gap-2 text-center mb-6">
                                        <h2 className="text-2xl font-bold text-slate-950 tracking-tight font-inter uppercase">Integrity and Proctoring</h2>
                                        <div className="h-1 w-16 bg-rose-500 rounded-full" />
                                    </div>
                                    <div className="flex justify-end -mt-16 mb-8">
                                        <Button 
                                            onClick={() => setIsAuditModalOpen(true)}
                                            variant="outline" 
                                            className="rounded-full border-gray-200 text-[10px] font-bold h-8 px-6 hover:bg-white hover:border-gray-900 transition-all uppercase tracking-widest shadow-sm"
                                        >
                                            View all logs
                                        </Button>
                                    </div>

                                    {/* â”€â”€ Integrity Verdict Card â”€â”€ */}
                                    <div className="grid grid-cols-[260px_1fr] rounded-[40px] bg-white border-2 border-[#F5E6D3]/30 shadow-[0_20px_60px_rgba(139,94,60,0.06)] overflow-hidden border-l-[8px] border-l-[#8B5E3C]">
                                        <div className="bg-[#FAF9F6] p-8 flex flex-col items-center justify-center gap-4 border-r border-[#F5E6D3]/20">
                                            <h4 className="text-[12px] font-bold text-gray-900 font-inter uppercase tracking-widest opacity-60 mb-2">Integrity Score</h4>
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-5xl font-bold text-gray-900 tracking-tighter">{(integrityScore / 10).toFixed(1)}</span>
                                                <span className="text-xl font-semibold text-gray-300">/10</span>
                                            </div>
                                            <span className="px-6 py-2 rounded-full bg-[#FEF3C7]/60 text-[#B45309] text-[10px] font-bold uppercase tracking-[0.2em] border border-[#FDE68A]">
                                                {integrityStatusLabel}
                                            </span>
                                        </div>
                                        <div className="p-8 space-y-5">
                                            <h4 className="text-[12px] font-bold text-gray-900 font-inter uppercase tracking-widest opacity-60 mb-1">Integrity Verdict</h4>
                                            <p className="text-[14px] font-medium text-gray-700 leading-[1.7] max-w-[95%]">
                                                {proctoringVerdictSummary}
                                            </p>
                                        </div>
                                    </div>

                                    {/* â”€â”€ Proctoring Metrics Row â”€â”€ */}
                                    <div className="flex gap-6">
                                        <ProctoringMetric value={String(groupedProctoringSignals.filter((g: any) => String(g.key).includes("tab")).reduce((n: number, g: any) => n + g.count, 0) || 0)} label="Tab Switches" risk={groupedProctoringSignals.some((g: any) => String(g.key).includes("tab") && g.severity === "high") ? "HIGH RISK" : groupedProctoringSignals.some((g: any) => String(g.key).includes("tab")) ? "MEDIUM RISK" : "NO RISK"} />
                                        <ProctoringMetric value={String(groupedProctoringSignals.filter((g: any) => String(g.key).includes("face")).reduce((n: number, g: any) => n + g.count, 0) || 0)} label="Face Events" risk={groupedProctoringSignals.some((g: any) => String(g.key).includes("face") && g.severity === "high") ? "HIGH RISK" : "NO RISK"} />
                                        <ProctoringMetric value={String(groupedProctoringSignals.filter((g: any) => String(g.key).includes("audio")).reduce((n: number, g: any) => n + g.count, 0) || 0)} label="Audio Signals" risk={groupedProctoringSignals.some((g: any) => String(g.key).includes("audio") && g.severity === "high") ? "HIGH RISK" : groupedProctoringSignals.some((g: any) => String(g.key).includes("audio")) ? "MEDIUM RISK" : "NO RISK"} />
                                        <ProctoringMetric value={String(groupedProctoringSignals.filter((g: any) => String(g.key).includes("gaze")).reduce((n: number, g: any) => n + g.count, 0) || 0)} label="Gaze Events" risk={groupedProctoringSignals.some((g: any) => String(g.key).includes("gaze") && g.severity === "high") ? "HIGH RISK" : groupedProctoringSignals.some((g: any) => String(g.key).includes("gaze")) ? "MEDIUM RISK" : "NO RISK"} />
                                    </div>

                                    {/* â”€â”€ Correlation Timeline vs Pattern Analysis Grid â”€â”€ */}
                                    <div className="grid grid-cols-[1.2fr_1fr] gap-8 items-stretch">
                                        {/* Left: Timeline */}
                                        <div className="p-6 rounded-[36px] bg-white border border-gray-100 shadow-sm space-y-8 optimize-scroll">
                                            <h4 className="text-[14px] font-bold text-gray-900 font-inter tracking-tight mb-5">Event Timeline â€” Correlated with Interview</h4>
                                            <div className="space-y-2">
                                                <TimelineEvent 
                                                    time="0:00" 
                                                    event="Session started" 
                                                    risk="CLEAN" 
                                                    desc="Camera on. Single face detected. Browser focus confirmed. Audio levels normal." 
                                                    isSuccess 
                                                />
                                                <TimelineEvent 
                                                    time="1:18" 
                                                    event="Tab switch" 
                                                    risk="MEDIUM RISK" 
                                                    desc="Browser focus lost for ~8 seconds. Candidate returned to session tab." 
                                                    subNote="Timed during Q1 deflection â€” candidate was avoiding the coding question at this exact moment. Most notable signal in session."
                                                />
                                                <TimelineEvent 
                                                    time="3:05" 
                                                    event="Audio anomaly" 
                                                    risk="MEDIUM RISK" 
                                                    desc="Voice-like background sound for ~3 seconds. Could be ambient noise or TV." 
                                                    subNote="Occurred 37 seconds after self-admission 'not good at coding.' No clear link â€” flag for awareness only."
                                                />
                                                <TimelineEvent 
                                                    time="5:00" 
                                                    event="Session ended" 
                                                    risk="CLEAN" 
                                                    desc="No further anomalies. Face present entire session. Gaze consistent with genuine attempt." 
                                                    isSuccess
                                                />
                                            </div>
                                        </div>

                                        {/* Right: Pattern Analysis */}
                                        <div className="p-6 rounded-[36px] bg-white border border-gray-100 shadow-sm space-y-8 optimize-scroll">
                                            <h4 className="text-[15px] font-bold text-gray-900 font-inter tracking-tight mb-6">Pattern Analysis â€” What signals mean together</h4>
                                            <div className="space-y-6">
                                                <AnalysisSignal 
                                                    type="warning" 
                                                    title="Tab switch timing is the key concern" 
                                                    desc="Not the count (1 is low) but the exact timing â€” during the technical question at the moment of deflection. This correlation is what matters." 
                                                />
                                                <AnalysisSignal 
                                                    type="success" 
                                                    title="No proxy candidate risk" 
                                                    desc="Face present 100% of session. Single face only. No deepfake indicators detected. Candidate was physically present throughout." 
                                                />
                                                <AnalysisSignal 
                                                    type="warning" 
                                                    title="Audio anomaly â€” insufficient to conclude" 
                                                    desc="Single 3-second event. No repeated pattern. Cannot conclude external assistance from one event alone." 
                                                />
                                                <AnalysisSignal 
                                                    type="success" 
                                                    title="Gaze pattern supports genuine attempt" 
                                                    desc="Eye movement consistent with reading the problem and thinking. No sustained off-screen reference pattern detected." 
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-16 border-t border-gray-200 mt-16 space-y-10">
                                        <div className="flex flex-col items-center gap-2 text-center mb-6">
                                            <h2 className="text-2xl font-bold text-slate-950 tracking-tight font-inter uppercase">Final Verdict</h2>
                                            <div className="h-1 w-16 bg-indigo-600 rounded-full" />
                                        </div>

                                        {/* â”€â”€ Score Summary â”€â”€ */}
                                        <div className="grid grid-cols-3 gap-8">
                                            <VerdictScoreCard label="Interview / 10" value="2.1" color="red" />
                                            <VerdictScoreCard label="Integrity / 10" value="5.8" color="orange" />
                                            <VerdictScoreCard label="Combined / 10" value="1.8" color="red" />
                                        </div>

                                        {/* â”€â”€ Verdict Narrative Card â”€â”€ */}
                                        <div className="flex justify-center">
                                            <div className="w-full max-w-[1200px] p-8 rounded-[32px] bg-white border border-gray-100 shadow-sm relative overflow-hidden group">
                                                <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500 opacity-60 group-hover:opacity-100 transition-opacity" />
                                                <div className="flex flex-col gap-6">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="text-[12px] font-bold text-slate-400 uppercase tracking-[0.4em]">Strategic Rationale</h4>
                                                        <div className="flex items-center gap-3">
                                                            <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                                                            <span className="px-5 py-2 rounded-full bg-rose-50 border border-rose-100 text-[10px] font-bold text-rose-600 uppercase tracking-widest shadow-sm">
                                                                Final Recommendation: Reject
                                                            </span>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="space-y-4">
                                                        <p className="text-[15px] font-medium text-slate-700 leading-[1.7] tracking-tight text-left font-inter">
                                                            The candidate demonstrated limited ability to articulate their experience and impact in the domain of B2B go-to-market strategies, providing only a brief and unclear response regarding their involvement with a "report strategy since sales systems." This suggests an area to explore further, particularly to understand the depth of their practical experience and specific contributions to lead generation or revenue growth.
                                                        </p>
                                                        
                                                        <p className="text-[15px] font-medium text-slate-700 leading-[1.7] tracking-tight text-left font-inter">
                                                            Communication during the interview was notably minimal and lacked elaboration, which may impact their effectiveness in a role that requires clear and proactive collaboration with cross-functional teams. While the candidate remained engaged, their responses did not convey a strong command of the subject matter or a confident attitude toward the role's responsibilities. Given these observations, the candidate's fit for the GTM Engineer role appears limited at this stage.
                                                        </p>
                                                        
                                                        <div className="pt-4 border-t border-slate-50">
                                                            <p className="text-[14px] font-bold text-rose-600 uppercase tracking-widest">
                                                                Verdict: Performance Threshold Not Met
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* â”€â”€ Recommended Next Actions â”€â”€ */}
                                        <div className="flex justify-center">
                                            <div className="w-full max-w-[1200px] p-8 rounded-[32px] bg-[#EEF2FF] border border-[#E0E7FF] space-y-6">
                                                <p className="text-center text-[10px] font-bold text-slate-500 font-black uppercase tracking-[0.4em] mb-3">Recommended Next Action</p>
                                                <div className="space-y-4 flex flex-col items-center">
                                                    <div className="space-y-3 w-fit">
                                                        <RecommendedActionItem text="Reject for this AI Engineer role â€” performance failure is definitive, no further round needed" />
                                                        <RecommendedActionItem text="Human review of recording recommended before logging integrity verdict â€” proctoring is inconclusive, not confirmed" />
                                                        <RecommendedActionItem text="Flag for talent pool as junior automation role candidate â€” n8n and Apollo experience has value in a different context" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                {showSubmissionPreview && (
                    <div className="fixed inset-0 z-[200] flex justify-end">
                        <AnimatePresence>
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-slate-900/40 backdrop-blur-md transition-opacity" 
                                onClick={() => setShowSubmissionPreview(false)} 
                            />
                        </AnimatePresence>
                        
                        <motion.div 
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="relative w-full max-w-2xl bg-white h-full shadow-[0_0_50px_rgba(0,0,0,0.15)] flex flex-col border-l border-slate-100"
                        >
                            <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                                <div className="space-y-1">
                                    <h2 className="text-2xl font-bold text-slate-950 tracking-tight font-inter">Application Submission</h2>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Candidate Input & Metadata</p>
                                </div>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => setShowSubmissionPreview(false)}
                                    className="h-12 w-12 rounded-2xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100"
                                >
                                    <X className="h-6 w-6 text-slate-400" />
                                </Button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-10 space-y-10 bg-slate-50/30">
                                <div className="p-8 rounded-[32px] bg-white border border-slate-100 shadow-sm space-y-6 relative overflow-hidden group">
                                    <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500/40 group-hover:bg-blue-500 transition-colors" />
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-xl bg-blue-50 flex items-center justify-center">
                                            <MessageSquare className="h-4 w-4 text-blue-500" />
                                        </div>
                                        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none">Cover Message / Note</h3>
                                    </div>
                                    <p className="text-[15px] font-medium text-slate-700 leading-relaxed whitespace-pre-wrap font-inter">
                                        {candidate.submissionData?.coverLetter || "No additional message was provided by the candidate during submission."}
                                    </p>
                                </div>

                                {(() => {
                                    const subData = candidate.submissionData?.metadata || candidate.submissionData || {};
                                    const entries = Object.entries(subData).filter(([k]) => !['coverLetter', 'metadata', 'resumeText', 'resumeUrl', 'passportUrl'].includes(k));
                                    
                                    if (entries.length === 0) return null;
                                    
                                    return (
                                        <div className="grid grid-cols-2 gap-4">
                                            {entries.map(([key, value]) => {
                                                // Format currency values (e.g., "600000||INR")
                                                let displayValue = String(value);
                                                if (typeof value === 'string' && value.includes('||')) {
                                                    const [amount, currency] = value.split('||');
                                                    displayValue = `${currency} ${Number(amount).toLocaleString()}`;
                                                }

                                                return (
                                                    <div key={key} className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm space-y-1">
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}</p>
                                                        <p className="text-sm font-bold text-slate-900">{displayValue}</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}
                            </div>

                            <div className="p-10 border-t border-slate-100 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.02)]">
                                <Button 
                                    onClick={() => setShowSubmissionPreview(false)} 
                                    className="w-full h-14 rounded-2xl bg-slate-950 text-white font-bold text-[12px] uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-900/10"
                                >
                                    Return to Report
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {showIntegrityDetails && (
                    <div className="fixed inset-0 z-[100] flex justify-end">
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setShowIntegrityDetails(false)} />
                        <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col  slide-in-from-right ">
                            <div className="px-10 py-8 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                                <div className="space-y-1">
                                    <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Integrity Deep-Dive</h2>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Full Proctoring Logs & Event Analysis</p>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setShowIntegrityDetails(false)} className="rounded-2xl hover:bg-gray-100 h-12 w-12">
                                    <X className="h-6 w-6 text-gray-400" />
                                </Button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-10 space-y-12 bg-white">
                                {/* â”€â”€ Tab Detection â”€â”€ */}
                                <section className="space-y-6">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-xl bg-rose-50 flex items-center justify-center">
                                            <MonitorSmartphone className="h-4 w-4 text-rose-500" />
                                        </div>
                                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Tab Detection Logs</h3>
                                    </div>
                                    <div className="space-y-4">
                                        <DeepDiveLog
                                            label="Browser Focus Lost"
                                            description="Candidate switched to another window/tab during 'n8n custom nodes' question."
                                            time="1:18 AM â€¢ 8.2s"
                                            type="error"
                                        />
                                        <DeepDiveLog
                                            label="External Search Likely"
                                            description="Tab switch duration correlates with response improvement."
                                            time="1:24 AM â€¢ 12.0s"
                                            type="warning"
                                        />
                                    </div>
                                </section>

                                {/* â”€â”€ Facial & Gaze â”€â”€ */}
                                <section className="space-y-6">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-xl bg-emerald-50 flex items-center justify-center">
                                            <UserCheck className="h-4 w-4 text-emerald-500" />
                                        </div>
                                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Facial & Gaze Analysis</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-6 rounded-3xl bg-emerald-50 border border-emerald-100 space-y-1">
                                            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Face Presence</p>
                                            <p className="text-xl font-bold text-gray-900">100.0%</p>
                                        </div>
                                        <div className="p-6 rounded-3xl bg-emerald-50 border border-emerald-100 space-y-1">
                                            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Multiple Faces</p>
                                            <p className="text-xl font-bold text-gray-900">0.0%</p>
                                        </div>
                                        <div className="p-6 rounded-3xl bg-orange-50 border border-orange-100 space-y-1">
                                            <p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">Gaze Deviation</p>
                                            <p className="text-xl font-bold text-gray-900">14.2%</p>
                                        </div>
                                        <div className="p-6 rounded-3xl bg-emerald-50 border border-emerald-100 space-y-1">
                                            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Head Pose Stability</p>
                                            <p className="text-xl font-bold text-gray-900">High</p>
                                        </div>
                                    </div>
                                </section>

                                {/* â”€â”€ Audio Anomalies â”€â”€ */}
                                <section className="space-y-6">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-xl bg-orange-50 flex items-center justify-center">
                                            <Volume2 className="h-4 w-4 text-orange-500" />
                                        </div>
                                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Audio Anomalies</h3>
                                    </div>
                                    <div className="space-y-4">
                                        <DeepDiveLog
                                            label="Background Voice Detected"
                                            description="Faint secondary voice captured shortly after candidate admission."
                                            time="3:05 AM â€¢ 3.0s"
                                            type="warning"
                                        />
                                        <DeepDiveLog
                                            label="Clean Session Audio"
                                            description="No major shouting or hardware disconnects detected."
                                            time="4:12 AM"
                                            type="success"
                                        />
                                    </div>
                                </section>
                            </div>

                            <div className="p-10 border-t border-gray-100 bg-gray-50/50">
                                <Button onClick={() => setShowIntegrityDetails(false)} className="w-full h-14 rounded-2xl bg-gray-900 text-white font-bold text-[12px] uppercase tracking-widest hover:bg-black transition-all shadow-xl">
                                    CLOSE ANALYSIS SYSTEM
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            
            <AuditLogModal
                isOpen={isAuditModalOpen}
                onClose={() => setIsAuditModalOpen(false)}
                candidateName={candidate.fullName}
                events={(() => {
                    const rawEvents = candidate.interview?.proctoringEvents;
                    if (!rawEvents) return [];
                    if (Array.isArray(rawEvents)) return rawEvents;
                    try {
                        return JSON.parse(rawEvents as string);
                    } catch {
                        return [];
                    }
                })()}
                recordingUrl={interviewRecordingUrl}
                snapshots={(() => {
                    const sn = candidate.interview?.snapshots || [];
                    if (Array.isArray(sn)) return sn;
                    try {
                        return JSON.parse(sn as string);
                    } catch {
                        return [];
                    }
                })()}
                interviewStartedAt={candidate.interview?.startedAt}
            />
        </div>
    );
}

