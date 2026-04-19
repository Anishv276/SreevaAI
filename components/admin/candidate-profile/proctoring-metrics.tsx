"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";

export const DeepDiveLog = memo(function DeepDiveLog({ label, description, time, type = "error" }: { label: string; description: string; time: string; type?: "error" | "warning" | "success" }) {
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

export const IntegrityRow = memo(function IntegrityRow({ label, value, status }: { label: string; value: string; status: string }) {
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

export const ProctoringMetric = memo(function ProctoringMetric({ value, label, risk }: { value: string; label: string; risk: "NO RISK" | "MEDIUM RISK" | "HIGH RISK" }) {
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
