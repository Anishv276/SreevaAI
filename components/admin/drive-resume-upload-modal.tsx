"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast-custom";
import { AlertCircle, FileText, Loader2, Lock, Upload, X } from "lucide-react";
import { getInterviewActionBlockedMessage, isInterviewQuotaLocked, isOrgRestrictedStatus } from "@/lib/interview-quota";
import { useAdminOrg } from "@/context/admin-org-context";

interface DriveResumeUploadModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    driveId: string;
    driveName: string;
    onUploaded?: () => void;
}

export function DriveResumeUploadModal({
    open,
    onOpenChange,
    driveId,
    driveName,
    onUploaded,
}: DriveResumeUploadModalProps) {
    const [files, setFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const adminOrg = useAdminOrg();
    const quotaLocked = isInterviewQuotaLocked(adminOrg ?? {});
    const orgStatus = String(adminOrg?.status || "ACTIVE");
    const isSuspended = isOrgRestrictedStatus(orgStatus);
    const accessLocked = quotaLocked || isSuspended;
    const inputRef = useRef<HTMLInputElement>(null);

    const reset = () => {
        setFiles([]);
        setIsDragging(false);
        setIsUploading(false);
        setError(null);
    };

    const handleClose = () => {
        if (isUploading && !window.confirm("Resume upload is still running. Close anyway?")) {
            return;
        }
        reset();
        onOpenChange(false);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const dropped = Array.from(e.dataTransfer.files).filter((file) => file.name.toLowerCase().endsWith(".pdf"));
        setFiles((prev) => [...prev, ...dropped]);
    };

    const startUpload = async () => {
        if (accessLocked) {
            toast.error(getInterviewActionBlockedMessage(isSuspended));
            return;
        }
        if (!files.length || isUploading) {
            toast.error("Please add at least one PDF resume");
            return;
        }

        setIsUploading(true);
        setError(null);

        try {
            const formData = new FormData();
            files.forEach((file) => formData.append("files", file));

            const res = await fetch(`/api/drives/${driveId}/resume-screening`, {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const payload = await res.json().catch(() => null);
                throw new Error(payload?.error || "Upload failed");
            }

            await res.json().catch(() => null);
            toast.success("Upload successful! The table will update while the worker processes resumes.");
            onUploaded?.();
            reset();
            onOpenChange(false);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Upload failed";
            setError(message);
            toast.error(message);
            setIsUploading(false);
        }
    };

    useEffect(() => {
        if (!open) {
            reset();
        }
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-white/40 bg-white/95 backdrop-blur-2xl shadow-[0_30px_100px_rgba(0,0,0,0.18)]">
                <DialogHeader className="space-y-2 shrink-0">
                    <DialogTitle className="text-2xl font-black tracking-tight text-gray-900">Upload Resumes</DialogTitle>
                    <p className="text-sm text-gray-500">{driveName}</p>
                </DialogHeader>

                <div className="flex-1 space-y-5 overflow-y-auto py-3 pr-1">
                    <div
                        onDragOver={(e) => {
                            e.preventDefault();
                            setIsDragging(true);
                        }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={onDrop}
                        onClick={() => files.length === 0 && inputRef.current?.click()}
                        className={cn(
                            "rounded-3xl border-2 border-dashed transition-all duration-200 cursor-pointer",
                            isDragging ? "border-orange-400 bg-orange-50/70" : "border-gray-200 hover:border-orange-300",
                            files.length > 0 ? "p-5 bg-orange-50/20" : "p-12"
                        )}
                    >
                        <input
                            ref={inputRef}
                            type="file"
                            multiple
                            accept=".pdf"
                            className="hidden"
                            onChange={(e) => {
                                setFiles((prev) => [...prev, ...Array.from(e.target.files || [])]);
                                e.target.value = "";
                            }}
                        />

                        {files.length === 0 ? (
                            <div className="text-center">
                                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-500 shadow-sm">
                                    <Upload className="h-7 w-7" />
                                </div>
                                <p className="text-base font-bold text-gray-800">Drop PDF resumes here</p>
                                <p className="mt-1 text-sm text-gray-400">or click to browse files</p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        inputRef.current?.click();
                                    }}
                                    className="mt-5 h-10 rounded-2xl border-orange-200 bg-white px-4 text-sm font-bold text-orange-600 hover:border-orange-300 hover:bg-orange-50"
                                >
                                    Browse files
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="text-3xl font-black text-gray-900 tabular-nums leading-none">{files.length}</p>
                                        <p className="text-xs font-bold uppercase tracking-widest text-gray-400">PDF files selected</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                inputRef.current?.click();
                                            }}
                                            className="h-10 rounded-2xl border-orange-200 bg-orange-50 px-4 text-xs font-bold text-orange-600 hover:border-orange-300 hover:bg-orange-100 transition-colors"
                                        >
                                            + Add More
                                        </Button>
                                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-100 text-orange-500 shadow-sm">
                                            <FileText className="h-5 w-5" />
                                        </div>
                                    </div>
                                </div>

                                <div className="max-h-56 overflow-y-auto space-y-2 rounded-2xl border border-orange-100 bg-white/80 p-3 pr-2">
                                    {files.map((file) => (
                                        <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
                                            <div className="min-w-0">
                                                <span className="block truncate text-sm font-bold text-gray-800">{file.name}</span>
                                                <span className="text-[11px] font-medium text-gray-400">{Math.max(1, Math.round(file.size / 1024))} KB</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setFiles((prev) => prev.filter((item) => item !== file));
                                                }}
                                                className="shrink-0 rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {accessLocked && (
                        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                            <div className="space-y-1">
                                <p className="font-bold">Resume upload locked</p>
                                <p className="font-medium">{getInterviewActionBlockedMessage(isSuspended)}</p>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span className="font-medium">{error}</span>
                        </div>
                    )}

                    <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-100 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleClose}
                            className="h-11 rounded-2xl border-gray-200 bg-white px-5 font-bold text-gray-600 hover:bg-gray-50"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={startUpload}
                            disabled={!files.length || isUploading || accessLocked}
                            className="h-11 rounded-2xl bg-orange-600 px-5 font-bold text-white shadow-[0_10px_24px_rgba(249,115,22,0.28)] hover:bg-orange-700 hover:shadow-[0_12px_28px_rgba(249,115,22,0.34)]"
                        >
                            {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {isUploading ? "Uploading..." : "Start Screening"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
