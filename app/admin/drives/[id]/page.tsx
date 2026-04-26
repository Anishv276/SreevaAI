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
} from "lucide-react";
import { useJobs } from "@/context/jobs-context";
import { cn } from "@/lib/utils";
import { ResumeScreening } from "@/components/admin/resume-screening";

export default function DriveDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { id: driveId } = use(params);

    const { jobs } = useJobs();
    const [activeTab, setActiveTab] = useState<"upload" | "settings">("upload");
    const [screeningThreshold, setScreeningThreshold] = useState(60);
    const [screeningCriteria, setScreeningCriteria] = useState<Record<string, any>>({});
    const [shortlistMode, setShortlistMode] = useState<"automatic" | "manual">("automatic");

    const drive = jobs.find(j => j.id === driveId);

    useEffect(() => {
        const currentDrive = drive as any;
        if (!currentDrive) return;

        const rawCriteria = currentDrive.screeningCriteria;
        let parsed: Record<string, any> = {};
        if (!rawCriteria) {
            parsed = {};
        } else if (typeof rawCriteria === "string") {
            try {
                parsed = JSON.parse(rawCriteria);
            } catch {
                parsed = {};
            }
        } else {
            parsed = rawCriteria;
        }

        setScreeningThreshold(Number(parsed.threshold ?? currentDrive.screeningThreshold ?? 60));
        setShortlistMode((parsed.shortlistMode as "automatic" | "manual") || (currentDrive.shortlistMode as "automatic" | "manual") || "automatic");

        const { threshold: _threshold, shortlistMode: _shortlistMode, criteria: innerCriteria, ...rest } = parsed || {};
        setScreeningCriteria((innerCriteria && typeof innerCriteria === "object") ? innerCriteria : rest);
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
                        criteria: screeningCriteria,
                    }),
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
        <div className="min-h-screen bg-gradient-to-br from-white via-gray-50/50 to-gray-100/50">
            {/* Header */}
            <div className="border-b border-white/20 bg-white/40 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.back()}
                            className="h-10 w-10 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors border border-gray-100"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-orange-50 flex items-center justify-center text-orange-500 border border-orange-100">
                                <Briefcase className="h-6 w-6" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">{drive.title}</h1>
                                <p className="text-sm text-gray-500">{drive.role || "Job Description"}</p>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-6 py-12">
                {/* Tabs */}
                <div className="flex border-b border-white/20 bg-white/40 backdrop-blur-xl rounded-t-3xl px-8 mb-0">
                    <button
                        onClick={() => setActiveTab("upload")}
                        className={cn(
                            "px-6 py-5 font-bold text-sm uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2",
                            activeTab === "upload"
                                ? "border-[#F97316] text-[#F97316]"
                                : "border-transparent text-gray-500 hover:text-gray-700"
                        )}
                    >
                        <Upload className="h-4 w-4" />
                        Bulk Upload
                    </button>
                    <button
                        onClick={() => setActiveTab("settings")}
                        className={cn(
                            "px-6 py-5 font-bold text-sm uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2",
                            activeTab === "settings"
                                ? "border-[#F97316] text-[#F97316]"
                                : "border-transparent text-gray-500 hover:text-gray-700"
                        )}
                    >
                        <Settings className="h-4 w-4" />
                        Screening Criteria
                    </button>
                </div>

                {/* Tab Content */}
                <div className="bg-white/60 backdrop-blur-xl rounded-b-3xl border border-white/20 border-t-0 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.03)]">
                    {activeTab === "upload" ? (
                        <ResumeScreening
                            driveId={driveId}
                            driveName={drive?.title || ""}
                        />
                    ) : (
                        <div className="space-y-8">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 mb-2">Screening Criteria</h2>
                                <p className="text-gray-600">Configure AI screening criteria. The system will automatically score and rank candidates based on these settings.</p>
                            </div>
                            <ScreeningSettings
                                config={{ threshold: screeningThreshold, criteria: screeningCriteria }}
                                setConfig={(cfg) => {
                                    if (typeof cfg === "function") {
                                        const next = cfg({ threshold: screeningThreshold, criteria: screeningCriteria });
                                        setScreeningThreshold(next.threshold ?? 60);
                                        setScreeningCriteria(next.criteria || {});
                                    } else {
                                        setScreeningThreshold(cfg.threshold ?? 60);
                                        setScreeningCriteria(cfg.criteria || {});
                                    }
                                }}
                                shortlistMode={shortlistMode}
                                setShortlistMode={setShortlistMode}
                            />

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        const currentDrive = drive as any;
                                setScreeningThreshold(Number(currentDrive?.screeningThreshold ?? 60));
                                const rawCriteria = currentDrive?.screeningCriteria;
                                        let parsed: Record<string, any> = {};
                                        if (!rawCriteria) {
                                            parsed = {};
                                        } else if (typeof rawCriteria === "string") {
                                            try {
                                                parsed = JSON.parse(rawCriteria);
                                            } catch {
                                                parsed = {};
                                            }
                                        } else {
                                            parsed = rawCriteria;
                                        }
                                        setScreeningThreshold(Number(parsed.threshold ?? currentDrive?.screeningThreshold ?? 60));
                                        setShortlistMode((parsed.shortlistMode as "automatic" | "manual") || (currentDrive?.shortlistMode as "automatic" | "manual") || "automatic");
                                        const { threshold: _threshold, shortlistMode: _shortlistMode, criteria: innerCriteria, ...rest } = parsed || {};
                                        setScreeningCriteria((innerCriteria && typeof innerCriteria === "object") ? innerCriteria : rest);
                                    }}
                                >
                                    Reset
                                </Button>
                                <Button
                                    onClick={handleSaveScreeningCriteria}
                                    className="bg-orange-600 hover:bg-orange-700 text-white"
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
