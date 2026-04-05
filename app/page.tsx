"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Briefcase, Zap, Shield, BarChart3, ChevronRight, Globe, Layers, CheckCircle2, Users, Cpu, FileCheck } from "lucide-react";

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
        <div className="min-h-screen bg-[#F7F6F3] selection:bg-[#F97316]/10 text-gray-900 font-medium overflow-x-hidden">
            {/* Global Header */}
            <header className="fixed top-0 z-50 w-full border-b border-gray-100 bg-white/80 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto h-20 px-8 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-4 group">
                        <div className="h-10 w-10 md:h-11 md:w-11 rounded-xl bg-gradient-to-br from-[#F97316] to-orange-600 flex items-center justify-center shadow-[0_4px_15px_rgba(249,115,22,0.3)] group-hover:scale-110 transition-transform">
                            <Briefcase className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-lg md:text-xl font-black text-gray-900 leading-none tracking-tight">Lumoscale<span className="text-[#F97316]">.ai</span></span>
                            <span className="text-[8px] md:text-[9px] text-gray-400 font-bold uppercase tracking-[0.2em] mt-1">Intelligence Recruitment</span>
                        </div>
                    </Link>

                    <nav className="hidden lg:flex items-center gap-10">
                        <Link href="#features" className="text-[11px] font-black uppercase tracking-widest text-gray-500 hover:text-gray-900 transition-colors">Platform</Link>
                        <Link href="#how-it-works" className="text-[11px] font-black uppercase tracking-widest text-gray-500 hover:text-gray-900 transition-colors">How it works</Link>
                        <Link href="/careers" className="text-[11px] font-black uppercase tracking-widest text-gray-500 hover:text-gray-900 transition-colors">Careers</Link>
                    </nav>

                    <div className="flex items-center gap-4">
                        {session ? (
                            <Link href={session.role === "SUPER_ADMIN" ? "/super-admin" : "/admin"}>
                                <button className="btn-shimmer h-11 px-6 bg-[#F97316] text-white font-black text-[11px] tracking-widest uppercase rounded-xl shadow-xl active:scale-95 transition-all">
                                    DASHBOARD
                                </button>
                            </Link>
                        ) : (
                            <Link href="/login">
                                <button className="btn-shimmer h-11 px-6 bg-gray-900 text-white font-black text-[11px] tracking-widest uppercase rounded-xl shadow-xl active:scale-95 transition-all">
                                    LOGIN
                                </button>
                            </Link>
                        )}
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <main className="pt-32 pb-20">
                <section className="max-w-7xl mx-auto px-8 py-20 relative">
                    {/* Decorative Background Elements */}
                    <div className="absolute -top-20 -right-20 w-96 h-96 bg-orange-100/50 rounded-full blur-[100px] -z-10" />
                    <div className="absolute top-1/2 -left-20 w-80 h-80 bg-blue-50/50 rounded-full blur-[80px] -z-10" />

                    <div className="space-y-12 animate-fade-slide">
                        <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-white border border-gray-100 shadow-sm">
                            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">System Live · Lumoscale Cloud v4.2</span>
                        </div>

                        <div className="max-w-4xl space-y-6">
                            <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.9] text-gray-900">
                                Hire the top 1% <br />
                                with <span className="text-[#F97316]">AI precision.</span>
                            </h1>
                            <p className="text-lg md:text-xl text-gray-500 font-medium max-w-2xl leading-relaxed">
                                The multi-tenant recruitment engine for high-performance teams. 
                                Automate your entire pipeline with enterprise-grade precision and real-time intelligence.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-6 pt-4">
                            <Link href="/careers">
                                <button className="btn-shimmer h-16 px-10 rounded-2xl bg-[#F97316] text-white font-black text-sm tracking-widest uppercase shadow-[0_10px_25px_rgba(249,115,22,0.2)] hover:shadow-[0_15px_35px_rgba(249,115,22,0.3)] transition-all hover:-translate-y-1 group">
                                    EXPLORE CAREERS
                                </button>
                            </Link>
                            <Link href="/login">
                                <button className="h-16 px-10 rounded-2xl bg-white border border-gray-100 text-gray-900 font-black text-sm tracking-widest uppercase hover:border-gray-900 transition-all shadow-sm">
                                    GET STARTED
                                </button>
                            </Link>
                        </div>

                        {/* Trusted By / Social Proof */}
                        <div className="pt-20">
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400 mb-8">Trusted by Global Innovators</p>
                            <div className="flex flex-wrap items-center gap-x-12 gap-y-8 opacity-40 grayscale filter">
                                {['LUMOSCALE', 'TECHFLOW', 'NEXUS', 'SKYLINE', 'ORBIT'].map((brand) => (
                                    <span key={brand} className="text-2xl font-black tracking-tighter italic">{brand}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* Platform Features Section */}
                <section id="features" className="max-w-7xl mx-auto px-8 py-32 border-t border-gray-100 mt-10">
                    <div className="grid md:grid-cols-2 gap-16 items-center">
                        <div className="space-y-8">
                            <div className="space-y-4">
                                <h2 className="text-4xl md:text-5xl font-black tracking-tight text-gray-900 leading-tight">
                                    The Recruitment OS <br /> for <span className="text-[#F97316]">Modern Teams.</span>
                                </h2>
                                <p className="text-gray-500 font-medium leading-relaxed max-w-lg">
                                    Stop using disjointed tools. Our integrated platform handles everything from JD creation to candidate assessment.
                                </p>
                            </div>

                            <div className="space-y-6">
                                {[
                                    { title: "Automated Screening", desc: "No more manual resume parsing. Let AI find the best fit in seconds." },
                                    { title: "Smart Workflows", desc: "Customize every step of your hiring journey with drag-and-drop ease." },
                                    { title: "Deep Analytics", desc: "Visualize key metrics like time-to-hire and candidate dropout rates." }
                                ].map((feature, i) => (
                                    <div key={i} className="flex gap-5 group">
                                        <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#F97316] group-hover:bg-[#F97316] group-hover:text-white transition-all">
                                            <CheckCircle2 className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <h4 className="text-lg font-black text-gray-900 group-hover:text-[#F97316] transition-colors">{feature.title}</h4>
                                            <p className="text-sm text-gray-500 leading-relaxed">{feature.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Feature Cards Grid */}
                        <div className="grid grid-cols-2 gap-6">
                            {[
                                { icon: Zap, label: "FAST", color: "text-blue-500", bg: "bg-blue-50" },
                                { icon: Shield, label: "SECURE", color: "text-green-500", bg: "bg-green-50" },
                                { icon: Cpu, label: "AI ENGINE", color: "text-orange-500", bg: "bg-orange-50" },
                                { icon: BarChart3, label: "INSIGHTS", color: "text-purple-500", bg: "bg-purple-50" }
                            ].map((item, i) => (
                                <div key={i} className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl hover:border-orange-100 transition-all text-center space-y-4">
                                    <div className={`h-16 w-16 mx-auto rounded-2xl ${item.bg} flex items-center justify-center ${item.color}`}>
                                        <item.icon className="h-8 w-8" />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{item.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* How It Works Section */}
                <section id="how-it-works" className="bg-gray-900 text-white py-32 w-full">
                    <div className="max-w-7xl mx-auto px-8 text-center space-y-24">
                        <div className="space-y-4">
                            <h2 className="text-4xl md:text-5xl font-black tracking-tight">How Lumoscale Works</h2>
                            <p className="text-gray-400 font-medium max-w-xl mx-auto">Three simple steps to transform your recruitment process.</p>
                        </div>

                        <div className="grid md:grid-cols-3 gap-12 relative">
                            {/* Decorative Line (Hidden on Mobile) */}
                            <div className="hidden md:block absolute top-1/2 left-0 w-full h-[1px] bg-white/10 -z-0" />

                            {[
                                { step: "01", icon: FileCheck, title: "Define Requirements", desc: "Upload JD and specify skills, experience, and key performance indicators." },
                                { step: "02", icon: Globe, title: "Spread the Word", desc: "Generate a custom portal where candidates can apply and upload resumes." },
                                { step: "03", icon: Users, title: "Assemble Your Team", desc: "Review AI-ranked candidates and proceed to interviews with the best talent." }
                            ].map((item, i) => (
                                <div key={i} className="relative z-10 bg-gray-900 border border-white/5 p-10 rounded-[3rem] space-y-6 hover:bg-gray-800 transition-colors">
                                    <div className="h-16 w-16 bg-gradient-to-br from-[#F97316] to-orange-500 rounded-2xl flex items-center justify-center mx-auto shadow-[0_10px_30px_rgba(249,115,22,0.4)]">
                                        <item.icon className="h-8 w-8" />
                                    </div>
                                    <div className="space-y-4">
                                        <span className="text-[10px] font-black text-[#F97316] tracking-[0.3em] uppercase">{item.step} — PROCESS</span>
                                        <h3 className="text-2xl font-black tracking-tight">{item.title}</h3>
                                        <p className="text-sm text-gray-400 leading-relaxed">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Ready CTA Section */}
                <section className="max-w-5xl mx-auto px-8 py-32 text-center mt-20">
                    <div className="bg-white border border-gray-100 p-16 md:p-24 rounded-[4rem] shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-50 rounded-full blur-[80px] -z-10 group-hover:bg-orange-100 transition-colors" />
                        
                        <div className="space-y-10">
                            <h2 className="text-5xl md:text-6xl font-black tracking-tight text-gray-900">
                                Ready to hire the <br /> <span className="text-[#F97316]">next 1%?</span>
                            </h2>
                            <p className="text-lg text-gray-500 font-medium max-w-xl mx-auto">
                                Join the elite teams already scaling with intelligence. Start free today.
                            </p>
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-4">
                                <Link href="/login" className="w-full sm:w-auto">
                                    <button className="w-full sm:w-auto h-16 px-12 rounded-2xl bg-gray-900 text-white font-black text-sm tracking-widest uppercase shadow-xl hover:bg-black transition-all">
                                        GET STARTED NOW
                                    </button>
                                </Link>
                                <Link href="/careers" className="w-full sm:w-auto">
                                    <button className="w-full sm:w-auto h-16 px-12 rounded-2xl bg-white border border-gray-100 text-gray-900 font-black text-sm tracking-widest uppercase hover:border-gray-900 transition-all shadow-sm">
                                        EXPLORE OPENINGS
                                    </button>
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            {/* Premium Footer */}
            <footer className="border-t border-gray-100 py-32 bg-white">
                <div className="max-w-7xl mx-auto px-8">
                    <div className="grid md:grid-cols-4 gap-16 mb-20">
                        <div className="col-span-2 space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="h-11 w-11 rounded-xl bg-gray-900 flex items-center justify-center text-white">
                                    <Briefcase className="h-5 w-5" />
                                </div>
                                <span className="text-2xl font-black tracking-tight text-gray-900">Lumoscale<span className="text-[#F97316]">.ai</span></span>
                            </div>
                            <p className="text-gray-500 max-w-sm font-medium leading-relaxed">
                                The world's first AI-native recruitment ecosystem designed for technical excellence and human intuition.
                            </p>
                        </div>
                        <div className="space-y-6">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Resources</h4>
                            <div className="flex flex-col gap-4">
                                <Link href="#" className="text-sm font-bold text-gray-600 hover:text-[#F97316] transition-colors">Documentation</Link>
                                <Link href="#" className="text-sm font-bold text-gray-600 hover:text-[#F97316] transition-colors">Guides</Link>
                                <Link href="#" className="text-sm font-bold text-gray-600 hover:text-[#F97316] transition-colors">Support</Link>
                            </div>
                        </div>
                        <div className="space-y-6">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Legal</h4>
                            <div className="flex flex-col gap-4">
                                <Link href="#" className="text-sm font-bold text-gray-600 hover:text-[#F97316] transition-colors">Privacy Policy</Link>
                                <Link href="#" className="text-sm font-bold text-gray-600 hover:text-[#F97316] transition-colors">Terms of Service</Link>
                            </div>
                        </div>
                    </div>
                    <div className="pt-20 border-t border-gray-50 flex flex-col md:flex-row items-center justify-between gap-10">
                        <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.4em]">© 2026 Lumoscale Network · High-Performance Recruitment</p>
                        <div className="flex items-center gap-6">
                            <Link href="#" className="text-gray-400 hover:text-gray-900 transition-colors font-black text-[10px] uppercase tracking-widest">TWITTER</Link>
                            <Link href="#" className="text-gray-400 hover:text-gray-900 transition-colors font-black text-[10px] uppercase tracking-widest">LINKEDIN</Link>
                            <Link href="#" className="text-gray-400 hover:text-gray-900 transition-colors font-black text-[10px] uppercase tracking-widest">GITHUB</Link>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
