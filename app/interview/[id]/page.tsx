"use client";
import { Suspense, useState, use, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Mic2, ShieldCheck, ShieldAlert, Zap, ChevronRight, Send, Loader2, Video, VideoOff, MicOff, PhoneOff, CheckCircle2, ArrowRight, Camera, Mic, AlertCircle, LogOut, Eye, EyeOff, Users, Volume2, WifiOff, User, MousePointer2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AuraVisualizer } from "@/components/agents-ui/aura-visualizer";
import { HardwareCheck } from "@/components/careers/interview/HardwareCheck";
import { FaceProctoring } from "@/components/careers/interview/FaceProctoring";
import { AudioProctoring } from "@/components/careers/interview/AudioProctoring";
import { MouseProctoring } from "@/components/careers/interview/MouseProctoring";
import { HardwareHeartbeat } from "@/components/careers/interview/HardwareHeartbeat";
import { ConnectionProctoring } from "@/components/careers/interview/ConnectionProctoring";
import { collectDeviceFingerprint } from "@/lib/device-fingerprint";
import { useSearchParams } from "next/navigation";
import { isInterviewTokenRequired } from "@/lib/interview-access";
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
    useVoiceAssistant,
    useRoomContext,
    useTranscriptions,
} from "@livekit/components-react";


import type { TextStreamData as TranscriptionSegment } from "@livekit/components-react";
import "@livekit/components-styles";

import { Track, RoomEvent } from "livekit-client";

import type { Room } from "livekit-client";


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

/** Typewriter component: streams text word-by-word whenever text changes. */
const StreamingText = memo(function StreamingText({ text, className }: { text: string; className?: string }) {
    // With TTS-aligned transcripts enabled, the backend sends text exactly when it's spoken.
    // We no longer need a manual 40ms timer to "guess" the speed.
    return (
        <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={className}
        >
            {text}
        </motion.p>
    );
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
    const agentReadyCommittedRef = useRef(false);
    const launchStartedAtRef = useRef<number | null>(null);
    const lkRoomRef = useRef<Room | null>(null);
    const readySignalSentFromParentRef = useRef(false);
    const connectionAttemptRef = useRef(0);


    const [isAgentReady, setIsAgentReady] = useState(false);
    const [agentReadyLatencyMs, setAgentReadyLatencyMs] = useState<number | null>(null);
    const [launchTimeoutCheck, setLaunchTimeoutCheck] = useState(0);
    const [isTabViolation, setIsTabViolation] = useState(false);
    const [isFullscreenViolation, setIsFullscreenViolation] = useState(false);

    //  AI Face Proctoring 
    const [referenceSnapshotUrl, setReferenceSnapshotUrl] = useState<string | null>(null);
    const [faceViolationAlert, setFaceViolationAlert] = useState<{ type: string; reason: string } | null>(null);
    const faceViolationTimerRef = useRef<NodeJS.Timeout | null>(null);

    //  Audio Proctoring 
    const [audioViolationAlert, setAudioViolationAlert] = useState<{ reason: string } | null>(null);
    const audioViolationTimerRef = useRef<NodeJS.Timeout | null>(null);

    //  Hardware Heartbeat 
    const [hardwareViolationAlert, setHardwareViolationAlert] = useState<{ type: string; reason: string } | null>(null);
    const hardwareViolationTimerRef = useRef<NodeJS.Timeout | null>(null);

    //  Connection Proctoring 
    const [connectionAlert, setConnectionAlert] = useState<{ eventType: string; reason: string } | null>(null);
    const connectionAlertTimerRef = useRef<NodeJS.Timeout | null>(null);

    // -- Mouse Proctoring (+ Deepgram Nova-3 cross-signal) ----------------
    const [mouseViolationAlert, setMouseViolationAlert] = useState<{ eventType: string; reason: string; severity: string } | null>(null);
    const mouseViolationTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [soundViolationAlert, setSoundViolationAlert] = useState<{ eventType: string; reason: string; severity: string } | null>(null);
    const soundViolationTimerRef = useRef<NodeJS.Timeout | null>(null);
    /**
     * Shared ref updated by InterviewRoomContent whenever a candidate transcript
     * segment arrives from Deepgram Nova-3. MouseProctoring reads this to
     * calculate candidate-silence windows for cross-signal correlation.
     */
    const lastCandidateTranscriptAtRef = useRef<number | null>(null);

    const searchParams = useSearchParams();
    const interviewToken = searchParams.get("token") || "";
    const requireInterviewToken = isInterviewTokenRequired();

    // Load reference snapshot from sessionStorage (set by HardwareCheck after camera capture)
    useEffect(() => {
        try {
            const snap = sessionStorage.getItem("proctor_ref_snapshot");
            if (snap) setReferenceSnapshotUrl(snap);
        } catch { }
    }, []);

    //  Face violation handler 
    const handleFaceViolation = useCallback((eventType: string, reason: string, severity?: "low" | "medium" | "high") => {
        // 1. Show transient alert to candidate (auto-dismiss after 6s)
        setFaceViolationAlert({ type: eventType, reason });
        if (faceViolationTimerRef.current) clearTimeout(faceViolationTimerRef.current);
        faceViolationTimerRef.current = setTimeout(() => setFaceViolationAlert(null), 6000);

        // 2. Send to backend for audit trail
        fetch("/api/interview/proctoring", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                applicationId: id,
                interviewToken,
                events: [{
                    eventType,
                    severity: severity ?? "medium",
                    timestamp: Date.now(),
                    reason,
                }],
            }),
        }).catch(() => { });

        // 3. Signal agent via data channel (optional - agent can adjust)
        const room = lkRoomRef.current;
        if (room?.localParticipant) {
            try {
                const data = new TextEncoder().encode(JSON.stringify({ type: "face_proctoring_violation", eventType, timestamp: Date.now() }));
                room.localParticipant.publishData(data, { reliable: true }).catch(() => { });
            } catch { }
        }
    }, [id, interviewToken]);

    //  Audio violation handler 
    const handleAudioViolation = useCallback((eventType: string, reason: string, severity?: "low" | "medium" | "high") => {
        // 1. Show transient toast to candidate (auto-dismiss after 6s)
        setAudioViolationAlert({ reason });
        if (audioViolationTimerRef.current) clearTimeout(audioViolationTimerRef.current);
        audioViolationTimerRef.current = setTimeout(() => setAudioViolationAlert(null), 6000);

        // 2. Send to backend for audit trail
        fetch("/api/interview/proctoring", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                applicationId: id,
                interviewToken,
                events: [{
                    eventType,
                    severity: severity ?? "medium",
                    timestamp: Date.now(),
                    reason,
                }],
            }),
        }).catch(() => { });

        // 3. Signal agent via data channel
        const room = lkRoomRef.current;
        if (room?.localParticipant) {
            try {
                const data = new TextEncoder().encode(JSON.stringify({ type: "audio_proctoring_violation", eventType, timestamp: Date.now() }));
                room.localParticipant.publishData(data, { reliable: true }).catch(() => { });
            } catch { }
        }
    }, [id, interviewToken]);

    //  Hardware heartbeat violation handler 
    const handleHardwareViolation = useCallback((eventType: string, reason: string, severity?: "low" | "medium" | "high") => {
        // 1. Show transient alert to candidate (8s - longer for high-severity)
        setHardwareViolationAlert({ type: eventType, reason });
        if (hardwareViolationTimerRef.current) clearTimeout(hardwareViolationTimerRef.current);
        hardwareViolationTimerRef.current = setTimeout(() => setHardwareViolationAlert(null), 8000);

        // 2. Send to backend for audit trail
        fetch("/api/interview/proctoring", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                applicationId: id,
                interviewToken,
                events: [{
                    eventType,
                    severity: severity ?? "high",
                    timestamp: Date.now(),
                    reason,
                }],
            }),
        }).catch(() => { });

        // 3. Signal agent via data channel
        const room = lkRoomRef.current;
        if (room?.localParticipant) {
            try {
                const data = new TextEncoder().encode(JSON.stringify({ type: "hardware_violation", eventType, timestamp: Date.now() }));
                room.localParticipant.publishData(data, { reliable: true }).catch(() => { });
            } catch { }
        }
    }, [id, interviewToken]);

    //  Connection violation handler 
    const handleConnectionViolation = useCallback((eventType: string, reason: string, severity?: "low" | "medium" | "high") => {
        // 1. Show toast to candidate (5 s for restored, 8 s for lost)
        const displayMs = eventType === "connection_restored" ? 5000 : 8000;
        setConnectionAlert({ eventType, reason });
        if (connectionAlertTimerRef.current) clearTimeout(connectionAlertTimerRef.current);
        connectionAlertTimerRef.current = setTimeout(() => setConnectionAlert(null), displayMs);

        // 2. Send to backend for audit trail
        fetch("/api/interview/proctoring", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                applicationId: id,
                interviewToken,
                events: [{
                    eventType,
                    severity: severity ?? "medium",
                    timestamp: Date.now(),
                    reason,
                }],
            }),
        }).catch(() => { });
    }, [id, interviewToken]);

    // -- Mouse violation handler (Deepgram Nova-3 cross-signal) -----------------
    const handleMouseViolation = useCallback((eventType: string, reason: string, severity?: "low" | "medium" | "high") => {
        // Determine display duration by severity
        const displayMs = severity === "high" ? 9000 : severity === "low" ? 5000 : 7000;

        // 1. Show transient toast to candidate
        setMouseViolationAlert({ eventType, reason, severity: severity ?? "medium" });
        if (mouseViolationTimerRef.current) clearTimeout(mouseViolationTimerRef.current);
        mouseViolationTimerRef.current = setTimeout(() => setMouseViolationAlert(null), displayMs);

        // 2. Send to backend for audit trail
        fetch("/api/interview/proctoring", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                applicationId: id,
                interviewToken,
                events: [{
                    eventType,
                    severity: severity ?? "medium",
                    timestamp: Date.now(),
                    reason,
                }],
            }),
        }).catch(() => { });

        // 3. Signal agent via data channel
        const room = lkRoomRef.current;
        if (room?.localParticipant) {
            try {
                const data = new TextEncoder().encode(
                    JSON.stringify({ type: "mouse_proctoring_violation", eventType, severity, timestamp: Date.now() })
                );
                room.localParticipant.publishData(data, { reliable: true }).catch(() => { });
            } catch { }
        }
    }, [id, interviewToken]);

    // -- Clipboard Paste violation handler -------------------------------------
    const handlePasteViolation = useCallback((eventType: string, reason: string, severity?: "low" | "medium" | "high") => {
        // 1. Show transient alert to candidate
        setMouseViolationAlert({ eventType: "behavior_flag", reason, severity: "medium" });
        if (mouseViolationTimerRef.current) clearTimeout(mouseViolationTimerRef.current);
        mouseViolationTimerRef.current = setTimeout(() => setMouseViolationAlert(null), 6000);

        // 2. Send to backend for audit trail
        fetch("/api/interview/proctoring", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                applicationId: id,
                interviewToken,
                events: [{
                    eventType,
                    severity: severity ?? "medium",
                    timestamp: Date.now(),
                    reason,
                }],
            }),
        }).catch(() => { });

        // 3. Signal agent via data channel
        const room = lkRoomRef.current;
        if (room?.localParticipant) {
            try {
                const data = new TextEncoder().encode(
                    JSON.stringify({ type: "clipboard_paste", eventType, timestamp: Date.now() })
                );
                room.localParticipant.publishData(data, { reliable: true }).catch(() => { });
            } catch { }
        }
    }, [id, interviewToken]);

    // -- Generic Agent-Detected Violation handler (Syncs Agent events to Candidate UI) --
    const handleAgentDetectedViolation = useCallback((eventType: string, reason: string, severity?: string) => {
        // This is called when the Agent sends a 'proctoring_violation' packet over the data channel
        setSoundViolationAlert({ eventType, reason, severity: severity ?? "medium" });
        if (soundViolationTimerRef.current) clearTimeout(soundViolationTimerRef.current);
        soundViolationTimerRef.current = setTimeout(() => setSoundViolationAlert(null), 8000);
    }, []);

    // Countdown ticker - purely visual, counts up for display purposes
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
            connectionAttemptRef.current += 1;
            // Reset connection state so the next attempt creates a fresh dispatch
            setToken(null);
            setServerUrl(null);
            setShouldConnect(false);
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
                    body: JSON.stringify({
                        applicationId: id,
                        interviewToken: interviewToken
                    }),
                    keepalive: true,
                }).catch(() => { });
            }
        };

        window.addEventListener("pagehide", handleExit);

        return () => {
            window.removeEventListener("pagehide", handleExit);
        };
    }, [id, phase]);

    useEffect(() => {
        if (phase !== "launching") return;
        if (!isAgentReady || agentReadyCommittedRef.current) return;

        agentReadyCommittedRef.current = true;
        setPhase("interview");
    }, [phase, isAgentReady]);

    const isExitUnlocked = phase === "completed" || timerExpired;
    const isInterviewLocked = (phase === "interview") && !isExitUnlocked;

    const stopTracks = (stream: MediaStream | null) => {
        if (!stream) return;
        stream.getTracks().forEach((track) => track.stop());
    };

    const handleRemoteAgentAudioTrack = useCallback((track: MediaStreamTrack | null) => {
        // Handled by child component
    }, []);




    const tokenRequestRef = useRef<Promise<boolean> | null>(null);

    const ensureWarmConnection = useCallback(async (): Promise<boolean> => {
        const requestAttempt = connectionAttemptRef.current;

        if (token && serverUrl) {
            return true;
        }

        if (requireInterviewToken && !interviewToken) {
            console.error("Warm connection failed: missing interview security token in the URL.");
            return false;
        }

        if (tokenRequestRef.current) {
            return tokenRequestRef.current;
        }

        tokenRequestRef.current = (async () => {
            try {
                // Collect device fingerprint for Smart Collusion Detection.
                // This is capability data only (screen res, CPU cores, platform, DPR)
                // - no PII is sent. The server hashes and never stores raw values.
                const deviceFingerprint = collectDeviceFingerprint();

                const res = await fetch("/api/interview/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        applicationId: id,
                        interviewToken: interviewToken,
                        participantName: "Candidate",
                        deviceFingerprint,
                    }),
                });

                const data = await res.json();
                if (requestAttempt !== connectionAttemptRef.current) {
                    return false;
                }
                if (res.ok && data.token && data.serverUrl) {
                    setToken(data.token);
                    setServerUrl(data.serverUrl);
                    if (typeof data.duration === "number" && data.duration > 0) {
                        setSessionDuration(data.duration);
                        setRemainingSeconds(data.duration);
                    }
                    console.log("Warm connection prepared.");
                    return true;
                }

                console.error(
                    "Warm connection failed:",
                    data?.error || "Invalid token payload",
                    data?.details || {}
                );
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


    // Token is fetched on demand when the user clicks "I'm Ready".

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

    const requestFullscreenMode = useCallback(async () => {
        try {
            const elem = document.documentElement as any;
            const rfs = elem.requestFullscreen || elem.webkitRequestFullscreen || elem.mozRequestFullScreen || elem.msRequestFullscreen;
            if (rfs) {
                await rfs.call(elem);
                setIsFullscreenViolation(false);
            }
        } catch (err) {
            console.warn("Fullscreen request failed:", err);
        }
    }, []);

    const handleHardwareComplete = async () => {
        setIsJoining(true);
        setJoinError(null);

        try {
            if (!interviewToken) {
                if (requireInterviewToken) {
                    throw new Error("This interview link is missing its security token. Please reopen the interview link from your invitation email or dashboard.");
                }
            }

            // Enter fullscreen on user gesture IMMEDIATELY
            await requestFullscreenMode();

            // Enter launching phase...
            connectionAttemptRef.current += 1;
            agentReadyCommittedRef.current = false;
            readySignalSentFromParentRef.current = false;
            launchStartedAtRef.current = performance.now();
            setIsAgentReady(false);
            setAgentReadyLatencyMs(null);
            setPhase("launching");

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

            // Unlock audio context...
            if (lkRoomRef.current) {
                lkRoomRef.current.startAudio().catch(() => { });
            }

        } catch (err) {
            console.error("Phase transition failed:", err);
            setJoinError(err instanceof Error ? err.message : "Unable to start interview.");
            // Reset connection so a fresh dispatch is created on retry
            connectionAttemptRef.current += 1;
            setToken(null);
            setServerUrl(null);
            setShouldConnect(false);
            setIsAgentReady(false);
            setAgentReadyLatencyMs(null);
            launchStartedAtRef.current = null;
            agentReadyCommittedRef.current = false;
            setPhase("check");
        } finally {
            setIsJoining(false);
        }
    };


    useEffect(() => {
        if (phase !== "interview") {
            setIsTabViolation(false);
            return;
        }

        const handleViolation = () => {
            setIsTabViolation(true);

            // Telemetry: Log to backend
            fetch("/api/interview/proctoring", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    applicationId: id,
                    interviewToken: interviewToken,
                    events: [{
                        eventType: "tab_switch",
                        severity: "medium",
                        timestamp: Date.now(),
                        reason: document.hidden ? "Tab Switched" : "Window Blurred"
                    }]
                })
            }).catch(() => { });

            // Also signal to agent if possible via data channel
            const room = lkRoomRef.current;
            if (room?.localParticipant) {
                const encoder = new TextEncoder();
                const data = encoder.encode(JSON.stringify({
                    type: "tab_violation",
                    timestamp: Date.now()
                }));
                room.localParticipant.publishData(data, { reliable: true }).catch(() => { });
            }
        };

        const onVisibilityChange = () => {
            if (document.hidden) handleViolation();
        };

        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("blur", handleViolation);

        return () => {
            document.removeEventListener("visibilitychange", onVisibilityChange);
            window.removeEventListener("blur", handleViolation);
        };
    }, [phase, id]);

    useEffect(() => {
        if (phase !== "interview") {
            setIsFullscreenViolation(false);
            return;
        }

        const onFullscreenChange = () => {
            const isFS = !!(document.fullscreenElement || (document as any).webkitFullscreenElement || (document as any).mozFullScreenElement || (document as any).msFullscreenElement);

            if (!isFS) {
                setIsFullscreenViolation(true);

                // Telemetry
                fetch("/api/interview/proctoring", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        applicationId: id,
                        interviewToken: interviewToken,
                        events: [{
                            eventType: "fullscreen_exit",
                            severity: "high",
                            timestamp: Date.now(),
                            reason: "Manually Exited Fullscreen"
                        }]
                    })
                }).catch(() => { });

                const room = lkRoomRef.current;
                if (room?.localParticipant) {
                    const encoder = new TextEncoder();
                    const data = encoder.encode(JSON.stringify({
                        type: "candidate_out_of_screen",
                        timestamp: Date.now()
                    }));
                    room.localParticipant.publishData(data, { reliable: true }).catch(() => { });
                }
            } else {
                setIsFullscreenViolation(false);
            }
        };

        document.addEventListener("fullscreenchange", onFullscreenChange);
        document.addEventListener("webkitfullscreenchange", onFullscreenChange);
        document.addEventListener("mozfullscreenchange", onFullscreenChange);
        document.addEventListener("MSFullscreenChange", onFullscreenChange);

        // Immediate check on start
        onFullscreenChange();

        return () => {
            document.removeEventListener("fullscreenchange", onFullscreenChange);
            document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
            document.removeEventListener("mozfullscreenchange", onFullscreenChange);
            document.removeEventListener("MSFullscreenChange", onFullscreenChange);
        };
    }, [phase, id]);

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

        const updateRemaining = () => {
            const nextRemaining = Math.max(0, Math.ceil((interviewEndsAt - Date.now()) / 1000));
            setRemainingSeconds((prev) => (prev === nextRemaining ? prev : nextRemaining));

            if (nextRemaining <= 0) {
                setTimerExpired((prev) => (prev ? prev : true));
            }
        };

        const timer = window.setInterval(updateRemaining, 1000);

        return () => window.clearInterval(timer);
    }, [phase, interviewEndsAt, timerExpired]);

    useEffect(() => {
        if (phase !== "completed" && phase !== "finalizing") return;
        setShouldConnect(false);
    }, [phase]);

    return (
        <div ref={containerRef} className="min-h-screen bg-white text-gray-900 flex flex-col font-sans relative overflow-hidden" style={{ transform: 'translateZ(0)' }}>
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
                            interviewToken={interviewToken}
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
                            <div className="relative h-32 w-32" style={{ transform: 'translateZ(0)' }}>
                                <div className="absolute inset-0 rounded-full border-2 border-orange-500/10" />
                                <div className="absolute inset-2 rounded-full border-2 border-orange-500/20" />
                                <div className="relative h-full w-full rounded-full border-2 border-orange-500/40 bg-zinc-900/90 flex items-center justify-center shadow-[0_0_60px_rgba(249,115,22,0.1)]">
                                    <Sparkles className="h-10 w-10 text-orange-500" />
                                </div>
                            </div>
                            <div className="space-y-3">
                                <h3 className="text-2xl font-black text-white uppercase tracking-tight">
                                    {isAgentReady ? "Your Interviewer is Ready" : "Setting Up Interview Room"}
                                </h3>
                                <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.25em] max-w-[300px]">
                                    {isAgentReady
                                        ? `Agent ready in ${agentReadyLatencyMs ?? 0}ms. Starting interview...`
                                        : "Please wait - connecting your AI interviewer."}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {(["Mic & Camera", "Room Link", "AI Agent"] as const).map((step, i) => {
                                    const done = i === 0 ? true : i === 1 ? !!token : isAgentReady;
                                    return (
                                        <div key={step} className="flex items-center gap-2">
                                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${done
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
                        <CompletionView id={id} interviewToken={interviewToken} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/*  AI Face Proctoring (runs silently during interview)  */}
            <FaceProctoring
                applicationId={id}
                interviewToken={interviewToken}
                isActive={phase === "interview"}
                referenceSnapshotUrl={referenceSnapshotUrl}
                onViolation={handleFaceViolation}
            />

            {/*  Audio Proctoring (Web Audio API secondary-voice detection)  */}
            <AudioProctoring
                applicationId={id}
                interviewToken={interviewToken}
                isActive={phase === "interview"}
                onViolation={handleAudioViolation}
            />

            {/*  Hardware Heartbeat (MediaStreamTrack API camera/mic monitoring) */}
            <HardwareHeartbeat
                applicationId={id}
                interviewToken={interviewToken}
                isActive={phase === "interview"}
                onViolation={handleHardwareViolation}
            />

            {/* Interview room - outside AnimatePresence intentionally.
                It pre-renders as soon as the launching phase has prepared a token
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
                            candidateName={"Candidate"}
                            onCandidateTranscript={() => {
                                // Deepgram Nova-3 fired a candidate segment - update silence clock
                                lastCandidateTranscriptAtRef.current = Date.now();
                            }}
                            onAgentDetectedViolation={handleAgentDetectedViolation}
                            onPasteViolation={handlePasteViolation}
                        />
                        {/*  Connection Proctoring (lives inside LiveKitRoom for useRoomContext) */}
                        <ConnectionProctoring
                            isActive={phase === "interview"}
                            onViolation={handleConnectionViolation}
                        />
                    </LiveKitRoom>
                </div>
            )}

            {/* Connection Bridge Status - Stable outside loop */}
            {phase === "check" && shouldConnect && (
                <div key="connection-pulse" className="fixed bottom-4 left-4 z-[200] flex items-center gap-2 px-3 py-1 bg-black/80 rounded-full border border-black/5 shadow-sm" style={{ transform: 'translateZ(0)' }}>
                    <div className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        token ? "bg-green-500" : "bg-gray-300"
                    )} />
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-400">
                        {token ? "AI Link Ready" : "Warming System..."}
                    </span>
                </div>
            )}

            <AnimatePresence>
                {isTabViolation && phase === "interview" && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] bg-zinc-950/90 backdrop-blur-md flex items-center justify-center p-6"
                    >
                        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl text-center space-y-6">
                            <div className="mx-auto w-20 h-20 rounded-2xl bg-orange-500/10 flex items-center justify-center">
                                <ShieldAlert className="w-10 h-10 text-orange-500" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-2xl font-black text-white uppercase tracking-tight">Security Alert</h2>
                                <p className="text-zinc-400 text-sm font-medium leading-relaxed">
                                    Tab switching or window blurring detected. This incident has been logged for review to ensure interview integrity.
                                </p>
                            </div>
                            <div className="pt-4 flex flex-col gap-3">
                                <Button
                                    onClick={() => setIsTabViolation(false)}
                                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black uppercase tracking-widest py-6 rounded-2xl shadow-[0_10px_20px_-10px_rgba(249,115,22,0.5)] transition-all active:scale-95"
                                >
                                    I Understand & Continue
                                </Button>
                                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                                    Incident logged for review
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isFullscreenViolation && phase === "interview" && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[210] bg-zinc-950/90 backdrop-blur-md flex items-center justify-center p-6"
                    >
                        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl text-center space-y-6">
                            <div className="mx-auto w-20 h-20 rounded-2xl bg-orange-500/10 flex items-center justify-center">
                                <Zap className="w-10 h-10 text-orange-500" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-2xl font-black text-white uppercase tracking-tight">Fullscreen Required</h2>
                                <p className="text-zinc-400 text-sm font-medium leading-relaxed">
                                    The interview must be conducted in fullscreen mode for security and integrity purposes.
                                </p>
                            </div>
                            <div className="pt-4 flex flex-col gap-3">
                                <Button
                                    onClick={requestFullscreenMode}
                                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black uppercase tracking-widest py-6 rounded-2xl shadow-[0_10px_20px_-10px_rgba(249,115,22,0.5)] transition-all active:scale-95"
                                >
                                    Re-enter Fullscreen
                                </Button>
                                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                                    Incident logged for review
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/*  AI Proctoring Violation Alert (face / gaze / pose)  */}
            <AnimatePresence>
                {faceViolationAlert && phase === "interview" && (
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 40 }}
                        className="fixed bottom-52 left-1/2 -translate-x-1/2 z-[220] pointer-events-none"
                    >
                        <div className="flex items-center gap-3 bg-zinc-900/90 backdrop-blur-md border border-orange-500/30 rounded-2xl px-5 py-3 shadow-2xl max-w-sm">
                            <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                                {faceViolationAlert.type === "multiple_faces" ? (
                                    <Users className="w-4 h-4 text-orange-500" />
                                ) : faceViolationAlert.type === "face_absence" ? (
                                    <EyeOff className="w-4 h-4 text-orange-500" />
                                ) : (
                                    <Eye className="w-4 h-4 text-orange-500" />
                                )}
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">
                                    {faceViolationAlert.type === "multiple_faces" ? "Multiple People Detected"
                                        : faceViolationAlert.type === "face_absence" ? "Face Not Visible"
                                            : faceViolationAlert.type === "identity_mismatch" ? "Identity Check"
                                                : "Attention Required"}
                                </p>
                                <p className="text-[11px] font-bold text-zinc-300 leading-tight mt-0.5">
                                    {faceViolationAlert.reason}
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/*  Audio Proctoring Violation Alert  */}
            <AnimatePresence>
                {audioViolationAlert && phase === "interview" && (
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 40 }}
                        className="fixed bottom-40 left-1/2 -translate-x-1/2 z-[220] pointer-events-none"
                    >
                        <div className="flex items-center gap-3 bg-zinc-900/90 backdrop-blur-md border border-yellow-500/30 rounded-2xl px-5 py-3 shadow-2xl max-w-sm">
                            <div className="w-8 h-8 rounded-xl bg-yellow-500/10 flex items-center justify-center shrink-0">
                                <Volume2 className="w-4 h-4 text-yellow-400" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-yellow-400">
                                    Audio Alert
                                </p>
                                <p className="text-[11px] font-bold text-zinc-300 leading-tight mt-0.5">
                                    {audioViolationAlert.reason}
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/*  Hardware Violation Alert (camera / mic disabled)  */}
            <AnimatePresence>
                {hardwareViolationAlert && phase === "interview" && (
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 40 }}
                        className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[220] pointer-events-none"
                    >
                        <div className="flex items-center gap-3 bg-zinc-900/90 backdrop-blur-md border border-red-500/40 rounded-2xl px-5 py-3 shadow-2xl max-w-sm">
                            <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                                {hardwareViolationAlert.type === "camera_disabled" ? (
                                    <VideoOff className="w-4 h-4 text-red-400" />
                                ) : (
                                    <MicOff className="w-4 h-4 text-red-400" />
                                )}
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-red-400">
                                    {hardwareViolationAlert.type === "camera_disabled" ? "Camera Disabled" : "Microphone Disabled"}
                                </p>
                                <p className="text-[11px] font-bold text-zinc-300 leading-tight mt-0.5">
                                    {hardwareViolationAlert.reason}
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/*  Connection Alert Toast  */}
            <AnimatePresence>
                {connectionAlert && phase === "interview" && (
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 40 }}
                        className="fixed bottom-16 left-1/2 -translate-x-1/2 z-[220] pointer-events-none"
                    >
                        <div className={`flex items-center gap-3 bg-zinc-900/90 backdrop-blur-md rounded-2xl px-5 py-3 shadow-2xl max-w-sm border ${connectionAlert.eventType === "connection_restored"
                            ? "border-green-500/30"
                            : "border-blue-500/30"
                            }`}>
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${connectionAlert.eventType === "connection_restored"
                                ? "bg-green-500/10"
                                : "bg-blue-500/10"
                                }`}>
                                <WifiOff className={`w-4 h-4 ${connectionAlert.eventType === "connection_restored"
                                    ? "text-green-400"
                                    : "text-blue-400"
                                    }`} />
                            </div>
                            <div>
                                <p className={`text-[10px] font-black uppercase tracking-widest ${connectionAlert.eventType === "connection_restored"
                                    ? "text-green-400"
                                    : "text-blue-400"
                                    }`}>
                                    {connectionAlert.eventType === "connection_restored" ? "Connection Restored" : "Connection Issue"}
                                </p>
                                <p className="text-[11px] font-bold text-zinc-300 leading-tight mt-0.5">
                                    {connectionAlert.reason}
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* -- Behavior / Clipboard Violation Alert -- */}
            <AnimatePresence>
                {mouseViolationAlert && mouseViolationAlert.eventType === "behavior_flag" && phase === "interview" && (
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 40 }}
                        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[220] pointer-events-none"
                    >
                        <div className="flex items-center gap-3 bg-zinc-900/90 backdrop-blur-md rounded-2xl px-5 py-3 shadow-2xl max-w-sm border border-orange-500/40">
                            <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                                <Zap className="w-4 h-4 text-orange-400" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">Behavioral Flag</p>
                                <p className="text-[11px] font-bold text-zinc-300 leading-tight mt-0.5">
                                    {mouseViolationAlert.reason}
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* -- Mouse Proctoring Violation Alert (Deepgram Nova-3 correlated) -- */}
            <AnimatePresence>
                {mouseViolationAlert && mouseViolationAlert.eventType !== "behavior_flag" && phase === "interview" && (
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 40 }}
                        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[220] pointer-events-none"
                    >
                        <div className={`flex items-center gap-3 bg-zinc-900/90 backdrop-blur-md rounded-2xl px-5 py-3 shadow-2xl max-w-sm border ${mouseViolationAlert.severity === "high"
                            ? "border-red-500/40"
                            : mouseViolationAlert.severity === "low"
                                ? "border-zinc-500/30"
                                : "border-purple-500/30"
                            }`}>
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${mouseViolationAlert.severity === "high"
                                ? "bg-red-500/10"
                                : mouseViolationAlert.severity === "low"
                                    ? "bg-zinc-500/10"
                                    : "bg-purple-500/10"
                                }`}>
                                <MousePointer2 className={`w-4 h-4 ${mouseViolationAlert.severity === "high"
                                    ? "text-red-400"
                                    : mouseViolationAlert.severity === "low"
                                        ? "text-zinc-400"
                                        : "text-purple-400"
                                    }`} />
                            </div>
                            <div>
                                <p className={`text-[10px] font-black uppercase tracking-widest ${mouseViolationAlert.severity === "high"
                                    ? "text-red-400"
                                    : mouseViolationAlert.severity === "low"
                                        ? "text-zinc-400"
                                        : "text-purple-400"
                                    }`}>
                                    {mouseViolationAlert.eventType === "mouse_erratic"
                                        ? "Erratic Mouse Activity"
                                        : mouseViolationAlert.eventType === "mouse_snap"
                                            ? "Unnatural Mouse Snap"
                                            : "Cursor Anomaly Detected"}
                                </p>
                                <p className="text-[11px] font-bold text-zinc-300 leading-tight mt-0.5">
                                    {/* Strip the Deepgram note for display brevity if present */}
                                    {mouseViolationAlert.reason.split(" [Deepgram")[0]}
                                    {mouseViolationAlert.severity === "high" && (
                                        <span className="ml-1 text-red-400">· Deepgram Nova-3 corroborated</span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* -- Sound Anomaly Alert (Synced from AI Agent) ----------------- */}
            <AnimatePresence>
                {soundViolationAlert && phase === "interview" && (
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 40 }}
                        className="fixed bottom-40 left-1/2 -translate-x-1/2 z-[230] pointer-events-none"
                    >
                        <div className="flex items-center gap-4 bg-zinc-950/90 backdrop-blur-2xl border border-red-500/40 rounded-[2rem] px-6 py-4 shadow-[0_25px_50px_-12px_rgba(239,68,68,0.5)] max-w-sm">
                            <div className="w-10 h-10 rounded-2xl bg-red-500/10 flex items-center justify-center shrink-0 border border-red-500/20">
                                <MicOff className="w-5 h-5 text-red-500" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-red-500">Sound Anomaly</p>
                                <p className="text-[12px] font-bold text-white leading-tight mt-1 tracking-tight">
                                    {soundViolationAlert.reason}
                                </p>
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
    isLaunchingActive,
    timeLabel,
    timerExpired,

    onRemoteAgentAudioTrack,
    onAgentReady,
    onRoomReady,
    candidateName,
    onCandidateTranscript,
    onAgentDetectedViolation,
    onPasteViolation,
}: {
    id: string,
    onFinish: () => void,
    onFinalizing: () => void,
    isInterviewActive: boolean,
    isLaunchingActive: boolean,
    timeLabel: string,
    timerExpired: boolean,

    onRemoteAgentAudioTrack: (track: MediaStreamTrack | null) => void,
    onAgentReady?: (isReady: boolean) => void,
    onRoomReady?: (room: Room) => void,
    candidateName?: string;
    /**
     * Called by InterviewRoomContent each time Deepgram Nova-3 emits a
     * candidate transcript segment. The parent uses this to track silence
     * windows for MouseProctoring cross-signal correlation.
     */
    onCandidateTranscript?: () => void;
    onAgentDetectedViolation?: (eventType: string, reason: string, severity?: string) => void;
    onPasteViolation?: (eventType: string, reason: string, severity?: "low" | "medium" | "high") => void;
}) {
    const { localParticipant } = useLocalParticipant();
    const cameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
    const connectionState = useConnectionState();
    const lkRoom = useRoomContext();
    const voiceAssistant = useVoiceAssistant();

    // Give parent a ref to the room so it can call startAudio() on user gesture
    useEffect(() => {
        if (lkRoom) onRoomReady?.(lkRoom);
    }, [lkRoom, onRoomReady]);

    // Voice assistant state from LiveKit agent lifecycle.
    const aiParticipantTrack = voiceAssistant.audioTrack;
    const agentAudioTrack = getMediaStreamTrack(aiParticipantTrack ?? null);
    const hasAgentPresence = Boolean(voiceAssistant.agent);
    const assistantState = String(voiceAssistant.state);
    const isAiSpeaking = assistantState === "speaking";
    const isAiThinking = assistantState === "thinking" || assistantState === "initializing";
    const isAiListening = assistantState === "listening";


    // Media Control Logic
    const isMicEnabled = localParticipant?.isMicrophoneEnabled ?? false;
    const toggleMic = useCallback(() => {
        localParticipant?.setMicrophoneEnabled(!isMicEnabled);
    }, [localParticipant, isMicEnabled]);

    // startAudio is now called from handleHardwareComplete (user gesture) in the parent.
    // This useEffect is a fallback only - if the room reconnects mid-interview.
    useEffect(() => {
        if (connectionState === "connected" && lkRoom) {
            lkRoom.startAudio().catch(() => { });
        }
    }, [connectionState, lkRoom]);

    const readySignalSentRef = useRef(false);
    const launchReadySignalSentRef = useRef(false);
    const finishStartedRef = useRef(false);
    const recordingStartedRef = useRef(false);
    const transcriptPanelRef = useRef<HTMLDivElement>(null);
    const transcriptions = useTranscriptions({ room: lkRoom });
    const localIdentity = lkRoom?.localParticipant?.identity ?? "";

    // Agent readiness is based on room connection + remote agent speaking.
    useEffect(() => {
        const readyNow = connectionState === "connected"
            && hasAgentPresence
            && ["initializing", "listening", "thinking", "speaking"].includes(assistantState);
        onAgentReady?.(readyNow);

        if (!isLaunchingActive) {
            launchReadySignalSentRef.current = false;
            return;
        }

        if (readyNow && !launchReadySignalSentRef.current) {
            launchReadySignalSentRef.current = true;
            console.log("[Agent] Ready in launching phase");
        }
    }, [isLaunchingActive, connectionState, hasAgentPresence, assistantState, onAgentReady]);

    // Start recording only after interview phase starts and agent actually begins speaking.
    useEffect(() => {
        if (!isInterviewActive || !isAiSpeaking) return;

        console.log("[Agent] State=speaking during interview");

        // Start recording the moment audio flows
        if (!recordingStartedRef.current) {
            recordingStartedRef.current = true;
            console.log("[Recording] Agent speaking - starting recording");
            fetch("/api/interview/start-recording", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ applicationId: id }),
            }).catch((err) => console.warn("[Recording] start-recording request failed:", err));
        }
    }, [isAiSpeaking, id, isInterviewActive]);

    const [remoteForceFinish, setRemoteForceFinish] = useState(false);
    const localCameraTrack =
        cameraTracks.find((t) => t.participant.isLocal && t.source === Track.Source.Camera) || null;

    const groupedTranscriptions = useMemo(() => {
        const groups: {
            id: string;
            identity: string;
            isCandidate: boolean;
            speakerName: string;
            segments: Array<{ text: string; isFinal: boolean; id: string; timestamp: number }>;
        }[] = [];

        // Temporary map to track the latest version of each segment ID across the entire session
        const latestSegments = new Map<string, { text: string; isFinal: boolean; id: string; timestamp: number; identity: string }>();

        for (const segment of transcriptions as TranscriptionSegment[]) {
            if (!segment.text.trim()) continue;

            const identity = segment.participantInfo?.identity || "";
            const isFinal = segment.streamInfo.attributes?.["lk.transcription_final"] === "true";
            const id = segment.streamInfo.id;
            const timestamp = segment.streamInfo.timestamp;

            latestSegments.set(id, { text: segment.text, isFinal, id, timestamp, identity });
        }

        const sortedSegments = Array.from(latestSegments.values()).sort((a, b) => a.timestamp - b.timestamp);

        for (const segment of sortedSegments) {
            const isCandidate = segment.identity === localIdentity;
            const lastGroup = groups[groups.length - 1];

            let shouldBreak = false;
            if (lastGroup) {
                if (lastGroup.identity !== segment.identity) {
                    shouldBreak = true;
                } else {
                    const lastSegment = lastGroup.segments[lastGroup.segments.length - 1];
                    const timeGap = segment.timestamp - lastSegment.timestamp;
                    if (timeGap > 3000) {
                        shouldBreak = true;
                    }
                }
            }

            if (lastGroup && !shouldBreak) {
                lastGroup.segments.push(segment);
            } else {
                groups.push({
                    id: segment.id,
                    identity: segment.identity,
                    isCandidate,
                    speakerName: isCandidate ? "You" : "Interviewer",
                    segments: [segment]
                });
            }
        }
        return groups;
    }, [transcriptions, localIdentity]);

    // -- Deepgram Nova-3 -> Mouse cross-signal: ping parent on candidate speech --
    // Fires whenever a new transcript segment from the candidate arrives, resetting
    // the silence window that MouseProctoring uses for cross-signal correlation.
    const prevTranscriptCountRef = useRef(0);
    useEffect(() => {
        if (!onCandidateTranscript) return;
        let candidateSegments = 0;
        for (const seg of transcriptions as TranscriptionSegment[]) {
            const identity = seg.participantInfo?.identity || "";
            if (identity === localIdentity && seg.text.trim()) candidateSegments++;
        }
        if (candidateSegments > prevTranscriptCountRef.current) {
            onCandidateTranscript();
        }
        prevTranscriptCountRef.current = candidateSegments;
    }, [transcriptions, localIdentity, onCandidateTranscript]);

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
        if (agentAudioTrack && agentAudioTrack.kind === "audio") {
            onRemoteAgentAudioTrack(agentAudioTrack);
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
                } else if (packet.type === "proctoring_violation") {
                    // Agent detected something (e.g. background voice, phrase)
                    // Sync to candidate UI for immediate feedback
                    onAgentDetectedViolation?.(
                        packet.eventType || "audio_leak",
                        packet.reason || "Sound anomaly detected",
                        packet.severity || "medium"
                    );
                }
            } catch {
                // Ignore non-JSON packets.
            }
        };

        lkRoom.on(RoomEvent.DataReceived, onDataReceived);
        return () => {
            lkRoom.off(RoomEvent.DataReceived, onDataReceived);
        };
    }, [lkRoom, onAgentDetectedViolation]);

    // -- Clipboard Paste Detection ---------------------------------------------
    useEffect(() => {
        if (!isInterviewActive) return;

        const handlePaste = (e: ClipboardEvent) => {
            // High-precision detection: multiple pastes in a short window
            // or large blocks of text usually indicate cheating / prep-reading.
            onPasteViolation?.(
                "clipboard_paste",
                "Unnatural input detected (clipboard paste). Please provide your answers naturally and verbally."
            );
        };

        window.addEventListener("paste", handlePaste as any);
        return () => window.removeEventListener("paste", handlePaste as any);
    }, [isInterviewActive, onPasteViolation]);

    useEffect(() => {
        if (!transcriptPanelRef.current) return;
        transcriptPanelRef.current.scrollTop = transcriptPanelRef.current.scrollHeight;
    }, [transcriptions]);

    const handleFinish = useCallback(async () => {
        if (finishStartedRef.current) return;
        finishStartedRef.current = true;

        onFinalizing();
        // Recording is handled server-side by LiveKit Egress.
        // The server will receive an egress_ended webhook and save the URL automatically.
        setTimeout(() => {
            try { lkRoom?.disconnect(); } catch (_) { }
            onFinish();
        }, 1500);
    }, [onFinalizing, lkRoom, onFinish]);

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

            {/* Role Context - TOP LEFT */}
            <div className="absolute top-10 left-10 z-[60]">
                <div className="flex items-center gap-4 bg-zinc-900/90 px-6 py-4 rounded-[2rem] border border-white/5 shadow-2xl">
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
                <div className="bg-zinc-900/95 px-10 py-4 rounded-[2rem] border border-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex flex-col items-center min-w-[200px]">
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-orange-500/80 mb-1">Session Protocol</p>
                    <p className="text-4xl font-black text-white tabular-nums tracking-tight italic">
                        {timeLabel}
                    </p>
                </div>
            </div>

            {/* Candidate Video Feed - TOP RIGHT */}
            <div className="absolute top-40 right-10 z-50 w-72 aspect-[4/3] bg-zinc-900 rounded-[2rem] p-1 shadow-[0_20px_60px_rgba(0,0,0,0.6)] group border border-white/10 ring-1 ring-white/5" style={{ transform: 'translateZ(0)' }}>
                <div className="w-full h-full rounded-[2rem] overflow-hidden bg-zinc-950 relative">
                    {localCameraTrack ? (
                        <div className="w-full h-full [&>video]:w-full [&>video]:h-full [&>video]:object-cover [&>canvas]:w-full [&>canvas]:h-full [&>canvas]:object-cover scale-x-[-1]">
                            <VideoTrack trackRef={localCameraTrack} />
                        </div>
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-zinc-900/50">
                            <Camera className="w-8 h-8 text-zinc-800" />
                        </div>
                    )}
                    <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-black/80 rounded-full border border-white/10">
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.3)]" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-white drop-shadow-md">You (Live)</p>
                    </div>
                </div>
            </div>

            {/* AI Avatar Area */}
            <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
                <motion.div
                    animate={{
                        scale: isAiSpeaking ? [1, 1.02, 1] : [1, 1.01, 1],
                        borderColor: isAiSpeaking ? "rgba(249, 115, 34, 0.4)" : "rgba(249, 115, 34, 0.2)",
                    }}
                    transition={{
                        duration: isAiSpeaking ? 1.5 : 4,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                    className="w-64 h-64 rounded-full border-2 flex items-center justify-center relative isolate group"
                    style={{ transform: 'translateZ(0)' }}
                >
                    {/* Advanced Shader Aura Visualizer (Real-time Audio Reactive) */}
                    <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
                        <AuraVisualizer
                            state={isAiSpeaking ? "speaking" : (isAiThinking ? "thinking" : "listening")}
                            audioTrack={agentAudioTrack}
                            size="full"
                            className="absolute inset-0 z-0 opacity-80"
                        />
                    </div>


                    {/* Image Container */}
                    <div className="absolute inset-3 rounded-full overflow-hidden border-4 border-zinc-800/60 shadow-inner z-10">
                        <img
                            src="/avatars/jordan.png"
                            alt="AI Interviewer"
                            className={cn(
                                "w-full h-full object-cover transition-all duration-700",
                                isAiSpeaking ? "scale-110 contrast-[1.1] brightness-[1.05]" :
                                    (isAiThinking ? "scale-105 contrast-[1.05] brightness-[1.02]" : "scale-100 grayscale-[0.2] brightness-90")
                            )}
                        />
                        {/* Gradient Overlay for Depth */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />
                    </div>

                    <div className="absolute -bottom-16 flex flex-col items-center gap-2">
                        <p className={cn(
                            "text-[10px] font-black uppercase tracking-[0.5em] transition-all duration-500 text-center",
                            isAiSpeaking ? "text-orange-500 translate-y-1" : (isAiThinking ? "text-orange-300" : "text-zinc-500")
                        )}>
                            {isAiSpeaking
                                ? "Interviewer Speaking"
                                : (isAiThinking
                                    ? "Ishita is thinking..."
                                    : (isAiListening ? "Interviewer Listening" : "Waiting for Interviewer..."))}
                        </p>
                        {isAiSpeaking && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full"
                            >
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                <span className="text-[8px] font-black uppercase tracking-widest text-green-500">Live Voice Stream</span>
                            </motion.div>
                        )}
                    </div>
                </motion.div>
                {/* Floating Box Transcript - Left of AI Avatar (Upward Flow) */}
                <div className="absolute right-[calc(50%+180px)] bottom-[20%] z-[65] w-[380px] pointer-events-none">
                    <div
                        className="flex flex-col-reverse justify-start gap-6 max-h-[60vh] overflow-hidden px-6 py-12"
                        style={{
                            maskImage: 'linear-gradient(to top, transparent 0%, transparent 5%, black 20%, black 70%, transparent 95%, transparent 100%)',
                            WebkitMaskImage: 'linear-gradient(to top, transparent 0%, transparent 5%, black 20%, black 70%, transparent 95%, transparent 100%)'
                        }}
                    >
                        <AnimatePresence mode="popLayout">
                            {groupedTranscriptions.slice(-5).reverse().map((group, idx) => {
                                const isGroupFinal = group.segments.every(s => s.isFinal);
                                const combinedText = group.segments.map(s => s.text.trim()).join(" ");

                                return (
                                    <motion.div
                                        key={group.id}
                                        initial={{ opacity: 0, y: 40, scale: 0.95 }}
                                        animate={{
                                            opacity: Math.max(0.2, 1 - (idx * 0.15)),
                                            y: 0,
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
                                            "w-full filter drop-shadow-[0_4px_10px_rgba(0,0,0,0.3)]",
                                            "pointer-events-auto"
                                        )}
                                    >
                                        <div className="relative group/item">
                                            {/* Minimalist Message Layout (No Cards) */}
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-baseline gap-2">
                                                    <span className={cn(
                                                        "text-[10px] font-black uppercase tracking-[0.2em]",
                                                        group.isCandidate ? "text-orange-500" : "text-indigo-400"
                                                    )}>
                                                        {group.isCandidate ? (candidateName || "Candidate") : "Ishitha"}
                                                    </span>
                                                    {!isGroupFinal && (
                                                        <span className="text-[10px] text-zinc-600 animate-pulse">•••</span>
                                                    )}
                                                </div>
                                                <StreamingText
                                                    text={combinedText}
                                                    className={cn(
                                                        "text-[15px] font-medium tracking-tight leading-relaxed text-zinc-200"
                                                    )}
                                                />
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* Bottom Navigation & Premium Timer */}
            <div className="h-44 bg-zinc-900/80 p-8 grid grid-cols-3 items-center relative z-10">

                {/* Left: Status */}
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                            <ShieldCheck className="w-6 h-6 text-orange-500" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Security</p>
                            <p className="text-[11px] font-bold text-green-500 uppercase tracking-widest">Encrypted</p>
                        </div>
                    </div>

                    {/* Microphone Toggle */}
                    <button
                        onClick={toggleMic}
                        className={cn(
                            "group flex items-center gap-3 px-5 py-3 rounded-2xl border transition-all active:scale-95",
                            isMicEnabled
                                ? "bg-zinc-800/40 border-white/5 hover:bg-zinc-800/60"
                                : "bg-red-500/10 border-red-500/20 hover:bg-red-500/20"
                        )}
                    >
                        <div className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
                            isMicEnabled ? "bg-orange-500/10" : "bg-red-500/20"
                        )}>
                            {isMicEnabled
                                ? <Mic className="w-4 h-4 text-orange-500" />
                                : <MicOff className="w-4 h-4 text-red-500" />
                            }
                        </div>
                        <div className="text-left">
                            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-500">Microphone</p>
                            <p className={cn(
                                "text-[10px] font-bold uppercase tracking-widest",
                                isMicEnabled ? "text-white" : "text-red-500"
                            )}>
                                {isMicEnabled ? "Active" : "Muted"}
                            </p>
                        </div>
                    </button>
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

//  Inlined Components 


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

function CompletionView({ id, interviewToken }: { id: string; interviewToken: string }) {
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
                body: JSON.stringify({
                    rating,
                    feedback,
                    interviewToken
                }),
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
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="max-w-md w-full mx-auto"
                    >
                        <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm text-center">
                            <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                <CheckCircle2 className="w-8 h-8 text-green-600" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">Interview Complete</h2>
                            <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                                Thank you for your time. Your interview has been successfully recorded and shared with the hiring team.
                            </p>
                            <Button
                                onClick={() => window.location.href = "/careers"}
                                className="w-full h-12 rounded-xl bg-gray-900 text-white font-semibold hover:bg-black transition-all shadow-sm"
                            >
                                Return to Careers
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

