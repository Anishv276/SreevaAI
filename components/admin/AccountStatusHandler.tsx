"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Lock, ArrowRight, Phone, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSupportComposeUrl } from "@/lib/interview-quota";

interface AccountStatusHandlerProps {
    status: string;
}

const RESTRICTED_ROUTES = ["/admin/create-drive"];

export function AccountStatusHandler({ status }: AccountStatusHandlerProps) {
    const pathname = usePathname();
    const isRestrictedPath = RESTRICTED_ROUTES.some(route => pathname?.startsWith(route));

    if (status === "ACTIVE") return null;

    if (status === "CLOSED" || (status === "SUSPENDED" && isRestrictedPath)) {
        return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-950/80 backdrop-blur-md p-4">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="w-full max-w-md overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#1A1A1A] text-white shadow-[0_40px_100px_rgba(0,0,0,0.5)]"
                >
                    <div className="p-10 text-center">
                        <div className={`mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-3xl ${status === "CLOSED" ? "bg-rose-500/10 text-rose-500 ring-1 ring-rose-500/20" : "bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20"}`}>
                            {status === "CLOSED" ? <Lock className="h-10 w-10" /> : <ShieldAlert className="h-10 w-10" />}
                        </div>
                        <h2 className="mb-4 text-3xl font-black tracking-tight">
                            {status === "CLOSED" ? "Account Restricted" : "Action Restricted"}
                        </h2>
                        <p className="mb-10 text-gray-400 font-medium leading-relaxed">
                            {status === "CLOSED" 
                                ? "Your account has been closed. Please contact the system administrator to resolve this and restore access."
                                : "Your account got suspended because no interviews are left. Please recharge immediately and contact support@sreevaai.com."}
                        </p>
                        
                        <div className="space-y-4">
                            {status === "SUSPENDED" ? (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <Link
                                        href="/admin/billing"
                                        className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-8 py-4 text-sm font-black text-black transition-all hover:bg-gray-100 active:scale-95 shadow-lg"
                                    >
                                        <ArrowRight className="h-4 w-4" />
                                        Recharge Now
                                    </Link>
                                    <a
                                        href={getSupportComposeUrl({
                                            subject: "Urgent: interview quota exhausted",
                                            body: "Hi support team,\n\nOur account got suspended because no interviews are left. Please help us recharge immediately.\n",
                                        })}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-8 py-4 text-sm font-black text-white transition-all hover:bg-white/10 active:scale-95 shadow-lg"
                                    >
                                        <Phone className="h-4 w-4" />
                                        Contact Support
                                    </a>
                                </div>
                            ) : (
                                <a
                                    href={getSupportComposeUrl({
                                        subject: "Account support request",
                                        body: "Hi support team,\n\nMy account is currently closed. Please help me review this.\n",
                                    })}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-8 py-4 text-sm font-black text-black transition-all hover:bg-gray-100 active:scale-95 shadow-lg"
                                >
                                    <Phone className="h-4 w-4" />
                                    Contact Support
                                </a>
                            )}
                            <Link 
                                href="/admin"
                                className="inline-block text-[11px] font-black uppercase tracking-[0.2em] text-gray-500 hover:text-white transition-colors"
                            >
                                Back to Dashboard
                            </Link>
                        </div>
                    </div>
                    <div className="bg-white/[0.02] border-t border-white/5 py-5 text-center">
                        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-600">Enterprise Security</div>
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
                className="sticky top-0 z-[100] w-full border-b border-red-200 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)] md:ml-[240px] md:w-[calc(100%-240px)]"
            >
                <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 shadow-sm ring-1 ring-red-100">
                            <AlertCircle className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-black text-red-700">
                                Your account got suspended because no interviews are left.
                            </p>
                            <p className="truncate text-xs font-medium text-red-600/90">
                                Please recharge immediately to stop interruptions to your interviews or services, and contact support@sreevaai.com for help.
                            </p>
                        </div>
                    </div>
                    
                    <Link 
                        href="/admin/billing"
                        className="group ml-auto flex flex-shrink-0 items-center gap-2 rounded-xl px-8 py-3 text-[15px] font-bold text-white transition-all duration-200 active:scale-95 hover:shadow-lg"
                        style={{ background: "linear-gradient(135deg, #F97316, #ea6608)" }}
                    >
                        Go to Billing
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                </div>
            </motion.div>
        );
    }

    return null;
}

