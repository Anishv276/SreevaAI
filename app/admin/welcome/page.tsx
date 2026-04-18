"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
    Sparkles, 
    ArrowRight, 
    Building2, 
    User,
    CheckCircle2,
    Rocket
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function WelcomePage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState({ name: "", company: "", logoUrl: "" });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [profRes, orgRes] = await Promise.all([
                    fetch("/api/admin/profile"),
                    fetch("/api/admin/organization")
                ]);
                
                const prof = await profRes.json();
                const org = await orgRes.json();
                
                setData({
                    name: prof.name || "Admin",
                    company: org.name || "Your Organization",
                    logoUrl: org.logoUrl || ""
                });
            } catch (err) {
                console.error("Failed to fetch welcome data", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, []);

    const handleGoToDashboard = () => {
        router.push("/admin");
    };

    if (isLoading) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-white">
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center gap-4"
                >
                    <div className="h-12 w-12 rounded-2xl border-2 border-orange-500 border-t-transparent animate-spin" />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Initializing Workspace</p>
                </motion.div>
            </div>
        );
    }

    return (
        <main className="relative h-screen w-full overflow-hidden bg-white flex items-center justify-center font-sans tracking-tight">
            {/* â•â•â• Background Mesh Gradients â•â•â• */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#F97316]/10 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse delay-700" />
                <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-orange-200/20 rounded-full blur-[100px]" />
            </div>

            {/* â•â•â• Content â•â•â• */}
            <div className="relative z-10 w-full max-w-2xl px-6">
                <AnimatePresence>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                        className="relative"
                    >
                        {/* â”€â”€ Outer Glow & Card â”€â”€ */}
                        <div className="absolute inset-x-0 bottom-[-20px] h-20 bg-orange-500/10 blur-[60px] rounded-full" />
                        
                        <div className="bg-white/80 backdrop-blur-3xl border border-white/50 rounded-[3rem] p-12 shadow-[0_40px_100px_rgba(0,0,0,0.08)] relative overflow-hidden group">
                            {/* Subtle Texture Overlay */}
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.02] pointer-events-none" />
                            
                            {/* Success Indicator */}
                            <motion.div 
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
                                className="h-20 w-20 bg-orange-500 text-white rounded-3xl flex items-center justify-center mx-auto mb-10 shadow-[0_15px_40px_rgba(249,115,22,0.3)] relative"
                            >
                                <Sparkles className="h-10 w-10 animate-bounce" />
                                <motion.div 
                                    animate={{ scale: [1, 1.2, 1] }}
                                    transition={{ repeat: Infinity, duration: 2 }}
                                    className="absolute inset-0 rounded-3xl border border-orange-400 opacity-50"
                                />
                            </motion.div>

                            {/* Text Header */}
                            <div className="text-center space-y-3 mb-12">
                                <motion.h1 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.6 }}
                                    className="text-5xl font-black text-gray-900 italic tracking-tighter leading-none"
                                >
                                    Welcome Home, <br />
                                    <span className="text-orange-500 uppercase not-italic tracking-tight text-4xl">{data.name}</span>
                                </motion.h1>
                                <motion.div 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.8 }}
                                    className="flex items-center justify-center gap-3 text-gray-400 font-bold uppercase tracking-widest text-[11px]"
                                >
                                    <div className="h-[1px] w-6 bg-gray-200" />
                                    <span>Workspace Ready for Deployment</span>
                                    <div className="h-[1px] w-6 bg-gray-200" />
                                </motion.div>
                            </div>

                            {/* Branding Info */}
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 1 }}
                                className="bg-gray-50/50 border border-gray-100/50 rounded-2xl p-6 mb-12 flex items-center justify-between"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-xl bg-gray-900 flex items-center justify-center text-white font-black shadow-lg">
                                        {data.logoUrl ? (
                                            <img src={data.logoUrl} className="h-full w-full object-contain p-2" alt="Logo" />
                                        ) : (
                                            data.company[0].toUpperCase()
                                        )}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Organization</span>
                                        <span className="text-lg font-black text-gray-900 tracking-tight">{data.company}</span>
                                    </div>
                                </div>
                                <div className="h-10 w-10 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shadow-inner">
                                    <CheckCircle2 className="h-5 w-5" />
                                </div>
                            </motion.div>

                            {/* Action Button */}
                            <motion.button
                                whileHover={{ y: -5, boxShadow: "0 20px 40px rgba(0,0,0,0.15)" }}
                                whileTap={{ scale: 0.95 }}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 1.2 }}
                                onClick={handleGoToDashboard}
                                className="group relative w-full h-16 bg-gray-900 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-sm flex items-center justify-center gap-6 overflow-hidden transition-all"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                <span className="relative z-10">Enter Dashboard</span>
                                <ArrowRight className="h-5 w-5 relative z-10 group-hover:translate-x-2 transition-transform" />
                            </motion.button>
                        </div>
                    </motion.div>
                </AnimatePresence>

                {/* Footer Deco */}
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.5 }}
                    className="mt-12 flex items-center justify-between px-6"
                >
                    <div className="flex items-center gap-4 text-gray-400">
                        <Rocket className="h-4 w-4" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Next-Gen Hiring Console v1.0</span>
                    </div>
                    <div className="flex gap-1">
                        <div className="h-1 w-1 rounded-full bg-orange-500 animate-bounce" />
                        <div className="h-1 w-1 rounded-full bg-orange-500 animate-bounce delay-100" />
                        <div className="h-1 w-1 rounded-full bg-orange-500 animate-bounce delay-200" />
                    </div>
                </motion.div>
            </div>
        </main>
    );
}

