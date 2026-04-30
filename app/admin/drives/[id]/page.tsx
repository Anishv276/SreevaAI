"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast-custom";
import { Button } from "@/components/ui/button";
import { ScreeningSettings } from "@/components/create-drive/screening-settings";
import {
    ArrowLeft,
    Briefcase,
    Loader2,
    Upload,
    Settings,
    Pencil,
} from "lucide-react";
import { useJobs } from "@/context/jobs-context";
import { cn } from "@/lib/utils";
import { ResumeScreening } from "@/components/admin/resume-screening";

function parseScreeningSettings(
    rawCriteria: unknown,
    fallbackThreshold: number,
    fallbackShortlistMode: "automatic" | "manual",
    fallbackInviteScheduleDays: number,
) {
    let parsed: Record<string, any> = {};

    if (typeof rawCriteria === "string") {
        try {
            parsed = JSON.parse(rawCriteria);
        } catch {
            parsed = {};
        }
    } else if (rawCriteria && typeof rawCriteria === "object") {
        parsed = rawCriteria as Record<string, any>;
    }

    const threshold = Number(parsed.threshold ?? fallbackThreshold ?? 60);
    const shortlistMode = (parsed.shortlistMode as "automatic" | "manual") || fallbackShortlistMode || "automatic";
    const inviteScheduleDays = Number(parsed.inviteScheduleDays ?? fallbackInviteScheduleDays ?? 1);
    const { threshold: _threshold, shortlistMode: _shortlistMode, inviteScheduleDays: _inviteScheduleDays, criteria: innerCriteria, ...rest } = parsed || {};

    return {
        threshold,
        shortlistMode,
        inviteScheduleDays,
        criteria: (innerCriteria && typeof innerCriteria === "object") ? innerCriteria : rest,
    };
}

export default function DriveDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { id: driveId } = use(params);

    const { jobs } = useJobs();
    const [activeTab, setActiveTab] = useState<"upload" | "settings">("upload");
    const [screeningThreshold, setScreeningThreshold] = useState(60);
    const [screeningCriteria, setScreeningCriteria] = useState<Record<string, any>>({});
    const [shortlistMode, setShortlistMode] = useState<"automatic" | "manual">("automatic");
    const [inviteScheduleDays, setInviteScheduleDays] = useState(1);

    const drive = jobs.find(j => j.id === driveId);

    useEffect(() => {
        const currentDrive = drive as any;
        if (!currentDrive) return;

        const parsed = parseScreeningSettings(
            currentDrive.screeningCriteria,
            Number(currentDrive.screeningThreshold ?? 60),
            (currentDrive.shortlistMode as "automatic" | "manual") || "automatic",
            Number(currentDrive.inviteScheduleDays ?? 1),
        );

        setScreeningThreshold(parsed.threshold);
        setShortlistMode(parsed.shortlistMode);
        setInviteScheduleDays(parsed.inviteScheduleDays);
        setScreeningCriteria(parsed.criteria as Record<string, any>);
    }, [drive]);

    useEffect(() => {
        if (!drive) {
            router.push("/admin/drives");
        }
    }, [drive, router]);

    const handleSaveScreeningCriteria = async () => {
        try {
            const res = await fetch(`/api/drives/${driveId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    screeningCriteria: JSON.stringify({
                        threshold: screeningThreshold,
                        shortlistMode,
                        inviteScheduleDays,
                        criteria: screeningCriteria,
                    }),
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

    if (!drive) {
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
                                className={cn(
                                    "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors",
                                    activeTab === "upload"
                                        ? "bg-slate-950 text-white shadow-sm"
                                        : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                                )}
                            >
                                <Upload className="h-4 w-4" />
                                Upload Resumes
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
                        <div className="p-6">
                            <ResumeScreening
                                driveId={driveId}
                                driveName={drive?.title || ""}
                            />
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
                                shortlistMode={shortlistMode}
                                setShortlistMode={setShortlistMode}
                            />

                            <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        const currentDrive = drive as any;
                                        const next = parseScreeningSettings(
                                            currentDrive?.screeningCriteria,
                                            Number(currentDrive?.screeningThreshold ?? 60),
                                            (currentDrive?.shortlistMode as "automatic" | "manual") || "automatic",
                                            Number(currentDrive?.inviteScheduleDays ?? 1),
                                        );
                                        setScreeningThreshold(next.threshold);
                                        setShortlistMode(next.shortlistMode);
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
