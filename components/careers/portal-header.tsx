"use client";

import Link from "next/link";
import { Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PortalHeader() {
    return (
        <header className="sticky top-0 z-40 w-full border-b bg-white/70 backdrop-blur-xl border-orange-100/50 shadow-sm">
            <div className="container mx-auto flex h-16 items-center justify-between px-6 lg:px-8 max-w-7xl">
                <div className="flex items-center gap-6">
                    <Link href="/careers" className="flex items-center gap-2 group">
                        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#F97316] to-orange-400 flex items-center justify-center text-white shadow-lg shadow-orange-500/20 group-hover:rotate-6 transition-transform">
                            <Briefcase className="h-5 w-5" />
                        </div>
                        <span className="text-xl font-black tracking-tight text-gray-900">
                            Lumoscale<span className="text-[#F97316]">.ai</span>
                        </span>
                    </Link>
                </div>

                <div className="flex items-center gap-4">
                    <Link href="/careers">
                        <Button variant="ghost" className="hidden md:flex h-8 px-4 rounded-full bg-orange-50 hover:bg-orange-100 text-[#F97316] text-[10px] font-black uppercase tracking-widest border border-orange-100 transition-all">
                            Candidate Portal
                        </Button>
                    </Link>


                </div>
            </div>
        </header>
    );
}

