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
        <div className="space-y-8 pb-12 animate-in fade-in duration-700">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                    <div className="h-14 w-1.5 rounded-full bg-gradient-to-b from-[#F97316] to-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.35)]" />
                    <div className="space-y-1">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-4xl font-black tracking-tighter text-gray-900">{drive?.title || "Drive Candidates"}</h1>
                            <Badge className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#F97316]">
                                Drive Candidates
                            </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-sm font-medium text-gray-500">
                            <Briefcase className="h-4 w-4 text-[#F97316]" />
                            <span>{drive?.department || "Recruitment"} - {drive?.role || "Open Role"}</span>
                            <span className="h-1 w-1 rounded-full bg-gray-300" />
                            <span>{drive?.applicants ?? 0} candidates</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    <Button
                        onClick={() => setUploadOpen(true)}
                        className="h-12 rounded-2xl bg-[#F97316] px-5 font-bold text-white shadow-lg hover:bg-orange-600"
                    >
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Resume
                    </Button>
                    <Link href="/admin/drives">
                        <Button variant="outline" className="h-12 rounded-2xl border-white/40 bg-white/40 px-5 font-bold text-gray-600 backdrop-blur-md shadow-sm">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Drives
                        </Button>
                    </Link>
                    <Link href={`/admin/create-drive?id=${driveId}`}>
                        <Button className="h-12 rounded-2xl bg-gray-900 px-5 font-bold text-white shadow-lg transition-all hover:bg-[#F97316]">
                            <Edit3 className="mr-2 h-4 w-4" />
                            Edit Drive
                        </Button>
                    </Link>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="h-12 rounded-2xl border border-white/40 bg-white/60 p-1 shadow-sm">
                    <TabsTrigger value="candidates" className="h-10 rounded-2xl px-4 text-sm font-bold data-[state=active]:bg-[#F97316] data-[state=active]:text-white">
                        Candidates
                    </TabsTrigger>
                    <TabsTrigger value="screening" className="h-10 rounded-2xl px-4 text-sm font-bold data-[state=active]:bg-[#F97316] data-[state=active]:text-white">
                        Screening Settings
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="candidates" className="mt-0">
                    <DriveCandidatesTable driveId={driveId} />
                </TabsContent>

                <TabsContent value="screening" className="mt-0">
                    <div className="space-y-8">
                        <div className="rounded-[2rem] border border-white/40 bg-white/60 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.04)] backdrop-blur-xl">
                            <div className="mb-4 flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gray-400">Screening settings</p>
                                    <h2 className="mt-1 text-2xl font-black tracking-tight text-gray-900">Configure AI screening criteria</h2>
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
