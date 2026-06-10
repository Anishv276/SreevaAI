"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast-custom";
import { AlertTriangle, CheckCircle2, FileText, Loader2, Lock, Minus, Plus, UploadCloud } from "lucide-react";
import { getInterviewActionBlockedMessage, isInterviewQuotaLocked, isOrgRestrictedStatus } from "@/lib/interview-quota";
import { useAdminOrg } from "@/context/admin-org-context";

interface DriveResumeUploadModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    driveId: string;
    driveName: string;
    onUploaded?: () => void;
}

function fmt(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DriveResumeUploadModal({ open, onOpenChange, driveId, driveName, onUploaded }: DriveResumeUploadModalProps) {
    const [files, setFiles] = useState<File[]>([]);
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const adminOrg = useAdminOrg();
    const quotaLocked = isInterviewQuotaLocked(adminOrg ?? {});
    const isSuspended = isOrgRestrictedStatus(String(adminOrg?.status || "ACTIVE"));
    const locked = quotaLocked || isSuspended;
    const totalSize = files.reduce((s, f) => s + f.size, 0);

    const reset = () => { setFiles([]); setDragging(false); setUploading(false); setDone(false); setError(null); };
    const close = () => {
        if (uploading && !window.confirm("Upload in progress. Close anyway?")) return;
        reset(); onOpenChange(false);
    };
    const add = (incoming: File[]) => {
        const pdfs = incoming.filter(f => f.name.toLowerCase().endsWith(".pdf"));
        setFiles(prev => { const seen = new Set(prev.map(f => f.name)); return [...prev, ...pdfs.filter(f => !seen.has(f.name))]; });
    };
    const upload = async () => {
        if (locked) { toast.error(getInterviewActionBlockedMessage(isSuspended)); return; }
        if (!files.length || uploading) return;
        setUploading(true); setError(null);
        try {
            const fd = new FormData();
            files.forEach(f => fd.append("files", f));
            const res = await fetch(`/api/drives/${driveId}/resume-screening`, { method: "POST", body: fd });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Upload failed");
            setDone(true);
            toast.success(`${files.length} resume${files.length > 1 ? "s" : ""} queued for screening.`);
            onUploaded?.();
            setTimeout(() => { reset(); onOpenChange(false); }, 1200);
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Upload failed";
            setError(msg); toast.error(msg); setUploading(false);
        }
    };

    useEffect(() => { if (!open) reset(); }, [open]);

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="flex w-full max-w-lg flex-col gap-0 overflow-hidden rounded-2xl border border-zinc-100 bg-white p-0 shadow-xl">

                <VisuallyHidden><DialogTitle>Upload Resumes</DialogTitle></VisuallyHidden>

                {/* Header */}
                <div className="px-6 py-4 border-b border-zinc-100">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Upload Resumes</p>
                    <h2 className="mt-0.5 text-[15px] font-semibold text-zinc-800 truncate max-w-[340px]">{driveName}</h2>
                </div>

                {/* Body */}
                <div className="overflow-y-auto px-6 py-5 space-y-3">

                    {/* Drop zone */}
                    <div
                        onDragOver={e => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={e => { e.preventDefault(); setDragging(false); add(Array.from(e.dataTransfer.files)); }}
                        onClick={() => !files.length && inputRef.current?.click()}
                        className={cn(
                            "rounded-xl border-2 border-dashed transition-all duration-150",
                            dragging ? "border-orange-200 bg-orange-50/40" : files.length === 0
                                ? "cursor-pointer border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/50"
                                : "border-zinc-100 bg-zinc-50/30"
                        )}
                    >
                        <input ref={inputRef} type="file" multiple accept=".pdf" className="hidden"
                            onChange={e => { add(Array.from(e.target.files || [])); e.target.value = ""; }} />

                        {files.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-center select-none">
                                <div className={cn("mb-3 flex h-12 w-12 items-center justify-center rounded-xl transition-colors",
                                    dragging ? "bg-orange-100 text-orange-500" : "bg-zinc-100 text-zinc-400")}>
                                    <UploadCloud className="h-5 w-5" />
                                </div>
                                <p className="text-[13px] font-semibold text-zinc-700">
                                    {dragging ? "Release to add files" : "Drop PDF resumes here"}
                                </p>
                                <p className="mt-0.5 text-[12px] text-zinc-400">or browse from your computer</p>
                                <button type="button"
                                    onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
                                    className="mt-4 h-8 rounded-lg border border-zinc-200 bg-white px-4 text-[12px] font-medium text-zinc-600 shadow-sm hover:border-zinc-300 hover:bg-zinc-50 transition">
                                    Browse files
                                </button>
                                <p className="mt-3 text-[11px] text-zinc-300">PDF only · All sizes accepted</p>
                            </div>
                        ) : (
                            <div className="p-4 space-y-3">
                                {/* Stats */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-2xl font-bold tabular-nums text-zinc-800">{files.length}</span>
                                        <span className="text-[12px] text-zinc-400 font-medium">
                                            {files.length === 1 ? "file" : "files"} &middot; {fmt(totalSize)}
                                        </span>
                                    </div>
                                    <button type="button"
                                        onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
                                        className="flex items-center gap-1 h-7 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-medium text-zinc-500 shadow-sm hover:border-zinc-300 hover:text-zinc-700 transition">
                                        <Plus className="h-3 w-3" /> Add more
                                    </button>
                                </div>

                                {/* File list */}
                                <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-zinc-100 bg-white p-1.5">
                                    {files.map((file, i) => (
                                        <div key={`${file.name}-${file.size}`}
                                            className="group flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-zinc-50 transition">
                                            <span className="w-4 shrink-0 text-[10px] font-medium tabular-nums text-zinc-300 text-right">{i + 1}</span>
                                            <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-300" />
                                            <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-zinc-600">{file.name}</p>
                                            <span className="shrink-0 text-[11px] text-zinc-300">{fmt(file.size)}</span>
                                            <button type="button"
                                                onClick={e => { e.stopPropagation(); setFiles(p => p.filter(f => f !== file)); }}
                                                className="shrink-0 rounded p-0.5 text-zinc-300 opacity-0 group-hover:opacity-100 hover:text-red-400 transition">
                                                <Minus className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Locked */}
                    {locked && (
                        <div className="flex items-start gap-2.5 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                            <div>
                                <p className="text-[12px] font-semibold text-amber-700">Upload unavailable</p>
                                <p className="text-[11px] text-amber-500 mt-0.5">{getInterviewActionBlockedMessage(isSuspended)}</p>
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                            <p className="text-[12px] text-red-500">{error}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-zinc-100 px-6 py-4">
                    <p className="text-[11px] text-zinc-400">
                        {files.length > 0 ? `${files.length} PDF${files.length !== 1 ? "s" : ""} ready` : "No files selected"}
                    </p>
                    <div className="flex items-center gap-2">
                        <button onClick={close} disabled={uploading}
                            className="h-8 rounded-lg border border-zinc-200 px-4 text-[12px] font-medium text-zinc-500 hover:bg-zinc-50 transition disabled:opacity-40">
                            Cancel
                        </button>
                        <button onClick={upload} disabled={!files.length || uploading || locked || done}
                            className={cn(
                                "flex h-8 items-center gap-1.5 rounded-lg px-4 text-[12px] font-semibold text-white transition disabled:opacity-40",
                                done ? "bg-emerald-500" : "bg-orange-500 hover:bg-orange-600"
                            )}>
                            {done ? <><CheckCircle2 className="h-3.5 w-3.5" /> Done</>
                                : uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</>
                                    : <>Start Screening {files.length > 0 && <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px]">{files.length}</span>}</>}
                        </button>
                    </div>
                </div>

            </DialogContent>
        </Dialog>
    );
}
