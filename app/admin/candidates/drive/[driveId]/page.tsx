"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Briefcase, Edit3, Loader2, Upload } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DriveCandidatesTable } from "@/components/admin/drive-candidates-table";
import { DriveResumeUploadModal } from "@/components/admin/drive-resume-upload-modal";
import { ScreeningSettings } from "@/components/create-drive/screening-settings";
import { toast } from "@/components/ui/toast-custom";

interface DriveDetails {
    id: string;
    title: string;
    role?: string | null;
    department?: string | null;
    applicants?: number | null;
    screeningThreshold?: number | null;
    shortlistMode?: string | null;
    proctoringLevel?: string | null;
    interviewLanguage?: string | null;
    interviewTime?: number | null;
    type?: string | null;
    description?: string | null;
    workMode?: string | null;
    experience?: string | null;
    responsibilities?: string | null;
    requirements?: string | null;
    skills?: string | null;
    location?: string | null;
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
    const [activeTab, setActiveTab] = useState("candidates");
    const [uploadOpen, setUploadOpen] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [screeningThreshold, setScreeningThreshold] = useState(60);
    const [screeningCriteria, setScreeningCriteria] = useState<Record<string, any>>({});
    const [shortlistMode, setShortlistMode] = useState<"automatic" | "manual">("automatic");

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
                    department: data.department || null,
                    applicants: data.applicants ?? data._count?.applications ?? 0,
                    screeningThreshold: data.screeningThreshold ?? null,
                    shortlistMode: data.shortlistMode || null,
                    proctoringLevel: data.proctoringLevel || null,
                    interviewLanguage: data.interviewLanguage || null,
                    interviewTime: data.interviewTime ?? null,
                    type: data.type || null,
                    description: data.description || null,
                    workMode: data.workMode || null,
                    experience: data.experience || null,
                    responsibilities: data.responsibilities || null,
                    requirements: data.requirements || null,
                    skills: data.skills || null,
                    location: data.location || null,
                    salary: data.salary || null,
                    extractedDetails: data.extractedDetails || null,
                    jdPreviewUrl: data.jdPreviewUrl || null,
                    screeningCriteria: data.screeningCriteria || null,
                });

                const rawCriteria = data.screeningCriteria;
                let parsed: Record<string, any> = {};
                if (rawCriteria) {
                    if (typeof rawCriteria === "string") {
                        try {
                            parsed = JSON.parse(rawCriteria);
                        } catch {
                            parsed = {};
                        }
                    } else {
                        parsed = rawCriteria;
                    }
                }

                setScreeningThreshold(Number(parsed.threshold ?? data.screeningThreshold ?? 60));
                setShortlistMode((parsed.shortlistMode as "automatic" | "manual") || (data.shortlistMode as "automatic" | "manual") || "automatic");

                const { threshold: _threshold, shortlistMode: _shortlistMode, criteria: innerCriteria, ...rest } = parsed || {};
                setScreeningCriteria((innerCriteria && typeof innerCriteria === "object") ? innerCriteria : rest);
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
                <p className="text-sm font-bold uppercase tracking-widest text-gray-400">Drive not found</p>
            </div>
        );
    }

    if (loading && !drive) {
        return (
            <div className="min-h-[50vh] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
                    <p className="text-sm font-bold uppercase tracking-widest text-gray-400">Loading drive...</p>
                </div>
            </div>
        );
    }

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
            setRefreshKey((v) => v + 1);
        } catch (error) {
            toast.error((error as Error).message);
        }
    };

    return (
        <div className="space-y-3 pb-6 animate-in fade-in duration-700" style={{ zoom: 0.7, transformOrigin: "top center" }}>
            <section className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm sm:px-4">
                <div className="flex flex-col gap-2.5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2.5">
                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                            <Badge className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#F97316] shadow-none">
                                Drive Candidates
                            </Badge>
                            <span>{drive?.department || "Recruitment"}</span>
                        </div>
                        <div className="space-y-1">
                            <h1 className="truncate text-lg font-bold tracking-tight text-gray-900 sm:text-xl">
                                {drive?.title || "Drive Candidates"}
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
                            onClick={() => setUploadOpen(true)}
                            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#F97316] px-3.5 text-sm font-semibold text-white shadow-none transition-colors hover:bg-orange-600 hover:shadow-none"
                        >
                            <Upload className="h-4 w-4" />
                            Upload
                        </button>
                        <Link
                            href={`/admin/create-drive?id=${driveId}`}
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
                            Back to Drives
                        </Link>
                    </div>
                </div>
            </section>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="h-9 rounded-lg border border-gray-200 bg-white p-1 shadow-none">
                    <TabsTrigger value="candidates" className="h-7.5 rounded-md px-3 text-sm font-semibold text-gray-500 data-[state=active]:bg-[#F97316] data-[state=active]:text-white">
                        Candidates
                    </TabsTrigger>
                    <TabsTrigger value="screening" className="h-7.5 rounded-md px-3 text-sm font-semibold text-gray-500 data-[state=active]:bg-[#F97316] data-[state=active]:text-white">
                        Screening Settings
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="candidates" className="mt-0">
                    <DriveCandidatesTable driveId={driveId} />
                </TabsContent>

                <TabsContent value="screening" className="mt-0">
                    <div className="space-y-8">
                        <div className="rounded-[2rem] border border-white/40 bg-white/60 p-5 shadow-[0_8px_24px_rgba(15,23,42,0.03)] backdrop-blur-xl">
                            <div className="mb-4 flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gray-400">Screening settings</p>
                                    <h2 className="mt-1 text-xl font-black tracking-tight text-gray-900">Configure AI screening criteria</h2>
                                    <p className="mt-2 text-sm text-gray-500 font-medium">
                                        These values are stored in the Drive screening criteria JSON and used for resume scoring.
                                    </p>
                                </div>
                                <Badge className={cn("rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest", "bg-orange-50 text-[#F97316] border border-orange-200")}>
                                    {shortlistMode}
                                </Badge>
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

                            <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-gray-100">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        const current = drive as any;
                                        const rawCriteria = current?.screeningCriteria;
                                        let parsed: Record<string, any> = {};
                                        if (rawCriteria) {
                                            if (typeof rawCriteria === "string") {
                                                try {
                                                    parsed = JSON.parse(rawCriteria);
                                                } catch {
                                                    parsed = {};
                                                }
                                            } else {
                                                parsed = rawCriteria;
                                            }
                                        }
                                        setScreeningThreshold(Number(parsed.threshold ?? current?.screeningThreshold ?? 60));
                                        setShortlistMode((parsed.shortlistMode as "automatic" | "manual") || (current?.shortlistMode as "automatic" | "manual") || "automatic");
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
                    </div>
                </TabsContent>
            </Tabs>

            <DriveResumeUploadModal
                open={uploadOpen}
                onOpenChange={setUploadOpen}
                driveId={driveId}
                driveName={drive?.title || "Drive"}
                onUploaded={() => setRefreshKey((v) => v + 1)}
            />
        </div>
    );
}
