"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Briefcase, ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

export function CandidateHeader() {
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
            }
        };
        checkAuth();
    }, []);

    return (
        <header className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white/80 backdrop-blur-xl">
            <div className="max-w-7xl mx-auto h-16 px-6 flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <Link href="/" className="flex items-center gap-2 group">
                        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#F97316] to-orange-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/10 group-hover:rotate-6 transition-transform">
                            <Briefcase className="h-5 w-5" />
                        </div>
                        <span className="text-xl font-black tracking-tight text-gray-900">
                            Lumoscale<span className="text-[#F97316]">.ai</span>
                        </span>
                    </Link>
                </div>

                <div className="flex items-center gap-4">
                    {session && (
                        <Link href={session.role === "SUPER_ADMIN" ? "/super-admin" : "/admin"}>
                            <button className="flex items-center gap-2 h-10 px-4 bg-gray-100 hover:bg-gray-200 text-gray-900 font-black text-[10px] tracking-widest uppercase rounded-xl transition-all group">
                                <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-1" />
                                BACK TO DASHBOARD
                            </button>
                        </Link>
                    )}
                    <div className="hidden md:flex px-3 py-1 rounded-full bg-orange-50 text-[#F97316] text-[10px] font-black uppercase tracking-widest border border-orange-100">
                        Candidate Portal
                    </div>
                </div>
            </div>
        </header>
    );
}

