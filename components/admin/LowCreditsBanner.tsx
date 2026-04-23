"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X, CreditCard } from "lucide-react";

type BannerState = "low" | "empty" | null;

export function LowCreditsBanner() {
    const [state, setState] = useState<BannerState>(null);
    const [creditsRemaining, setCreditsRemaining] = useState(0);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        fetch("/api/admin/credits")
            .then(r => r.json())
            .then(data => {
                setCreditsRemaining(data.creditsRemaining ?? 0);
                if (data.creditsRemaining === 0) {
                    setState("empty");
                } else if (data.creditsRemaining < 10) {
                    setState("low");
                }
            })
            .catch(() => {});
    }, []);

    if (!state || dismissed) return null;

    const isEmpty = state === "empty";

    return (
        <div className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-4 px-6 py-3 text-white shadow-lg ${isEmpty ? "bg-red-600" : "bg-amber-500"}`}>
            <div className="flex items-center gap-3">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm font-semibold">
                    {isEmpty
                        ? "Credits exhausted. New drives and interview links are blocked."
                        : `Low credits warning — only ${creditsRemaining.toFixed(2)} credits remaining. Recharge soon to avoid disruption.`}
                </span>
                <a
                    href="/admin/billing"
                    className="ml-2 flex items-center gap-1.5 rounded-md bg-white/20 px-3 py-1 text-xs font-bold hover:bg-white/30 transition-colors"
                >
                    <CreditCard className="h-3.5 w-3.5" />
                    Go to Billing
                </a>
            </div>
            <button
                onClick={() => setDismissed(true)}
                className="flex-shrink-0 rounded p-1 hover:bg-white/20 transition-colors"
                aria-label="Dismiss"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}
