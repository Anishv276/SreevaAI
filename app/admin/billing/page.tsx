import { BillingContent } from "@/components/admin/billing/billing-content";
export default function AdminBillingPage() {
    return (
        <div className="space-y-6 pb-10 animate-in fade-in duration-500">
            <div>
                <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Subscription & Billing</h1>
                <p className="text-sm text-gray-400 mt-0.5">Manage your plan, credits, and billing</p>
            </div>
            <BillingContent />
        </div>
    );
}
