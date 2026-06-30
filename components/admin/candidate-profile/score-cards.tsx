"use client";
import { memo } from "react";
import { cn } from "@/lib/utils";
export const ScoreCard = memo(function ScoreCard({ label, value, status, color = "orange" }: { label: string; value: string; status: string; color?: "orange" | "red" | "emerald" | "slate" }) {
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
export const VerdictScoreCard = memo(function VerdictScoreCard({ label, value, color }: { label: string; value: string; color: "red" | "orange" | "green" | "blue" | "indigo" | "slate" }) {
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
export const VerdictScoreBox = memo(function VerdictScoreBox({ label, value, color = "rose" }: { label: string; value: string; color?: "rose" | "orange" | "amber" }) {
    const colors = {
        rose: "text-rose-600 bg-rose-50/30 border-rose-100",
        orange: "text-violet-600 bg-violet-50/30 border-violet-100",
        amber: "text-amber-600 bg-amber-50/30 border-amber-100"
    };
    return (
        <div className={cn("p-10 rounded-[40px] border flex flex-col items-center justify-center gap-3", colors[color])}>
            <span className="text-5xl font-bold tracking-tighter">{value}</span>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">{label}</p>
        </div>
    );
});
