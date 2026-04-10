import { Sidebar } from "@/components/layout/sidebar";
import { getSession, isAdminRole, isSuperAdminRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import { OnboardingRedirect } from "@/components/admin/onboarding-redirect";
import { RecruiterAssistant } from "@/components/admin/RecruiterAssistant";
import { Toaster } from "@/components/ui/toast-custom";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const session = await getSession();

    if (!session) {
        redirect("/login?from=admin");
    }

    // Allow Super Admins to access admin routes for "inspections"
    if (isSuperAdminRole(session.role)) {
        // We skip the redirect to /super-admin here to allow viewing admin dashboards
    } else if (!isAdminRole(session.role)) {
        redirect("/login");
    }

    // PERFORMANCE: Use session-cached onboarding flag to avoid redundant DB rounds on navigation
    const needsOnboarding = session.onboardingComplete !== true;
    const showSidebar = !needsOnboarding;

    return (
        <>
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
                
                <div className={cn(
                    "flex-1 min-w-0 transition-all duration-500 ease-in-out", 
                    showSidebar && "md:pl-[220px]"
                )}>
                    <main className="min-h-screen">
                        <div className="max-w-[1600px] mx-auto p-8 md:p-12 lg:p-14">
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
