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
    initialData?: DistributionData | null;
}
function buildUrl(range: DateRange) {
    const base = "/api/admin/score-distribution";
    if (range.type === "custom") return `${base}?range=custom&from=${range.from}&to=${range.to}`;
    return `${base}?range=${range.type}`;
}
function rangeLabel(range: DateRange) {
    if (range.type === "today") return "Today";
    if (range.type === "week") return "This week";
    if (range.type === "month") return "This month";
    return "from" in range ? `${(range as any).from} – ${(range as any).to}` : "Custom";
}
const TIER_COLORS: Record<string, string> = {
    "Excellent (80-100)": "#8B5CF6", // Purple
    "Good (60-79)": "#06B6D4",       // Cyan/Teal
    "Average (40-59)": "#F59E0B",    // Orange
    "Below (0-39)": "#EF4444",       // Red
};
export function ScoreDistribution({ dateRange, initialData }: ScoreDistributionProps) {
    const [data, setData] = useState<DistributionData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryKey, setRetryKey] = useState(0);
    useEffect(() => {
        if (initialData) {
            setData(initialData);
            setLoading(false);
            setError(null);
            return;
        }
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
        <div className="bg-white rounded-2xl p-6 flex flex-col h-full border border-gray-100 shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <h3 className="text-lg font-bold text-gray-900 tracking-tight">Score Distribution</h3>
                <span className="text-xs font-medium text-gray-500 bg-gray-50 px-2.5 py-1 rounded-md border border-gray-200">
                    {rangeLabel(dateRange)}
                </span>
            </div>
            {/* Chart Area */}
            {loading ? (
                <div className="flex-1 flex items-center justify-center min-h-[250px]">
                    <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
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
            ) : data && data.total > 0 ? (
                <div className="flex-1 flex items-center justify-center gap-8 px-4">
                    {/* Donut Chart SVG */}
                    <div className="relative w-48 h-48 flex-shrink-0">
                        <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                            {data.distribution.map((band, idx) => {
                                const prevTotal = data.distribution.slice(0, idx).reduce((sum, b) => sum + b.count, 0);
                                const percentage = band.count / data.total;
                                const strokeDasharray = `${percentage * 251.2} 251.2`;
                                const strokeDashoffset = -(prevTotal / data.total) * 251.2;
                                return (
                                    <circle
                                        key={band.label}
                                        cx="50" cy="50" r="40"
                                        fill="transparent"
                                        stroke={TIER_COLORS[band.tier] || band.color}
                                        strokeWidth="15"
                                        strokeDasharray={strokeDasharray}
                                        strokeDashoffset={strokeDashoffset}
                                        className="transition-all duration-1000 ease-out hover:stroke-[18px] cursor-pointer"
                                    />
                                );
                            })}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                            <span className="text-3xl font-black text-gray-900 leading-none">{data.total}</span>
                            <span className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-wider">Candidates</span>
                        </div>
                    </div>
                    {/* Legend */}
                    <div className="flex flex-col gap-3 flex-1 min-w-[120px]">
                        {data.distribution.map((band) => {
                            const pct = Math.round((band.count / data.total) * 100);
                            return (
                                <div key={band.tier} className="flex items-center justify-between group">
                                    <div className="flex items-center gap-2">
                                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TIER_COLORS[band.tier] || band.color }} />
                                        <span className="text-[12px] font-semibold text-gray-700">{band.tier}</span>
                                    </div>
                                    <span className="text-[12px] font-bold text-gray-900 group-hover:text-purple-600 transition-colors">
                                        {pct}%
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                    <p className="text-sm font-medium">No score data available</p>
                </div>
            )}
            
            {/* Bottom info banner */}
            {!loading && !error && data && data.total > 0 && (
                <div className="mt-6 bg-blue-50/50 rounded-xl p-3 flex items-center justify-center border border-blue-100/50">
                    <p className="text-[11px] font-semibold text-blue-600 flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full border border-blue-200 flex items-center justify-center text-[9px]">i</span>
                        {Math.round(((data.distribution.find(d => d.tier === "Good (60-79)")?.count || 0) / data.total) * 100)}% of candidates scored between 60-79
                    </p>
                </div>
            )}
        </div>
    );
}
