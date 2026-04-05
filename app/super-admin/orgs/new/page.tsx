"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewOrgPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState<{ orgName: string; adminEmail: string } | null>(null);

    const [form, setForm] = useState({
        orgName: "",
        slug: "",
        plan: "STARTER",
        logoUrl: "",
        adminName: "",
        adminEmail: "",
        adminPassword: "",
    });

    const handleOrgNameChange = (name: string) => {
        setForm(prev => ({
            ...prev,
            orgName: name,
            slug: prev.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
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
                <div className="w-full max-w-md bg-white/[0.03] border border-white/[0.06] rounded-3xl p-10 text-center space-y-6">
                    <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto text-3xl">
                        ✓
                    </div>
                    <div>
                        <h2 className="text-white font-black text-2xl">{success.orgName} is Live!</h2>
                        <p className="text-gray-500 text-sm mt-2 font-medium">Organization and HR Admin account created.</p>
                    </div>
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 text-left space-y-3">
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">HR Admin Login Details</p>
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <span className="text-gray-500 text-sm">Email</span>
                                <span className="text-white font-bold text-sm">{success.adminEmail}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500 text-sm">Login URL</span>
                                <span className="text-[#F97316] font-bold text-sm">/login</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => { setSuccess(null); setForm({ orgName: "", slug: "", plan: "STARTER", logoUrl: "", adminName: "", adminEmail: "", adminPassword: "" }); }}
                            className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 font-bold text-sm hover:bg-white/[0.04] transition-colors"
                        >
                            Add Another
                        </button>
                        <button
                            onClick={() => router.push("/super-admin/orgs")}
                            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#F97316] to-orange-600 text-white font-bold text-sm shadow-lg shadow-orange-500/25"
                        >
                            View All Orgs
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const inputClass = "w-full h-11 px-4 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 text-sm font-medium outline-none focus:border-[#F97316]/50 transition-all";
    const labelClass = "block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5";

    return (
        <div className="p-8 max-w-2xl">
            {/* Header */}
            <div className="mb-8">
                <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-300 text-sm font-bold mb-4 flex items-center gap-2 transition-colors">
                    ← Back
                </button>
                <h1 className="text-3xl font-black text-white tracking-tight">Add New Client</h1>
                <p className="text-gray-500 font-medium mt-1">Create an organization and its HR Admin account.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
                {/* Organization Details */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 space-y-5">
                    <h2 className="text-white font-black text-sm uppercase tracking-wider">Organization Details</h2>

                    <div>
                        <label className={labelClass}>Company Name *</label>
                        <input
                            id="org-name"
                            value={form.orgName}
                            onChange={e => handleOrgNameChange(e.target.value)}
                            placeholder="e.g. Zomato"
                            required
                            className={inputClass}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>URL Slug *</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm font-bold">/org/</span>
                                <input
                                    id="slug"
                                    value={form.slug}
                                    onChange={e => setForm(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                                    placeholder="zomato"
                                    required
                                    className={`${inputClass} pl-12`}
                                />
                            </div>
                        </div>
                        <div>
                            <label className={labelClass}>Plan</label>
                            <select
                                value={form.plan}
                                onChange={e => setForm(prev => ({ ...prev, plan: e.target.value }))}
                                className={inputClass}
                            >
                                <option value="STARTER">Starter</option>
                                <option value="PRO">Pro</option>
                                <option value="ENTERPRISE">Enterprise</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>Logo URL (optional)</label>
                        <input
                            value={form.logoUrl}
                            onChange={e => setForm(prev => ({ ...prev, logoUrl: e.target.value }))}
                            placeholder="https://company.com/logo.png"
                            className={inputClass}
                        />
                    </div>
                </div>

                {/* HR Admin Account */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 space-y-5">
                    <h2 className="text-white font-black text-sm uppercase tracking-wider">HR Admin Account</h2>

                    <div>
                        <label className={labelClass}>Admin Name</label>
                        <input
                            value={form.adminName}
                            onChange={e => setForm(prev => ({ ...prev, adminName: e.target.value }))}
                            placeholder="Amit Sharma"
                            className={inputClass}
                        />
                    </div>

                    <div>
                        <label className={labelClass}>Admin Email *</label>
                        <input
                            id="admin-email"
                            type="email"
                            value={form.adminEmail}
                            onChange={e => setForm(prev => ({ ...prev, adminEmail: e.target.value }))}
                            placeholder="amit@zomato.com"
                            required
                            className={inputClass}
                        />
                    </div>

                    <div>
                        <label className={labelClass}>Temp Password *</label>
                        <input
                            id="admin-password"
                            type="text"
                            value={form.adminPassword}
                            onChange={e => setForm(prev => ({ ...prev, adminPassword: e.target.value }))}
                            placeholder="Set a temporary password for the HR admin"
                            required
                            className={inputClass}
                        />
                        <p className="text-gray-600 text-[11px] mt-1.5">Share this with the admin so they can log in at /login</p>
                    </div>
                </div>

                {error && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">
                        {error}
                    </div>
                )}

                <button
                    id="create-org-btn"
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 rounded-xl bg-gradient-to-r from-[#F97316] to-orange-600 text-white font-black text-[14px] shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                    {loading ? "Creating..." : "Create Organization & Admin →"}
                </button>
            </form>
        </div>
    );
}
