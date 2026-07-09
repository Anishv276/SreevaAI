"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
export default function ResumeScreeningRedirectPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const jobId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";
    useEffect(() => {
        if (!jobId) return;
        router.replace(`/admin/candidates/job/${encodeURIComponent(jobId)}`);
    }, [jobId, router]);
    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
                <p className="text-sm font-bold uppercase tracking-widest text-gray-400">
                    Redirecting to candidates...
                </p>
            </div>
        </div>
    );
}
