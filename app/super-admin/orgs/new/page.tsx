"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Building2, User, Mail, Lock, ShieldCheck, Globe } from "lucide-react";

const PLANS = [
    { id: "STARTER", label: "Starter", desc: "For small teams", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100" },
    { id: "PRO", label: "Professional", desc: "Best for scaling", color: "text-[#F97316]", bg: "bg-orange-50", border: "border-orange-100" },
    { id: "ENTERPRISE", label: "Enterprise", desc: "Maximum power", color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-100" }
];

export default function NewOrgPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState<{ orgName: string; adminEmail: string } | null>(null);

    const [form, setForm] = useState({
        orgName: "",
        slug: "",
        plan: "STARTER",
        adminName: "",
        adminEmail: "",
        adminPassword: "",
    });

    const handleOrgNameChange = (name: string) => {
        setForm(prev => ({
            ...prev,
            orgName: name,
            slug: prev.slug === "" || prev.slug === prev.orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") 
                   ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") 
                   : prev.slug,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const res = await fetch("/api/super-admin/orgs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Failed to create organization");
                return;
            }

            setSuccess({ orgName: form.orgName, adminEmail: form.adminEmail });
        } catch {
            setError("Connection error. Try again.");
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[80vh]">
                <div className="w-full max-w-lg bg-white border border-gray-100 rounded-xl p-8 text-center space-y-6 shadow-sm animate-fade-slide">
                    <div className="w-16 h-16 rounded-2xl bg-green-50 border border-green-100 flex items-center justify-center mx-auto text-green-500">
                        <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-gray-900 font-bold text-2xl tracking-tight">{success.orgName} is Live!</h2>
                        <p className="text-gray-500 font-medium">Organization and HR Admin account created successfully.</p>
                    </div>
                    
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-6 text-left space-y-4">
                        <div className="flex items-center gap-2">
                            <span className="w-1 h-5 bg-green-500 rounded-full" />
                            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">HR Admin Credentials</p>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center pb-2 border-b border-gray-200/50">
                                <span className="text-gray-500 text-xs font-semibold">Email</span>
                                <span className="text-gray-950 font-bold text-sm">{success.adminEmail}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-500 text-xs font-semibold">Portal</span>
                                <span className="text-[#F97316] font-bold text-sm">/login</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 pt-4">
                        <button
                            onClick={() => { setSuccess(null); setForm({ orgName: "", slug: "", plan: "STARTER", adminName: "", adminEmail: "", adminPassword: "" }); }}
                            className="flex-1 h-10 rounded-xl border border-gray-200 text-gray-500 font-bold text-xs uppercase tracking-widest hover:bg-gray-50"
                        >
                            Add Another
                        </button>
                        <button
                            onClick={() => router.push("/super-admin/orgs")}
                            className="flex-1 h-10 rounded-xl bg-gray-950 text-white font-bold text-xs uppercase tracking-widest shadow-md hover:bg-black"
                        >
                            View All Orgs
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 lg:p-12 max-w-4xl animate-fade-slide">
            {/* Header */}
            <div className="mb-12">
                <button 
                    onClick={() => router.back()} 
                    className="group flex items-center gap-2 text-gray-400 hover:text-gray-900 text-sm font-semibold mb-6 transition-all"
                >
                    <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                    Back to List
                </button>
                <div className="flex items-center gap-6 mb-10">
                    <div className="h-14 w-14 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#F97316] shadow-sm">
                        <Building2 className="h-8 w-8" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight leading-none">Add New Client</h1>
                        <p className="text-gray-500 font-medium text-sm mt-2">Create a professional organization on the Lumoscale platform.</p>
                    </div>
                </div>

                {/* Step Indicator */}
                <div className="relative flex justify-between w-full mb-8">
                    <div className="absolute top-4 left-0 h-[2px] w-full bg-gray-200 rounded-full" />
                    <div className="absolute top-4 left-0 h-[2px] bg-[#F97316] rounded-full transition-all duration-300" style={{ width: form.adminName ? "100%" : "50%" }} />
                    {["Organization", "Admin Account"].map((step, i) => {
                        const isCompleted = (i === 0 && form.adminName);
                        const isCurrent = (!form.adminName && i === 0) || (form.adminName && i === 1);
                        return (
                            <div key={step} className="relative z-10 flex flex-col items-center gap-2">
                                <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 bg-white transition-all ${isCompleted ? "border-[#F97316] bg-[#F97316] text-white" : isCurrent ? "border-[#F97316] text-[#F97316]" : "border-gray-300 text-gray-400"}`}>
                                    {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
                                </div>
                                <span className={`text-[11px] font-semibold ${isCompleted || isCurrent ? "text-gray-900" : "text-gray-400"}`}>{step}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-10">
                {/* Organization Details */}
                <div className="space-y-6">
                    <div className="flex items-center gap-4">
                        <span className="w-1.5 h-8 bg-[#F97316] rounded-full shadow-sm" />
                        <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-500">1. Organization Blueprint</h3>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 bg-white border border-gray-100 rounded-xl p-6 shadow-sm group">
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2 leading-none">
                                    <Building2 className="h-3 w-3" /> Company Name
                                </label>
                                <input
                                    value={form.orgName}
                                    onChange={e => handleOrgNameChange(e.target.value)}
                                    placeholder="e.g. Zomato"
                                    required
                                    className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium focus:ring-2 focus:ring-[#F97316]/30"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2 leading-none">
                                    <Globe className="h-3 w-3" /> URL Slug
                                </label>
                                <div className="relative group">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-sm font-bold">/</span>
                                    <input
                                        value={form.slug}
                                        onChange={e => setForm(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                                        placeholder="zomato"
                                        required
                                        className="h-10 w-full pl-6 pr-3 rounded-xl border border-gray-200 bg-white text-sm font-medium focus:ring-2 focus:ring-[#F97316]/30"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 block">Select Enterprise Plan</label>
                            <div className="grid gap-3">
                                {PLANS.map(plan => (
                                    <button
                                        key={plan.id}
                                        type="button"
                                        onClick={() => setForm(prev => ({ ...prev, plan: plan.id }))}
                                        className={`flex items-center justify-between p-3 rounded-xl border transition-all text-left ${
                                            form.plan === plan.id 
                                                ? `${plan.border} ${plan.bg} shadow-md` 
                                                : "border-gray-50 bg-gray-50/50 hover:bg-gray-50 hover:border-gray-100 opacity-60 hover:opacity-100"
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2 h-2 rounded-full ${form.plan === plan.id ? "bg-[#F97316] animate-pulse" : "bg-gray-300"}`} />
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-900">{plan.label}</p>
                                                <p className="text-[10px] font-bold text-gray-400 mt-0.5">{plan.desc}</p>
                                            </div>
                                        </div>
                                        {form.plan === plan.id && <ShieldCheck className="h-4 w-4 text-[#F97316]" />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* HR Admin Account */}
                <div className="space-y-6">
                    <div className="flex items-center gap-4">
                        <span className="w-1.5 h-8 bg-blue-500 rounded-full shadow-sm" />
                        <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-500">2. Primary HR Controller</h3>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
                        <div className="space-y-2">
                            <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2 leading-none">
                                <User className="h-3 w-3" /> Full Name
                            </label>
                            <input
                                value={form.adminName}
                                onChange={e => setForm(prev => ({ ...prev, adminName: e.target.value }))}
                                placeholder="Amit Sharma"
                                className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium focus:ring-2 focus:ring-[#F97316]/30"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2 leading-none">
                                <Mail className="h-3 w-3" /> Business Email
                            </label>
                            <input
                                type="email"
                                value={form.adminEmail}
                                onChange={e => setForm(prev => ({ ...prev, adminEmail: e.target.value }))}
                                placeholder="amit@zomato.com"
                                required
                                className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium focus:ring-2 focus:ring-[#F97316]/30"
                            />
                        </div>

                        <div className="md:col-span-2 space-y-2">
                            <label className="text-[12px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2 leading-none">
                                <Lock className="h-3 w-3" /> Temporary Password
                            </label>
                            <input
                                type="text"
                                value={form.adminPassword}
                                onChange={e => setForm(prev => ({ ...prev, adminPassword: e.target.value }))}
                                placeholder="Set secure initial access key"
                                required
                                className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium focus:ring-2 focus:ring-[#F97316]/30"
                            />
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mt-2 flex items-center gap-1.5">
                                <span className="w-1 h-1 bg-blue-400 rounded-full" />
                                Share securely. Admin logs in via the HR portal.
                            </p>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="p-6 rounded-2xl bg-red-50 border border-red-100 text-red-500 text-xs font-black uppercase tracking-widest flex items-center gap-4 animate-in-up">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                        {error}
                    </div>
                )}

                <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-6">
                    <p className="text-gray-500 text-[11px] font-medium uppercase tracking-widest max-w-xs">
                        By click provisioning, you allocate a new tenant on the Lumoscale Network.
                    </p>
                    <button
                        type="submit"
                        disabled={loading}
                        className="h-10 px-6 rounded-xl bg-gray-900 text-white font-bold text-[13px] shadow-lg hover:bg-black transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
                    >
                        {loading ? "Provisioning..." : "PROVISION ORGANIZATION"}
                    </button>
                </div>
            </form>
        </div>
    );
}
