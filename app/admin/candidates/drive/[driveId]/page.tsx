"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Briefcase, Edit3, Loader2, Upload, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DriveCandidatesTable } from "@/components/admin/drive-candidates-table";
import { DriveResumeUploadModal } from "@/components/admin/drive-resume-upload-modal";
import { toast } from "@/components/ui/toast-custom";
import { getInterviewQuotaSupportMessage, isInterviewQuotaLocked } from "@/lib/interview-quota";
import { useAdminOrg } from "@/context/admin-org-context";

interface DriveDetails {
    id: string;
    title: string;
    role?: string | null;
    applicants?: number | null;
    screeningThreshold?: number | null;
    interviewLanguage?: string | null;
    description?: string | null;
    experience?: string | null;
    responsibilities?: string | null;
    requirements?: string | null;
    skills?: string | null;
    salary?: string | null;
    extractedDetails?: Record<string, unknown> | string | null;
    jdPreviewUrl?: string | null;
    screeningCriteria?: Record<string, any> | string | null;
}

export default function DriveCandidatesPage() {
    const params = useParams<{ driveId: string }>();
    const driveId = typeof params?.driveId === "string" ? params.driveId : Array.isArray(params?.driveId) ? params.driveId[0] : "";
    const [drive, setDrive] = useState<DriveDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    // ⚡ Read from shared context — no fetch needed (was 1 API call per load)
    const adminOrg = useAdminOrg();
    const quotaLocked = isInterviewQuotaLocked(adminOrg ?? {});

    useEffect(() => {
        if (!driveId) return;

        let ignore = false;

        const loadDrive = async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/drives/${driveId}`);
                if (!res.ok) throw new Error("Failed to fetch drive");
                const data = await res.json();
                if (ignore) return;

                setDrive({
                    id: data.id,
                    title: data.title,
                    role: data.role || null,
                    applicants: data.applicants ?? data._count?.applications ?? 0,
                    screeningThreshold: data.screeningThreshold ?? null,
                    interviewLanguage: data.interviewLanguage || null,
                    description: data.description || null,
                    experience: data.experience || null,
                    responsibilities: data.responsibilities || null,
                    requirements: data.requirements || null,
                    skills: data.skills || null,
                    salary: data.salary || null,
                    extractedDetails: data.extractedDetails || null,
                    jdPreviewUrl: data.jdPreviewUrl || null,
                    screeningCriteria: data.screeningCriteria || null,
                });
            } catch (error) {
                console.error("Failed to fetch drive:", error);
            } finally {
                if (!ignore) setLoading(false);
            }
        };

        void loadDrive();

        return () => {
            ignore = true;
        };
    }, [driveId, refreshKey]);



    if (!driveId) {
        return (
            <div className="min-h-[50vh] flex items-center justify-center">
                <p className="text-sm font-bold uppercase tracking-widest text-gray-400">Job not found</p>
            </div>
        );
    }

    if (loading && !drive) {
        return (
            <div className="min-h-[50vh] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
                    <p className="text-sm font-bold uppercase tracking-widest text-gray-400">Loading job...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3 pb-6 animate-in fade-in duration-700" style={{ zoom: 0.7, transformOrigin: "top center" }}>
            <section className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm sm:px-4">
                <div className="flex flex-col gap-2.5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2.5">
                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                            <Badge className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#F97316] shadow-none">
                                Job Candidates
                              </Badge>
                            <span>{drive?.role || "Recruitment"}</span>
                        </div>
                        <div className="space-y-1">
                            <h1 className="truncate text-lg font-bold tracking-tight text-gray-900 sm:text-xl">
                                {drive?.title || "Job Candidates"}
                            </h1>
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
                                <span className="inline-flex items-center gap-1.5">
                                    <Briefcase className="h-3.5 w-3.5 text-[#F97316]" />
                                    {drive?.role || "Open Role"}
                                </span>
                                <span className="hidden sm:inline">•</span>
                                <span>
                                    {drive?.applicants ?? 0} candidate{(drive?.applicants ?? 0) === 1 ? "" : "s"}
                                </span>
                                <span className="hidden sm:inline">•</span>
                                <span className="text-emerald-600">Screening ready</span>
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                        <button
                            onClick={() => {
                                if (quotaLocked) {
                                    toast.error(getInterviewQuotaSupportMessage("interviews"));
                                    return;
                                }
                                setUploadOpen(true);
                            }}
                            disabled={quotaLocked}
                            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#F97316] px-3.5 text-sm font-semibold text-white shadow-none transition-colors hover:bg-orange-600 hover:shadow-none disabled:cursor-not-allowed disabled:bg-amber-100 disabled:text-amber-700"
                        >
                            {quotaLocked ? <Lock className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                            {quotaLocked ? "Upload Locked" : "Upload More"}
                        </button>
                        <Link
                            href={`/admin/create-drive?id=${driveId}&mode=edit`}
                            className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 text-sm font-semibold text-gray-700 shadow-none transition-colors hover:border-gray-300 hover:bg-gray-50 hover:shadow-none"
                        >
                            <Edit3 className="h-4 w-4" />
                            Edit
                        </Link>
                        <Link
                            href="/admin/drives"
                            className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 text-sm font-semibold text-gray-600 shadow-none transition-colors hover:border-gray-300 hover:bg-gray-50 hover:shadow-none"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back to Jobs
                        </Link>
                    </div>
                </div>
            </section>

            <DriveCandidatesTable driveId={driveId} refreshKey={refreshKey} />

            <DriveResumeUploadModal
                open={uploadOpen}
                onOpenChange={setUploadOpen}
                driveId={driveId}
                driveName={drive?.title || "Job"}
                onUploaded={() => setRefreshKey((v) => v + 1)}
            />
        </div>
    );
}
