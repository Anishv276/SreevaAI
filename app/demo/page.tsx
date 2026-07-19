"use client";
import { useState, useEffect, useRef } from "react";
import {
    Mic, MicOff, Video, VideoOff, Camera, ArrowRight, Loader2, CheckCircle2, AlertCircle,
    Clock, Code2, MessageSquare, Zap, Shield, Volume2, PhoneOff
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
    LiveKitRoom as LKRoom,
    RoomAudioRenderer,
    useVoiceAssistant,
    useConnectionState,
    useRoomContext,
    useLocalParticipant,
    useTranscriptions,
    useTracks,
    TrackReference,
} from "@livekit/components-react";
import type { TextStreamData as TranscriptionSegment } from "@livekit/components-react";
import "@livekit/components-styles";
import { ConnectionState, Track } from "livekit-client";

interface DemoTemplate {
    id: string;
    title: string;
    roleTitle: string;
    mode: "TECH" | "CONVERSATION";
}

type Phase = "select" | "details" | "verify" | "launching" | "interview" | "done" | "failed";

export default function DemoPage() {
    const [templates, setTemplates] = useState<DemoTemplate[]>([]);
    const [templatesLoading, setTemplatesLoading] = useState(true);
    const [phase, setPhase] = useState<Phase>("select");
    const [filterTab, setFilterTab] = useState<"ALL" | "TECH" | "CONVERSATION">("ALL");

    // Step 1: Selected template
    const [selectedTemplate, setSelectedTemplate] = useState<DemoTemplate | null>(null);

    // Step 2: Client details
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [detailsError, setDetailsError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    // Step 3: Email verification (OTP proves the visitor owns the inbox --
    // MX/disposable checks alone can't tell a real company domain from any
    // other domain that merely has mail service, e.g. someone's name domain).
    const [otp, setOtp] = useState("");
    const [verifyError, setVerifyError] = useState("");
    const [verifying, setVerifying] = useState(false);
    const [resending, setResending] = useState(false);

    // Step 4: Interview
    const [sessionData, setSessionData] = useState<any>(null);

    useEffect(() => {
        fetch("/api/demo/templates")
            .then(r => r.json())
            .then(d => setTemplates(d.templates || []))
            .catch(() => { })
            .finally(() => setTemplatesLoading(false));
    }, []);

    const sendVerificationCode = async () => {
        if (!name.trim() || !email.trim()) { setDetailsError("Please enter your name and work email."); return; }
        setSubmitting(true);
        setDetailsError("");
        try {
            const res = await fetch("/api/demo/otp/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim(), name: name.trim() }),
            });
            const data = await res.json();
            if (!res.ok) {
                if (data.code === "PERSONAL_EMAIL") {
                    setDetailsError("Please use your work email address (not Gmail, Yahoo, disposable domains, etc.).");
                } else {
                    setDetailsError(data.error || "Something went wrong. Please try again.");
                }
                return;
            }
            setOtp("");
            setVerifyError("");
            setPhase("verify");
        } catch {
            setDetailsError("Network error. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    const resendCode = async () => {
        setResending(true);
        setVerifyError("");
        try {
            const res = await fetch("/api/demo/otp/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim(), name: name.trim() }),
            });
            const data = await res.json();
            if (!res.ok) setVerifyError(data.error || "Failed to resend code.");
        } catch {
            setVerifyError("Network error. Please try again.");
        } finally {
            setResending(false);
        }
    };

    // Verifies the OTP, then starts the interview. The full-viewport interview
    // UI takes over only after this succeeds (no browser Fullscreen API).
    const handleVerifyAndStart = async () => {
        if (!otp.trim() || otp.trim().length !== 6) { setVerifyError("Enter the 6-digit code from your email."); return; }
        setVerifying(true);
        setVerifyError("");
        try {
            const verifyRes = await fetch("/api/demo/otp/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim(), otp: otp.trim() }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok) {
                setVerifyError(verifyData.error || "Invalid code. Please try again.");
                return;
            }

            const res = await fetch("/api/demo/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ templateId: selectedTemplate!.id, clientName: name.trim(), clientEmail: email.trim() }),
            });
            const data = await res.json();
            if (!res.ok) {
                setVerifyError(data.error || "Something went wrong. Please try again.");
                return;
            }
            setSessionData(data);
            setPhase("launching");
            // No fullscreen for the demo -- it stays in the normal page viewport
            // (unlike the real interview page, which locks into fullscreen).
            // Phase transitions to "interview" only once the agent's greeting audio
            // is confirmed playing (see DemoVoiceStage onAgentReady), not on a timer.
        } catch {
            setVerifyError("Network error. Please try again.");
        } finally {
            setVerifying(false);
        }
    };

    const resetToStart = () => {
        setPhase("select");
        setSelectedTemplate(null);
        setName("");
        setEmail("");
        setOtp("");
        setSessionData(null);
    };

    // Interview UI fills the browser viewport (fixed inset-0) but never calls
    // the Fullscreen API -- the OS/browser chrome stays visible.
    if (phase === "launching" || phase === "interview") {
        return sessionData ? (
            <DemoInterview
                sessionData={sessionData}
                phase={phase}
                onAgentReady={() => setPhase("interview")}
                onEnd={() => setPhase("done")}
                onFailed={() => setPhase("failed")}
            />
        ) : null;
    }

    // Standalone failure screen -- surfaced if the agent never starts speaking
    // within the launch timeout, so the user isn't stuck staring at "Preparing
    // Interview Room" indefinitely.
    if (phase === "failed") {
        return (
            <div className="min-h-screen flex items-center justify-center text-gray-900" style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FAFAFC 45%, #F5F3FF 100%)", backgroundAttachment: "fixed" }}>
                <div className="flex flex-col items-center gap-4 text-center px-6 max-w-md">
                    <AlertCircle className="w-12 h-12 text-red-500" />
                    <h3 className="text-2xl font-semibold tracking-tight">Failed to connect</h3>
                    <p className="text-sm text-gray-500">
                        We couldn't connect you to the interview. Please contact{" "}
                        <a href="mailto:support@sreevaai.com" className="text-violet-600 underline">support@sreevaai.com</a> for more details.
                    </p>
                    <button onClick={resetToStart} className="mt-2 px-5 py-2.5 rounded-full bg-violet-600 text-white text-sm font-medium hover:bg-violet-700">
                        Try again
                    </button>
                </div>
            </div>
        );
    }

    // Standalone thank-you page -- no header/trust-pills, nothing else on screen.
    if (phase === "done") {
        return (
            <div className="min-h-screen flex items-center justify-center text-gray-900" style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FAFAFC 45%, #F5F3FF 100%)", backgroundAttachment: "fixed" }}>
                <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                    <div className="absolute top-[-10%] right-[-5%] w-[38%] h-[38%] rounded-full bg-violet-100/35 blur-[130px]" />
                    <div className="absolute bottom-[-8%] left-[-5%] w-[32%] h-[32%] rounded-full bg-blue-100/30 blur-[110px]" />
                </div>
                <div className="relative z-10 animate-in fade-in duration-500 flex flex-col items-center text-center gap-6 px-4">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">Thank You!</h2>
                        <p className="text-sm text-gray-500 mt-2 max-w-xs">
                            Thank you for trying Sreeva AI. Our team will reach out to you shortly.
                        </p>
                    </div>
                    <button
                        onClick={resetToStart}
                        className="inline-flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-medium text-white transition-all"
                        style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" }}
                    >
                        Try Another Role
                    </button>
                </div>
            </div>
        );
    }

    const filteredTemplates = templates.filter(t => 
        filterTab === "ALL" ? true : filterTab === "TECH" ? t.mode === "TECH" : t.mode === "CONVERSATION"
    );

    return (
        <div className="min-h-screen text-gray-900 bg-zinc-50 font-sans relative">
            {/* Top Navigation / Logo */}
            <header className="absolute top-0 left-0 w-full px-6 py-6 z-20 flex items-center md:px-12 md:py-8">
                <div className="inline-flex items-center gap-2.5">
                    <img src="/sreevaailogo2.png" alt="SreevaAI" className="h-8 object-contain drop-shadow-sm" />
                    <span className="text-xl font-bold text-zinc-900 tracking-tight">SreevaAI</span>
                </div>
            </header>

            <div className="relative z-10 max-w-5xl mx-auto px-4 pt-32 pb-16">
                {/* Header Text */}
                <div className="text-center mb-12 animate-in fade-in duration-700">
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-zinc-900 tracking-tight mb-4">
                        Experience the Interview AI
                    </h1>
                    <p className="text-lg text-zinc-500 max-w-xl mx-auto font-medium">
                        A live 5-minute AI interview. No setup, no resume needed. Just pick a role and start.
                    </p>
                </div>

                {/* Filter Tabs */}
                <div className="flex justify-center mb-10 animate-in fade-in duration-700 delay-100">
                    <div className="inline-flex items-center p-1 bg-white border border-zinc-200 rounded-full shadow-sm">
                        {(["ALL", "TECH", "CONVERSATION"] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setFilterTab(tab)}
                                className={cn(
                                    "px-6 py-2 rounded-full text-sm font-semibold transition-all duration-300",
                                    filterTab === tab 
                                        ? "bg-violet-600 text-white shadow-md shadow-violet-500/20" 
                                        : "text-zinc-500 hover:text-zinc-900"
                                )}
                            >
                                {tab === "ALL" ? "All" : tab === "TECH" ? "Technical" : "Conversational"}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── PHASE: Select Template (Always visible in background) ── */}
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
                    {templatesLoading ? (
                        <div className="flex flex-col items-center justify-center h-64 space-y-4">
                            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
                            <p className="text-sm text-zinc-500 font-medium animate-pulse">Loading scenarios...</p>
                        </div>
                    ) : filteredTemplates.length === 0 ? (
                        <div className="text-center py-16">
                            <p className="text-sm text-zinc-400">No demo templates available right now.</p>
                        </div>
                    ) : (
                        <div className="max-w-5xl mx-auto">
                            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                                {filteredTemplates.map((t, i) => {
                                    return (
                                        <motion.button
                                            initial={{ opacity: 0, y: 15 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.1, duration: 0.4, ease: "easeOut" }}
                                            key={t.id}
                                            onClick={() => { setSelectedTemplate(t); setPhase("details"); }}
                                            className={cn(
                                                "group relative flex flex-col text-left w-full bg-white rounded-[24px] p-7 transition-all duration-300 border border-zinc-200 overflow-hidden",
                                                t.mode === "TECH" 
                                                    ? "hover:border-violet-500/40 hover:shadow-[0_20px_40px_-15px_rgba(124,58,237,0.12)]" 
                                                    : "hover:border-cyan-500/40 hover:shadow-[0_20px_40px_-15px_rgba(6,182,212,0.12)]"
                                            )}
                                            whileTap={{ scale: 0.98 }}
                                        >
                                            {/* Subtle Glowing Background Effect */}
                                            <div className={cn(
                                                "absolute top-0 right-0 w-64 h-64 opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none",
                                                t.mode === "TECH" ? "bg-violet-500/20" : "bg-cyan-500/20"
                                            )} />

                                            <div className="relative z-10 w-full flex flex-col h-full">
                                                {/* Top Tag & Indicator */}
                                                <div className="flex justify-between items-center w-full mb-8">
                                                    <span className={cn(
                                                        "text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border bg-white/50 backdrop-blur-sm",
                                                        t.mode === "TECH" ? "text-violet-700 border-violet-200" : "text-cyan-700 border-cyan-200"
                                                    )}>
                                                        {t.mode === "TECH" ? "Technical" : "Conversational"}
                                                    </span>
                                                    
                                                    {/* Elegant pulsing dot indicator */}
                                                    <div className={cn(
                                                        "h-8 w-8 rounded-full flex items-center justify-center border",
                                                        t.mode === "TECH" ? "bg-violet-50/50 border-violet-100 text-violet-500" : "bg-cyan-50/50 border-cyan-100 text-cyan-500"
                                                    )}>
                                                        <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse shadow-sm" />
                                                    </div>
                                                </div>

                                                {/* Content */}
                                                <div className="mb-6 flex-grow">
                                                    <h3 className={cn(
                                                        "text-2xl font-bold text-zinc-900 tracking-tight mb-2 transition-colors duration-300",
                                                        t.mode === "TECH" ? "group-hover:text-violet-700" : "group-hover:text-cyan-700"
                                                    )}>
                                                        {t.title}
                                                    </h3>
                                                    <p className="text-[13px] leading-relaxed font-medium text-zinc-500 line-clamp-2 pr-4">
                                                        {t.roleTitle}
                                                    </p>
                                                </div>

                                                <div className={cn(
                                                    "w-full h-px bg-zinc-100 mb-6 transition-colors duration-300",
                                                    t.mode === "TECH" ? "group-hover:bg-violet-50" : "group-hover:bg-cyan-50"
                                                )} />

                                                {/* Bottom Row */}
                                                <div className="w-full flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className={cn(
                                                                "w-1.5 h-1.5 rounded-full bg-zinc-300 transition-colors duration-300",
                                                                t.mode === "TECH" ? "group-hover:bg-violet-400" : "group-hover:bg-cyan-400"
                                                            )} />
                                                            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">5 Min</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className={cn(
                                                                "w-1.5 h-1.5 rounded-full bg-zinc-300 transition-colors duration-300",
                                                                t.mode === "TECH" ? "group-hover:bg-violet-400" : "group-hover:bg-cyan-400"
                                                            )} />
                                                            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Voice</span>
                                                        </div>
                                                    </div>

                                                    <div className={cn(
                                                        "h-9 px-4 rounded-full text-xs font-bold text-white bg-zinc-900 flex items-center justify-center gap-1.5 transition-all duration-300 shadow-sm group-hover:shadow-md",
                                                        t.mode === "TECH" 
                                                            ? "group-hover:bg-violet-600 group-hover:shadow-violet-500/25" 
                                                            : "group-hover:bg-cyan-600 group-hover:shadow-cyan-500/25"
                                                    )}>
                                                        Start <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── MODAL OVERLAY for Details and Verify ── */}
            <AnimatePresence>
                {(phase === "details" || phase === "verify") && selectedTemplate && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }} 
                            exit={{ opacity: 0 }} 
                            transition={{ duration: 0.2 }}
                            className="absolute inset-0 bg-zinc-900/20 backdrop-blur-[2px]"
                            onClick={() => setPhase("select")}
                        />
                        
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 10 }} 
                            animate={{ opacity: 1, scale: 1, y: 0 }} 
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="relative w-full max-w-md bg-white rounded-3xl shadow-[0_40px_80px_-20px_rgba(0,0,0,0.15)] overflow-hidden border border-zinc-100 flex flex-col"
                        >
                            <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-semibold text-zinc-900">{phase === "details" ? "Your details" : "Verify your email"}</h2>
                                    <p className="text-xs text-zinc-500 mt-0.5">{phase === "details" ? "We use this to personalise your demo." : <span>Code sent to <span className="font-medium text-zinc-700">{email}</span></span>}</p>
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${selectedTemplate.mode === "TECH" ? "text-violet-700 bg-violet-50/50 border-violet-100/50" : "text-sky-700 bg-sky-50/50 border-sky-100/50"}`}>
                                    {selectedTemplate.mode === "TECH" ? "Technical" : "Conversation"}
                                </span>
                            </div>

                            <div className="p-6">
                                {phase === "details" ? (
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Your name</label>
                                            <input
                                                value={name}
                                                onChange={e => setName(e.target.value)}
                                                placeholder="Riya Sharma"
                                                className="h-11 w-full rounded-xl bg-zinc-50 text-sm outline-none transition-all px-3 border border-zinc-200 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-500/10"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Work email</label>
                                            <input
                                                value={email}
                                                onChange={e => setEmail(e.target.value)}
                                                placeholder="riya@yourcompany.com"
                                                type="email"
                                                className="h-11 w-full rounded-xl bg-zinc-50 text-sm outline-none transition-all px-3 border border-zinc-200 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-500/10"
                                                onKeyDown={e => e.key === "Enter" && sendVerificationCode()}
                                            />
                                            <p className="text-xs text-zinc-400">Personal emails (Gmail, Yahoo, etc.) are not accepted.</p>
                                        </div>

                                        {detailsError && (
                                            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-xs font-medium">
                                                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                                                {detailsError}
                                            </div>
                                        )}

                                        <button
                                            onClick={sendVerificationCode}
                                            disabled={submitting}
                                            className="w-full h-11 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-60 mt-2 bg-zinc-900 hover:bg-zinc-800 shadow-sm"
                                        >
                                            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                                            {submitting ? "Sending code…" : "Continue"}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Verification code</label>
                                            <input
                                                value={otp}
                                                onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                                placeholder="123456"
                                                inputMode="numeric"
                                                maxLength={6}
                                                className="h-12 w-full rounded-xl bg-zinc-50 text-center text-xl font-bold tracking-[0.4em] outline-none transition-all px-3 border border-zinc-200 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-500/10"
                                                onKeyDown={e => e.key === "Enter" && handleVerifyAndStart()}
                                                autoFocus
                                            />
                                        </div>

                                        {verifyError && (
                                            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-xs font-medium">
                                                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                                                {verifyError}
                                            </div>
                                        )}

                                        <button
                                            onClick={handleVerifyAndStart}
                                            disabled={verifying}
                                            className="w-full h-11 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-60 mt-2 bg-zinc-900 hover:bg-zinc-800 shadow-sm"
                                        >
                                            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                            {verifying ? "Starting your session…" : "Start Interview"}
                                        </button>

                                        <button
                                            onClick={resendCode}
                                            disabled={resending}
                                            className="w-full text-xs font-medium text-zinc-400 hover:text-zinc-700 transition-colors disabled:opacity-60 pt-2"
                                        >
                                            {resending ? "Resending…" : "Didn't get a code? Resend"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ── Demo Interview (LiveKit) ──────────────────────────────────────────────
// Byte-for-byte the same launching + interview-room UI as
// app/interview/[id]/page.tsx (breathing AI core -> avatar/camera/dock),
// full-screen, entered only after OTP verification. No proctoring, no
// egress recording, no hardware-check step, no report -- none of that
// applies to a 5-minute demo. Camera and mic are present and controllable,
// matching the real interview room.
function DemoInterview({
    sessionData, phase, onAgentReady, onEnd, onFailed,
}: {
    sessionData: any; phase: "launching" | "interview"; onAgentReady: () => void; onEnd: () => void; onFailed: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 bg-white">
            <LKRoom
                token={sessionData.token}
                serverUrl={sessionData.url}
                connect={true}
                audio={true}
                video={true}
                onDisconnected={onEnd}
                className="w-full h-full"
            >
                <RoomAudioRenderer />
                <DemoVoiceStage
                    sessionData={sessionData}
                    phase={phase}
                    onAgentReady={onAgentReady}
                    onEndCall={onEnd}
                    onFailed={onFailed}
                />
            </LKRoom>
            <AnimatePresence>
                {phase === "launching" && (
                    <motion.div
                        key="launching"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.8 }}
                        className="absolute inset-0 z-[120] flex items-center justify-center bg-[#FAFAFC]"
                    >
                        <div className="flex flex-col items-center gap-8 text-center px-6">
                            {/* Minimalist Breathing AI Core -- exact copy of app/interview/[id]/page.tsx */}
                            <div className="relative h-24 w-24 rounded-full bg-white border border-violet-100 flex items-center justify-center shadow-sm">
                                <div className="relative flex items-center justify-center h-12 w-12">
                                    <motion.div
                                        className="absolute inset-0 rounded-full bg-violet-500/20"
                                        animate={{ scale: [1, 2.5], opacity: [1, 0] }}
                                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut" }}
                                    />
                                    <motion.div
                                        className="absolute inset-0 rounded-full bg-violet-500/20"
                                        animate={{ scale: [1, 2.5], opacity: [1, 0] }}
                                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut", delay: 1.25 }}
                                    />
                                    <motion.div
                                        className="relative h-6 w-6 bg-violet-600 rounded-full shadow-[0_0_20px_rgba(124,58,237,0.4)]"
                                        animate={{ scale: [1, 1.2, 1] }}
                                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-semibold text-gray-900 tracking-tight">Preparing Interview Room</h3>
                                <p className="text-sm text-gray-500 max-w-[320px] mx-auto">
                                    Please wait a moment while we securely connect your AI interviewer.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// Strips internal directive/control text that can leak into transcription
// segments (mirrors the sanitizer used on the real interview page).
function sanitizeTranscriptText(text: string): string {
    return text
        .replace(/<wait for response>/gi, "")
        .replace(/\[(?:[^\[\]]|\[[^\]]*\]){0,2000}\]/g, " ")
        .replace(/DO NOT SAY ALOUD/gi, " ")
        .replace(/NEXT_TURN_DIRECTIVE/gi, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
}

// Rendered inside <LKRoom> -- has access to the LiveKit room context for
// agent state (idle/listening/thinking/speaking), connection status, and
// live transcription segments. Layout is an exact copy of InterviewRoomContent
// in app/interview/[id]/page.tsx, minus camera-toggle-driven proctoring hooks,
// egress recording, and the Guidelines/Support dock buttons.
function DemoVoiceStage({
    sessionData, phase, onAgentReady, onEndCall, onFailed,
}: {
    sessionData: any; phase: "launching" | "interview"; onAgentReady: () => void; onEndCall: () => void; onFailed: () => void;
}) {
    const voiceAssistant = useVoiceAssistant();
    const connectionState = useConnectionState();
    const room = useRoomContext();
    const { localParticipant } = useLocalParticipant();
    const transcriptions = useTranscriptions({ room });
    const cameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
    const localCameraTrack = cameraTracks.find((t) => t.participant.isLocal && t.source === Track.Source.Camera) || null;
    const roleLabel: string = sessionData.roleLabel;

    const assistantState = String(voiceAssistant.state);
    const isAiSpeaking = assistantState === "speaking";
    const isAiThinking = assistantState === "thinking" || assistantState === "initializing";
    const hasAgentPresence = Boolean(voiceAssistant.agent);

    useEffect(() => {
        if (connectionState === ConnectionState.Connected) {
            // Browsers block remote audio autoplay without an explicit unlock call --
            // RoomAudioRenderer alone doesn't trigger it in all browsers.
            void room.startAudio().catch(() => { });
        }
    }, [connectionState, room]);

    // Agent readiness is gated by: room connected + agent present + greeting audio
    // ACTUALLY speaking (never "listening" -- that fires briefly before TTS audio
    // arrives, which would cut the launch screen short with 10-15s of silence).
    // onAgentReady is a one-way latch, mirroring the real interview page.
    const agentReadySentRef = useRef(false);
    useEffect(() => {
        if (phase !== "launching") {
            agentReadySentRef.current = false;
            return;
        }
        if (agentReadySentRef.current) return;
        if (connectionState === ConnectionState.Connected && hasAgentPresence && assistantState === "speaking") {
            agentReadySentRef.current = true;
            onAgentReady();
        }
    }, [phase, connectionState, hasAgentPresence, assistantState, onAgentReady]);

    // Launch timeout: if the greeting audio never arrives, don't leave the user
    // staring at "Preparing Interview Room" forever -- surface a failure screen.
    useEffect(() => {
        if (phase !== "launching") return;
        const timeout = setTimeout(() => {
            if (!agentReadySentRef.current) onFailed();
        }, 25000);
        return () => clearTimeout(timeout);
    }, [phase, onFailed]);

    // Countdown only runs once the interview phase actually starts (matches the
    // real page: the timer starts when the greeting begins, not during launch).
    // Displayed duration is always the advertised 5:00 even though the actual
    // kill switch fires a few seconds early (see DEMO_KILL_SWITCH_SECS) --
    // cosmetic only, doesn't change when the call actually ends.
    const actualDuration = sessionData.duration || 294;
    const [timeLeft, setTimeLeft] = useState(300);
    const timerStartedRef = useRef(false);
    useEffect(() => {
        if (phase !== "interview" || timerStartedRef.current) return;
        timerStartedRef.current = true;
        const interval = setInterval(() => {
            setTimeLeft((t: number) => {
                if (t <= 1 || 300 - t + 1 >= actualDuration) { clearInterval(interval); onEndCall(); return 0; }
                return t - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [phase, onEndCall]);
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timeLabel = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    // Mic/camera toggles -- mirrors toggleMic/toggleCamera in app/interview/[id]/page.tsx.
    const isMicEnabled = localParticipant?.isMicrophoneEnabled ?? false;
    const [micTogglePending, setMicTogglePending] = useState(false);
    const toggleMic = async () => {
        if (!localParticipant || micTogglePending) return;
        setMicTogglePending(true);
        try {
            await localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled);
        } catch (err) {
            console.warn("[Mic] Failed to toggle microphone:", err);
        } finally {
            setMicTogglePending(false);
        }
    };
    const isCameraEnabled = localParticipant?.isCameraEnabled ?? false;
    const [cameraTogglePending, setCameraTogglePending] = useState(false);
    const toggleCamera = async () => {
        if (!localParticipant || cameraTogglePending) return;
        setCameraTogglePending(true);
        try {
            await localParticipant.setCameraEnabled(!localParticipant.isCameraEnabled);
        } catch (err) {
            console.warn("[Camera] Failed to toggle camera:", err);
        } finally {
            setCameraTogglePending(false);
        }
    };

    const latestAiTranscript = (() => {
        const latestSegments = new Map<string, { text: string; isFinal: boolean; timestamp: number; identity: string }>();
        for (const segment of transcriptions as TranscriptionSegment[]) {
            const cleanText = sanitizeTranscriptText(segment.text);
            if (!cleanText) continue;
            const isFinal = segment.streamInfo.attributes?.["lk.transcription_final"] === "true";
            latestSegments.set(segment.streamInfo.id, {
                text: cleanText,
                isFinal,
                timestamp: segment.streamInfo.timestamp,
                identity: segment.participantInfo?.identity || "",
            });
        }
        const aiSegments = Array.from(latestSegments.values())
            .filter(s => s.identity !== localParticipant.identity)
            .sort((a, b) => a.timestamp - b.timestamp);
        if (aiSegments.length === 0) return null;
        return aiSegments[aiSegments.length - 1];
    })();

    return (
        <div className="flex-1 flex flex-col h-full w-full relative bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50 text-zinc-900 overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full bg-white/40 pointer-events-none backdrop-blur-3xl" />

            {/* Top Navigation Bar */}
            <div className="absolute top-0 left-0 right-0 z-[60] flex items-center justify-between px-8 py-6 pointer-events-none">
                <div className="flex items-center gap-1.5 pointer-events-auto">
                    <img src="/sreevaailogo2.png" alt="SreevaAI" className="h-8 object-contain drop-shadow-sm" />
                    <p className="text-xl font-bold text-zinc-800 tracking-tight">SreevaAI</p>
                </div>
            </div>

            {/* Candidate Video Feed - TOP RIGHT (exact copy of app/interview/[id]/page.tsx) */}
            <div className="absolute top-24 right-10 z-50 pointer-events-auto flex flex-col items-end gap-3">
                <div className="w-72 aspect-video rounded-3xl p-[3px] bg-gradient-to-b from-white/80 to-white/30 shadow-[0_12px_40px_rgba(0,0,0,0.12)] backdrop-blur-md">
                    <div className="w-full h-full rounded-[22px] overflow-hidden bg-black relative">
                        {localCameraTrack ? (
                            <div className="w-full h-full [&>video]:w-full [&>video]:h-full [&>video]:object-cover scale-x-[-1]">
                                <DemoVideoTrack trackRef={localCameraTrack} />
                            </div>
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                                <Camera className="w-6 h-6 text-zinc-500" />
                            </div>
                        )}
                    </div>
                </div>
                <div className="px-5 py-2.5 bg-white/90 backdrop-blur-md border border-zinc-200/60 rounded-full shadow-sm mr-2 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">{roleLabel || "Interviewing"}</p>
                </div>
            </div>

            {/* AI Avatar Area */}
            <div className="flex-1 flex flex-col items-center justify-center relative -mt-4">
                <div className="relative w-[16rem] h-[16rem] flex items-center justify-center group shrink-0" style={{ transform: 'translateZ(0)' }}>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        {isAiSpeaking && (
                            <>
                                <motion.div className="absolute inset-0 rounded-full border-2 border-violet-500/20" animate={{ scale: [1, 1.4], opacity: [1, 0] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }} />
                                <motion.div className="absolute inset-0 rounded-full border-2 border-violet-500/20" animate={{ scale: [1, 1.4], opacity: [1, 0] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut", delay: 0.75 }} />
                            </>
                        )}
                        {isAiThinking && (
                            <motion.div className="absolute inset-2 rounded-full border-[3px] border-amber-500/20 border-t-amber-500 animate-spin" transition={{ duration: 2, ease: "linear", repeat: Infinity }} />
                        )}
                    </div>

                    <div className="absolute inset-5 rounded-full z-20 shadow-[0_8px_40px_rgba(0,0,0,0.06)] bg-white flex flex-col items-center justify-center gap-4 border border-zinc-100 transition-all duration-500">
                        <div className={cn(
                            "w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500",
                            isAiSpeaking ? "bg-violet-50" : (isAiThinking ? "bg-amber-50" : "bg-zinc-50")
                        )}>
                            {isAiSpeaking ? (
                                <div className="flex items-center justify-center gap-1.5">
                                    {[0, 1, 2, 3].map((i) => (
                                        <motion.div key={i} className="w-1.5 bg-violet-500 rounded-full" animate={{ height: ["12px", "28px", "12px"] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }} />
                                    ))}
                                </div>
                            ) : (
                                <Volume2 className={cn(
                                    "w-7 h-7 transition-colors duration-500",
                                    isAiThinking ? "text-amber-500" : "text-zinc-400"
                                )} />
                            )}
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-[15px] font-semibold tracking-wide text-zinc-900">
                                {isAiSpeaking ? "Speaking" : (isAiThinking ? "Thinking" : "Listening")}
                            </span>
                            <span className="text-[13px] font-medium text-zinc-400 tabular-nums tracking-widest">{timeLabel}</span>
                        </div>
                    </div>
                </div>

                <div className="mt-12 mb-20 w-full max-w-3xl px-8 text-center z-20 shrink-0">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={latestAiTranscript ? latestAiTranscript.timestamp : "placeholder"}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3 }}
                            className="w-full"
                        >
                            <p className={cn(
                                "whitespace-pre-line text-lg md:text-xl font-medium tracking-tight text-zinc-800 drop-shadow-sm",
                                (!latestAiTranscript || !latestAiTranscript.isFinal) && "text-zinc-500"
                            )}>
                                {latestAiTranscript ? latestAiTranscript.text : "Say hello to get started…"}
                                {latestAiTranscript && !latestAiTranscript.isFinal && <span className="animate-pulse">...</span>}
                            </p>
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {/* Sleek Floating Dock - BOTTOM CENTER (Mic, Video, End Call only -- no
                Guidelines/Support, no proctoring, matches the real dock's exact styling) */}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[60] pointer-events-auto">
                <div className="flex items-center gap-4 px-6 py-4 rounded-[2rem] bg-white/95 border border-zinc-200/50 backdrop-blur-xl shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
                    <button
                        onClick={toggleMic}
                        disabled={micTogglePending}
                        className="flex flex-col items-center gap-2 transition-all group w-14"
                    >
                        <div className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-all", isMicEnabled ? "bg-violet-100 group-hover:bg-violet-200" : "bg-red-50 group-hover:bg-red-100")}>
                            {isMicEnabled ? <Mic className="w-5 h-5 text-violet-600" /> : <MicOff className="w-5 h-5 text-red-500" />}
                        </div>
                        <span className="text-[10px] font-medium text-zinc-600">Mic</span>
                    </button>

                    <button
                        onClick={toggleCamera}
                        disabled={cameraTogglePending}
                        className="flex flex-col items-center gap-2 transition-all group w-14"
                    >
                        <div className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-all", isCameraEnabled ? "bg-violet-100 group-hover:bg-violet-200" : "bg-red-50 group-hover:bg-red-100")}>
                            {isCameraEnabled ? <Video className="w-5 h-5 text-violet-600" /> : <VideoOff className="w-5 h-5 text-red-500" />}
                        </div>
                        <span className="text-[10px] font-medium text-zinc-600">Video</span>
                    </button>

                    <button onClick={onEndCall} className="flex flex-col items-center gap-2 transition-all group w-14 ml-2">
                        <div className="w-12 h-12 rounded-[1.2rem] flex items-center justify-center transition-all bg-red-500 group-hover:bg-red-600 shadow-md">
                            <PhoneOff className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-[10px] font-medium text-zinc-600">End Call</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

// Attaches a LiveKit camera TrackReference to a <video> element -- mirrors
// VideoTrack in app/interview/[id]/page.tsx.
function DemoVideoTrack({ trackRef }: { trackRef: TrackReference }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const attachedTrackRef = useRef<{ sid?: string; attach: (el: HTMLMediaElement) => void; detach: (el: HTMLMediaElement) => void } | null>(null);
    const lastTrackId = useRef<string | null>(null);
    useEffect(() => {
        const element = videoRef.current;
        const track = (trackRef.publication?.track || (trackRef as any).track || null) as
            { sid?: string; attach: (el: HTMLMediaElement) => void; detach: (el: HTMLMediaElement) => void } | null;
        if (!track || !element || typeof track.attach !== "function") return;
        if (track.sid === lastTrackId.current) return;
        if (attachedTrackRef.current && attachedTrackRef.current !== track) {
            attachedTrackRef.current.detach(element);
        }
        track.attach(element);
        attachedTrackRef.current = track;
        lastTrackId.current = track.sid || null;
    }, [trackRef]);
    useEffect(() => {
        return () => {
            const element = videoRef.current;
            if (element && attachedTrackRef.current) attachedTrackRef.current.detach(element);
            attachedTrackRef.current = null;
            lastTrackId.current = null;
        };
    }, []);
    return <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover bg-zinc-950" />;
}
