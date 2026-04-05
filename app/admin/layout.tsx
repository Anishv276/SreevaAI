import { Sidebar } from "@/components/layout/sidebar";
import { getSession, isAdminRole, isSuperAdminRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { OnboardingRedirect } from "@/components/admin/onboarding-redirect";

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

    // Determine onboarding status
    const org = await prisma.organization.findUnique({
        where: { id: session.orgId as string },
        select: { onboardingComplete: true }
    });

    const needsOnboarding = org ? !org.onboardingComplete : false;

    return (
        <div className="flex min-h-screen bg-white">
            <OnboardingRedirect needsOnboarding={needsOnboarding} />

            {!needsOnboarding && <Sidebar />}
            
            <div className={cn(
                "flex-1 bg-white min-w-0 transition-all duration-300", 
                !needsOnboarding && "md:pl-[220px]"
            )}>
                <main className="min-h-screen">
                    <div className="max-w-[1600px] mx-auto p-8 md:p-12 lg:p-16">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
