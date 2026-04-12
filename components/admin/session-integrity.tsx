"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { DateRange } from "./date-filter";

import { motion, AnimatePresence } from "framer-motion";
import { ErrorState } from "./error-state";

interface Violation {
    key: string;
    abbr: string;
    title: string;
    description: string;
    count: number;
    severity: "high" | "medium" | "low";
}

interface IntegrityData {
    total: number;
    flagged: number;
    clean: number;
    lowRisk: number;
    review: number;
    integrityScore: number;
    violations: Violation[];
}

interface SessionIntegrityProps {
    dateRange: DateRange;
}

function buildUrl(range: DateRange) {
    const base = "/api/admin/integrity";
    if (range.type === "custom") return `${base}?range=custom&from=${range.from}&to=${range.to}`;
    return `${base}?range=${range.type}`;
}

// Donut ring SVG
function IntegrityDonut({ score }: { score: number }) {
    const r = 38;
    const cx = 50;
    const cy = 50;
    const circumference = 2 * Math.PI * r;
    const filled = (score / 100) * circumference;
    const gap = circumference - filled;

    const color = score >= 85 ? "#10B981" : score >= 70 ? "#F59E0B" : "#EF4444";

    return (
        <div className="relative flex items-center justify-center group">
            <svg width="100" height="100" viewBox="0 0 100 100" className="transform -rotate-90">
                {/* Background ring */}
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth="10" />
                {/* Score arc */}
                <motion.circle
                    initial={{ strokeDasharray: `0 ${circumference}` }}
                    animate={{ strokeDasharray: `${filled} ${gap}` }}
                    transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                    cx={cx} cy={cy} r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth="10"
                    strokeLinecap="round"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-black text-gray-900 leading-none">{score}%</span>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Health</span>
            </div>
            
            {/* Soft Glow */}
            <div 
                className="absolute inset-0 rounded-full blur-xl opacity-20 transition-opacity duration-700 group-hover:opacity-40"
                style={{ backgroundColor: color }}
            />
        </div>
    );
}

const SEVERITY_COLORS: Record<string, { bg: string, bar: string, text: string }> = {
    high:   { bg: "bg-red-50", bar: "#EF4444", text: "text-red-500" },
    medium: { bg: "bg-amber-50", bar: "#F59E0B", text: "text-amber-600" },
    low:    { bg: "bg-gray-50", bar: "#9CA3AF", text: "text-gray-400" },
};

export function SessionIntegrity({ dateRange }: SessionIntegrityProps) {
    const [data, setData] = useState<IntegrityData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(buildUrl(dateRange));
            if (res.ok) {
                setData(await res.json());
            } else {
                setError("Integrity data synchronization failed.");
            }
        } catch (err) {
            setError("Network connectivity issue.");
        } finally {
            setLoading(false);
        }
    }, [dateRange]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const maxCount = data ? Math.max(...data.violations.map(v => v.count), 1) : 1;

    return (
        <div className="bg-white/40 backdrop-blur-xl rounded-[2.5rem] border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.02)] overflow-hidden transition-all duration-700 hover:shadow-[0_20px_60px_rgba(0,0,0,0.06)] h-full flex flex-col">
            {/* ── Header ── */}
            <div className="px-8 py-6 border-b border-gray-100/50 flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight text-premium">Session Integrity</h3>
                    {data && (
                        <p className="text-[12px] font-bold text-gray-400 mt-1 uppercase tracking-widest">
                            Analyzing {data.total} Live Sessions
                        </p>
                    )}
                </div>
                {data && data.flagged > 0 && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="px-4 py-1.5 rounded-full bg-amber-50 border border-amber-100/50 text-[11px] font-black text-amber-600 shadow-sm"
                    >
                        {data.flagged} Critical Alerts
                    </motion.div>
                )}
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center min-h-[300px]">
                    <Loader2 className="h-8 w-8 text-orange-200 animate-spin" />
                </div>
            ) : error ? (
                <div className="flex-1 flex items-center justify-center p-8">
                    <ErrorState 
                        message={error} 
                        onRetry={fetchData} 
                        compact 
                        className="bg-transparent border-none shadow-none"
                    />
                </div>
            ) : !data ? null : (
                <div className="p-8 space-y-10 flex-1 flex flex-col">
                    {/* ── Score Overview ── */}
                    <div className="flex items-center gap-10 flex-wrap lg:flex-nowrap">
                        <IntegrityDonut score={data.integrityScore} />
                        
                        <div className="flex-1 min-w-[200px]">
                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { label: "Clean", value: data.clean, color: "emerald" },
                                    { label: "Review", value: data.review, color: "amber" },
                                    { label: "Flagged", value: data.flagged, color: "red" },
                                ].map((item) => (
                                    <div key={item.label} className="space-y-1">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{item.label}</p>
                                        <p className={`text-2xl font-black text-${item.color}-600 leading-none`}>{item.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── Violation Matrix ── */}
                    <div className="flex-1">
                        <motion.div 
                            initial="hidden"
                            animate="visible"
                            variants={{
                                hidden: { opacity: 0 },
                                visible: {
                                    opacity: 1,
                                    transition: { staggerChildren: 0.1 }
                                }
                            }}
                            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                        >
                            {data.violations.map((v) => {
                                const pct = Math.round((v.count / maxCount) * 100);
                                const style = SEVERITY_COLORS[v.severity];
                                return (
                                    <motion.div
                                        key={v.key}
                                        variants={{
                                            hidden: { opacity: 0, y: 10 },
                                            visible: { opacity: 1, y: 0 }
                                        }}
                                        className="group relative flex items-start gap-4 p-4 rounded-3xl bg-white border border-gray-50/50 hover:border-orange-100 transition-all duration-500 hover:shadow-[0_15px_30px_rgba(0,0,0,0.03)]"
                                    >
                                        {/* Abbr Hex */}
                                        <div className="h-10 w-10 rounded-2xl bg-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100 group-hover:bg-white group-hover:rotate-6 transition-all shadow-sm">
                                            <span className="text-[10px] font-black text-gray-400 tracking-tighter group-hover:text-orange-500 transition-colors uppercase">{v.abbr}</span>
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <p className="text-[13px] font-black text-gray-900 truncate leading-none">{v.title}</p>
                                                <span className={`text-[13px] font-black ${style.text} tabular-nums`}>{v.count}</span>
                                            </div>
                                            <p className="text-[11px] font-bold text-gray-400 leading-none mb-3 truncate">{v.description}</p>
                                            
                                            {/* Progress Bar */}
                                            <div className="h-1.5 bg-gray-50 rounded-full w-full overflow-hidden border border-gray-100/50">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${v.count > 0 ? pct : 0}%` }}
                                                    transition={{ duration: 1, ease: "easeOut" }}
                                                    className="h-full rounded-full"
                                                    style={{ backgroundColor: style.bar }}
                                                />
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </motion.div>
                    </div>

                    {/* ── Footer ── */}
                    {data.review > 0 && (
                        <div className="pt-2 flex justify-center">
                            <Link href="/admin/candidates?filter=flagged" className="w-full">
                                <button className="w-full flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-gray-900 text-[13px] font-black text-white hover:bg-orange-600 transition-all shadow-xl shadow-gray-200/50 active:scale-[0.98]">
                                    Analyze {data.review} High-Risk Sessions
                                    <ArrowUpRight className="h-4 w-4" />
                                </button>
                            </Link>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
