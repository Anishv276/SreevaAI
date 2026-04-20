"use client";

import React from "react";
import { 
    CreditCard, Crown, BarChart3, Zap, Users, Check, ExternalLink 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SettingsCard } from "@/components/admin/settings/settings-shared";

export function BillingContent() {
    return (
        <div className="space-y-8 max-w-5xl">
            {/*  Header  */}
            <div className="flex items-center gap-4 group">
                <div className="h-12 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full shadow-[0_0_12px_rgba(249,115,22,0.4)] transition-all duration-300 group-hover:h-14" />
                <div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Billing & Plans</h1>
                    <p className="text-gray-500 font-medium mt-1 text-base">
                        Manage your subscription and view usage
                    </p>
                </div>
            </div>

            <div className="space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-100">
                        <h2 className="text-lg font-bold text-gray-900">Current Plan</h2>
                        <p className="text-sm text-gray-500 font-medium mt-1">Your active subscription and usage details.</p>
                    </div>
                    <div className="px-6 py-6">
                        <div className="relative flex items-center justify-between p-6 rounded-xl bg-gradient-to-br from-slate-800 to-slate-950 text-white overflow-hidden shadow-md">
                            <div className="absolute -right-6 -top-6 h-36 w-36 rounded-full bg-white/[0.03] pointer-events-none" />
                            <div className="flex items-center gap-4 relative z-10">
                                <div className="h-12 w-12 rounded-xl bg-white/10 border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                                    <Crown className="h-6 w-6 text-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.4)]" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-xl tracking-tight">Pro Plan</p>
                                        <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 bg-emerald-500/20 border border-emerald-400/20 rounded-lg text-emerald-400">Active</span>
                                    </div>
                                    <p className="text-slate-400 text-xs font-medium mt-1">Billed monthly · Renews Mar 20, 2026</p>
                                </div>
                            </div>
                            <div className="text-right relative z-10">
                                <p className="font-bold text-3xl tracking-tight tabular-nums">$49</p>
                                <p className="text-slate-400 text-xs font-medium mt-1">per month</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mt-4">
                            {[
                                { label: "Next Invoice", value: "Mar 20, 2026" },
                                { label: "Payment", value: "•••• 4242" },
                                { label: "Status", value: "Paid" },
                            ].map(({ label, value }) => (
                                <div key={label} className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
                                    <p className="text-sm font-bold text-gray-900 mt-1.5 tracking-tight">{value}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Usage Overview</h2>
                            <p className="text-sm text-gray-500 font-medium mt-1">Quota utilization for the current cycle</p>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-gray-500">Feb 2026 Cycle</span>
                    </div>
                    <div className="px-6 py-6">
                        <div className="grid grid-cols-3 gap-4">
                            {[
                                { label: "Active Drives", used: 4, max: 10, icon: BarChart3, accent: "#F97316", bg: "bg-orange-50", text: "text-[#F97316]" },
                                { label: "AI Screenings", used: 230, max: 500, icon: Zap, accent: "#8B5CF6", bg: "bg-violet-50", text: "text-violet-600" },
                                { label: "Team Members", used: 3, max: 10, icon: Users, accent: "#10B981", bg: "bg-emerald-50", text: "text-emerald-600" },
                            ].map(({ label, used, max, icon: Icon, accent, bg, text }) => {
                                const pct = Math.round((used / max) * 100);
                                return (
                                    <div key={label} className="relative p-5 rounded-xl border border-gray-100 bg-white hover:border-[#F97316]/30 transition-all duration-300 group overflow-hidden shadow-sm">
                                        <div className={`h-10 w-10 rounded-lg ${bg} flex items-center justify-center mb-4 shadow-sm`}>
                                            <Icon className={`h-5 w-5 ${text}`} />
                                        </div>
                                        <p className="text-3xl font-bold text-gray-900 leading-none tracking-tight tabular-nums">{used}</p>
                                        <p className="text-xs font-semibold text-gray-400 mt-2 uppercase tracking-widest">{label.split(" ")[0]} <span className="opacity-40">/ {max}</span></p>
                                        <div className="mt-4 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: accent }} />
                                        </div>
                                        <p className={`text-[10px] font-bold mt-2 ${text} uppercase tracking-widest`}>{pct}% utilized</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <SettingsCard 
                    title="Enterprise Solutions" 
                    description="Unlock global hiring infrastructure and dedicated support."
                    icon={Crown}
                >
                    <div className="grid grid-cols-2 gap-y-4 gap-x-8 mb-8">
                        {[
                            "Unlimited recruitment drives", 
                            "Unlimited AI screenings", 
                            "Up to 50 team members", 
                            "Priority support & SLA", 
                            "Custom integrations", 
                            "White-labeled portal"
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
                        Elevate to Enterprise <ExternalLink className="h-4 w-4 ml-2.5" />
                    </Button>
                </SettingsCard>
            </div>
        </div>
    );
}
