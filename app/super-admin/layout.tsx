import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import SuperAdminShell from "./shell";

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") {
        redirect("/login");
    }
    return <SuperAdminShell>{children}</SuperAdminShell>;
}