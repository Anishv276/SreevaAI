"use client";
import { Suspense, useState, use, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Maximize, Sparkles, Mic2, ShieldCheck, ShieldAlert, Zap, ChevronRight, Send, Loader2, Video, VideoOff, MicOff, PhoneOff, CheckCircle2, ArrowRight, Camera, Mic, AlertCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HardwareCheck } from "@/components/careers/interview/HardwareCheck";
import {
  LiveKitRoom,
  useLocalParticipant,
  useTracks,
  AudioVisualizer,
  TrackReference,
  RoomAudioRenderer,
  ControlBar,
  useParticipantInfo,
  useConnectionState,
  useRemoteParticipants,
  useRoomContext,
  useTranscriptions,
  useVoiceAssistant,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track, RoomEvent } from "livekit-client";

interface InterviewPageProps {
    params: Promise<{ id: string }>;
}

const INTERVIEW_DURATION_SECONDS = 15 * 60;

function formatDuration(totalSeconds: number) {
    const safe = Math.max(0, totalSeconds);
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

type MediaTrackCarrier = {
    publication?: { track?: { mediaStreamTrack?: MediaStreamTrack } };
    track?: { mediaStreamTrack?: MediaStreamTrack };
};

type AttachableTrack = {
    sid?: string;
    attach: (element: HTMLMediaElement) => void;
    detach: (element: HTMLMediaElement) => void;
};

// LiveKit TextStreamData type from @livekit/components-core
// { text: string, participantInfo: { identity: string }, streamInfo: TextStreamInfo }

/** Typewriter component: streams text character-by-character whenever text changes. */
const StreamingText = memo(function StreamingText({ text, className }: { text: string; className?: string }) {
    const [shown, setShown] = useState("");
    const shownRef = useRef("");
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const targetRef = useRef(text);

    useEffect(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        targetRef.current = text;

        // If new text extends current shown text, continue from where we are.
        // Otherwise (different text or first render), reset and animate from start.
        const startPos = text.startsWith(shownRef.current) ? shownRef.current.length : 0;

        if (startPos === 0) {
            shownRef.current = "";
            setShown("");
        }

        let pos = startPos;
        const step = () => {
            if (targetRef.current !== text) return; // target changed mid-flight, abort
            pos++;
            const next = text.slice(0, pos);
            shownRef.current = next;
            setShown(next);
            if (pos < text.length) {
                timerRef.current = setTimeout(step, 18);
            }
        };

        if (pos < text.length) {
            timerRef.current = setTimeout(step, 18);
        }

        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [text]);

    return <p className={className}>{shown}</p>;
});

function getMediaStreamTrack(trackRef: TrackReference | null): MediaStreamTrack | null {
    if (!trackRef) return null;
    const carrier = trackRef as unknown as MediaTrackCarrier;
    return carrier.publication?.track?.mediaStreamTrack || carrier.track?.mediaStreamTrack || null;
}

function getAttachableTrack(trackRef: TrackReference): AttachableTrack | null {
    const candidate = (
        trackRef.publication?.track ||
        (trackRef as unknown as { track?: AttachableTrack }).track ||
        null
    ) as AttachableTrack | null;

    if (!candidate || typeof candidate.attach !== "function" || typeof candidate.detach !== "function") {
        return null;
    }

    return candidate;
}

function InterviewContent({ id, params }: { id: string, params: Promise<{ id: string }> }) {
    const [phase, setPhase] = useState<"check" | "launching" | "interview" | "finalizing" | "completed">("check");
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [token, setToken] = useState<string | null>(null);
    const [serverUrl, setServerUrl] = useState<string | null>(null);
    const [isJoining, setIsJoining] = useState(false);
    const [joinError, setJoinError] = useState<string | null>(null);
    const [shouldConnect, setShouldConnect] = useState(false);
    const [interviewEndsAt, setInterviewEndsAt] = useState<number | null>(null);
    const [sessionDuration, setSessionDuration] = useState(INTERVIEW_DURATION_SECONDS);
    const [remainingSeconds, setRemainingSeconds] = useState(INTERVIEW_DURATION_SECONDS);
    const [timerExpired, setTimerExpired] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const allowFullscreenExitRef = useRef(false);
    const launchIntervalRef = useRef<number | null>(null);
    const agentReadyCommittedRef = useRef(false);
    const launchStartedAtRef = useRef<number | null>(null);
    const lkRoomRef = useRef<any>(null);
    const readySignalSentFromParentRef = useRef(false);


    const [isAgentReady, setIsAgentReady] = useState(false);
    const [agentReadyLatencyMs, setAgentReadyLatencyMs] = useState<number | null>(null);
    const [launchTimeoutCheck, setLaunchTimeoutCheck] = useState(0);

    // Countdown ticker — purely visual, counts up for display purposes
    useEffect(() => {
        if (phase !== "launching") return;
        setLaunchTimeoutCheck(0);
        const timer = window.setInterval(() => {
            setLaunchTimeoutCheck((prev) => prev + 1);
        }, 1000);
        return () => window.clearInterval(timer);
    }, [phase]);

    // Hard timeout: if agent never becomes ready within 45s, go back to check with error
    useEffect(() => {
        if (phase !== "launching") return;
        if (launchTimeoutCheck >= 45 && !agentReadyCommittedRef.current) {
            setJoinError("AI interviewer didn't respond in time. Please reload the website and try again.");
            agentReadyCommittedRef.current = false;
            setIsAgentReady(false);
            setAgentReadyLatencyMs(null);
            // Reset connection state so the next attempt creates a fresh dispatch
            setToken(null);
            setServerUrl(null);
            setShouldConnect(false);
            // Clear the sessionStorage cache so ensureWarmConnection re-fetches
            try { sessionStorage.removeItem(`lk_token_${id}`); } catch { }
            setPhase("check");
        }
    }, [launchTimeoutCheck, phase, id]);

    // Lifecycle: Immediate worker shutdown if user exits during hardware check
    useEffect(() => {
        const handleExit = () => {
            // Strictly only during 'check' phase as requested.
            // We use fetch with keepalive to ensure the request finishes after the tab is actually closed.
            if (phase === "check") {
                fetch("/api/interview/shutdown", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ applicationId: id }),
                    keepalive: true,
                }).catch(() => {});
            }
        };

        window.addEventListener("pagehide", handleExit);

        return () => {
            window.removeEventListener("pagehide", handleExit);
        };
    }, [id, phase]);

    // Phase transition — switch immediately once agent is ready
    useEffect(() => {
        if (phase !== "launching") return;
        if (!isAgentReady || agentReadyCommittedRef.current) return;

        agentReadyCommittedRef.current = true;
        setPhase("interview");
    }, [phase, isAgentReady]);

    // Parent-level ready signal fallback to guarantee backend receives user_ready.
    useEffect(() => {
        if (phase !== "interview") {
            readySignalSentFromParentRef.current = false;
            return;
        }
        if (readySignalSentFromParentRef.current) return;

        readySignalSentFromParentRef.current = true;
        const encoder = new TextEncoder();
        let cancelled = false;
        let attempts = 0;

        const sendReady = async () => {
            if (cancelled) return;
            const room = lkRoomRef.current;
            const localParticipant = room?.localParticipant;
            if (!localParticipant) {
                return;
            }
            attempts += 1;
            const data = encoder.encode(
                JSON.stringify({ type: "user_ready", timestamp: Date.now(), source: "parent", attempt: attempts })
            );
            try {
                await localParticipant.publishData(data, { reliable: true });
                console.log("SENT READY SIGNAL (parent)", { attempt: attempts });
            } catch {
                try {
                    await localParticipant.publishData(data, true);
                    console.log("SENT READY SIGNAL (parent legacy)", { attempt: attempts });
                } catch (err) {
                    console.warn("[READY][parent] failed to publish user_ready", err);
                }
            }
        };

        void sendReady();
        const retryTimer = window.setInterval(() => {
            if (attempts >= 6) {
                window.clearInterval(retryTimer);
                return;
            }
            void sendReady();
        }, 700);

        return () => {
            cancelled = true;
            window.clearInterval(retryTimer);
        };
    }, [phase]);

    const isExitUnlocked = phase === "completed" || timerExpired;
    const isInterviewLocked = phase === "interview" && !isExitUnlocked;

    const stopTracks = (stream: MediaStream | null) => {
        if (!stream) return;
        stream.getTracks().forEach((track) => track.stop());
    };

    const handleRemoteAgentAudioTrack = useCallback((track: MediaStreamTrack | null) => {
        // Handled by child component
    }, []);




    const tokenRequestRef = useRef<Promise<boolean> | null>(null);

    const ensureWarmConnection = useCallback(async (): Promise<boolean> => {
        if (token && serverUrl) {
            return true;
        }

        const cacheKey = `lk_token_${id}`;
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            try {
                const parsed = JSON.parse(cached) as { token?: string; url?: string; duration?: number; timestamp?: number };
                // Only reuse cache if it's less than 5 minutes old
                if (parsed.token && parsed.url && parsed.timestamp && (Date.now() - parsed.timestamp < 5 * 60 * 1000)) {
                    setToken(parsed.token);
                    setServerUrl(parsed.url);
                    if (typeof parsed.duration === "number" && parsed.duration > 0) {
                        setSessionDuration(parsed.duration);
                        setRemainingSeconds(parsed.duration);
                    }
                    console.log("Warm connection restored from cache.");
                    return true;
                } else {
                    sessionStorage.removeItem(cacheKey);
                }
            } catch {
                sessionStorage.removeItem(cacheKey);
            }
        }

        if (tokenRequestRef.current) {
            return tokenRequestRef.current;
        }

        tokenRequestRef.current = (async () => {
            try {
                const res = await fetch("/api/interview/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        applicationId: id,
                        participantName: "Candidate",
                    }),
                });

                const data = await res.json();
                if (res.ok && data.token && data.serverUrl) {
                    sessionStorage.setItem(cacheKey, JSON.stringify({
                        token: data.token,
                        url: data.serverUrl,
                        duration: data.duration,
                        timestamp: Date.now()
                    }));

                    setToken(data.token);
                    setServerUrl(data.serverUrl);
                    if (typeof data.duration === "number" && data.duration > 0) {
                        setSessionDuration(data.duration);
                        setRemainingSeconds(data.duration);
                    }
                    console.log("Warm connection preloaded.");
                    return true;
                }

                console.error("Warm connection failed:", data?.error || "Invalid token payload");
                return false;
            } catch (err) {
                console.error("Warm connection request failed:", err);
                return false;
            } finally {
                tokenRequestRef.current = null;
            }
        })();

        return tokenRequestRef.current;
    }, [id, token, serverUrl]);

    const requestFullscreenMode = async () => {
        try {
            if (containerRef.current?.requestFullscreen) {
                await containerRef.current.requestFullscreen();
                setIsFullscreen(true);
            }
        } catch (err) {
            console.error("Fullscreen failed:", err);
        }
    };

    // Dispatch the agent as early as possible — on initial page load,
    // so the worker has maximum time to initialize while the user completes
    // the hardware check. ensureWarmConnection is idempotent (deduped + cached).
    useEffect(() => {
        ensureWarmConnection().catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally run once on mount

    // Also retry if the user somehow reaches "check" phase without a token yet
    useEffect(() => {
        if (phase === "check") {
            ensureWarmConnection().catch(() => {});
        }
    }, [phase, ensureWarmConnection]);

    // Token is fetched on demand or pre-warmed.

    const handleAgentReady = useCallback((ready: boolean) => {
        setIsAgentReady(ready);

        if (!ready || launchStartedAtRef.current === null) {
            return;
        }

        setAgentReadyLatencyMs((prev) => {
            if (prev !== null) return prev;
            return Math.max(0, Math.round(performance.now() - launchStartedAtRef.current!));
        });
    }, []);

    const handleHardwareComplete = async () => {
        setIsJoining(true);
        setJoinError(null);

        await requestFullscreenMode();

        try {
            const isWarmReady = await ensureWarmConnection();
            if (!isWarmReady) {
                throw new Error("Interview connection could not be prepared. Please retry.");
            }

            if (!interviewEndsAt) {
                setInterviewEndsAt(Date.now() + sessionDuration * 1000);
                setRemainingSeconds(sessionDuration);
                setTimerExpired(false);
            }

            setShouldConnect(true);

            // Unlock audio context on user gesture — must happen here, not in useEffect
            if (lkRoomRef.current) {
                lkRoomRef.current.startAudio().catch(() => {});
            }

            // If agent is already ready, go directly to interview.
            agentReadyCommittedRef.current = false;
            launchStartedAtRef.current = performance.now();
            setAgentReadyLatencyMs(null);
            setPhase(isAgentReady ? "interview" : "launching");

        } catch (err) {
            console.error("Phase transition failed:", err);
            setJoinError(err instanceof Error ? err.message : "Unable to start interview.");
            // Reset connection so a fresh dispatch is created on retry
            setToken(null);
            setServerUrl(null);
            setShouldConnect(false);
            // Clear the sessionStorage cache so ensureWarmConnection re-fetches
            try { sessionStorage.removeItem(`lk_token_${id}`); } catch { }
            setPhase("check");
        } finally {
            setIsJoining(false);
        }
    };

    useEffect(() => {
        return () => {
            if (launchIntervalRef.current) {
                window.clearTimeout(launchIntervalRef.current);
                launchIntervalRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const handleFSChange = () => {
            const inFullscreen = !!document.fullscreenElement;
            setIsFullscreen(inFullscreen);

            if (phase === "completed") return;

            if (!inFullscreen && isInterviewLocked && !allowFullscreenExitRef.current) {
                containerRef.current?.requestFullscreen?.().catch(() => undefined);
            }

            if (allowFullscreenExitRef.current) {
                allowFullscreenExitRef.current = false;
            }
        };
        document.addEventListener("fullscreenchange", handleFSChange);
        return () => document.removeEventListener("fullscreenchange", handleFSChange);
    }, [isInterviewLocked, phase]);

    useEffect(() => {
        if (!isInterviewLocked) return;

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "Interview in progress. Use Finish Interview to exit.";
        };

        const handlePopState = () => {
            window.history.pushState({ interviewLocked: true }, "", window.location.href);
        };

        window.history.pushState({ interviewLocked: true }, "", window.location.href);
        window.addEventListener("beforeunload", handleBeforeUnload);
        window.addEventListener("popstate", handlePopState);

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
            window.removeEventListener("popstate", handlePopState);
        };
    }, [isInterviewLocked]);

    useEffect(() => {
        if (phase !== "interview" || !interviewEndsAt || timerExpired) return;

        const timer = window.setInterval(() => {
            const nextRemaining = Math.max(0, Math.ceil((interviewEndsAt - Date.now()) / 1000));
            setRemainingSeconds(nextRemaining);

            if (nextRemaining <= 0) {
                setTimerExpired(true);
                window.clearInterval(timer);
            }
        }, 250);

        return () => window.clearInterval(timer);
    }, [phase, interviewEndsAt, timerExpired]);

  useEffect(() => {
    if (phase !== "completed" && phase !== "finalizing") return;
    allowFullscreenExitRef.current = true;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
    setShouldConnect(false);
  }, [phase]);

    return (
        <div ref={containerRef} className="min-h-screen bg-white text-gray-900 flex flex-col font-sans relative overflow-hidden">
            <AnimatePresence mode="wait">
                {phase === "check" && (
                    <motion.div 
                        key="check"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 1.1, filter: "blur(20px)" }}
                        transition={{ duration: 0.8 }}
                        className="flex-1 w-full bg-white z-50 absolute inset-0 overflow-y-auto"
                    >
                        <HardwareCheck
                            onComplete={handleHardwareComplete}
                            isStarting={isJoining}
                            errorMessage={joinError}
                            applicationId={id}
                        />
                    </motion.div>
                )}

                {phase === "launching" && (
                    <motion.div
                        key="launching"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex-1 min-h-screen w-full flex items-center justify-center bg-[#0e0e10] z-[120] absolute inset-0"
                    >
                        <div className="flex flex-col items-center gap-8 text-center px-6">
                            <div className="relative h-32 w-32">
                                <div className="absolute inset-0 rounded-full border-2 border-orange-500/20 animate-ping" />
                                <div className="absolute inset-2 rounded-full border-2 border-orange-500/30 animate-ping" style={{ animationDelay: "0.3s" }} />
                                <div className="relative h-full w-full rounded-full border-2 border-orange-500/40 bg-zinc-900/80 backdrop-blur-xl flex items-center justify-center shadow-[0_0_60px_rgba(249,115,22,0.2)]">
                                    <Sparkles className="h-10 w-10 text-orange-500 animate-pulse" />
                                </div>
                            </div>
                            <div className="space-y-3">
                                <h3 className="text-2xl font-black text-white uppercase tracking-tight">
                                    {isAgentReady ? "Your Interviewer is Ready" : "Setting Up Interview Room"}
                                </h3>
                                <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.25em] max-w-[300px]">
                                    {isAgentReady
                                        ? `Agent ready in ${agentReadyLatencyMs ?? 0}ms. Starting interview...`
                                        : "Please wait — connecting your AI interviewer."}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {(["Mic & Camera", "Room Link", "AI Agent"] as const).map((step, i) => {
                                    const done = i === 0 ? true : i === 1 ? !!token : isAgentReady;
                                    return (
                                        <div key={step} className="flex items-center gap-2">
                                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
                                                done
                                                    ? "bg-green-500/10 border-green-500/30 text-green-400"
                                                    : "bg-zinc-800 border-zinc-700 text-zinc-500"
                                            }`}>
                                                {done ? <CheckCircle2 className="w-3 h-3" /> : <Loader2 className="w-3 h-3 animate-spin" />}
                                                {step}
                                            </div>
                                            {i < 2 && <div className="w-4 h-px bg-zinc-700" />}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </motion.div>
                )}



                {phase === "finalizing" && (
                    <motion.div 
                        key="finalizing"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex-1 min-h-screen w-full flex items-center justify-center bg-white z-[150] absolute inset-0"
                    >
                        <div className="flex flex-col items-center gap-6">
                            <div className="relative">
                                <Loader2 className="h-16 w-16 text-orange-500 animate-spin" />
                                <ShieldCheck className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-orange-600" />
                            </div>
                            <div className="text-center space-y-2">
                                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Interview Complete</h3>
                                <p className="text-sm font-bold text-gray-400 uppercase tracking-[0.2em]">Securing your session...</p>
                            </div>
                        </div>
                    </motion.div>
                )}

                {phase === "completed" && (
                    <motion.div 
                        key="completed"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex-1 min-h-screen w-full flex items-center justify-center bg-white z-[100] absolute inset-0"
                    >
                        <CompletionView id={id} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Interview room — outside AnimatePresence intentionally.
                It pre-renders as soon as token is available (warm connection during hardware check)
                and controls its own visibility via opacity/z-index/pointer-events. */}
            {token && serverUrl && phase !== "completed" && (
                <div 
                    key="interview-room"
                    className={cn(
                        "flex-1 flex flex-col w-full h-full absolute inset-0 transition-opacity duration-1000 bg-white",
                        phase === "interview" ? "opacity-100 z-40 pointer-events-auto" : "opacity-0 z-0 pointer-events-none"
                    )}
                >
                    <LiveKitRoom
                        video={phase === "interview"}
                        audio={phase === "interview" || phase === "launching"}
                        token={token}
                        serverUrl={serverUrl}
                        connect={shouldConnect}
                        data-lk-theme="default"
                        className="flex-1 flex flex-col w-full h-full"
                    >
                        <InterviewRoomContent
                            id={id}
                            onAgentReady={handleAgentReady}
                            onFinish={() => setPhase("completed")}
                            onFinalizing={() => setPhase("finalizing")}
                            isInterviewActive={phase === "interview"}
                            isLaunchingActive={phase === "launching"}
                            timeLabel={formatDuration(remainingSeconds)}
                            timerExpired={timerExpired}

                            onRemoteAgentAudioTrack={handleRemoteAgentAudioTrack}
                            onRoomReady={(room) => { lkRoomRef.current = room; }}
                            onAllowExitNow={() => {
                                allowFullscreenExitRef.current = true;
                            }}
                        />
                    </LiveKitRoom>
                </div>
            )}

            {/* Connection Bridge Status - Stable outside loop */}
            {phase === "check" && shouldConnect && (
                <div key="connection-pulse" className="fixed bottom-4 left-4 z-[200] flex items-center gap-2 px-3 py-1 bg-black/10 backdrop-blur-md rounded-full border border-black/5 shadow-sm">
                    <div className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        token ? "bg-green-500 animate-pulse" : "bg-gray-300"
                    )} />
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-400">
                        {token ? "AI Link Ready" : "Warming System..."}
                    </span>
                </div>
            )}

            <AnimatePresence mode="wait">
                {phase === "interview" && !isFullscreen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-white/80 backdrop-blur-3xl px-6"
                    >
                        <ShieldAlert className="w-16 h-16 text-orange-500 mb-6 animate-bounce" />
                        <h2 className="text-3xl font-black text-gray-900 text-center mb-3 uppercase italic">Security Halt</h2>
                        <p className="text-orange-900/60 text-center max-w-sm mb-10 font-bold uppercase tracking-widest text-[10px]">
                            Fullscreen required for integrity verification.
                        </p>
                        <button
                            onClick={requestFullscreenMode}
                            className="bg-orange-600 hover:bg-orange-500 text-white font-black px-12 py-5 rounded-3xl shadow-[0_20px_40px_rgba(234,88,12,0.4)] transition-all hover:scale-110 active:scale-95 flex items-center gap-3 uppercase tracking-widest text-xs"
                        >
                            <Maximize className="w-4 h-4" />
                            Resume Interview
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>


        </div>
    );
}

function InterviewRoomContent({
    id,
    onFinish,
    onFinalizing,
    isInterviewActive,
    isLaunchingActive,
    timeLabel,
    timerExpired,

    onRemoteAgentAudioTrack,
    onAllowExitNow,
    onAgentReady,
    onRoomReady,
}: {
    id: string,
    onFinish: () => void,
    onFinalizing: () => void,
    isInterviewActive: boolean,
    isLaunchingActive: boolean,
    timeLabel: string,
    timerExpired: boolean,

    onRemoteAgentAudioTrack: (track: MediaStreamTrack | null) => void,
    onAllowExitNow: () => void,
    onAgentReady?: (isReady: boolean) => void,
    onRoomReady?: (room: any) => void,
}) {
    const { localParticipant } = useLocalParticipant();
    const cameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
    const connectionState = useConnectionState();
    const remoteParticipants = useRemoteParticipants();
    const lkRoom = useRoomContext();

    // Give parent a ref to the room so it can call startAudio() on user gesture
    useEffect(() => {
        if (lkRoom) onRoomReady?.(lkRoom);
    }, [lkRoom, onRoomReady]);

    const { state: agentState, audioTrack: agentAudioTrack } = useVoiceAssistant();
    const isAiSpeaking = agentState === "speaking";
    const aiParticipantTrack = agentAudioTrack;
    const hasAgentPresence = remoteParticipants.length > 0;

    // startAudio is now called from handleHardwareComplete (user gesture) in the parent.
    // This useEffect is a fallback only — if the room reconnects mid-interview.
    useEffect(() => {
        if (connectionState === "connected" && lkRoom) {
            lkRoom.startAudio().catch(() => {});
        }
    }, [connectionState, lkRoom]);

    const readySignalSentRef = useRef(false);
    const launchReadySignalSentRef = useRef(false);
    const finishStartedRef = useRef(false);
    const recordingStartedRef = useRef(false);
    const transcriptPanelRef = useRef<HTMLDivElement>(null);
    const transcriptions = useTranscriptions({ room: lkRoom });
    const localIdentity = lkRoom?.localParticipant?.identity ?? "";

    // Agent readiness is based on room connection + remote agent presence.
    useEffect(() => {
        const readyNow = connectionState === "connected" && hasAgentPresence;
        onAgentReady?.(readyNow);

        if (!isLaunchingActive) {
            launchReadySignalSentRef.current = false;
            return;
        }

        if (readyNow && !launchReadySignalSentRef.current) {
            launchReadySignalSentRef.current = true;
            console.log("[Agent] Ready in launching phase");
        }
    }, [isLaunchingActive, connectionState, hasAgentPresence, onAgentReady]);

    // Start recording only after interview phase starts and agent actually begins speaking.
    useEffect(() => {
        if (!isInterviewActive || agentState !== "speaking") return;

        console.log("[Agent] State=speaking during interview");

        // Start recording the moment audio flows
        if (!recordingStartedRef.current) {
            recordingStartedRef.current = true;
            console.log("[Recording] Agent speaking — starting recording");
            fetch("/api/interview/start-recording", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ applicationId: id }),
            }).catch((err) => console.warn("[Recording] start-recording request failed:", err));
        }
    }, [agentState, id, isInterviewActive]);
    const [remoteForceFinish, setRemoteForceFinish] = useState(false);
    const localCameraTrack =
        cameraTracks.find((t) => t.participant.isLocal && t.source === Track.Source.Camera) || null;

    const groupedTranscriptions = useMemo(() => {
        const groups: {
            id: string;
            identity: string;
            isCandidate: boolean;
            speakerName: string;
            segments: Array<{ text: string; isFinal: boolean; id: string }>;
        }[] = [];

        for (const segment of transcriptions) {
            if (!segment.text.trim()) continue;
            const identity = (segment as any).participantInfo?.identity || "";
            const isCandidate = identity === localIdentity;
            const isFinal = (segment as any).streamInfo?.attributes?.["lk.transcription_final"] === "true" || (segment as any).isFinal === true;
            const id = (segment as any).streamInfo?.id || (segment as any).id || Math.random().toString();
            
            const lastGroup = groups[groups.length - 1];
            if (lastGroup && lastGroup.identity === identity) {
                // If the same speaker continues, append to group
                lastGroup.segments.push({ text: segment.text, isFinal, id });
            } else {
                groups.push({
                    id,
                    identity,
                    isCandidate,
                    speakerName: isCandidate ? "You" : "Interviewer",
                    segments: [{ text: segment.text, isFinal, id }]
                });
            }
        }
        return groups;
    }, [transcriptions, localIdentity]);

    // Ensure camera is explicitly enabled when interview becomes active
    useEffect(() => {
        if (isInterviewActive && localParticipant && !localParticipant.isCameraEnabled) {
            localParticipant.setCameraEnabled(true).catch(err => {
                console.error("[Camera] Failed to enable track:", err);
            });
        }
    }, [isInterviewActive, localParticipant]);

    // Send one ready signal when interview becomes active and connected.
    useEffect(() => {
        if (connectionState !== "connected" || !localParticipant || !isInterviewActive) {
            if (!isInterviewActive || connectionState !== "connected") {
                readySignalSentRef.current = false;
            }
            return;
        }

        if (readySignalSentRef.current) return;
        readySignalSentRef.current = true;

        const encoder = new TextEncoder();
        let cancelled = false;
        let attempts = 0;

        const sendReady = async () => {
            if (cancelled) return;
            attempts += 1;
            const data = encoder.encode(
                JSON.stringify({ type: "user_ready", timestamp: Date.now(), attempt: attempts })
            );
            try {
                await localParticipant.publishData(data, { reliable: true });
                console.log("SENT READY SIGNAL", { attempt: attempts });
            } catch (err) {
                console.warn("[READY] failed to publish user_ready", err);
            }
        };

        void sendReady();
        const retryTimer = window.setInterval(() => {
            if (attempts >= 6) {
                window.clearInterval(retryTimer);
                return;
            }
            void sendReady();
        }, 700);

        return () => {
            cancelled = true;
            window.clearInterval(retryTimer);
        };
    }, [connectionState, localParticipant, isInterviewActive]);

    useEffect(() => {
        const mediaTrack = getMediaStreamTrack(agentAudioTrack ?? null);
        if (mediaTrack && mediaTrack.kind === "audio") {
            onRemoteAgentAudioTrack(mediaTrack);
        }
    }, [agentAudioTrack, onRemoteAgentAudioTrack]);


    useEffect(() => {
        if (!lkRoom) return;

        const decoder = new TextDecoder();
        const onDataReceived = (payload: Uint8Array) => {
            try {
                const packet = JSON.parse(decoder.decode(payload));
                if (packet.type === "interview_terminated") {
                    setRemoteForceFinish(true);
                }
            } catch {
                // Ignore non-JSON packets.
            }
        };

        lkRoom.on(RoomEvent.DataReceived, onDataReceived);
        return () => {
            lkRoom.off(RoomEvent.DataReceived, onDataReceived);
        };
    }, [lkRoom]);

    useEffect(() => {
        if (!transcriptPanelRef.current) return;
        transcriptPanelRef.current.scrollTop = transcriptPanelRef.current.scrollHeight;
    }, [transcriptions]);

    const handleFinish = useCallback(async () => {
        if (finishStartedRef.current) return;
        finishStartedRef.current = true;

        onAllowExitNow();
        onFinalizing();
        // Recording is handled server-side by LiveKit Egress.
        // The server will receive an egress_ended webhook and save the URL automatically.
        setTimeout(() => {
            try { lkRoom?.disconnect(); } catch (_) {}
            onFinish();
        }, 1500);
    }, [onAllowExitNow, onFinalizing, lkRoom, onFinish]);

    useEffect(() => {
        if (!timerExpired || !isInterviewActive) return;
        void handleFinish();
    }, [timerExpired, isInterviewActive, handleFinish]);

    useEffect(() => {
        if (!remoteForceFinish || !isInterviewActive) return;
        void handleFinish();
    }, [remoteForceFinish, isInterviewActive, handleFinish]);

    return (
        <div className="flex-1 flex flex-col h-full w-full relative bg-[#121214] text-white overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,_rgba(249,115,22,0.04)_0%,_transparent_50%)] pointer-events-none" />
            
            {isInterviewActive && <RoomAudioRenderer />}
            {/* FORCE AUDIO TRACK ATTACHMENT */}
            {isInterviewActive && aiParticipantTrack && <AudioTrack trackRef={aiParticipantTrack} />}
            
            {/* Role Context - TOP LEFT */}
            <div className="absolute top-10 left-10 z-[60]">
                <div className="flex items-center gap-4 bg-zinc-900/40 backdrop-blur-xl px-6 py-4 rounded-[2rem] border border-white/5 shadow-2xl">
                    <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center border border-orange-500/30">
                        <Sparkles className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-500">Live Interview</p>
                        <p className="text-sm font-black text-white tracking-tight italic">Product Designer Role</p>
                    </div>
                </div>
            </div>

            {/* Premium Timer - TOP MIDDLE */}
            <div className="absolute top-10 left-1/2 -translate-x-1/2 z-[60]">
                <div className="bg-zinc-900/80 backdrop-blur-2xl px-10 py-4 rounded-[2rem] border border-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex flex-col items-center min-w-[200px]">
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-orange-500/80 mb-1">Session Protocol</p>
                    <p className="text-4xl font-black text-white tabular-nums tracking-tight italic">
                        {timeLabel}
                    </p>
                </div>
            </div>

            <div className="absolute top-10 right-10 z-50 w-96 aspect-[4/3] bg-zinc-900 rounded-[2.5rem] p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.6)] group border border-white/10 ring-1 ring-white/5">
                <div className="w-full h-full rounded-[2rem] overflow-hidden bg-zinc-950 relative">
                    {localCameraTrack ? (
                        <div className="w-full h-full [&>video]:w-full [&>video]:h-full [&>video]:object-cover [&>canvas]:w-full [&>canvas]:h-full [&>canvas]:object-cover scale-x-[-1]">
                            <VideoTrack trackRef={localCameraTrack} />
                        </div>
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-zinc-900/50">
                            <Camera className="w-8 h-8 text-zinc-800 animate-pulse" />
                        </div>
                    )}
                    <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-full border border-white/10">
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_20px_rgba(34,197,94,0.6)]" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-white drop-shadow-md">You (Live)</p>
                    </div>
                </div>
            </div>

            {/* AI Avatar Area */}
            <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
                <motion.div 
                    animate={{ 
                        scale: isAiSpeaking ? [1, 1.04, 1.01, 1.06, 1] : [1, 1.01, 1],
                        borderColor: isAiSpeaking ? "rgba(249, 115, 34, 0.6)" : "rgba(249, 115, 34, 0.2)",
                    }}
                    transition={{ 
                        duration: isAiSpeaking ? 0.8 : 4, 
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                    className="w-64 h-64 rounded-full border-2 flex items-center justify-center relative bg-black/40 backdrop-blur-3xl shadow-[0_0_120px_rgba(249,115,22,0.1)] group"
                >
                    {/* Premium Organic Voice Halos (Animated Rings) */}
                    <AnimatePresence>
                        {isAiSpeaking && (
                            <>
                                {[...Array(3)].map((_, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, scale: 1 }}
                                        animate={{ opacity: [0, 0.4, 0], scale: [1, 1.5 + (i * 0.2)] }}
                                        exit={{ opacity: 0 }}
                                        transition={{ 
                                            duration: 2, 
                                            repeat: Infinity, 
                                            delay: i * 0.6,
                                            ease: "easeOut" 
                                        }}
                                        className="absolute inset-0 rounded-full border-2 border-orange-500/30 pointer-events-none"
                                    />
                                ))}
                            </>
                        )}
                    </AnimatePresence>

                    {/* Image Container */}
                    <div className="absolute inset-2 rounded-full overflow-hidden border-4 border-zinc-800/50 shadow-inner">
                        <img 
                            src="/avatars/jordan.png" 
                            alt="AI Interviewer" 
                            className={cn(
                                "w-full h-full object-cover transition-all duration-700",
                                isAiSpeaking ? "scale-110 contrast-[1.1] brightness-[1.05]" : "scale-100 grayscale-[0.2] brightness-90"
                            )}
                        />
                        {/* Gradient Overlay for Depth */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />
                    </div>

                    <div className="absolute -bottom-16 flex flex-col items-center gap-2">
                        <p className={cn(
                            "text-[10px] font-black uppercase tracking-[0.5em] transition-all duration-500",
                            isAiSpeaking ? "text-orange-500 translate-y-1" : "text-zinc-500"
                        )}>
                            {isAiSpeaking ? "Interviewer Speaking" : (aiParticipantTrack ? "Interviewer Listening" : "Waiting for Interviewer...")}
                        </p>
                        {isAiSpeaking && (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full"
                            >
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-[8px] font-black uppercase tracking-widest text-green-500">Live Voice Stream</span>
                            </motion.div>
                        )}
                    </div>
                </motion.div>
                {/* Floating Vanishing Transcript - Bottom Left Anchor */}
                <div className="absolute left-16 bottom-24 z-[65] w-[450px] pointer-events-none">
                    <div 
                        className="flex flex-col-reverse gap-1.5 max-h-[500px] overflow-hidden py-10"
                        style={{ 
                            maskImage: 'linear-gradient(to top, black 30%, transparent 95%)',
                            WebkitMaskImage: 'linear-gradient(to top, black 30%, transparent 95%)'
                        }}
                    >
                        <AnimatePresence mode="popLayout">
                            {groupedTranscriptions.slice(-8).reverse().map((group, idx) => {
                                const isGroupFinal = group.segments.every(s => s.isFinal);
                                const combinedText = group.segments.map(s => s.text.trim()).join(" ");
                                
                                return (
                                    <motion.div
                                        key={group.id}
                                        initial={{ opacity: 0, x: group.isCandidate ? 20 : -20, scale: 0.95 }}
                                        animate={{ 
                                            opacity: Math.max(0.1, 1 - (idx * 0.15)),
                                            x: 0, 
                                            scale: 1 
                                        }}
                                        exit={{ 
                                            opacity: 0, 
                                            y: -60, 
                                            scale: 0.9, 
                                            transition: { duration: 0.5 } 
                                        }}
                                        transition={{ 
                                            type: "spring",
                                            stiffness: 150,
                                            damping: 20
                                        }}
                                        className={cn(
                                            "flex flex-col gap-0.5 max-w-[90%]",
                                            group.isCandidate ? "self-end items-end" : "self-start items-start"
                                        )}
                                    >
                                        <p className={cn(
                                            "text-[8px] font-black uppercase tracking-[0.2em] opacity-30 mx-2",
                                            group.isCandidate ? "text-orange-500" : "text-zinc-500"
                                        )}>
                                            {group.isCandidate ? "You" : "Ishita"}{!isGroupFinal && " •••"}
                                        </p>
                                        <div className={cn(
                                            "px-3 py-1.5 rounded-[1.2rem] backdrop-blur-md relative",
                                            group.isCandidate 
                                                ? "bg-orange-500/10 border border-orange-500/20 rounded-tr-[0.25rem] text-right" 
                                                : "bg-zinc-800/40 border border-white/5 rounded-tl-[0.25rem] text-left"
                                        )}>
                                            <StreamingText 
                                                text={combinedText} 
                                                className={cn(
                                                    "text-sm font-bold italic tracking-tight leading-snug",
                                                    group.isCandidate ? "text-orange-100" : "text-white"
                                                )} 
                                            />
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* Bottom Navigation & Premium Timer */}
            <div className="h-44 bg-zinc-900/20 backdrop-blur-3xl p-8 grid grid-cols-3 items-center relative z-10">
                
                {/* Left: Status */}
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                        <ShieldCheck className="w-6 h-6 text-orange-500" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Security</p>
                        <p className="text-[11px] font-bold text-green-500 uppercase tracking-widest">Encrypted</p>
                    </div>
                </div>

                {/* Middle: Centered End Interview Button */}
                <div className="flex justify-center">
                    <Button 
                        variant="destructive"
                        onClick={handleFinish}
                        className="h-20 px-16 rounded-[2.5rem] bg-red-600 text-white hover:bg-black hover:text-white font-black uppercase tracking-[0.3em] text-[12px] transition-all shadow-[0_20px_50px_rgba(220,38,38,0.3)] active:scale-95 border-none group"
                    >
                        <span className="flex items-center gap-3">
                            Finish Interview 
                            <LogOut className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </span>
                    </Button>
                </div>

                {/* Right: Interaction Status */}
                <div className="flex justify-end pr-4">
                    <div className="flex flex-col items-end">
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-600 mb-1">Session Mode</p>
                        <p className="text-[11px] font-bold text-white uppercase tracking-widest">{aiParticipantTrack ? "Interviewer Active" : "Seeking Agent..."}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function InterviewPage({ params }: InterviewPageProps) {
    const { id } = use(params);
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-white text-gray-400">
                <div className="flex flex-col items-center gap-6">
                    <div className="relative">
                        <div className="w-20 h-20 border-4 border-orange-500/10 rounded-full animate-spin border-t-orange-500" />
                        <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-orange-500 animate-pulse" />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] animate-pulse">Initializing Neural Link...</p>
                </div>
            </div>
        }>
            <InterviewContent id={id} params={params} />
        </Suspense>
    );
}

export default InterviewPage;

// ── Inlined Components ────────────────────────────────────────


function VideoTrack({ trackRef }: { trackRef: TrackReference }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const attachedTrackRef = useRef<AttachableTrack | null>(null);
    const lastTrackId = useRef<string | null>(null);

    useEffect(() => {
        const element = videoRef.current;
        const track = getAttachableTrack(trackRef);
        if (!track || !element) return;

        // Skip re-attachment if the track haven't changed to prevent flickering
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
            if (element && attachedTrackRef.current) {
                attachedTrackRef.current.detach(element);
            }
            attachedTrackRef.current = null;
            lastTrackId.current = null;
        };
    }, []);

    return (
        <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            className="w-full h-full object-cover bg-white brightness-[1.08] contrast-[1.05]" 
        />
    );
}

function AudioTrack({ trackRef }: { trackRef: TrackReference }) {
    const audioRef = useRef<HTMLAudioElement>(null);
    useEffect(() => {
        const track = getAttachableTrack(trackRef);
        if (track && audioRef.current) {
            track.attach(audioRef.current);
            return () => { track.detach(audioRef.current!); };
        }
    }, [trackRef]);
    return <audio ref={audioRef} autoPlay />;
}

function CompletionView({ id }: { id: string }) {
    const [step, setStep] = useState<"sync" | "feedback" | "thanks">("sync");
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [feedback, setFeedback] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (rating === 0) return;
        setIsSubmitting(true);
        try {
            await fetch(`/api/interview/${id}/feedback`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rating, feedback }),
            });
            setStep("thanks");
        } catch (err) {
            console.error("Feedback submission failed:", err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="w-full max-w-xl mx-auto px-6">
            <AnimatePresence mode="wait">
                {step === "sync" && (
                    <motion.div 
                        key="sync"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="text-center"
                    >
                        <div className="w-24 h-24 bg-gradient-to-br from-orange-500 to-orange-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 shadow-[0_20px_40px_rgba(249,115,22,0.3)] rotate-3">
                            <CheckCircle2 className="w-12 h-12 text-white" />
                        </div>
                        <h2 className="text-5xl font-black text-gray-900 uppercase italic tracking-tighter mb-6">Sync Complete</h2>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-[0.2em] leading-relaxed mb-12 max-w-sm mx-auto">
                            Your interview session has been encrypted and secured for review.
                        </p>
                        <Button 
                            onClick={() => setStep("feedback")}
                            className="w-full h-20 rounded-[2rem] bg-gray-900 text-white font-black uppercase tracking-[0.3em] text-[13px] hover:bg-black transition-all shadow-2xl group"
                        >
                            Next Step
                            <ArrowRight className="ml-4 w-5 h-5 group-hover:translate-x-2 transition-transform" />
                        </Button>
                    </motion.div>
                )}

                {step === "feedback" && (
                    <motion.div 
                        key="feedback"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="bg-white/40 backdrop-blur-3xl p-10 rounded-[3rem] border border-white border-b-gray-100 shadow-[0_40px_80px_rgba(0,0,0,0.06)]"
                    >
                        <div className="mb-10 text-center">
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-orange-500 mb-2">Anonymous Feedback</p>
                            <h2 className="text-3xl font-black text-gray-900 tracking-tight">How was your session?</h2>
                        </div>

                        <div className="flex justify-center gap-3 mb-12">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    onMouseEnter={() => setHoverRating(star)}
                                    onMouseLeave={() => setHoverRating(0)}
                                    onClick={() => setRating(star)}
                                    className="transition-all duration-300 transform active:scale-90"
                                >
                                    <Sparkles 
                                        className={cn(
                                            "w-12 h-12 transition-all duration-300",
                                            (hoverRating || rating) >= star 
                                                ? "text-orange-500 fill-orange-500 scale-110 drop-shadow-[0_0_15px_rgba(249,115,22,0.4)]" 
                                                : "text-gray-200"
                                        )}
                                    />
                                </button>
                            ))}
                        </div>

                        <div className="space-y-6">
                            <div className="relative group">
                                <textarea
                                    value={feedback}
                                    onChange={(e) => setFeedback(e.target.value)}
                                    placeholder="What did you like about Ishita? (Optional)"
                                    className="w-full h-40 bg-white/60 border-2 border-transparent focus:border-orange-500/20 focus:bg-white rounded-[2rem] p-6 text-sm font-bold text-gray-700 placeholder:text-gray-300 outline-none transition-all resize-none shadow-inner"
                                />
                                <div className="absolute top-6 right-6 opacity-20">
                                    <Zap className="w-5 h-5 text-orange-500" />
                                </div>
                            </div>

                            <Button 
                                onClick={handleSubmit}
                                disabled={rating === 0 || isSubmitting}
                                className={cn(
                                    "w-full h-20 rounded-[2rem] font-black uppercase tracking-[0.3em] text-[13px] transition-all shadow-2xl",
                                    rating > 0 
                                        ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:scale-[1.02] active:scale-95 shadow-orange-500/20" 
                                        : "bg-gray-100 text-gray-400 cursor-not-allowed border-none shadow-none"
                                )}
                            >
                                {isSubmitting ? (
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                ) : (
                                    <span className="flex items-center gap-3">
                                        Submit Review <Send className="w-4 h-4" />
                                    </span>
                                )}
                            </Button>
                        </div>
                    </motion.div>
                )}

                {step === "thanks" && (
                    <motion.div 
                        key="thanks"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center"
                    >
                        <motion.div 
                            initial={{ scale: 0 }}
                            animate={{ scale: 1, rotate: [0, 10, -10, 0] }}
                            transition={{ 
                                scale: { type: "spring", stiffness: 200, damping: 10 },
                                rotate: { duration: 1, times: [0, 0.3, 0.7, 1], ease: "easeInOut" }
                            }}
                            className="w-24 h-24 bg-gradient-to-tr from-green-400 to-green-500 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 shadow-[0_20px_40px_rgba(34,197,94,0.3)]"
                        >
                            <ShieldCheck className="w-12 h-12 text-white" />
                        </motion.div>
                        <h2 className="text-5xl font-black text-gray-900 uppercase italic tracking-tighter mb-6">Thank You</h2>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-[0.2em] leading-relaxed mb-12 max-w-sm mx-auto">
                            Your feedback helps us build the best recruitment experience in the world.
                        </p>
                        <Button 
                            onClick={() => window.location.href = "/careers"}
                            className="w-full h-20 rounded-[2rem] bg-gray-900 text-white font-black uppercase tracking-[0.3em] text-[13px] hover:bg-black transition-all shadow-2xl"
                        >
                            Back to Careers
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
