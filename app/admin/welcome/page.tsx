"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
    ArrowRight, 
    CheckCircle2,
    Rocket
} from "lucide-react";
import { useAdminOrg } from "@/context/admin-org-context";
export default function WelcomePage() {
    const router = useRouter();
    const adminOrg = useAdminOrg();
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState({
        name: "",
        company: adminOrg?.name || "Your Organization",
    });
    useEffect(() => {
        const fetchData = async () => {
            try {
                const profRes = await fetch("/api/admin/profile");
                const prof = profRes.ok ? await profRes.json().catch(() => ({})) : {};
                setData({
                    name: prof.name || "Admin",
                    company: adminOrg?.name || "Your Organization",
                });
            } catch (err) {
                console.error("Failed to fetch welcome data", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [adminOrg?.name]);
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
                    <div className="h-10 w-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Loading Workspace</p>
                </motion.div>
            </div>
        );
    }
    return (
        <main className="relative h-screen w-full overflow-hidden flex items-center justify-center font-sans tracking-tight">
            {/* --- Background Mesh Gradients --- */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#7C3AED]/10 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse delay-700" />
                <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-violet-200/20 rounded-full blur-[100px]" />
            </div>
            {/* --- Content --- */}
            <div className="relative z-10 w-full max-w-2xl px-6">
                <AnimatePresence>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                        className="relative"
                    >
                        <div className="bg-white border border-gray-100 rounded-3xl p-10 shadow-xl relative overflow-hidden group">
                            {/* Subtle Texture Overlay */}
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.02] pointer-events-none" />
                            {/* Success Indicator */}
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="h-16 w-16 bg-violet-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg relative"
                            >
                                <Rocket className="h-8 w-8" />
                            </motion.div>
                            {/* Text Header */}
                            <div className="text-center space-y-2 mb-10">
                                <motion.h1 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-4xl font-bold text-gray-900 tracking-tight"
                                >
                                    Welcome Home, <br />
                                    <span className="text-violet-500 text-3xl">{data.name}</span>
                                </motion.h1>
                                <motion.div 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex items-center justify-center gap-3 text-gray-400 font-bold uppercase tracking-widest text-[9px]"
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
                                    <div className="h-12 w-12 rounded-xl bg-violet-500 flex items-center justify-center text-white font-bold shadow-md">
                                        {data.company[0].toUpperCase()}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">Organization</span>
                                        <span className="text-lg font-bold text-gray-900 tracking-tight">{data.company}</span>
                                    </div>
                                </div>
                                <div className="h-10 w-10 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shadow-inner">
                                    <CheckCircle2 className="h-5 w-5" />
                                </div>
                            </motion.div>
                            {/* Action Button */}
                            <motion.button
                                whileHover={{ y: -2 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleGoToDashboard}
                                className="w-full h-14 bg-gray-900 text-white rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all hover:bg-black"
                            >
                                <span className="relative z-10">Enter Dashboard</span>
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                            </motion.button>
                        </div>
                    </motion.div>
                </AnimatePresence>
                {/* Footer removed */}
            </div>
        </main>
    );
}
