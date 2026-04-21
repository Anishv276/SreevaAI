"use client";

import React, { useEffect, useState } from "react";
import { Mail, Loader2, History, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import { toast } from "@/components/ui/toast-custom";
import { useSearchParams, useRouter } from "next/navigation";
import { ActionConfirmModal } from "@/components/ui/action-confirm-modal";

export function IntegrationsContent() {
    const { user } = useAuth();
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [googleStatus, setGoogleStatus] = useState<{ isConnected: boolean; email: string | null }>({ isConnected: false, email: null });
    const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false);
    
    const searchParams = useSearchParams();
    const router = useRouter();

    const fetchGoogleStatus = async () => {
        try {
            const res = await fetch("/api/admin/integrations/google");
            if (res.ok) setGoogleStatus(await res.json());
        } catch (err) {
            console.error("Failed to fetch Google status:", err);
        }
    };

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            try {
                await fetchGoogleStatus();
            } finally {
                setIsLoading(false);
            }
        };

        if (user) load();
    }, [user]);

    // Handle Redirect Success/Error
    useEffect(() => {
        const success = searchParams.get("google_success");
        const error = searchParams.get("google_error");

        if (success) {
            toast.success("Google integration connected successfully!");
            // Clean URL
            const url = new URL(window.location.href);
            url.searchParams.delete("google_success");
            router.replace(url.pathname);
        }

        if (error) {
            toast.error(error === "access_denied" ? "Authorization denied" : `Connection failed: ${error}`);
            // Clean URL
            const url = new URL(window.location.href);
            url.searchParams.delete("google_error");
            router.replace(url.pathname);
        }
    }, [searchParams, router]);

    if (isLoading) {
        return (
            <div className="flex h-[450px] items-center justify-center">
                <Loader2 className="h-8 w-8 text-[#F97316] animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-8 max-w-3xl pb-16">
            <div className="flex items-center gap-4 group">
                <div className="h-12 w-1.5 bg-gradient-to-b from-[#F97316] to-orange-400 rounded-full shadow-[0_0_12px_rgba(249,115,22,0.4)] transition-all duration-300 group-hover:h-14" />
                <div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Integrations</h1>
                    <p className="text-gray-500 font-medium mt-1 text-base">Connect Google so emails send directly from your workspace</p>
                </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                    <div className="flex items-center gap-4">
                        <div className="h-11 w-11 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center">
                            <Mail className="h-5 w-5 text-[#F97316]" />
                        </div>
                        <div>
                            <h3 className="text-[16px] font-bold text-gray-900">Google OAuth</h3>
                            <p className="text-[13px] text-gray-400 font-medium mt-0.5">
                                {googleStatus.isConnected
                                    ? <span className="text-green-600 font-bold">Connected - {googleStatus.email}</span>
                                    : "Send platform emails via your Google account"}
                            </p>
                        </div>
                    </div>
                    <div className={cn(
                        "h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 border",
                        googleStatus.isConnected
                            ? "bg-green-50 border-green-100 text-green-600"
                            : "bg-white border-gray-200 text-gray-400"
                    )}>
                        <Zap className="h-4 w-4" />
                    </div>
                </div>

                <div className="px-6 pb-6 pt-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl bg-blue-50/40 border border-blue-100/60">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                                    <Zap className="w-3.5 h-3.5 text-blue-600" />
                                </div>
                                <h5 className="text-[13px] font-bold text-blue-900">Better Deliverability</h5>
                            </div>
                            <p className="text-[12px] text-blue-800/70 leading-relaxed">Emails are sent through Gmail for better inbox placement.</p>
                        </div>
                        <div className="p-4 rounded-xl bg-orange-50/40 border border-orange-100/60">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center">
                                    <History className="w-3.5 h-3.5 text-orange-600" />
                                </div>
                                <h5 className="text-[13px] font-bold text-orange-900">Sent Folder Sync</h5>
                            </div>
                            <p className="text-[12px] text-orange-800/70 leading-relaxed">All outgoing messages appear in your Gmail Sent folder.</p>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        {googleStatus.isConnected ? (
                            <>
                                <button
                                    onClick={() => setIsDisconnectModalOpen(true)}
                                    disabled={isProcessing}
                                    className="h-11 px-6 rounded-xl bg-gray-900 text-white text-[13px] font-bold hover:bg-black transition-all shadow-md disabled:opacity-50"
                                >
                                    {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disconnect"}
                                </button>

                                <ActionConfirmModal
                                    isOpen={isDisconnectModalOpen}
                                    onClose={() => setIsDisconnectModalOpen(false)}
                                    onConfirm={async () => {
                                        setIsDisconnectModalOpen(false);
                                        setIsProcessing(true);
                                        try {
                                            const res = await fetch("/api/admin/integrations/google", { method: "DELETE" });
                                            if (res.ok) {
                                                toast.success("Disconnected successfully");
                                                setGoogleStatus({ isConnected: false, email: null });
                                            } else {
                                                toast.error("Failed to disconnect");
                                            }
                                        } catch (err) {
                                            toast.error("An error occurred during disconnection");
                                        } finally {
                                            setIsProcessing(false);
                                        }
                                    }}
                                    title="Disconnect Google Integration?"
                                    description="You will need to reconnect to send platform emails from this workspace again."
                                    confirmText="Disconnect"
                                    variant="danger"
                                />
                            </>
                        ) : (
                            <Button
                                onClick={() => { 
                                    window.location.href = "/api/admin/integrations/google/authorize?next=/admin/integrations"; 
                                }}
                                className="h-11 px-6 rounded-xl bg-gray-900 text-white text-[13px] font-bold hover:bg-black transition-all shadow-md"
                            >
                                Connect Gmail
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
