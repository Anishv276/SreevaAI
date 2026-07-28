"use client";
import { useState, useEffect, useRef } from "react";
import {
    Plus, Upload, Loader2, CheckCircle2,
    AlertCircle, Eye, EyeOff, Users,
    FileText, Zap, MessageSquare, Code2, X, RefreshCw, Trash2,
    ChevronRight, ArrowLeft, Sparkles, Pencil, Check, Mic, ChevronDown
} from "lucide-react";
import { ALL_VOICES } from "@/lib/constants/voices";

type ElevenLabsCatalogVoice = { id: string; name: string; description: string | null; gender: "male" | "female" | null; previewUrl: string | null; category: string | null };

const SARVAM_VOICES = ALL_VOICES.filter(v => v.provider === "SARVAM");

function VoiceDropdown({
    label, voices, loading, error, selectedId, onSelect,
}: {
    label: string;
    voices: Array<{ id: string; name: string; description?: string | null }>;
    loading?: boolean;
    error?: string | null;
    selectedId: string;
    onSelect: (id: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, []);
    const selected = voices.find(v => v.id === selectedId);
    return (
        <div className="relative" ref={ref}>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</label>
            <button
                type="button"
                onClick={() => setOpen(p => !p)}
                className="mt-1 flex h-9 w-full items-center justify-between rounded-lg px-3 text-xs font-medium text-gray-700 transition hover:border-violet-300"
                style={{ border: "1px solid #E9E7FF" }}
            >
                <span className={selected ? "truncate font-semibold text-gray-900" : "text-gray-400"}>
                    {loading ? "Loading…" : selected ? selected.name : "Select a voice"}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl bg-white shadow-xl" style={{ border: "1px solid #E9E7FF" }}>
                    {loading ? (
                        <div className="flex items-center justify-center gap-2 px-4 py-5 text-xs font-medium text-gray-500">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading voices…
                        </div>
                    ) : error ? (
                        <p className="px-4 py-3 text-xs font-medium text-rose-600">{error}</p>
                    ) : voices.length === 0 ? (
                        <p className="px-4 py-3 text-xs font-medium text-gray-400">No voices available</p>
                    ) : (
                        voices.map(v => (
                            <button
                                key={v.id}
                                type="button"
                                onClick={() => { onSelect(v.id); setOpen(false); }}
                                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs transition hover:bg-violet-50 ${selectedId === v.id ? "bg-violet-50/60 text-violet-700" : "text-gray-700"}`}
                            >
                                <Mic className="h-3.5 w-3.5 flex-shrink-0 text-violet-400" />
                                <span className="truncate font-medium">{v.name}</span>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
import { Slider } from "@/components/ui/slider";

interface DemoTemplate {
    id: string;
    title: string;
    roleTitle: string;
    mode: "TECH" | "CONVERSATION";
    status: "processing" | "ready" | "failed";
    isActive: boolean;
    createdAt: string;
    _count: { sessions: number };
}

interface DemoSession {
    id: string;
    templateId: string;
    clientName: string;
    clientEmail: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    template: { title: string; mode: string };
}

export default function DemoAdminPage() {
    const [templates, setTemplates] = useState<DemoTemplate[]>([]);
    const [sessions, setSessions] = useState<DemoSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [showWizard, setShowWizard] = useState(false);
    const [showLeadsModal, setShowLeadsModal] = useState<DemoTemplate | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
    
    // Custom Delete Confirmation State
    const [templateToDelete, setTemplateToDelete] = useState<DemoTemplate | null>(null);
    const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const showToast = (message: string, type: "success" | "error" = "success") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchData = async (silent = false) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        try {
            const [tRes, sRes] = await Promise.all([
                fetch("/api/super-admin/demo/templates"),
                fetch("/api/super-admin/demo/sessions"),
            ]);
            const [tData, sData] = await Promise.all([tRes.json(), sRes.json()]);
            setTemplates(tData.templates || []);
            setSessions(sData.sessions || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    useEffect(() => {
        if (!templates.some(t => t.status === "processing")) return;
        const interval = setInterval(() => fetchData(true), 3000);
        return () => clearInterval(interval);
    }, [templates]);

    const toggleActive = async (template: DemoTemplate) => {
        try {
            await fetch(`/api/super-admin/demo/templates/${template.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !template.isActive }),
            });
            setTemplates(prev => prev.map(t => t.id === template.id ? { ...t, isActive: !t.isActive } : t));
        } catch (e) { console.error(e); }
    };

    const executeDeleteTemplate = async () => {
        if (!templateToDelete) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/super-admin/demo/templates/${templateToDelete.id}`, { method: "DELETE" });
            if (res.ok) {
                showToast("Template deleted successfully", "success");
                fetchData(true);
                if (showLeadsModal?.id === templateToDelete.id) setShowLeadsModal(null);
            } else {
                showToast("Failed to delete template", "error");
            }
        } catch (e) {
            console.error(e);
            showToast("Failed to delete template", "error");
        } finally {
            setIsDeleting(false);
            setTemplateToDelete(null);
        }
    };

    const executeDeleteSession = async () => {
        if (!sessionToDelete) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/super-admin/demo/sessions/${sessionToDelete}`, { method: "DELETE" });
            if (res.ok) {
                showToast("Lead deleted successfully", "success");
                fetchData(true);
                setSessions(prev => prev.filter(s => s.id !== sessionToDelete));
            } else {
                showToast("Failed to delete lead", "error");
            }
        } catch (e) {
            console.error(e);
            showToast("Failed to delete lead", "error");
        } finally {
            setIsDeleting(false);
            setSessionToDelete(null);
        }
    };

    if (showWizard) {
        return (
            <CreateTemplateWizard
                onClose={() => setShowWizard(false)}
                onCreated={() => { setShowWizard(false); fetchData(true); }}
            />
        );
    }

    return (
        <div className="space-y-6 pb-10 animate-in fade-in duration-500">
            {/* Page header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Demo Management</h1>
                    <p className="text-sm text-gray-400 mt-0.5">
                        {templates.length} template{templates.length !== 1 ? "s" : ""} · {sessions.length} session{sessions.length !== 1 ? "s" : ""}
                    </p>
                </div>
                <div className="flex items-center gap-2.5">
                    <button
                        onClick={() => fetchData(true)}
                        disabled={refreshing}
                        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-white text-sm font-medium text-gray-600 hover:text-violet-600 hover:bg-violet-50 transition-all"
                        style={{ border: "1px solid #E9E7FF" }}
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                    </button>
                    <button
                        onClick={() => setShowWizard(true)}
                        className="btn-shimmer inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-medium text-white transition-all"
                        style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" }}
                    >
                        <Plus className="h-4 w-4" />
                        New Template
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
                </div>
            ) : (
                <TemplatesList
                    templates={templates}
                    onToggle={toggleActive}
                    onDelete={setTemplateToDelete}
                    onViewLeads={setShowLeadsModal}
                />
            )}

            {showLeadsModal && (
                <LeadsModal
                    template={showLeadsModal}
                    sessions={sessions.filter(s => s.templateId === showLeadsModal.id)}
                    onClose={() => setShowLeadsModal(null)}
                    onDeleteSession={setSessionToDelete}
                />
            )}

            {/* Custom Toaster */}
            {toast && (
                <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl border animate-in slide-in-from-bottom-5 duration-300 ${
                    toast.type === "success" 
                        ? "bg-emerald-50 border-emerald-200/60 text-emerald-800" 
                        : "bg-red-50 border-red-200/60 text-red-800"
                }`}>
                    {toast.type === "success" ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                    <span className="text-sm font-semibold">{toast.message}</span>
                </div>
            )}

            {/* Custom Delete Confirmation Modal */}
            {(templateToDelete || sessionToDelete) && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4 ring-8 ring-red-50/50">
                            <AlertCircle className="h-6 w-6 text-red-600" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Are you sure?</h3>
                        <p className="text-sm text-gray-500 text-center mb-6">
                            {templateToDelete 
                                ? "This will permanently delete this template. All leads and sessions associated with it will be hidden."
                                : "This will permanently delete this lead. You won't be able to recover their data or transcript."}
                        </p>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => { setTemplateToDelete(null); setSessionToDelete(null); }}
                                disabled={isDeleting}
                                className="flex-1 h-11 rounded-2xl bg-gray-50 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={templateToDelete ? executeDeleteTemplate : executeDeleteSession}
                                disabled={isDeleting}
                                className="flex-1 h-11 rounded-2xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// WIZARD
// ────────────────────────────────────────────────────────────────────────────

const WIZARD_STEPS = ["Name", "Upload JD", "Setup", "Questions"];

function StepIndicator({ current }: { current: number }) {
    return (
        <div className="flex items-center gap-0">
            {WIZARD_STEPS.map((label, i) => (
                <div key={i} className="flex items-center">
                    <div className="flex flex-col items-center gap-1">
                        <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                                i < current
                                    ? "text-white"
                                    : i === current
                                    ? "text-white"
                                    : "text-gray-400 bg-gray-100"
                            }`}
                            style={
                                i <= current
                                    ? { background: "linear-gradient(135deg, #8B5CF6, #3B82F6)" }
                                    : {}
                            }
                        >
                            {i < current ? <Check className="h-3.5 w-3.5" /> : i + 1}
                        </div>
                        <span className={`text-[10px] font-medium whitespace-nowrap ${i === current ? "text-violet-600" : i < current ? "text-emerald-600" : "text-gray-400"}`}>
                            {label}
                        </span>
                    </div>
                    {i < WIZARD_STEPS.length - 1 && (
                        <div
                            className={`h-px w-12 sm:w-16 mx-1 mb-4 transition-all ${i < current ? "bg-violet-400" : "bg-gray-200"}`}
                        />
                    )}
                </div>
            ))}
        </div>
    );
}

function CreateTemplateWizard({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [step, setStep] = useState(0);
    const [templateId, setTemplateId] = useState<string | null>(null);
    const [title, setTitle] = useState("");
    const [roleTitle, setRoleTitle] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [extracting, setExtracting] = useState(false);
    const [extractDone, setExtractDone] = useState(false);
    const [extractError, setExtractError] = useState("");
    const [interviewType, setInterviewType] = useState<"tech" | "conversational">("tech");
    const [level, setLevel] = useState(2);
    const [voiceId, setVoiceId] = useState("");
    const [elevenLabsVoices, setElevenLabsVoices] = useState<ElevenLabsCatalogVoice[]>([]);
    const [elevenLabsLoading, setElevenLabsLoading] = useState(true);
    const [elevenLabsError, setElevenLabsError] = useState<string | null>(null);
    const [generating, setGenerating] = useState(false);
    const [questions, setQuestions] = useState<any[]>([]);
    const [editingIdx, setEditingIdx] = useState<number | null>(null);
    const [editText, setEditText] = useState("");
    const [numQuestions, setNumQuestions] = useState(12);
    const [finalizing, setFinalizing] = useState(false);
    const [error, setError] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const loadElevenLabsVoices = async () => {
            setElevenLabsLoading(true);
            setElevenLabsError(null);
            try {
                const res = await fetch("/api/super-admin/voices/elevenlabs-catalog", { cache: "no-store" });
                const data = await res.json().catch(() => null);
                if (!res.ok) throw new Error(data?.error || "Failed to load ElevenLabs voices");
                setElevenLabsVoices(data.voices || []);
            } catch (e: unknown) {
                setElevenLabsError(e instanceof Error ? e.message : "Failed to load ElevenLabs voices");
            } finally {
                setElevenLabsLoading(false);
            }
        };
        void loadElevenLabsVoices();
    }, []);

    // Step 1: Create template with title
    const handleTitleNext = async () => {
        if (!title.trim()) { setError("Please enter a template name."); return; }
        setError("");
        try {
            const res = await fetch("/api/super-admin/demo/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: title.trim() }),
            });
            const d = await res.json();
            if (!res.ok) { setError(d.error || "Failed to create template"); return; }
            setTemplateId(d.templateId);
            setStep(1);
        } catch {
            setError("Network error. Please try again.");
        }
    };

    // Step 2: Upload & extract JD
    const handleExtract = async () => {
        if (!file || !templateId) return;
        setExtracting(true);
        setExtractError("");
        try {
            const fd = new FormData();
            fd.append("templateId", templateId);
            fd.append("jdFile", file);
            const res = await fetch("/api/super-admin/demo/extract", { method: "POST", body: fd });
            const d = await res.json();
            if (!res.ok) { setExtractError(d.error || "Extraction failed"); return; }
            setExtractDone(true);
            if (d.roleTitle) setRoleTitle(d.roleTitle);
        } catch {
            setExtractError("Network error during extraction. Please try again.");
        } finally {
            setExtracting(false);
        }
    };

    // Step 3: Generate questions
    const handleGenerate = async () => {
        if (!templateId) return;
        setGenerating(true);
        setError("");
        try {
            const res = await fetch("/api/super-admin/demo/questions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ templateId, level, interviewType, roleTitle: roleTitle.trim(), voiceId, numQuestions }),
            });
            const d = await res.json();
            if (!res.ok) { setError(d.error || "Failed to generate questions"); return; }
            setQuestions(d.questions || []);
            setStep(3);
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setGenerating(false);
        }
    };

    // Step 4: Finalize
    const handleFinalize = async () => {
        if (!templateId) return;
        setFinalizing(true);
        setError("");
        try {
            const res = await fetch("/api/super-admin/demo/finalize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ templateId, questions }),
            });
            const d = await res.json();
            if (!res.ok) { setError(d.error || "Failed to finalize template"); return; }
            onCreated();
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setFinalizing(false);
        }
    };

    const saveEdit = () => {
        if (editingIdx === null) return;
        setQuestions(prev => prev.map((q, i) => i === editingIdx ? { ...q, question: editText } : q));
        setEditingIdx(null);
        setEditText("");
    };

    const addQuestion = () => {
        setQuestions(prev => [...prev, { id: `custom-${Date.now()}`, skill: "General", subtopic: "Custom", question_type: "custom", question: "Your question here" }]);
        setEditingIdx(questions.length);
        setEditText("Your question here");
    };

    const removeQuestion = (idx: number) => {
        setQuestions(prev => prev.filter((_, i) => i !== idx));
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-all"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div>
                        <h1 className="text-xl font-semibold text-gray-900">New Demo Template</h1>
                        <p className="text-xs text-gray-400 mt-0.5">Set up your demo interview in 4 steps</p>
                    </div>
                </div>
                <StepIndicator current={step} />
            </div>

            {/* Step content */}
            <div className="bg-white rounded-2xl p-8" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)", minHeight: 400 }}>

                {/* ── Step 0: Title ──────────────────────────────────── */}
                {step === 0 && (
                    <div className="max-w-md mx-auto flex flex-col items-center gap-6 pt-8">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(59,130,246,0.06))", border: "1px solid rgba(139,92,246,0.2)" }}>
                            <FileText className="h-5 w-5 text-violet-500" />
                        </div>
                        <div className="text-center">
                            <h2 className="text-lg font-semibold text-gray-900">Name your template</h2>
                            <p className="text-sm text-gray-400 mt-1">This is the display name shown to demo users</p>
                        </div>
                        <div className="w-full space-y-3">
                            <input
                                autoFocus
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleTitleNext()}
                                placeholder="e.g. Frontend Engineer Demo"
                                className="h-11 w-full rounded-xl bg-gray-50 text-sm outline-none transition-all px-4 font-medium"
                                style={{ border: "1px solid #E9E7FF" }}
                                onFocus={e => { e.target.style.borderColor = "#7C3AED"; e.target.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.1)"; e.target.style.background = "#fff"; }}
                                onBlur={e => { e.target.style.borderColor = "#E9E7FF"; e.target.style.boxShadow = "none"; e.target.style.background = "#F9FAFB"; }}
                            />
                            {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
                            <button
                                onClick={handleTitleNext}
                                className="w-full h-11 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
                                style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" }}
                            >
                                Next <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Step 1: Upload JD ──────────────────────────────── */}
                {step === 1 && (
                    <div className="max-w-md mx-auto flex flex-col items-center gap-6 pt-8">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(59,130,246,0.06))", border: "1px solid rgba(139,92,246,0.2)" }}>
                            <Upload className="h-5 w-5 text-violet-500" />
                        </div>
                        <div className="text-center">
                            <h2 className="text-lg font-semibold text-gray-900">Upload Job Description</h2>
                            <p className="text-sm text-gray-400 mt-1">Upload a PDF — we'll extract the JD text automatically</p>
                        </div>
                        <div className="w-full space-y-3">
                            <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={e => { setFile(e.target.files?.[0] || null); setExtractDone(false); setExtractError(""); }} />

                            {!extractDone ? (
                                <button
                                    type="button"
                                    onClick={() => fileRef.current?.click()}
                                    className={`w-full h-28 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all ${file ? "border-violet-300 bg-violet-50/50" : "border-gray-200 hover:border-violet-300 hover:bg-violet-50/30"}`}
                                >
                                    {file ? (
                                        <>
                                            <FileText className="h-6 w-6 text-violet-500" />
                                            <p className="text-xs font-semibold text-violet-700">{file.name}</p>
                                            <p className="text-[10px] text-gray-400">Click to change file</p>
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="h-6 w-6 text-gray-300" />
                                            <p className="text-sm font-medium text-gray-400">Click to upload PDF</p>
                                        </>
                                    )}
                                </button>
                            ) : (
                                <div className="w-full h-28 rounded-2xl flex flex-col items-center justify-center gap-2" style={{ background: "#F0FDF4", border: "2px solid #A7F3D0" }}>
                                    <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                                    <p className="text-sm font-semibold text-emerald-700">Extraction Complete</p>
                                    {roleTitle && <p className="text-xs text-emerald-600">Role detected: <span className="font-semibold">{roleTitle}</span></p>}
                                </div>
                            )}

                            {extractError && (
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-xs font-medium">
                                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />{extractError}
                                </div>
                            )}

                            {/* Number of Questions Slider */}
                            <div className="space-y-2 mt-4 mb-2 w-full text-left">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                                        <Sparkles className="h-3.5 w-3.5 text-violet-500" /> Number of Questions
                                    </label>
                                    <span className="text-xs font-bold text-violet-700 bg-gradient-to-r from-violet-100 to-indigo-100 px-3 py-1 rounded-full border border-violet-200/80 shadow-xs flex items-center gap-1">
                                        <span className="h-1.5 w-1.5 rounded-full bg-violet-600 animate-pulse" />
                                        {numQuestions} Questions
                                    </span>
                                </div>
                                <div className="pt-1">
                                    <Slider
                                        min={12}
                                        max={20}
                                        step={1}
                                        value={[numQuestions]}
                                        onValueChange={([val]) => setNumQuestions(val)}
                                    />
                                </div>
                                <div className="flex justify-between text-[11px] font-semibold text-gray-400 px-0.5">
                                    {[12, 14, 16, 18, 20].map((num) => (
                                        <button
                                            key={num}
                                            type="button"
                                            onClick={() => setNumQuestions(num)}
                                            className={`transition-colors hover:text-violet-600 cursor-pointer ${numQuestions === num ? "text-violet-600 font-bold" : "text-gray-400"}`}
                                        >
                                            {num} Qs
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => setStep(0)}
                                    className="flex-1 h-11 rounded-xl bg-gray-50 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all"
                                    style={{ border: "1px solid #E9E7FF" }}
                                >
                                    Back
                                </button>
                                {!extractDone ? (
                                    <button
                                        onClick={handleExtract}
                                        disabled={!file || extracting}
                                        className="flex-1 h-11 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                                        style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" }}
                                    >
                                        {extracting ? <><Loader2 className="h-4 w-4 animate-spin" /> Extracting…</> : <><Zap className="h-4 w-4" /> Extract JD</>}
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => setStep(2)}
                                        className="flex-1 h-11 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
                                        style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" }}
                                    >
                                        Next <ChevronRight className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Step 2: Setup ──────────────────────────────────── */}
                {step === 2 && (
                    <div className="max-w-lg mx-auto flex flex-col gap-5 pt-4">
                        <div className="text-center mb-2">
                            <h2 className="text-lg font-semibold text-gray-900">Interview Setup</h2>
                            <p className="text-sm text-gray-400 mt-1">Configure how the demo interview will run</p>
                        </div>

                        {/* Role Title */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Role Title</label>
                            <input
                                value={roleTitle}
                                onChange={e => setRoleTitle(e.target.value)}
                                placeholder="e.g. Senior Frontend Engineer"
                                className="h-10 w-full rounded-xl bg-gray-50 text-sm outline-none transition-all px-3"
                                style={{ border: "1px solid #E9E7FF" }}
                                onFocus={e => { e.target.style.borderColor = "#7C3AED"; e.target.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.1)"; e.target.style.background = "#fff"; }}
                                onBlur={e => { e.target.style.borderColor = "#E9E7FF"; e.target.style.boxShadow = "none"; e.target.style.background = "#F9FAFB"; }}
                            />
                        </div>

                        {/* Voice */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Interview Voice</label>
                            <div className="grid grid-cols-2 gap-2">
                                <VoiceDropdown
                                    label="ElevenLabs"
                                    voices={elevenLabsVoices}
                                    loading={elevenLabsLoading}
                                    error={elevenLabsError}
                                    selectedId={voiceId}
                                    onSelect={setVoiceId}
                                />
                                <VoiceDropdown
                                    label="Sarvam"
                                    voices={SARVAM_VOICES}
                                    selectedId={voiceId}
                                    onSelect={setVoiceId}
                                />
                            </div>
                        </div>

                        {/* Interview Type */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Interview Type</label>
                            <div className="grid grid-cols-2 gap-2">
                                {([["tech", "Technical", Code2], ["conversational", "Conversational", MessageSquare]] as const).map(([val, label, Icon]) => (
                                    <button
                                        key={val}
                                        type="button"
                                        onClick={() => setInterviewType(val)}
                                        className={`flex items-center gap-2 p-3 rounded-xl transition-all text-sm font-medium ${interviewType === val ? "text-violet-700" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}
                                        style={interviewType === val ? { background: "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(59,130,246,0.06))", border: "1px solid rgba(139,92,246,0.25)" } : { border: "1px solid #E9E7FF" }}
                                    >
                                        <Icon className="h-4 w-4" />{label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Level */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Questioning Level</label>
                            <div className="grid grid-cols-4 gap-2">
                                {[
                                    [1, "Basic"],
                                    [2, "Mid"],
                                    [3, "Senior"],
                                    [4, "Expert"],
                                ].map(([val, label]) => (
                                    <button
                                        key={val}
                                        type="button"
                                        onClick={() => setLevel(val as number)}
                                        className={`flex flex-col items-center p-2.5 rounded-xl transition-all text-xs font-semibold gap-0.5 ${level === val ? "text-violet-700" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}
                                        style={level === val ? { background: "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(59,130,246,0.06))", border: "1px solid rgba(139,92,246,0.25)" } : { border: "1px solid #E9E7FF" }}
                                    >
                                        <span className="text-sm font-bold">{val}</span>
                                        <span className="text-[10px] font-medium opacity-70">{label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-xs font-medium">
                                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />{error}
                            </div>
                        )}

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setStep(1)}
                                className="flex-1 h-11 rounded-xl bg-gray-50 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all"
                                style={{ border: "1px solid #E9E7FF" }}
                            >
                                Back
                            </button>
                            <button
                                onClick={handleGenerate}
                                disabled={generating}
                                className="flex-1 h-11 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60 hover:opacity-90"
                                style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" }}
                            >
                                {generating
                                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                                    : <><Sparkles className="h-4 w-4" /> Generate Questions</>
                                }
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Step 3: Questions ──────────────────────────────── */}
                {step === 3 && (
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">Review Questions</h2>
                                <p className="text-sm text-gray-400 mt-0.5">Edit, add, or remove questions before creating the template</p>
                            </div>
                            <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">{questions.length} questions</span>
                        </div>

                        <div className="space-y-2">
                            {questions.map((q, i) => (
                                <div
                                    key={q.id || i}
                                    className="group rounded-xl p-4 transition-all"
                                    style={{ border: "1px solid #E9E7FF", background: "#FAFAFE" }}
                                >
                                    <div className="flex items-start gap-3">
                                        <span className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-violet-600 mt-0.5" style={{ background: "rgba(139,92,246,0.1)" }}>
                                            {i + 1}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{q.skill}</span>
                                                {q.subtopic && <span className="text-[10px] text-gray-400">· {q.subtopic}</span>}
                                            </div>
                                            {editingIdx === i ? (
                                                <div className="space-y-2">
                                                    <textarea
                                                        autoFocus
                                                        value={editText}
                                                        onChange={e => setEditText(e.target.value)}
                                                        rows={3}
                                                        className="w-full rounded-lg text-sm text-gray-800 outline-none resize-none px-3 py-2 transition-all"
                                                        style={{ border: "1px solid #7C3AED", boxShadow: "0 0 0 3px rgba(124,58,237,0.1)", background: "#fff" }}
                                                    />
                                                    <div className="flex gap-2">
                                                        <button onClick={saveEdit} className="h-7 px-3 rounded-lg text-xs font-semibold text-white" style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)" }}>Save</button>
                                                        <button onClick={() => setEditingIdx(null)} className="h-7 px-3 rounded-lg text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-all">Cancel</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-sm text-gray-700 leading-relaxed">{q.question}</p>
                                            )}
                                        </div>
                                        {editingIdx !== i && (
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                                <button
                                                    onClick={() => { setEditingIdx(i); setEditText(q.question); }}
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                                                    title="Edit"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => removeQuestion(i)}
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                    title="Remove"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={addQuestion}
                            className="flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-medium text-violet-600 hover:text-violet-700 hover:bg-violet-50 transition-all self-start"
                            style={{ border: "1px dashed rgba(139,92,246,0.4)" }}
                        >
                            <Plus className="h-4 w-4" /> Add Question
                        </button>

                        {error && (
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-xs font-medium">
                                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />{error}
                            </div>
                        )}

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setStep(2)}
                                className="flex-1 h-11 rounded-xl bg-gray-50 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all"
                                style={{ border: "1px solid #E9E7FF" }}
                            >
                                Back
                            </button>
                            <button
                                onClick={handleFinalize}
                                disabled={finalizing || questions.length === 0}
                                className="flex-1 h-11 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60 hover:opacity-90"
                                style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" }}
                            >
                                {finalizing
                                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
                                    : <><CheckCircle2 className="h-4 w-4" /> Create Demo Template</>
                                }
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// TEMPLATES LIST
// ────────────────────────────────────────────────────────────────────────────

function TemplatesList({ templates, onToggle, onDelete, onViewLeads }: {
    templates: DemoTemplate[];
    onToggle: (t: DemoTemplate) => void;
    onDelete: (t: DemoTemplate) => void;
    onViewLeads: (t: DemoTemplate) => void;
}) {
    if (templates.length === 0) {
        return (
            <div className="bg-white rounded-3xl p-16 text-center shadow-sm relative overflow-hidden group" style={{ border: "1px solid #E9E7FF" }}>
                {/* Decorative background blur */}
                <div className="absolute inset-0 bg-gradient-to-br from-violet-50/50 to-blue-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="relative z-10">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-violet-100 to-blue-50 flex items-center justify-center mx-auto mb-6 shadow-inner ring-1 ring-white/50">
                        <Sparkles className="h-7 w-7 text-violet-600" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">No demo templates yet</h3>
                    <p className="text-sm text-gray-500 max-w-sm mx-auto">Create your first AI interview template to start generating interactive demos for your prospects.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
                <TemplateCard key={t.id} template={t} onToggle={onToggle} onDelete={onDelete} onViewLeads={onViewLeads} />
            ))}
        </div>
    );
}

function TemplateCard({ template: t, onToggle, onDelete, onViewLeads }: {
    template: DemoTemplate;
    onToggle: (t: DemoTemplate) => void;
    onDelete: (t: DemoTemplate) => void;
    onViewLeads: (t: DemoTemplate) => void;
}) {
    const statusConfig = {
        processing: { icon: Loader2, label: "Processing", color: "text-amber-700 bg-amber-50 ring-1 ring-amber-500/20", iconClass: "animate-spin" },
        ready: { icon: CheckCircle2, label: "Ready", color: "text-emerald-700 bg-emerald-50 ring-1 ring-emerald-500/20", iconClass: "" },
        failed: { icon: AlertCircle, label: "Failed", color: "text-red-700 bg-red-50 ring-1 ring-red-500/20", iconClass: "" },
    }[t.status];

    const StatusIcon = statusConfig.icon;

    return (
        <div
            className="group relative bg-white rounded-3xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
            style={{ border: "1px solid #E9E7FF", boxShadow: "0 4px 12px rgba(124,58,237,0.03)" }}
        >
            {/* Subtle gradient overlay on hover */}
            <div className="absolute inset-0 bg-gradient-to-br from-violet-50/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            
            <div className="relative z-10 px-6 py-5 flex items-start justify-between gap-3 border-b border-gray-50/80">
                <div className="flex-1 min-w-0">
                    <h2 className="text-base font-bold text-gray-900 truncate tracking-tight">{t.title}</h2>
                    <p className="text-sm font-medium text-gray-500 mt-1 truncate">{t.roleTitle}</p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase shadow-sm ${statusConfig.color}`}>
                        <StatusIcon className={`h-3 w-3 ${statusConfig.iconClass}`} />
                        {statusConfig.label}
                    </div>
                </div>
            </div>

            <div className="relative z-10 p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {t.mode === "TECH" ? (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-violet-700 bg-violet-50 ring-1 ring-violet-500/15">
                                <Code2 className="h-3.5 w-3.5" /> Technical
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-blue-700 bg-blue-50 ring-1 ring-blue-500/15">
                                <MessageSquare className="h-3.5 w-3.5" /> Conversational
                            </div>
                        )}
                    </div>
                    <p className="text-xs font-semibold text-gray-400">
                        {new Date(t.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => onViewLeads(t)}
                        className="flex-1 flex items-center justify-between px-4 py-3 rounded-2xl bg-gray-50 hover:bg-gray-100 hover:ring-1 hover:ring-gray-200 transition-all group-hover:bg-violet-50/50 group-hover:hover:bg-violet-100/60"
                    >
                        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 group-hover:text-violet-700 transition-colors">
                            <Users className="h-4 w-4 opacity-70" />
                            View Leads
                        </div>
                        <div className="flex items-center justify-center min-w-[24px] h-6 px-2 text-xs font-bold text-gray-900 bg-white rounded-full shadow-sm ring-1 ring-gray-200 group-hover:text-violet-900 group-hover:ring-violet-200 transition-all">
                            {t._count.sessions}
                        </div>
                    </button>
                    
                    <button
                        onClick={() => onDelete(t)}
                        className="p-3 rounded-2xl text-gray-400 hover:text-red-600 bg-gray-50 hover:bg-red-50 hover:ring-1 hover:ring-red-100 transition-all shrink-0"
                        title="Delete Template"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>

                <div className="pt-3 flex items-center justify-between border-t border-gray-50/80">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</span>
                    <button
                        onClick={() => onToggle(t)}
                        disabled={t.status !== "ready"}
                        className={`group/toggle relative flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-40 ${
                            t.isActive ? "text-emerald-600" : "text-gray-400"
                        }`}
                    >
                        {t.isActive ? "Active" : "Hidden"}
                        <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${
                            t.isActive ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]" : "bg-gray-200 shadow-inner"
                        }`}>
                            <div className={`w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${
                                t.isActive ? "translate-x-4" : "translate-x-0"
                            }`} />
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// LEADS MODAL
// ────────────────────────────────────────────────────────────────────────────

function LeadsModal({ template, sessions, onClose, onDeleteSession }: {
    template: DemoTemplate;
    sessions: DemoSession[];
    onClose: () => void;
    onDeleteSession: (id: string) => void;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 backdrop-blur-sm p-4">
            <div className="w-full max-w-4xl max-h-[80vh] flex flex-col bg-white rounded-2xl animate-in zoom-in-95 duration-200" style={{ border: "1px solid #E9E7FF", boxShadow: "0 25px 60px rgba(124,58,237,0.12)" }}>
                <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid #F0EEF8" }}>
                    <div>
                        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                            <Users className="h-4 w-4 text-violet-500" />
                            Leads for {template.title}
                        </h2>
                        <p className="text-xs text-gray-400 mt-0.5">{sessions.length} total sessions</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-all">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 p-6">
                    {sessions.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
                                <Users className="h-6 w-6 text-gray-400" />
                            </div>
                            <h3 className="text-sm font-semibold text-gray-900 mb-1">No leads yet</h3>
                            <p className="text-xs text-gray-400">Users who try this demo will appear here.</p>
                        </div>
                    ) : (
                        <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm bg-white">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50/80 border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Candidate</th>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Interview Date</th>
                                        <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {sessions.map(s => (
                                        <tr key={s.id} className="hover:bg-violet-50/30 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-gray-900">{s.clientName}</span>
                                                    <span className="text-xs font-medium text-gray-500">{s.clientEmail}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide shadow-sm ${
                                                    s.status === "COMPLETED" 
                                                        ? "text-emerald-700 bg-emerald-50 ring-1 ring-emerald-500/20" 
                                                        : s.status === "FAILED"
                                                        ? "text-red-700 bg-red-50 ring-1 ring-red-500/20"
                                                        : "text-amber-700 bg-amber-50 ring-1 ring-amber-500/20"
                                                }`}>
                                                    {s.status === "COMPLETED" ? <CheckCircle2 className="h-3 w-3" /> : s.status === "FAILED" ? <AlertCircle className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
                                                    {s.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm font-medium text-gray-600">
                                                {new Date(s.startedAt).toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => onDeleteSession(s.id)}
                                                    className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 hover:ring-1 hover:ring-red-100 transition-all opacity-0 group-hover:opacity-100"
                                                    title="Delete Lead"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
