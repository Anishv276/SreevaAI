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
  useRoomContext,
  useRemoteParticipants,
  useTranscriptions,
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
    const [launchCountdown, setLaunchCountdown] = useState<number | null>(null);
    const [interviewEndsAt, setInterviewEndsAt] = useState<number | null>(null);
    const [sessionDuration, setSessionDuration] = useState(INTERVIEW_DURATION_SECONDS);
    const [remainingSeconds, setRemainingSeconds] = useState(INTERVIEW_DURATION_SECONDS);
    const [timerExpired, setTimerExpired] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const allowFullscreenExitRef = useRef(false);
    const launchIntervalRef = useRef<number | null>(null);

    const [showSecurityToast, setShowSecurityToast] = useState(false);
    const [isAgentReady, setIsAgentReady] = useState(false);
    const [launchTimeoutCheck, setLaunchTimeoutCheck] = useState(0);

    // Hard timeout safety net: 45 seconds total wait
    useEffect(() => {
        if (phase === "launching" && launchTimeoutCheck > 45) {
            setJoinError("We're having trouble connecting to the interview room. Please check your internet and try again.");
            setPhase("check");
            setLaunchTimeoutCheck(0);
        }
    }, [launchTimeoutCheck, phase]);

    // Dynamic Countdown: Jumps to 3 seconds if agent is ready
    useEffect(() => {
        if (phase === "launching" && isAgentReady && launchCountdown !== null && launchCountdown > 3) {
            setLaunchCountdown(3);
        }
    }, [isAgentReady, phase, launchCountdown]);

    // Effect 1: Countdown ticker — just ticks down, no side effects
    useEffect(() => {
        if (phase !== "launching") return;
        const timer = window.setInterval(() => {
            setLaunchTimeoutCheck((prev) => prev + 1);
            setLaunchCountdown((prev) => Math.max(0, (prev ?? 10) - 1));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [phase]);

    // Effect 2: Phase transition — fires immediately when agent is ready
    useEffect(() => {
        if (phase !== "launching") return;
        if (isAgentReady) {
            setPhase("interview");
        }
    }, [phase, isAgentReady]);

    const isExitUnlocked = phase === "completed" || timerExpired;
    const isInterviewLocked = phase === "interview" && !isExitUnlocked;

    const stopTracks = (stream: MediaStream | null) => {
        if (!stream) return;
        stream.getTracks().forEach((track) => track.stop());
    };

    const handleRemoteAgentAudioTrack = useCallback((track: MediaStreamTrack | null) => {
        // Handled by child component
    }, []);

    const triggerSecurityWarning = () => {
        setShowSecurityToast(true);
        window.setTimeout(() => setShowSecurityToast(false), 5000);
    };


    const tokenRequestRef = useRef<Promise<boolean> | null>(null);

    const ensureWarmConnection = useCallback(async (): Promise<boolean> => {
        if (token && serverUrl) {
            if (!shouldConnect) setShouldConnect(true);
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
                    setShouldConnect(true);
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
                    setShouldConnect(true);
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
    }, [id, token, serverUrl, shouldConnect]);

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

    const handleHardwareComplete = async () => {
        setIsJoining(true);
        setJoinError(null);

        await requestFullscreenMode();

        try {
            const isWarmReady = await ensureWarmConnection();
            if (!isWarmReady) {
                throw new Error("Interview connection could not be prepared. Please retry.");
            }

            // Sync timing if not already set
            if (!interviewEndsAt) {
                setInterviewEndsAt(Date.now() + sessionDuration * 1000);
                setRemainingSeconds(sessionDuration);
                setTimerExpired(false);
            }

            setPhase("interview"); // Immediately jump to interview room
            
        } catch (err) {
            console.error("Phase transition failed:", err);
            setJoinError(err instanceof Error ? err.message : "Unable to start interview.");
            setPhase("check");
        } finally {
            setIsJoining(false);
        }
    };

    useEffect(() => {
        return () => {
            if (launchIntervalRef.current) {
                window.clearInterval(launchIntervalRef.current);
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
                triggerSecurityWarning();
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
                        className="flex-1 min-h-screen w-full flex items-center justify-center bg-white z-50 absolute inset-0"
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
                        className="flex-1 min-h-screen w-full flex items-center justify-center bg-white z-[120] absolute inset-0"
                    >
                        <div className="flex flex-col items-center gap-7 text-center px-6">
                            <div className="relative h-24 w-24 rounded-full border border-orange-200 bg-orange-50 flex items-center justify-center shadow-[0_12px_40px_rgba(249,115,22,0.18)]">
                                <Loader2 className="h-10 w-10 text-orange-500 animate-spin" />
                                <span className={cn(
                                    "absolute -bottom-3 font-black text-orange-600 bg-white border border-orange-100 rounded-full py-1 shadow-sm transition-all",
                                    launchCountdown === 0 ? "text-xs px-4" : "text-lg px-3"
                                )}>
                                    {launchCountdown === 0 ? "..." : (launchCountdown ?? 1)}
                                </span>
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight">
                                    {launchCountdown === 0 ? "Almost Ready" : "Getting Started"}
                                </h3>
                                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.25em] min-h-[1.5rem] max-w-[280px]">
                                    {launchCountdown === 0 
                                        ? "Setting up your interview room. This may take a moment..." 
                                        : !isAgentReady ? "Connecting to your interviewer..." : "Entering the room now..."}
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}

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
                            audio={phase === "interview"}
                            token={token}
                            serverUrl={serverUrl}
                            connect={shouldConnect}
                            data-lk-theme="default"
                            className="flex-1 flex flex-col w-full h-full"
                        >
                            <InterviewRoomContent 
                                id={id} 
                                onAgentReady={setIsAgentReady}
                                onFinish={() => setPhase("completed")} 
                                onFinalizing={() => setPhase("finalizing")}
                                isInterviewActive={phase === "interview"} 
                                timeLabel={formatDuration(remainingSeconds)}
                                timerExpired={timerExpired}
                                onSecurityViolation={triggerSecurityWarning}
                                onRemoteAgentAudioTrack={handleRemoteAgentAudioTrack}
                                onAllowExitNow={() => {
                                    allowFullscreenExitRef.current = true;
                                }}
                            />
                        </LiveKitRoom>
                    </div>
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
                        <CompletionView />
                    </motion.div>
                )}
            </AnimatePresence>

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

            {/* SECURITY TOAST */}
            <AnimatePresence>
                {showSecurityToast && (
                    <motion.div
                        initial={{ opacity: 0, y: -100, x: "-50%" }}
                        animate={{ opacity: 1, y: 24, x: "-50%" }}
                        exit={{ opacity: 0, y: -100, x: "-50%" }}
                        className="fixed top-0 left-1/2 z-[200] w-full max-w-sm px-4"
                    >
                        <div className="bg-orange-600/95 backdrop-blur-xl border border-orange-400 p-4 rounded-3xl shadow-[0_20px_50px_rgba(234,88,12,0.3)] flex items-center gap-4">
                            <ShieldAlert className="w-6 h-6 text-white animate-pulse" />
                            <div className="flex-1">
                                <p className="text-white text-[10px] font-black uppercase tracking-widest">Security Warning</p>
                                <p className="text-orange-50 text-[11px] font-bold leading-tight">Tab switch detected. This event has been synced with the recruiter.</p>
                            </div>
                        </div>
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
    timeLabel,
    timerExpired,
    onSecurityViolation,
    onRemoteAgentAudioTrack,
    onAllowExitNow,
    onAgentReady,
}: {
    id: string,
    onFinish: () => void,
    onFinalizing: () => void,
    isInterviewActive: boolean,
    timeLabel: string,
    timerExpired: boolean,
    onSecurityViolation: () => void,
    onRemoteAgentAudioTrack: (track: MediaStreamTrack | null) => void,
    onAllowExitNow: () => void,
    onAgentReady?: (isReady: boolean) => void,
}) {
    const { localParticipant } = useLocalParticipant();
    const cameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
    const connectionState = useConnectionState();
    const lkRoom = useRoomContext();
    const remoteParticipants = useRemoteParticipants();

    useEffect(() => {
        const hasAgent = remoteParticipants.length > 0;
        onAgentReady?.(hasAgent);
    }, [remoteParticipants, onAgentReady]);

    const remoteTracks = useTracks([Track.Source.Microphone], { onlySubscribed: false });
    // Improved: find any remote participant who has a microphone and isn't the candidate
    const aiParticipantTrack = remoteTracks.find(t => !t.participant.isLocal) ?? null;
    const isAiSpeaking = aiParticipantTrack?.participant.isSpeaking;
    
    // Official LiveKit Audio Handshake
    useEffect(() => {
        if (connectionState === "connected" && lkRoom) {
            lkRoom.startAudio().catch(err => console.warn("Audio start failed:", err));
        }
    }, [connectionState, lkRoom]);

    const [strikes, setStrikes] = useState(0);
    const readySignalSentRef = useRef(false);
    const finishStartedRef = useRef(false);
    const transcriptPanelRef = useRef<HTMLDivElement>(null);
    const transcriptions = useTranscriptions({ room: lkRoom });
    const localIdentity = lkRoom?.localParticipant?.identity ?? "";
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
        const sendReady = () => {
            const data = encoder.encode(JSON.stringify({ type: "user_ready", timestamp: Date.now() }));
            localParticipant.publishData(data, { reliable: true });
            console.log("SENT READY SIGNAL");
        };

        sendReady();
        const retryTimer = window.setTimeout(sendReady, 400);
        return () => window.clearTimeout(retryTimer);
    }, [connectionState, localParticipant, isInterviewActive]);

    useEffect(() => {
        const mediaTrack = getMediaStreamTrack(aiParticipantTrack);
        if (mediaTrack && mediaTrack.kind === "audio") {
            onRemoteAgentAudioTrack(mediaTrack);
        }
    }, [aiParticipantTrack, onRemoteAgentAudioTrack]);


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
            
            <RoomAudioRenderer />
            {/* FORCE AUDIO TRACK ATTACHMENT */}
            {aiParticipantTrack && <AudioTrack trackRef={aiParticipantTrack} />}
            
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

            <div className="absolute top-10 right-10 z-50 w-96 aspect-video bg-white rounded-[2.5rem] p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.4)] group border border-white/10">
                <div className="w-full h-full rounded-[2rem] overflow-hidden bg-white relative">
                    {localCameraTrack ? (
                        <div className="w-full h-full [&>video]:w-full [&>video]:h-full [&>video]:object-cover scale-x-[-1] bg-white">
                            <VideoTrack trackRef={localCameraTrack} />
                        </div>
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-white">
                            <Camera className="w-8 h-8 text-gray-100 animate-pulse" />
                        </div>
                    )}
                    <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/10">
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
            </div>

            <div className="hidden lg:block absolute left-8 top-32 bottom-52 z-[65] w-[360px] rounded-[2rem] border border-white/10 bg-zinc-900/55 backdrop-blur-xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
                <div className="px-5 pt-5 pb-3 border-b border-white/10">
                    <p className="text-[9px] uppercase tracking-[0.28em] font-black text-zinc-400">Live Transcript</p>
                    <p className="text-[11px] font-bold text-zinc-500 mt-1">Messages flow in real time</p>
                </div>
                <div ref={transcriptPanelRef} className="h-[calc(100%-64px)] overflow-y-auto px-4 py-4 space-y-3">
                    <AnimatePresence initial={false}>
                        {groupedTranscriptions.map((group) => {
                            const isGroupFinal = group.segments.every(s => s.isFinal);
                            const combinedText = group.segments.map(s => s.text.trim()).join(" ");
                            
                            return (
                                <motion.div
                                    key={group.id}
                                    initial={{ opacity: 0, y: 22 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -16 }}
                                    transition={{ duration: 0.35, ease: "easeOut" }}
                                    className={cn("max-w-[88%] rounded-2xl px-4 py-2.5 border", group.isCandidate
                                        ? "ml-auto bg-orange-500/12 border-orange-400/30"
                                        : "mr-auto bg-zinc-800/80 border-zinc-700/80")}
                                >
                                    <p className={cn("text-[9px] uppercase tracking-[0.2em] font-black mb-1", group.isCandidate ? "text-orange-300" : "text-zinc-400")}>
                                        {group.speakerName}{!isGroupFinal && <span className="opacity-50 ml-1">•••</span>}
                                    </p>
                                    <StreamingText text={combinedText} className="text-[13px] leading-relaxed text-white font-semibold" />
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
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

function CompletionView() {
    return (
        <div className="text-center px-4 max-w-sm">
            <div className="w-20 h-20 bg-orange-500/10 rounded-3xl flex items-center justify-center mx-auto mb-10">
                <CheckCircle2 className="w-10 h-10 text-orange-500" />
            </div>
            <h2 className="text-4xl font-black text-gray-900 uppercase italic tracking-tighter mb-4">Sync Complete</h2>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-relaxed mb-12">Your interview session has been encrypted and secured for review.</p>
            <Button 
                onClick={() => window.location.href = "/careers"}
                className="w-full h-16 rounded-2xl bg-gray-900 text-white font-black uppercase tracking-widest text-xs hover:bg-black transition-all shadow-xl shadow-gray-200"
            >
                Return Home
                <ArrowRight className="ml-3 w-4 h-4" />
            </Button>
        </div>
    );
}
