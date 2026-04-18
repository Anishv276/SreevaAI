import { Sidebar } from "@/components/layout/sidebar";
import { getSession, isAdminRole, isSuperAdminRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import { OnboardingRedirect } from "@/components/admin/onboarding-redirect";
import { RecruiterAssistant } from "@/components/admin/RecruiterAssistant";
import { DomainVerificationBanner } from "@/components/admin/DomainVerificationBanner";
import { Toaster } from "@/components/ui/toast-custom";
import { AccountStatusHandler } from "@/components/admin/AccountStatusHandler";
import { prisma } from "@/lib/prisma";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const session = await getSession();

    if (!session) {
        redirect("/login?from=admin");
    }

    // Fetch account status and onboarding completion in real-time
    let orgData = { status: "ACTIVE", onboardingComplete: session.onboardingComplete === true };
    if (session.orgId) {
        const org = await prisma.organization.findUnique({
            where: { id: session.orgId },
            select: { status: true, onboardingComplete: true }
        } as any);
        if (org) orgData = org;
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
        <AccountStatusHandler status={orgData.status} />
        <div className="flex min-h-screen bg-[#F8F9FB] relative overflow-hidden font-sans">
            {/* ── Background Deck: Aurora Blobs ──────────────── */}
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
                {showSidebar && <Sidebar />}
                
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
                        {/* {showSidebar && <DomainVerificationBanner />} */}
                        <div className="max-w-full mx-auto p-4 md:p-8 lg:p-10">
                            {children}
                        </div>
                    </main>
                </div>
            </div>

            {/* Premium AI Assistant */}
            {showSidebar && <RecruiterAssistant />}
        </div>
        <Toaster />
        </>
    );
}
