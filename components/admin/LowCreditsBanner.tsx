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
                setInterviewsRemaining(data.interviewQuotaRemaining ?? 0);
                if (data.interviewQuotaTotal > 0 && data.interviewQuotaRemaining === 0) {
                    setState("empty");
                } else if (data.interviewQuotaTotal > 0 && data.interviewQuotaRemaining < 10) {
                    setState("low");
                }
            })
            .catch(() => {});
    }, []);

    if (!state || dismissed) return null;

    const isEmpty = state === "empty";

    return (
        <div
            className={`sticky top-0 z-50 w-full border-b border-red-700 text-white ${
                isEmpty ? "bg-red-600" : "bg-red-500"
            }`}
        >
            <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                            {isEmpty
                                ? "Account got suspended because no interviews are left."
                                : `Low interview quota warning. Only ${interviewsRemaining.toFixed(0)} interviews remaining.`}
                        </p>
                        <p className="truncate text-xs text-white/85">
                            {isEmpty
                                ? `Please recharge immediately and contact ${INTERVIEW_SUPPORT_EMAIL} for help.`
                                : "Increase the quota soon to avoid interruption."}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <a
                        href="/admin/billing"
                        className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
                    >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Go to Billing
                    </a>
                    {isEmpty && (
                        <a
                            href={getSupportComposeUrl({
                                subject: "Urgent: interview quota exhausted",
                                body: "Hi support team,\n\nOur interview quota has been exhausted and the account appears suspended. Please help us recharge immediately.\n",
                            })}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-white/30 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10"
                        >
                            Contact Support
                        </a>
                    )}
                    <button
                        onClick={() => setDismissed(true)}
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10"
                        aria-label="Dismiss"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
