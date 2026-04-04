"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Briefcase } from "lucide-react";

export function CandidateHeader() {
    return (
        <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md">
            <div className="container flex h-16 items-center justify-between">
                <Link href="/" className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                        <Briefcase className="h-5 w-5" />
                    </div>
                    <span className="text-xl font-bold tracking-tight text-gray-900">
                        Careera
                    </span>
                </Link>

                <nav className="hidden md:flex items-center gap-8">
                    <Link href="/" className="text-sm font-medium text-gray-700 hover:text-blue-600">
                        Home
                    </Link>
                    <Link href="/careers" className="text-sm font-medium text-gray-700 hover:text-blue-600">
                        Browse Jobs
                    </Link>
                </nav>

                <div className="flex items-center gap-4">
                    {/* Kiosk Mode - No user login */}
                </div>
            </div>
        </header>
    );
}
