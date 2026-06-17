"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// Define User type based on server SessionUser
export type UserRole = "SUPER_ADMIN" | "ADMIN" | "CANDIDATE";

export interface User {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    orgId: string | null;
    avatar?: string;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    refreshUser: () => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const refreshUser = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/auth/me");
            if (res.ok) {
                const session = await res.json();
                if (session) {
                    setUser({
                        id: session.userId,
                        name: session.name,
                        email: session.email,
                        role: session.role as UserRole,
                        orgId: session.orgId,
                    });
                } else {
                    setUser(null);
                }
            } else {
                setUser(null);
            }
        } catch (error) {
            console.error("Auth refresh failed:", error);
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Only listen for multi-tab logout — do NOT auto-fetch on mount.
    // Admin pages get session server-side via layout; callers invoke refreshUser() explicitly when needed.
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === "logout-event") {
                setUser(null);
                router.push("/");
                router.refresh();
            }
        };

        window.addEventListener("storage", handleStorageChange);
        return () => window.removeEventListener("storage", handleStorageChange);
    }, [router]);

    // Background sliding session ping
    useEffect(() => {
        let lastActivity = Date.now();
        const updateActivity = () => { lastActivity = Date.now(); };
        
        // Track basic user interactions
        window.addEventListener("mousemove", updateActivity, { passive: true });
        window.addEventListener("keydown", updateActivity, { passive: true });
        window.addEventListener("click", updateActivity, { passive: true });

        // Check every 5 minutes
        const interval = setInterval(() => {
            const timeSinceLastActivity = Date.now() - lastActivity;
            // If active in the last 5 minutes, ping the server to keep session alive
            if (timeSinceLastActivity < 5 * 60 * 1000) {
                fetch("/api/auth/me", { cache: "no-store" }).catch(() => {});
            }
        }, 5 * 60 * 1000);

        return () => {
            window.removeEventListener("mousemove", updateActivity);
            window.removeEventListener("keydown", updateActivity);
            window.removeEventListener("click", updateActivity);
            clearInterval(interval);
        };
    }, []);

    const logout = async () => {
        // Clear local state first for instant UI response
        setUser(null);
        
        // Trigger multi-tab logout
        localStorage.setItem("logout-event", Date.now().toString());
        
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } catch {
            // Ignore network logout errors
        }
        
        // Clean URL redirect
        router.push("/");
        router.refresh();
    };

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated: !!user,
            isLoading,
            refreshUser,
            logout
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
