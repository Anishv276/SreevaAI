import { BillingContent } from "@/components/admin/billing/billing-content";
import { CreditCard } from "lucide-react";

export default function AdminBillingPage() {
    return (
        <div className="space-y-6 pb-10 animate-in fade-in duration-500">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-[26px] font-bold text-gray-900 tracking-tight">Billing & Usage</h1>
                    <p className="text-[14px] text-gray-500 mt-1">Monitor interview usage and view billing details.</p>
                </div>
            </div>
            <BillingContent />
        </div>
    );
}
