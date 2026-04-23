"use client";

import React, { useEffect, useState } from "react";
import { Crown, Zap, Check, ExternalLink, Coins, TrendingDown, Clock, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/admin/settings/settings-shared";

interface CreditStatus {
    creditsTotal: number;
    creditsUsed: number;
    creditsRemaining: number;
    minutesTotal: number;
    minutesUsed: number;
    minutesRemaining: number;
    hasSufficientCredits: boolean;
}

export function BillingContent() {
    const [credits, setCredits] = useState<CreditStatus | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/admin/credits")
            .then(r => r.json())
            .then(data => setCredits(data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const usedPct = credits && credits.creditsTotal > 0
        ? Math.min(100, Math.round((credits.creditsUsed / credits.creditsTotal) * 100))
        : 0;

    return (
        <div className="space-y-8 max-w-5xl">
            {/* Header */}
            <div className="flex items-center gap-4 group">
                <div className="h-12 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full shadow-[0_0_12px_rgba(249,115,22,0.4)] transition-all duration-300 group-hover:h-14" />
                <div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Billing & Credits</h1>
                    <p className="text-gray-500 font-medium mt-1 text-base">
                        Manage your interview credits and usage
                    </p>
                </div>
            </div>

            <div className="space-y-6">

                {/* Credits Overview */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Interview Credits</h2>
                            <p className="text-sm text-gray-500 font-medium mt-1">
                                0.2 credits per minute · 5 min = 1 credit · deducted at interview end (second-precision)
                            </p>
                        </div>
                        {credits && !credits.hasSufficientCredits && credits.creditsTotal > 0 && (
                            <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg bg-red-50 border border-red-100 text-red-500 animate-pulse">
                                Out of Credits
                            </span>
                        )}
                    </div>

                    <div className="px-6 py-6">
                        {loading ? (
                            <div className="grid grid-cols-5 gap-4">
                                {[1, 2, 3, 4, 5].map(i => (
                                    <div key={i} className="h-32 rounded-xl bg-gray-100 animate-pulse" />
                                ))}
                            </div>
                        ) : credits && credits.creditsTotal === 0 ? (
                            <div className="py-10 text-center">
                                <Coins className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                                <p className="text-sm font-bold text-gray-400">No credits allocated yet.</p>
                                <p className="text-xs text-gray-400 mt-1">Contact your super admin to add credits.</p>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-5 gap-4">

                                    {/* Total Credits */}
                                    <div className="p-5 rounded-xl border border-amber-100 bg-amber-50 shadow-sm">
                                        <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center mb-4">
                                            <Coins className="h-4 w-4 text-amber-600" />
                                        </div>
                                        <p className="text-2xl font-black text-gray-900 tabular-nums leading-none">
                                            {(credits?.creditsTotal ?? 0).toFixed(2)}
                                        </p>
                                        <p className="text-[11px] font-bold text-gray-400 mt-2 uppercase tracking-widest">Total Credits</p>
                                        <p className="text-[10px] text-amber-600 font-semibold mt-1">{credits?.minutesTotal ?? 0} min allocated</p>
                                    </div>

                                    {/* Credits Used */}
                                    <div className="p-5 rounded-xl border border-gray-100 bg-white shadow-sm">
                                        <div className="h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center mb-4">
                                            <TrendingDown className="h-4 w-4 text-gray-500" />
                                        </div>
                                        <p className="text-2xl font-black text-gray-900 tabular-nums leading-none">
                                            {(credits?.creditsUsed ?? 0).toFixed(2)}
                                        </p>
                                        <p className="text-[11px] font-bold text-gray-400 mt-2 uppercase tracking-widest">Credits Used</p>
                                        <p className="text-[10px] text-gray-400 font-semibold mt-1">{credits?.minutesUsed ?? 0} min consumed</p>
                                    </div>

                                    {/* Credits Remaining */}
                                    <div className={`p-5 rounded-xl border shadow-sm ${(credits?.creditsRemaining ?? 0) > 0 ? "border-emerald-100 bg-emerald-50" : "border-red-100 bg-red-50"}`}>
                                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center mb-4 ${(credits?.creditsRemaining ?? 0) > 0 ? "bg-emerald-100" : "bg-red-100"}`}>
                                            <Coins className={`h-4 w-4 ${(credits?.creditsRemaining ?? 0) > 0 ? "text-emerald-600" : "text-red-500"}`} />
                                        </div>
                                        <p className="text-2xl font-black text-gray-900 tabular-nums leading-none">
                                            {(credits?.creditsRemaining ?? 0).toFixed(2)}
                                        </p>
                                        <p className="text-[11px] font-bold text-gray-400 mt-2 uppercase tracking-widest">Credits Remaining</p>
                                        <p className={`text-[10px] font-semibold mt-1 ${(credits?.creditsRemaining ?? 0) > 0 ? "text-emerald-600" : "text-red-500"}`}>
                                            {(credits?.creditsRemaining ?? 0) > 0 ? "available to use" : "recharge needed"}
                                        </p>
                                    </div>

                                    {/* Minutes Remaining */}
                                    <div className={`p-5 rounded-xl border shadow-sm ${(credits?.minutesRemaining ?? 0) > 0 ? "border-blue-100 bg-blue-50" : "border-red-100 bg-red-50"}`}>
                                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center mb-4 ${(credits?.minutesRemaining ?? 0) > 0 ? "bg-blue-100" : "bg-red-100"}`}>
                                            <Clock className={`h-4 w-4 ${(credits?.minutesRemaining ?? 0) > 0 ? "text-blue-600" : "text-red-500"}`} />
                                        </div>
                                        <p className="text-2xl font-black text-gray-900 tabular-nums leading-none">
                                            {credits?.minutesRemaining ?? 0}
                                        </p>
                                        <p className="text-[11px] font-bold text-gray-400 mt-2 uppercase tracking-widest">Minutes Remaining</p>
                                        <p className={`text-[10px] font-semibold mt-1 ${(credits?.minutesRemaining ?? 0) > 0 ? "text-blue-600" : "text-red-500"}`}>
                                            of interview time left
                                        </p>
                                    </div>

                                    {/* Consumed % */}
                                    <div className="p-5 rounded-xl border border-gray-100 bg-white shadow-sm">
                                        <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center mb-4">
                                            <BarChart3 className="h-4 w-4 text-blue-500" />
                                        </div>
                                        <p className="text-2xl font-black text-gray-900 tabular-nums leading-none">{usedPct}%</p>
                                        <p className="text-[11px] font-bold text-gray-400 mt-2 uppercase tracking-widest">Consumed</p>
                                        <p className="text-[10px] text-gray-400 font-semibold mt-1">{100 - usedPct}% still available</p>
                                    </div>

                                </div>

                                {/* Progress bar */}
                                <div className="mt-5 space-y-1.5">
                                    <div className="flex justify-between text-[11px] font-bold text-gray-400">
                                        <span>{credits?.minutesUsed ?? 0} min used</span>
                                        <span>{credits?.minutesTotal ?? 0} min total</span>
                                    </div>
                                    <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-700"
                                            style={{
                                                width: `${usedPct}%`,
                                                background: usedPct >= 100 ? "#EF4444" : usedPct > 80 ? "#F97316" : "#10B981"
                                            }}
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* How Credits Work */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-100">
                        <h2 className="text-lg font-bold text-gray-900">How Credits Work</h2>
                    </div>
                    <div className="px-6 py-6">
                        <div className="grid grid-cols-3 gap-4">
                            {[
                                { label: "Rate", value: "0.2 / min", desc: "5 min = 1.0 credit", icon: Coins, color: "text-amber-600", bg: "bg-amber-50" },
                                { label: "Precision", value: "Per Second", desc: "4m 10s = 0.83, 5m 01s = 1.00", icon: Clock, color: "text-blue-600", bg: "bg-blue-50" },
                                { label: "Deducted", value: "Auto", desc: "at interview completion", icon: Zap, color: "text-purple-600", bg: "bg-purple-50" },
                            ].map(({ label, value, desc, icon: Icon, color, bg }) => (
                                <div key={label} className="p-5 rounded-xl border border-gray-100 bg-white">
                                    <div className={`h-10 w-10 rounded-lg ${bg} flex items-center justify-center mb-3`}>
                                        <Icon className={`h-5 w-5 ${color}`} />
                                    </div>
                                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">{label}</p>
                                    <p className="text-xl font-black text-gray-900 mt-1">{value}</p>
                                    <p className="text-xs text-gray-400 font-medium mt-1">{desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <SettingsCard
                    title="Need More Credits?"
                    description="Contact your administrator to recharge credits and continue running interviews."
                    icon={Crown}
                >
                    <div className="grid grid-cols-2 gap-y-4 gap-x-8 mb-8">
                        {[
                            "Instant credit top-up",
                            "No subscription required",
                            "Pay-as-you-go model",
                            "Usage tracked per interview",
                            "Auto-deducted at completion",
                            "Full audit trail",
                        ].map(feat => (
                            <div key={feat} className="flex items-center gap-3">
                                <div className="h-6 w-6 rounded-lg bg-gray-900 flex items-center justify-center flex-shrink-0">
                                    <Check className="h-3.5 w-3.5 text-white" />
                                </div>
                                <span className="text-sm font-medium text-gray-600">{feat}</span>
                            </div>
                        ))}
                    </div>
                    <Button className="h-11 px-8 rounded-lg bg-[#F97316] hover:bg-orange-600 text-white font-bold shadow-md transition-all">
                        Contact Admin to Recharge <ExternalLink className="h-4 w-4 ml-2.5" />
                    </Button>
                </SettingsCard>

            </div>
        </div>
    );
}
