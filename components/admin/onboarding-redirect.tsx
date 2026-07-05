"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

interface Props {
    needsOnboarding: boolean;
    children: React.ReactNode;
}

export function OnboardingRedirect({ needsOnboarding, children }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    
    const shouldRedirectToSetup = needsOnboarding && pathname !== "/admin/setup";
    const shouldRedirectToAdmin = !needsOnboarding && pathname === "/admin/setup";

    useEffect(() => {
        if (shouldRedirectToSetup) {
            router.replace("/admin/setup");
        } else if (shouldRedirectToAdmin) {
            router.replace("/admin");
        }
    }, [shouldRedirectToSetup, shouldRedirectToAdmin, router]);

    if (shouldRedirectToSetup || shouldRedirectToAdmin) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50/50 absolute inset-0 z-50">
                <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return <>{children}</>;
}
