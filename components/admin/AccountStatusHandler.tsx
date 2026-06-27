"use client";
import React from "react";
import { motion } from "framer-motion";
import { Lock, ArrowRight, Phone } from "lucide-react";
import Link from "next/link";
import { getSupportComposeUrl, isOrgRestrictedStatus } from "@/lib/interview-quota";
interface AccountStatusHandlerProps {
    status?: string;
}
export function AccountStatusHandler({ status }: AccountStatusHandlerProps) {
    const normalizedStatus = String(status || "").trim().toUpperCase();
    const isRestricted = isOrgRestrictedStatus(normalizedStatus);
    if (!isRestricted || normalizedStatus === "SUSPENDED") return null;
    if (normalizedStatus === "CLOSED") {
        return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="w-full max-w-lg overflow-hidden rounded-[2.25rem] border border-gray-200 bg-white text-slate-950 shadow-[0_30px_90px_rgba(15,23,42,0.22)]"
                >
                    <div className="border-b border-gray-100 bg-violet-50/80 px-8 py-7 text-center">
                        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
                            <Lock className="h-8 w-8" />
                        </div>
                        <h2 className="text-3xl font-black tracking-tight text-slate-950">
                            Account Closed
                        </h2>
                        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-600">
                            This account has been closed by a super admin. Please return to login to sign in with another account or contact support if this was unexpected.
                        </p>
                    </div>
                    <div className="space-y-4 px-8 py-8">
                        <Link
                            href="/login?from=admin"
                            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-950 px-6 py-4 text-sm font-black text-white transition-all hover:bg-gray-800 active:scale-[0.99]"
                        >
                            Back to Login
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                        <a
                            href={getSupportComposeUrl({
                                subject: "Account closure support request",
                                body: "Hi support team,\n\nMy account has been closed. Please review this closure.\n",
                            })}
                            target="_blank"
                            rel="noreferrer"
                            className="flex w-full items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white px-6 py-4 text-sm font-black text-gray-700 transition-all hover:bg-violet-50 active:scale-[0.99]"
                        >
                            <Phone className="h-4 w-4" />
                            Contact Support
                        </a>
                    </div>
                    <div className="border-t border-gray-100 bg-violet-50 px-8 py-4 text-center">
                        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Enterprise Security</div>
                    </div>
                </motion.div>
            </div>
        );
    }
    return null;
}
