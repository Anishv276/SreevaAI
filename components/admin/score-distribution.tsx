"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import type { DateRange } from "./date-filter";
import { ErrorState } from "./error-state";
interface Band {
    label: string;
    min: number;
    max: number;
    color: string;
    tier: string;
    count: number;
}
interface DistributionData {
    total: number;
    distribution: Band[];
}
interface ScoreDistributionProps {
    dateRange: DateRange;
}
function buildUrl(range: DateRange) {
    const base = "/api/admin/score-distribution";
    if (range.type === "custom") return `${base}?range=custom&from=${range.from}&to=${range.to}`;
    return `${base}?range=${range.type}`;
}
const TIER_COLORS: Record<string, string> = {
    "Excellent": "#10B981",
    "Good": "#3B82F6",
    "Average": "#F59E0B",
    "Below threshold": "#EF4444",
};
export function ScoreDistribution({ dateRange }: ScoreDistributionProps) {
    const [data, setData] = useState<DistributionData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryKey, setRetryKey] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(buildUrl(dateRange), { signal });
                if (res.ok) {
                    const data = await res.json();
                    if (!signal.aborted) setData(data);
                } else {
                    if (!signal.aborted) setError("Score data synchronization failed.");
                }
            } catch (err: any) {
                if (err.name !== "AbortError") {
                    setError("Network connectivity issue.");
                }
            } finally {
                if (!signal.aborted) setLoading(false);
            }
        };
        fetchData();
        return () => controller.abort();
    }, [dateRange, retryKey]);
    const handleRetry = () => {
        setLoading(true);
        setError(null);
        setData(null);
        setRetryKey((k) => k + 1);
    };
    const maxCount = data
        ? Math.max(...data.distribution.map((b) => b.count), 1)
        : 1;
    const yMax = Math.ceil(maxCount / 20) * 20 || 20;
    const CHART_H = 220; 
    return (
        <div className="bg-white/40 backdrop-blur-xl rounded-[2.5rem] border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.02)] p-8 flex flex-col h-full overflow-hidden hover:shadow-[0_20px_60px_rgba(0,0,0,0.06)] transition-all duration-700">
            {/* Header */}
            <div className="flex items-start justify-between mb-8">
                <div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight text-premium leading-none mb-1">Score Matrix</h3>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-1">Cross-Band Distribution</p>
                </div>
                <div className="text-right">
                    {data && (
                        <div className="bg-gray-50/50 px-4 py-2 rounded-2xl border border-gray-100">
                            <p className="text-2xl font-black text-gray-900 leading-none tabular-nums tracking-tighter">{data.total}</p>
                            <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest leading-none">Scanned</p>
                        </div>
                    )}
                </div>
            </div>
            {/* Chart Area */}
            {loading ? (
                <div className="flex-1 flex items-center justify-center min-h-[250px]">
                    <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
                </div>
            ) : error ? (
                <div className="flex-1 flex items-center justify-center">
                    <ErrorState 
                        message={error} 
                        onRetry={handleRetry} 
                        compact 
                        className="bg-transparent border-none shadow-none"
                    />
                </div>
            ) : (
                <div className="flex-1 flex flex-col">
                    <div className="relative flex-1 flex items-end gap-3 pb-8 px-2" style={{ height: CHART_H }}>
                        {/* Y-axis Guides */}
                        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-8">
                            {[0, 25, 50, 75, 100].map((step) => (
                                <div key={step} className="w-full border-t border-gray-100/30 flex justify-end">
                                    <span className="text-[9px] font-black text-gray-300 pr-2 pt-1">{step}%</span>
                                </div>
                            ))}
                        </div>
                        {/* Bars with Staggered Motion */}
                        {data?.distribution.map((band, idx) => {
                            const barH = (band.count / yMax) * (CHART_H - 32);
                            const color = TIER_COLORS[band.tier] || band.color;
                            return (
                                <div key={band.label} className="flex-1 flex flex-col items-center justify-end group relative h-full">
                                    {/* Tooltip */}
                                    <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-20 scale-90 group-hover:scale-100">
                                        <div className="bg-gray-900 text-white text-[10px] font-black px-3 py-1.5 rounded-xl whitespace-nowrap shadow-xl">
                                            {band.count} Profiles
                                        </div>
                                        <div className="w-2 h-2 bg-gray-900 rotate-45 mx-auto -mt-1" />
                                    </div>
                                    {/* Bar Pillar */}
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: `${barH}px`, opacity: 1 }}
                                        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: idx * 0.1 }}
                                        className="w-full rounded-2xl relative shadow-lg group-hover:scale-x-105 transition-transform origin-bottom"
                                        style={{ backgroundColor: color }}
                                    >
                                        <div className="absolute top-0 left-0 right-0 h-1/2 bg-white/10 rounded-t-2xl" />
                                        {/* Label on bar if tall enough */}
                                        {barH > 40 && (
                                            <div className="absolute inset-x-0 bottom-2 flex justify-center">
                                                <span className="text-[10px] font-black text-white/40">{band.count}</span>
                                            </div>
                                        )}
                                    </motion.div>
                                    {/* X-Label */}
                                    <div className="absolute top-full mt-2 flex flex-col items-center">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter whitespace-nowrap">{band.label}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {/* Legend Chips */}
                    <div className="mt-8 flex flex-wrap gap-4 pt-4 border-t border-gray-100/50">
                        {Object.entries(TIER_COLORS).map(([tier, color]) => (
                            <div key={tier} className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{tier}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
