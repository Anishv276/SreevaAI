"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

export const RecommendedActionItem = memo(function RecommendedActionItem({ text }: { text: string }) {
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

export const ChatEntry = memo(function ChatEntry({ role, text, name }: { role: "ai" | "candidate"; text: string; name: string }) {
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

export const MomentEntry = memo(function MomentEntry({ time, type, observation, comment }: { time: string; type: "CONTEXT" | "FLAG" | "CRITICAL"; observation: string; comment: string }) {
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

export const TimelineEvent = memo(function TimelineEvent({ time, event, risk, desc, subNote, isSuccess = false }: { time: string; event: string; risk: "CLEAN" | "MEDIUM RISK" | "HIGH RISK"; desc: string; subNote?: string; isSuccess?: boolean }) {
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
