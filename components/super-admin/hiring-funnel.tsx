"use client";
import { useEffect, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
interface FunnelData {
    totalCandidates: number;
    totalShortlisted: number;
    totalInterviewed: number;
}
const STAGES = [
    { key: "applied",      label: "Applied",      color: "#3B82F6" },
    { key: "shortlisted",  label: "Shortlisted",   color: "#15803D" },
    { key: "interviewed",  label: "Interviewed",   color: "#16A34A" },
] as const;
export function SuperAdminHiringFunnel() {
    const [data, setData] = useState<FunnelData | null>(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch("/api/super-admin/orgs?limit=1");
                if (res.ok) {
                    const d = await res.json();
                    setData({
                        totalCandidates: d.stats.totalCandidates,
                        totalShortlisted: d.stats.totalShortlisted,
                        totalInterviewed: d.stats.totalInterviewed,
                    });
                }
            } catch (err) {
                console.error("Funnel sync failed", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);
    const stages = data ? [
        { key: "applied",     label: "Applied",     value: data.totalCandidates },
        { key: "shortlisted", label: "Shortlisted",  value: data.totalShortlisted },
        { key: "interviewed", label: "Interviewed",  value: data.totalInterviewed },
    ] : [];
    const maxVal = stages.length ? Math.max(...stages.map(s => s.value), 1) : 1;
    const conversionRate = data && data.totalCandidates > 0 
        ? ((data.totalInterviewed / data.totalCandidates) * 100).toFixed(1) 
        : "0.0";
    return (
        <div className="bg-white border border-gray-100 rounded-[2.5rem] p-8 shadow-sm flex flex-col h-full group hover:shadow-[0_20px_60px_rgba(0,0,0,0.04)] transition-all duration-500">
            <div className="flex items-start justify-between mb-8">
                <div className="space-y-1">
                    <h3 className="text-xl font-black text-gray-900 tracking-tight">Global Hiring Pipeline</h3>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Aggregate funnel across all organizations</p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Conversion</p>
                    <div className="flex items-center justify-end gap-1.5">
                        <TrendingUp className="h-4 w-4 text-[#F97316]" />
                        <span className="text-2xl font-black text-[#F97316] tracking-tighter">{conversionRate}%</span>
                    </div>
                </div>
            </div>
            {loading ? (
                <div className="flex-1 flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
                </div>
            ) : (
                <div className="flex-1 space-y-5">
                    {stages.map((stage, i) => {
                        const pct = Math.round((stage.value / maxVal) * 100);
                        const accentColor = STAGES[i].color;
                        return (
                            <div key={stage.key} className="flex items-center gap-4">
                                <div className="w-24 shrink-0">
                                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{stage.label}</p>
                                </div>
                                <div className="flex-1 bg-gray-50 rounded-2xl h-10 overflow-hidden relative border border-gray-100">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.max(pct, 5)}%` }}
                                        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] as any, delay: i * 0.1 }}
                                        className="h-full rounded-2xl flex items-center px-4"
                                        style={{ backgroundColor: accentColor }}
                                    >
                                        <span className="text-[11px] font-black text-white tabular-nums">{stage.value}</span>
                                    </motion.div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
