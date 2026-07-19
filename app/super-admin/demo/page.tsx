"use client";
import { useState, useEffect, useRef } from "react";
import {
    Plus, Upload, ChevronDown, Loader2, CheckCircle2,
    AlertCircle, Clock, Eye, EyeOff, Users, Play,
    FileText, Zap, MessageSquare, Code2, X, RefreshCw, Trash2
} from "lucide-react";

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
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showLeadsModal, setShowLeadsModal] = useState<DemoTemplate | null>(null);
    const [refreshing, setRefreshing] = useState(false);

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

    const deleteTemplate = async (template: DemoTemplate) => {
        if (!confirm("Are you sure you want to delete this template? All its leads will be hidden as well.")) return;
        try {
            await fetch(`/api/super-admin/demo/templates/${template.id}`, { method: "DELETE" });
            fetchData(true);
            if (showLeadsModal?.id === template.id) setShowLeadsModal(null);
        } catch (e) { console.error(e); }
    };

    const deleteSession = async (sessionId: string) => {
        if (!confirm("Are you sure you want to delete this lead?")) return;
        try {
            await fetch(`/api/super-admin/demo/sessions/${sessionId}`, { method: "DELETE" });
            fetchData(true);
        } catch (e) { console.error(e); }
    };

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
                        onClick={() => setShowCreateModal(true)}
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
                    onDelete={deleteTemplate}
                    onViewLeads={setShowLeadsModal} 
                />
            )}

            {showLeadsModal && (
                <LeadsModal
                    template={showLeadsModal}
                    sessions={sessions.filter(s => s.templateId === showLeadsModal.id)}
                    onClose={() => setShowLeadsModal(null)}
                    onDeleteSession={deleteSession}
                />
            )}

            {showCreateModal && (
                <CreateTemplateModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={() => { setShowCreateModal(false); fetchData(true); }}
                />
            )}
        </div>
    );
}

function TemplatesList({ templates, onToggle, onDelete, onViewLeads }: { 
    templates: DemoTemplate[]; 
    onToggle: (t: DemoTemplate) => void; 
    onDelete: (t: DemoTemplate) => void;
    onViewLeads: (t: DemoTemplate) => void; 
}) {
    if (templates.length === 0) {
        return (
            <div className="bg-white rounded-2xl p-12 text-center" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-4">
                    <FileText className="h-6 w-6 text-violet-500" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">No templates yet</h3>
                <p className="text-xs text-gray-400">Upload a JD PDF to create the first demo template.</p>
            </div>
        );
    }

    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        processing: { icon: Loader2, label: "Processing", color: "text-amber-600 bg-amber-50", iconClass: "animate-spin" },
        ready: { icon: CheckCircle2, label: "Ready", color: "text-emerald-600 bg-emerald-50", iconClass: "" },
        failed: { icon: AlertCircle, label: "Failed", color: "text-red-600 bg-red-50", iconClass: "" },
    }[t.status];

    const StatusIcon = statusConfig.icon;

    return (
        <div
            className="bg-white rounded-2xl overflow-hidden transition-all hover:shadow-md"
            style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}
        >
            <div className="px-5 py-4 flex items-start justify-between gap-2" style={{ borderBottom: "1px solid #F0EEF8" }}>
                <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-semibold text-gray-900 truncate">{t.title}</h2>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{t.roleTitle}</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
                        <StatusIcon className={`h-3 w-3 ${statusConfig.iconClass}`} />
                        {statusConfig.label}
                    </div>
                    <button 
                        onClick={() => onDelete(t)}
                        className="text-gray-400 hover:text-red-600 transition-colors p-1 rounded-md hover:bg-red-50"
                        title="Delete Template"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            </div>

            <div className="p-5 space-y-4">
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {t.mode === "TECH" ? (
                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-violet-700 bg-violet-50">
                                    <Code2 className="h-3 w-3" /> Technical
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-blue-700 bg-blue-50">
                                    <MessageSquare className="h-3 w-3" /> Conversational
                                </div>
                            )}
                        </div>
                        <p className="text-xs text-gray-400">
                            {new Date(t.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                    </div>

                    <button
                        onClick={() => onViewLeads(t)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-100"
                    >
                        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                            <Users className="h-3.5 w-3.5 text-gray-400" />
                            View Leads
                        </div>
                        <div className="text-xs font-medium bg-white px-2 py-0.5 rounded-full border border-gray-200">
                            {t._count.sessions}
                        </div>
                    </button>
                </div>

                <div className="flex items-center justify-end">
                    <button
                        onClick={() => onToggle(t)}
                        disabled={t.status !== "ready"}
                        className={`flex items-center gap-1.5 text-xs font-medium transition-all disabled:opacity-40 ${t.isActive ? "text-emerald-600 hover:text-emerald-700" : "text-gray-400 hover:text-gray-600"}`}
                    >
                        {t.isActive ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        {t.isActive ? "Active" : "Hidden"}
                    </button>
                </div>
            </div>
        </div>
    );
}

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
                        <div className="border border-gray-100 rounded-xl overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500">Name</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500">Email</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500">Date</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {sessions.map(s => (
                                        <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.clientName}</td>
                                            <td className="px-4 py-3 text-sm text-gray-500">{s.clientEmail}</td>
                                            <td className="px-4 py-3">
                                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.status === "COMPLETED" ? "text-emerald-700 bg-emerald-50" : s.status === "LAUNCHING" || s.status === "IN_PROGRESS" ? "text-amber-700 bg-amber-50" : "text-gray-500 bg-gray-100"}`}>
                                                    {s.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-400">
                                                {new Date(s.startedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <button 
                                                    onClick={() => onDeleteSession(s.id)}
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors inline-flex"
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

function CreateTemplateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [title, setTitle] = useState("");
    const [roleTitle, setRoleTitle] = useState("");
    const [mode, setMode] = useState<"TECH" | "CONVERSATION">("TECH");
    const [file, setFile] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);

    const handleSubmit = async () => {
        if (!title.trim() || !file || !mode) { setError("Please fill all fields and upload a JD PDF."); return; }
        setSubmitting(true);
        setError("");
        try {
            const fd = new FormData();
            fd.append("jdFile", file);
            fd.append("title", title.trim());
            fd.append("roleTitle", roleTitle.trim() || title.trim());
            fd.append("mode", mode);
            const res = await fetch("/api/super-admin/demo/create", { method: "POST", body: fd });
            if (!res.ok) {
                const d = await res.json();
                setError(d.error || "Failed to create template");
                return;
            }
            onCreated();
        } catch (e) {
            setError("Network error. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-white rounded-2xl animate-in zoom-in-95 duration-200" style={{ border: "1px solid #E9E7FF", boxShadow: "0 25px 60px rgba(124,58,237,0.12)" }}>
                <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid #F0EEF8" }}>
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">New Demo Template</h2>
                        <p className="text-xs text-gray-400 mt-0.5">Upload a JD PDF to generate an 8-topic brief</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-all">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Display Title</label>
                        <input
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="e.g. Frontend Engineer"
                            className="h-10 w-full rounded-xl bg-gray-50 text-sm outline-none transition-all px-3"
                            style={{ border: "1px solid #E9E7FF" }}
                            onFocus={e => { e.target.style.borderColor = "#7C3AED"; e.target.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.1)"; e.target.style.background = "#fff"; }}
                            onBlur={e => { e.target.style.borderColor = "#E9E7FF"; e.target.style.boxShadow = "none"; e.target.style.background = "#F9FAFB"; }}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Role Title <span className="font-normal lowercase tracking-normal normal-case">(used by AI agent)</span></label>
                        <input
                            value={roleTitle}
                            onChange={e => setRoleTitle(e.target.value)}
                            placeholder="e.g. Senior Frontend Engineer (defaults to title)"
                            className="h-10 w-full rounded-xl bg-gray-50 text-sm outline-none transition-all px-3"
                            style={{ border: "1px solid #E9E7FF" }}
                            onFocus={e => { e.target.style.borderColor = "#7C3AED"; e.target.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.1)"; e.target.style.background = "#fff"; }}
                            onBlur={e => { e.target.style.borderColor = "#E9E7FF"; e.target.style.boxShadow = "none"; e.target.style.background = "#F9FAFB"; }}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Interview Mode</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(["TECH", "CONVERSATION"] as const).map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setMode(m)}
                                    className={`flex items-center gap-2 p-3 rounded-xl transition-all text-sm font-medium ${mode === m
                                        ? "text-violet-700"
                                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                                        }`}
                                    style={mode === m ? {
                                        background: "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(59,130,246,0.06))",
                                        border: "1px solid rgba(139,92,246,0.25)",
                                    } : { border: "1px solid #E9E7FF" }}
                                >
                                    {m === "TECH" ? <Code2 className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                                    {m === "TECH" ? "Technical" : "Conversational"}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">JD PDF</label>
                        <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className={`w-full h-20 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition-all ${file ? "border-violet-300 bg-violet-50/50" : "border-gray-200 hover:border-violet-300 hover:bg-violet-50/30"}`}
                        >
                            {file ? (
                                <>
                                    <CheckCircle2 className="h-5 w-5 text-violet-500" />
                                    <p className="text-xs font-medium text-violet-700">{file.name}</p>
                                </>
                            ) : (
                                <>
                                    <Upload className="h-5 w-5 text-gray-400" />
                                    <p className="text-xs text-gray-400">Click to upload PDF</p>
                                </>
                            )}
                        </button>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-xs font-medium">
                            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                            {error}
                        </div>
                    )}
                </div>

                <div className="px-6 pb-6 flex gap-2">
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="flex-1 h-10 rounded-xl bg-gray-50 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all"
                        style={{ border: "1px solid #E9E7FF" }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="flex-1 h-10 rounded-xl text-sm font-medium text-white transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                        style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" }}
                    >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                        {submitting ? "Creating…" : "Create Template"}
                    </button>
                </div>
            </div>
        </div>
    );
}
