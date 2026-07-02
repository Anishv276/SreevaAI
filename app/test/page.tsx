"use client";
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import {
    Building2, Briefcase, Users, Play, StopCircle,
    Loader2, AlertCircle, Settings2,
    ToggleLeft, ToggleRight, LogOut, ShieldAlert
} from "lucide-react";
import { toast } from "@/components/ui/toast-custom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import {
    LiveKitRoom,
    RoomAudioRenderer,
    useConnectionState,
    useTranscriptions,
} from "@livekit/components-react";
import type { TextStreamData as TranscriptionSegment } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { AuraVisualizer } from "@/components/agents-ui/aura-visualizer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import "@livekit/components-styles";

const TEST_KEY = process.env.NEXT_PUBLIC_TEST_KEY || "1285";

// ─── Types ───────────────────────────────────────────────────────────────────
type Org = { id: string; name: string; slug: string; status: string };
type Drive = { id: string; title: string; role: string | null; status: string; _count: { applications: number } };
type Candidate = {
    id: string; fullName: string; email: string; interviewStatus: string | null;
    aiScore: number | null;
    interview: { status: string; isTest: boolean; completedAt: string | null } | null;
};
type TranscriptLine = { speaker: "AI" | "Human"; text: string; ts: number };

// ─── Verification modal ───────────────────────────────────────────────────────
function KeyVerification({ onVerified }: { onVerified: () => void }) {
    const [inputKey, setInputKey] = useState("");
    const [error, setError] = useState(false);
    const [locked, setLocked] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (inputKey === TEST_KEY) {
            onVerified();
        } else {
            setError(true);
            setInputKey("");
            setLocked(true);
            setTimeout(() => setLocked(false), 2000);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(180deg,#fff 0%,#FAFAFC 45%,#F5F3FF 100%)" }}>
            <div className="w-full max-w-sm bg-white rounded-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                style={{ border: "1px solid #E9E7FF", boxShadow: "0 25px 60px rgba(124,58,237,0.12)" }}>
                <div className="px-6 py-8">
                    <div className="flex justify-center mb-6">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                            style={{ background: "linear-gradient(135deg,#8B5CF6,#3B82F6)" }}>
                            <Settings2 className="w-7 h-7 text-white" />
                        </div>
                    </div>
                    <h1 className="text-xl font-semibold text-gray-900 text-center mb-2">Developer Sandbox</h1>
                    <p className="text-sm text-gray-400 text-center mb-6">Enter the access key to begin testing</p>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <input
                                type="password"
                                value={inputKey}
                                onChange={(e) => { setInputKey(e.target.value); setError(false); }}
                                disabled={locked}
                                placeholder="Enter test key"
                                autoFocus
                                className="w-full h-11 px-4 rounded-xl text-sm outline-none transition-all"
                                style={{
                                    border: error ? "1px solid #FCA5A5" : "1px solid #E9E7FF",
                                    background: error ? "#FEF2F2" : "#F9FAFB",
                                }}
                            />
                        </div>
                        {error && (
                            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2.5 rounded-xl border border-red-200">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" /> Invalid key.
                            </div>
                        )}
                        <button type="submit" disabled={locked || !inputKey.trim()}
                            className="w-full btn-shimmer h-11 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition-all"
                            style={{ background: "linear-gradient(135deg,#8B5CF6,#3B82F6)", boxShadow: "0 4px 14px rgba(124,58,237,0.3)" }}>
                            Verify Access
                        </button>
                    </form>
                    <div className="mt-6 pt-6 border-t border-[#E9E7FF]">
                        <button
                            onClick={() => window.location.href = "/"}
                            className="w-full h-10 rounded-xl text-sm font-semibold text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-all"
                        >
                            Back to Home
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Live Transcript Hook ────────────────────────────────────────────────────
function useLiveTranscript() {
    const segments = useTranscriptions();
    // Track per-segment first-seen timestamps so they don't all get the same ts
    const seenTs = useRef<Map<string, number>>(new Map());
    const [lines, setLines] = useState<TranscriptLine[]>([]);

    useEffect(() => {
        if (!segments?.length) return;
        const now = Date.now();
        const newLines: TranscriptLine[] = segments.map((s: TranscriptionSegment, idx: number) => {
            const identity: string = (s as any).participantInfo?.identity || "";
            const isCandidate = identity.startsWith("candidate_");
            // Use a stable key per segment; fall back to idx
            const key = (s as any).streamInfo?.id || (s as any).id || `${identity}-${idx}`;
            if (!seenTs.current.has(key)) seenTs.current.set(key, now + idx);
            return {
                speaker: isCandidate ? "Human" : "AI",
                text: s.text || "",
                ts: seenTs.current.get(key)!,
            };
        });
        setLines(newLines);
    }, [segments]);

    return lines;
}

type TestEvent = {
    timestamp: number;
    type: "response_received" | "eval_start" | "eval_done" | "probe" | "saturate" | "move_on" | "llm_generating" | "llm_done" | "signal_fired" | "session_ended";
    message: string;
    data?: Record<string, unknown>;
};

// ─── Simulation Viewer ──────────────────────────────────────────────────────────
function SimulationViewer({ 
    lines, events, elapsedSeconds, isConnected, timerStarted, sessionEnded
}: {
    lines: TranscriptLine[]; events: TestEvent[]; elapsedSeconds: number; isConnected: boolean; timerStarted: boolean; sessionEnded: boolean;
}) {
    const transcriptEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [lines]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-[#FAFAFC] border border-[#E9E7FF] rounded-2xl p-4 shadow-sm relative min-h-0">
            {/* Header / Status Bar */}
            <div className="flex items-center justify-between shrink-0 mb-4 px-2">
                <div className="flex items-center gap-3">
                    <div className="bg-white/80 rounded-full p-0.5 shadow-sm border border-[#E9E7FF]">
                        <AuraVisualizer state={isConnected ? "listening" : "idle"} color={[0.49, 0.23, 0.93]} className="w-12 h-12" />
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur-sm border border-[#E9E7FF] shadow-sm">
                        <div className={cn("w-2 h-2 rounded-full", isConnected ? "bg-violet-500 animate-pulse" : "bg-gray-400")} />
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                            {isConnected ? "Connected" : "Disconnected"}
                        </span>
                    </div>
                </div>

                {/* Timer Badge */}
                {timerStarted && (
                    <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/80 backdrop-blur-sm border border-[#E9E7FF] shadow-sm">
                        {sessionEnded ? (
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                        ) : (
                            <div className={cn("w-2 h-2 rounded-full", isConnected ? "bg-violet-500 animate-pulse" : "bg-gray-400")} />
                        )}
                        <span className="font-mono text-sm font-bold text-gray-900">
                            {formatTime(elapsedSeconds)} {sessionEnded && <span className="text-red-500 ml-1 text-[10px] uppercase tracking-wider">Ended</span>}
                        </span>
                    </div>
                )}
            </div>

            {/* Transcript Area */}
            <div className="flex-1 overflow-y-auto bg-white border border-[#E9E7FF] rounded-xl p-5 md:p-6 space-y-6 min-h-0 custom-scrollbar shadow-sm">
                {lines.length === 0 && events.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-400 text-sm font-medium">
                        Listening for conversation...
                    </div>
                ) : (
                    <>
                        {(() => {
                            // Compute which events are "attached" (between prev human and each AI bubble).
                            // Each event can only attach to ONE AI line -- without excluding
                            // attachedEventIds from the filter, consecutive AI lines sharing the same
                            // prevHumanTs (e.g. repeated inactivity nudges with no candidate reply in
                            // between) all re-match the same old event window, so the same
                            // signal_fired/eval_done/probe block appeared to "re-fire" under every
                            // nudge even though the backend only logged it once.
                            const attachedEventIds = new Set<number>();
                            const lineEventMap: TestEvent[][] = lines.map((line, i) => {
                                if (line.speaker !== "AI" || i === 0) return [];
                                let prevHumanTs = 0;
                                for (let j = i - 1; j >= 0; j--) {
                                    if (lines[j].speaker === "Human") { prevHumanTs = lines[j].ts; break; }
                                }
                                const evs = events.filter(e =>
                                    e.timestamp >= prevHumanTs && e.timestamp <= line.ts && !attachedEventIds.has(e.timestamp)
                                );
                                evs.forEach(e => attachedEventIds.add(e.timestamp));
                                return evs;
                            });
                            // Unattached events = visible in real-time while pipeline is running
                            const lastLineTs = lines.length ? lines[lines.length - 1].ts : 0;
                            const pendingEvents = events.filter(e => e.timestamp > lastLineTs && !attachedEventIds.has(e.timestamp));

                            const eventColor = (type: string) =>
                                type === "response_received" ? "text-emerald-600" :
                                type === "eval_start" ? "text-blue-500" :
                                type === "eval_done" ? "text-blue-700" :
                                type === "probe" ? "text-amber-600" :
                                type === "saturate" ? "text-orange-600" :
                                type === "move_on" ? "text-purple-600" :
                                type === "signal_fired" ? "text-red-600" :
                                type === "session_ended" ? "text-red-500 bg-red-50" :
                                type === "llm_generating" ? "text-cyan-600" : "text-cyan-700";

                            const baselineTs = lines.length > 0 ? lines[0].ts : (events.length > 0 ? events[0].timestamp : Date.now());
                            const fmtTs = (ts: number) => {
                                const elapsedMs = Math.max(0, ts - baselineTs);
                                const totalSeconds = Math.floor(elapsedMs / 1000);
                                const mins = Math.floor(totalSeconds / 60);
                                const secs = totalSeconds % 60;
                                return `${mins.toString().padStart(2,"0")}:${secs.toString().padStart(2,"0")}`;
                            };

                            const EventRow = ({ event, j, prefix }: { event: TestEvent; j: number; prefix: string }) => (
                                <div key={`${prefix}-${j}`} className="flex items-center gap-2 px-2 py-1 bg-gray-50/80 rounded-lg border border-gray-100 text-[9px] font-mono">
                                    <span className={cn("font-bold flex-shrink-0", eventColor(event.type))}>{event.type}</span>
                                    <span className="text-gray-400 flex-1 truncate">
                                        {event.message}
                                        {event.data?.reason ? <span className="text-gray-500 ml-1">- Reason: {String(event.data.reason)}</span> : null}
                                    </span>
                                    <span className="text-gray-300 flex-shrink-0">{fmtTs(event.timestamp)}</span>
                                </div>
                            );

                            return (
                                <>
                                    {lines.map((line, i) => {
                                        const isAI = line.speaker === "AI";
                                        const msgEvents = lineEventMap[i] || [];
                                        return (
                                            <div key={`line-${i}`} className={cn("flex flex-col", isAI ? "items-start" : "items-end")}>
                                                {/* Pipeline logs above AI bubble */}
                                                {isAI && msgEvents.length > 0 && (
                                                    <div className="mb-2 w-[85%] space-y-1">
                                                        {msgEvents.map((ev, j) => <EventRow key={j} event={ev} j={j} prefix={`att-${i}`} />)}
                                                    </div>
                                                )}
                                                <div className={cn("flex flex-col max-w-[85%]", isAI ? "items-start" : "items-end")}>
                                                    <div className="flex items-center gap-2 mb-1 mx-1">
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                                            {isAI ? "Interviewer" : "Human"}
                                                        </span>
                                                        <span className="text-[10px] font-mono text-gray-300">{fmtTs(line.ts)}</span>
                                                    </div>
                                                    <div className={cn(
                                                        "px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed shadow-sm",
                                                        isAI
                                                            ? "bg-violet-50 text-violet-900 border border-violet-100 rounded-tl-sm"
                                                            : "bg-[#F3F4F6] text-gray-800 border border-gray-200/60 rounded-tr-sm"
                                                    )}>
                                                        {line.text}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {/* Live pending events (pipeline running, AI not spoken yet) */}
                                    {pendingEvents.length > 0 && (
                                        <div className="space-y-1 pl-1">
                                            {pendingEvents.map((ev, j) => <EventRow key={j} event={ev} j={j} prefix="pending" />)}
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </>
                )}
                <div ref={transcriptEndRef} />
            </div>
        </div>
    );
}

// ─── Interview Room ──────────────────────────────────────────────────────────
function InterviewRoom({ applicationId, onUpdate, timerStartedAtRef }: { applicationId: string; onUpdate: (state: any) => void; timerStartedAtRef: React.MutableRefObject<number | null> }) {
    const connectionState = useConnectionState();
    const lines = useLiveTranscript();
    // timerStartedAtRef is owned by the parent (SimulationTestPage), which stays
    // mounted across LiveKitRoom reconnects. InterviewRoom itself gets unmounted and
    // remounted fresh whenever the headless <LiveKitRoom> reconnects (isActive flips),
    // which previously reset local elapsedSeconds/timerStarted state back to 0 mid-session
    // -- the "timer keeps resetting" bug. Deriving elapsedSeconds from a ref-held start
    // timestamp survives that remount.
    const [timerStarted, setTimerStarted] = useState(timerStartedAtRef.current !== null);
    const [elapsedSeconds, setElapsedSeconds] = useState(
        timerStartedAtRef.current !== null ? Math.floor((Date.now() - timerStartedAtRef.current) / 1000) : 0
    );
    const [events, setEvents] = useState<TestEvent[]>([]);

    useEffect(() => {
        if (timerStartedAtRef.current === null && lines.some(l => l.speaker === "AI")) {
            timerStartedAtRef.current = Date.now();
            setTimerStarted(true);
        }
    }, [lines, timerStartedAtRef]);

    const hasEnded = events.some(e => e.type === "session_ended");

    useEffect(() => {
        if (!timerStarted || hasEnded) return;
        const interval = setInterval(() => {
            if (timerStartedAtRef.current !== null) {
                setElapsedSeconds(Math.floor((Date.now() - timerStartedAtRef.current) / 1000));
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [timerStarted, hasEnded, timerStartedAtRef]);

    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/test/events?applicationId=${applicationId}`, { cache: "no-store" });
                if (res.ok) {
                    const data = await res.json();
                    setEvents(data.events || []);
                }
            } catch (e) {
                console.error("[EVENTS_POLL]", e);
            }
        }, 500);
        return () => clearInterval(interval);
    }, [applicationId]);

    const isConnected = connectionState === ConnectionState.Connected;

    useEffect(() => {
        onUpdate({ lines, events, elapsedSeconds, timerStarted, isConnected, sessionEnded: hasEnded });
    }, [lines, events, elapsedSeconds, timerStarted, isConnected, hasEnded, onUpdate]);

    // We just return the audio renderer; UI is handled by parent now.
    return <RoomAudioRenderer />;
}

// ─── Main page ───────────────────────────────────────────────────────────────
function TestPageContent() {
    const { logout } = useAuth();
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    
    const [orgs, setOrgs] = useState<Org[]>([]);
    const [drives, setDrives] = useState<Drive[]>([]);
    const [candidates, setCandidates] = useState<Candidate[]>([]);

    const [selectedOrg, setSelectedOrg] = useState<Org | null>(null);
    const [selectedDrive, setSelectedDrive] = useState<Drive | null>(null);
    const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);

    const [loadingOrgs, setLoadingOrgs] = useState(true);
    const [loadingDrives, setLoadingDrives] = useState(false);
    const [loadingCandidates, setLoadingCandidates] = useState(false);

    const [enableReport, setEnableReport] = useState(false);
    const [starting, setStarting] = useState(false);
    const [livekitToken, setLivekitToken] = useState<string | null>(null);
    const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [displayState, setDisplayState] = useState({
        lines: [] as TranscriptLine[],
        events: [] as TestEvent[],
        elapsedSeconds: 0,
        timerStarted: false,
        isConnected: false,
        sessionEnded: false,
    });
    // Owned here (parent survives LiveKitRoom/InterviewRoom remounts on reconnect) so
    // the interview timer keeps counting from its real start instead of resetting to 0.
    const timerStartedAtRef = useRef<number | null>(null);

    const handleUpdate = useCallback((state: any) => {
        setDisplayState(state);
    }, []);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/test/orgs?key=${TEST_KEY}`)
            .then(r => r.json())
            .then(d => {
                if (!cancelled) {
                    setOrgs(d.orgs || []);
                    console.log("[TEST_ORGS] Loaded orgs:", d.orgs?.length || 0);
                    setLoadingOrgs(false);
                }
            })
            .catch(e => {
                console.error("[TEST_ORGS] Error:", e);
                if (!cancelled) setLoadingOrgs(false);
            });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!selectedOrg) { setDrives([]); setSelectedDrive(null); return; }
        setLoadingDrives(true);
        fetch(`/api/test/drives?key=${TEST_KEY}&orgId=${selectedOrg.id}`).then(r => r.json()).then(d => {
            setDrives(d.drives || []); setLoadingDrives(false);
        }).catch(() => setLoadingDrives(false));
    }, [selectedOrg]);

    useEffect(() => {
        if (!selectedDrive) { setCandidates([]); setSelectedCandidate(null); return; }
        setLoadingCandidates(true);
        fetch(`/api/test/candidates?key=${TEST_KEY}&driveId=${selectedDrive.id}`).then(r => r.json()).then(d => {
            setCandidates(d.candidates || []); setLoadingCandidates(false);
        }).catch(() => setLoadingCandidates(false));
    }, [selectedDrive]);

    const handleStart = async () => {
        if (!selectedCandidate) return;
        setStarting(true);
        setError(null);
        // Reset display state immediately to prepare for new session
        setDisplayState({
            lines: [],
            events: [],
            elapsedSeconds: 0,
            timerStarted: false,
            isConnected: false
        });
        timerStartedAtRef.current = null;

        try {
            // Clear backend events for this candidate
            await fetch(`/api/test/events?applicationId=${selectedCandidate.id}`, { method: "DELETE" });
            const res = await fetch("/api/test/token", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ applicationId: selectedCandidate.id, skipReport: !enableReport, key: TEST_KEY }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to start");
            setLivekitToken(data.token);
            setLivekitUrl(data.url);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Unknown error");
        } finally {
            setStarting(false);
        }
    };

    const handleEnd = useCallback(() => {
        setLivekitToken(null);
        setLivekitUrl(null);
        toast.success(enableReport ? "Simulation ended. Eval report generation triggered." : "Simulation ended. Report skipped.");
    }, [enableReport]);

    const handleLogout = async () => {
        setIsLoggingOut(true);
        try {
            await logout();
            window.location.href = "/test";
        } catch {
            setIsLoggingOut(false);
            setShowLogoutConfirm(false);
        }
    };

    const isActive = !!(livekitToken && livekitUrl);

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-white" style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FAFAFC 45%, #F5F3FF 100%)" }}>
            
            {/* LOGOUT CONFIRMATION MODAL */}
            {showLogoutConfirm && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
                    <div
                        className="absolute inset-0 bg-gray-900/30 backdrop-blur-sm"
                        onClick={() => !isLoggingOut && setShowLogoutConfirm(false)}
                    />
                    <div
                        className="relative w-full max-w-sm bg-white rounded-2xl overflow-hidden"
                        style={{ border: "1px solid #E9E7FF", boxShadow: "0 25px 60px rgba(124,58,237,0.12)" }}
                    >
                        <div className="p-8 text-center space-y-5">
                            <div className="flex justify-center">
                                <div className="h-14 w-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center">
                                    <ShieldAlert className="h-7 w-7" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <h2 className="text-xl font-bold text-gray-900 tracking-tight">Sign Out?</h2>
                                <p className="text-sm text-gray-500 leading-relaxed">
                                    You are about to end your session. Any ongoing simulation will be interrupted.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-3 pt-1">
                                <button
                                    onClick={() => setShowLogoutConfirm(false)}
                                    disabled={isLoggingOut}
                                    className="h-11 bg-gray-50 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-100 transition-all border border-gray-100"
                                >
                                    Stay Active
                                </button>
                                <button
                                    onClick={handleLogout}
                                    disabled={isLoggingOut}
                                    className="h-11 text-white rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
                                    style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" }}
                                >
                                    {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign Out"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TOP NAVIGATION BAR */}
            <div className="w-full flex items-center justify-between border-b bg-white/90 backdrop-blur-xl border-[#F0EEF8] shadow-sm z-[100] shrink-0 px-6 py-3 min-h-[64px]">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3 pr-6 border-r border-[#F0EEF8]/80">
                        <img src="/sreevaailogo2.png" alt="SreevaAI" className="w-8 h-8 object-contain rounded-lg" />
                        <div className="hidden sm:block">
                            <h1 className="text-[15px] font-bold text-gray-900 tracking-tight">SreevaAI</h1>
                            <p className="text-[11px] font-semibold text-violet-600 tracking-wider uppercase mt-0.5">Simulation</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="w-[180px]">
                            <Select 
                                value={selectedOrg?.id || ""} 
                                onValueChange={val => {
                                    const org = orgs.find(o => o.id === val);
                                    if (org) {
                                        setSelectedOrg(org);
                                        setSelectedDrive(null);
                                        setSelectedCandidate(null);
                                    }
                                }}
                                disabled={loadingOrgs || orgs.length === 0 || isActive}
                            >
                                <SelectTrigger className="w-full h-9 bg-white border border-gray-200 rounded-xl text-[12px] font-semibold text-gray-700 shadow-sm focus:ring-violet-500 transition-all">
                                    <SelectValue placeholder="Select Organization" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-[#E9E7FF] shadow-xl">
                                    {orgs.map(o => <SelectItem key={o.id} value={o.id} className="text-[12px] font-medium py-2">{o.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="w-[180px]">
                            <Select 
                                value={selectedDrive?.id || ""} 
                                onValueChange={val => {
                                    const drive = drives.find(d => d.id === val);
                                    if (drive) {
                                        setSelectedDrive(drive);
                                        setSelectedCandidate(null);
                                    }
                                }}
                                disabled={!selectedOrg || loadingDrives || drives.length === 0 || isActive}
                            >
                                <SelectTrigger className="w-full h-9 bg-white border border-gray-200 rounded-xl text-[12px] font-semibold text-gray-700 shadow-sm focus:ring-violet-500 transition-all">
                                    <SelectValue placeholder="Select Drive" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-[#E9E7FF] shadow-xl">
                                    {drives.map(d => <SelectItem key={d.id} value={d.id} className="text-[12px] font-medium py-2">{d.title}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="w-[200px]">
                            <Select 
                                value={selectedCandidate?.id || ""} 
                                onValueChange={val => {
                                    const candidate = candidates.find(c => c.id === val);
                                    if (candidate) setSelectedCandidate(candidate);
                                }}
                                disabled={!selectedDrive || loadingCandidates || candidates.length === 0 || isActive}
                            >
                                <SelectTrigger className="w-full h-9 bg-white border border-gray-200 rounded-xl text-[12px] font-semibold text-gray-700 shadow-sm focus:ring-violet-500 transition-all">
                                    <SelectValue placeholder="Select Candidate" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-[#E9E7FF] shadow-xl">
                                    {candidates.map(a => <SelectItem key={a.id} value={a.id} className="text-[12px] font-medium py-2">{a.fullName}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-5">
                    <div className="flex items-center gap-4 bg-white p-1.5 px-3 rounded-2xl shadow-sm border border-gray-200">
                        <button
                            onClick={() => setEnableReport(!enableReport)}
                            className="flex items-center gap-2 cursor-pointer group transition-all hover:opacity-80 disabled:opacity-50"
                            disabled={isActive}>
                            <span className="text-[12px] font-semibold text-gray-600 group-hover:text-gray-900 transition-colors">Enable Report Eval</span>
                            <div className="flex items-center transition-colors duration-300" style={{ color: enableReport ? "#10B981" : "#EF4444" }}>
                                {enableReport ? <ToggleRight className="w-6 h-6" strokeWidth={1.5} /> : <ToggleLeft className="w-6 h-6" strokeWidth={1.5} />}
                            </div>
                        </button>
                        
                        <div className="w-px h-5 bg-gray-200"></div>

                        {!isActive ? (
                            <button 
                                onClick={handleStart}
                                disabled={!selectedCandidate || starting}
                                className="inline-flex items-center gap-2 h-8 px-4 rounded-xl text-[12px] font-bold text-white transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ background: "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)" }}
                            >
                                {starting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                                {starting ? "Starting..." : "Start"}
                            </button>
                        ) : (
                            <button 
                                onClick={handleEnd}
                                className="inline-flex items-center gap-2 h-8 px-4 rounded-xl text-[12px] font-bold text-white bg-red-500 hover:bg-red-600 transition-colors shadow-sm"
                            >
                                <StopCircle className="w-3.5 h-3.5 fill-current" />
                                End
                            </button>
                        )}
                    </div>
                    
                    <button
                        onClick={() => setShowLogoutConfirm(true)}
                        className="flex items-center justify-center w-8 h-8 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all border border-transparent hover:border-red-100"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* MAIN TRANSCRIPT AREA */}
            <div className="flex-1 flex flex-col min-w-0 bg-white/40 overflow-hidden items-center p-4">
                <div className="w-full h-full flex-1 flex flex-col min-h-0 relative">
                    {error && (
                        <div className="mb-4 flex items-start gap-2.5 rounded-2xl px-5 py-3 text-sm text-red-700 bg-red-50 border border-red-100 shadow-sm animate-in fade-in">
                            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            {error}
                        </div>
                    )}

                    {/* Persistent UI Area */}
                    <SimulationViewer 
                        lines={displayState.lines} 
                        events={displayState.events} 
                        elapsedSeconds={displayState.elapsedSeconds} 
                        isConnected={displayState.isConnected} 
                        timerStarted={displayState.timerStarted} 
                        sessionEnded={displayState.sessionEnded}
                    />
                </div>

                {/* Headless LiveKit Connection */}
                {isActive && (
                    <div className="hidden">
                        <LiveKitRoom
                            token={livekitToken!}
                            serverUrl={livekitUrl!}
                            connect={true}
                            audio={true}
                            video={false}
                            onDisconnected={handleEnd}
                        >
                            <InterviewRoom applicationId={selectedCandidate?.id || ""} onUpdate={handleUpdate} timerStartedAtRef={timerStartedAtRef} />
                        </LiveKitRoom>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Export ──────────────────────────────────────────────────────────────────
export default function TestPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-gray-50/50">
                <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
            </div>
        }>
            <TestPageWrapper />
        </Suspense>
    );
}

function TestPageWrapper() {
    const [verified, setVerified] = useState(false);

    if (!verified) {
        return <KeyVerification onVerified={() => setVerified(true)} />;
    }

    return <TestPageContent />;
}
