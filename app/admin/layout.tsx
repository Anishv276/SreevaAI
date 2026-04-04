import { Sidebar } from "@/components/layout/sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-screen" style={{ backgroundColor: "#F7F6F3" }}>
            <Sidebar />
            <div className="flex-1 md:pl-[220px]">
                <main className="p-8 min-h-screen" style={{ backgroundColor: "#F7F6F3" }}>
                    {children}
                </main>
            </div>
        </div>
    );
}
