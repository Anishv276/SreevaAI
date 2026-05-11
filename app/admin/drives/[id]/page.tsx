"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast-custom";
import { Button } from "@/components/ui/button";
import { ScreeningSettings } from "@/components/create-drive/screening-settings";
import { parseDriveScreeningSettings, sanitizeScreeningCriteria } from "@/lib/screening-criteria";
import { getInterviewQuotaSupportMessage, getSupportComposeUrl, isInterviewQuotaLocked } from "@/lib/interview-quota";
import {
    ArrowLeft,
    Briefcase,
    Loader2,
    Upload,
    Settings,
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
    const [activeTab, setActiveTab] = useState<"upload" | "settings">("upload");
    const [screeningThreshold, setScreeningThreshold] = useState(60);
    const [screeningCriteria, setScreeningCriteria] = useState<Record<string, any>>({});
    const [inviteScheduleDays, setInviteScheduleDays] = useState(1);
    
    // ⚡ Read from shared context — no fetch needed
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
                
                const parsed = parseDriveScreeningSettings(
                    data.screeningCriteria,
                    Number(data.screeningThreshold ?? 60),
                    Number(data.inviteScheduleDays ?? 1),
                );

                setScreeningThreshold(parsed.threshold);
                setInviteScheduleDays(parsed.inviteScheduleDays);
                setScreeningCriteria(parsed.criteria as Record<string, any>);
            } catch (err) {
                console.error("Load drive error:", err);
                toast.error("An error occurred");
            } finally {
                setLoading(false);
            }
        };
        loadDrive();
    }, [driveId]);

    useEffect(() => {
        const currentDrive = drive as any;
        if (!currentDrive) return;

        const parsed = parseDriveScreeningSettings(
            currentDrive.screeningCriteria,
            Number(currentDrive.screeningThreshold ?? 60),
            Number(currentDrive.inviteScheduleDays ?? 1),
        );

        setScreeningThreshold(parsed.threshold);
        setInviteScheduleDays(parsed.inviteScheduleDays);
        setScreeningCriteria(parsed.criteria as Record<string, any>);
    }, [drive]);




    const handleSaveScreeningCriteria = async () => {
        try {
            const res = await fetch(`/api/drives/${driveId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    screeningThreshold,
                    screeningCriteria: sanitizeScreeningCriteria(screeningCriteria),
                    inviteScheduleDays,
                }),
            });

            if (!res.ok) {
                throw new Error("Failed to save screening criteria");
            }

            toast.success("Screening criteria saved");
        } catch (error) {
            toast.error((error as Error).message);
        }
    };

    if (loading || !drive) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-10 w-10 text-orange-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <div className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-6 py-5">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-start gap-4">
                            <button
                                onClick={() => router.back()}
                                className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                            >
                                <ArrowLeft className="h-5 w-5" />
                            </button>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">
                                    <Briefcase className="h-3.5 w-3.5 text-[#F97316]" />
                                    Drive Candidates
                                </div>
                                <h1 className="mt-2 text-[clamp(2rem,4vw,3.75rem)] font-black leading-[0.95] tracking-tight text-slate-950">
                                    {drive.title}
                                </h1>
                                <p className="mt-3 max-w-2xl text-sm font-medium text-slate-500">
                                    {drive.role || "Job Description"}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 pt-1">
                            <button
                                onClick={() => router.back()}
                                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Back
                            </button>
                            <button
                                onClick={() => setActiveTab("upload")}
                                disabled={quotaLocked}
                                className={cn(
                                    "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors",
                                    quotaLocked
                                        ? "cursor-not-allowed border border-amber-200 bg-amber-50 text-amber-700"
                                        : activeTab === "upload"
                                        ? "bg-slate-950 text-white shadow-sm"
                                        : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                                )}
                            >
                                {quotaLocked ? <Lock className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                                {quotaLocked ? "Upload Locked" : "Upload Resumes"}
                            </button>
                            <button
                                onClick={() => setActiveTab("settings")}
                                className={cn(
                                    "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors",
                                    activeTab === "settings"
                                        ? "bg-slate-950 text-white shadow-sm"
                                        : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                                )}
                            >
                                <Settings className="h-4 w-4" />
                                Screening Settings
                            </button>
                            <button
                                onClick={() => router.push("/admin/drives")}
                                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
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
                <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                    {activeTab === "upload" ? (
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
                                                <button
                                                    type="button"
                                                    onClick={() => router.push("/admin/billing")}
                                                    className="inline-flex items-center justify-center rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-bold text-white"
                                                >
                                                    Go to Billing
                                                </button>
                                                <a
                                                    href={getSupportComposeUrl({
                                                        subject: "Interview quota support request",
                                                        body: "Hi support team,\n\nPlease help us restore interview access for our account.\n",
                                                    })}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center justify-center rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm font-bold text-amber-700"
                                                >
                                                    Contact Support
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
                                        <span className="font-semibold">Before starting screening, adjust screening settings first.</span>{" "}
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab("settings")}
                                            className="font-bold underline underline-offset-2"
                                        >
                                            Click here
                                        </button>{" "}
                                        to open the screening settings.
                                    </div>
                                    <ResumeScreening
                                        driveId={driveId}
                                        driveName={drive?.title || ""}
                                    />
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-6 p-6 md:p-8">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                                <h2 className="text-xl font-bold text-slate-950">Screening Criteria</h2>
                                <p className="mt-1 text-sm text-slate-500">Configure AI screening criteria. The system will automatically score and rank candidates based on these settings.</p>
                            </div>
                            <ScreeningSettings
                                config={{ threshold: screeningThreshold, criteria: screeningCriteria, inviteScheduleDays }}
                                setConfig={(cfg) => {
                                    if (typeof cfg === "function") {
                                        const next = cfg({ threshold: screeningThreshold, criteria: screeningCriteria, inviteScheduleDays });
                                        setScreeningThreshold(next.threshold ?? 60);
                                        setScreeningCriteria(next.criteria || {});
                                        setInviteScheduleDays(Number(next.inviteScheduleDays ?? 1));
                                    } else {
                                        setScreeningThreshold(cfg.threshold ?? 60);
                                        setScreeningCriteria(cfg.criteria || {});
                                        setInviteScheduleDays(Number(cfg.inviteScheduleDays ?? 1));
                                    }
                                }}
                            />

                            <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        const currentDrive = drive as any;
                                        const next = parseDriveScreeningSettings(
                                            currentDrive?.screeningCriteria,
                                            Number(currentDrive?.screeningThreshold ?? 60),
                                            Number(currentDrive?.inviteScheduleDays ?? 1),
                                        );
                                        setScreeningThreshold(next.threshold);
                                        setInviteScheduleDays(next.inviteScheduleDays);
                                        setScreeningCriteria(next.criteria as Record<string, any>);
                                    }}
                                >
                                    Reset
                                </Button>
                                <Button
                                    onClick={handleSaveScreeningCriteria}
                                    className="bg-slate-950 text-white hover:bg-slate-800"
                                >
                                    Save Screening Criteria
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}
