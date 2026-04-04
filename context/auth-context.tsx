"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// Define User type
export type UserRole = "candidate" | "hr";

export interface User {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    avatar?: string;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    login: (email: string, role: UserRole) => void;
    signup: (name: string, email: string) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const router = useRouter();

    // Check for persisted user on mount
    useEffect(() => {
        const storedUser = localStorage.getItem("auth_user");
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
    }, []);

    const login = (email: string, role: UserRole) => {
        // Mock login
        const mockUser: User = {
            id: Date.now().toString(),
            name: email.split("@")[0].charAt(0).toUpperCase() + email.split("@")[0].slice(1), // Mock name from email
            email,
            role,
        };
        setUser(mockUser);
        localStorage.setItem("auth_user", JSON.stringify(mockUser));
    };

    const signup = (name: string, email: string) => {
        // Mock signup
        const newUser: User = {
            id: Date.now().toString(),
            name,
            email,
            role: "candidate",
        };
        setUser(newUser);
        localStorage.setItem("auth_user", JSON.stringify(newUser));
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem("auth_user");
        router.push("/");
    };

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated: !!user,
            login,
            signup,
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
