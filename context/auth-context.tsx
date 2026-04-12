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
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    const refreshUser = useCallback(async () => {
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

    // Initial check on mount
    useEffect(() => {
        refreshUser();
    }, [refreshUser]);

    const logout = async () => {
        // Clear local state first for instant UI response
        setUser(null);
        
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
