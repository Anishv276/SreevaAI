import { Sidebar } from "@/components/layout/sidebar";
import { Suspense } from "react";
import { getSession, isAdminRole, isSuperAdminRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import { OnboardingRedirect } from "@/components/admin/onboarding-redirect";
import { RecruiterAssistant } from "@/components/admin/RecruiterAssistant";
import { Toaster } from "@/components/ui/toast-custom";
import { AdminStatusGate } from "@/components/admin/AdminStatusGate";
import { LowCreditsBanner } from "../../components/admin/LowCreditsBanner";
import { prisma } from "@/lib/prisma";
import { canUseRecruiterAssistant } from "@/lib/org-plans";
import { getEffectiveOrgStatus } from "@/lib/credits";
import { AdminOrgProvider } from "@/context/admin-org-context";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const session = await getSession();

    if (!session) {
        redirect("/login?from=admin");
    }

    // Fetch account status and onboarding completion in real-time
    let orgData = { status: "ACTIVE", onboardingComplete: session.onboardingComplete === true };
    if (session.orgId) {
        try {
            // ⚡ PARALLEL: Both DB calls run simultaneously (was sequential = 2x slower)
            const [org, effectiveStatus] = await Promise.all([
                prisma.organization.findUnique({
                    where: { id: session.orgId },
                    select: {
                        status: true,
                        onboardingComplete: true,
                        plan: true,
                        interviewQuotaTotal: true,
                        interviewQuotaUsed: true,
                    },
                }),
                getEffectiveOrgStatus(session.orgId),
            ]);

            if (org) {
                orgData = {
                    ...org,
                    status: String(effectiveStatus || org.status || "ACTIVE").toUpperCase(),
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
    const showRecruiterAssistant = showSidebar && canUseRecruiterAssistant((orgData as any).plan);

    return (
        <>
        <AdminOrgProvider status={orgData.status} orgId={session.orgId}>
        <AdminStatusGate initialStatus={orgData.status}>
        <div className="flex min-h-screen bg-[#F8F9FB] relative font-sans">
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
                        body.reports-mode .recruiter-assistant-btn { display: none !important; }
                    ` }} />
                    <main className="min-h-screen">
                        <LowCreditsBanner orgStatus={orgData.status} />
                        <div className="max-w-full mx-auto px-4 pb-4 pt-4 md:px-8 md:pb-8 lg:px-10 lg:pb-10">
                            {children}
                        </div>
                    </main>
                </div>
            </div>

            {/* Premium AI Assistant */}
            {showRecruiterAssistant && <RecruiterAssistant />}
        </div>
        </AdminStatusGate>
        </AdminOrgProvider>
        <Toaster />
        </>
    );
}
