"use client";

import { useAuth } from "@/context/auth-context";
import AdminLoginPage from "./admin/login/page";
import DashboardPage from "./admin/page";
import { Sidebar } from "@/components/layout/sidebar";
import { useEffect, useState } from "react";

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null; // Prevent hydration mismatch
  }

  if (!isAuthenticated) {
    return <AdminLoginPage />;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 md:pl-72 transition-all duration-300 ease-in-out">
        <main className="flex-1 p-8">
          <DashboardPage />
        </main>
      </div>
    </div>
  );
}
