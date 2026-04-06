"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Building2, ShieldCheck, Globe, Loader2, User, Mail, ShieldAlert } from "lucide-react";

const PLANS = [
    { id: "STARTER", label: "Starter", desc: "For small teams", bg: "bg-blue-50", border: "border-blue-100", accent: "text-blue-600" },
    { id: "PRO", label: "Professional", desc: "Best for scaling", bg: "bg-orange-50", border: "border-orange-100", accent: "text-[#F97316]" },
    { id: "ENTERPRISE", label: "Enterprise", desc: "Maximum power", bg: "bg-purple-50", border: "border-purple-100", accent: "text-purple-600" }
];

export default function EditOrgPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [saved, setSaved] = useState(false);
    const [resetLoading, setResetLoading] = useState(false);
    const [resetSuccess, setResetSuccess] = useState(false);

    const [form, setForm] = useState({
        name: "",
        slug: "",
        plan: "STARTER",
    });
    
    const [adminInfo, setAdminInfo] = useState<{name: string, email: string} | null>(null);

    useEffect(() => {
        const fetchOrg = async () => {
            try {
                const res = await fetch(`/api/super-admin/orgs/${id}`);
                const data = await res.json();
                if (res.ok) {
                    setForm({
                        name: data.name,
                        slug: data.slug,
                        plan: data.plan,
                    });
                    if (data.users && data.users.length > 0) {
                        setAdminInfo({ name: data.users[0].name, email: data.users[0].email });
                    }
                } else {
                    setError("Organization not found");
                }
            } catch {
                setError("Failed to load organization");
            } finally {
                setLoading(false);
            }
        };
        fetchOrg();
    }, [id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        setSaved(false);

        try {
            const res = await fetch(`/api/super-admin/orgs/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });

            if (!res.ok) {
                const data = await res.json();
                setError(data.error || "Failed to update records");
                return;
            }

            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch {
            setError("Connection error. Try again.");
        } finally {
            setSaving(false);
        }
    };

    const handleResetPassword = async () => {
        setResetLoading(true);
        setResetSuccess(false);
        setError("");

        try {
            const res = await fetch(`/api/super-admin/orgs/${id}/reset-password`, {
                method: "POST"
            });

            if (!res.ok) {
                const data = await res.json();
                setError(data.error || "Failed to initialize reset flow");
                return;
            }

            setResetSuccess(true);
            setTimeout(() => setResetSuccess(false), 5000);
        } catch {
            setError("Reset service unreachable. Try again.");
        } finally {
            setResetLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="p-20 text-center flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-[#F97316] animate-spin opacity-20" />
            </div>
        );
    }

    return (
        <div className="p-8 lg:p-12 max-w-5xl animate-fade-slide text-gray-900 font-medium">
            {/* Header */}
            <div className="mb-12">
                <button 
                    onClick={() => router.back()} 
                    className="group flex items-center gap-2 text-gray-400 hover:text-gray-900 text-xs font-black uppercase tracking-[0.2em] mb-8 transition-all"
                >
                    <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                    Return to Registry
                </button>
                <div className="flex items-center gap-6">
                    <div className="h-20 w-20 rounded-[2.5rem] bg-white border border-gray-100 flex items-center justify-center text-gray-900 shadow-[0_10px_40px_rgba(0,0,0,0.03)] group overflow-hidden relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-[#F97316] to-orange-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <Building2 className="h-10 w-10 relative z-10 group-hover:text-white transition-colors" />
                    </div>
                    <div>
                        <h1 className="text-5xl font-black text-gray-900 tracking-tighter leading-none mb-2">Modify Client</h1>
                        <p className="text-gray-400 font-bold uppercase tracking-widest text-[11px] flex items-center gap-2">
                           <ShieldCheck className="h-3 w-3 text-[#F97316]" /> Edit Protocol for <span className="text-gray-900">{form.name}</span>
                        </p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-12">
                <div className="grid lg:grid-cols-[1.5fr_1fr] gap-12">
                    {/* Primary Config */}
                    <div className="space-y-10">
                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <span className="w-1.5 h-8 bg-gray-900 rounded-full shadow-[0_0_15px_rgba(0,0,0,0.1)]" />
                                <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-gray-400">Core Architecture</h3>
                            </div>

                            <div className="bg-white border border-gray-100 rounded-[3rem] p-10 shadow-[0_10px_40px_rgba(0,0,0,0.02)] space-y-8">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 px-1">
                                        <Building2 className="h-3 w-3" /> Organization Legal Name
                                    </label>
                                    <input
                                        value={form.name}
                                        onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                                        placeholder="e.g. Zomato Limited"
                                        required
                                        className="w-full h-16 px-8 bg-gray-50 border border-transparent rounded-[1.5rem] text-[15px] font-black text-gray-900 placeholder:text-gray-300 outline-none focus:bg-white focus:border-[#F97316]/30 focus:ring-4 focus:ring-orange-50/50 transition-all shadow-inner"
                                    />
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 px-1">
                                        <Globe className="h-3 w-3" /> Network Access Slug
                                    </label>
                                    <div className="relative group">
                                        <span className="absolute left-8 top-1/2 -translate-y-1/2 text-gray-300 text-lg font-black tracking-tighter">/</span>
                                        <input
                                            value={form.slug}
                                            onChange={e => setForm(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                                            placeholder="zomato"
                                            required
                                            className="w-full h-16 pl-12 pr-8 bg-gray-50 border border-transparent rounded-[1.5rem] text-[15px] font-black text-gray-900 placeholder:text-gray-300 outline-none focus:bg-white focus:border-[#F97316]/30 focus:ring-4 focus:ring-orange-50/50 transition-all shadow-inner"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 px-2">
                                        <ShieldAlert className="h-3 w-3 text-red-500" />
                                        <p className="text-[9px] font-black text-red-500/60 uppercase tracking-widest mt-0.5">Critical: Changing this breaks all existing drive links.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <span className="w-1.5 h-8 bg-[#F97316] rounded-full shadow-[0_0_15px_rgba(249,115,22,0.3)]" />
                                <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-gray-400">Primary Tenant Controller</h3>
                            </div>

                            <div className="bg-white border border-gray-100 rounded-[3rem] p-10 shadow-[0_10px_40px_rgba(0,0,0,0.02)] grid md:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 px-1">
                                        <User className="h-3 w-3" /> Full Name
                                    </label>
                                    <div className="h-16 px-8 bg-gray-100/50 border border-gray-100 rounded-[1.5rem] flex items-center text-[15px] font-black text-gray-400 select-none">
                                        {adminInfo?.name || "N/A"}
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 px-1">
                                        <Mail className="h-3 w-3" /> Security Email
                                    </label>
                                    <div className="h-16 px-8 bg-gray-100/50 border border-gray-100 rounded-[1.5rem] flex items-center text-[15px] font-black text-gray-400 select-none">
                                        {adminInfo?.email || "N/A"}
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <button
                                        type="button"
                                        onClick={handleResetPassword}
                                        disabled={resetLoading || resetSuccess}
                                        className={`w-full h-16 rounded-[1.5rem] border border-dashed transition-all flex items-center justify-center gap-3 group/btn ${
                                            resetSuccess
                                                ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                                                : "border-gray-200 text-gray-400 hover:border-[#F97316] hover:text-[#F97316] hover:bg-orange-50/30"
                                        }`}
                                    >
                                        {resetLoading ? (
                                            <Loader2 className="h-4 w-4 animate-spin text-[#F97316]" />
                                        ) : resetSuccess ? (
                                            <CheckCircle2 className="h-4 w-4" />
                                        ) : (
                                            <ShieldCheck className="h-4 w-4 group-hover/btn:rotate-12 transition-transform" />
                                        )}
                                        {resetLoading 
                                            ? "Requesting Token..." 
                                            : resetSuccess 
                                                ? "Reset Link Dispatched Successfully" 
                                                : "Initialize Password Reset Flow"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Subscription Side */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-4">
                            <span className="w-1.5 h-8 bg-blue-500 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.3)]" />
                            <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-gray-400">Active Service Plan</h3>
                        </div>

                        <div className="bg-white border border-gray-100 rounded-[3rem] p-8 shadow-[0_10px_40px_rgba(0,0,0,0.02)] space-y-3">
                            {PLANS.map(plan => (
                                <button
                                    key={plan.id}
                                    type="button"
                                    onClick={() => setForm(prev => ({ ...prev, plan: plan.id }))}
                                    className={`w-full flex items-center justify-between p-6 rounded-[1.5rem] border transition-all text-left relative overflow-hidden group/opt ${
                                        form.plan === plan.id 
                                            ? `${plan.border} ${plan.bg} shadow-md` 
                                            : "border-gray-50 bg-gray-50/50 hover:bg-gray-100/50 hover:border-gray-100 opacity-60 hover:opacity-100"
                                    }`}
                                >
                                    <div className="flex flex-col items-start gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2 h-2 rounded-full ${form.plan === plan.id ? "bg-[#F97316] animate-pulse" : "bg-gray-300"}`} />
                                            <p className={`text-[11px] font-black uppercase tracking-widest ${form.plan === plan.id ? 'text-gray-900' : 'text-gray-400'}`}>{plan.label}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-gray-400 tracking-wide uppercase">{plan.desc}</p>
                                        </div>
                                    </div>
                                    {form.plan === plan.id && <CheckCircle2 className={`h-6 w-6 ${plan.accent}`} />}
                                    
                                    {/* Hover Shine */}
                                    <div className="absolute inset-0 bg-white opacity-0 group-hover/opt:opacity-[0.05] transition-opacity" />
                                </button>
                            ))}
                        </div>
                        
                        <div className="p-2">
                             <div className="bg-gray-900 rounded-[2rem] p-8 flex flex-col gap-4 shadow-xl shadow-gray-200">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-[#F97316] flex items-center justify-center text-white font-black text-xs">
                                        !
                                    </div>
                                    <p className="text-white font-black text-xs uppercase tracking-widest">Protocol Notice</p>
                                </div>
                                <p className="text-gray-400 text-[10px] uppercase font-bold tracking-widest leading-loose">
                                    Modifying an organization blueprint affects multi-tenant isolation and routing. Ensure all parameters represent legal compliance.
                                </p>
                             </div>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="p-6 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-4 animate-in-up">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        {error}
                    </div>
                )}

                {/* Confirm Actions */}
                <div className="pt-8 border-t border-gray-50 flex flex-col sm:flex-row items-center justify-between gap-8">
                    <div className="flex items-center gap-4">
                        {saved && (
                            <div className="flex items-center gap-2 text-emerald-500 text-[10px] font-black uppercase tracking-widest animate-in-up">
                                <CheckCircle2 className="h-4 w-4" /> Syncing Successful
                            </div>
                        )}
                    </div>
                    <div className="flex gap-4 w-full sm:w-auto">
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="flex-1 sm:px-12 h-16 rounded-[1.5rem] border border-gray-100 text-gray-400 font-black text-[11px] uppercase tracking-widest hover:bg-gray-50 transition-all hover:text-gray-900"
                        >
                            Abandon
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-[2] sm:px-16 h-16 rounded-[1.5rem] bg-gray-900 text-white font-black text-[11px] uppercase tracking-widest shadow-2xl shadow-gray-200 hover:bg-black transition-all hover:-translate-y-1 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Synchronizing...
                                </>
                            ) : "APPLY CHANGES →"}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
