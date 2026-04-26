"use client";
import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, CheckCircle2, AlertCircle, X } from "lucide-react";
import { toast } from "@/components/ui/toast-custom";

interface BulkImportModalProps {
    open: boolean;
    onClose: () => void;
    driveId: string;
    driveName: string;
    onSuccess?: () => void;
}

export function BulkImportModal({
    open,
    onClose,
    driveId,
    driveName,
    onSuccess,
}: BulkImportModalProps) {
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [bulkImportId, setBulkImportId] = useState<string | null>(null);
    const [progress, setProgress] = useState({ processed: 0, total: 0 });
    const [status, setStatus] = useState<"idle" | "uploading" | "processing" | "completed" | "failed">("idle");
    const [error, setError] = useState<string | null>(null);
    const dropZoneRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (bulkImportId && status === "processing") {
            // Poll for progress
            pollIntervalRef.current = setInterval(() => {
                fetch(`/api/candidates/bulk-import?id=${bulkImportId}`)
                    .then((res) => res.json())
                    .then((data) => {
                        setProgress({ processed: data.processedCount, total: data.totalCount });

                        if (data.status === "COMPLETED") {
                            setStatus("completed");
                            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                            if (onSuccess) onSuccess();
                        } else if (data.status === "FAILED") {
                            setStatus("failed");
                            setError(data.errorMessage || "Unknown error");
                            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                        }
                    })
                    .catch((err) => {
                        console.error("Poll error:", err);
                    });
            }, 1000);
        }

        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, [bulkImportId, status, onSuccess]);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (dropZoneRef.current) {
            dropZoneRef.current.classList.add("ring-2", "ring-orange-400", "bg-orange-50/50");
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        if (dropZoneRef.current) {
            dropZoneRef.current.classList.remove("ring-2", "ring-orange-400", "bg-orange-50/50");
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (dropZoneRef.current) {
            dropZoneRef.current.classList.remove("ring-2", "ring-orange-400", "bg-orange-50/50");
        }
        const droppedFiles = Array.from(e.dataTransfer.files).filter((f) =>
            f.type === "application/pdf" || f.name.endsWith(".pdf")
        );
        setFiles((prev) => [...prev, ...droppedFiles]);
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(e.target.files || []);
        setFiles((prev) => [...prev, ...selectedFiles]);
    };

    const handleRemoveFile = (index: number) => {
        setFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (files.length === 0) {
            setError("Please select at least one PDF file");
            return;
        }

        setUploading(true);
        setStatus("uploading");
        setError(null);

        try {
            const formData = new FormData();
            formData.append("driveId", driveId);
            files.forEach((file) => formData.append("files", file));

            const response = await fetch("/api/candidates/bulk-import", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || "Upload failed");
            }

            const data = await response.json();
            setBulkImportId(data.bulkImportId);
            setProgress({ processed: 0, total: data.totalCount });
            setStatus("processing");
            setUploading(false);
            toast.success(`Starting bulk import of ${data.totalCount} resumes...`);

        } catch (err) {
            setStatus("failed");
            setError((err as Error).message);
            setUploading(false);
            toast.error((err as Error).message);
        }
    };

    const handleClose = () => {
        if (status === "processing") {
            const confirmClose = window.confirm(
                "Import is still in progress. Close anyway?"
            );
            if (!confirmClose) return;
        }
        setFiles([]);
        setStatus("idle");
        setBulkImportId(null);
        setProgress({ processed: 0, total: 0 });
        setError(null);
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">Bulk Import Resumes</DialogTitle>
                    <p className="text-sm text-gray-500 mt-1">
                        Import resumes for <span className="font-semibold">{driveName}</span>
                    </p>
                </DialogHeader>

                {status === "idle" || status === "uploading" ? (
                    <div className="space-y-6 py-6">
                        {/* Drop Zone */}
                        <div
                            ref={dropZoneRef}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            className="relative border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center transition-all cursor-pointer hover:border-orange-300 hover:bg-orange-50/30"
                        >
                            <input
                                ref={inputRef}
                                type="file"
                                multiple
                                accept=".pdf"
                                onChange={handleFileInput}
                                className="hidden"
                            />
                            <Upload className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                            <p className="text-lg font-bold text-gray-900">
                                Drop resumes here or click to browse
                            </p>
                            <p className="text-sm text-gray-500 mt-1">
                                PDF files only, up to 50 MB each
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => inputRef.current?.click()}
                                className="mt-4 rounded-lg"
                            >
                                Select Files
                            </Button>
                        </div>

                        {/* File List */}
                        {files.length > 0 && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-bold text-gray-700">
                                        Selected Files: <span className="text-orange-600">{files.length}</span>
                                    </p>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setFiles([])}
                                        className="text-xs text-gray-500 hover:text-gray-700"
                                    >
                                        Clear All
                                    </Button>
                                </div>
                                <div className="max-h-48 overflow-y-auto space-y-2 bg-gray-50 rounded-lg p-3">
                                    {files.map((file, idx) => (
                                        <div
                                            key={idx}
                                            className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-100"
                                        >
                                            <p className="text-sm text-gray-700 truncate">{file.name}</p>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveFile(idx)}
                                                className="text-gray-400 hover:text-red-500 transition-colors"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                                <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                            <Button
                                variant="ghost"
                                onClick={handleClose}
                                disabled={uploading}
                                className="rounded-lg"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={uploading || files.length === 0}
                                className="rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold"
                            >
                                {uploading ? "Uploading..." : "Import Resumes"}
                            </Button>
                        </div>
                    </div>
                ) : status === "processing" ? (
                    <div className="space-y-6 py-8 text-center">
                        <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center animate-pulse">
                            <Upload className="h-8 w-8 text-orange-600" />
                        </div>
                        <div>
                            <p className="text-lg font-bold text-gray-900">Processing Resumes</p>
                            <p className="text-sm text-gray-500 mt-1">
                                {progress.processed} / {progress.total}
                            </p>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                            <div
                                className="bg-gradient-to-r from-orange-500 to-orange-600 h-full transition-all duration-300"
                                style={{
                                    width: `${progress.total > 0 ? (progress.processed / progress.total) * 100 : 0}%`,
                                }}
                            />
                        </div>
                        <p className="text-xs text-gray-400">
                            This may take a few minutes depending on file size
                        </p>
                    </div>
                ) : status === "completed" ? (
                    <div className="space-y-6 py-8 text-center">
                        <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                            <CheckCircle2 className="h-8 w-8 text-green-600" />
                        </div>
                        <div>
                            <p className="text-lg font-bold text-gray-900">Import Complete</p>
                            <p className="text-sm text-gray-500 mt-1">
                                {progress.total} resumes processed successfully
                            </p>
                        </div>
                        <div className="flex items-center justify-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                            <p className="text-sm text-green-700 font-medium">
                                All resumes have been scored and ranked
                            </p>
                        </div>
                        <Button
                            onClick={handleClose}
                            className="rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold"
                        >
                            Done
                        </Button>
                    </div>
                ) : status === "failed" ? (
                    <div className="space-y-6 py-8 text-center">
                        <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                            <AlertCircle className="h-8 w-8 text-red-600" />
                        </div>
                        <div>
                            <p className="text-lg font-bold text-gray-900">Import Failed</p>
                            <p className="text-sm text-gray-500 mt-1">{error}</p>
                        </div>
                        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                            <Button
                                variant="ghost"
                                onClick={handleClose}
                                className="rounded-lg"
                            >
                                Close
                            </Button>
                            <Button
                                onClick={() => {
                                    setStatus("idle");
                                    setFiles([]);
                                    setError(null);
                                    setBulkImportId(null);
                                }}
                                className="rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold"
                            >
                                Try Again
                            </Button>
                        </div>
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
