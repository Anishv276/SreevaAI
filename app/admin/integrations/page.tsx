import { redirect } from "next/navigation";

export default function AdminIntegrationsPage() {
    redirect("/admin/settings?section=integrations");
}
