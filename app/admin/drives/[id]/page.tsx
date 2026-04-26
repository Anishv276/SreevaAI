"use client";

import { useState, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/components/ui/toast-custom";
import { Button } from "@/components/ui/button";
import {
    ArrowLeft,
    Briefcase,
    Loader2,
    X,
    Upload,
    Settings,
    AlertCircle,
    Clock,
    Check
} from "lucide-react";
import { useJobs } from "@/context/jobs-context";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function DriveDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const orgId = searchParams.get("orgId");
    const { id: driveId } = use(params);

    const { jobs, toggleDriveStatus } = useJobs();
    const [activeTab, setActiveTab] = useState<"upload" | "settings">("upload");
    const [resumeFiles, setResumeFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [isTogglingStatus, setIsTogglingStatus] = useState(false);
    const [statusModalDrive, setStatusModalDrive] = useState<{ id: string; currentStatus: string } | null>(null);

    const drive = jobs.find(j => j.id === driveId);

    useEffect(() => {
        if (!drive) {
            router.push("/admin/drives");
        }
    }, [drive, router]);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files).filter(f => f.type === "application/pdf");
        if (files.length === 0) {
            toast.error("Only PDF files are supported");
            return;
        }
        setResumeFiles(prev => [...prev, ...files]);
        toast.success(`${files.length} resume(s) added`);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []).filter(f => f.type === "application/pdf");
        if (files.length === 0) {
            toast.error("Only PDF files are supported");
            return;
        }
        setResumeFiles(prev => [...prev, ...files]);
        toast.success(`${files.length} resume(s) added`);
    };

    if (!drive) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-10 w-10 text-orange-500 animate-spin" />
            </div>
        );
    }

    const effectiveExpired = drive.deadline && new Date(drive.deadline) < new Date();
    let statusLabel = "Active";
    let statusColor = "text-green-600";
    let dotColor = "bg-green-500 animate-pulse";
    let statusBadgeBg = "bg-green-50";

    if (drive.status === "CLOSED") {
        statusLabel = "Closed";
        statusColor = "text-red-600";
        dotColor = "bg-red-500";
        statusBadgeBg = "bg-red-50";
    } else if (effectiveExpired) {
        statusLabel = "Expired";
        statusColor = "text-orange-600";
        dotColor = "bg-orange-500";
        statusBadgeBg = "bg-orange-50";
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

                    {/* Status Badge with Dropdown */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => {
                                setStatusModalDrive({
                                    id: drive.id,
                                    currentStatus: statusLabel === "Active" ? "Active" : statusLabel === "Closed" ? "Closed" : "Expired"
                                });
                            }}
                            className={cn(
                                "flex items-center gap-2.5 px-4 py-2 rounded-xl border-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-sm",
                                statusBadgeBg === "bg-green-50" ? "bg-green-50 border-green-200" :
                                    statusBadgeBg === "bg-red-50" ? "bg-red-50 border-red-200" :
                                        "bg-orange-50 border-orange-200"
                            )}
                        >
                            <div className={cn("h-2 w-2 rounded-full", dotColor)} />
                            <span className={cn("text-[12px] font-bold uppercase tracking-wider", statusColor)}>
                                {statusLabel}
                            </span>
                        </button>
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
                        Screening Settings
                    </button>
                </div>

                {/* Tab Content */}
                <div className="bg-white/60 backdrop-blur-xl rounded-b-3xl border border-white/20 border-t-0 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.03)]">
                    {activeTab === "upload" ? (
                        <div className="space-y-8">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 mb-2">Upload Resumes</h2>
                                <p className="text-gray-600">Upload candidate resumes in PDF format. Our AI will automatically screen and rank them based on the criteria below.</p>
                            </div>

                            {/* Drag & Drop Zone */}
                            <div
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                className={cn(
                                    "relative border-2 border-dashed rounded-3xl p-16 text-center transition-all",
                                    isDragging
                                        ? "border-[#F97316] bg-orange-50/50"
                                        : "border-gray-200 bg-gray-50/50 hover:border-[#F97316] hover:bg-orange-50/30"
                                )}
                            >
                                <div className="flex flex-col items-center gap-3">
                                    <div className="h-14 w-14 rounded-xl bg-white flex items-center justify-center text-orange-500 border border-gray-200">
                                        <Upload className="h-7 w-7" />
                                    </div>
                                    <div>
                                        <p className="text-lg font-bold text-gray-900">Drag and drop resumes here</p>
                                        <p className="text-sm text-gray-500 mt-1">or click to browse your files</p>
                                    </div>
                                    <input
                                        type="file"
                                        multiple
                                        accept=".pdf"
                                        onChange={handleFileSelect}
                                        className="absolute inset-0 opacity-0 cursor-pointer rounded-3xl"
                                    />
                                </div>
                            </div>

                            {/* File List */}
                            {resumeFiles.length > 0 && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-lg font-bold text-gray-900">{resumeFiles.length} Resumes Ready</p>
                                            <p className="text-sm text-gray-500">Click "Start Screening" to begin the AI screening process</p>
                                        </div>
                                        <button
                                            onClick={() => setResumeFiles([])}
                                            className="text-sm text-gray-500 hover:text-gray-700 font-medium px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                                        >
                                            Clear All
                                        </button>
                                    </div>

                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                        {resumeFiles.map((file, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100 hover:border-gray-200 transition-colors">
                                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                                    <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center text-red-600 flex-shrink-0 text-xs font-bold">
                                                        PDF
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                                                        <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setResumeFiles(prev => prev.filter((_, i) => i !== idx))}
                                                    className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0 p-2"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex gap-4 pt-4 border-t border-gray-100">
                                <Link href="/admin/drives" className="flex-1">
                                    <Button variant="outline" className="w-full rounded-xl border-gray-200 text-gray-900 font-bold text-sm h-12">
                                        Cancel
                                    </Button>
                                </Link>
                                {resumeFiles.length > 0 && (
                                    <Button className="flex-1 rounded-xl bg-[#F97316] hover:bg-orange-600 text-white font-bold text-sm h-12">
                                        Start Screening ({resumeFiles.length})
                                    </Button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 mb-2">Screening Rules</h2>
                                <p className="text-gray-600">Configure AI screening criteria. The system will automatically score and rank candidates based on these settings.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Skills */}
                                <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-50/50 border border-blue-100/50 space-y-4">
                                    <h3 className="font-bold text-gray-900 text-lg">Required Skills</h3>
                                    <p className="text-sm text-gray-600">Minimum match: 3 out of 5 required</p>
                                    <div className="space-y-2">
                                        {["React", "Node.js", "TypeScript", "MongoDB", "Git"].map((skill, i) => (
                                            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-white border border-blue-100">
                                                <span className="text-sm font-medium text-gray-700">{skill}</span>
                                                <Check className="h-4 w-4 text-blue-600" />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Experience */}
                                <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-50 to-purple-50/50 border border-purple-100/50 space-y-4">
                                    <h3 className="font-bold text-gray-900 text-lg">Experience Level</h3>
                                    <div className="space-y-3">
                                        <div>
                                            <p className="text-sm font-medium text-gray-700 mb-1">Minimum: 2 years</p>
                                            <div className="w-full bg-gray-200 rounded-full h-2">
                                                <div className="bg-purple-600 h-2 rounded-full" style={{ width: "40%" }}></div>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-700 mb-1">Maximum: 8 years</p>
                                            <div className="w-full bg-gray-200 rounded-full h-2">
                                                <div className="bg-purple-600 h-2 rounded-full" style={{ width: "100%" }}></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Education */}
                                <div className="p-6 rounded-2xl bg-gradient-to-br from-green-50 to-green-50/50 border border-green-100/50 space-y-4">
                                    <h3 className="font-bold text-gray-900 text-lg">Education</h3>
                                    <ul className="space-y-2">
                                        <li className="flex items-center gap-2 text-sm text-gray-700">
                                            <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                                            Bachelor's in Computer Science
                                        </li>
                                        <li className="flex items-center gap-2 text-sm text-gray-700">
                                            <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                                            Or equivalent professional experience
                                        </li>
                                        <li className="flex items-center gap-2 text-sm text-gray-700">
                                            <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                                            Certifications (AWS, GCP) preferred
                                        </li>
                                    </ul>
                                </div>

                                {/* Ranking */}
                                <div className="p-6 rounded-2xl bg-gradient-to-br from-amber-50 to-amber-50/50 border border-amber-100/50 space-y-4">
                                    <h3 className="font-bold text-gray-900 text-lg">Scoring Weights</h3>
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-gray-700 font-medium">Skills Match</span>
                                            <span className="font-bold text-amber-700">40%</span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-gray-700 font-medium">Experience</span>
                                            <span className="font-bold text-amber-700">35%</span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-gray-700 font-medium">Education</span>
                                            <span className="font-bold text-amber-700">25%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 flex gap-3">
                                <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-blue-900">
                                    These settings are automatically applied when you upload resumes. You can modify rules anytime before screening starts.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Status Toggle Modal */}
            {statusModalDrive && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm space-y-6">
                        {statusModalDrive.currentStatus === "Expired" ? (
                            <>
                                <div className="flex flex-col items-center gap-3 text-center">
                                    <div className="h-14 w-14 rounded-2xl bg-orange-50 flex items-center justify-center">
                                        <Clock className="h-7 w-7 text-orange-500" />
                                    </div>
                                    <h2 className="text-xl font-bold text-gray-900">Drive Expired</h2>
                                    <p className="text-sm text-gray-500 font-medium leading-relaxed">
                                        This drive has passed its deadline. To reopen it, please edit the drive and set a new deadline.
                                    </p>
                                </div>
                                <div className="flex gap-3">
                                    <Button variant="outline" className="flex-1 rounded-2xl font-bold" onClick={() => setStatusModalDrive(null)}>
                                        Cancel
                                    </Button>
                                    <Button
                                        className="flex-1 rounded-2xl font-bold bg-gradient-to-r from-[#F97316] to-orange-500 text-white"
                                        onClick={() => {
                                            setStatusModalDrive(null);
                                            router.push(`/admin/create-drive?id=${driveId}${orgId ? `&orgId=${orgId}` : ''}`);
                                        }}
                                    >
                                        Edit Drive
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex flex-col items-center gap-3 text-center">
                                    <div className={cn(
                                        "h-14 w-14 rounded-2xl flex items-center justify-center",
                                        statusModalDrive.currentStatus === "Active" ? "bg-red-50" : "bg-green-50"
                                    )}>
                                        <AlertCircle className={cn("h-7 w-7", statusModalDrive.currentStatus === "Active" ? "text-red-500" : "text-green-500")} />
                                    </div>
                                    <h2 className="text-xl font-bold text-gray-900">
                                        {statusModalDrive.currentStatus === "Active" ? "Close Drive?" : "Reopen Drive?"}
                                    </h2>
                                    <p className="text-sm text-gray-500 font-medium leading-relaxed">
                                        {statusModalDrive.currentStatus === "Active"
                                            ? "Closing this drive will stop accepting new applications. You can reopen it anytime."
                                            : "Reopening this drive will allow candidates to apply again."
                                        }
                                    </p>
                                </div>
                                <div className="flex gap-3">
                                    <Button variant="outline" className="flex-1 rounded-2xl font-bold" onClick={() => setStatusModalDrive(null)} disabled={isTogglingStatus}>
                                        Cancel
                                    </Button>
                                    <Button
                                        className={cn(
                                            "flex-1 rounded-2xl font-bold text-white",
                                            statusModalDrive.currentStatus === "Active"
                                                ? "bg-gradient-to-r from-red-500 to-red-600"
                                                : "bg-gradient-to-r from-green-500 to-green-600"
                                        )}
                                        disabled={isTogglingStatus}
                                        onClick={async () => {
                                            setIsTogglingStatus(true);
                                            try {
                                                const newStatus = statusModalDrive.currentStatus === "Active" ? "CLOSED" : "ACTIVE";
                                                await toggleDriveStatus(statusModalDrive.id, newStatus);
                                                toast.success(`Drive ${newStatus === "ACTIVE" ? "reopened" : "closed"} successfully`);
                                                setStatusModalDrive(null);
                                            } catch {
                                                toast.error("Failed to update drive status");
                                            } finally {
                                                setIsTogglingStatus(false);
                                            }
                                        }}
                                    >
                                        {isTogglingStatus ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : statusModalDrive.currentStatus === "Active" ? "Yes, Close It" : "Yes, Reopen It"}
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
