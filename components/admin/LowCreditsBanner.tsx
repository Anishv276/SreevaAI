"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { INTERVIEW_SUPPORT_EMAIL, getSupportComposeUrl } from "@/lib/interview-quota";

type BannerState = "low" | "empty" | null;

export function LowCreditsBanner() {
    const [state, setState] = useState<BannerState>(null);
    const [interviewsRemaining, setInterviewsRemaining] = useState(0);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        fetch("/api/admin/credits")
            .then(r => r.json())
            .then(data => {
                const total = Number(data.interviewQuotaTotal ?? 0);
                const remaining = Number(data.interviewQuotaRemaining ?? 0);
                setInterviewsRemaining(remaining);
                if (total > 0 && remaining === 0) {
                    setState("empty");
                } else if (total > 0 && remaining > 0 && remaining <= Math.max(1, Math.ceil(total * 0.1))) {
                    setState("low");
                }
            })
            .catch(() => {});
    }, []);

    if (!state || dismissed) return null;

    const isEmpty = state === "empty";

    return (
        <div
            className={`sticky top-0 z-50 w-full border-b ${
                isEmpty
                    ? "border-red-200 bg-white text-red-700"
                    : "border-orange-200 bg-white text-orange-700"
            }`}
        >
            <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isEmpty ? "bg-red-50 text-red-600" : "bg-orange-50 text-orange-600"}`}>
                        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    </div>
                    <div className="min-w-0">
                        <p className={`truncate text-sm font-semibold ${isEmpty ? "text-red-700" : "text-orange-700"}`}>
                            {isEmpty
                                ? "Your account got suspended because no interviews are left."
                                : `You have only ${interviewsRemaining.toFixed(0)} interviews left.`}
                        </p>
                        <p className={`truncate text-xs ${isEmpty ? "text-red-600/90" : "text-orange-600/90"}`}>
                            {isEmpty
                                ? `Please recharge immediately to stop interruptions to your interviews or services, and contact ${INTERVIEW_SUPPORT_EMAIL}.`
                                : "Please recharge soon to stop interruptions to your interviews or services."}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <a
                        href="/admin/billing"
                        className="inline-flex items-center gap-2 rounded-xl px-8 py-3 text-[15px] font-bold text-white transition-all duration-200 active:scale-95 hover:shadow-lg"
                        style={{
                            background: "linear-gradient(135deg, #F97316, #ea6608)",
                        }}
                    >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Go to Billing
                    </a>
                    {isEmpty && (
                        <a
                            href={getSupportComposeUrl({
                                subject: "Urgent: interview quota exhausted",
                                body: "Hi support team,\n\nOur account got suspended because no interviews are left. Please help us recharge immediately to stop interruptions to our interviews or services.\n",
                            })}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50"
                        >
                            Contact Support
                        </a>
                    )}
                    <button
                        onClick={() => setDismissed(true)}
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-current transition-colors hover:bg-black/5"
                        aria-label="Dismiss"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
