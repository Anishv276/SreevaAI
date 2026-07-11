import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
export default async function TestLayout({ children }: { children: React.ReactNode }) {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") {
        redirect("/login");
    }
    return <>{children}</>;
}
