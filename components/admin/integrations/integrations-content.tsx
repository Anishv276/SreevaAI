"use client";

import React, { useState, useEffect } from "react";
import {
    Mail, Globe, Check, Copy, AlertCircle, Loader2, Zap, Trash2, History, ChevronLeft, Plus, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import { toast } from "@/components/ui/toast-custom";
import { motion, AnimatePresence } from "framer-motion";

type ActivePanel = null | "gmail" | "domain";

export function IntegrationsContent() {
    const { user } = useAuth();
    const [isLoading, setIsLoading] = useState(true);
    const [activePanel, setActivePanel] = useState<ActivePanel>(null);

    /* Company/Org Profile */
    const [company, setCompany] = useState({ customSenderEmail: "", customSenderName: "" });

    /* Google Integration */
    const [googleStatus, setGoogleStatus] = useState<{ isConnected: boolean; email: string | null }>({ isConnected: false, email: null });

    /* Domain Integration */
    const [domainInfo, setDomainInfo] = useState<any>(null);
    const [isLoadingDomain, setIsLoadingDomain] = useState(false);
    const [newDomain, setNewDomain] = useState("");
    const [copiedIndex, setCopiedIndex] = useState<{ i: number; type: "host" | "value" } | null>(null);
    const [emailSubStep, setEmailSubStep] = useState(0);
    const [domainLinkError, setDomainLinkError] = useState("");
    const [isEditingSender, setIsEditingSender] = useState(false);
    const [senderDraft, setSenderDraft] = useState({ localPart: "", name: "" });
    const [domainCheckResult, setDomainCheckResult] = useState<"checking" | "verified" | "pending" | "error" | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const fetchGoogleStatus = async () => {
        try {
            const res = await fetch("/api/admin/integrations/google");
            if (res.ok) setGoogleStatus(await res.json());
        } catch (err) { console.error("Failed to fetch Google status:", err); }
    };

    const fetchDomainInfo = async (showResult = false) => {
        setIsLoadingDomain(true);
        if (showResult) setDomainCheckResult("checking");
        try {
            const res = await fetch("/api/admin/organization/domain");
            const data = await res.json();
            if (!res.ok) { if (showResult) setDomainCheckResult("error"); return; }
            if (!data.customDomain) {
                setDomainInfo(null); setEmailSubStep(0);
                if (showResult) setDomainCheckResult(null);
            } else {
                setDomainInfo(data);
                const isVerified = data.isDomainVerified || data.resendStatus === "verified";
                setEmailSubStep(isVerified ? 2 : 1);
                if (showResult) setDomainCheckResult(isVerified ? "verified" : "pending");
            }
        } catch (err) { if (showResult) setDomainCheckResult("error"); }
        finally { setIsLoadingDomain(false); }
    };

    const fetchOrgData = async () => {
        try {
            const res = await fetch("/api/admin/organization");
            if (res.ok) {
                const data = await res.json();
                setCompany({ customSenderEmail: data.customSenderEmail || "", customSenderName: data.customSenderName || "" });
            }
        } catch (err) { console.error("Org data fetch failed:", err); }
    };

    useEffect(() => {
        const fetchAll = async () => {
            setIsLoading(true);
            try { await Promise.allSettled([fetchOrgData(), fetchGoogleStatus(), fetchDomainInfo()]); }
            finally { setIsLoading(false); }
        };
        if (user) fetchAll();

        const handleHash = () => {
            const hash = window.location.hash;
            if (hash === "#domain-section") setActivePanel("domain");
            else if (hash === "#gmail-section") setActivePanel("gmail");
            else if (!hash || hash === "#") setActivePanel(null);
        };
        handleHash();
        window.addEventListener("hashchange", handleHash);
        return () => window.removeEventListener("hashchange", handleHash);
    }, [user]);

    const handleCopy = (text: string, i: number, type: "host" | "value") => {
        navigator.clipboard.writeText(text);
        setCopiedIndex({ i, type });
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const verifyDns = async () => {
        setIsLoadingDomain(true);
        setDomainCheckResult("checking");
        try {
            const res = await fetch("/api/admin/organization/domain", { method: "POST" });
            const data = await res.json();
            if (!res.ok) { setDomainCheckResult("error"); return; }
            setDomainInfo(data);
            const isVerified = data.isDomainVerified || data.resendStatus === "verified";
            setEmailSubStep(isVerified ? 2 : 1);
            setDomainCheckResult(isVerified ? "verified" : "pending");
        } catch { setDomainCheckResult("error"); }
        finally { setIsLoadingDomain(false); }
    };

    const toggle = (panel: ActivePanel) => {
        const next = activePanel === panel ? null : panel;
        setActivePanel(next);
        window.location.hash = next === "gmail" ? "gmail-section" : next === "domain" ? "domain-section" : "";
    };

    if (isLoading) {
        return (
            <div className="flex h-[450px] items-center justify-center">
                <Loader2 className="h-8 w-8 text-[#F97316] animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-8 max-w-4xl pb-16">
            {/* Page Header */}
            <div className="flex items-center gap-4 group">
                <div className="h-12 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full shadow-[0_0_12px_rgba(249,115,22,0.4)] transition-all duration-300 group-hover:h-14" />
                <div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Integrations</h1>
                    <p className="text-gray-500 font-medium mt-1 text-base">Connect your tools for a seamless recruitment workflow</p>
                </div>
            </div>

            {/* Integration Rows */}
            <div className="space-y-4">

                {/* ── GMAIL ROW ── */}
                <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                    {/* Header row */}
                    <button
                        onClick={() => toggle("gmail")}
                        className="w-full flex items-center justify-between px-6 py-5 hover:bg-gray-50/70 transition-colors group"
                    >
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "h-11 w-11 rounded-xl flex items-center justify-center border transition-all duration-300",
                                activePanel === "gmail"
                                    ? "bg-orange-50 border-orange-100"
                                    : "bg-gray-50 border-gray-100 group-hover:bg-orange-50 group-hover:border-orange-100"
                            )}>
                                <Mail className={cn("h-5 w-5 transition-colors", activePanel === "gmail" ? "text-[#F97316]" : "text-gray-400 group-hover:text-[#F97316]")} />
                            </div>
                            <div className="text-left">
                                <h3 className="text-[16px] font-bold text-gray-900">Connect to Gmail</h3>
                                <p className="text-[13px] text-gray-400 font-medium mt-0.5">
                                    {googleStatus.isConnected
                                        ? <span className="text-green-600 font-bold">● Connected — {googleStatus.email}</span>
                                        : "Send emails via your Google account"}
                                </p>
                            </div>
                        </div>
                        <div className={cn(
                            "h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 border",
                            activePanel === "gmail"
                                ? "bg-gray-900 border-gray-900 text-white rotate-45"
                                : "bg-white border-gray-200 text-gray-400 group-hover:bg-[#F97316] group-hover:border-[#F97316] group-hover:text-white"
                        )}>
                            <Plus className="h-4 w-4" />
                        </div>
                    </button>

                    {/* Gmail panel */}
                    <AnimatePresence>
                        {activePanel === "gmail" && (
                            <motion.div
                                key="gmail-panel"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: "easeInOut" }}
                                className="overflow-hidden"
                            >
                                <div className="px-6 pb-6 border-t border-gray-100 pt-6 space-y-6">
                                    {/* Google OAuth block */}
                                    <div className="flex flex-col md:flex-row items-start lg:items-center justify-between gap-6 p-6 rounded-2xl bg-gray-50/50 border border-gray-100">
                                        <div className="flex gap-4">
                                            <div className="w-14 h-14 rounded-xl bg-white shadow-sm flex items-center justify-center border border-gray-100 shrink-0">
                                                <svg className="w-7 h-7" viewBox="0 0 24 24">
                                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h4 className="text-[15px] font-bold text-gray-900">Gmail API</h4>
                                                <p className="text-[13px] leading-relaxed text-gray-500 max-w-sm mt-0.5">
                                                    Emails sent via Gmail have better deliverability and appear in your Sent folder automatically.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="shrink-0">
                                            {googleStatus.isConnected ? (
                                                <div className="flex flex-col items-end gap-3">
                                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-100">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                                        <span className="text-[12px] font-bold text-green-700">{googleStatus.email}</span>
                                                    </div>
                                                    <button
                                                        onClick={async () => {
                                                            if (confirm("Disconnect Google Integration?")) {
                                                                await fetch("/api/admin/integrations/google", { method: "DELETE" });
                                                                fetchGoogleStatus();
                                                            }
                                                        }}
                                                        className="text-[12px] font-bold text-red-500 hover:text-red-600 transition-colors"
                                                    >
                                                        Disconnect
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => { window.location.href = "/api/admin/integrations/google/authorize"; }}
                                                    className="h-11 px-6 rounded-xl bg-gray-900 text-white text-[13px] font-bold hover:bg-black transition-all shadow-md active:scale-[0.98]"
                                                >
                                                    Connect Gmail
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Info tiles */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="p-4 rounded-xl bg-blue-50/40 border border-blue-100/60">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                                                    <Zap className="w-3.5 h-3.5 text-blue-600" />
                                                </div>
                                                <h5 className="text-[13px] font-bold text-blue-900">Better Deliverability</h5>
                                            </div>
                                            <p className="text-[12px] text-blue-800/70 leading-relaxed">Emails end up in inbox, not spam, when sent via Gmail.</p>
                                        </div>
                                        <div className="p-4 rounded-xl bg-orange-50/40 border border-orange-100/60">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center">
                                                    <History className="w-3.5 h-3.5 text-orange-600" />
                                                </div>
                                                <h5 className="text-[13px] font-bold text-orange-900">Sent Folder Sync</h5>
                                            </div>
                                            <p className="text-[12px] text-orange-800/70 leading-relaxed">All platform emails appear in your Gmail Sent folder.</p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ── DOMAIN ROW ── */}
                <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                    {/* Header row */}
                    <button
                        onClick={() => toggle("domain")}
                        className="w-full flex items-center justify-between px-6 py-5 hover:bg-gray-50/70 transition-colors group"
                    >
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "h-11 w-11 rounded-xl flex items-center justify-center border transition-all duration-300",
                                activePanel === "domain"
                                    ? "bg-orange-50 border-orange-100"
                                    : "bg-gray-50 border-gray-100 group-hover:bg-orange-50 group-hover:border-orange-100"
                            )}>
                                <Globe className={cn("h-5 w-5 transition-colors", activePanel === "domain" ? "text-[#F97316]" : "text-gray-400 group-hover:text-[#F97316]")} />
                            </div>
                            <div className="text-left">
                                <h3 className="text-[16px] font-bold text-gray-900">Connect to Domain</h3>
                                <p className="text-[13px] text-gray-400 font-medium mt-0.5">
                                    {domainInfo
                                        ? emailSubStep === 2
                                            ? <span className="text-emerald-600 font-bold">● Verified — {domainInfo.customDomain}</span>
                                            : <span className="text-amber-600 font-bold">● Pending — {domainInfo.customDomain}</span>
                                        : "White-label emails with your business domain"}
                                </p>
                            </div>
                        </div>
                        <div className={cn(
                            "h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 border",
                            activePanel === "domain"
                                ? "bg-gray-900 border-gray-900 text-white rotate-45"
                                : "bg-white border-gray-200 text-gray-400 group-hover:bg-[#F97316] group-hover:border-[#F97316] group-hover:text-white"
                        )}>
                            <Plus className="h-4 w-4" />
                        </div>
                    </button>

                    {/* Domain panel */}
                    <AnimatePresence>
                        {activePanel === "domain" && (
                            <motion.div
                                key="domain-panel"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: "easeInOut" }}
                                className="overflow-hidden"
                            >
                                <div className="px-6 pb-6 border-t border-gray-100 pt-6">
                                    {!domainInfo ? (
                                        /* ── Step 0: Enter domain ── */
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-3">
                                                <span className="w-1.5 h-7 bg-[#F97316] rounded-full" />
                                                <h4 className="text-[12px] font-bold uppercase tracking-widest text-gray-500">Register New Domain</h4>
                                            </div>
                                            <div className="flex gap-3">
                                                <div className="relative flex-1">
                                                    <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                                    <Input
                                                        className="pl-10 h-12 rounded-xl border-gray-200 bg-white font-bold text-[13px] focus:ring-2 focus:ring-orange-100 focus:border-[#F97316] placeholder:font-medium placeholder:text-gray-300 transition-all"
                                                        placeholder="yourdomain.com"
                                                        value={newDomain}
                                                        onChange={e => { setNewDomain(e.target.value.toLowerCase()); setDomainLinkError(""); }}
                                                    />
                                                </div>
                                                <Button
                                                    disabled={isLoadingDomain || !newDomain}
                                                    onClick={async () => {
                                                        setIsLoadingDomain(true); setDomainLinkError("");
                                                        try {
                                                            const res = await fetch("/api/admin/setup/domain", {
                                                                method: "POST",
                                                                headers: { "Content-Type": "application/json" },
                                                                body: JSON.stringify({ domain: newDomain })
                                                            });
                                                            const json = await res.json();
                                                            if (res.ok) { fetchDomainInfo(); }
                                                            else { setDomainLinkError(json.error || "Failed to link domain."); }
                                                        } finally { setIsLoadingDomain(false); }
                                                    }}
                                                    className="h-12 px-8 rounded-xl bg-gray-950 text-white hover:bg-black transition-all font-bold text-[11px] uppercase tracking-widest disabled:opacity-30"
                                                >
                                                    {isLoadingDomain ? <Loader2 className="h-4 w-4 animate-spin" /> : "Link Domain"}
                                                </Button>
                                            </div>
                                            {domainLinkError && (
                                                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
                                                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                                                    <p className="text-[11px] font-bold text-red-600">{domainLinkError}</p>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        /* ── Domain registered ── */
                                        <div className="space-y-6">
                                            {/* Domain status card */}
                                            <div className="flex items-center justify-between p-5 rounded-2xl bg-gradient-to-r from-gray-900 via-gray-800 to-gray-950 text-white shadow-xl relative overflow-hidden">
                                                <div className="flex items-center gap-5 relative z-10">
                                                    <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center border border-white/10">
                                                        <Globe className="h-6 w-6 text-white" />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-lg font-black uppercase italic">{domainInfo.customDomain}</p>
                                                            <Badge className={cn("text-[8px] font-black uppercase px-2 py-0.5 border-0 rounded-md tracking-widest",
                                                                emailSubStep === 2 ? "bg-emerald-500 text-white" : "bg-orange-500 text-white"
                                                            )}>
                                                                {emailSubStep === 2 ? "Verified" : "Pending"}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-[10px] uppercase font-bold text-gray-400 mt-1 tracking-widest">Registered via this platform</p>
                                                    </div>
                                                </div>
                                                <div className="relative z-10 flex items-center gap-2">
                                                    {emailSubStep === 2 && company.customSenderEmail && (
                                                        <button
                                                            onClick={() => { setSenderDraft({ localPart: company.customSenderEmail.split("@")[0], name: company.customSenderName }); setIsEditingSender(v => !v); }}
                                                            className="h-9 px-3 flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-all text-white text-[10px] font-bold uppercase tracking-widest"
                                                        >
                                                            <Mail className="h-3 w-3" />
                                                            {isEditingSender ? "Cancel" : "Edit Sender"}
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={async () => {
                                                            if (confirm("Unlink this domain?")) {
                                                                const res = await fetch("/api/admin/organization/domain", { method: "DELETE" });
                                                                if (res.ok) { fetchDomainInfo(); toast.success("Domain unlinked."); }
                                                            }
                                                        }}
                                                        className="h-9 w-9 flex items-center justify-center rounded-lg bg-white/10 hover:bg-red-500 transition-all text-white/50 hover:text-white"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Step 1: DNS records */}
                                            {emailSubStep === 1 && domainInfo.records && (
                                                <div className="space-y-4">
                                                    <div className="border-l-2 border-[#F97316] pl-4">
                                                        <h4 className="text-xs font-bold text-gray-900 uppercase tracking-tight">DNS Handshake Required</h4>
                                                        <p className="text-[11px] text-gray-400 font-medium mt-0.5">Add these records to your DNS provider, then click Verify DNS.</p>
                                                    </div>
                                                    <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                                                        <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex text-[10px] font-bold uppercase text-gray-500 tracking-widest">
                                                            <div className="w-[10%]">Type</div>
                                                            <div className="w-[22%]">Host</div>
                                                            <div className="flex-1">Value</div>
                                                            <div className="w-[10%] text-center">Priority</div>
                                                            <div className="w-[14%] text-center">Status</div>
                                                        </div>
                                                        <div className="divide-y divide-gray-50 max-h-[350px] overflow-y-auto">
                                                            {domainInfo.records.map((rec: any, i: number) => (
                                                                <div key={i} className="flex items-start px-4 py-3 hover:bg-orange-50/10 transition-all">
                                                                    <div className="w-[10%] pt-1.5">
                                                                        <Badge className="bg-gray-900 text-white border-0 text-[9px] font-black italic px-2 py-0.5 rounded">{rec.type}</Badge>
                                                                    </div>
                                                                    <div className="w-[22%] pr-3">
                                                                        <div onClick={() => handleCopy(rec.name || "@", i, "host")} className="flex min-h-[30px] w-full items-center justify-between gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] cursor-pointer hover:border-[#F97316]/50 group/host">
                                                                            <span className="font-bold break-all uppercase">{rec.name || "@"}</span>
                                                                            {copiedIndex?.i === i && copiedIndex?.type === "host" ? <Check className="h-3 w-3 text-emerald-500 shrink-0" /> : <Copy className="h-3 w-3 text-gray-300 opacity-0 group-hover/host:opacity-100 shrink-0" />}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex-1 pr-3 min-w-0">
                                                                        <div onClick={() => handleCopy(rec.value, i, "value")} className="flex min-h-[30px] w-full items-start justify-between gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[11px] cursor-pointer hover:border-[#F97316]/50 group/val">
                                                                            <span className="font-medium break-all leading-relaxed">{rec.value}</span>
                                                                            {copiedIndex?.i === i && copiedIndex?.type === "value" ? <Check className="h-3 w-3 mt-0.5 text-emerald-500 shrink-0" /> : <Copy className="h-3 w-3 mt-0.5 text-gray-300 opacity-0 group-hover/val:opacity-100 shrink-0" />}
                                                                        </div>
                                                                    </div>
                                                                    <div className="w-[10%] pt-1.5 text-center text-[10px] font-black text-gray-400 italic">{rec.priority ?? "—"}</div>
                                                                    <div className="w-[14%] pt-1.5 flex justify-center">
                                                                        {rec.status === "verified" ? (
                                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-emerald-100 text-emerald-700 border border-emerald-200"><Check className="h-2.5 w-2.5" /> OK</span>
                                                                        ) : (
                                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-amber-100 text-amber-700 border border-amber-200">Pending</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3 flex-wrap">
                                                        <Button onClick={verifyDns} disabled={isLoadingDomain} className="h-10 px-6 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 text-gray-900 font-bold text-[10px] uppercase tracking-widest shadow-sm flex items-center gap-2">
                                                            {isLoadingDomain ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3 text-[#F97316]" />}
                                                            {isLoadingDomain ? "Verifying..." : "Verify DNS"}
                                                        </Button>
                                                        {domainCheckResult === "checking" && <span className="text-[11px] font-bold text-blue-600">Triggering verification…</span>}
                                                        {domainCheckResult === "verified" && <span className="text-[11px] font-bold text-emerald-600">✓ Domain verified!</span>}
                                                        {domainCheckResult === "error" && <span className="text-[11px] font-bold text-red-600">Verification failed.</span>}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Step 2: Sender Identity */}
                                            {emailSubStep === 2 && (() => {
                                                const hasSender = !!(company.customSenderEmail && company.customSenderName);
                                                const showForm = !hasSender || isEditingSender;
                                                return (
                                                    <div className="space-y-4">
                                                        {showForm && (
                                                            <div className="space-y-4 p-5 rounded-2xl bg-gray-50 border border-gray-100">
                                                                <div className="border-l-2 border-emerald-500 pl-4">
                                                                    <h4 className="text-xs font-bold text-gray-900 uppercase tracking-tight">{hasSender ? "Update Sender Identity" : "Set Sender Identity"}</h4>
                                                                    <p className="text-[11px] text-gray-400 font-medium mt-0.5">This name and email will appear on all outgoing emails.</p>
                                                                </div>
                                                                <div className="space-y-3">
                                                                    <div className="space-y-1.5">
                                                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Sender Name</label>
                                                                        <input className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] font-medium focus:border-[#F97316] outline-none transition-all" placeholder="Your Company" value={senderDraft.name} onChange={e => setSenderDraft(p => ({ ...p, name: e.target.value }))} />
                                                                    </div>
                                                                    <div className="space-y-1.5">
                                                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Sender Email</label>
                                                                        <div className="flex gap-2">
                                                                            <input className="h-11 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-[14px] font-medium outline-none transition-all" placeholder="careers" value={senderDraft.localPart} onChange={e => setSenderDraft(p => ({ ...p, localPart: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "").split("@")[0] }))} />
                                                                            <div className="flex items-center px-4 bg-gray-100 rounded-xl border text-[13px] font-bold whitespace-nowrap">@{domainInfo.customDomain}</div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-3">
                                                                    <Button disabled={isSaving || !senderDraft.localPart || !senderDraft.name}
                                                                        onClick={async () => {
                                                                            const finalEmail = `${senderDraft.localPart}@${domainInfo.customDomain}`;
                                                                            setIsSaving(true);
                                                                            try {
                                                                                await fetch("/api/admin/organization", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customSenderEmail: finalEmail, customSenderName: senderDraft.name }) });
                                                                                setCompany(p => ({ ...p, customSenderEmail: finalEmail, customSenderName: senderDraft.name }));
                                                                                setSaved(true); setTimeout(() => setSaved(false), 2500); setIsEditingSender(false);
                                                                            } finally { setIsSaving(false); }
                                                                        }}
                                                                        className="h-10 px-6 bg-gray-950 text-white rounded-xl font-bold text-[11px] uppercase tracking-widest"
                                                                    >
                                                                        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : hasSender ? "Update" : "Save & Activate"}
                                                                    </Button>
                                                                    {hasSender && <button onClick={() => setIsEditingSender(false)} className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Cancel</button>}
                                                                    {saved && <span className="text-[10px] font-black uppercase text-emerald-500 tracking-widest flex items-center gap-1"><Check className="h-3 w-3" /> Saved</span>}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {hasSender && !isEditingSender && (
                                                            <div className="flex items-center gap-6 px-5 py-4 rounded-2xl bg-gray-50 border border-gray-100">
                                                                <div className="flex-1">
                                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Sender Name</p>
                                                                    <p className="text-[14px] font-bold text-gray-900 truncate">{company.customSenderName}</p>
                                                                </div>
                                                                <div className="w-px h-8 bg-gray-200" />
                                                                <div className="flex-1">
                                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Sender Email</p>
                                                                    <p className="text-[14px] font-bold text-gray-900 truncate">{company.customSenderEmail}</p>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

            </div>
        </div>
    );
}
