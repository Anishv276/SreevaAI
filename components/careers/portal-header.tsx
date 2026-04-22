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
                            Sreeva<span className="text-[#F97316]"> AI</span>
                        </span>
                    </Link>
                </div>

                <div className="flex items-center gap-4">
                    {/* Candidate Portal button removed as per user request */}
                </div>
            </div>
        </header>
    );
}
