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
    let orgData: Record<string, any> = { status: "ACTIVE", isOnboardingComplete: session.onboardingComplete === true };
    if (session.orgId) {
        try {
            const org = await prisma.organizationDetails.findUnique({
                where: { id: session.orgId },
                select: {
                    orgStatus: true,
                    quotaControlMode: true,
                    isOnboardingComplete: true,
                    billingPlan: true,
                    name: true,
                    allowedVoiceIds: true,
                    sttModel: true,
                    totalInterviewsAllowed: true,
                    totalInterviewsUsed: true,
                    maxActiveJobs: true,
                    _count: { select: { jobs: { where: { isDeleted: false } } } },
                },
            });
            if (org) {
                // Derive effective status inline -- same logic as getEffectiveOrgStatus but no extra DB round-trip
                let effectiveStatus = String(org.orgStatus || "ACTIVE").toUpperCase();
                if (org.quotaControlMode === "QUOTA" && org.totalInterviewsAllowed > 0 && org.totalInterviewsUsed >= org.totalInterviewsAllowed) {
                    effectiveStatus = "QUOTA_EXCEEDED";
                }
                orgData = {
                    ...org,
                    status: effectiveStatus,
                    activeJobCount: (org as any)._count?.jobs ?? 0,
                };
            }
        } catch (error) {
            console.error("[admin/layout] Failed to load org state:", error);
        }
    }
    // All authenticated users can access admin (SuperAdmin or Org Admin)
    const isSuperAdmin = isSuperAdminRole(session.role);
    const isAdmin = isAdminRole(session.role);
    if (!isSuperAdmin && !isAdmin) {
        redirect("/login");
    }
    // Real-time synchronization: prioritize DB state over session cookie for onboarding UI
    const needsOnboarding = orgData.isOnboardingComplete !== true;
    const showSidebar = !needsOnboarding;
    return (
        <>
            <AdminOrgProvider
                status={orgData.status}
                orgId={session.orgId}
                initialData={{
                    status: orgData.status,
                    name: orgData.name,
                    billingPlan: orgData.billingPlan,
                    allowedVoiceIds: orgData.allowedVoiceIds,
                    sttModel: orgData.sttModel,
                    totalInterviewsAllowed: orgData.totalInterviewsAllowed != null ? Number(orgData.totalInterviewsAllowed) : undefined,
                    totalInterviewsUsed: orgData.totalInterviewsUsed != null ? Number(orgData.totalInterviewsUsed) : undefined,
                    interviewQuotaRemaining: orgData.totalInterviewsAllowed != null
                        ? Math.max(0, Number(orgData.totalInterviewsAllowed) - Number(orgData.totalInterviewsUsed || 0))
                        : undefined,
                    maxActiveJobs: orgData.maxActiveJobs ?? undefined,
                    activeJobCount: orgData.activeJobCount ?? undefined,
                }}
            >
                <AdminStatusGate initialStatus={orgData.status}>
                    <div className="flex min-h-screen relative font-sans editorial-theme" style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FAFAFC 45%, #F5F3FF 100%)", backgroundAttachment: "fixed" }}>
                        {/* Subtle violet aurora blobs */}
                        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                            <div className="absolute top-[-10%] right-[-5%] w-[38%] h-[38%] rounded-full bg-violet-100/35 blur-[130px] animate-[aurora-float_20s_infinite_ease-in-out]" />
                            <div className="absolute bottom-[-8%] left-[-5%] w-[32%] h-[32%] rounded-full bg-blue-100/30 blur-[110px] animate-[aurora-float_25s_infinite_ease-in-out_reverse]" />
                        </div>
                        {/* Real-time State Synchronization */}
                        <OnboardingRedirect needsOnboarding={needsOnboarding}>
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
                                    <style dangerouslySetInnerHTML={{
                                        __html: `
                        body.reports-mode #global-admin-sidebar { display: none !important; }
                        body.reports-mode #admin-main-wrapper { padding-left: 0 !important; }
                        body.reports-mode #admin-content-inner { padding: 0 !important; max-width: 100% !important; }
                    ` }} />
                                    <main className="min-h-screen flex flex-col">
                                        <LowCreditsBanner orgStatus={orgData.status} />
                                        <div id="admin-content-inner" className="flex-1 flex flex-col px-6 pt-6 pb-10 md:px-8 md:pt-8 lg:px-10">
                                            {children}
                                        </div>
                                    </main>
                                </div>
                            </div>
                        </OnboardingRedirect>
                    </div>
                </AdminStatusGate>
            </AdminOrgProvider>
            <Toaster />
        </>
    );
}
