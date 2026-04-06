import { Sidebar } from "@/components/layout/sidebar";
import { getSession, isAdminRole, isSuperAdminRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import { OnboardingRedirect } from "@/components/admin/onboarding-redirect";
import { RecruiterAssistant } from "@/components/admin/RecruiterAssistant";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const session = await getSession();

    if (!session) {
        redirect("/login?from=admin");
    }

    if (isSuperAdminRole(session.role)) {
        redirect("/super-admin");
    }

    if (!isAdminRole(session.role)) {
        redirect("/login");
    }

    // PERFORMANCE: Use session-cached onboarding flag to avoid redundant DB rounds on navigation
    const needsOnboarding = session.onboardingComplete !== true;
    const showSidebar = !needsOnboarding;

    return (
        <div className="flex min-h-screen bg-white">
            {/* Real-time State Synchronization */}
            <OnboardingRedirect needsOnboarding={needsOnboarding} />
            
            {showSidebar && <Sidebar />}
            
            <div className={cn(
                "flex-1 bg-white min-w-0 transition-all duration-300", 
                showSidebar && "md:pl-[220px]"
            )}>
                <main className="min-h-screen">
                    <div className="max-w-[1600px] mx-auto p-8 md:p-12 lg:p-16">
                        {children}
                    </div>
                </main>
            </div>

            {/* Premium AI Assistant */}
            {showSidebar && <RecruiterAssistant />}
        </div>
    );
}
