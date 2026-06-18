"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
interface Props {
    needsOnboarding: boolean;
}
export function OnboardingRedirect({ needsOnboarding }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    useEffect(() => {
        // If the org needs onboarding and we AREN'T already on the setup page,
        // redirect the user immediately.
        if (needsOnboarding && pathname !== "/admin/setup") {
            console.log("[OnboardingRedirect] Redirecting to /admin/setup...");
            router.replace("/admin/setup");
        }
        // Conversely, if onboarding is complete but we ARE on the setup page,
        // send them to the dashboard.
        if (!needsOnboarding && pathname === "/admin/setup") {
            console.log("[OnboardingRedirect] Onboarding complete. Redirecting to /admin...");
            router.replace("/admin");
        }
    }, [needsOnboarding, pathname, router]);
    return null;
}
