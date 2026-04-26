"use client";
import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Upload, X, AlertCircle, FileText, Zap, CheckCircle2,
    TrendingUp, TrendingDown, Minus, ChevronUp, ChevronDown,
    ArrowUpDown, ExternalLink, Users, Target, XCircle
} from "lucide-react";
import { toast } from "@/components/ui/toast-custom";
import { cn } from "@/lib/utils";

interface Candidate {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    resumeUrl: string;
    aiScore: number | null;
    resumeStatus: string;
    hiringStatus: string;
    interviewStatus: string;
    createdAt: string;
    aiReport?: string;
}

interface BulkImportModalProps {
    open: boolean;
    onClose: () => void;
    driveId: string;
    driveName: string;
    onSuccess?: () => void;
}

type SortKey = "aiScore" | "fullName" | "resumeStatus";
type SortDir = "asc" | "desc";

export function BulkImportModal({ open, onClose, driveId, driveName, onSuccess }: BulkImportModalProps) {
    const [files, setFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [status, setStatus] = useState<"idle" | "uploading" | "processing" | "done" | "failed">("idle");
    const [progress, setProgress] = useState({ processed: 0, total: 0 });
    const [bulkImportId, setBulkImportId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<Candidate[]>([]);
    const [sortKey, setSortKey] = useState<SortKey>("aiScore");
    const [sortDir, setSortDir] = useState<SortDir>("desc");
    const inputRef = useRef<HTMLInputElement>(null);
    const pollRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!bulkImportId || status !== "processing") return;
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/candidates/bulk-import?id=${bulkImportId}`);
                const data = await res.json();
                setProgress({ processed: data.processedCount, total: data.totalCount });
                if (data.status === "COMPLETED") {
                    clearInterval(pollRef.current!);
                    await fetchResults();
                    setStatus("done");
                    if (onSuccess) onSuccess();
                } else if (data.status === "FAILED") {
                    clearInterval(pollRef.current!);
                    setError(data.errorMessage || "Processing failed");
                    setStatus("failed");
                }
            } catch { /* ignore poll errors */ }
        }, 1200);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [bulkImportId, status]);

    const fetchResults = async () => {
        try {
            const res = await fetch(`/api/candidates?driveId=${driveId}&limit=200&page=1`);
            const data = await res.json();
            setResults(data.candidates || []);
        } catch { /* fallback — table stays empty */ }
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith(".pdf"));
        setFiles(prev => [...prev, ...dropped]);
    };

    const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFiles(prev => [...prev, ...Array.from(e.target.files || [])]);
        e.target.value = "";
    };

    const startScreening = async () => {
        if (!files.length) return;
        if (!driveId) { setError("Select a drive/job first to start screening."); return; }
        setStatus("uploading");
        setError(null);
        try {
            const fd = new FormData();
            fd.append("driveId", driveId);
            files.forEach(f => fd.append("files", f));
            const res = await fetch("/api/candidates/bulk-import", { method: "POST", body: fd });
            if (!res.ok) throw new Error((await res.json()).error || "Upload failed");
            const data = await res.json();
            setBulkImportId(data.bulkImportId);
            setProgress({ processed: 0, total: data.totalCount });
            setStatus("processing");
        } catch (err) {
            setError((err as Error).message);
            setStatus("failed");
            toast.error((err as Error).message);
        }
    };

    const reset = () => {
        setFiles([]);
        setStatus("idle");
        setBulkImportId(null);
        setProgress({ processed: 0, total: 0 });
        setError(null);
        setResults([]);
        if (pollRef.current) clearInterval(pollRef.current);
    };

    const handleClose = () => {
        if (status === "processing" && !window.confirm("Screening is running. Close anyway?")) return;
        reset();
        onClose();
    };

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
        else { setSortKey(key); setSortDir("desc"); }
    };

    const sorted = [...results].sort((a, b) => {
        let av: any = a[sortKey], bv: any = b[sortKey];
        if (sortKey === "aiScore") { av = av ?? -1; bv = bv ?? -1; }
        if (typeof av === "string") av = av.toLowerCase();
        if (typeof bv === "string") bv = bv.toLowerCase();
        return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });

    const shortlisted = results.filter(r => r.resumeStatus?.toLowerCase() === "shortlisted").length;
    const rejected = results.filter(r => r.resumeStatus?.toLowerCase() === "rejected").length;
    const avgScore = results.length
        ? Math.round(results.reduce((s, r) => s + (r.aiScore ?? 0), 0) / results.length)
        : 0;

    const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

    const SortIcon = ({ col }: { col: SortKey }) =>
        sortKey !== col ? <ArrowUpDown className="h-3 w-3 opacity-40" /> :
            sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;

    const scoreColor = (s: number | null) => {
        if (s === null) return "text-gray-400";
        if (s >= 75) return "text-emerald-600";
        if (s >= 50) return "text-amber-500";
        return "text-red-500";
    };

    const scoreBg = (s: number | null) => {
        if (s === null) return "bg-gray-100 text-gray-400";
        if (s >= 75) return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
        if (s >= 50) return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
        return "bg-red-50 text-red-700 ring-1 ring-red-200";
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className={cn(
                "transition-all duration-300",
                status === "done" ? "max-w-6xl" : "max-w-2xl"
            )}>
                <DialogHeader className="pb-2">
                    <DialogTitle className="text-xl font-black text-gray-900">
                        {status === "done" ? "Screening Results" : "Bulk Resume Import"}
                    </DialogTitle>
                    <p className="text-sm text-gray-500">
                        {driveName || "No drive selected"}
                        {status === "done" && ` · ${results.length} candidates processed`}
                    </p>
                </DialogHeader>

                {/* ── STEP 1: DROP ZONE ── */}
                {(status === "idle" || status === "uploading") && (
                    <div className="space-y-5 py-4">
                        <div
                            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={onDrop}
                            onClick={() => files.length === 0 && inputRef.current?.click()}
                            className={cn(
                                "relative border-2 border-dashed rounded-2xl transition-all duration-200 cursor-pointer",
                                isDragging
                                    ? "border-orange-400 bg-orange-50/60 scale-[1.01]"
                                    : files.length > 0
                                        ? "border-orange-300 bg-orange-50/30"
                                        : "border-gray-200 hover:border-orange-300 hover:bg-orange-50/20",
                                files.length > 0 ? "p-6" : "p-12"
                            )}
                        >
                            <input ref={inputRef} type="file" multiple accept=".pdf" onChange={onFileInput} className="hidden" />

                            {files.length === 0 ? (
                                <div className="text-center">
                                    <div className="mx-auto w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center mb-4">
                                        <Upload className="h-7 w-7 text-orange-500" />
                                    </div>
                                    <p className="text-base font-bold text-gray-900">Drop PDF resumes here</p>
                                    <p className="text-sm text-gray-400 mt-1">or click to browse files</p>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center shrink-0">
                                            <FileText className="h-7 w-7 text-orange-500" />
                                        </div>
                                        <div>
                                            <p className="text-2xl font-black text-gray-900 tabular-nums">{files.length}</p>
                                            <p className="text-sm text-gray-500">resume{files.length !== 1 ? "s" : ""} ready to screen</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
                                            className="text-xs font-bold text-orange-600 hover:text-orange-700 px-3 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 transition-colors"
                                        >
                                            + Add more
                                        </button>
                                        <button
                                            onClick={e => { e.stopPropagation(); setFiles([]); }}
                                            className="text-xs font-bold text-gray-400 hover:text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {!driveId && (
                            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                                <p className="text-sm text-amber-700 font-medium">Filter by a specific drive first so scores are calculated against the right job description.</p>
                            </div>
                        )}

                        {error && (
                            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                                <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
                            <Button variant="ghost" onClick={handleClose} className="rounded-xl font-bold text-gray-500">
                                Cancel
                            </Button>
                            <Button
                                onClick={startScreening}
                                disabled={files.length === 0 || status === "uploading"}
                                className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold px-6 flex items-center gap-2"
                            >
                                <Zap className="h-4 w-4" />
                                {status === "uploading" ? "Uploading..." : `Start Screening${files.length > 0 ? ` (${files.length})` : ""}`}
                            </Button>
                        </div>
                    </div>
                )}

                {/* ── STEP 2: PROGRESS ── */}
                {status === "processing" && (
                    <div className="py-10 space-y-8">
                        <div className="text-center space-y-2">
                            <div className="mx-auto w-16 h-16 rounded-2xl bg-orange-100 flex items-center justify-center">
                                <Zap className="h-8 w-8 text-orange-500 animate-pulse" />
                            </div>
                            <p className="text-lg font-black text-gray-900">Screening in progress</p>
                            <p className="text-sm text-gray-500">AI is extracting and scoring each resume</p>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-gray-600">Processing resumes</span>
                                <span className="text-sm font-black text-gray-900 tabular-nums">
                                    {progress.processed} / {progress.total}
                                </span>
                            </div>
                            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full transition-all duration-500"
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-xs text-gray-400 font-bold">
                                <span>{pct}% complete</span>
                                <span>{progress.total - progress.processed} remaining</span>
                            </div>
                        </div>

                        {/* Live mini cards */}
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { label: "Total", value: progress.total, color: "text-gray-900" },
                                { label: "Done", value: progress.processed, color: "text-emerald-600" },
                                { label: "Remaining", value: progress.total - progress.processed, color: "text-orange-500" },
                            ].map(item => (
                                <div key={item.label} className="text-center p-4 bg-gray-50/80 rounded-xl border border-gray-100">
                                    <p className={cn("text-2xl font-black tabular-nums", item.color)}>{item.value}</p>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">{item.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── STEP 3: RESULTS TABLE ── */}
                {status === "done" && (
                    <div className="space-y-5 py-2">
                        {/* Summary row */}
                        <div className="grid grid-cols-4 gap-3">
                            {[
                                { label: "Screened", value: results.length, icon: Users, color: "text-gray-900", bg: "bg-gray-50" },
                                { label: "Shortlisted", value: shortlisted, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
                                { label: "Rejected", value: rejected, icon: XCircle, color: "text-red-500", bg: "bg-red-50" },
                                { label: "Avg Score", value: `${avgScore}%`, icon: Target, color: "text-orange-600", bg: "bg-orange-50" },
                            ].map(s => (
                                <div key={s.label} className={cn("rounded-xl p-4 flex items-center gap-3", s.bg)}>
                                    <s.icon className={cn("h-5 w-5 shrink-0", s.color)} />
                                    <div>
                                        <p className={cn("text-xl font-black tabular-nums leading-tight", s.color)}>{s.value}</p>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{s.label}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Table */}
                        <div className="rounded-2xl border border-gray-100 overflow-hidden bg-white">
                            <div className="overflow-auto max-h-[420px]">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-100">
                                        <tr>
                                            <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400 w-8">#</th>
                                            <th className="text-left px-4 py-3">
                                                <button onClick={() => toggleSort("fullName")} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-700 transition-colors">
                                                    Candidate <SortIcon col="fullName" />
                                                </button>
                                            </th>
                                            <th className="text-left px-4 py-3">
                                                <button onClick={() => toggleSort("aiScore")} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-700 transition-colors">
                                                    Score <SortIcon col="aiScore" />
                                                </button>
                                            </th>
                                            <th className="text-left px-4 py-3">
                                                <button onClick={() => toggleSort("resumeStatus")} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-700 transition-colors">
                                                    Status <SortIcon col="resumeStatus" />
                                                </button>
                                            </th>
                                            <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Fit</th>
                                            <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Interview</th>
                                            <th className="text-right px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {sorted.map((c, i) => {
                                            const score = c.aiScore ?? null;
                                            const isShortlisted = c.resumeStatus?.toLowerCase() === "shortlisted";
                                            let reasoning = "";
                                            try {
                                                const r = JSON.parse(c.aiReport || "{}");
                                                reasoning = r.reasoning || r.summary || "";
                                            } catch { }

                                            return (
                                                <tr key={c.id} className="hover:bg-gray-50/60 transition-colors group">
                                                    <td className="px-4 py-3.5 text-xs font-bold text-gray-300 tabular-nums">{i + 1}</td>
                                                    <td className="px-4 py-3.5">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shrink-0">
                                                                <span className="text-[10px] font-black text-white">
                                                                    {c.fullName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                                                                </span>
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="font-bold text-gray-900 truncate max-w-[160px]">{c.fullName}</p>
                                                                <p className="text-xs text-gray-400 truncate max-w-[160px]">{c.email}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className={cn("text-sm font-black tabular-nums px-2.5 py-1 rounded-lg", scoreBg(score))}>
                                                                {score !== null ? `${score}%` : "—"}
                                                            </span>
                                                            {score !== null && (
                                                                score >= 75 ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> :
                                                                    score >= 50 ? <Minus className="h-3.5 w-3.5 text-amber-500" /> :
                                                                        <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <span className={cn(
                                                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider",
                                                            isShortlisted
                                                                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                                                : "bg-red-50 text-red-600 ring-1 ring-red-200"
                                                        )}>
                                                            {isShortlisted
                                                                ? <><CheckCircle2 className="h-3 w-3" /> Shortlisted</>
                                                                : <><XCircle className="h-3 w-3" /> Rejected</>
                                                            }
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5 max-w-[200px]">
                                                        {reasoning ? (
                                                            <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{reasoning}</p>
                                                        ) : (
                                                            <span className="text-xs text-gray-300">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <span className={cn(
                                                            "inline-block px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider",
                                                            c.interviewStatus === "pending" && isShortlisted
                                                                ? "bg-blue-50 text-blue-600 ring-1 ring-blue-200"
                                                                : "bg-gray-100 text-gray-400"
                                                        )}>
                                                            {isShortlisted ? (c.interviewStatus || "Pending") : "N/A"}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right">
                                                        <a
                                                            href={`/admin/candidates/${c.id}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        >
                                                            View <ExternalLink className="h-3 w-3" />
                                                        </a>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>

                                {sorted.length === 0 && (
                                    <div className="text-center py-12 text-gray-400">
                                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                        <p className="text-sm font-bold">No results yet</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
                            <Button variant="outline" onClick={reset} className="rounded-xl font-bold">
                                Import More
                            </Button>
                            <Button onClick={handleClose} className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold px-6">
                                Done
                            </Button>
                        </div>
                    </div>
                )}

                {/* ── FAILED ── */}
                {status === "failed" && (
                    <div className="py-10 text-center space-y-4">
                        <div className="mx-auto w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center">
                            <AlertCircle className="h-7 w-7 text-red-500" />
                        </div>
                        <div>
                            <p className="text-base font-black text-gray-900">Screening failed</p>
                            <p className="text-sm text-gray-500 mt-1">{error}</p>
                        </div>
                        <div className="flex items-center justify-center gap-3">
                            <Button variant="ghost" onClick={handleClose} className="rounded-xl font-bold">Close</Button>
                            <Button onClick={reset} className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold">Try Again</Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
