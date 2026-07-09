"use client";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast-custom";
import { getInterviewQuotaSupportMessage, getSupportComposeUrl, isInterviewQuotaLocked } from "@/lib/interview-quota";
import {
    ArrowLeft,
    Briefcase,
    Loader2,
    Upload,
    Pencil,
    Lock,
} from "lucide-react";
import { useJobs } from "@/context/jobs-context";
import { useAdminOrg } from "@/context/admin-org-context";
import { cn } from "@/lib/utils";
import { ResumeScreening } from "@/components/admin/resume-screening";
export default function DriveDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { id: driveId } = use(params);
    const { jobs } = useJobs();
    // ⚡ Read from shared context -- no fetch needed
    const adminOrg = useAdminOrg();
    const quotaLocked = isInterviewQuotaLocked(adminOrg ?? {});
    const [drive, setDrive] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const loadDrive = async () => {
            try {
                const res = await fetch(`/api/drives/${driveId}`, { cache: "no-store" });
                if (!res.ok) {
                    toast.error("Failed to fetch drive details");
                    router.push("/admin/drives");
                    return;
                }
                const data = await res.json();
                setDrive(data);
            } catch (err) {
                console.error("Load drive error:", err);
                toast.error("An error occurred");
            } finally {
                setLoading(false);
            }
        };
        loadDrive();
    }, [driveId]);
    if (loading || !drive) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-10 w-10 text-violet-500 animate-spin" />
            </div>
        );
    }
    return (
        <div className="space-y-6 pb-10 animate-in fade-in duration-500">
            {/* Header */}
            <div className="sticky top-0 z-50 border-b border-gray-200/70 bg-white/90 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-6 py-5">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-start gap-4">
                            <button
                                onClick={() => router.back()}
                                className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-colors hover:border-slate-300 hover:bg-violet-50 hover:text-gray-900"
                            >
                                <ArrowLeft className="h-5 w-5" />
                            </button>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-gray-400">
                                    <Briefcase className="h-3.5 w-3.5 text-[#7C3AED]" />
                                    Drive Candidates
                                </div>
                                <h1 className="mt-2 text-[clamp(2rem,4vw,3.75rem)] font-black leading-[0.95] tracking-tight text-slate-950">
                                    {drive.title}
                                </h1>
                                <p className="mt-3 max-w-2xl text-sm font-medium text-gray-500">
                                    {drive.role || "Job Description"}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 pt-1">
                            <button
                                onClick={() => router.back()}
                                className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-600 transition-colors hover:border-slate-300 hover:bg-violet-50 hover:text-gray-900"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Back
                            </button>
                            <button
                                disabled={quotaLocked}
                                className={cn(
                                    "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors",
                                    quotaLocked
                                        ? "cursor-not-allowed border border-amber-200 bg-amber-50 text-amber-700"
                                        : "bg-slate-950 text-white shadow-sm"
                                )}
                            >
                                {quotaLocked ? <Lock className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                                {quotaLocked ? "Upload Locked" : "Upload Resumes"}
                            </button>
                            <button
                                onClick={() => router.push(`/admin/create-drive?id=${driveId}&mode=edit`)}
                                className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-600 transition-colors hover:border-slate-300 hover:bg-violet-50 hover:text-gray-900"
                            >
                                <Pencil className="h-4 w-4" />
                                Edit Drive
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-6 py-8">
                {/* Tab Content */}
                <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
                    <div className="space-y-4 p-6">
                            {quotaLocked ? (
                                <div className="rounded-3xl border border-amber-200 bg-amber-50 px-6 py-5 text-amber-950 shadow-sm">
                                    <div className="flex items-start gap-4">
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm">
                                            <Lock className="h-5 w-5" />
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-sm font-black uppercase tracking-[0.2em] text-amber-700">Upload locked</p>
                                            <h2 className="text-xl font-bold text-gray-900">You have no remaining interview quota.</h2>
                                            <p className="text-sm font-medium text-gray-700">
                                                {getInterviewQuotaSupportMessage("interviews")}
                                            </p>
                                            <div className="flex flex-wrap gap-3 pt-2">
                                                <a
                                                    href={getSupportComposeUrl({
                                                        subject: "Interview quota support request",
                                                        body: "Hi support team,\n\nPlease help us restore interview access for our account.\n",
                                                    })}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center justify-center rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-bold text-white"
                                                >
                                                    Contact Support
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <ResumeScreening
                                    driveId={driveId}
                                    driveName={drive?.title || ""}
                                />
                            )}
                    </div>
                </div>
            </div>
        </div>
    );
}
