"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

type BannerState = "low" | "empty" | null;

export function LowCreditsBanner() {
    const [state, setState] = useState<BannerState>(null);
    const [interviewsRemaining, setInterviewsRemaining] = useState(0);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        fetch("/api/admin/credits")
            .then(r => r.json())
            .then(data => {
                setInterviewsRemaining(data.interviewQuotaRemaining ?? 0);
                if (data.interviewQuotaRemaining === 0) {
                    setState("empty");
                } else if (data.interviewQuotaRemaining < 10) {
                    setState("low");
                }
            })
            .catch(() => {});
    }, []);

    if (!state || dismissed) return null;

    const isEmpty = state === "empty";

    return (
        <div
            className={`fixed top-0 left-0 right-0 z-50 border-b text-white shadow-[0_16px_40px_rgba(0,0,0,0.16)] backdrop-blur-md md:left-[240px] md:w-[calc(100%-240px)] ${
                isEmpty
                    ? "border-red-500/20 bg-gradient-to-r from-red-600 via-red-600 to-rose-600"
                    : "border-amber-500/20 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600"
            }`}
        >
            <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                        <AlertTriangle className="h-4.5 w-4.5 flex-shrink-0" />
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-black tracking-tight">
                            {isEmpty
                                ? "Interview quota exhausted. New drives and interview links are blocked."
                                : `Low interview quota warning. Only ${interviewsRemaining.toFixed(0)} interviews remaining.`}
                        </p>
                        <p className="truncate text-xs font-medium text-white/80">
                            {isEmpty
                                ? "Increase the org quota now to restore access and keep hiring moving."
                                : "Increase the quota soon to avoid interruption."}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <a
                        href="/admin/billing"
                        className="group inline-flex items-center gap-2 rounded-full border border-white/20 bg-white px-5 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-gray-950 shadow-[0_10px_24px_rgba(0,0,0,0.18)] transition-all hover:-translate-y-0.5 hover:bg-white/95 active:translate-y-0"
                    >
                        <AlertTriangle className="h-3.5 w-3.5 text-gray-900 transition-transform group-hover:scale-110" />
                        Go to Billing
                    </a>
                    <button
                        onClick={() => setDismissed(true)}
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20"
                        aria-label="Dismiss"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
