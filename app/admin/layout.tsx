import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/sidebar";
import { Suspense } from "react";
import { getSession, isAdminRole, isSuperAdminRole } from "@/lib/auth";
import { redirect } from "next/navigation";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
import { cn } from "@/lib/utils";
import { OnboardingRedirect } from "@/components/admin/onboarding-redirect";
import { Toaster } from "@/components/ui/toast-custom";
import { AdminStatusGate } from "@/components/admin/AdminStatusGate";
import { LowCreditsBanner } from "../../components/admin/LowCreditsBanner";
import { prisma } from "@/lib/prisma";
import { AdminOrgProvider } from "@/context/admin-org-context";
import "../editorial.css";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const session = await getSession();
    if (!session) {
        redirect("/login?from=admin");
    }
    // Fetch all org data server-side so the client context is pre-seeded (zero client fetches on load)
    let orgData: Record<string, any> = { status: "ACTIVE", onboardingComplete: session.onboardingComplete === true };
    if (session.orgId) {
        try {
            const org = await prisma.organization.findUnique({
                where: { id: session.orgId },
                select: {
                    status: true,
                    statusControl: true,
                    onboardingComplete: true,
                    plan: true,
                    name: true,
                    website: true,
                    voiceId: true,
                    allowedVoices: true,
                    deepgramModel: true,
                    interviewQuotaTotal: true,
                    interviewQuotaUsed: true,
                    maxActiveDrives: true,
                    _count: { select: { drives: true } },
                },
            });
            if (org) {
                // Derive effective status inline — same logic as getEffectiveOrgStatus but no extra DB round-trip
                let effectiveStatus = String(org.status || "ACTIVE").toUpperCase();
                if (org.statusControl === "QUOTA" && org.interviewQuotaTotal > 0 && org.interviewQuotaUsed >= org.interviewQuotaTotal) {
                    effectiveStatus = "QUOTA_EXCEEDED";
                }
                orgData = {
                    ...org,
                    status: effectiveStatus,
                    activeDriveCount: (org as any)._count?.drives ?? 0,
                };
            }
        } catch (error) {
            console.error("[admin/layout] Failed to load org state:", error);
        }
    }
    // Allow Super Admins to access admin routes for "inspections"
    if (isSuperAdminRole(session.role)) {
        // We skip the redirect to /super-admin here to allow viewing admin dashboards
    } else if (!isAdminRole(session.role)) {
        redirect("/login");
    }
    // Real-time synchronization: prioritize DB state over session cookie for onboarding UI
    const needsOnboarding = orgData.onboardingComplete !== true;
    const showSidebar = !needsOnboarding;
    return (
        <>
        <AdminOrgProvider
            status={orgData.status}
            orgId={session.orgId}
        initialData={{
            status: orgData.status,
            name: orgData.name,
            plan: orgData.plan,
            website: orgData.website,
            voiceId: orgData.voiceId,
            allowedVoices: orgData.allowedVoices,
            deepgramModel: orgData.deepgramModel,
            interviewQuotaTotal: orgData.interviewQuotaTotal != null ? Number(orgData.interviewQuotaTotal) : undefined,
            interviewQuotaUsed: orgData.interviewQuotaUsed != null ? Number(orgData.interviewQuotaUsed) : undefined,
            interviewQuotaRemaining: orgData.interviewQuotaTotal != null
                ? Math.max(0, Number(orgData.interviewQuotaTotal) - Number(orgData.interviewQuotaUsed || 0))
                : undefined,
            maxActiveDrives: orgData.maxActiveDrives ?? undefined,
            activeDriveCount: orgData.activeDriveCount ?? undefined,
            }}
        >
        <AdminStatusGate initialStatus={orgData.status}>
        <div className="flex min-h-screen bg-[#F8F9FB] relative font-sans editorial-theme">
            {/*  Background Deck: Aurora Blobs  */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div 
                    className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-orange-100/30 blur-[120px] animate-[aurora-float_18s_infinite_ease-in-out]"
                />
                <div 
                    className="absolute bottom-[-10%] right-[-5%] w-[35%] h-[35%] rounded-full bg-blue-50/40 blur-[100px] animate-[aurora-float_22s_infinite_ease-in-out_reverse]" 
                />
                <div 
                    className="absolute top-[20%] right-[10%] w-[25%] h-[25%] rounded-full bg-purple-50/20 blur-[80px] animate-[aurora-float_25s_infinite_ease-in-out]" 
                />
            </div>
            {/* Real-time State Synchronization */}
            <OnboardingRedirect needsOnboarding={needsOnboarding} />
                <div className="relative z-10 flex w-full">
                    {showSidebar && (
                        <Suspense fallback={<div className="w-64 bg-white/50 animate-pulse" />}>
                            <Sidebar />
                        </Suspense>
                    )}
                    <div id="admin-main-wrapper" className={cn(
                        "flex-1 min-w-0 transition-all duration-500 ease-in-out",
                        showSidebar && "md:pl-[240px]"
                    )}>
                    <style dangerouslySetInnerHTML={{ __html: `
                        body.reports-mode #global-admin-sidebar { display: none !important; }
                        body.reports-mode #admin-main-wrapper { padding-left: 0 !important; }
                        body.reports-mode #admin-content-inner { padding: 0 !important; max-width: 100% !important; }
                    ` }} />
                    <main className="min-h-screen">
                        <LowCreditsBanner orgStatus={orgData.status} />
                        <div id="admin-content-inner" className="max-w-full mx-auto px-4 pb-4 pt-4 md:px-8 md:pb-8 lg:px-10 lg:pb-10">
                            {children}
                        </div>
                    </main>
                </div>
            </div>
        </div>
        </AdminStatusGate>
        </AdminOrgProvider>
        <Toaster />
        </>
    );
}
