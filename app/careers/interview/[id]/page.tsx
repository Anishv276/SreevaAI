"use client";
import { Suspense, useState, use, useEffect, useRef, useCallback } from "react";
import { HardwareCheck } from "@/components/careers/interview/HardwareCheck";
import { motion, AnimatePresence } from "framer-motion";
import { Maximize, Sparkles, Mic2, ShieldCheck, ShieldAlert, Zap, ChevronRight, Send, Loader2, Video, VideoOff, MicOff, PhoneOff, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

function InterviewContent({ id, params }: { id: string, params: Promise<{ id: string }> }) {
    const [phase, setPhase] = useState<"check" | "interview" | "finalizing" | "completed">("check");
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [token, setToken] = useState<string | null>(null);
    const [serverUrl, setServerUrl] = useState<string | null>(null);
    const [isJoining, setIsJoining] = useState(false);
    const [joinError, setJoinError] = useState<string | null>(null);
    const [showGreeting, setShowGreeting] = useState(false);
    const [shouldConnect, setShouldConnect] = useState(false);
    const [interviewEndsAt, setInterviewEndsAt] = useState<number | null>(null);
    const [sessionDuration, setSessionDuration] = useState(INTERVIEW_DURATION_SECONDS);
    const [remainingSeconds, setRemainingSeconds] = useState(INTERVIEW_DURATION_SECONDS);
    const [timerExpired, setTimerExpired] = useState(false);
    const recordedChunksRef = useRef<Blob[]>([]);
    const recordingUploadedRef = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const recordingStartTimeRef = useRef<number | null>(null);
    const allowFullscreenExitRef = useRef(false);

    const [showSecurityToast, setShowSecurityToast] = useState(false);

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

    const uploadRecording = async (forceDuration?: number) => {
        if (recordingUploadedRef.current || recordedChunksRef.current.length === 0) {
            console.log("Upload skipped: Already uploaded or no chunks.");
            return;
        }

        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        const now = Date.now();
        const start = recordingStartTimeRef.current || now;
        const duration = forceDuration !== undefined ? forceDuration : Math.max(0, Math.round((now - start) / 1000));

        console.log(`[Browser] Uploading recording. Chunks: ${recordedChunksRef.current.length}, Size: ${blob.size}, Duration: ${duration}s`);
        recordingUploadedRef.current = true;
        
        const file = new File([blob], `interview_${id}.webm`, { type: "video/webm" });
        const formData = new FormData();
        formData.append("applicationId", id);
        formData.append("recording", file);
        formData.append("duration", duration.toString());

        try {
            const res = await fetch("/api/interview/recording", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const text = await res.text().catch(() => "");
                console.error(`Upload failed (${res.status}):`, text);
                throw new Error(`Upload failed (${res.status}): ${text}`);
            }
            console.log("Recording upload successful.");
        } catch (error) {
            console.error("Interview recording upload failed:", error);
            recordingUploadedRef.current = false;
        }
    };

    useEffect(() => {
        const prewarmToken = async () => {
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
                    setToken(data.token);
                    setServerUrl(data.serverUrl);
                    if (data.duration) {
                        setSessionDuration(data.duration);
                        setRemainingSeconds(data.duration);
                    }
                    setShouldConnect(true);
                }
            } catch (err) {
                console.error("Background token pre-warm failed:", err);
            }
        };

        prewarmToken();
    }, [id]);

    useEffect(() => {
        return () => {
            // Parent cleanup
        };
    }, []);

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

    const handleHardwareComplete = async () => {
        setIsJoining(true);
        setJoinError(null);
        setShowGreeting(true);

        await requestFullscreenMode();

        try {
            let nextToken = token;
            let nextServerUrl = serverUrl;

            if (!nextToken || !nextServerUrl) {
                const res = await fetch("/api/interview/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        applicationId: id,
                        participantName: "Candidate",
                    }),
                });

                const data = await res.json();
                if (!res.ok || !data.token || !data.serverUrl) {
                    throw new Error(data.error || "Unable to connect to interview server.");
                }

                nextToken = data.token;
                nextServerUrl = data.serverUrl;
                setToken(data.token);
                setServerUrl(data.serverUrl);
                if (data.duration) {
                    setSessionDuration(data.duration);
                    setRemainingSeconds(data.duration);
                }
                setShouldConnect(true);
            }

            if (!nextToken || !nextServerUrl) {
                throw new Error("Unable to connect to interview server.");
            }

            if (!interviewEndsAt) {
                setInterviewEndsAt(Date.now() + sessionDuration * 1000);
                setRemainingSeconds(sessionDuration);
                setTimerExpired(false);
            }

            setPhase("interview");
            window.setTimeout(() => setShowGreeting(false), 2500);
        } catch (err) {
            console.error("Interview join failed:", err);
            setJoinError(err instanceof Error ? err.message : "Unable to connect to interview server.");
            setShowGreeting(false);
            setShouldConnect(false);
            setPhase("check");
        } finally {
            setIsJoining(false);
        }
    };

    useEffect(() => {
        const handleFSChange = () => {
            const inFullscreen = !!document.fullscreenElement;
            setIsFullscreen(inFullscreen);

            // Ignore security logic if interview is finished or exit is explicitly allowed
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
    }, [isInterviewLocked]);

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
        <div ref={containerRef} className="min-h-screen bg-[#FAFAFA] text-gray-900 flex flex-col font-sans relative overflow-hidden">
            <AnimatePresence mode="wait">
                {phase === "check" && (
                    <motion.div 
                        key="check"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 1.1, filter: "blur(20px)" }}
                        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
                        className="flex-1 min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-orange-50/50 via-white to-orange-50/30 py-12 px-4 z-50 absolute inset-0"
                    >
                        <HardwareCheck onComplete={handleHardwareComplete} isStarting={isJoining} errorMessage={joinError} />
                    </motion.div>
                )}

                {token && serverUrl && phase !== "completed" && (
                    <div className={cn(
                        "flex-1 flex flex-col w-full h-full absolute inset-0 transition-opacity duration-1000 bg-black",
                        phase === "interview" ? "opacity-100 z-40 pointer-events-auto" : "opacity-0 z-0 pointer-events-none"
                    )}>
                        <LiveKitRoom
                            video={true}
                            audio={true}
                            token={token}
                            serverUrl={serverUrl}
                            connect={shouldConnect}
                            data-lk-theme="default"
                            className="flex-1 flex flex-col w-full h-full"
                        >
                            <InterviewRoomContent 
                                id={id} 
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
                                onRecordingComplete={(blob: Blob, duration: number) => {
                                    recordedChunksRef.current = [blob];
                                    uploadRecording(duration);
                                    setPhase("completed");
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
                                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Securing Interview Recording</h3>
                                <p className="text-sm font-bold text-gray-400 uppercase tracking-[0.2em]">Finalizing encrypted upload... Please stay on the page.</p>
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

            {/* FULLSCREEN ENFORCEMENT OVERLAY */}
            <AnimatePresence>
                {phase === "interview" && !isFullscreen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-black/60 backdrop-blur-3xl px-6"
                    >
                        <ShieldAlert className="w-16 h-16 text-orange-500 mb-6 animate-bounce" />
                        <h2 className="text-3xl font-black text-white text-center mb-3">Fullscreen Mode Required</h2>
                        <p className="text-orange-100/80 text-center max-w-sm mb-10 font-medium leading-relaxed">
                            To ensure interview integrity, you must stay in fullscreen. The AI Recruiter is waiting for you to return.
                        </p>
                        <button
                            onClick={requestFullscreenMode}
                            className="bg-orange-600 hover:bg-orange-500 text-white font-black px-12 py-5 rounded-full shadow-[0_20px_40px_rgba(234,88,12,0.4)] transition-all hover:scale-110 active:scale-95 flex items-center gap-3"
                        >
                            <Maximize className="w-5 h-5" />
                            Return to Fullscreen
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
                            <div className="p-2 bg-white/20 rounded-xl">
                                <ShieldCheck className="w-6 h-6 text-white animate-pulse" />
                            </div>
                            <div className="flex-1">
                                <p className="text-white text-xs font-black uppercase tracking-widest mb-0.5">Security Alert</p>
                                <p className="text-orange-50 text-[11px] font-bold leading-tight mb-3">Window switch or Fullscreen exit detected. This event has been logged for review.</p>
                                {!isFullscreen && (
                                    <button 
                                        onClick={requestFullscreenMode}
                                        className="bg-white text-orange-600 text-[10px] font-black px-3 py-1.5 rounded-lg flex items-center gap-1.5 active:scale-95 transition-transform"
                                    >
                                        <Maximize className="w-3 h-3" />
                                        RESTORE FULLSCREEN
                                    </button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showGreeting && phase === "interview" && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="absolute top-6 left-1/2 -translate-x-1/2 z-[120]"
                    >
                        <div className="px-5 py-3 rounded-2xl bg-white/95 border border-orange-100 shadow-xl text-gray-900 text-sm font-bold tracking-wide">
                            Hello! You are now connected. Interview is starting.
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
    onRecordingComplete,
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
    onRecordingComplete: (blob: Blob, duration: number) => void,
}) {
    const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
    const tracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
    const connectionState = useConnectionState();
    const lkRoom = useRoomContext();

    // AI Agent logic:
    const remoteTracks = useTracks([Track.Source.Microphone], { onlySubscribed: true });

    // Agent identity always starts with "agent-" — pick the LAST one (most recently joined = active)
    const agentTracks = remoteTracks.filter(t => t.participant.identity.startsWith("agent-"));
    const aiParticipantTrack = agentTracks[agentTracks.length - 1] ?? null;
    const isAiSpeaking = aiParticipantTrack?.participant.isSpeaking;
    const lastOutOfScreenSignalAtRef = useRef(0);
    
    // ── NEW PROCTORING STATE ──────────────────────────────────────
    const [strikes, setStrikes] = useState(0);
    const [isVerifying, setIsVerifying] = useState(false);
    const tabStartTimeRef = useRef<number | null>(null);

    // ── Recording Refs ─────────────────────────────────────────────
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const mixerDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const recordingStartTimeRef = useRef<number | null>(null);
    const mixerSourceLocalRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const mixerSourceRemoteRef = useRef<MediaStreamAudioSourceNode | null>(null);

    useEffect(() => {
        const mediaTrack =
            (aiParticipantTrack as any)?.publication?.track?.mediaStreamTrack ||
            (aiParticipantTrack as any)?.track?.mediaStreamTrack ||
            null;

        if (mediaTrack && mediaTrack.kind === "audio") {
            onRemoteAgentAudioTrack(mediaTrack);
            
            // Real-time mixing update: If we are recording and a new agent track joins
            if (audioContextRef.current && mixerDestinationRef.current) {
                try {
                    if (mixerSourceRemoteRef.current) mixerSourceRemoteRef.current.disconnect();
                    const source = audioContextRef.current.createMediaStreamSource(new MediaStream([mediaTrack]));
                    source.connect(mixerDestinationRef.current);
                    mixerSourceRemoteRef.current = source;
                    console.log("Mixed remote agent audio into live recording.");
                } catch (e) {
                    console.warn("Mixer sync update failed:", e);
                }
            }
            return;
        }
        onRemoteAgentAudioTrack(null);
    }, [aiParticipantTrack, onRemoteAgentAudioTrack]);

    // ── CONFLICT-FREE RECORDING LOGIC ───────────────────────────────
    useEffect(() => {
        if (!isInterviewActive || mediaRecorderRef.current || connectionState !== "connected" || !localParticipant) return;

        const startRecording = async () => {
            try {
                // Reuse existing LiveKit tracks (NO NEW getUserMedia)
                const videoTrack = localParticipant.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack;
                const audioTrack = localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;

                if (!videoTrack || !audioTrack) {
                    console.log("Waiting for local tracks for recording...");
                    return;
                }

                recordedChunksRef.current = [];
                const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
                audioContextRef.current = ctx;
                const dest = ctx.createMediaStreamDestination();
                mixerDestinationRef.current = dest;

                if (ctx.state === 'suspended') await ctx.resume();

                // Mix local mic
                const localSource = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
                localSource.connect(dest);
                mixerSourceLocalRef.current = localSource;

                // Mix existing remote agent if any
                const remoteTrack = (aiParticipantTrack as any)?.publication?.track?.mediaStreamTrack || 
                                  (aiParticipantTrack as any)?.track?.mediaStreamTrack;
                if (remoteTrack) {
                    const rSource = ctx.createMediaStreamSource(new MediaStream([remoteTrack]));
                    rSource.connect(dest);
                    mixerSourceRemoteRef.current = rSource;
                }

                const mixedStream = new MediaStream();
                mixedStream.addTrack(videoTrack);
                mixedStream.addTrack(dest.stream.getAudioTracks()[0]);

                const recorder = new MediaRecorder(mixedStream, { 
                    mimeType: "video/webm;codecs=vp9,opus", 
                    videoBitsPerSecond: 1500000 
                });

                recorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
                };
                
                recorder.start(1000);
                mediaRecorderRef.current = recorder;
                recordingStartTimeRef.current = Date.now();
                console.log("Blink-free recording initiated via LiveKit tracks.");
            } catch (err) {
                console.error("Recording setup failed:", err);
            }
        };

        startRecording();
    }, [isInterviewActive, connectionState, localParticipant, aiParticipantTrack]);

    // 3. Send Ready Signal to AI Agent
    useEffect(() => {
        if (isInterviewActive && localParticipant && connectionState === "connected") {
            const encoder = new TextEncoder();
            const data = encoder.encode(JSON.stringify({ type: "user_ready" }));
            localParticipant.publishData(data, { reliable: true });
            console.log("Sent user_ready signal to Agent");
        }
    }, [isInterviewActive, localParticipant, connectionState]);

    useEffect(() => {
        if (!isInterviewActive || !localParticipant || connectionState !== "connected") {
            return;
        }

        const sendOutOfScreenSignal = () => {
            if (!isInterviewActive || timerExpired) return;
            
            const now = Date.now();
            if (now - lastOutOfScreenSignalAtRef.current < 3000) return;
            lastOutOfScreenSignalAtRef.current = now;

            // Trigger UI Warning
            onSecurityViolation();

            const encoder = new TextEncoder();
            const data = encoder.encode(JSON.stringify({ type: "candidate_out_of_screen" }));
            localParticipant.publishData(data, { reliable: true });
        };

        const onVisibilityChange = () => {
            if (!isInterviewActive) return;

            if (document.hidden) {
                // User left the tab
                tabStartTimeRef.current = Date.now();
            } else if (tabStartTimeRef.current) {
                // User returned to the tab
                const now = Date.now();
                const duration = (now - tabStartTimeRef.current) / 1000;
                const newStrikeCount = strikes + 1;
                
                setStrikes(newStrikeCount);
                
                // ⚠️ ONLY LOCK THE SCREEN FOR STRIKE 2 AND ABOVE
                if (newStrikeCount >= 2) {
                    setIsVerifying(true);
                }

                // Publish detailed violation data to the Agent
                const encoder = new TextEncoder();
                const data = encoder.encode(JSON.stringify({ 
                    type: "tab_violation", 
                    strike: newStrikeCount, 
                    duration: duration.toFixed(1) 
                }));
                localParticipant.publishData(data, { reliable: true });

                // 10-second security penalty (If locked)
                if (newStrikeCount >= 2) {
                    setTimeout(() => {
                        setIsVerifying(false);
                        tabStartTimeRef.current = null;
                    }, 10000); 
                } else {
                    tabStartTimeRef.current = null;
                }
            }
        };

        const onWindowBlur = () => {
            // Delay slightly because blur fires just before visibilitychange.
            // If it's a tab switch, document.hidden will become true within milliseconds.
            setTimeout(() => {
                if (document.hidden || !isInterviewActive) return;
                sendOutOfScreenSignal();
            }, 200);
        };

        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("blur", onWindowBlur);

        return () => {
            document.removeEventListener("visibilitychange", onVisibilityChange);
            window.removeEventListener("blur", onWindowBlur);
        };
    }, [isInterviewActive, localParticipant, connectionState, strikes, timerExpired, onSecurityViolation]);

    const handleFinish = useCallback(async () => {
        onAllowExitNow();

        // Stop recording and capture blob
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== "inactive") {
            recorder.onstop = () => {
                const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
                const now = Date.now();
                const start = recordingStartTimeRef.current || now;
                const duration = Math.max(1, Math.round((now - start) / 1000));
                onRecordingComplete(blob, duration);

                // Housekeeping
                if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
                mediaRecorderRef.current = null;
            };
            recorder.stop();
        }

        // Disconnect from LiveKit in the background — don't await
        try {
            if (localParticipant) {
                const encoder = new TextEncoder();
                const data = encoder.encode(JSON.stringify({ type: "interview_finished" }));
                localParticipant.publishData(data, { reliable: true }).catch(() => {});
            }
        } catch (_) {}

        try {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
            }
        } catch (_) {}

        // Disable media tracks
        try {
            if (localParticipant) {
                localParticipant.setCameraEnabled(false).catch(() => {});
                localParticipant.setMicrophoneEnabled(false).catch(() => {});
            }
        } catch (_) {}

        // Trigger recording stop + upload in background, show completed immediately
        onFinalizing(); 
        
        // Disconnect room in background
        setTimeout(() => {
            try { lkRoom?.disconnect(); } catch (_) {}
        }, 500);
    }, [
        onAllowExitNow, 
        onRecordingComplete, 
        onFinalizing, 
        localParticipant, 
        lkRoom
    ]);

    // Listen for termination signal from Agent
    useEffect(() => {
        const handleData = (payload: Uint8Array) => {
            try {
                const data = JSON.parse(new TextDecoder().decode(payload));
                if (data.type === "interview_terminated") {
                    console.log("🛑 Interview terminated by Agent:", data.reason);
                    handleFinish();
                }
            } catch (e) {
                // Ignore non-JSON or other data
            }
        };

        lkRoom.on(RoomEvent.DataReceived, handleData);
        return () => {
            lkRoom.off(RoomEvent.DataReceived, handleData);
        };
    }, [lkRoom, handleFinish]);


    return (
        <div className="flex-1 flex flex-col h-full w-full relative">
            <RoomAudioRenderer />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-orange-500/5 via-transparent to-transparent opacity-40 pointer-events-none" />

            {/* Main Center UI: AI Avatar */}
            <div className="flex-1 flex flex-col items-center justify-center z-10 p-8">
                <div className="relative inline-block scale-110">
                    <motion.div 
                        animate={{ 
                            scale: isAiSpeaking ? [1, 1.15, 1] : [1, 1.05, 1],
                            boxShadow: isAiSpeaking ? [
                                "0 0 0 0px rgba(249,115,22,0.4)",
                                "0 0 0 60px rgba(249,115,22,0)",
                                "0 0 0 0px rgba(249,115,22,0.4)"
                            ] : [
                                "0 0 0 0px rgba(249,115,22,0.1)",
                                "0 0 0 20px rgba(249,115,22,0)",
                                "0 0 0 0px rgba(249,115,22,0.1)"
                            ]
                        }}
                        transition={{ duration: isAiSpeaking ? 0.3 : 3, repeat: Infinity, ease: "easeInOut" }}
                        className="w-40 h-40 rounded-full bg-gradient-to-tr from-[#F97316] to-orange-400 flex items-center justify-center p-1.5 shadow-[0_0_50px_rgba(249,115,22,0.3)]"
                    >
                        <div className="w-full h-full rounded-full bg-gray-950 flex items-center justify-center overflow-hidden">
                            <AnimatePresence mode="wait">
                                {isAiSpeaking ? (
                                    <motion.div
                                        key="speaking"
                                        initial={{ opacity: 0, scale: 0.5 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 1.5 }}
                                        className="flex items-end gap-1.5 h-12"
                                    >
                                        <SpeakingWaves />
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="idle"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex flex-col items-center"
                                    >
                                        <Sparkles className="w-12 h-12 text-[#F97316] animate-pulse" />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                    
                    <div className="mt-8 text-center space-y-2">
                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter">
                            {isAiSpeaking ? "AI is Speaking..." : "AI is Listening"}
                        </h3>
                        <p className="text-gray-500 text-xs font-bold tracking-[0.2em] uppercase">Professional AI Recruiter</p>
                    </div>
                </div>
            </div>

            {/* Local Video Preview */}
            <div className="absolute top-8 right-8 w-48 aspect-square rounded-3xl overflow-hidden border-2 border-white/10 shadow-2xl bg-gray-900 group">

                {tracks.map((track) => (
                    <div key={track.participant.identity} className="w-full h-full relative">
                        {track.source === Track.Source.Camera && (
                            <div className="w-full h-full scale-x-[-1]">
                                <VideoTrack trackRef={track} />
                            </div>
                        )}
                    </div>
                ))}
                {!isCameraEnabled && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                        <VideoOff className="w-8 h-8 text-gray-600" />
                    </div>
                )}
                
                {/* Candidate Speaking Indicator */}
                <AnimatePresence>
                    {localParticipant.isSpeaking && (
                        <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute bottom-10 left-0 right-0 flex justify-center items-end gap-1 h-6 pointer-events-none"
                        >
                            <SpeakingWaves count={4} color="bg-orange-400" />
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="absolute bottom-3 left-3 px-2 py-1 bg-black/40 backdrop-blur-md rounded-lg border border-white/10 flex items-center gap-2">
                    <div className={cn(
                        "w-1.5 h-1.5 rounded-full transition-colors duration-300",
                        localParticipant.isSpeaking ? "bg-orange-400 animate-pulse" : "bg-gray-500"
                    )} />
                    <p className="text-[10px] font-bold text-white uppercase tracking-widest">You</p>
                </div>
            </div>

            {/* Top Bar */}
            <div className="absolute top-8 left-8 flex items-center gap-4">
                <div className="h-10 w-1.5 bg-[#F97316] rounded-full shadow-[0_0_12px_rgba(249,115,22,0.4)]" />
                <div>
                     <h1 className="text-xl font-black text-white uppercase tracking-wider">AI INTERVIEW</h1>
                     <div className="flex items-center gap-2">
                         <div className={cn("w-2 h-2 rounded-full", connectionState === "connected" ? "bg-green-500" : "bg-yellow-500 animate-pulse")} />
                         <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                            {connectionState === "connected" ? "Secure Connection" : "Connecting..."}
                         </span>
                     </div>
                     <div className="mt-1.5 flex items-center gap-2">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Time Left</span>
                        <span className={cn(
                            "text-[11px] font-black tracking-wider",
                            timerExpired ? "text-amber-400" : "text-orange-300"
                        )}>
                            {timeLabel}
                        </span>
                        {timerExpired && (
                            <span className="text-[10px] font-black text-amber-300 uppercase tracking-widest">Time Completed</span>
                        )}
                     </div>
                </div>
            </div>

            {/* Bottom Controls */}
            <div className="absolute bottom-8 left-0 right-0 z-50 flex justify-center items-center gap-6 px-8 pointer-events-none">
                <div className="flex items-center gap-4 p-2 bg-white/5 backdrop-blur-3xl rounded-full border border-white/10 pointer-events-auto">
                    <Button 
                        variant="destructive" 
                        className="h-14 px-10 rounded-full font-black uppercase tracking-widest shadow-lg shadow-red-500/40 hover:scale-105 transition-transform active:scale-95 cursor-pointer"
                        onClick={handleFinish}
                    >
                        <PhoneOff className="w-5 h-5 mr-3" />
                        Finish Interview
                    </Button>
                </div>
            </div>

            {/* Security Verification / Penalty Overlay */}
            <AnimatePresence>
                {isVerifying && (
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[2000] bg-white/95 backdrop-blur-2xl flex flex-col items-center justify-center p-12 overflow-hidden"
                    >
                        <div className="relative mb-10 overflow-hidden">
                            <motion.div 
                                animate={{ rotate: 360 }}
                                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                                className="w-32 h-32 border-t-4 border-l-4 border-orange-600 rounded-full"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <ShieldAlert className="w-12 h-12 text-orange-600" />
                            </div>
                        </div>

                        <h2 className="text-4xl font-black text-gray-900 tracking-tighter uppercase italic text-center">
                            Security Verification...
                        </h2>
                        <p className="text-gray-500 font-bold mt-4 text-center max-w-md">
                            Tab switch detected. Your interview environment is being re-secured for integrity. 
                            Please wait while we sync with the server.
                        </p>
                        
                        {/* Visual Strike Indicator */}
                        <div className="mt-12 flex flex-col items-center gap-4">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Violation History</p>
                            <div className="flex gap-3">
                                {[1, 2, 3].map((s) => (
                                    <div 
                                        key={s} 
                                        className={cn(
                                            "w-20 h-2.5 rounded-full transition-all duration-500",
                                            strikes >= s 
                                                ? "bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.6)]" 
                                                : "bg-gray-100"
                                        )} 
                                    />
                                ))}
                            </div>
                            <p className="text-xs font-black text-red-500 uppercase tracking-widest mt-2">
                                {strikes === 3 ? "DISQUALIFIED" : `STRIKE ${strikes} OF 3`}
                            </p>
                        </div>

                        <div className="mt-12 w-64 h-1 bg-gray-100 rounded-full overflow-hidden">
                            <motion.div 
                                initial={{ width: "0%" }}
                                animate={{ width: "100%" }}
                                transition={{ duration: 10, ease: "linear" }}
                                className="h-full bg-orange-600"
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function SpeakingWaves({ count = 5, color = "bg-[#F97316]" }: { count?: number, color?: string }) {
    return (
        <>
            {[...Array(count)].map((_, i) => (
                <motion.div
                    key={i}
                    animate={{ height: [10, 40, 15, 30, 10] }}
                    transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
                    className={cn("w-1.5 rounded-full", color)}
                />
            ))}
        </>
    );
}

function VideoTrack({ trackRef }: { trackRef: TrackReference }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && trackRef.publication?.track) {
      trackRef.publication.track.attach(videoRef.current);
    }
    return () => { trackRef.publication?.track?.detach(); };
  }, [trackRef]);
  return <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline />;
}

function CompletionView() {
    return (
        <div className="text-center px-4 max-w-lg">
            <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.2 }}
                className="inline-flex p-6 bg-green-50 rounded-[2.5rem] mb-8"
            >
                <CheckCircle2 className="w-16 h-16 text-green-500" />
            </motion.div>
            <h2 className="text-4xl font-black text-gray-900 tracking-tight mb-4">Thank you for submitting!</h2>
            <p className="text-lg text-gray-500 font-medium mb-10 leading-relaxed">Your AI interview session has been successfully recorded and sent to our hiring team. We'll be in touch soon.</p>
            <div className="flex flex-col gap-4">
                <Button 
                    size="lg"
                    className="h-16 rounded-2xl bg-[#F97316] hover:bg-orange-600 text-white font-black uppercase tracking-widest shadow-[0_15px_40px_rgba(249,115,22,0.3)] transition-all active:scale-95"
                    onClick={() => window.location.href = "/careers"}
                >
                    Explore More Jobs
                    <ArrowRight className="ml-3 w-5 h-5" />
                </Button>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">Lumoscale Talent Platform</p>
            </div>
        </div>
    );
}

export default function InterviewPage({ params }: InterviewPageProps) {
    const { id } = use(params);
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-white text-gray-400">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-orange-500" />
                    <p className="text-sm font-bold uppercase tracking-widest animate-pulse">Initializing Setup...</p>
                </div>
            </div>
        }>
            <InterviewContent id={id} params={params} />
        </Suspense>
    );
}
