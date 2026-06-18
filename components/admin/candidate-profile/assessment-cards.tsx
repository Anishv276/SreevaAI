"use client";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle } from "lucide-react";
export const AssessmentCard = memo(function AssessmentCard({ title, subtitle, confidence, score, status }: { title: string; subtitle: string; confidence: string; score: string; status: "PROVED" | "PARTIAL" | "NOT PROVED" | "NOT TESTED" }) {
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
                    <p className="text-[10.5px] font-semibold text-gray-700 leading-relaxed">{subtitle}</p>
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
export const AnalysisEntry = memo(function AnalysisEntry({ qNumber, question, reasoning, depth, score }: { qNumber: string; question: string; reasoning: string; depth: string; score: string }) {
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
                    <h5 className="text-[15px] font-bold text-slate-900 leading-snug tracking-tight">{question}</h5>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 items-end">
                    <div className="space-y-4">
                        <div className="p-5 rounded-3xl bg-[#FAF9F6] border border-slate-50 italic">
                            <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.3em] mb-2 leading-none">AI Reasoning Path</p>
                            <p className="text-[13px] font-semibold text-slate-600 leading-relaxed">
                                &quot;{reasoning}&quot;
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
export const AnalysisSignal = memo(function AnalysisSignal({ title, desc, type }: { title: string; desc: string; type: "success" | "warning" }) {
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
