import { Sidebar } from "@/components/layout/sidebar";
import { getSession, isAdminRole, isSuperAdminRole } from "@/lib/auth";
import { redirect } from "next/navigation";

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

    return (
        <div className="flex min-h-screen bg-white">
            <Sidebar />
            <div className="flex-1 md:pl-[220px] bg-white">
                <main className="p-8 min-h-screen bg-white">
                    {children}
                </main>
            </div>
        </div>
    );
}
