"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    X, User, Mail, Phone, UploadCloud, FileText, Loader2,
    CheckCircle2, AlertTriangle, Minus, Plus,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast-custom";

interface Props {
    open: boolean;
    onClose: () => void;
    driveId: string;
    driveName: string;
    /** mode: "ats" uses resume-screening upload; "interview-only" creates candidate + sends invite */
    mode: "ats" | "interview-only";
    onDone?: () => void;
}

function fmt(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AddCandidateDrawer({ open, onClose, driveId, driveName, mode, onDone }: Props) {
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [resumeFile, setResumeFile] = useState<File | null>(null);
    const [dragging, setDragging] = useState(false);
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) {
            setFullName(""); setEmail(""); setPhone("");
            setResumeFile(null); setDragging(false);
            setLoading(false); setDone(false); setError(null);
        }
    }, [open]);

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, onClose]);

    const handleFile = (f: File | null) => {
        if (!f) return;
        if (!f.name.toLowerCase().endsWith(".pdf")) {
            setError("Only PDF resumes are accepted.");
            return;
        }
        setError(null);
        setResumeFile(f);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fullName.trim() || !email.trim()) return;
        if (mode === "ats" && !resumeFile) { setError("Please attach a resume PDF."); return; }

        setLoading(true); setError(null);
        try {
            if (mode === "ats") {
                // ATS: upload resume with form metadata preserved (name/email/phone)
                // then enqueue screening. Admin manually sends invite after shortlisting.
                const fd = new FormData();
                fd.append("file", resumeFile!);
                fd.append("driveId", driveId);
                fd.append("fullName", fullName.trim());
                fd.append("email", email.trim());
                fd.append("phone", phone.trim());
                const res = await fetch(`/api/admin/add-candidate`, { method: "POST", body: fd });
                if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Upload failed");
                toast.success(`${fullName} added — resume screening started.`);
            } else {
                // Interview Only: upload resume (optional) then create candidate.
                // If resume provided → worker scores it and auto-sends invite after scoring.
                // If no resume → invite sent immediately.
                let resumeUrl = "";
                if (resumeFile) {
                    const fd = new FormData();
                    fd.append("file", resumeFile);
                    fd.append("driveId", driveId);
                    const upRes = await fetch(`/api/admin/upload-resume`, { method: "POST", body: fd });
                    if (upRes.ok) {
                        const upData = await upRes.json();
                        resumeUrl = upData.url || "";
                    }
                }
                const res = await fetch("/api/admin/interview-only", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        driveId,
                        candidates: [{ fullName: fullName.trim(), email: email.trim(), phone: phone.trim(), resumeUrl }],
                    }),
                });
                if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
                toast.success(resumeFile
                    ? `${fullName} added — invite will be sent after resume is scored.`
                    : `Interview invite sent to ${fullName}.`
                );
            }
            setDone(true);
            onDone?.();
            setTimeout(() => onClose(), 1000);
        } catch (err: any) {
            setError(err.message || "Something went wrong");
        } finally {
            setLoading(false);
        }
    };

    const isAts = mode === "ats";

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
                        onClick={onClose}
                    />
                    {/* Drawer */}
                    <motion.div
                        key="drawer"
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", stiffness: 320, damping: 32 }}
                        className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-white shadow-2xl flex flex-col"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                                    {isAts ? "Add Candidate" : "Add & Invite"}
                                </p>
                                <h2 className="text-[16px] font-bold text-slate-900 mt-0.5 truncate max-w-[260px]">{driveName}</h2>
                            </div>
                            <button
                                onClick={onClose}
                                className="h-9 w-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Body */}
                        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
                            {/* Name */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Full Name *</label>
                                <div className="relative">
                                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                                    <Input
                                        placeholder="e.g. Priya Sharma"
                                        className="pl-10 h-11 border-slate-200 rounded-xl focus:border-orange-400 focus:ring-1 focus:ring-orange-400 text-[13px] font-medium"
                                        value={fullName}
                                        onChange={e => setFullName(e.target.value)}
                                        required
                                        disabled={loading || done}
                                    />
                                </div>
                            </div>

                            {/* Email */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Email Address *</label>
                                <div className="relative">
                                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                                    <Input
                                        type="email"
                                        placeholder="e.g. priya@example.com"
                                        className="pl-10 h-11 border-slate-200 rounded-xl focus:border-orange-400 focus:ring-1 focus:ring-orange-400 text-[13px] font-medium"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        required
                                        disabled={loading || done}
                                    />
                                </div>
                            </div>

                            {/* Phone */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Mobile Number</label>
                                <div className="relative">
                                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                                    <Input
                                        type="tel"
                                        placeholder="e.g. +91 98765 43210"
                                        className="pl-10 h-11 border-slate-200 rounded-xl focus:border-orange-400 focus:ring-1 focus:ring-orange-400 text-[13px] font-medium"
                                        value={phone}
                                        onChange={e => setPhone(e.target.value)}
                                        disabled={loading || done}
                                    />
                                </div>
                            </div>

                            {/* Resume upload */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                                    Resume (PDF){isAts ? " *" : ""}
                                </label>
                                <div
                                    onDragOver={e => { e.preventDefault(); setDragging(true); }}
                                    onDragLeave={() => setDragging(false)}
                                    onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0] || null); }}
                                    onClick={() => !resumeFile && fileRef.current?.click()}
                                    className={cn(
                                        "rounded-xl border-2 border-dashed transition-all duration-150",
                                        dragging ? "border-orange-300 bg-orange-50/50" :
                                        resumeFile ? "border-emerald-200 bg-emerald-50/30 cursor-default" :
                                        "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 cursor-pointer"
                                    )}
                                >
                                    <input
                                        ref={fileRef}
                                        type="file"
                                        accept=".pdf"
                                        className="hidden"
                                        onChange={e => { handleFile(e.target.files?.[0] || null); e.target.value = ""; }}
                                        disabled={loading || done}
                                    />
                                    {resumeFile ? (
                                        <div className="flex items-center gap-3 px-4 py-3.5">
                                            <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                                                <FileText className="h-4 w-4 text-emerald-600" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[13px] font-semibold text-slate-800 truncate">{resumeFile.name}</p>
                                                <p className="text-[11px] text-slate-400">{fmt(resumeFile.size)}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={e => { e.stopPropagation(); setResumeFile(null); }}
                                                className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-400 hover:bg-red-50 transition-all"
                                            >
                                                <Minus className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-8 text-center select-none">
                                            <div className={cn(
                                                "mb-3 h-11 w-11 rounded-xl flex items-center justify-center transition-colors",
                                                dragging ? "bg-orange-100 text-orange-500" : "bg-slate-100 text-slate-400"
                                            )}>
                                                <UploadCloud className="h-5 w-5" />
                                            </div>
                                            <p className="text-[13px] font-semibold text-slate-700">
                                                {dragging ? "Drop to attach" : "Drop PDF here"}
                                            </p>
                                            <p className="text-[11px] text-slate-400 mt-0.5">or click to browse</p>
                                            <button
                                                type="button"
                                                onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
                                                className="mt-3 h-8 rounded-lg border border-slate-200 bg-white px-4 text-[12px] font-medium text-slate-600 shadow-sm hover:border-slate-300 hover:bg-slate-50 transition"
                                            >
                                                Browse files
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {error && (
                                <div className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                                    <p className="text-[12px] text-red-600 font-medium">{error}</p>
                                </div>
                            )}

                            {!isAts && (
                                <div className="rounded-xl bg-orange-50 border border-orange-100 px-4 py-3">
                                    <p className="text-[12px] font-semibold text-orange-700">
                                        {resumeFile
                                            ? "Resume will be scored first — interview invite is sent automatically after scoring completes."
                                            : "No resume — interview invite will be sent immediately."}
                                    </p>
                                </div>
                            )}
                        </form>

                        {/* Footer */}
                        <div className="px-6 py-5 border-t border-slate-100 flex items-center justify-between gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={loading}
                                className="h-10 px-5 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-500 hover:bg-slate-50 transition-all disabled:opacity-40"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit as any}
                                disabled={loading || done || !fullName.trim() || !email.trim() || (isAts && !resumeFile)}
                                className={cn(
                                    "flex-1 h-10 rounded-xl text-[13px] font-bold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-40",
                                    done ? "bg-emerald-500" : "bg-orange-500 hover:bg-orange-600"
                                )}
                            >
                                {done
                                    ? <><CheckCircle2 className="h-4 w-4" /> Done</>
                                    : loading
                                    ? <><Loader2 className="h-4 w-4 animate-spin" /> {isAts ? "Uploading…" : "Sending invite…"}</>
                                    : isAts ? "Add & Screen Resume" : resumeFile ? "Add & Screen (Invite After)" : "Add & Send Invite"
                                }
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
