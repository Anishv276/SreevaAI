"use client";

import { useState, useRef } from "react";
import {
    Upload, Plus, X, Loader2, CheckCircle2, AlertCircle,
    UserPlus, FileSpreadsheet, Mail, Phone, User, Briefcase, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useJobs } from "@/context/jobs-context";
import { motion, AnimatePresence } from "framer-motion";

interface SingleCandidate {
    fullName: string;
    email: string;
    phone: string;
}

interface ResultItem {
    id: string;
    name: string;
    email: string;
    sent: boolean;
}

export function InterviewOnlyPanel() {
    const { jobs } = useJobs();
    const [selectedJobId, setSelectedJobId] = useState<string>("");
    const [mode, setMode] = useState<"single" | "bulk">("single");

    // Single candidate form
    const [form, setForm] = useState<SingleCandidate>({ fullName: "", email: "", phone: "" });
    const [formLoading, setFormLoading] = useState(false);

    // Bulk CSV
    const [bulkFile, setBulkFile] = useState<File | null>(null);
    const [bulkParsed, setBulkParsed] = useState<SingleCandidate[]>([]);
    const [bulkLoading, setBulkLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Results
    const [results, setResults] = useState<ResultItem[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const activeJobs = jobs.filter((j: any) => !j.isDeleted);

    const selectedJob = activeJobs.find((j: any) => j.id === selectedJobId);

    function parseCsv(text: string): SingleCandidate[] {
        const lines = text.split(/\r?\n/).filter(Boolean);
        if (lines.length < 2) return [];
        // detect header
        const header = lines[0].toLowerCase();
        const hasHeader = header.includes("name") || header.includes("email");
        const dataLines = hasHeader ? lines.slice(1) : lines;
        return dataLines.map((line) => {
            const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
            return {
                fullName: parts[0] || "",
                email: parts[1] || "",
                phone: parts[2] || "",
            };
        }).filter((c) => c.fullName && c.email);
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setBulkFile(file);
        setBulkParsed([]);
        setResults(null);
        setError(null);
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            setBulkParsed(parseCsv(text));
        };
        reader.readAsText(file);
    }

    async function submitCandidates(candidates: SingleCandidate[]) {
        if (!selectedJobId) {
            setError("Please select a job first.");
            return;
        }
        setError(null);
        setResults(null);
        const res = await fetch("/api/admin/interview-only", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId: selectedJobId, candidates }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        setResults(data.results);
    }

    async function handleSingleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.fullName || !form.email) return;
        setFormLoading(true);
        try {
            await submitCandidates([form]);
            setForm({ fullName: "", email: "", phone: "" });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setFormLoading(false);
        }
    }

    async function handleBulkSubmit() {
        if (bulkParsed.length === 0) return;
        setBulkLoading(true);
        try {
            await submitCandidates(bulkParsed);
            setBulkFile(null);
            setBulkParsed([]);
            if (fileInputRef.current) fileInputRef.current.value = "";
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBulkLoading(false);
        }
    }

    return (
        <div className="space-y-6">
            {/* Header bar */}
            <div className="bg-white border-b border-gray-200 pb-5 mb-8 -mx-6 px-6 lg:-mx-10 lg:px-10 pt-2 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-5">
                    <div>
                        <h1 className="text-[22px] font-bold text-gray-800 tracking-tight">Interview Only</h1>
                        <p className="text-[13px] text-gray-400 font-medium mt-0.5">Add candidates and send interview links instantly — no scoring or shortlisting.</p>
                    </div>

                    {/* Mode toggle */}
                    <div className="flex items-center gap-2">
                        <div className="flex bg-gray-100 rounded-full p-1 gap-1">
                            <button
                                onClick={() => { setMode("single"); setResults(null); setError(null); }}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold transition-all duration-200 ${mode === "single" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                            >
                                <UserPlus className="h-3.5 w-3.5" />
                                Add Single
                            </button>
                            <button
                                onClick={() => { setMode("bulk"); setResults(null); setError(null); }}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold transition-all duration-200 ${mode === "bulk" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                            >
                                <Upload className="h-3.5 w-3.5" />
                                Bulk Upload
                            </button>
                        </div>
                    </div>
                </div>

                {/* Job selector */}
                <div className="flex items-center gap-3">
                    <Briefcase className="h-4 w-4 text-gray-400 shrink-0" />
                    <div className="relative w-full max-w-xs">
                        <select
                            value={selectedJobId}
                            onChange={(e) => { setSelectedJobId(e.target.value); setResults(null); setError(null); }}
                            className="w-full appearance-none border border-gray-200 rounded-full px-4 py-2 text-[13px] font-semibold text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-violet-1000 focus:border-violet-500 pr-8"
                        >
                            <option value="">Select a job / job</option>
                            {activeJobs.map((j: any) => (
                                <option key={j.id} value={j.id}>{j.title}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                    </div>
                    {selectedJob && (
                        <span className="text-[12px] font-medium text-violet-500 bg-violet-50 border border-violet-100 px-3 py-1 rounded-full">
                            {selectedJob.title}
                        </span>
                    )}
                </div>
            </div>

            {/* Main content */}
            <AnimatePresence mode="wait">
                {mode === "single" ? (
                    <motion.div
                        key="single"
                        initial={{ opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -24 }}
                        transition={{ duration: 0.2 }}
                    >
                        <div className="max-w-lg mx-auto">
                            <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-[0_4px_24px_rgba(15,23,42,0.06)] p-8">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="h-10 w-10 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center">
                                        <UserPlus className="h-5 w-5 text-violet-500" />
                                    </div>
                                    <div>
                                        <p className="text-[14px] font-bold text-gray-900">Add Candidate</p>
                                        <p className="text-[12px] text-gray-400">Interview invite sent automatically</p>
                                    </div>
                                </div>

                                <form onSubmit={handleSingleSubmit} className="space-y-4">
                                    <div className="relative">
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <Input
                                            placeholder="Full Name *"
                                            className="pl-11 h-11 border-gray-200 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-1000 text-[13px] font-medium"
                                            value={form.fullName}
                                            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                                            required
                                        />
                                    </div>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <Input
                                            type="email"
                                            placeholder="Email Address *"
                                            className="pl-11 h-11 border-gray-200 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-1000 text-[13px] font-medium"
                                            value={form.email}
                                            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                                            required
                                        />
                                    </div>
                                    <div className="relative">
                                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <Input
                                            type="tel"
                                            placeholder="Mobile Number"
                                            className="pl-11 h-11 border-gray-200 rounded-xl focus:border-violet-500 focus:ring-1 focus:ring-violet-1000 text-[13px] font-medium"
                                            value={form.phone}
                                            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                                        />
                                    </div>

                                    {error && (
                                        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-[13px] font-medium">
                                            <AlertCircle className="h-4 w-4 shrink-0" />
                                            {error}
                                        </div>
                                    )}

                                    <Button
                                        type="submit"
                                        disabled={formLoading || !selectedJobId}
                                        className="w-full h-11 rounded-xl bg-violet-500 hover:bg-violet-600 text-white font-bold text-[13px] shadow-sm transition-all"
                                    >
                                        {formLoading ? (
                                            <><Loader2 className="h-4 w-4 animate-spin mr-2" />Sending invite...</>
                                        ) : (
                                            <><Mail className="h-4 w-4 mr-2" />Send Interview Invite</>
                                        )}
                                    </Button>
                                </form>
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="bulk"
                        initial={{ opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -24 }}
                        transition={{ duration: 0.2 }}
                    >
                        <div className="max-w-2xl mx-auto space-y-6">
                            {/* Upload zone */}
                            <div
                                className="bg-white rounded-[1.75rem] border-2 border-dashed border-gray-200 hover:border-violet-400 transition-all duration-200 p-10 flex flex-col items-center justify-center gap-4 cursor-pointer group"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <div className="h-14 w-14 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center group-hover:scale-105 transition-transform">
                                    <FileSpreadsheet className="h-7 w-7 text-violet-500" />
                                </div>
                                <div className="text-center">
                                    <p className="text-[15px] font-bold text-gray-800">Upload CSV file</p>
                                    <p className="text-[12px] text-gray-400 mt-1">Columns: <span className="font-semibold text-gray-600">Name, Email, Phone</span></p>
                                    <p className="text-[11px] text-gray-400 mt-0.5">First row can be a header — we'll skip it automatically</p>
                                </div>
                                {bulkFile && (
                                    <div className="flex items-center gap-2 bg-violet-50 border border-violet-100 rounded-full px-4 py-1.5">
                                        <FileSpreadsheet className="h-3.5 w-3.5 text-violet-500" />
                                        <span className="text-[12px] font-semibold text-violet-700">{bulkFile.name}</span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setBulkFile(null); setBulkParsed([]); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                                            className="ml-1 text-violet-400 hover:text-violet-600"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                )}
                                <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
                            </div>

                            {/* Preview table */}
                            {bulkParsed.length > 0 && (
                                <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-[0_4px_24px_rgba(15,23,42,0.06)] overflow-hidden">
                                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                                        <p className="text-[14px] font-bold text-gray-800">{bulkParsed.length} candidates detected</p>
                                        <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">Ready to send</span>
                                    </div>
                                    <div className="overflow-x-auto max-h-72">
                                        <table className="w-full text-[12px]">
                                            <thead className="bg-violet-50 border-b border-gray-100">
                                                <tr>
                                                    <th className="text-left px-6 py-3 font-bold text-gray-500 uppercase tracking-wider text-[10px]">#</th>
                                                    <th className="text-left px-4 py-3 font-bold text-gray-500 uppercase tracking-wider text-[10px]">Name</th>
                                                    <th className="text-left px-4 py-3 font-bold text-gray-500 uppercase tracking-wider text-[10px]">Email</th>
                                                    <th className="text-left px-4 py-3 font-bold text-gray-500 uppercase tracking-wider text-[10px]">Phone</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {bulkParsed.slice(0, 50).map((c, i) => (
                                                    <tr key={i} className="border-b border-slate-50 hover:bg-violet-50/50">
                                                        <td className="px-6 py-3 text-gray-400 font-semibold">{i + 1}</td>
                                                        <td className="px-4 py-3 font-semibold text-gray-800">{c.fullName}</td>
                                                        <td className="px-4 py-3 text-gray-600">{c.email}</td>
                                                        <td className="px-4 py-3 text-gray-400">{c.phone || "—"}</td>
                                                    </tr>
                                                ))}
                                                {bulkParsed.length > 50 && (
                                                    <tr><td colSpan={4} className="px-6 py-3 text-[11px] text-gray-400 font-medium">+{bulkParsed.length - 50} more not shown</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="px-6 py-4 border-t border-gray-100">
                                        {error && (
                                            <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-[13px] font-medium mb-3">
                                                <AlertCircle className="h-4 w-4 shrink-0" />
                                                {error}
                                            </div>
                                        )}
                                        <Button
                                            onClick={handleBulkSubmit}
                                            disabled={bulkLoading || !selectedJobId}
                                            className="w-full h-11 rounded-xl bg-violet-500 hover:bg-violet-600 text-white font-bold text-[13px] shadow-sm transition-all"
                                        >
                                            {bulkLoading ? (
                                                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Sending invites...</>
                                            ) : (
                                                <><Mail className="h-4 w-4 mr-2" />Send {bulkParsed.length} Interview Invites</>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Results */}
            <AnimatePresence>
                {results && (
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -16 }}
                        className="max-w-2xl mx-auto"
                    >
                        <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-[0_4px_24px_rgba(15,23,42,0.06)] overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                                <p className="text-[14px] font-bold text-gray-800">Results</p>
                                <div className="flex items-center gap-2 text-[12px]">
                                    <span className="text-emerald-600 font-semibold">{results.filter(r => r.sent).length} sent</span>
                                    {results.some(r => !r.sent) && <span className="text-red-500 font-semibold">{results.filter(r => !r.sent).length} failed</span>}
                                </div>
                            </div>
                            <div className="max-h-64 overflow-y-auto">
                                {results.map((r) => (
                                    <div key={r.id} className="flex items-center gap-4 px-6 py-3 border-b border-slate-50 last:border-0">
                                        {r.sent
                                            ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                            : <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                                        }
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-semibold text-gray-800 truncate">{r.name}</p>
                                            <p className="text-[11px] text-gray-400 truncate">{r.email}</p>
                                        </div>
                                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${r.sent ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-red-50 text-red-500 border border-red-100"}`}>
                                            {r.sent ? "Invite sent" : "Email failed"}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="px-6 py-4 border-t border-gray-100">
                                <button
                                    onClick={() => setResults(null)}
                                    className="text-[12px] font-semibold text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    Clear results
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
