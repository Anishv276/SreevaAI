"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { INTERVIEW_SUPPORT_EMAIL, getSupportComposeUrl, isOrgRestrictedStatus } from "@/lib/interview-quota";
import { useAdminOrg } from "@/context/admin-org-context";

type BannerState = "low" | "empty" | null;

export function LowCreditsBanner({ orgStatus }: { orgStatus?: string }) {
    const adminOrg = useAdminOrg();
    const [dismissed, setDismissed] = useState(false);

    // ⚡ Read from shared context — no fetch needed (was 2 API calls per page load)
    const liveStatus = adminOrg?.status || String(orgStatus || "").trim().toUpperCase();
    const isSuspended = isOrgRestrictedStatus(liveStatus);
    const total = Number(adminOrg?.interviewQuotaTotal ?? 0);
    const remaining = Number(adminOrg?.interviewQuotaRemaining ?? 0);

    let state: BannerState = null;
    if (isSuspended) {
        state = "empty";
    } else if (total > 0 && remaining === 0) {
        state = "empty";
    } else if (total > 0 && remaining > 0 && remaining <= Math.max(1, Math.ceil(total * 0.1))) {
        state = "low";
    }

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
                                : `You have only ${remaining.toFixed(0)} interviews left.`}
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
                        href={getSupportComposeUrl({
                            subject: isEmpty ? "Urgent: interview quota exhausted" : "Interview quota running low",
                            body: isEmpty 
                                ? "Hi support team,\n\nOur account is exhausted or suspended. Please help us recharge immediately to stop interruptions to our interviews or services.\n"
                                : "Hi support team,\n\nOur interview quota is running low. Please help us recharge.\n"
                        })}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl px-8 py-3 text-[15px] font-bold text-white transition-all duration-200 active:scale-95 hover:shadow-lg"
                        style={{
                            background: "linear-gradient(135deg, #F97316, #ea6608)",
                        }}
                    >
                        Contact Support
                    </a>
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
