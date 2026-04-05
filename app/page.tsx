"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Briefcase, Zap, Shield, BarChart3, ChevronRight, Globe, Layers } from "lucide-react";

export default function Home() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [session, setSession] = useState<any>(null);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const res = await fetch("/api/auth/me");
                if (res.ok) {
                    const data = await res.json();
                    setSession(data);
                }
            } catch (err) {
                console.error("Auth check failed", err);
            } finally {
                setLoading(false);
            }
        };
        checkAuth();
    }, []);

    if (loading) return null;

    return (
        <div className="min-h-screen bg-[#F7F6F3] selection:bg-[#F97316]/10 text-gray-900 font-medium">
            {/* Global Header - Matching Admin Sidebar Logo Style */}
            <header className="fixed top-0 z-50 w-full border-b border-gray-100 bg-white/80 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto h-22 px-8 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-4 group">
                        <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-[#F97316] to-orange-600 flex items-center justify-center shadow-[0_4px_15px_rgba(249,115,22,0.3)] group-hover:scale-110 transition-transform">
                            <Briefcase className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xl font-black text-gray-900 leading-none tracking-tight">Lumoscale<span className="text-[#F97316]">.ai</span></span>
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-[0.2em] mt-1">Intelligence Recruitment</span>
                        </div>
                    </Link>

                    <nav className="hidden md:flex items-center gap-10">
                        <Link href="#products" className="text-[11px] font-black uppercase tracking-widest text-gray-500 hover:text-gray-900 transition-colors">Products</Link>
                        <Link href="/careers" className="text-[11px] font-black uppercase tracking-widest text-gray-500 hover:text-gray-900 transition-colors">Careers</Link>
                        <Link href="#solutions" className="text-[11px] font-black uppercase tracking-widest text-gray-500 hover:text-gray-900 transition-colors">Solutions</Link>
                    </nav>

                    <div className="flex items-center gap-6">
                        {session ? (
                            <Link href={session.role === "SUPER_ADMIN" ? "/super-admin" : "/admin"}>
                                <button className="btn-shimmer h-12 px-8 bg-[#F97316] text-white font-black text-[11px] tracking-widest uppercase rounded-xl shadow-xl active:scale-95 transition-all">
                                    DASHBOARD
                                </button>
                            </Link>
                        ) : (
                            <Link href="/login">
                                <button className="btn-shimmer h-12 px-8 bg-gray-900 text-white font-black text-[11px] tracking-widest uppercase rounded-xl shadow-xl active:scale-95 transition-all">
                                    LOGIN
                                </button>
                            </Link>
                        )}
                    </div>
                </div>
            </header>

            {/* Hero Section - Matching Dashboard Spacing */}
            <main className="max-w-7xl mx-auto px-8 pt-48 pb-32">
                <div className="space-y-16">
                    <div className="space-y-8 max-w-4xl animate-fade-slide">
                        <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-white border border-gray-100 shadow-sm">
                            <div className="h-2 w-2 rounded-full bg-green-500 drive-active-dot" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">System Live · Lumoscale Cloud v4.2</span>
                        </div>

                        <h1 className="text-7xl md:text-8xl font-black tracking-tighter leading-[0.9] text-gray-900">
                            Hire the top 1% <br />
                            with <span className="text-[#F97316]">AI precision.</span>
                        </h1>

                        <p className="text-xl text-gray-500 font-medium max-w-2xl leading-relaxed">
                            The multi-tenant recruitment engine for high-performance teams. 
                            Automate your entire pipeline with enterprise-grade precision.
                        </p>

                        <div className="flex items-center gap-6 pt-4">
                            <Link href="/careers">
                                <button className="btn-shimmer h-16 px-10 rounded-2xl bg-[#F97316] text-white font-black text-sm tracking-widest uppercase shadow-[0_10px_25px_rgba(249,115,22,0.2)] hover:shadow-[0_15px_35px_rgba(249,115,22,0.3)] transition-all hover:-translate-y-1 group">
                                    EXPLORE CAREERS
                                </button>
                            </Link>
                            <Link href="/login">
                                <button className="h-16 px-10 rounded-2xl bg-white border border-gray-100 text-gray-900 font-black text-sm tracking-widest uppercase hover:border-gray-900 transition-all shadow-sm">
                                    WORK WITH US
                                </button>
                            </Link>
                        </div>
                    </div>

                    {/* Feature Grid - Using 'Beautiful Card' DNA */}
                    <div className="grid md:grid-cols-3 gap-8 pt-20">
                        {[
                            { icon: Zap, label: "INSTANT SCREENING", desc: "No more waiting. Our AI screens thousands of candidates in milliseconds." },
                            { icon: Shield, label: "TOTAL ISOLATION", desc: "Enterprise-grade data security with private, multi-tenant portal architecture." },
                            { icon: BarChart3, label: "REAL-TIME INSIGHT", desc: "Interactive dashboards that visualize your entire hiring pipeline instantly." }
                        ].map((item, i) => (
                            <div key={i} className="group relative rounded-2xl p-8 transition-all duration-500 bg-white border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_40px_rgba(249,115,22,0.1)] hover:border-orange-100 overflow-hidden cursor-default animate-fade-slide" style={{ animationDelay: `${i * 100}ms` }}>
                                {/* Interactive Border Glow */}
                                <div className="absolute top-0 left-0 w-1.5 h-full bg-[#F97316] opacity-0 group-hover:opacity-100 transition-all duration-500" />
                                
                                <div className="h-14 w-14 rounded-xl bg-gray-50 flex items-center justify-center text-gray-900 mb-8 border border-gray-100 group-hover:bg-[#F97316] group-hover:text-white transition-all duration-500 shadow-sm">
                                    <item.icon className="h-6 w-6" />
                                </div>
                                <h3 className="text-xl font-black text-gray-900 mb-4 tracking-tighter uppercase group-hover:text-[#F97316] transition-colors">{item.label}</h3>
                                <p className="text-gray-500 font-medium leading-relaxed text-[13px]">{item.desc}</p>
                                
                                <div className="mt-8 pt-6 border-t border-gray-50 flex items-center justify-between">
                                    <span className="text-[10px] font-black text-[#F97316] uppercase tracking-widest">Enterprise Ready</span>
                                    <div className="h-1.5 w-1.5 rounded-full bg-orange-100" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </main>

            {/* Minimalist Footer */}
            <footer className="border-t border-gray-100 py-32 bg-white mt-20">
                <div className="max-w-7xl mx-auto px-8 flex flex-col md:flex-row items-center justify-between gap-10">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gray-900 flex items-center justify-center">
                            <Briefcase className="h-5 w-5 text-white" />
                        </div>
                        <span className="text-xl font-black tracking-tight text-gray-900">Lumoscale<span className="text-[#F97316]">.ai</span></span>
                    </div>
                    <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.4em]">© 2026 Lumoscale Network · High-Performance Recruitment</p>
                </div>
            </footer>
        </div>
    );
}
