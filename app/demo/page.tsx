"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import {
    Mic, ArrowRight, Loader2, CheckCircle2, AlertCircle,
    Clock, Code2, MessageSquare, Zap, Shield, Users
} from "lucide-react";

interface DemoTemplate {
    id: string;
    title: string;
    roleTitle: string;
    mode: "TECH" | "CONVERSATION";
}

type Phase = "select" | "details" | "launching" | "interview" | "done" | "error";

export default function DemoPage() {
    const [templates, setTemplates] = useState<DemoTemplate[]>([]);
    const [templatesLoading, setTemplatesLoading] = useState(true);
    const [phase, setPhase] = useState<Phase>("select");

    // Step 1: Selected template
    const [selectedTemplate, setSelectedTemplate] = useState<DemoTemplate | null>(null);

    // Step 2: Client details
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [detailsError, setDetailsError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    // Step 3: Interview
    const [sessionData, setSessionData] = useState<any>(null);
    const [errorMsg, setErrorMsg] = useState("");

    useEffect(() => {
        fetch("/api/demo/templates")
            .then(r => r.json())
            .then(d => setTemplates(d.templates || []))
            .catch(() => { })
            .finally(() => setTemplatesLoading(false));
    }, []);

    const handleStart = async () => {
        if (!name.trim() || !email.trim()) { setDetailsError("Please enter your name and work email."); return; }
        setSubmitting(true);
        setDetailsError("");
        try {
            const res = await fetch("/api/demo/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ templateId: selectedTemplate!.id, clientName: name.trim(), clientEmail: email.trim() }),
            });
            const data = await res.json();
            if (!res.ok) {
                if (data.code === "PERSONAL_EMAIL") {
                    setDetailsError("Please use your work email address (not Gmail, Yahoo, etc.).");
                } else {
                    setDetailsError(data.error || "Something went wrong. Please try again.");
                }
                return;
            }
            setSessionData(data);
            setPhase("launching");
            // Brief launching delay then go to interview
            setTimeout(() => setPhase("interview"), 2500);
        } catch {
            setDetailsError("Network error. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen text-gray-900" style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FAFAFC 45%, #F5F3FF 100%)", backgroundAttachment: "fixed" }}>
            {/* Background aurora */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-10%] right-[-5%] w-[38%] h-[38%] rounded-full bg-violet-100/35 blur-[130px]" />
                <div className="absolute bottom-[-8%] left-[-5%] w-[32%] h-[32%] rounded-full bg-blue-100/30 blur-[110px]" />
            </div>

            <div className="relative z-10 max-w-3xl mx-auto px-4 py-16">
                {/* Logo / Header */}
                {phase !== "interview" && (
                    <div className="text-center mb-10 animate-in fade-in duration-500">
                        <div className="inline-flex items-center gap-2.5 mb-6">
                            <img src="/sreevaai-logo.png" alt="SreevaAI" className="w-9 h-9 object-contain rounded-lg shadow-sm" />
                            <span className="text-xl font-bold text-gray-900 tracking-tight">
                                Sreeva <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(135deg, #8B5CF6, #3B82F6)" }}>AI</span>
                            </span>
                        </div>
                        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight mb-2">
                            Experience the Interview AI
                        </h1>
                        <p className="text-sm text-gray-500 max-w-md mx-auto">
                            A live 5-minute AI interview. No setup, no resume needed. Just pick a role and start.
                        </p>

                        {/* Trust pills */}
                        <div className="flex items-center justify-center gap-4 mt-5 flex-wrap">
                            {[
                                { icon: Clock, text: "5 minutes" },
                                { icon: Shield, text: "Business email only" },
                                { icon: Mic, text: "Voice interview" },
                            ].map(({ icon: Icon, text }) => (
                                <div key={text} className="flex items-center gap-1.5 text-xs text-gray-500">
                                    <Icon className="h-3.5 w-3.5 text-violet-500" />
                                    {text}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── PHASE: Select Template ── */}
                {phase === "select" && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {templatesLoading ? (
                            <div className="flex items-center justify-center h-40">
                                <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
                            </div>
                        ) : templates.length === 0 ? (
                            <div className="text-center py-16">
                                <p className="text-sm text-gray-400">No demo templates available right now. Please check back soon.</p>
                            </div>
                        ) : (
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">Choose your role</p>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {templates.map(t => (
                                        <button
                                            key={t.id}
                                            onClick={() => { setSelectedTemplate(t); setPhase("details"); }}
                                            className="group p-5 bg-white rounded-2xl text-left transition-all hover:shadow-lg"
                                            style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}
                                        >
                                            <div className="flex items-start justify-between gap-2 mb-3">
                                                <div className={`p-2 rounded-xl ${t.mode === "TECH" ? "bg-violet-50 text-violet-600" : "bg-blue-50 text-blue-600"}`}>
                                                    {t.mode === "TECH" ? <Code2 className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                                                </div>
                                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.mode === "TECH" ? "text-violet-700 bg-violet-50" : "text-blue-700 bg-blue-50"}`}>
                                                    {t.mode === "TECH" ? "Technical" : "Conversational"}
                                                </span>
                                            </div>
                                            <h3 className="text-sm font-semibold text-gray-900 mb-0.5 group-hover:text-violet-700 transition-colors">{t.title}</h3>
                                            <p className="text-xs text-gray-400">{t.roleTitle}</p>
                                            <div className="mt-3 flex items-center gap-1 text-xs text-violet-500 font-medium opacity-0 group-hover:opacity-100 transition-all">
                                                Start interview <ArrowRight className="h-3 w-3" />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── PHASE: Enter Details ── */}
                {phase === "details" && selectedTemplate && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Selected role pill */}
                        <div className="flex items-center gap-2 mb-6">
                            <button
                                onClick={() => setPhase("select")}
                                className="text-xs text-gray-400 hover:text-violet-600 transition-colors"
                            >
                                ← Back
                            </button>
                            <span className="text-xs text-gray-300">·</span>
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${selectedTemplate.mode === "TECH" ? "text-violet-700 bg-violet-50" : "text-blue-700 bg-blue-50"}`}>
                                {selectedTemplate.title}
                            </span>
                        </div>

                        <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E9E7FF", boxShadow: "0 4px 16px rgba(124,58,237,0.08)" }}>
                            <div className="px-6 py-5" style={{ borderBottom: "1px solid #F0EEF8" }}>
                                <h2 className="text-base font-semibold text-gray-900">Your details</h2>
                                <p className="text-xs text-gray-400 mt-0.5">We use this to personalise your demo experience.</p>
                            </div>

                            <div className="p-6 space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Your name</label>
                                    <input
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder="Riya Sharma"
                                        className="h-10 w-full rounded-xl bg-gray-50 text-sm outline-none transition-all px-3"
                                        style={{ border: "1px solid #E9E7FF" }}
                                        onFocus={e => { e.target.style.borderColor = "#7C3AED"; e.target.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.1)"; e.target.style.background = "#fff"; }}
                                        onBlur={e => { e.target.style.borderColor = "#E9E7FF"; e.target.style.boxShadow = "none"; e.target.style.background = "#F9FAFB"; }}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Work email</label>
                                    <input
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        placeholder="riya@yourcompany.com"
                                        type="email"
                                        className="h-10 w-full rounded-xl bg-gray-50 text-sm outline-none transition-all px-3"
                                        style={{ border: "1px solid #E9E7FF" }}
                                        onFocus={e => { e.target.style.borderColor = "#7C3AED"; e.target.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.1)"; e.target.style.background = "#fff"; }}
                                        onBlur={e => { e.target.style.borderColor = "#E9E7FF"; e.target.style.boxShadow = "none"; e.target.style.background = "#F9FAFB"; }}
                                        onKeyDown={e => e.key === "Enter" && handleStart()}
                                    />
                                    <p className="text-xs text-gray-400">Personal emails (Gmail, Yahoo, etc.) are not accepted.</p>
                                </div>

                                {detailsError && (
                                    <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-xs font-medium">
                                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                                        {detailsError}
                                    </div>
                                )}

                                <button
                                    onClick={handleStart}
                                    disabled={submitting}
                                    className="w-full h-11 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-60 mt-2"
                                    style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 14px rgba(124,58,237,0.3)" }}
                                >
                                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                                    {submitting ? "Starting your session…" : "Start Interview"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── PHASE: Launching ── */}
                {phase === "launching" && sessionData && (
                    <div className="animate-in fade-in duration-500 flex flex-col items-center justify-center min-h-[300px] text-center gap-6">
                        <div className="relative">
                            <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 8px 24px rgba(124,58,237,0.35)" }}>
                                <Mic className="h-9 w-9 text-white" />
                            </div>
                            {/* Pulse rings */}
                            <div className="absolute inset-0 rounded-2xl animate-ping opacity-30" style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)" }} />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">Connecting you to the AI…</h2>
                            <p className="text-sm text-gray-400 mt-1">Setting up your {sessionData.roleLabel} interview</p>
                        </div>
                        <div className="flex gap-1">
                            {[0, 1, 2].map(i => (
                                <div key={i} className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                            ))}
                        </div>
                    </div>
                )}

                {/* ── PHASE: Interview (LiveKit room) ── */}
                {phase === "interview" && sessionData && (
                    <DemoInterview
                        sessionData={sessionData}
                        onEnd={() => setPhase("done")}
                    />
                )}

                {/* ── PHASE: Done ── */}
                {phase === "done" && (
                    <div className="animate-in fade-in duration-500 flex flex-col items-center justify-center min-h-[300px] text-center gap-6">
                        <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
                            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">Interview Complete!</h2>
                            <p className="text-sm text-gray-400 mt-1 max-w-xs">
                                Thank you for trying Sreeva AI. Our team will reach out to you shortly.
                            </p>
                        </div>
                        <button
                            onClick={() => { setPhase("select"); setSelectedTemplate(null); setName(""); setEmail(""); setSessionData(null); }}
                            className="inline-flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-medium text-white transition-all"
                            style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" }}
                        >
                            Try Another Role
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Demo Interview Component (LiveKit) ───────────────────────────────────────
function DemoInterview({ sessionData, onEnd }: { sessionData: any; onEnd: () => void }) {
    const [connected, setConnected] = useState(false);
    const [timeLeft, setTimeLeft] = useState(sessionData.duration || 294);
    const containerRef = useRef<HTMLDivElement>(null);

    // Countdown timer
    useEffect(() => {
        const interval = setInterval(() => {
            setTimeLeft((t: number) => {
                if (t <= 1) { clearInterval(interval); onEnd(); return 0; }
                return t - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [onEnd]);

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const pct = ((sessionData.duration - timeLeft) / sessionData.duration) * 100;

    return (
        <div className="animate-in fade-in duration-500 space-y-4">
            {/* Interview header */}
            <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-xs font-semibold text-gray-600">Live Interview</span>
                        <span className="text-xs text-gray-400">·</span>
                        <span className="text-xs text-gray-400">{sessionData.roleLabel}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold tabular-nums" style={{ color: timeLeft < 60 ? "#EF4444" : timeLeft < 120 ? "#B45309" : "#111827" }}>
                        <Clock className="h-3.5 w-3.5" />
                        {minutes}:{String(seconds).padStart(2, "0")}
                    </div>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{ width: `${pct}%`, background: "linear-gradient(135deg, #8B5CF6, #3B82F6)" }}
                    />
                </div>
            </div>

            {/* LiveKit room embed */}
            <div
                ref={containerRef}
                className="bg-white rounded-2xl overflow-hidden relative"
                style={{ border: "1px solid #E9E7FF", boxShadow: "0 4px 16px rgba(124,58,237,0.08)", minHeight: "400px" }}
            >
                {/* Dynamically load LiveKit room */}
                <LiveKitRoom
                    token={sessionData.token}
                    serverUrl={sessionData.url}
                    onConnected={() => setConnected(true)}
                    onDisconnected={onEnd}
                />
                {!connected && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white">
                        <Loader2 className="h-7 w-7 animate-spin text-violet-500" />
                        <p className="text-sm text-gray-400">Connecting to AI interviewer…</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// Thin wrapper that lazy-imports the existing interview UI component
function LiveKitRoom({ token, serverUrl, onConnected, onDisconnected }: {
    token: string;
    serverUrl: string;
    onConnected: () => void;
    onDisconnected: () => void;
}) {
    // Re-use the existing interview page shell (same component the real interview uses)
    // Passed as an iframe URL so we don't need to restructure the LiveKit provider tree
    const url = `/interview/demo?token=${encodeURIComponent(token)}&url=${encodeURIComponent(serverUrl)}`;

    useEffect(() => {
        onConnected();
    }, [onConnected]);

    return (
        <iframe
            src={url}
            className="w-full"
            style={{ height: "420px", border: "none" }}
            allow="microphone; camera"
            title="Demo Interview"
        />
    );
}
