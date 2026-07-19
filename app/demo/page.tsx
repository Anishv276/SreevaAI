"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import {
    Mic, MicOff, PhoneOff, ArrowRight, Loader2, CheckCircle2, AlertCircle,
    Clock, Code2, MessageSquare, Zap, Shield, Users
} from "lucide-react";
import {
    LiveKitRoom as LKRoom,
    RoomAudioRenderer,
    useVoiceAssistant,
    useConnectionState,
    useRoomContext,
    useLocalParticipant,
    useTranscriptions,
} from "@livekit/components-react";
import type { TextStreamData as TranscriptionSegment } from "@livekit/components-react";
import "@livekit/components-styles";
import { ConnectionState } from "livekit-client";
import { AuraVisualizer } from "@/components/agents-ui/aura-visualizer";

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

    return (
        <div className="animate-in fade-in duration-500 flex flex-col items-center justify-center h-[600px] w-full relative">
            <div className="absolute inset-0 bg-white rounded-3xl overflow-hidden shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex flex-col items-center justify-center">
                <LKRoom
                    token={sessionData.token}
                    serverUrl={sessionData.url}
                    connect={true}
                    audio={true}
                    video={false}
                    onDisconnected={onEnd}
                    className="w-full h-full flex flex-col items-center justify-center relative"
                >
                    <RoomAudioRenderer />
                    <DemoVoiceStage onConnected={() => setConnected(true)} timeLeft={timeLeft} onLeave={onEnd} />
                </LKRoom>
                {!connected && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white z-10">
                        <Loader2 className="h-7 w-7 animate-spin text-violet-500" />
                        <p className="text-sm text-gray-400">Connecting to AI interviewer…</p>
                    </div>
                )}
            </div>
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

interface TranscriptLine {
    id: string;
    isCandidate: boolean;
    text: string;
    timestamp: number;
}

// Rendered inside <LKRoom> -- has access to the LiveKit room context for
// agent state (idle/listening/thinking/speaking), connection status, and
// live transcription segments.
function DemoVoiceStage({ onConnected, timeLeft, onLeave }: { onConnected: () => void, timeLeft: number, onLeave: () => void }) {
    const { state: agentState } = useVoiceAssistant();
    const connectionState = useConnectionState();
    const room = useRoomContext();
    const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
    const transcriptions = useTranscriptions({ room });

    useEffect(() => {
        if (connectionState === ConnectionState.Connected) {
            onConnected();
            // Browsers block remote audio autoplay without an explicit unlock call --
            // RoomAudioRenderer alone doesn't trigger it in all browsers.
            void room.startAudio().catch(() => { });
        }
    }, [connectionState, onConnected, room]);

    const lines: TranscriptLine[] = [];
    const latestSegments = new Map<string, TranscriptLine>();
    for (const segment of transcriptions as TranscriptionSegment[]) {
        const cleanText = sanitizeTranscriptText(segment.text);
        if (!cleanText) continue;
        const isFinal = segment.streamInfo.attributes?.["lk.transcription_final"] === "true";
        const identity = segment.participantInfo?.identity || "";
        if (identity === localParticipant.identity) continue;
        latestSegments.set(segment.streamInfo.id, {
            id: segment.streamInfo.id,
            isCandidate: false,
            text: cleanText,
            timestamp: segment.streamInfo.timestamp,
        });
    }
    lines.push(...Array.from(latestSegments.values()).sort((a, b) => a.timestamp - b.timestamp));

    const handleMuteToggle = () => {
        if (localParticipant) {
            localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
        }
    };

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timeString = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    const lastLine = lines.length > 0 ? lines[lines.length - 1] : null;
    const displayText = lastLine ? lastLine.text : "Connecting to interview...";

    return (
        <div className="w-full h-full flex flex-col items-center justify-between py-12 px-4 relative">
            <div className="flex-1 flex flex-col items-center justify-center -mt-10 w-full">
                {/* Aura Visualizer with Ripple effect */}
                <div className="relative flex flex-col items-center justify-center w-[300px] h-[300px] rounded-full border border-violet-100/60 shadow-[0_0_60px_rgba(139,92,246,0.03)] bg-gradient-to-b from-white to-gray-50/50">
                    <div className="absolute inset-0 m-auto w-[200px] h-[200px] bg-white rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.06)] flex flex-col items-center justify-center z-10 border border-gray-50">
                        <div className="h-16 flex flex-col items-center justify-center mb-1">
                            <AuraVisualizer state={agentState} color={[0.55, 0.36, 0.93]} size="sm" />
                        </div>
                        <div className="text-center mt-2">
                            <p className="text-[15px] font-bold text-gray-800 capitalize tracking-tight">
                                {agentState === "speaking" ? "Speaking" : agentState === "listening" ? "Listening" : agentState === "thinking" ? "Thinking" : "Connected"}
                            </p>
                            <p className="text-xs text-gray-400 font-medium mt-0.5 tracking-widest">{timeString}</p>
                        </div>
                    </div>
                </div>

                {/* Flowing single transcript text */}
                <div className="mt-4 text-center max-w-lg h-24 flex items-center justify-center px-6">
                    <p key={lastLine?.id || 'default'} className="text-lg text-gray-500 font-medium animate-in fade-in slide-in-from-bottom-2 duration-500 text-balance leading-relaxed">
                        {displayText}
                    </p>
                </div>
            </div>

            {/* Floating Pill Controls */}
            <div className="absolute bottom-8 bg-white border border-gray-100 shadow-[0_8px_30px_rgba(0,0,0,0.08)] rounded-[32px] px-4 py-3 flex items-center gap-3 z-20">
                <button 
                    onClick={handleMuteToggle}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${!isMicrophoneEnabled ? "bg-red-50 text-red-500 hover:bg-red-100" : "bg-violet-50 text-violet-600 hover:bg-violet-100"}`}
                >
                    {!isMicrophoneEnabled ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button 
                    onClick={onLeave}
                    className="w-12 h-12 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 hover:scale-105 transition-all duration-200 shadow-[0_4px_12px_rgba(239,68,68,0.3)]"
                >
                    <PhoneOff className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}
