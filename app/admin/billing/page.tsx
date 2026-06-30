import { BillingContent } from "@/components/admin/billing/billing-content";
import { CreditCard } from "lucide-react";

export default function AdminBillingPage() {
    return (
        <div className="space-y-6 pb-10 animate-in fade-in duration-500">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-[26px] font-bold text-gray-900 tracking-tight">Billing & Usage</h1>
                    <p className="text-[14px] text-gray-500 mt-1">Monitor interview usage, manage subscription, and view billing details.</p>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 transition-colors text-white text-[13px] font-bold shadow-sm">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>
                    Manage Subscription
                </button>
            </div>
            <BillingContent />
        </div>
    );
}
