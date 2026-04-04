"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Loader2, ArrowRight, ShieldCheck, Zap, BrainCircuit, Users, ChevronRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { motion } from "framer-motion";

export default function AdminLandingPage() {
    const router = useRouter();
    const { login } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [errorMsg, setErrorMsg] = useState("");

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setErrorMsg("");

        // Simulate API call delay for premium feel
        setTimeout(() => {
            setIsLoading(false);
            if (email === "admin@lumoscale" && password === "123456") {
                login(email, "hr");
                window.location.href = "/admin"; 
            } else {
                setErrorMsg("Invalid credentials. Please use admin@lumoscale and 123456.");
            }
        }, 1200);
    };

    // Animation Variants
    const fadeUp = {
        hidden: { opacity: 0, y: 30 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
    };

    const staggerContainer = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.15 }
        }
    };

    return (
        <div className="min-h-screen bg-[#FDFCFB] font-sans selection:bg-orange-100 selection:text-orange-900 border-none m-0 p-0 overflow-x-hidden">
            
            {/* ── HEADER ────────────────────────────────────────── */}
            <header className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100/50">
                <div className="container mx-auto max-w-7xl px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#F97316] to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                            <span className="text-white font-black text-xl tracking-tighter">L</span>
                        </div>
                        <span className="text-xl font-black text-gray-900 tracking-tight">Lumoscale<span className="text-[#F97316]">.HR</span></span>
                    </div>
                    
                    <nav className="hidden md:flex items-center gap-8 text-[13px] font-bold text-gray-500 uppercase tracking-widest">
                        <Link href="#features" className="hover:text-gray-900 transition-colors">Platform</Link>
                        <Link href="#metrics" className="hover:text-gray-900 transition-colors">Solutions</Link>
                        <Link href="/careers" className="hover:text-[#F97316] transition-colors">Careers Page</Link>
                    </nav>

                    <Button className="hidden md:flex bg-gray-900 hover:bg-black text-white rounded-full px-6 font-bold shadow-md h-10 transition-all hover:scale-105 active:scale-95" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>
                        HR Login
                    </Button>
                </div>
            </header>

            <main className="pt-20">
                {/* ── HERO & LOGIN SECTION ──────────────────────── */}
                <section className="relative overflow-hidden pt-20 pb-32 lg:pt-32 lg:pb-40">
                    {/* Decorative Background Elements */}
                    <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-to-bl from-orange-100/50 via-orange-50/20 to-transparent rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl -z-10 pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-tr from-gray-100 via-gray-50/40 to-transparent rounded-full translate-y-1/3 -translate-x-1/3 blur-3xl -z-10 pointer-events-none" />

                    <div className="container mx-auto max-w-7xl px-6 grid lg:grid-cols-2 gap-16 lg:gap-8 items-center relative z-10">
                        
                        {/* Hero Text (Left) */}
                        <motion.div 
                            initial="hidden" 
                            animate="visible" 
                            variants={staggerContainer}
                            className="max-w-2xl"
                        >
                            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-100 mb-8">
                                <span className="flex h-2 w-2 rounded-full bg-[#F97316] animate-pulse" />
                                <span className="text-[11px] font-black text-[#F97316] uppercase tracking-[0.2em]">Platform 2.0 Live</span>
                            </motion.div>
                            
                            <motion.h1 variants={fadeUp} className="text-5xl lg:text-[4rem] font-black text-gray-900 tracking-tight leading-[1.05] mb-6">
                                The Intelligence Layer for Modern Hiring.
                            </motion.h1>
                            
                            <motion.p variants={fadeUp} className="text-lg lg:text-xl text-gray-500 font-medium leading-relaxed mb-10 max-w-xl">
                                Replace fragmented tools with one unified AI platform. Automate resume screening, deploy secure technical assessments, and hire top talent 3x faster.
                            </motion.p>
                            
                            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                                <div className="flex items-center gap-3">
                                    <div className="h-12 w-12 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center text-gray-900">
                                        <ShieldCheck className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Enterprise</p>
                                        <p className="text-[14px] font-bold text-gray-900">Bank-Grade Security</p>
                                    </div>
                                </div>
                                <div className="hidden sm:block w-px h-12 bg-gray-200" />
                                <div className="flex items-center gap-3">
                                    <div className="h-12 w-12 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center text-gray-900">
                                        <BrainCircuit className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">AI Native</p>
                                        <p className="text-[14px] font-bold text-gray-900">Automated Screening</p>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>

                        {/* Login Card (Right) */}
                        <motion.div 
                            initial={{ opacity: 0, x: 40 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                            className="relative lg:ml-auto w-full max-w-[440px]"
                        >
                            {/* Card Glow */}
                            <div className="absolute inset-0 bg-gradient-to-b from-[#F97316]/20 to-transparent -m-4 rounded-[3rem] blur-2xl z-0" />
                            
                            <div className="relative z-10 bg-white rounded-[2.5rem] border border-gray-100 shadow-[0_20px_80px_-20px_rgba(0,0,0,0.1)] p-10 overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#F97316] to-orange-400" />
                                
                                <div className="mb-8">
                                    <h2 className="text-2xl font-black text-gray-900">Access Portal</h2>
                                    <p className="text-sm text-gray-500 font-medium mt-1">HR & Admin workspace login</p>
                                </div>

                                <form onSubmit={handleLogin} className="space-y-6">
                                    {errorMsg && (
                                        <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-100 flex items-start gap-3">
                                            <div className="mt-0.5 h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
                                            <p className="text-[12px] font-bold text-red-700">{errorMsg}</p>
                                        </div>
                                    )}
                                    
                                    <div className="space-y-2">
                                        <Label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">Work Email</Label>
                                        <div className="relative group">
                                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-[#F97316] transition-colors" />
                                            <Input
                                                type="email"
                                                placeholder="admin@lumoscale"
                                                required
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                className="pl-12 h-14 rounded-2xl bg-gray-50/50 border-gray-200 text-[15px] font-medium placeholder:text-gray-400 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-orange-500/10 focus-visible:border-[#F97316] transition-all"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center ml-1">
                                            <Label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Password</Label>
                                            <Link href="#" className="text-[11px] font-bold text-[#F97316] hover:text-orange-600">Recovery</Link>
                                        </div>
                                        <div className="relative group">
                                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-[#F97316] transition-colors" />
                                            <Input
                                                type="password"
                                                placeholder="••••••••"
                                                required
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                className="pl-12 h-14 rounded-2xl bg-gray-50/50 border-gray-200 text-[15px] font-medium placeholder:text-gray-400 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-orange-500/10 focus-visible:border-[#F97316] transition-all"
                                            />
                                        </div>
                                    </div>

                                    <Button 
                                        type="submit" 
                                        disabled={isLoading}
                                        className="w-full h-14 mt-4 bg-gray-900 hover:bg-black text-white rounded-2xl font-bold text-[15px] shadow-[0_10px_30px_rgba(0,0,0,0.1)] hover:shadow-[0_15px_40px_rgba(0,0,0,0.15)] hover:translate-y-[-2px] transition-all duration-300 group"
                                    >
                                        {isLoading ? (
                                            <span className="flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin"/> Authenticating</span>
                                        ) : (
                                            <span className="flex items-center justify-center gap-2">
                                                Go to Dashboard <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                            </span>
                                        )}
                                    </Button>

                                    <div className="pt-6 mt-6 border-t border-gray-100 w-full text-center">
                                        <p className="text-[12px] text-gray-500 font-medium">Use <span className="font-bold text-gray-900">admin@lumoscale</span> and <span className="font-bold text-gray-900">123456</span> for demo access.</p>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </div>
                </section>

                {/* ── METRICS / LOGOS SECTION ───────────────────── */}
                <section id="metrics" className="py-20 bg-white border-y border-gray-100">
                    <div className="container mx-auto max-w-7xl px-6">
                        <div className="text-center mb-12">
                            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Powering Next-Gen HR Teams</p>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-16">
                            {[
                                { value: "10x", label: "Faster Screening" },
                                { value: "99.9%", label: "Proctor Accuracy" },
                                { value: "65%", label: "Time Saved/Hire" },
                                { value: "10k+", label: "Assessments Run" }
                            ].map((stat, i) => (
                                <div key={i} className="text-center">
                                    <h3 className="text-4xl lg:text-5xl font-black text-gray-900 tracking-tight mb-2">{stat.value}</h3>
                                    <p className="text-sm font-bold text-gray-500">{stat.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── FEATURES GRID ─────────────────────────────── */}
                <section id="features" className="py-32 bg-gray-50/50">
                    <div className="container mx-auto max-w-7xl px-6">
                        <div className="max-w-2xl mb-16">
                            <h2 className="text-3xl lg:text-4xl font-black text-gray-900 tracking-tight mb-4">Everything you need to scale your team.</h2>
                            <p className="text-lg text-gray-500 font-medium">No more jumping between ATS systems and coding platforms. Lumoscale brings it all together under one secure roof.</p>
                        </div>

                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {/* Feature 1 */}
                            <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-xl transition-all duration-300">
                                <div className="h-14 w-14 rounded-2xl bg-orange-50/80 flex items-center justify-center mb-6 border border-orange-100/50">
                                    <Zap className="w-6 h-6 text-[#F97316]" />
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 mb-3">AI Resume Parsing</h3>
                                <p className="text-gray-500 font-medium leading-relaxed">Instantly extract skills, match requirements, and score candidates against your custom JD criteria without manual review.</p>
                            </div>
                            
                            {/* Feature 2 */}
                            <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-xl transition-all duration-300 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-5">
                                    <ShieldCheck className="w-32 h-32" />
                                </div>
                                <div className="relative z-10">
                                    <div className="h-14 w-14 rounded-2xl bg-gray-900 flex items-center justify-center mb-6">
                                        <ShieldCheck className="w-6 h-6 text-white" />
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-3">Browser Proctoring</h3>
                                    <p className="text-gray-500 font-medium leading-relaxed">Ensure assessment integrity with invisible multi-monitor detection, face tracking, and AI-powered Voice Activity Detection.</p>
                                </div>
                            </div>
                            
                            {/* Feature 3 */}
                            <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                                <div className="h-14 w-14 rounded-2xl bg-blue-50/80 flex items-center justify-center mb-6 border border-blue-100/50">
                                    <Users className="w-6 h-6 text-blue-500" />
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 mb-3">Automated Coding</h3>
                                <p className="text-gray-500 font-medium leading-relaxed">Integrated IDE assessments with automated test cases, code quality analysis, and instant grading for technical roles.</p>
                            </div>
                        </div>
                    </div>
                </section>
                
                {/* ── CTA BANNER ────────────────────────────────── */}
                <section className="py-24">
                    <div className="container mx-auto max-w-5xl px-6">
                        <div className="rounded-[3rem] bg-gray-900 p-12 lg:p-16 text-center relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                            <div className="relative z-10 max-w-2xl mx-auto space-y-8">
                                <h2 className="text-3xl lg:text-5xl font-black text-white tracking-tight">Ready to transform your hiring?</h2>
                                <p className="text-lg text-gray-400 font-medium">Join innovative teams building the future with Lumoscale. Access the dashboard above to see it in action.</p>
                                <Button 
                                    onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}
                                    className="bg-[#F97316] hover:bg-orange-600 text-white h-14 px-8 rounded-2xl font-bold text-[15px] shadow-[0_10px_30px_rgba(249,115,22,0.3)] transition-all"
                                >
                                    Login to Dashboard
                                </Button>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            {/* ── FOOTER ────────────────────────────────────────── */}
            <footer className="bg-white border-t border-gray-100 py-12">
                <div className="container mx-auto max-w-7xl px-6 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-md bg-gray-900 flex items-center justify-center">
                            <span className="text-white font-black text-[10px]">L</span>
                        </div>
                        <span className="text-sm font-bold text-gray-900 tracking-tight">Lumoscale Inc.</span>
                    </div>
                    
                    <div className="flex items-center gap-6 text-sm font-medium text-gray-400">
                        <Link href="/careers" className="hover:text-gray-900 transition-colors">Candidate Board</Link>
                        <span className="w-1 h-1 rounded-full bg-gray-200" />
                        <Link href="#" className="hover:text-gray-900 transition-colors">Privacy Policy</Link>
                        <span className="w-1 h-1 rounded-full bg-gray-200" />
                        <Link href="#" className="hover:text-gray-900 transition-colors">Terms of Service</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
