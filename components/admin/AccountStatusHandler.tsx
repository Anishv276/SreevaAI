"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Lock, ArrowRight, Phone } from "lucide-react";
import Link from "next/link";

interface AccountStatusHandlerProps {
    status: string;
}

export function AccountStatusHandler({ status }: AccountStatusHandlerProps) {
    if (status === "ACTIVE") return null;

    if (status === "CLOSED") {
        return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-950/80 backdrop-blur-md p-4">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="w-full max-w-md overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#1A1A1A] text-white shadow-[0_40px_100px_rgba(0,0,0,0.5)]"
                >
                    <div className="p-10 text-center">
                        <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-3xl bg-rose-500/10 text-rose-500 ring-1 ring-rose-500/20">
                            <Lock className="h-10 w-10" />
                        </div>
                        <h2 className="mb-4 text-3xl font-black tracking-tight">Account Restricted</h2>
                        <p className="mb-10 text-gray-400 font-medium leading-relaxed">
                            Your account has been closed. Please contact the system administrator to resolve this and restore access.
                        </p>
                        
                        <div className="space-y-4">
                            <button className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-8 py-4 text-sm font-black text-black transition-all hover:bg-gray-100 active:scale-95 shadow-lg">
                                <Phone className="h-4 w-4" />
                                Contact Support
                            </button>
                            <Link 
                                href="/login"
                                className="inline-block text-[11px] font-black uppercase tracking-[0.2em] text-gray-500 hover:text-white transition-colors"
                            >
                                Back to Login
                            </Link>
                        </div>
                    </div>
                    <div className="bg-white/[0.02] border-t border-white/5 py-5 text-center">
                        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-600">Secure Protocol Alpha</div>
                    </div>
                </motion.div>
            </div>
        );
    }

    if (status === "SUSPENDED") {
        return (
            <motion.div 
                initial={{ y: -100 }}
                animate={{ y: 0 }}
                className="sticky top-0 z-[100] w-full border-b border-amber-500/20 bg-amber-500/10 shadow-lg backdrop-blur-md"
            >
                <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-lg shadow-amber-500/20">
                            <AlertCircle className="h-5 w-5" />
                        </div>
                        <div className="sm:flex sm:items-center sm:gap-2">
                            <p className="text-sm font-bold text-amber-900">
                                Your account got suspended.
                            </p>
                            <p className="text-xs font-medium text-amber-700/80">
                                Please complete the subscription to proceed with your services.
                            </p>
                        </div>
                    </div>
                    
                    <Link 
                        href="/admin/settings?section=billing"
                        className="group flex flex-shrink-0 items-center gap-2 rounded-xl bg-amber-900 px-4 py-2.5 text-xs font-black text-white transition-all hover:bg-black active:scale-95 shadow-md"
                    >
                        COMPLETE SUBSCRIPTION
                        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                </div>
            </motion.div>
        );
    }

    return null;
}
